/* ==========================================================================
   页面：流程审核

   评审要求：
     · 本模块展示**当前用户发起的、或需要当前用户审核的**流程；
     · 流程分两类：选题立项审核流程 / 编研成果审核流程；
     · 每条流程给「查看 / 审核」两个动作 —— 需要我审的才能点「审核」；
     · 发起（选题立项的「发起审核」、成果发布的「发起审核」）与审核的结果，
       都要在**对应用户**的这个页面里生成数据。

   与第 4 阶段「审核校定」的区别（两个名字容易混，这里说明白）：
     · 流程审核（本页，一级菜单）：跨模块的**审批流**台账 —— 立项审核、成果发布审核；
     · 审核校定（任务内第 4 阶段）：对成果正文做政治性 / 专业性 / 合规性校对。
       成果发布审核不通过时，任务退回的正是第 4 阶段「审核校定」。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  /* 两类流程：label 是分段控件的文案，type 是 store 里的类型 */
  var TYPES = [
    { type: 'TOPIC_REVIEW', label: '选题立项审核流程', short: '选题立项审核' },
    { type: 'PRODUCT_REVIEW', label: '编研成果审核流程', short: '编研成果审核' }
  ];

  var SCOPES = [
    { key: '', label: '全部' },
    { key: 'todo', label: '待我审核' },
    { key: 'mine', label: '我发起的' },
    { key: 'done', label: '已完成' }
  ];

  var state = {
    type: 'TOPIC_REVIEW',
    scope: '',
    status: '',
    keyword: ''
  };

  function typeDef(t) { return App.mock.REVIEW_FLOW_TYPES[t] || { label: t, short: t, prefix: '' }; }
  function typeLabel(t) {
    var d = TYPES.filter(function (x) { return x.type === t; })[0];
    return d ? d.short : typeDef(t).short;
  }
  function statusDef(s) { return App.mock.REVIEW_FLOW_STATUS[s] || { label: s, tag: '' }; }
  function currentUser() { return S.currentUser() || {}; }
  function targetLabel(f) { return f.type === 'TOPIC_REVIEW' ? '编研选题' : '编研任务成果'; }

  /** 当前用户可见的流程（admin 看全部；其他人看我发起 / 待我审核 / 我审过的） */
  function flowsOf(type) { return S.flowsForUser('', type); }

  function visibleFlows() {
    var kw = state.keyword.trim().toLowerCase();
    return S.flowsForUser(state.scope, state.type).filter(function (f) {
      if (state.status && f.status !== state.status) return false;
      if (kw && (f.flowNo + ' ' + f.targetName + ' ' + f.by + ' ' + currentReviewer(f)).toLowerCase().indexOf(kw) < 0) {
        return false;
      }
      return true;
    });
  }

  /** 当前环节的审核人（老的单审核人流程取 reviewer） */
  function currentReviewer(f) {
    var step = f.status === 'REVIEWING' ? S.flowCurrentStep(f) : null;
    if (step) return step.reviewer || '';
    return f.reviewer || '';
  }

  function stepNameAt(f) {
    var step = f.status === 'REVIEWING' ? S.flowCurrentStep(f) : null;
    if (step) return step.name;
    return f.status === 'APPROVED' ? '全部环节已通过' : '流程已结束';
  }

  function stepProgress(f) {
    var steps = S.flowStepsOf(f);
    var passed = steps.filter(function (s) { return s.status === 'PASSED'; }).length;
    return passed + ' / ' + steps.length;
  }

  /* ------------------------------------------------------------ 列表 */

  function renderToolbar() {
    var segs = TYPES.map(function (t) {
      var on = state.type === t.type;
      var n = flowsOf(t.type).length;
      var todo = S.flowsForUser('todo', t.type).length;
      return '<button type="button" class="' + (on ? 'active' : '') + '" role="tab" ' +
        'aria-selected="' + (on ? 'true' : 'false') + '" data-action="rv:type" data-type="' + t.type + '">' +
        esc(t.label) + '（' + n + (todo ? '，待我审 ' + todo : '') + '）</button>';
    }).join('');

    var scopes = SCOPES.map(function (s) {
      var on = state.scope === s.key;
      return '<button type="button" class="' + (on ? 'active' : '') + '" role="tab" ' +
        'aria-selected="' + (on ? 'true' : 'false') + '" ' +
        'data-action="rv:scope" data-scope="' + s.key + '">' + esc(s.label) + '</button>';
    }).join('');

    var options = ['<option value="">全部状态</option>'].concat(
      Object.keys(App.mock.REVIEW_FLOW_STATUS).map(function (k) {
        return '<option value="' + k + '"' + (state.status === k ? ' selected' : '') + '>' +
          App.mock.REVIEW_FLOW_STATUS[k].label + '</option>';
      })
    ).join('');

    return '<div class="toolbar">' +
      '<div class="seg" role="tablist" aria-label="流程类型">' + segs + '</div>' +
      '<span class="spacer"></span>' +
      '<span class="toolbar-note">参与范围</span>' +
      '<div class="seg" role="group" aria-label="参与范围">' + scopes + '</div>' +
      '<label class="sr-only" for="rv-status">按状态筛选</label>' +
      '<select class="select select-inline" id="rv-status" data-change="rv:filter">' + options + '</select>' +
      '<label class="sr-only" for="rv-kw">搜索流程编号或名称</label>' +
      '<input class="input input-inline" id="rv-kw" type="search" placeholder="搜索流程编号 / 名称 / 发起人" ' +
        'value="' + esc(state.keyword) + '" data-enter="rv:search">' +
      '<button type="button" class="btn" data-action="rv:search">' + icon('search') + '搜索</button>' +
      ((state.status || state.keyword || state.scope) ?
        '<button type="button" class="btn btn-text" data-action="rv:clear-filter">重置</button>' : '') +
    '</div>';
  }

  function actionCell(f) {
    var view = '<button type="button" class="btn btn-sm" data-action="rv:view" data-no="' + esc(f.flowNo) + '">' +
      icon('eye') + '查看</button>';
    if (S.canReviewFlowNow(f)) {
      return '<button type="button" class="btn btn-sm btn-primary" data-action="rv:review" ' +
        'data-no="' + esc(f.flowNo) + '">' + icon('check-circle') + '审核</button>' + view;
    }
    if (f.status === 'REVIEWING') {
      return view + '<span class="muted" style="font-size:var(--fs-xs);margin-left:6px">待 ' +
        esc(currentReviewer(f) || '—') + ' 审核</span>';
    }
    return view;
  }

  function renderTable(rows) {
    var body = rows.map(function (f, i) {
      var d = statusDef(f.status);
      return '<tr>' +
        '<td class="col-idx tnum">' + (i + 1) + '</td>' +
        '<td class="col-no tnum">' + esc(f.flowNo) + '</td>' +
        '<td>' +
          '<button type="button" class="link-btn" data-action="rv:view" data-no="' + esc(f.flowNo) + '">' +
            esc(f.targetName) + '</button>' +
          '<div class="muted" style="font-size:var(--fs-xs)">' + esc(targetLabel(f)) + '</div>' +
        '</td>' +
        '<td class="col-time tnum">' + esc(App.util.fmtDate(f.at)) + '</td>' +
        '<td class="col-user">' + esc(f.by) + '</td>' +
        '<td>' + esc(stepNameAt(f)) +
          '<div class="muted" style="font-size:var(--fs-xs)">环节 ' + esc(stepProgress(f)) + '</div>' +
        '</td>' +
        '<td class="col-user">' + esc(currentReviewer(f) || '—') + '</td>' +
        '<td class="col-status">' + U.tag(d.label, d.tag) + '</td>' +
        '<td class="col-actions"><div class="row-actions">' + actionCell(f) + '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table">' +
      '<thead><tr>' +
        '<th class="col-idx">序号</th>' +
        '<th class="col-no">流程编号</th>' +
        '<th>名称</th>' +
        '<th class="col-time">发起日期</th>' +
        '<th class="col-user">发起人</th>' +
        '<th>当前环节</th>' +
        '<th class="col-user">当前审核人</th>' +
        '<th class="col-status">状态</th>' +
        '<th class="col-actions">操作</th>' +
      '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table></div>';
  }

  function render() {
    var rows = visibleFlows();
    var filtered = !!(state.status || state.keyword || state.scope);
    var user = currentUser();

    return '' +
      renderToolbar() +
      '<section class="card">' +
        (rows.length ? renderTable(rows) :
          '<div class="card-body">' + U.empty(
            filtered ? '没有符合条件的流程'
              : (user.isAdmin ? '还没有流程记录' : '没有我发起或需要我审核的流程'),
            'file-check',
            filtered
              ? '<button class="btn" data-action="rv:clear-filter">' + icon('rotate-ccw') + '清除筛选</button>'
              : '<button class="btn" data-action="rv:switch-type">' + icon('rotate-ccw') + '看另一类流程</button>'
          ) + '</div>') +
      '</section>';
  }

  /* ------------------------------------------------------------ 查看 */

  function stepsHtml(f) {
    var steps = S.flowStepsOf(f);
    return '<div class="pr-flow">' + steps.map(function (s, i) {
      var st = s.status;
      var label = st === 'PASSED' ? '已通过' : (st === 'REJECTED' ? '未通过'
        : (st === 'SKIPPED' ? '已跳过' : '待审核'));
      var tag = st === 'PASSED' ? 'tag-ok' : (st === 'REJECTED' ? 'tag-danger'
        : (st === 'SKIPPED' ? '' : 'tag-warn'));
      var cur = f.status === 'REVIEWING' && i === (f.steps && f.steps.length ? f.current : 0);
      return '<div class="pr-step' + (cur ? ' pr-step-cur' : '') + '">' +
        '<div class="pr-step-head">' +
          '<span class="pb-step-idx">' + (i + 1) + '</span>' +
          '<span class="pr-step-name">' + esc(s.name) + '</span>' +
          '<span class="spacer"></span>' + U.tag(label, tag) +
        '</div>' +
        '<div class="pr-step-who">审核人：' + esc(s.reviewer || '—') + '</div>' +
        '<div class="pr-step-opinion">' + (s.opinion
          ? '审核意见：' + esc(s.opinion) + (s.at ? '<span class="pb-step-at">' +
            esc(String(s.at).slice(0, 16).replace('T', ' ')) + '　' + esc(s.by || '') + '</span>' : '')
          : '<span class="cal-hint">暂无审核意见</span>') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function historyHtml(f) {
    if (!f.history || !f.history.length) return '';
    var ACT = { SUBMIT: '发起流程', PASS: '本环节通过', APPROVED: '审核通过（流程结束）', REJECTED: '审核不通过' };
    return '<h3 style="margin:var(--s5) 0 var(--s3)">流转记录</h3>' +
      '<div class="timeline">' + f.history.map(function (h, i) {
        var active = i === f.history.length - 1;
        return '<div class="tl-item' + (active ? ' active' : '') + '">' +
          '<div>' + esc(ACT[h.action] || h.action) + '</div>' +
          (h.opinion ? '<div class="muted" style="font-size:var(--fs-xs)">' + esc(h.opinion) + '</div>' : '') +
          '<div class="tl-meta">' + esc(h.by) + ' · ' + esc(App.util.fmtDateTime(h.at)) + '</div>' +
        '</div>';
      }).join('') + '</div>';
  }

  function openView(flowNo) {
    var f = S.getFlow(flowNo);
    if (!f) return;
    var d = statusDef(f.status);
    var can = S.canReviewFlowNow(f);
    var body =
      '<dl class="desc">' +
        '<dt>流程编号</dt><dd class="tnum">' + esc(f.flowNo) + '</dd>' +
        '<dt>流程类型</dt><dd>' + esc(typeDef(f.type).label) + '</dd>' +
        '<dt>' + esc(targetLabel(f)) + '</dt><dd>' + esc(f.targetName) + '</dd>' +
        '<dt>发起人</dt><dd>' + esc(f.by) + '　·　' + esc(App.util.fmtDateTime(f.at)) + '</dd>' +
        '<dt>当前环节</dt><dd>' + esc(stepNameAt(f)) + '（环节 ' + esc(stepProgress(f)) + '）</dd>' +
        '<dt>当前审核人</dt><dd>' + esc(currentReviewer(f) || '—') + '</dd>' +
        '<dt>状态</dt><dd>' + U.tag(d.label, d.tag) + '</dd>' +
      '</dl>' +
      '<h3 style="margin:var(--s5) 0 var(--s3)">审核步骤与审核意见</h3>' + stepsHtml(f) +
      historyHtml(f) +
      (can ? '<div class="data-note" style="margin-top:var(--s4)">' + icon('info') +
        '<span>该流程正等待你审核，可点「审核」进入审核界面。</span></div>' : '');

    U.modal({
      title: '流程详情 · ' + f.flowNo,
      width: 760,
      cancelText: null,
      okText: can ? '进入审核' : '关闭',
      onOk: function () {
        if (!can) return true;
        App.messages.openFlowReview(f.flowNo);
        return true;
      },
      body: body
    });
  }

  /* ------------------------------------------------------------ 审核 */

  function openReview(flowNo) {
    var f = S.getFlow(flowNo);
    if (!f) return;
    if (!S.canReviewFlowNow(f)) {
      U.toast('当前用户不是该流程本环节的审核人，只能查看', 'warn');
      openView(flowNo);
      return;
    }
    /* 审核界面按流程类型复用现成的全屏界面：
       立项审核 →「选题立项审核」界面（左步骤与意见 / 右评估表）
       成果发布审核 → 成果发布审核界面（左步骤与意见 / 右编研成果文件） */
    App.messages.openFlowReview(flowNo);
  }

  /* ------------------------------------------------------------ 交互 */

  function register() {
    U.register('rv:type', function (ds) {
      state.type = ds.type;
      state.status = '';
      App.app.render();
    });
    U.register('rv:scope', function (ds) {
      state.scope = state.scope === ds.scope ? '' : ds.scope;
      App.app.render();
    });
    U.register('rv:switch-type', function () {
      state.type = state.type === 'TOPIC_REVIEW' ? 'PRODUCT_REVIEW' : 'TOPIC_REVIEW';
      state.status = '';
      state.scope = '';
      App.app.render();
    });
    U.register('rv:filter', function (ds, el) {
      state.status = el.value;
      App.app.render();
    });
    U.register('rv:search', function () {
      var el = document.getElementById('rv-kw');
      state.keyword = el ? el.value : '';
      App.app.render();
    });
    U.register('rv:clear-filter', function () {
      state.status = '';
      state.keyword = '';
      state.scope = '';
      App.app.render();
    });

    U.register('rv:view', function (ds) { openView(ds.no); });
    U.register('rv:review', function (ds) { openReview(ds.no); });
  }

  App.pages = App.pages || {};
  App.pages.review = {
    render: render,
    register: register,
    pageClass: 'page-compact'
  };
})(window);
