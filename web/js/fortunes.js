/* ══════════════════════════════════════════════════════════════
   课序 · 每日暖言
   纯数据 + 确定性选取（同一天永远同一条，跨天自动换，点一下换下一条）
   window.App.Fortune
   ══════════════════════════════════════════════════════════════ */
window.App = window.App || {};

(function () {
  'use strict';

  /* 通用池：写给学生的、短、不鸡汤 */
  var GENERAL = [
    { t: '慢一点也没关系，别停就好。' },
    { t: '今天也要好好吃饭，好好睡觉。' },
    { t: '把今天过好，答案会自己浮上来。' },
    { t: '你不需要一直很厉害，你只需要不放弃。' },
    { t: '允许自己偶尔笨一点、慢一点。' },
    { t: '真正拉开差距的，是那些没人看着的下午。' },
    { t: '别怕落后，怕的是站着不动。' },
    { t: '你不是不行，你只是还没到。' },
    { t: '照顾好情绪，比赶完所有进度更重要。' },
    { t: '今天没做好也没关系，明天还能改。' },
    { t: '保持一点点期待，日子就有盼头。' },
    { t: '做成一件小事，胜过想完一百件大事。' },
    { t: '你的节奏，不必和任何人同步。' },
    { t: '累的时候就休息，不是每分每秒都要有用。' },
    { t: '先把手上这门课学明白，再谈远方。' },
    { t: '重要的不是你现在多快，而是你还在不在路上。' },
    { t: '不要在深夜做决定，也不要在饥饿时否定自己。' },
    { t: '别把喜欢的事，都留到有空的时候。' },
    { t: '进度条慢，也还是在涨。' },
    { t: '和人比较，是偷走快乐最快的方式。' },
    { t: '该睡就睡，明天的你会谢谢今天的你。' },
    { t: '没有白费的努力，也没有碰巧的成功。' },
    { t: '先完成，再完美。' },
    { t: '今天的清单，划掉一条就值得夸自己。' },
    { t: '情绪有起伏很正常，你不是机器。' },
    { t: '无论今天如何，明天都是新的一页。' },
    { t: '你今天认真过的每一分钟，都算数。' },
    { t: '把难的那件事，放在今天开头做。' },
    { t: '被一道题卡住，说明你正在往上走。' },
    { t: '你已经比开学时的自己，多懂了很多。' },
    { t: '喜欢的事要认真对待，不喜欢的事先做完。' },
    { t: '天气好的话，去阳台站两分钟。' },
    { t: '别急着给自己下结论，你还在变化中。' },
    { t: '记不住的知识点，多写一遍就记住了。' },
    { t: '把手机放远一点，世界会安静很多。' },
    { t: '所谓成长，就是一次比一次更快地爬起来。' },
    { t: '你不需要被所有人喜欢，做好自己就够了。' },
    { t: '深夜的焦虑，大多是困出来的。' },
    { t: '今天先做六十分，明天再改到八十分。' },
    { t: '走得慢的人，看到的风景更清楚。' }
  ];

  /* 按星期的专属池：0 周日 / 1 周一 / 5 周五 / 6 周六 */
  var BY_WEEKDAY = {
    1: [
      { t: '新的一周，先做最重要的一件事。' },
      { t: '早八也值得被认真对待。' },
      { t: '周一不是重启，是继续。' },
      { t: '这周先定一个小目标，好吗？' }
    ],
    5: [
      { t: '撑到这一步，已经很棒了。' },
      { t: '周末在向你招手，再坚持一下。' },
      { t: '今天的课，上完就是胜利。' },
      { t: '把这一周收个尾，好好夸夸自己。' }
    ],
    6: [
      { t: '周末不是用来愧疚的。' },
      { t: '补觉也是正经事。' },
      { t: '把一天时间，还给自己。' },
      { t: '今天可以慢一点，什么都不赶。' }
    ],
    0: [
      { t: '周日适合把心情整理一下。' },
      { t: '为下一周，留一点从容。' },
      { t: '今天不卷，明天更有劲。' },
      { t: '休息好了，才有力气喜欢生活。' }
    ]
  };

  /* 有出处的，单独带作者；宁缺毋滥，一条不错配 */
  var ATTRIBUTED = [
    { t: '万物皆有裂痕，那是光照进来的地方。', a: '莱昂纳德·科恩' },
    { t: '世界上只有一种真正的英雄主义，那就是认清生活的真相后依然热爱生活。', a: '罗曼·罗兰' },
    { t: '生活的理想，就是为了理想的生活。', a: '张闻天' },
    { t: '我们都在阴沟里，但仍有人仰望星空。', a: '奥斯卡·王尔德' },
    { t: '愿有前程可奔赴，亦有岁月可回首。', a: '' }
  ];

  /* 卡片配色轮转（沿用 App 的 8 色课程色板） */
  var TONES = [1, 7, 6, 5, 4, 2, 8, 3];

  function ymd(d) {
    var x = d || new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  }

  /* 把日期揉成一个稳定的整数，让同一天永远落在同一条上 */
  function seedOf(d) {
    var n = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    n = ((n >> 16) ^ n) * 0x45d9f3b;
    n = ((n >> 16) ^ n) * 0x45d9f3b;
    n = (n >> 16) ^ n;
    return Math.abs(n);
  }

  function poolFor(d) {
    var wd = d.getDay();
    var extra = BY_WEEKDAY[wd] || [];
    // 有出处的语录插在周末，避免天天都看到长句
    var attr = (wd === 0 || wd === 6) ? ATTRIBUTED : [];
    return GENERAL.concat(attr, extra);
  }

  /**
   * 取某天的暖言
   * @param {Date} date  指定日期（默认今天）
   * @param {number} offset 同一天的偏移（点「换一条」时 +1）
   * @param {string[]} [custom] 用户自定义语录；非空时只用它们，留空则用内置池
   * @returns {{text:string, author:string, tone:number, index:number, total:number, dayKey:string}}
   */
  function forDate(date, offset, custom) {
    var d = date || new Date();
    var pool = null;
    if (Array.isArray(custom) && custom.length) {
      pool = custom
        .map(function (s) { return String(s == null ? '' : s).trim(); })
        .filter(function (s) { return s.length > 0; })
        .map(function (s) { return { t: s }; });
    }
    if (!pool || !pool.length) pool = poolFor(d);

    var n = pool.length;
    var idx = ((seedOf(d) + (offset || 0) * 1) % n + n) % n;
    // 避免换一条时正好落回同一句：offset 至少挪一位
    if (offset && idx === seedOf(d) % n) idx = (idx + 1) % n;
    var item = pool[idx] || GENERAL[0];
    return {
      text: item.t,
      author: item.a || '',
      tone: TONES[idx % TONES.length],
      index: idx,
      total: n,
      dayKey: ymd(d)
    };
  }

  window.App.Fortune = {
    forDate: forDate,
    ymd: ymd,
    /** 测试用：池子大小 */
    size: function (date) { return poolFor(date || new Date()).length; }
  };
})();
