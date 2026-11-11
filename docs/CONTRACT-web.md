# 课序 · 团队共享契约（CONTRACT）

> **所有参与开发的同学必须先读完本文件再动手。**
> 项目根目录：`web/`　预览地址：`http://127.0.0.1:8765/`

---

## 1. 我们在做什么

一个 **iOS 17 质感的课程表 App（PWA 原型）**，名字叫「**课序**」。核心不是课表本身，而是把
**上课 / 作业 DDL / 专注 / 导入** 串成一条线。点击即用的高保真原型，不是玩具 Demo。

**调性**：简洁、克制、留白多；圆角卡片 + 分组列表；毛玻璃导航；柔和 8 色课程色板；
文案中文、短句、口语化、不用感叹号堆砌。

---

## 2. 文件所有权（严格，勿越界）

| 文件 | 负责人 | 说明 |
|---|---|---|
| `index.html` | Lead | 已写好，**任何人不要改** |
| `css/tokens.css` `css/base.css` | Lead | 设计系统，**只读** |
| `js/store.js` `js/domain.js` `js/ui.js` `js/app.js` | Lead | 框架层，**只读** |
| `js/pages/today.js` `css/schedule.css` `js/pages/schedule.js` | Lead | |
| `js/pages/todos.js` + `css/todos.css` | **todos-dev** | 待办页 |
| `js/pages/focus.js` + `css/focus.css` | **focus-dev** | 专注页 |
| `js/pages/me.js` + `css/me.css` | **me-dev** | 我的页 + 课表导入流程 |

`index.html` 已经预埋了你们的 `<script>` / `<link>`，**文件名和路径必须完全一致**，否则不会加载。
需要新的静态资源（图片等）放 `assets/`。

---

## 3. 页面接口（唯一注册方式）

每个页面文件是一个 IIFE，往 `window.Pages` 注册一个对象：

```js
(function () {
  'use strict';
  window.Pages = window.Pages || {};

  var ui = window.App.ui, D = window.App.D, S = window.App.store;

  window.Pages.todos = {
    title: '待办',                 // 导航栏小标题（滚动后出现）
    navActions: function () {      // 可选：导航栏右上角按钮数组
      return [ui.h('button', { class: 'nav-action', type: 'button', text: '编辑',
                               onclick: function () {} })];
    },
    render: function (root) {      // root = #page-root（已清空，可滚动区域）
      root.appendChild(ui.h('div', { class: 'large-title', text: '待办' }));
    },
    destroy: function () {         // 可选：清定时器
    }
  };
})();
```

规则：
- **用 `document.createElement` / `ui.h()` 构建 DOM，不要拼 `innerHTML` 大字符串**（除了简单叶子节点）。
- `render` 会在数据变化时被整体重调 → 页面必须是**纯函数式重绘**：从 `S.state` 读数据重新渲染。
- 需要局部状态（比如当前选中 tab）用**闭包变量**，重绘时保留即可。
- 定时器一律在 `destroy()` 里清掉，否则会泄漏。
- 页面标题区自己画：`<div class="large-title">待办<span class="lt-sub">副标题</span></div>`。

---

## 4. App API 速查

