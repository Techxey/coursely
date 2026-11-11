/* ══════════════════════════════════════════════════════════════
   课序 · 粘贴导入课表
   window.App.openPasteImport()
   流程：粘贴文本 → 解析 → 校对（可改名/删行）→ 写入课表 → 跳课表页
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ui = window.App.ui, D = window.App.D, S = window.App.store;
  var h = ui.h, icon = ui.icon;

  var SAMPLE_TABLE = [
    '节次\t周一\t周二\t周三\t周四\t周五',
    '1-2节\t高等数学（上） 教四-201\t\t大学物理（下） 理科楼-305\t\t程序设计基础 计算机楼-208',
    '3-4节\t\t操作系统 教三-402\t\t软件工程 教三-210\t',
    '5-6节\t\t数据结构实验 实验楼A-301\t线性代数 教二-410\t\t'
  ].join('\n');

  var SAMPLE_ROWS = [
    '高等数学（上）,周一,1,2,教四-201,王建国',
    '大学物理（下）,周三,3,4,理科楼-305',
    '线性代数,周四,5,6,教二-410,1-16周'
  ].join('\n');

  function openPasteImport() {
    var st = { text: '', result: null, mode: 'input', list: [] };
    var body = h('div', { class: 'pst' });
    var footer = h('div', { class: 'pst-foot' });

    var sheet = ui.sheet({
      title: '粘贴导入课表',
      subtitle: '不拍照、不联网',
      body: body,
      footer: footer,
      className: 'pst-sheet'
    });

    /* ── 第一步：输入 ───────────────────────────────────── */
    function renderInput() {
      st.mode = 'input';
      body.innerHTML = '';
      footer.innerHTML = '';

      var ta = h('textarea', {
        class: 'textarea pst-ta', rows: '7',
        placeholder: '在这里粘贴课表文本……\n\n· 教务系统网页复制：长按表格 → 全选 → 复制\n· Excel 复制：直接圈选课表区域复制\n· 手写：一行一门，例如\n  高等数学,周一,1,2,教四-201'
      });
      ta.value = st.text;
      ta.addEventListener('input', function () { st.text = ta.value; });

      // 粘贴时把 HTML 表格里的制表符结构尽量保留下来
      ta.addEventListener('paste', function (e) {
        try {
          var cd = e.clipboardData;
          if (!cd) return;
          var plain = cd.getData('text/plain');
          if (plain) { e.preventDefault(); st.text = plain; ta.value = plain; }
        } catch (err) { /* 让它走默认粘贴 */ }
      });

      var howto = h('div', { class: 'pst-howto' },
        h('div', { class: 'pst-step' },
          h('i', { text: '1' }),
          h('span', { html: '手机浏览器打开<b>教务系统 → 我的课表</b>' })),
        h('div', { class: 'pst-step' },
          h('i', { text: '2' }),
          h('span', { html: '长按表格区域 → <b>全选 → 复制</b>' })),
        h('div', { class: 'pst-step' },
          h('i', { text: '3' }),
          h('span', { html: '回到这里<b>粘贴</b>，点「解析」' }))
      );

      var btnRow = h('div', { class: 'pst-btnrow' },
        h('button', {
          class: 'btn btn-secondary btn-sm', type: 'button',
          html: icon('download', 15) + '<span>读剪贴板</span>',
          onclick: readClipboard
        }),
        h('button', {
          class: 'btn btn-secondary btn-sm', type: 'button',
          text: '看示例',
          onclick: function () {
            st.text = SAMPLE_TABLE;
            ta.value = SAMPLE_TABLE;
            ta.classList.add('pst-ta-filled');
            ui.toast('已填入示例表格，可直接点解析');
          }
        }),
        h('button', {
          class: 'btn btn-secondary btn-sm', type: 'button',
          text: '一行一门示例',
          onclick: function () {
            st.text = SAMPLE_ROWS;
            ta.value = SAMPLE_ROWS;
            ui.toast('已填入「一行一门」示例');
          }
        })
      );

      body.appendChild(howto);
      body.appendChild(ta);
      body.appendChild(btnRow);
      body.appendChild(h('div', {
        class: 'me-term-preview',
        style: { marginTop: '12px' },
        html: icon('info', 14) +
          '<span>文本是无损的：识别准确率取决于复制得完整不完整，跟拍照清不清晰无关。' +
          '一行一门的写法也支持：<b>课程名,周X,开始节,节数,教室,周次</b>（逗号、Tab、竖线都行）。</span>'
      }));

      footer.appendChild(h('div', { class: 'pst-footrow' },
        h('button', {
          class: 'btn btn-secondary', type: 'button', text: '取消',
          onclick: function () { sheet.close(); }
        }),
        h('button', {
          class: 'btn btn-primary', type: 'button', style: { flex: '1 1 auto' },
          text: '解析', onclick: doParse
        })
      ));
    }

    function readClipboard() {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        ui.toast('这个环境不支持读剪贴板，请长按输入框粘贴');
        return;
      }
      navigator.clipboard.readText().then(function (t) {
        if (!t || !t.trim()) { ui.toast('剪贴板是空的'); return; }
        st.text = t;
        renderInput();
        ui.toast('已读取剪贴板', { icon: 'check' });
      }).catch(function () {
        ui.toast('读剪贴板被拒绝，请长按输入框手动粘贴');
      });
    }

    /* ── 解析 ───────────────────────────────────────────── */
    function doParse() {
      if (!st.text || !st.text.trim()) {
        ui.toast('先粘贴点内容');
        return;
      }
      var res;
      try {
        res = window.App.PasteParse.parse(st.text, {
          totalWeeks: S.state.settings.totalWeeks || 20,
          periods: S.state.settings.periods
        });
      } catch (e) {
        console.error(e);
        ui.toast('解析出错了，换个格式试试');
        return;
      }
      st.result = res;
      if (!res.ok) {
        ui.toast(res.note || '没认出课表');
        renderFail(res);
        return;
      }
      st.list = res.courses.map(function (c) {
        return {
          name: c.name, teacher: c.teacher, room: c.room,
          weekday: c.weekday, start: c.start, span: c.span,
          weeks: c.weeks.slice(), tone: c.tone
        };
      });
      ui.haptic(8);
      renderReview();
    }

    /* ── 失败提示 ───────────────────────────────────────── */
    function renderFail(res) {
      st.mode = 'fail';
      body.innerHTML = '';
      footer.innerHTML = '';
      body.appendChild(h('div', { class: 'pst-fail' },
        h('div', { class: 'pst-fail-icon', html: icon('info', 22) }),
        h('div', { class: 'pst-fail-title', text: res.note || '没认出课表结构' }),
        h('div', { class: 'pst-fail-desc', text: '常见原因：只复制了半张表、复制成了图片、或者节次/表头没被选中。' })
      ));
      if (res.unmatched && res.unmatched.length) {
        body.appendChild(h('div', { class: 'pst-raw' },
          h('div', { class: 'pst-raw-head', text: '读到的原文（前 ' + res.unmatched.length + ' 行）' }),
          h('pre', { class: 'pst-raw-pre', text: res.unmatched.join('\n') })
        ));
      }
      footer.appendChild(h('div', { class: 'pst-footrow' },
        h('button', {
          class: 'btn btn-secondary', type: 'button', text: '改一改再试',
          onclick: renderInput
        }),
        h('button', {
          class: 'btn btn-primary', type: 'button', style: { flex: '1 1 auto' },
          text: '去手动添加', onclick: function () { sheet.close(); window.App.go('schedule'); }
        })
      ));
    }

    /* ── 校对 ───────────────────────────────────────────── */
    function renderReview() {
      st.mode = 'review';
      body.innerHTML = '';
      footer.innerHTML = '';

      var head = h('div', { class: 'pst-head' },
        h('div', { class: 'pst-head-main' },
          h('div', { class: 'pst-head-title', text: '识别到 ' + st.list.length + ' 门课' }),
          h('div', { class: 'pst-head-sub', text: (st.result.mode === 'table' ? '表格模式' : '一行一门模式') + ' · 可以直接改名或删掉不要的' })
        ),
        h('button', {
          class: 'btn btn-sm btn-secondary', type: 'button', text: '重新粘贴',
          onclick: renderInput
        })
      );
      body.appendChild(head);

      if (st.result.warnings && st.result.warnings.length) {
        body.appendChild(h('div', {
          class: 'me-term-preview', style: { marginTop: '10px' },
          html: icon('info', 14) + '<span>' + ui.esc(st.result.warnings.join('；')) + '</span>'
        }));
      }

      var list = h('div', { class: 'pst-list' });
      st.list.forEach(function (c, i) {
        var nameInput = h('input', {
          class: 'pst-name', type: 'text', value: c.name,
          oninput: function (e) { c.name = e.target.value; }
        });
        var row = h('div', { class: 'pst-row tone-' + c.tone },
          h('span', { class: 'pst-bar' }),
          h('div', { class: 'pst-row-main' },
            nameInput,
            h('div', { class: 'pst-row-sub' },
              h('span', { text: D.DAY_NAMES[c.weekday] + ' · 第 ' + c.start + '–' + (c.start + c.span - 1) + ' 节' }),
              c.room ? h('span', { class: 'pst-dot', text: '·' }) : null,
              c.room ? h('span', { text: c.room }) : null,
              h('span', { class: 'pst-dot', text: '·' }),
              h('span', { text: D.weeksText(c) })
            )
          ),
          h('button', {
            class: 'pst-del', type: 'button', 'aria-label': '删除这门课',
            html: icon('trash', 16),
            onclick: function () {
              st.list.splice(i, 1);
              ui.haptic(6);
              if (!st.list.length) { renderInput(); return; }
              renderReview();
            }
          })
        );
        list.appendChild(row);
      });
      body.appendChild(list);

      footer.appendChild(h('div', { class: 'pst-footrow' },
        h('button', {
          class: 'btn btn-secondary', type: 'button', text: '返回',
          onclick: renderInput
        }),
        h('button', {
          class: 'btn btn-primary', type: 'button', style: { flex: '1 1 auto' },
          text: st.list.length ? ('导入 ' + st.list.length + ' 门课') : '没有可导入的课',
          onclick: commit,
          disabled: st.list.length ? null : true
        })
      ));
    }

    /* ── 写入 ───────────────────────────────────────────── */
    function commit() {
      var list = st.list.filter(function (c) { return String(c.name || '').trim(); });
      if (!list.length) { ui.toast('先给课程起个名字'); return; }
      ui.haptic(10);
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
            span: c.span || 1,
            weeks: (c.weeks && c.weeks.length ? c.weeks.slice() : S.weeks(1, s.settings.totalWeeks || 20)),
            credit: 0,
            note: '',
            remind: null
          });
        });
      });
      sheet.close();
      ui.toast('已导入 ' + list.length + ' 门课', { icon: 'check' });
      window.App.go('schedule');
    }

    renderInput();
  }

  window.App.openPasteImport = openPasteImport;
})();
