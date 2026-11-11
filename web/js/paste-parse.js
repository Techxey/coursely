/* ══════════════════════════════════════════════════════════════
   课序 · 粘贴导入解析器（纯函数，无 DOM、无网络）
   输入是「文本」而不是图片 —— 文本无损，所以这里只做版面重建，
   不像 OCR 那样还要跟像素噪声搏斗。

   支持三种来源：
   1. 教务系统网页课表「长按全选复制」→ 制表符/空格分隔的表格文本
   2. Excel 里复制课表 → TSV
   3. 手写一行一门：高等数学,周一,1,2,教四-201

   window.App.PasteParse.parse(text, { totalWeeks, periods })
   ══════════════════════════════════════════════════════════════ */
window.App = window.App || {};

(function () {
  'use strict';

  var DAY_CHARS = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7, '七': 7 };

  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/\u00a0/g, ' ')
      .replace(/\u3000/g, ' ')
      .replace(/\r/g, '')
      .trim();
  }

  /** 按 tab / 2+ 空格 / 竖线切单元格（覆盖 TSV、空格对齐、Excel、Markdown 表） */
  function splitCells(line) {
    var t = norm(line);
    if (!t) return null;
    if (t.indexOf('\t') !== -1) return t.split('\t').map(norm);
    if (/\s{2,}/.test(t)) return t.split(/\s{2,}/).map(norm);
    if (t.indexOf('|') !== -1) return t.split('|').map(norm).filter(function (x, i, a) {
      return !(x === '' && (i === 0 || i === a.length - 1));
    });
    return null;
  }

  /** 周几 → 1..7；不是周几返回 0 */
  function parseDay(text) {
    var t = norm(text);
    var m = t.match(/^(?:周|星期|礼拜)\s*([一二三四五六日天七])$/);
    if (m) return DAY_CHARS[m[1]];
    m = t.match(/^(?:周|星期|礼拜)\s*([1-7])$/);
    if (m) return Number(m[1]);
    m = t.match(/^星期([一二三四五六日天])/);
    if (m) return DAY_CHARS[m[1]];
    return 0;
  }

  function toMin(hhmm) {
    var a = String(hhmm).split(':');
    return (Number(a[0]) || 0) * 60 + (Number(a[1]) || 0);
  }

  /**
   * 解析「第几节」单元格
   * 支持：1-2节 / 第1-2节 / 1~2 / 第3节 / 3 / 08:00-09:40
   */
  function parsePeriodCell(text, periods) {
    var t = norm(text);
    if (!t) return null;
    if (/周/.test(t)) return null;      // 「1-16周」是周次，不是节次，别抢

    var m = t.match(/(?:第\s*)?(\d{1,2})\s*[-–—~至到]\s*(\d{1,2})\s*节?/);
    if (m) {
      var a = Number(m[1]), b = Number(m[2]);
      if (a >= 1 && b >= a && b <= 20) return { start: a, span: b - a + 1 };
    }
    m = t.match(/第\s*(\d{1,2})\s*节/);
    if (m) return { start: Number(m[1]), span: 1 };
    m = t.match(/^(\d{1,2})\s*节?$/);
    if (m) return { start: Number(m[1]), span: 1 };

    // 时间区间 → 反查节次
    m = t.match(/(\d{1,2}:\d{2})\s*[-–—~至到]\s*(\d{1,2}:\d{2})/);
    if (m && Array.isArray(periods) && periods.length) {
      var s = toMin(m[1]), e = toMin(m[2]);
      var startIdx = -1, endIdx = -1;
      periods.forEach(function (p, i) {
        if (toMin(p[0]) === s) startIdx = i;
        if (toMin(p[1]) === e) endIdx = i;
      });
      if (startIdx < 0) {
        // 容错：找最接近的那节
        var best = Infinity;
        periods.forEach(function (p, i) {
          var d = Math.abs(toMin(p[0]) - s);
          if (d < best) { best = d; startIdx = i; }
        });
      }
      if (endIdx < 0) endIdx = startIdx;
      if (startIdx >= 0) return { start: startIdx + 1, span: Math.max(1, endIdx - startIdx + 1) };
    }
    return null;
  }

  /** 解析周次：1-16周 / 1-16周(单) / 第3-15周双 / 1,3,5周 */
  function parseWeeks(text, totalWeeks) {
    var t = norm(text);
    if (!t) return null;
    var parity = 0;                       // 0 全部 / 1 单 / 2 双
    if (/单周|单\)|（单）|\(单\)/.test(t)) parity = 1;
    if (/双周|双\)|（双）|\(双\)/.test(t)) parity = 2;

    var m = t.match(/(\d{1,2})\s*[-–—~至到]\s*(\d{1,2})\s*周?/);
    if (m) {
      var from = Number(m[1]), to = Number(m[2]);
      if (from >= 1 && to >= from) return makeWeeks(from, to, parity, totalWeeks);
    }
    var list = t.match(/\d{1,2}(?:\s*[,，、]\s*\d{1,2})+/);
    if (list) {
      var ws = list[0].split(/[,，、]/).map(function (x) { return Number(norm(x)); })
        .filter(function (n) { return n >= 1 && n <= 30; });
      if (ws.length) return dedupe(ws);
    }
    return null;
  }

  function makeWeeks(from, to, parity, totalWeeks) {
    var cap = Math.max(30, Number(totalWeeks) || 20);
    var out = [];
    for (var w = from; w <= Math.min(to, cap); w++) {
      if (parity === 1 && w % 2 === 0) continue;
      if (parity === 2 && w % 2 === 1) continue;
      out.push(w);
    }
    return out;
  }

  function dedupe(arr) {
    var seen = {};
    return arr.filter(function (x) {
      if (seen[x]) return false;
      seen[x] = 1;
      return true;
    }).sort(function (a, b) { return a - b; });
  }

  /* ── 从一段单元格文字里拆出：课程名 / 教室 / 教师 / 周次 ── */
  var WEEK_HINT = /周/;
  var TEACHER_HINT = /^[\u4e00-\u9fa5]{2,4}$/;

  /** 教室判断：必须有数字，且带楼/室/馆/厅/场/实验等字样（避免把「数据结构实验」当教室） */
  function looksLikeRoom(s) {
    if (!s) return false;
    if (/\d/.test(s) && /(教|楼|室|馆|厅|场|中心|机房|实验)/.test(s) && s.length <= 14) return true;
    if (/^[A-Za-z]?\d{2,4}[A-Za-z]?$/.test(s)) return true;
    return false;
  }
  function looksLikeWeek(s) { return WEEK_HINT.test(s) && /\d/.test(s); }
  function looksLikeTeacher(s) { return TEACHER_HINT.test(s); }

  /**
   * 拆分一格的内容（可能是「名称 教师 教室 1-16周」被合并成一行）
   * 顺序很重要：先摘周次/教室，剩下的最长片段才是课程名，最后再从残余里找教师。
   * @returns {{name:string, room:string, teacher:string, weeks:number[]|null, note:string}}
   */
  function splitCellInfo(raw, totalWeeks) {
    var text = norm(raw);
    var out = { name: '', room: '', teacher: '', weeks: null, note: '' };
    if (!text) return out;

    var weeks = /周/.test(text) ? parseWeeks(text, totalWeeks) : null;

    var parts = text
      .split(/[\n\r]|[\s]{2,}|[;；]|(?:\s*[\/|]\s*)/)
      .map(norm)
      .filter(Boolean);
    if (parts.length <= 1) {
      var single = text.split(/\s+/).map(norm).filter(Boolean);
      if (single.length > 1) parts = single;
    }

    var rest = [];
    parts.forEach(function (p) {
      if (/周/.test(p) && /\d/.test(p)) return;          // 周次片段
      if (looksLikeRoom(p)) { if (!out.room) out.room = p; return; }
      rest.push(p);
    });

    // 名字 = 最长片段；教师 = 另一段 2–4 汉字
    rest.sort(function (a, b) { return b.length - a.length; });
    out.name = (rest.shift() || text).replace(/[（(]\s*[单双]\s*[)）]/g, '').trim();
    for (var i = 0; i < rest.length; i++) {
      if (looksLikeTeacher(rest[i])) { out.teacher = rest[i]; break; }
    }

    // 兜底：名字里还粘着教室时，按空格剥一下
    if (!out.room) {
      var m = out.name.match(/^(.*?)\s+([\u4e00-\u9fa5A-Za-z]{0,6}[-\d][^\s]*)$/);
      if (m && looksLikeRoom(m[2])) { out.name = m[1].trim(); out.room = m[2].trim(); }
    }

    out.weeks = weeks;
    if (!out.name) out.name = text;
    return out;
  }

  /* ── 模式 1：表格 ─────────────────────────────────────────── */
  function parseTable(lines, opts) {
    var courses = [];
    var unmatched = [];

    // 找表头行：至少出现 3 个「周X」
    var headerIdx = -1, headerCells = null, colDay = {}, offset = 0;
    for (var i = 0; i < lines.length; i++) {
      var cells = splitCells(lines[i]);
      if (!cells) continue;
      var hits = cells.filter(function (c) { return parseDay(c) > 0; }).length;
      if (hits >= 3) {
        headerIdx = i; headerCells = cells;
        var firstDayCell = -1;
        cells.forEach(function (c, j) {
          var d = parseDay(c);
          if (d) { colDay[j] = d; if (firstDayCell < 0) firstDayCell = j; }
        });
        offset = Math.max(0, firstDayCell);
        break;
      }
    }
    if (headerIdx < 0 || !headerCells) return null;

    for (var k = headerIdx + 1; k < lines.length; k++) {
      var row = splitCells(lines[k]);
      if (!row) { if (norm(lines[k])) unmatched.push(norm(lines[k])); continue; }

      // 这一行是不是又一行表头 / 星期行？跳过
      if (row.filter(function (c) { return parseDay(c) > 0; }).length >= 3) continue;

      // 节次：优先看前 offset 个单元格
      var per = null, perCellText = '';
      for (var c0 = 0; c0 < Math.max(1, offset); c0++) {
        var cand = row[c0];
        if (!cand) continue;
        var p = parsePeriodCell(cand, opts.periods);
        if (p) { per = p; perCellText = cand; break; }
      }
      if (!per) {
        // 也允许「节次」在最后一列 / 单独一行
        for (var c1 = row.length - 1; c1 >= offset; c1--) {
          var p2 = parsePeriodCell(row[c1], opts.periods);
          if (p2 && !parseDay(row[c1])) { per = p2; perCellText = row[c1]; break; }
        }
      }

      for (var j = offset; j < row.length; j++) {
        var day = colDay[j];
        if (!day) continue;
        var cell = norm(row[j]);
        if (!cell) continue;
        if (!per) { unmatched.push(cell); continue; }
        var info = splitCellInfo(cell, opts.totalWeeks);
        if (!info.name) { unmatched.push(cell); continue; }
        courses.push({
          name: info.name,
          teacher: info.teacher,
          room: info.room,
          weekday: day,
          start: per.start,
          span: per.span,
          weeks: info.weeks || makeWeeks(1, opts.totalWeeks, 0, opts.totalWeeks),
          note: ''
        });
      }
      if (!per && row.length > offset) {
        // 节次没解析出来，但格子有内容 → 记入未匹配，便于提示
      }
    }
    return courses.length ? { courses: courses, unmatched: unmatched } : null;
  }

  /* ── 模式 2：一行一门 ────────────────────────────────────── */
  function parseRows(lines, opts) {
    var courses = [];
    var unmatched = [];

    lines.forEach(function (line) {
      var t = norm(line);
      if (!t) return;

      var fields = t.split(/\t|[，,|]|\s{2,}/).map(norm).filter(Boolean);
      if (fields.length < 3) {
        // 退一步：按空格切（容忍「课名 周一 1-2 教四-201」）
        var sp = t.split(/\s+/).map(norm).filter(Boolean);
        if (sp.length >= 3) fields = sp;
        else { unmatched.push(t); return; }
      }

      var used = fields.map(function () { return false; });
      var day = 0, per = null, weeks = null;

      /* 星期 */
      fields.forEach(function (f, i) {
        if (day) return;
        var d = parseDay(f);
        if (d) { day = d; used[i] = true; }
      });

      /* 节次：先认带「节」/带范围的写法，再认「开始节,节数」两个连续数字 */
      var bare = [];
      fields.forEach(function (f, i) {
        if (used[i] || per) return;
        if (/^\d{1,2}$/.test(f)) { bare.push({ v: Number(f), i: i }); return; }
        var p = parsePeriodCell(f, opts.periods);
        if (p && !/^[\u4e00-\u9fa5]+$/.test(f)) { per = p; used[i] = true; }
      });
      if (!per && bare.length) {
        var a = bare[0];
        var b = (bare[1] && bare[1].i === a.i + 1) ? bare[1] : null;
        if (b) {
          // 第二个数比第一个大 → 当成「第 a–b 节」；否则当成「节数」
          per = b.v > a.v ? { start: a.v, span: b.v - a.v + 1 } : { start: a.v, span: b.v };
          used[b.i] = true;
        } else {
          per = { start: a.v, span: 1 };
        }
        used[a.i] = true;
      }

      /* 周次 */
      fields.forEach(function (f, i) {
        if (used[i] || weeks) return;
        if (/周/.test(f) && /\d/.test(f)) {
          var w = parseWeeks(f, opts.totalWeeks);
          if (w) { weeks = w; used[i] = true; }
        }
      });

      /* 教室 */
      var room = '';
      fields.forEach(function (f, i) {
        if (used[i] || room) return;
        if (looksLikeRoom(f)) { room = f; used[i] = true; }
      });

      /* 剩下的：最长的当课名，另一个 2–4 汉字当教师 */
      var rest = fields.filter(function (f, i) { return !used[i]; });
      if (!day || !per || !rest.length) { unmatched.push(t); return; }
      rest.sort(function (a, b) { return b.length - a.length; });
      var name = rest.shift() || '';
      var teacher = '';
      for (var k = 0; k < rest.length; k++) {
        if (looksLikeTeacher(rest[k])) { teacher = rest[k]; break; }
      }
      if (!name) { unmatched.push(t); return; }

      courses.push({
        name: name,
        teacher: teacher,
        room: room,
        weekday: day,
        start: per.start,
        span: per.span,
        weeks: weeks || makeWeeks(1, opts.totalWeeks, 0, opts.totalWeeks),
        note: ''
      });
    });

    return courses.length ? { courses: courses, unmatched: unmatched } : null;
  }

  /* ── 收尾：去重、配色、排序 ──────────────────────────────── */
  function toneOf(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 100000;
    return (h % 8) + 1;
  }

  function finalize(list, opts) {
    var cap = Math.max(1, Number(opts.totalWeeks) || 20);
    var maxPeriod = (opts.periods && opts.periods.length) || 12;
    var seen = {};
    var out = [];
    list.forEach(function (c) {
      if (!c.name) return;
      if (c.start < 1) c.start = 1;
      if (c.start > maxPeriod) c.start = maxPeriod;
      if (c.start + c.span - 1 > maxPeriod) c.span = Math.max(1, maxPeriod - c.start + 1);
      var key = c.name + '|' + c.weekday + '|' + c.start + '|' + c.span;
      if (seen[key]) {                       // 同一格重复 → 合并周次
        var prev = seen[key];
        var merged = dedupe((prev.weeks || []).concat(c.weeks || []));
        prev.weeks = merged.length ? merged : prev.weeks;
        return;
      }
      seen[key] = c;
      out.push(c);
    });
    out.forEach(function (c) {
      c.weeks = (c.weeks && c.weeks.length) ? c.weeks.filter(function (w) { return w >= 1 && w <= cap; }) : makeWeeks(1, cap, 0, cap);
      if (!c.weeks.length) c.weeks = makeWeeks(1, cap, 0, cap);
      c.tone = toneOf(c.name);
      c.credit = c.credit || 0;
      c.note = c.note || '';
    });
    out.sort(function (a, b) {
      if (a.weekday !== b.weekday) return a.weekday - b.weekday;
      return a.start - b.start;
    });
    return out;
  }

  /**
   * @param {string} text 用户粘贴的文本
   * @param {{totalWeeks?:number, periods?:Array}} opts
   * @returns {{ok:boolean, mode:string, courses:Array, note:string, unmatched:Array, warnings:Array}}
   */
  function parse(text, opts) {
    opts = opts || {};
    var totalWeeks = Number(opts.totalWeeks) || 20;
    var o = { totalWeeks: totalWeeks, periods: opts.periods || [] };
    var raw = norm(text);
    if (!raw) {
      return { ok: false, mode: 'none', courses: [], note: '还没粘贴内容', unmatched: [], warnings: [] };
    }

    var lines = raw.split('\n').map(function (l) { return l.replace(/\r/g, ''); });

    var table = parseTable(lines, o);
    var rows = parseRows(lines, o);

    var pick = null, mode = 'none';
    if (table && (!rows || table.courses.length >= rows.courses.length)) {
      pick = table; mode = 'table';
    } else if (rows) {
      pick = rows; mode = 'rows';
    }

    if (!pick) {
      return {
        ok: false, mode: 'none', courses: [],
        note: '没认出课表结构：可以试试点「看示例」对照一下格式',
        unmatched: lines.map(norm).filter(Boolean).slice(0, 40),
        warnings: []
      };
    }

    var courses = finalize(pick.courses, o);
    var warnings = [];
    if (pick.unmatched && pick.unmatched.length) {
      warnings.push(pick.unmatched.length + ' 段文字没归到格子里');
    }
    if (!courses.length) {
      return {
        ok: false, mode: mode, courses: [],
        note: '认出了表格结构，但没读到课程',
        unmatched: (pick.unmatched || []).slice(0, 40),
        warnings: warnings
      };
    }

    var note = (mode === 'table' ? '按表格识别' : '按一行一门识别') +
      ' · ' + courses.length + ' 门课';
    return {
      ok: courses.length >= 1,
      mode: mode,
      courses: courses,
      note: note,
      unmatched: (pick.unmatched || []).slice(0, 40),
      warnings: warnings
    };
  }

  window.App.PasteParse = {
    parse: parse,
    // 便于单测
    _parsePeriodCell: parsePeriodCell,
    _parseDay: parseDay,
    _splitCellInfo: splitCellInfo,
    _splitCells: splitCells
  };
})();
