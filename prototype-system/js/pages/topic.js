/* ==========================================================================
   页面：选题立项

   对应设计文档「选题立项」：
     1. 新增选题：按《表 C.1 选题可行性评估表示例》弹出评估表，可填写保存，
        表下方支持上传附件；保存后以列表展现（勾选框、序号、选题名称、状态、
        创建时间、创建人）；选题名称右侧提供「AI 辅助选题」入口
     2. 修改选题：弹出同一张评估表
     3. 删除选题：仅「未开始」的选题允许删除
     4. 发起审核：调用《编研选题立项审核》流程

   原型边界：
     · AI 辅助选题只呈现页面，不调用真实模型（文档明确允许）
     · 附件只记录文件名与大小，不做真实上传（纯前端无后端）
     · 发起审核只登记流程记录，审批环节留给「审核校定」模块
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  /* 页面级状态：筛选、搜索、勾选、表单附件暂存 */
  var state = {
    keyword: '',
    status: '',
    selected: {},
    formFiles: []
  };

  /* ------------------------------------------------------------ 小工具 */

  function statusDef(s) { return App.mock.TOPIC_STATUS[s] || { label: s, tag: '' }; }

  function visibleTopics() {
    var kw = state.keyword.trim().toLowerCase();
    return S.topics().filter(function (t) {
      if (state.status && t.status !== state.status) return false;
      if (kw && t.name.toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
  }

  function selectedIds() {
    return Object.keys(state.selected).filter(function (id) {
      return state.selected[id] && S.getTopic(id);
    });
  }

  function purgeSelection() {
    Object.keys(state.selected).forEach(function (id) {
      if (!S.getTopic(id)) delete state.selected[id];
    });
  }

  function isReviewing(t) { return !!(t.review && t.review.status === 'REVIEWING'); }

  /* ------------------------------------------------------------ 列表页 */

  function renderToolbar() {
    var options = [{ v: '', l: '全部状态' }].concat(
      Object.keys(App.mock.TOPIC_STATUS).map(function (k) {
        return { v: k, l: App.mock.TOPIC_STATUS[k].label };
      })
    ).map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (state.status === o.v ? ' selected' : '') + '>' +
        esc(o.l) + '</option>';
    }).join('');

    var total = S.topics().length;
    var shown = visibleTopics().length;

    return '<div class="toolbar">' +
      '<button type="button" class="btn btn-primary" data-action="topic:new">' +
        icon('plus') + '新增选题</button>' +
      '<span class="toolbar-note">共 ' + total + ' 个选题' +
        (shown === total ? '' : '，当前筛选出 ' + shown + ' 个') + '</span>' +
      '<span class="spacer"></span>' +
      '<label class="sr-only" for="topic-status">按状态筛选</label>' +
      '<select class="select select-inline" id="topic-status" data-change="topic:filter">' +
        options + '</select>' +
      '<label class="sr-only" for="topic-kw">按选题名称搜索</label>' +
      '<input class="input input-inline" id="topic-kw" type="search" placeholder="搜索选题名称" ' +
        'value="' + esc(state.keyword) + '" data-enter="topic:search">' +
      '<button type="button" class="btn" data-action="topic:search">' + icon('search') + '搜索</button>' +
      (state.keyword || state.status ?
        '<button type="button" class="btn btn-text" data-action="topic:clear-filter">重置</button>' : '') +
    '</div>';
  }

  function renderBatchBar() {
    var n = selectedIds().length;
    if (!n) return '';
    return '<div class="batch-bar">' +
      '已选 <b>' + n + '</b> 项' +
      '<button type="button" class="btn btn-sm" data-action="topic:batch-review">' +
        icon('send') + '发起审核</button>' +
      '<button type="button" class="btn btn-sm" data-action="topic:batch-delete">' +
        icon('trash') + '删除</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn-sm btn-text" data-action="topic:clear-select">取消选择</button>' +
    '</div>';
  }

  function actionBtn(action, id, label, iconName, disabled, title) {
    return '<button type="button" class="btn btn-sm btn-text" data-action="' + action + '" ' +
      'data-id="' + esc(id) + '"' +
      (disabled ? ' aria-disabled="true"' : '') +
      (title ? ' title="' + esc(title) + '"' : '') + '>' +
      (iconName ? icon(iconName) : '') + esc(label) + '</button>';
  }

  function nameCell(t) {
    /* 名称点击 = 查看（只读）；编辑只走行内的「修改」按钮 */
    var parts = ['<button type="button" class="link-btn" data-action="topic:view" data-id="' +
      esc(t.id) + '" title="查看选题可行性评估表（只读）">' + esc(t.name) + '</button>'];

    if (t.attachments && t.attachments.length) {
      var names = t.attachments.map(function (a) { return a.name; }).join('；');
      parts.push('<span class="attach-chip" title="附件：' + esc(names) + '">' +
        icon('paperclip') + t.attachments.length + '</span>');
    }
    /* 立项审核结果也要显示：原先只处理了「审核中」，
       审核通过/不通过后标签就消失了，审批结果在选题列表上看不见 */
    if (t.review) {
      var tip = t.review.flowNo + (t.review.opinion ? '　审核意见：' + t.review.opinion : '');
      if (t.review.status === 'REVIEWING') {
        // 带上流程编号：便于与「审核校定」模块里的流程对上号
        parts.push(U.tag('立项审核中 ' + t.review.flowNo, 'tag-warn', tip));
      } else if (t.review.status === 'APPROVED') {
        parts.push(U.tag('立项已通过', 'tag-ok', tip));
      } else if (t.review.status === 'REJECTED') {
        parts.push(U.tag('立项未通过', 'tag-danger', tip));
      }
    }
    return '<div class="cell-name">' + parts.join('') + '</div>';
  }

  function renderTable(rows) {
    var allChecked = rows.length > 0 && rows.every(function (t) { return state.selected[t.id]; });

    var body = rows.map(function (t, i) {
      var canDelete = S.canDeleteTopic(t);
      var canReview = t.status === 'NOT_STARTED' && !isReviewing(t);

      return '<tr' + (state.selected[t.id] ? ' class="selected"' : '') + '>' +
        '<td class="col-check"><input type="checkbox" data-change="topic:select" ' +
          'data-id="' + esc(t.id) + '"' + (state.selected[t.id] ? ' checked' : '') +
          ' aria-label="选择 ' + esc(t.name) + '"></td>' +
        '<td class="col-idx tnum">' + (i + 1) + '</td>' +
        '<td>' + nameCell(t) + '</td>' +
        '<td class="col-status">' + U.tag(statusDef(t.status).label, statusDef(t.status).tag) + '</td>' +
        '<td class="col-time tnum">' + esc(App.util.fmtDateTime(t.createdAt)) + '</td>' +
        '<td class="col-user">' + esc(t.createdBy) + '</td>' +
        '<td class="col-actions"><div class="row-actions">' +
          actionBtn('topic:edit', t.id, '修改', 'pencil', false) +
          actionBtn('topic:review', t.id, '发起审核', null, !canReview,
            canReview ? '调用《编研选题立项审核》流程'
              : (isReviewing(t) ? '已存在审核中的立项流程' : '仅「未开始」的选题可以发起立项审核')) +
          actionBtn('topic:delete', t.id, '删除', null, !canDelete,
            canDelete ? '删除该选题' : '仅「未开始」的选题允许删除') +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table">' +
      '<thead><tr>' +
        '<th class="col-check"><input type="checkbox" id="topic-check-all" ' +
          'data-change="topic:select-all"' + (allChecked ? ' checked' : '') +
          ' aria-label="全选当前列表"></th>' +
        '<th class="col-idx">序号</th>' +
        '<th>选题名称</th>' +
        '<th class="col-status">状态</th>' +
        '<th class="col-time">创建时间</th>' +
        '<th class="col-user">创建人</th>' +
        '<th class="col-actions">操作</th>' +
      '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table></div>';
  }

  function render() {
    var rows = visibleTopics();
    purgeSelection();

    return '' +
      renderToolbar() +
      /* 批量操作条放在固定容器里：勾选时只更新这一块，不整页重渲染，
         避免每次点复选框都丢焦点、跳滚动位置 */
      '<div id="topic-batch">' + renderBatchBar() + '</div>' +
      '<section class="card">' +
        (rows.length ? renderTable(rows) :
          '<div class="card-body">' + U.empty(
            (state.keyword || state.status) ? '没有符合条件的选题' : '还没有选题，先新增一个',
            'lightbulb',
            (state.keyword || state.status)
              ? '<button class="btn" data-action="topic:clear-filter">' + icon('rotate-ccw') + '清除筛选</button>'
              : '<button class="btn btn-primary" data-action="topic:new">' + icon('plus') + '新增选题</button>'
          ) + '</div>') +
      '</section>';
  }

  /**
   * 只同步「勾选」相关的界面：行高亮、表头半选、批量操作条。
   * 不走整页重渲染 —— 复选框是高频操作，重渲染会丢焦点、跳滚动位置。
   */
  function syncSelection() {
    var root = document.getElementById('main');
    if (!root) return;
    var rows = visibleTopics();

    rows.forEach(function (t) {
      var cb = root.querySelector('input[data-change="topic:select"][data-id="' + t.id + '"]');
      if (!cb) return;
      var on = !!state.selected[t.id];
      cb.checked = on;
      var tr = cb.closest ? cb.closest('tr') : null;
      if (tr) tr.classList.toggle('selected', on);
    });

    var sel = rows.filter(function (t) { return state.selected[t.id]; }).length;
    var all = root.querySelector('#topic-check-all');
    if (all) {
      all.checked = rows.length > 0 && sel === rows.length;
      all.indeterminate = sel > 0 && sel < rows.length;
    }

    var bar = root.querySelector('#topic-batch');
    if (bar) bar.innerHTML = renderBatchBar();
  }

  /* ------------------------------------------------------- 评估表表单 */

  function blank() {
    return {
      id: '', name: '', team: '', budget: '', fundingSources: [], subsidy: '',
      background: '', content: '', plan: '', guarantee: '', comment: '', attachments: []
    };
  }

  function row(label, required, fieldHtml) {
    return '<div class="form-row">' +
      '<div class="form-label">' + esc(label) + (required ? '<span class="req">*</span>' : '') + '</div>' +
      '<div class="form-field">' + fieldHtml + '</div>' +
    '</div>';
  }

  function textarea(id, value, rows, placeholder) {
    return '<textarea class="textarea" id="' + id + '" rows="' + rows + '" ' +
      'placeholder="' + esc(placeholder || '') + '">' + esc(value || '') + '</textarea>';
  }

  function nameField(t) {
    return '<div class="input-with-action">' +
      '<input class="input" id="f-name" type="text" maxlength="120" ' +
        'placeholder="例：本市教育事业发展史料汇编" value="' + esc(t.name) + '">' +
      '<button type="button" class="btn" data-action="topic:ai" ' +
        'title="调用 AI 生成候选主题（原型只呈现页面）">' +
        icon('sparkles') + 'AI 辅助选题</button>' +
    '</div>';
  }

  function fundingField(t) {
    var sources = (t.fundingSources || []).map(function (s) { return s; });
    var checks = App.mock.FUNDING_SOURCES.map(function (f) {
      return '<label class="check"><input type="checkbox" name="funding" value="' + esc(f.value) + '"' +
        (sources.indexOf(f.value) >= 0 ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
    }).join('');

    return '<div class="field-inline-grid">' +
      '<div class="inline-item">' +
        '<label for="f-budget">总预算</label>' +
        '<input class="input" id="f-budget" inputmode="numeric" placeholder="0" value="' + esc(t.budget) + '">' +
        '<span class="muted">元</span>' +
      '</div>' +
      '<div class="inline-item">' +
        '<label>来源</label>' +
        '<div class="check-group">' + checks + '</div>' +
      '</div>' +
      '<div class="inline-item">' +
        '<label for="f-subsidy">申请补助金额</label>' +
        '<input class="input" id="f-subsidy" inputmode="numeric" placeholder="0" value="' + esc(t.subsidy) + '">' +
        '<span class="muted">元</span>' +
      '</div>' +
    '</div>' +
    '<div class="form-field-extra">勾选「申请补助」时需填写申请补助金额。</div>';
  }

  function attachListHtml() {
    if (!state.formFiles.length) return '<div class="attach-empty">尚未上传附件</div>';
    return '<div class="attach-list">' + state.formFiles.map(function (f, i) {
      return '<div class="attach-item">' + icon('file-text') +
        '<span class="attach-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
        '<span class="attach-size">' + esc(App.util.fmtSize(f.size)) + '</span>' +
        '<button type="button" class="btn btn-sm btn-text" data-action="topic:remove-file" ' +
          'data-i="' + i + '" title="移除该附件" aria-label="移除 ' + esc(f.name) + '">' +
          icon('x') + '</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  function attachField() {
    return '<div class="attach-head">' +
        '<button type="button" class="btn btn-sm" data-action="topic:pick-files">' +
          icon('upload') + '选择文件</button>' +
        '<span class="muted" style="font-size:var(--fs-xs)">可多选；原型不真正上传，只记录文件名与大小</span>' +
      '</div>' +
      '<input type="file" id="f-files" class="sr-only" multiple data-change="topic:attach">' +
      '<div id="f-attach-list">' + attachListHtml() + '</div>';
  }

  function formHtml(t) {
    return '<div class="form-table">' +
      row('选题名称', true, nameField(t)) +
      row('编研团队', false, textarea('f-team', t.team, 3,
        '团队成员情况：姓名、文化程度、所学专业、所在单位、在项目中承担的任务、已有编研成果及获奖情况等')) +
      row('经费情况', false, fundingField(t)) +
      row('背景与意义', false, textarea('f-background', t.background, 5,
        '1. 立项依据：包括项目预期解决的问题、项目的必要性和可行性等；\n2. 背景介绍：包括项目涉及的档案资料、已有相关成果的梳理、目前存在的主要问题等；\n3. 创新点：包括在项目实施过程和项目最终成果中的创新。')) +
      row('内容与目标', false, textarea('f-content', t.content, 5,
        '1. 项目内容：包括要开展的具体工作、工作的总体框架、工作中的重点和难点等；\n2. 项目目标：包括项目总体目标和阶段性节点目标，目标要尽量细化和量化，阶段目标要列出时间节点，分期实施项目还要列出年度目标。')) +
      row('实施方案', false, textarea('f-plan', t.plan, 4,
        '1. 工作思路；\n2. 工作计划；\n3. 工作方法。')) +
      row('保障措施', false, textarea('f-guarantee', t.guarantee, 4,
        '1. 前期保障：包括已有工作基础、前期准备工作等；\n2. 人才保障：包括团队负责人及其在相关领域的积累和贡献，项目单位的人才资源以及在相关领域的积累等；\n3. 硬件保障：包括实施项目必需的档案资料、设备设施等条件。')) +
      row('评估意见', false, textarea('f-comment', t.comment, 3, '评估意见、盖章与日期。')) +
      row('附件', false, attachField()) +
    '</div>';
  }

  function fieldValue(el, id) {
    var node = el.querySelector('#' + id);
    return node ? node.value.trim() : '';
  }

  /** 金额：空串允许；非数字返回 null 以便提示 */
  function amount(v) {
    var s = String(v || '').replace(/[,\s]/g, '');
    if (!s) return '';
    return /^\d+(\.\d+)?$/.test(s) ? s : null;
  }

  /** @returns {boolean} false 表示校验未通过，弹窗不关闭 */
  function saveForm(modalEl, id) {
    var name = fieldValue(modalEl, 'f-name');
    if (!name) {
      U.toast('请填写选题名称', 'warn');
      var nameEl = modalEl.querySelector('#f-name');
      if (nameEl) nameEl.focus();
      return false;
    }
    if (S.topicNameExists(name, id || null)) {
      U.toast('已存在同名选题：「' + name + '」', 'err');
      return false;
    }

    var sources = Array.prototype.slice
      .call(modalEl.querySelectorAll('input[name="funding"]:checked'))
      .map(function (c) { return c.value; });

    var budget = amount(fieldValue(modalEl, 'f-budget'));
    var subsidy = amount(fieldValue(modalEl, 'f-subsidy'));
    if (budget === null || subsidy === null) {
      U.toast('总预算与申请补助金额请填写数字', 'warn');
      return false;
    }
    if (sources.indexOf('SUBSIDY') >= 0 && !subsidy) {
      U.toast('经费来源勾选了「申请补助」，请填写申请补助金额', 'warn');
      var subEl = modalEl.querySelector('#f-subsidy');
      if (subEl) subEl.focus();
      return false;
    }

    var data = {
      name: name,
      team: fieldValue(modalEl, 'f-team'),
      budget: budget,
      fundingSources: sources,
      subsidy: subsidy,
      background: fieldValue(modalEl, 'f-background'),
      content: fieldValue(modalEl, 'f-content'),
      plan: fieldValue(modalEl, 'f-plan'),
      guarantee: fieldValue(modalEl, 'f-guarantee'),
      comment: fieldValue(modalEl, 'f-comment'),
      attachments: state.formFiles.slice()
    };

    if (id) {
      S.updateTopic(id, data);
      U.toast('已保存选题「' + name + '」的修改', 'ok');
    } else {
      S.addTopic(data);
      U.toast('已新增选题「' + name + '」', 'ok');
    }
    return true;
  }

  function openForm(topic) {
    var isEdit = !!(topic && topic.id);
    var t = isEdit ? topic : blank();
    state.formFiles = (t.attachments || []).map(function (a) {
      return { name: a.name, size: a.size };
    });

    U.modal({
      title: (isEdit ? '修改选题 · ' : '新增选题 · ') + '选题可行性评估表',
      width: 960,
      body: formHtml(t),
      okText: isEdit ? '保存修改' : '保存',
      cancelText: '取消',
      onOk: function (el) { return saveForm(el, isEdit ? t.id : null); }
    });
  }

  /* ------------------------------------------------------- 只读查看 */

  /** 只读行：直接给字段内容（用于附件这类自定义渲染） */
  function readRowHtml(label, innerHtml) {
    return '<div class="form-row">' +
      '<div class="form-label">' + esc(label) + '</div>' +
      '<div class="form-field">' + innerHtml + '</div>' +
    '</div>';
  }

  /** 只读行：文本字段。kind: '' 短字段 | 'long' 叙述性长文本 | 'title' 选题名称 */
  function readRow(label, value, kind) {
    var txt = String(value === undefined || value === null ? '' : value).trim();
    if (!txt) return readRowHtml(label, '<span class="read-empty">未填写</span>');
    if (kind === 'long') {
      return readRowHtml(label, '<div class="read-long">' + esc(txt) + '</div>');
    }
    return readRowHtml(label,
      '<div class="read-value' + (kind === 'title' ? ' read-title' : '') + '">' + esc(txt) + '</div>');
  }

  function fundingText(t) {
    var srcs = (t.fundingSources || []).map(function (v) {
      var f = App.mock.FUNDING_SOURCES.filter(function (x) { return x.value === v; })[0];
      return f ? f.label : v;
    });
    return [
      '总预算：' + (t.budget ? App.util.fmtInt(t.budget) + ' 元' : '未填写'),
      '来源：' + (srcs.length ? srcs.join('、') : '未填写'),
      '申请补助金额：' + (t.subsidy ? App.util.fmtInt(t.subsidy) + ' 元' : '未填写')
    ].join('　｜　');
  }

  function attachReadHtml(t) {
    if (!t.attachments || !t.attachments.length) {
      return '<span class="read-empty">无附件</span>';
    }
    return '<div class="attach-list">' + t.attachments.map(function (a) {
      return '<div class="attach-item">' + icon('file-text') +
        '<span class="attach-name" title="' + esc(a.name) + '">' + esc(a.name) + '</span>' +
        '<span class="attach-size">' + esc(App.util.fmtSize(a.size)) + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function viewMeta(t) {
    var d = statusDef(t.status);
    var items = [
      U.tag(d.label, d.tag),
      '<span>创建人 ' + esc(t.createdBy) + '</span>',
      '<span>创建时间 ' + esc(App.util.fmtDateTime(t.createdAt)) + '</span>'
    ];
    if (t.updatedAt) items.push('<span>最近修改 ' + esc(App.util.fmtDateTime(t.updatedAt)) + '</span>');
    if (isReviewing(t)) items.push(U.tag('立项审核中 ' + t.review.flowNo, 'tag-warn'));
    return '<div class="view-meta">' +
      items.join('<span class="view-meta-sep">·</span>') + '</div>';
  }

  /**
   * 只读《选题可行性评估表》。
   * 查看弹窗、「立项审核」全屏界面（右栏）与导出文件都用这一份，避免三处走样。
   */
  function readonlyFormHtml(t) {
    return '<div class="form-table form-table-read">' +
        readRow('选题名称', t.name, 'title') +
        readRow('编研团队', t.team, 'long') +
        readRow('经费情况', fundingText(t)) +
        readRow('背景与意义', t.background, 'long') +
        readRow('内容与目标', t.content, 'long') +
        readRow('实施方案', t.plan, 'long') +
        readRow('保障措施', t.guarantee, 'long') +
        readRow('评估意见', t.comment, 'long') +
        readRowHtml('附件', attachReadHtml(t)) +
      '</div>';
  }

  /**
   * 查看编研选题：与填写态同一张《选题可行性评估表》，但**完全只读** ——
   * 不渲染任何 input/textarea，避免"看起来能改其实改不了"的误导。
   */
  function openView(t) {
    var body = viewMeta(t) + readonlyFormHtml(t) +
      '<div class="hstack" style="margin-top:var(--s3)">' +
        '<button type="button" class="btn" data-action="topic:export" data-id="' + esc(t.id) + '">' +
          icon('download') + '导出选题可行性评估表</button>' +
        '<span class="muted" style="font-size:var(--fs-xs)">原型导出为 HTML 文件（生产环境导出 Word / PDF）</span>' +
      '</div>' +
      '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
        '<span>本页为<b>只读查看</b>：如需修改，请关闭后点击列表中的「修改」按钮。</span>' +
      '</div>';

    U.modal({
      title: '查看编研选题 · 选题可行性评估表',
      width: 960,
      body: body,
      okText: '关闭',
      cancelText: null
    });
  }

  /* ------------------------------------------------- 导出评估表 */

  function exportHtml(t) {
    var now = App.util.fmtDateTime(new Date().toISOString());
    function field(label, inner) {
      return '<tr><th>' + esc(label) + '</th><td>' + inner + '</td></tr>';
    }
    function text(v) {
      var x = String(v === undefined || v === null ? '' : v).trim();
      return x ? esc(x).replace(/\n/g, '<br>') : '<span class="empty">未填写</span>';
    }
    var attach = (!t.attachments || !t.attachments.length)
      ? '<span class="empty">无附件</span>'
      : t.attachments.map(function (a) {
          return esc(a.name) + '（' + esc(App.util.fmtSize(a.size)) + '）';
        }).join('；');

    return '<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8">' +
      '<title>选题可行性评估表 · ' + esc(t.name) + '</title>' +
      '<style>' +
      'body{font-family:"Songti SC","SimSun",serif;margin:32px;color:#1f2937;font-size:14px}' +
      'h1{font-size:22px;text-align:center;margin:0 0 6px}' +
      '.sub{text-align:center;color:#6b7280;font-size:12px;margin-bottom:18px}' +
      'table{width:100%;border-collapse:collapse;table-layout:fixed}' +
      'th,td{border:1px solid #9ca3af;padding:8px 10px;vertical-align:top;word-break:break-word}' +
      'th{width:110px;background:#f3f4f6;text-align:left;font-weight:600}' +
      '.empty{color:#9ca3af}' +
      '.foot{margin-top:14px;color:#6b7280;font-size:12px}' +
      '</style></head><body>' +
      '<h1>选题可行性评估表</h1>' +
      '<div class="sub">选题编号 ' + esc(t.id) + '　·　导出时间 ' + esc(now) + '</div>' +
      '<table>' +
        field('选题名称', text(t.name)) +
        field('状态', esc(statusDef(t.status).label)) +
        field('创建人', esc(t.createdBy) + '　' + esc(App.util.fmtDateTime(t.createdAt))) +
        field('编研团队', text(t.team)) +
        field('经费情况', esc(fundingText(t))) +
        field('背景与意义', text(t.background)) +
        field('内容与目标', text(t.content)) +
        field('实施方案', text(t.plan)) +
        field('保障措施', text(t.guarantee)) +
        field('评估意见', text(t.comment)) +
        field('附件', attach) +
      '</table>' +
      '<div class="foot">本表由档案辅助编研系统自动导出（原型导出为 HTML，生产环境可导出 Word / PDF）。</div>' +
      '</body></html>';
  }

  /** 导出《选题可行性评估表》：本地生成文件并触发浏览器下载（原型无服务端） */
  function exportForm(t) {
    if (!t) { U.toast('没有可导出的选题', 'warn'); return; }
    try {
      var blob = new Blob([exportHtml(t)], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '选题可行性评估表-' + String(t.name || t.id).replace(/[\\/:*?"<>|\s]+/g, '_') + '-' +
        String(new Date().toISOString()).slice(0, 10) + '.html';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
      U.toast('已导出《选题可行性评估表》：' + a.download, 'ok');
    } catch (e) {
      U.toast('导出失败：' + (e && e.message ? e.message : e), 'err');
    }
  }

  /* --------------------------------------------------- AI 辅助选题 */

  function supportTag(level) {
    var cls = level === '强' ? 'tag-ok' : (level === '中' ? 'tag-warn' : '');
    return U.tag('史料支撑度 ' + level, cls);
  }

  function openAi() {
    var body =
      '<div class="alert alert-info" role="note">' +
        '<span class="alert-icon">' + icon('info') + '</span>' +
        '<div><div class="alert-title">原型不调用真实模型</div>' +
        '本页只呈现「AI 辅助选题」的交互形态：候选主题为预置结果，' +
        '点击「采用」会填入选题名称与立项依据。' +
        '生产环境由内网模型基于馆藏真实召回生成（召回结果作为上下文交给模型）。</div>' +
      '</div>' +
      '<div style="margin-top:var(--s3)">' +
        App.mock.AI_TOPIC_CANDIDATES.map(function (c, i) {
          return '<div class="ai-cand">' +
            '<div class="ai-main">' +
              '<div class="ai-title">' + esc(c.name) + '</div>' +
              '<div class="ai-basis">' + esc(c.basis) + '</div>' +
            '</div>' +
            '<div class="ai-side">' + supportTag(c.support) +
              '<button type="button" class="btn btn-sm btn-primary" data-action="topic:ai-use" ' +
                'data-i="' + i + '">采用</button>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';

    U.modal({ title: 'AI 辅助选题 · 候选主题', width: 780, body: body, okText: '关闭', cancelText: null });
  }

  /* ------------------------------------------------------- 发起审核 */

  /**
   * 发起立项审核：打开**浏览器内全屏**的《编研选题立项审核》界面 ——
   * 左：本次发起的选题 + 审核步骤与审核意见；右：《选题可行性评估表》。
   * 在界面上确认后才真正登记流程（不再只用一行 confirm 文案带过）。
   */
  function doReview(ids) {
    if (!ids.length) return;
    if (App.topicReview) {
      App.topicReview.openSubmit(ids);
      return;
    }
    U.toast('「立项审核」界面未加载，无法发起审核', 'err');
  }

  /* ----------------------------------------------------------- 删除 */

  function doDelete(ids) {
    if (!ids.length) return;
    var deletable = ids.filter(function (id) { return S.canDeleteTopic(S.getTopic(id)); });
    var blocked = ids.filter(function (id) { return deletable.indexOf(id) < 0; });

    if (!deletable.length) {
      reportSkipped(blocked);
      return;
    }

    var title = deletable.length === 1
      ? '删除选题「' + esc(S.getTopic(deletable[0]).name) + '」？'
      : '删除选中的 ' + deletable.length + ' 个选题？';

    U.confirm({
      title: '确认删除',
      content: title + '<div class="muted" style="margin-top:6px;font-size:var(--fs-xs)">' +
        '删除后不可恢复；状态不是「未开始」的选题会被自动跳过。</div>',
      okText: '确认删除'
    }).then(function (ok) {
      if (!ok) return;
      var res = S.deleteTopics(deletable);
      deletable.forEach(function (id) { delete state.selected[id]; });
      // 数据已变（行会消失），这里需要整页重渲染；store 的订阅已触发 */
      
      if (res.deleted.length) {
        U.toast(res.deleted.length === 1
          ? '已删除「' + res.deleted[0] + '」'
          : '已删除 ' + res.deleted.length + ' 个选题', 'ok');
      }
      if (blocked.length) reportSkipped(blocked);
    });
  }

  function reportSkipped(ids) {
    if (!ids.length) return;
    var items = ids.map(function (id) {
      var t = S.getTopic(id);
      return '<li>' + esc(t ? t.name : id) + '　' +
        U.tag(statusDef(t ? t.status : '').label, statusDef(t ? t.status : '').tag) + '</li>';
    }).join('');
    U.modal({
      title: '部分选题无法删除', width: 620, cancelText: null, okText: '知道了',
      body: '<p>按规则<b>仅「未开始」的选题允许删除</b>，以下选题未删除：</p><ul>' + items + '</ul>'
    });
  }

  /* ------------------------------------------------------------ 交互 */

  function register() {
    /* 全屏「立项审核」界面的动作（实现在 topic-review.js）：boot 时随本页一起注册 */
    if (App.topicReview && App.topicReview.register) App.topicReview.register();

    /* 列表 */
    U.register('topic:new', function () { openForm(null); });
    U.register('topic:edit', function (ds) {
      var t = S.getTopic(ds.id);
      if (t) openForm(t);
    });

    U.register('topic:view', function (ds) {
      var t = S.getTopic(ds.id);
      if (t) openView(t);
    });
    U.register('topic:export', function (ds) {
      var t = S.getTopic(ds.id);
      if (t) exportForm(t);
    });
    U.register('topic:delete', function (ds) { doDelete([ds.id]); });
    U.register('topic:batch-delete', function () { doDelete(selectedIds()); });
    U.register('topic:review', function (ds) { doReview([ds.id]); });
    U.register('topic:batch-review', function () { doReview(selectedIds()); });

    /* 勾选：只更新受影响的界面，不整页重渲染 */
    U.register('topic:select', function (ds, el) {
      if (el.checked) state.selected[ds.id] = true;
      else delete state.selected[ds.id];
      syncSelection();
    });
    U.register('topic:select-all', function (ds, el) {
      var rows = visibleTopics();
      if (el.checked) rows.forEach(function (t) { state.selected[t.id] = true; });
      else rows.forEach(function (t) { delete state.selected[t.id]; });
      syncSelection();
    });
    U.register('topic:clear-select', function () {
      state.selected = {};
      syncSelection();
    });

    /* 筛选与搜索 */
    U.register('topic:filter', function (ds, el) {
      state.status = el.value;
      state.selected = {};
      App.app.render();
    });
    U.register('topic:search', function () {
      var el = document.getElementById('topic-kw');
      state.keyword = el ? el.value : '';
      state.selected = {};
      App.app.render();
    });
    U.register('topic:clear-filter', function () {
      state.keyword = '';
      state.status = '';
      state.selected = {};
      App.app.render();
    });

    /* AI 辅助选题 */
    U.register('topic:ai', function () { openAi(); });
    U.register('topic:ai-use', function (ds) {
      var c = App.mock.AI_TOPIC_CANDIDATES[parseInt(ds.i, 10)];
      if (!c) return;
      var nameEl = document.getElementById('f-name');
      var bgEl = document.getElementById('f-background');
      if (nameEl) nameEl.value = c.name;
      // 一并填入立项依据，省去重敲；其余字段留给人工补充
      if (bgEl && !bgEl.value.trim()) bgEl.value = '1. 立项依据：' + c.basis;
      U.closeTop();
      U.toast('已采用候选主题（原型未调用真实模型）', 'ok');
      if (nameEl) nameEl.focus();
    });

    /* 附件 */
    U.register('topic:pick-files', function () {
      var input = document.getElementById('f-files');
      if (input) input.click();
    });
    U.register('topic:attach', function (ds, el) {
      var files = el.files ? Array.prototype.slice.call(el.files) : [];
      files.forEach(function (f) {
        state.formFiles.push({ name: f.name, size: f.size });
      });
      var list = document.getElementById('f-attach-list');
      if (list) list.innerHTML = attachListHtml();
      el.value = '';  // 允许再次选择同一个文件
      if (files.length) U.toast('已添加 ' + files.length + ' 个附件（仅记录文件名与大小）', 'ok');
    });
    U.register('topic:remove-file', function (ds) {
      state.formFiles.splice(parseInt(ds.i, 10), 1);
      var list = document.getElementById('f-attach-list');
      if (list) list.innerHTML = attachListHtml();
    });
  }

  /** 挂载后：把表头复选框设为半选状态 */
  function mount(root) {
    var all = root.querySelector('#topic-check-all');
    if (!all) return;
    var rows = visibleTopics();
    var sel = rows.filter(function (t) { return state.selected[t.id]; }).length;
    all.indeterminate = sel > 0 && sel < rows.length;
  }

  App.topic = {
    readonlyFormHtml: readonlyFormHtml,
    viewMeta: viewMeta,
    exportForm: exportForm,
    fundingText: fundingText,
    statusDef: statusDef
  };

  App.pages = App.pages || {};
  App.pages.topic = {
    render: render,
    register: register,
    mount: mount,
    pageClass: 'page-compact'
  };
})(window);
