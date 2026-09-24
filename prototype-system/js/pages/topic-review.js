/* ==========================================================================
   选题立项审核界面（浏览器内全屏）

   评审要求：
     · 「选题立项」里勾选选题 →「发起审核」→ 弹出**浏览器全屏界面**：
        左：审核步骤与审核意见；右：选题可行性评估表
     · 界面上还要能**导出《选题可行性评估表》**
     · 发起后，发起人与各位审核人的「流程审核」页都要能看到这条流程

   三种用法（同一个界面）：
     submit —— 从选题列表「发起审核」进入：先让人看清"谁审、几步审、审什么"，确认后才登记流程
     review —— 从「流程审核」页 / 审核待办消息进入：当前环节的审核人填意见、通过或不通过
     view   —— 流程已结束（或不是我的环节）：只看步骤、审核意见与流转记录

   与其它全屏界面（加工编排 / 校定内容 / 成果发布审核）同一套做法：
   挂 <body>、自己绑事件委托、z-index 95（低于弹层），Esc 退出由 app.js 统一绑定。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = {
    mode: 'submit',
    ids: [],          /* 本次发起（已筛掉不合格的）的选题 id */
    skipped: [],      /* 不能发起的选题：{ name, why } */
    previewId: '',    /* 右栏正在预览的选题 */
    flowNo: '',
    hint: ''
  };

  function currentUser() { return S.currentUser() || {}; }
  function isOpen() { return !!document.getElementById('topic-review-screen'); }

  function previewTopic() { return S.getTopic(state.previewId); }
  function flow() { return state.flowNo ? S.getFlow(state.flowNo) : null; }
  function view() { return state.flowNo ? S.flowView(state.flowNo) : null; }

  function statusDef(s) {
    var d = App.mock.REVIEW_FLOW_STATUS[s] || { label: s, tag: '' };
    return d;
  }

  /* ------------------------------------------------------------ 左栏：步骤 */

  /** 发起态：按「流程配置」逐条列出将要走的步骤（配置改了要重新发起才生效） */
  function plannedStepsHtml() {
    var steps = S.flowSteps();
    if (!steps.length) {
      return '<div class="data-note">' + icon('info') +
        '<span>「流程配置」里还没有审核环节，无法发起审核。</span></div>';
    }
    return '<div class="pr-flow">' + steps.map(function (s, i) {
      var people = (s.reviewers || []).map(function (r) {
        return r.name + '（' + (r.roleLabel || '') + (r.dept ? '／' + r.dept : '') + '）';
      });
      return '<div class="pr-step' + (i === 0 ? ' pr-step-cur' : '') + '">' +
        '<div class="pr-step-head">' +
          '<span class="pb-step-idx">' + (i + 1) + '</span>' +
          '<span class="pr-step-name">' + esc(s.name) + '</span>' +
          '<span class="spacer"></span>' + U.tag(i === 0 ? '发起后先到这里' : '待上一环节通过', i === 0 ? 'tag-warn' : '') +
        '</div>' +
        '<div class="pr-step-who">审核人：' + (people.length ? esc(people.join('、')) : '<span class="cal-hint">未配置审核人</span>') + '</div>' +
        '<div class="pr-step-opinion"><span class="cal-hint">暂无审核意见</span></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /** 已有流程：步骤 + 每一步的审核人与审核意见 */
  function flowStepsHtml() {
    var v = view();
    if (!v) return '<div class="cal-hint">流程不存在。</div>';
    return '<div class="pr-flow">' + v.steps.map(function (s, i) {
      var st = s.status;
      var label = st === 'PASSED' ? '已通过' : (st === 'REJECTED' ? '未通过'
        : (st === 'SKIPPED' ? '已跳过' : '待审核'));
      var tag = st === 'PASSED' ? 'tag-ok' : (st === 'REJECTED' ? 'tag-danger'
        : (st === 'SKIPPED' ? '' : 'tag-warn'));
      var cur = v.status === 'REVIEWING' && i === v.current;
      var who = (s.reviewers || []).filter(function (r) { return r.name === s.reviewer; })[0] ||
        (s.reviewers || [])[0];
      return '<div class="pr-step' + (cur ? ' pr-step-cur' : '') + '">' +
        '<div class="pr-step-head">' +
          '<span class="pb-step-idx">' + (i + 1) + '</span>' +
          '<span class="pr-step-name">' + esc(s.name) + '</span>' +
          '<span class="spacer"></span>' + U.tag(label, tag) +
        '</div>' +
        '<div class="pr-step-who">审核人：' + (s.reviewer
          ? esc(s.reviewer) + (who ? '（' + esc((who.roleLabel || '') + (who.dept ? '／' + who.dept : '')) + '）' : '')
          : '未配置') + '</div>' +
        '<div class="pr-step-opinion">' + (s.opinion
          ? '审核意见：' + esc(s.opinion) + '<span class="pb-step-at">' +
            esc(String(s.at || '').slice(0, 16).replace('T', ' ')) + '　' + esc(s.by || '') + '</span>'
          : '<span class="cal-hint">暂无审核意见</span>') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function historyHtml(skipLast) {
    var v = view();
    if (!v || !v.history.length) return '';
    var ACT = { SUBMIT: '发起流程', PASS: '本环节通过', APPROVED: '审核通过（流程结束）', REJECTED: '审核不通过' };
    var list = v.history.slice(0, skipLast ? -1 : v.history.length);
    if (!list.length) return '';
    return '<h3 class="tpr-sub">流转记录</h3>' +
      '<div class="timeline">' + list.map(function (h) {
        return '<div class="tl-item"><div>' + esc(ACT[h.action] || h.action) + '</div>' +
          (h.opinion ? '<div class="muted" style="font-size:var(--fs-xs)">' + esc(h.opinion) + '</div>' : '') +
          '<div class="tl-meta">' + esc(h.by) + ' · ' + esc(App.util.fmtDateTime(h.at)) + '</div>' +
        '</div>';
      }).join('') + '</div>';
  }

  /* --------------------------------------------------------- 左栏：内容 */

  function submitLeftHtml() {
    var steps = S.flowSteps();
    var first = steps[0];
    var people = [];
    if (first) {
      people = (first.reviewers || []).map(function (r) { return r.name; });
    }
    var picks = state.ids.map(function (id) {
      var t = S.getTopic(id);
      if (!t) return '';
      return '<button type="button" class="tpr-pick' + (id === state.previewId ? ' active' : '') + '" ' +
          'data-action="tpr:pick" data-id="' + esc(id) + '">' +
          '<span class="tpr-pick-name">' + esc(t.name) + '</span>' +
          U.tag('未开始', '') +
        '</button>';
    }).join('');

    return '<h3 class="tpr-sub">本次发起的选题（' + state.ids.length + '）</h3>' +
      '<div class="tpr-picks">' + picks + '</div>' +
      (state.skipped.length
        ? '<div class="tpr-skip">' + icon('alert-triangle') +
          '<div>以下 ' + state.skipped.length + ' 个选题未纳入本次发起：' +
          state.skipped.map(function (s) {
            return '<div>· ' + esc(s.name) + '　<span class="muted">' + esc(s.why) + '</span></div>';
          }).join('') + '</div></div>'
        : '') +
      '<h3 class="tpr-sub">审核步骤与审核意见' +
        '<span class="cp-col-note">来自「系统管理 · 流程配置」，共 ' + steps.length + ' 个环节</span></h3>' +
      plannedStepsHtml() +
      '<div class="field" style="margin-top:var(--s4)">' +
        '<label class="field-label" for="tpr-note">发起说明' +
          '<span class="muted" style="font-weight:400">（选填，会记入流程流转记录）</span></label>' +
        '<textarea class="textarea" id="tpr-note" rows="2" maxlength="200" ' +
          'placeholder="例：选题已论证，材料齐备，报请立项审核。"></textarea>' +
      '</div>' +
      '<div class="data-note">' + icon('info') + '<span>确认发起后：流程登记到系统，' +
        '并推送审核消息给第一步「' + esc(first ? first.name : '—') + '」的审核人' +
        (people.length ? '（' + esc(people.join('、')) + '）' : '') +
        '；发起人与各位审核人的「流程审核」页都会出现这条流程。</span></div>' +
      '<div class="hstack" style="margin-top:var(--s3)">' +
        '<button type="button" class="btn btn-primary" data-action="tpr:submit">' +
          icon('send') + '确认发起审核</button>' +
        '<button type="button" class="btn" data-action="tpr:close">取消</button>' +
      '</div>';
  }

  function reviewLeftHtml() {
    var v = view();
    var step = v && v.current >= 0 ? v.steps[v.current] : null;
    var isMine = step && step.reviewer === currentUser().name;
    return flowStepsHtml() +
      (v && v.status === 'REVIEWING' && step
        ? '<div class="pr-act">' +
            '<div class="field-label">本环节审核意见：' + esc(step.name) +
              (isMine ? '' : '（当前登录人不是本环节审核人，演示时可代为操作）') + '</div>' +
            '<textarea class="textarea" id="tpr-opinion" rows="3" maxlength="300" ' +
              'placeholder="请填写审核意见；点「不通过并退回」时必须填写"></textarea>' +
            '<div class="pr-act-btns">' +
              '<button type="button" class="btn btn-primary" data-action="tpr:pass">' +
                icon('check') + '审核通过</button>' +
              '<button type="button" class="btn" data-action="tpr:reject">' +
                icon('x') + '不通过并退回</button>' +
            '</div>' +
          '</div>'
        : '<div class="data-note">' + icon('info') + '<span>该流程已结束（' +
            esc(v ? statusDef(v.status).label : '') + '），只能查看审核记录。</span></div>') +
      historyHtml(true);
  }

  function viewLeftHtml() {
    var v = view();
    return flowStepsHtml() +
      (v && v.status !== 'REVIEWING'
        ? '<div class="data-note">' + icon('info') + '<span>流程已结束：' +
          esc(statusDef(v.status).label) + '。</span></div>'
        : '<div class="data-note">' + icon('info') + '<span>当前环节由 ' +
          esc((v && v.steps[v.current] && v.steps[v.current].reviewer) || '—') +
          ' 审核，你不是本环节审核人，只能查看。</span></div>') +
      historyHtml(true);
  }

  function leftHtml() {
    if (state.mode === 'submit') return submitLeftHtml();
    if (state.mode === 'review') return reviewLeftHtml();
    return viewLeftHtml();
  }

  /* ------------------------------------------------------------ 整屏 */

  function headerHtml() {
    var t = previewTopic();
    var v = view();
    var steps = S.flowSteps();
    var tail = '';
    if (state.mode === 'submit') {
      tail = '待发起　·　按流程配置共 ' + steps.length + ' 个审核环节' +
        (state.ids.length > 1 ? '　·　本次 ' + state.ids.length + ' 个选题' : '');
    } else if (v) {
      var step = v.current >= 0 ? v.steps[v.current] : null;
      tail = '流程 <b>' + esc(v.flowNo) + '</b>　·　环节 ' +
        (step ? ((v.current + 1) + ' / ' + v.steps.length) : '—') +
        '　·　' + esc(statusDef(v.status).label);
    }

    return '<div class="cp-header">' +
      '<span class="cp-brand">' + icon('workflow') + '选题立项审核</span>' +
      '<span class="cp-sep"></span>' +
      '<span class="cp-task" title="' + esc(t ? t.name : '') + '">' +
        esc(t ? t.name : (state.ids.length ? state.ids.length + ' 个选题' : '—')) + '</span>' +
      '<span class="cp-progress">' + tail + '</span>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn" data-action="tpr:export">' +
        icon('download') + '导出选题可行性评估表</button>' +
      '<button type="button" class="btn" data-action="tpr:close">' + icon('x') + '退出</button>' +
    '</div>';
  }

  function rightHtml() {
    var t = previewTopic();
    if (!t) return '<div class="cal-hint">没有可预览的选题。</div>';
    return '<div class="tpr-doc">' +
      '<div class="tpr-doc-title">选题可行性评估表</div>' +
      '<div class="tpr-doc-meta">选题编号 ' + esc(t.id) + '　·　只读预览</div>' +
      App.topic.viewMeta(t) +
      App.topic.readonlyFormHtml(t) +
    '</div>';
  }

  function bodyHtml() {
    return headerHtml() +
      '<div class="cp-body tpr-body">' +
        '<section class="cp-col">' +
          '<div class="cp-col-head">' + icon('workflow') + '审核步骤与审核意见' +
            '<span class="spacer"></span>' +
            '<span class="cp-col-note">' +
              (state.mode === 'submit'
                ? '来自「流程配置」· 发起前预览'
                : '流程 ' + esc(state.flowNo) + ' · 逐级审核留痕') + '</span>' +
          '</div>' +
          '<div class="cp-col-body tpr-left-body">' + leftHtml() + '</div>' +
        '</section>' +
        '<section class="cp-col">' +
          '<div class="cp-col-head">' + icon('file-text') + '选题可行性评估表' +
            '<span class="spacer"></span>' +
            '<span class="cp-col-note">只读；发起与审核都以它为准</span>' +
          '</div>' +
          '<div class="cp-col-body tpr-right-body">' + rightHtml() + '</div>' +
        '</section>' +
      '</div>';
  }

  function mount() {
    var old = document.getElementById('topic-review-screen');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.className = 'cp-screen tpr-screen';
    el.id = 'topic-review-screen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '选题立项审核');
    el.innerHTML = bodyHtml();
    document.body.appendChild(el);
    /* ⚠ 不放进 #overlay-root：U.modal 在弹层栈为空时会清空它（与其它全屏界面同一套做法） */
    if (U.initDelegation) U.initDelegation(el);
  }

  function repaint() {
    var el = document.getElementById('topic-review-screen');
    if (el) el.innerHTML = bodyHtml();
  }

  /* ------------------------------------------------------------ 打开 */

  /** 从选题列表「发起审核」进入：ids = 勾选的选题 */
  function openSubmit(ids) {
    var can = [], skipped = [];
    (ids || []).forEach(function (id) {
      var t = S.getTopic(id);
      if (!t) return;
      if (t.status !== 'NOT_STARTED') {
        skipped.push({ name: t.name, why: '状态为「' +
          App.mock.TOPIC_STATUS[t.status].label + '」，不再需要立项审核' });
      } else if (t.review && t.review.status === 'REVIEWING') {
        skipped.push({ name: t.name, why: '已有审核中的流程（' + t.review.flowNo + '）' });
      } else {
        can.push(t.id);
      }
    });
    if (!can.length) {
      U.modal({
        title: '无法发起立项审核', width: 620, cancelText: null, okText: '知道了',
        body: '<p>选中的选题都不满足发起条件（<b>仅「未开始」且没有审核中流程的选题可发起</b>）：</p>' +
          '<ul>' + skipped.map(function (s) {
            return '<li>' + esc(s.name) + '　<span class="muted">' + esc(s.why) + '</span></li>';
          }).join('') + '</ul>'
      });
      return;
    }
    state.mode = 'submit';
    state.ids = can;
    state.skipped = skipped;
    state.previewId = can[0];
    state.flowNo = '';
    mount();
  }

  /** 打开已有流程：mode = 'review'（我要审）| 'view'（只看） */
  function open(flowNo, mode) {
    var f = S.getFlow(flowNo);
    if (!f) { U.toast('流程不存在：' + flowNo, 'warn'); return; }
    if (f.type !== 'TOPIC_REVIEW') { U.toast('该流程不是选题立项审核流程', 'warn'); return; }
    state.flowNo = flowNo;
    state.ids = [f.targetId];
    state.previewId = f.targetId;
    state.skipped = [];
    state.mode = (mode === 'review' && S.canReviewFlowNow(f)) ? 'review' : 'view';
    state.hint = (mode === 'review' && state.mode === 'view')
      ? '当前环节不由你审核，已切换为只读查看' : '';
    mount();
    if (state.hint) U.toast(state.hint, 'warn');
  }

  function close() {
    var el = document.getElementById('topic-review-screen');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    state.flowNo = '';
    state.ids = [];
    state.previewId = '';
    state.skipped = [];
  }

  /* ------------------------------------------------------------ 动作 */

  function submitAll() {
    var note = (document.getElementById('tpr-note') || {}).value || '';
    var done = [], failed = [];
    state.ids.forEach(function (id) {
      var t = S.getTopic(id);
      var r = S.submitTopicReview(id, note);
      if (r.ok) done.push({ id: id, flowNo: r.flowNo, name: t ? t.name : id });
      else failed.push((t ? t.name : id) + '——' + r.message);
    });

    if (done.length === 1 && !failed.length) {
      /* 单个：直接停在这条流程上，发起人立刻看到"流程已起、在等谁审" */
      U.toast('已发起立项审核：流程 ' + done[0].flowNo + '，等待第一步审核人处理', 'ok');
      open(done[0].flowNo, 'view');
      return;
    }
    if (failed.length && !done.length) {
      U.modal({
        title: '无法发起立项审核', width: 640, cancelText: null, okText: '知道了',
        body: '<ul>' + failed.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>'
      });
      return;
    }
    close();
    U.toast('已发起立项审核 ' + done.length + ' 项：' +
      done.map(function (d) { return d.flowNo; }).join('、'), 'ok');
    if (failed.length) {
      U.modal({
        title: '部分选题未能发起审核', width: 640, cancelText: null, okText: '知道了',
        body: '<p>已成功发起 ' + done.length + ' 项，以下 ' + failed.length + ' 项被跳过：</p>' +
          '<ul>' + failed.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>'
      });
    }
  }

  function submitStep(pass) {
    var v = view();
    if (!v) return;
    var ta = document.getElementById('tpr-opinion');
    var opinion = ta ? ta.value.trim() : '';
    var r = S.reviewStepByFlowNo(state.flowNo, { pass: pass, opinion: opinion });
    U.toast(r.message, r.ok ? (pass ? 'ok' : 'warn') : 'err');
    if (!r.ok) {
      if (ta && !pass) ta.focus();
      return;
    }
    var f = flow();
    if (f && f.status === 'REVIEWING') {
      state.mode = S.canReviewFlowNow(f) ? 'review' : 'view';
    } else {
      state.mode = 'view';
    }
    repaint();
  }

  /* ------------------------------------------------------------ 注册 */

  function register() {
    U.register('tpr:close', function () { close(); });
    U.register('tpr:pick', function (ds) {
      state.previewId = ds.id;
      repaint();
    });
    U.register('tpr:export', function () {
      var t = previewTopic();
      if (t) App.topic.exportForm(t);
    });
    U.register('tpr:submit', function () { submitAll(); });
    U.register('tpr:pass', function () { submitStep(true); });
    U.register('tpr:reject', function () { submitStep(false); });
  }

  /** Esc 退出（有弹窗时先关弹窗，由 app.js 统一调用） */
  function bindKeys() {
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !isOpen()) return;
      if (document.querySelector('.modal')) return;
      close();
    });
  }

  App.topicReview = {
    openSubmit: openSubmit,
    open: open,
    close: close,
    isOpen: isOpen,
    register: register,
    bindKeys: bindKeys,
    state: function () {
      return { mode: state.mode, ids: state.ids.slice(), previewId: state.previewId, flowNo: state.flowNo };
    }
  };
})(window);
