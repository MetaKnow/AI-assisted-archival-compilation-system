/* ==========================================================================
   页面：编研任务

   对应设计文档「编研任务」：
     1. 新建编研任务：关联编研选题（状态为「未开始」的）、设置编研团队成员（六类角色）、备注；
        新建成功后显示任务卡片，点击卡片进入编研任务管理界面
     2. 修改编研任务：允许修改表单数据
     3. 编研任务管理：每张卡片有启动、停止、删除；卡片右上角「⋮」菜单含修改、删除、启动、暂停
     4. 任务卡片：显示选题名称、任务日期、任务状态、任务进度（六阶段）
     5. 编研任务进度界面（文档仅列标题、未写内容）——**当前只交付页面骨架**：
        编研任务标题 + 返回任务列表（在标题行最右端）+ 六阶段进度条。
        6 个步骤各自的工作界面要逐个定稿，其余内容先撤下（代码保留、暂不挂载，
        见 renderDetail 上方的说明）。

   原型的三个处理（都已在 README 标注）：
     · 五阶段的工作界面（大纲/选材/编排/审校/发布）尚未生成，
       阶段门的**产物校验暂不启用**，界面上明确标注"待该阶段界面生成后生效"；
       阶段详细工作界面沿用《原型功能模块规划》的七步原型（可一键打开对照）。
       ——骨架阶段这些说明随阶段面板一起撤下（renderDetailExtras 里保留原样）。
     · 「暂停」在设计文档的状态三态（未开始/进行中/已完成）里没有位置，
       但存储仍按文档的三态，由 store.taskState() 把它换算成互斥的四档呈现状态
       （未开始 / 进行中 / 已暂停 / 已完成），任何位置都只显示其中一档。
     · 选题与任务状态联动：任务启动 → 选题「进行中」；任务完成 → 选题「已完成」。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  /* 每页固定 12 个任务卡片（每行 3 个 × 4 行），超过 12 个翻页 */
  var PAGE_SIZE = 12;

  var state = {
    status: '',
    keyword: '',
    /* 任务列表当前页码（从 1 开始）。筛选 / 搜索 / 重置都会回到第 1 页 */
    page: 1,
    /* 详情页里正在查看的阶段（默认跟随任务当前阶段） */
    /* 已发布（锁定）任务允许"只读查看"任意环节：这时阶段是**视图**而不是进度，
       所以单独一个 viewStage，不写回 store（任务进度永远是发布时停下的阶段） */
    viewStage: null,
    /* 记住详情页当前是哪条任务（阶段工作界面都跟着任务当前阶段走）
       否则直接改 hash 跳到任务 B 会沿用任务 A 正在查看的阶段 */
    viewTaskId: null
  };

  /* 任务状态一律走 store.taskState()：它保证「进行中」与「已暂停」互斥 */
  function taskState(t) { return S.taskState(t); }

  function teamOf(t, key) { return (t.team && t.team[key]) || ''; }

  function visibleTasks() {
    var kw = state.keyword.trim().toLowerCase();
    return S.tasks().filter(function (t) {
      if (state.status && !S.taskMatchesState(t, state.status)) return false;
      if (kw && (t.topicName + ' ' + t.id).toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
  }

  function pageCount(total) { return Math.max(1, Math.ceil(total / PAGE_SIZE)); }

  /** 当前页的任务。页码越界时按最后一页算（删除、筛选后条数会变少） */
  function pageTasks(rows, page) {
    var start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }

  /**
   * 页码序列：页数少时全列出；页数多时首尾夹中间，中间用 '…' 占位
   * （不是给 39 个任务准备的，是防止任务越建越多时页码排成一行）
   */
  function pageNumbers(current, total) {
    if (total <= 7) {
      return Array.apply(null, { length: total }).map(function (x, i) { return i + 1; });
    }
    var list = [1];
    var from = Math.max(2, current - 1);
    var to = Math.min(total - 1, current + 1);
    if (from > 2) list.push('...');
    for (var i = from; i <= to; i++) list.push(i);
    if (to < total - 1) list.push('...');
    list.push(total);
    return list;
  }

  function renderPager(rowsLength, page) {
    var pages = pageCount(rowsLength);
    if (pages <= 1) return '';   // 只有一页时不显示翻页条

    var nums = pageNumbers(page, pages).map(function (n) {
      if (n === '...') return '<span class="pager-gap">…</span>';
      return '<button type="button" class="pager-num' + (n === page ? ' current' : '') + '" ' +
        'data-action="task:page" data-page="' + n + '"' +
        (n === page ? ' aria-current="page"' : '') + '>' + n + '</button>';
    }).join('');

    return '<nav class="pager" aria-label="任务分页">' +
      '<span class="pager-info">共 ' + rowsLength + ' 个任务，每页 ' + PAGE_SIZE + ' 个 · 第 ' +
        page + ' / ' + pages + ' 页</span>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn-sm" data-action="task:page" data-page="' + (page - 1) + '"' +
        (page <= 1 ? ' aria-disabled="true"' : '') + '>' +
        icon('arrow-left') + '上一页</button>' +
      '<span class="pager-nums">' + nums + '</span>' +
      '<button type="button" class="btn btn-sm" data-action="task:page" data-page="' + (page + 1) + '"' +
        (page >= pages ? ' aria-disabled="true"' : '') + '>下一页' + icon('arrow-right') + '</button>' +
    '</nav>';
  }

  /* ====================================================== 任务卡片列表 */

  function stageChips(t) {
    var done = t.status === 'DONE';
    return S.taskStages().map(function (s) {
      var cls = 'stage-chip';
      var mark = '';
      if (done || s.index < t.stage) { cls += ' done'; mark = icon('check'); }
      else if (s.index === t.stage && t.status === 'IN_PROGRESS') { cls += ' current'; }
      else if (s.index === t.stage && t.status === 'NOT_STARTED') { cls += ' pending-first'; }
      return '<span class="' + cls + '" title="第 ' + s.index + ' 阶段">' +
        mark + esc(s.title) + '</span>';
    }).join('');
  }

  function menuItems(t) {
    var items = [
      '<button type="button" class="menu-item" data-action="task:open" data-id="' + esc(t.id) + '">' +
        icon('activity') + '<span>查看进度</span></button>',
      '<button type="button" class="menu-item" data-action="task:edit" data-id="' + esc(t.id) + '">' +
        icon('pencil') + '<span>修改</span></button>'
    ];
    if (t.status === 'NOT_STARTED') {
      items.push('<button type="button" class="menu-item" data-action="task:start" data-id="' + esc(t.id) + '">' +
        icon('play') + '<span>启动</span></button>');
    } else if (t.status === 'IN_PROGRESS') {
      items.push(t.paused
        ? '<button type="button" class="menu-item" data-action="task:resume" data-id="' + esc(t.id) + '">' +
            icon('play') + '<span>继续</span></button>'
        : '<button type="button" class="menu-item" data-action="task:pause" data-id="' + esc(t.id) + '">' +
            icon('pause') + '<span>暂停</span></button>');
    }
    items.push('<div class="menu-sep"></div>');
    items.push('<button type="button" class="menu-item" data-action="task:delete" data-id="' + esc(t.id) + '">' +
      icon('trash') + '<span>删除</span></button>');
    return items.join('');
  }

  function taskCard(t) {
    var d = taskState(t);          // 互斥的单档状态，不再并列显示「进行中 + 已暂停」
    var leader = teamOf(t, 'leader');
    var menuId = 'task-menu-' + t.id.replace(/[^\w-]/g, '');

    return '<article class="card task-card">' +
      '<div class="card-head">' +
        '<button type="button" class="link-btn task-title" data-action="task:open" data-id="' +
          esc(t.id) + '" title="进入编研任务进度界面">' + esc(t.topicName) + '</button>' +
        '<span class="spacer"></span>' +
        U.tag(d.label, d.tag) +
        '<span class="task-menu-wrap">' +
          '<button type="button" class="icon-btn" data-action="ui:menu" ' +
            'data-menu-trigger="' + menuId + '" aria-haspopup="true" aria-expanded="false" ' +
            'aria-label="任务操作">' + icon('more-vertical') + '</button>' +
          '<div class="menu hidden" id="' + menuId + '" role="menu">' + menuItems(t) + '</div>' +
        '</span>' +
      '</div>' +
      '<div class="card-body">' +
        /* 每行 3 个以后卡片变窄，三列元数据会把「任务日期」挤到省略号
           （2026-03-16 ~ 2…），所以改成两列 + 日期占满一行 */
        '<dl class="task-meta">' +
          '<div><dt>任务编号</dt><dd class="tnum">' + esc(t.id) + '</dd></div>' +
          '<div><dt>团队负责人</dt><dd>' + (leader ? esc(leader) : '<span class="muted">未指定</span>') + '</dd></div>' +
          '<div class="wide"><dt>任务日期</dt><dd class="tnum">' +
            (t.planStart ? esc(t.planStart) + ' ~ ' + esc(t.planEnd || '待定') : '未填写') + '</dd></div>' +
        '</dl>' +
        /* 只留「任务进度」四个字：当前阶段/是否完成，下面的阶段切片已经用
           高亮与对勾表达，再写一遍是冗余（评审意见：去掉当前所在阶段的文字说明） */
        '<div class="task-progress-head">' +
          '<span class="muted">任务进度</span>' +
        '</div>' +
        '<div class="stage-chips">' + stageChips(t) + '</div>' +
      '</div>' +
    '</article>';
  }

  function renderList() {
    var rows = visibleTasks();
    var total = S.tasks().length;
    var running = S.tasks().filter(function (t) { return S.taskMatchesState(t, 'IN_PROGRESS'); }).length;

    /* 页数会随筛选结果变化，先把页码夹回合法区间（例如在第 4 页上筛选出 5 个任务） */
    var pages = pageCount(rows.length);
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var shown = pageTasks(rows, state.page);

    /* 筛选项 = 四档呈现状态（含「已暂停」）；「进行中」不含已暂停 */
    var options = ['<option value="">全部状态</option>'].concat(
      Object.keys(App.mock.TASK_STATES).map(function (k) {
        return '<option value="' + k + '"' + (state.status === k ? ' selected' : '') + '>' +
          App.mock.TASK_STATES[k].label + '</option>';
      })
    ).join('');

    return '' +
      '<div class="toolbar">' +
        '<button type="button" class="btn btn-primary" data-action="task:new">' +
          icon('plus') + '新建编研任务</button>' +
        '<span class="toolbar-note">共 ' + total + ' 个任务，进行中 ' + running + ' 个' +
          (rows.length === total ? '' : '，当前筛选出 ' + rows.length + ' 个') + '</span>' +
        '<span class="spacer"></span>' +
        '<label class="sr-only" for="task-status">按状态筛选</label>' +
        '<select class="select select-inline" id="task-status" data-change="task:filter">' + options + '</select>' +
        '<label class="sr-only" for="task-kw">搜索选题名称或任务编号</label>' +
        '<input class="input input-inline" id="task-kw" type="search" placeholder="搜索选题名称或任务编号" ' +
          'value="' + esc(state.keyword) + '" data-enter="task:search">' +
        '<button type="button" class="btn" data-action="task:search">' + icon('search') + '搜索</button>' +
        ((state.keyword || state.status) ?
          '<button type="button" class="btn btn-text" data-action="task:clear-filter">重置</button>' : '') +
      '</div>' +
      (rows.length
        ? '<div class="task-grid">' + shown.map(taskCard).join('') + '</div>' +
          renderPager(rows.length, state.page)
        : '<section class="card"><div class="card-body">' + U.empty(
            (state.keyword || state.status) ? '没有符合条件的任务' : '还没有编研任务',
            'clipboard-list',
            (state.keyword || state.status)
              ? '<button class="btn" data-action="task:clear-filter">' + icon('rotate-ccw') + '清除筛选</button>'
              : '<button class="btn btn-primary" data-action="task:new">' + icon('plus') + '新建编研任务</button>'
          ) + '</div></section>');
  }

  /* ====================================================== 进度界面（详情）

     本轮只交付**页面骨架**：编研任务标题 + 返回任务列表 + 六阶段进度条。
     6 个步骤各自的工作界面要逐个定稿，先把其余内容撤下来，避免与步骤界面抢版面。

     下列内容**代码仍在、暂不挂到页面上**（等对应步骤定稿后按步骤恢复）：
       · 进度明细（任务状态 / 当前阶段 / 创建）—— renderDetail 里原来的 task-meta
       · 阶段面板（阶段目标 / 产物 / 门禁 + 审核发起 + 成果登记）—— renderStagePanel
       · 阶段推进（回退一阶段 / 进入下一阶段）—— renderStageActions
       · 团队分工、阶段流转记录 —— 原详情页底部两栏
       · 「归档材料 N 件」「修改任务」「任务状态标签」等工具条按钮
     因此 task:stage / task:advance / task:back-stage / task:submit-review /
     task:publish / task:archive 这些动作当前**没有入口**，但注册保留着，
     步骤界面接回来时直接可用（任务列表页的启动/暂停/删除/修改不受影响）。 */

  /**
   * 五阶段进度条。
   *
   * 点某个环节＝**把任务的进展停在这个环节上**（评审要求）：当前环节及以前的可以点回去，
   * 下一环可以点着往前推进；**再往后的环节不能跳过下一环去点** —— 这些步骤渲染成
   * "置灰 + 语义禁用"（aria-disabled），点它只给一句说明，进度不动。
   * 后面的环节状态自然都回到「未开始」（进度只由 t.stage 决定）。
   */
  function renderStepper(t) {
    var done = t.status === 'DONE';
    var started = t.status !== 'NOT_STARTED';
    var taskLocked = S.isTaskLocked(t.id);
    /* 已发布任务：每个环节都可以点开只读查看；否则最多只能点到"下一个环节" */
    var view = (taskLocked && state.viewStage) ? state.viewStage : t.stage;
    var maxReach = taskLocked ? S.taskStages().length : t.stage + 1;
    var items = S.taskStages().map(function (s) {
      var pos = 'pending';
      if (done || s.index < t.stage) pos = 'done';
      else if (s.index === t.stage) pos = (t.status === 'IN_PROGRESS' ? 'current' : 'pending');
      /* 未启动的任务：点环节不能替它"启动"，全部锁住（与「⋮→启动」的门禁一致） */
      var locked = !started || s.index > maxReach;
      var viewing = taskLocked && s.index === view;
      var cls = 'step ' + pos + (locked ? ' locked' : '') + (viewing ? ' viewing' : '');
      var dot = (pos === 'done') ? icon('check') : String(s.index);
      var desc = pos === 'done' ? '已完成'
        : (pos === 'current' ? (t.paused ? '已暂停' : '进行中') : '未开始');
      var tip = taskLocked
        ? '任务已发布：只读查看第 ' + s.index + ' 阶段'
        : (locked
        ? (!started
          ? '任务尚未启动，请先在任务卡片的「⋮」菜单里点「启动」'
          : '不能跳过第 ' + maxReach + ' 阶段「' + esc((S.stageDef(maxReach) || {}).title || '') +
            '」——请按顺序推进')
        : (s.index < t.stage ? '把进展退回第 ' + s.index + ' 阶段'
          : (s.index === t.stage ? '当前所处阶段' : '把进展推进到第 ' + s.index + ' 阶段')));
      return '<button type="button" class="' + cls + '" data-action="task:stage" ' +
        'data-id="' + esc(t.id) + '" data-stage="' + s.index + '" ' +
        'title="' + tip + '" ' +
        (locked ? 'aria-disabled="true" ' : '') +
        'aria-current="' + (s.index === t.stage && t.status === 'IN_PROGRESS' && !t.paused ? 'step' : 'false') + '">' +
        '<span class="step-dot">' + dot + '</span>' +
        '<span class="step-title">' + esc(s.title) + '</span>' +
        '<span class="step-desc">' + esc(desc) + '</span>' +
      '</button>';
    }).join('');

    return '<nav class="stage-stepper" aria-label="编研任务五阶段进度">' +
      '<div class="steps">' + items + '</div></nav>';
  }

  function renderStagePanel(t) {
    var s = S.stageDef(t.stage);
    if (!s) return '';
    var done = t.status === 'DONE' || s.index < t.stage;
    var isCurrent = !done && s.index === t.stage && t.status === 'IN_PROGRESS';

    var gateNote = done
      ? U.tag('已完成', 'tag-ok')
      : (isCurrent
        ? U.tag('当前阶段', 'tag-accent')
        : U.tag('未开始', ''));

    return '<section class="card">' +
      '<div class="card-head">' +
        '<span>第 ' + s.index + ' 阶段 · ' + esc(s.title) + '</span>' +
        '<span class="spacer"></span>' + gateNote +
      '</div>' +
      '<div class="card-body">' +
        '<dl class="desc">' +
          '<dt>阶段目标</dt><dd>' + esc(s.goal) + '</dd>' +
          '<dt>阶段产物</dt><dd>' + esc(s.outputs) + '</dd>' +
          '<dt>门禁条件</dt><dd>' + esc(s.gate) +
            ' <span class="tag tag-warn">待该阶段界面生成后生效</span></dd>' +
        '</dl>' +
        (s.key === 'REVIEW' ? reviewBlock(t) : '') +
        (s.key === 'PUBLISH' ? publishBlock(t) : '') +
        '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
          '<span>本阶段的工作界面（大纲编辑、选材、编排、审校、发布）尚未在本原型生成。' +
          '按设计文档「暂时与目前原型中的一致」，详细工作界面参照《原型功能模块规划》的七步原型' +
          '（该七步原型实现已归档删除，七步目标 / 产物 / 门禁口径见 README 的「七步原型对照」摘要）；' +
          '当前共 6 阶段，选题已上移到「选题立项」模块。</span>' +
        '</div>' +
        (isCurrent ? renderStageActions(t, s) : '') +
      '</div>' +
    '</section>';
  }

  /**
   * 第 5 阶段（审核校定）的审核流程块
   * 设计文档：「编研任务模块发起审核流程后，需在此处（审核校定）生成流程数据」——
   * 这里就是那个发起入口；审批在「审核校定」模块完成，结果回写到这里。
   */
  function reviewBlock(t) {
    var f = S.productReviewOf(t.id);
    var d = f ? (App.mock.REVIEW_FLOW_STATUS[f.status] || { label: f.status, tag: '' }) : null;

    if (!f) {
      var canSubmit = t.status === 'IN_PROGRESS' && !t.paused && t.stage >= 4;
      var reason = '';
      if (t.status === 'NOT_STARTED') reason = '任务尚未启动';
      else if (t.paused) reason = '任务已暂停，请先继续';
      else if (t.stage < 4) reason = '尚未推进到第 4 阶段「审核校定」';
      return '<div class="ai-block">' +
        '<div class="ai-block-head"><span>编研成果审核校定流程</span>' +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn btn-sm btn-primary" data-action="task:submit-review" ' +
            'data-id="' + esc(t.id) + '"' + (canSubmit ? '' : ' aria-disabled="true"') +
            (reason ? ' title="' + esc(reason) + '"' : '') + '>' +
            icon('send') + '发起成果审核</button>' +
        '</div>' +
        '<div class="card-body" style="padding:var(--s3)">' +
          '<div class="muted" style="font-size:var(--fs-sm);line-height:1.8">' +
            (reason ? '当前不可发起：' + esc(reason) + '。' : '') +
            '发起后流程进入「审核校定」模块，由该任务的<b>编辑审核人员</b>审批；' +
            '通过后本阶段视为已完成，可继续进入「成果发布」。' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    /* 审核不通过后要能重新发起（审批弹窗里也是这么承诺的），
       否则退回的流程只能人工改数据才能再走一遍 */
    var canResubmit = f.status === 'REJECTED' && t.status === 'IN_PROGRESS' && !t.paused;

    return '<div class="ai-block">' +
      '<div class="ai-block-head"><span>编研成果审核校定流程</span>' +
        '<span class="spacer"></span>' + U.tag(d.label, d.tag) +
        (canResubmit
          ? '<button type="button" class="btn btn-sm btn-primary" data-action="task:submit-review" ' +
            'data-id="' + esc(t.id) + '" style="margin-left:var(--s2)">' +
            icon('rotate-cw') + '重新发起成果审核</button>'
          : '') +
      '</div>' +
      '<div class="card-body" style="padding:var(--s3)">' +
        '<dl class="task-meta" style="margin-bottom:var(--s2)">' +
          '<div><dt>流程编号</dt><dd class="tnum">' + esc(f.flowNo) + '</dd></div>' +
          '<div><dt>审核人</dt><dd>' + esc(f.reviewer || '—') + '</dd></div>' +
          '<div><dt>发起</dt><dd>' + esc(f.by) + ' · ' + esc(App.util.fmtDateTime(f.at)) + '</dd></div>' +
        '</dl>' +
        (f.opinion
          ? '<div class="muted" style="font-size:var(--fs-sm);line-height:1.8">' +
            '<b>审核意见：</b>' + esc(f.opinion) + '</div>'
          : '<div class="muted" style="font-size:var(--fs-sm)">' +
            '等待 ' + esc(f.reviewer || '审核人') + ' 在「审核校定」模块处理。</div>') +
        '<div class="hstack" style="margin-top:var(--s3)">' +
          '<button type="button" class="btn btn-sm" data-action="task:goto-review">' +
            icon('file-check') + '前往审核校定模块</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /**
   * 第 6 阶段（成果发布）的成果登记块
   * 设计文档的「编研成果」只说了展示，没说成果从哪来 —— 由本阶段登记产生，
   * 登记后即出现在「编研成果」模块，并计入工作台的成果数量与类型统计。
   */
  function publishBlock(t) {
    var list = S.productsOfTask(t.id);
    if (list.length) {
      /* 一个任务可以有多部成果（多卷本、多版本）—— 全部列出，并允许继续登记 */
      var rows = list.map(function (p, i) {
        return '<div class="pub-item">' +
          '<div class="pub-title">' +
            (list.length > 1 ? '<span class="pub-no">第 ' + (i + 1) + ' 部</span>' : '') +
            esc(p.title) + '</div>' +
          '<div class="muted" style="font-size:var(--fs-xs);line-height:1.7">' +
            esc(p.type) + '　·　' + esc(p.publishedAt) + '　·　' +
            esc((p.formats || []).join(' / ')) + '　·　' + App.util.fmtWan(p.words, 1) + ' 万字</div>' +
        '</div>';
      }).join('');

      return '<div class="ai-block">' +
        '<div class="ai-block-head"><span>编研成果</span><span class="spacer"></span>' +
          '<span class="muted" style="font-size:var(--fs-xs)">本任务已发布 ' + list.length + ' 部</span>' +
          U.tag('已发布', 'tag-ok') + '</div>' +
        '<div class="card-body" style="padding:var(--s3)">' + rows +
          '<div class="hstack" style="margin-top:var(--s3)">' +
            '<button type="button" class="btn btn-sm" data-action="task:goto-product">' +
              icon('book-open') + '前往编研成果</button>' +
            '<button type="button" class="btn btn-sm" data-action="task:publish" data-id="' + esc(t.id) + '">' +
              icon('plus') + '继续登记成果</button>' +
          '</div>' +
          '<div class="field-extra">同一个编研任务可以关联多部成果（如多卷本、多版本）。</div>' +
        '</div>' +
      '</div>';
    }

    var canPublish = t.status === 'DONE';
    var reason = t.status === 'NOT_STARTED' ? '任务尚未启动'
      : (t.status === 'IN_PROGRESS' ? '任务尚未完成（需全部 6 个阶段完成）' : '');

    return '<div class="ai-block">' +
      '<div class="ai-block-head"><span>编研成果</span><span class="spacer"></span>' +
        '<button type="button" class="btn btn-sm btn-primary" data-action="task:publish" ' +
          'data-id="' + esc(t.id) + '"' + (canPublish ? '' : ' aria-disabled="true"') +
          (reason ? ' title="' + esc(reason) + '"' : '') + '>' +
          icon('upload') + '登记发布成果</button>' +
      '</div>' +
      '<div class="card-body" style="padding:var(--s3)">' +
        '<div class="muted" style="font-size:var(--fs-sm);line-height:1.8">' +
          (reason ? '当前不可登记：' + esc(reason) + '。' : '') +
          '登记后成果会出现在「编研成果」模块（封面图形式展示），并计入工作台的成果数量与类型统计。' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /** 登记发布成果的表单 */
  function openPublishForm(t) {
    var typeList = App.mock.WORKBENCH.chartTaskType.map(function (x) { return x.label; });
    U.modal({
      title: '登记发布成果 · ' + t.id,
      width: 680,
      okText: '登记',
      cancelText: '取消',
      body:
        '<div class="field">' +
          '<label class="field-label" for="pb-title">成果名称<span class="req">*</span></label>' +
          '<input class="input" id="pb-title" maxlength="80" value="' + esc(t.topicName) + '">' +
          '<div class="field-extra">默认取选题名称，可按正式出版名称调整。</div>' +
        '</div>' +
        '<div class="field-row-2">' +
          '<div class="field">' +
            '<label class="field-label" for="pb-type">编研类型</label>' +
            '<select class="select" id="pb-type">' + typeList.map(function (x) {
              return '<option value="' + esc(x) + '">' + esc(x) + '</option>';
            }).join('') + '</select>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label" for="pb-date">发布日期</label>' +
            '<input class="input" id="pb-date" type="date" value="' + new Date().toISOString().slice(0, 10) + '">' +
          '</div>' +
        '</div>' +
        '<div class="field-row-2">' +
          '<div class="field">' +
            '<label class="field-label" for="pb-words">成果字数</label>' +
            '<input class="input" id="pb-words" inputmode="numeric" placeholder="0">' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">成果格式</label>' +
            '<div class="check-group">' +
              ['PDF', 'OFD', 'HTML'].map(function (f, i) {
                return '<label class="check"><input type="checkbox" name="pb-format" value="' + f + '"' +
                  (i === 0 ? ' checked' : '') + '> ' + f + '</label>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label" for="pb-summary">内容简介</label>' +
          '<textarea class="textarea" id="pb-summary" rows="2" ' +
            'placeholder="一句话说明成果内容与体例，将展示在成果详情与导出文件中">' +
            esc(t.note || '') + '</textarea>' +
        '</div>',
      onOk: function (el) {
        var title = el.querySelector('#pb-title').value.trim();
        if (!title) { U.toast('请填写成果名称', 'warn'); return false; }
        var formats = Array.prototype.slice
          .call(el.querySelectorAll('input[name="pb-format"]:checked'))
          .map(function (c) { return c.value; });
        if (!formats.length) { U.toast('请至少选择一种成果格式', 'warn'); return false; }
        var res = S.addProduct({
          title: title,
          type: el.querySelector('#pb-type').value,
          taskId: t.id,
          compiledBy: (t.team && t.team.publisher) ? (t.team.publisher + ' 等') : '市档案馆编研利用科',
          publishedAt: el.querySelector('#pb-date').value,
          words: el.querySelector('#pb-words').value,
          formats: formats,
          summary: el.querySelector('#pb-summary').value
        });
        U.toast(res.message, res.ok ? 'ok' : 'err');
        return res.ok;
      }
    });
  }

  function renderStageActions(t, s) {
    var isLast = s.index >= S.taskStages().length;
    var canOperate = t.status === 'IN_PROGRESS' && !t.paused;
    var hint = '确认本阶段工作完成后进入下一阶段';
    if (t.paused) hint = '任务已暂停，请先在卡片菜单里「继续」';
    else if (s.key === 'REVIEW') {
      var flow = S.productReviewOf(t.id);
      if (!flow) hint = '尚未发起成果审核，建议先发起审核再进入发布';
      else if (flow.status === 'REVIEWING') hint = '成果审核进行中（' + flow.flowNo + '），可等待审批结果';
      else if (flow.status === 'REJECTED') hint = '成果审核未通过，请按审核意见修改后重新发起';
      else hint = '成果审核已通过，可进入「成果发布」';
    }

    return '<div class="gate-bar">' +
      '<span class="muted" style="font-size:var(--fs-sm)">' + esc(hint) + '</span>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn-sm" data-action="task:back-stage" data-id="' + esc(t.id) + '"' +
        (t.stage <= 1 || t.paused ? ' aria-disabled="true"' : '') + '>' +
        icon('rotate-ccw') + '回退一阶段</button>' +
      '<button type="button" class="btn btn-sm btn-primary" data-action="task:advance" data-id="' + esc(t.id) + '"' +
        (canOperate ? '' : ' aria-disabled="true"') + '>' +
        (isLast ? '完成并在成果发布中归档' : '确认并进入下一阶段') + icon('arrow-right') + '</button>' +
    '</div>';
  }

  /**
   * 进度条下方：**当前阶段的工作界面**
   * 目前只交付第 1 阶段「生成大纲」（实现在 task-outline.js）；
   * 其余阶段先给一行状态说明 —— 6 个步骤界面按评审要求逐个定稿。
   */
  function stepNote(text) {
    return '<section class="card step-todo"><div class="card-body">' +
      '<div class="data-note">' + icon('info') + '<span>' + text + '</span></div>' +
    '</div></section>';
  }

  /* 已经做好工作界面的阶段：1 生成大纲、2 确定选材；
     3 加工编排是**全屏工作台**（三栏），行内只放一个入口卡片 */
  function stageImpl(t, stage) {
    if (stage === 1 && App.taskOutline) return App.taskOutline.render(t);
    if (stage === 2 && App.taskSelection) return App.taskSelection.render(t);
    /* 第 4 阶段「审核校定」：三类审核（政治性 / 专业性 / 合规性），结果分列 + 支持改片段 */
    if (stage === 4 && App.taskReview) return App.taskReview.render(t);
    /* 第 5 阶段「成果发布」：发起审核 → 逐级推送审核消息 → 通过后生成成果并锁定任务 */
    if (stage === 5 && App.taskPublish) return App.taskPublish.render(t);
    if (stage === 3 && App.taskCompose) {
      return '<section class="card compose-entry"><div class="card-body">' +
        '<div class="data-note">' + icon('info') +
          '<span>第 3 阶段「加工编排」是一个<b>全屏工作台</b>：左侧大纲导航（占 20%）、中间素材区、' +
          '右侧编排区，顶部有「预览 / 保存」。点进度条上的<b>「加工编排」</b>即可全屏打开。</span>' +
        '</div>' +
        '<div class="hstack" style="margin-top:var(--s3)">' +
          '<button type="button" class="btn btn-primary" data-action="compose:open" ' +
            'data-id="' + esc(t.id) + '">' + icon('layers') + '打开加工编排工作台</button>' +
        '</div>' +
      '</div></section>';
    }
    return '';
  }

  /**
   * 进度条下面那块：显示**任务当前阶段**的工作界面。
   * 点进度条＝把进展停到那个阶段，所以这里永远只画当前阶段，不再有"正在查看别的阶段"。
   */
  function renderStepPanel(t) {
    var taskLocked = S.isTaskLocked(t.id);
    /* 已发布任务：阶段是"视图"而不是进度 —— 可以逐个环节只读查看（评审要求：能看、不能改） */
    var view = (taskLocked && state.viewStage) ? state.viewStage : t.stage;
    var stage = S.stageDef(view) || { title: '' };
    var note = taskLocked ? stepNote('任务成果已发布，本环节为**只读**：可以查看已有信息，不能再修改' +
      '（如需修改，须先撤回发布）。' +
      (view !== t.stage ? '当前正在查看第 ' + view + ' 阶段，任务进度仍停在第 ' + t.stage + ' 阶段。' : '')) : '';
    if (t.status === 'NOT_STARTED') {
      return stepNote('任务尚未启动。请先在任务卡片的「⋮」菜单里点「启动」，再进入阶段工作界面。');
    }
    if (t.paused && !taskLocked) {
      return stepNote('任务已暂停（当前在第 ' + t.stage + ' 阶段「' + esc(stage.title) +
        '」）。请先在任务卡片的「⋮」菜单里点「继续」。');
    }
    var impl = stageImpl(t, view);
    if (impl) return note + impl;
    return stepNote('第 ' + view + ' 阶段「' + esc(stage.title) + '」的工作界面尚未生成。');
  }


  /**
   * 详情页骨架（本轮唯一渲染的内容）
   * 一行标题 + 最右端的返回按钮，下面一条六阶段进度条；除此之外不放任何东西。
   */
  function renderDetail(t) {
    state.viewTaskId = t.id;

    return '' +
      '<section class="card">' +
        '<div class="card-head detail-head">' +
          '<h1 class="detail-title">' + esc(t.topicName) + '</h1>' +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn" data-action="task:list">' +
            icon('arrow-left') + '返回任务列表</button>' +
        '</div>' +
        '<div class="card-body">' + renderStepper(t) + '</div>' +
      '</section>' +
      renderStepPanel(t);
  }

  /**
   * 上一版详情页的整页内容：工具条 + 标题卡（含进度明细）+ 阶段面板 + 团队分工/流转记录两栏。
   *
   * **当前不挂载**（renderDetail 没有调用它）—— 它是"上一版整页"，所以恢复方式很简单：
   * 把 renderDetail 的函数体换成 `return renderDetailExtras(t);` 即可整页还原。
   * 逐个步骤细化时用不着整页还原，而是从 renderStagePanel() 里挑对应内容接进 renderDetail()，
   * 本函数继续留着放还没做的那部分。
   */
  function renderDetailExtras(t) {
    state.viewTaskId = t.id;
    var stage = t.stage;
    var d = taskState(t);

    var team = App.mock.TASK_TEAM_ROLES.map(function (r) {
      var who = teamOf(t, r.key);
      return '<div class="team-item">' +
        '<span class="team-role">' + esc(r.label) + '</span>' +
        '<span class="team-who">' + (who ? esc(who) : '<span class="muted">未指定</span>') + '</span>' +
      '</div>';
    }).join('');

    var history = t.stageHistory.length
      ? t.stageHistory.map(function (h, i) {
          var def = S.stageDef(h.stage) || { title: '' };
          var active = i === t.stageHistory.length - 1;
          return '<div class="tl-item' + (active ? ' active' : '') + '">' +
            '<div>第 ' + h.stage + ' 阶段「' + esc(def.title) + '」</div>' +
            '<div class="tl-meta">' + esc(h.by) + ' · ' + esc(App.util.fmtDateTime(h.at)) + '</div>' +
          '</div>';
        }).join('')
      : U.empty('任务尚未启动，暂无阶段流转记录', 'clock');

    return '' +
      '<div class="toolbar">' +
        '<button type="button" class="btn" data-action="task:list">' + icon('arrow-left') + '返回任务列表</button>' +
        '<span class="toolbar-note">任务编号 <b class="tnum">' + esc(t.id) + '</b></span>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-sm" data-action="task:archive" data-id="' + esc(t.id) + '">' +
          icon('archive') + '归档材料 ' + S.archiveCount(t.id) + ' 件</button>' +
        /* 注意：这里若写成 `cond ? A : '' + B`，由于 + 的优先级高于 ?:，
           整段字符串拼接会被吸进三元表达式，条件为真时整页 HTML 只剩一个标签。
           下面的写法不要改回三元。 */
        U.tag(d.label, d.tag) +
        '<button type="button" class="btn btn-sm" data-action="task:edit" data-id="' + esc(t.id) + '">' +
          icon('pencil') + '修改任务</button>' +
      '</div>' +

      '<section class="card" style="margin-bottom:var(--gap)">' +
        '<div class="card-head"><span>' + esc(t.topicName) + '</span>' +
          '<span class="spacer"></span>' +
          '<span class="head-note">' +
            (t.planStart ? esc(t.planStart) + ' ~ ' + esc(t.planEnd || '待定') : '任务日期未填写') +
          '</span>' +
        '</div>' +
        '<div class="card-body">' + renderStepper(t) +
          '<dl class="task-meta" style="margin-top:var(--s3)">' +
            '<div><dt>任务状态</dt><dd>' + esc(d.label) + '</dd></div>' +
            '<div><dt>当前阶段</dt><dd>第 ' + t.stage + ' 阶段「' +
              esc((S.stageDef(t.stage) || {}).title || '') + '」</dd></div>' +
            '<div><dt>创建</dt><dd>' + esc(t.createdBy) + ' · ' + esc(App.util.fmtDateTime(t.createdAt)) + '</dd></div>' +
          '</dl>' +
        '</div>' +
      '</section>' +

      renderStagePanel(t, stage) +

      '<div class="split-grid" style="margin-top:var(--gap)">' +
        '<section class="card">' +
          '<div class="card-head"><span>团队分工</span>' +
            '<span class="spacer"></span><span class="head-note">六类角色</span></div>' +
          '<div class="card-body"><div class="team-list">' + team + '</div>' +
            (t.note ? '<hr class="rule"><div class="muted" style="font-size:var(--fs-sm);line-height:1.8">' +
              '<b>备注：</b>' + esc(t.note) + '</div>' : '') +
          '</div>' +
        '</section>' +
        '<section class="card">' +
          '<div class="card-head"><span>阶段流转记录</span>' +
            '<span class="spacer"></span><span class="head-note">' + t.stageHistory.length + ' 条</span></div>' +
          '<div class="card-body">' +
            (t.stageHistory.length ? '<div class="timeline">' + history + '</div>' : history) +
          '</div>' +
        '</section>' +
      '</div>';
  }

  /* ====================================================== 新建 / 修改表单 */

  function openForm(task) {
    var isEdit = !!(task && task.id);
    var t = isEdit ? task : {
      topicId: '', planStart: '', planEnd: '', team: {}, note: ''
    };

    var linkable = S.linkableTopics(isEdit ? t.id : null);
    var topicOptions;
    if (isEdit) {
      // 修改时当前选题可能已不是「未开始」，仍需保留在选项里
      var cur = S.getTopic(t.topicId);
      var has = linkable.some(function (x) { return x.id === t.topicId; });
      topicOptions = (has ? '' :
        '<option value="' + esc(t.topicId) + '" selected>' + esc(cur ? cur.name : t.topicId) +
        '（已关联本任务）</option>') +
        linkable.map(function (x) {
          return '<option value="' + esc(x.id) + '"' + (x.id === t.topicId ? ' selected' : '') + '>' +
            esc(x.name) + '</option>';
        }).join('');
    } else {
      topicOptions = linkable.length
        ? '<option value="">请选择选题</option>' + linkable.map(function (x) {
            return '<option value="' + esc(x.id) + '"' + (x.id === t.topicId ? ' selected' : '') + '>' +
              esc(x.name) + '</option>';
          }).join('')
        : '';
    }

    var noTopic = !isEdit && !linkable.length;

    var userOptions = function (sel) {
      return '<option value="">未指定</option>' + S.users().map(function (u) {
        return '<option value="' + esc(u.name) + '"' + (sel === u.name ? ' selected' : '') + '>' +
          esc(u.name + '（' + u.dept + '）') + '</option>';
      }).join('');
    };

    var teamFields = App.mock.TASK_TEAM_ROLES.map(function (r) {
      return '<div class="field">' +
        '<label class="field-label" for="tm-' + r.key + '">' + esc(r.label) + '</label>' +
        '<select class="select" id="tm-' + r.key + '">' + userOptions(teamOf(t, r.key)) + '</select>' +
      '</div>';
    }).join('');

    var body =
      '<div class="field">' +
        '<label class="field-label" for="tk-topic">关联编研选题<span class="req">*</span></label>' +
        (noTopic
          ? '<input class="input" id="tk-topic" value="" disabled placeholder="暂无可关联的选题">'
          : '<select class="select" id="tk-topic"' + (isEdit ? '' : '') + '>' + topicOptions + '</select>') +
        '<div class="field-extra">' +
          (noTopic
            ? '目前没有「未开始」且未被其它任务占用的选题。请先到「选题立项」新增选题，或删除占用该选题的任务。'
            : '只能关联状态为「未开始」的选题；已被其它任务占用的选题不会出现在这里。') +
        '</div>' +
      '</div>' +
      '<div class="field-row-2">' +
        '<div class="field">' +
          '<label class="field-label" for="tk-start">计划开始日期</label>' +
          '<input class="input" id="tk-start" type="date" value="' + esc(t.planStart || '') + '">' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label" for="tk-end">计划完成日期</label>' +
          '<input class="input" id="tk-end" type="date" value="' + esc(t.planEnd || '') + '">' +
        '</div>' +
      '</div>' +
      '<div class="field-label" style="margin:var(--s4) 0 var(--s2)">设置编研团队成员</div>' +
      '<div class="field-row-3">' + teamFields + '</div>' +
      '<div class="field">' +
        '<label class="field-label" for="tk-note">备注</label>' +
        '<textarea class="textarea" id="tk-note" rows="2" ' +
          'placeholder="编研范围、体例约定、注意事项等">' + esc(t.note || '') + '</textarea>' +
      '</div>';

    U.modal({
      title: (isEdit ? '修改编研任务 · ' : '新建编研任务 · ') + (isEdit ? t.id : ''),
      width: 760,
      body: body,
      okText: isEdit ? '保存修改' : '创建任务',
      cancelText: '取消',
      onOk: function (el) { return saveForm(el, isEdit ? t.id : null, noTopic); }
    });
  }

  function fieldValue(el, id) {
    var n = el.querySelector('#' + id);
    return n ? n.value : '';
  }

  function saveForm(el, id, noTopic) {
    var topicId = fieldValue(el, 'tk-topic');
    if (!noTopic && !topicId) {
      U.toast('请选择要关联的编研选题', 'warn');
      return false;
    }
    var start = fieldValue(el, 'tk-start');
    var end = fieldValue(el, 'tk-end');
    if (start && end && end < start) {
      U.toast('计划完成日期不能早于开始日期', 'warn');
      return false;
    }
    var team = {};
    App.mock.TASK_TEAM_ROLES.forEach(function (r) {
      team[r.key] = fieldValue(el, 'tm-' + r.key);
    });

    var data = { topicId: topicId, planStart: start, planEnd: end, team: team, note: fieldValue(el, 'tk-note') };

    if (id) {
      S.updateTask(id, data);
      U.toast('已保存任务 ' + id + ' 的修改', 'ok');
    } else {
      /* 新任务插在列表最前面（store 用 unshift），所以要回到第 1 页才看得到它。
         ⚠️ 必须在 S.addTask() **之前**改 state.page —— addTask 内部会 notify()，
         同步触发一次渲染，之后再改页码那一次渲染已经用旧页码画完了。
         （和 doAdvance 里"先算好再调 store"是同一个坑） */
      state.page = 1;
      var t = S.addTask(data);
      U.toast('已创建编研任务 ' + t.id + '（未开始，可在卡片菜单中启动）', 'ok');
    }
    return true;
  }

  /* ------------------------------------------------------------ 交互 */

  function doDelete(task) {
    if (!task) return;
    var topic = S.getTopic(task.topicId);
    U.confirm({
      title: '删除任务 ' + esc(task.id) + '？',
      content: '「' + esc(task.topicName) + '」的编研任务及其阶段记录将被删除，此操作不可恢复。' +
        (topic && topic.status !== 'NOT_STARTED'
          ? '<div class="muted" style="margin-top:6px;font-size:var(--fs-xs)">' +
            '该任务已启动，选题状态为「' + esc(statusDef(topic.status).label) +
            '」——删除任务不会把选题退回「未开始」，如需删除选题请先处理。</div>'
          : ''),
      okText: '确认删除'
    }).then(function (ok) {
      if (!ok) return;
      var res = S.deleteTasks([task.id]);
      if (res.deleted.length) U.toast('已删除任务 ' + task.id, 'ok');
    });
  }

  function doStart(task) {
    if (!task) return;
    var r = S.startTask(task.id);
    U.toast(r.message, r.ok ? 'ok' : 'warn');
  }

  function doPause(task) {
    if (!task) return;
    var r = S.pauseTask(task.id);
    U.toast(r.message, r.ok ? 'ok' : 'warn');
  }

  function doResume(task) {
    if (!task) return;
    var r = S.resumeTask(task.id);
    U.toast(r.message, r.ok ? 'ok' : 'warn');
  }

  function doAdvance(task) {
    if (!task) return;
    var isLast = task.stage >= S.taskStages().length;
    var stage = S.stageDef(task.stage) || { title: '' };
    U.confirm({
      title: isLast ? '确认整个任务完成？' : '确认「' + esc(stage.title) + '」已完成？',
      content: isLast
        ? '确认后任务状态变为「已完成」，关联选题同步转为「已完成」，不可再推进阶段（可回退重新打开）。'
        : '确认后进入下一阶段；<b>阶段门的产物校验尚未启用</b>（各阶段工作界面生成后补上），此处为人工确认。',
      okText: isLast ? '确认完成' : '进入下一阶段'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.advanceStage(task.id);
      U.toast(r.message, r.ok ? 'ok' : 'warn');
    });
  }

  function register() {
    /* 各阶段工作界面的动作注册（实现在 task-outline.js / task-selection.js） */
    if (App.taskOutline && App.taskOutline.register) App.taskOutline.register();
    if (App.taskSelection && App.taskSelection.register) App.taskSelection.register();
    if (App.taskCompose && App.taskCompose.register) App.taskCompose.register();
    if (App.taskReview && App.taskReview.register) App.taskReview.register();
    if (App.taskPublish && App.taskPublish.register) App.taskPublish.register();
    if (App.messages && App.messages.register) App.messages.register();

    U.register('task:new', function () { openForm(null); });
    U.register('task:edit', function (ds) {
      var t = S.getTask(ds.id);
      if (t) { U.closeMenus(); openForm(t); }
    });
    U.register('task:delete', function (ds) {
      U.closeMenus();
      doDelete(S.getTask(ds.id));
    });
    U.register('task:start', function (ds) { U.closeMenus(); doStart(S.getTask(ds.id)); });
    U.register('task:pause', function (ds) { U.closeMenus(); doPause(S.getTask(ds.id)); });
    U.register('task:resume', function (ds) { U.closeMenus(); doResume(S.getTask(ds.id)); });

    U.register('task:open', function (ds) {
      U.closeMenus();
      App.router.navigate('#/task/' + ds.id);
    });
    U.register('task:list', function () {
      App.router.navigate('#/task');
    });
    U.register('task:stage', function (ds) {
      var t = S.getTask(ds.id);
      if (!t) return;
      var target = parseInt(ds.stage, 10) || 1;

      /* 已发布任务：点环节＝**只读查看**该环节（不改进度），满足"可以查看每个环节的已有信息" */
      if (S.isTaskLocked(t.id)) {
        state.viewStage = target;
        App.app.render();
        U.toast('任务已发布：第 ' + target + ' 阶段「' + ((S.stageDef(target) || {}).title || '') +
          '」为只读查看', 'ok');
        return;
      }

      /* 未启动的任务：不让"点环节"替它启动（要走「⋮→启动」） */
      if (t.status === 'NOT_STARTED') {
        U.toast('任务尚未启动，请先在任务卡片的「⋮」菜单里点「启动」', 'warn');
        return;
      }

      /* 不能跳过下一环：当前在第 M 阶段时，最多只能点到第 M+1 阶段 */
      if (target > t.stage + 1) {
        var next = S.stageDef(t.stage + 1) || { title: '' };
        U.toast('不能跳过第 ' + (t.stage + 1) + ' 阶段「' + next.title + '」——请按顺序推进', 'warn');
        return;
      }

      /* 点环节＝把任务进展停在这一环（后面的环节回到未开始），由 store 落库并整页重渲染 */
      var r = S.setTaskStage(t.id, target);
      U.toast(r.message, r.ok ? 'ok' : 'warn');
      /* 第 3 阶段没有行内工作界面：停到这一阶段的同时直接全屏打开工作台 */
      if (target === 3 && App.taskCompose) App.taskCompose.open(t.id);
    });
    U.register('task:advance', function (ds) { doAdvance(S.getTask(ds.id)); });
    U.register('task:submit-review', function (ds) {
      var t = S.getTask(ds.id);
      if (!t) return;
      U.confirm({
        title: '发起《编研成果审核校定》流程？',
        content: '流程将进入「审核校定」模块，交由该任务的编辑审核人员（' +
          esc((t.team && t.team.editor) || S.defaultReviewer() || '未指定') + '）审批。',
        okText: '发起审核'
      }).then(function (ok) {
        if (!ok) return;
        var r = S.createProductReview(t.id);
        U.toast(r.message, r.ok ? 'ok' : 'warn');
      });
    });
    U.register('task:goto-review', function () { App.router.navigate('#/review'); });
    U.register('task:publish', function (ds) {
      var t = S.getTask(ds.id);
      if (!t) return;
      if (t.status !== 'DONE') { U.toast('任务完成后才能登记成果', 'warn'); return; }
      openPublishForm(t);
    });
    U.register('task:goto-product', function () { App.router.navigate('#/product'); });
    U.register('task:archive', function (ds) { App.router.navigate('#/archive/' + ds.id); });
    U.register('task:back-stage', function (ds) {
      var t = S.getTask(ds.id);
      if (!t) return;
      if (t.stage <= 1 && t.status !== 'DONE') { U.toast('已经是第一个阶段', 'warn'); return; }
      U.confirm({
        title: '回退到上一阶段？',
        content: '回退不会删除该阶段已产生的数据；已完成的任务回退将重新变为「进行中」。',
        okText: '确认回退'
      }).then(function (ok) {
        if (!ok) return;
        /* 同 doAdvance：先算好要渲染的东西，再调 store（它的 notify 会同步重渲染） */
        var r = S.backStage(t.id);
        U.toast(r.message, r.ok ? 'ok' : 'warn');
      });
    });

    /* 筛选 / 搜索都回到第 1 页：否则在第 4 页筛选出 5 条时，页码夹回第 1 页会让人以为"没筛出来" */
    U.register('task:filter', function (ds, el) {
      state.status = el.value;
      state.page = 1;
      App.app.render();
    });
    U.register('task:search', function () {
      var el = document.getElementById('task-kw');
      state.keyword = el ? el.value : '';
      state.page = 1;
      App.app.render();
    });
    U.register('task:clear-filter', function () {
      state.keyword = '';
      state.status = '';
      state.page = 1;
      App.app.render();
    });

    /* 翻页：页码越界时忽略（上一页在第 1 页、下一页在末页都是语义禁用） */
    U.register('task:page', function (ds) {
      var want = parseInt(ds.page, 10);
      if (!want || want === state.page) return;
      var pages = pageCount(visibleTasks().length);
      if (want < 1) want = 1;
      if (want > pages) want = pages;
      state.page = want;
      App.app.render();
      /* 换页后把列表顶部移到视口内：页面是整体滚动的（.main-col 不滚动），
         不然在第 4 页底部点「下一页」会停在下一页的中段 */
      if (global.scrollTo) global.scrollTo({ top: 0, left: 0 });
    });
  }

  /** 顶栏面包屑：详情页显示任务编号 */
  function crumb(parsed) {
    if (parsed && parsed.sub) {
      var t = S.getTask(parsed.sub);
      return t ? t.id : '';
    }
    return '';
  }

  App.pages = App.pages || {};
  App.pages.task = {
    render: function (parsed) {
      if (parsed && parsed.sub) {
        var t = S.getTask(parsed.sub);
        if (t) return renderDetail(t);
        // 任务不存在（如已被删除）：给提示并回到列表
        return '<div class="toolbar"><button type="button" class="btn" data-action="task:list">' +
          icon('arrow-left') + '返回任务列表</button></div>' +
          '<section class="card"><div class="card-body">' +
          U.empty('找不到任务 ' + esc(parsed.sub), 'alert-triangle',
            '<button class="btn btn-primary" data-action="task:list">' + icon('clipboard-list') + '返回列表</button>') +
          '</div></section>';
      }
      return renderList();
    },
    register: register,
    /* 阶段工作界面里的事件绑定（大纲的输入框、选材库的勾选等）：
       全站重渲染后要重新挂一遍，见 task-outline.js / task-selection.js 顶部说明 */
    mount: function (root) {
      if (App.taskOutline && App.taskOutline.mount) App.taskOutline.mount(root);
      var step = root.querySelector('.sel-step[data-task]');
      var t = step ? S.getTask(step.getAttribute('data-task')) : null;
      if (App.taskSelection && App.taskSelection.mount && t) App.taskSelection.mount(root, t);
    },
    crumb: crumb,
    pageClass: 'page-compact'
  };
})(window);
