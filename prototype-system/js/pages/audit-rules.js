/* ==========================================================================
   页面：系统管理 · 归档设置 → 审核规则

   参照系统：「档博通档案智能开放鉴定系统」的**敏感内容管理**
   （`#/sensitive/sensitive-content`，2026-09-24 抓取的数据与字段）。

   对齐情况：
     · 表格列：勾选、序号、敏感内容标题、敏感内容（长文本，列表里截断显示）、敏感类型、
       控制标志、创建时间、是否启用；另加本系统必需的「操作」（查看）
     · 工具栏：关键词搜索 + 敏感类型筛选 + 控制标志筛选 + 是否启用筛选
       +「添加 / 修改 / 删除」（参照系统的工具栏就是这三颗 + 更多操作）
     · 添加 / 修改弹窗字段：敏感内容标题*、敏感内容*、敏感类型*、控制标志*、是否启用（开关）、
       关闭 / 保存 —— 与参照系统表单一一对应
     · 数据：参照系统 20 条敏感内容原文照录（见 js/mock-audit.js），
       所以「政治性审核」命中的规则标题与敏感内容与参照系统一致
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var PAGE_SIZE = 20;

  var state = {
    keyword: '',
    typeId: '',
    flag: '',
    enable: '',
    page: 1,
    selected: {}
  };

  function visibleRules() {
    var kw = state.keyword.trim();
    return S.auditRules().filter(function (r) {
      if (state.typeId && String(r.typeId) !== String(state.typeId)) return false;
      if (state.flag && r.controlFlag !== state.flag) return false;
      if (state.enable === 'on' && r.enable === false) return false;
      if (state.enable === 'off' && r.enable !== false) return false;
      if (kw && (r.title + r.content + (r.typeName || '')).indexOf(kw) < 0) return false;
      return true;
    });
  }

  function selectedIds() {
    return Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
  }

  /* ---------------------------------------------------------- 列表 */

  function renderToolbar() {
    var typeOptions = ['<option value="">全部敏感类型</option>'].concat(
      S.auditRuleTypes().map(function (t) {
        return '<option value="' + t.id + '"' + (String(state.typeId) === String(t.id) ? ' selected' : '') +
          '>' + esc(t.name) + '</option>';
      })).join('');
    var flagOptions = ['<option value="">全部控制标志</option>'].concat(
      S.auditControlFlags().map(function (f) {
        return '<option value="' + esc(f.value) + '"' + (state.flag === f.value ? ' selected' : '') +
          '>' + esc(f.title) + '</option>';
      })).join('');
    var enableOptions = [
      ['', '全部状态'], ['on', '已启用'], ['off', '已停用']
    ].map(function (p) {
      return '<option value="' + p[0] + '"' + (state.enable === p[0] ? ' selected' : '') +
        '>' + p[1] + '</option>';
    }).join('');

    var picked = selectedIds().length;
    return '<div class="toolbar">' +
      '<label class="sr-only" for="ar-kw">搜索审核规则</label>' +
      '<input class="input input-sm" id="ar-kw" maxlength="40" placeholder="搜索敏感内容标题或内容" ' +
        'value="' + esc(state.keyword) + '" data-input="rule:keyword">' +
      '<button type="button" class="btn btn-sm" data-action="rule:search">' + icon('search') + '搜索</button>' +
      '<label class="sr-only" for="ar-type">按敏感类型筛选</label>' +
      '<select class="select select-inline" id="ar-type" data-change="rule:filter">' + typeOptions + '</select>' +
      '<label class="sr-only" for="ar-flag">按控制标志筛选</label>' +
      '<select class="select select-inline" id="ar-flag" data-change="rule:filter">' + flagOptions + '</select>' +
      '<label class="sr-only" for="ar-enable">按启用状态筛选</label>' +
      '<select class="select select-inline" id="ar-enable" data-change="rule:filter">' + enableOptions + '</select>' +
      ((state.keyword || state.typeId || state.flag || state.enable)
        ? '<button type="button" class="btn btn-sm btn-text" data-action="rule:reset">重置</button>' : '') +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn-sm btn-primary" data-action="rule:new">' + icon('plus') + '添加</button>' +
      '<button type="button" class="btn btn-sm" data-action="rule:edit"' +
        (picked === 1 ? '' : ' aria-disabled="true"') + '>' + icon('pencil') + '修改</button>' +
      '<button type="button" class="btn btn-sm" data-action="rule:delete"' +
        (picked ? '' : ' aria-disabled="true"') + '>' + icon('trash') + '删除' +
        (picked > 1 ? '（' + picked + '）' : '') + '</button>' +
    '</div>';
  }

  function clip(text, n) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  }

  function renderTable(rows) {
    var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    var pageRows = rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var allOn = pageRows.length > 0 && pageRows.every(function (r) { return state.selected[r.id]; });

    return '<section class="card">' +
      '<div class="table-wrap"><table class="data-table ar-table">' +
        '<thead><tr>' +
          '<th class="col-check"><input type="checkbox" data-change="rule:all"' +
            (allOn ? ' checked' : '') + ' aria-label="全选本页"></th>' +
          '<th class="col-idx">序号</th>' +
          '<th class="col-title">敏感内容标题</th>' +
          '<th class="col-content">敏感内容</th>' +
          '<th class="col-type">敏感类型</th>' +
          '<th class="col-flag">控制标志</th>' +
          '<th class="col-date">创建时间</th>' +
          '<th class="col-enable">是否启用</th>' +
          '<th class="col-actions">操作</th>' +
        '</tr></thead><tbody>' +
        pageRows.map(function (r, i) {
          var on = !!state.selected[r.id];
          return '<tr' + (on ? ' class="selected"' : '') + '>' +
            '<td class="col-check"><input type="checkbox" data-change="rule:select" data-id="' + esc(r.id) + '"' +
              (on ? ' checked' : '') + ' aria-label="选择 ' + esc(r.title) + '"></td>' +
            '<td class="col-idx tnum">' + ((state.page - 1) * PAGE_SIZE + i + 1) + '</td>' +
            '<td class="col-title"><span class="title-cell" title="' + esc(r.title) + '">' +
              esc(r.title) + '</span></td>' +
            '<td class="col-content"><span class="clip" title="' +
              esc(clip(r.content, 120)) + '">' + esc(clip(r.content, 120)) + '</span></td>' +
            '<td class="col-type">' + esc(r.typeName || '') + '</td>' +
            '<td class="col-flag">' + U.tag(r.controlFlagTitle || S.controlFlagTitle(r.controlFlag),
              r.controlFlag === 'OPEN' ? 'tag-ok' : 'tag-warn') + '</td>' +
            '<td class="col-date">' + esc(r.createDate || '') + '</td>' +
            '<td class="col-enable">' + U.tag(r.enable === false ? '否' : '是', r.enable === false ? '' : 'tag-ok') + '</td>' +
            '<td class="col-actions"><div class="row-actions">' +
              '<button type="button" class="btn btn-sm btn-text" data-action="rule:view" data-id="' + esc(r.id) + '" ' +
                'title="查看完整的敏感内容">' + icon('eye') + '查看</button>' +
              '<button type="button" class="btn btn-sm btn-text" data-action="rule:edit" data-id="' + esc(r.id) + '">' +
                icon('pencil') + '修改</button>' +
            '</div></td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>' +
      (totalPages > 1 ? renderPager(rows.length, totalPages) : '') +
    '</section>';
  }

  function renderPager(total, totalPages) {
    return '<div class="pager">' +
      '<span class="pager-info">共 ' + total + ' 条，第 ' + state.page + ' / ' + totalPages + ' 页</span>' +
      '<button type="button" class="btn btn-sm" data-action="rule:page" data-page="' + (state.page - 1) + '"' +
        (state.page <= 1 ? ' aria-disabled="true"' : '') + '>上一页</button>' +
      '<button type="button" class="btn btn-sm" data-action="rule:page" data-page="' + (state.page + 1) + '"' +
        (state.page >= totalPages ? ' aria-disabled="true"' : '') + '>下一页</button>' +
    '</div>';
  }

  function render() {
    var rows = visibleRules();
    return '' + renderToolbar() +
      (rows.length ? renderTable(rows) :
        '<section class="card"><div class="card-body">' +
          U.empty('没有符合条件的审核规则', 'shield-check',
            '<button class="btn btn-primary" data-action="rule:new">' + icon('plus') + '添加审核规则</button>') +
        '</div></section>') +
      '<div class="data-note">' + icon('info') +
        '<span>审核规则的数据与字段对齐参照系统《' + esc((App.mock.AUDIT_SOURCE || {}).system || '') +
        '》的敏感内容管理（' + esc((App.mock.AUDIT_SOURCE || {}).path || '') + '，' +
        esc((App.mock.AUDIT_SOURCE || {}).fetchedAt || '') + ' 抓取，共 ' +
        ((App.mock.AUDIT_SOURCE || {}).count || 0) + ' 条）。' +
        '这些规则是第 4 阶段「审核校定」里<b>政治性审核</b>的判定依据 —— ' +
        '<b>合规性审核不依赖规则</b>（由模型判定知识产权风险与个人隐私及个人信息）。</span></div>';
  }

  /* ---------------------------------------------------- 查看 / 新增 / 修改 */

  function clauseList(content) {
    var lines = String(content || '').split(/\n+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x; });
    return '<ol class="ar-clauses">' + lines.map(function (l) {
      return '<li>' + esc(l.replace(/^（[一二三四五六七八九十]+）\s*/, '')) + '</li>';
    }).join('') + '</ol>';
  }

  function openView(id) {
    var r = S.getAuditRule(id);
    if (!r) return;
    U.modal({
      title: '查看审核规则 · ' + r.title,
      width: 860,
      okText: '关闭',
      cancelText: null,
      body: '<dl class="desc">' +
          '<dt>敏感内容标题</dt><dd>' + esc(r.title) + '</dd>' +
          '<dt>敏感类型</dt><dd>' + esc(r.typeName || '') + '</dd>' +
          '<dt>控制标志</dt><dd>' + esc(r.controlFlagTitle || S.controlFlagTitle(r.controlFlag)) + '</dd>' +
          '<dt>是否启用</dt><dd>' + (r.enable === false ? '否' : '是') + '</dd>' +
          '<dt>创建时间</dt><dd>' + esc(r.createDate || '') + '</dd>' +
        '</dl>' +
        '<div class="field-label">敏感内容（' + String(r.content || '').length + ' 字）</div>' +
        clauseList(r.content)
    });
  }

  function openForm(id) {
    var rule = id ? S.getAuditRule(id) : null;
    var isEdit = !!rule;
    var typeOptions = S.auditRuleTypes().map(function (t) {
      return '<option value="' + t.id + '"' +
        (isEdit && String(rule.typeId) === String(t.id) ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('');
    var flag = isEdit ? rule.controlFlag : 'CONTROL';
    var flagOptions = S.auditControlFlags().map(function (f) {
      return '<option value="' + esc(f.value) + '"' + (flag === f.value ? ' selected' : '') + '>' +
        esc(f.title) + '</option>';
    }).join('');
    var enable = isEdit ? rule.enable !== false : true;

    U.modal({
      title: isEdit ? '修改审核规则' : '添加审核规则',
      width: 860,
      okText: '保存',
      body: '<div class="rec-form">' +
          '<div class="rec-row">' +
            '<label class="rec-label" for="ar-f-title"><span class="req">*</span>敏感内容标题：</label>' +
            '<div class="rec-field">' +
              '<input class="input" id="ar-f-title" maxlength="60" placeholder="请输入敏感内容标题" ' +
                'value="' + esc(isEdit ? rule.title : '') + '">' +
              '<div class="field-error" id="ar-f-title-error" role="alert" hidden></div>' +
            '</div>' +
          '</div>' +
          '<div class="rec-row">' +
            '<label class="rec-label" for="ar-f-content"><span class="req">*</span>敏感内容：</label>' +
            '<div class="rec-field">' +
              '<textarea class="textarea" id="ar-f-content" rows="8" maxlength="4000" ' +
                'placeholder="按（一）（二）分条填写敏感内容，一行一条">' +
                esc(isEdit ? rule.content : '') + '</textarea>' +
              '<div class="field-extra">一行一条（如「（一）涉及…的档案；」）。' +
                '判定时会从这些句子里抽敏感词条去比对编研成果正文。</div>' +
            '</div>' +
          '</div>' +
          '<div class="rec-row">' +
            '<label class="rec-label" for="ar-f-type"><span class="req">*</span>敏感类型：</label>' +
            '<div class="rec-field">' +
              '<select class="select" id="ar-f-type">' +
                (isEdit ? '' : '<option value="">请选择敏感类型</option>') + typeOptions +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="rec-row">' +
            '<label class="rec-label" for="ar-f-flag"><span class="req">*</span>控制标志：</label>' +
            '<div class="rec-field">' +
              '<select class="select" id="ar-f-flag">' + flagOptions + '</select>' +
              '<div class="field-extra">受控＝命中即需人工确认；开放＝可用于"可开放"判定</div>' +
            '</div>' +
          '</div>' +
          '<div class="rec-row">' +
            '<label class="rec-label" for="ar-f-enable">是否启用：</label>' +
            '<div class="rec-field">' +
              '<label class="switch"><input type="checkbox" id="ar-f-enable"' +
                (enable ? ' checked' : '') + '><span class="switch-track"></span>' +
                '<span class="switch-text">启用后参与审核判定</span></label>' +
            '</div>' +
          '</div>' +
        '</div>',
      onOk: function (modalEl) {
        var title = modalEl.querySelector('#ar-f-title').value.trim();
        var content = modalEl.querySelector('#ar-f-content').value.trim();
        var typeId = modalEl.querySelector('#ar-f-type').value;
        var flagVal = modalEl.querySelector('#ar-f-flag').value;
        var on = modalEl.querySelector('#ar-f-enable').checked;
        var errBox = modalEl.querySelector('#ar-f-title-error');
        errBox.hidden = true;
        if (!title) {
          errBox.textContent = '请填写敏感内容标题';
          errBox.hidden = false;
          modalEl.querySelector('#ar-f-title').focus();
          return false;
        }
        if (!content) { U.toast('请填写敏感内容', 'warn'); return false; }
        if (!typeId) { U.toast('请选择敏感类型', 'warn'); return false; }
        var data = { title: title, content: content, typeId: typeId, controlFlag: flagVal, enable: on };
        var r = isEdit ? S.updateAuditRule(rule.id, data) : S.addAuditRule(data);
        U.toast(r.message, r.ok ? 'ok' : 'warn');
        return r.ok;
      }
    });
  }

  function doDelete() {
    var ids = selectedIds();
    if (!ids.length) { U.toast('请先勾选要删除的审核规则', 'warn'); return; }
    var names = ids.map(function (id) { return (S.getAuditRule(id) || {}).title; }).join('、');
    U.confirm({
      title: '删除选中的 ' + ids.length + ' 条审核规则？',
      content: '将删除：' + esc(names) + '。<br>删除后<b>政治性审核</b>不再依据它们判定' +
        '（合规性审核本来就不依赖规则）。',
      okText: '删除'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.deleteAuditRules(ids);
      state.selected = {};
      U.toast(r.message, 'ok');
    });
  }

  /* ---------------------------------------------------------- 交互 */

  function repaint() { App.app.render(); }

  function register() {
    U.register('rule:keyword', function (ds, el) { state.keyword = el.value; });
    U.register('rule:search', function () { state.page = 1; repaint(); });
    U.register('rule:filter', function (ds, el) {
      if (el.id === 'ar-type') state.typeId = el.value;
      else if (el.id === 'ar-flag') state.flag = el.value;
      else if (el.id === 'ar-enable') state.enable = el.value;
      state.page = 1;
      repaint();
    });
    U.register('rule:reset', function () {
      state.keyword = ''; state.typeId = ''; state.flag = ''; state.enable = '';
      state.page = 1;
      repaint();
    });
    U.register('rule:page', function (ds) {
      var p = parseInt(ds.page, 10);
      if (p >= 1) { state.page = p; repaint(); }
    });
    U.register('rule:all', function (ds, el) {
      var rows = visibleRules().slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
      rows.forEach(function (r) { state.selected[r.id] = el.checked; });
      repaint();
    });
    U.register('rule:select', function (ds, el) {
      if (el.checked) state.selected[ds.id] = true;
      else delete state.selected[ds.id];
      repaint();
    });
    U.register('rule:view', function (ds) { openView(ds.id); });
    U.register('rule:new', function () { openForm(null); });
    U.register('rule:edit', function (ds) {
      var id = ds.id || selectedIds()[0];
      if (!id) { U.toast('请先勾选一条审核规则', 'warn'); return; }
      openForm(id);
    });
    U.register('rule:delete', function () { doDelete(); });
  }

  App.pages = App.pages || {};
  App.pages['system/audit-rules'] = {
    render: render,
    register: register,
    pageClass: 'page-compact'
  };
})(window);
