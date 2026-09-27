/* ==========================================================================
   编研任务 · 第 2 阶段「确定选材」工作界面

   评审要求的三件事，逐条对应：
     1. 选择素材：弹窗从**素材库**里挑（数据与素材管理完全一致），可以
        查看数据与文件、按素材标签筛选；加入选材库时可选**整个文件**或**某一页 / 某几页**
     2. 移除素材：勾选一条或多条，从选材库移除（**只移出选材库，素材库里的素材不动**）
     3. 上传素材：填写素材名称、素材标签后上传本地文件

   两层库的区别（界面上也写清楚了）：
     素材库（素材管理）＝ 全馆可复用的素材池；选材库（本阶段）＝ 本任务挑中的素材 + 选入范围。
     同一条素材可以以不同范围进同一个选材库（整份一次、第 2-3 页再一次），算两条选材。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = {
    /* 选择素材弹窗里的筛选 */
    pickTag: '',
    pickCategory: '',
    pickKeyword: '',
    pickSelected: {},
    /* 选材库列表的勾选 */
    selected: {},
    /* 加入方式：all＝整个文件 | pages＝个别页（评审口径，原先叫"指定页"） */
    scopeMode: 'all',
    scopePages: '',
    /* 上传素材表单里选中的文件 */
    uploadFile: null
  };

  /* ------------------------------------------------------------ 工具 */

  function fmtSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function tagName(id) {
    var t = S.tags().filter(function (x) { return x.id === id; })[0];
    return t ? t.name : id;
  }

  function tagChips(ids) {
    var list = ids || [];
    if (!list.length) return '<span class="muted">未打标签</span>';
    return '<span class="tag-chips">' + list.slice(0, 2).map(function (id) {
      return U.tag(tagName(id), '');
    }).join('') + (list.length > 2 ? '<span class="tag-rest">+' + (list.length - 2) + '</span>' : '') +
    '</span>';
  }

  /** 素材的页数：优先用素材自身，其次回查档案目录（都没有就返回 0＝未知） */
  var VIDEO_EXT = /^.*\.(mp4|mov|avi|mkv|wmv|flv|m4v|webm|mpg|mpeg)$/i;
  /** 一份文件是不是视频：看扩展名或时长（条目有多份文件时，要按**选中的那一份**判断） */
  function isVideoFile(file) {
    if (!file) return false;
    return VIDEO_EXT.test(String(file.name || '')) || Number(file.duration || 0) > 0;
  }

  /** 视频类素材：没有页码，只能整份加入（「插入帧」也只对它们开放） */
  function isVideoMaterial(m) {
    return isVideoFile((S.materialFileList(m)[0] || null));
  }

  /* ---- 「一条条目里可能有多份文件」（评审修正）：选择与判重都以**文件**为单位 ----
     选中项的键＝`素材编号#文件序号`，值＝true。 */

  function pickKey(materialId, fileNo) { return materialId + '#' + (Number(fileNo) || 1); }

  function pickKeyIds() {
    return Object.keys(state.pickSelected).filter(function (k) { return state.pickSelected[k]; });
  }

  /** 选中的文件：[{ key, material, file }]（素材被删、文件序号对不上就自动丢掉） */
  function pickedFiles() {
    var out = [];
    pickKeyIds().forEach(function (k) {
      var parts = String(k).split('#');
      var m = S.getMaterial(parts[0]);
      if (!m) return;
      var f = S.materialFileOf(m, parseInt(parts[1], 10));
      if (!f) return;
      out.push({ key: k, material: m, file: f });
    });
    return out;
  }

  /** 某份文件的"页数/时长"文字（视频显示时长） */
  function fileMetaText(file) {
    if (isVideoFile(file)) {
      var n = Math.floor(Number(file.duration) || 0);
      if (!n) return '视频';
      var h = Math.floor(n / 3600), mm = Math.floor((n % 3600) / 60), ss = n % 60;
      function pad(x) { return x < 10 ? '0' + x : String(x); }
      return '视频 · ' + (h ? h + ':' : '') + pad(mm) + ':' + pad(ss);
    }
    return file.pages ? file.pages + ' 页' : '未著录';
  }

  /** 视频的"页数"位置改显示时长；没有时长就写"视频" */
  function durationText(m) {
    var n = Math.floor(Number(m && m.file && m.file.duration) || 0);
    if (!n) return '视频';
    var h = Math.floor(n / 3600), mm = Math.floor((n % 3600) / 60), ss = n % 60;
    function pad(x) { return x < 10 ? '0' + x : String(x); }
    return '视频 · ' + (h ? h + ':' : '') + pad(mm) + ':' + pad(ss);
  }

  function entries(taskId) { return S.selectionOf(taskId).entries; }

  function selectedIds(taskId) {
    return Object.keys(state.selected).filter(function (id) {
      return state.selected[id] && entries(taskId).some(function (e) { return e.id === id; });
    });
  }

  /**
   * 解析页码输入：支持 "3"、"3-5"、"1,3,5-8"（中英文逗号、－、~ 都认）
   * @returns {{pages:Array, error:string}}
   */
  function parsePages(text, pageCount) {
    var raw = String(text || '').trim();
    if (!raw) return { pages: [], error: '请填写页码，例如 3 或 3-5 或 1,3,5-8' };
    var pages = [];
    var parts = raw.replace(/[，、；;]/g, ',').replace(/[－—~～]/g, '-').split(',');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var m = p.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) return { pages: [], error: '页码格式不对：「' + p + '」，只支持 3 / 3-5 / 1,3,5-8' };
      var from = parseInt(m[1], 10), to = m[2] ? parseInt(m[2], 10) : from;
      if (from < 1 || to < 1) return { pages: [], error: '页码要从 1 开始' };
      if (to < from) return { pages: [], error: '「' + p + '」的起止页反了' };
      if (to - from > 50) return { pages: [], error: '一次最多选 50 页' };
      for (var n = from; n <= to; n++) {
        if (pageCount && n > pageCount) {
          return { pages: [], error: '第 ' + n + ' 页超出该文件（共 ' + pageCount + ' 页）' };
        }
        if (pages.indexOf(n) < 0) pages.push(n);
      }
    }
    if (!pages.length) return { pages: [], error: '请填写页码' };
    return { pages: pages.sort(function (a, b) { return a - b; }), error: '' };
  }

  /* ------------------------------------------------------------ 选材库列表 */

  function renderToolbar(t) {
    var list = entries(t.id);
    var whole = list.filter(function (e) { return e.scope !== 'pages'; }).length;
    var part = list.length - whole;
    var n = selectedIds(t.id).length;

    return '<div class="toolbar">' +
      '<button type="button" class="btn btn-primary" data-action="sel:pick">' +
        icon('plus') + '选择素材</button>' +
      '<button type="button" class="btn" data-action="sel:upload">' +
        icon('upload') + '上传素材</button>' +
      '<button type="button" class="btn" data-action="sel:remove" data-id=""' +
        (n ? '' : ' aria-disabled="true"') + '>' +
        icon('trash') + '移除素材' + (n ? '（' + n + '）' : '') + '</button>' +
      '<span class="toolbar-note">选材库共 ' + list.length + ' 条' +
        (list.length ? '（整个文件 ' + whole + ' 条，个别页 ' + part + ' 条）' : '') + '</span>' +
      '<span class="spacer"></span>' +
      '<span class="ol-hint">选材库是按编研任务组织的；移除只影响本任务的选材，不会删除素材库里的素材</span>' +
    '</div>';
  }

  function renderTable(t) {
    var list = entries(t.id);
    var rows = list.map(function (e, i) {
      return '<tr' + (state.selected[e.id] ? ' class="selected"' : '') + '>' +
        '<td class="col-check"><input type="checkbox" data-change="sel:select" ' +
          'data-id="' + esc(e.id) + '"' + (state.selected[e.id] ? ' checked' : '') +
          ' aria-label="选择 ' + esc(e.title) + '"></td>' +
        '<td class="col-idx tnum">' + (i + 1) + '</td>' +
        '<td class="col-title"><span class="title-cell" title="' + esc(e.title) + '">' +
          esc(e.title) + '</span></td>' +
        '<td class="col-cat">' + esc(e.category || '未著录') + '</td>' +
        '<td class="col-tags">' + tagChips(e.tagIds) + '</td>' +
        '<td class="col-scope">' + U.tag(S.scopeText(e), e.scope === 'pages' ? 'tag-accent' : '') + '</td>' +
        '<td class="col-src">' + (e.source === 'upload'
          ? U.tag('本地上传', 'tag-warn') : U.tag('素材库', '')) + '</td>' +
        '<td class="col-time tnum">' + esc(App.util.fmtDateTime(e.addedAt)) + '</td>' +
        '<td class="col-user">' + esc(e.addedBy) + '</td>' +
        '<td class="col-actions"><div class="row-actions">' +
          '<button type="button" class="btn btn-sm btn-text" data-action="sel:view" ' +
            'data-id="' + esc(e.id) + '" title="查看该素材的目录与文件">' + icon('eye') + '查看</button>' +
          '<button type="button" class="btn btn-sm btn-text" data-action="sel:remove" ' +
            'data-id="' + esc(e.id) + '" title="从选材库移除这一条">' + icon('trash') + '移除</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table sel-table">' +
      '<thead><tr>' +
        '<th class="col-check"></th>' +
        '<th class="col-idx">序号</th>' +
        '<th class="col-title">素材名称</th>' +
        '<th class="col-cat">档案门类</th>' +
        '<th class="col-tags">素材标签</th>' +
        '<th class="col-scope">加入范围</th>' +
        '<th class="col-src">来源</th>' +
        '<th class="col-time">加入时间</th>' +
        '<th class="col-user">加入人</th>' +
        '<th class="col-actions">操作</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div>';
  }

  function render(t) {
    var list = entries(t.id);
    return '<section class="card sel-step" data-task="' + esc(t.id) + '">' +
      '<div class="card-head">' +
        '<span>第 2 阶段 · 确定选材</span>' +
        '<span class="spacer"></span>' +
        '<span class="head-note">选材库按编研任务组织；一条选材 = 一份文件 + 选入范围（整个文件或个别页）</span>' +
      '</div>' +
      '<div class="card-body">' +
        renderToolbar(t) +
        (list.length
          ? renderTable(t)
          : U.empty('这个任务的选材库还是空的', 'layers',
              '<button class="btn btn-primary" data-action="sel:pick">' + icon('plus') +
              '选择素材</button>')) +
      '</div>' +
    '</section>';
  }

  /* ---------------------------------------------------- 选择素材（弹窗） */

  function pickRows() {
    var kw = state.pickKeyword.trim().toLowerCase();
    return S.materials().filter(function (m) {
      if (state.pickCategory && (m.category || '') !== state.pickCategory) return false;
      if (state.pickTag && (m.tagIds || []).indexOf(state.pickTag) < 0) return false;
      if (kw && (m.title + ' ' + (m.note || '')).toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
  }

  /** 门类下拉：只列素材库里实际出现的门类（带件数），与「素材管理」的筛选口径一致 */
  function pickCategoryOptions() {
    var count = {};
    S.materials().forEach(function (m) {
      var c = m.category || '';
      if (c) count[c] = (count[c] || 0) + 1;
    });
    return ['<option value="">全部门类</option>'].concat(
      (App.mock.ARCHIVE_CATEGORIES || []).filter(function (c) { return count[c]; })
        .map(function (c) {
          return '<option value="' + esc(c) + '"' + (state.pickCategory === c ? ' selected' : '') + '>' +
            esc(c) + '（' + count[c] + '）</option>';
        })
    ).join('');
  }

  function pickTagOptions() {
    var opts = ['<option value="">全部标签</option>'].concat(
      S.tagsWithUsage().map(function (tg) {
        return '<option value="' + esc(tg.id) + '"' + (state.pickTag === tg.id ? ' selected' : '') + '>' +
          esc(tg.name) + '（' + tg.materialCount + '）</option>';
      })
    );
    return opts.join('');
  }

  /**
   * 弹窗里的列表＝**两级**：一条素材条目一行（组行，不勾选），它下面的**每份文件各一行**（可勾选）。
   * 评审修正："一条条目里可能有多份文件" —— 所以先选文件、再选这份文件是「整个文件」还是「个别页」。
   * 组行保留素材名称/门类/标签/文件数与「查看」，文件行显示文件名与**这一份文件**的页数（视频显示时长）。
   */
  function pickTableHtml() {
    var rows = pickRows();
    if (!rows.length) return '<div class="pick-empty">没有符合条件的素材</div>';
    var body = [], seq = 0;
    rows.forEach(function (m) {
      seq += 1;
      var files = S.materialFileList(m);
      var total = files.reduce(function (a, f) { return a + (Number(f.pages) || 0); }, 0);
      body.push('<tr class="pick-group">' +
        '<td class="col-check"></td>' +
        '<td class="col-idx tnum">' + seq + '</td>' +
        '<td class="col-title"><span class="title-cell" title="' + esc(m.title) + '">' +
          esc(m.title) + '</span>' +
          (files.length > 1 ? U.tag('文件 ' + files.length + ' 份', 'tag-accent') : '') + '</td>' +
        '<td class="col-cat">' + esc(m.category || '未著录') + '</td>' +
        '<td class="col-tags">' + tagChips(m.tagIds) + '</td>' +
        '<td class="col-pages tnum">' +
          (isVideoMaterial(m) ? esc(durationText(m)) : (total ? total + ' 页' : '未著录')) + '</td>' +
        '<td class="col-actions"><div class="row-actions">' +
          '<button type="button" class="btn btn-sm btn-text" data-action="sel:pick-view" ' +
            'data-id="' + esc(m.id) + '" title="查看该素材的目录与文件">' + icon('eye') + '查看</button>' +
        '</div></td>' +
      '</tr>');
      files.forEach(function (f) {
        var key = pickKey(m.id, f.no);
        var on = !!state.pickSelected[key];
        body.push('<tr class="pick-file-row' + (on ? ' selected' : '') + '" ' +
            'data-action="sel:pick-row" data-id="' + esc(key) + '" ' +
            'title="点击整行＝选择这份文件">' +
          '<td class="col-check"><input type="checkbox" data-change="sel:pick-select" ' +
            'data-id="' + esc(key) + '"' + (on ? ' checked' : '') +
            ' aria-label="选择 ' + esc(f.name) + '"></td>' +
          '<td class="col-idx"></td>' +
          '<td class="col-title pick-file-name"><span class="pick-file-no">' + f.no + '</span>' +
            '<span class="title-cell" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
            (f.note ? '<span class="pick-file-note">' + esc(f.note) + '</span>' : '') + '</td>' +
          '<td class="col-cat"></td>' +
          '<td class="col-tags"></td>' +
          '<td class="col-pages tnum">' + esc(fileMetaText(f)) + '</td>' +
          '<td class="col-actions"></td>' +
        '</tr>');
      });
    });
    return '<div class="table-scroll pick-table"><table class="table">' +
      '<thead><tr>' +
        '<th class="col-check"></th>' +
        '<th class="col-idx">序号</th>' +
        '<th class="col-title">素材名称 / 文件</th>' +
        '<th class="col-cat">档案门类</th>' +
        '<th class="col-tags">素材标签</th>' +
        '<th class="col-pages">页数</th>' +
        '<th class="col-actions">操作</th>' +
      '</tr></thead><tbody>' + body.join('') + '</tbody></table></div>';
  }

  /**
   * 侧栏＝「先选文件、再选范围」两步（评审要求）：
   *   ① 在左侧列表里选择文件（点整行或勾选框，可多选）；
   *   ② 再决定这份/这些文件是「整个文件」加入，还是只取「个别页」。
   * 没选文件时范围那一步是禁用的 —— 顺序在界面上就是硬性的，不用靠提示文字提醒。
   */
  function scopeHtml() {
    var picked = pickedFiles();
    var first = picked.length ? picked[0] : null;
    var ready = picked.length > 0;
    var hint;
    if (state.scopeMode === 'pages') {
      /* 页码是针对**某一份文件**的，所以个别页只允许单选（评审要求） */
      if (!ready) {
        hint = '请先在左侧列表里选择**一份**文件（页码只针对这一份文件生效）';
      } else if (isVideoFile(first.file)) {
        hint = '《' + first.file.name + '》是视频文件（没有页码），只能用「整个文件」加入';
      } else {
        var pc = Number(first.file.pages) || 0;
        hint = '页码针对《' + first.file.name + '》：' +
          (pc ? '会在 1 – ' + pc + ' 页之间校验' : '这份文件未著录页数，页码不做上限校验') +
          (picked.length > 1 ? '　（个别页一次只能选一份文件）' : '');
      }
    } else if (ready) {
      hint = '已选择 ' + picked.length + ' 份文件，都会以「整个文件」加入选材库';
    } else {
      hint = '先在左侧列表里选择文件：点整行或勾选框都行（可以多选）';
    }

    function radio(value, label) {
      var on = state.scopeMode === value;
      return '<label class="check' + (ready ? '' : ' is-disabled') + '">' +
        '<input type="radio" name="sel-scope" value="' + value + '"' + (on ? ' checked' : '') +
        (ready ? '' : ' disabled') + ' data-change="sel:scope-mode"> ' + label + '</label>';
    }

    return '<div class="scope-box">' +
      '<div class="scope-step">' +
        '<span class="scope-step-no">1</span>选择文件' +
        '<span class="scope-step-state" id="pick-step-state">' +
          (ready ? '已选 ' + picked.length + ' 份' : '尚未选择') + '</span>' +
      '</div>' +
      '<div class="field-extra">在左侧列表里点**文件行**（或勾选框）选择文件 —— ' +
        '一条素材条目下可能有多份文件，先选文件、再选范围（可多选）。</div>' +
      '<div class="scope-step">' +
        '<span class="scope-step-no">2</span>选择加入范围' +
        (ready ? '' : '<span class="scope-step-state">先选文件</span>') +
      '</div>' +
      radio('all', '整个文件' + (ready ? '（可多选）' : '（可多选，先选文件）')) +
      radio('pages', '个别页' + (ready ? '（只能选一份文件）' : '（只能选一份文件，先选文件）')) +
      (state.scopeMode === 'pages' && ready
        ? '<div class="scope-pages">' +
            '<label class="sr-only" for="sel-pages">要加入的页码</label>' +
            '<input class="input input-sm" id="sel-pages" maxlength="60" ' +
              'placeholder="如 3 或 3-5 或 1,3,5-8" value="' + esc(state.scopePages) + '" ' +
              'data-change="sel:scope-pages">' +
          '</div>'
        : '') +
      '<div class="field-extra" id="sel-scope-hint">' + esc(hint) + '</div>' +
    '</div>';
  }

  /** 勾上/取消一份文件（键＝素材#文件）：state、行高亮、勾选框三处一起同步 */
  function applyPick(key, on) {
    if (on) state.pickSelected[key] = true;
    else delete state.pickSelected[key];
    var root = document.getElementById('main') || document;
    var modal = document.querySelector('.modal') || root;
    var cb = modal.querySelector('.pick-table input[data-change="sel:pick-select"][data-id="' + key + '"]');
    if (cb) cb.checked = !!on;
    var tr = cb && cb.closest ? cb.closest('tr') : null;
    if (tr) tr.classList.toggle('selected', !!on);
  }

  /** 个别页模式下把选择裁到只剩一份文件（保留 keepKey，没有就保留第一个） */
  function trimToSingle(keepKey) {
    var picked = pickKeyIds();
    if (picked.length <= 1) return null;
    var keep = keepKey && picked.indexOf(keepKey) >= 0 ? keepKey : picked[0];
    picked.forEach(function (k) { if (k !== keep) delete state.pickSelected[k]; });
    /* DOM 里的复选框也要跟着变（弹窗不是整页重渲染） */
    Array.prototype.forEach.call(document.querySelectorAll('.pick-table tbody tr'), function (tr) {
      var cb = tr.querySelector('input[data-change="sel:pick-select"]');
      if (!cb) return;
      var on = !!state.pickSelected[cb.getAttribute('data-id')];
      cb.checked = on;
      tr.classList.toggle('selected', on);
    });
    return keep;
  }

  function openPicker(t) {
    state.pickTag = '';
    state.pickCategory = '';
    state.pickKeyword = '';
    state.pickSelected = {};
    state.scopeMode = 'all';
    state.scopePages = '';

    U.modal({
      title: '选择素材 · 加入「' + t.topicName + '」的选材库',
      width: 1140,          /* 多了「档案门类」筛选 + 两步式侧栏，宽度放宽一点，操作列不再被挤掉 */
      okText: '加入选材库',
      cancelText: '取消',
      body:
        '<div class="pick-layout">' +
          '<div class="pick-main">' +
            '<div class="toolbar">' +
              '<label class="sr-only" for="pick-cat">按档案门类筛选</label>' +
              '<select class="select select-inline" id="pick-cat" data-change="sel:pick-cat" ' +
                'title="按档案门类筛选素材">' + pickCategoryOptions() + '</select>' +
              '<label class="sr-only" for="pick-tag">按素材标签筛选</label>' +
              '<select class="select select-inline" id="pick-tag" data-change="sel:pick-tag">' +
                pickTagOptions() + '</select>' +
              '<label class="sr-only" for="pick-kw">搜索素材</label>' +
              '<input class="input input-inline" id="pick-kw" type="search" placeholder="搜索素材名称或备注" ' +
                'value="' + esc(state.pickKeyword) + '" data-enter="sel:pick-search">' +
              '<button type="button" class="btn" data-action="sel:pick-search">' + icon('search') + '搜索</button>' +
              '<span class="spacer"></span>' +
              '<span class="ol-hint" id="pick-count"></span>' +
            '</div>' +
            '<div id="pick-list">' + pickTableHtml() + '</div>' +
          '</div>' +
          '<div class="pick-side" id="pick-side">' + scopeHtml() + '</div>' +
        '</div>' +
        '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
          '<span><b>先选文件、再选范围</b>：左侧列表是两级的 —— 一条素材条目下可能<b>有多份文件</b>' +
          '（列表里点<b>文件行</b>或勾选框选择要加入的那一份），再在右侧决定是「整个文件」还是只取「个别页」；' +
          '页码按<b>这一份文件</b>的页数校验。' +
          '素材数据与「编研素材库 / 素材管理」完全一致：可以<b>查看目录与文件</b>、' +
          '<b>按档案门类或素材标签筛选</b>。' +
          '同一条素材可以以不同范围重复加入（整份一次、某几页再一次），按「素材 + 范围」判重。</span></div>',
      onOk: function (el) {
        var picked = pickedFiles();
        if (!picked.length) { U.toast('请先选择要加入的文件', 'warn'); return false; }

        var pages = [];
        if (state.scopeMode === 'pages') {
          /* ⚠️ 页码必须**从输入框现读**：state 里的值只在切换单选/重绘时同步，
             直接读 state 会把用户刚敲的页码当成空（曾经就这样，四种输入都报"请填写页码"） */
          var input = el.querySelector('#sel-pages');
          state.scopePages = input ? input.value : state.scopePages;
          /* 视频文件没有页码，只能用「整个文件」加入 */
          var vid = picked.filter(function (p) { return isVideoFile(p.file); });
          if (vid.length) {
            U.toast('视频文件没有页码，《' + vid[0].file.name + '》只能用「整个文件」加入', 'warn');
            return false;
          }
          /* 兜底：正常路径下界面已经把选择裁到一份，这里再挡一次 */
          if (picked.length > 1) {
            U.toast('「个别页」一次只能选一份文件，请只选择一份或改用「整个文件」', 'warn');
            return false;
          }
          /* 页码上限＝**这一份文件**的页数（不再是一条素材的总页数） */
          var limit = Number(picked[0].file.pages) || 0;
          var parsed = parsePages(state.scopePages, limit);
          if (parsed.error) { U.toast(parsed.error, 'warn'); return false; }
          pages = parsed.pages;
        }

        var items = picked.map(function (p) {
          var m = p.material, f = p.file;
          return {
            materialId: m.id, source: 'library', title: m.title, archiveNo: m.archiveNo,
            category: m.category, tagIds: m.tagIds,
            fileNo: f.no,
            /* 选材记录里的 file 指向**选中的那一份**：加工编排的文件浏览、插入帧都按它取 */
            file: { name: f.name, size: f.size, duration: f.duration || 0 },
            pageCount: Number(f.pages) || 0, pages: pages.slice()
          };
        });
        var res = S.addSelections(t.id, items);
        state.selected = {};
        U.toast('已加入 ' + res.added.length + ' 条到选材库' +
          (pages.length ? '（' + S.pagesText(pages) + '）' : '（整个文件）') +
          (res.skipped.length ? '；跳过重复 ' + res.skipped.length + ' 条' : ''), 'ok');
        return true;
      },
      onClose: function () { state.pickSelected = {}; }
    });
    paintPickCount();
  }

  /** 就地刷新弹窗里的计数与"加入方式"提示（不整页重渲染，保住弹窗与输入） */
  function paintPickCount() {
    var box = document.getElementById('pick-count');
    if (box) {
      var n = pickKeyIds().length;
      var files = pickRows().reduce(function (a, m) { return a + S.materialFileList(m).length; }, 0);
      box.textContent = '共 ' + files + ' 份文件可加入（' + pickRows().length + ' 条素材）' +
        (n ? '，已勾选 ' + n + ' 份' : '');
    }
    var side = document.getElementById('pick-side');
    if (side) side.innerHTML = scopeHtml();
  }

  /* ---------------------------------------------------- 上传素材（弹窗） */

  function openUpload(t) {
    state.uploadFile = null;
    var tags = S.tagsWithUsage();
    U.modal({
      title: '上传素材 · 加入选材库',
      width: 660,
      okText: '上传并加入',
      cancelText: '取消',
      body:
        '<div class="field">' +
          '<label class="field-label" for="sel-up-title">素材名称<span class="req">*</span></label>' +
          '<input class="input" id="sel-up-title" maxlength="80" placeholder="这份素材叫什么">' +
        '</div>' +
        '<div class="field">' +
          '<div class="field-label">素材标签<span class="req">*</span></div>' +
          (tags.length
            ? '<div class="pick-list">' + tags.map(function (tg) {
                return '<label class="pick-item">' +
                  '<input type="checkbox" name="up-tag" value="' + esc(tg.id) + '">' +
                  '<span class="pick-main">' +
                    '<span class="pick-name">' + esc(tg.name) + '</span>' +
                    (tg.note ? '<span class="pick-note">' + esc(tg.note) + '</span>' : '') +
                  '</span>' +
                  '<span class="pick-count">已用 ' + tg.materialCount + ' 件</span>' +
                '</label>';
              }).join('') + '</div>'
            : '<div class="field-extra">还没有素材标签，请先到「编研素材库 / 标签管理」新增标签。</div>') +
        '</div>' +
        '<div class="field">' +
          '<div class="field-label">上传文件<span class="req">*</span></div>' +
          '<div class="attach-head">' +
            '<button type="button" class="btn btn-sm" data-action="sel:pick-file">' +
              icon('upload') + '选择文件</button>' +
            '<span class="field-extra" style="margin:0">支持 PDF / OFD / 图片等，单个文件</span>' +
          '</div>' +
          '<input type="file" id="sel-up-file" class="sr-only" data-change="sel:upload-file">' +
          '<div id="sel-up-list">' + uploadFileHtml() + '</div>' +
        '</div>' +
        '<div class="data-note">' + icon('info') +
          '<span>上传的素材会<b>同时进入素材库</b>（素材管理里能看到，其他任务也能复用），' +
          '并以「整个文件」加入本任务的选材库。原型只记录文件名与大小，不保存文件内容。</span></div>',
      onOk: function (el) {
        var title = el.querySelector('#sel-up-title').value.trim();
        var tagIds = Array.prototype.slice
          .call(el.querySelectorAll('input[name="up-tag"]:checked'))
          .map(function (c) { return c.value; });
        if (!title) { U.toast('请填写素材名称', 'warn'); return false; }
        if (!tagIds.length) { U.toast('请至少选择一个素材标签', 'warn'); return false; }
        if (!state.uploadFile) { U.toast('请选择要上传的文件', 'warn'); return false; }

        /* 先入库（素材库），再作为整份文件加入本任务的选材库 */
        var res = S.addMaterial({
          title: title, tagIds: tagIds, file: state.uploadFile, category: '文书档案'
        });
        if (!res.ok) { U.toast(res.message, 'warn'); return false; }
        var m = res.item;
        S.addSelections(t.id, [{
          materialId: m.id, source: 'upload', title: m.title, archiveNo: m.archiveNo,
          category: m.category, tagIds: m.tagIds, file: m.file, pageCount: 0, pages: []
        }]);
        state.uploadFile = null;
        U.toast('已上传「' + m.title + '」：已进入素材库，并加入本任务的选材库', 'ok');
        return true;
      }
    });
  }

  function uploadFileHtml() {
    if (!state.uploadFile) {
      return '<div class="attach-empty">尚未选择文件（原型只记录文件名与大小，不保存文件内容）</div>';
    }
    return '<div class="attach-list"><div class="attach-item">' + icon('file-text') +
      '<span class="attach-name" title="' + esc(state.uploadFile.name) + '">' +
        esc(state.uploadFile.name) + '</span>' +
      '<span class="attach-size">' + esc(fmtSize(state.uploadFile.size)) + '</span>' +
      '<button type="button" class="btn btn-sm btn-text" data-action="sel:remove-upload" ' +
        'title="移除该文件">' + icon('x') + '</button>' +
      '</div></div>';
  }

  /* ------------------------------------------------------------ 移除 */

  function doRemove(t, ids) {
    if (!ids.length) {
      U.toast('请先勾选要移除的选材，或点行内的「移除」', 'warn');
      return;
    }
    var names = ids.map(function (id) {
      var e = entries(t.id).filter(function (x) { return x.id === id; })[0];
      return e ? e.title : id;
    });
    U.confirm({
      title: ids.length === 1 ? '从选材库移除「' + esc(names[0]) + '」？'
        : '从选材库移除选中的 ' + ids.length + ' 条选材？',
      content: '移除的只是本任务的选材记录，<b>素材库里的素材不会被删除</b>，之后还可以再选进来。',
      okText: '移除'
    }).then(function (ok) {
      if (!ok) return;
      var res = S.removeSelections(t.id, ids);
      ids.forEach(function (id) { delete state.selected[id]; });
      U.toast(res.removed.length === 1
        ? '已从选材库移除「' + res.removed[0] + '」'
        : '已从选材库移除 ' + res.removed.length + ' 条选材', 'ok');
    });
  }

  /* ------------------------------------------------------------ 交互 */

  function syncSelection(t) {
    var root = document.getElementById('main');
    if (!root) return;
    var list = entries(t.id);
    list.forEach(function (e) {
      var cb = root.querySelector('input[data-change="sel:select"][data-id="' + e.id + '"]');
      if (!cb) return;
      var on = !!state.selected[e.id];
      cb.checked = on;
      var tr = cb.closest ? cb.closest('tr') : null;
      if (tr) tr.classList.toggle('selected', on);
    });
    var n = selectedIds(t.id).length;
    var btn = root.querySelector('.sel-step [data-action="sel:remove"]');
    if (btn) {
      btn.setAttribute('aria-disabled', n ? 'false' : 'true');
      btn.innerHTML = icon('trash') + '移除素材' + (n ? '（' + n + '）' : '');
    }
  }

  /** 当前渲染的任务号（弹窗回调里拿不到闭包里的 t，记在模块上） */
  var currentTaskId = null;

  function register() {
    currentTaskId = currentTaskId;   // 由 mount 更新

    U.register('sel:pick', function () {
      var t = S.getTask(currentTaskId);
      if (t) openPicker(t);
    });
    U.register('sel:upload', function () {
      var t = S.getTask(currentTaskId);
      if (t) openUpload(t);
    });

    /* 弹窗内的标签筛选 / 搜索 / 勾选 / 查看 */
    U.register('sel:pick-tag', function (ds, el) {
      state.pickTag = el.value;
      var box = document.getElementById('pick-list');
      if (box) box.innerHTML = pickTableHtml();
      paintPickCount();
    });
    U.register('sel:pick-cat', function (ds, el) {
      state.pickCategory = el.value;
      var box = document.getElementById('pick-list');
      if (box) box.innerHTML = pickTableHtml();
      paintPickCount();
    });
    /* 整行点一下＝选择这份文件（先选文件那一步；点在按钮/勾选框/链接上时不重复处理） */
    U.register('sel:pick-row', function (ds, el, ev) {
      var t = ev && ev.target;
      if (t && t.closest && t.closest('button, input, label, a')) return;
      /* ds.id 是「素材#文件」键；点到组行（素材行）不处理 */
      if (String(ds.id).indexOf('#') < 0) return;
      var next = !state.pickSelected[ds.id];
      applyPick(ds.id, next);
      if (next && state.scopeMode === 'pages') {
        var keep = trimToSingle(ds.id);
        if (keep) {
          var kp0 = pickedFiles()[0];
          U.toast('「个别页」一次只能选一份文件，已改为只选「' +
            (kp0 ? kp0.file.name : keep) + '」', 'ok');
        }
      }
      paintPickCount();
    });
    U.register('sel:pick-search', function () {
      var el = document.getElementById('pick-kw');
      state.pickKeyword = el ? el.value : '';
      var box = document.getElementById('pick-list');
      if (box) box.innerHTML = pickTableHtml();
      paintPickCount();
    });
    U.register('sel:pick-select', function (ds, el) {
      applyPick(ds.id, !!el.checked);
      /* 「个别页」是给某一份文件设页码，所以这时选择是单选：选新的替换旧的 */
      if (el.checked && state.scopeMode === 'pages') {
        var keep = trimToSingle(ds.id);
        if (keep) {
          var kp1 = pickedFiles()[0];
          U.toast('「个别页」一次只能选一份文件，已改为只选「' +
            (kp1 ? kp1.file.name : keep) + '」', 'ok');
        }
      }
      paintPickCount();
    });
    U.register('sel:pick-view', function (ds) {
      /* 复用素材管理的「查看」：目录 + 文件（叠在弹窗之上，关闭只关这一层） */
      if (App.materialView) App.materialView.open('library', ds.id);
    });
    U.register('sel:scope-mode', function (ds, el) {
      /* 没选文件时范围那一步是禁用的；万一被程序绕过（例如脚本直接改 checked），
         这里也不让它静默生效 —— 先提示"先选文件"，并把模式退回「整个文件」。 */
      if (!pickKeyIds().length) {
        state.scopeMode = 'all';
        U.toast('请先在左侧列表里选择文件，再选择加入范围', 'warn');
        paintPickCount();
        return;
      }
      state.scopeMode = el.value;
      if (state.scopeMode === 'pages') {
        var keep = trimToSingle(null);
        if (keep) {
          var kp2 = pickedFiles()[0];
          U.toast('「个别页」一次只能选一份文件，已保留「' + (kp2 ? kp2.file.name : keep) + '」', 'ok');
        }
      }
      paintPickCount();
    });
    U.register('sel:scope-pages', function (ds, el) {
      state.scopePages = el.value;
    });

    /* 上传 */
    U.register('sel:pick-file', function () {
      var input = document.getElementById('sel-up-file');
      if (input) input.click();
    });
    U.register('sel:upload-file', function (ds, el) {
      var f = el.files && el.files[0];
      if (f) state.uploadFile = { name: f.name, size: f.size };
      el.value = '';
      var list = document.getElementById('sel-up-list');
      if (list) list.innerHTML = uploadFileHtml();
      if (f) U.toast('已选择文件「' + f.name + '」（只记录文件名与大小）', 'ok');
    });
    U.register('sel:remove-upload', function () {
      state.uploadFile = null;
      var list = document.getElementById('sel-up-list');
      if (list) list.innerHTML = uploadFileHtml();
    });

    /* 选材库：勾选与移除 */
    U.register('sel:select', function (ds, el) {
      if (el.checked) state.selected[ds.id] = true;
      else delete state.selected[ds.id];
      syncSelection(S.getTask(currentTaskId));
    });
    U.register('sel:remove', function (ds) {
      var t = S.getTask(currentTaskId);
      if (!t) return;
      doRemove(t, ds.id ? [ds.id] : selectedIds(t.id));
    });
    U.register('sel:view', function (ds) {
      var e = entries(currentTaskId).filter(function (x) { return x.id === ds.id; })[0];
      if (!e) return;
      if (e.materialId && S.getMaterial(e.materialId)) {
        if (App.materialView) {
          App.materialView.open('library', e.materialId, { scopeText: S.scopeText(e) });
        }
      } else {
        U.toast('这条选材没有可查看的素材（可能素材已被删除）', 'warn');
      }
    });
  }

  function mount(root, t) {
    if (!root || !root.querySelector('.sel-step')) return;
    currentTaskId = t.id;
    /* 翻页/换任务后，勾选里可能只剩已经不存在的条目 */
    Object.keys(state.selected).forEach(function (id) {
      if (!entries(t.id).some(function (e) { return e.id === id; })) delete state.selected[id];
    });
  }

  App.taskSelection = { render: render, mount: mount, register: register };
})(window);
