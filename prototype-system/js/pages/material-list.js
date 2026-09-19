/* ==========================================================================
   页面：编研素材库 · 素材管理

   对应设计文档「编研素材库 / 素材管理」：
     以列表的形式显示素材数据，列表字段包括「勾选框、序号、标题、档号、加入时间、创建人」。
     功能按钮：1. 删除；2. 筛选（按照素材标签筛选素材）；3. 更改标签。

   原型的两个处理：
     1. 列表多一列「标签」—— 否则用户看不出筛选依据，也无法确认「更改标签」的结果；
     2. 批量更改标签时提供「追加 / 替换」两种方式，默认**追加**：
        批量替换会静默清掉各素材原有的其它标签，属于破坏性操作，不该是默认行为。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = {
    keyword: '',
    tagId: '',
    selected: {},
    /* 批量更改标签的方式：append（默认，安全） | replace */
    tagMode: 'append'
  };

  /* ------------------------------------------------------------ 工具 */

  function tagName(id) {
    var t = S.tags().filter(function (x) { return x.id === id; })[0];
    return t ? t.name : id;
  }

  function visibleMaterials() {
    var kw = state.keyword.trim().toLowerCase();
    return S.materials().filter(function (m) {
      if (state.tagId && (m.tagIds || []).indexOf(state.tagId) < 0) return false;
      if (kw && (m.title + ' ' + m.archiveNo).toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
  }

  function selectedIds() {
    return Object.keys(state.selected).filter(function (id) {
      return state.selected[id] && S.getMaterial(id);
    });
  }

  function purgeSelection() {
    Object.keys(state.selected).forEach(function (id) {
      if (!S.getMaterial(id)) delete state.selected[id];
    });
  }

  /** 标签单元格：最多显示 2 个，其余折叠为 +N（完整列表在 title 里） */
  function tagChips(m) {
    var ids = m.tagIds || [];
    if (!ids.length) return '<span class="muted">未分类</span>';
    var shown = ids.slice(0, 2).map(function (id) {
      return U.tag(tagName(id), 'tag-accent');
    }).join('');
    var rest = ids.length > 2 ? '<span class="tag-rest">+' + (ids.length - 2) + '</span>' : '';
    var all = ids.map(tagName).join('、');
    return '<span class="tag-chips" title="' + esc(all) + '">' + shown + rest + '</span>';
  }

  /* ------------------------------------------------------------ 列表 */

  function renderToolbar() {
    var total = S.materials().length;
    var shown = visibleMaterials().length;

    var tagOptions = ['<option value="">全部标签</option>'].concat(
      S.tags().map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (state.tagId === t.id ? ' selected' : '') + '>' +
          esc(t.name) + '（' + t.materialCount + '）</option>';
      })
    ).join('');

    return '<div class="toolbar">' +
      '<span class="toolbar-note">共 ' + total + ' 件素材' +
        (shown === total ? '' : '，当前筛选出 ' + shown + ' 件') + '</span>' +
      '<span class="spacer"></span>' +
      '<label class="sr-only" for="mat-tag">按素材标签筛选</label>' +
      '<select class="select select-inline" id="mat-tag" data-change="mat:filter">' + tagOptions + '</select>' +
      '<label class="sr-only" for="mat-kw">按标题或档号搜索</label>' +
      '<input class="input input-inline" id="mat-kw" type="search" placeholder="搜索标题或档号" ' +
        'value="' + esc(state.keyword) + '" data-enter="mat:search">' +
      '<button type="button" class="btn" data-action="mat:search">' + icon('search') + '搜索</button>' +
      ((state.keyword || state.tagId) ?
        '<button type="button" class="btn btn-text" data-action="mat:clear-filter">重置</button>' : '') +
    '</div>';
  }

  /** 批量条内容（不含外层容器），勾选时就地更新 */
  function batchBarHtml() {
    var n = selectedIds().length;
    if (!n) return '';
    return '<div class="batch-bar">' +
      '已选 <b>' + n + '</b> 件素材' +
      '<button type="button" class="btn btn-sm btn-primary" data-action="mat:retag">' +
        icon('tag') + '更改标签</button>' +
      '<button type="button" class="btn btn-sm" data-action="mat:batch-delete">' +
        icon('trash') + '删除</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn-sm btn-text" data-action="mat:clear-select">取消选择</button>' +
    '</div>';
  }

  function renderBatchBar() {
    return '<div id="mat-batch">' + batchBarHtml() + '</div>';
  }

  function actionBtn(action, id, label, iconName, title) {
    return '<button type="button" class="btn btn-sm btn-text" data-action="' + action + '" ' +
      'data-id="' + esc(id) + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' +
      (iconName ? icon(iconName) : '') + esc(label) + '</button>';
  }

  function renderTable(rows) {
    var allChecked = rows.length > 0 && rows.every(function (m) { return state.selected[m.id]; });

    var body = rows.map(function (m, i) {
      return '<tr' + (state.selected[m.id] ? ' class="selected"' : '') + '>' +
        '<td class="col-check"><input type="checkbox" data-change="mat:select" ' +
          'data-id="' + esc(m.id) + '"' + (state.selected[m.id] ? ' checked' : '') +
          ' aria-label="选择 ' + esc(m.title) + '"></td>' +
        '<td class="col-idx tnum">' + (i + 1) + '</td>' +
        '<td>' + esc(m.title) + '</td>' +
        '<td class="col-no tnum">' + esc(m.archiveNo) + '</td>' +
        '<td class="col-tags">' + tagChips(m) + '</td>' +
        '<td class="col-time tnum">' + esc(App.util.fmtDateTime(m.addedAt)) + '</td>' +
        '<td class="col-user">' + esc(m.addedBy) + '</td>' +
        '<td class="col-actions"><div class="row-actions">' +
          actionBtn('mat:retag', m.id, '更改标签', 'tag') +
          actionBtn('mat:delete', m.id, '删除', null, '从素材库删除该素材') +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table">' +
      '<thead><tr>' +
        '<th class="col-check"><input type="checkbox" id="mat-check-all" ' +
          'data-change="mat:select-all"' + (allChecked ? ' checked' : '') +
          ' aria-label="全选当前列表"></th>' +
        '<th class="col-idx">序号</th>' +
        '<th>标题</th>' +
        '<th class="col-no">档号</th>' +
        '<th class="col-tags">标签</th>' +
        '<th class="col-time">加入时间</th>' +
        '<th class="col-user">创建人</th>' +
        '<th class="col-actions">操作</th>' +
      '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table></div>';
  }

  function render() {
    var rows = visibleMaterials();
    purgeSelection();

    var emptyAction = (state.keyword || state.tagId)
      ? '<button class="btn" data-action="mat:clear-filter">' + icon('rotate-ccw') + '清除筛选</button>'
      : '<button class="btn btn-primary" data-action="mat:goto-search">' +
        icon('search') + '去查找素材</button>';

    return '' +
      renderToolbar() +
      renderBatchBar() +
      '<section class="card">' +
        (rows.length ? renderTable(rows) :
          '<div class="card-body">' + U.empty(
            (state.keyword || state.tagId) ? '没有符合条件的素材' : '素材库还是空的',
            'layers', emptyAction) + '</div>') +
      '</section>';
  }

  /* -------------------------------------------------------- 更改标签 */

  /**
   * @param {string[]|null} explicitIds 行内「更改标签」传入该行 id；
   *        不传则取批量勾选（openRetag() 原先把两者混为一谈，
   *        导致行内按钮点了没反应）
   */
  function openRetag(explicitIds) {
    var fromBatch = !(explicitIds && explicitIds.length);
    var ids = fromBatch ? selectedIds() : explicitIds.slice();
    if (!ids.length) return;

    var single = ids.length === 1;
    var one = single ? S.getMaterial(ids[0]) : null;
    var current = one ? (one.tagIds || []) : [];
    var tags = S.tags();

    if (!tags.length) {
      U.modal({
        title: '还没有素材标签', width: 520, cancelText: null, okText: '知道了',
        body: '<p>更改标签前需要先有标签，请先到「编研素材库 / 标签管理」新增标签。</p>'
      });
      return;
    }

    var checkboxes = tags.map(function (t) {
      var on = single && current.indexOf(t.id) >= 0;
      return '<label class="pick-item">' +
        '<input type="checkbox" name="retag" value="' + esc(t.id) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="pick-main">' +
          '<span class="pick-name">' + esc(t.name) + '</span>' +
          (t.note ? '<span class="pick-note">' + esc(t.note) + '</span>' : '') +
        '</span>' +
        '<span class="pick-count">已用 ' + t.materialCount + ' 件</span>' +
      '</label>';
    }).join('');

    var modeHtml = single ? '' :
      '<div class="field" style="margin-bottom:var(--s3)">' +
        '<div class="field-label">更改方式</div>' +
        '<div class="check-group">' +
          '<label class="check"><input type="radio" name="retag-mode" value="append"' +
            (state.tagMode === 'append' ? ' checked' : '') + '> 追加（保留各素材原有标签）</label>' +
          '<label class="check"><input type="radio" name="retag-mode" value="replace"' +
            (state.tagMode === 'replace' ? ' checked' : '') + '> 替换（用所选标签覆盖原有标签）</label>' +
        '</div>' +
        '<div class="field-extra">批量操作默认「追加」，避免误删各素材已有的其它标签。</div>' +
      '</div>';

    U.modal({
      title: single ? '更改标签 · ' + esc(one.title) : '批量更改标签 · ' + ids.length + ' 件素材',
      width: 640,
      body: modeHtml +
        '<div class="field-label">选择标签（可多选，至少选一个）</div>' +
        '<div class="pick-list">' + checkboxes + '</div>',
      okText: '保存',
      cancelText: '取消',
      onOk: function (el) {
        var tagIds = Array.prototype.slice
          .call(el.querySelectorAll('input[name="retag"]:checked'))
          .map(function (c) { return c.value; });
        if (!tagIds.length) {
          U.toast('请至少选择一个标签', 'warn');
          return false;
        }
        var modeEl = el.querySelector('input[name="retag-mode"]:checked');
        var mode = single ? 'replace' : (modeEl ? modeEl.value : 'append');
        if (!single) state.tagMode = mode;

        var res = S.updateMaterialTags(ids, tagIds, mode);
        if (fromBatch) state.selected = {};   // 行内改标签不应清掉批量勾选
        App.app.render();
        U.toast('已' + (single ? '更改' : '批量' + (mode === 'append' ? '追加' : '替换')) +
          ' ' + res.changed + ' 件素材的标签', 'ok');
        return true;
      }
    });
  }

  /* ----------------------------------------------------------- 删除 */

  function doDelete(ids) {
    if (!ids.length) return;
    var names = ids.map(function (id) {
      var m = S.getMaterial(id);
      return m ? m.title : id;
    });

    var affected = {};
    ids.forEach(function (id) {
      var m = S.getMaterial(id);
      if (m) (m.tagIds || []).forEach(function (t) { affected[t] = true; });
    });
    // 只提示"删除后就没有素材了"的标签，避免误导
    var willEmpty = Object.keys(affected).filter(function (t) {
      return S.tagUsage(t) - ids.filter(function (id) {
        var m = S.getMaterial(id);
        return m && (m.tagIds || []).indexOf(t) >= 0;
      }).length === 0;
    }).map(tagName);

    U.confirm({
      title: ids.length === 1 ? '删除素材「' + esc(names[0]) + '」？' : '删除选中的 ' + ids.length + ' 件素材？',
      content: '删除后不可恢复。相关标签的「关联素材」数会同步减少' +
        (willEmpty.length ? '；其中 <b>' + esc(willEmpty.join('、')) + '</b> 将变为无关联素材（之后即可删除该标签）。' : '。'),
      okText: '确认删除'
    }).then(function (ok) {
      if (!ok) return;
      var res = S.deleteMaterials(ids);
      ids.forEach(function (id) { delete state.selected[id]; });
      if (res.deleted.length) {
        U.toast(res.deleted.length === 1
          ? '已删除素材「' + res.deleted[0] + '」'
          : '已删除 ' + res.deleted.length + ' 件素材', 'ok');
      }
    });
  }

  /* ------------------------------------------------------------ 交互 */

  function syncSelection() {
    var root = document.getElementById('main');
    if (!root) return;
    var rows = visibleMaterials();

    rows.forEach(function (m) {
      var cb = root.querySelector('input[data-change="mat:select"][data-id="' + m.id + '"]');
      if (!cb) return;
      var on = !!state.selected[m.id];
      cb.checked = on;
      var tr = cb.closest ? cb.closest('tr') : null;
      if (tr) tr.classList.toggle('selected', on);
    });

    var sel = rows.filter(function (m) { return state.selected[m.id]; }).length;
    var all = root.querySelector('#mat-check-all');
    if (all) {
      all.checked = rows.length > 0 && sel === rows.length;
      all.indeterminate = sel > 0 && sel < rows.length;
    }
    var bar = root.querySelector('#mat-batch');
    if (bar) bar.innerHTML = batchBarHtml();
  }

  function register() {
    U.register('mat:select', function (ds, el) {
      if (el.checked) state.selected[ds.id] = true;
      else delete state.selected[ds.id];
      syncSelection();
    });
    U.register('mat:select-all', function (ds, el) {
      var rows = visibleMaterials();
      if (el.checked) rows.forEach(function (m) { state.selected[m.id] = true; });
      else rows.forEach(function (m) { delete state.selected[m.id]; });
      syncSelection();
    });
    U.register('mat:clear-select', function () {
      state.selected = {};
      syncSelection();
    });

    U.register('mat:filter', function (ds, el) {
      state.tagId = el.value;
      state.selected = {};
      App.app.render();
    });
    U.register('mat:search', function () {
      var el = document.getElementById('mat-kw');
      state.keyword = el ? el.value : '';
      state.selected = {};
      App.app.render();
    });
    U.register('mat:clear-filter', function () {
      state.keyword = '';
      state.tagId = '';
      state.selected = {};
      App.app.render();
    });

    U.register('mat:retag', function (ds) {
      // 行内按钮带 data-id，按该行改；批量条上的按钮不带，按勾选项改
      openRetag(ds && ds.id ? [ds.id] : null);
    });
    U.register('mat:delete', function (ds) { doDelete([ds.id]); });
    U.register('mat:batch-delete', function () { doDelete(selectedIds()); });

    U.register('mat:goto-search', function () { App.router.navigate('#/material/search'); });
  }

  function mount(root) {
    var all = root.querySelector('#mat-check-all');
    if (!all) return;
    var rows = visibleMaterials();
    var sel = rows.filter(function (m) { return state.selected[m.id]; }).length;
    all.indeterminate = sel > 0 && sel < rows.length;
  }

  App.pages = App.pages || {};
  App.pages['material/list'] = {
    render: render,
    register: register,
    mount: mount,
    pageClass: 'page-compact'
  };
})(window);
