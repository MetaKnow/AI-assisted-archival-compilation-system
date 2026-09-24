/* ==========================================================================
   消息中心 + 成果发布「审核界面」

   评审要求：审核以**推送审核消息**的方式流转 —— 审核人收到消息后**点击消息弹出审核界面**，
   审核界面**左侧显示审核流程和每个步骤的审核意见**，**右侧显示编研任务成果**。

   实现：
     · 顶栏铃铛 → 消息面板（我的消息 / 全部审核消息；未读高亮；点消息＝已读）
     · 点「成果发布审核待办」类消息 → 打开审核界面（大弹窗，左 40% 流程 + 右 60% 成果）
     · 审核界面底部：审核意见输入 + 「审核通过」/「不通过并退回」两颗按钮
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var KIND = {
    'publish-review': { label: '成果发布审核待办', tag: 'tag-warn' },
    'publish-approved': { label: '成果发布审核通过', tag: 'tag-ok' },
    'publish-rejected': { label: '成果发布审核未通过', tag: 'tag-danger' },
    'topic-review': { label: '选题立项审核待办', tag: 'tag-warn' },
    'topic-approved': { label: '选题立项审核通过', tag: 'tag-ok' },
    'topic-rejected': { label: '选题立项审核未通过', tag: 'tag-danger' },
    info: { label: '通知', tag: '' }
  };

  /** 审核类消息都可以点开审核界面（立项审核 / 成果发布审核两类） */
  function isReviewKind(kind) {
    return /^(publish|topic)-(review|approved|rejected)$/.test(String(kind || ''));
  }
  function isTopicKind(kind) { return String(kind || '').indexOf('topic-') === 0; }

  /* ---------------------------------------------------- 消息面板 */

  function renderPanel() {
    var mine = S.myMessages();
    var all = S.messages();
    var rows = all.map(function (m) {
      var k = KIND[m.kind] || KIND.info;
      var clickable = isReviewKind(m.kind);
      return '<div class="msg-item' + (m.read ? '' : ' msg-unread') + '"' +
          (clickable ? ' data-action="msg:open" data-id="' + esc(m.id) + '"' : '') + '>' +
        '<div class="msg-head">' + U.tag(k.label, k.tag) +
          '<span class="spacer"></span>' +
          '<span class="msg-at">' + esc(String(m.at).slice(0, 16).replace('T', ' ')) + '</span>' +
        '</div>' +
        '<div class="msg-title">' + esc(m.title) + '</div>' +
        '<div class="msg-body">' + esc(m.body) + '</div>' +
        '<div class="msg-foot">收件人：' + esc(m.to || '全体') +
          (clickable ? '　·　<b>点击查看审核界面</b>' : '') + '</div>' +
      '</div>';
    }).join('');

    return '<div class="msg-panel">' +
      '<div class="msg-panel-head">' + icon('bell') + '消息中心' +
        '<span class="spacer"></span>' +
        '<span class="msg-count">共 ' + all.length + ' 条，我的 ' + mine.length + ' 条，未读 ' +
          S.unreadMessageCount() + ' 条</span>' +
      '</div>' +
      '<div class="msg-list">' + (rows || '<div class="cal-hint">还没有消息。</div>') + '</div>' +
      '<div class="msg-panel-foot">' +
        '<span class="cal-hint">原型里流程配置的审核人可能不是当前登录人（当前：' +
          esc((S.currentUser() || {}).name || '') + '），所以这里列出全部审核消息，便于演示逐级审核。</span>' +
      '</div>' +
    '</div>';
  }

  function openPanel() {
    U.modal({
      title: '消息中心',
      width: 760,
      okText: '关闭',
      cancelText: null,
      body: renderPanel()
    });
  }

  /* ---------------------------------------------------- 审核界面 */

  function renderFlow(rec) {
    if (!rec) return '<div class="cal-hint">没有进行中的审核流程。</div>';
    return '<div class="pr-flow">' + rec.steps.map(function (s, i) {
      var st = s.status;
      var label = st === 'PASSED' ? '已通过' : (st === 'REJECTED' ? '未通过'
        : (st === 'SKIPPED' ? '已跳过' : '待审核'));
      var tag = st === 'PASSED' ? 'tag-ok' : (st === 'REJECTED' ? 'tag-danger'
        : (st === 'SKIPPED' ? '' : 'tag-warn'));
      var cur = rec.status === 'REVIEWING' && i === rec.current;
      return '<div class="pr-step' + (cur ? ' pr-step-cur' : '') + '">' +
        '<div class="pr-step-head">' +
          '<span class="pb-step-idx">' + (i + 1) + '</span>' +
          '<span class="pr-step-name">' + esc(s.name) + '</span>' +
          '<span class="spacer"></span>' + U.tag(label, tag) +
        '</div>' +
        '<div class="pr-step-who">审核人：' + reviewerText(s) + '</div>' +
        '<div class="pr-step-opinion">' + (s.opinion
          ? '审核意见：' + esc(s.opinion) + '<span class="pb-step-at">' +
            esc(String(s.at || '').slice(0, 16).replace('T', ' ')) + '　' + esc(s.by || '') + '</span>'
          : '<span class="cal-hint">暂无审核意见</span>') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /** 环节审核人文案：新流程带角色/部门；老的单审核人流程只有姓名 */
  function reviewerText(s) {
    var r = (s.reviewers || [])[0];
    if (r) {
      return esc(s.reviewer) + '（' + esc(r.roleLabel || '') + (r.dept ? '　' + esc(r.dept) : '') + '）';
    }
    return s.reviewer ? esc(s.reviewer) : '未配置';
  }

  function renderDraft(taskId) {
    var nodes = S.outlineOf(taskId).nodes || [];
    var rec = S.composeOf(taskId).chapters || {};
    if (!nodes.length) return '<div class="cal-hint">这个任务还没有大纲。</div>';
    return '<div class="pr-draft">' + nodes.map(function (n, i) {
      var ch = rec[n.id] || {};
      var text = String(ch.text || '').trim();
      return '<div class="pv-ch lv' + n.level + '">' +
        '<div class="pv-title"><span class="tnum">' + (i + 1) + '.</span>' + esc(n.title) + '</div>' +
        (text ? '<div class="pv-text">' + esc(text).replace(/\n/g, '<br>') + '</div>'
          : '<div class="pv-empty">（本章尚未编写）</div>') +
      '</div>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------- 审核界面（全屏） */

  var state = { taskId: null, msgId: null, flowNo: null, chapter: '' };

  function open() { return !!document.getElementById('audit-screen'); }

  /** 编研成果的章节（含各章审核命中数），供目录导航与正文渲染 */
  function chapters(taskId) {
    var nodes = S.outlineOf(taskId).nodes || [];
    var rec = S.composeOf(taskId).chapters || {};
    var items = [];
    ['political', 'professional', 'compliance'].forEach(function (k) {
      (S.auditItems(taskId, k) || []).forEach(function (it) { items.push(it); });
    });
    return nodes.map(function (n) {
      var ch = rec[n.id] || {};
      var hits = items.filter(function (it) { return it.chapterId === n.id; });
      return { id: n.id, title: n.title, level: n.level,
        text: String(ch.text || '').trim(),
        hits: hits.length, open: hits.filter(function (h) { return h.status === 'open'; }).length };
    });
  }

  /** 右侧：编研成果文件 = 目录导航 + 正文（按大纲顺序） */
  function renderDraft(taskId) {
    var list = chapters(taskId);
    if (!list.length) return '<div class="cal-hint">这个任务还没有大纲。</div>';
    var toc = '<div class="apv-toc-head">' + icon('list-tree') + '目录导航' +
        '<span class="spacer"></span><span class="cal-hint">' + list.length + ' 章</span></div>' +
      '<div class="apv-toc-list">' + list.map(function (c, i) {
        return '<button type="button" class="apv-toc-item lv' + c.level +
            (state.chapter === c.id ? ' active' : '') + '" data-action="apv:goto" data-id="' + esc(c.id) + '">' +
            '<span class="tnum">' + (i + 1) + '</span>' +
            '<span class="apv-toc-title">' + esc(c.title) + '</span>' +
            (c.hits ? '<span class="cal-badge' + (c.open ? ' cal-badge-open' : '') + '">' + c.hits + '</span>' : '') +
          '</button>';
      }).join('') + '</div>';

    var body = '<div class="apv-draft-head">' + icon('book-open') + '编研成果文件' +
        '<span class="spacer"></span>' +
        '<span class="cal-hint">按大纲顺序全文（审核用，只读）</span>' +
      '</div>' +
      '<div class="apv-draft-body" id="apv-draft">' + list.map(function (c, i) {
        return '<div class="pv-ch lv' + c.level + '" id="apv-ch-' + esc(c.id) + '">' +
          '<div class="pv-title"><span class="tnum">' + (i + 1) + '.</span>' + esc(c.title) +
            (c.hits ? '<span class="apv-hit">命中 ' + c.hits + ' 处</span>' : '') + '</div>' +
          (c.text ? '<div class="pv-text">' + esc(c.text).replace(/\n/g, '<br>') + '</div>'
            : '<div class="pv-empty">（本章尚未编写）</div>') +
        '</div>';
      }).join('') + '</div>';

    return '<div class="apv-right-grid">' +
        '<aside class="apv-toc">' + toc + '</aside>' +
        '<div class="apv-draft">' + body + '</div>' +
      '</div>';
  }

  function renderReviewBody() {
    var taskId = state.taskId;
    var t = S.getTask(taskId);
    var rec = S.flowView(state.flowNo) || S.publishOf(taskId);
    var sum = S.auditSummary(taskId);
    var step = (rec && rec.current >= 0) ? rec.steps[rec.current] : null;
    var canAct = !!(rec && rec.status === 'REVIEWING' && step);
    var isMyStep = canAct && step.reviewer === ((S.currentUser() || {}).name || '');

    return '<div class="cp-header">' +
        '<span class="cp-brand">' + icon('workflow') + '成果发布审核</span>' +
        '<span class="cp-sep"></span>' +
        '<span class="cp-task" title="' + esc(t ? t.topicName : '') + '">' + esc(t ? t.topicName : '') + '</span>' +
        '<span class="cp-progress">流程 <b>' + esc(rec ? rec.flowNo : '-') + '</b>　·　环节 ' +
          (step ? ((rec.current + 1) + ' / ' + rec.steps.length) : '—') + '　·　审核命中 <b>' +
          sum.total + '</b> 处（未校定 ' + sum.open + '）</span>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn" data-action="apv:close">' + icon('x') + '退出审核</button>' +
      '</div>' +
      '<div class="cp-body apv-body">' +
        '<section class="cp-col apv-left">' +
          '<div class="cp-col-head">' + icon('workflow') + '审核流程与审核意见' +
            '<span class="spacer"></span>' +
            '<span class="cp-col-note">流程 ' + esc(rec ? rec.flowNo : '') + '</span>' +
          '</div>' +
          '<div class="cp-col-body apv-left-body">' +
            renderFlow(rec) +
            (canAct ? '<div class="pr-act">' +
              '<div class="field-label">本环节审核意见' +
                (isMyStep ? '' : '（当前登录人不是本环节审核人，演示时可代为操作）') + '</div>' +
              '<textarea class="textarea" id="pr-opinion" rows="3" maxlength="300" ' +
                'placeholder="请填写审核意见；点「不通过并退回」时必须填写"></textarea>' +
              '<div class="pr-act-btns">' +
                '<button type="button" class="btn btn-primary" data-action="pr:pass" ' +
                  'data-id="' + esc(taskId) + '">' + icon('check') + '审核通过（' + esc(step.name) + '）</button>' +
                '<button type="button" class="btn" data-action="pr:reject" ' +
                  'data-id="' + esc(taskId) + '">' + icon('x') + '不通过并退回审核校定</button>' +
              '</div>' +
            '</div>' : '<div class="data-note">' + icon('info') +
              '<span>该流程已结束（' + esc(rec ? rec.status : '') + '），只能查看审核记录。</span></div>') +
          '</div>' +
        '</section>' +
        '<section class="cp-col apv-right">' + renderDraft(taskId) + '</section>' +
      '</div>';
  }

  function mountScreen() {
    var old = document.getElementById('audit-screen');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.className = 'cp-screen apv-screen';
    el.id = 'audit-screen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '成果发布审核');
    el.innerHTML = renderReviewBody();
    /* ⚠ 与加工编排/校定内容同一套做法：挂 <body>（不进 #overlay-root，避免被弹窗清空），
       自己绑一次事件委托；z-index 95 < 弹层 100，消息列表弹窗仍能盖在它上面 */
    document.body.appendChild(el);
    if (U.initDelegation) U.initDelegation(el);
    var first = chapters(state.taskId)[0];
    state.chapter = first ? first.id : '';
  }

  function repaintScreen() {
    var el = document.getElementById('audit-screen');
    if (el) el.innerHTML = renderReviewBody();
  }

  function openReview(msgId) {
    var m = S.messageOf(msgId);
    if (!m) { U.toast('消息不存在', 'warn'); return; }
    S.readMessage(msgId);
    var flowNo = m.flowNo;
    if (isTopicKind(m.kind)) {
      /* 选题立项审核：打开「立项审核」全屏界面（左：步骤与意见；右：选题可行性评估表） */
      if (App.topicReview) App.topicReview.open(flowNo, m.kind === 'topic-review' ? 'review' : 'view');
      else U.toast('立项审核界面未加载', 'err');
      return;
    }
    if (!flowNo) {
      var rec = S.publishOf(m.taskId);
      flowNo = rec ? rec.flowNo : '';
    }
    if (flowNo) openFlowReview(flowNo);
    else U.toast('该任务没有进行中的审核流程', 'warn');
  }

  /** 按流程编号直接打开审核界面（「流程审核」模块的「查看 / 审核」用得到） */
  function openFlowReview(flowNo) {
    var f = S.getFlow(flowNo);
    if (!f) { U.toast('流程不存在：' + flowNo, 'warn'); return; }
    if (f.type === 'TOPIC_REVIEW') {
      if (App.topicReview) {
        App.topicReview.open(flowNo, S.canReviewFlowNow(f) ? 'review' : 'view');
      } else U.toast('立项审核界面未加载', 'err');
      return;
    }
    var t = S.getTask(f.targetId);
    if (!t) { U.toast('该流程对应的编研任务不存在', 'warn'); return; }
    state.taskId = f.targetId;
    state.flowNo = flowNo;
    state.msgId = null;
    state.chapter = '';
    mountScreen();
    U.toast('已打开成果发布审核界面（全屏，Esc 退出）：左侧流程与审核意见，右侧编研成果文件（带目录导航）', 'ok');
  }

  function closeReview() {
    var el = document.getElementById('audit-screen');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    state.taskId = null;
    state.msgId = null;
    state.flowNo = null;
  }

  /** 目录导航点章节：只重画目录高亮 + 滚动正文，不整屏重画（免得滚动位置被重置） */
  function gotoChapter(id) {
    state.chapter = id;
    var toc = document.querySelector('.apv-toc');
    if (toc) {
      Array.prototype.forEach.call(toc.querySelectorAll('.apv-toc-item'), function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-id') === id);
      });
    }
    var box = document.getElementById('apv-draft');
    var target = document.getElementById('apv-ch-' + id);
    if (box && target) box.scrollTop = target.offsetTop - box.offsetTop;
  }

  function currentOpinion() {
    var ta = document.getElementById('pr-opinion');
    return ta ? ta.value.trim() : '';
  }

  function submit(taskId, pass) {
    var opinion = currentOpinion();
    var flowNo = state.flowNo;
    var r = flowNo ? S.reviewStepByFlowNo(flowNo, { pass: pass, opinion: opinion })
      : S.reviewPublishStep(taskId, { pass: pass, opinion: opinion });
    U.toast(r.message, r.ok ? 'ok' : 'warn');
    if (!r.ok) return;
    /* 这一步审完：界面重画成"下一步待审"（流程已结束就只留记录） */
    repaintScreen();
  }

  /* ---------------------------------------------------- 注册 */

  function register() {
    U.register('msg:panel', function () { openPanel(); });
    U.register('msg:open', function (ds) {
      U.closeTop();                      /* 先关消息列表弹窗，再开全屏审核界面 */
      openReview(ds.id);
    });
    U.register('pr:pass', function (ds) { submit(ds.id, true); });
    U.register('pr:reject', function (ds) { submit(ds.id, false); });
    U.register('apv:close', function () { closeReview(); });
    U.register('apv:goto', function (ds) { gotoChapter(ds.id); });
  }

  /** Esc 退出全屏审核界面（消息列表弹窗打开时先关弹窗） */
  function bindKeys() {
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !open()) return;
      if (document.querySelector('.modal')) return;
      closeReview();
    });
  }

  App.messages = { openPanel: openPanel, openReview: openReview, openFlowReview: openFlowReview,
    closeReview: closeReview, isOpen: open, register: register, bindKeys: bindKeys,
    state: function () { return { taskId: state.taskId, flowNo: state.flowNo, chapter: state.chapter }; } };
})(window);
