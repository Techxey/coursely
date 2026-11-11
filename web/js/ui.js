/* ══════════════════════════════════════════════════════════════
   课序 · UI —— DOM 助手 / 图标 / 弹层 / Toast
   window.App.ui
   ══════════════════════════════════════════════════════════════ */
window.App = window.App || {};

(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ── 图标（24×24 stroke，颜色取 currentColor） ── */
  var ICONS = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.1M12 19.5v2.1M2.4 12h2.1M19.5 12h2.1M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M18.8 5.2l-1.5 1.5M6.7 17.3l-1.5 1.5"/>',
    grid: '<rect x="3.2" y="3.2" width="7.4" height="7.4" rx="2.1"/><rect x="13.4" y="3.2" width="7.4" height="7.4" rx="2.1"/><rect x="3.2" y="13.4" width="7.4" height="7.4" rx="2.1"/><rect x="13.4" y="13.4" width="7.4" height="7.4" rx="2.1"/>',
    checkCircle: '<circle cx="12" cy="12" r="8.8"/><path d="M8.2 12.3l2.6 2.6 5-5.2"/>',
    timer: '<circle cx="12" cy="13.6" r="7.4"/><path d="M12 10.2v3.6l2.3 1.6M9.2 2.4h5.6M18.4 6.2l1.4-1.4"/>',
    user: '<circle cx="12" cy="8.1" r="3.7"/><path d="M4.7 20.2c.9-3.6 3.8-5.6 7.3-5.6s6.4 2 7.3 5.6"/>',
    plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
    minus: '<path d="M5.2 12h13.6"/>',
    x: '<path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"/>',
    chevronRight: '<path d="M9.4 5.4L15.9 12l-6.5 6.6"/>',
    chevronLeft: '<path d="M14.6 5.4L8.1 12l6.5 6.6"/>',
    chevronDown: '<path d="M5.4 9.4L12 16l6.6-6.6"/>',
    chevronUp: '<path d="M5.4 14.6L12 8l6.6 6.6"/>',
    bell: '<path d="M18.2 8.6a6.2 6.2 0 1 0-12.4 0c0 6.1-2.1 7.6-2.1 7.6h16.6s-2.1-1.5-2.1-7.6Z"/><path d="M10.2 19.8a2.1 2.1 0 0 0 3.6 0"/>',
    camera: '<path d="M3.2 8.8A2.6 2.6 0 0 1 5.8 6.2h1.7l1.2-2h6.6l1.2 2h1.7A2.6 2.6 0 0 1 20.8 8.8v8.6a2.6 2.6 0 0 1-2.6 2.6H5.8a2.6 2.6 0 0 1-2.6-2.6Z"/><circle cx="12" cy="13" r="3.4"/>',
    book: '<path d="M4.4 5.4A2 2 0 0 1 6.4 3.4h12.2"/><path d="M4.4 5.4v14.2h13.6a1.6 1.6 0 0 0 1.6-1.6V3.4"/><path d="M8 7.6h7.4"/>',
    clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.2V12l3.3 2"/>',
    mapPin: '<path d="M12 21.2s6.6-6.2 6.6-11.2A6.6 6.6 0 0 0 5.4 10c0 5 6.6 11.2 6.6 11.2Z"/><circle cx="12" cy="9.8" r="2.4"/>',
    trash: '<path d="M4.6 6.6h14.8M9.6 6.6V4.9a1.3 1.3 0 0 1 1.3-1.3h2.2a1.3 1.3 0 0 1 1.3 1.3v1.7"/><path d="M6.9 6.6l.8 12.2a1.8 1.8 0 0 0 1.8 1.7h5a1.8 1.8 0 0 0 1.8-1.7l.8-12.2"/>',
    pencil: '<path d="M16.7 3.9a2 2 0 0 1 2.8 2.8L7.5 18.6l-3.6.9.9-3.6Z"/>',
    share: '<path d="M12 15.4V3.6"/><path d="M8.4 7.2L12 3.6l3.6 3.6"/><path d="M5.6 12.4v6a1.8 1.8 0 0 0 1.8 1.8h9.2a1.8 1.8 0 0 0 1.8-1.8v-6"/>',
    download: '<path d="M12 3.6v12M8 11.6l4 4 4-4"/><path d="M4.8 20.4h14.4"/>',
    calendar: '<rect x="3.4" y="4.6" width="17.2" height="16" rx="3.2"/><path d="M3.4 9.4h17.2M8.4 2.8v3.6M15.6 2.8v3.6"/>',
    flame: '<path d="M12 21c3.6 0 6.2-2.5 6.2-5.9 0-4.4-4.6-6.5-3.6-11.3-2.7.8-4.4 2.9-4.4 5.1 0 1.3.6 2.1.6 2.1s-1.3-1-2.6.4c-.9 1-1.4 2.3-1.4 3.7C6.8 18.5 8.9 21 12 21Z"/>',
    chart: '<path d="M4.2 3.8v16.4h16"/><path d="M7.6 16.6v-4.4M12 16.6V8.2M16.4 16.6v-6.4"/>',
    sparkles: '<path d="M11.6 3.6l1.7 4.2 4.2 1.7-4.2 1.7-1.7 4.2-1.7-4.2L5.7 9.5l4.2-1.7Z"/><path d="M18.2 15.4l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8Z"/>',
    more: '<circle cx="5.6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.4" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    play: '<path d="M8.6 5.4l10.2 6.6-10.2 6.6Z"/>',
    pause: '<rect x="7.2" y="5.4" width="3.4" height="13.2" rx="1.5" fill="currentColor" stroke="none"/><rect x="13.4" y="5.4" width="3.4" height="13.2" rx="1.5" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.8" fill="currentColor" stroke="none"/>',
    refresh: '<path d="M20.2 12.4a8.2 8.2 0 1 1-2.8-6.1"/><path d="M20.6 4v4.6h-4.6"/>',
    moon: '<path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6Z"/>',
    info: '<circle cx="12" cy="12" r="8.8"/><path d="M12 11.2v5.4M12 7.6v.2"/>',
    check: '<path d="M5 12.8l4.4 4.4L19 6.6"/>',
    filter: '<path d="M4 6.4h16M7 12h10M10 17.6h4"/>',
    image: '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="3.2"/><circle cx="8.6" cy="9.6" r="1.5"/><path d="M4 16.6l4.6-4.2 4 3.6 3.2-2.8 4.2 3.8"/>',
    list: '<path d="M8.4 6.6h11.2M8.4 12h11.2M8.4 17.4h11.2"/><circle cx="4.4" cy="6.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.4" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.4" cy="17.4" r="1.2" fill="currentColor" stroke="none"/>',
    cap: '<path d="M12 4.2L2.6 8.6 12 13l9.4-4.4Z"/><path d="M6.4 10.6v4.8c0 1.7 2.5 3 5.6 3s5.6-1.3 5.6-3v-4.8"/><path d="M21.4 8.6v5.2"/>',
    code: '<path d="M8.4 8L4 12l4.4 4M15.6 8L20 12l-4.4 4"/>',
    dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>'
  };

  function icon(name, size) {
    var d = ICONS[name] || ICONS.dot;
    var s = size || 24;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── h(tag, attrs, ...children) ── */
  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'ref' && typeof v === 'function') v(node);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    var kids = Array.prototype.slice.call(arguments, 2);
    (function flat(arr) {
      arr.forEach(function (k) {
        if (k == null || k === false) return;
        if (Array.isArray(k)) return flat(k);
        node.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
      });
    })(kids);
    return node;
  }

  /** 字符串 → 元素（多根则取第一个） */
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  }

  function haptic(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {}
  }

  /* ── Toast ── */
  function toast(msg, opts) {
    opts = opts || {};
    var root = $('#toast-root');
    if (!root) return;
    var node = h('div', { class: 'toast', html: (opts.icon ? icon(opts.icon, 16) + ' ' : '') + esc(msg) });
    if (opts.icon) node.style.display = 'inline-flex', node.style.alignItems = 'center', node.style.gap = '6px';
    root.appendChild(node);
    setTimeout(function () {
      node.classList.add('out');
      setTimeout(function () { node.remove(); }, 260);
    }, opts.duration || 2100);
  }

  /* ── Sheet ── */
  var openSheets = [];

  function sheet(opts) {
    opts = opts || {};
    var layer = $('#sheet-root');
    var wrap = h('div', { class: 'sheet-wrap' });
    var backdrop = h('div', { class: 'sheet-backdrop' });
    var panel = h('div', { class: 'sheet ' + (opts.className || '') });
    var grabber = h('div', { class: 'sheet-grabber' });

    var head = null;
    if (opts.title) {
      head = h('div', { class: 'sheet-head' },
        h('div', { class: 'sheet-title', text: opts.title }),
        opts.subtitle ? h('div', { class: 'sheet-subtitle', text: opts.subtitle }) : null,
        h('div', { class: 'spacer' }),
        opts.actions ? opts.actions : null,
        h('button', { class: 'sheet-close', type: 'button', 'aria-label': '关闭', html: icon('x', 20), onclick: close })
      );
    }

    var body = h('div', { class: 'sheet-body' });
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    var actions = null;
    if (opts.footer) {
      actions = h('div', { class: 'sheet-actions' });
      if (typeof opts.footer === 'string') actions.innerHTML = opts.footer;
      else actions.appendChild(opts.footer);
    }

    panel.appendChild(grabber);
    if (head) panel.appendChild(head);
    panel.appendChild(body);
    if (actions) panel.appendChild(actions);
    wrap.appendChild(backdrop);
    wrap.appendChild(panel);
    layer.appendChild(wrap);
    layer.classList.add('open');

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      panel.classList.remove('in');
      backdrop.classList.remove('in');
      if (opts.onClose) try { opts.onClose(); } catch (e) { console.error(e); }
      setTimeout(function () {
        wrap.remove();
        if (!$$('.sheet-wrap', layer).length) layer.classList.remove('open');
      }, 380);
      openSheets = openSheets.filter(function (s) { return s !== api; });
    }

    var api = { el: panel, body: body, close: close };
    openSheets.push(api);

    backdrop.addEventListener('click', function () { if (opts.dismissible !== false) close(); });

    /* 下拉关闭 */
    var drag = { y: 0, dy: 0, on: false };
    panel.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.sheet-body') || e.target.closest('button')) return;
      drag.on = true; drag.y = e.clientY; drag.dy = 0;
      panel.style.transition = 'none';
    });
    window.addEventListener('pointermove', function (e) {
      if (!drag.on) return;
      drag.dy = Math.max(0, e.clientY - drag.y);
      panel.style.transform = 'translateY(' + drag.dy + 'px)';
    });
    window.addEventListener('pointerup', function () {
      if (!drag.on) return;
      drag.on = false;
      panel.style.transition = '';
      panel.style.transform = '';
      if (drag.dy > 96) close();
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        backdrop.classList.add('in');
        panel.classList.add('in');
      });
    });

    if (opts.onMount) setTimeout(function () { opts.onMount(api); }, 30);
    return api;
  }

  /* ── Alert / Confirm ── */
  function confirmBox(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var layer = $('#sheet-root');
      var wrap = h('div', { class: 'sheet-wrap' });
      var backdrop = h('div', { class: 'sheet-backdrop in' });
      var box = h('div', { class: 'alert', role: 'alertdialog' },
        h('div', { class: 'alert-text' },
          h('div', { class: 'alert-title', text: opts.title || '提示' }),
          opts.message ? h('div', { class: 'alert-msg', text: opts.message }) : null
        ),
        h('div', { class: 'alert-actions' },
          h('button', {
            class: 'alert-btn', type: 'button', text: opts.cancel || '取消',
            onclick: function () { done(false); }
          }),
          h('button', {
            class: 'alert-btn danger', type: 'button', text: opts.confirm || '确定',
            onclick: function () { done(true); }
          })
        )
      );
      wrap.appendChild(backdrop); wrap.appendChild(box);
      layer.appendChild(wrap);
      layer.classList.add('open');
      requestAnimationFrame(function () { box.classList.add('in'); });

      function done(v) {
        box.classList.remove('in');
        setTimeout(function () {
          wrap.remove();
          if (!$$('.sheet-wrap', layer).length) layer.classList.remove('open');
        }, 240);
        resolve(v);
      }
      if (opts.dismissible !== false) backdrop.addEventListener('click', function () { done(false); });
    });
  }

  function closeAllSheets() {
    openSheets.slice().forEach(function (s) { s.close(); });
  }

  /* ── 日期格式 ── */
  function hm(d) {
    var x = new Date(d);
    return D2(x.getHours()) + ':' + D2(x.getMinutes());
  }
  function D2(n) { return n < 10 ? '0' + n : '' + n; }
  function md(d) { var x = new Date(d); return (x.getMonth() + 1) + '月' + x.getDate() + '日'; }
  function ymdSlash(d) { var x = new Date(d); return x.getFullYear() + '/' + D2(x.getMonth() + 1) + '/' + D2(x.getDate()); }
  function wdName(d) { return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(d).getDay()]; }
  function dateTitle(d) {
    var x = new Date(d);
    var mm = x.getMonth() + 1, dd = x.getDate();
    return mm + '月' + dd + '日 ' + wdName(x);
  }
  function rel(target) { return window.App.D.relText(target); }

  window.App.ui = {
    $: $, $$: $$, h: h, el: el, icon: icon, esc: esc,
    haptic: haptic, toast: toast, sheet: sheet, confirm: confirmBox,
    closeAllSheets: closeAllSheets,
    hm: hm, md: md, ymdSlash: ymdSlash, wdName: wdName, dateTitle: dateTitle, rel: rel, D2: D2
  };
})();
