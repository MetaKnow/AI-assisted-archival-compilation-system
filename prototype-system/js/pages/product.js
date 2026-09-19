/* ==========================================================================
   页面：编研成果

   对应设计文档「编研成果」：
     用来展示编研成果，以封面图的形式展现，并显示选题名称。
     点击封面图可以打开编研成果文件，在线浏览或下载。

   原型处理：
     · **封面用 CSS 依据成果元数据绘制**，不依赖任何图片文件（离线可用、可随数据变化）；
       封面的强调色取该成果的「编研类型」配色，与工作台的类型统计同一套色。
     · 「在线浏览」用结构化摘要模拟打开成果文件：封面 + 著录 + 目录模板 + 内容简介，
       并注明生产环境用 pdf.js / OFD 阅读器渲染正式成品。
     · 「下载」**是真下载**：浏览器端生成一份自包含 HTML 成果文件（Blob）并落盘，
       生产环境换成 PDF / OFD 正式成品。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = { type: '', keyword: '' };

  /** 成果的封面强调色：沿用编研类型的配色（与工作台图表同源） */
  function coverColor(type) {
    return App.mock.TYPE_COLORS[type] || '#036e9a';
  }

  function visibleProducts() {
    var kw = state.keyword.trim().toLowerCase();
    return S.products().filter(function (p) {
      if (state.type && p.type !== state.type) return false;
      if (kw && (p.title + ' ' + p.type + ' ' + p.compiledBy).toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
  }

  function tocOf(p) {
    return App.mock.PRODUCT_TOC[p.type] || ['目录'];
  }

  /* ------------------------------------------------------------ 封面 */

  function coverHtml(p, size) {
    var color = coverColor(p.type);
    return '<span class="cover' + (size ? ' cover-' + size : '') + '" style="--cover-accent:' + esc(color) + '">' +
      '<span class="cover-spine"></span>' +
      '<span class="cover-top"></span>' +
      '<span class="cover-body">' +
        '<span class="cover-kicker">' + esc(p.type) + '</span>' +
        '<span class="cover-title">' + esc(p.title) + '</span>' +
        '<span class="cover-rule"></span>' +
        '<span class="cover-org">' + esc(p.compiledBy) + '　编</span>' +
        '<span class="cover-year">' + esc(String(p.publishedAt).slice(0, 4)) + '</span>' +
      '</span>' +
    '</span>';
  }

  /* ------------------------------------------------------------ 列表 */

  function renderToolbar() {
    var total = S.products().length;
    var shown = visibleProducts().length;
    var types = App.mock.ARCHIVE_CATEGORIES ? null : null;   // 占位：类型取自成果自身
    var typeList = [];
    App.mock.PRODUCTS.concat(S.products()).forEach(function (p) {
      if (typeList.indexOf(p.type) < 0) typeList.push(p.type);
    });
    // 按工作台的类型顺序排列，保证与统计口径一致
    var order = App.mock.WORKBENCH.chartTaskType.map(function (x) { return x.label; });
    typeList = order.filter(function (t) { return typeList.indexOf(t) >= 0; });

    var options = ['<option value="">全部类型</option>'].concat(typeList.map(function (t) {
      var n = S.products().filter(function (p) { return p.type === t; }).length;
      return '<option value="' + esc(t) + '"' + (state.type === t ? ' selected' : '') + '>' +
        esc(t) + '（' + n + '）</option>';
    })).join('');

    var formats = {};
    S.products().forEach(function (p) {
      (p.formats || []).forEach(function (f) { formats[f] = (formats[f] || 0) + 1; });
    });

    return '<div class="toolbar">' +
      '<span class="toolbar-note">共 ' + total + ' 部编研成果' +
        (shown === total ? '' : '，当前筛选出 ' + shown + ' 部') +
        '　·　' + Object.keys(formats).map(function (f) { return f + ' ' + formats[f]; }).join('　') + '</span>' +
      '<span class="spacer"></span>' +
      '<label class="sr-only" for="cp-type">按编研类型筛选</label>' +
      '<select class="select select-inline" id="cp-type" data-change="cp:filter">' + options + '</select>' +
      '<label class="sr-only" for="cp-kw">搜索成果名称或编纂单位</label>' +
      '<input class="input input-inline" id="cp-kw" type="search" placeholder="搜索成果名称 / 编纂单位" ' +
        'value="' + esc(state.keyword) + '" data-enter="cp:search">' +
      '<button type="button" class="btn" data-action="cp:search">' + icon('search') + '搜索</button>' +
      ((state.keyword || state.type) ?
        '<button type="button" class="btn btn-text" data-action="cp:clear-filter">重置</button>' : '') +
    '</div>';
  }

  function productCard(p) {
    var task = p.taskId ? S.getTask(p.taskId) : null;
    return '<article class="product-card">' +
      '<button type="button" class="cover-btn" data-action="cp:open" data-id="' + esc(p.id) + '" ' +
        'aria-label="打开成果：' + esc(p.title) + '">' + coverHtml(p) + '</button>' +
      '<div class="product-info">' +
        /* 名称不换行：一行显示不全时省略号收尾，悬浮/聚焦用气泡显示完整名称 */
        '<button type="button" class="product-title bubble" data-action="cp:open" data-id="' + esc(p.id) + '" ' +
          'data-full="' + esc(p.title) + '">' +
          '<span class="product-title-text">' + esc(p.title) + '</span>' +
        '</button>' +
        /* 封面下方只留「类型 + 发布日期」：字数与成果格式在成果详情里看
           （评审意见：卡片上这两项信息冗余） */
        '<div class="product-sub">' +
          U.tag(p.type, 'tag-accent') +
          '<span class="tnum">' + esc(p.publishedAt) + '</span>' +
        '</div>' +
        /* 关联任务：显示任务名称（评审要求），过长同样单行省略 + 悬浮气泡 */
        (task
          ? '<div class="product-task bubble" data-full="关联任务：' + esc(task.topicName) + '">' +
              '<span class="product-task-label">关联任务</span>' +
              '<span class="product-task-name">' + esc(task.topicName) + '</span>' +
            '</div>'
          : '') +
        /* 来源任务不在卡片上显示（评审意见），只在成果详情里体现 */
        '<div class="product-actions">' +
          '<button type="button" class="btn btn-sm" data-action="cp:view" data-id="' + esc(p.id) + '">' +
            icon('eye') + '在线浏览</button>' +
          '<button type="button" class="btn btn-sm" data-action="cp:download" data-id="' + esc(p.id) + '">' +
            icon('download') + '下载</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function render() {
    var rows = visibleProducts();
    return '' +
      renderToolbar() +
      (rows.length
        ? '<div class="product-grid">' + rows.map(productCard).join('') + '</div>'
        : '<section class="card"><div class="card-body">' + U.empty(
            (state.keyword || state.type) ? '没有符合条件的成果' : '还没有编研成果',
            'book-open',
            (state.keyword || state.type)
              ? '<button class="btn" data-action="cp:clear-filter">' + icon('rotate-ccw') + '清除筛选</button>'
              : '<button class="btn btn-primary" data-action="cp:goto-task">' + icon('clipboard-list') +
                '去编研任务发布成果</button>'
          ) + '</div></section>');
  }

  /* -------------------------------------------------- 打开 / 浏览 / 下载 */

  function metaHtml(p) {
    var mine = p.taskId ? S.getTask(p.taskId) : null;
    var siblings = mine ? S.productsOfTask(mine.id).filter(function (x) { return x.id !== p.id; }) : [];
    return '<dl class="desc">' +
      '<dt>成果名称</dt><dd>' + esc(p.title) + '</dd>' +
      '<dt>编研类型</dt><dd>' + esc(p.type) + '</dd>' +
      '<dt>编纂单位</dt><dd>' + esc(p.compiledBy) + '</dd>' +
      '<dt>发布日期</dt><dd class="tnum">' + esc(p.publishedAt) + '</dd>' +
      '<dt>成果字数</dt><dd class="tnum">' + App.util.fmtInt(p.words) + ' 字</dd>' +
      '<dt>成果格式</dt><dd>' + esc((p.formats || []).join(' / ')) + '</dd>' +
      '<dt>密级</dt><dd>' + esc(p.security) + '</dd>' +
      '<dt>内容简介</dt><dd>' + (p.summary ? esc(p.summary) : '<span class="muted">未填写</span>') + '</dd>' +
      /* 关联任务名称放在内容简介之后（评审意见） */
      (mine ? '<dt>关联任务</dt><dd>' + esc(mine.topicName) +
        '　<span class="tnum muted">' + esc(mine.id) + '</span>' +
        (siblings.length
          ? '<div class="field-extra">同一任务的其它成果：' +
            siblings.map(function (x) { return esc(x.title); }).join('、') + '</div>'
          : '') + '</dd>' : '') +
    '</dl>';
  }

  function openProduct(p) {
    U.modal({
      title: '成果 · ' + p.title,
      width: 780,
      cancelText: null,
      okText: '关闭',
      body:
        '<div class="product-open">' +
          '<div class="product-open-cover">' + coverHtml(p, 'sm') + '</div>' +
          '<div class="product-open-main">' + metaHtml(p) + '</div>' +
        '</div>' +
        '<div class="hstack" style="margin-top:var(--s4)">' +
          '<button type="button" class="btn btn-primary" data-action="cp:view" data-id="' + esc(p.id) + '">' +
            icon('eye') + '在线浏览</button>' +
          '<button type="button" class="btn" data-action="cp:download" data-id="' + esc(p.id) + '">' +
            icon('download') + '下载成果文件</button>' +
        '</div>'
    });
  }

  /** 在线浏览：用一页"成品预览"模拟打开成果文件 */
  function openViewer(p) {
    var toc = tocOf(p);
    var body =
      '<div class="viewer">' +
        '<div class="viewer-page">' +
          coverHtml(p, 'sm') +
          '<div class="viewer-caption">封面</div>' +
        '</div>' +
        '<div class="viewer-main">' +
          '<h3 style="margin-bottom:var(--s2)">' + esc(p.title) + '</h3>' +
          '<div class="muted" style="font-size:var(--fs-xs);line-height:1.8">' +
            esc(p.compiledBy) + '　编　·　' + esc(p.publishedAt) + '　·　' +
            esc(p.type) + '　·　' + App.util.fmtWan(p.words, 1) + ' 万字</div>' +
          (p.summary ? '<p class="viewer-summary">' + esc(p.summary) + '</p>' : '') +
          '<div class="field-label" style="margin-top:var(--s4)">目录</div>' +
          '<ol class="viewer-toc">' + toc.map(function (item, i) {
            return '<li><span class="toc-no">' + (i + 1) + '</span>' + esc(item) + '</li>';
          }).join('') + '</ol>' +
          '<div class="viewer-note">' + icon('info') +
            '<span>原型以结构化摘要模拟成品阅读。生产环境：PDF 走 pdf.js 渲染，OFD 走阅读器插件，' +
            '支持翻页、缩放与全文定位；密级为「内部」的成果仅在有权限的内网终端可浏览。</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    U.modal({
      title: '在线浏览 · ' + p.title,
      width: 920,
      cancelText: null,
      okText: '关闭',
      body: body
    });
  }

  /* ------------------------------------------------------------ 下载 */

  /** 生成自包含 HTML 成果文件（含封面样式），浏览器端真实落盘 */
  function exportHtml(p) {
    var toc = tocOf(p);
    var color = coverColor(p.type);
    return '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
      '<title>' + esc(p.title) + '</title>\n<style>\n' +
      'body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#020617;' +
      'background:#f8fafc;margin:0;padding:40px;line-height:1.8}\n' +
      '.wrap{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;padding:40px}\n' +
      '.cover{position:relative;width:220px;height:294px;background:#fbf9f4;border:1px solid #e7e0d2;' +
      'margin:0 auto 28px;overflow:hidden}\n' +
      '.spine{position:absolute;left:0;top:0;bottom:0;width:6px;background:' + color + '}\n' +
      '.top{position:absolute;left:6px;right:0;top:0;height:14px;background:#0f172a}\n' +
      '.cbody{position:absolute;left:6px;right:0;top:14px;bottom:0;padding:18px 16px;display:flex;flex-direction:column}\n' +
      '.kicker{font-size:10px;letter-spacing:.12em;color:#475569}\n' +
      '.ctitle{font-family:Songti SC,SimSun,serif;font-size:17px;font-weight:600;color:#0f172a;margin-top:10px;line-height:1.5}\n' +
      '.rule{height:2px;width:28px;background:' + color + ';margin:12px 0 auto}\n' +
      '.org{font-size:10px;color:#475569}\n' +
      '.year{font-family:Songti SC,SimSun,serif;font-size:13px;color:#334155}\n' +
      'h1{font-size:22px;text-align:center;margin:0 0 6px}\n' +
      '.sub{text-align:center;color:#475569;font-size:13px;margin-bottom:28px}\n' +
      'dt{float:left;clear:left;width:88px;color:#475569;font-size:13px}\n' +
      'dd{margin:0 0 8px 96px;font-size:14px}\n' +
      'ol{padding-left:22px}ol li{margin:6px 0;font-family:Songti SC,SimSun,serif}\n' +
      '.note{margin-top:32px;padding-top:16px;border-top:1px dashed #e2e8f0;color:#475569;font-size:12px}\n' +
      '</style>\n</head>\n<body>\n<div class="wrap">\n' +
      '<div class="cover"><div class="spine"></div><div class="top"></div>' +
      '<div class="cbody"><div class="kicker">' + esc(p.type) + '</div>' +
      '<div class="ctitle">' + esc(p.title) + '</div><div class="rule"></div>' +
      '<div class="org">' + esc(p.compiledBy) + '　编</div>' +
      '<div class="year">' + esc(String(p.publishedAt).slice(0, 4)) + '</div></div></div>\n' +
      '<h1>' + esc(p.title) + '</h1>\n' +
      '<div class="sub">' + esc(p.compiledBy) + '　编　·　' + esc(p.publishedAt) + '　·　' + esc(p.type) + '</div>\n' +
      '<dl>' +
        '<dt>成果字数</dt><dd>' + App.util.fmtInt(p.words) + ' 字</dd>' +
        '<dt>成果格式</dt><dd>' + esc((p.formats || []).join(' / ')) + '</dd>' +
        '<dt>密级</dt><dd>' + esc(p.security) + '</dd>' +
        '<dt>内容简介</dt><dd>' + (p.summary ? esc(p.summary) : '—') + '</dd>' +
      '</dl>\n' +
      '<h2 style="font-size:16px;margin:28px 0 8px">目录</h2>\n<ol>' +
        toc.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
      '</ol>\n' +
      '<div class="note">本文件由「档案辅助编研系统」原型导出，用于演示下载流程；' +
      '内容为结构化摘要，非正式成品。生产环境导出的为 PDF / OFD / HTML 正式成果文件。</div>\n' +
      '</div>\n</body>\n</html>\n';
  }

  function download(p) {
    try {
      var blob = new Blob([exportHtml(p)], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = p.title + '（成果摘要）.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      U.toast('已生成成果文件：' + a.download, 'ok');
    } catch (e) {
      U.toast('当前浏览器不支持直接下载：' + e.message, 'err');
    }
  }

  /* ------------------------------------------------------------ 交互 */

  function register() {
    U.register('cp:open', function (ds) {
      var p = S.getProduct(ds.id);
      if (p) openProduct(p);
    });
    U.register('cp:view', function (ds) {
      var p = S.getProduct(ds.id);
      if (p) { U.closeTop(); openViewer(p); }
    });
    U.register('cp:download', function (ds) {
      var p = S.getProduct(ds.id);
      if (p) download(p);
    });
    U.register('cp:filter', function (ds, el) {
      state.type = el.value;
      App.app.render();
    });
    U.register('cp:search', function () {
      var el = document.getElementById('cp-kw');
      state.keyword = el ? el.value : '';
      App.app.render();
    });
    U.register('cp:clear-filter', function () {
      state.type = '';
      state.keyword = '';
      App.app.render();
    });
    U.register('cp:goto-task', function () { App.router.navigate('#/task'); });
  }

  App.pages = App.pages || {};
  App.pages.product = {
    render: render,
    register: register,
    pageClass: 'page-compact'
  };
})(window);
