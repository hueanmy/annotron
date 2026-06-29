/**
 * annotron SDK — injected into the artifact iframe at serve time only.
 * Never written to disk. Communicates with the chrome via postMessage.
 */
(function () {
  const TAG = 'annotron-sdk';
  let annotating = false;
  let hovered = null;
  let shadow = null;
  let ignoreNextClick = false;

  // ── CSS path ───────────────────────────────────────────────────────────────
  function cssPath(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node !== document.body && node.nodeType === 1) {
      const tag = node.tagName.toLowerCase();
      const siblings = Array.from(node.parentElement?.children || []).filter(c => c.tagName === node.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(node) + 1;
        parts.unshift(`${tag}:nth-of-type(${idx})`);
      } else {
        parts.unshift(tag);
      }
      node = node.parentElement;
    }
    parts.unshift('body');
    return parts.join(' > ');
  }

  function labelFor(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const text = (el.textContent || '').trim().slice(0, 40);
    return `<${tag}${id}${cls}>${text ? ' "' + text + '"' : ''}`;
  }

  function isInteractive(el) {
    return !!(el && el.closest && el.closest(
      'button,input,select,textarea,label,summary,[contenteditable]:not([contenteditable="false"])'
    ));
  }

  // ── Shadow DOM ─────────────────────────────────────────────────────────────
  function ensureShadow() {
    if (shadow) return shadow;
    const host = document.createElement('div');
    host.setAttribute('data-annotron-ui', '1');
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; position: fixed; z-index: 2147483647; left: 0; top: 0; }
      .hl {
        position: fixed; pointer-events: none;
        background: rgba(79,142,247,.22);
        border-radius: 2px;
        box-shadow: 0 0 0 1.5px rgba(79,142,247,.55);
      }
      .el-hl {
        position: fixed; pointer-events: none;
        outline: 2px solid #4f8ef7;
        outline-offset: 2px;
        border-radius: 2px;
      }
      .card {
        position: fixed;
        width: min(300px, calc(100vw - 24px));
        padding: 12px;
        border-radius: 10px;
        background: #25262b;
        color: #c9cdd4;
        border: 1px solid #4f8ef7;
        box-shadow: 0 16px 56px rgba(0,0,0,.45);
        font: 13px/1.4 system-ui, -apple-system, sans-serif;
      }
      .card-heading {
        font-size: 11px; font-weight: 700; color: #6c7280;
        text-transform: uppercase; letter-spacing: .5px;
        margin-bottom: 6px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .card textarea {
        width: 100%; min-height: 68px; resize: vertical;
        border-radius: 6px; border: 1px solid #373a40;
        background: #1e1f23; color: #c9cdd4;
        padding: 7px 8px; font: inherit; font-size: 13px;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .card textarea:focus { outline: none; border-color: #4f8ef7; }
      .card textarea::placeholder { color: #4a4e5a; }
      .card .hint { margin-top: 5px; font-size: 11px; color: #4a4e5a; }
      .card .row { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px; }
      .card button {
        border: 0; border-radius: 6px; padding: 6px 12px;
        font: 600 12px system-ui, -apple-system, sans-serif; cursor: pointer;
      }
      .btn-cancel { background: #373a40; color: #c9cdd4; }
      .btn-cancel:hover { background: #444750; }
      .btn-add { background: #4f8ef7; color: #fff; }
      .btn-add:hover { background: #3a7ae0; }
    `;
    shadow.appendChild(style);
    return shadow;
  }

  function clearHighlights() {
    if (!shadow) return;
    shadow.querySelectorAll('.hl,.el-hl').forEach(el => el.remove());
  }

  function clearCard() {
    if (!shadow) return;
    shadow.querySelectorAll('.card').forEach(el => el.remove());
    clearHighlights();
  }

  function highlightTextRange(range) {
    const root = ensureShadow();
    clearHighlights();
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      const mark = document.createElement('div');
      mark.className = 'hl';
      mark.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
      root.appendChild(mark);
    }
  }

  function highlightElement(el) {
    const root = ensureShadow();
    clearHighlights();
    const rect = el.getBoundingClientRect();
    const mark = document.createElement('div');
    mark.className = 'el-hl';
    mark.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
    root.appendChild(mark);
  }

  function positionCard(card, anchorRect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(300, vw - 24);
    let left = Math.max(12, Math.min(anchorRect.left, vw - w - 12));
    let top = anchorRect.bottom + 10;
    if (top + 180 > vh) top = Math.max(12, anchorRect.top - 190);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function showCard({ heading, placeholder, anchorRect, onAdd }) {
    const root = ensureShadow();
    clearCard();

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-heading">${heading}</div>
      <textarea placeholder="${placeholder}"></textarea>
      <div class="hint">Enter — add &middot; Esc — cancel</div>
      <div class="row">
        <button class="btn-cancel" type="button">Cancel</button>
        <button class="btn-add" type="button">Add annotation</button>
      </div>`;
    root.appendChild(card);
    positionCard(card, anchorRect);

    const ta = card.querySelector('textarea');
    const btnCancel = card.querySelector('.btn-cancel');
    const btnAdd = card.querySelector('.btn-add');

    const submit = () => {
      onAdd(ta.value.trim());
      clearCard();
    };

    btnCancel.addEventListener('click', () => clearCard());
    btnAdd.addEventListener('click', submit);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); clearCard(); }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    setTimeout(() => ta.focus(), 0);
  }

  // ── Hover ──────────────────────────────────────────────────────────────────
  document.addEventListener('mouseover', e => {
    if (!annotating || isInteractive(e.target) || e.target.closest('[data-annotron-ui]')) return;
    if (hovered) { hovered.style.outline = ''; hovered.style.outlineOffset = ''; }
    hovered = e.target;
    hovered.style.outline = '2px solid #4f8ef7';
    hovered.style.outlineOffset = '2px';
    hovered.style.cursor = 'crosshair';
  }, true);

  document.addEventListener('mouseout', e => {
    if (!annotating) return;
    if (hovered && e.target === hovered) {
      hovered.style.outline = '';
      hovered.style.outlineOffset = '';
      hovered.style.cursor = '';
      hovered = null;
    }
  }, true);

  // ── Text selection → inline card ───────────────────────────────────────────
  document.addEventListener('mouseup', e => {
    if (!annotating || isInteractive(e.target) || e.target.closest('[data-annotron-ui]')) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    const anchorEl = range.commonAncestorContainer.nodeType === 3
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;
    const anchorRect = range.getBoundingClientRect();
    const clonedRange = range.cloneRange();
    const selector = cssPath(anchorEl);
    const label = `"${text.slice(0, 60)}"`;

    ignoreNextClick = true;
    highlightTextRange(clonedRange);
    sel.removeAllRanges();

    showCard({
      heading: `Text: ${text.slice(0, 50)}${text.length > 50 ? '…' : ''}`,
      placeholder: 'What should change about this text?',
      anchorRect,
      onAdd: (note) => {
        window.parent.postMessage({ [TAG]: true, type: 'text-selected', selector, text, label, note }, '*');
      },
    });
  }, true);

  // ── Element click → inline card ────────────────────────────────────────────
  document.addEventListener('click', e => {
    if (!annotating || isInteractive(e.target) || e.target.closest('[data-annotron-ui]')) return;
    e.preventDefault();
    e.stopPropagation();

    if (ignoreNextClick) { ignoreNextClick = false; return; }

    const el = e.target;
    if (hovered === el) { hovered.style.outline = ''; hovered.style.outlineOffset = ''; hovered.style.cursor = ''; hovered = null; }

    const selector = cssPath(el);
    const label = labelFor(el);
    const anchorRect = el.getBoundingClientRect();

    highlightElement(el);
    showCard({
      heading: `Element: ${label}`,
      placeholder: 'What should change about this element?',
      anchorRect,
      onAdd: (note) => {
        window.parent.postMessage({ [TAG]: true, type: 'element-selected', selector, label, note }, '*');
        clearHighlights();
      },
    });
  }, true);

  // ── Serialize ──────────────────────────────────────────────────────────────
  function serialize() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script[data-annotron]').forEach(s => s.remove());
    clone.querySelector('[data-annotron-ui]')?.remove();
    clone.querySelectorAll('[style]').forEach(el => {
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.cursor = '';
    });
    const dt = document.doctype ? `<!DOCTYPE ${document.doctype.name}>\n` : '';
    return dt + clone.outerHTML;
  }

  // ── Message bus ────────────────────────────────────────────────────────────
  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || !d[TAG]) return;
    if (d.type === 'set-annotate') {
      annotating = d.value;
      if (!annotating) { clearCard(); if (hovered) { hovered.style.outline = ''; hovered = null; } }
    }
    if (d.type === 'serialize') {
      e.source.postMessage({ [TAG]: true, type: 'serialized', html: serialize(), reqId: d.reqId }, '*');
    }
  });

  window.parent.postMessage({ [TAG]: true, type: 'sdk-ready' }, '*');
})();
