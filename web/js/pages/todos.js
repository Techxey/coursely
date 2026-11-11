/* ══════════════════════════════════════════════════════════════
   课序 · 待办页 —— DDL 收集箱
   window.Pages.todos
   ══════════════════════════════════════════════════════════════ */
window.Pages = window.Pages || {};

(function () {
  'use strict';

  var ui = window.App.ui;
  var D = window.App.D;
  var S = window.App.store;
  var App = window.App;

  /* ── 常量 ── */
  var FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '进行中' },
    { key: 'done', label: '已完成' }
  ];

  var BUCKETS = [
    { key: 'overdue', label: '已逾期', dot: true },
    { key: 'today', label: '今天' },
    { key: 'tomorrow', label: '明天' },
    { key: 'week', label: '本周' },
    { key: 'later', label: '以后' },
    { key: 'done', label: '已完成' }
  ];

  var EMPTY_TEXT = {
    all: ['今天没有 DDL，去自习一会儿？', '点右下角的 ＋ 加作业、考试或小组任务'],
    active: ['都收尾了，挺不错', '去专注页开一个番茄钟吧'],
    done: ['还没有完成的事项', '勾掉第一条，这里就会多一条记录']
  };

  /* ── 页面局部状态（重绘保留） ── */
  var filter = 'all';
  var timers = [];
  var openSheet = null;

  /* ══════════════════════════════════════════════════════════
     小工具
     ══════════════════════════════════════════════════════════ */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function findTodo(state, id) {
    for (var i = 0; i < state.todos.length; i++) {
      if (state.todos[i].id === id) return state.todos[i];
    }
    return null;
  }

  /** Date → datetime-local 的 value */
  function toInputValue(d) {
    var x = new Date(d);
    return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()) +
      'T' + pad2(x.getHours()) + ':' + pad2(x.getMinutes());
  }

  /** datetime-local 的 value → Date（按本地时区解析） */
  function parseInputValue(v) {
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  /** 新建待办的默认截止：今天 23:59，已经过了就明天 23:59 */
  function defaultDue() {
    var d = new Date(D.now());
    d.setHours(23, 59, 0, 0);
    if (d.getTime() <= D.now().getTime()) {
      d.setDate(d.getDate() + 1);
      d.setHours(23, 59, 0, 0);
    }
    return d;
  }

  function uniqueCourses() {
    var seen = {}, out = [];
    (S.state.courses || []).forEach(function (c) {
      if (!c || !c.name || seen[c.name]) return;
      seen[c.name] = true;
      out.push(c);
    });
    return out;
  }

  function courseByName(name) {
    if (!name) return null;
    var list = S.state.courses || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === name) return list[i];
    }
    return null;
  }

  function toneOf(course) {
    var t = course && course.tone;
    return t >= 1 && t <= 8 ? t : 0;
  }

  /** 右侧 DDL 文案 */
  function dueText(todo) {
    var due = new Date(todo.due);
    if (isNaN(due.getTime())) return '未设时间';
    var bucket = D.todoBucket(todo);

    if (bucket === 'done') return ui.md(due);

    if (bucket === 'overdue') {
      var mins = Math.round((D.now() - due) / 60000);
      if (mins < 60) return '逾期 ' + Math.max(1, mins) + ' 分钟';
      if (mins < 1440) return '逾期 ' + Math.round(mins / 60) + ' 小时';
      return '逾期 ' + Math.round(mins / 1440) + ' 天';
    }
    if (bucket === 'today') return '今天 ' + ui.hm(due);
    if (bucket === 'tomorrow') return '明天 ' + ui.hm(due);
    if (bucket === 'week') return ui.wdName(due) + ' ' + ui.hm(due);
    return ui.md(due);
  }

  /** 大标题副文案 */
  function headSub(list) {
    var undone = list.filter(function (t) { return !t.done; });
    if (!list.length) return '还没有待办 · 点右下角的 ＋ 加一条';
    if (!undone.length) return '全部收尾了 · 今天可以早点睡';

    var overdue = 0, todayCount = 0;
    undone.forEach(function (t) {
      if (D.isOverdue(t)) overdue++;
      if (D.todoBucket(t) === 'today') todayCount++;
    });

    var sub = '还有 ' + undone.length + ' 件事没收尾';
    if (overdue) {
      sub += ' · 最近 ' + overdue + ' 项已逾期';
    } else if (todayCount) {
      sub += ' · 今天有 ' + todayCount + ' 项到期';
    } else {
      var next = undone.slice().sort(function (a, b) { return new Date(a.due) - new Date(b.due); })[0];
      sub += ' · 最近一项 ' + D.relText(next.due) + '到期';
    }
    return sub;
  }

  function stats(list) {
    var undone = 0, todayCount = 0, done = 0;
    list.forEach(function (t) {
      if (t.done) { done++; return; }
      undone++;
      if (D.todoBucket(t) === 'today') todayCount++;
    });
    return { undone: undone, today: todayCount, done: done };
  }

  /* ══════════════════════════════════════════════════════════
     渲染
     ══════════════════════════════════════════════════════════ */
  function buildTitle(list) {
    return ui.h('div', { class: 'large-title' },
      '待办',
      ui.h('span', { class: 'lt-sub', text: headSub(list) })
    );
  }

  function buildOverview(list) {
    var st = stats(list);
    var cells = [
      { num: st.undone, label: '未完成', tone: '' },
      { num: st.today, label: '今天到期', tone: 'is-orange' },
      { num: st.done, label: '已完成', tone: 'is-green' }
    ];
    return ui.h('div', { class: 'card todos-overview' }, cells.map(function (c) {
      return ui.h('div', { class: 'todos-stat' },
        ui.h('div', {
          class: 'todos-stat-num ' + (c.num ? c.tone : 'is-zero'),
          text: String(c.num)
        }),
        ui.h('div', { class: 'todos-stat-label', text: c.label })
      );
    }));
  }

  function buildSeg() {
    var el = ui.h('div', { class: 'seg todos-seg', role: 'tablist', 'aria-label': '筛选待办' });
    FILTERS.forEach(function (f) {
      el.appendChild(ui.h('button', {
        class: 'seg-item' + (filter === f.key ? ' on' : ''),
        type: 'button',
        role: 'tab',
        dataset: { filter: f.key },
        'aria-selected': filter === f.key ? 'true' : 'false',
        text: f.label,
        onclick: function () {
          if (filter === f.key) return;
          filter = f.key;
          ui.haptic(4);
          App.refresh();
        }
      }));
    });
    return el;
  }

  function sorter(key) {
    if (key === 'done') {
      return function (a, b) {
        return new Date(b.doneAt || b.due) - new Date(a.doneAt || a.due);
      };
    }
    return function (a, b) { return new Date(a.due) - new Date(b.due); };
  }

  function groupHead(b, items) {
    var right;
    if (b.key === 'done') {
      right = ui.h('div', { class: 'todos-head-right' },
        ui.h('span', { class: 'todos-count', text: items.length + ' 项' }),
        ui.h('button', { class: 'sh-action todos-clear', type: 'button', text: '清空', onclick: clearDone })
      );
    } else {
      right = ui.h('span', { class: 'todos-count', text: items.length + ' 项' });
    }
    return ui.h('div', { class: 'section-head' },
      ui.h('span', { class: 'todos-group-title' },
        b.dot ? ui.h('span', { class: 'todos-dot' }) : null,
        b.label
      ),
      right
    );
  }

  function coursePill(name, course) {
    var tone = toneOf(course);
    return ui.h('span', {
      class: 'tone-pill todos-pill' + (tone ? ' tone-' + tone : ' plain')
    },
      ui.h('span', { class: 'tone-dot' }),
      ui.h('span', { class: 'todos-pill-name', text: name })
    );
  }

  function buildRow(todo, bucket) {
    var done = !!todo.done;
    var course = courseByName(todo.courseName);

    /* 圆形复选框 */
    var check = ui.h('button', {
      class: 'todos-check' + (done ? ' on' : ''),
      type: 'button',
      'aria-label': done ? '标记为未完成' : '标记为已完成',
      'aria-pressed': done ? 'true' : 'false',
      onclick: function (e) {
        e.stopPropagation();
        toggleTodo(todo, row, check);
      }
    }, ui.h('span', { class: 'todos-check-box', html: ui.icon('check', 13) }));

    var main = ui.h('div', { class: 'todos-main' },
      ui.h('div', { class: 'todos-title', text: todo.title }),
      todo.courseName ? coursePill(todo.courseName, course) : null
    );

    var dueClass = 'todos-due';
    if (!done && bucket === 'overdue') dueClass += ' overdue';
    else if (!done && bucket === 'today') dueClass += ' today';

    var due = ui.h('div', { class: dueClass, text: dueText(todo) });

    var row = ui.h('div', {
      class: 'todos-row list-row tappable' + (done ? ' done' : ''),
      role: 'button',
      tabindex: '0',
      'aria-label': (done ? '已完成：' : '待办：') + todo.title,
      onclick: function () { openEditor(todo); },
      onkeydown: function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openEditor(todo);
        }
      }
    }, check, main, due);

    return row;
  }

  function buildEmpty() {
    var t = EMPTY_TEXT[filter] || EMPTY_TEXT.all;
    return ui.h('div', { class: 'empty todos-empty' },
      ui.h('div', { class: 'em-icon', html: ui.icon('checkCircle', 28) }),
      ui.h('div', { class: 'em-title', text: t[0] }),
      ui.h('div', { class: 'em-desc', text: t[1] })
    );
  }

  function buildGroups(list) {
    var wrap = ui.h('div', { class: 'todos-body' });
    var groups = {};
    BUCKETS.forEach(function (b) { groups[b.key] = []; });
    list.forEach(function (t) { groups[D.todoBucket(t)].push(t); });
    BUCKETS.forEach(function (b) { groups[b.key].sort(sorter(b.key)); });

    var visible = BUCKETS.filter(function (b) {
      if (filter === 'done') return b.key === 'done';
      if (filter === 'active') return b.key !== 'done';
      return true;
    });

    var shown = 0;
    visible.forEach(function (b) {
      var items = groups[b.key];
      if (!items.length) return;
      shown += items.length;
      wrap.appendChild(groupHead(b, items));
      var listEl = ui.h('div', { class: 'list' });
      items.forEach(function (t) { listEl.appendChild(buildRow(t, b.key)); });
      wrap.appendChild(listEl);
    });

    if (!shown) wrap.appendChild(buildEmpty());
    return wrap;
  }

  /* ══════════════════════════════════════════════════════════
     交互：勾选 / 清空 / 删除
     ══════════════════════════════════════════════════════════ */
  function toggleTodo(todo, row, check) {
    var next = !todo.done;
    var id = todo.id;
    ui.haptic(6);
    check.classList.toggle('on', next);
    check.setAttribute('aria-pressed', next ? 'true' : 'false');
    row.classList.toggle('done', next);

    var timer = setTimeout(function () {
      timers = timers.filter(function (x) { return x !== timer; });
      S.update(function (s) {
        var t = findTodo(s, id);
        if (!t) return;
        t.done = next;
        if (next) t.doneAt = new Date().toISOString();
        else delete t.doneAt;
      });
    }, 190);
    timers.push(timer);
  }

  function clearDone() {
    var n = S.state.todos.filter(function (t) { return t.done; }).length;
    if (!n) return;
    ui.confirm({
      title: '清空已完成',
      message: '会删除 ' + n + ' 条已完成的待办，不能撤销',
      confirm: '清空', cancel: '取消'
    }).then(function (ok) {
      if (!ok) return;
      S.update(function (s) {
        s.todos = s.todos.filter(function (t) { return !t.done; });
      });
      ui.toast('已清空', { icon: 'trash' });
    });
  }

  /* ══════════════════════════════════════════════════════════
     新建 / 编辑 sheet
     ══════════════════════════════════════════════════════════ */
  function closeCurrentSheet() {
    if (!openSheet) return;
    try { openSheet.close(); } catch (e) { /* 已关闭 */ }
    openSheet = null;
  }

  /** 把一个横向滚动的 chip 滚进可视区（不触碰页面纵向滚动） */
  function centerChip(scroller, chip) {
    if (!scroller || !chip) return;
    var a = chip.getBoundingClientRect();
    var b = scroller.getBoundingClientRect();
    scroller.scrollLeft += (a.left - b.left) - 12;
  }

  function openEditor(todo) {
    if (openSheet) return;
    var isEdit = !!todo;
    var due0 = isEdit ? new Date(todo.due) : defaultDue();
    if (isNaN(due0.getTime())) due0 = defaultDue();

    var courses = uniqueCourses();
    var selectedCourse = isEdit ? (todo.courseName || '') : '';

    /* ── 标题 ── */
    var titleInput = ui.h('input', {
      class: 'input',
      type: 'text',
      placeholder: '比如：实验报告三',
      maxlength: '80',
      autocomplete: 'off',
      spellcheck: 'false',
      value: isEdit ? todo.title : ''
    });

    /* ── 课程 chips ── */
    function hintText(name) {
      if (!name) return '不关联课程也可以';
      var c = courseByName(name);
      if (!c) return '';
      return D.DAY_NAMES[c.weekday] + ' ' + D.periodText(c) + ' · ' + c.room;
    }

    var hint = ui.h('div', { class: 'todos-hint', text: hintText(selectedCourse) });
    var chips = ui.h('div', { class: 'hr-scroll todos-chips', role: 'group', 'aria-label': '关联课程' });

    var defs = [{ name: '', label: '不关联', tone: 0 }].concat(courses.map(function (c) {
      return { name: c.name, label: c.name, tone: toneOf(c) };
    }));

    function selectCourse(name) {
      selectedCourse = name;
      ui.haptic(4);
      ui.$$('.todos-chip', chips).forEach(function (el) {
        el.classList.toggle('on', el.dataset.course === name);
      });
      hint.textContent = hintText(name);
    }

    defs.forEach(function (def) {
      chips.appendChild(ui.h('button', {
        class: 'chip todos-chip' + (def.name === selectedCourse ? ' on' : '') +
          (def.tone ? ' tone-' + def.tone : ''),
        type: 'button',
        dataset: { course: def.name },
        onclick: function () { selectCourse(def.name); }
      },
        def.tone ? ui.h('span', { class: 'tone-dot' }) : null,
        ui.h('span', { text: def.label })
      ));
    });

    /* ── 截止时间 ── */
    var timeInput = ui.h('input', {
      class: 'input todos-datetime',
      type: 'datetime-local',
      value: toInputValue(due0)
    });

    function applyQuick(days) {
      var cur = parseInputValue(timeInput.value) || defaultDue();
      var day = S.addDays(D.today(), days);
      day.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
      timeInput.value = toInputValue(day);
      ui.haptic(4);
    }

    var quick = ui.h('div', { class: 'todos-quick' },
      quickChip('今天', 0),
      quickChip('明天', 1),
      quickChip('三天后', 3)
    );

    function quickChip(label, days) {
      return ui.h('button', {
        class: 'chip todos-quick-chip',
        type: 'button',
        text: label,
        onclick: function () { applyQuick(days); }
      });
    }

    /* ── 表单 ── */
    var form = ui.h('div', { class: 'todos-form' },
      ui.h('div', { class: 'field' },
        ui.h('div', { class: 'field-label', text: '内容' }),
        titleInput
      ),
      ui.h('div', { class: 'field' },
        ui.h('div', { class: 'field-label', text: '关联课程' }),
        chips,
        hint
      ),
      ui.h('div', { class: 'field' },
        ui.h('div', { class: 'field-label', text: '截止时间' }),
        timeInput,
        quick,
        ui.h('div', { class: 'todos-hint', text: '到期前 1 小时会提醒你' })
      )
    );

    /* ── 底部按钮 ── */
    function onSave() {
      var title = titleInput.value.replace(/\s+/g, ' ').trim();
      if (!title) {
        ui.toast('先给这条待办起个名字');
        titleInput.focus();
        return;
      }
      var when = parseInputValue(timeInput.value) || defaultDue();
      var courseName = selectedCourse || '';
      closeCurrentSheet();
      if (!isEdit) filter = 'all';

      S.update(function (s) {
        if (isEdit) {
          var t = findTodo(s, todo.id);
          if (!t) return;
          t.title = title;
          t.courseName = courseName;
          t.due = when.toISOString();
        } else {
          s.todos.push({
            id: S.uid('t'),
            title: title,
            courseName: courseName,
            due: when.toISOString(),
            done: false,
            createdAt: new Date().toISOString()
          });
        }
      });
      ui.toast(isEdit ? '已保存' : '已添加', { icon: 'check' });
    }

    function onDelete() {
      ui.confirm({
        title: '删除这条待办？',
        message: todo.title,
        confirm: '删除', cancel: '取消'
      }).then(function (ok) {
        if (!ok) return;
        var id = todo.id;
        closeCurrentSheet();
        S.update(function (s) {
          s.todos = s.todos.filter(function (t) { return t.id !== id; });
        });
        ui.toast('已删除', { icon: 'trash' });
      });
    }

    var footer = ui.h('div', { class: 'todos-footer' },
      isEdit ? ui.h('button', {
        class: 'btn btn-danger btn-del',
        type: 'button',
        html: ui.icon('trash', 18) + '<span>删除</span>',
        onclick: onDelete
      }) : null,
      ui.h('button', {
        class: 'btn btn-primary', type: 'button', text: '保存', onclick: onSave
      })
    );

    var api = ui.sheet({
      title: isEdit ? '编辑待办' : '新建待办',
      className: 'todos-sheet',
      body: form,
      footer: footer,
      onMount: function () {
        centerChip(chips, chips.querySelector('.todos-chip.on'));
        if (!isEdit) { try { titleInput.focus(); } catch (e) { /* ignore */ } }
      },
      onClose: function () { if (openSheet === api) openSheet = null; }
    });
    openSheet = api;

    return api;
  }

  /* ══════════════════════════════════════════════════════════
     页面注册
     ══════════════════════════════════════════════════════════ */
  function render(root) {
    var list = (S.state.todos || []).slice();

    root.appendChild(buildTitle(list));
    root.appendChild(buildOverview(list));
    root.appendChild(buildSeg());
    root.appendChild(buildGroups(list));
    root.appendChild(ui.h('div', { class: 'todos-spacer' }));

    App.setFab({
      icon: 'plus',
      label: '新建待办',
      onClick: function () { openEditor(null); }
    });
  }

  function destroy() {
    timers.forEach(function (id) { clearTimeout(id); });
    timers = [];
    closeCurrentSheet();
  }

  window.Pages.todos = {
    title: '待办',
    render: render,
    destroy: destroy
  };
})();
