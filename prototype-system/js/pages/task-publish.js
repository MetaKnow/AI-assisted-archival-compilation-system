/* ==========================================================================
   第 5 阶段「成果发布」

   评审要求：成果发布的主要作用是**对编研任务成果发起审核** ——
     · 审核步骤按「系统管理 · 流程配置」配的步骤与用户走，以**推送审核消息**的方式流转；
       审核人收到消息后点消息弹出审核界面（见 js/pages/messages.js）
     · 某一步不通过 → 任务退回第 4 阶段「审核校定」，并推送消息提示发起人
     · 三步都通过 → 成果推送到「编研成果」模块生成数据，任务**各环节只读**，
       并生成**审核信息表**（表 D.1 格式，内容自动从系统获取）
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var STATUS = {
    NOT_STARTED: { label: '未发起审核', tag: '' },
    REVIEWING: { label: '审核中', tag: 'tag-warn' },
    REJECTED: { label: '审核未通过（已退回审核校定）', tag: 'tag-danger' },
    APPROVED: { label: '审核通过 · 成果已发布', tag: 'tag-ok' }
  };
  var STEP_STATUS = {
    PENDING: { label: '待审核', tag: 'tag-warn' },
    PASSED: { label: '已通过', tag: 'tag-ok' },
    REJECTED: { label: '未通过', tag: 'tag-danger' },
    SKIPPED: { label: '未配置审核人，已跳过', tag: '' }
  };

  /* ---------------------------------------------------- 审核信息表（表 D.1） */

  /**
   * 表 D.1 审核意见表：名称 / 编研成果简介 / 审核人员信息（姓名·工作单位·职称职务）
   * / 审核意见（签字、年月日）/ 备注 —— 内容全部自动从系统取（不用手填）。
   */
  function reviewFormHtml(taskId) {
    var f = S.reviewFormOf(taskId);
    if (!f) return '<div class="pv-empty">没有可生成的审核信息。</div>';
    function row(label, cell, cls) {
      return '<tr><th class="rf-label' + (cls ? ' ' + cls : '') + '">' + label + '</th>' +
        '<td>' + cell + '</td></tr>';
    }
    var peopleRows = f.people.map(function (p) {
      return '<tr>' +
        '<td class="tnum">' + esc(p.name || '　') + '</td>' +
        '<td>' + esc(p.dept || '　') + '</td>' +
        '<td>' + esc(p.role || '　') + '</td>' +
      '</tr>';
    }).join('');

    return '<table class="review-form">' +
      '<caption>表 D.1　审核意见表</caption>' +
      row('名　称', '<div class="rf-value">' + esc(f.name) + '</div>' +
        '<div class="rf-sub">任务编号 ' + esc(f.taskNo) + '　·　成果类型 ' + esc(f.category) +
        '　·　' + f.chapters + ' 章　·　' + f.words + ' 字' +
        (f.flowNo ? '　·　流程 ' + esc(f.flowNo) : '') + '</div>') +
      row('编研成果<br>简　介', '<div class="rf-value rf-intro">' + esc(f.intro) + '…</div>',
        'rf-label-tall') +
      /* ⚠ 不要在这里写 rowspan=4：三个"人员行"本来就在下面那张**嵌套表**里，
         写了 rowspan 会把后面的"审核意见/备注"两行挤到第 3 列去（表格列宽因此错乱） */
      '<tr><th class="rf-label rf-label-tall">审核人员<br>信　息</th>' +
        '<td class="rf-people">' +
          '<table class="rf-people-table"><thead><tr><th>姓　名</th><th>工作单位</th><th>职称/职务</th></tr></thead>' +
          '<tbody>' + peopleRows + '</tbody></table>' +
        '</td></tr>' +
      row('审核意见', '<div class="rf-value rf-opinion">' + esc(f.opinion || '（暂无审核意见）') + '</div>' +
        '<div class="rf-sign">签字：' + esc(f.signer || '　　　　') + '</div>' +
        '<div class="rf-date">' + esc(f.date ? f.date.slice(0, 4) + ' 年 ' +
          f.date.slice(5, 7) + ' 月 ' + f.date.slice(8, 10) + ' 日' : '　　年　　月　　日') + '</div>',
        'rf-label-tall') +
      row('备　注', '<div class="rf-value rf-remark">' + esc(f.remark) + '</div>') +
    '</table>';
  }

  function openReviewForm(taskId) {
    U.modal({
      title: '审核信息表（表 D.1）· ' + (S.getTask(taskId) || {}).topicName,
      width: 860,
      okText: '关闭',
      cancelText: null,
      body: '<div class="rf-wrap">' + reviewFormHtml(taskId) + '</div>' +
        '<div class="data-note">' + icon('info') +
          '<span>表内内容**全部自动从系统获取**（成果名称/简介取编研成果正文与任务信息，' +
          '审核人员取流程配置里各步骤的审核人，审核意见与签字取各级审核记录）。' +
          '生产环境按此格式打印或导出 PDF。</span></div>'
    });
  }

  /* ---------------------------------------------------- 第 5 阶段面板 */

  function renderResult(t, rec) {
    var st = STATUS[rec ? rec.status : 'NOT_STARTED'] || STATUS.NOT_STARTED;
    var locked = S.isTaskLocked(t.id);
    var heard = S.messages().filter(function (m) { return m.taskId === t.id; });

    var steps = rec ? rec.steps.map(function (s, i) {
      var ss = STEP_STATUS[s.status] || { label: s.status, tag: '' };
      var isCur = rec.status === 'REVIEWING' && i === rec.current;
      return '<div class="pb-step' + (isCur ? ' pb-step-cur' : '') + '">' +
        '<span class="pb-step-idx">' + (i + 1) + '</span>' +
        '<span class="pb-step-name">' + esc(s.name) + '</span>' +
        '<span class="pb-step-who">' + (s.reviewers.length
          ? esc(s.reviewer) + '（' + esc(s.reviewers[0].roleLabel || '') + '）' : '未配置审核人') + '</span>' +
        '<span class="spacer"></span>' + U.tag(ss.label, ss.tag) +
        (s.opinion ? '<div class="pb-step-opinion">审核意见：' + esc(s.opinion) +
          '<span class="pb-step-at">' + esc(String(s.at || '').slice(0, 16).replace('T', ' ')) +
          '　' + esc(s.by || '') + '</span></div>' : '') +
      '</div>';
    }).join('') : '';

    var flowBlock = rec
      ? '<div class="pb-steps">' + steps + '</div>' +
        '<div class="pb-flow-meta">流程 ' + esc(rec.flowNo) + '　·　发起人 ' + esc(rec.by) +
          '　·　发起时间 ' + esc(String(rec.at).slice(0, 16).replace('T', ' ')) +
          (rec.publishedAt ? '　·　通过时间 ' + esc(String(rec.publishedAt).slice(0, 16).replace('T', ' ')) : '') +
        '</div>'
      : '<div class="data-note">' + icon('info') +
        '<span>还没有发起审核。点「发起审核」后，系统会按「系统管理 · 流程配置」里配置的步骤与审核人' +
        '<b>逐级推送审核消息</b>，审核人点消息即可审核。</span></div>';

    var productBlock = '';
    if (rec && rec.status === 'APPROVED') {
      productBlock = '<div class="pb-product">' + icon('book-open') +
        '<span>成果已推送到「编研成果」模块' +
        (rec.productId ? '，成果编号 <b>' + esc(rec.productId) + '</b>' : '') +
        '；本任务已锁定为<b>只读</b>（各环节只能查看已有信息）。</span>' +
        '<button type="button" class="btn btn-sm" data-action="pb:goto-product">' +
          '去编研成果查看</button>' +
        '<button type="button" class="btn btn-sm btn-primary" data-action="pb:form" ' +
          'data-id="' + esc(t.id) + '">' + icon('file-text') + '查看审核信息表</button>' +
      '</div>';
    } else if (rec && rec.status === 'REJECTED') {
      productBlock = '<div class="data-note pb-reject">' + icon('alert-triangle') +
        '<span>审核未通过：任务已退回第 4 阶段「审核校定」，并已推送消息给发起人 ' + esc(rec.by) +
        '。在校定界面改好后再回本阶段重新发起审核。</span></div>';
    }

    var msgBlock = heard.length
      ? '<div class="pb-msgs"><div class="pb-msgs-head">' + icon('bell') + '本任务推送的审核消息（' +
          heard.length + ' 条）</div>' +
          heard.slice(0, 6).map(function (m) {
            return '<div class="pb-msg"><span>' + esc(m.title) + '</span>' +
              '<span class="spacer"></span><span class="pb-step-at">' +
              esc(String(m.at).slice(0, 16).replace('T', ' ')) + '　→ ' + esc(m.to) + '</span></div>';
          }).join('') + '</div>'
      : '';

    return '<section class="card pb-card"><div class="card-body">' +
        '<div class="pb-ops">' +
          '<div class="pb-ops-main">' +
            '<span class="pb-title">' + esc(t.topicName) + '</span>' +
            U.tag(st.label, st.tag) +
            '<span class="pb-hint">' + esc(t.type) + '　·　' + esc(t.id) +
              '　·　' + (rec && rec.steps.length ? rec.steps.length + ' 个审核环节（按流程配置）' : '—') + '</span>' +
          '</div>' +
          '<div class="pb-ops-btns">' +
            ((!rec || rec.status === 'REJECTED' || rec.status === 'NOT_STARTED')
              ? '<button type="button" class="btn btn-primary" data-action="pb:start" data-id="' + esc(t.id) + '">' +
                icon('send') + '发起审核</button>'
              : '') +
            (locked ? '<button type="button" class="btn" data-action="pb:form" data-id="' + esc(t.id) + '">' +
              icon('file-text') + '审核信息表</button>' : '') +
          '</div>' +
        '</div>' +
      '</div></section>' +

      '<section class="card pb-card">' +
        '<div class="card-head">' + icon('workflow') + '<span>审核流程</span>' +
          '<span class="spacer"></span>' +
          '<span class="cp-col-note">按「系统管理 · 流程配置」的步骤与审核人逐级推送</span>' +
        '</div>' +
        '<div class="card-body">' + flowBlock + msgBlock + productBlock + '</div>' +
      '</section>';
  }

  function render(t) {
    if (!t) return '';
    return renderResult(t, S.publishOf(t.id));
  }

  /* ---------------------------------------------------- 交互 */

  function doStart(taskId) {
    var t = S.getTask(taskId);
    var steps = S.flowSteps().map(function (s) {
      var r = (s.reviewers || [])[0];
      return s.name + '：' + (r ? r.name : '未配置审核人');
    }).join('<br>');
    U.confirm({
      title: '发起成果发布审核？',
      content: '将按流程配置逐级审核：<br>' + steps +
        '<br><br>审核以<b>推送消息</b>的方式流转；任一步不通过，任务退回「审核校定」；' +
        '三步全部通过后，成果会推送到「编研成果」模块，任务各环节转为<b>只读</b>，并生成审核信息表。',
      okText: '发起审核'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.startPublishReview(taskId);
      U.toast(r.message, r.ok ? 'ok' : 'warn');
    });
  }

  function register() {
    U.register('pb:start', function (ds) { doStart(ds.id); });
    U.register('pb:form', function (ds) { openReviewForm(ds.id); });
    U.register('pb:goto-product', function () { App.router.navigate('#/product'); });
  }

  App.taskPublish = { render: render, register: register, reviewFormHtml: reviewFormHtml,
    openReviewForm: openReviewForm };
})(window);