```js
// ── 数据 ──
S.state                      // 整个状态对象（只读语义）
S.get('settings.theme')      // 深路径读取
S.update(function (s) {      // 事务式修改 + 持久化 + 自动重绘当前页
  s.todos.push({ id: S.uid('t'), title: '新作业', due: new Date().toISOString(), done: false });
});
S.uid('t')                   // 生成 id
S.reset()                    // 恢复演示数据

// ── 派生计算（纯函数，别自己再写一遍）──
D.now()                      // 当前时间（含演示偏移，请一律用它，别用 new Date() 取"现在"）
D.today()                    // 今天 0 点
D.weekOf(date)               // 第几教学周
D.coursesOn(week, weekday)   // 某周某天课程数组（已按开始小节排序）
D.todayCourses()             // 今天的课
D.nextCourse()               // 下一节课 {course,start,end,daysAhead,minutesUntil,state}
D.currentCourse()            // 正在上的那节 or null
D.periodTime(p)              // → {start:'08:00', end:'08:45'}
D.courseSpan(course, day)    // → {start:Date, end:Date}
D.timeText(course)           // '08:00–09:40'
D.periodText(course)         // '第1-2节'
D.weeksText(course)          // '1-16周（单）'
D.relText(target)            // '2 小时后' / '3 天前'
D.countdown(ms)              // '01:23:45' 或 '23:45'
D.todoBucket(todo)           // 'overdue'|'today'|'tomorrow'|'week'|'later'|'done'
D.isOverdue(todo)            // bool
D.focusSeries(n)             // 近 n 天 [{date,key,minutes,count}]
D.todayFocus()               // {minutes, count}
D.DAY_NAMES                  // ['','周一',...,'周日']
D.pad(n)

// ── UI ──
ui.h(tag, attrs, ...children)   // attrs: class/html/text/style{}/dataset{}/on* /ref
ui.icon(name, size)             // 返回 svg 字符串
ui.$ / ui.$$
ui.toast('已保存', { icon: 'check' })
ui.sheet({ title, subtitle, body: nodeOrHtml, footer: nodeOrHtml,
           onMount: fn, onClose: fn, className })
ui.confirm({ title, message, confirm: '删除', cancel: '取消' }).then(ok => {})
ui.haptic(8)
ui.hm(date) ui.md(date) ui.dateTitle(date) ui.wdName(date) ui.rel(date)
ui.esc(str)

// ── 路由 ──
App.go('schedule')        // 切页
App.refresh()             // 重绘当前页（一般不用手动调，S.update 已自动）
App.setFab({ icon:'plus', label:'新增', onClick: fn })   // 右下浮动按钮；传 null 移除
App.pageId()              // 当前页 id
App.enableNativeNotify()  // 请求通知权限（Promise<boolean>）
```

**可用图标名**（`ui.icon('名字')`）：
`sun grid checkCircle timer user plus minus x chevronRight chevronLeft chevronDown chevronUp
bell camera book clock mapPin trash pencil share download calendar flame chart sparkles more
play pause stop refresh moon info check filter image list cap code dot`

---

## 5. 数据结构

```js
state = {
  settings: {
    semesterStart: '2026-09-07',  // 学期第 1 周周一（YYYY-MM-DD）
    totalWeeks: 20,
    theme: 'auto',                // 'auto' | 'light' | 'dark'
    remindBefore: 10,             // 提前几分钟提醒上课
    notifyOn: true,
    timeShift: 0,                 // 演示用时间偏移（ms）
    periods: [ ['08:00','08:45'], ... 12 条 ],
    firstRun: false
  },
  courses: [{
    id: 'c_xxx',
    name: '数据结构与算法',
    teacher: '王建国',
    room: '教三-201',
    tone: 2,            // 1–8，对应 .tone-2 色板
    weekday: 1,         // 1=周一 … 7=周日
    start: 1,           // 从第几小节开始
    span: 2,            // 连上几节
    weeks: [1,2,3,...], // 上课周次数组
    credit: 4,
    note: ''
  }],
  todos: [{
    id: 't_xxx', title: '实验报告三', courseName: '数据结构与算法',
    due: '2026-11-09T23:59:00.000Z', done: false, createdAt: '...'
  }],
  focus: [{ id:'f_xxx', start: ISO字符串, minutes: 25, courseName: '操作系统' }],
  notified: {}   // 内部用，别动
}
```

> 向 `focus` 追加一条记录 = 完成一次专注，热力图/统计会自动更新。

---

## 6. 设计系统（必须用，别自己造颜色）

### 6.1 CSS 变量（`css/tokens.css` 已定义）

| 分类 | 变量 |
|---|---|
| 文字 | `--label` `--label-2`(次要) `--label-3`(占位) `--label-4`(极淡) |
| 背景 | `--bg-grouped`(页面底) `--bg-card`(卡片) `--bg-input` `--bg-seg` `--fill` `--fill-2` `--fill-3` |
| 分隔 | `--separator`(0.5px 线用) |
| 品牌/语义色 | `--blue` `--green` `--orange` `--red` `--purple` `--teal` `--indigo` `--pink` `--yellow` `--brown` `--gray` `--gray2` `--gray3` |
| 课程色板 | `.tone-1` … `.tone-8` 类 → 在里面可用 `var(--tone)` `var(--tone-soft)` `var(--tone-ink)` |
| 圆角 | `--r-card` `--r-list` `--r-btn` `--r-pill` |
| 间距 | `--gutter`（16px）、`--top`（状态栏高度）、`--bottom`（安全区） |
| 阴影 | `--shadow-card` `--shadow-float` `--shadow-sheet` |
| 动效 | `--ease-ios` `--ease-out` `--spring` |

