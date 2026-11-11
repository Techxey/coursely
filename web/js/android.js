/* ══════════════════════════════════════════════════════════════
   课序 · Android 原生桥接层
   在浏览器里打开时自动降级为 no-op（不影响 PWA 体验）。
   暴露：App.native.*     回退：window.CourselyBack()
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var bridge = window.CourselyNative;
  var HAS = !!bridge;
  var pending = {};
  var seq = 0;

  /* ── 通用请求：JS → 原生 → Promise ── */
  function call(method, payload, timeoutMs) {
    if (!HAS) return Promise.reject(new Error('native-unavailable'));
    var id = 'r' + (++seq) + '_' + Date.now();
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        resolve(null);              // 超时按「无结果」处理，页面走降级分支
      }, timeoutMs || 30000);

      pending[id] = {
        resolve: function (v) { clearTimeout(timer); resolve(v); },
        reject: function (e) { clearTimeout(timer); reject(e); }
      };

      try {
        bridge.req(id, method, JSON.stringify(payload || {}));
      } catch (e) {
        delete pending[id];
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  /* ── 原生回调入口（Kotlin 侧 evaluateJavascript 调用） ── */
  window.CN = window.CN || {};
  window.CN._resolve = function (id, ok, dataJson) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    var data = null;
    try { data = typeof dataJson === 'string' ? JSON.parse(dataJson) : dataJson; } catch (e) { data = null; }
    if (ok) {
      p.resolve(data);
    } else {
      var err = new Error((data && data.code) || 'native-error');
      err.detail = data;
      p.reject(err);
    }
  };

  function readInfo() {
    try { return JSON.parse(bridge.info()); } catch (e) { return { platform: 'browser' }; }
  }

  /* ── 对外 API ── */
  var native = {
    available: HAS,
    info: HAS ? readInfo() : { platform: 'browser', ocr: false },

    /** 轻微震动（原生 Vibrator，比 navigator.vibrate 更可靠） */
    vibrate: function (ms) {
      if (!HAS) return;
      try { bridge.req('v' + (++seq), 'vibrate', JSON.stringify({ ms: ms || 8 })); } catch (e) {}
    },

    /** source: 'camera' | 'gallery' → {dataUrl, width, height} */
    pickPhoto: function (source) {
      if (!HAS) return Promise.reject(new Error('native-unavailable'));
      return call('pickPhoto', { source: source || 'camera' }, 180000);
    },

    /** {dataUrl} → {width, height, lines:[{text,x,y,w,h,size}]}（坐标为 0–1 归一化） */
    ocr: function (dataUrl) {
      if (!HAS) return Promise.reject(new Error('native-unavailable'));
      return call('ocr', { dataUrl: dataUrl }, 60000);
    },

    /** items: [{id, atMs, title, body}] → {scheduled, exact} */
    syncReminders: function (items) {
      if (!HAS) return Promise.resolve({ scheduled: 0, exact: false });
      return call('syncReminders', { items: items || [] }, 20000);
    },

    /** 桌面小组件：{events:[{name,room,startMs,endMs,tone}]} → {ok, events} */
    syncWidget: function (payload) {
      if (!HAS) return Promise.resolve({ ok: false, events: 0 });
      return call('syncWidget', payload || { events: [] }, 20000);
    },

    requestNotifications: function () {
      if (!HAS) return Promise.resolve({ granted: false });
      return call('requestNotifications', {}, 120000);
    },

    setStatusBar: function (dark) {
      if (!HAS) return;
      try { bridge.req('s' + (++seq), 'setStatusBar', JSON.stringify({ dark: !!dark })); } catch (e) {}
    },

    /** 系统返回键：由原生调用，true 表示页面已消费 */
    back: function () { return false; }
  };

  window.App = window.App || {};
  window.App.native = native;

  if (!HAS) return;   // 以下仅 Android 生效

  /* ── 状态栏跟随主题（观察 data-theme 变化，不侵入 app.js） ── */
  function syncStatusBar() {
    native.setStatusBar(document.documentElement.getAttribute('data-theme') === 'dark');
  }
  var mo = new MutationObserver(syncStatusBar);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  setTimeout(syncStatusBar, 60);

  /* ── 震动接管：让所有 ui.haptic 都走原生 ── */
  try {
    if (window.App.ui && window.App.ui.haptic) {
      window.App.ui.haptic = function (ms) { native.vibrate(ms); };
    }
  } catch (e) {}

  /* ── 后台提醒：把「未来 7 天课程 + 未完成待办」交给 AlarmManager ── */
  function buildReminderItems() {
    var S = window.App.store, D = window.App.D;
    if (!S || !D) return [];
    var items = [];
    var now = D.now();
    var nowMs = now.getTime();
    var DAY = 86400000;

    /* 作业提醒：截止前 30 分钟（上课提醒已移除） */
    S.state.todos.forEach(function (t) {
      if (t.done) return;
      var at = new Date(t.due).getTime() - 30 * 60000;
      if (at <= nowMs + 60000) return;
      if (D.inQuiet(at, S.state.settings)) return;
      items.push({ id: 't|' + t.id, atMs: at, title: '作业快截止了', body: t.title });
    });

    return items.slice(0, 60);
  }

  var syncTimer = null;
  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      if (!S.state.settings.notifyOn) { native.syncReminders([]); return; }
      native.syncReminders(buildReminderItems()).then(function (r) {
        if (r && r.scheduled) console.info('[课序] 已排 ' + r.scheduled + ' 条提醒' + (r.exact ? '（精确）' : '（近似）'));
      });
    }, 1200);
  }
  var S = window.App.store;

  /* ── 桌面小组件：把未来 14 天的课推给原生 ──
     小组件是独立进程，读不到 WebView 的 localStorage，所以原生侧要留一份快照。
     推的是「绝对时间戳」而不是「第几周第几节」——这样 App 没开，小组件也能自己算今天/下节课。 */
  function buildWidgetEvents() {
    var S2 = window.App.store, D2 = window.App.D;
    if (!S2 || !D2) return [];
    var out = [];
    var nowMs = Date.now();
    for (var d = 0; d < 14; d++) {
      var day = new Date(nowMs + d * 86400000);
      day.setHours(0, 0, 0, 0);
      var week = D2.weekOf(day);
      var wd = day.getDay() || 7;
      D2.coursesOn(week, wd).forEach(function (c) {
        var span = D2.courseSpan(c, day);
        out.push({
          name: c.name,
          room: c.room || '',
          startMs: span.start.getTime(),
          endMs: span.end.getTime(),
          tone: c.tone || 2
        });
      });
    }
    out.sort(function (a, b) { return a.startMs - b.startMs; });
    return out;
  }

  var widgetTimer = null;
  function pushWidget() {
    clearTimeout(widgetTimer);
    widgetTimer = setTimeout(function () {
      var events = buildWidgetEvents();
      native.syncWidget({ events: events, generatedAt: Date.now() }).then(function (r) {
        if (r && r.ok) console.info('[课序] 小组件已同步 ' + r.events + ' 节课');
      }).catch(function () {});
    }, 800);
  }

  /* 数据变化 / 设置变化后重排 */
  if (S && S.subscribe) {
    S.subscribe(scheduleSync);
    S.subscribe(pushWidget);   // 课表一改，桌面小组件立刻跟着变
  }

  /* 首次进入：同步小组件快照 + 请求通知权限 + 排一次提醒 */
  window.addEventListener('load', function () {
    setTimeout(pushWidget, 400);
    setTimeout(function () {
      if (!S || !S.state.settings.notifyOn) return;
      native.requestNotifications().then(function (r) {
        if (r && r.granted) scheduleSync();
      });
    }, 1200);
  });

  /* ── 系统返回键：先关弹层，再回「今日」，最后交还系统 ── */
  window.CourselyBack = function () {
    try {
      if (document.querySelector('.sheet-wrap')) {
        window.App.ui.closeAllSheets();
        return true;
      }
      if (window.App.pageId && window.App.pageId() !== 'today') {
        window.App.go('today');
        return true;
      }
    } catch (e) {}
    return false;
  };

  console.info('%c课序 · Android 原生桥已连接', 'color:#34C759;font-weight:700');
})();
