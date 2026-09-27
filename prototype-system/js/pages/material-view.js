/* ==========================================================================
   素材「查看」：一份只读视图，同时看**目录**和**文件**

   两个入口共用（评审要求：查找素材与素材管理的每一条数据都能查看目录和文件）：
     · 查找素材（档案目录）  data-from="catalog"  → 直接读 App.mock.ARCHIVE_CATALOG
     · 素材管理（素材库）    data-from="library"  → 读素材，再按档号回查档案目录

   目录 = 档案著录信息（档号 / 题名 / 全宗 / 门类 / 年度 / 责任者 / 保管期限 / 密级 / 页数 / 摘要 / 原文摘录）
   文件 = 电子文件（文件名 / 格式 / 大小 / 页数 / 存储位置 / 挂接状态 + 预览占位）

   ⚠️ 原型不附实体扫描件：文件区的元数据是**按档号与页数推导出来的预置数据**，
      界面上明确标注，避免被当成真的挂了文件。生产环境由电子文件中心提供，
      按格式分流渲染（PDF→pdf.js、OFD→阅读器插件）并做密级控制。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  function hash(str) {
    var h = 0;
    for (var i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 9973;
    return h;
  }

  function fmtSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function extOf(name) {
    var m = String(name || '').match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toUpperCase() : '';
  }

  function empty(v) {
    var t = String(v === undefined || v === null ? '' : v).trim();
    return t || '未著录';
  }

  function readRow(label, value, kind) {
    var t = String(value === undefined || value === null ? '' : value).trim();
    var inner = t
      ? (kind === 'long'
        ? '<div class="read-long">' + esc(t) + '</div>'
        : '<div class="read-value">' + esc(t) + '</div>')
      : '<span class="read-empty">未著录</span>';
    return '<div class="form-row">' +
      '<div class="form-label">' + esc(label) + '</div>' +
      '<div class="form-field">' + inner + '</div>' +
    '</div>';
  }

  /**
   * 把两个入口的数据归一成同一种视图对象
   * @param {string} from 'catalog' | 'library'
   * @param {string} id
   */
  function resolve(from, id) {
    var cat = null, material = null;
    if (from === 'library') {
      material = S.getMaterial(id);
      if (!material) return null;
      cat = S.catalogByArchiveNo(material.archiveNo);
    } else {
      cat = (App.mock.ARCHIVE_CATALOG || []).filter(function (a) { return a.id === id; })[0] || null;
      if (!cat) return null;
      material = S.materials().filter(function (m) { return m.archiveNo === cat.archiveNo; })[0] || null;
    }
    var pages = (cat && cat.pages) || (material && material.pages) || 0;
    var digitized = cat ? !!cat.digitized : true;
    return {
      from: from,
      material: material,
      catalog: cat,
      archiveNo: (cat && cat.archiveNo) || (material && material.archiveNo) || '',
      title: (material && material.title) || (cat && cat.title) || '',
      fonds: (cat && cat.fonds) || (material && material.fonds) || '',
      category: cat ? cat.category : '',
      year: (cat && cat.year) || (material && material.year) || '',
      author: cat ? cat.author : '',
      retention: cat ? cat.retention : '',
      security: cat ? cat.security : '',
      pages: pages,
      digitized: digitized,
      summary: cat ? cat.summary : '',
      fullText: cat ? cat.fullText : '',
      note: material ? (material.note || '') : (cat ? (cat.summary || '') : ''),
      tagIds: material ? (material.tagIds || []) : [],
      addedAt: material ? material.addedAt : '',
      addedBy: material ? material.addedBy : '',
      inLibrary: !!material,
      file: material && material.file ? material.file : null,
      files: material ? material.files : (cat ? cat.files : null),
      material: material || null
    };
  }

  /** 电子文件的展示元数据：有上传记录就用上传的，否则按档号与页数推导（预置） */
  function fileMeta(v) {
    if (!v.digitized) {
      return {
        name: '—', format: '—', size: '—', pages: v.pages ? String(v.pages) : '—',
        path: '—', linked: false,
        note: '该档案尚未数字化：只有纸质件，尚无电子文件可挂接。'
      };
    }
    if (v.file) {
      var pages = v.pages || Math.max(1, Math.round((v.file.size || 0) / 380000));
      return {
        name: v.file.name,
        format: extOf(v.file.name) || '未知',
        size: fmtSize(v.file.size),
        pages: String(pages),
        path: '电子文件中心 /' + (v.fonds || '未编全宗') + '/' + (v.year || '未编年度') + '/' + v.archiveNo + '/',
        linked: true,
        note: '文件为「新增素材」时选择的本机文件，原型只记录文件名与大小（不保存内容）。'
      };
    }
    var pages2 = v.pages || (3 + (hash(v.archiveNo) % 18));
    var perPage = 0.28 + (hash(v.archiveNo + 's') % 5) / 100;      // 0.28–0.32 MB/页
    return {
      name: v.archiveNo + '_' + (v.title || '未命名') + '.pdf',
      format: 'PDF',
      size: (pages2 * perPage).toFixed(1) + ' MB',
      pages: String(pages2),
      path: '电子文件中心 /' + (v.fonds || '未编全宗') + '/' + (v.year || '未编年度') + '/' + v.archiveNo + '/',
      linked: true,
      note: '预置的电子文件元数据（按档号与页数推导），原型不含实体扫描件。'
    };
  }

  function tagsText(ids) {
    if (!ids.length) return '<span class="read-empty">未打标签</span>';
    return ids.map(function (id) {
      var t = S.tags().filter(function (x) { return x.id === id; })[0];
      return U.tag(t ? t.name : id, '');
    }).join(' ');
  }

  function open(from, id, opts) {
    opts = opts || {};
    var v = resolve(from, id);
    if (!v) { U.toast('找不到该数据的目录信息', 'warn'); return; }
    var f = fileMeta(v);
    var title = from === 'library' ? '查看素材' : '查看档案';

    var catalogBlock =
      '<div class="mv-sec">' +
        '<div class="mv-sec-head">' + icon('folder') + '目录 · 档案著录信息</div>' +
        '<div class="form-table form-table-read">' +
          (v.archiveNo ? readRow('档号', v.archiveNo) : '') +
          readRow('题名', v.title, 'long') +
          (v.from === 'library' ? readRow('备注', v.note, 'long') : '') +
          readRow('全宗', v.fonds) +
          readRow('档案门类', v.category) +
          readRow('年度', v.year) +
          readRow('责任者', v.author) +
          readRow('保管期限', v.retention) +
          readRow('密级', v.security) +
          readRow('页数', v.pages ? v.pages + ' 页' : '') +
          readRow('数字化状态', v.digitized ? '已数字化' : '未数字化') +
          readRow('内容摘要', v.summary, 'long') +
          readRow('原文摘录', v.fullText, 'long') +
          (v.from === 'library'
            ? '<div class="form-row"><div class="form-label">素材标签</div>' +
                '<div class="form-field">' + tagsText(v.tagIds) + '</div></div>' +
              readRow('加入素材库', v.addedAt ? App.util.fmtDateTime(v.addedAt) + '　·　' + v.addedBy : '')
            : '') +
          /* 从选材库进来时，额外说明"这条选材只选了文件的哪一部分" */
          (opts.scopeText
            ? '<div class="form-row"><div class="form-label">本次选入</div>' +
                '<div class="form-field"><div class="read-value">' + esc(opts.scopeText) +
                '</div></div></div>'
            : '') +
        '</div>' +
        (v.from === 'library' && !v.catalog
          ? '<div class="data-note">' + icon('info') +
              '<span>' + (v.archiveNo
                ? '档号 <b>' + esc(v.archiveNo) + '</b> 未在档案目录中匹配到著录信息，只显示素材库自身的字段。' +
                  '若该档号确在馆藏中，需等档案目录同步后才会补齐。'
                : '这条素材是<b>手工新增</b>的（没有档号），因此没有对应的档案目录著录信息，' +
                  '只显示素材库自身的字段。') + '</span></div>'
          : '') +
      '</div>';

    /* 一条条目下可能有多份文件（评审要求）：逐份列出来，预览只对第 1 份做示意 */
    var fileList = v.digitized
      ? S.materialFileList({
          id: '', archiveNo: v.archiveNo, title: v.title, file: v.file,
          files: v.files, pages: v.pages
        })
      : [];
    var multiFiles = fileList.length > 1;
    var fileBlock =
      '<div class="mv-sec">' +
        '<div class="mv-sec-head">' + icon('file-text') + '文件 · 电子文件' +
          (multiFiles ? '<span class="mv-sec-note">共 ' + fileList.length + ' 份文件</span>' : '') + '</div>' +
        (multiFiles
          ? '<div class="table-scroll"><table class="table mv-file-table">' +
              '<thead><tr><th class="col-idx">序号</th><th>文件名</th>' +
                '<th class="col-cat">格式</th><th class="col-pages">页数</th><th>说明</th></tr></thead>' +
              '<tbody>' + fileList.map(function (x) {
                return '<tr><td class="col-idx tnum">' + x.no + '</td>' +
                  '<td>' + esc(x.name) + '</td>' +
                  '<td>' + esc(extOf(x.name) || '—') + '</td>' +
                  '<td class="tnum">' + (x.pages ? x.pages + ' 页' : '—') + '</td>' +
                  '<td>' + esc(x.note || '') + '</td></tr>';
              }).join('') + '</tbody></table></div>'
          : '<div class="form-table form-table-read">' +
              readRow('文件名', f.name) +
              readRow('文件格式', f.format) +
              readRow('文件大小', f.size) +
              readRow('页数', f.pages === '—' ? '' : f.pages + ' 页') +
              readRow('存储位置', f.path, 'long') +
              readRow('挂接状态', f.linked ? '已挂接' : '未挂接') +
            '</div>') +
        (multiFiles
          ? '<div class="data-note">' + icon('info') + '<span>这条素材条目下有 <b>' + fileList.length +
            '</b> 份文件；加入选材库时按**文件**选，页码也按所选文件的页数校验。存储位置：' +
            esc(f.path) + '</span></div>'
          : '') +
        '<div class="mv-preview">' +
          '<div class="mv-preview-head">' +
            '<span>' + icon('eye') + '文件预览</span>' +
            '<span class="spacer"></span>' +
            U.tag(f.linked ? '预置结果' : '无电子文件', f.linked ? 'tag-warn' : '') +
          '</div>' +
          '<div class="mv-preview-body">' +
            (f.linked
              ? '<div class="mv-page">' + esc((v.title || '').slice(0, 18)) + '…<br>' +
                  '<span class="muted">第 1 页 / 共 ' + esc(f.pages) + ' 页（示意）</span></div>' +
                '<div class="mv-preview-note">' + esc(f.note) + '<br>' +
                  '生产环境按格式分流渲染（PDF → pdf.js，OFD → 阅读器插件），并按密级控制可浏览终端。</div>'
              : '<div class="mv-preview-note">' + esc(f.note) + '</div>') +
          '</div>' +
        '</div>' +
      '</div>';

    U.modal({
      title: title + ' · ' + (v.title || v.archiveNo),
      width: 900,
      body: catalogBlock + fileBlock +
        '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
          '<span>本页为<b>只读查看</b>：目录与文件都是这条数据的附属信息，不在这里修改。' +
          (v.inLibrary ? '该档号已在素材库中。' : '该档号尚未加入素材库。') + '</span>' +
        '</div>',
      okText: '关闭',
      cancelText: null
    });
  }

  function register() {
    U.register('material:view', function (ds) { open(ds.from, ds.id); });
  }

  App.materialView = { open: open, register: register };
})(window);
