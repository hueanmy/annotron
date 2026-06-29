/**
 * annotron SDK — injected into the artifact iframe at serve time only.
 * Never written to disk. Communicates with the chrome via postMessage.
 */
(function () {
  const TAG = 'annotron-sdk';
  const STYLE_ID = '__annotron_style__';

  let annotating = false;
  let hovered = null;

  // Inject highlight style
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .__annotron_hover__ {
      outline: 2px solid #4f8ef7 !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
    }
    .__annotron_selected__ {
      outline: 2px solid #e74c3c !important;
      outline-offset: 2px !important;
    }
  `;
  document.head.appendChild(style);

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

  function onMouseOver(e) {
    if (!annotating) return;
    if (hovered && hovered !== e.target) hovered.classList.remove('__annotron_hover__');
    hovered = e.target;
    hovered.classList.add('__annotron_hover__');
  }

  function onMouseOut(e) {
    if (!annotating) return;
    if (hovered) hovered.classList.remove('__annotron_hover__');
    hovered = null;
  }

  function onClick(e) {
    if (!annotating) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    el.classList.remove('__annotron_hover__');
    window.parent.postMessage({
      [TAG]: true,
      type: 'element-selected',
      selector: cssPath(el),
      label: labelFor(el),
    }, '*');
  }

  function onSelectionChange() {
    if (!annotating) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;
    const range = sel.getRangeAt(0);
    const el = range.commonAncestorContainer.nodeType === 3
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;
    window.parent.postMessage({
      [TAG]: true,
      type: 'text-selected',
      selector: cssPath(el),
      text,
      label: `"${text.slice(0, 60)}"`,
    }, '*');
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mouseup', onSelectionChange);

  function serialize() {
    const clone = document.documentElement.cloneNode(true);
    // Remove injected style
    const s = clone.querySelector('#' + STYLE_ID);
    if (s) s.remove();
    // Remove injected script (the SDK itself — last script or one with data-annotron)
    clone.querySelectorAll('script[data-annotron]').forEach(sc => sc.remove());
    // Remove transient classes
    clone.querySelectorAll('.__annotron_hover__, .__annotron_selected__').forEach(el => {
      el.classList.remove('__annotron_hover__', '__annotron_selected__');
    });
    const dt = document.doctype
      ? `<!DOCTYPE ${document.doctype.name}>` + '\n'
      : '';
    return dt + clone.outerHTML;
  }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || !d[TAG]) return;
    if (d.type === 'set-annotate') {
      annotating = d.value;
      if (!annotating && hovered) {
        hovered.classList.remove('__annotron_hover__');
        hovered = null;
      }
    }
    if (d.type === 'serialize') {
      e.source.postMessage({ [TAG]: true, type: 'serialized', html: serialize(), reqId: d.reqId }, '*');
    }
  });

  window.parent.postMessage({ [TAG]: true, type: 'sdk-ready' }, '*');
})();
