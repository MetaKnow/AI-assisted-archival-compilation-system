/* ==========================================================================
   页面：编研素材库 · 查找素材

   对应设计文档「编研素材库 / 查找素材」：
     先生成一个检索界面，包括目录检索和全文检索 → 点击搜索后出现测试数据
     → 允许勾选数据后点击「加入素材库」按钮
     → 先弹出素材标签选择页面，然后加入素材库

   原型边界：
     · 检索在浏览器内完成（字符串匹配）。生产环境按《技术选型方案》接 Meilisearch，
       中文分词、繁简与同义词扩展在那里做；真实实现应由检索服务（如 Meilisearch）承担。
     · 同一档号不重复入库；已在素材库中的条目勾选框直接禁用，避免"选了却被跳过"的困惑。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var MODES = {
    catalog: { label: '目录检索', hint: '按档号、题名、责任者、摘要检索著录信息' },
    fulltext: { label: '全文检索', hint: '在档案全文（数字化文本）中检索，命中处高亮显示' }
  };

  /* results 为 null 表示尚未检索（首屏给引导，而不是空表格） */
  var state = {
    mode: 'catalog',
    keyword: '',
    facets: { fonds: '', category: '', year: '' },
    results: null,
    selected: {}
  };

  /* -------------------------------------------------------- 检索实现 */

  function catalogText(a) {
    return [a.title, a.archiveNo, a.author, a.summary].join(' ');
  }

  /* 检索框右侧的三个筛选维度：全宗、档案门类、年度 */
  var FACETS = [
    { key: 'fonds', label: '全宗' },
    { key: 'category', label: '档案门类' },
    { key: 'year', label: '年度' }
  ];

  function matchFacets(a) {
    return FACETS.every(function (f) {
      return !state.facets[f.key] || a[f.key] === state.facets[f.key];
    });
  }

  function runSearch() {
    var kw = state.keyword.trim();
    var k = kw.toLowerCase();
    var all = App.mock.ARCHIVE_CATALOG;

    var hits = all.filter(function (a) {
      if (!matchFacets(a)) return false;
      if (!kw) return true;                       // 未输入关键词 = 浏览全部
      if (state.mode === 'catalog') {
        return catalogText(a).toLowerCase().indexOf(k) >= 0;
      }
      return (a.fullText + ' ' + a.title).toLowerCase().indexOf(k) >= 0;
    });

    state.results = hits;
    state.selected = {};
  }

  function options(list, current) {
    return ['<option value="">全部</option>'].concat(list.map(function (v) {
      return '<option value="' + esc(v) + '"' + (current === v ? ' selected' : '') + '>' + esc(v) + '</option>';
    })).join('');
  }

  /** 某维度出现过的取值（按数据出现顺序去重） */
  function distinct(key) {
    var seen = {}, out = [];
    App.mock.ARCHIVE_CATALOG.forEach(function (a) {
      if (a[key] && !seen[a[key]]) { seen[a[key]] = 1; out.push(a[key]); }
    });
    return out;
  }

  /** 下拉选项：门类走规范顺序、年度倒序、其余按出现顺序 */
  function facetOptions(key) {
    var vals = distinct(key);
    if (key === 'category') {
      var order = App.mock.ARCHIVE_CATEGORIES;
      return order.filter(function (c) { return vals.indexOf(c) >= 0; });
    }
    if (key === 'year') return vals.sort().reverse();
    return vals;
  }

  /* ------------------------------------------------------ 高亮与片段 */

  /** 把关键词的**所有**出现处包上 <mark>；先切分再逐段转义，避免转义后再匹配出错 */
  function highlight(text, kw) {
    var t = String(text || '');
    if (!kw) return esc(t);
    var lower = t.toLowerCase(), k = kw.toLowerCase();
    var out = '', from = 0, idx;
    while ((idx = lower.indexOf(k, from)) >= 0) {
      out += esc(t.slice(from, idx)) +
        '<mark class="hit-mark">' + esc(t.slice(idx, idx + kw.length)) + '</mark>';
      from = idx + kw.length;
    }
    return out + esc(t.slice(from));
  }

  /** 截取首个命中处前后的一段文字作为命中片段 */
  function snippet(text, kw, radius) {
    var t = String(text || '');
    var k = String(kw || '');
    if (!k) return esc(t.slice(0, 90)) + (t.length > 90 ? '…' : '');
    var i = t.toLowerCase().indexOf(k.toLowerCase());
    if (i < 0) return esc(t.slice(0, 90)) + (t.length > 90 ? '…' : '');
    var r = radius || 34;
    var start = Math.max(0, i - r);
    var end = Math.min(t.length, i + k.length + r);
    return (start > 0 ? '…' : '') + highlight(t.slice(start, end), k) + (end < t.length ? '…' : '');
  }

  /* ------------------------------------------------------------ 视图 */

  function renderTabs() {
    return '<div class="seg" role="tablist" aria-label="检索方式">' +
      Object.keys(MODES).map(function (m) {
        var on = state.mode === m;
        return '<button type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') + '" ' +
          'class="' + (on ? 'active' : '') + '" data-action="find:mode" data-mode="' + m + '">' +
          esc(MODES[m].label) + '</button>';
      }).join('') +
    '</div>';
  }

  function renderSearchPanel() {
    return '<div class="toolbar">' +
      renderTabs() +
      '<span class="toolbar-note">' + esc(MODES[state.mode].hint) + '</span>' +
    '</div>' +
    '<div class="toolbar">' +
      '<label class="sr-only" for="find-kw">检索关键词</label>' +
      '<input class="input input-inline find-kw" id="find-kw" type="search" ' +
        'placeholder="' + (state.mode === 'catalog' ? '输入关键词，如：教育、水利、商会' : '输入全文中的词句，如：救济、学制') + '" ' +
        'value="' + esc(state.keyword) + '" data-enter="find:search">' +
      '<button type="button" class="btn btn-primary" data-action="find:search">' +
        icon('search') + '搜索</button>' +
      (state.results !== null ?
        '<button type="button" class="btn btn-text" data-action="find:reset">' +
          icon('rotate-ccw') + '重置</button>' : '') +
      '<span class="topbar-sep"></span>' +
      FACETS.map(function (f) {
        return '<label class="sr-only" for="find-' + f.key + '">' + f.label + '</label>' +
          '<select class="select select-inline" id="find-' + f.key + '" ' +
            'data-change="find:facet" data-key="' + f.key + '" title="' + f.label + '">' +
            options(facetOptions(f.key), state.facets[f.key]) + '</select>';
      }).join('') +
    '</div>';
  }

  /** 首屏引导：不自动检索，给出示例词，一次点击即可看到测试数据 */
  function renderIntro() {
    return '<section class="card"><div class="card-body">' +
      U.empty('输入关键词后点击「搜索」', 'search',
        '<div class="suggest-row">' +
          App.mock.SEARCH_SUGGESTIONS.map(function (k) {
            return '<button type="button" class="tag tag-action" data-action="find:suggest" ' +
              'data-kw="' + esc(k) + '">' + esc(k) + '</button>';
          }).join('') +
        '</div>') +
    '</div></section>';
  }

  function selectedIds() {
    return Object.keys(state.selected).filter(function (id) { return state.selected[id]; });
  }

  function selectedArchives() {
    var ids = selectedIds();
    return App.mock.ARCHIVE_CATALOG.filter(function (a) { return ids.indexOf(a.id) >= 0; });
  }

  /** 批量条内容（不含外层容器），便于勾选时就地更新 */
  function batchBarHtml() {
    var n = selectedIds().length;
    if (!n) return '';
    return '<div class="batch-bar">' +
      '已选 <b>' + n + '</b> 件档案' +
      '<button type="button" class="btn btn-sm btn-primary" data-action="find:add">' +
        icon('plus') + '加入素材库</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn-sm btn-text" data-action="find:clear-select">取消选择</button>' +
    '</div>';
  }

  /** 固定在页面里的容器：勾选时只更新这块，不整页重渲染 */
  function renderBatchBar() {
    return '<div id="find-batch">' + batchBarHtml() + '</div>';
  }

  function renderCatalogTable(rows) {
    var body = rows.map(function (a, i) {
      var inLib = S.hasMaterial(a.archiveNo);
      return '<tr' + (state.selected[a.id] ? ' class="selected"' : '') + '>' +
        '<td class="col-check"><input type="checkbox" data-change="find:select" ' +
          'data-id="' + esc(a.id) + '"' + (state.selected[a.id] ? ' checked' : '') +
          (inLib ? ' disabled' : '') +
          ' aria-label="选择 ' + esc(a.title) + '"></td>' +
        '<td class="col-idx tnum">' + (i + 1) + '</td>' +
        '<td class="col-no tnum">' + esc(a.archiveNo) + '</td>' +
        '<td>' + highlight(a.title, state.keyword) + '</td>' +
        '<td class="col-user">' + esc(a.fonds) + '</td>' +
        '<td class="col-cat">' + esc(a.category) + '</td>' +
        '<td class="col-year tnum">' + esc(a.year) + '</td>' +
        '<td class="col-user">' + esc(a.author) + '</td>' +
        '<td class="col-year">' + esc(a.retention) + '</td>' +
        '<td class="col-year">' + esc(a.security) + '</td>' +
        /* 「已在素材库」单独放最右一列，不再挤在题名后面 */
        '<td class="col-lib">' + (inLib ? U.tag('已在素材库', 'tag-ok') : '') + '</td>' +
        /* 每条都能看这条数据的目录与文件（只读） */
        '<td class="col-actions"><button type="button" class="btn btn-sm btn-text" ' +
          'data-action="material:view" data-from="catalog" data-id="' + esc(a.id) + '" ' +
          'title="查看该档案的目录与文件">' + icon('eye') + '查看</button></td>' +
      '</tr>';
    }).join('');

    var allSel = rows.length > 0 && rows.every(function (a) {
      return state.selected[a.id] || S.hasMaterial(a.archiveNo);
    });

    return '<div class="table-scroll"><table class="table">' +
      '<thead><tr>' +
        '<th class="col-check"><input type="checkbox" id="find-check-all" ' +
          'data-change="find:select-all"' + (allSel ? ' checked' : '') +
          ' aria-label="全选当前结果"></th>' +
        '<th class="col-idx">序号</th>' +
        '<th class="col-no">档号</th>' +
        '<th>题名</th>' +
        '<th class="col-user">全宗</th>' +
        '<th class="col-cat">档案门类</th>' +
        '<th class="col-year">年度</th>' +
        '<th class="col-user">责任者</th>' +
        '<th class="col-year">保管期限</th>' +
        '<th class="col-year">密级</th>' +
        '<th class="col-lib">素材库</th>' +
        '<th class="col-actions">操作</th>' +
      '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table></div>';
  }

  function renderFulltextList(rows) {
    var list = rows.map(function (a) {
      var inLib = S.hasMaterial(a.archiveNo);
      return '<div class="result-item' + (state.selected[a.id] ? ' selected' : '') + '">' +
        '<input type="checkbox" data-change="find:select" data-id="' + esc(a.id) + '"' +
          (state.selected[a.id] ? ' checked' : '') + (inLib ? ' disabled' : '') +
          ' aria-label="选择 ' + esc(a.title) + '">' +
        '<div class="ri-main">' +
          '<div class="ri-title">' + highlight(a.title, state.keyword) + '</div>' +
          '<div class="ri-meta">' + esc(a.archiveNo) + '　·　' + esc(a.fonds) + '　·　' +
            esc(a.category) + '　·　' + esc(a.year) + ' 年　·　' + esc(a.author) + '　·　' +
            esc(a.retention) + '</div>' +
          '<div class="ri-snippet">' + snippet(a.fullText, state.keyword) + '</div>' +
        '</div>' +
        /* 右侧只标「已在素材库」；不再显示数字化状态 */
        '<div class="ri-side">' +
          (inLib ? U.tag('已在素材库', 'tag-ok') : '') +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="result-list">' + list + '</div>';
  }

  function render() {
    var out = renderSearchPanel();

    if (state.results === null) return out + renderIntro();

    var rows = state.results;
    if (!rows.length) {
      out += renderBatchBar();
      out += '<section class="card"><div class="card-body">' +
        U.empty('没有命中任何档案', 'search',
          '<button class="btn" data-action="find:reset">' + icon('rotate-ccw') + '重置检索条件</button>') +
        '<div class="data-note">' + icon('info') +
          '<span>当前为<b>' + esc(MODES[state.mode].label) + '</b>，关键词「' + esc(state.keyword || '（空）') + '」。' +
          '换一种检索方式或放宽条件再看看。</span></div>' +
      '</div></section>';
      return out;
    }

    var inLibCount = rows.filter(function (a) { return S.hasMaterial(a.archiveNo); }).length;

    out += renderBatchBar();
    out += '<section class="card">' +
      '<div class="card-head">' +
        '<span>检索结果</span>' +
        '<span class="spacer"></span>' +
        '<span class="head-note">' +
          esc(MODES[state.mode].label) + '　·　共 ' + rows.length + ' 条' +
          (state.keyword ? '　·　关键词「' + esc(state.keyword) + '」' : '　·　未输入关键词，列出全部') +
          (inLibCount ? '　·　其中 ' + inLibCount + ' 条已在素材库' : '') +
        '</span>' +
      '</div>' +
      (state.mode === 'catalog' ? renderCatalogTable(rows) : renderFulltextList(rows)) +
    '</section>';
    return out;
  }

  /* -------------------------------------------------- 加入素材库：标签选择 */

  function openTagPicker() {
    var archives = selectedArchives();
    if (!archives.length) return;

    var dup = archives.filter(function (a) { return S.hasMaterial(a.archiveNo); }).length;
    var tags = S.tagsWithUsage();

    if (!tags.length) {
      U.modal({
        title: '还没有素材标签', width: 520, cancelText: null, okText: '知道了',
        body: '<p>加入素材库前需要先选择素材标签，但当前一个标签都没有。</p>' +
          '<p class="muted" style="font-size:var(--fs-sm)">请先到「编研素材库 / 标签管理」新增标签。</p>'
      });
      return;
    }

    var body =
      '<div class="alert alert-info" role="note">' +
        '<span class="alert-icon">' + icon('info') + '</span><div>' +
        '将把 <b>' + archives.length + '</b> 件档案加入素材库' +
        (dup ? '，其中 <b>' + dup + '</b> 件已在素材库中、会自动跳过' : '') +
        '。请选择素材标签（可多选）。' +
      '</div></div>' +
      '<div class="pick-list">' +
        tags.map(function (t) {
          return '<label class="pick-item">' +
            '<input type="checkbox" name="pick-tag" value="' + esc(t.id) + '">' +
            '<span class="pick-main">' +
              '<span class="pick-name">' + esc(t.name) + '</span>' +
              (t.note ? '<span class="pick-note">' + esc(t.note) + '</span>' : '') +
            '</span>' +
            '<span class="pick-count">已用 ' + t.materialCount + ' 件</span>' +
          '</label>';
        }).join('') +
      '</div>' +
      '<div class="field-extra">标签决定素材在「素材管理」中的筛选方式；选完后可随时在素材管理里更改。</div>';

    U.modal({
      title: '选择素材标签 · 加入素材库',
      width: 640,
      body: body,
      okText: '确认加入',
      cancelText: '取消',
      onOk: function (el) {
        var tagIds = Array.prototype.slice
          .call(el.querySelectorAll('input[name="pick-tag"]:checked'))
          .map(function (c) { return c.value; });
        if (!tagIds.length) {
          U.toast('请至少选择一个标签', 'warn');
          return false;
        }
        var res = S.addMaterials(archives, tagIds);
        var tagNames = tagIds.map(function (id) {
          var t = S.getTag(id);
          return t ? t.name : id;
        }).join('、');

        state.selected = {};
        App.app.render();

        if (res.added.length && !res.skipped.length) {
          U.toast('已将 ' + res.added.length + ' 件档案加入素材库（标签：' + tagNames + '）', 'ok');
        } else if (res.added.length && res.skipped.length) {
          U.toast('已加入 ' + res.added.length + ' 件，' + res.skipped.length + ' 件因已在库中跳过', 'warn');
        } else {
          U.modal({
            title: '未加入任何素材', width: 520, cancelText: null, okText: '知道了',
            body: '<p>所选 ' + res.skipped.length + ' 件档案都已在素材库中，未重复加入。</p>'
          });
        }
        return true;
      }
    });
  }

  /* ------------------------------------------------------------ 交互 */

  function syncSelection() {
    var root = document.getElementById('main');
    if (!root || state.results === null) return;
    var rows = state.results;

    rows.forEach(function (a) {
      var cb = root.querySelector('input[data-change="find:select"][data-id="' + a.id + '"]');
      if (!cb) return;
      var on = !!state.selected[a.id];
      cb.checked = on;
      var box = cb.closest ? cb.closest('tr') || cb.closest('.result-item') : null;
      if (box) box.classList.toggle('selected', on);
    });

    var pickable = rows.filter(function (a) { return !S.hasMaterial(a.archiveNo); });
    var sel = pickable.filter(function (a) { return state.selected[a.id]; }).length;
    var all = root.querySelector('#find-check-all');
    if (all) {
      all.checked = pickable.length > 0 && sel === pickable.length;
      all.indeterminate = sel > 0 && sel < pickable.length;
    }
    var bar = root.querySelector('#find-batch');
    if (bar) bar.innerHTML = batchBarHtml();
  }

  function register() {
    U.register('find:mode', function (ds) {
      if (!MODES[ds.mode] || state.mode === ds.mode) return;
      state.mode = ds.mode;
      // 已检索过就按新方式重跑一遍，避免用户还要再点一次搜索
      if (state.results !== null) runSearch();
      App.app.render();
    });

    U.register('find:search', function () {
      var el = document.getElementById('find-kw');
      state.keyword = el ? el.value.trim() : '';
      runSearch();
      App.app.render();
    });

    U.register('find:suggest', function (ds) {
      state.keyword = ds.kw || '';
      runSearch();
      App.app.render();
    });

    U.register('find:reset', function () {
      state.keyword = '';
      state.facets = { fonds: '', category: '', year: '' };
      state.results = null;
      state.selected = {};
      App.app.render();
    });

    U.register('find:facet', function (ds, el) {
      state.facets[ds.key] = el.value;
      if (state.results !== null) runSearch();   // 已检索过则即时生效
      App.app.render();
    });

    U.register('find:select', function (ds, el) {
      if (el.checked) state.selected[ds.id] = true;
      else delete state.selected[ds.id];
      syncSelection();
    });

    U.register('find:select-all', function (ds, el) {
      (state.results || []).forEach(function (a) {
        if (S.hasMaterial(a.archiveNo)) return;   // 已在库中的不参与全选
        if (el.checked) state.selected[a.id] = true;
        else delete state.selected[a.id];
      });
      syncSelection();
    });

    U.register('find:clear-select', function () {
      state.selected = {};
      syncSelection();
    });

    U.register('find:add', function () { openTagPicker(); });
  }

  /** 挂载后：表头复选框的半选状态 */
  function mount(root) {
    var all = root.querySelector('#find-check-all');
    if (!all || state.results === null) return;
    var pickable = state.results.filter(function (a) { return !S.hasMaterial(a.archiveNo); });
    var sel = pickable.filter(function (a) { return state.selected[a.id]; }).length;
    all.indeterminate = sel > 0 && sel < pickable.length;
  }

  App.pages = App.pages || {};
  App.pages['material/search'] = {
    render: render,
    register: register,
    mount: mount,
    pageClass: 'page-compact'
  };
})(window);
