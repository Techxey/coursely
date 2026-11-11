/* ══════════════════════════════════════════════════════════════
   课序 · 今日页
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var ui = window.App.ui, D = window.App.D, S = window.App.store;
  var h = ui.h, icon = ui.icon;

  var tick = null;
  function clearTick() { if (tick) { clearInterval(tick); tick = null; } }

  function sectionHead(title, action, onAction) {
    return h('div', { class: 'section-head' },
      h('span', { text: title }),
      action ? h('button', { class: 'sh-action', type: 'button', text: action, onclick: onAction }) : null
    );
  }

  /* ── 空课表：第一屏就直接引导导入 ── */
  function onboardCard() {
    var card = h('div', { class: 'today-hero rest today-onboard', role: 'button', tabindex: '0' },
      h('div', { class: 'h-eyebrow', text: '还没有课表' }),
      h('div', { class: 'h-name', text: '30 秒把课表搬进来' }),
      h('div', { class: 'h-meta' },
        h('span', { class: 'hm-i', html: icon('list', 13) + '从教务系统长按复制，粘贴即可' })
      ),
      h('span', { class: 'h-arrow', html: icon('chevronRight', 17) })
    );
    function go() {
      ui.haptic(6);
      if (window.App.openPasteImport) window.App.openPasteImport();
      else window.App.go('schedule');
    }
    card.addEventListener('click', go);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
    return card;
  }

  /* ── 下一节课 hero ── */
  function heroCard(n) {
    if (!S.state.courses.length) return onboardCard();
    if (!n) {
      return h('div', { class: 'today-hero rest' },
        h('div', { class: 'h-eyebrow', text: '今天没有更多课了' }),
        h('div', { class: 'h-name', text: '好好休息一下' }),
        h('div', { class: 'h-meta' }, h('span', { class: 'hm-i', html: icon('sparkles', 13) + '去课表看看接下来的安排' }))
      );
    }

    var c = n.course;
    var live = n.state === 'now';
    var sameDay = n.daysAhead === 0;

    var eyebrow, bigText, subText;
    if (live) {
      eyebrow = '正在上课';
      bigText = D.countdown(n.end - D.now());
      subText = '剩余';
    } else if (sameDay) {
      eyebrow = '下一节课';
      bigText = D.countdown(n.start - D.now());
      subText = '后开始';
    } else {
      eyebrow = '下一节课 · ' + (n.daysAhead === 1 ? '明天' : ui.wdName(n.start));
      bigText = ui.hm(n.start);
      subText = '开始';
    }

    var card = h('div', { class: 'today-hero tone-' + c.tone, role: 'button', tabindex: '0' },
      h('div', { class: 'h-top' },
        h('div', { class: 'h-main' },
          h('div', { class: 'h-eyebrow' },
            live ? h('i', { class: 'h-live' }) : null,
            h('span', { text: eyebrow })
          ),
          h('div', { class: 'h-name', text: c.name }),
          h('div', { class: 'h-meta' },
            h('span', { class: 'hm-i', html: icon('clock', 13) + D.periodText(c) + ' · ' + D.timeText(c) }),
            h('span', { class: 'hm-i', html: icon('mapPin', 13) + ui.esc(c.room) })
          )
        ),
        h('div', { class: 'h-count' },
          h('b', { class: 'js-count', text: bigText }),
          h('span', { text: subText })
        )
      ),
      h('span', { class: 'h-arrow', html: icon('chevronRight', 17) })
    );

    card.addEventListener('click', function () {
      ui.haptic(6);
      if (window.App.openCourseDetail) window.App.openCourseDetail(c);
      else window.App.go('schedule');
    });
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter') card.click(); });

    /* 每秒刷新倒计时 */
    clearTick();
    if (live || sameDay) {
      tick = setInterval(function () {
        var big = card.querySelector('.js-count');
        if (!big) return;
        var fresh = D.nextCourse();
        if (!fresh || fresh.course.id !== c.id) {
          big.textContent = '—';
          clearTick();
          return;
        }
        big.textContent = live ? D.countdown(fresh.end - D.now()) : D.countdown(fresh.start - D.now());
      }, 1000);
    }
    return card;
  }

  /* ── 今日课程时间轴 ── */
  function tomorrowCourses() {
    var d = S.addDays(D.today(), 1);
    return D.coursesOn(D.weekOf(d), d.getDay() || 7);
  }

  function timeline(list, day, isToday) {
    var nowD = D.now();
    if (!list.length) {
      var noCourses = S.state.courses.length === 0;
      return [h('div', { class: 'tl-empty' },
        h('span', { html: icon(noCourses ? 'list' : 'sun', 18) }),
        h('span', {
          class: 'grow',
          text: noCourses ? '还没有课 · 先导入，或去课表页手动加一门' : '今天没有课，适合把欠下的作业清一清'
        })
      )];
    }

    return list.map(function (c) {
      var span = D.courseSpan(c, day);
      var isPast = isToday && span.end < nowD;
      var isNow = isToday && span.start <= nowD && nowD < span.end;
      var badge = isNow ? '进行中' : (isPast ? '已结束' : '第' + c.start + '节');
      var card = h('div', {
        class: 'tl-card tone-' + c.tone + (isPast ? ' past' : '') + (isNow ? ' now' : ''),
        role: 'button', tabindex: '0'
      },
        h('div', { class: 'tc-body' },
          h('div', { class: 'tc-name', text: c.name }),
          h('div', { class: 'tc-sub', html: icon('mapPin', 12) + '<span>' + ui.esc(c.room) + ' · ' + ui.esc(c.teacher) + '</span>' })
        ),
        h('span', { class: 'tc-badge', text: badge })
      );
      card.addEventListener('click', function () {
        ui.haptic(6);
        if (window.App.openCourseDetail) window.App.openCourseDetail(c);
      });
      return h('div', { class: 'tl-item' },
        h('div', { class: 'tl-time' },
          h('b', { text: ui.hm(span.start) }),
          h('span', { text: ui.hm(span.end) })
        ),
        card
      );
    });
  }

  /* ── 待办摘要 ── */
  function dueText(t, bucket) {
    var d = new Date(t.due);
    var hm = ui.hm(d);
    if (bucket === 'overdue') {
      var days = Math.floor((D.today() - S.startOfDay(d)) / 86400000);
      return days >= 1 ? '逾期 ' + days + ' 天' : '逾期 ' + Math.max(1, Math.round((D.now() - d) / 3600000)) + ' 小时';
    }
    if (bucket === 'today') return '今天 ' + hm;
    if (bucket === 'tomorrow') return '明天 ' + hm;
    if (bucket === 'week') return ui.wdName(d) + ' ' + hm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function todoSummary() {
    var list = S.state.todos.filter(function (t) { return !t.done; })
      .sort(function (a, b) { return new Date(a.due) - new Date(b.due); })
      .slice(0, 3);
    if (!list.length) return null;

    var wrap = h('div', { class: 'list today-todo' });
    list.forEach(function (t) {
      var bucket = D.todoBucket(t);
      var cls = bucket === 'overdue' ? 'bad' : (bucket === 'today' ? 'warn' : '');
      var repeatCourse = t.courseName && String(t.title).indexOf(t.courseName) === -1;
      var row = h('div', { class: 'list-row tappable' },
        h('div', { class: 'tt-check' }),
        h('div', { class: 'tt-main' },
          h('div', { class: 'tt-title', text: t.title }),
          repeatCourse ? h('div', { class: 'tt-course', text: t.courseName }) : null
        ),
        h('div', { class: 'tt-due ' + cls, text: dueText(t, bucket) })
      );
      row.addEventListener('click', function () {
        ui.haptic(6);
        window.App.go('todos');
      });
      wrap.appendChild(row);
    });
    return wrap;
  }

  /* ── 快捷入口 ── */
  function quickActions() {
    return h('div', { class: 'today-actions' },
      h('button', {
        class: 'today-action tone-2', type: 'button',
        onclick: function () { ui.haptic(6); window.App.go('focus'); }
      },
        h('span', { class: 'ta-icon', html: icon('timer', 18) }),
        h('span', { class: 'ta-title', text: '开始专注' }),
        h('span', { class: 'ta-sub', text: '番茄钟 · 25 分钟' })
      ),
      h('button', {
        class: 'today-action tone-6', type: 'button',
        onclick: function () {
          ui.haptic(6);
          if (window.App.openPasteImport) window.App.openPasteImport();
          else if (window.App.openImport) window.App.openImport();
          else ui.toast('导入功能在「我的」页里');
        }
      },
        h('span', { class: 'ta-icon', html: icon('list', 18) }),
        h('span', { class: 'ta-title', text: '导入课表' }),
        h('span', { class: 'ta-sub', text: '粘贴 / 截图 / 分享码' })
      )
    );
  }

  /* ── 每日暖言 ── */
  function dailyQuote() {
    var F = window.App.Fortune;
    if (!F) return null;
    var st = S.state.settings;
    if (st.quoteOn === false) return null;          // 用户关掉了
    var nowD = D.now();
    var todayKey = F.ymd(nowD);
    // 只有今天点过「换一条」才用偏移，跨天自动回到当天第一条
    var offset = (st.quoteDay === todayKey) ? (st.quoteOffset || 0) : 0;
    var q = F.forDate(nowD, offset, st.quoteCustom);

    var card = h('div', {
      class: 'today-quote tone-' + q.tone,
      role: 'button', tabindex: '0',
      'aria-label': '每日暖言，点一下换一条'
    },
      h('div', { class: 'dq-head' },
        h('span', { class: 'dq-eyebrow', html: icon('sparkles', 13) + '<span>今日暖言</span>' }),
        h('span', { class: 'dq-date', text: ui.md(nowD) }),
        h('span', { class: 'dq-refresh', html: icon('refresh', 14) })
      ),
      h('p', { class: 'dq-text', text: q.text }),
      q.author ? h('div', { class: 'dq-author', text: q.author }) : null
    );

    function next() {
      ui.haptic(5);
      var base = (S.state.settings.quoteDay === todayKey) ? (S.state.settings.quoteOffset || 0) : 0;
      S.update(function (s) {
        s.settings.quoteDay = todayKey;
        s.settings.quoteOffset = (base + 1) % q.total;
      });
    }
    card.addEventListener('click', next);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
    });
    return card;
  }

  /* ── 周进度 ── */
  function weekProgress() {
    var week = D.weekOf();
    var total = S.state.settings.totalWeeks || 20;
    var pct = Math.max(4, Math.min(100, Math.round(week / total * 100)));
    return h('div', { class: 'today-week' },
      h('span', { class: 'tw-value', text: '第 ' + Math.max(1, week) + ' 周' }),
      h('span', { class: 'tw-bar' }, h('i', { style: { width: pct + '%' } })),
      h('span', { class: 'tw-label', text: '共 ' + total + ' 周' })
    );
  }

  /* ── 页面 ── */
  window.Pages = window.Pages || {};
  window.Pages.today = {
    title: '今日',
    navActions: function () {
      return [h('button', {
        class: 'nav-action', type: 'button', 'aria-label': '课表',
        html: icon('grid', 22),
        onclick: function () { ui.haptic(6); window.App.go('schedule'); }
      })];
    },
    render: function (root) {
      clearTick();
      var nowD = D.now();
      var week = Math.max(1, D.weekOf(nowD));
      var n = D.nextCourse(nowD);
      var todays = D.todayCourses();
      var empty = S.state.courses.length === 0;
      var showTomorrow = todays.length === 0 && !empty;
      var list = showTomorrow ? tomorrowCourses() : todays;
      var day = showTomorrow ? S.addDays(D.today(), 1) : D.today();
      var label = empty ? '还没有课表'
        : (showTomorrow ? '明天 ' + list.length + ' 节课' : '今天 ' + list.length + ' 节课');

      root.appendChild(h('div', { class: 'large-title' }, '今日',
        h('span', {
          class: 'lt-sub',
          text: ui.dateTitle(nowD) + ' · 第 ' + week + ' 周 · ' + label
        })
      ));

      root.appendChild(heroCard(n));
      root.appendChild(weekProgress());
      var quote = dailyQuote();
      if (quote) root.appendChild(quote);

      root.appendChild(sectionHead(
        showTomorrow ? '明天的课' : '今天的课',
        list.length ? '全部 ' + list.length + ' 节' : '去添加',
        function () { window.App.go('schedule'); }));

      var tl = h('div', { class: 'tl' });
      timeline(list, day, !showTomorrow).forEach(function (n2) { tl.appendChild(n2); });
      root.appendChild(tl);

      var todos = todoSummary();
      if (todos) {
        root.appendChild(sectionHead('快到期的作业', '全部',
          function () { window.App.go('todos'); }));
        root.appendChild(todos);
      }

      root.appendChild(sectionHead('快捷操作', ''));
      root.appendChild(quickActions());

      root.appendChild(h('div', { style: { height: '18px' } }));
    },
    destroy: clearTick
  };
})();
