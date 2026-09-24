/* ==========================================================================
   页面：编研素材库 · 标签管理

   对应设计文档「编研素材库 / 标签管理」：
     用来管理素材的分类，功能包括：新增、修改、删除。

   原型的两个处理：
     1. 列表多一列「关联素材」—— 它是删除规则的依据，不显示就说不清为什么不能删；
     2. 规则：**已关联素材的标签不允许删除**（文档未写明，属原型假设，已在 README 标注）。
        依据是标签为素材分类的唯一依据，直接删除会让素材变成"无标签"；
        正确做法是先调整相关素材的标签再删。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = { keyword: '' };

  function visibleTags() {
    var kw = state.keyword.trim().toLowerCase();
    /* 带派生用量：表格「用量」列与"已关联 N 件"的提示都读 materialCount */
    if (!kw) return S.tagsWithUsage();
    return S.tagsWithUsage().filter(function (t) {
      return t.name.toLowerCase().indexOf(kw) >= 0 ||
        (t.note || '').toLowerCase().indexOf(kw) >= 0;
    });
  }

  /* ------------------------------------------------------------ 列表 */

  function renderToolbar() {
    var total = S.tags().length;
    var shown = visibleTags().length;
    var unused = S.tags().filter(function (t) { return S.canDeleteTag(t); }).length;

    return '<div class="toolbar">' +
      '<button type="button" class="btn btn-primary" data-action="tag:new">' +
        icon('plus') + '新增标签</button>' +
      '<span class="toolbar-note">共 ' + total + ' 个标签' +
        (shown === total ? '' : '，当前筛选出 ' + shown + ' 个') +
        '　·　' + unused + ' 个尚未关联素材</span>' +
      '<span class="spacer"></span>' +
      '<label class="sr-only" for="tag-kw">按标签名称或说明搜索</label>' +
      '<input class="input input-inline" id="tag-kw" type="search" ' +
        'placeholder="搜索标签名称或说明" value="' + esc(state.keyword) + '" data-enter="tag:search">' +
      '<button type="button" class="btn" data-action="tag:search">' + icon('search') + '搜索</button>' +
      (state.keyword ?
        '<button type="button" class="btn btn-text" data-action="tag:clear-filter">重置</button>' : '') +
    '</div>';
  }

  function actionBtn(action, id, label, iconName, disabled, title) {
    return '<button type="button" class="btn btn-sm btn-text" data-action="' + action + '" ' +
      'data-id="' + esc(id) + '"' +
      (disabled ? ' aria-disabled="true"' : '') +
      (title ? ' title="' + esc(title) + '"' : '') + '>' +
      (iconName ? icon(iconName) : '') + esc(label) + '</button>';
  }

  function usageCell(t) {
    var n = S.tagUsage(t.id);
    if (!n) return '<span class="muted">未使用</span>';
    return '<span class="tnum"><b>' + n + '</b> 件</span>';
  }

  function renderTable(rows) {
    var body = rows.map(function (t, i) {
      var canDelete = S.canDeleteTag(t);
      var n = Number(t.materialCount) || 0;
      return '<tr>' +
        '<td class="col-idx tnum">' + (i + 1) + '</td>' +
        '<td>' +
          '<button type="button" class="link-btn" data-action="tag:view" data-id="' + esc(t.id) + '" ' +
            'title="查看标签详情">' + esc(t.name) + '</button>' +
        '</td>' +
        '<td class="col-note">' + (t.note ? esc(t.note) : '<span class="muted">—</span>') + '</td>' +
        '<td class="col-usage">' + usageCell(t) + '</td>' +
        '<td class="col-user">' + esc(t.createdBy) + '</td>' +
        '<td class="col-time tnum">' + esc(App.util.fmtDateTime(t.createdAt)) + '</td>' +
        '<td class="col-actions"><div class="row-actions">' +
          actionBtn('tag:edit', t.id, '修改', 'pencil', false) +
          actionBtn('tag:delete', t.id, '删除', null, !canDelete,
            canDelete ? '删除该标签'
              : '该标签已关联 ' + n + ' 件素材，不允许删除') +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table">' +
      '<thead><tr>' +
        '<th class="col-idx">序号</th>' +
        '<th>标签名称</th>' +
        '<th class="col-note">标签说明</th>' +
        '<th class="col-usage">关联素材</th>' +
        '<th class="col-user">创建人</th>' +
        '<th class="col-time">创建时间</th>' +
        '<th class="col-actions">操作</th>' +
      '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table></div>';
  }

  function render() {
    var rows = visibleTags();
    return '' +
      renderToolbar() +
      '<section class="card">' +
        (rows.length ? renderTable(rows) :
          '<div class="card-body">' + U.empty(
            state.keyword ? '没有匹配的标签' : '还没有标签，先新增一个',
            'tag',
            state.keyword
              ? '<button class="btn" data-action="tag:clear-filter">' + icon('rotate-ccw') + '清除搜索</button>'
              : '<button class="btn btn-primary" data-action="tag:new">' + icon('plus') + '新增标签</button>'
          ) + '</div>') +
      '</section>';
  }

  /* ------------------------------------------------------------ 表单 */

  function openForm(tag) {
    var isEdit = !!(tag && tag.id);
    var t = isEdit ? tag : { name: '', note: '' };

    U.modal({
      title: isEdit ? '修改标签' : '新增标签',
      width: 520,
      body:
        '<div class="field">' +
          '<label class="field-label" for="tg-name">标签名称<span class="req">*</span></label>' +
          '<input class="input" id="tg-name" type="text" maxlength="20" ' +
            'placeholder="例：教育・民国时期" value="' + esc(t.name) + '">' +
          '<div class="field-extra">用于素材分类与筛选，建议 12 字以内、避免与既有标签重名。</div>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label" for="tg-note">标签说明</label>' +
          '<textarea class="textarea" id="tg-note" rows="2" ' +
            'placeholder="说明该标签的适用范围，便于他人选标签时判断">' + esc(t.note) + '</textarea>' +
        '</div>' +
        (isEdit && Number(t.materialCount) ?
          '<div class="alert alert-info" role="note">' +
            '<span class="alert-icon">' + icon('info') + '</span><div>' +
            '该标签当前已关联 <b>' + Number(t.materialCount) + '</b> 件素材，修改名称后这些素材的标签会同步更新。' +
          '</div></div>' : ''),
      okText: isEdit ? '保存' : '新增',
      cancelText: '取消',
      onOk: function (el) { return saveForm(el, isEdit ? t.id : null); }
    });
  }

  /** @returns {boolean} false 表示校验未通过，弹窗不关闭 */
  function saveForm(modalEl, id) {
    var nameEl = modalEl.querySelector('#tg-name');
    var noteEl = modalEl.querySelector('#tg-note');
    var name = nameEl ? nameEl.value.trim() : '';

    if (!name) {
      U.toast('请填写标签名称', 'warn');
      if (nameEl) nameEl.focus();
      return false;
    }
    if (S.tagNameExists(name, id || null)) {
      U.toast('已存在同名标签：「' + name + '」', 'err');
      if (nameEl) nameEl.focus();
      return false;
    }

    var data = { name: name, note: noteEl ? noteEl.value.trim() : '' };
    if (id) {
      S.updateTag(id, data);
      U.toast('已保存标签「' + name + '」', 'ok');
    } else {
      S.addTag(data);
      U.toast('已新增标签「' + name + '」', 'ok');
    }
    return true;
  }

  /* ------------------------------------------------------- 查看 / 删除 */

  function openView(t) {
    var n = Number(t.materialCount) || 0;
    U.modal({
      title: '查看标签',
      width: 520,
      cancelText: null,
      okText: '关闭',
      body:
        '<dl class="desc">' +
          '<dt>标签名称</dt><dd>' + esc(t.name) + '</dd>' +
          '<dt>标签说明</dt><dd>' + (t.note ? esc(t.note) : '<span class="muted">未填写</span>') + '</dd>' +
          '<dt>关联素材</dt><dd>' + (n ? n + ' 件' :
            '<span class="muted">未使用</span>') + '</dd>' +
          '<dt>创建人</dt><dd>' + esc(t.createdBy) + '</dd>' +
          '<dt>创建时间</dt><dd>' + esc(App.util.fmtDateTime(t.createdAt)) + '</dd>' +
          (t.updatedAt ? '<dt>最近修改</dt><dd>' + esc(App.util.fmtDateTime(t.updatedAt)) + '</dd>' : '') +
        '</dl>' +
        '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
          '<span>' + (n
            ? '该标签已被 ' + n + ' 件素材使用，<b>不允许删除</b>；如需删除，请先在「素材管理」中更改这些素材的标签。'
            : '该标签尚未关联素材，可以删除。') + '</span>' +
        '</div>'
    });
  }

  function doDelete(id) {
    var t = S.getTag(id);
    if (!t) return;

    if (!S.canDeleteTag(t)) {
      U.modal({
        title: '该标签无法删除',
        width: 560,
        cancelText: null,
        okText: '知道了',
        body: '<p>标签「<b>' + esc(t.name) + '</b>」已关联 <b>' +
            (Number(t.materialCount) || 0) + '</b> 件素材。</p>' +
          '<p class="muted" style="font-size:var(--fs-sm)">标签是素材的分类依据，' +
          '直接删除会让这些素材变成"无标签"状态。请先在「素材管理」中更改相关素材的标签，再删除本标签。</p>' +
          '<div class="data-note">' + icon('info') +
          '<span>本条规则为原型假设（设计文档只写了"删除"）。若业务上允许删除后自动清除素材上的该标签，请告知，改为二次确认即可。</span></div>'
      });
      return;
    }

    U.confirm({
      title: '删除标签「' + esc(t.name) + '」？',
      content: '该标签尚未关联素材，删除后不可恢复。',
      okText: '确认删除'
    }).then(function (ok) {
      if (!ok) return;
      var res = S.deleteTags([id]);
      if (res.deleted.length) U.toast('已删除标签「' + res.deleted[0] + '」', 'ok');
    });
  }

  /* ------------------------------------------------------------ 交互 */

  function register() {
    U.register('tag:new', function () { openForm(null); });
    U.register('tag:edit', function (ds) {
      var t = S.getTag(ds.id);
      if (t) openForm(t);
    });
    U.register('tag:view', function (ds) {
      var t = S.getTag(ds.id);
      if (t) openView(t);
    });
    U.register('tag:delete', function (ds) { doDelete(ds.id); });

    U.register('tag:search', function () {
      var el = document.getElementById('tag-kw');
      state.keyword = el ? el.value : '';
      App.app.render();
    });
    U.register('tag:clear-filter', function () {
      state.keyword = '';
      App.app.render();
    });
  }

  App.pages = App.pages || {};
  /* 二级模块：页面键为 'material/tags' */
  App.pages['material/tags'] = {
    render: render,
    register: register,
    pageClass: 'page-compact'
  };
})(window);