深色模式由 `[data-theme="dark"]` 自动切换，你**不需要**写深色样式，只要用变量。

### 6.2 现成组件类（`css/base.css` 已定义，直接用）

```
布局      .card .card-pad .stack .row .grow .muted .ellipsis .spacer .divider
标题      .large-title(+.lt-sub) .section-head(+.sh-action) .group-label
列表      .list > .list-row(.tappable) > .lr-icon/.lr-title/.lr-value/.lr-chevron ；.list-footer
按钮      .btn .btn-primary .btn-secondary .btn-danger .btn-ghost .btn-block .btn-sm
胶囊      .chip(.on) .tone-pill + .tone-dot
分段      .seg > .seg-item(.on)
表单      .field > .field-label + .input/.textarea ；.switch(.on)
其他      .badge(.blue) .avatar .empty(.em-icon/.em-title/.em-desc) .fab .hr-scroll
```

**你的自定义类必须带前缀**：`.todos-xxx` / `.focus-xxx` / `.me-xxx`，且写在自己 css 文件里。

### 6.3 视觉规范（照抄，别自由发挥）

- 页面底部留白：`#page-root` 已处理，你不用管；但要给悬浮按钮留位置时注意 `.fab` 在右下。
- 组内元素间距 12–16px；卡片内 padding 16px。
- 字号：大标题 34/700；区块小标题 13/600/`--label-2`；正文 17/400；次要 15；说明 13。
- 圆角：卡片 16、按钮 12、胶囊 999。**不要出现直角**。
- 每个可点元素 `min-height:44px`（热区）。
- 数字（时长/倒计时）用 `font-variant-numeric: tabular-nums`。
- 过渡一律 `transition: … .2s var(--ease-ios)`；按下 `transform: scale(.97)`。
- 空状态用 `.empty`，标题给一句人话，不要"暂无数据"。

---

## 7. 各页 UI 规格（按此实现，可微调）

### 7.1 待办页 `todos-dev`（`js/pages/todos.js`）

**title**：`待办`

结构自上而下：
1. `.large-title` 「待办」+ `.lt-sub`：`还有 3 件事没收尾 · 最近 1 项已逾期`（动态）
2. 概览卡：三宫格统计（未完成 / 今天到期 / 已完成），数字大号 + 小标签。
3. `.seg` 分段：`全部 | 进行中 | 已完成`
4. 分组列表（`.section-head` 做组标题）：
   - `已逾期`（红色小圆点）、`今天`、`明天`、`本周`、`以后`、`已完成`
   - 每条 todo：`复选框圆圈 + 标题(17px) + 课程名 pill + 右侧 DDL（今天 23:59 / 2 天后）`
   - 逾期项：DDL 用 `--red`；今天到期：`--orange`
   - 点圆圈 → 勾选/取消（带动画 `scale` + 删除线），写 `S.update`
   - 点整行 → 编辑 sheet（标题、关联课程、日期时间、删除按钮）
5. 空状态：`.empty` + 「今天没有 DDL，去自习一会儿？」
6. `App.setFab({icon:'plus', onClick: 打开新建 sheet})`

**新建/编辑 sheet**：标题输入、课程选择（横向 `.hr-scroll` 的 chip，取自 `S.state.courses` 去重）、日期时间（`<input type="datetime-local">`）、
保存按钮。保存时 `S.update` 后 `ui.toast('已添加')`。

交互细节：勾选完成时要 `ui.haptic(6)`；完成项排到「已完成」组，标题加删除线并降透明度。

### 7.2 专注页 `focus-dev`（`js/pages/focus.js`）

**title**：`专注`

结构：
1. `.large-title`「专注」+ `.lt-sub`：`今天已专注 75 分钟 · 连续 3 天`
2. **大圆环计时器**（直径 ~250px，SVG `stroke-dasharray` 进度，中心显示 `25:00` + 状态文案）
   - 圆环下方三个按钮：`开始 / 暂停`、`放弃`（次要）、`结束并记录`（记录后进热力图）
   - 时长选择：`.seg` 20 / 25 / 45 / 60 分钟（切换时若未开始则直接改）
   - 圆环颜色跟随当前选中科目（tone）
