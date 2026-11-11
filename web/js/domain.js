/* ══════════════════════════════════════════════════════════════
   课序 · Domain —— 时间 / 周次 / 课程 的派生计算
   window.App.D   （纯函数，不读写 DOM，不持久化）
   ══════════════════════════════════════════════════════════════ */
window.App = window.App || {};

(function () {
  'use strict';
  var S = window.App.store;
  var DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  var DAY_SHORT = ['', '一', '二', '三', '四', '五', '六', '日'];
  var DAY_FULL = ['', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

  var weekCache = { key: '', value: 0 };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /** 当前时间（应用内时间，含演示偏移） */
  function now() {
    return new Date(Date.now() + (S.state.settings.timeShift || 0));
  }

  /** 今天 0 点 */
  function today() {
    var d = now(); d.setHours(0, 0, 0, 0); return d;
  }

  /** 把 'HH:MM' 套到某天 → Date */
  function atTime(day, hhmm) {
    var p = String(hhmm).split(':');
    var d = new Date(day);
    d.setHours(+p[0], +p[1], 0, 0);
    return d;
  }

  /** 第 period 节的开始 / 结束时间（今天）；节次数可自定义，越界自动夹到首尾 */
  function periodTime(p) {
    var per = S.state.settings.periods || [];
    var n = per.length || 12;
    var idx = Math.max(0, Math.min(n - 1, p - 1));
    var item = per[idx] || ['08:00', '08:45'];
    return { start: item[0], end: item[1] };
  }

  /** 当前是第几教学周；1 之前返回 <=0，超出返回 >totalWeeks */
  function weekOf(date) {
    var d = date || now();
    var key = S.ymd(d) + '|' + S.state.settings.semesterStart;
    if (weekCache.key === key) return weekCache.value;
    var start = S.startOfDay(new Date(S.state.settings.semesterStart + 'T00:00:00'));
    var diff = Math.floor((S.startOfDay(d) - start) / 86400000);
    var v = Math.floor(diff / 7) + 1;
    weekCache = { key: key, value: v };
    return v;
  }

  /** 第 week 周、weekday(1-7) 的日期 */
  function dateOf(week, weekday) {
    var start = S.startOfDay(new Date(S.state.settings.semesterStart + 'T00:00:00'));
    return S.addDays(start, (week - 1) * 7 + (weekday - 1));
  }

  /** 该课是否在这一周上 */
  function inWeek(course, week) {
    return (course.weeks || []).indexOf(week) !== -1;
  }

  /** 某周某天的课程（按开始小节排序） */
  function coursesOn(week, weekday) {
    return S.state.courses
      .filter(function (c) { return c.weekday === weekday && inWeek(c, week); })
      .sort(function (a, b) { return a.start - b.start; });
  }

  /** 某周全部课程 */
  function coursesInWeek(week) {
    return S.state.courses.filter(function (c) { return inWeek(c, week); });
  }

  /** 今天的课程 */
  function todayCourses() {
    var d = now();
    var wd = d.getDay() || 7;
    return coursesOn(weekOf(d), wd);
  }

  /** 课程在某天的起止 Date */
  function courseSpan(course, day) {
    var t1 = periodTime(course.start);
    var t2 = periodTime(course.start + (course.span || 1) - 1);
    return { start: atTime(day, t1.start), end: atTime(day, t2.end) };
  }

  /**
   * 下一节课（跨天查找，最多往后找 7 天）
   * → { course, start, end, day, daysAhead, minutesUntil, state:'before'|'now' } | null
   */
  function nextCourse(from) {
    var base = from || now();
    for (var d = 0; d <= 7; d++) {
      var day = S.startOfDay(S.addDays(base, d));
      var week = weekOf(day);
      var wd = day.getDay() || 7;
      var list = coursesOn(week, wd);
      for (var i = 0; i < list.length; i++) {
        var span = courseSpan(list[i], day);
        if (span.end > base) {
          var minutesUntil = Math.round((span.start - base) / 60000);
          return {
            course: list[i],
            start: span.start,
            end: span.end,
            day: day,
            daysAhead: d,
            minutesUntil: minutesUntil,
            state: span.start <= base ? 'now' : 'before'
          };
        }
      }
    }
    return null;
  }

  /** 正在上的课 */
  function currentCourse(from) {
    var n = nextCourse(from);
    return n && n.state === 'now' ? n : null;
  }

  /** 今天剩余课程 */
  function remainingToday(from) {
    var base = from || now();
    return todayCourses().filter(function (c) {
      return courseSpan(c, today()).end > base;
    });
  }

  /** 课程的「节次文本」：第1-2节 */
  function periodText(course) {
    return '第' + course.start + '-' + (course.start + (course.span || 1) - 1) + '节';
  }

  /** 课程的时间文本：08:00–09:40 */
  function timeText(course) {
    var a = periodTime(course.start);
    var b = periodTime(course.start + (course.span || 1) - 1);
    return a.start + '–' + b.end;
  }

  /** 周次文本：1-16周 / 1-16周(单) */
  function weeksText(course) {
    var w = (course.weeks || []).slice().sort(function (a, b) { return a - b; });
    if (!w.length) return '未设置周次';
    var all = true;
    for (var i = 1; i < w.length; i++) if (w[i] - w[i - 1] !== 1) { all = false; break; }
    if (!all) return w.join('、') + '周';
    var t = w[0] + '-' + w[w.length - 1] + '周';
    if (w.length > 1) {
      var odd = w.every(function (x) { return x % 2 === 1; });
      var even = w.every(function (x) { return x % 2 === 0; });
      if (odd) t += '（单）';
      else if (even) t += '（双）';
    }
    return t;
  }

  /** x 分钟前/后 → 人类可读 */
  function relText(target, base) {
    var b = base || now();
    var diff = Math.round((new Date(target) - b) / 60000);
    var abs = Math.abs(diff);
    if (abs < 1) return '现在';
    var unit, n;
    if (abs < 60) { unit = '分钟'; n = abs; }
    else if (abs < 1440) { unit = '小时'; n = Math.round(abs / 60 * 10) / 10; }
    else { unit = '天'; n = Math.round(abs / 1440 * 10) / 10; }
    return diff > 0 ? n + ' ' + unit + '后' : n + ' ' + unit + '前';
  }

  /** 倒计时文本：01:23:45 */
  function countdown(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h > 0 ? h + ':' + pad(m) : pad(m)) + ':' + pad(sec);
  }

  /** 待办是否过期 */
  function isOverdue(todo) {
    return !todo.done && new Date(todo.due) < now();
  }

  /** 待办分组：今天 / 明天 / 本周 / 以后 / 已逾期 */
  function todoBucket(todo) {
    var d = new Date(todo.due);
    var a = S.startOfDay(d), t = S.startOfDay(now());
    var diff = Math.round((a - t) / 86400000);
    if (todo.done) return 'done';
    if (diff < 0) return 'overdue';
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff <= 7) return 'week';
    return 'later';
  }

  /** 专注统计：最近 n 天每天分钟数 + 总计 */
  function focusSeries(days) {
    var out = [];
    var end = S.startOfDay(now());
    for (var i = days - 1; i >= 0; i--) {
      var day = S.addDays(end, -i);
      var key = S.ymd(day);
      var min = 0, count = 0;
      S.state.focus.forEach(function (f) {
        if (S.ymd(new Date(f.start)) === key) { min += f.minutes; count++; }
      });
      out.push({ date: day, key: key, minutes: min, count: count });
    }
    return out;
  }

  function todayFocus() {
    var s = focusSeries(1)[0];
    return s || { minutes: 0, count: 0 };
  }

  /* ── 提醒相关 ─────────────────────────────────────────── */

  /** 某个时刻是否落在「免打扰时段」内（支持跨零点，如 23:00–07:00） */
  function inQuiet(ms, settings) {
    var st = settings || S.state.settings;
    if (!st.quietOn) return false;
    var from = String(st.quietFrom || '23:00');
    var to = String(st.quietTo || '07:00');
    var d = new Date(ms);
    var cur = d.getHours() * 60 + d.getMinutes();
    var a = Number(from.split(':')[0]) * 60 + Number(from.split(':')[1] || 0);
    var b = Number(to.split(':')[0]) * 60 + Number(to.split(':')[1] || 0);
    if (isNaN(a) || isNaN(b)) return false;
    if (a === b) return false;
    return a < b ? (cur >= a && cur < b) : (cur >= a || cur < b);   // 跨零点
  }

  window.App.D = {
    DAY_NAMES: DAY_NAMES,
    DAY_SHORT: DAY_SHORT,
    DAY_FULL: DAY_FULL,
    pad: pad,
    now: now,
    today: today,
    atTime: atTime,
    periodTime: periodTime,
    weekOf: weekOf,
    dateOf: dateOf,
    inWeek: inWeek,
    coursesOn: coursesOn,
    coursesInWeek: coursesInWeek,
    todayCourses: todayCourses,
    courseSpan: courseSpan,
    nextCourse: nextCourse,
    currentCourse: currentCourse,
    remainingToday: remainingToday,
    periodText: periodText,
    timeText: timeText,
    weeksText: weeksText,
    relText: relText,
    countdown: countdown,
    isOverdue: isOverdue,
    todoBucket: todoBucket,
    focusSeries: focusSeries,
    todayFocus: todayFocus,
    inQuiet: inQuiet
  };
})();
