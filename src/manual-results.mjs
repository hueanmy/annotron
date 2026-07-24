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
 *       <APP>-<FEATURE>-TC-<N> (any uppercase prefix), writes/merges
 *       <dir>/MANUAL-RESULTS.md. Existing Result/Notes are preserved; new cases
 *       are appended with Result=Untested.
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
const TC_ID_RE = /^(?:[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-TC-\d+|TC(?:-[A-Z][A-Z0-9]*)*-\d+)$/;

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
  if (cases.length === 0 && existing.size > 0) {
    die(`gen found 0 cases in TEST-CASES/ but ${existing.size} cases exist in MANUAL-RESULTS.md — aborting to avoid data loss.\nCheck that TC IDs match the pattern ^[A-Z]...-TC-\\d+$ or ^TC-...-\\d+$.`);
  }
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
        const clsSuffix = current.replace(/[^a-zA-Z]/g, '');
        const opts = RESULT_OPTIONS.map(o => `<option value="${o}"${o === current ? ' selected' : ''}>${o}</option>`).join('');
        return `<td class="mr-cell-result mr-r-${clsSuffix}"><select data-tc-id="${escapeHtml(id)}" data-field="result" class="mr-select mr-r-${clsSuffix}">${opts}</select></td>`;
      }
      if (field === 'priority') {
        // Short single-line identifier — plain input.
        return `<td class="mr-cell-${field}"><input type="text" data-tc-id="${escapeHtml(id)}" data-field="${field}" value="${escapeHtml(val)}"></td>`;
      }
      if (field === 'feature') {
        // Feature name is a single-line identifier semantically, but values like
        // "internal-post-markup" are wide. Use a textarea so the column can be
        // narrow and the value wraps onto multiple lines when needed.
        return `<td class="mr-cell-${field}"><textarea data-tc-id="${escapeHtml(id)}" data-field="${field}" rows="1" placeholder="feature…">${escapeHtml(val)}</textarea></td>`;
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
body { padding: 3.5rem 2rem 5rem; }
@media (min-width: 1200px) { body { padding: 3.5rem 3rem 5rem; } }

/* ── Table form controls ── */
.mr-table select, .mr-table textarea, .mr-table input[type="text"] {
  font-family: var(--ui); font-size: .82rem; padding: .3em .5em;
  border: 1px solid var(--line-14); border-radius: 6px;
  background: var(--panel); color: var(--ink); width: 100%;
}
.mr-table textarea { resize: vertical; min-height: 1.6em; line-height: 1.5; overflow: hidden; }
.mr-table select:focus, .mr-table textarea:focus, .mr-table input[type="text"]:focus {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(39,65,241,.12);
}
.mr-cell-id code {
  font-family: var(--mono); font-size: .76rem;
  background: var(--bg); padding: .15em .4em; border-radius: 4px;
  border: 1px solid var(--line-10); user-select: all;
}
.mr-cell-priority input { font-size: .8rem; text-align: center; font-weight: 600; }
.mr-cell-feature textarea {
  font-size: .7rem; font-family: var(--mono);
  color: var(--accent); font-weight: 600; background: var(--accent-soft);
  border-color: transparent; padding: .22em .35em;
  word-break: break-all; overflow-wrap: anywhere; min-height: 3em; line-height: 1.3;
}
.mr-cell-feature textarea:focus { background: var(--panel); border-color: var(--accent); }
.mr-dirty { background: rgba(243,156,18,.1) !important; }
.mr-dirty select, .mr-dirty input, .mr-dirty textarea { border-color: #f39c12 !important; }

/* ── Toolbar ── */
#mr-toolbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 20; height: 48px;
  background: var(--panel); border-bottom: 1px solid var(--line-08);
  padding: 0 1.2em; display: flex; gap: .5em; align-items: center;
  box-shadow: 0 1px 4px rgba(27,26,61,.06);
}
body { padding-top: 3.5rem !important; }
#mr-toolbar button {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px;
  border-radius: var(--radius); background: var(--accent); color: #fff; border: none;
  font: 600 12.5px var(--ui); cursor: pointer; transition: background .15s; white-space: nowrap;
}
#mr-toolbar button:hover:not(:disabled) { background: var(--accent-hover); }
#mr-toolbar button:disabled { opacity: .45; cursor: default; }
#mr-search {
  flex: 0 1 22rem; min-width: 10rem; height: 32px; padding: 0 .8em;
  font: 13px var(--ui); background: var(--bg); color: var(--ink);
  border: 1px solid var(--line-14); border-radius: var(--radius);
}
#mr-search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(39,65,241,.12); }
#mr-filter-result {
  height: 32px; padding: 0 .5em; font: 13px var(--ui);
  background: var(--bg); color: var(--ink); border: 1px solid var(--line-14); border-radius: var(--radius);
}
#mr-search-count { color: var(--dim-5); font-size: .75rem; white-space: nowrap; }
.mr-row-hidden { display: none !important; }
.mr-hl { background: rgba(39,65,241,.18); border-radius: 2px; padding: 0 .1em; }
#mr-toolbar-status { color: var(--dim-5); font-size: .8rem; margin-left: auto; font-weight: 500; white-space: nowrap; }
#mr-toolbar-status.ok   { color: var(--green-ink); }
#mr-toolbar-status.err  { color: #c0392b; }
#mr-toolbar-status.warn { color: #c87700; }
#mr-toolbar button.working { background: #c87700; }
#mr-toolbar button.success { background: var(--green-ink); }
#mr-toolbar button.failed  { background: #c0392b; }

