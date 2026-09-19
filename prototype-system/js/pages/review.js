/* ==========================================================================
   页面：审核校定

   对应设计文档「审核校定」：
     1. 显示流程：列表字段为「流程编号、编研选题、发起日期、发起人、状态（审核中/审核不通过/审核通过）」；
        admin 用户显示所有流程，其他用户显示需要自己审核或自己发起的流程
     2. 审批流程：需要当前用户审核的流程，允许点击审核按钮完成审核
     3. 内容审核校对：利用 AI 完成错别字校对、政治性审核、专业性审核、合规性审核（原型可以先不实现）

   原型处理：
     · 模块简介写的是「编研成果审核校定流程」，但「选题立项」的《编研选题立项审核》也把流程记录
       登记在同一处 —— 故顶部用分段控件分两类查看，字段与权限口径完全一致；
     · AI 校对呈现界面形态，结果为**预置数据**，界面上明确标注（文档允许不实现）；
     · 「谁来审」文档没有定义：成果审核取任务的「编辑审核人员」，立项审核取审核人员角色的用户，
       都记录在流程的 reviewer 上，权限过滤与审批按钮都以它为准（原型假设，见 README）。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var TYPES = ['PRODUCT_REVIEW', 'TOPIC_REVIEW'];

  var state = {
    type: 'PRODUCT_REVIEW',
    status: '',
    keyword: '',
    /* AI 校对结果（按流程编号缓存，仅本次会话） */
    aiResults: {}
  };

  function typeDef(t) { return App.mock.REVIEW_FLOW_TYPES[t] || { label: t, short: t, prefix: '' }; }
  function statusDef(s) { return App.mock.REVIEW_FLOW_STATUS[s] || { label: s, tag: '' }; }
  function currentUser() { return S.currentUser() || {}; }

  /** 当前用户可见的流程（权限口径见 store.canSeeFlow） */
  function visibleFlows() {
    var kw = state.keyword.trim().toLowerCase();
    return S.flowsOfType(state.type).filter(function (f) {
      if (!S.canSeeFlow(f)) return false;
      if (state.status && f.status !== state.status) return false;
      if (kw && (f.flowNo + ' ' + f.targetName + ' ' + f.by + ' ' + (f.reviewer || '')).toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
  }

  function allFlowsOfType() { return S.flowsOfType(state.type); }
  function myVisibleCount() { return allFlowsOfType().filter(function (f) { return S.canSeeFlow(f); }).length; }
  function pendingForMe() {
    return S.flows().filter(function (f) { return S.canReviewFlow(f); }).length;
  }

  /* ------------------------------------------------------------ 列表 */

  function renderToolbar() {
    var segs = TYPES.map(function (t) {
      var on = state.type === t;
      var n = S.flowsOfType(t).length;
      return '<button type="button" class="' + (on ? 'active' : '') + '" role="tab" ' +
        'aria-selected="' + (on ? 'true' : 'false') + '" data-action="rv:type" data-type="' + t + '">' +
        esc(typeDef(t).short) + '（' + n + '）</button>';
    }).join('');

    var options = ['<option value="">全部状态</option>'].concat(
      Object.keys(App.mock.REVIEW_FLOW_STATUS).map(function (k) {
        return '<option value="' + k + '"' + (state.status === k ? ' selected' : '') + '>' +
          App.mock.REVIEW_FLOW_STATUS[k].label + '</option>';
      })
    ).join('');

    var user = currentUser();
    var scope = user.isAdmin ? '当前为 admin，显示全部流程'
      : '当前用户 ' + user.name + '，仅显示需我审核或我发起的流程';

    return '<div class="toolbar">' +
      '<div class="seg" role="tablist" aria-label="流程类型">' + segs + '</div>' +
      '<span class="toolbar-note">' + esc(scope) +
        '　·　共 ' + allFlowsOfType().length + ' 条，可见 ' + myVisibleCount() + ' 条' +
        (state.status || state.keyword ? '，筛选出 ' + visibleFlows().length + ' 条' : '') + '</span>' +
      '<span class="spacer"></span>' +
      '<label class="sr-only" for="rv-status">按状态筛选</label>' +
      '<select class="select select-inline" id="rv-status" data-change="rv:filter">' + options + '</select>' +
      '<label class="sr-only" for="rv-kw">搜索流程编号或选题</label>' +
      '<input class="input input-inline" id="rv-kw" type="search" placeholder="搜索流程编号 / 选题 / 发起人" ' +
        'value="' + esc(state.keyword) + '" data-enter="rv:search">' +
      '<button type="button" class="btn" data-action="rv:search">' + icon('search') + '搜索</button>' +
      ((state.status || state.keyword) ?
        '<button type="button" class="btn btn-text" data-action="rv:clear-filter">重置</button>' : '') +
    '</div>';
  }

  function actionCell(f) {
    if (S.canReviewFlow(f)) {
      return '<button type="button" class="btn btn-sm btn-primary" data-action="rv:review" ' +
        'data-no="' + esc(f.flowNo) + '">' + icon('check-circle') + '审核</button>';
    }
    if (f.status === 'REVIEWING') {
      return '<button type="button" class="btn btn-sm" data-action="rv:view" data-no="' + esc(f.flowNo) + '">' +
        icon('eye') + '查看</button>' +
        '<span class="muted" style="font-size:var(--fs-xs);margin-left:6px">待 ' + esc(f.reviewer || '—') + ' 审核</span>';
    }
    return '<button type="button" class="btn btn-sm btn-text" data-action="rv:view" data-no="' + esc(f.flowNo) + '">' +
      icon('eye') + '查看</button>';
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
        '</td>' +
        '<td class="col-time tnum">' + esc(App.util.fmtDate(f.at)) + '</td>' +
        '<td class="col-user">' + esc(f.by) + '</td>' +
        '<td class="col-user">' + esc(f.reviewer || '—') + '</td>' +
        '<td class="col-status">' + U.tag(d.label, d.tag) + '</td>' +
        '<td class="col-actions"><div class="row-actions">' + actionCell(f) + '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table">' +
      '<thead><tr>' +
        '<th class="col-idx">序号</th>' +
        '<th class="col-no">流程编号</th>' +
        '<th>编研选题</th>' +
        '<th class="col-time">发起日期</th>' +
        '<th class="col-user">发起人</th>' +
        '<th class="col-user">审核人</th>' +
        '<th class="col-status">状态</th>' +
        '<th class="col-actions">操作</th>' +
      '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table></div>';
  }

  function render() {
    var rows = visibleFlows();
    var pending = pendingForMe();
    var user = currentUser();

    var emptyText = (state.status || state.keyword)
      ? '没有符合条件的流程'
      : (user.isAdmin ? '还没有流程记录' : '没有需要我处理的流程');

    return '' +
      renderToolbar() +
      (pending ?
        '<div class="batch-bar">' + icon('file-check') +
          '有 <b>' + pending + '</b> 条流程等待你审核' +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn btn-sm" data-action="rv:filter-mine">只看待我审核</button>' +
        '</div>' : '') +
      '<section class="card">' +
        (rows.length ? renderTable(rows) :
          '<div class="card-body">' + U.empty(emptyText, 'file-check',
            (state.status || state.keyword)
              ? '<button class="btn" data-action="rv:clear-filter">' + icon('rotate-ccw') + '清除筛选</button>'
              : '<button class="btn" data-action="rv:switch-mine">' + icon('rotate-ccw') + '切换到另一类流程</button>'
          ) + '</div>') +
      '</section>';
  }

  /* ------------------------------------------------------------ 查看 */

  function flowDesc(f) {
    var d = statusDef(f.status);
    return '<dl class="desc">' +
      '<dt>流程编号</dt><dd class="tnum">' + esc(f.flowNo) + '</dd>' +
      '<dt>流程类型</dt><dd>' + esc(typeDef(f.type).label) + '</dd>' +
      '<dt>编研选题</dt><dd>' + esc(f.targetName) + '</dd>' +
      '<dt>发起人</dt><dd>' + esc(f.by) + '　·　' + esc(App.util.fmtDateTime(f.at)) + '</dd>' +
      '<dt>审核人</dt><dd>' + esc(f.reviewer || '—') + '</dd>' +
      '<dt>状态</dt><dd>' + U.tag(d.label, d.tag) + '</dd>' +
      (f.reviewedAt
        ? '<dt>审核结果</dt><dd>' + esc(f.reviewedBy || '') + '　·　' +
          esc(App.util.fmtDateTime(f.reviewedAt)) + '</dd>' : '') +
      (f.opinion ? '<dt>审核意见</dt><dd>' + esc(f.opinion) + '</dd>' : '') +
    '</dl>';
  }

  function historyHtml(f) {
    if (!f.history || !f.history.length) return '';
    var ACT = { SUBMIT: '发起', APPROVED: '审核通过', REJECTED: '审核不通过' };
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
    U.modal({
      title: '流程详情 · ' + f.flowNo,
      width: 720,
      cancelText: null,
      okText: '关闭',
      body: flowDesc(f) + historyHtml(f) +
        (S.canReviewFlow(f)
          ? '<div class="data-note" style="margin-top:var(--s4)">' + icon('info') +
            '<span>该流程正等待你审核。</span></div>'
          : '')
    });
  }

  /* -------------------------------------------------- AI 内容审核校对 */

  function aiBlock(flowNo) {
    var result = state.aiResults[flowNo];
    var rows = App.mock.REVIEW_AI_CHECKS.map(function (c) {
      var found = result ? result[c.key] : null;
      var right = !result
        ? '<span class="muted" style="font-size:var(--fs-xs)">未运行</span>'
        : (found && found.length
          ? U.tag(found.length + ' 处待核', 'tag-warn')
          : U.tag('未发现问题', 'tag-ok'));
      return '<div class="ai-check">' +
        '<span class="ai-check-label">' + esc(c.label) + '</span>' +
        '<span class="ai-check-body">' +
          (result
            ? (found && found.length
              ? found.map(function (x) {
                  return '<div class="ai-finding">' + esc(x.where) + '：' + esc(x.text) + '</div>';
                }).join('')
              : '<div class="muted" style="font-size:var(--fs-xs)">未发现问题</div>')
            : '<span class="muted" style="font-size:var(--fs-xs)">点击下方按钮运行</span>') +
        '</span>' +
        '<span class="ai-check-tag">' + right + '</span>' +
      '</div>';
    }).join('');

    return '<div class="ai-block">' +
      '<div class="ai-block-head">' +
        '<span>内容审核校对</span>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-sm" data-action="rv:run-ai" data-no="' + esc(flowNo) + '">' +
          icon('sparkles') + (result ? '重新校对' : '开始校对') + '</button>' +
      '</div>' +
      rows +
      '<div class="field-extra">错别字校对 / 政治性审核 / 专业性审核 / 合规性审核。' +
        '<b>原型为预置结果，未调用真实模型</b>（设计文档允许先不实现）。</div>' +
    '</div>';
  }

  function runAi(flowNo) {
    var res = {};
    App.mock.REVIEW_AI_CHECKS.forEach(function (c) {
      // 预置结果：为了演示"发现问题"的形态，全部返回 findings；真实实现应返回真实命中
      res[c.key] = c.findings.slice();
    });
    state.aiResults[flowNo] = res;
    var box = document.querySelector('.ai-block');
    if (box) {
      // 就地替换，避免整个弹窗重建导致已填写的审核意见丢失
      var wrap = document.createElement('div');
      wrap.innerHTML = aiBlock(flowNo);
      box.parentNode.replaceChild(wrap.firstChild, box);
    }
    U.toast('校对完成（原型为预置结果）', 'ok');
  }

  /* ------------------------------------------------------------ 审批 */

  function openReview(flowNo) {
    var f = S.getFlow(flowNo);
    if (!f) return;
    if (!S.canReviewFlow(f)) {
      U.toast('当前用户不是该流程的审核人', 'warn');
      return;
    }

    var body = flowDesc(f) + historyHtml(f) +
      aiBlock(flowNo) +
      '<div class="field" style="margin-top:var(--s4)">' +
        '<label class="field-label" for="rv-opinion">审核意见' +
          '<span class="muted" style="font-weight:400">（审核不通过时必填）</span></label>' +
        '<textarea class="textarea" id="rv-opinion" rows="3" ' +
          'placeholder="填写审校意见，将记入流程流转记录">' + esc(f.opinion || '') + '</textarea>' +
      '</div>' +
      '<div class="alert alert-info" role="note">' +
        '<span class="alert-icon">' + icon('info') + '</span><div>' +
        '通过后' + (f.type === 'TOPIC_REVIEW'
          ? '选题状态不变（仍为「未开始」，可继续被编研任务关联），立项审核结果记入选题记录。'
          : '该任务的「审核校定」标记为已通过，可在任务详情页继续进入「成果发布」。') +
        '不通过会退回来源，可修改后重新发起。' +
      '</div>' +
      '<div class="hstack" style="margin-top:var(--s3)">' +
        '<button type="button" class="btn btn-danger" data-action="rv:reject" data-no="' + esc(f.flowNo) + '">' +
          icon('x') + '不通过（退回）</button>' +
        '<span class="muted" style="font-size:var(--fs-xs)">或点击右下角「审核通过」</span>' +
      '</div>';

    U.modal({
      title: '审核流程 · ' + f.flowNo,
      width: 820,
      body: body,
      okText: '审核通过',
      cancelText: '取消',
      onOk: function (el) {
        var opinion = el.querySelector('#rv-opinion').value;
        var res = S.submitReview(flowNo, 'APPROVED', opinion);
        U.toast(res.message, res.ok ? 'ok' : 'err');
        return res.ok ? true : false;
      }
    });
  }

  function doReject(flowNo) {
    var ta = document.getElementById('rv-opinion');
    var opinion = ta ? ta.value.trim() : '';
    if (!opinion) {
      U.toast('审核不通过必须填写审核意见', 'warn');
      if (ta) ta.focus();
      return;
    }
    var res = S.submitReview(flowNo, 'REJECTED', opinion);
    if (res.ok) {
      U.closeTop();
      U.toast(res.message, 'warn');
    } else {
      U.toast(res.message, 'err');
    }
  }

  /* ------------------------------------------------------------ 交互 */

  function register() {
    U.register('rv:type', function (ds) {
      state.type = ds.type;
      state.status = '';
      App.app.render();
    });
    U.register('rv:switch-mine', function () {
      state.type = state.type === 'PRODUCT_REVIEW' ? 'TOPIC_REVIEW' : 'PRODUCT_REVIEW';
      state.status = '';
      App.app.render();
    });
    U.register('rv:filter-mine', function () {
      // 「只看待我审核」：切到状态筛选为审核中，再按权限过滤（可见即为待我审或我发起）
      state.status = 'REVIEWING';
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
      App.app.render();
    });

    U.register('rv:view', function (ds) { openView(ds.no); });
    U.register('rv:review', function (ds) { openReview(ds.no); });
    U.register('rv:run-ai', function (ds) { runAi(ds.no); });
    U.register('rv:reject', function (ds) { doReject(ds.no); });
  }

  App.pages = App.pages || {};
  App.pages.review = {
    render: render,
    register: register,
    pageClass: 'page-compact'
  };
})(window);
