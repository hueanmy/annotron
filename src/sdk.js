/**
 * annotron SDK — injected into the artifact iframe at serve time only.
 * Never written to disk. Communicates with the chrome via postMessage.
 */
(function () {
  const TAG = 'annotron-sdk';
  let annotating = false;
  console.log('[annotron-sdk] loaded');
  let hovered = null;
  let cardEl = null;
  let overlayEl = null;
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
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
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

  function isAnnotronEl(el) {
    return !!(el && el.closest && el.closest('[data-annotron-ui]'));
  }

  // ── Overlay root (highlight layer) ────────────────────────────────────────
  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.setAttribute('data-annotron-ui', 'overlay');
    overlayEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483645;';
    document.documentElement.appendChild(overlayEl);
    return overlayEl;
  }

  function clearHighlights() {
    if (overlayEl) overlayEl.innerHTML = '';
  }

  function highlightTextRange(range) {
    const overlay = ensureOverlay();
    clearHighlights();
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      const m = document.createElement('div');
      m.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background:rgba(79,142,247,.25);border-radius:2px;box-shadow:0 0 0 1.5px rgba(79,142,247,.55);pointer-events:none;`;
      overlay.appendChild(m);
    }
  }

  function highlightElement(el) {
    const overlay = ensureOverlay();
    clearHighlights();
    const r = el.getBoundingClientRect();
    const m = document.createElement('div');
    m.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:2px solid #4f8ef7;outline-offset:2px;pointer-events:none;`;
    overlay.appendChild(m);
  }

  // ── Card ──────────────────────────────────────────────────────────────────
  const CARD_STYLE = [
    'position:fixed',
    'z-index:2147483646',
    'width:min(300px,calc(100vw - 24px))',
    'padding:14px',
    'border-radius:10px',
    'background:#25262b',
    'color:#c9cdd4',
    'border:1px solid #4f8ef7',
    'box-shadow:0 16px 56px rgba(0,0,0,.5)',
    'font:13px/1.4 system-ui,-apple-system,sans-serif',
    'display:flex',
    'flex-direction:column',
    'gap:8px',
  ].join(';');

  function clearCard() {
    if (cardEl) { cardEl.remove(); cardEl = null; }
  }

  function dismissCard() {
    clearCard();
    clearHighlights();
    if (hovered) {
      hovered.style.outline = '';
      hovered.style.outlineOffset = '';
      hovered.style.cursor = '';
      hovered = null;
    }
  }

  function positionCard(anchorRect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = Math.max(12, Math.min(anchorRect.left, vw - 316));
    let top = anchorRect.bottom + 10;
    if (top + 200 > vh) top = Math.max(12, anchorRect.top - 210);
    cardEl.style.left = left + 'px';
    cardEl.style.top = top + 'px';
  }

  function el(tag, styles, text) {
    const e = document.createElement(tag);
    if (styles) e.style.cssText = styles;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function showCard({ heading, placeholder, anchorRect, onAdd }) {
    clearCard();

    cardEl = document.createElement('div');
    cardEl.setAttribute('data-annotron-ui', 'card');
    cardEl.style.cssText = CARD_STYLE;

    const hdg = el('div',
      'font-size:11px;font-weight:700;color:#6c7280;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
      heading);

    const ta = document.createElement('textarea');
    ta.placeholder = placeholder;
    ta.style.cssText = 'width:100%;min-height:68px;resize:vertical;border-radius:6px;border:1px solid #373a40;background:#1e1f23;color:#c9cdd4;padding:7px 8px;font:13px/1.4 system-ui,-apple-system,sans-serif;box-sizing:border-box;outline:none;';
    ta.addEventListener('focus', () => { ta.style.borderColor = '#4f8ef7'; });
    ta.addEventListener('blur', () => { ta.style.borderColor = '#373a40'; });

    const hint = el('div', 'font-size:11px;color:#4a4e5a;', 'Enter — add · Esc — cancel');

    const row = el('div', 'display:flex;gap:6px;justify-content:flex-end;');

    const btnCancel = el('button', 'border:0;border-radius:6px;padding:6px 12px;font:600 12px system-ui;cursor:pointer;background:#373a40;color:#c9cdd4;', 'Cancel');
    const btnAdd = el('button', 'border:0;border-radius:6px;padding:6px 12px;font:600 12px system-ui;cursor:pointer;background:#4f8ef7;color:#fff;', 'Add annotation');

    row.append(btnCancel, btnAdd);
    cardEl.append(hdg, ta, hint, row);
    document.documentElement.appendChild(cardEl);
    positionCard(anchorRect);

    const submit = () => { onAdd(ta.value.trim()); dismissCard(); };

    btnCancel.addEventListener('click', e => { e.stopPropagation(); dismissCard(); });
    btnAdd.addEventListener('click', e => { e.stopPropagation(); submit(); });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); dismissCard(); }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    setTimeout(() => ta.focus(), 0);
  }

  // ── Hover ──────────────────────────────────────────────────────────────────
  document.addEventListener('mouseover', e => {
    if (!annotating || isInteractive(e.target) || isAnnotronEl(e.target)) return;
    if (hovered) { hovered.style.outline = ''; hovered.style.outlineOffset = ''; hovered.style.cursor = ''; }
    hovered = e.target;
    hovered.style.outline = '2px solid #4f8ef7';
    hovered.style.outlineOffset = '2px';
    hovered.style.cursor = 'crosshair';
  }, true);

  document.addEventListener('mouseout', e => {
    if (!annotating || !hovered || e.target !== hovered) return;
    hovered.style.outline = '';
    hovered.style.outlineOffset = '';
    hovered.style.cursor = '';
    hovered = null;
  }, true);

  // ── Text selection ─────────────────────────────────────────────────────────
  document.addEventListener('mouseup', e => {
    console.log('[annotron-sdk] mouseup', 'annotating:', annotating, 'target:', e.target?.tagName);
    if (!annotating || isAnnotronEl(e.target)) return;

    const sel = window.getSelection();
    console.log('[annotron-sdk] selection:', sel?.toString()?.slice(0, 30));
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
    dismissCard();
    highlightTextRange(clonedRange);
    sel.removeAllRanges();

    showCard({
      heading: 'Text: ' + text.slice(0, 50) + (text.length > 50 ? '…' : ''),
      placeholder: 'What should change about this text?',
      anchorRect,
      onAdd: note => {
        window.parent.postMessage({ [TAG]: true, type: 'text-selected', selector, text, label, note }, '*');
      },
    });
  }, true);

  // ── Element click ──────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    console.log('[annotron-sdk] click', 'annotating:', annotating, 'target:', e.target?.tagName);
    if (!annotating || isAnnotronEl(e.target)) return;
    if (isInteractive(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    if (ignoreNextClick) { ignoreNextClick = false; return; }

    const el = e.target;
    const selector = cssPath(el);
    const label = labelFor(el);
    const anchorRect = el.getBoundingClientRect();

    console.log('[annotron-sdk] showing card at', anchorRect.left, anchorRect.bottom);
    dismissCard();
    highlightElement(el);
    showCard({
      heading: 'Element: ' + label,
      placeholder: 'What should change about this element?',
      anchorRect,
      onAdd: note => {
        window.parent.postMessage({ [TAG]: true, type: 'element-selected', selector, label, note }, '*');
        dismissCard();
      },
    });
  }, true);

  // ── Serialize ──────────────────────────────────────────────────────────────
  function serialize() {
    dismissCard();
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script[data-annotron]').forEach(s => s.remove());
    clone.querySelectorAll('[data-annotron-ui]').forEach(s => s.remove());
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
      console.log('[annotron-sdk] set-annotate', annotating);
      if (!annotating) dismissCard();
    }
    if (d.type === 'serialize') {
      e.source.postMessage({ [TAG]: true, type: 'serialized', html: serialize(), reqId: d.reqId }, '*');
    }
  });

  window.parent.postMessage({ [TAG]: true, type: 'sdk-ready' }, '*');
})();
