/* ══════════════════════════════════════════════════════════════
   课序 · Store —— 唯一数据源（localStorage 持久化 + 订阅）
   window.App.store
   ══════════════════════════════════════════════════════════════ */
window.App = window.App || {};

(function () {
  'use strict';

  var KEY = 'coursely.state.v2';   // v2：去掉内置示例数据，全新空状态

  /* ── 作息时间（可在「我的 → 作息时间」里改） ── */
  var PERIODS = [
    ['08:00', '08:45'], ['08:55', '09:40'], ['10:00', '10:45'], ['10:55', '11:40'],
    ['14:00', '14:45'], ['14:55', '15:40'], ['16:00', '16:45'], ['16:55', '17:40'],
    ['19:00', '19:45'], ['19:55', '20:40'], ['20:50', '21:35'], ['21:45', '22:30']
  ];

  /* 不同节次数的预设作息：节次数可自己选，时间可再逐节微调 */
  var PERIOD_PRESETS = {
    8: [
      ['08:00', '08:45'], ['08:55', '09:40'], ['10:00', '10:45'], ['10:55', '11:40'],
      ['14:00', '14:45'], ['14:55', '15:40'], ['16:00', '16:45'], ['16:55', '17:40']
    ],
    10: [
      ['08:00', '08:45'], ['08:55', '09:40'], ['10:00', '10:45'], ['10:55', '11:40'],
      ['14:00', '14:45'], ['14:55', '15:40'], ['16:00', '16:45'], ['16:55', '17:40'],
      ['19:00', '19:45'], ['19:55', '20:40']
    ],
    12: PERIODS,
    14: [
      ['08:00', '08:40'], ['08:45', '09:25'], ['09:35', '10:15'], ['10:20', '11:00'],
      ['11:05', '11:45'], ['14:00', '14:40'], ['14:45', '15:25'], ['15:35', '16:15'],
      ['16:20', '17:00'], ['17:05', '17:45'], ['19:00', '19:40'], ['19:45', '20:25'],
      ['20:35', '21:15'], ['21:20', '22:00']
    ]
  };

  /** 取 n 节的默认作息（不支持的节次数按 12 节裁/补） */
  function defaultPeriods(n) {
    var want = Math.max(4, Math.min(16, Math.round(Number(n) || 12)));
    if (PERIOD_PRESETS[want]) return PERIOD_PRESETS[want].map(function (p) { return p.slice(); });
    // 非预设：用 12 节为底，多出来的接在最后，少的截断
    var base = PERIOD_PRESETS[12].map(function (p) { return p.slice(); });
    if (want <= base.length) return base.slice(0, want);
    var last = base[base.length - 1][1];
    while (base.length < want) {
      var p = toMinutes(last);
      base.push([fmtMinutes(p + 50), fmtMinutes(p + 95)]);
      last = base[base.length - 1][1];
    }
    return base;
  }

  function toMinutes(hhmm) {
    var a = String(hhmm).split(':');
    return (Number(a[0]) || 0) * 60 + (Number(a[1]) || 0);
  }
  function fmtMinutes(m) {
    m = ((m % 1440) + 1440) % 1440;
    return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  }


  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function mondayOf(d) {
    var x = startOfDay(d);
    var day = x.getDay() || 7;          // 周日=7
    x.setDate(x.getDate() - (day - 1));
    return x;
  }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function uid(p) {
    return (p || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  /* 周次区间：[1..16] / 单周 / 双周 */
  function weeks(from, to, parity) {
    var out = [];
    for (var w = from; w <= to; w++) {
      if (parity === 'odd' && w % 2 === 0) continue;
      if (parity === 'even' && w % 2 === 1) continue;
      out.push(w);
    }
    return out;
  }

  /* ── 初始状态：全新安装是「空课表」，不内置任何示例课程 / 待办 / 专注记录 ── */
  function seedState() {
    // 新用户默认从「本周一」开始算第 1 周，避免一上来就显示第 10 周
    var start = mondayOf(new Date());
    return {
      version: 2,
      settings: {
        semesterStart: ymd(start),
        totalWeeks: 20,
        theme: 'auto',
        notifyOn: true,
        timeShift: 0,
        periods: PERIODS,
        /* 每日暖言 */
        quoteOn: true,
        quoteCustom: [],
        /* 免打扰时段：只对作业到期提醒生效 */
        quietOn: false,
        quietFrom: '23:00',
        quietTo: '07:00',
        firstRun: true
      },
      courses: [],
      todos: [],
      focus: [],
      notified: {}
    };
  }
  /* ── 载入 / 保存 ── */
  function migrate(s) {
    var seed = seedState();
    s.settings = Object.assign({}, seed.settings, s.settings || {});
    // 作息必须是一组合法的 [start, end]，否则回落到 12 节默认
    var ps = s.settings.periods;
    var ok = Array.isArray(ps) && ps.length >= 4 && ps.every(function (p) {
      return Array.isArray(p) && p.length >= 2 &&
        /^\d{1,2}:\d{2}$/.test(String(p[0])) && /^\d{1,2}:\d{2}$/.test(String(p[1]));
    });
    if (!ok) s.settings.periods = seed.settings.periods;
    if (!Array.isArray(s.settings.quoteCustom)) s.settings.quoteCustom = [];
    if (!Array.isArray(s.courses)) s.courses = seed.courses;
    if (!Array.isArray(s.todos)) s.todos = [];
    if (!Array.isArray(s.focus)) s.focus = [];
    s.notified = s.notified || {};
    return s;
  }

  var state;
  try {
    var raw = localStorage.getItem(KEY);
    state = raw ? migrate(JSON.parse(raw)) : seedState();
  } catch (e) {
    state = seedState();
  }

  var listeners = [];
  var saveTimer = null;

  function flush() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式忽略 */ }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 120);
  }
  function emit() {
    listeners.slice().forEach(function (fn) {
      try { fn(state); } catch (e) { console.error(e); }
    });
  }

  var store = {
    PERIODS: PERIODS,
    defaultPeriods: defaultPeriods,
    get state() { return state; },
    uid: uid,
    weeks: weeks,
    ymd: ymd,
    startOfDay: startOfDay,
    mondayOf: mondayOf,
    addDays: addDays,

    /** 读取深层字段： store.get('settings.theme') */
    get: function (path) {
      return String(path).split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, state);
    },

    /** 事务式修改： store.update(s => { s.x = 1 }) */
    update: function (mutator) {
      mutator(state);
      save();
      emit();
      return state;
    },

    /** 只保存不广播（例如时间偏移等高频项） */
    touch: function () { save(); },

    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },

    /** 恢复演示数据 */
    reset: function () {
      state = seedState();
      save();
      emit();
    },

    /** 导出 / 导入 JSON（分享码基础） */
    exportJSON: function () { return JSON.stringify(state); },
    importJSON: function (str) {
      var obj = JSON.parse(str);
      state = migrate(obj);
      save();
      emit();
    }
  };

  window.App.store = store;
})();
