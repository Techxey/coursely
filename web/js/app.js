/* ══════════════════════════════════════════════════════════════
   课序 · App —— 外壳 / 路由 / Tab / 主题 / 提醒引擎
   ══════════════════════════════════════════════════════════════ */
window.App = window.App || {};
window.Pages = window.Pages || {};

(function () {
  'use strict';
  var ui = window.App.ui;
  var D = window.App.D;
  var S = window.App.store;

  var TABS = [
    { id: 'today', label: '今日', icon: 'sun' },
    { id: 'schedule', label: '课表', icon: 'grid' },
    { id: 'todos', label: '待办', icon: 'checkCircle' },
    { id: 'focus', label: '专注', icon: 'timer' },
    { id: 'me', label: '我的', icon: 'user' }
  ];

  var current = null;
  var fabEl = null;

  /* ── 主题 ── */
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    var t = S.state.settings.theme || 'auto';
    var dark = t === 'dark' || (t === 'auto' && mql.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#000000' : '#F2F2F7');
  }
  if (mql.addEventListener) mql.addEventListener('change', applyTheme);

  /* ── 状态栏时钟 ── */
  function tickClock() {
    var el = document.getElementById('sb-time');
    if (el) el.textContent = ui.hm(D.now());
  }

  /* ── 设备外框（桌面预览时套上 iPhone 外壳） ── */
  function fitFrame() {
    var framed = window.innerWidth >= 640 && window.innerHeight >= 700;
    document.body.classList.toggle('has-frame', framed);
  }

  /* ── Tab Bar ── */
  function buildTabbar() {
    var bar = document.getElementById('tabbar');
    bar.innerHTML = '';
    TABS.forEach(function (t) {
      var b = ui.h('button', {
        class: 'tab' + (t.id === current ? ' active' : ''),
        type: 'button',
        dataset: { page: t.id },
        'aria-label': t.label,
        html: ui.icon(t.icon) + '<span class="tab-label">' + t.label + '</span>',
        onclick: function () {
          ui.haptic(6);
          if (current === t.id) {
            var p = document.getElementById('page-root');
            p.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            go(t.id);
          }
        }
      });
      bar.appendChild(b);
    });
  }

  /* ── 路由 ── */
  function renderPage(id, animate) {
    var page = window.Pages[id];
    if (!page) { console.warn('[课序] 页面缺失:', id); return; }
    var root = document.getElementById('page-root');
    var prevY = root.scrollTop;

    root.innerHTML = '';
    root.scrollTop = animate ? 0 : prevY;
    root.classList.remove('page-enter');
    if (animate) { void root.offsetWidth; root.classList.add('page-enter'); }

    var navTitle = document.getElementById('nav-title');
    var navActions = document.getElementById('nav-actions');
    navTitle.textContent = page.title || '';
    navActions.innerHTML = '';
    document.getElementById('nav-back').hidden = true;
    setFab(null);

    page.render(root);

    if (typeof page.navActions === 'function') {
      var acts = page.navActions();
      if (acts) [].concat(acts).forEach(function (n) { if (n) navActions.appendChild(n); });
    }
    root.scrollTop = animate ? 0 : prevY;
    root.dispatchEvent(new Event('scroll'));
  }

  function go(id, opts) {
    opts = opts || {};
    var prev = current;
    if (prev && window.Pages[prev] && typeof window.Pages[prev].destroy === 'function') {
      try { window.Pages[prev].destroy(); } catch (e) { console.error(e); }
    }
    current = id;
    ui.$$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.page === id); });
    renderPage(id, opts.animate !== false);
  }

  function refresh(opts) {
    if (!current) return;
    renderPage(current, false);
  }

  function setFab(cfg) {
    if (fabEl) { fabEl.remove(); fabEl = null; }
    if (!cfg) return;
    fabEl = ui.h('button', {
      class: 'fab' + (cfg.className ? ' ' + cfg.className : ''),
      type: 'button',
      'aria-label': cfg.label || '新增',
      html: ui.icon(cfg.icon || 'plus', 26),
      onclick: function (e) { ui.haptic(8); cfg.onClick && cfg.onClick(e); }
    });
    if (cfg.style) Object.assign(fabEl.style, cfg.style);
    document.getElementById('device').appendChild(fabEl);
  }

  /* ── 提醒引擎（只剩作业到期提醒；上课提醒已移除） ───────── */
  var lastTickKey = '';
  function checkReminders() {
    var st = S.state, settings = st.settings;
    if (!settings.notifyOn) return;
    var nowMs = D.now().getTime();
    var quiet = D.inQuiet(nowMs, settings);

    st.todos.forEach(function (t) {
      if (t.done) return;
      var mins = Math.round((new Date(t.due) - nowMs) / 60000);
      var key = 't|' + t.id + '|60';
      if (mins <= 60 && mins > -1 && !st.notified[key]) {
        st.notified[key] = true; S.touch();
        if (!quiet) fire('作业还有 ' + mins + ' 分钟截止', t.title);
      }
    });
  }

  var nativeOk = false;
  function fire(title, body) {
    try {
      if (nativeOk && window.Notification && Notification.permission === 'granted') {
        new Notification(title, { body: body, tag: title + body });
      }
    } catch (e) { /* 某些环境不支持 */ }
    ui.toast(title + ' · ' + body, { duration: 3600, icon: 'bell' });
  }

  function enableNativeNotify() {
    if (!window.Notification) return Promise.resolve(false);
    if (Notification.permission === 'granted') { nativeOk = true; return Promise.resolve(true); }
    return Notification.requestPermission().then(function (p) {
      nativeOk = p === 'granted';
      return nativeOk;
    }).catch(function () { return false; });
  }

  /* ── Boot ── */
  function boot() {
    applyTheme();
    fitFrame();
    window.addEventListener('resize', fitFrame);
    tickClock();
    setInterval(tickClock, 15000);

    buildTabbar();
    current = 'today';
    buildTabbar();
    renderPage('today', true);

    /* 滚动 → 导航栏毛玻璃 + 小标题 */
    var root = document.getElementById('page-root');
    root.addEventListener('scroll', function () {
      var nav = document.getElementById('navbar');
      nav.classList.toggle('scrolled', root.scrollTop > 24);
    }, { passive: true });

    /* 数据变化 → 当前页重绘（焦点/输入场景由各页自行处理） */
    S.subscribe(function () { refresh(); });

    /* 提醒轮询 */
    if (S.state.settings.notifyOn && window.Notification && Notification.permission === 'granted') {
      nativeOk = true;
    }
    checkReminders();
    setInterval(checkReminders, 15000);

    /* 首次点击时请求通知权限（用户手势内才允许） */
    document.addEventListener('pointerdown', function once() {
      document.removeEventListener('pointerdown', once);
      if (S.state.settings.notifyOn) enableNativeNotify();
    }, { once: true });

    /* 浅色 Demo 提示 */
    setTimeout(function () {
      if (S.state.settings.firstRun) {
        S.update(function (s) { s.settings.firstRun = false; });
        ui.toast('欢迎使用课序 · 点右下角 ＋ 可以加课', { icon: 'sparkles', duration: 3200 });
      }
    }, 900);

    console.info('%c课序 · 不只是课表', 'color:#007AFF;font-weight:700;font-size:13px');

    /* PWA：离线缓存（仅在 http(s) 下注册；Android 外壳里由 WebViewAssetLoader 提供，不需要 SW） */
    var isNative = !!(window.App.native && window.App.native.available);
    if (!isNative && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 忽略 */ });
    }
  }

  window.App.go = go;
  window.App.refresh = refresh;
  window.App.setFab = setFab;
  window.App.applyTheme = applyTheme;
  window.App.enableNativeNotify = enableNativeNotify;
  window.App.TABS = TABS;
  window.App.boot = boot;
  window.App.pageId = function () { return current; };
})();
