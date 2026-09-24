/* ==========================================================================
   页面：编研素材库 · 素材管理

   对应设计文档「编研素材库 / 素材管理」：
     以列表的形式显示素材数据，列表字段包括「勾选框、序号、标题、加入时间、创建人」。
     功能按钮：1. 删除；2. 筛选（按照素材标签筛选素材）；3. 更改标签。
     **评审调整**：列表去掉「档号」列、改为「备注」列；「新增素材」同样去掉档号、增加备注。
     档号在数据里仍然保留（从「查找素材」加入素材库的素材带档号，用来回查档案目录），
     只是不再作为素材管理的字段展示；手工新增的素材没有档号，判重按**标题**。

   评审追加的三项：
     · 每条数据加「查看」：只读查看该素材的目录与文件（实现在 material-view.js，与查找素材共用）
     · 工具栏加「新增素材」：手工录入标题 / 档号 / 素材标签，并可选择一个本机文件上传
     · 工具栏加「按任务筛选」：下拉列出全部编研任务。**过滤逻辑留到「确定选材」环节** ——
       素材现在没有"属于哪个任务"这个字段，要等选材库把素材挂到大纲节点上才有依据

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
    /* 按档案门类筛选（真实过滤：门类取自素材自身字段） */
    category: '',
    /* 按任务筛选：**只记录所选任务**，真正的过滤逻辑在「确定选材」环节落地
       （素材目前没有"属于哪个编研任务"这个字段，要等选材库把素材挂到大纲节点上） */
    taskId: '',
    selected: {},
    /* 批量更改标签的方式：append（默认，安全） | replace */
    tagMode: 'append',
    /* 「新增素材」表单里选中的本机文件（只记文件名与大小） */
    formFile: null
  };

  /* ------------------------------------------------------------ 工具 */

  function tagName(id) {
    var t = S.tags().filter(function (x) { return x.id === id; })[0];
    return t ? t.name : id;
  }

  function visibleMaterials() {
    var kw = state.keyword.trim().toLowerCase();
    return S.materials().filter(function (m) {
      if (state.category && (m.category || '') !== state.category) return false;
      if (state.tagId && (m.tagIds || []).indexOf(state.tagId) < 0) return false;
      if (kw && (m.title + ' ' + (m.note || '')).toLowerCase().indexOf(kw) < 0) return false;
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
      S.tagsWithUsage().map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (state.tagId === t.id ? ' selected' : '') + '>' +
          esc(t.name) + '（' + t.materialCount + '）</option>';
      })
    ).join('');

    /* 门类下拉：只列素材库里实际出现的门类（带件数），不列空门类 */
    var catCount = {};
    S.materials().forEach(function (m) {
      var c = m.category || '';
      if (c) catCount[c] = (catCount[c] || 0) + 1;
    });
    var catOptions = ['<option value="">全部门类</option>'].concat(
      (App.mock.ARCHIVE_CATEGORIES || []).filter(function (c) { return catCount[c]; })
        .map(function (c) {
          return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' +
            esc(c) + '（' + catCount[c] + '）</option>';
        })
    ).join('');

    /* 任务下拉：列出全部编研任务（已完成的排后面，便于在建任务优先选） */
    var tasks = S.tasks().slice().sort(function (a, b) {
      var ad = a.status === 'DONE' ? 1 : 0, bd = b.status === 'DONE' ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return a.id < b.id ? 1 : -1;
    });
    var taskOptions = ['<option value="">全部任务</option>'].concat(
      tasks.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (state.taskId === t.id ? ' selected' : '') + '>' +
          esc(t.id + ' · ' + t.topicName) + '</option>';
      })
    ).join('');

    return '<div class="toolbar">' +
      '<button type="button" class="btn btn-primary" data-action="mat:new">' +
        icon('plus') + '新增素材</button>' +
      '<span class="toolbar-note">共 ' + total + ' 件素材' +
        (shown === total ? '' : '，当前筛选出 ' + shown + ' 件') + '</span>' +
      '<span class="spacer"></span>' +
      '<label class="sr-only" for="mat-task">按编研任务筛选</label>' +
      '<select class="select select-inline select-task" id="mat-task" data-change="mat:task-filter" ' +
        'title="按编研任务筛选素材">' + taskOptions + '</select>' +
      '<label class="sr-only" for="mat-cat">按档案门类筛选</label>' +
      '<select class="select select-inline" id="mat-cat" data-change="mat:cat-filter" ' +
        'title="按档案门类筛选素材">' + catOptions + '</select>' +
      '<label class="sr-only" for="mat-tag">按素材标签筛选</label>' +
      '<select class="select select-inline" id="mat-tag" data-change="mat:filter">' + tagOptions + '</select>' +
      '<label class="sr-only" for="mat-kw">按标题或备注搜索</label>' +
      '<input class="input input-inline" id="mat-kw" type="search" placeholder="搜索标题或备注" ' +
        'value="' + esc(state.keyword) + '" data-enter="mat:search">' +
      '<button type="button" class="btn" data-action="mat:search">' + icon('search') + '搜索</button>' +
      ((state.keyword || state.tagId || state.taskId || state.category) ?
        '<button type="button" class="btn btn-text" data-action="mat:clear-filter">重置</button>' : '') +
    '</div>';
  }

  /**
   * 按任务筛选的说明条。
   * 素材目前**没有**"属于哪个编研任务"这个字段 —— 它是在「确定选材」环节
   * 把素材挂到大纲节点上时才产生的。所以这里只记录所选任务、不动列表，
   * 并在界面上说清楚，避免让人以为"选了任务却没过滤 = 坏了"。
   */
  function renderTaskNote() {
    if (!state.taskId) return '';
    var t = S.getTask(state.taskId);
    if (!t) return '';
    return '<div class="data-note">' + icon('info') +
      '<span>已选择任务 <b>' + esc(t.id) + ' · ' + esc(t.topicName) + '</b>' +
      '（' + esc(S.taskState(t).label) + '）——' +
      '「按任务筛选」的过滤逻辑将在<b>「确定选材」</b>环节实现：' +
      '素材要先挂到该任务的大纲节点上，才谈得上"属于哪个任务"。当前列表未按任务过滤。</span></div>';
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

  function actionBtn(action, id, label, iconName, title, from) {
    return '<button type="button" class="btn btn-sm btn-text" data-action="' + action + '" ' +
      'data-id="' + esc(id) + '"' + (from ? ' data-from="' + esc(from) + '"' : '') +
      (title ? ' title="' + esc(title) + '"' : '') + '>' +
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
        '<td class="col-title"><span class="title-cell" title="' + esc(m.title) + '">' +
          esc(m.title) + '</span></td>' +
        '<td class="col-cat">' + esc(m.category || '未著录') + '</td>' +
        '<td class="col-tags">' + tagChips(m) + '</td>' +
        '<td class="col-note">' + (m.note
          ? '<span class="note-cell" title="' + esc(m.note) + '">' + esc(m.note) + '</span>'
          : '<span class="muted">未填写</span>') + '</td>' +
        '<td class="col-time tnum">' + esc(App.util.fmtDateTime(m.addedAt)) + '</td>' +
        '<td class="col-user">' + esc(m.addedBy) + '</td>' +
        '<td class="col-actions"><div class="row-actions">' +
          actionBtn('material:view', m.id, '查看', 'eye', '查看该素材的目录与文件', 'library') +
          actionBtn('mat:retag', m.id, '更改标签', 'tag') +
          actionBtn('mat:delete', m.id, '删除', null, '从素材库删除该素材') +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table mat-table">' +
      '<thead><tr>' +
        '<th class="col-check"><input type="checkbox" id="mat-check-all" ' +
          'data-change="mat:select-all"' + (allChecked ? ' checked' : '') +
          ' aria-label="全选当前列表"></th>' +
        '<th class="col-idx">序号</th>' +
        '<th class="col-title">标题</th>' +
        '<th class="col-cat">档案门类</th>' +
        '<th class="col-tags">标签</th>' +
        '<th class="col-note">备注</th>' +
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

    var emptyAction = (state.keyword || state.tagId || state.category)
      ? '<button class="btn" data-action="mat:clear-filter">' + icon('rotate-ccw') + '清除筛选</button>'
      : '<button class="btn btn-primary" data-action="mat:goto-search">' +
        icon('search') + '去查找素材</button>';

    return '' +
      renderToolbar() +
      renderTaskNote() +
      renderBatchBar() +
      '<section class="card">' +
        (rows.length ? renderTable(rows) :
          '<div class="card-body">' + U.empty(
            (state.keyword || state.tagId || state.category) ? '没有符合条件的素材' : '素材库还是空的',
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
    var tags = S.tagsWithUsage();

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

  /* ------------------------------------------------------- 新增素材 */

  function fmtSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function formFileHtml() {
    if (!state.formFile) {
      return '<div class="attach-empty">尚未选择文件（原型只记录文件名与大小，不保存文件内容）</div>';
    }
    return '<div class="attach-list"><div class="attach-item">' + icon('file-text') +
      '<span class="attach-name" title="' + esc(state.formFile.name) + '">' +
        esc(state.formFile.name) + '</span>' +
      '<span class="attach-size">' + esc(fmtSize(state.formFile.size)) + '</span>' +
      '<button type="button" class="btn btn-sm btn-text" data-action="mat:remove-file" ' +
        'title="移除该文件" aria-label="移除 ' + esc(state.formFile.name) + '">' + icon('x') + '</button>' +
    '</div></div>';
  }

  function openNewForm() {
    state.formFile = null;
    var tags = S.tagsWithUsage();
    var tagList = tags.length
      ? '<div class="pick-list">' + tags.map(function (t) {
          return '<label class="pick-item">' +
            '<input type="checkbox" name="new-tag" value="' + esc(t.id) + '">' +
            '<span class="pick-main">' +
              '<span class="pick-name">' + esc(t.name) + '</span>' +
              (t.note ? '<span class="pick-note">' + esc(t.note) + '</span>' : '') +
            '</span>' +
            '<span class="pick-count">已用 ' + t.materialCount + ' 件</span>' +
          '</label>';
        }).join('') + '</div>'
      : '<div class="field-extra">还没有素材标签，请先到「编研素材库 / 标签管理」新增标签。</div>';

    U.modal({
      title: '新增素材',
      width: 680,
      okText: '保存',
      cancelText: '取消',
      body:
        '<div class="field">' +
          '<label class="field-label" for="mat-f-title">标题<span class="req">*</span></label>' +
          '<input class="input" id="mat-f-title" maxlength="80" placeholder="素材标题（一般与档案题名一致）">' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label" for="mat-f-cat">档案门类</label>' +
          '<select class="select" id="mat-f-cat">' +
            (App.mock.ARCHIVE_CATEGORIES || []).map(function (c, i) {
              return '<option value="' + esc(c) + '"' + (i === 0 ? ' selected' : '') + '>' +
                esc(c) + '</option>';
            }).join('') +
          '</select>' +
          '<div class="field-extra">从「查找素材」加入的素材会自动沿用档案目录里的门类。</div>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label" for="mat-f-note">备注</label>' +
          '<textarea class="textarea" id="mat-f-note" rows="2" maxlength="200" ' +
            'placeholder="说明这条素材的内容、用途或选材理由">' + '</textarea>' +
        '</div>' +
        '<div class="field">' +
          '<div class="field-label">素材标签<span class="req">*</span></div>' +
          tagList +
          '<div class="field-extra">至少选择一个标签，素材管理里就是按标签筛选的。</div>' +
        '</div>' +
        '<div class="field">' +
          '<div class="field-label">上传文件</div>' +
          '<div class="attach-head">' +
            '<button type="button" class="btn btn-sm" data-action="mat:pick-file">' +
              icon('upload') + '选择文件</button>' +
            '<span class="field-extra" style="margin:0">支持 PDF / OFD / 图片等，单个文件</span>' +
          '</div>' +
          '<input type="file" id="mat-file" class="sr-only" data-change="mat:new-file">' +
          '<div id="mat-file-list">' + formFileHtml() + '</div>' +
        '</div>',
      onOk: function (el) {
        var title = el.querySelector('#mat-f-title').value.trim();
        var tagIds = Array.prototype.slice
          .call(el.querySelectorAll('input[name="new-tag"]:checked'))
          .map(function (c) { return c.value; });
        if (!title) { U.toast('请填写标题', 'warn'); return false; }
        if (!tagIds.length) { U.toast('请至少选择一个素材标签', 'warn'); return false; }
        var res = S.addMaterial({
          title: title, tagIds: tagIds, file: state.formFile,
          category: el.querySelector('#mat-f-cat').value,
          note: el.querySelector('#mat-f-note').value.trim()
        });
        if (!res.ok) { U.toast(res.message, 'warn'); return false; }   // 标题重复：留在弹窗里改
        state.formFile = null;
        U.toast(res.message, 'ok');
        return true;
      }
    });
  }

  function register() {
    /* 「查看」的动作由两个页面共用，注册一次即可（见 material-view.js） */
    if (App.materialView && App.materialView.register) App.materialView.register();

    U.register('mat:new', function () { openNewForm(); });

    U.register('mat:pick-file', function () {
      var input = document.getElementById('mat-file');
      if (input) input.click();
    });

    U.register('mat:new-file', function (ds, el) {
      var f = el.files && el.files[0];
      if (f) state.formFile = { name: f.name, size: f.size };
      el.value = '';   // 允许再次选择同一个文件
      var list = document.getElementById('mat-file-list');
      if (list) list.innerHTML = formFileHtml();
      if (f) U.toast('已选择文件「' + f.name + '」（只记录文件名与大小）', 'ok');
    });

    U.register('mat:remove-file', function () {
      state.formFile = null;
      var list = document.getElementById('mat-file-list');
      if (list) list.innerHTML = formFileHtml();
    });

    U.register('mat:task-filter', function (ds, el) {
      state.taskId = el.value;
      App.app.render();
    });

    U.register('mat:cat-filter', function (ds, el) {
      state.category = el.value;
      App.app.render();
    });

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
      state.taskId = '';
      state.category = '';
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
