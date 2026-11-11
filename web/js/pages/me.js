/* ══════════════════════════════════════════════════════════════
   课序 · 我的 —— 学期概览 / 导入课表 / 提醒 / 外观 / 数据
   window.Pages.me  +  window.App.openImport
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.Pages = window.Pages || {};

  var ui = window.App.ui;
  var D = window.App.D;
  var S = window.App.store;

  var VERSION = '0.7.0';
  var THEMES = [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']];

  /* ════════════════════════════════════════════════════════════
     小工具
     ════════════════════════════════════════════════════════════ */
  function iconSpan(name, color) {
    return ui.h('span', { class: 'lr-icon me-icon ' + (color || 'blue'), html: ui.icon(name, 17) });
  }
  function chevron() {
    return ui.h('span', { class: 'me-chev', html: ui.icon('chevronRight', 15) });
  }
  function sectionHead(title) {
    return ui.h('div', { class: 'section-head', text: title });
  }
  function listNote(text) {
    return ui.h('div', { class: 'list-footer', text: text });
  }

  /** 一行标准分组列表项 */
  function row(opts) {
    var kids = [
      iconSpan(opts.icon, opts.color),
      ui.h('span', {
        class: 'lr-title grow ellipsis' + (opts.danger ? ' me-danger' : ''),
        text: opts.title
      })
    ];
    if (opts.value != null) {
      kids.push(ui.h('span', {
        class: 'lr-value me-row-value' + (opts.valueClass ? ' ' + opts.valueClass : ''),
        text: opts.value
      }));
    }
    if (opts.chevron !== false) kids.push(chevron());
    return ui.h.apply(null, ['button', {
      class: 'list-row tappable me-row',
      type: 'button',
      onclick: opts.onClick
    }].concat(kids));
  }

  /* ── 学期信息 ─────────────────────────────────────────── */
  function weekInfo() {
    var total = Number(S.get('settings.totalWeeks')) || 20;
    var week = D.weekOf();
    var start = S.get('settings.semesterStart') || '';
    var pct = total > 0 ? Math.max(0, Math.min(1, week / total)) : 0;
    return { week: week, total: total, start: start, pct: pct };
  }

  function fmtStart(s) {
    if (!s) return '开学日期未设置';
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return s;
    return d.getFullYear() + ' 年 ' + ui.md(d) + '（' + ui.wdName(d) + '）开学';
  }

  function titleNode() {
    var w = weekInfo();
    var sub;
    if (w.week < 1) sub = '学期还没开始 · 先把课表准备好';
    else if (w.week > w.total) sub = '本学期已结束 · 课表还在';
    else sub = '第 ' + w.week + ' 周 · 距离学期结束还有 ' + (w.total - w.week) + ' 周';
    return ui.h('div', { class: 'large-title' }, '我的', ui.h('span', { class: 'lt-sub', text: sub }));
  }

  function semCard() {
    var w = weekInfo();
    var weekTxt = w.week > 0 ? String(w.week) : '0';
    var rightTxt;
    if (w.week < 1) rightTxt = '学期还没开始';
    else if (w.week > w.total) rightTxt = '学期已结束';
    else rightTxt = '还剩 ' + (w.total - w.week) + ' 周';
    var goWeek = Math.max(1, Math.min(w.week, w.total));

    return ui.h('div', { class: 'card me-sem' },
      ui.h('div', { class: 'me-sem-head' },
        ui.h('div', { class: 'me-sem-week' },
          ui.h('span', { class: 'me-sem-pre', text: '第' }),
          ui.h('span', { class: 'me-sem-n', text: weekTxt }),
          ui.h('span', { class: 'me-sem-post', text: '周' })
        ),
        ui.h('div', { class: 'me-sem-right' },
          ui.h('div', { class: 'me-sem-total', text: '共 ' + w.total + ' 周' }),
          ui.h('div', { class: 'me-sem-left', text: rightTxt })
        )
      ),
      ui.h('div', { class: 'me-sem-bar' },
        ui.h('i', { style: { width: (w.pct * 100).toFixed(1) + '%' } })
      ),
      ui.h('div', { class: 'me-sem-foot' },
        ui.h('button', {
          class: 'me-sem-date me-sem-date-btn', type: 'button',
          'aria-label': '修改开学日期与学期周数',
          html: ui.icon('calendar', 13) + '<span>' + fmtStart(w.start) + '</span>',
          onclick: function () { ui.haptic(6); openTermSheet(); }
        }),
        ui.h('button', {
          class: 'me-sem-go', type: 'button', dataset: { go: 'schedule' },
          html: '<span>进入第 ' + goWeek + ' 周</span>' + ui.icon('chevronRight', 14),
          onclick: function () { ui.haptic(6); window.App.go('schedule'); }
        })
      )
    );
  }

  /* ════════════════════════════════════════════════════════════
     学期设置：开学日期 / 总周数
     ════════════════════════════════════════════════════════════ */
  function openTermSheet() {
    var st = {
      start: S.get('settings.semesterStart') || S.ymd(new Date()),
      total: Number(S.get('settings.totalWeeks')) || 20
    };

    function field(label, control) {
      return ui.h('div', { class: 'field' },
        ui.h('div', { class: 'field-label', text: label }), control);
    }

    var body = ui.h('div', { class: 'me-term' });

    /* ── 开学日期 ── */
    var dateInput = ui.h('input', {
      class: 'input', type: 'date', value: st.start,
      onchange: function (e) { if (e.target.value) { st.start = e.target.value; refresh(); } },
      oninput: function (e) { if (e.target.value) { st.start = e.target.value; refresh(); } }
    });
    var dateChips = ui.h('div', { class: 'me-term-chips' });
    [['本周一', 0], ['上周一', -7], ['下周一', 7]].forEach(function (it) {
      dateChips.appendChild(ui.h('button', {
        class: 'chip', type: 'button', text: it[0],
        onclick: function () {
          st.start = S.ymd(S.addDays(S.mondayOf(D.now()), it[1]));
          dateInput.value = st.start;
          ui.haptic(5);
          refresh();
        }
      }));
    });
    body.appendChild(field('开学日期（第 1 周从这天算）',
      ui.h('div', { class: 'stack', style: { gap: '8px' } }, dateInput, dateChips)));

    /* ── 总周数 ── */
    var totalInput = ui.h('input', {
      class: 'input', type: 'number', min: '1', max: '30', step: '1', value: String(st.total),
      oninput: function (e) {
        var v = Number(e.target.value);
        if (v >= 1 && v <= 30) { st.total = Math.round(v); refresh(); }
      }
    });
    var totalChips = ui.h('div', { class: 'me-term-chips' });
    [16, 18, 20, 22].forEach(function (n) {
      totalChips.appendChild(ui.h('button', {
        class: 'chip', type: 'button', text: n + ' 周',
        onclick: function () {
          st.total = n; totalInput.value = String(n);
          ui.haptic(5);
          refresh();
        }
      }));
    });
    body.appendChild(field('学期总周数',
      ui.h('div', { class: 'stack', style: { gap: '8px' } }, totalInput, totalChips)));

    /* ── 实时预览 ── */
    var preview = ui.h('div', { class: 'me-term-preview' });
    body.appendChild(preview);

    function refresh() {
      var d = new Date(st.start + 'T00:00:00');
      if (isNaN(d.getTime())) {
        preview.innerHTML = ui.icon('info', 14) + '<span>开学日期无效</span>';
        return;
      }
      var startDay = S.startOfDay(d);
      var week = Math.floor((S.startOfDay(D.now()) - startDay) / 86400000 / 7) + 1;
      var total = st.total;
      var hint, cls = '';
      if (week < 1) { hint = '今天是第 ' + week + ' 周（学期还没开始）'; cls = 'me-term-warn'; }
      else if (week > total) { hint = '今天是第 ' + week + ' 周（已超出 ' + total + ' 周）'; cls = 'me-term-warn'; }
      else hint = '今天是第 ' + week + ' 周 · 还剩 ' + (total - week) + ' 周';

      var isMonday = d.getDay() === 1;
      preview.innerHTML = ui.icon('info', 14) +
        '<span>第 1 周：' + ui.md(startDay) + ' – ' + ui.md(S.addDays(startDay, 6)) +
        '<br><b class="' + cls + '">' + hint + '</b>' +
        (isMonday ? '' : '<br><b class="me-term-warn">这天不是周一，建议改成周一</b>') +
        '</span>';
    }
    refresh();

    /* ── 保存 ── */
    function save() {
      var d = new Date(st.start + 'T00:00:00');
      if (isNaN(d.getTime())) { ui.toast('开学日期不对'); return; }
      var total = Math.max(1, Math.min(30, Math.round(Number(st.total) || 20)));
      ui.haptic(8);
      S.update(function (s) {
        s.settings.semesterStart = S.ymd(d);
        s.settings.totalWeeks = total;
      });
      api.close();
      ui.toast('学期设置已保存', { icon: 'check' });
    }

    var footer = ui.h('div', { style: { display: 'flex', gap: '10px', width: '100%' } },
      ui.h('button', {
        class: 'btn btn-secondary', type: 'button', text: '取消',
        onclick: function () { api.close(); }
      }),
      ui.h('button', {
        class: 'btn btn-primary', type: 'button', style: { flex: '1 1 auto' },
        text: '保存', onclick: save
      })
    );

    var api = ui.sheet({
      title: '学期设置',
      subtitle: '会影响「第 N 周」与小组件',
      body: body,
      footer: footer
    });
  }

  /* ════════════════════════════════════════════════════════════
     作息时间：节次数 + 逐节起止
     ════════════════════════════════════════════════════════════ */
  function toMin(hhmm) {
    var a = String(hhmm).split(':');
    return (Number(a[0]) || 0) * 60 + (Number(a[1]) || 0);
  }
  function periodSummary() {
    var ps = S.state.settings.periods || [];
    if (!ps.length) return '未设置';
    return ps.length + ' 节 · ' + ps[0][0] + '–' + ps[ps.length - 1][1];
  }

  function openPeriodSheet() {
    var st = {
      list: (S.state.settings.periods || []).map(function (p) { return [p[0], p[1]]; })
    };
    var body = ui.h('div', { class: 'me-period' });
    var rows = ui.h('div', { class: 'me-period-rows' });
    var preview = ui.h('div', { class: 'me-term-preview' });

    var countChips = ui.h('div', { class: 'me-term-chips' });
    [8, 10, 12, 14].forEach(function (n) {
      countChips.appendChild(ui.h('button', {
        class: 'chip', type: 'button', text: n + ' 节',
        onclick: function () {
          st.list = S.defaultPeriods(n);
          ui.haptic(5);
          renderRows();
        }
      }));
    });

    body.appendChild(ui.h('div', { class: 'field' },
      ui.h('div', { class: 'field-label', text: '每学期上几节' }), countChips));

    function renderRows() {
      rows.innerHTML = '';
      st.list.forEach(function (p, i) {
        (function (i) {
          rows.appendChild(ui.h('div', { class: 'me-period-row' },
            ui.h('span', { class: 'me-period-idx', text: String(i + 1) }),
            ui.h('input', {
              class: 'input me-period-time', type: 'time', value: p[0],
              oninput: function (e) { st.list[i][0] = e.target.value; refresh(); }
            }),
            ui.h('span', { class: 'me-period-dash', text: '–' }),
            ui.h('input', {
              class: 'input me-period-time', type: 'time', value: p[1],
              oninput: function (e) { st.list[i][1] = e.target.value; refresh(); }
            })
          ));
        })(i);
      });
      // 高亮当前节次数
      [].slice.call(countChips.children).forEach(function (b) {
        b.classList.toggle('on', b.textContent === st.list.length + ' 节');
      });
      refresh();
    }

    function refresh() {
      var n = st.list.length;
      var bad = 0;
      st.list.forEach(function (p) {
        if (toMin(p[1]) <= toMin(p[0])) bad++;
      });
      var last = st.list[n - 1] || ['—', '—'];
      preview.innerHTML = ui.icon('info', 14) + '<span>共 <b>' + n + '</b> 节 · 上午 ' +
        (st.list[0] ? st.list[0][0] : '—') + ' 到 <b>' + last[1] + '</b>' +
        (bad ? '<br><b class="me-term-warn">有 ' + bad + ' 节的下课时间不晚于上课时间</b>' : '') +
        '</span>';
    }

    body.appendChild(ui.h('div', { class: 'field' },
      ui.h('div', { class: 'field-label', text: '每节上课 / 下课时间' }),
      ui.h('div', { class: 'me-period-scroll' }, rows)));
    body.appendChild(preview);

    function save() {
      var bad = -1;
      st.list.forEach(function (p, i) {
        if (!/^\d{1,2}:\d{2}$/.test(p[0]) || !/^\d{1,2}:\d{2}$/.test(p[1])) bad = i;
        else if (toMin(p[1]) <= toMin(p[0])) bad = i;
      });
      if (bad >= 0) {
        ui.toast('第 ' + (bad + 1) + ' 节的时间不对');
        return;
      }
      var n = st.list.length;
      var overflow = S.state.courses.filter(function (c) {
        return (c.start + (c.span || 1) - 1) > n;
      });

      function apply() {
        S.update(function (s) {
          s.settings.periods = st.list.map(function (p) { return [p[0], p[1]]; });
          s.courses.forEach(function (c) {
            if (c.start > n) c.start = n;
            if (c.start + (c.span || 1) - 1 > n) c.span = Math.max(1, n - c.start + 1);
          });
        });
        api.close();
        ui.toast('作息已保存', { icon: 'check' });
      }

      if (overflow.length) {
        ui.confirm({
          title: '有课程超出新作息',
          message: overflow.length + ' 门课的节次超出现在的 ' + n + ' 节，保存后会被截断。',
          confirm: '继续保存'
        }).then(function (ok) { if (ok) apply(); });
        return;
      }
      apply();
    }

    var footer = ui.h('div', { style: { display: 'flex', gap: '10px', width: '100%' } },
      ui.h('button', {
        class: 'btn btn-secondary', type: 'button', text: '恢复默认',
        onclick: function () { st.list = S.defaultPeriods(st.list.length); ui.haptic(5); renderRows(); }
      }),
      ui.h('button', {
        class: 'btn btn-primary', type: 'button', style: { flex: '1 1 auto' },
        text: '保存', onclick: save
      })
    );

    var api = ui.sheet({
      title: '作息时间',
      subtitle: '影响时间轴 / 提醒 / 小组件',
      body: body,
      footer: footer
    });
    renderRows();
  }

  /* ════════════════════════════════════════════════════════════
     每日暖言设置
     ════════════════════════════════════════════════════════════ */
  function quoteCustomCount() {
    var list = S.state.settings.quoteCustom || [];
    return list.filter(function (s) { return String(s).trim(); }).length;
  }
  function quoteSummary() {
    if (S.state.settings.quoteOn === false) return '已关闭';
    var n = quoteCustomCount();
    return n ? '自定义 ' + n + ' 条' : '内置语录';
  }

  function openQuoteSheet() {
    var st = {
      on: S.state.settings.quoteOn !== false,
      custom: (S.state.settings.quoteCustom || []).join('\n')
    };

    var sw = ui.h('div', { class: 'switch' + (st.on ? ' on' : '') });
    var switchRow = ui.h('button', { class: 'list-row tappable', type: 'button' },
      ui.h('span', { class: 'lr-title grow', text: '在「今日」页显示每日暖言' }),
      sw
    );
    switchRow.onclick = function () {
      st.on = !st.on;
      sw.classList.toggle('on', st.on);
      ui.haptic(5);
    };

    var ta = ui.h('textarea', {
      class: 'textarea', rows: '7',
      placeholder: '每行一句。留空 = 使用内置的 60 多条语录',
      oninput: function (e) { st.custom = e.target.value; updateCount(); }
    });
    ta.value = st.custom;

    var countHint = ui.h('div', { class: 'list-footer' });
    function updateCount() {
      var n = st.custom.split('\n').filter(function (s) { return s.trim(); }).length;
      countHint.textContent = n ? '已填写 ' + n + ' 句 · 会替换内置语录' : '留空则使用内置语录';
    }
    updateCount();

    var body = ui.h('div', { class: 'me-term' },
      ui.h('div', { class: 'list me-quote-switch' }, switchRow),
      ui.h('div', { class: 'field' },
        ui.h('div', { class: 'field-label', text: '自定义语录（一行一句）' }),
        ta
      ),
      countHint,
      ui.h('div', {
        class: 'me-term-preview',
        html: ui.icon('info', 14) +
          '<span>同一天始终显示同一条，点卡片可换；第二天自动换。自定义后内置语录不再出现。</span>'
      })
    );

    function save() {
      var lines = st.custom.split('\n')
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; })
        .slice(0, 100);
      ui.haptic(7);
      S.update(function (s) {
        s.settings.quoteOn = st.on;
        s.settings.quoteCustom = lines;
      });
      api.close();
      ui.toast(st.on ? '暖言设置已保存' : '已关闭每日暖言', { icon: 'check' });
    }

    var footer = ui.h('div', { style: { display: 'flex', gap: '10px', width: '100%' } },
      ui.h('button', {
        class: 'btn btn-secondary', type: 'button', text: '清空自定义',
        onclick: function () { st.custom = ''; ta.value = ''; updateCount(); ui.haptic(5); }
      }),
      ui.h('button', {
        class: 'btn btn-primary', type: 'button', style: { flex: '1 1 auto' },
        text: '保存', onclick: save
      })
    );

    var api = ui.sheet({
      title: '每日暖言',
      subtitle: '可关、可换成自己的句子',
      body: body,
      footer: footer
    });
  }

  /* ════════════════════════════════════════════════════════════
     免打扰时段
     ════════════════════════════════════════════════════════════ */
  function quietSummary() {
    var st = S.state.settings;
    if (!st.quietOn) return '已关闭';
    return (st.quietFrom || '23:00') + ' – ' + (st.quietTo || '07:00');
  }

  function openQuietSheet() {
    var st = {
      on: !!S.state.settings.quietOn,
      from: S.state.settings.quietFrom || '23:00',
      to: S.state.settings.quietTo || '07:00'
    };

    var sw = ui.h('div', { class: 'switch' + (st.on ? ' on' : '') });
    var switchRow = ui.h('button', { class: 'list-row tappable', type: 'button' },
      ui.h('span', { class: 'lr-title grow', text: '开启免打扰' }),
      sw
    );
    switchRow.onclick = function () {
      st.on = !st.on;
      sw.classList.toggle('on', st.on);
      ui.haptic(5);
    };

    var fromIn = ui.h('input', {
      class: 'input', type: 'time', value: st.from,
      oninput: function (e) { st.from = e.target.value; }
    });
    var toIn = ui.h('input', {
      class: 'input', type: 'time', value: st.to,
      oninput: function (e) { st.to = e.target.value; }
    });

    var body = ui.h('div', { class: 'me-term' },
      ui.h('div', { class: 'list me-quote-switch' }, switchRow),
      ui.h('div', { class: 'me-term-row2' },
        ui.h('div', { class: 'field' },
          ui.h('div', { class: 'field-label', text: '从' }), fromIn),
        ui.h('div', { class: 'field' },
          ui.h('div', { class: 'field-label', text: '到（次日）' }), toIn)
      ),
      ui.h('div', {
        class: 'me-term-preview',
        html: ui.icon('info', 14) +
          '<span>落在这个时间段内的作业到期提醒会静默跳过，不会吵醒你。支持跨零点，比如 23:00 – 07:00。</span>'
      })
    );

    function save() {
      ui.haptic(7);
      S.update(function (s) {
        s.settings.quietOn = st.on;
        s.settings.quietFrom = st.from || '23:00';
        s.settings.quietTo = st.to || '07:00';
      });
      api.close();
      ui.toast(st.on ? '免打扰已开启' : '免打扰已关闭', { icon: 'moon' });
    }

    var footer = ui.h('div', { style: { display: 'flex', gap: '10px', width: '100%' } },
      ui.h('button', { class: 'btn btn-primary btn-block', type: 'button', text: '保存', onclick: save })
    );

    var api = ui.sheet({
      title: '免打扰时段',
      subtitle: '这个时间段不弹提醒',
      body: body,
      footer: footer
    });
  }

  /* ════════════════════════════════════════════════════════════
     外观
     ════════════════════════════════════════════════════════════ */
  function currentTheme() {
    return S.get('settings.theme') || 'auto';
  }

  function setTheme(v) {
    if (currentTheme() === v) return;
    ui.haptic(6);
    S.update(function (s) { s.settings.theme = v; });
    window.App.applyTheme();
  }

  function themeLabel(v) {
    var hit = THEMES.filter(function (t) { return t[0] === v; })[0];
    return hit ? hit[1] : THEMES[0][1];
  }

  function appearanceCard() {
    var cur = currentTheme();
    var seg = ui.h('div', { class: 'seg me-seg' });
    THEMES.forEach(function (t) {
      seg.appendChild(ui.h('button', {
        class: 'seg-item' + (cur === t[0] ? ' on' : ''),
        type: 'button',
        dataset: { pick: t[0] },
        text: t[1],
        onclick: function () { setTheme(t[0]); }
      }));
    });
    return ui.h('div', { class: 'card me-card' },
      ui.h('div', { class: 'row me-card-head' },
        ui.h('span', { class: 'me-card-title', text: '主题' }),
        ui.h('span', { class: 'spacer' }),
        ui.h('span', { class: 'me-card-value', text: '当前：' + themeLabel(cur) })
      ),
      seg
    );
  }

  /* ════════════════════════════════════════════════════════════
     提醒 / 通知
     ════════════════════════════════════════════════════════════ */
  function notifInfo() {
    if (!('Notification' in window)) return { text: '当前环境不支持', cls: '' };
    var p = Notification.permission;
    if (p === 'granted') return { text: '已开启', cls: 'me-ok' };
    if (p === 'denied') return { text: '已拒绝', cls: 'me-warn' };
    return { text: '未请求', cls: '' };
  }

  function askNotify() {
    var info = notifInfo();
    if (info.text === '已开启') { ui.toast('通知权限已开启', { icon: 'check' }); return; }
    if (info.text === '已拒绝') { ui.toast('浏览器已拒绝，请在站点设置里允许通知'); return; }
    if (!('Notification' in window)) { ui.toast('当前环境不支持系统通知'); return; }
    window.App.enableNativeNotify().then(function (ok) {
      ui.toast(ok ? '已开启系统通知' : '没有拿到通知权限', { icon: ok ? 'check' : 'bell' });
      if (window.App.pageId() === 'me') window.App.refresh();
    });
  }

  /* ════════════════════════════════════════════════════════════
     数据
     ════════════════════════════════════════════════════════════ */
  function resetData() {
    ui.confirm({
      title: '清空所有数据？',
      message: '课表、待办、专注记录和设置都会清空，无法撤销。',
      confirm: '清空',
      cancel: '取消'
    }).then(function (ok) {
      if (!ok) return;
      S.reset();
      window.App.applyTheme();
      ui.haptic(10);
      ui.toast('已清空，可以重新开始了', { icon: 'check' });
    });
  }

  /* ════════════════════════════════════════════════════════════
     分享码：编码 / 解码
     ════════════════════════════════════════════════════════════ */
  function encodeShare() {
    return btoa(encodeURIComponent(S.exportJSON()));
  }

  function decodeShare(raw) {
    var t = String(raw || '').trim();
    if (!t) throw new Error('empty');
    if (t.charAt(0) === '{' || t.charAt(0) === '[') return t;   // 直接贴 JSON 也认
    var txt = atob(t.replace(/\s+/g, ''));
    try { return decodeURIComponent(txt); } catch (e) { return txt; }
  }

  function importShareCode(text, sheet) {
    var raw = String(text || '').trim();
    if (!raw) { ui.toast('先粘贴一段分享码'); return false; }
    var json;
    try { json = decodeShare(raw); } catch (e) { ui.toast('分享码无效'); return false; }
    var obj;
    try { obj = JSON.parse(json); } catch (e) { ui.toast('分享码无效'); return false; }
    if (!obj || !Array.isArray(obj.courses)) { ui.toast('分享码无效'); return false; }
    try {
      S.importJSON(json);
      window.App.applyTheme();
    } catch (e) {
      ui.toast('分享码无效');
      return false;
    }
    ui.haptic(10);
    if (sheet && sheet.close) sheet.close();
    ui.toast('课表已导入', { icon: 'check' });
    window.App.go('schedule');
    return true;
  }

  function pasteInto(ta) {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      ui.toast('当前环境不能读剪贴板，长按输入框粘贴');
      return;
    }
    navigator.clipboard.readText().then(function (t) {
      if (!t) { ui.toast('剪贴板是空的'); return; }
      ta.value = t;
      ui.haptic(6);
      ui.toast('已粘贴');
    }).catch(function () {
      ui.toast('读取剪贴板失败，长按输入框粘贴');
    });
  }

  function openShareImport() {
    var body = ui.h('div', { class: 'me-share' });
    var footer = ui.h('div', { class: 'me-import-foot' });
    var ta = ui.h('textarea', {
      class: 'textarea me-code-input',
      rows: '5',
      placeholder: '粘贴分享码，例如 eOc%2F… 或整段 JSON',
      'aria-label': '分享码'
    });
    var sheet = ui.sheet({
      title: '分享码导入',
      subtitle: '粘贴同学发来的课表码',
      body: body, footer: footer, className: 'me-sheet'
    });

    body.appendChild(ui.h('div', {
      class: 'me-note',
      html: ui.icon('info', 14) + '<span>码里含课表、待办和专注记录，导入后本机数据会被替换。</span>'
    }));
    body.appendChild(ta);
    body.appendChild(ui.h('div', { class: 'me-share-acts' },
      ui.h('button', {
        class: 'btn btn-sm btn-secondary', type: 'button', text: '从剪贴板粘贴',
        onclick: function () { pasteInto(ta); }
      })
    ));

    footer.appendChild(ui.h('button', {
      class: 'btn btn-secondary', type: 'button', text: '取消',
      onclick: function () { sheet.close(); }
    }));
    footer.appendChild(ui.h('button', {
      class: 'btn btn-primary', type: 'button', text: '导入',
      onclick: function () { importShareCode(ta.value, sheet); }
    }));

    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 60);
  }

  function openExport() {
    var code;
    try { code = encodeShare(); } catch (e) { code = ''; }
    if (!code) { ui.toast('生成分享码失败，请重试'); return; }

    var ta = ui.h('textarea', {
      class: 'textarea me-code-input', rows: '5', readonly: true, 'aria-label': '课表分享码'
    });
    ta.value = code;

    var body = ui.h('div', { class: 'me-share' });
    var footer = ui.h('div', { class: 'me-import-foot' });
    var sheet = ui.sheet({
      title: '导出课表',
      subtitle: '一整张课表，一个码',
      body: body, footer: footer, className: 'me-sheet',
      onMount: function () { try { ta.focus(); ta.select(); } catch (e) {} }
    });

    body.appendChild(ui.h('div', { class: 'me-code-meta' },
      ui.h('span', { text: '共 ' + S.state.courses.length + ' 门课程 · ' + S.state.todos.length + ' 条待办' }),
      ui.h('span', { text: code.length + ' 字符' })
    ));
    body.appendChild(ta);
    body.appendChild(ui.h('div', {
      class: 'me-note',
      html: ui.icon('info', 14) + '<span>对方在「分享码导入」里粘贴这一段即可。剪贴板不可用时这段文本可以直接长按选中。</span>'
    }));

    footer.appendChild(ui.h('button', {
      class: 'btn btn-secondary', type: 'button', text: '完成',
      onclick: function () { sheet.close(); }
    }));
    footer.appendChild(ui.h('button', {
      class: 'btn btn-primary', type: 'button', text: '复制分享码',
      onclick: function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(function () {
            ui.haptic(6);
            ui.toast('分享码已复制', { icon: 'check' });
          }).catch(fallback);
        } else {
          fallback();
        }
      }
    }));

    function fallback() {
      try { ta.focus(); ta.select(); } catch (e) {}
      ui.toast('复制不可用，请长按选择这段码', { icon: 'info', duration: 3000 });
    }
  }

  /* ════════════════════════════════════════════════════════════
     手动添加（导入方式之一）
     ════════════════════════════════════════════════════════════ */
  function openManualAdd() {
    var draft = { name: '', weekday: 1, start: 1, span: 2, room: '' };
    var body = ui.h('div', { class: 'me-form' });
    var footer = ui.h('div', { class: 'me-import-foot' });
    var sheet = ui.sheet({
      title: '手动添加课程', subtitle: '一次加一门，最稳',
      body: body, footer: footer, className: 'me-sheet'
    });

    var nameInput = ui.h('input', {
      class: 'input', type: 'text', placeholder: '例如：大学物理（下）', 'aria-label': '课程名',
      oninput: function (e) { draft.name = e.target.value; }
    });
    var roomInput = ui.h('input', {
      class: 'input', type: 'text', placeholder: '例如：教四-201（可以不填）', 'aria-label': '教室',
      oninput: function (e) { draft.room = e.target.value; }
    });

    var wdSeg = ui.h('div', { class: 'seg me-wd-seg' });
    for (var wd = 1; wd <= 7; wd++) {
      (function (w) {
        wdSeg.appendChild(ui.h('button', {
          class: 'seg-item' + (draft.weekday === w ? ' on' : ''),
          type: 'button',
          text: D.DAY_SHORT[w],
          'aria-label': D.DAY_NAMES[w],
          onclick: function () {
            draft.weekday = w;
            ui.$$('.seg-item', wdSeg).forEach(function (b, i) {
              b.classList.toggle('on', i + 1 === w);
            });
          }
        }));
      })(wd);
    }

    var startSel = ui.h('select', {
      class: 'input me-select', 'aria-label': '开始节次',
      onchange: function (e) { draft.start = Number(e.target.value); refreshSpan(); }
    });
    for (var p = 1; p <= 12; p++) {
      startSel.appendChild(ui.h('option', {
        value: String(p), text: '第 ' + p + ' 节 · ' + D.periodTime(p).start
      }));
    }

    var spanSel = ui.h('select', {
      class: 'input me-select', 'aria-label': '连上几节',
      onchange: function (e) { draft.span = Number(e.target.value); }
    });
    [1, 2, 3, 4].forEach(function (n) {
      spanSel.appendChild(ui.h('option', { value: String(n), text: n + ' 节' }));
    });

    function refreshSpan() {
      Array.prototype.forEach.call(spanSel.options, function (o, i) {
        var n = i + 1;
        var ok = draft.start + n - 1 <= 12;
        o.disabled = !ok;
        if (!ok && draft.span === n) {
          draft.span = 1;
          spanSel.value = '1';
        }
      });
    }

    body.appendChild(ui.h('div', { class: 'field' },
      ui.h('label', { class: 'field-label', text: '课程名' }), nameInput));
    body.appendChild(ui.h('div', { class: 'field' },
      ui.h('label', { class: 'field-label', text: '星期' }), wdSeg));
    body.appendChild(ui.h('div', { class: 'me-form-row' },
      ui.h('div', { class: 'field' },
        ui.h('label', { class: 'field-label', text: '开始节次' }), startSel),
      ui.h('div', { class: 'field' },
        ui.h('label', { class: 'field-label', text: '连上几节' }), spanSel)));
    body.appendChild(ui.h('div', { class: 'field' },
      ui.h('label', { class: 'field-label', text: '教室' }), roomInput));

    footer.appendChild(ui.h('button', {
      class: 'btn btn-secondary', type: 'button', text: '取消',
      onclick: function () { sheet.close(); }
    }));
    footer.appendChild(ui.h('button', {
      class: 'btn btn-primary', type: 'button', text: '添加',
      onclick: function () {
        var name = String(draft.name || '').trim();
        if (!name) { ui.toast('先给课程起个名字'); try { nameInput.focus(); } catch (e) {} return; }
        var tone = (S.state.courses.length % 8) + 1;
        S.update(function (s) {
          s.courses.push({
            id: S.uid('c'), name: name, teacher: '', room: String(draft.room || '').trim(),
            tone: tone, weekday: draft.weekday, start: draft.start, span: draft.span || 1,
            weeks: S.weeks(1, 16), credit: 2, note: ''
          });
        });
        ui.haptic(10);
        sheet.close();
        ui.toast('已添加「' + name + '」', { icon: 'check' });
        window.App.go('schedule');
      }
    }));

    setTimeout(function () { try { nameInput.focus(); } catch (e) {} }, 60);
  }

  /* ════════════════════════════════════════════════════════════
     示例截图（canvas 之外零依赖：直接生成 SVG dataURI）
     ════════════════════════════════════════════════════════════ */
  function sampleShot() {
    var FONT = 'PingFang SC, Microsoft YaHei, Segoe UI, sans-serif';
    var W = 900, H = 620;
    var days = ['周一', '周二', '周三', '周四', '周五'];
    var x0 = 96, y0 = 192, colW = 153.6, rowH = 100;
    var times = ['08:00', '10:00', '14:00', '16:00'];
    var blocks = [
      { c: 0, r: 0, name: '高等数学（上）', room: '教四-201', bg: '#E7F2FF', ink: '#00457F', bar: '#007AFF' },
      { c: 4, r: 0, name: '程序设计基础', room: '计算机楼-208', bg: '#E6F8EB', ink: '#0B6B2A', bar: '#34C759' },
      { c: 2, r: 1, name: '大学物理（下）', room: '理科楼-305', bg: '#E2F6FA', ink: '#0C5E6E', bar: '#30B0C7' },
      { c: 3, r: 2, name: '线性代数', room: '教二-410', bg: '#EBEBFB', ink: '#2B2A8E', bar: '#5856D6' }
    ];

    function txt(x, y, size, fill, weight, anchor, s) {
      return '<text x="' + x + '" y="' + y + '" font-family="' + FONT + '" font-size="' + size +
        '" fill="' + fill + '"' + (weight ? ' font-weight="' + weight + '"' : '') +
        (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + ui.esc(s) + '</text>';
    }

    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
    s += '<rect width="' + W + '" height="' + H + '" fill="#EEF1F7"/>';
    s += '<rect width="' + W + '" height="132" fill="#2E6BD6"/>';
    s += txt(40, 54, 22, 'rgba(255,255,255,0.88)', 0, '', '教务管理系统');
    s += txt(40, 100, 32, '#FFFFFF', 700, '', '2026—2027 学年第一学期 课表');
    s += txt(858, 54, 20, 'rgba(255,255,255,0.88)', 0, 'end', '计算机 2401 班');
    s += '<rect x="24" y="148" width="852" height="448" rx="12" fill="#FFFFFF"/>';
    s += '<rect x="24" y="148" width="852" height="44" fill="#E8EEFA"/>';
    s += txt(42, 176, 17, '#5C6B85', 600, '', '节次');
    days.forEach(function (d, i) {
      s += txt(x0 + colW * (i + 0.5), 176, 19, '#33415C', 600, 'middle', d);
    });
    for (var i = 1; i < 5; i++) {
      s += '<line x1="' + (x0 + colW * i).toFixed(1) + '" y1="192" x2="' + (x0 + colW * i).toFixed(1) +
        '" y2="596" stroke="#E2E7F0" stroke-width="1.4"/>';
    }
    for (var r = 1; r < 4; r++) {
      s += '<line x1="24" y1="' + (y0 + rowH * r) + '" x2="876" y2="' + (y0 + rowH * r) +
        '" stroke="#E2E7F0" stroke-width="1.4"/>';
    }
    for (var r2 = 0; r2 < 4; r2++) {
      s += txt(42, y0 + rowH * r2 + 24, 15, '#7A869A', 0, '', (r2 * 2 + 1) + '-' + (r2 * 2 + 2) + '节');
      s += txt(42, y0 + rowH * r2 + 44, 13, '#A6B0C2', 0, '', times[r2]);
    }
    blocks.forEach(function (b) {
      var x = x0 + colW * b.c + 5, y = y0 + rowH * b.r + 5, w = colW - 10, h = rowH - 10;
      s += '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + h +
        '" rx="9" fill="' + b.bg + '"/>';
      s += '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="5" height="' + h +
        '" rx="2.5" fill="' + b.bar + '"/>';
      s += txt(x + 15, y + 32, 18, b.ink, 700, '', b.name);
      s += txt(x + 15, y + 56, 15, b.ink, 0, '', b.room);
    });
    s += txt(40, 616, 14, '#8E99AB', 0, '', '课表导出时间 2026-09-01 · 该图仅用于原型演示');
    s += txt(860, 616, 14, '#8E99AB', 0, 'end', '第 1 页 / 共 1 页');
    s += '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }

  /* ════════════════════════════════════════════════════════════
     截图 OCR 导入流程（4 步）
     ════════════════════════════════════════════════════════════ */
  var OCR_RESULT = [
    { name: '高等数学（上）', teacher: '陈志强', room: '教四-201', tone: 2, weekday: 1, start: 1, span: 2, credit: 5 },
    { name: '大学物理（下）', teacher: '孙皓', room: '理科楼-305', tone: 5, weekday: 3, start: 3, span: 2, credit: 4 },
    { name: '线性代数', teacher: '周雨薇', room: '教二-410', tone: 4, weekday: 4, start: 5, span: 2, credit: 3 },
    { name: '程序设计基础', teacher: '林嘉', room: '计算机楼-208', tone: 3, weekday: 5, start: 1, span: 2, credit: 3 }
  ];
  var STEP_SUB = {
    1: '第 1 步 · 选择导入方式',
    2: '第 2 步 · 上传课表截图',
    ocr: '第 3 步 · 正在识别',
    3: '第 4 步 · 校对课程'
  };

  /* ── 原生桥：只有 Android 包内、并且带离线 OCR 时才算可用 ── */
  function nativeOcrReady() {
    try {
      var n = window.App.native;
      return !!(n && n.available && n.info && n.info.ocr && n.pickPhoto && n.ocr);
    } catch (e) {
      return false;
    }
  }

  /* 原生错误：android.js 把 code 放在 message / detail.code 里 */
  function errCode(err) {
    if (!err) return '';
    return String(err.code || err.message || (err.detail && err.detail.code) || '');
  }

  function parseWeeks() {
    return Number(S.get('settings.totalWeeks')) || 20;
  }

  function openImport(mode) {
    if (mode === 'code') { openShareImport(); return; }
    if (mode === 'manual') { openManualAdd(); return; }

    var st = {
      step: 1,
      image: '',
      imageName: '',
      result: [],
      timers: [],
      native: nativeOcrReady(),   // Android：拍照 + 离线 OCR
      closed: false,
      picking: false,
      ocrState: 'idle',           // idle | run | fail | done
      ocrToken: 0,
      parseNote: '',
      unmatched: [],
      failNote: ''
    };
    var body = ui.h('div', { class: 'me-import' });
    var footer = ui.h('div', { class: 'me-import-foot' });

    function clearTimers() {
      st.timers.forEach(function (id) { clearTimeout(id); clearInterval(id); });
      st.timers = [];
    }
    function later(fn, ms) { st.timers.push(setTimeout(fn, ms)); }
    function every(fn, ms) { st.timers.push(setInterval(fn, ms)); }

    var sheet = ui.sheet({
      title: '导入课表',
      subtitle: STEP_SUB[1],
      body: body,
      footer: footer,
      className: 'me-sheet',
      onClose: function () {
        st.closed = true;
        st.ocrToken++;
        clearTimers();
      }
    });

    function stepTo(step, sub) {
      if (st.closed) return;
      st.step = step;
      clearTimers();
      var subEl = sheet.el.querySelector('.sheet-subtitle');
      if (subEl) {
        subEl.textContent = sub ||
          (step === 2 && st.native ? '第 2 步 · 拍照扫描课表' : (STEP_SUB[step] || ''));
      }
      body.innerHTML = '';
      footer.innerHTML = '';
      if (step === 1) buildChoice();
      else if (step === 2) buildShot();
      else if (step === 'ocr') buildOcr();
      else if (step === 3) buildReview();
    }

    function stepsBar(n) {
      var wrap = ui.h('div', { class: 'me-steps' });
      for (var i = 1; i <= 4; i++) {
        wrap.appendChild(ui.h('i', { class: 'me-step' + (i < n ? ' done' : (i === n ? ' on' : '')) }));
      }
      return wrap;
    }

    /* ── Step 1：选择方式 ───────────────────────────────── */
    function buildChoice() {
      body.appendChild(stepsBar(1));
      [
        { k: 'shot', icon: 'camera', color: 'blue', t: '截图识别', d: '从教务系统的课表截图里认出来' },
        { k: 'code', icon: 'share', color: 'indigo', t: '分享码', d: '粘贴同学发来的一串码' },
        { k: 'manual', icon: 'pencil', color: 'green', t: '手动添加', d: '自己填一门，最稳妥' }
      ].forEach(function (o) {
        body.appendChild(ui.h('button', {
          class: 'me-opt', type: 'button', dataset: { opt: o.k },
          onclick: function () {
            ui.haptic(6);
            if (o.k === 'shot') {
              stepTo(2);
            } else if (o.k === 'code') {
              sheet.close();
              later(function () { openShareImport(); }, 240);
            } else {
              sheet.close();
              later(function () { openManualAdd(); }, 240);
            }
          }
        },
          ui.h('span', { class: 'me-opt-icon ' + o.color, html: ui.icon(o.icon, 18) }),
          ui.h('span', { class: 'me-opt-txt' },
            ui.h('b', { text: o.t }),
            ui.h('small', { text: o.d })),
          ui.h('span', { class: 'me-chev', html: ui.icon('chevronRight', 15) })
        ));
      });

      var foot = ui.h('div', { class: 'me-import-foot' });
      foot.appendChild(ui.h('button', {
        class: 'btn btn-secondary', type: 'button', text: '取消',
        onclick: function () { sheet.close(); }
      }));
      footer.appendChild(foot);
    }

    /* ── Step 2：拍照 / 上传截图 ────────────────────────── */
    function buildShot() {
      body.appendChild(stepsBar(2));
      var file = ui.h('input', {
        type: 'file', accept: 'image/*', class: 'me-file',
        'aria-label': '选择课表截图', onchange: onPickFile
      });
      body.appendChild(file);

      if (st.native) {
        /* Android：系统相机代拍 + 离线 OCR，图片不出手机 */
        if (st.image) {
          body.appendChild(ui.h('div', { class: 'me-preview' },
            ui.h('img', { class: 'me-preview-img', src: st.image, alt: '课表照片预览' }),
            ui.h('span', { class: 'me-preview-badge', text: '离线识别 · 图片不上传' })
          ));
          body.appendChild(ui.h('div', { class: 'me-preview-acts' },
            ui.h('button', {
              class: 'btn btn-sm btn-secondary', type: 'button', text: '重新拍照',
              dataset: { act: 'camera' },
              onclick: function () { pickNative('camera'); }
            }),
            ui.h('button', {
              class: 'btn btn-sm btn-secondary', type: 'button', text: '从相册换',
              dataset: { act: 'gallery' },
              onclick: function () { pickNative('gallery'); }
            }),
            ui.h('span', { class: 'me-preview-name ellipsis', text: st.imageName })
          ));
        } else {
          body.appendChild(ui.h('button', {
            class: 'me-drop me-drop-primary', type: 'button', dataset: { act: 'camera' },
            onclick: function () { pickNative('camera'); }
          },
            ui.h('span', { class: 'me-drop-icon', html: ui.icon('camera', 26) }),
            ui.h('span', { class: 'me-drop-title', text: '拍照扫描课表' }),
            ui.h('span', { class: 'me-drop-desc', text: '把整张课表拍正、拍清楚，离线识别' })
          ));
          body.appendChild(ui.h('button', {
            class: 'btn btn-secondary btn-block', type: 'button', text: '从相册选择',
            dataset: { act: 'gallery' },
            onclick: function () { pickNative('gallery'); }
          }));
        }
        body.appendChild(ui.h('div', { class: 'me-alt' },
          ui.h('button', {
            class: 'me-alt-btn', type: 'button', text: '选择文件',
            onclick: function () { file.click(); }
          }),
          ui.h('button', {
            class: 'me-alt-btn', type: 'button', text: '使用示例截图',
            onclick: useSample
          })
        ));
        body.appendChild(ui.h('div', {
          class: 'me-note',
          html: ui.icon('info', 14) + '<span>离线识别 · 图片只在手机上解析，不会上传。</span>'
        }));
      } else if (st.image) {
        body.appendChild(ui.h('div', { class: 'me-preview' },
          ui.h('img', { class: 'me-preview-img', src: st.image, alt: '课表截图预览' }),
          ui.h('span', { class: 'me-preview-badge', text: '原型演示：真实识别需接入 OCR 服务' })
        ));
        body.appendChild(ui.h('div', { class: 'me-preview-acts' },
          ui.h('button', {
            class: 'btn btn-sm btn-secondary', type: 'button', text: '重新选择',
            onclick: function () { file.click(); }
          }),
          ui.h('button', {
            class: 'btn btn-sm btn-secondary', type: 'button', text: '换成示例',
            onclick: useSample
          }),
          ui.h('span', { class: 'me-preview-name ellipsis', text: st.imageName })
        ));
      } else {
        body.appendChild(ui.h('button', {
          class: 'me-drop', type: 'button', onclick: function () { file.click(); }
        },
          ui.h('span', { class: 'me-drop-icon', html: ui.icon('image', 26) }),
          ui.h('span', { class: 'me-drop-title', text: '选择课表截图' }),
          ui.h('span', { class: 'me-drop-desc', text: '从相册里挑一张，或者直接用示例截图' })
        ));
        body.appendChild(ui.h('button', {
          class: 'btn btn-secondary btn-block', type: 'button', text: '使用示例截图',
          onclick: useSample
        }));
      }

      if (!st.native) {
        body.appendChild(ui.h('div', {
          class: 'me-note',
          html: ui.icon('info', 14) + '<span>原型演示：不会真的上传，识别结果是预置的 4 门示例课程。</span>'
        }));
      }

      footer.appendChild(ui.h('button', {
        class: 'btn btn-secondary', type: 'button', text: '上一步',
        onclick: function () { stepTo(1); }
      }));
      var go = ui.h('button', {
        class: 'btn btn-primary', type: 'button', text: '开始识别', dataset: { act: 'ocr' },
        onclick: startOcr
      });
      if (!st.image) go.setAttribute('disabled', '');
      footer.appendChild(go);
    }

    /* 原生：拍照 / 相册 → dataUrl（取消不报错） */
    function pickNative(source) {
      var n = window.App.native;
      if (!n || !n.available) { ui.toast('当前环境不支持拍照'); return; }
      if (st.picking) return;
      st.picking = true;
      ui.haptic(6);
      n.pickPhoto(source).then(function (res) {
        st.picking = false;
        if (st.closed) return;
        if (!res || !res.dataUrl) { ui.toast('没拿到图片，再试一次'); return; }
        st.image = res.dataUrl;
        st.imageName = (source === 'camera' ? '拍照' : '相册') +
          (res.width && res.height ? ' · ' + res.width + '×' + res.height : '');
        st.ocrState = 'idle';
        st.parseNote = '';
        st.unmatched = [];
        stepTo(2);
      }).catch(function (err) {
        st.picking = false;
        if (st.closed) return;
        var code = errCode(err);
        if (code === 'cancel') return;                 // 用户主动取消，别打扰
        if (code === 'permission_denied') ui.toast('没有相机/相册权限，去系统设置里开一下');
        else if (code === 'no_camera') ui.toast('这台设备没有可用的相机');
        else ui.toast('没打开相机，再试一次');
      });
    }

    function useSample() {
      st.image = sampleShot();
      st.imageName = '示例截图 · 教务系统';
      ui.haptic(6);
      stepTo(2);
    }

    function onPickFile(e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.type && f.type.indexOf('image/') !== 0) { ui.toast('请选一张图片'); return; }
      if (f.size > 8 * 1024 * 1024) { ui.toast('图片有点大，换一张试试'); return; }
      var fr = new FileReader();
      fr.onload = function () {
        st.image = String(fr.result || '');
        st.imageName = f.name || '课表截图';
        ui.haptic(6);
        stepTo(2);
      };
      fr.onerror = function () { ui.toast('图片读取失败，试试示例截图'); };
      fr.readAsDataURL(f);
    }

    function startOcr() {
      if (!st.image) return;
      ui.haptic(8);
      st.ocrState = 'run';
      st.parseNote = '';
      st.unmatched = [];
      stepTo('ocr');
    }

    /* ── Step 2b：识别中 ────────────────────────────────── */
    function buildOcr() {
      if (st.native) buildNativeOcr();
      else buildFakeOcr();
    }

    /* 原生 OCR：真识别，进度不是假的 */
    function buildNativeOcr() {
      body.appendChild(stepsBar(2));
      if (st.ocrState === 'fail') {
        renderOcrFail();
        var subEl = sheet.el.querySelector('.sheet-subtitle');
        if (subEl) subEl.textContent = '第 3 步 · 没认出来';
        return;
      }

      body.appendChild(ui.h('div', { class: 'me-ocr-head' },
        ui.h('span', { class: 'me-spin' }),
        ui.h('span', { class: 'grow', text: '正在识别课表…' })
      ));
      body.appendChild(ui.h('div', { class: 'me-prog indet' }, ui.h('i', { style: { width: '38%' } })));
      if (st.image) {
        body.appendChild(ui.h('div', { class: 'me-ocr-thumb' },
          ui.h('img', { src: st.image, alt: '正在识别的课表' })
        ));
      }
      body.appendChild(ui.h('div', {
        class: 'me-note',
        html: ui.icon('info', 14) + '<span>离线识别 · 图片不上传，一般 1–3 秒。</span>'
      }));

      footer.appendChild(ui.h('button', {
        class: 'btn btn-secondary', type: 'button', text: '取消识别',
        onclick: function () { st.ocrToken++; st.ocrState = 'idle'; stepTo(2); }
      }));

      runNativeOcr();
    }

    function runNativeOcr() {
      var token = ++st.ocrToken;
      st.failNote = '';
      var n = window.App.native;
      var job;
      try {
        job = n.ocr(st.image);
      } catch (e) {
        job = Promise.reject(e);
      }

      Promise.resolve(job).then(function (res) {
        if (st.closed || token !== st.ocrToken) return;
        var parsed = null;
        try {
          parsed = window.App.OcrParse && window.App.OcrParse.parse
            ? window.App.OcrParse.parse(res, { totalWeeks: parseWeeks() })
            : null;
        } catch (e2) {
          parsed = null;
        }

        if (parsed && parsed.ok && parsed.courses && parsed.courses.length) {
          st.ocrState = 'done';
          st.result = parsed.courses.map(function (c) {
            return {
              name: c.name, teacher: c.teacher, room: c.room, tone: c.tone,
              weekday: c.weekday, start: c.start, span: c.span,
              weeks: c.weeks, credit: c.credit
            };
          });
          st.parseNote = parsed.note || '';
          st.unmatched = [];
          ui.haptic(8);
          stepTo(3);
          return;
        }

        /* 认不出来：别卡死，直接给「手动添加」和原文 */
        st.ocrState = 'fail';
        st.failNote = (parsed && parsed.note) || '这张图没认出课表，换一张试试。';
        st.unmatched = (parsed && parsed.unmatched) ? parsed.unmatched.slice() : [];
        if (!st.unmatched.length && res && res.lines) {
          res.lines.forEach(function (l) {
            var t = String((l && l.text) || '').trim();
            if (t && st.unmatched.indexOf(t) < 0 && st.unmatched.length < 30) st.unmatched.push(t);
          });
        }
        stepTo('ocr');
      }).catch(function (err) {
        if (st.closed || token !== st.ocrToken) return;
        var code = errCode(err);
        if (code === 'cancel') { st.ocrState = 'idle'; stepTo(2); return; }
        st.ocrState = 'fail';
        st.failNote = code === 'ocr_failed'
          ? '离线 OCR 没跑起来，可能是识别模型没装好。'
          : '识别的时候出错了，换一张图或者手动添加吧。';
        st.unmatched = [];
        stepTo('ocr');
      });
    }

    function renderOcrFail() {
      body.appendChild(ui.h('div', { class: 'me-fail' },
        ui.h('span', { class: 'me-fail-icon', html: ui.icon('info', 22) }),
        ui.h('div', { class: 'me-fail-title', text: '这次没认出来' }),
        ui.h('div', { class: 'me-fail-desc', text: st.failNote || '换个光线重拍，或者手动添加。' })
      ));

      if (st.unmatched.length) {
        body.appendChild(ui.h('div', { class: 'me-raw-head', text: '图里读到的文字' }));
        var raw = ui.h('div', { class: 'me-raw' });
        st.unmatched.slice(0, 20).forEach(function (t) {
          raw.appendChild(ui.h('div', { class: 'me-raw-line', text: t }));
        });
        body.appendChild(raw);
      }

      body.appendChild(ui.h('button', {
        class: 'me-alt-btn me-fail-manual', type: 'button', text: '改用手动添加',
        onclick: function () {
          st.ocrToken++;
          sheet.close();
          later(function () { openManualAdd(); }, 240);
        }
      }));

      footer.appendChild(ui.h('button', {
        class: 'btn btn-secondary', type: 'button', text: '上一步',
        onclick: function () { st.ocrToken++; st.ocrState = 'idle'; stepTo(2); }
      }));
      if (st.image) {
        footer.appendChild(ui.h('button', {
          class: 'btn btn-primary', type: 'button', text: '再试一次',
          onclick: function () { st.ocrState = 'run'; st.parseNote = ''; stepTo('ocr'); }
        }));
      }
    }

    /* 浏览器 / 无原生桥：保留原来的模拟识别流程 */
    function buildFakeOcr() {
      body.appendChild(stepsBar(2));
      var num = ui.h('span', { class: 'me-prog-num', text: '0%' });
      var fill = ui.h('i', { style: { width: '0%' } });
      body.appendChild(ui.h('div', { class: 'me-ocr-head' },
        ui.h('span', { class: 'me-spin' }),
        ui.h('span', { class: 'grow', text: '正在识别课表…' }),
        num
      ));
      body.appendChild(ui.h('div', { class: 'me-prog' }, fill));
      var lines = ui.h('div', { class: 'me-ocr-lines' });
      body.appendChild(lines);
      if (st.image) {
        body.appendChild(ui.h('div', { class: 'me-ocr-thumb' },
          ui.h('img', { src: st.image, alt: '正在识别的截图' })
        ));
      }
      body.appendChild(ui.h('div', {
        class: 'me-note',
        html: ui.icon('info', 14) + '<span>原型演示：这里是假识别，约 1.8 秒后返回 4 门示例课程。</span>'
      }));

      var pct = 0, shown = 0;
      every(function () {
        pct = Math.min(100, pct + 4 + Math.random() * 3.5);
        fill.style.width = pct.toFixed(1) + '%';
        num.textContent = Math.round(pct) + '%';
        var want = Math.min(OCR_RESULT.length, Math.floor(pct / 24));
        while (shown < want) {
          lines.appendChild(ui.h('div', { class: 'me-ocr-line' },
            ui.h('span', { class: 'me-ocr-ok', html: ui.icon('check', 12) }),
            ui.h('span', { class: 'grow ellipsis', text: '已识别 · ' + OCR_RESULT[shown].name })
          ));
          shown++;
        }
        if (pct >= 100) {
          clearTimers();
          later(function () {
            st.result = OCR_RESULT.map(function (c) {
              return {
                name: c.name, teacher: c.teacher, room: c.room, tone: c.tone,
                weekday: c.weekday, start: c.start, span: c.span, credit: c.credit
              };
            });
            st.parseNote = '原型演示 · 4 门预置课程';
            stepTo(3);
          }, 260);
        }
      }, 90);
    }

    /* ── Step 3：校对 ──────────────────────────────────── */
    function buildReview() {
      body.appendChild(stepsBar(3));
      body.appendChild(ui.h('div', { class: 'me-res-head' },
        ui.h('span', { class: 'me-res-count', text: '识别到 ' + st.result.length + ' 门课程' }),
        ui.h('span', { class: 'me-res-hint', text: '改名字或删掉不要的' })
      ));
      if (st.parseNote) {
        body.appendChild(ui.h('div', {
          class: 'me-note',
          html: ui.icon('sparkles', 14) + '<span>' + ui.esc(st.parseNote) + '</span>'
        }));
      }
      var listWrap = ui.h('div', { class: 'me-res-list' });
      if (!st.result.length) {
        listWrap.appendChild(ui.h('div', {
          class: 'me-res-empty', text: '都删完了。点「上一步」重新识别一次。'
        }));
      } else {
        st.result.forEach(function (c, i) { listWrap.appendChild(reviewRow(c, i)); });
      }
      body.appendChild(listWrap);
      body.appendChild(ui.h('div', {
        class: 'me-note',
        html: ui.icon('info', 14) + '<span>导入后可以在课表里继续调教室、周次和颜色。</span>'
      }));

      footer.appendChild(ui.h('button', {
        class: 'btn btn-secondary', type: 'button', text: '上一步',
        onclick: function () { stepTo(2); }
      }));
      var n = st.result.length;
      var primary = ui.h('button', {
        class: 'btn btn-primary', type: 'button',
        text: n ? '导入 ' + n + ' 门课程' : '没有可导入的课程',
        onclick: commitImport
      });
      if (!n) primary.setAttribute('disabled', '');
      footer.appendChild(primary);
    }

    function reviewRow(c, i) {
      var meta = D.DAY_NAMES[c.weekday] + ' · 第' + c.start + '-' +
        (c.start + (c.span || 1) - 1) + '节';
      if (c.room) meta += ' · ' + c.room;
      return ui.h('div', { class: 'me-res-row tone-' + (c.tone || 2) },
        ui.h('span', { class: 'me-res-dot' }),
        ui.h('div', { class: 'me-res-main' },
          ui.h('div', { class: 'me-res-namerow' },
            ui.h('input', {
              class: 'me-res-name', type: 'text', value: c.name, placeholder: '课程名',
              'aria-label': '课程名',
              oninput: function (e) { c.name = e.target.value; }
            }),
            ui.h('span', { class: 'me-res-edit', html: ui.icon('pencil', 13) })
          ),
          ui.h('div', { class: 'me-res-meta', text: meta })
        ),
        ui.h('button', {
          class: 'me-res-del', type: 'button', 'aria-label': '删除这门课',
          html: ui.icon('trash', 16),
          onclick: function () {
            st.result.splice(i, 1);
            ui.haptic(6);
            stepTo(3);
          }
        })
      );
    }

    /* ── Step 4：写入数据 ─────────────────────────────── */
    function commitImport() {
      var list = st.result.filter(function (c) { return String(c.name || '').trim(); });
      if (!list.length) { ui.toast('先给课程起个名字'); return; }
      var dfltWeeks = S.weeks(1, 16);
      S.update(function (s) {
        list.forEach(function (c) {
          s.courses.push({
            id: S.uid('c'),
            name: String(c.name).trim(),
            teacher: c.teacher || '',
            room: c.room || '',
            tone: c.tone || 2,
            weekday: c.weekday,
            start: c.start,
            span: c.span || 2,
            weeks: (Array.isArray(c.weeks) && c.weeks.length ? c.weeks.slice() : dfltWeeks.slice()),
            credit: c.credit || 2,
            note: ''
          });
        });
      });
      ui.haptic(10);
      sheet.close();
      ui.toast('已导入 ' + list.length + ' 门课程', { icon: 'check' });
      window.App.go('schedule');
    }

    stepTo(mode === 'shot' || mode === 'screenshot' ? 2 : 1);
  }

  /* ════════════════════════════════════════════════════════════
     页面注册
     ════════════════════════════════════════════════════════════ */
  function render(root) {
    root.appendChild(titleNode());
    root.appendChild(semCard());

    root.appendChild(sectionHead('课表'));
    root.appendChild(ui.h('div', { class: 'list me-list' },
      row({
        icon: 'calendar', color: 'orange', title: '学期设置',
        value: '第 ' + Math.max(1, weekInfo().week) + ' 周 / 共 ' + weekInfo().total + ' 周',
        onClick: openTermSheet
      }),
      row({
        icon: 'clock', color: 'teal', title: '作息时间',
        value: periodSummary(), onClick: openPeriodSheet
      }),
      row({
        icon: 'list', color: 'blue', title: '粘贴导入课表', value: '推荐',
        onClick: function () { window.App.openPasteImport(); }
      }),
      row({
        icon: 'camera', color: 'indigo', title: '截图识别课表', value: '实验',
        onClick: function () { openImport(); }
      }),
      row({ icon: 'share', color: 'green', title: '分享码导入', onClick: openShareImport }),
      row({ icon: 'download', color: 'orange', title: '导出课表', onClick: openExport })
    ));
    root.appendChild(listNote('从教务系统「全选复制」再粘贴最快、最准；截图识别是实验功能，受照片质量影响。'));

    var nInfo = notifInfo();
    root.appendChild(sectionHead('提醒'));
    root.appendChild(ui.h('div', { class: 'list me-list' },
      row({
        icon: 'moon', color: 'red', title: '免打扰时段',
        value: quietSummary(), onClick: openQuietSheet
      }),
      ui.h('button', { class: 'list-row tappable me-row', type: 'button', onclick: askNotify },
        iconSpan('checkCircle', 'teal'),
        ui.h('span', { class: 'lr-title grow ellipsis', text: '通知权限' }),
        ui.h('span', { class: 'lr-value me-row-value ' + nInfo.cls, text: nInfo.text }),
        chevron())
    ));
    root.appendChild(listNote('作业到期前 30 分钟提醒；免打扰时段内不会打扰你。系统通知取决于系统权限。'));

    root.appendChild(sectionHead('外观'));
    root.appendChild(appearanceCard());
    root.appendChild(listNote('三档即时生效，深浅色都只用设计变量。'));

    root.appendChild(sectionHead('每日暖言'));
    root.appendChild(ui.h('div', { class: 'list me-list' },
      row({
        icon: 'sparkles', color: 'blue', title: '暖言设置',
        value: quoteSummary(), onClick: openQuoteSheet
      })
    ));
    root.appendChild(listNote('可以关掉，也可以换成自己写的句子；不占导航栏，只出现在「今日」页。'));

    root.appendChild(sectionHead('数据'));
    root.appendChild(ui.h('div', { class: 'list me-list' },
      row({ icon: 'trash', color: 'red', title: '清空所有数据', danger: true, onClick: resetData })
    ));
    root.appendChild(listNote('会清空本机所有数据，回到一个空课表。'));

    root.appendChild(ui.h('div', { class: 'me-foot' },
      ui.h('div', { class: 'me-foot-ver', text: 'v' + VERSION + ' · 原型' }),
      ui.h('div', { class: 'me-foot-tag', text: '课序 · 不只是课表' })
    ));
  }

  window.Pages.me = {
    title: '我的',
    render: render,
    destroy: function () {}
  };

  /* 课表页 ＋ 菜单会调它；不依赖本页是否渲染过 */
  window.App.openImport = openImport;
})();
