/* ══════════════════════════════════════════════════════════════
   课序 · OCR 文本 → 课程 解析器（纯函数，可单测）
   由 web-native 实现。输入是 ML Kit 返回的行数据（坐标为 0–1 归一化）：

   lines = [{ text: '高等数学（上）', x: 0.12, y: 0.31, w: 0.22, h: 0.05, size: 42 }, ...]

   算法（务实优先，宁可少识别也不乱塞）：
     1. 找表头：周一到周日 / 星期一到星期日 / 单字「一…日」，按 y 聚成一行，
        至少 4 个不同的星期几才算表头可信；它们的 x 中心就是列坐标。
     2. 找节次行：左侧「1-2节 / 第3节 / 08:00」这类文字，取其 y 得到行界；
        认出 2 条以上才用，否则退回「表头以下按 12 等分」的估算（note 里标明）。
     3. 归格：非表头、非节次的文本块按 x 中心落列、y 中心落行。
     4. 同格多块：面积最大的作课程名，其余较短的块尝试当教室 / 教师。
     5. 同一门课出现在相邻节次 → 合并 span。

   输出：
   { ok: true, courses: [{ name, room, teacher, weekday, start, span, weeks, tone, credit, note }],
     note: '...',     // 给用户看的识别摘要
     unmatched: [] }  // 没归入任何课格的文本，供人工兜底
   ══════════════════════════════════════════════════════════════ */
window.App = window.App || {};

