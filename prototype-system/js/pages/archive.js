/* ==========================================================================
   页面：材料归档

   对应设计文档「材料归档」：
     用来显示每项编研任务的归档材料，能够切换编研任务，并以列表形式显示归档材料。
     列表字段根据归档设置模块中的设置显示。

   原型处理：
     · **列表列由配置驱动**：列取自 `store.archiveColumns()`（归档字段配置）。
       本模块只负责按配置渲染，「归档设置」模块将来只改配置、不用改这里（见 README）。
     · 归档材料按编研任务组织：立项 3 件 + 各已完成阶段 2 件（成果阶段 3 件），
       已开始的任务都有材料；未开始的任务没有材料（可见空状态）。
       材料不逐件手写，按任务的阶段历史与团队归档人生成。
     · 「序号」与「操作」两列固定，不参与字段配置。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = {
    taskId: null,      // 当前查看的编研任务
    category: '',
    keyword: '',
    selected: {}       // 勾选的归档材料（供「修改」「删除」使用）
  };

  /* 新增 / 修改 / 删除 的录入界面本次不生成（评审要求），点按钮给出明确提示 */
  var FORM_TODO = '归档材料的录入界面尚未生成：当前模块只做列表展示与查看。';

  /* ------------------------------------------------------- 任务切换 */

  /** 任务列表（按成果/在建优先、编号倒序），带材料件数 */
  function taskOptions() {
    return S.tasks().map(function (t) {
      return { id: t.id, name: t.topicName, status: t.status, count: S.archiveCount(t.id) };
    }).sort(function (a, b) {
      // 有材料的优先、材料多的优先（已完成任务的归档最完整），再按编号倒序
      if (a.count !== b.count) return b.count - a.count;
      return String(b.id).localeCompare(String(a.id));
    });
  }

  function selectedKeys() {
    return Object.keys(state.selected).filter(function (k) {
      return state.selected[k] && S.archiveItems().some(function (m) { return m.id === k; });
    });
  }

  function currentTask() {
    var tasks = S.tasks();
    if (!tasks.length) return null;
    var t = state.taskId ? S.getTask(state.taskId) : null;
    if (t) return t;
    // 默认选中：优先第一项成果任务，否则列表里的第一个
    var opts = taskOptions();
    var first = opts.filter(function (o) { return o.count > 0; })[0] || opts[0];
    if (!first) return null;
    state.taskId = first.id;
    return S.getTask(first.id);
  }

  /* ------------------------------------------------------------ 单元格 */

  /** 字典里新增的字段在既有材料上还没有值 —— 显示「未著录」而不是 undefined */
  function renderRaw(m, key) {
    var v = m[key];
    return (v === undefined || v === null || v === '') ? '<span class="muted">未著录</span>' : esc(v);
  }

  var CELL = {
    name: function (m) {
      return '<button type="button" class="link-btn" data-action="ar:view" data-id="' + esc(m.id) + '" ' +
        'title="查看该材料的全部著录字段">' + esc(m.name) + '</button>';
    },
    category: function (m) {
      return U.tag(m.category, App.mock.ARCHIVE_CATEGORY_TAG[m.category] || '');
    },
    stage: function (m) {
      return m.stage === 0 ? '立项' : ('第 ' + m.stage + ' 阶段 · ' + esc(m.stageLabel));
    },
    format: function (m) { return '<span class="mono">' + esc(m.format) + '</span>'; },
    pages: function (m) { return '<span class="tnum">' + m.pages + '</span>'; },
    copies: function (m) { return '<span class="tnum">' + m.copies + '</span>'; },
    carrier: function (m) { return esc(m.carrier); },
    formedAt: function (m) { return '<span class="tnum">' + esc(m.formedAt) + '</span>'; },
    archivedAt: function (m) { return '<span class="tnum">' + esc(m.archivedAt) + '</span>'; },
    archivist: function (m) { return esc(m.archivist); },
    retention: function (m) { return esc(m.retention); },
    security: function (m) {
      return U.tag(m.security, m.security === '公开' ? 'tag-ok' : 'tag-warn');
    },
    fileNo: function (m) { return '<span class="mono">' + esc(m.fileNo) + '</span>'; },
    note: function (m) { return m.note ? esc(m.note) : '<span class="muted">—</span>'; }
  };

  /* ------------------------------------------------------------ 列表 */

  function visibleItems(task) {
    if (!task) return [];
    var kw = state.keyword.trim().toLowerCase();
    return S.archiveOfTask(task.id).filter(function (m) {
      if (state.category && m.category !== state.category) return false;
      if (kw && (m.name + ' ' + m.format + ' ' + m.fileNo + ' ' + m.archivist).toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
  }

  function renderToolbar(task) {
    var opts = taskOptions().map(function (o) {
      return '<option value="' + esc(o.id) + '"' + (task && task.id === o.id ? ' selected' : '') + '>' +
        esc(o.id + '　' + o.name + '（' + o.count + ' 件）') + '</option>';
    }).join('');

    var cats = ['<option value="">全部类型</option>'].concat(S.archiveCategories().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');

    var cols = S.archiveColumns();
    var fields = S.archiveFields();
    var colNames = ['序号'].concat(cols.map(function (k) {
      var f = fields.filter(function (x) { return x.key === k; })[0];
      return f ? f.name : k;
    })).concat(['操作']);

    var sel = selectedKeys().length;

    return '<div class="toolbar">' +
      '<button type="button" class="btn btn-primary" data-action="ar:new">' + icon('plus') + '新增</button>' +
      '<button type="button" class="btn" data-action="ar:edit"' +
        (sel === 1 ? '' : ' aria-disabled="true"') +
        ' title="' + (sel === 1 ? '修改选中的材料' : '请先勾选一件材料') + '">' +
        icon('pencil') + '修改</button>' +
      '<button type="button" class="btn" data-action="ar:delete"' +
        (sel ? '' : ' aria-disabled="true"') +
        ' title="' + (sel ? '删除选中的材料' : '请先勾选材料') + '">' +
        icon('minus') + '删除</button>' +
      '<label class="sr-only" for="ar-task">切换编研任务</label>' +
      '<select class="select select-inline ar-task" id="ar-task" data-change="ar:task">' + opts + '</select>' +
      '<span class="spacer"></span>' +
      '<label class="sr-only" for="ar-cat">按材料类型筛选</label>' +
      '<select class="select select-inline" id="ar-cat" data-change="ar:filter">' + cats + '</select>' +
      '<label class="sr-only" for="ar-kw">搜索材料名称</label>' +
      '<input class="input input-inline" id="ar-kw" type="search" placeholder="搜索材料名称 / 格式 / 归档人" ' +
        'value="' + esc(state.keyword) + '" data-enter="ar:search">' +
      '<button type="button" class="btn" data-action="ar:search">' + icon('search') + '搜索</button>' +
      ((state.keyword || state.category) ?
        '<button type="button" class="btn btn-text" data-action="ar:clear-filter">重置</button>' : '') +
    '</div>';
  }

  function renderTable(rows) {
    var cols = S.archiveColumns();
    var fields = S.archiveFields().filter(function (f) { return cols.indexOf(f.key) >= 0; });

    var allChecked = rows.length > 0 && rows.every(function (m) { return state.selected[m.id]; });
    var head = '<th class="col-check"><input type="checkbox" id="ar-check-all" ' +
      'data-change="ar:select-all"' + (allChecked ? ' checked' : '') + ' aria-label="全选材料"></th>' +
      '<th class="col-idx">序号</th>' + fields.map(function (f) {
      return '<th class="ar-col ar-col-' + esc(f.key) + '">' + esc(f.name) + '</th>';
    }).join('') + '<th class="col-actions">操作</th>';

    var body = rows.map(function (m, i) {
      return '<tr' + (state.selected[m.id] ? ' class="selected"' : '') + '>' +
        '<td class="col-check"><input type="checkbox" data-change="ar:select" ' +
          'data-id="' + esc(m.id) + '"' + (state.selected[m.id] ? ' checked' : '') +
          ' aria-label="选择 ' + esc(m.name) + '"></td>' +
        '<td class="col-idx tnum">' + (i + 1) + '</td>' +
        fields.map(function (f) {
          var fn = CELL[f.key];
          var html = fn ? fn(m) : renderRaw(m, f.key);
          return '<td class="ar-col ar-col-' + esc(f.key) + '">' + html + '</td>';
        }).join('') +
        '<td class="col-actions"><button type="button" class="btn btn-sm btn-text" ' +
          'data-action="ar:view" data-id="' + esc(m.id) + '">' + icon('eye') + '查看</button></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table ar-table">' +
      '<thead><tr>' + head + '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table></div>';
  }

  function render() {
    var task = currentTask();

    if (!task) {
      return '<section class="card"><div class="card-body">' +
        U.empty('还没有编研任务', 'clipboard-list',
          '<button class="btn btn-primary" data-action="ar:goto-task">' + icon('plus') +
          '去编研任务新建</button>') + '</div></section>';
    }

    var rows = visibleItems(task);
    var total = S.archiveCount(task.id);

    return '' +
      renderToolbar(task) +
      '<section class="card">' +
        (rows.length
          ? renderTable(rows)
          : '<div class="card-body">' + U.empty(
              total === 0 ? '该任务的编研工作尚未开始，暂无归档材料' : '没有符合条件的归档材料',
              'archive',
              total === 0
                ? '<button class="btn" data-action="ar:goto-task">' + icon('clipboard-list') + '查看该任务</button>'
                : '<button class="btn" data-action="ar:clear-filter">' + icon('rotate-ccw') + '清除筛选</button>'
            ) + '</div>') +
      '</section>';
  }

  /* ------------------------------------------------------------ 查看 */

  function openDetail(m) {
    var fields = S.archiveFields();
    var rows = [['材料名称', esc(m.name)]];
    fields.forEach(function (f) {
      var fn = CELL[f.key];
      rows.push([f.name, fn ? fn(m) : renderRaw(m, f.key)]);
    });
    rows.push(['所属编研任务', '<span class="tnum">' + esc(m.taskId) + '</span>　' + esc(m.taskTopic)]);

    U.modal({
      title: '归档材料 · ' + m.name,
      width: 720,
      cancelText: null,
      okText: '关闭',
      body: '<dl class="desc">' + rows.map(function (r) {
        return '<dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd>';
      }).join('') + '</dl>' +
      '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
        '<span>这里列出该材料的<b>全部著录字段</b>（含未在列表显示的字段）；' +
        '列表显示哪些列由「归档设置」决定。</span>' +
      '</div>'
    });
  }

  /* ------------------------------------------------------------ 交互 */

  /** 勾选后只就地同步行样式与按钮可用态，不整表重绘 */
  function syncSelection() {
    var root = document.getElementById('main');
    if (!root || !root.querySelector('.ar-table')) return;
    var task = currentTask();
    var rows = task ? visibleItems(task) : [];
    rows.forEach(function (m) {
      var cb = root.querySelector('input[data-change="ar:select"][data-id="' + m.id + '"]');
      if (!cb) return;
      var on = !!state.selected[m.id];
      cb.checked = on;
      var tr = cb.closest ? cb.closest('tr') : null;
      if (tr) tr.classList.toggle('selected', on);
    });
    var sel = rows.filter(function (m) { return state.selected[m.id]; }).length;
    var all = root.querySelector('#ar-check-all');
    if (all) {
      all.checked = rows.length > 0 && sel === rows.length;
      all.indeterminate = sel > 0 && sel < rows.length;
    }
    [['ar:edit', sel === 1], ['ar:delete', sel > 0]].forEach(function (pair) {
      var b = root.querySelector('[data-action="' + pair[0] + '"]');
      if (!b) return;
      if (pair[1]) b.removeAttribute('aria-disabled');
      else b.setAttribute('aria-disabled', 'true');
    });
  }

  function register() {
    U.register('ar:task', function (ds, el) {
      state.taskId = el.value;
      state.category = '';
      state.keyword = '';
      state.selected = {};
      App.app.render();
    });
    U.register('ar:filter', function (ds, el) {
      state.category = el.value;
      state.selected = {};
      App.app.render();
    });
    U.register('ar:search', function () {
      var el = document.getElementById('ar-kw');
      state.keyword = el ? el.value : '';
      state.selected = {};
      App.app.render();
    });
    U.register('ar:clear-filter', function () {
      state.category = '';
      state.keyword = '';
      state.selected = {};
      App.app.render();
    });

    /* ---- 勾选 ---- */
    U.register('ar:select', function (ds, el) {
      if (el.checked) state.selected[ds.id] = true;
      else delete state.selected[ds.id];
      syncSelection();
    });
    U.register('ar:select-all', function (ds, el) {
      var task = currentTask();
      var rows = task ? visibleItems(task) : [];
      if (el.checked) rows.forEach(function (m) { state.selected[m.id] = true; });
      else rows.forEach(function (m) { delete state.selected[m.id]; });
      syncSelection();
    });

    /* ---- 新增 / 修改 / 删除（录入界面本次不生成） ---- */
    U.register('ar:new', function () { U.toast(FORM_TODO, 'warn'); });
    U.register('ar:edit', function () {
      var keys = selectedKeys();
      if (keys.length !== 1) { U.toast('请先勾选一件材料再修改', 'warn'); return; }
      var m = S.archiveItems().filter(function (x) { return x.id === keys[0]; })[0];
      U.toast('修改「' + (m ? m.name : '') + '」：' + FORM_TODO, 'warn');
    });
    U.register('ar:delete', function () {
      var keys = selectedKeys();
      if (!keys.length) { U.toast('请先勾选要删除的材料', 'warn'); return; }
      U.toast('已勾选 ' + keys.length + ' 件材料：' + FORM_TODO, 'warn');
    });
    U.register('ar:view', function (ds) {
      var m = S.archiveItems().filter(function (x) { return x.id === ds.id; })[0];
      if (m) openDetail(m);
    });
    U.register('ar:goto-task', function () {
      App.router.navigate(state.taskId ? ('#/task/' + state.taskId) : '#/task');
    });
  }

  App.pages = App.pages || {};
  /* 单元格渲染器对外暴露：归档设置的「效果预览」直接复用它，避免两套渲染逻辑走偏 */
  App.archiveView = {
    cell: function (m, key) {
      var fn = CELL[key];
      return fn ? fn(m) : renderRaw(m, key);
    }
  };
  App.pages.archive = {
    /* 支持 #/archive/<taskId> 直接定位到某个任务（任务详情页会这样跳过来） */
    render: function (parsed) {
      if (parsed && parsed.sub && S.getTask(parsed.sub)) state.taskId = parsed.sub;
      return render();
    },
    register: register,
    crumb: function (parsed) {
      if (parsed && parsed.sub) {
        var t = S.getTask(parsed.sub);
        return t ? t.id : '';
      }
      return '';
    },
    pageClass: 'page-compact'
  };
})(window);
