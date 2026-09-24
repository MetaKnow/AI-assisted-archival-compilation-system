/* ==========================================================================
   页面：材料归档

   对应设计文档「材料归档」：
     用来显示每项编研任务的归档材料，能够切换编研任务，并以列表形式显示归档材料。
     列表字段根据归档设置模块中的设置显示。

   原型处理：
     · **列表列与录入表单都由配置驱动**：都取自 `store.archiveFields()`（归档设置里的字段字典）——
       归档设置里加一个字段，材料归档的列表列与「新增 / 修改」表单会同时出现它。
     · 归档材料按编研任务组织：立项 3 件 + 各已完成阶段 2 件（成果阶段 3 件），
       已开始的任务都有材料；未开始的任务没有材料（可见空状态）。
       材料不逐件手写，按任务的阶段历史与团队归档人生成。
     · **每条材料都可以修改，也可以新增**（评审要求）：行内「修改」+ 工具栏「新增 / 修改 / 删除」；
       表单字段就是字段字典：「所属阶段」是结构化下拉，「素材目录」条目还能看到由选材库派生的目录表。
     · 成果发布审核通过后，四类材料由数据层自动归档到本模块（`store.autoArchiveProduct`）：
       选题可行性评估表及附件 / 审核意见表 / 素材目录 / 编研成果定稿；自动归档的条目标「自动归档」，
       人工改过之后不再被自动归档覆盖。
     · 「序号」与「操作」两列固定，不参与字段配置。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var fmtSize = App.util.fmtSize;      /* 附件大小（与「选题立项」的附件展示同一套格式化） */
  var icon = App.icons.render;

  var state = {
    taskId: null,      // 当前查看的编研任务
    category: '',
    keyword: '',
    selected: {},      // 勾选的归档材料（供「修改」「删除」使用）
    formFiles: []      // 表单里登记的附件（原型只记文件名与大小，不做真实上传）
  };

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
        'title="查看该材料的全部著录字段">' + esc(m.name) + '</button>' +
        (m.auto === 'publish'
          ? U.tag('自动归档', 'tag-accent', '由成果发布审核通过后自动归档' +
            (m.flowNo ? '（流程 ' + m.flowNo + '）' : ''))
          : '') +
        ((m.attachments || []).length
          ? '<span class="attach-chip" title="附件：' +
            esc(m.attachments.map(function (a) { return a.name; }).join('；')) + '">' +
            icon('paperclip') + m.attachments.length + '</span>' : '');
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
      '<button type="button" class="btn btn-primary" data-action="ar:new" ' +
        'title="在当前编研任务下新增一条归档材料">' + icon('plus') + '新增</button>' +
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
        '<td class="col-actions"><div class="row-actions">' +
          '<button type="button" class="btn btn-sm btn-text" ' +
            'data-action="ar:view" data-id="' + esc(m.id) + '">' + icon('eye') + '查看</button>' +
          '<button type="button" class="btn btn-sm btn-text" ' +
            'data-action="ar:edit-one" data-id="' + esc(m.id) + '">' + icon('pencil') + '修改</button>' +
        '</div></td>' +
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

  /** 附件清单（只读展示）：原型不存实体文件，只有名称 / 大小 / 格式 */
  function attachReadHtml(m) {
    var list = m.attachments || [];
    if (!list.length) return '<span class="muted">无附件</span>';
    return '<div class="attach-list">' + list.map(function (a) {
      return '<div class="attach-item">' + icon('file-text') +
        '<span class="attach-name" title="' + esc(a.name) + '">' + esc(a.name) + '</span>' +
        '<span class="attach-tag">' + esc(a.format || '—') + '</span>' +
        '<span class="attach-size">' + esc(fmtSize(a.size)) + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  /** 「素材目录」的目录表：由该任务的选材库派生（只有目录，没有素材文件） */
  function catalogHtml(m) {
    var rows = S.archiveCatalog(m);
    if (!rows.length) {
      return '<div class="data-note">' + icon('info') +
        '<span>该任务的选材库为空，因此没有目录数据（目录表由「确定选材」的选材库派生）。</span></div>';
    }
    return '<div class="table-scroll"><table class="table ar-catalog-table">' +
      '<thead><tr><th class="col-idx">序号</th><th>素材题名</th><th class="col-no">档号</th>' +
        '<th class="col-status">门类</th><th class="col-time">来源</th><th>选入范围</th>' +
        '<th class="col-time">页数</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td class="col-idx tnum">' + r.no + '</td>' +
          '<td>' + esc(r.title) + '</td>' +
          '<td class="col-no mono">' + esc(r.archiveNo) + '</td>' +
          '<td>' + esc(r.category || '—') + '</td>' +
          '<td>' + esc(r.source) + '</td>' +
          '<td>' + esc(r.scope) + '</td>' +
          '<td class="tnum">' + (r.pageCount || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="data-note">' + icon('info') + '<span>共 <b>' + rows.length +
        '</b> 条，由该任务「确定选材」环节的选材库派生；此处只归档<b>目录表</b>，不含素材文件。</span></div>';
  }

  function openDetail(m) {
    var fields = S.archiveFields();
    /* 第一行就是字典里的「材料名称」（字段顺序即字典顺序），别再写一行同样的 */
    var rows = [];
    fields.forEach(function (f) {
      var fn = CELL[f.key];
      rows.push([f.name, fn ? fn(m) : renderRaw(m, f.key)]);
    });
    rows.push(['所属编研任务', '<span class="tnum">' + esc(m.taskId) + '</span>　' + esc(m.taskTopic)]);
    if (m.auto === 'publish') {
      rows.push(['归档来源', '由成果发布审核通过后<b>自动归档</b>' +
        (m.flowNo ? '（流程 <span class="tnum">' + esc(m.flowNo) + '</span>' : '') +
        (m.productId ? '，成果 <span class="tnum">' + esc(m.productId) + '</span>' : '') +
        (m.flowNo ? '）' : '')]);
    }
    if (m.updatedAt) {
      rows.push(['最近修改', esc(App.util.fmtDateTime(m.updatedAt)) + '　' + esc(m.updatedBy || '')]);
    }

    var isCatalog = S.archiveCatalog(m).length > 0 || String(m.name).indexOf('素材目录') >= 0;
    var body = '<dl class="desc">' + rows.map(function (r) {
        return '<dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd>';
      }).join('') + '</dl>' +
      '<h3 class="ar-sub">附件' + ((m.attachments || []).length
        ? '（' + m.attachments.length + '）' : '') + '</h3>' + attachReadHtml(m) +
      (isCatalog ? '<h3 class="ar-sub">素材目录表</h3>' + catalogHtml(m) : '') +
      '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
        '<span>这里列出该材料的<b>全部著录字段</b>（含未在列表显示的字段）；' +
        '列表显示哪些列由「归档设置」决定。</span>' +
      '</div>' +
      '<div class="hstack" style="margin-top:var(--s3)">' +
        '<button type="button" class="btn" data-action="ar:edit-one" data-id="' + esc(m.id) + '">' +
          icon('pencil') + '修改这条材料</button>' +
      '</div>';

    U.modal({
      title: '归档材料 · ' + m.name,
      width: 860,
      cancelText: null,
      okText: '关闭',
      body: body
    });
  }

  /* ------------------------------------------------------- 新增 / 修改 */

  /** 字段配置里指定的数据字典（没有就返回 null，按普通输入框渲染） */
  function dictOf(f) {
    if (!f || !f.dict || f.dict === '无') return null;
    return S.dataDicts().filter(function (d) { return d.name + '字典' === f.dict; })[0] || null;
  }

  function fieldInput(f, value) {
    var id = 'af-' + f.key;
    var max = f.type === '日期' ? '' : ' maxlength="' + (f.totalLength || 200) + '"';
    /* 字典类型：配置了数据字典就用下拉（与「归档设置」里的字典类型一致） */
    var dict = dictOf(f);
    if (dict) {
      return '<select class="select" id="' + id + '">' +
        '<option value="">未选择</option>' + dict.items.map(function (it) {
          return '<option value="' + esc(it.value) + '"' +
            (String(value) === String(it.value) ? ' selected' : '') + '>' + esc(it.name) + '</option>';
        }).join('') + '</select>';
    }
    if (f.type === '日期') {
      return '<input class="input" id="' + id + '" type="date" value="' + esc(value || '') + '">';
    }
    if (f.type === '数字') {
      return '<input class="input" id="' + id + '" inputmode="numeric" value="' + esc(value || '') + '">';
    }
    if (f.key === 'note') {
      return '<textarea class="textarea" id="' + id + '" rows="3"' + max +
        ' placeholder="' + esc(f.hint || '') + '">' + esc(value || '') + '</textarea>';
    }
    return '<input class="input" id="' + id + '" type="text"' + max +
      ' placeholder="' + esc(f.hint || '') + '" value="' + esc(value || '') + '">';
  }

  /** 表单：所属编研任务 + 「归档设置」的字段字典 + 附件 + （素材目录的）目录表预览 */
  function formHtml(m) {
    var isEdit = !!m;
    var taskSelect = '<select class="select" id="af-task">' + S.tasks().map(function (t) {
      return '<option value="' + esc(t.id) + '"' +
        ((m ? m.taskId : state.taskId) === t.id ? ' selected' : '') + '>' +
        esc(t.id + '　' + t.topicName) + '</option>';
    }).join('') + '</select>' +
      '<div class="form-field-extra">归档材料按编研任务组织：切换任务后，这条材料会出现在该任务的归档列表里。</div>';

    var rows = ['<div class="form-row"><div class="form-label">所属编研任务' +
      '<span class="req">*</span></div><div class="form-field">' + taskSelect + '</div></div>'];

    S.archiveFields().forEach(function (f) {
      var value = m ? m[f.key] : (f.defaultType && f.defaultType !== '无' ? f.defaultType : '');
      var field;
      if (f.key === 'stage') {
        field = '<select class="select" id="af-stage">' + S.archiveStageChoices().map(function (c) {
          return '<option value="' + c.value + '"' +
            (Number(m ? m.stage : 0) === c.value ? ' selected' : '') + '>' + esc(c.label) + '</option>';
        }).join('') + '</select>';
      } else {
        field = fieldInput(f, value);
      }
      /* 有 placeholder 的控件（文本/数字/字典）提示语只出现一次，别在下面再重复一行 */
      var hasPlaceholder = f.type === '文本' && f.key !== 'note' && !dictOf(f);
      rows.push('<div class="form-row"><div class="form-label">' + esc(f.name) +
        (f.required ? '<span class="req">*</span>' : '') + '</div>' +
        '<div class="form-field">' + field +
        (f.hint && f.key !== 'note' && !hasPlaceholder
          ? '<div class="form-field-extra">' + esc(f.hint) + '</div>' : '') +
        '</div></div>');
    });

    var attachBlock = '<div class="attach-head">' +
        '<button type="button" class="btn btn-sm" data-action="ar:pick-files">' +
          icon('upload') + '选择文件</button>' +
        '<span class="muted" style="font-size:var(--fs-xs)">可多选；原型不真正上传，只登记文件名、大小与格式</span>' +
      '</div>' +
      '<input type="file" id="af-files" class="sr-only" multiple data-change="ar:attach">' +
      '<div id="af-attach-list">' + attachListHtml() + '</div>';
    rows.push('<div class="form-row"><div class="form-label">附件</div>' +
      '<div class="form-field">' + attachBlock +
      '<div class="form-field-extra">发布审核通过后，' +
      '「选题可行性评估表及附件」的附件清单默认取立选项题上登记的附件。</div>' +
      '</div></div>');

    var catalog = isEdit ? S.archiveCatalog(m) : [];
    var catalogBlock = '<div class="data-note">' + icon('info') + '<span>' +
      (catalog.length
        ? '这条材料的目录表由该任务的选材库派生，共 <b>' + catalog.length + '</b> 条（在本条目的「查看」里能看到整张表）。'
        : '材料名称含「素材目录」时，目录表由该任务的选材库派生；当前任务' +
          (m ? '' : '（保存后') + '的选材库为空。') + '</span></div>';

    return '<div class="form-table ar-form-table">' + rows.join('') + '</div>' +
      '<h3 class="ar-sub">素材目录</h3>' + catalogBlock +
      (isEdit ? '' : '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
        '<span>新增的材料会记入当前所选编研任务的归档列表；' +
        '「材料名称」为必填，其余字段留空即可（列表里显示「未著录」）。</span></div>');
  }

  function attachListHtml() {
    if (!state.formFiles.length) return '<div class="attach-empty">尚未添加附件</div>';
    return '<div class="attach-list">' + state.formFiles.map(function (f, i) {
      return '<div class="attach-item">' + icon('file-text') +
        '<span class="attach-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
        '<span class="attach-tag">' + esc(f.format || '—') + '</span>' +
        '<span class="attach-size">' + esc(fmtSize(f.size)) + '</span>' +
        '<button type="button" class="btn btn-sm btn-text" data-action="ar:remove-file" ' +
          'data-i="' + i + '" title="移除该附件" aria-label="移除 ' + esc(f.name) + '">' +
          icon('x') + '</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  /** 从弹窗里读出表单数据（按字段字典逐个取值） */
  function readForm(el) {
    var data = { taskId: (el.querySelector('#af-task') || {}).value || '' };
    S.archiveFields().forEach(function (f) {
      var id = f.key === 'stage' ? 'af-stage' : ('af-' + f.key);
      var node = el.querySelector('#' + id);
      data[f.key] = node ? node.value : '';
    });
    data.stage = (el.querySelector('#af-stage') || {}).value || 0;
    data.attachments = state.formFiles.slice();
    return data;
  }

  function openForm(m) {
    state.formFiles = m ? (m.attachments || []).map(function (a) {
      return { name: a.name, size: a.size, format: a.format };
    }) : [];
    var isEdit = !!m;
    U.modal({
      title: (isEdit ? '修改归档材料 · ' : '新增归档材料 · ') + (m ? m.name : (currentTask() || {}).topicName || ''),
      width: 820,
      body: formHtml(m),
      okText: isEdit ? '保存修改' : '确定新增',
      cancelText: '取消',
      onOk: function (el) {
        var data = readForm(el);
        var r = isEdit ? S.updateArchiveItem(m.id, data) : S.addArchiveItem(data);
        U.toast(r.message, r.ok ? 'ok' : 'err');
        return r.ok;
      }
    });
  }

  function doDelete() {
    var keys = selectedKeys();
    if (!keys.length) { U.toast('请先勾选要删除的归档材料', 'warn'); return; }
    var names = keys.map(function (id) {
      var m = S.archiveItemOf(id);
      return m ? m.name : id;
    });
    U.confirm({
      title: keys.length === 1 ? '删除归档材料？' : '删除选中的 ' + keys.length + ' 件归档材料？',
      content: '<ul>' + names.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' +
        '<div class="muted" style="font-size:var(--fs-xs)">删除后不可恢复；被删除的自动归档条目在下次同步时可能被重新补上。</div>',
      okText: '确认删除'
    }).then(function (ok) {
      if (!ok) return;
      var r = S.deleteArchiveItems(keys);
      state.selected = {};
      U.toast(r.message, r.ok ? 'ok' : 'warn');
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

    /* ---- 新增 / 修改 / 删除 ---- */
    U.register('ar:new', function () { openForm(null); });
    U.register('ar:edit', function () {
      var keys = selectedKeys();
      if (keys.length !== 1) { U.toast('请先勾选一件材料再修改', 'warn'); return; }
      openForm(S.archiveItemOf(keys[0]));
    });
    U.register('ar:edit-one', function (ds) {
      var m = S.archiveItemOf(ds.id);
      if (!m) { U.toast('归档材料不存在', 'warn'); return; }
      U.closeTop();                      /* 从「查看」弹窗里点进来的：先关掉查看弹窗 */
      openForm(m);
    });
    U.register('ar:delete', function () { doDelete(); });
    U.register('ar:view', function (ds) {
      var m = S.archiveItemOf(ds.id);
      if (m) openDetail(m);
    });

    /* ---- 表单里的附件（原型只登记文件名与大小） ---- */
    U.register('ar:pick-files', function () {
      var input = document.getElementById('af-files');
      if (input) input.click();
    });
    U.register('ar:attach', function (ds, el) {
      var files = el.files ? Array.prototype.slice.call(el.files) : [];
      files.forEach(function (f) {
        var m = /\.([A-Za-z0-9]+)$/.exec(String(f.name || ''));
        state.formFiles.push({ name: f.name, size: f.size, format: m ? m[1].toUpperCase() : '' });
      });
      var list = document.getElementById('af-attach-list');
      if (list) list.innerHTML = attachListHtml();
      el.value = '';                     /* 允许再次选择同一个文件 */
      if (files.length) U.toast('已添加 ' + files.length + ' 个附件（仅记录名称、大小与格式）', 'ok');
    });
    U.register('ar:remove-file', function (ds) {
      state.formFiles.splice(parseInt(ds.i, 10), 1);
      var list = document.getElementById('af-attach-list');
      if (list) list.innerHTML = attachListHtml();
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
