#!/usr/bin/env node
/**
 * Manual test results — companion to /annotate-artifact.
 *
 * Generates a single MANUAL-RESULTS.md from an epic's TEST-CASES/*.md files (per-feature
 * summary tables), renders it to HTML with <select>/<textarea> in the Result/Notes
 * columns for point-and-click editing in annotron, and saves the finalized HTML back
 * into the .md.
 *
 * The .md is canonical; the .html is a throwaway render. Only 2 columns (Result, Notes)
 * are user-editable — TC ID, Feature, Description, Priority pass through unchanged.
 *
 * Usage:
 *   node manual-results.mjs gen <epicArtifactsDir>
 *       Scans <dir>/TEST-CASES/*.md, extracts all rows whose first cell matches
 *       LUMA-*-TC-*, writes/merges <dir>/MANUAL-RESULTS.md. Existing Result/Notes
 *       are preserved; new cases are appended with Result=Untested.
 *
 *   node manual-results.mjs render <MANUAL-RESULTS.md> [out.html]
 *       Renders the manual-results markdown to HTML with editable form controls in
 *       the Result and Notes columns. Inline JS mirrors form state to DOM attrs so
 *       serialize/Download/Finalize captures the current values.
 *
 *   node manual-results.mjs save <MANUAL-RESULTS.html> <MANUAL-RESULTS.md>
 *       Parses form state from the (finalized) HTML and writes Result + Notes back
 *       to the .md, preserving every other column.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked, Renderer } from './vendor/marked.esm.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RESULT_OPTIONS = ['Untested', 'Pass', 'Fail', 'N/A'];
const TC_ID_RE = /^LUMA-[A-Z]+-TC-\d+$/;

// ── Markdown table parsing ─────────────────────────────────────────────────

/** Extract markdown tables from text. Returns [{headers, rows, startLine, endLine}]. */
function findMarkdownTables(text) {
  const lines = text.split('\n');
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.includes('|')) { i++; continue; }
    const next = lines[i + 1] || '';
    // Header line + separator line (---|---)
    if (/^\s*\|?.*\|.*\|?\s*$/.test(line) && /^\s*\|?[\s\-:|]+\|?\s*$/.test(next)) {
      const headers = splitRow(line);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        rows.push(splitRow(lines[j]));
        j++;
      }
      tables.push({ headers, rows, startLine: i, endLine: j - 1 });
      i = j;
      continue;
    }
    i++;
  }
  return tables;
}

