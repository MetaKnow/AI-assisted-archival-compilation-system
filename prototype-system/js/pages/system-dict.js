/* ==========================================================================
   页面：系统管理 · 数据字典

   界面按客户参考图实现：
     · 列表（图片1）：工具栏「新增 / 修改 / 删除 / 更多操作（批量导出、批量导入）」，
       右侧为搜索 / 刷新 / 帮助三个图标按钮；表格列为 勾选框、序号、名称、字典值名、元数据。
       「字典值名」一列把该字典的所有字典值名用「、」连起来显示。
     · 新增弹窗（图片2）：名称（必填）、「+ 添加字典值」整行虚线按钮、
       若干字典值行（值 / 值名 / 描述 / 删除）、元数据下拉，底部「关闭 / 保存」。

   按要求：**只生成新增界面**；修改 / 删除 / 批量导出 / 批量导入只给按钮。
   数据字典同时是「归档设置 · 字典类型」下拉的数据来源，两处口径一致。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = { selected: {}, keyword: '', searchOpen: false };

  var BUTTON_ONLY = {
    edit: '修改字典的界面本次不生成',
    remove: '删除字典的界面本次不生成',
    export: '批量导出的界面本次不生成',
    import: '批量导入的界面本次不生成'
  };

  function selectedIds() {
    return Object.keys(state.selected).filter(function (id) {
      return state.selected[id] && S.getDataDict(id);
    });
  }

  /* ------------------------------------------------------------ 列表 */

  function valueNames(d) {
    var names = (d.items || []).map(function (it) { return it.name || it.value; })
      .filter(function (x) { return !!x; });
    return names.length ? names.join('、') : '/';
  }

  function visibleDicts() {
    var kw = state.keyword.trim().toLowerCase();
    var list = S.dataDicts();
    if (!kw) return list;
    return list.filter(function (d) {
      return (d.name + ' ' + d.meta + ' ' + valueNames(d)).toLowerCase().indexOf(kw) >= 0;
    });
  }

  function renderToolbar() {
    var n = selectedIds().length;
    return '<div class="toolbar">' +
      '<button type="button" class="btn btn-primary" data-action="dd:new">' + icon('plus') + '新增</button>' +
      '<button type="button" class="btn" data-action="dd:edit"' +
        (n === 1 ? '' : ' aria-disabled="true"') +
        ' title="' + (n === 1 ? '修改选中的字典' : '请先勾选一个字典') + '">' +
        icon('pencil') + '修改</button>' +
      '<button type="button" class="btn" data-action="dd:delete"' +
        (n ? '' : ' aria-disabled="true"') +
        ' title="' + (n ? '删除选中的字典' : '请先勾选字典') + '">' +
        icon('minus') + '删除</button>' +
      '<span class="saf-more-wrap">' +
        '<button type="button" class="btn" data-action="ui:menu" data-menu-trigger="dd-more" ' +
          'aria-haspopup="true" aria-expanded="false">' + icon('more-vertical') + '更多操作</button>' +
        '<div class="menu hidden" id="dd-more" role="menu">' +
          '<button type="button" class="menu-item" data-action="dd:export">' +
            icon('download') + '<span>批量导出</span></button>' +
          '<button type="button" class="menu-item" data-action="dd:import">' +
            icon('upload') + '<span>批量导入</span></button>' +
        '</div>' +
      '</span>' +
      '<span class="spacer"></span>' +
      (state.searchOpen
        ? '<label class="sr-only" for="dd-kw">搜索字典</label>' +
          '<input class="input input-inline dd-search" id="dd-kw" type="search" ' +
            'placeholder="搜索字典名称 / 字典值 / 元数据" value="' + esc(state.keyword) + '" ' +
            'data-enter="dd:search">' +
          '<button type="button" class="btn" data-action="dd:search">' + icon('search') + '搜索</button>'
        : '') +
      (state.keyword
        ? '<button type="button" class="btn btn-text" data-action="dd:clear-search">重置</button>'
        : '') +
      '<button type="button" class="icon-btn dd-icon-btn' + (state.searchOpen ? ' is-on' : '') + '" ' +
        'data-action="dd:search-toggle" aria-label="搜索" title="搜索">' + icon('search') + '</button>' +
      '<button type="button" class="icon-btn dd-icon-btn" data-action="dd:refresh" ' +
        'aria-label="刷新" title="刷新">' + icon('refresh') + '</button>' +
      '<button type="button" class="icon-btn dd-icon-btn" data-action="dd:help" ' +
        'aria-label="帮助" title="数据字典说明">' + icon('info') + '</button>' +
    '</div>';
  }

  function renderTable(rows) {
    var all = S.dataDicts();
    var allChecked = rows.length > 0 && rows.every(function (d) { return state.selected[d.id]; });

    var body = rows.map(function (d, i) {
      return '<tr' + (state.selected[d.id] ? ' class="selected"' : '') + '>' +
        '<td class="col-check"><input type="checkbox" data-change="dd:select" data-id="' + esc(d.id) + '"' +
          (state.selected[d.id] ? ' checked' : '') + ' aria-label="选择 ' + esc(d.name) + '"></td>' +
        '<td class="col-idx tnum">' + (all.indexOf(d) + 1) + '</td>' +
        '<td class="dd-name">' + esc(d.name) + '</td>' +
        '<td class="dd-values">' + esc(valueNames(d)) + '</td>' +
        '<td class="dd-meta">' + (d.meta && d.meta !== '无'
          ? esc(d.meta) : '<span class="muted">/</span>') + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table dd-table">' +
      '<thead><tr>' +
        '<th class="col-check"><input type="checkbox" id="dd-check-all" data-change="dd:select-all" ' +
          'aria-label="全选字典"></th>' +
        '<th class="col-idx">序号</th>' +
        '<th>名称</th>' +
        '<th>字典值名</th>' +
        '<th class="dd-col-meta">元数据</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function render() {
    Object.keys(state.selected).forEach(function (id) {
      if (!S.getDataDict(id)) delete state.selected[id];
    });
    var rows = visibleDicts();
    return renderToolbar() +
      '<section class="card">' +
        (rows.length ? renderTable(rows) :
          '<div class="card-body">' + U.empty(
            state.keyword ? '没有匹配的字典' : '还没有数据字典',
            'database',
            state.keyword
              ? '<button class="btn" data-action="dd:clear-search">' + icon('rotate-ccw') + '清除搜索</button>'
              : '<button class="btn btn-primary" data-action="dd:new">' + icon('plus') + '新增字典</button>'
          ) + '</div>') +
      '</section>';
  }

  /* ------------------------------------------------------------ 新增 */

  function dictRowHtml(it) {
    it = it || { value: '', name: '', note: '' };
    return '<div class="dd-row">' +
      '<input class="input" data-f="value" placeholder="字典值" value="' + esc(it.value) + '" ' +
        'aria-label="字典值">' +
      '<input class="input" data-f="name" placeholder="字典值名" value="' + esc(it.name) + '" ' +
        'aria-label="字典值名">' +
      '<input class="input" data-f="note" placeholder="请输入字典值描述" value="' + esc(it.note) + '" ' +
        'aria-label="字典值描述">' +
      '<button type="button" class="dd-del" data-action="dd:del-row" aria-label="删除该字典值" title="删除该字典值">' +
        icon('minus') + '</button>' +
    '</div>';
  }

  function openDictForm(presetItems) {
    var items = presetItems && presetItems.length ? presetItems : [{ value: '', name: '', note: '' }];
    var metas = S.dictMetaOptions();

    U.modal({
      title: '新增',
      width: 900,
      okText: '保存',
      cancelText: '关闭',
      body:
        '<div class="rec-form" id="dd-form">' +
          '<div class="rec-row">' +
            '<label class="rec-label" for="dd-name"><span class="req">*</span>名称：</label>' +
            '<div class="rec-field">' +
              '<input class="input" id="dd-name" maxlength="30" autocomplete="off" ' +
                'placeholder="请输入字典名称，如：保管期限">' +
              '<div class="field-error" id="dd-name-error" role="alert" hidden></div>' +
            '</div>' +
          '</div>' +
          '<div class="rec-row">' +
            '<div class="rec-label"><span class="req">*</span>添加字典值：</div>' +
            '<div class="rec-field">' +
              '<button type="button" class="dd-add" data-action="dd:add-row">' +
                '<span class="dd-add-plus">' + icon('plus') + '</span>' +
              '</button>' +
              '<div class="dd-rows" id="dd-rows">' +
                items.map(dictRowHtml).join('') +
              '</div>' +
              '<div class="field-error" id="dd-items-error" role="alert" hidden></div>' +
            '</div>' +
          '</div>' +
          '<div class="rec-row">' +
            '<label class="rec-label" for="dd-meta">元数据：</label>' +
            '<div class="rec-field"><select class="select" id="dd-meta">' +
              metas.map(function (m) {
                return '<option value="' + esc(m) + '">' + esc(m) + '</option>';
              }).join('') +
            '</select></div>' +
          '</div>' +
        '</div>',
      onOk: function (el) {
        var modal = el.closest ? el.closest('.modal') : el;
        var items = Array.prototype.slice.call(modal.querySelectorAll('#dd-rows .dd-row'))
          .map(function (row) {
            return {
              value: row.querySelector('[data-f="value"]').value,
              name: row.querySelector('[data-f="name"]').value,
              note: row.querySelector('[data-f="note"]').value
            };
          });
        var res = S.addDataDict({
          name: modal.querySelector('#dd-name').value,
          meta: modal.querySelector('#dd-meta').value,
          items: items
        });
        if (!res.ok) {
          showError(modal, res);
          return false;
        }
        U.toast(res.message, 'ok');
        return true;
      }
    });

    setTimeout(function () {
      var modal = document.querySelector('.modal');
      if (!modal) return;
      var name = modal.querySelector('#dd-name');
      if (name) {
        name.focus();
        name.addEventListener('input', function () { clearError(modal, 'dd-name-error'); });
      }
      firstInput(modal);
    }, 30);
  }

  /* ------- 内联校验（与归档设置、用户管理同一套交互） ------- */

  function clearError(modal, id) {
    var box = modal.querySelector('#' + id);
    if (!box) return;
    box.textContent = '';
    box.setAttribute('hidden', '');
    if (id === 'dd-name-error') {
      var name = modal.querySelector('#dd-name');
      if (name) name.classList.remove('input-error');
    }
    Array.prototype.forEach.call(modal.querySelectorAll('.dd-row'), function (r) {
      r.classList.remove('row-error');
    });
  }

  function showError(modal, res) {
    ['dd-name-error', 'dd-items-error'].forEach(function (id) { clearError(modal, id); });
    if (res.field === 'name') {
      var box = modal.querySelector('#dd-name-error');
      box.textContent = res.message;
      box.removeAttribute('hidden');
      var input = modal.querySelector('#dd-name');
      input.classList.add('input-error');
      input.focus();
      return;
    }
    if (res.field === 'items') {
      var ib = modal.querySelector('#dd-items-error');
      ib.textContent = res.message;
      ib.removeAttribute('hidden');
      return;
    }
    if (res.field === 'row') {
      var ib2 = modal.querySelector('#dd-items-error');
      ib2.textContent = res.message;
      ib2.removeAttribute('hidden');
      var row = modal.querySelectorAll('#dd-rows .dd-row')[res.row];
      if (row) {
        row.classList.add('row-error');
        row.querySelector('[data-f="value"]').focus();
      }
    }
  }

  function firstInput(modal) {
    var input = modal.querySelector('#dd-rows .dd-row [data-f="value"]');
    if (input) input.focus();
  }

  /* ------------------------------------------------------------ 交互 */

  function syncSelection() {
    var root = document.getElementById('main');
    if (!root) return;
    var rows = S.dataDicts();
    rows.forEach(function (d) {
      var cb = root.querySelector('input[data-change="dd:select"][data-id="' + d.id + '"]');
      if (!cb) return;
      var on = !!state.selected[d.id];
      cb.checked = on;
      var tr = cb.closest ? cb.closest('tr') : null;
      if (tr) tr.classList.toggle('selected', on);
    });
    var sel = selectedIds().length;
    var all = root.querySelector('#dd-check-all');
    if (all) {
      all.checked = rows.length > 0 && sel === rows.length;
      all.indeterminate = sel > 0 && sel < rows.length;
    }
    [['dd:edit', sel === 1], ['dd:delete', sel > 0]].forEach(function (pair) {
      var b = root.querySelector('[data-action="' + pair[0] + '"]');
      if (!b) return;
      if (pair[1]) b.removeAttribute('aria-disabled');
      else b.setAttribute('aria-disabled', 'true');
    });
  }

  /** 只给按钮的功能：点一下说明界面未生成 */
  function buttonOnly(key, needSelection) {
    var ids = selectedIds();
    if (needSelection && !ids.length) { U.toast('请先勾选字典', 'warn'); return; }
    var names = ids.map(function (id) {
      var d = S.getDataDict(id);
      return d ? d.name : '';
    }).filter(Boolean);
    U.toast(names.length
      ? ('已勾选 ' + names.join('、') + '：' + BUTTON_ONLY[key] + '，本次只提供按钮。')
      : (BUTTON_ONLY[key] + '，本次只提供按钮。'), 'warn');
  }

  function register() {
    U.register('dd:new', function () { openDictForm(); });

    U.register('dd:select', function (ds, el) {
      if (el.checked) state.selected[ds.id] = true;
      else delete state.selected[ds.id];
      syncSelection();
    });
    U.register('dd:select-all', function (ds, el) {
      if (el.checked) S.dataDicts().forEach(function (d) { state.selected[d.id] = true; });
      else state.selected = {};
      syncSelection();
    });

    U.register('dd:edit', function () { buttonOnly('edit', true); });
    U.register('dd:delete', function () { buttonOnly('remove', true); });
    U.register('dd:export', function () { U.closeMenus(); buttonOnly('export', false); });
    U.register('dd:import', function () { U.closeMenus(); buttonOnly('import', false); });

    /* 新增弹窗内的动态字典值行 */
    U.register('dd:add-row', function () {
      var modal = document.querySelector('.modal');
      if (!modal) return;
      var rows = modal.querySelector('#dd-rows');
      if (!rows) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = dictRowHtml(null);
      var row = tmp.firstChild;
      rows.appendChild(row);
      var input = row.querySelector('[data-f="value"]');
      if (input) input.focus();
      clearError(modal, 'dd-items-error');
    });
    U.register('dd:del-row', function (ds, el) {
      var modal = document.querySelector('.modal');
      var row = el.closest ? el.closest('.dd-row') : null;
      if (row && row.parentNode) row.parentNode.removeChild(row);
      if (modal) clearError(modal, 'dd-items-error');
    });

    /* 右侧三个图标按钮 */
    U.register('dd:search-toggle', function () {
      state.searchOpen = !state.searchOpen;
      if (!state.searchOpen) state.keyword = '';
      App.app.render();
      if (state.searchOpen) {
        var input = document.getElementById('dd-kw');
        if (input) input.focus();
      }
    });
    U.register('dd:search', function () {
      var el = document.getElementById('dd-kw');
      state.keyword = el ? el.value : '';
      App.app.render();
    });
    U.register('dd:clear-search', function () {
      state.keyword = '';
      App.app.render();
    });
    U.register('dd:refresh', function () {
      App.app.render();
      U.toast('已刷新字典数据（共 ' + S.dataDicts().length + ' 本）', 'ok');
    });
    U.register('dd:help', function () {
      U.toast('数据字典维护系统的可枚举值（如保管期限、密级）；' +
        '「归档设置」里的字典类型就取自这里。', 'ok');
    });
  }

  App.pages = App.pages || {};
  App.pages['system/dict'] = {
    render: render,
    register: register,
    pageClass: 'page-compact'
  };
})(window);
