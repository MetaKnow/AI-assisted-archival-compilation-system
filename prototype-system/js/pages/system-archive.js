/* ==========================================================================
   页面：系统管理 · 归档设置

   对应设计文档「系统管理 / 归档设置」：用来设置材料归档模块需要显示的字段。

   界面按客户参考图实现：
     · 列表（图片1）：工具栏「新增 / 修改 / 删除 / 更多操作（批量导出、批量导入）」（按评审要求去掉了搜索）；
       表格列为 勾选框、序号、名称、提示语、类型、日期格式、总长度、小数长度（空值显示 "/"）。
       另加两列本系统必需的信息：「是否显示」（文档要的正是"材料归档显示哪些字段"）与「操作」。
     · 新增/修改弹窗（图片2）：著录项名称（必填，内联红色报错）、著录项提示语、著录项数据类型、
       总长度、是否必填（开关）、元数据（随名称自动关联）、字典类型、默认值类型，底部「关闭 / 保存」。
       日期格式与小数长度按类型联动显示。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = { selected: {} };

  /* 元数据候选（对应图片2「元数据会根据著录项名称自动关联」） */
  var META_OPTIONS = [
    { value: '', label: '无' },
    { value: 'dc.title', label: '题名（dc.title）' },
    { value: 'dc.creator', label: '责任者（dc.creator）' },
    { value: 'dc.date', label: '日期（dc.date）' },
    { value: 'dc.description', label: '摘要（dc.description）' },
    { value: 'archive.fondsNo', label: '全宗号（archive.fondsNo）' },
    { value: 'archive.fileNo', label: '档号（archive.fileNo）' },
    { value: 'archive.year', label: '年度（archive.year）' }
  ];
  /* 名称关键词 → 建议元数据（实现"自动关联"） */
  var META_HINTS = [
    { re: /名称|题名|标题/, meta: 'dc.title' },
    { re: /归档人|责任者|编纂|录入人/, meta: 'dc.creator' },
    { re: /日期|时间/, meta: 'dc.date' },
    { re: /简介|说明|摘要|备注/, meta: 'dc.description' },
    { re: /全宗/, meta: 'archive.fondsNo' },
    { re: /档号|文件号/, meta: 'archive.fileNo' },
    { re: /年度|年份/, meta: 'archive.year' }
  ];
  /* 字典类型：枚举值直接取自「系统管理 · 数据字典」，两处口径不会走偏 */
  function dictOptions() {
    return ['无'].concat(S.dictNameOptions());
  }
  /* 默认值类型 */
  var DEFAULT_OPTIONS = ['无', '固定值', '当前日期', '当前用户', '关联任务字段'];

  function suggestMeta(name) {
    var hit = META_HINTS.filter(function (h) { return h.re.test(String(name || '')); })[0];
    return hit ? hit.meta : '';
  }

  /** 表格里的空值统一显示 "/"（与参考图一致） */
  function cellOr(v) {
    return (v === '' || v === null || v === undefined) ? '/' : String(v);
  }

  /* ------------------------------------------------------------ 列表 */

  function visibleFields() { return S.archiveFields(); }

  function selectedKeys() {
    return Object.keys(state.selected).filter(function (k) {
      return state.selected[k] && S.getArchiveField(k);
    });
  }

  function renderToolbar() {
    var n = selectedKeys().length;
    return '<div class="toolbar">' +
      '<button type="button" class="btn btn-primary" data-action="saf:new">' + icon('plus') + '新增</button>' +
      '<button type="button" class="btn" data-action="saf:edit"' +
        (n === 1 ? '' : ' aria-disabled="true"') +
        ' title="' + (n === 1 ? '修改选中的著录项' : '请先勾选一个著录项') + '">' +
        icon('pencil') + '修改</button>' +
      '<button type="button" class="btn" data-action="saf:delete"' +
        (n ? '' : ' aria-disabled="true"') +
        ' title="' + (n ? '删除选中的著录项' : '请先勾选著录项') + '">' +
        icon('minus') + '删除</button>' +
      '<span class="saf-more-wrap">' +
        '<button type="button" class="btn" data-action="ui:menu" data-menu-trigger="saf-more" ' +
          'aria-haspopup="true" aria-expanded="false">' + icon('more-vertical') + '更多操作</button>' +
        '<div class="menu hidden" id="saf-more" role="menu">' +
          '<button type="button" class="menu-item" data-action="saf:export">' +
            icon('download') + '<span>批量导出</span></button>' +
          '<button type="button" class="menu-item" data-action="saf:import">' +
            icon('upload') + '<span>批量导入</span></button>' +
        '</div>' +
      '</span>' +
      '<span class="spacer"></span>' +
      '<span class="toolbar-note">共 ' + S.archiveFields().length + ' 个著录项　·　' +
        S.archiveColumns().length + ' 个显示在材料归档列表</span>' +
    '</div>';
  }

  function renderTable(rows) {
    var allChecked = rows.length > 0 && rows.every(function (f) { return state.selected[f.key]; });

    var body = rows.map(function (f, i) {
      return '<tr' + (state.selected[f.key] ? ' class="selected"' : '') + '>' +
        '<td class="col-check"><input type="checkbox" data-change="saf:select" ' +
          'data-key="' + esc(f.key) + '"' + (state.selected[f.key] ? ' checked' : '') +
          ' aria-label="选择 ' + esc(f.name) + '"></td>' +
        '<td class="col-idx tnum">' + (i + 1) + '</td>' +
        '<td class="col-name">' + esc(f.name) + '</td>' +
        '<td class="saf-col-hint">' + esc(cellOr(f.hint)) + '</td>' +
        '<td class="saf-col-type">' + esc(f.type) + '</td>' +
        '<td class="saf-col-fmt">' + esc(cellOr(f.dateFormat)) + '</td>' +
        '<td class="saf-col-len tnum">' + (f.type === '日期' ? '/' : esc(cellOr(f.totalLength))) + '</td>' +
        '<td class="saf-col-dec tnum">' + (f.type === '数字' ? esc(cellOr(f.decimalLength)) : '/') + '</td>' +
        '<td class="saf-col-vis"><label class="check">' +
          '<input type="checkbox" data-change="saf:visible" data-key="' + esc(f.key) + '"' +
            (f.visible ? ' checked' : '') +
            ' aria-label="材料归档中显示 ' + esc(f.name) + '">' +
          '<span>' + (f.visible ? '显示' : '隐藏') + '</span></label></td>' +
        '<td class="col-actions"><div class="row-actions">' +
          '<button type="button" class="btn btn-sm btn-text" data-action="saf:edit-one" ' +
            'data-key="' + esc(f.key) + '">' + icon('pencil') + '修改</button>' +
          '<button type="button" class="btn btn-sm btn-text" data-action="saf:delete" ' +
            'data-key="' + esc(f.key) + '" title="删除该著录项">' +
            icon('trash') + '删除</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table saf-table">' +
      '<thead><tr>' +
        '<th class="col-check"><input type="checkbox" id="saf-check-all" ' +
          'data-change="saf:select-all"' + (allChecked ? ' checked' : '') + ' aria-label="全选"></th>' +
        '<th class="col-idx">序号</th>' +
        '<th class="col-name">名称</th>' +
        '<th class="saf-col-hint">提示语</th>' +
        '<th class="saf-col-type">类型</th>' +
        '<th class="saf-col-fmt">日期格式</th>' +
        '<th class="saf-col-len">总长度</th>' +
        '<th class="saf-col-dec">小数长度</th>' +
        '<th class="saf-col-vis">是否显示</th>' +
        '<th class="col-actions">操作</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function render() {
    var rows = visibleFields();
    Object.keys(state.selected).forEach(function (k) {
      if (!S.getArchiveField(k)) delete state.selected[k];
    });
    return '' + renderToolbar() +
      '<section class="card">' +
        (rows.length ? renderTable(rows) :
          '<div class="card-body">' + U.empty('还没有著录项，点「新增」添加', 'list-checks',
            '<button class="btn btn-primary" data-action="saf:new">' + icon('plus') + '新增著录项</button>') +
          '</div>') +
      '</section>';
  }

  /* ---------------------------------------------------- 新增 / 修改弹窗 */

  function optionHtml(list, cur, valueKey, labelKey) {
    return list.map(function (o) {
      var v = valueKey ? o[valueKey] : o;
      var l = labelKey ? o[labelKey] : o;
      return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }

  function fieldFormHtml(f) {
    var isEdit = !!f;
    var types = App.mock.ARCHIVE_FIELD_TYPES;
    var formats = App.mock.ARCHIVE_DATE_FORMATS;
    var meta = f.meta || suggestMeta(f.name);

    return '<div class="rec-form" id="saf-form" data-type="' + esc(f.type) + '">' +
      '<div class="rec-row">' +
        '<label class="rec-label" for="sf-name"><span class="req">*</span>著录项名称：</label>' +
        '<div class="rec-field">' +
          '<input class="input" id="sf-name" maxlength="30" placeholder="请输入著录项名称" ' +
            'value="' + esc(f.name) + '" data-input="saf:name" autocomplete="off">' +
          '<div class="field-error" id="sf-name-error" role="alert" hidden></div>' +
        '</div>' +
      '</div>' +
      '<div class="rec-row">' +
        '<label class="rec-label" for="sf-hint">著录项提示语：</label>' +
        '<div class="rec-field"><input class="input" id="sf-hint" maxlength="120" ' +
          'placeholder="请输入著录项提示语" value="' + esc(f.hint) + '"></div>' +
      '</div>' +
      '<div class="rec-row">' +
        '<label class="rec-label" for="sf-type">著录项数据类型：</label>' +
        '<div class="rec-field"><select class="select" id="sf-type" data-change="saf:type">' +
          optionHtml(types, f.type) + '</select></div>' +
      '</div>' +
      '<div class="rec-row" data-only="文本,数字">' +
        '<label class="rec-label" for="sf-len">总长度：</label>' +
        '<div class="rec-field">' +
          '<input class="input" id="sf-len" inputmode="numeric" maxlength="6" placeholder="请输入总长度" ' +
            'value="' + (f.type === '日期' ? '' : esc(String(f.totalLength || ''))) + '">' +
          '<div class="field-error" id="sf-len-error" role="alert" hidden></div>' +
        '</div>' +
      '</div>' +
      '<div class="rec-row" data-only="数字">' +
        '<label class="rec-label" for="sf-dec">小数长度：</label>' +
        '<div class="rec-field">' +
          '<input class="input" id="sf-dec" inputmode="numeric" maxlength="3" placeholder="请输入小数长度" ' +
            'value="' + esc(String(f.decimalLength || 0)) + '">' +
          '<div class="field-error" id="sf-dec-error" role="alert" hidden></div>' +
        '</div>' +
      '</div>' +
      '<div class="rec-row" data-only="日期">' +
        '<label class="rec-label" for="sf-fmt">日期格式：</label>' +
        '<div class="rec-field"><select class="select" id="sf-fmt">' +
          optionHtml(formats, f.dateFormat || 'YYYY-MM-DD') + '</select></div>' +
      '</div>' +
      '<div class="rec-row">' +
        '<div class="rec-label">是否必填：</div>' +
        '<div class="rec-field"><label class="switch">' +
          '<input type="checkbox" id="sf-required"' + (f.required ? ' checked' : '') + '>' +
          '<span class="switch-track"><span class="switch-knob"></span></span>' +
          '<span class="switch-text">' + (f.required ? '是' : '否') + '</span>' +
        '</label></div>' +
      '</div>' +
      '<div class="rec-row">' +
        '<label class="rec-label" for="sf-meta">元数据：</label>' +
        '<div class="rec-field">' +
          '<select class="select" id="sf-meta">' + optionHtml(META_OPTIONS, meta, 'value', 'label') + '</select>' +
          '<div class="rec-field-extra">元数据会根据著录项名称自动关联。</div>' +
        '</div>' +
      '</div>' +
      '<div class="rec-row">' +
        '<label class="rec-label" for="sf-dict">字典类型：</label>' +
        '<div class="rec-field"><select class="select" id="sf-dict">' +
          optionHtml(dictOptions(), f.dict || '无') + '</select></div>' +
      '</div>' +
      '<div class="rec-row">' +
        '<label class="rec-label" for="sf-default">默认值类型：</label>' +
        '<div class="rec-field"><select class="select" id="sf-default">' +
          optionHtml(DEFAULT_OPTIONS, f.defaultType || '无') + '</select></div>' +
      '</div>' +
      '<div class="rec-row">' +
        '<div class="rec-label">材料归档：</div>' +
        '<div class="rec-field"><label class="switch">' +
          '<input type="checkbox" id="sf-visible"' + (f.visible ? ' checked' : '') + '>' +
          '<span class="switch-track"><span class="switch-knob"></span></span>' +
          '<span class="switch-text">' + (f.visible ? '列表显示' : '列表隐藏') + '</span>' +
        '</label>' +
        '<div class="rec-field-extra">隐藏后仍保存数据，只是不出现在材料归档列表里。</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /** 类型联动：日期 → 只显示日期格式；数字 → 总长度 + 小数长度；文本 → 总长度 */
  function syncFormType(modalEl) {
    var form = modalEl.querySelector('#saf-form');
    if (!form) return;
    var type = form.querySelector('#sf-type').value;
    form.setAttribute('data-type', type);
    Array.prototype.forEach.call(form.querySelectorAll('[data-only]'), function (el) {
      var allow = el.getAttribute('data-only').split(',');
      var show = allow.indexOf(type) >= 0;
      el.hidden = !show;
      el.style.display = show ? '' : 'none';
    });
  }

  /* ------- 内联校验（参考图2 的红色「必填项」就是这样提示的） ------- */

  function setError(modalEl, inputId, message) {
    var input = modalEl.querySelector('#' + inputId);
    var box = modalEl.querySelector('#' + inputId + '-error');
    if (box) {
      box.textContent = message || '';
      if (message) box.removeAttribute('hidden');
      else box.setAttribute('hidden', '');
    }
    if (input) {
      if (message) input.classList.add('input-error');
      else input.classList.remove('input-error');
    }
  }

  function clearErrors(modalEl) {
    ['sf-name', 'sf-len', 'sf-dec'].forEach(function (id) { setError(modalEl, id, ''); });
  }

  function validateForm(modalEl) {
    clearErrors(modalEl);
    var name = modalEl.querySelector('#sf-name').value.trim();
    var type = modalEl.querySelector('#sf-type').value;
    var bad = null;

    if (!name) {
      setError(modalEl, 'sf-name', '必填项');
      bad = 'sf-name';
    } else {
      var editKey = modalEl.dataset.editKey || '';
      var dup = S.archiveFields().filter(function (f) {
        return f.name.trim() === name && f.key !== editKey;
      })[0];
      if (dup) { setError(modalEl, 'sf-name', '已存在同名著录项'); bad = 'sf-name'; }
    }

    if (!bad && (type === '文本' || type === '数字')) {
      var len = parseInt(modalEl.querySelector('#sf-len').value, 10);
      if (!len || len <= 0) { setError(modalEl, 'sf-len', '请输入大于 0 的整数'); bad = 'sf-len'; }
    }
    if (!bad && type === '数字') {
      var total = parseInt(modalEl.querySelector('#sf-len').value, 10) || 0;
      var dec = parseInt(modalEl.querySelector('#sf-dec').value, 10);
      if (isNaN(dec) || dec < 0) { setError(modalEl, 'sf-dec', '请输入不小于 0 的整数'); bad = 'sf-dec'; }
      else if (dec > total) { setError(modalEl, 'sf-dec', '小数长度不能大于总长度'); bad = 'sf-dec'; }
    }
    if (bad) {
      var el = modalEl.querySelector('#' + bad);
      if (el) el.focus();
      return null;
    }

    return {
      name: name,
      hint: modalEl.querySelector('#sf-hint').value,
      type: type,
      dateFormat: modalEl.querySelector('#sf-fmt').value,
      totalLength: modalEl.querySelector('#sf-len').value,
      decimalLength: modalEl.querySelector('#sf-dec').value,
      required: modalEl.querySelector('#sf-required').checked,
      visible: modalEl.querySelector('#sf-visible').checked,
      meta: modalEl.querySelector('#sf-meta').value,
      dict: modalEl.querySelector('#sf-dict').value,
      defaultType: modalEl.querySelector('#sf-default').value
    };
  }

  function openFieldForm(field) {
    var f = field || {
      key: '', name: '', hint: '', type: '文本', dateFormat: 'YYYY-MM-DD',
      totalLength: '', decimalLength: 0, required: false, visible: true,
      meta: '', dict: '无', defaultType: '无'
    };
    var isEdit = !!field;

    U.modal({
      title: isEdit ? '修改' : '新增',
      width: 720,
      okText: '保存',
      cancelText: '关闭',
      body: fieldFormHtml(f),
      onOk: function (el) {
        var modal = el.closest ? el.closest('.modal') : el;
        var data = validateForm(modal);
        if (!data) return false;                     // 内联报错已显示，弹窗保持打开
        var res = isEdit ? S.updateArchiveField(f.key, data) : S.addArchiveField(data);
        if (!res.ok) { setError(modal, 'sf-name', res.message); return false; }
        U.toast(res.message, 'ok');
        return true;
      }
    });

    setTimeout(function () {
      var modal = document.querySelector('.modal');
      if (!modal) return;
      modal.dataset.editKey = isEdit ? f.key : '';
      syncFormType(modal);

      /* 开关右侧文字随勾选变化 */
      [['sf-required', '是', '否'], ['sf-visible', '列表显示', '列表隐藏']].forEach(function (pair) {
        var box = modal.querySelector('#' + pair[0]);
        if (!box) return;
        var text = box.parentElement.querySelector('.switch-text');
        box.addEventListener('change', function () {
          if (text) text.textContent = box.checked ? pair[1] : pair[2];
        });
      });

      /* 名称失焦即校验（不是等到提交），并按名称自动关联元数据 */
      var nameInput = modal.querySelector('#sf-name');
      if (nameInput) {
        nameInput.addEventListener('blur', function () { validateForm(modal); });
        nameInput.addEventListener('input', function () {
          var err = modal.querySelector('#sf-name-error');
          if (err && err.textContent) validateForm(modal);
          var meta = modal.querySelector('#sf-meta');
          if (meta && !meta.dataset.touched) meta.value = suggestMeta(nameInput.value);
        });
        if (!isEdit) nameInput.focus();
      }
      var metaSel = modal.querySelector('#sf-meta');
      if (metaSel) metaSel.addEventListener('change', function () { metaSel.dataset.touched = '1'; });
    }, 30);
  }

  /* ------------------------------------------------------ 删除 / 选择 */

  function doDelete(keys) {
    if (!keys.length) return;
    var fields = keys.map(function (k) { return S.getArchiveField(k); }).filter(Boolean);
    if (!fields.length) return;

    U.confirm({
      title: fields.length === 1 ? ('删除著录项「' + fields[0].name + '」？')
        : ('删除选中的 ' + fields.length + ' 个著录项？'),
      content: '删除后该著录项不再出现在材料归档的著录与列表中（既有数据不会被清除）。' +
        '<div class="muted" style="margin-top:6px;font-size:var(--fs-xs)">' +
        '所有著录项（含材料名称）都可以删除；删掉材料名称后，材料归档列表不再有名称列，' +
        '但仍可在「查看」里看到材料名称。</div>',
      okText: '确认删除'
    }).then(function (ok) {
      if (!ok) return;
      var res = S.deleteArchiveFields(keys);
      keys.forEach(function (k) { delete state.selected[k]; });
      App.app.render();
      if (res.deleted.length) U.toast('已删除著录项：' + res.deleted.join('、'), 'ok');
    });
  }

  /* --------------------------------------------------- 批量导出 / 导入 */

  var CSV_HEADER = ['名称', '提示语', '类型', '日期格式', '总长度', '小数长度', '必填', '是否显示', '元数据', '字典类型', '默认值类型'];

  function csvCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? ('"' + s.replace(/"/g, '""') + '"') : s;
  }

  function exportCsv() {
    var lines = [CSV_HEADER.join(',')];
    S.archiveFields().forEach(function (f) {
      lines.push([
        f.name, f.hint, f.type, f.dateFormat,
        f.type === '日期' ? '' : f.totalLength,
        f.type === '数字' ? f.decimalLength : '',
        f.required ? '是' : '否',
        f.visible ? '是' : '否',
        f.meta || '', f.dict || '', f.defaultType || ''
      ].map(csvCell).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '归档著录项定义.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    U.toast('已导出 ' + S.archiveFields().length + ' 个著录项定义：' + a.download, 'ok');
  }

  /** 极简 CSV 解析：逗号分隔 + 双引号包裹（够用即可） */
  function parseCsv(text) {
    return String(text).replace(/^\ufeff/, '').split(/\r?\n/).filter(function (l) {
      return l.trim() !== '';
    }).map(function (line) {
      var cells = [], cur = '', inQuote = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (inQuote) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQuote = false;
          else cur += ch;
        } else if (ch === '"') inQuote = true;
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      return cells.map(function (c) { return c.trim(); });
    });
  }

  function openImport() {
    U.modal({
      title: '批量导入著录项定义',
      width: 720,
      cancelText: null,
      okText: '关闭',
      body:
        '<div class="alert alert-info" role="note">' +
          '<span class="alert-icon">' + icon('info') + '</span><div>' +
          '按「批量导出」的 CSV 模板整理后导入。列顺序：' + esc(CSV_HEADER.join('、')) + '。<br>' +
          '首行可以是表头；<b>名称已存在的著录项会被更新</b>，不存在的则新增。</div>' +
        '</div>' +
        '<div class="hstack" style="margin-top:var(--s3)">' +
          '<button type="button" class="btn btn-primary" data-action="saf:pick-file">' +
            icon('upload') + '选择 CSV 文件</button>' +
          '<button type="button" class="btn" data-action="saf:export">' + icon('download') + '先导出现有定义</button>' +
        '</div>' +
        '<input type="file" id="saf-file" class="sr-only" accept=".csv,text/csv" data-change="saf:file">' +
        '<div id="saf-import-result"></div>'
    });
  }

  function doImport(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var rows = parseCsv(reader.result);
      if (rows.length && rows[0][0] === CSV_HEADER[0]) rows.shift();
      var added = 0, updated = 0, failed = [];

      rows.forEach(function (cells, i) {
        var name = cells[0];
        if (!name) { failed.push('第 ' + (i + 1) + ' 行：名称为空'); return; }
        var data = {
          name: name,
          hint: cells[1] || '',
          type: App.mock.ARCHIVE_FIELD_TYPES.indexOf(cells[2]) >= 0 ? cells[2] : '文本',
          dateFormat: cells[3] || 'YYYY-MM-DD',
          totalLength: cells[4] || '',
          decimalLength: cells[5] || 0,
          required: cells[6] === '是',
          visible: cells[7] === '' ? true : cells[7] === '是',
          meta: cells[8] || '', dict: cells[9] || '无', defaultType: cells[10] || '无'
        };
        var exist = S.archiveFields().filter(function (f) { return f.name === name; })[0];
        var res = exist ? S.updateArchiveField(exist.key, data) : S.addArchiveField(data);
        if (!res.ok) { failed.push('第 ' + (i + 1) + ' 行：' + res.message); return; }
        if (exist) updated++; else added++;
      });

      var box = document.getElementById('saf-import-result');
      if (box) {
        box.innerHTML = '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
          '<span>导入完成：新增 <b>' + added + '</b> 个、更新 <b>' + updated + '</b> 个' +
          (failed.length ? ('，跳过 <b>' + failed.length + '</b> 行：<br>' + failed.map(esc).join('<br>')) : '') +
          '</span></div>';
      }
      App.app.render();
      if (added || updated) U.toast('已导入著录项定义：新增 ' + added + '、更新 ' + updated, 'ok');
      else U.toast('没有可导入的行' + (failed.length ? ('（' + failed.length + ' 行有问题）') : ''), 'warn');
    };
    reader.readAsText(file, 'utf-8');
  }

  /* ------------------------------------------------------------ 交互 */

  function syncSelection() {
    var root = document.getElementById('main');
    if (!root) return;
    var rows = visibleFields();
    rows.forEach(function (f) {
      var cb = root.querySelector('input[data-change="saf:select"][data-key="' + f.key + '"]');
      if (!cb) return;
      var on = !!state.selected[f.key];
      cb.checked = on;
      var tr = cb.closest ? cb.closest('tr') : null;
      if (tr) tr.classList.toggle('selected', on);
    });
    var sel = rows.filter(function (f) { return state.selected[f.key]; }).length;
    var all = root.querySelector('#saf-check-all');
    if (all) {
      all.checked = rows.length > 0 && sel === rows.length;
      all.indeterminate = sel > 0 && sel < rows.length;
    }
    [['saf:edit', sel === 1], ['saf:delete', sel > 0]].forEach(function (pair) {
      var b = root.querySelector('[data-action="' + pair[0] + '"]');
      if (!b) return;
      if (pair[1]) b.removeAttribute('aria-disabled');
      else b.setAttribute('aria-disabled', 'true');
    });
  }

  function register() {
    U.register('saf:new', function () { openFieldForm(null); });

    U.register('saf:edit', function () {
      var keys = selectedKeys();
      if (keys.length !== 1) { U.toast('请先勾选一个著录项再修改', 'warn'); return; }
      openFieldForm(S.getArchiveField(keys[0]));
    });
    U.register('saf:edit-one', function (ds) {
      var f = S.getArchiveField(ds.key);
      if (f) openFieldForm(f);
    });

    U.register('saf:delete', function (ds) {
      var keys = ds && ds.key ? [ds.key] : selectedKeys();
      if (!keys.length) { U.toast('请先勾选要删除的著录项', 'warn'); return; }
      doDelete(keys);
    });

    U.register('saf:select', function (ds, el) {
      if (el.checked) state.selected[ds.key] = true;
      else delete state.selected[ds.key];
      syncSelection();
    });
    U.register('saf:select-all', function (ds, el) {
      var rows = visibleFields();
      if (el.checked) rows.forEach(function (f) { state.selected[f.key] = true; });
      else rows.forEach(function (f) { delete state.selected[f.key]; });
      syncSelection();
    });

    /* 「是否显示」列：直接切换，立即影响材料归档 */
    U.register('saf:visible', function (ds, el) {
      var f = S.getArchiveField(ds.key);
      if (!f) return;
      var keys = S.archiveColumns().filter(function (k) { return k !== ds.key; });
      if (el.checked) keys.push(ds.key);
      S.setArchiveColumns(keys);
      App.app.render();
      U.toast('「' + f.name + '」' + (el.checked ? '已显示在材料归档' : '已从材料归档隐藏'), 'ok');
    });

    U.register('saf:type', function (ds, el) {
      var modal = el.closest ? el.closest('.modal') : null;
      if (modal) syncFormType(modal);
    });

    U.register('saf:export', function () { U.closeMenus(); exportCsv(); });
    U.register('saf:import', function () { U.closeMenus(); openImport(); });
    U.register('saf:pick-file', function () {
      var input = document.getElementById('saf-file');
      if (input) input.click();
    });
    U.register('saf:file', function (ds, el) {
      var file = el.files && el.files[0];
      el.value = '';
      doImport(file);
    });
  }

  App.pages = App.pages || {};
  /* 二级模块：页面键为 'system/archive' */
  App.pages['system/archive'] = {
    render: render,
    register: register,
    pageClass: 'page-compact'
  };
})(window);
