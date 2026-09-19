/* ==========================================================================
   页面：工作台

   对应设计文档「工作台」：
     1. 五项统计：选题数量、编研任务数量、编研总字数、编研成果数量、模型 Token 消耗
     2. 编研类型统计：按类型统计「编研任务数量」「编研成果数量」
        —— 文档写的是饼图，但 11 类超出饼图可读性上限，实际用横向排序条形图（见 js/mock.js 说明）
     3. 编研状态统计：按任务状态统计「编研任务数量」（环形图）

   另外补充两块（可在评审时按需删减）：
     · 编研任务进度分布（六阶段）—— 让「任务进度」这个核心概念在首页可见
     · 我的待办 / 最近动态 —— 工作台作为门户的常规构成
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  /* 指标卡顶部色带：与图表同一套色，保持克制 */
  var STAT_COLORS = {
    topics: '#0369a1',
    tasks: '#0891b2',
    words: '#15803d',
    products: '#b45309',
    tokens: '#64748b'
  };

  /* 页面级状态：数据截止时间（刷新后更新） */
  var state = { updatedAt: App.mock.WORKBENCH.updatedAt };

  /* 图表分组的 id 与数据，render 时填充，mount 时注册悬停联动 */
  var chartData = {};

  /* ------------------------------------------------------------ 片段 */

  function statCard(s) {
    return '<article class="stat-card" style="--c:' + esc(STAT_COLORS[s.key] || '#0369a1') + '">' +
      '<div class="sc-top">' +
        '<span class="sc-icon">' + icon(s.icon) + '</span>' +
        '<span class="sc-label">' + esc(s.label) + '</span>' +
      '</div>' +
      '<div class="sc-value">' + esc(s.value) +
        '<span class="sc-unit">' + esc(s.unit) + '</span></div>' +
    '</article>';
  }

  function chartCard(title, note, bodyHtml) {
    return '<section class="card">' +
      '<div class="card-head">' +
        '<span>' + esc(title) + '</span>' +
        '<span class="spacer"></span>' +
        '<span class="head-note">' + esc(note) + '</span>' +
      '</div>' +
      '<div class="chart-body">' + bodyHtml + '</div>' +
    '</section>';
  }

  function todoItem(t) {
    return '<button type="button" class="todo-item" data-action="wb:goto" ' +
        'data-route="' + esc(t.route) + '">' +
      '<span class="ti-icon">' + icon(t.icon) + '</span>' +
      '<span class="ti-main">' +
        '<span class="ti-title">' + esc(t.title) + '</span>' +
        '<span class="ti-meta">' + esc(t.meta) + '</span>' +
      '</span>' +
      '<span class="ti-count">' + esc(t.count) + '</span>' +
      '<span class="muted">' + icon('chevron-right') + '</span>' +
    '</button>';
  }

  function activityItem(a) {
    return '<div class="tl-item' + (a.ai ? ' ai' : '') + '">' +
      '<div><b>' + esc(a.actor) + '</b> ' + esc(a.action) + ' ' +
        '<span class="dim">' + esc(a.target) + '</span>' +
        (a.ai ? ' ' + U.tag('AI 参与', 'tag-warn') : '') + '</div>' +
      '<div class="tl-meta">' + esc(App.util.timeAgo(a.at)) + '</div>' +
    '</div>';
  }

  /* ------------------------------------------------------------ 渲染 */

  function render() {
    var wb = App.mock.WORKBENCH;
    var user = S.currentUser() || { name: '访客', roleLabel: '', isAdmin: false };

    state.updatedAt = state.updatedAt || wb.updatedAt;

    /* 与「选题立项」模块联动：选题数量、待提交审核数取实时值，
       这样在选题立项里增删选题，回到工作台数字跟着变。 */
    var stats = wb.stats.map(function (s) {
      if (s.key === 'tasks') {
        var tn = S.tasks().length;
        var running = S.tasks().filter(function (x) { return S.taskMatchesState(x, 'IN_PROGRESS') || S.taskMatchesState(x, 'PAUSED'); }).length;
        s = Object.assign({}, s, { value: String(tn), note: '在建 ' + running + ' 个' });
      }
      if (s.key === 'products') {
        var n = S.products().length;
        var pub = S.products().filter(function (p) { return String(p.publishedAt).slice(0,4) === String(new Date().getFullYear()); }).length;
        s = Object.assign({}, s, { value: String(n), note: '本年发布 ' + pub + ' 部' });
      }
      if (s.key === 'topics') {
        var n = S.topics().length;
        var pending = S.topics().filter(function (t) {
          return t.status === 'NOT_STARTED' && !(t.review && t.review.status === 'REVIEWING');
        }).length;
        s = Object.assign({}, s, { value: String(n), note: '未开始待提交审核 ' + pending + ' 个' });
      }
      return s;
    });
    /* 两张类型图都改为按库实时聚合，共用同一行序（同一行同一类型）。
       行序沿用 mock 里的类型顺序；种子数据经过配平，使两张图的数值在该行序下都单调不增，
       所以既保持"行序一致、可横着对照"，又保证每张图自身是降序的。 */
    var typeOrder = wb.chartTaskType.map(function (x) { return x.label; });
    var taskType = typeOrder.map(function (label) {
      var x = wb.chartTaskType.filter(function (y) { return y.label === label; })[0];
      return {
        label: label,
        value: S.tasks().filter(function (t) { return t.type === label; }).length,
        color: x.color
      };
    });
    var productType = typeOrder.map(function (label) {
      var x = wb.chartTaskType.filter(function (y) { return y.label === label; })[0];
      return {
        label: label,
        value: S.products().filter(function (p) { return p.type === label; }).length,
        color: x.color
      };
    });

    /* 任务状态图：按任务库实时聚合（已暂停计入「进行中」——
       文档的状态只有三态，暂停是呈现层的第四档） */
    var statusOrder = wb.chartTaskStatus.map(function (x) { return x.label; });
    var statusKey = { '未开始': 'NOT_STARTED', '进行中': 'IN_PROGRESS', '已完成': 'DONE' };
    var taskStatus = statusOrder.map(function (label) {
      var x = wb.chartTaskStatus.filter(function (y) { return y.label === label; })[0];
      return {
        label: label,
        value: S.tasks().filter(function (t) {
          var k = S.taskState(t).key;
          if (k === 'PAUSED') k = 'IN_PROGRESS';
          return k === statusKey[label];
        }).length,
        color: x.color
      };
    });

    /* 任务进度分布：按在建任务的当前阶段实时聚合 */
    var stageDist = S.taskStages().map(function (st) {
      return {
        label: st.title,
        value: S.tasks().filter(function (t) {
          return S.taskMatchesState(t, 'IN_PROGRESS') || S.taskMatchesState(t, 'PAUSED')
            ? t.stage === st.index : false;
        }).length
      };
    });

    var todos = wb.todos.map(function (t) {
      if (t.route !== '#/topic') return t;
      var pending = S.topics().filter(function (x) {
        return x.status === 'NOT_STARTED' && !(x.review && x.review.status === 'REVIEWING');
      }).length;
      return Object.assign({}, t, { count: pending });
    });

    /* 编研类型统计（两个）：11 类超出饼图 5–6 类的可读性上限，
       改用按数量降序的横向条形图 —— 类名完整可读、长度可直接比较。
       配色与「任务进度分布」图一致：统一用主题强调色（mono: true），
       类型靠行标签区分即可，不必一类型一色。
       若想恢复「一类型一色」，把 mono: true 去掉即可（颜色定义仍在 mock.js 的 TYPE_COLORS）。 */
    var taskTypeBars = App.charts.bars(taskType, {
      unit: '个', rank: true, dense: true, mono: true,
      ariaLabel: '按编研类型统计的编研任务数量'
    });
    var productTypeBars = App.charts.bars(productType, {
      unit: '部', rank: true, dense: true, mono: true,
      ariaLabel: '按编研类型统计的编研成果数量'
    });

    /* 编研状态统计：仅 3 类，保留环形图（设计文档要求的饼状图口径） */
    var bTaskStatus = App.charts.donutBlock(taskStatus, {
      id: 'chart-task-status', centerLabel: '编研任务', unit: '个',
      ariaLabel: '按任务状态统计的编研任务数量'
    });

    chartData = {};
    chartData[bTaskStatus.id] = taskStatus;

    return '' +
      /* 页面标题已在顶栏，这里不再重复；数据口径与刷新入口也一并收敛 */
      '<div class="wb">' +

      /* ① 五项核心指标 */
      '<div class="stat-grid">' + stats.map(statCard).join('') + '</div>' +

      /* ②③ 编研类型统计：两类图并排，同一行对应同一类型 */
      '<div class="chart-grid cols-2">' +
        chartCard('编研类型统计 · 任务数量', '两类图同一行对应同一类型', taskTypeBars) +
        chartCard('编研类型统计 · 成果数量', '与左图行序一致', productTypeBars) +
      '</div>' +

      /* ④⑤ 状态统计（环形图）与任务进度分布并排
         状态图只有 3 类，与 11 类的条形图同排会矮一截、卡片下方留白；
         移到下一行与同为「少量分类」的进度分布并排，两张卡高度接近 */
      '<div class="chart-grid cols-2">' +
        chartCard('编研状态统计 · 任务数量', '按任务状态', bTaskStatus.html) +
        chartCard('编研任务进度分布', '处于各进度的进行中任务数',
          App.charts.bars(stageDist, { unit: '个' })) +
      '</div>' +

      /* ⑥⑦ 待办与动态 */
      '<div class="split-grid">' +
        '<section class="card">' +
          '<div class="card-head">' +
            '<span>我的待办</span>' +
            '<span class="spacer"></span>' +
            '<span class="head-note">点击进入对应模块</span>' +
          '</div>' +
          '<div>' + todos.map(todoItem).join('') + '</div>' +
        '</section>' +
        '<section class="card">' +
          '<div class="card-head">' +
            '<span>最近动态</span>' +
            '<span class="spacer"></span>' +
            '<span class="head-note">最近 7 天</span>' +
          '</div>' +
          '<div class="card-body">' +
            '<div class="timeline">' + wb.activities.map(activityItem).join('') + '</div>' +
          '</div>' +
        '</section>' +
      '</div>' +

      '</div>';
  }

  /** 数据说明里的一句话口径提示（原页面头部信息的收敛） */
  function greetingText(user) {
    var scope = user.isAdmin ? '全馆编研数据' : '与本人相关的编研数据';
    return '当前展示' + scope;
  }

  /** 顶栏动作：把「刷新数据」收进顶栏，避免工作台顶部再占一行 */
  function topbarActions() {
    return '<button type="button" class="icon-btn" data-action="wb:refresh" ' +
      'aria-label="刷新数据" title="刷新数据（口径截止 ' +
      esc(App.util.fmtDateTime(state.updatedAt)) + '）">' + icon('refresh') + '</button>';
  }

  /* 图表悬停联动需要在 DOM 插入后注册 */
  function mount(root) {
    App.charts.register(root, chartData);
  }

  /* ------------------------------------------------------------ 交互 */

  function register() {
    U.register('wb:refresh', function () {
      state.updatedAt = new Date().toISOString();
      App.app.render();
      U.toast('已刷新工作台数据', 'ok');
    });

    U.register('wb:goto', function (ds) {
      if (ds.route) App.router.navigate(ds.route);
    });
  }

  App.pages = App.pages || {};
  App.pages.workbench = {
    render: render,
    register: register,
    mount: mount,
    topbarActions: topbarActions,
    /* 紧凑排布：页面内边距与区块间距统一走 --wb-gap（见 css/shell.css） */
    pageClass: 'page-compact'
  };
})(window);