(function () {
  'use strict';

  var PERIOD_MAX = 12;      // 课序最多 12 节
  var TONE_N = 8;           // 8 色课程色板
  var MIN_WEEKS = 1;
  var MAX_WEEKS = 30;

  /* 周几：一~日 / 1~7 / 天 */
  var WEEK_CH = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7
  };
  var RE_WEEK = /(?:周|星期|礼拜)\s*([一二三四五六日天1-7])/;

  var CN_NUM = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
    '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12
  };

  /* 节次：1-2节 / 第3节 / 第一节 / 08:00 / 08:00-09:35 */
  var RE_RANGE = /^第?(\d{1,2})\s*[-–—~～至到]\s*(\d{1,2})\s*(?:大)?[节課课]?$/;
  var RE_SINGLE = /^第?(\d{1,2})\s*[节課课]$/;
  var RE_PLAIN = /^(\d{1,2})$/;
  var RE_TIME = /^(\d{1,2})\s*[:：]\s*(\d{2})(?:\s*[-–—~～至到]\s*(\d{1,2})\s*[:：]\s*(\d{2}))?$/;
  var RE_CN_PERIOD = /^第?([一二三四五六七八九十]{1,2})(?:大)?[节課课]$/;

  /* 页眉页脚 / 表头杂项，不算课程名 */
  var RE_JUNK = /(导出时间|打印时间|打印日期|制表|共\s*\d+\s*页|第\s*\d+\s*页|学号|姓名|教务系统|课表导出|该图仅用于|学生课表|班级|专业|学期)/;

  /* ── 小工具 ──────────────────────────────────────────────── */
  function num(v, dft) {
    var n = Number(v);
    return isFinite(n) ? n : dft;
  }

  function clean(t) {
    return String(t == null ? '' : t)
      .replace(/[\u00a0\u3000]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function median(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    if (!a.length) return 0;
    return a[Math.floor(a.length / 2)];
  }

  function clampPeriod(n) {
    return Math.max(1, Math.min(PERIOD_MAX, Math.round(n)));
  }

  /* 中文字宽当 1，西文/数字当 0.55，用来估算缺失的 w */
  function textWeight(t) {
    var w = 0;
    for (var i = 0; i < t.length; i++) {
      w += /[^\x00-\xff]/.test(t.charAt(i)) ? 1 : 0.55;
    }
    return Math.max(w, 1);
  }

  /* 行数据规范化：补齐缺失的 w / h，统一成左上角 + 中心点 */
  function normLines(raw, W, H) {
    var out = [];
    (raw || []).forEach(function (ln) {
      if (!ln) return;
      var text = clean(ln.text);
      if (!text) return;
      var x = num(ln.x, NaN);
      var y = num(ln.y, NaN);
      if (!isFinite(x) || !isFinite(y)) return;

      var w = num(ln.w, -1);
      var h = num(ln.h, -1);
      var size = num(ln.size, 0);
      if (size <= 0) size = h > 0 ? h * H : 0.026 * H;
      if (w <= 0) w = Math.min(1, (textWeight(text) * size) / (W || 900));
      if (h <= 0) h = Math.min(0.2, size / (H || 900));

      x = Math.max(-0.02, Math.min(1.02, x));
      y = Math.max(-0.02, Math.min(1.02, y));
      out.push({
        text: text, x: x, y: y, w: w, h: h, size: size,
        cx: x + w / 2, cy: y + h / 2
      });
    });
    return out;
  }

  /* 节次 / 时间标记的文本形态（不关心 x） */
  function markOf(text, cx, leftLimit) {
    var t = String(text).replace(/\s+/g, '');
    if (!t || t.length > 14) return null;
    var m;
    if ((m = RE_RANGE.exec(t))) {
      var a = +m[1], b = +m[2];
      if (a >= 1 && a <= PERIOD_MAX && b >= a && b <= PERIOD_MAX) return { kind: 'period', a: a, b: b };
      return null;
    }
    if ((m = RE_CN_PERIOD.exec(t))) {
      var cn = CN_NUM[m[1]];
      if (cn) return { kind: 'period', a: cn, b: cn };
      return null;
    }
    if ((m = RE_SINGLE.exec(t))) {
      var s = +m[1];
      if (s >= 1 && s <= PERIOD_MAX) return { kind: 'period', a: s, b: s };
      return null;
    }
    if (RE_TIME.test(t)) return { kind: 'time' };
    /* 纯数字只在左侧时间列里才当节次，避免把教室号 / 页码当节次 */
    if (cx < leftLimit && (m = RE_PLAIN.exec(t))) {
      var p = +m[1];
      if (p >= 1 && p <= PERIOD_MAX) return { kind: 'period', a: p, b: p };
    }
    return null;
  }

  function roomLike(t) {
    var s = clean(t).replace(/\s+/g, '');
    if (!s || s.length > 16) return false;
    if (/[楼室馆栋厅场区]/.test(s)) return true;              // 教学楼 / 201室
    if (/[-－—_]\s*[A-Za-z]?\d{2,4}$/.test(s)) return true;   // 教四-201
    if (/^[A-Za-z]?\d{2,4}[A-Za-z]?$/.test(s)) return true;   // 201 / A305
    if (/中心|机房|实验室|阶梯|多媒体|报告厅/.test(s)) return true;
    return false;
  }

  function teacherLike(t) {
    var s = clean(t);
    if (!/^[\u4e00-\u9fa5·]{2,4}$/.test(s)) return false;
    if (/[课班组建系院大学的室楼馆节周]/.test(s)) return false;
    return true;
  }

  function nameCandidate(t) {
    var s = clean(t);
    if (s.length < 2 || s.length > 24) return false;
    if (RE_JUNK.test(s)) return false;
    if (RE_WEEK.test(s)) return false;
    if (/^[\d\s\-–—~～:：.,，。·/()（）\[\]【】]+$/.test(s)) return false;
    if (roomLike(s)) return false;
    if (markOf(s, 0.5, 1)) return false;
    return true;
  }

  /* 「高等数学 教四-201」这种被 OCR 连成一行的情况，拆开 */
  function splitRoomAndName(t) {
    var parts = clean(t).split(' ');
    if (parts.length !== 2) return null;
    if (roomLike(parts[0]) && nameCandidate(parts[1])) return { name: parts[1], room: parts[0] };
    if (roomLike(parts[1]) && nameCandidate(parts[0])) return { name: parts[0], room: parts[1] };
    return null;
  }

  function toneOf(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 131 + name.charCodeAt(i)) % 100000;
    return (h % TONE_N) + 1;
  }

  function clampWeeks(n) {
    return Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, Math.round(num(n, 20))));
  }

  function weekList(n) {
    var total = clampWeeks(n);
    var a = [];
    for (var i = 1; i <= total; i++) a.push(i);
    return a;
  }

  function normName(s) {
    return clean(s).replace(/[\s（）()·,，.。]/g, '');
  }

  /* ── 1. 表头（星期行） ───────────────────────────────────── */
  function findHeader(lines) {
    var explicit = [];
    var singles = [];
    lines.forEach(function (ln) {
      if (ln.text.length > 14) return;
      var m = RE_WEEK.exec(ln.text);
      if (m && WEEK_CH[m[1]]) {
        explicit.push({ wd: WEEK_CH[m[1]], ln: ln });
        return;
      }
      if (ln.text.length === 1 && WEEK_CH[ln.text]) singles.push({ wd: WEEK_CH[ln.text], ln: ln });
    });

    /* 显式的「周X」不够 4 个时，才用单字表头兜底 */
    var cands = explicit.length >= 4 ? explicit : explicit.concat(singles);
    if (cands.length < 4) return null;

    /* 按 y 聚行（同一行表头的 cy 基本一致） */
    cands.sort(function (a, b) { return a.ln.cy - b.ln.cy; });
    var groups = [];
    cands.forEach(function (c) {
      var g = groups[groups.length - 1];
      var h = c.ln.h || 0.02;
      if (g && Math.abs(c.ln.cy - g.cy) <= 0.03 + Math.max(g.h, h) * 0.5) {
        g.items.push(c);
        g.cy = (g.cy * (g.items.length - 1) + c.ln.cy) / g.items.length;
        g.h = Math.max(g.h, h);
      } else {
        groups.push({ cy: c.ln.cy, h: h, items: [c] });
      }
    });

    /* 取「不同星期几最多」的那一行 */
    var best = null;
    var bestScore = -Infinity;
    groups.forEach(function (g) {
      var byWd = {};
      g.items.forEach(function (it) {
        if (!byWd[it.wd] || it.ln.w * it.ln.h > byWd[it.wd].w * byWd[it.wd].h) byWd[it.wd] = it.ln;
      });
      var distinct = Object.keys(byWd).length;
      if (distinct < 4) return;
      var score = distinct * 1000 + g.items.length * 10 - g.cy * 100;
      if (score > bestScore) { bestScore = score; best = { group: g, byWd: byWd }; }
    });
    if (!best) return null;

    var cols = Object.keys(best.byWd).map(function (k) {
      var ln = best.byWd[k];
      return { wd: +k, cx: ln.cx, ln: ln };
    }).sort(function (a, b) { return a.cx - b.cx; });
    if (cols.length < 4) return null;

    var diffs = [];
    for (var i = 1; i < cols.length; i++) diffs.push(cols[i].cx - cols[i - 1].cx);
    var spacing = median(diffs);
    if (spacing < 0.03) return null;

    /* 表头漏认（比如周五没认出来）时，按「星期差 × 列宽」把中间的列补回来，
       免得旁边那一列的课被吸过来，星期几全错。 */
    var ratios = [];
    for (var k = 1; k < cols.length; k++) {
      var dw = cols[k].wd - cols[k - 1].wd;
      var dx = cols[k].cx - cols[k - 1].cx;
      if (dw > 0) ratios.push(dx / dw);
    }
    var unit = ratios.length ? median(ratios) : spacing;
    if (unit > 0.03) spacing = unit;

    var firstW = cols[0].wd;
    var lastW = cols[cols.length - 1].wd;
    var anchorX = cols[0].cx;
    var observed = {};
    cols.forEach(function (c) { observed[c.wd] = c; });
    var lo = Math.max(1, firstW - 2);
    var hi = Math.min(7, lastW + 2);
    var full = [];
    for (var w = lo; w <= hi; w++) {
      if (observed[w]) { full.push(observed[w]); continue; }
      var predicted = anchorX + (w - firstW) * spacing;
      if (predicted < 0.02 || predicted > 0.98) continue;
      full.push({ wd: w, cx: predicted, inferred: true });
    }
    /* 至少保留原来认出来的列 */
    if (full.length < cols.length) return null;
    cols = full.sort(function (a, b) { return a.cx - b.cx; });

    var bottom = 0;
    best.group.items.forEach(function (it) {
      bottom = Math.max(bottom, it.ln.y + it.ln.h);
    });
    if (!(bottom > 0)) bottom = best.group.cy + best.group.h * 0.5;

    return { cols: cols, spacing: spacing, bottom: bottom, cy: best.group.cy };
  }

  /* ── 2. 节次行 → 行区间 ──────────────────────────────────── */
  function findMarks(lines, header) {
    var leftLimit = header.cols[0].cx - header.spacing * 0.5;
    var periods = [];
    var times = [];
    lines.forEach(function (ln) {
      if (ln.cy < header.bottom - 0.015) return;          // 表头之上
      if (RE_WEEK.test(ln.text)) return;                  // 星期文本不是节次
      var mk = markOf(ln.text, ln.cx, leftLimit);
      if (!mk) return;
      if (mk.kind === 'period') periods.push({ cy: ln.cy, a: mk.a, b: mk.b });
      else times.push({ cy: ln.cy });
    });
    return { periods: dedupe(periods), times: dedupe(times) };
  }

  function dedupe(marks) {
    var out = [];
    marks.forEach(function (m) {
      var dup = out.some(function (o) {
        return Math.abs(o.cy - m.cy) < 0.012 && o.a === m.a && o.b === m.b;
      });
      if (!dup) out.push(m);
    });
    return out;
  }

  function bandsFromPeriods(marks, contentTop) {
    if (marks.length < 2) return null;
    var ms = marks.slice().sort(function (a, b) { return a.cy - b.cy; });
    var gaps = [];
    for (var i = 1; i < ms.length; i++) gaps.push(ms[i].cy - ms[i - 1].cy);
    var gap = median(gaps) || 0.08;
    if (gap < 0.01) return null;

    var bands = [];
    for (var j = 0; j < ms.length; j++) {
      var top = j === 0
        ? Math.max(contentTop, ms[0].cy - gap * 0.5)
        : (ms[j - 1].cy + ms[j].cy) / 2;
      var bottom = j === ms.length - 1
        ? Math.min(1.01, ms[j].cy + gap * 0.5)
        : (ms[j].cy + ms[j + 1].cy) / 2;
      var a = ms[j].a;
      var b = Math.max(ms[j].a, ms[j].b);
      bands.push({
        top: top, bottom: bottom, start: a,
        span: Math.max(1, Math.min(b - a + 1, PERIOD_MAX - a + 1))
      });
    }
    return { bands: bands, estimated: false };
  }

  /* 只有时间行（08:00 之类）时：当成 2 节/行；时间行很多（>=7）才当成 1 节/行 */
  function bandsFromTimes(marks, contentTop) {
    if (marks.length < 2) return null;
    var sorted = marks.slice().sort(function (a, b) { return a.cy - b.cy; });
    var groups = [];
    sorted.forEach(function (m) {
      var g = groups[groups.length - 1];
      if (g && Math.abs(m.cy - g.cy) <= 0.018) {
        g.cy = (g.cy * g.items + m.cy) / (g.items + 1);
        g.items++;
      } else {
        groups.push({ cy: m.cy, items: 1 });
      }
    });
    if (groups.length < 2) return null;

    var step = groups.length >= 7 ? 1 : 2;
    var gaps = [];
    for (var i = 1; i < groups.length; i++) gaps.push(groups[i].cy - groups[i - 1].cy);
    var gap = median(gaps) || 0.06;

    var bands = [];
    for (var j = 0; j < groups.length; j++) {
      var top = j === 0
        ? Math.max(contentTop, groups[0].cy - gap * 0.5)
        : (groups[j - 1].cy + groups[j].cy) / 2;
      var bottom = j === groups.length - 1
        ? Math.min(1.01, groups[j].cy + gap * 0.5)
        : (groups[j].cy + groups[j + 1].cy) / 2;
      var start = j * step + 1;
      bands.push({ top: top, bottom: bottom, start: start, span: Math.min(step, PERIOD_MAX - start + 1) });
    }
    return { bands: bands, estimated: true };
  }

  function bandsFallback(contentTop) {
    var top = Math.max(0, Math.min(0.85, contentTop));
    var range = Math.max(0.2, 1 - top);
    var bands = [];
    for (var i = 0; i < PERIOD_MAX; i++) {
      bands.push({
        top: top + range * i / PERIOD_MAX,
        bottom: top + range * (i + 1) / PERIOD_MAX,
        start: i + 1,
        span: 1
      });
    }
    return { bands: bands, estimated: true };
  }

  function bandAt(cy, bands) {
    for (var i = 0; i < bands.length; i++) {
      if (cy >= bands[i].top && cy < bands[i].bottom) return bands[i];
    }
    return null;
  }

  function nearestColumn(cx, cols, spacing) {
    var bi = -1;
    var bd = Infinity;
    for (var i = 0; i < cols.length; i++) {
      var d = Math.abs(cx - cols[i].cx);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0 || bd > spacing * 0.72) return -1;
    return bi;
  }

  /* ── 3. 一格 → 一门课 ────────────────────────────────────── */
  function courseFromCell(cell, totalWeeks, pushUnmatched) {
    var ls = cell.lines.slice().sort(function (a, b) {
      var aa = a.w * a.h, bb = b.w * b.h;
      if (Math.abs(bb - aa) > 1e-9) return bb - aa;
      return (b.size || 0) - (a.size || 0);
    });

    var name = '';
    var room = '';
    var teacher = '';
    var others = [];

    ls.forEach(function (ln) {
      var t = clean(ln.text);
      if (!t) return;
      if (!name) {
        if (nameCandidate(t)) { name = t; return; }
        var sp = splitRoomAndName(t);
        if (sp) {
          name = sp.name;
          if (!room) room = sp.room;
          return;
        }
      }
      others.push(t);
    });

    if (!name) {
      ls.forEach(function (ln) { pushUnmatched(ln.text); });
      return null;
    }

    others.forEach(function (t) {
      if (!room && roomLike(t)) { room = t; return; }
      if (!teacher && teacherLike(t)) { teacher = t; return; }
      if (roomLike(t)) return;              // 多出来的房间号，忽略
      pushUnmatched(t);
    });

    return {
      name: name,
      teacher: teacher,
      room: room,
      tone: toneOf(name),
      weekday: cell.weekday,
      start: cell.band.start,
      span: cell.band.span,
      weeks: weekList(totalWeeks),
      credit: 0,
      note: ''
    };
  }

  function roomCompatible(a, b) {
    if (!a || !b) return true;
    return normName(a) === normName(b);
  }

  /* 相邻节次的同一门课 → 合并 span（例如 1-2 节和 3-4 节都是「高等数学」） */
  function mergeCourses(list) {
    var sorted = list.slice().sort(function (a, b) {
      return a.weekday - b.weekday || a.start - b.start;
    });
    var out = [];
    var merged = 0;
    var seen = {};
    sorted.forEach(function (c) {
      var key = c.weekday + '|' + c.start + '|' + normName(c.name);
      if (seen[key]) return;
      seen[key] = 1;
      var prev = out[out.length - 1];
      if (prev &&
          prev.weekday === c.weekday &&
          prev.start + prev.span === c.start &&
          normName(prev.name) === normName(c.name) &&
          roomCompatible(prev.room, c.room)) {
        prev.span = Math.min(PERIOD_MAX - prev.start + 1, prev.span + c.span);
        if (!prev.room && c.room) prev.room = c.room;
        if (!prev.teacher && c.teacher) prev.teacher = c.teacher;
        merged++;
        return;
      }
      out.push(c);
    });
    return { list: out, merged: merged };
  }

  function dayText(courses) {
    var seen = {};
    courses.forEach(function (c) { seen[c.weekday] = 1; });
    var days = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    var names = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    if (days.length >= 4 && days[days.length - 1] - days[0] === days.length - 1) {
      return names[days[0]] + '~' + names[days[days.length - 1]];
    }
    return days.map(function (d) { return names[d]; }).join('、');
  }

  /* ── 对外入口 ───────────────────────────────────────────── */
  function parse(ocrResult, opts) {
    opts = opts || {};
    var totalWeeks = clampWeeks(Number(opts.totalWeeks) || 20);

    var W = num(ocrResult && ocrResult.width, 900);
    var H = num(ocrResult && ocrResult.height, 900);
    var rawLines = ocrResult && Array.isArray(ocrResult.lines) ? ocrResult.lines : [];
    var lines = normLines(rawLines, W, H);

    if (!lines.length) {
      return {
        ok: false,
        courses: [],
        note: '图片里没读到文字，可能太暗或太糊。换个光线重拍，或改用手动添加。',
        unmatched: []
      };
    }

    var header = findHeader(lines);
    if (!header) {
      var raw = [];
      lines.forEach(function (ln) {
        if (raw.indexOf(ln.text) < 0 && raw.length < 60) raw.push(ln.text);
      });
      return {
        ok: false,
        courses: [],
        note: '没认出星期表头（要能看清「周一 / 星期一」那一排）。把整张课表拍正、拍清楚一点，或者改用手动添加。',
        unmatched: raw
      };
    }

    var contentTop = header.bottom + 0.004;
    var leftLimit = header.cols[0].cx - header.spacing * 0.5;
    var marks = findMarks(lines, header);

    var plan = bandsFromPeriods(marks.periods, contentTop) ||
      bandsFromTimes(marks.times, contentTop) ||
      bandsFallback(contentTop);
    plan.bands.forEach(function (b, i) { b.idx = i; });

    var cells = [];
    var cellMap = {};
    var unmatched = [];
    function pushUnmatched(t) {
      var s = clean(t);
      if (!s) return;
      if (unmatched.indexOf(s) >= 0) return;
      if (unmatched.length >= 60) return;
      unmatched.push(s);
    }

    lines.forEach(function (ln) {
      if (ln.cy < contentTop - 0.008) return;             // 表头及以上
      if (RE_WEEK.test(ln.text)) return;                  // 星期文本
      if (markOf(ln.text, ln.cx, leftLimit)) return;      // 节次 / 时间标签
      if (ln.cx < leftLimit) { pushUnmatched(ln.text); return; }   // 左侧时间列
      if (ln.w > header.spacing * 1.5) { pushUnmatched(ln.text); return; }  // 跨列大块
      if (ln.text.length > 24) { pushUnmatched(ln.text); return; }
      var ci = nearestColumn(ln.cx, header.cols, header.spacing);
      var band = bandAt(ln.cy, plan.bands);
      if (ci < 0 || !band) { pushUnmatched(ln.text); return; }
      var key = ci + '|' + band.idx;
      var cell = cellMap[key];
      if (!cell) {
        cell = cellMap[key] = { weekday: header.cols[ci].wd, band: band, lines: [] };
        cells.push(cell);
      }
      cell.lines.push(ln);
    });

    var raw2 = [];
    cells.forEach(function (cell) {
      var c = courseFromCell(cell, totalWeeks, pushUnmatched);
      if (c) raw2.push(c);
    });

    /* 太多格子一定是噪声，保守截断 */
    if (raw2.length > 60) raw2 = raw2.slice(0, 60);
    var merged = mergeCourses(raw2);
    var courses = merged.list;

    var ok = courses.length >= 2;
    var note;
    if (!ok) {
      if (!courses.length) {
        note = '认出了星期表头，但没找到能归格的课程名。可能是文字太小或表格线太乱，建议换个角度重拍，或改用手动添加。';
      } else {
        note = '只认出 1 门课程，不太可信。建议改用「手动添加」，或者拍得更清楚一点。';
      }
      /* 失败时把原始文本都交出去，方便人工兜底 */
      lines.forEach(function (ln) { pushUnmatched(ln.text); });
    } else {
      note = '识别到 ' + courses.length + ' 门课程 · ' + dayText(courses);
      if (plan.estimated) note += ' · 节次按网格估算，请重点核对节次';
      if (merged.merged) note += ' · 合并了 ' + merged.merged + ' 处相邻节次';
    }

    return { ok: ok, courses: courses, note: note, unmatched: unmatched };
  }

  window.App.OcrParse = {
    /**
     * @param {{width:number,height:number,lines:Array}} ocrResult
     * @param {{totalWeeks:number}} opts
     * @returns {{ok:boolean,courses:Array,note:string,unmatched:Array}}
     */
    parse: parse
  };
})();
