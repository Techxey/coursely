/* ══════════════════════════════════════════════════════════════
   课序 · 专注页 —— 番茄钟 + 今日时段 + 自习热力图
   window.Pages.focus
   计时器只改 DOM 文本，不每秒 S.update；结束/放弃才写一次数据。
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  var ui = window.App.ui;
  var D = window.App.D;
  var S = window.App.store;

  var DURATIONS = [20, 25, 45, 60];   // 分钟
  var FREE = { name: '自由自习', tone: 2 };
  var HEAT_WEEKS = 12;
  var RING_SIZE = 210;                 // 圆环直径（首屏要塞下热力图与统计行）
  var RING_R = 87;                     // 半径
  var RING_C = 2 * Math.PI * RING_R;   // 圆周长

  /* ── 页面生命周期内保留的计时状态（重绘不丢） ─────── */
  var T = {
    minutes: 25,        // 选中的时长
    elapsedMs: 0,       // 已累计（暂停时结算到这里）
    runFrom: 0,         // 正在运行时，本段开始的真实毫秒
    running: false,
    finished: false,
    startIso: '',       // 本轮开始的 ISO（写库用）
    subject: FREE.name,
    tone: FREE.tone
  };
  var tickId = null;    // setInterval 句柄
  var dom = null;       // 当前渲染出的关键节点（每次 render 重新收集）

  /* ── 计时小工具 ─────────────────────────────────────── */
  function elapsedNow() {
    return T.elapsedMs + (T.running ? Date.now() - T.runFrom : 0);
  }
  function totalMs() { return T.minutes * 60000; }
  function remainMs() { return Math.max(0, totalMs() - elapsedNow()); }
  function hasSession() { return elapsedNow() > 0 || T.finished; }

  function startTick() {
    stopTick();
    tickId = setInterval(onTick, 1000);
  }
  function stopTick() {
    if (tickId) { clearInterval(tickId); tickId = null; }
  }
  function resetTimer() {
    stopTick();
    T.elapsedMs = 0;
    T.runFrom = 0;
    T.running = false;
    T.finished = false;
    T.startIso = '';
  }

  /* ── 数据派生 ──────────────────────────────────────── */
  function courseTone(name) {
    if (!name) return 2;
    for (var i = 0; i < S.state.courses.length; i++) {
      if (S.state.courses[i].name === name) return S.state.courses[i].tone || 2;
    }
    return 2;
  }

  function subjectList() {
    var seen = {}, out = [];
    out.push({ name: FREE.name, tone: FREE.tone });   // 默认选中排在最前，首屏可见
    S.state.courses.forEach(function (c) {
      if (!c || !c.name || seen[c.name]) return;
      seen[c.name] = 1;
      out.push({ name: c.name, tone: c.tone || 2 });
    });
    return out;
  }

  function streakCurrent(series) {
    var i = series.length - 1;
    if (i >= 0 && series[i].minutes <= 0) i--;   // 今天还没练，从昨天数
    var n = 0;
    while (i >= 0 && series[i].minutes > 0) { n++; i--; }
    return n;
  }
  function streakLongest(series) {
    var best = 0, cur = 0;
    series.forEach(function (d) {
      if (d.minutes > 0) { cur++; if (cur > best) best = cur; }
      else cur = 0;
    });
    return best;
  }
  function heatLevel(min) {
    if (!min) return 0;
    if (min < 25) return 1;
    if (min < 50) return 2;
    if (min < 90) return 3;
    if (min < 150) return 4;
    return 5;
  }
  function sumMin(arr) {
    return arr.reduce(function (a, x) { return a + (x.minutes || 0); }, 0);
  }
  /** 时长拆分：≥60 分钟用小时（一位小数） */
  function durParts(min) {
    if (min >= 60) {
      var h = Math.round((min / 60) * 10) / 10;
      return { v: String(h).replace(/\.0$/, ''), u: '小时' };
    }
    return { v: String(Math.round(min)), u: '分钟' };
  }

  /** 12 周热力图需要的数据（首列对齐到周一） */
  function buildContext() {
    var nowD = D.now();
    var todayKey = S.ymd(nowD);
    var dow = (nowD.getDay() + 6) % 7;        // 0=周一
    var tail = dow + 1;                        // 本周已过的天数
    var series = D.focusSeries(7 * (HEAT_WEEKS - 1) + tail);
    var prefixLen = series.length - tail;

    var cols = [];
    for (var c = 0; c < HEAT_WEEKS - 1; c++) cols.push(series.slice(c * 7, c * 7 + 7));
    cols.push(series.slice(prefixLen));        // 当前周（可能不满 7 天）

    var today = S.state.focus.filter(function (f) {
      return S.ymd(new Date(f.start)) === todayKey;
    }).sort(function (a, b) { return new Date(b.start) - new Date(a.start); });

    var last7 = series.slice(-7);

    return {
      now: nowD,
      todayKey: todayKey,
      tail: tail,
      series: series,
      cols: cols,
      today: today,
      todayMin: sumMin(today),
      weekMin: sumMin(series.slice(prefixLen)),
      avg: Math.round(sumMin(last7) / 7),
      curStreak: streakCurrent(series),
      longest: streakLongest(series)
    };
  }

  /* ── DOM 同步（每秒只走这里） ───────────────────────── */
  function statusText() {
    if (T.finished) return '时间到，记下来吧';
    if (T.running) return '专注中 · 别切走';
    if (elapsedNow() > 0) return '已暂停';
    return '准备好了就开始';
  }

  function updateButtons() {
    if (!dom || !dom.mainLabel) return;
    var label, icon;
    if (T.running) { label = '暂停'; icon = 'pause'; }
    else if (T.finished) { label = '再来一轮'; icon = 'refresh'; }
    else if (elapsedNow() > 0) { label = '继续'; icon = 'play'; }
    else { label = '开始专注'; icon = 'play'; }

    if (dom.mainLabel.textContent !== label) dom.mainLabel.textContent = label;
    if (dom.mainIco && dom.mainIco.dataset.icon !== icon) {
      dom.mainIco.dataset.icon = icon;
      dom.mainIco.innerHTML = ui.icon(icon, 20);
    }
    var idle = !T.running && !T.finished && elapsedNow() === 0;
    if (dom.abandon) dom.abandon.disabled = idle;
    if (dom.done) dom.done.disabled = idle;
  }

  function syncUI() {
    if (!dom || !dom.time) return;

    var left = remainMs();
    var elapsed = totalMs() - left;
    var p = totalMs() > 0 ? Math.min(1, elapsed / totalMs()) : 0;

    dom.time.textContent = D.countdown(left);
    dom.status.textContent = statusText();

    if (dom.prog) {
      dom.prog.style.strokeDashoffset = String(RING_C * (1 - p));
      dom.prog.style.opacity = p > 0 ? '1' : '0';
    }
    if (dom.timer) dom.timer.className = 'card focus-timer tone-' + (T.tone || 2);

    updateButtons();
  }

  /* ── 计时行为 ──────────────────────────────────────── */
  function onTick() {
    if (!T.running) return;
    if (elapsedNow() >= totalMs()) {
      stopTick();
      T.elapsedMs = totalMs();
      T.runFrom = 0;
      T.running = false;
      T.finished = true;
      syncUI();
      ui.haptic([12, 46, 12]);
      ui.toast('时间到 · 点「结束并记录」收下', { icon: 'check', duration: 2800 });
      return;
    }
    syncUI();
  }

  function startRun() {
    if (T.running) return;
    if (T.finished || T.elapsedMs >= totalMs()) {
      T.elapsedMs = 0;
      T.finished = false;
      T.startIso = '';
    }
    if (!T.startIso) T.startIso = D.now().toISOString();
    T.runFrom = Date.now();
    T.running = true;
    startTick();
    syncUI();
    ui.haptic(8);
  }

  function pauseRun() {
    if (!T.running) return;
    T.elapsedMs = elapsedNow();
    T.runFrom = 0;
    T.running = false;
    stopTick();
    syncUI();
    ui.haptic(6);
  }

  function onMainClick() {
    if (T.running) pauseRun();
    else startRun();
  }

  function onRecord() {
    var ms = Math.min(elapsedNow(), totalMs());
    if (!T.finished && ms < 1000) {
      ui.toast('先开始专注吧', { icon: 'timer' });
      return;
    }
    var mins = Math.max(1, Math.round(ms / 60000));
    var startIso = T.startIso || D.now().toISOString();
    var subject = T.subject === FREE.name ? '' : T.subject;

    resetTimer();       // 先复位，S.update 触发的重绘直接落到初始态
    ui.haptic(12);
    S.update(function (s) {
      s.focus.push({ id: S.uid('f'), start: startIso, minutes: mins, courseName: subject });
    });
    ui.toast('已记录 ' + mins + ' 分钟专注', { icon: 'check' });
  }

  function onAbandon() {
    if (!T.running && !hasSession()) return;
    ui.confirm({
      title: '放弃这次专注？',
      message: '这段时间不会记入热力图。',
      confirm: '放弃',
      cancel: '继续'
    }).then(function (ok) {
      if (!ok) return;
      resetTimer();
      syncUI();
      ui.toast('已放弃这次专注', { icon: 'stop' });
    });
  }

  function pickSubject(s) {
    T.subject = s.name;
    T.tone = s.tone || 2;
    ui.haptic(4);
    if (!dom) return;
    (dom.chips || []).forEach(function (c) {
      c.node.classList.toggle('on', c.name === s.name);
    });
    if (dom.timer) dom.timer.className = 'card focus-timer tone-' + T.tone;
  }

  function pickDuration(m) {
    if (T.running) { ui.toast('先暂停再换时长', { icon: 'info' }); return; }
    T.minutes = m;
    T.elapsedMs = 0;
    T.runFrom = 0;
    T.finished = false;
    T.startIso = '';
    if (dom && dom.dur) {
      dom.dur.forEach(function (b) { b.classList.toggle('on', Number(b.dataset.min) === m); });
    }
    syncUI();
    ui.haptic(4);
  }

  /* ── 构建：圆环 ─────────────────────────────────────── */
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgCircle(cls) {
    var c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(RING_SIZE / 2));
    c.setAttribute('cy', String(RING_SIZE / 2));
    c.setAttribute('r', String(RING_R));
    c.setAttribute('class', cls);
    return c;
  }

  function buildRing() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + RING_SIZE + ' ' + RING_SIZE);
    svg.setAttribute('class', 'focus-ring-svg');
    svg.setAttribute('aria-hidden', 'true');

    var track = svgCircle('focus-ring-track');
    track.setAttribute('stroke-width', '11');

    var prog = svgCircle('focus-ring-prog');
    prog.setAttribute('stroke-width', '11');
    prog.style.strokeDasharray = String(RING_C);
    prog.style.strokeDashoffset = String(RING_C);
    prog.style.opacity = '0';
    dom.prog = prog;

    svg.appendChild(track);
    svg.appendChild(prog);
    return svg;
  }

  /* ── 构建：科目胶囊 ─────────────────────────────────── */
  function buildSubjects() {
    var row = ui.h('div', { class: 'hr-scroll focus-subjects' });
    var chips = [];

    function syncFade() {
      var max = row.scrollWidth - row.clientWidth;
      row.classList.toggle('fade-l', row.scrollLeft > 2);
      row.classList.toggle('fade-r', max > 2 && row.scrollLeft < max - 2);
    }

    subjectList().forEach(function (s) {
      var chip = ui.h('button', {
        class: 'focus-sub-chip tone-' + (s.tone || 2) + (s.name === T.subject ? ' on' : ''),
        type: 'button',
        onclick: function () { pickSubject(s); }
      },
        ui.h('span', { class: 'focus-sub-dot' }),
        ui.h('span', { class: 'focus-sub-name', text: s.name })
      );
      chips.push({ name: s.name, node: chip });
      row.appendChild(chip);
    });

    row.addEventListener('scroll', syncFade, { passive: true });
    if (window.requestAnimationFrame) window.requestAnimationFrame(syncFade);
    dom.chips = chips;
    return row;
  }

  /* ── 构建：计时卡 ───────────────────────────────────── */
  function buildTimerCard() {
    var card = ui.h('div', {
      class: 'card focus-timer tone-' + (T.tone || 2),
      ref: function (n) { dom.timer = n; }
    });

    card.appendChild(buildSubjects());

    var ringWrap = ui.h('div', { class: 'focus-ring-wrap' });
    ringWrap.appendChild(buildRing());
    ringWrap.appendChild(ui.h('div', { class: 'focus-ring-center' },
      ui.h('div', { class: 'focus-time', text: '00:00', ref: function (n) { dom.time = n; } }),
      ui.h('div', { class: 'focus-status', text: '', ref: function (n) { dom.status = n; } })
    ));
    card.appendChild(ringWrap);

    var seg = ui.h('div', { class: 'seg focus-dur' });
    dom.dur = [];
    DURATIONS.forEach(function (m) {
      var b = ui.h('button', {
        class: 'seg-item' + (m === T.minutes ? ' on' : ''),
        type: 'button',
        dataset: { min: String(m) },
        text: m + ' 分钟',
        onclick: function () { pickDuration(m); }
      });
      dom.dur.push(b);
      seg.appendChild(b);
    });
    card.appendChild(seg);

    var mainBtn = ui.h('button', {
      class: 'btn focus-main-btn',
      type: 'button',
      onclick: onMainClick
    },
      ui.h('span', { class: 'focus-btn-ico', ref: function (n) { dom.mainIco = n; } }),
      ui.h('span', { class: 'focus-btn-label', text: '开始专注', ref: function (n) { dom.mainLabel = n; } })
    );

    var abandon = ui.h('button', {
      class: 'btn btn-secondary focus-abandon-btn',
      type: 'button',
      text: '放弃',
      onclick: onAbandon,
      ref: function (n) { dom.abandon = n; }
    });
    var done = ui.h('button', {
      class: 'btn btn-secondary focus-done-btn',
      type: 'button',
      text: '结束并记录',
      onclick: onRecord,
      ref: function (n) { dom.done = n; }
    });

    card.appendChild(ui.h('div', { class: 'focus-cta' },
      mainBtn,
      ui.h('div', { class: 'focus-cta-row' }, abandon, done)
    ));

    return card;
  }

  /* ── 构建：今日时间轴 ───────────────────────────────── */
  function sessionRow(f) {
    var tone = courseTone(f.courseName);
    var st = new Date(f.start);
    var en = new Date(st.getTime() + (f.minutes || 0) * 60000);
    return ui.h('div', { class: 'list-row focus-sess' },
      ui.h('span', { class: 'focus-sess-dot tone-' + tone }),
      ui.h('div', { class: 'grow' },
        ui.h('div', { class: 'focus-sess-name', text: f.courseName || FREE.name }),
        ui.h('div', { class: 'focus-sess-time', text: ui.hm(st) + '–' + ui.hm(en) })
      ),
      ui.h('div', { class: 'focus-sess-min', text: (f.minutes || 0) + ' 分钟' })
    );
  }

  function buildTimeline(ctx) {
    var slot = ui.h('div', { class: 'focus-timeline' });
    slot.appendChild(ui.h('div', { class: 'section-head' },
      '今日专注',
      ui.h('span', { class: 'sh-action', text: ctx.todayMin > 0 ? ctx.todayMin + ' 分钟' : '还没开始' })
    ));

    if (!ctx.today.length) {
      slot.appendChild(ui.h('div', { class: 'list focus-list' },
        ui.h('div', { class: 'list-row focus-empty-row' },
          ui.h('span', { class: 'focus-empty-ico', html: ui.icon('timer', 17) }),
          ui.h('span', { class: 'focus-empty-text', text: '今天还没有专注记录' })
        )
      ));
      return slot;
    }

    var list = ui.h('div', { class: 'list focus-list' });
    ctx.today.forEach(function (f) { list.appendChild(sessionRow(f)); });
    slot.appendChild(list);
    return slot;
  }

  /* ── 构建：热力图 + 统计 ────────────────────────────── */
  function heatGrid(ctx) {
    var grid = ui.h('div', { class: 'focus-heat-grid' });
    for (var r = 0; r < 7; r++) {
      for (var c = 0; c < HEAT_WEEKS; c++) {
        var cell = ctx.cols[c] && ctx.cols[c][r];
        if (!cell) {
          grid.appendChild(ui.h('div', { class: 'focus-heat-cell is-blank' }));
          continue;
        }
        var lv = heatLevel(cell.minutes);
        grid.appendChild(ui.h('div', {
          class: 'focus-heat-cell' + (cell.key === ctx.todayKey ? ' is-today' : ''),
          dataset: { lv: String(lv) },
          title: ui.md(cell.date) + ' · ' + (cell.minutes > 0 ? cell.minutes + ' 分钟' : '没有专注')
        }));
      }
    }
    return grid;
  }

  function heatLegend() {
    var row = ui.h('div', { class: 'focus-legend' }, ui.h('span', { class: 'focus-legend-t', text: '少' }));
    for (var i = 1; i <= 5; i++) {
      row.appendChild(ui.h('div', { class: 'focus-heat-cell', dataset: { lv: String(i) } }));
    }
    row.appendChild(ui.h('span', { class: 'focus-legend-t', text: '多' }));
    return row;
  }

  function statCell(v, u, label) {
    return ui.h('div', { class: 'focus-stat' },
      ui.h('div', { class: 'fs-val' }, String(v), ui.h('i', { text: u })),
      ui.h('div', { class: 'fs-label', text: label })
    );
  }

  function buildHeat(ctx) {
    var slot = ui.h('div', { class: 'focus-heat' });
    slot.appendChild(ui.h('div', { class: 'section-head' },
      '自习热力图',
      ui.h('span', { class: 'sh-action', text: '近 ' + HEAT_WEEKS + ' 周' })
    ));

    var week = durParts(ctx.weekMin);
    var avg = durParts(ctx.avg);

    var card = ui.h('div', { class: 'card focus-heat-card' },
      heatGrid(ctx),
      heatLegend(),
      ui.h('div', { class: 'focus-stats' },
        statCell(week.v, week.u, '本周总时长'),
        statCell(avg.v, avg.u, '日均'),
        statCell(ctx.longest, '天', '最长连续')
      )
    );
    slot.appendChild(card);
    return slot;
  }

  /* ── 页面 ───────────────────────────────────────────── */
  function subText(ctx) {
    var a = ctx.todayMin > 0 ? '今天已专注 ' + ctx.todayMin + ' 分钟' : '今天还没开始专注';
    var b;
    if (ctx.curStreak > 0) b = '已连续 ' + ctx.curStreak + ' 天';
    else b = '从今天开始';
    return a + ' · ' + b;
  }

  function render(root) {
    dom = {};                                   // 重绘后重新收集节点
    var ctx = buildContext();

    var page = ui.h('div', { class: 'focus-page' },
      ui.h('div', { class: 'large-title' },
        '专注',
        ui.h('span', { class: 'lt-sub', text: subText(ctx) })
      )
    );

    page.appendChild(buildTimerCard());
    page.appendChild(buildHeat(ctx));      // 热力图紧跟计时卡，首屏可见
    page.appendChild(buildTimeline(ctx));
    root.appendChild(page);

    syncUI();
  }

  function destroy() {
    stopTick();
    resetTimer();
    dom = null;
  }

  window.Pages.focus = {
    title: '专注',
    render: render,
    destroy: destroy
  };
})();