3. **今日时间轴**：今天已完成的专注时段列表（HH:MM 起 x 分钟 · 科目）
4. **自习热力图**：近 12 周 × 7 天格子（GitHub 风格），尺寸 ~11px 方块、gap 3px，
   5 档颜色由 `--fill-3` 到 `--blue` 递进；下方图例「少 … 多」
5. 统计行：本周总时长 / 日均 / 最长连续天数

计时器用 `setInterval(1000)`，**只在 `destroy()` 清；不要每秒调 `S.update`**（会重绘页面），
直接改 DOM 文本；结束时才写一次数据：
```js
S.update(function (s) {
  s.focus.push({ id: S.uid('f'), start: new Date(startMs).toISOString(),
                 minutes: elapsedMin, courseName: currentSubject });
});
```
图标可用 `timer/play/pause/stop/flame/chart`。

### 7.3 我的页 + 导入 `me-dev`（`js/pages/me.js`）

**title**：`我的`

结构（iOS 分组列表风格，用 `.list`）：
1. 顶部卡片：学期信息（第 N 周 / 学期共 20 周 / 开学日期）+ 「进入第 N 周」；
2. 列表组「课表」：
   - **截图导入课表**（图标 `camera`，蓝色 icon）→ 打开 OCR 导入流程
   - **分享码导入**（`share`）→ 粘贴一段码（`S.exportJSON()` 的 base64 或 JSON）导入
   - **导出课表**（`download`）→ 生成分享码并复制到剪贴板 + 显示在 sheet 里
3. 列表组「提醒」：`上课前提醒`（开关 + 右侧显示「10 分钟」，点开选 5/10/15/30）、`通知权限` 状态
4. 列表组「外观」：`跟随系统 / 浅色 / 深色` 三选一（`.seg` 或列表行），切换后 `App.applyTheme()` 立刻生效
5. 列表组「数据」：`恢复演示数据`（`ui.confirm` 二次确认 → `S.reset()`）
6. 底部：版本 `0.1.0 · 原型` + 一句「课序 · 不只是课表」

**导入流程（重点，必须做完整）**（`App.openImport` 挂到全局，课表页的 ＋ 菜单会调用）：

```
Step1 选择方式：截图识别 / 分享码 / 手动添加
Step2（截图）：
   · <input type="file" accept="image/*"> 或"使用示例截图"
   · 选好后显示图片预览 + 角落标注「原型演示：真实识别需接入 OCR 服务」
   · 点「开始识别」→ 进度条 0→100%（约 1.8s，逐条吐出课程名做"正在识别…"动效）
   · 识别结果 = 4 门示例课程（预置在代码里，名字要像真课表：高等数学、大学物理…）
Step3 校对：可编辑的课程列表（每行：课程名 / 星期几 / 第几节 / 教室，可删行，可改名字）
Step4 点「导入 4 门课程」→ 写入 S.state.courses → toast「已导入」→ 跳转课表页 App.go('schedule')
```

分享码：`btoa(encodeURIComponent(S.exportJSON()))`，导入时 `decodeURIComponent(atob(code))`，容错 try/catch，
失败 toast「分享码无效」。剪贴板 `navigator.clipboard.writeText` 失败时降级为在 sheet 里显示可选中的文本框。

---

## 8. 自检清单（提交前必须做）

1. 打开 `http://127.0.0.1:8765/` → 你的 tab 能点进去，**控制台无报错**；
2. 切到深色（我的 → 外观 → 深色）看一遍，没有硬编码白色/黑色；
3. 窄屏 393×852 下不横向滚动、不遮挡底部 Tab Bar；
4. 加减数据后页面立刻更新（说明你走了 `S.update`）；
5. 所有图标都来自 `ui.icon()`，没有 emoji 当图标；
6. 你自己造的 class 都有前缀。

**不要**：改别人的文件、引 CDN/外部库、用 `alert()`/`confirm()` 原生弹窗、写 `position:fixed`（会跑出手机框，用 `.fab`/`absolute`）。

---

有问题就在任务里问我（Lead），不要自己改架构。
