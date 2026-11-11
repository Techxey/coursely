/* ══════════════════════════════════════════════════════════════
   课序 · 课表页（周视图 · 课程详情 · 增删改）
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = window.App.ui, D = window.App.D, S = window.App.store;
  var h = ui.h, icon = ui.icon;

  var ROW = 56;          // 每小节高度（与 css 保持一致）
  var selWeek = null;    // 当前查看的周次（模块级，切换 tab 后保留）

  function currentWeek() { return Math.max(1, Math.min(S.state.settings.totalWeeks || 20, D.weekOf())); }

  /* ── 周次选择条 ── */
  function weekStrip(week, total) {
    var thisWeek = currentWeek();
    var strip = h('div', { class: 'sch-weeks' });
    for (var w = 1; w <= total; w++) {
      (function (w) {
        var b = h('button', {
          class: 'sch-week' + (w === week ? ' on' : '') + (w === thisWeek ? ' is-current' : ''),
          type: 'button', text: '第' + w + '周'
        });
        b.onclick = function () {
          if (selWeek === w) return;
          ui.haptic(6);
          selWeek = w;
          window.App.refresh();
        };
        strip.appendChild(b);
      })(w);
    }
    setTimeout(function () {
      var on = strip.querySelector('.on');
      if (on) strip.scrollLeft = Math.max(0, on.offsetLeft - 90);
    }, 0);
    return strip;
  }

  /* ── 网格 ── */
  function block(c) {
    var top = (c.start - 1) * ROW + 2;
    var height = (c.span || 1) * ROW - 4;
    var node = h('div', {
      class: 'sch-course tone-' + c.tone + ((c.span || 1) === 1 ? ' one-line' : ''),
      style: { top: top + 'px', height: height + 'px' },
      role: 'button', tabindex: '0'
    },
      h('div', { class: 'sc-name', text: c.name }),
      (c.span || 1) > 1 ? h('div', { class: 'sc-room', text: c.room }) : null
    );
    node.onclick = function (e) {
      e.stopPropagation();
      ui.haptic(6);
      openCourseDetail(c);
    };
    return node;
  }

  function nowLineY() {
    var periods = S.state.settings.periods;
    var nowD = D.now(), day = D.today();
    var first = D.atTime(day, periods[0][0]);
    var last = D.atTime(day, periods[periods.length - 1][1]);
    if (nowD < first || nowD > last) return null;
    for (var i = 0; i < periods.length; i++) {
      var a = D.atTime(day, periods[i][0]);
      var b = D.atTime(day, periods[i][1]);
      if (nowD >= a && nowD < b) return i * ROW + (nowD - a) / (b - a) * ROW;
      if (i < periods.length - 1) {
        var nx = D.atTime(day, periods[i + 1][0]);
        if (nowD >= b && nowD < nx) return (i + 1) * ROW - 3;
      }
    }
    return null;
  }

  function grid(week) {
    var isThisWeek = week === currentWeek();
    var todayWd = D.now().getDay() || 7;

    var head = h('div', { class: 'sch-head' }, h('div', { class: 'hc' }));
    for (var wd = 1; wd <= 7; wd++) {
      var d = D.dateOf(week, wd);
      head.appendChild(h('div', { class: 'hc' + (isThisWeek && wd === todayWd ? ' today' : '') },
        h('span', { text: D.DAY_NAMES[wd].replace('周', '') }),
        h('b', { text: String(d.getDate()) })
      ));
    }

    var periods = S.state.settings.periods;
    var times = h('div', { class: 'sch-times' });
    periods.forEach(function (p, i) {
      times.appendChild(h('div', { class: 'sch-slot' },
        h('b', { text: String(i + 1) }),
        h('span', { text: p[0] })
      ));
    });

    var y = isThisWeek ? nowLineY() : null;
    var days = h('div', { class: 'sch-days' });
    var colHeight = (periods.length || 12) * ROW;
    for (var wd2 = 1; wd2 <= 7; wd2++) {
      var col = h('div', {
        class: 'sch-col' + (isThisWeek && wd2 === todayWd ? ' today' : ''),
        style: { height: colHeight + 'px' }
      });
      D.coursesOn(week, wd2).forEach(function (c) { col.appendChild(block(c)); });
      if (isThisWeek && wd2 === todayWd && y != null) {
        col.appendChild(h('div', { class: 'sch-now', style: { top: y + 'px' } }));
      }
      days.appendChild(col);
    }

    return h('div', { class: 'sch-grid' }, head, h('div', { class: 'sch-body' }, times, days));
  }

  /* ── 概要 ── */
  function summary(week) {
    var list = D.coursesInWeek(week);
    var periods = 0;
    list.forEach(function (c) { periods += (c.span || 1); });
    var hours = Math.round(periods * 0.75 * 10) / 10;
    return h('div', { class: 'sch-summary' },
      h('span', { class: 'ss-item' }, h('b', { text: String(list.length) }), ' 节课'),
      h('span', { class: 'ss-item' }, h('b', { text: String(hours) }), ' 小时'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'ss-item', html: icon('info', 13) + ' 点课程看详情' })
    );
  }

  /* ── 课程详情 ── */
  function openCourseDetail(c) {
    var rows = [
      ['user', '教师', c.teacher || '—'],
      ['mapPin', '地点', c.room || '—'],
      ['clock', '时间', D.DAY_FULL[c.weekday] + ' ' + D.periodText(c) + ' · ' + D.timeText(c)],
      ['calendar', '周次', D.weeksText(c)],
      ['cap', '学分', (c.credit || 0) + ' 学分']
    ];
    if (c.note) rows.push(['pencil', '备注', c.note]);

    var list = h('div', { class: 'list' });
    rows.forEach(function (r) {
      list.appendChild(h('div', { class: 'list-row' },
        h('span', {
          class: 'lr-icon',
          style: { background: 'var(--tone-soft)', color: 'var(--tone-ink)' },
          html: icon(r[0], 15)
        }),
        h('span', { class: 'lr-title', style: { fontSize: '15px', flex: '0 0 auto' }, text: r[1] }),
        h('span', {
          class: 'lr-value',
          style: { fontSize: '15px', textAlign: 'right', lineHeight: '1.35' },
          text: r[2]
        })
      ));
    });

    var body = h('div', { class: 'cs-body tone-' + c.tone },
      h('div', { class: 'cs-head' },
        h('div', { class: 'cs-badge', text: String(c.name || '?').slice(0, 1) }),
        h('div', { class: 'grow' },
          h('div', { class: 'cs-title', text: c.name }),
          h('div', { class: 'cs-sub', text: D.DAY_FULL[c.weekday] + ' · ' + D.periodText(c) + ' · ' + D.weeksText(c) })
        )
      ),
      list
    );

    var foot = h('div', { style: { display: 'flex', gap: '10px', width: '100%' } },
      h('button', {
        class: 'btn btn-secondary', style: { flex: '1 1 0' },
        html: icon('pencil', 18) + '<span>编辑</span>',
        onclick: function () {
          api.close();
          setTimeout(function () { openCourseForm(c); }, 200);
        }
      }),
      h('button', {
        class: 'btn btn-danger', style: { flex: '1 1 0' },
        html: icon('trash', 18) + '<span>删除</span>',
        onclick: function () {
          ui.confirm({
            title: '删除这门课？',
            message: '「' + c.name + '」将从课表中移除，无法恢复',
            confirm: '删除'
          }).then(function (ok) {
            if (!ok) return;
            S.update(function (s) {
              s.courses = s.courses.filter(function (x) { return x.id !== c.id; });
            });
            api.close();
            ui.toast('已删除');
          });
        }
      })
    );

    var api = ui.sheet({ title: '课程详情', body: body, footer: foot });
  }

  /* ── 表单 ── */
  function parseWeeks(c) {
    if (!c || !c.weeks || !c.weeks.length) return { from: 1, to: 16, parity: 'all' };
    var w = c.weeks.slice().sort(function (a, b) { return a - b; });
    var odd = w.every(function (x) { return x % 2 === 1; });
    var even = w.every(function (x) { return x % 2 === 0; });
    var parity = 'all';
    if (w.length > 1 && odd) parity = 'odd';
    else if (w.length > 1 && even) parity = 'even';
    return { from: w[0], to: w[w.length - 1], parity: parity };
  }

  function field(label, control) {
    return h('div', { class: 'field' }, h('div', { class: 'field-label', text: label }), control);
  }

  function numSelect(min, max, value, onChange, labeler) {
    var sel = h('select', { class: 'select' });
    for (var i = min; i <= max; i++) {
      sel.appendChild(h('option', { value: String(i), text: labeler ? labeler(i) : String(i) }));
    }
    sel.value = String(value);
    sel.onchange = function () { onChange(Number(sel.value)); };
    return sel;
  }

  /* ── ＋ 菜单：手动添加 / 截图导入 / 分享码 ── */
  function openAddMenu() {
    var rows = [
      { icon: 'pencil', bg: 'var(--blue)', title: '手动添加一门课', desc: '自己填，最稳妥', run: function () { openCourseForm(); } },
      { icon: 'list', bg: 'var(--teal)', title: '粘贴导入课表', desc: '从教务系统复制粘贴，最准', run: function () { if (window.App.openPasteImport) window.App.openPasteImport(); else ui.toast('导入功能暂不可用'); } },
      { icon: 'camera', bg: 'var(--indigo)', title: '截图识别（实验）', desc: '拍照识别，受照片质量影响', run: function () { if (window.App.openImport) window.App.openImport('shot'); else ui.toast('导入功能暂不可用'); } },
      { icon: 'share', bg: 'var(--green)', title: '粘贴分享码', desc: '同学发来的一串码，一键搬课表', run: function () { if (window.App.openImport) window.App.openImport('code'); else ui.toast('导入功能暂不可用'); } }
    ];
    var list = h('div', { class: 'list' });
    rows.forEach(function (r) {
      var row = h('div', { class: 'list-row tappable' },
        h('span', { class: 'lr-icon', style: { background: r.bg }, html: icon(r.icon, 17) }),
        h('span', { class: 'grow' },
          h('div', { class: 'lr-title', text: r.title }),
          h('div', { class: 'sch-menu-desc', text: r.desc })
        ),
        h('span', { class: 'lr-chevron', html: icon('chevronRight', 15) })
      );
      row.onclick = function () {
        ui.haptic(6);
        api.close();
        setTimeout(function () { r.run(); }, 220);
      };
      list.appendChild(row);
    });
    var api = ui.sheet({
      title: '添加到课表',
      body: h('div', { class: 'sch-menu' }, list),
      className: 'sch-sheet'
    });
  }

  function openCourseForm(course) {
    var isEdit = !!course;
    var totalWeeks = S.state.settings.totalWeeks || 20;
    var periodCount = (S.state.settings.periods || []).length || 12;
    var pw = parseWeeks(course);
    var f = {
      name: course ? course.name : '',
      teacher: course ? course.teacher || '' : '',
      room: course ? course.room || '' : '',
      weekday: course ? course.weekday : (D.now().getDay() || 7),
      start: course ? Math.min(course.start, periodCount) : 1,
      span: course ? course.span || 1 : 2,
      tone: course ? course.tone : ((S.state.courses.length % 8) + 1),
      from: pw.from, to: pw.to, parity: pw.parity
    };

    var body = h('div', { class: 'sch-form' });

    body.appendChild(field('课程名称',
      h('input', {
        class: 'input', type: 'text', value: f.name, placeholder: '例如：数据结构与算法',
        autocomplete: 'off',
        oninput: function (e) { f.name = e.target.value; }
      })
    ));

    body.appendChild(h('div', { class: 'sch-form-row' },
      field('教师', h('input', {
        class: 'input', type: 'text', value: f.teacher, placeholder: '王建国',
        oninput: function (e) { f.teacher = e.target.value; }
      })),
      field('地点', h('input', {
        class: 'input', type: 'text', value: f.room, placeholder: '教三-201',
        oninput: function (e) { f.room = e.target.value; }
      }))
    ));

    /* 星期 */
    var wdWrap = h('div', { class: 'sch-wd' });
    for (var w = 1; w <= 7; w++) {
      (function (w) {
        var b = h('button', {
          type: 'button', class: w === f.weekday ? 'on' : '', text: D.DAY_SHORT[w]
        });
        b.onclick = function () {
          f.weekday = w;
          ui.haptic(5);
          ui.$$('button', wdWrap).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        };
        wdWrap.appendChild(b);
      })(w);
    }
    body.appendChild(field('星期', wdWrap));

    /* 节次 */
    body.appendChild(h('div', { class: 'sch-form-row' },
      field('开始节次', numSelect(1, periodCount, f.start, function (v) {
        f.start = v;
        if (f.start + f.span - 1 > periodCount) { f.span = periodCount - f.start + 1; }
        refreshHint();
      }, function (i) {
        var t = D.periodTime(i);
        return '第 ' + i + ' 节 · ' + t.start;
      })),
      field('连上节次', numSelect(1, Math.min(4, periodCount), f.span, function (v) {
        f.span = v;
        if (f.start + f.span - 1 > periodCount) { f.start = periodCount - f.span + 1; }
        refreshHint();
      }, function (i) { return i + ' 节'; }))
    ));

    /* 周次 */
    body.appendChild(h('div', { class: 'sch-form-row' },
      field('从第几周', numSelect(1, totalWeeks, f.from, function (v) { f.from = v; refreshHint(); }, function (i) { return i; })),
      field('到第几周', numSelect(1, totalWeeks, f.to, function (v) { f.to = v; refreshHint(); }, function (i) { return i; }))
    ));

    var seg = h('div', { class: 'seg', style: { margin: '0' } });
    [['all', '每周'], ['odd', '单周'], ['even', '双周']].forEach(function (p) {
      var b = h('button', {
        type: 'button', class: 'seg-item' + (f.parity === p[0] ? ' on' : ''), text: p[1]
      });
      b.onclick = function () {
        f.parity = p[0];
        ui.haptic(5);
        ui.$$('.seg-item', seg).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        refreshHint();
      };
      seg.appendChild(b);
    });
    body.appendChild(seg);

    /* 颜色 */
    var tones = h('div', { class: 'sch-tones-wrap' });
    for (var t = 1; t <= 8; t++) {
      (function (t) {
        var b = h('button', {
          type: 'button',
          class: 'sch-tone tone-' + t + (f.tone === t ? ' on' : ''),
          'aria-label': '配色 ' + t,
          html: icon('check', 16)
        });
        b.onclick = function () {
          f.tone = t;
          ui.haptic(5);
          ui.$$('.sch-tone', tones).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        };
        tones.appendChild(b);
      })(t);
    }
    body.appendChild(field('课程配色', tones));

    var hint = h('div', { class: 'sch-hint' });
    function refreshHint() {
      var from = Math.min(f.from, f.to), to = Math.max(f.from, f.to);
      var we = S.weeks(from, to, f.parity);
      var t1 = D.periodTime(f.start), t2 = D.periodTime(f.start + f.span - 1);
      hint.innerHTML = icon('info', 13) + '<span>' + D.DAY_FULL[f.weekday] + ' · 第 ' + f.start + '–' +
        (f.start + f.span - 1) + ' 节 · ' + t1.start + '–' + t2.end + ' · 共 ' + we.length + ' 周</span>';
    }
    refreshHint();
    body.appendChild(hint);

    /* 保存 */
    function save() {
      if (!String(f.name).trim()) {
        ui.toast('先给课程起个名字');
        var inp = body.querySelector('input');
        if (inp) inp.focus();
        return;
      }
      var from = Math.min(f.from, f.to), to = Math.max(f.from, f.to);
      var weeks = S.weeks(from, to, f.parity);
      var data = {
        name: f.name.trim(), teacher: f.teacher.trim(), room: f.room.trim(),
        tone: f.tone, weekday: f.weekday, start: f.start, span: f.span, weeks: weeks
      };

      var clash = S.state.courses.filter(function (x) {
        if (course && x.id === course.id) return false;
        if (x.weekday !== data.weekday) return false;
        var overlap = !(x.start + (x.span || 1) <= data.start ||
          data.start + data.span <= x.start);
        if (!overlap) return false;
        return x.weeks.some(function (w) { return weeks.indexOf(w) !== -1; });
      });

      var go = function () {
        S.update(function (s) {
          if (course) {
            var t = s.courses.filter(function (x) { return x.id === course.id; })[0];
            if (t) Object.assign(t, data);
          } else {
            s.courses.push(Object.assign({ id: S.uid('c'), credit: 0, note: '' }, data));
          }
        });
        api.close();
        ui.toast(course ? '已保存' : '已加入课表');
      };

      if (clash.length) {
        ui.confirm({
          title: '时间冲突',
          message: '和「' + clash[0].name + '」在同一时段，仍然保存吗？',
          confirm: '仍然保存'
        }).then(function (ok) { if (ok) go(); });
        return;
      }
      go();
    }

    var foot = h('div', { style: { display: 'flex', gap: '10px', width: '100%' } },
      h('button', {
        class: 'btn btn-primary btn-block',
        html: icon(isEdit ? 'check' : 'plus', 18) + '<span>' + (isEdit ? '保存修改' : '加入课表') + '</span>',
        onclick: save
      })
    );

    var api = ui.sheet({
      title: isEdit ? '编辑课程' : '添加课程',
      body: body,
      footer: foot,
      className: 'sch-sheet'
    });

    setTimeout(function () {
      var inp = body.querySelector('input');
      if (inp && !isEdit) { /* 不自动聚焦，避免移动端键盘弹起遮挡 */ }
    }, 100);
  }

  /* ── 空课表引导（不画网格，直接给入口） ── */
  function emptyOnboard() {
    var wrap = h('div', { class: 'empty sch-empty' },
      h('div', { class: 'em-icon', html: icon('grid', 26) }),
      h('div', { class: 'em-title', text: '还没有课表' }),
      h('div', {
        class: 'em-desc',
        text: '从教务系统长按复制课表，粘贴进来就自动排好；也可以手动加一门。'
      })
    );
    wrap.appendChild(h('div', { class: 'sch-empty-actions' },
      h('button', {
        class: 'btn btn-primary', type: 'button',
        html: icon('list', 17) + '<span>粘贴导入</span>',
        onclick: function () {
          ui.haptic(6);
          if (window.App.openPasteImport) window.App.openPasteImport();
          else ui.toast('导入功能暂不可用');
        }
      }),
      h('button', {
        class: 'btn btn-secondary', type: 'button', text: '手动添加',
        onclick: function () { ui.haptic(6); openCourseForm(); }
      })
    ));
    return wrap;
  }

  /* ── 页面 ── */
  window.Pages = window.Pages || {};
  window.Pages.schedule = {
    title: '课表',
    navActions: function () {
      var acts = [];
      if (selWeek && selWeek !== currentWeek()) {
        acts.push(h('button', {
          class: 'nav-action', type: 'button', text: '本周',
          onclick: function () {
            ui.haptic(6);
            selWeek = currentWeek();
            window.App.refresh();
          }
        }));
      }
      acts.push(h('button', {
        class: 'nav-action', type: 'button', 'aria-label': '添加课程',
        html: icon('plus', 24),
        onclick: function () { ui.haptic(8); openAddMenu(); }
      }));
      return acts;
    },
    render: function (root) {
      var total = S.state.settings.totalWeeks || 20;
      if (!selWeek) selWeek = currentWeek();
      var week = Math.max(1, Math.min(total, selWeek));

      var a = D.dateOf(week, 1), b = D.dateOf(week, 7);
      var list = D.coursesInWeek(week);

      root.appendChild(h('div', { class: 'large-title' }, '课表',
        h('span', {
          class: 'lt-sub',
          text: '第 ' + week + ' 周 · ' + ui.md(a) + ' – ' + ui.md(b) + ' · ' + list.length + ' 节课'
        })
      ));

      if (!S.state.courses.length) {
        // 全新空课表：不画网格，直接给导入入口
        root.appendChild(emptyOnboard());
        root.appendChild(h('div', { style: { height: '20px' } }));
        return;
      }

      root.appendChild(weekStrip(week, total));
      root.appendChild(grid(week));
      root.appendChild(summary(week));

      if (!list.length) {
        root.appendChild(h('div', { class: 'empty' },
          h('div', { class: 'em-icon', html: icon('sun', 28) }),
          h('div', { class: 'em-title', text: '这一周没有课' }),
          h('div', { class: 'em-desc', text: '可能是假期，或者还没排课。点右上角 ＋ 手动添加。' })
        ));
      }

      root.appendChild(h('div', { style: { height: '20px' } }));
    }
  };

  /* 供「今日」页复用 */
  window.App.openCourseDetail = openCourseDetail;
  window.App.openCourseForm = openCourseForm;
})();