function splitRow(line) {
  // Trim leading/trailing pipe and split; then trim each cell.
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

// ── gen ─────────────────────────────────────────────────────────────────────

function collectCases(artifactsDir) {
  const casesDir = path.join(artifactsDir, 'TEST-CASES');
  if (!fs.existsSync(casesDir)) die(`no TEST-CASES/ under ${artifactsDir}`);
  const files = fs.readdirSync(casesDir)
    .filter(n => n.toLowerCase().endsWith('.md'))
    .sort();
  const cases = new Map(); // TC ID → row (Summary rows first; Details merged on top for the steps/expected/preconditions)
  const order = [];
  for (const fname of files) {
    const feature = fname.replace(/\.md$/i, '');
    const text = fs.readFileSync(path.join(casesDir, fname), 'utf8');
    const tables = findMarkdownTables(text);
    for (const t of tables) {
      const cols = pickCaseColumns(t.headers);
      if (cols.id === -1) continue;
      for (const row of t.rows) {
        const id = (row[cols.id] || '').replace(/`/g, '').trim();
        if (!TC_ID_RE.test(id)) continue;
        let entry = cases.get(id);
        if (!entry) {
          entry = { id, feature, description: '', priority: '', preconditions: '', steps: '', expected: '' };
          cases.set(id, entry);
          order.push(id);
        }
        // Fill any field this table provides — never overwrite non-empty with empty.
        const put = (k, v) => { if (v && !entry[k]) entry[k] = v.trim(); };
        if (cols.description !== -1) put('description', row[cols.description]);
        if (cols.priority !== -1)    put('priority',    row[cols.priority]);
        if (cols.preconditions !== -1) put('preconditions', row[cols.preconditions]);
        if (cols.steps !== -1)         put('steps',         row[cols.steps]);
        if (cols.expected !== -1)      put('expected',      row[cols.expected]);
      }
    }
  }
  return order.map(id => cases.get(id));
}

/** Locate the columns we care about in a test-case table. Handles both the human
 *  "Summary" schema (TC ID | Description | Priority | Level | Status | Type) and
 *  the machine "Details" schema (testcase_id | description | preconditions |
 *  steps | expected_results | priority | ...). */
function pickCaseColumns(headers) {
  const find = (re) => headers.findIndex(h => re.test(h.toLowerCase()));
  return {
    id:            find(/^\s*(tc\s*id|testcase_id)\s*$/),
    description:   find(/^\s*description\s*$/),
    priority:      find(/^\s*priority\s*$/),
    preconditions: find(/^\s*(preconditions?|precondition)\s*$/),
    steps:         find(/^\s*steps?\s*$/),
    expected:      find(/^\s*(expected(_results?| results?)?|expected)\s*$/),
  };
}

function parseExisting(mdText) {
  const map = new Map();
  const tables = findMarkdownTables(mdText);
  for (const t of tables) {
    const idIdx = t.headers.findIndex(h => /^tc\s*id$/i.test(h));
    const resIdx = t.headers.findIndex(h => /^result$/i.test(h));
    const noteIdx = t.headers.findIndex(h => /^notes?$/i.test(h));
    if (idIdx === -1 || resIdx === -1) continue;
    for (const row of t.rows) {
      const id = (row[idIdx] || '').trim();
      if (!TC_ID_RE.test(id)) continue;
      map.set(id, {
        result: (row[resIdx] || 'Untested').trim() || 'Untested',
        notes: noteIdx >= 0 ? (row[noteIdx] || '').trim() : '',
      });
    }
  }
  return map;
}

function escapeCell(s) {
  return (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

function renderManualResultsMd(cases, epicId) {
  const today = new Date().toISOString().slice(0, 10);
  const header = [
    `# Manual Test Results — ${epicId}`,
    '',
    `> **Epic:** ${epicId} · **Total cases:** ${cases.length} · **Last generated:** ${today}`,
    `> Open in annotron via \`/manual-test ${epicId}\` to click through Pass/Fail/N/A and add notes.`,
    '> `Result` and `Notes` are the only user-editable columns. Everything else is regenerated from TEST-CASES/.',
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    ...summaryRows(cases),
    '',
    '## Results',
    '',
    '| TC ID | Feature | Description | Preconditions | Steps | Expected | Result | Notes | Priority |',
    '|-------|---------|-------------|---------------|-------|----------|--------|-------|----------|',
  ];
  const body = cases.map(c => (
    `| ${escapeCell(c.id)} | ${escapeCell(c.feature)} | ${escapeCell(c.description)} | ${escapeCell(c.preconditions)} | ${escapeCell(c.steps)} | ${escapeCell(c.expected)} | ${escapeCell(c.result || 'Untested')} | ${escapeCell(c.notes || '')} | ${escapeCell(c.priority)} |`
  ));
  return header.concat(body).join('\n') + '\n';
}

function summaryRows(cases) {
  const counts = { Untested: 0, Pass: 0, Fail: 0, 'N/A': 0 };
  for (const c of cases) {
    const r = RESULT_OPTIONS.includes(c.result) ? c.result : 'Untested';
    counts[r]++;
  }
  return [
    `| Total | ${cases.length} |`,
    ...RESULT_OPTIONS.map(k => `| ${k} | ${counts[k]} |`),
  ];
}

function cmdGen(artifactsDir) {
  const cases = collectCases(artifactsDir);
  const mdPath = path.join(artifactsDir, 'MANUAL-RESULTS.md');
  const existing = fs.existsSync(mdPath) ? parseExisting(fs.readFileSync(mdPath, 'utf8')) : new Map();
  for (const c of cases) {
    const prev = existing.get(c.id);
    c.result = prev?.result || 'Untested';
    c.notes = prev?.notes || '';
  }
  const epicId = path.basename(path.dirname(path.resolve(artifactsDir)));
  fs.writeFileSync(mdPath, renderManualResultsMd(cases, epicId), 'utf8');
  const kept = [...existing.keys()].filter(id => cases.find(c => c.id === id)).length;
  const added = cases.length - kept;
  console.log(`wrote ${mdPath} — ${cases.length} cases (${added} new, ${kept} preserved)`);
}

// ── render ──────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function findResultsTable(mdText) {
  const tables = findMarkdownTables(mdText);
  return tables.find(t =>
    t.headers.some(h => /^tc\s*id$/i.test(h)) &&
    t.headers.some(h => /^result$/i.test(h))
  );
}

// Map a header name to the canonical data-field key used in HTML + save.
function fieldForHeader(h) {
  const s = h.toLowerCase();
  if (/^tc\s*id$/.test(s)) return 'id';
  if (/^description$/.test(s)) return 'description';
  if (/^preconditions?$/.test(s)) return 'preconditions';
  if (/^steps?$/.test(s)) return 'steps';
  if (/^expected/.test(s)) return 'expected';
  if (/^result$/.test(s)) return 'result';
  if (/^notes?$/.test(s)) return 'notes';
  if (/^feature$/.test(s)) return 'feature';
  if (/^priority$/.test(s)) return 'priority';
  return null;
}

function renderResultsTableHtml(table) {
  const headers = table.headers;
  const fields = headers.map(fieldForHeader);
  const idIdx = fields.indexOf('id');

  const thead = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const rows = table.rows.map(row => {
    const id = (row[idIdx] || '').trim();
    const cells = row.map((cell, i) => {
      const field = fields[i];
      const val = cell || '';
      // TC ID is the join key — never editable, plus a stable data-tc-id anchor.
      if (field === 'id') {
        return `<td class="mr-cell-id"><code>${escapeHtml(val)}</code></td>`;
      }
      if (field === 'result') {
        const current = (val || 'Untested').trim() || 'Untested';
        const opts = RESULT_OPTIONS.map(o => `<option value="${o}"${o === current ? ' selected' : ''}>${o}</option>`).join('');
        return `<td class="mr-cell-result"><select data-tc-id="${escapeHtml(id)}" data-field="result" class="mr-select mr-r-${current.replace(/[^a-zA-Z]/g, '')}">${opts}</select></td>`;
      }
      if (field === 'priority' || field === 'feature') {
        // Short-text fields — single-line input.
        return `<td class="mr-cell-${field}"><input type="text" data-tc-id="${escapeHtml(id)}" data-field="${field}" value="${escapeHtml(val)}"></td>`;
      }
      if (field) {
        // Long-form editable fields (description/preconditions/steps/expected/notes).
        // Steps: split "1. X. 2. Y. 3. Z." into one step per line for readability.
        const displayVal = field === 'steps' ? splitNumberedSteps(val) : val;
        return `<td class="mr-cell-${field}"><textarea data-tc-id="${escapeHtml(id)}" data-field="${field}" rows="1" placeholder="${escapeHtml(field)}…">${escapeHtml(displayVal)}</textarea></td>`;
      }
      // Unknown column — display as read-only text.
      return `<td>${escapeHtml(val)}</td>`;
    }).join('');
    return `<tr data-tc-id="${escapeHtml(id)}">${cells}</tr>`;
  }).join('\n');

  return `<div class="table-wrap mr-table-wrap"><table class="mr-table">${thead}<tbody>\n${rows}\n</tbody></table></div>`;
}

// "1. Foo. 2. Bar. 3. Baz." → "1. Foo.\n2. Bar.\n3. Baz." for readable display in
// the textarea. Falls back to the original text when no numbered structure is
// detected. On save the textarea value is collapsed back to a single line
// (see extractRowFields) so the markdown-table cell stays well-formed.
function splitNumberedSteps(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const parts = raw.split(/(?<=[.!?])\s+(?=\d+\.\s)/).map(s => s.trim()).filter(Boolean);
  const allNumbered = parts.length > 1 && parts.every(p => /^\d+\.\s/.test(p));
  return allNumbered ? parts.join('\n') : raw;
}

const MR_CSS = `
/* Break out of the base 46rem reading column — this doc is a wide table. */
body { max-width: none !important; padding: 2.5rem 2rem 5rem; }
@media (min-width: 1200px) { body { padding: 2.5rem 3rem 5rem; } }
.mr-table select, .mr-table textarea, .mr-table input[type="text"] {
  font-family: inherit; font-size: .85rem; padding: .25em .45em;
  border: 1px solid var(--border-strong); border-radius: 6px;
  background: var(--surface-2); color: var(--text);
  width: 100%; box-sizing: border-box;
}
.mr-table textarea { resize: vertical; min-height: 1.6em; line-height: 1.45; overflow: hidden; }
.mr-table select:focus, .mr-table textarea:focus, .mr-table input[type="text"]:focus {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft);
}
.mr-cell-id code {
  font-family: ui-monospace, Menlo, monospace; font-size: .78rem;
  background: var(--surface-2); padding: .15em .4em; border-radius: 4px;
  border: 1px solid var(--border); user-select: all;
}
.mr-cell-priority input { font-size: .82rem; text-align: center; font-weight: 600; }
.mr-cell-feature input {
  font-size: .82rem; font-family: ui-monospace, Menlo, monospace;
  color: var(--accent); font-weight: 600; background: var(--accent-soft);
  border-color: transparent;
}
.mr-cell-feature input:focus { background: var(--surface-2); border-color: var(--accent); }
.mr-dirty { background: rgba(243, 156, 18, .12) !important; }
.mr-dirty select, .mr-dirty input, .mr-dirty textarea { border-color: var(--orange, #f39c12) !important; }
#mr-restore-banner {
  position: sticky; top: 0; z-index: 20;
  background: #f39c12; color: #1a1a1a; padding: .7em 1em;
  display: flex; gap: 1em; align-items: center; flex-wrap: wrap;
  font-family: ui-sans-serif, -apple-system, sans-serif; font-size: .9rem;
  border-bottom: 1px solid #d68910;
  margin: 0 -2rem 1.2em;
}
#mr-restore-banner button {
  border: none; padding: .35em .8em; border-radius: 5px; cursor: pointer;
  font-size: .82rem; font-weight: 600;
}
#mr-banner-keep    { background: #1a1a1a; color: #fff; }
#mr-banner-discard { background: #e74c3c; color: #fff; }
#mr-toolbar {
  position: sticky; top: 0; z-index: 12;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: .6em .9em; margin: 0 0 1em;
  display: flex; gap: .6em; align-items: center;
  font-family: ui-sans-serif, -apple-system, sans-serif;
}
#mr-toolbar button {
  border: 1px solid var(--accent); background: var(--accent); color: #fff;
  border-radius: 6px; padding: .4em .9em; font-size: .82rem; font-weight: 600;
  cursor: pointer; transition: opacity .15s, background .15s;
}
#mr-toolbar button:hover:not(:disabled) { opacity: .85; }
#mr-toolbar button:disabled { opacity: .5; cursor: default; }
#mr-btn-commit { background: transparent; color: var(--accent); }
#mr-btn-commit:hover:not(:disabled) { background: var(--accent-soft); }
#mr-toolbar-status { color: var(--muted); font-size: .82rem; margin-left: auto; font-weight: 600; }
#mr-toolbar-status.ok    { color: #2ecc71; }
#mr-toolbar-status.err   { color: #e74c3c; }
#mr-toolbar-status.warn  { color: #f39c12; }
#mr-toolbar button.working { background: #f39c12; border-color: #f39c12; }
#mr-toolbar button.success { background: #2ecc71; border-color: #2ecc71; }
#mr-toolbar button.failed  { background: #e74c3c; border-color: #e74c3c; }
#mr-toast-layer {
  position: fixed; inset: 0; z-index: 999; pointer-events: none;
  display: flex; align-items: center; justify-content: center;
}
.mr-toast {
  pointer-events: auto;
  min-width: 22rem; max-width: 42rem;
  background: var(--surface); color: var(--text);
  border: 2px solid var(--accent); border-radius: 12px;
  padding: 1.2em 1.6em; box-shadow: 0 12px 40px rgba(0,0,0,0.35);
  font-family: ui-sans-serif, -apple-system, sans-serif;
  transform: scale(0.9); opacity: 0;
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.mr-toast.visible { transform: scale(1); opacity: 1; }
.mr-toast.ok   { border-color: #2ecc71; }
.mr-toast.err  { border-color: #e74c3c; }
.mr-toast.warn { border-color: #f39c12; }
.mr-toast-title {
  font-size: 1.1rem; font-weight: 700; margin-bottom: .4em;
  display: flex; align-items: center; gap: .5em;
}
.mr-toast.ok   .mr-toast-title { color: #2ecc71; }
.mr-toast.err  .mr-toast-title { color: #e74c3c; }
.mr-toast.warn .mr-toast-title { color: #f39c12; }
.mr-toast-body { font-size: .88rem; line-height: 1.5; color: var(--text); }
.mr-toast-body ul { margin: .4em 0 0; padding-left: 1.2em; }
.mr-toast-body code { background: var(--accent-soft); padding: .1em .3em; border-radius: 3px; font-size: .82rem; }
.mr-toast-close {
  margin-top: .8em; background: var(--accent); color: #fff;
  border: none; border-radius: 6px; padding: .4em 1em;
  font-size: .82rem; font-weight: 600; cursor: pointer;
}
#mr-autosave-ping {
  position: fixed; bottom: 1rem; right: 1rem; z-index: 15;
  background: var(--surface); color: var(--text);
  border: 1px solid var(--accent); border-radius: 999px;
  padding: .35em .95em; font-family: ui-sans-serif, -apple-system, sans-serif;
  font-size: .75rem; font-weight: 600;
  opacity: 1; transition: opacity 0.6s ease;
  pointer-events: none; box-shadow: 0 2px 12px rgba(0,0,0,0.15);
}
.mr-table { table-layout: fixed; font-size: .82rem; width: 100%; }
.mr-table td, .mr-table th { vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
.mr-table-wrap { overflow-x: auto; }
/* Column widths — id / feature / priority stay compact & one-line, the long-form
   columns stretch to fill the rest. */
/* Order: TC ID | Feature | Description | Preconditions | Steps | Expected | Result | Notes | Priority */
.mr-table th:nth-child(1), .mr-table td:nth-child(1) { width: 7rem;  } /* TC ID */
.mr-table th:nth-child(2), .mr-table td:nth-child(2) { width: 11rem; } /* Feature */
.mr-table th:nth-child(3), .mr-table td:nth-child(3) { width: 16rem; } /* Description */
.mr-table th:nth-child(4), .mr-table td:nth-child(4) { width: 13rem; } /* Preconditions */
.mr-table th:nth-child(5), .mr-table td:nth-child(5) { width: 19rem; } /* Steps */
.mr-table th:nth-child(6), .mr-table td:nth-child(6) { width: 15rem; } /* Expected */
.mr-table th:nth-child(7), .mr-table td:nth-child(7) { width: 7rem; }  /* Result */
.mr-table th:nth-child(8), .mr-table td:nth-child(8) { width: 13rem; } /* Notes */
.mr-table th:nth-child(9), .mr-table td:nth-child(9) { width: 4.5rem; text-align: center; color: var(--muted); } /* Priority */
.mr-table textarea { white-space: pre-wrap; }
.mr-r-Pass  { background: rgba(46, 204, 113, .18); }
.mr-r-Fail  { background: rgba(231, 76, 60, .18); }
.mr-r-NA    { background: rgba(160, 160, 160, .16); }
.mr-r-Untested { background: var(--surface-2); }
#mr-summary {
  position: sticky; top: 0; z-index: 5;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: .7em 1em; margin: 0 0 1.2em;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: .88rem; display: flex; gap: 1.2em; flex-wrap: wrap; align-items: center;
}
#mr-summary .mr-count { font-weight: 700; color: var(--accent); }
#mr-summary .mr-legend { color: var(--muted); font-size: .8rem; }
`;

const MR_SYNC_SCRIPT = `
(function () {
  var tbl = document.querySelector('.mr-table');
  if (!tbl) return;
  var summary = document.getElementById('mr-summary');
  var STORAGE_KEY = 'annotron-mr-autosave:' + location.pathname + location.search;

  // Snapshot initial values so we can flag dirty cells (visual only — save reads the
  // current DOM regardless).
  var initial = new WeakMap();
  tbl.querySelectorAll('input,textarea,select').forEach(function (el) {
    initial.set(el, el.tagName === 'SELECT' ? el.value : (el.value || ''));
  });

  // Grow textareas to fit their content — one line per row is unreadable for
  // Steps / Expected / Preconditions. Recompute on load, on input, and on tab
  // become-visible (initial layout can be zero-height in a hidden iframe).
  function autosize(el) {
    if (el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    // +2px to avoid an extra scrollbar row on some fonts.
    el.style.height = (el.scrollHeight + 2) + 'px';
  }
  function autosizeAll() {
    tbl.querySelectorAll('textarea').forEach(autosize);
  }
  // Initial pass: on load + one rAF later so layout has settled.
  autosizeAll();
  requestAnimationFrame(autosizeAll);
  // Also re-run after fonts finish loading (font metrics change scrollHeight).
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(autosizeAll);
  // And once more when the parent frame becomes visible.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) autosizeAll(); });

  function markDirty(el) {
    var td = el.closest('td');
    if (!td) return;
    if ((el.value || '') !== (initial.get(el) || '')) td.classList.add('mr-dirty');
    else td.classList.remove('mr-dirty');
  }

  function updateSummary() {
    var counts = { Untested: 0, Pass: 0, Fail: 0, 'N/A': 0 };
    tbl.querySelectorAll('select[data-field="result"]').forEach(function (s) {
      counts[s.value] = (counts[s.value] || 0) + 1;
    });
    var dirty = tbl.querySelectorAll('td.mr-dirty').length;
    if (!summary) return;
    var total = counts.Untested + counts.Pass + counts.Fail + counts['N/A'];
    summary.innerHTML =
      '<span>Total: <span class="mr-count">' + total + '</span></span>' +
      '<span>Pass: <span class="mr-count" style="color:#2ecc71">' + counts.Pass + '</span></span>' +
      '<span>Fail: <span class="mr-count" style="color:#e74c3c">' + counts.Fail + '</span></span>' +
      '<span>N/A: <span class="mr-count" style="color:#888">' + counts['N/A'] + '</span></span>' +
      '<span>Untested: <span class="mr-count" style="color:var(--muted)">' + counts.Untested + '</span></span>' +
      (dirty ? '<span>Edited cells: <span class="mr-count" style="color:#f39c12">' + dirty + '</span></span>' : '') +
      '<span class="mr-legend">Local auto-save on every edit · disk save every 5 min · use Save now / Commit for immediate write.</span>';
  }

  tbl.addEventListener('change', function (e) {
    var t = e.target;
    if (t.tagName === 'SELECT' && t.dataset.field === 'result') {
      // Mirror to DOM so HTML serialization captures the choice.
      Array.prototype.forEach.call(t.options, function (o) {
        if (o.value === t.value) o.setAttribute('selected', ''); else o.removeAttribute('selected');
      });
      t.className = t.className.replace(/\\bmr-r-[A-Za-z]+\\b/g, '') + ' mr-r-' + t.value.replace(/[^a-zA-Z]/g, '');
    }
    markDirty(t);
    updateSummary();
    scheduleAutoSave();
    markLocalChange();
  });

  tbl.addEventListener('input', function (e) {
    var t = e.target;
    if (t.tagName === 'TEXTAREA') {
      // defaultValue writes the value into the child text node without moving the caret,
      // so serialize() picks it up.
      t.defaultValue = t.value;
      autosize(t);
    } else if (t.tagName === 'INPUT' && t.type === 'text') {
      // Same mirror trick for value attribute so serialization keeps the current text.
      t.setAttribute('value', t.value);
    }
    markDirty(t);
    updateSummary();
    scheduleAutoSave();
    markLocalChange();
  });

  // ── Auto-save to localStorage — protects unsaved edits against browser crash /
  //    power loss / accidental reload. Debounced 500ms. On next open, we compare
  //    the saved state with the freshly rendered DOM and offer to restore.
  var saveTimer, pingTimer;
  function collectAllValues() {
    var out = {};
    tbl.querySelectorAll('[data-tc-id][data-field]').forEach(function (el) {
      var id = el.dataset.tcId, field = el.dataset.field;
      (out[id] = out[id] || {})[field] = el.value;
    });
    return out;
  }
  var AUTOSAVE_URL = (document.querySelector('meta[name="mr-autosave-url"]') || {}).content || '';
  var MD_PATH      = (document.querySelector('meta[name="mr-md-path"]')      || {}).content || '';
  var serverAlive  = false;
  var LOCAL_DEBOUNCE_MS = 500;         // localStorage — fast; no external side effect.
  var DISK_INTERVAL_MS  = 5 * 60 * 1000; // disk (server POST) — every 5 min if dirty.

  // Health-check the autosave server once on load; retry if it comes online later.
  function checkServer() {
    if (!AUTOSAVE_URL) return;
    fetch(AUTOSAVE_URL + '/health', { mode: 'cors' })
      .then(function (r) { serverAlive = r.ok; })
      .catch(function () { serverAlive = false; })
      .finally(function () {
        var el = document.getElementById('mr-autosave-ping');
        if (el && !el._flashed) {
          el.textContent = serverAlive ? 'Auto-save armed (disk)' : 'Auto-save armed (local only)';
          el.style.opacity = '1';
          setTimeout(function () { el.style.opacity = '0'; }, 2000);
        }
      });
  }
  checkServer();
  setInterval(checkServer, 15000);

  // localStorage save (fast). Runs on every keystroke via debounce — cheap, purely
  // in-browser, no file I/O.
  function localSaveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), values: collectAllValues() }));
    } catch (e) {}
  }
  function scheduleAutoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(localSaveNow, LOCAL_DEBOUNCE_MS);
  }

  // Disk save (server POST). Fires on a 5-minute interval — only if the form is
  // dirty since the last successful disk save. Also fires once when the user
  // closes / navigates away (best-effort) so nothing recent is lost.
  var lastDiskSaveAt = 0;
  var lastLocalSaveMark = 0;
  function markLocalChange() { lastLocalSaveMark = Date.now(); }
  function diskSaveIfDirty() {
    if (!serverAlive || !MD_PATH) return;
    if (lastLocalSaveMark <= lastDiskSaveAt) return; // nothing changed since last disk save
    var values = collectAllValues();
    fetch(AUTOSAVE_URL + '/save', {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mdPath: MD_PATH, values: values }),
      keepalive: true, // let it complete during unload
    }).then(function (r) {
      if (r.ok) {
        lastDiskSaveAt = Date.now();
        flashPing('Saved to disk · ' + new Date().toLocaleTimeString());
      } else {
        serverAlive = false;
        flashPing('Server error · saved locally');
      }
    }).catch(function () {
      serverAlive = false;
      flashPing('Server offline · saved locally');
    });
  }
  setInterval(diskSaveIfDirty, DISK_INTERVAL_MS);
  window.addEventListener('beforeunload', diskSaveIfDirty);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) diskSaveIfDirty();
  });
  function flashPing(text) {
    var el = document.getElementById('mr-autosave-ping');
    if (!el) return;
    el._flashed = true;
    el.textContent = text || ('Auto-saved · ' + new Date().toLocaleTimeString());
    el.style.opacity = '1';
    clearTimeout(pingTimer);
    pingTimer = setTimeout(function () { el.style.opacity = '0'; }, 1800);
  }

  // ── Restore from localStorage if any state exists. Diff against current DOM
  //    values (which reflect the just-rendered .md). Any field that differs is
  //    an unsaved edit from the previous session — apply it and mark dirty.
  function restoreFromAutoSave() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return null; }
    if (!data || !data.values) return null;

    var restored = 0;
    tbl.querySelectorAll('[data-tc-id][data-field]').forEach(function (el) {
      var id = el.dataset.tcId, field = el.dataset.field;
      var saved = data.values[id] && data.values[id][field];
      if (saved === undefined || saved === null) return;
      var current = el.value || '';
      if (current === saved) return;

      if (el.tagName === 'SELECT') {
        el.value = saved;
        Array.prototype.forEach.call(el.options, function (o) {
          if (o.value === saved) o.setAttribute('selected', ''); else o.removeAttribute('selected');
        });
        if (field === 'result') {
          el.className = el.className.replace(/\\bmr-r-[A-Za-z]+\\b/g, '') + ' mr-r-' + saved.replace(/[^a-zA-Z]/g, '');
        }
      } else if (el.tagName === 'TEXTAREA') {
        el.value = saved;
        el.defaultValue = saved;
        autosize(el);
      } else {
        el.value = saved;
        el.setAttribute('value', saved);
      }
      markDirty(el);
      restored++;
    });
    return { restored: restored, ts: data.ts };
  }

  function showRestoreBanner(restored, ts) {
    var b = document.createElement('div');
    b.id = 'mr-restore-banner';
    var when = new Date(ts).toLocaleString();
    b.innerHTML =
      '<span>💾 Restored <strong>' + restored + '</strong> unsaved edit' + (restored === 1 ? '' : 's') +
      ' from ' + when + '.</span>' +
      '<button id="mr-banner-keep">Keep</button>' +
      '<button id="mr-banner-discard">Discard &amp; reload</button>';
    document.body.insertBefore(b, document.body.firstChild);
    document.getElementById('mr-banner-keep').addEventListener('click', function () { b.remove(); });
    document.getElementById('mr-banner-discard').addEventListener('click', function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      location.reload();
    });
  }

  // Ping badge (bottom-right, fades out) so users see auto-save happening.
  var ping = document.createElement('div');
  ping.id = 'mr-autosave-ping';
  ping.textContent = 'Auto-save armed';
  document.body.appendChild(ping);
  setTimeout(function () { ping.style.opacity = '0'; }, 2000);

  // ── Explicit Save / Commit buttons — sit on top of the debounced autosave and
  //    give the user an "I'm done editing this row" affordance. Save writes
  //    MANUAL-RESULTS.md only; Commit also patches TEST-CASES/<feature>.md.
  var btnSave   = document.getElementById('mr-btn-save');
  var btnCommit = document.getElementById('mr-btn-commit');
  var status    = document.getElementById('mr-toolbar-status');
  var toastLayer = document.getElementById('mr-toast-layer');

  function setStatus(text, cls) {
    if (!status) return;
    status.textContent = text || '';
    status.className = cls || '';
  }

  // Big centered toast — auto-dismisses after 4s (success) or stays until closed
  // (error). Renders HTML in body — caller passes structured content.
  function showToast(kind, title, bodyHtml, opts) {
    if (!toastLayer) return;
    var wrap = document.createElement('div');
    wrap.className = 'mr-toast ' + kind;
    wrap.innerHTML =
      '<div class="mr-toast-title">' + title + '</div>' +
      '<div class="mr-toast-body">' + bodyHtml + '</div>' +
      '<button class="mr-toast-close" type="button">Got it</button>';
    toastLayer.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('visible'); });
    var close = function () {
      wrap.classList.remove('visible');
      setTimeout(function () { wrap.remove(); }, 250);
    };
    wrap.querySelector('.mr-toast-close').addEventListener('click', close);
    var autoClose = (opts && opts.autoCloseMs) != null ? opts.autoCloseMs : (kind === 'err' ? 0 : 4000);
    if (autoClose > 0) setTimeout(close, autoClose);
  }

  function setBtnState(btn, state, label) {
    if (!btn) return;
    btn.classList.remove('working', 'success', 'failed');
    if (state) btn.classList.add(state);
    if (label !== undefined) btn.textContent = label;
    btn.disabled = state === 'working';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function callEndpoint(endpoint, btn, labels) {
    if (!AUTOSAVE_URL || !MD_PATH) {
      setStatus('autosave server not running', 'err');
      showToast('err', '⚠️ Autosave server not running',
        'The autosave HTTP server is not reachable at <code>' + escapeHtml(AUTOSAVE_URL) + '</code>.<br><br>' +
        'Start it in a terminal:<br>' +
        '<code>node ~/.claude/tools/manual-results.mjs autosave &lt;artifactsDir&gt;</code><br><br>' +
        'Or use the <code>/manual-test</code> skill which auto-starts it.');
      return;
    }
    setBtnState(btn, 'working', labels.working);
    setStatus('Saving…', 'warn');
    clearTimeout(saveTimer);
    try {
      var res = await fetch(AUTOSAVE_URL + endpoint, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mdPath: MD_PATH, values: collectAllValues() }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var now = new Date().toLocaleTimeString();

      if (endpoint === '/commit') {
        // Show a rich toast summarising exactly what happened.
        var files = data.patchedFiles || [];
        var bodyParts = [];
        bodyParts.push('<strong>MANUAL-RESULTS.md</strong> updated · <strong>' + data.updated + '</strong> row' + (data.updated === 1 ? '' : 's') + '.');
        if (files.length) {
          bodyParts.push('Metadata propagated to <strong>TEST-CASES/</strong>:<ul>' +
            files.map(function (f) { return '<li><code>' + escapeHtml(f.path.split('/').pop()) + '</code> — ' + f.rows + ' row' + (f.rows === 1 ? '' : 's') + '</li>'; }).join('') +
            '</ul>');
        } else {
          bodyParts.push('<em>No metadata changes to propagate — TEST-CASES/ untouched.</em>');
        }
        var warns = [];
        if (data.featureChanges && data.featureChanges.length) {
          warns.push('Feature moves NOT applied (do manually): ' + data.featureChanges.map(function (c) { return '<code>' + escapeHtml(c.id) + '</code>: ' + escapeHtml(c.from) + ' → ' + escapeHtml(c.to); }).join(', '));
        }
        if (data.planReviewFeatures && data.planReviewFeatures.length) {
          warns.push('<code>TEST-PLAN.md</code> mentions these features — review manually if scenarios changed: <strong>' + data.planReviewFeatures.map(escapeHtml).join(', ') + '</strong>');
        }
        if (warns.length) {
          bodyParts.push('<div style="margin-top:.6em;padding-top:.6em;border-top:1px solid var(--border);color:#f39c12;">⚠ ' + warns.join('<br>⚠ ') + '</div>');
          showToast('warn', '✅ Committed with warnings · ' + now, bodyParts.join(''), { autoCloseMs: 0 });
        } else {
          showToast('ok', '✅ Committed at ' + now, bodyParts.join(''));
        }
        setStatus('Committed at ' + now, 'ok');
        tbl.querySelectorAll('td.mr-dirty').forEach(function (td) { td.classList.remove('mr-dirty'); });
        tbl.querySelectorAll('input,textarea,select').forEach(function (el) {
          initial.set(el, el.tagName === 'SELECT' ? el.value : (el.value || ''));
        });
        updateSummary();
      } else {
        showToast('ok', '💾 Saved at ' + now,
          '<strong>MANUAL-RESULTS.md</strong> written. TEST-CASES/ untouched.<br>' +
          'Use <strong>Commit &amp; sync sources</strong> to propagate metadata edits.');
        setStatus('Saved at ' + now, 'ok');
      }

      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      setBtnState(btn, 'success', labels.success);
      setTimeout(function () { setBtnState(btn, null, labels.normal); }, 3000);
    } catch (err) {
      setStatus('Save failed: ' + err.message, 'err');
      showToast('err', '❌ Save failed',
        'The autosave server responded with an error:<br><br><code>' + escapeHtml(err.message) + '</code><br><br>' +
        'Your edits are still safe in localStorage. Retry or check the terminal where the autosave server is running.',
        { autoCloseMs: 0 });
      setBtnState(btn, 'failed', labels.failed);
      setTimeout(function () { setBtnState(btn, null, labels.normal); }, 3000);
    }
  }

  if (btnSave) btnSave.addEventListener('click', function () {
    callEndpoint('/save', btnSave, {
      normal:  '💾 Save now',
      working: '⏳ Saving…',
      success: '✅ Saved',
      failed:  '❌ Failed',
    });
  });
  if (btnCommit) btnCommit.addEventListener('click', function () {
    if (!confirm('Commit metadata edits to TEST-CASES/<feature>.md?\\n\\nDescription / Preconditions / Steps / Expected / Priority changes will be written back to the source files.\\n\\nResult and Notes always go to MANUAL-RESULTS.md.')) return;
    callEndpoint('/commit', btnCommit, {
      normal:  '📥 Commit & sync sources',
      working: '⏳ Committing…',
      success: '✅ Committed',
      failed:  '❌ Failed',
    });
  });

  // Restore on load (after initial values snapshot has been captured).
  setTimeout(function () {
    var r = restoreFromAutoSave();
    if (r && r.restored > 0) {
      showRestoreBanner(r.restored, r.ts);
      updateSummary();
    }
  }, 30);

  updateSummary();
})();
`;

function cmdRender(mdPath, outPath) {
  const text = fs.readFileSync(mdPath, 'utf8');
  const targetTable = findResultsTable(text);
  if (!targetTable) die(`no results table found in ${mdPath} (need columns "TC ID" and "Result")`);

  // Split the file at the table so we render the surrounding markdown normally.
  const lines = text.split('\n');
  const before = lines.slice(0, targetTable.startLine).join('\n');
  const after = lines.slice(targetTable.endLine + 1).join('\n');

  const beforeHtml = marked.parse(before, { gfm: true });
  const afterHtml = marked.parse(after, { gfm: true });
  const tableHtml = renderResultsTableHtml(targetTable);

  const title = (text.match(/^#\s+(.+)$/m) || [, path.basename(mdPath)])[1];
  const baseCss = BASE_CSS;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="mr-md-path" content="${escapeHtml(path.resolve(mdPath))}">
<meta name="mr-autosave-url" content="http://localhost:4477">
<title>${escapeHtml(title)}</title>
<style>${baseCss}${MR_CSS}</style>
</head>
<body>
<div id="mr-toolbar">
  <button id="mr-btn-save" title="Save results to MANUAL-RESULTS.md now (does not sync to TEST-CASES/)">💾 Save now</button>
  <button id="mr-btn-commit" title="Save + propagate metadata edits back to TEST-CASES/&lt;feature&gt;.md">📥 Commit &amp; sync sources</button>
  <span id="mr-toolbar-status"></span>
</div>
<div id="mr-toast-layer"></div>
<div class="doc-meta">Manual test results · auto-saves continuously when the autosave server is running · use the buttons above for explicit save + source sync</div>
${beforeHtml}
<div id="mr-summary"></div>
${tableHtml}
${afterHtml}
<script>${MR_SYNC_SCRIPT}</script>
</body>
</html>
`;

  const out = outPath || mdPath.replace(/\.md$/i, '.html');
  fs.writeFileSync(out, html, 'utf8');
  console.log(`wrote ${out}`);
}

// Base stylesheet — self-contained (no external CSS files, no theming deps). The
// palette + typography match the "reader" look used by other annotron artifacts;
// mr-specific overrides are appended on top via MR_CSS.
const BASE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #faf9f6;
  --surface: #f2f0e9;
  --surface-2: #f6f4ee;
  --text: #1f1d1a;
  --muted: #6f6b62;
  --border: #e6e2d6;
  --border-strong: #d9d4c6;
  --accent: #c15f3c;
  --accent-soft: rgba(193, 95, 60, .12);
  --code-text: #1f1d1a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1c19;
    --surface: #29261f;
    --surface-2: #26231d;
    --text: #ecebe3;
    --muted: #a6a196;
    --border: #3a362d;
    --border-strong: #474237;
    --accent: #e0996f;
    --accent-soft: rgba(224, 153, 111, .16);
    --code-text: #ecebe3;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  font-family: ui-serif, "Charter", "Iowan Old Style", "Palatino", Georgia, Cambria, "Times New Roman", serif;
  font-size: 1.06rem;
  line-height: 1.72;
  color: var(--text);
  background: var(--bg);
  max-width: 46rem;
  margin: 0 auto;
  padding: 4.5rem 1.75rem 8rem;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
::selection { background: var(--accent-soft); }
h1, h2, h3, h4, h5, h6 {
  font-weight: 640; line-height: 1.25; letter-spacing: -0.011em; color: var(--text);
}
h1 { font-size: 2.1rem; margin: 0 0 .1em; letter-spacing: -0.02em; }
h2 { font-size: 1.5rem; margin: 2.4em 0 .6em; padding-bottom: .28em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.2rem; margin: 2em 0 .5em; }
p  { margin: 0 0 1.1em; }
a  { color: var(--accent); text-decoration: none; border-bottom: 1px solid transparent; }
a:hover { border-bottom-color: var(--accent); }
ul, ol { margin: 0 0 1.1em; padding-left: 1.5em; }
li { margin: .3em 0; }
li::marker { color: var(--muted); }
strong { font-weight: 680; }
code {
  font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .86em; background: var(--accent-soft); color: var(--code-text);
  padding: .12em .38em; border-radius: 5px;
}
blockquote {
  border-left: 3px solid var(--accent); margin: 1.3em 0; padding: .1em 1.1em;
  color: var(--muted); background: var(--surface-2); border-radius: 0 8px 8px 0; font-style: italic;
}
blockquote p { margin: .5em 0; }
.table-wrap { overflow-x: auto; margin: 1.4em 0; }
table {
  border-collapse: collapse; width: 100%;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: .9rem; border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
}
th, td { border-bottom: 1px solid var(--border); padding: .6em .85em; text-align: left; vertical-align: top; }
th { background: var(--surface); font-weight: 640; }
tr:last-child td { border-bottom: none; }
tbody tr:nth-child(even) td { background: var(--surface-2); }
hr { border: none; border-top: 1px solid var(--border-strong); margin: 2.6em 0; }
.doc-meta {
  display: inline-flex; align-items: center; gap: .5em;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: .78rem; color: var(--muted); background: var(--surface);
  border: 1px solid var(--border); border-radius: 999px; padding: .35em .85em; margin-bottom: 2.4em;
}
.doc-meta::before {
  content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none;
}
`;

// ── save ────────────────────────────────────────────────────────────────────

function extractStateFromHtml(html) {
  const state = new Map();
  const rowRe = /<tr\s+data-tc-id="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const id = decodeHtml(m[1]);
    const rowHtml = m[2];
    state.set(id, extractRowFields(rowHtml));
  }
  return state;
}

function extractRowFields(rowHtml) {
  const row = {};

  // Result → selected <option>
  const selBlock = /<select[^>]*data-field="result"[^>]*>([\s\S]*?)<\/select>/i.exec(rowHtml);
  if (selBlock) {
    const optSel = /<option[^>]*\bselected(?:="[^"]*")?[^>]*value="([^"]+)"|<option[^>]*value="([^"]+)"[^>]*\bselected/i.exec(selBlock[1]);
    row.result = optSel ? decodeHtml(optSel[1] || optSel[2]) : 'Untested';
  }

  // <input type="text" data-field="X">
  const inputRe = /<input[^>]*data-field="([^"]+)"[^>]*\bvalue="([^"]*)"[^>]*>|<input[^>]*\bvalue="([^"]*)"[^>]*data-field="([^"]+)"[^>]*>/gi;
  let im;
  while ((im = inputRe.exec(rowHtml)) !== null) {
    const field = im[1] || im[4];
    const value = im[2] !== undefined ? im[2] : im[3];
    row[field] = decodeHtml(value).trim();
  }

  // <textarea data-field="X">…</textarea>
  const taRe = /<textarea[^>]*data-field="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/gi;
  let tm;
  while ((tm = taRe.exec(rowHtml)) !== null) {
    const field = tm[1];
    // Collapse newlines to a single space — markdown table cells can't hold literal newlines.
    row[field] = decodeHtml(tm[2]).replace(/\r\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return row;
}

function decodeHtml(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

const META_FIELDS = ['description', 'preconditions', 'steps', 'expected', 'priority'];

function cmdSave(htmlPath, mdPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const state = extractStateFromHtml(html);
  if (!state.size) die(`no <tr data-tc-id> rows found in ${htmlPath} — did you render it via manual-results?`);

  const artifactsDir = path.dirname(path.resolve(mdPath));
  const baseline = new Map(collectCases(artifactsDir).map(c => [c.id, c]));

  // ── 1) Patch source TEST-CASES/<feature>.md for any metadata that changed.
  const touchedFiles = new Map(); // filepath → number of rows touched
  const featureChanges = []; // [{ id, from, to }] — warned, not moved
  for (const [id, s] of state) {
    const base = baseline.get(id);
    if (!base) continue; // unknown TC — skip (probably added via chat & not yet in TEST-CASES/)

    // Detect feature change — flag for user; keep the case in its original file.
    if (s.feature !== undefined && s.feature && s.feature !== base.feature) {
      featureChanges.push({ id, from: base.feature, to: s.feature });
    }

    const changes = {};
    for (const f of META_FIELDS) {
      if (s[f] === undefined) continue;
      if ((s[f] || '').trim() !== (base[f] || '').trim()) changes[f] = s[f];
    }
    if (Object.keys(changes).length === 0) continue;

    const srcPath = path.join(artifactsDir, 'TEST-CASES', base.feature + '.md');
    if (!fs.existsSync(srcPath)) {
      console.warn(`warn: source file not found for ${id}: ${srcPath}`);
      continue;
    }
    const rowsTouched = patchFeatureFile(srcPath, id, changes);
    if (rowsTouched > 0) touchedFiles.set(srcPath, (touchedFiles.get(srcPath) || 0) + 1);
  }

  // ── 2) Rebuild MANUAL-RESULTS.md from the (possibly updated) TEST-CASES/, then
  //       overlay the current Result/Notes/Feature/Priority from state.
  const refreshed = collectCases(artifactsDir);
  for (const c of refreshed) {
    const s = state.get(c.id);
    if (!s) {
      // Preserve prior Result/Notes if we can find them in the current MANUAL-RESULTS.md.
      const prev = parseExisting(fs.readFileSync(mdPath, 'utf8')).get(c.id);
      c.result = prev?.result || 'Untested';
      c.notes = prev?.notes || '';
      continue;
    }
    c.result = s.result || 'Untested';
    c.notes  = s.notes  || '';
    // Feature/Priority: prefer state (user just edited); fall back to source.
    if (s.feature)  c.feature  = s.feature;
    if (s.priority) c.priority = s.priority;
  }
  const epicId = path.basename(path.dirname(path.resolve(artifactsDir)));
  fs.writeFileSync(mdPath, renderManualResultsMd(refreshed, epicId), 'utf8');

  // ── 3) Report.
  console.log(`updated ${mdPath} — ${state.size} rows`);
  if (touchedFiles.size) {
    console.log(`patched TEST-CASES/:`);
    for (const [p, n] of touchedFiles) console.log(`  ${path.relative(process.cwd(), p)} (${n} row${n > 1 ? 's' : ''})`);
  }
  if (featureChanges.length) {
    console.warn(`WARN: feature-column changes detected but NOT moved across files (do it manually):`);
    for (const c of featureChanges) console.warn(`  ${c.id}: ${c.from} → ${c.to}`);
  }
}

/** Patch a per-feature TEST-CASES file: for the given TC ID, update whichever of
 *  { description, priority, preconditions, steps, expected } this file's tables
 *  have columns for. Returns the number of table rows updated (can be >1 because
 *  Summary + Details tables both hold the same case). */
function patchFeatureFile(srcPath, tcId, changes) {
  const text = fs.readFileSync(srcPath, 'utf8');
  const lines = text.split('\n');
  const tables = findMarkdownTables(text);
  let touched = 0;

  for (const t of tables) {
    const cols = pickCaseColumns(t.headers);
    if (cols.id === -1) continue;
    for (let ri = 0; ri < t.rows.length; ri++) {
      const lineIdx = t.startLine + 2 + ri;
      const cells = splitRow(lines[lineIdx]);
      const rowId = (cells[cols.id] || '').replace(/`/g, '').trim();
      if (rowId !== tcId) continue;

      let dirty = false;
      const put = (colIdx, val) => {
        if (colIdx === -1 || val === undefined) return;
        const clean = escapeCell(val);
        if ((cells[colIdx] || '').trim() !== clean.trim()) {
          cells[colIdx] = ' ' + clean + ' ';
          dirty = true;
        }
      };
      put(cols.description,   changes.description);
      put(cols.priority,      changes.priority);
      put(cols.preconditions, changes.preconditions);
      put(cols.steps,         changes.steps);
      put(cols.expected,      changes.expected);
      if (dirty) {
        lines[lineIdx] = '|' + cells.map(c => c.startsWith(' ') ? c : ' ' + c + ' ').join('|') + '|';
        touched++;
      }
    }
  }

  if (touched > 0) fs.writeFileSync(srcPath, lines.join('\n'), 'utf8');
  return touched;
}


// ── autosave server ─────────────────────────────────────────────────────────

/** Update MANUAL-RESULTS.md in place from a state object. Cheap, non-invasive:
 *  overwrites ALL columns of the results table for every id in `values` — no
 *  TEST-CASES/ patching, no summary rewrite (kept fresh via renderManualResultsMd
 *  on the next `save` or `gen`). This is deliberately loose so keystrokes don't
 *  cascade into structural edits. */
function autosaveUpdateMd(mdPath, values) {
  const text = fs.readFileSync(mdPath, 'utf8');
  const table = findResultsTable(text);
  if (!table) return { updated: 0, error: 'no results table in ' + mdPath };
  const fields = table.headers.map(fieldForHeader);
  const idIdx = fields.indexOf('id');
  if (idIdx === -1) return { updated: 0, error: 'no TC ID column' };

  const lines = text.split('\n');
  let updated = 0;
  for (let i = table.startLine + 2; i <= table.endLine; i++) {
    const cells = splitRow(lines[i]);
    const id = (cells[idIdx] || '').trim();
    const row = values[id];
    if (!row) continue;
    let dirty = false;
    for (let c = 0; c < cells.length; c++) {
      const field = fields[c];
      if (!field || field === 'id') continue;
      if (row[field] === undefined) continue;
      const clean = escapeCell(row[field]);
      if ((cells[c] || '').trim() !== clean.trim()) {
        cells[c] = ' ' + clean + ' ';
        dirty = true;
      }
    }
    if (dirty) {
      lines[i] = '|' + cells.map(c => c.startsWith(' ') ? c : ' ' + c + ' ').join('|') + '|';
      updated++;
    }
  }
  if (updated > 0) fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
  return { updated };
}

function cmdAutosave(artifactsDir, args) {
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.slice(7), 10) : 4477;
  const absArtDir = path.resolve(artifactsDir);
  if (!fs.existsSync(absArtDir)) die(`artifacts dir does not exist: ${absArtDir}`);

  const cors = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };
  const send = (res, code, obj) => {
    cors(res);
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(code);
    res.end(JSON.stringify(obj));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2 * 1024 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });

  // Debounce writes per file so a burst of keystrokes lands as one filesystem write.
  const pending = new Map(); // mdPath → { timer, values }
  const flush = (mdPath) => {
    const entry = pending.get(mdPath);
    if (!entry) return;
    pending.delete(mdPath);
    try {
      const r = autosaveUpdateMd(mdPath, entry.values);
      if (r.updated > 0) console.log(`autosave: ${path.relative(process.cwd(), mdPath)} — ${r.updated} row${r.updated > 1 ? 's' : ''}`);
    } catch (e) {
      console.error(`autosave: write failed for ${mdPath}: ${e.message}`);
    }
  };

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { ok: true, dir: absArtDir });
    }
    if (req.method === 'POST' && req.url === '/save') {
      let body;
      try { body = await readBody(req); } catch { return send(res, 400, { error: 'invalid JSON' }); }
      const mdPath = String(body.mdPath || '');
      if (!mdPath) return send(res, 400, { error: 'missing mdPath' });
      const abs = path.resolve(mdPath);
      if (!abs.startsWith(absArtDir + path.sep) && abs !== absArtDir) {
        return send(res, 403, { error: 'path outside registered artifacts dir' });
      }
      if (!fs.existsSync(abs)) return send(res, 404, { error: 'md not found' });
      const values = body.values || {};
      const prev = pending.get(abs);
      if (prev) clearTimeout(prev.timer);
      const merged = prev ? mergeValues(prev.values, values) : values;
      pending.set(abs, { values: merged, timer: setTimeout(() => flush(abs), 250) });
      return send(res, 200, { ok: true, queued: Object.keys(values).length });
    }

    if (req.method === 'POST' && req.url === '/commit') {
      // Full save: MANUAL-RESULTS.md (all cols) + patch TEST-CASES/<feature>.md
      // for changed metadata. Same logic as `save` subcommand but driven by state
      // JSON directly (no HTML parse needed). Does NOT end the annotron poll.
      let body;
      try { body = await readBody(req); } catch { return send(res, 400, { error: 'invalid JSON' }); }
      const mdPath = String(body.mdPath || '');
      if (!mdPath) return send(res, 400, { error: 'missing mdPath' });
      const abs = path.resolve(mdPath);
      if (!abs.startsWith(absArtDir + path.sep) && abs !== absArtDir) {
        return send(res, 403, { error: 'path outside registered artifacts dir' });
      }
      // Flush any pending debounced writes first so we work on the freshest .md.
      const pend = pending.get(abs);
      if (pend) { clearTimeout(pend.timer); flush(abs); }
      try {
        const result = commitFromState(absArtDir, abs, body.values || {});
        return send(res, 200, result);
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
    }

    send(res, 404, { error: 'not found' });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`manual-results autosave on http://localhost:${port}  (watching ${absArtDir})`);
    console.log(`open MANUAL-RESULTS.html in annotron; edits will land in the .md within ~1s`);
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') die(`port ${port} already in use — pass --port=<other>`);
    die(`server error: ${e.message}`);
  });

  const shutdown = () => {
    // Flush any pending writes before exit.
    for (const [p, entry] of pending) { clearTimeout(entry.timer); try { autosaveUpdateMd(p, entry.values); } catch {} }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/** Full commit driven by a state object (no HTML parse). Mirrors cmdSave: updates
 *  MANUAL-RESULTS.md with every column, then patches TEST-CASES/<feature>.md for
 *  changed metadata (description/preconditions/steps/expected/priority). Feature
 *  moves across files are flagged but not performed. Used by the /commit endpoint
 *  and any tool consumer that already has parsed state. */
function commitFromState(artifactsDir, mdPath, state) {
  const stateMap = new Map(Object.entries(state));
  if (!stateMap.size) return { updated: 0, patchedFiles: [], featureChanges: [] };

  const baseline = new Map(collectCases(artifactsDir).map(c => [c.id, c]));
  const touchedFiles = new Map();
  const featureChanges = [];

  for (const [id, s] of stateMap) {
    const base = baseline.get(id);
    if (!base) continue;
    if (s.feature && s.feature !== base.feature) {
      featureChanges.push({ id, from: base.feature, to: s.feature });
    }
    const changes = {};
    for (const f of META_FIELDS) {
      if (s[f] === undefined) continue;
      if ((s[f] || '').trim() !== (base[f] || '').trim()) changes[f] = s[f];
    }
    if (Object.keys(changes).length === 0) continue;
    const srcPath = path.join(artifactsDir, 'TEST-CASES', base.feature + '.md');
    if (!fs.existsSync(srcPath)) continue;
    const rowsTouched = patchFeatureFile(srcPath, id, changes);
    if (rowsTouched > 0) touchedFiles.set(srcPath, (touchedFiles.get(srcPath) || 0) + 1);
  }

  // Rebuild MANUAL-RESULTS.md fresh (source-of-truth is baseline + overlay state).
  const refreshed = collectCases(artifactsDir);
  const currentTop = fs.existsSync(mdPath) ? parseExisting(fs.readFileSync(mdPath, 'utf8')) : new Map();
  for (const c of refreshed) {
    const s = stateMap.get(c.id);
    if (!s) {
      const prev = currentTop.get(c.id);
      c.result = prev?.result || 'Untested';
      c.notes  = prev?.notes  || '';
      continue;
    }
    c.result = s.result || 'Untested';
    c.notes  = s.notes  || '';
    if (s.feature)  c.feature  = s.feature;
    if (s.priority) c.priority = s.priority;
  }
  const epicId = path.basename(path.dirname(path.resolve(artifactsDir)));
  fs.writeFileSync(mdPath, renderManualResultsMd(refreshed, epicId), 'utf8');

  // Warn if TEST-PLAN.md mentions any feature whose cases we just edited — the
  // plan is prose (not tables), so we can't auto-patch, but the user should
  // know to review it.
  const planReviewFeatures = [];
  const planPath = path.join(artifactsDir, 'TEST-PLAN.md');
  if (fs.existsSync(planPath) && touchedFiles.size > 0) {
    const planText = fs.readFileSync(planPath, 'utf8');
    const editedFeatures = new Set();
    for (const p of touchedFiles.keys()) {
      editedFeatures.add(path.basename(p).replace(/\.md$/, ''));
    }
    for (const f of editedFeatures) {
      if (planText.includes(f)) planReviewFeatures.push(f);
    }
  }

  return {
    updated: stateMap.size,
    patchedFiles: [...touchedFiles.entries()].map(([p, n]) => ({ path: p, rows: n })),
    featureChanges,
    planReviewFeatures,
  };
}

function mergeValues(a, b) {
  const out = {};
  for (const id of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    out[id] = Object.assign({}, a[id] || {}, b[id] || {});
  }
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function die(msg) { console.error(msg); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'gen') {
  if (!rest[0]) die('usage: manual-results.mjs gen <epicArtifactsDir>');
  cmdGen(rest[0]);
} else if (cmd === 'render') {
  if (!rest[0]) die('usage: manual-results.mjs render <MANUAL-RESULTS.md> [out.html]');
  cmdRender(rest[0], rest[1]);
} else if (cmd === 'save') {
  if (!rest[0] || !rest[1]) die('usage: manual-results.mjs save <MANUAL-RESULTS.html> <MANUAL-RESULTS.md>');
  cmdSave(rest[0], rest[1]);
} else if (cmd === 'autosave') {
  if (!rest[0]) die('usage: manual-results.mjs autosave <epicArtifactsDir> [--port=4477]');
  cmdAutosave(rest[0], rest);
} else {
  die('usage:\n  manual-results.mjs gen <artifactsDir>\n  manual-results.mjs render <md> [out.html]\n  manual-results.mjs save <html> <md>\n  manual-results.mjs autosave <artifactsDir> [--port=4477]');
}