/* ── Toast ── */
#mr-toast-layer {
  position: fixed; inset: 0; z-index: 999; pointer-events: none;
  display: flex; align-items: center; justify-content: center;
}
.mr-toast {
  pointer-events: auto; min-width: 22rem; max-width: 42rem;
  background: var(--panel); color: var(--ink); border: 2px solid var(--accent);
  border-radius: 12px; padding: 1.2em 1.6em; box-shadow: 0 12px 40px rgba(27,26,61,.18);
  font-family: var(--ui); transform: scale(0.9); opacity: 0;
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.mr-toast.visible { transform: scale(1); opacity: 1; }
.mr-toast.ok   { border-color: var(--green); }
.mr-toast.err  { border-color: #e74c3c; }
.mr-toast.warn { border-color: #f39c12; }
.mr-toast-title { font-size: 1rem; font-weight: 700; margin-bottom: .4em; display: flex; align-items: center; gap: .5em; }
.mr-toast.ok   .mr-toast-title { color: var(--green-ink); }
.mr-toast.err  .mr-toast-title { color: #c0392b; }
.mr-toast.warn .mr-toast-title { color: #c87700; }
.mr-toast-body { font-size: .85rem; line-height: 1.5; }
.mr-toast-body ul { margin: .4em 0 0; padding-left: 1.2em; }
.mr-toast-body code { background: var(--accent-soft); padding: .1em .3em; border-radius: 3px; font-size: .82rem; }
.mr-toast-close {
  margin-top: .8em; background: var(--accent); color: #fff; border: none;
  border-radius: 6px; padding: .35em 1em; font: 600 .82rem var(--ui); cursor: pointer;
}
.mr-toast-close:hover { background: var(--accent-hover); }

/* ── Autosave ping ── */
#mr-autosave-ping {
  position: fixed; bottom: 1rem; right: 1rem; z-index: 15;
  background: var(--panel); color: var(--dim-6);
  border: 1px solid var(--line-10); border-radius: 999px;
  padding: .3em .9em; font: 500 .73rem var(--ui);
  opacity: 1; transition: opacity 0.6s ease;
  pointer-events: none; box-shadow: 0 2px 8px rgba(27,26,61,.1);
}

/* ── Main table ── */
.mr-table { table-layout: fixed; font-size: .82rem; width: 100%; min-width: 110rem; }
.mr-table td, .mr-table th { vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
.mr-table-wrap { overflow-x: auto; }
/* Order: TC ID | Feature | Description | Preconditions | Steps | Expected | Result | Notes | Priority */
.mr-table th:nth-child(1), .mr-table td:nth-child(1) { width: 7rem; }
.mr-table th:nth-child(2), .mr-table td:nth-child(2) { width: 7rem; }
.mr-table th:nth-child(3), .mr-table td:nth-child(3) { width: 16rem; }
.mr-table th:nth-child(4), .mr-table td:nth-child(4) { width: 13rem; }
.mr-table th:nth-child(5), .mr-table td:nth-child(5) { width: 19rem; }
.mr-table th:nth-child(6), .mr-table td:nth-child(6) { width: 15rem; }
.mr-table th:nth-child(7), .mr-table td:nth-child(7) { width: 7rem; }
.mr-table th:nth-child(8), .mr-table td:nth-child(8) { width: 13rem; }
.mr-table th:nth-child(9), .mr-table td:nth-child(9) { width: 4.5rem; text-align: center; color: var(--dim-5); }
.mr-table textarea { white-space: pre-wrap; }

/* ── Result cell colouring ── */
td.mr-r-Pass     { background: rgba(47,191,113,.18) !important; }
td.mr-r-Fail     { background: rgba(231,76,60,.15)  !important; }
td.mr-r-NA       { background: rgba(27,26,61,.05)   !important; }
td.mr-r-Untested { background: transparent          !important; }
.mr-table select.mr-r-Pass     { background: var(--green);  color: #fff; font-weight: 700; border-color: var(--green-ink); }
.mr-table select.mr-r-Fail     { background: #e74c3c;       color: #fff; font-weight: 700; border-color: #c0392b; }
.mr-table select.mr-r-NA       { background: rgba(27,26,61,.3); color: #fff; font-weight: 700; border-color: rgba(27,26,61,.4); }
.mr-table select.mr-r-Untested { background: var(--bg); color: var(--dim-5); font-weight: 500; }
.mr-table select option { background: var(--panel); color: var(--ink); font-weight: 500; }

/* ── Sticky summary bar ── */
#mr-summary {
  position: sticky; top: 3rem; z-index: 5;
  background: var(--panel); border: 1px solid var(--line-08);
  border-radius: var(--radius); padding: .6em 1em; margin: 0 0 1em;
  font: 13px var(--ui); display: flex; gap: 1.2em; flex-wrap: wrap; align-items: center;
  box-shadow: 0 1px 3px rgba(27,26,61,.06);
}
#mr-summary .mr-count { font-weight: 700; color: var(--accent); }
#mr-summary .mr-legend { color: var(--dim-5); font-size: .75rem; }
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

  // Also update the static "Summary" markdown table at the top of the page so
  // its counts don't drift from the live sticky bar. Detects it as the first
  // <table> whose header cells are "Metric" + "Count" (matches the .md
  // structure emitted by renderManualResultsMd).
  var staticSummaryTable = null;
  (function findStaticSummary() {
    var tables = document.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      var ths = tables[i].querySelectorAll('thead th');
      if (ths.length === 2 &&
          /^metric$/i.test((ths[0].textContent || '').trim()) &&
          /^count$/i.test((ths[1].textContent || '').trim())) {
        staticSummaryTable = tables[i];
        break;
      }
    }
  })();
  function updateStaticSummary(counts, total) {
    if (!staticSummaryTable) return;
    var rows = staticSummaryTable.querySelectorAll('tbody tr');
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('td');
      if (cells.length < 2) continue;
      var label = (cells[0].textContent || '').trim().toLowerCase();
      if (label === 'total') cells[1].textContent = total;
      else if (label === 'untested') cells[1].textContent = counts.Untested;
      else if (label === 'pass') cells[1].textContent = counts.Pass;
      else if (label === 'fail') cells[1].textContent = counts.Fail;
      else if (label === 'n/a') cells[1].textContent = counts['N/A'];
    }
  }

  function updateSummary() {
    var counts = { Untested: 0, Pass: 0, Fail: 0, 'N/A': 0 };
    tbl.querySelectorAll('select[data-field="result"]').forEach(function (s) {
      counts[s.value] = (counts[s.value] || 0) + 1;
    });
    var total = counts.Untested + counts.Pass + counts.Fail + counts['N/A'];
    updateStaticSummary(counts, total);
    var dirty = tbl.querySelectorAll('td.mr-dirty').length;
    if (!summary) return;
    summary.innerHTML =
      '<span>Total: <span class="mr-count">' + total + '</span></span>' +
      '<span>Pass: <span class="mr-count" style="color:#2ecc71">' + counts.Pass + '</span></span>' +
      '<span>Fail: <span class="mr-count" style="color:#e74c3c">' + counts.Fail + '</span></span>' +
      '<span>N/A: <span class="mr-count" style="color:#888">' + counts['N/A'] + '</span></span>' +
      '<span>Untested: <span class="mr-count" style="color:var(--muted)">' + counts.Untested + '</span></span>' +
      (dirty ? '<span>Edited cells: <span class="mr-count" style="color:#f39c12">' + dirty + '</span></span>' : '') +
      '<span class="mr-legend">Auto-save on every edit — landed on disk within ~1s. Commit to also propagate metadata to TEST-CASES/.</span>';
  }

  tbl.addEventListener('change', function (e) {
    var t = e.target;
    if (t.tagName === 'SELECT' && t.dataset.field === 'result') {
      // Mirror to DOM so HTML serialization captures the choice.
      Array.prototype.forEach.call(t.options, function (o) {
        if (o.value === t.value) o.setAttribute('selected', ''); else o.removeAttribute('selected');
      });
      var suffix = t.value.replace(/[^a-zA-Z]/g, '');
      t.className = t.className.replace(/\\bmr-r-[A-Za-z]+\\b/g, '') + ' mr-r-' + suffix;
      var td = t.closest('td');
      if (td) td.className = td.className.replace(/\\bmr-r-[A-Za-z]+\\b/g, '').trim() + ' mr-r-' + suffix;
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
  var RENDER_TS    = (document.querySelector('meta[name="mr-render-ts"]')    || {}).content || '';
  var serverAlive  = false;
  var LOCAL_DEBOUNCE_MS = 500;         // localStorage — fast; no external side effect.
  var DISK_INTERVAL_MS  = 30 * 1000;   // disk (server POST) — every 30s if dirty.

  // Health-check the autosave server. Silent — only flashes the badge on the
  // very first check (to confirm autosave is armed) and on state transitions
  // (server goes up/down). No ping every 15s.
  var initialCheckDone = false;
  function checkServer() {
    if (!AUTOSAVE_URL) return;
    var wasAlive = serverAlive;
    fetch(AUTOSAVE_URL + '/health', { mode: 'cors' })
      .then(function (r) { serverAlive = r.ok; })
      .catch(function () { serverAlive = false; })
      .finally(function () {
        if (!initialCheckDone) {
          initialCheckDone = true;
          flashPing(serverAlive ? 'Auto-save armed (disk)' : 'Auto-save armed (local only)');
        } else if (wasAlive !== serverAlive) {
          flashPing(serverAlive ? 'Autosave server back online' : 'Autosave server went offline');
        }
      });
  }
  checkServer();
  setInterval(checkServer, 15000);

  // localStorage save (fast). Runs on every keystroke via debounce — cheap, purely
  // in-browser, no file I/O. Also fires diskSaveIfDirty right away so keystrokes
  // land on disk within ~1s (server debounces 250ms), not stuck for 30s.
  function localSaveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ts: Date.now(),
        renderTs: RENDER_TS,
        values: collectAllValues(),
      }));
    } catch (e) {}
    diskSaveIfDirty();
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
  // Throttle ping — mỗi 500ms save quá nhiều, ping spam. Chỉ flash mỗi 5s dù save nhiều.
  var lastPingAt = 0;
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
        if (Date.now() - lastPingAt > 5000) {
          lastPingAt = Date.now();
          flashPing('Saved to disk · ' + new Date().toLocaleTimeString());
        }
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

    // Staleness handling: if the file has been re-rendered since this snapshot
    // was saved, metadata columns (description/steps/etc.) on disk may be
    // fresher — restoring them would clobber. But Result + Notes are strictly
    // user-produced, disk can only ever be less-fresh than localStorage for
    // these — always restore them. NEVER delete the snapshot; user may want to
    // review it via the banner.
    var stale = !!(data.renderTs && RENDER_TS && data.renderTs !== RENDER_TS);
    var ALWAYS_RESTORE = { result: true, notes: true };

    var restored = 0;
    tbl.querySelectorAll('[data-tc-id][data-field]').forEach(function (el) {
      var id = el.dataset.tcId, field = el.dataset.field;
      var saved = data.values[id] && data.values[id][field];
      if (saved === undefined || saved === null) return;
      var current = el.value || '';
      if (current === saved) return;
      // Under staleness, skip metadata fields — disk may be fresher. Result +
      // Notes are always safe to restore (only the browser can produce them).
      if (stale && !ALWAYS_RESTORE[field]) return;

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

  // Restore is now silent — no scary modal with Keep/Discard buttons. Result +
  // Notes are always safe to restore (only the browser can produce them);
  // metadata is skipped if stale. Nothing the user needs to decide.
  function showRestoreBanner(restored, ts) {
    if (!restored) return;
    flashPing('Recovered ' + restored + ' edit' + (restored === 1 ? '' : 's') + ' from local backup');
  }

  // Ping badge (bottom-right, fades out) so users see auto-save happening.
  var ping = document.createElement('div');
  ping.id = 'mr-autosave-ping';
  ping.textContent = 'Auto-save armed';
  document.body.appendChild(ping);
  setTimeout(function () { ping.style.opacity = '0'; }, 2000);

  var btnSave   = document.getElementById('mr-btn-save');
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

      showToast('ok', '💾 Saved at ' + now,
        '<strong>MANUAL-RESULTS.md</strong> written — Pass/Fail/N/A results safe on disk.');
      setStatus('Saved at ' + now, 'ok');
      tbl.querySelectorAll('td.mr-dirty').forEach(function (td) { td.classList.remove('mr-dirty'); });
      tbl.querySelectorAll('input,textarea,select').forEach(function (el) {
        initial.set(el, el.tagName === 'SELECT' ? el.value : (el.value || ''));
      });
      updateSummary();

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

  // ── Search + filter ────────────────────────────────────────────────────────
  //   • Keyword search over TC ID, Feature, Description, Preconditions, Steps,
  //     Expected, Notes (case-insensitive substring).
  //   • Result filter (Pass / Fail / N/A / Untested / All).
  //   • Hotkey: Ctrl/Cmd+F or forward-slash focuses the search box; Esc clears + refocuses table.
  //   Rows that don't match get .mr-row-hidden. Live counts on the right.
  var searchInput  = document.getElementById('mr-search');
  var resultFilter = document.getElementById('mr-filter-result');
  var searchCount  = document.getElementById('mr-search-count');

  function collectRowText(row) {
    // Concatenate visible values of every editable/read-only cell into one string.
    var out = [];
    row.querySelectorAll('[data-field]').forEach(function (el) {
      if (el.tagName === 'SELECT') out.push(el.value);
      else out.push(el.value || '');
    });
    // Also include the TC ID (read-only, in <code>).
    var idCell = row.querySelector('.mr-cell-id');
    if (idCell) out.push(idCell.textContent || '');
    return out.join(' \\n ').toLowerCase();
  }

  var rowCache = null;
  function ensureRowCache() {
    if (rowCache) return rowCache;
    rowCache = [];
    tbl.querySelectorAll('tbody tr[data-tc-id]').forEach(function (row) {
      rowCache.push({ row: row, text: collectRowText(row) });
    });
    return rowCache;
  }
  function invalidateRowCache() { rowCache = null; }

  function applyFilter() {
    var q = (searchInput.value || '').trim().toLowerCase();
    var rf = resultFilter.value || '';
    var cache = ensureRowCache();
    var shown = 0;
    for (var i = 0; i < cache.length; i++) {
      var entry = cache[i];
      var matchesQuery = !q || entry.text.indexOf(q) !== -1;
      var matchesResult = true;
      if (rf) {
        var sel = entry.row.querySelector('select[data-field="result"]');
        matchesResult = sel && sel.value === rf;
      }
      var visible = matchesQuery && matchesResult;
      entry.row.classList.toggle('mr-row-hidden', !visible);
      if (visible) shown++;
    }
    if (searchCount) {
      if (q || rf) searchCount.textContent = shown + ' / ' + cache.length + ' shown';
      else searchCount.textContent = '';
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', applyFilter);
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { searchInput.value = ''; applyFilter(); searchInput.blur(); }
    });
  }
  if (resultFilter) resultFilter.addEventListener('change', applyFilter);

  // Filter needs a re-check when values change (e.g. user changes a Result and
  // a Result filter is active). Rebuild cache lazily on next filter.
  tbl.addEventListener('change', invalidateRowCache, true);
  tbl.addEventListener('input',  invalidateRowCache, true);

  // Global shortcuts.
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return;
    var tag = document.activeElement && document.activeElement.tagName;
    var inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    // Ctrl/Cmd+F → focus search (override native browser find).
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
    // "/" → focus search when not typing in another field.
    if (e.key === '/' && !inField) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  if (btnSave) btnSave.addEventListener('click', function () {
    callEndpoint('/save', btnSave, {
      normal:  '💾 Save now',
      working: '⏳ Saving…',
      success: '✅ Saved',
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
<meta name="mr-render-ts" content="${Date.now()}">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${baseCss}${MR_CSS}</style>
</head>
<body>
<div id="mr-toolbar">
  <button id="mr-btn-save" title="Flush Pass/Fail/N/A results to MANUAL-RESULTS.md immediately. Autosave already does this every ~1s — use this when you want to be sure before stepping away.">💾 Save now</button>
  <input id="mr-search" type="search" placeholder="Search cases…  (Ctrl/Cmd-F or /)" autocomplete="off" />
  <select id="mr-filter-result" title="Filter by result">
    <option value="">All results</option>
    <option value="Untested">Untested</option>
    <option value="Pass">Pass</option>
    <option value="Fail">Fail</option>
    <option value="N/A">N/A</option>
  </select>
  <span id="mr-search-count"></span>
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

// Base stylesheet — design tokens aligned with annotron chrome.html v1.1+.
// MR_CSS layers on top with manual-test-specific overrides.
const BASE_CSS = `
:root {
  --bg: #F3F3F8;
  --panel: #fff;
  --ink: #1B1A3D;
  --accent: #2741F1;
  --accent-hover: #1f34c9;
  --accent-soft: rgba(39,65,241,.1);
  --green: #2fbf71;
  --green-ink: #1c8a4e;
  --line-08: rgba(27,26,61,.08);
  --line-10: rgba(27,26,61,.10);
  --line-14: rgba(27,26,61,.14);
  --dim-5: rgba(27,26,61,.5);
  --dim-6: rgba(27,26,61,.6);
  --radius: 9px;
  --ui: 'Inter', system-ui, -apple-system, sans-serif;
  --mono: ui-monospace, Menlo, monospace;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  font-family: var(--ui); font-size: 14px; line-height: 1.6;
  color: var(--ink); background: var(--bg);
  margin: 0; -webkit-font-smoothing: antialiased;
}
::selection { background: rgba(39,65,241,.18); }
h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -.02em; margin: 0 0 .25em; }
h2 { font-size: 1.1rem; font-weight: 600; margin: 2em 0 .6em; padding-bottom: .3em; border-bottom: 1px solid var(--line-08); }
h3 { font-size: 1rem; font-weight: 600; margin: 1.5em 0 .4em; }
p  { margin: 0 0 .9em; }
a  { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { margin: 0 0 .9em; padding-left: 1.4em; }
li { margin: .25em 0; }
strong { font-weight: 600; }
code {
  font-family: var(--mono); font-size: .84em;
  background: var(--accent-soft); color: var(--ink);
  padding: .1em .35em; border-radius: 5px;
}
blockquote {
  border-left: 3px solid var(--accent); margin: 1em 0; padding: .25em 1em;
  color: var(--dim-6); background: rgba(39,65,241,.04);
  border-radius: 0 var(--radius) var(--radius) 0; font-style: italic;
}
blockquote p { margin: .3em 0; }
.table-wrap { overflow-x: auto; margin: 1em 0; }
table {
  border-collapse: collapse; width: 100%; font-size: .875rem;
  border: 1px solid var(--line-10); border-radius: var(--radius); overflow: hidden;
}
th, td { border-bottom: 1px solid var(--line-08); padding: .55em .8em; text-align: left; vertical-align: top; }
th { background: var(--panel); font-weight: 600; font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; color: var(--dim-6); }
tr:last-child td { border-bottom: none; }
tbody tr:nth-child(even) td { background: rgba(27,26,61,.02); }
hr { border: none; border-top: 1px solid var(--line-08); margin: 2em 0; }
.doc-meta {
  display: inline-flex; align-items: center; gap: .5em;
  font-size: .75rem; color: var(--dim-5);
  background: var(--panel); border: 1px solid var(--line-10);
  border-radius: 999px; padding: .3em .85em; margin-bottom: 1.5em;
}
.doc-meta::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: none; }
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

/** Read state directly from MANUAL-RESULTS.md (which the autosave server keeps
 *  fresh) and propagate metadata changes to TEST-CASES/<feature>.md. Does NOT
 *  rewrite MANUAL-RESULTS.md — it's already the source of truth. */
function cmdCommitMd(mdPath) {
  const abs = path.resolve(mdPath);
  const artifactsDir = path.dirname(abs);
  const mdText = fs.readFileSync(abs, 'utf8');
  const table = findResultsTable(mdText);
  if (!table) die(`no results table in ${abs}`);

  const fields = table.headers.map(fieldForHeader);
  const state = {};
  for (const row of table.rows) {
    const rowState = {};
    row.forEach((cell, i) => {
      const f = fields[i];
      if (f) rowState[f] = (cell || '').trim();
    });
    const id = rowState.id;
    if (id && TC_ID_RE.test(id)) state[id] = rowState;
  }

  const result = commitFromState(artifactsDir, abs, state);
  console.log(`commit-md ${mdPath} — propagated to ${result.patchedFiles.length} TEST-CASES/ file(s)`);
  for (const f of result.patchedFiles) console.log(`  ${path.relative(process.cwd(), f.path)} (${f.rows} rows)`);
  if (result.featureChanges.length) {
    console.warn(`WARN: feature-column changes NOT applied (do manually):`);
    for (const c of result.featureChanges) console.warn(`  ${c.id}: ${c.from} → ${c.to}`);
  }
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
} else if (cmd === 'commit-md') {
  // Propagate metadata from MANUAL-RESULTS.md → TEST-CASES/<feature>.md WITHOUT
  // touching the .md itself. Use this at the end of a /manual-test loop instead
  // of `save HTML MD`, which reads a possibly-stale HTML and overwrites MD.
  if (!rest[0]) die('usage: manual-results.mjs commit-md <MANUAL-RESULTS.md>');
  cmdCommitMd(rest[0]);
} else if (cmd === 'autosave') {
  if (!rest[0]) die('usage: manual-results.mjs autosave <epicArtifactsDir> [--port=4477]');
  cmdAutosave(rest[0], rest);
} else {
  die('usage:\n  manual-results.mjs gen <artifactsDir>\n  manual-results.mjs render <md> [out.html]\n  manual-results.mjs save <html> <md>\n  manual-results.mjs commit-md <md>\n  manual-results.mjs autosave <artifactsDir> [--port=4477]');
}
