/* ==========================================================================
   页面：系统管理 · 流程配置

   设计文档里「流程配置」只有标题；界面按客户参考图实现，环节名称按评审给定：
       编研部门领导审批 → 主管副馆长审批 → 馆长审批

   参考图的结构（按评审要求做了删减）：
     · 顶部「审核流程图」：三个圆形节点 + 箭头，当前环节高亮（蓝环 + 下方小标记）
     · 下方两栏：
         左「添加审核人」：下拉选人 + 「添加审核人」（**去掉了"选择馆内用户"标题与
           "形成/移交单位用户"整块**，审核人只支持指定到人）
         右「已配置审核人 (N)」：逐条列出，可移除
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = { step: null, pickUserId: '' };

  function currentStep() {
    var steps = S.flowSteps();
    if (!steps.length) return null;
    var s = state.step ? S.getFlowStep(state.step) : null;
    if (s) return s;
    state.step = steps[0].key;
    return steps[0];
  }

  /* ------------------------------------------------------------ 流程图 */

  function renderFlowChart(activeKey) {
    var steps = S.flowSteps();
    var parts = [];
    steps.forEach(function (s, i) {
      if (i) {
        parts.push('<span class="flow-arrow" aria-hidden="true">' +
          '<svg viewBox="0 0 40 12" fill="none"><path d="M0 6h33"/><path d="m29 2.5 4 3.5-4 3.5"/></svg>' +
        '</span>');
      }
      var count = s.reviewers.length;
      parts.push('<button type="button" class="flow-node' + (s.key === activeKey ? ' active' : '') + '"' +
        ' data-action="flow:step" data-key="' + esc(s.key) + '"' +
        ' aria-pressed="' + (s.key === activeKey ? 'true' : 'false') + '">' +
        '<span class="flow-ring">' + icon(s.icon) + '</span>' +
        '<span class="flow-name">' + esc(s.name) + '</span>' +
        (count ? '<span class="flow-count">' + count + ' 人</span>' : '') +
        '<span class="flow-marker" aria-hidden="true"></span>' +
      '</button>');
    });

    return '<section class="card flow-chart-card">' +
      '<h2 class="flow-title">审核流程图</h2>' +
      '<div class="flow-chart">' + parts.join('') + '</div>' +
    '</section>';
  }

  /* ------------------------------------------------------ 添加 / 已配置 */

  function renderAddPanel(step) {
    var addable = S.flowAddableUsers(step.key);
    var options = ['<option value="">选择审核人</option>'].concat(addable.map(function (u) {
      return '<option value="' + esc(u.id) + '"' + (state.pickUserId === u.id ? ' selected' : '') + '>' +
        esc(u.name + '（' + (u.account || '无账号') + ' · ' + (u.dept || '') + '）') + '</option>';
    })).join('');

    var empty = addable.length === 0;

    return '<div class="flow-col">' +
      '<h3 class="flow-h3">' + icon('users') + '添加审核人</h3>' +
      '<div class="flow-block">' +
        '<div class="hstack">' +
          /* 标题文字已按要求去掉，这里保留仅供读屏使用的标签 */
          '<label class="sr-only" for="flow-user">选择审核人</label>' +
          '<select class="select" id="flow-user" data-change="flow:pick" ' + (empty ? 'disabled' : '') + '>' +
            (empty ? '<option value="">本环节已添加全部用户</option>' : options) + '</select>' +
          '<button type="button" class="btn btn-sm" data-action="flow:add-user" data-key="' + esc(step.key) + '"' +
            (empty ? ' aria-disabled="true"' : '') + '>' +
            icon('plus') + '添加审核人</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderListPanel(step) {
    var rows = step.reviewers;
    var body = rows.map(function (r) {
      var name = r.name || '';
      var sub = [r.roleLabel, r.dept].filter(Boolean).join(' · ');
      return '<div class="rv-item">' +
        '<span class="rv-avatar">' + icon('user') + '</span>' +
        '<span class="rv-main">' +
          '<span class="rv-name">' + esc(name) + '</span>' +
          '<span class="rv-sub">' + esc(sub || '—') + '</span>' +
        '</span>' +
        '<button type="button" class="rv-remove" data-action="flow:remove" data-key="' + esc(step.key) + '"' +
          ' data-id="' + esc(r.id) + '" aria-label="移除 ' + esc(name) + '" title="移除">' +
          icon('x') + '</button>' +
      '</div>';
    }).join('');

    return '<div class="flow-col">' +
      '<h3 class="flow-h3">' + icon('user-check') + '已配置审核人' +
        ' <span class="flow-h3-count">(' + rows.length + ')</span></h3>' +
      '<div class="rv-list">' +
        (rows.length ? body :
          '<div class="rv-empty">本环节还没有配置审核人<br><span class="muted">从左侧添加审核人</span></div>') +
      '</div>' +
    '</div>';
  }

  /* ------------------------------------------------------------ 渲染 */

  function render() {
    var step = currentStep();
    if (!step) return U.empty('流程配置暂不可用', 'workflow');

    return '' +
      renderFlowChart(step.key) +
      '<section class="card">' +
        '<div class="flow-head">' +
          '<span class="flow-head-icon">' + icon(step.icon) + '</span>' +
          '<span class="flow-head-text">' +
            '<b>' + esc(step.name) + ' - 审核人配置</b>' +
            '<small>' + esc(step.desc) + '</small>' +
          '</span>' +
        '</div>' +
        '<div class="flow-cols">' + renderAddPanel(step) + renderListPanel(step) + '</div>' +
      '</section>';
  }

  /* ------------------------------------------------------------ 交互 */

  function register() {
    U.register('flow:step', function (ds) {
      state.step = ds.key;
      state.pickUserId = '';
      App.app.render();
    });

    U.register('flow:pick', function (ds, el) {
      state.pickUserId = el.value;
    });

    U.register('flow:add-user', function (ds) {
      var sel = document.getElementById('flow-user');
      var userId = sel ? sel.value : '';
      if (!userId) { U.toast('请先选择审核人', 'warn'); return; }
      var res = S.addFlowReviewer(ds.key, { userId: userId });
      state.pickUserId = '';
      if (res.ok) App.app.render();
      U.toast(res.message, res.ok ? 'ok' : 'warn');
    });

    U.register('flow:remove', function (ds) {
      var res = S.removeFlowReviewer(ds.key, ds.id);
      if (res.ok) App.app.render();
      U.toast(res.message, res.ok ? 'ok' : 'warn');
    });
  }

  App.pages = App.pages || {};
  App.pages['system/flow'] = {
    render: render,
    register: register,
    pageClass: 'page-compact'
  };
})(window);
