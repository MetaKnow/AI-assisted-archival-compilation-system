/* ==========================================================================
   审核校定 · 「校定内容」全屏界面

   评审要求：在「一键全部审核」右侧点「校定内容」，**浏览器内部全屏**打开，三栏：
     · 左 20%：大纲导航（每章显示命中数；点章节＝跳到该章第一处命中）
     · 中 60%：**编研成果校定** —— 分页阅读 + 点命中项跳到命中所在页并标黄；
                **正文按段落块直接可编辑**（点一下就能改，失焦即保存，不是"先点编辑按钮"）
     · 右 20%：审核结果命中项（政治性 / 专业性 / 合规性三类），状态筛选 + AI 自动修改 / 忽略
               状态口径统一为 未校定 / 已校定 / 已忽略；AI 自动修改完即为「已校定」

   分页模型：把各章正文按大纲顺序拼成一份文档，按固定字数切页；段落块只属于一个章节，
   所以"直接编辑某一段"能精确写回那一章的正文。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var PAGE_SIZE = 420;          /* 每页字数（原型按字数分页，便于"跳到命中所在页"可验证） */
  var KINDS = ['political', 'professional', 'compliance'];

  var state = {
    taskId: null,
    chapterId: null,            /* 左侧选中的章节 */
    hitKey: null,               /* 当前定位的命中项 `${kind}:${id}` */
    page: 1,
    editing: false,             /* 兼容旧字段（中栏现在一直是直接编辑） */
    status: '',                 /* 右栏状态筛选：'' 全部 / open 未校定 / fixed 已校定 / ignored 已忽略 */
    filter: ''                  /* 右栏按审核类别筛选（空＝全部） */
  };

  function open() { return !!(state.taskId && document.getElementById('calibrate-screen')); }

  function nodes() { return S.outlineOf(state.taskId).nodes || []; }

  function chapters() {
    var rec = S.composeOf(state.taskId);
    return nodes().map(function (n) {
      var ch = rec.chapters[n.id] || {};
      return { id: n.id, title: n.title, text: String(ch.text || '') };
    });
  }

  function allItems() {
    var out = [];
    KINDS.forEach(function (k) {
      (S.auditItems(state.taskId, k) || []).forEach(function (it) {
        out.push(it);
      });
    });
    return out;
  }

  function itemByKey(key) {
    if (!key) return null;
    var parts = key.split(':');
    var kind = parts[0], id = parts.slice(1).join(':');
    return (S.auditItems(state.taskId, kind) || []).filter(function (x) { return x.id === id; })[0] || null;
  }

  function hitsOfChapter(chapterId) {
    return allItems().filter(function (it) { return it.chapterId === chapterId; });
  }

  /* ---------------------------------------------------- 文档与分页模型 */

  /**
   * 把各章拼成一份文档，并按固定字数切成**段落块**（每块只属于一个章节）。
   * 这样中栏可以逐块 contenteditable 直接编辑：改哪块就按 (chapterId, localStart, localEnd)
   * 写回那一章的正文，不用猜"这一页的文字属于谁"。
   */
  function buildDoc() {
    var text = '';
    var blocks = [];
    var chapterStart = {};
    chapters().forEach(function (c, i) {
      var pieces = [];
      pieces.push({ kind: 'heading', text: (i + 1) + '. ' + c.title + '\n' });
      if (c.text) pieces.push({ kind: 'body', text: c.text.replace(/\s+$/, '') + '\n\n' });
      pieces.forEach(function (p) {
        if (p.kind === 'body') chapterStart[c.id] = text.length;
        /* 正文按 PAGE_SIZE 切成多块（标题不切） */
        if (p.kind === 'body' && p.text.length > PAGE_SIZE) {
          var local = 0;
          while (local < p.text.length) {
            var seg = p.text.slice(local, local + PAGE_SIZE);
            blocks.push({ chapterId: c.id, kind: 'body', text: seg,
              start: text.length, end: text.length + seg.length,
              localStart: local, localEnd: local + seg.length });
            text += seg;
            local += seg.length;
          }
        } else {
          blocks.push({ chapterId: c.id, kind: p.kind, text: p.text,
            start: text.length, end: text.length + p.text.length });
          if (p.kind === 'body') {
            var last = blocks[blocks.length - 1];
            last.localStart = 0;
            last.localEnd = p.text.length;
          }
          text += p.text;
        }
      });
    });
    return { text: text, blocks: blocks, chapterStart: chapterStart,
      pages: Math.max(1, Math.ceil(text.length / PAGE_SIZE)) };
  }

  function pageOfOffset(doc, offset) {
    return Math.min(doc.pages, Math.floor(Math.max(0, offset) / PAGE_SIZE) + 1);
  }

  function hitOffset(doc, it) {
    var base = doc.chapterStart[it.chapterId];
    if (base == null) return -1;
    return base + it.start;
  }

  /* ---------------------------------------------------- 中栏：分页预览 */

  function renderPage(doc, pageNo) {
    var from = (pageNo - 1) * PAGE_SIZE;
    var to = Math.min(doc.text.length, from + PAGE_SIZE);
    var segs = doc.blocks.filter(function (b) {
      return b.end > from && b.start < to;
    });
    var hit = itemByKey(state.hitKey);

    var html = segs.map(function (b) {
      var s0 = Math.max(b.start, from), e0 = Math.min(b.end, to);
      var part = doc.text.slice(s0, e0);
      /* 标黄：**只标黄当前定位的那一处**（评审口径）。
         ⚠️ 这里曾经把"本页所有命中项"都标黄 —— 一页上有 4 处命中时，点了其中一处会同时黄 4 处，
            看不出"点的是哪一处"；现在只标 state.hitKey 那一项（没有定位就都不标，命中项在右栏列着）。 */
      var marks = allItems().filter(function (it) {
        if (it.chapterId !== b.chapterId) return false;
        if (!state.hitKey || state.hitKey !== it.kind + ':' + it.id) return false;
        var o = hitOffset(doc, it);
        return o >= s0 && o < e0;
      }).sort(function (a, b2) { return hitOffset(doc, a) - hitOffset(doc, b2); });
      var inner = '';
      var at = s0;
      marks.forEach(function (it) {
        var ms = Math.max(hitOffset(doc, it), at);
        var me = Math.min(hitOffset(doc, it) + (it.end - it.start), e0);
        if (me <= at) return;
        inner += esc(doc.text.slice(at, ms));
        inner += '<mark class="cal-mark' +
          (state.hitKey === it.kind + ':' + it.id ? ' cal-mark-active' : '') + '" data-hit="' +
          esc(it.kind + ':' + it.id) + '">' + esc(doc.text.slice(ms, me)) + '</mark>';
        at = me;
      });
      inner += esc(doc.text.slice(at, e0));
      /* 正文块可以直接编辑；标题块只读 */
      var editable = b.kind === 'body';
      return '<div class="cal-seg' + (editable ? ' cal-seg-body' : ' cal-seg-head') + '"' +
        (editable
          ? ' contenteditable="true" spellcheck="false" data-chapter="' + esc(b.chapterId) + '"' +
            ' data-local-start="' + (b.localStart + (s0 - b.start)) + '"' +
            ' data-local-end="' + (b.localStart + (e0 - b.start)) + '"'
          : '') + '>' + inner + '</div>';
    }).join('');

    return '<div class="cal-page" data-page="' + pageNo + '" id="cal-page-' + pageNo + '">' +
      '<div class="cal-page-text" id="cal-page-text-' + pageNo + '">' + html + '</div>' +
      '<div class="cal-page-foot">第 ' + pageNo + ' 页 / 共 ' + doc.pages + ' 页　·　' +
        '正文可直接编辑（点一下就能改，离开输入框即保存）</div>' +
    '</div>';
  }

  function renderMiddleBody(doc) {
    return renderPage(doc, state.page);
  }

  function renderMiddleSection(doc) {
    var c = chapters().filter(function (x) { return x.id === state.chapterId; })[0];
    return '<section class="cp-col cal-preview">' +
      '<div class="cp-col-head">' + icon('book-open') + '编研成果校定' +
        '<span class="spacer"></span>' +
        '<span class="cal-hint">' + (c ? esc(c.title) : '未选章节') + '　·　共 ' + doc.pages +
          ' 页　·　正文可直接编辑，失焦即保存</span>' +
      '</div>' +
      '<div class="cp-col-body cal-preview-body" id="cal-middle">' + renderMiddleBody(doc) + '</div>' +
    '</section>';
  }

  /* ---------------------------------------------------- 左栏：大纲导航 */

  function renderNav() {
    var list = nodes();
    if (!list.length) {
      return '<div class="cal-empty">' + icon('info') + '<div>这个任务还没有大纲。</div></div>';
    }
    return '<div class="cp-tree">' + list.map(function (n) {
      var hits = hitsOfChapter(n.id);
      var open = hits.filter(function (h) { return h.status === 'open'; }).length;
      return '<button type="button" class="cp-node lv' + n.level +
          (n.id === state.chapterId ? ' active' : '') + '" data-action="cal:chapter" data-id="' + esc(n.id) + '" ' +
          'title="' + esc(n.title) + (hits.length ? '（命中 ' + hits.length + ' 处）' : '') + '">' +
          '<span class="cp-title">' + esc(n.title) + '</span>' +
          (hits.length ? '<span class="cal-badge' + (open ? ' cal-badge-open' : '') + '">' +
            hits.length + '</span>' : '') +
        '</button>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------- 右栏：命中项 */

  function renderItem(it) {
    var doc = buildDoc();
    var active = state.hitKey === it.kind + ':' + it.id;
    var actions = '';
    if (it.status === 'open') {
      if (it.suggestion) {
        actions += '<button type="button" class="btn btn-sm btn-primary" data-action="cal:autofix" ' +
          'data-kind="' + esc(it.kind) + '" data-id="' + esc(it.id) + '">' + icon('wand') + 'AI 自动修改</button>';
      }
      actions += '<button type="button" class="btn btn-sm" data-action="cal:mark" ' +
        'data-kind="' + esc(it.kind) + '" data-id="' + esc(it.id) + '">' + icon('check') + '标注已修改</button>';
      actions += '<button type="button" class="btn btn-sm btn-text" data-action="cal:ignore" ' +
        'data-kind="' + esc(it.kind) + '" data-id="' + esc(it.id) + '">忽略</button>';
    }
    /* 状态统一用「未校定 / 已校定 / 已忽略」三个口径（评审要求），与主面板一致 */
    var statusTag = U.tag(STATUS_LABEL[it.status] || it.status,
      it.status === 'fixed' ? 'tag-ok' : (it.status === 'open' ? 'tag-warn' : ''));
    var where = '第 ' + pageOfOffset(doc, hitOffset(doc, it)) + ' 页';
    return '<div class="cal-item' + (active ? ' cal-item-active' : '') +
        (it.status === 'open' ? '' : ' cal-item-' + it.status) + '" ' +
        'data-action="cal:goto" data-kind="' + esc(it.kind) + '" data-id="' + esc(it.id) + '">' +
      '<div class="cal-item-head">' +
        '<span class="cal-item-title">' + esc(it.ruleTitle || it.title || '') + '</span>' +
        statusTag +
        '<span class="spacer"></span>' +
        '<span class="cal-hint">' + esc(it.chapterTitle) + '　·　' + where + '</span>' +
      '</div>' +
      '<div class="cal-item-text">' + esc(it.text.length > 40 ? it.text.slice(0, 40) + '…' : it.text) + '</div>' +
      (it.detail ? '<div class="cal-item-detail">' + esc(it.detail) + '</div>' : '') +
      '<div class="cal-item-actions">' + actions + '</div>' +
    '</div>';
  }

  var STATUS_LABEL = { open: '未校定', fixed: '已校定', ignored: '已忽略' };

  /** 右栏标题行（状态筛选 + 只看本章） */
  function renderRightHead() {
    var statusOptions = [['', '全部状态'], ['open', '未校定'], ['fixed', '已校定'], ['ignored', '已忽略']]
      .map(function (p) {
        return '<option value="' + p[0] + '"' + (state.status === p[0] ? ' selected' : '') +
          '>' + p[1] + '</option>';
      }).join('');
    return '<div class="cp-col-head" id="cal-right-head">' + icon('shield-check') + '审核结果命中项' +
        '<span class="spacer"></span>' +
        '<label class="sr-only" for="cal-status">按状态筛选</label>' +
        '<select class="select select-inline" id="cal-status" data-change="cal:status">' +
          statusOptions + '</select>' +
        '<button type="button" class="btn btn-sm' + (state.chapterId ? ' btn-primary' : '') + '" ' +
          'data-action="cal:scope"' +
          ' title="只显示当前选中章节的命中项">' + icon('filter') + (state.chapterId ? '只看本章' : '显示全部') +
        '</button>' +
      '</div>';
  }

  /** 右栏列表：三类分组 + 命中项 */
  function renderRightBody() {
    return KINDS.map(function (k) {
      var def = App.audit.KINDS.filter(function (x) { return x.key === k; })[0];
      var items = S.auditItems(state.taskId, k);
      if (items === null) {
        return '<div class="cal-group"><div class="cal-group-head">' + icon(def.icon) +
          '<span class="cal-group-title">' + esc(def.title) + '</span>' +
          '<span class="spacer"></span><span class="cal-hint">未审核</span></div></div>';
      }
      var shown = state.chapterId
        ? items.filter(function (it) { return it.chapterId === state.chapterId; })
        : items;
      if (state.status) shown = shown.filter(function (it) { return it.status === state.status; });
      var open = shown.filter(function (i) { return i.status === 'open'; }).length;
      return '<div class="cal-group">' +
        '<div class="cal-group-head">' + icon(def.icon) +
          '<span class="cal-group-title">' + esc(def.title) + '</span>' +
          '<span class="spacer"></span>' +
          '<span class="cal-hint">' + (state.chapterId
            ? '本章 ' + shown.length + ' 项' + (open ? '（未校定 ' + open + '）' : '（均已处理）')
            : '共 ' + shown.length + ' 项' + (open ? '（未校定 ' + open + '）' : '（均已处理）')) + '</span>' +
        '</div>' +
        (shown.length ? shown.map(renderItem).join('')
          : '<div class="cal-hint cal-group-empty">' + (state.chapterId ? '本章没有命中项' : '没有命中项') + '</div>') +
      '</div>';
    }).join('');
  }


  /* ---------------------------------------------------- 外壳 */

  function shell() {
    var t = S.getTask(state.taskId);
    var doc = buildDoc();
    var openCount = allItems().filter(function (i) { return i.status === 'open'; }).length;
    var fixedCount = allItems().filter(function (i) { return i.status === 'fixed'; }).length;
    var ignoredCount = allItems().filter(function (i) { return i.status === 'ignored'; }).length;
    return '<div class="cp-header">' +
        '<span class="cp-brand">' + icon('shield-check') + '校定内容</span>' +
        '<span class="cp-sep"></span>' +
        '<span class="cp-task" title="' + esc(t ? t.topicName : '') + '">' + esc(t ? t.topicName : '') + '</span>' +
        '<span class="cp-progress">命中 <b>' + allItems().length + '</b> 项　·　未校定 <b>' + openCount +
          '</b> 项　·　已校定 <b>' + fixedCount + '</b> 项　·　已忽略 <b>' + ignoredCount +
          '</b> 项　·　共 ' + doc.pages + ' 页</span>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn" data-action="cal:preview">' + icon('eye') + '预览</button>' +
        '<button type="button" class="btn btn-primary" data-action="cal:save">' +
          icon('check') + '保存</button>' +
        '<button type="button" class="btn" data-action="cal:close">' + icon('x') + '退出校定</button>' +
      '</div>' +
      '<div class="cp-body cal-body">' +
        '<aside class="cp-col cal-nav">' +
          '<div class="cp-col-head">' + icon('list-tree') + '大纲导航' +
            '<span class="spacer"></span><span class="cp-col-note">占 20%</span></div>' +
          '<div class="cp-col-body" id="cal-left">' + renderNav() + '</div>' +
        '</aside>' +
        renderMiddleSection(doc) +
        '<section class="cp-col cal-results">' +
          renderRightHead() +
          '<div class="cp-col-body" id="cal-right">' + renderRightBody() + '</div>' +
        '</section>' +
      '</div>';
  }

  /* ---------------- 中栏"编研成果校定"：正文段落**直接编辑** ----------------
     段落块用 contenteditable 渲染，改完（失焦或停手 1.2 秒）按 (chapterId, localStart, localEnd)
     写回那一章的正文 —— 不需要先点任何"编辑"按钮。
     ⚠ 监听必须挂在**屏幕根**上（委托）：中栏每次重画都会换掉段落节点，
       绑在节点上的监听会跟着丢，表现成"改了没反应、也不报错"。 */
  var pendingSeg = null;
  var pendingTimer = null;

  function flushSegment() {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    if (!pendingSeg) return false;
    var seg = pendingSeg;
    pendingSeg = null;
    var text = String(S.chapterOf(state.taskId, seg.chapterId).text || '');
    var start = Math.min(seg.start, text.length);
    var end = Math.min(Math.max(seg.end, start), text.length);
    var next = text.slice(0, start) + seg.text + text.slice(end);
    if (next === text) return false;
    S.saveChapter(state.taskId, seg.chapterId, next, { silent: true });
    U.toast('已保存正文修改（' + (seg.chapterTitle || seg.chapterId) + '）', 'ok');
    return true;
  }

  function bindSegments() {
    var screen = document.getElementById('calibrate-screen');
    if (!screen || screen.__segBound) return;
    screen.__segBound = true;

    function remember(el) {
      var chapterId = el.getAttribute('data-chapter');
      var ch = chapters().filter(function (c) { return c.id === chapterId; })[0];
      pendingSeg = {
        chapterId: chapterId,
        chapterTitle: ch ? ch.title : chapterId,
        start: parseInt(el.getAttribute('data-local-start'), 10) || 0,
        end: parseInt(el.getAttribute('data-local-end'), 10) || 0,
        text: String(el.innerText || '').replace(/\n$/, '')
      };
    }

    screen.addEventListener('input', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('.cal-seg-body') : null;
      if (!el) return;
      remember(el);
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(function () { flushSegment(); }, 1200);
    });
    screen.addEventListener('focusout', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('.cal-seg-body') : null;
      if (!el) return;
      remember(el);
      flushSegment();
    });
  }

  function mount() {
    var old = document.getElementById('calibrate-screen');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.className = 'cp-screen cal-screen';
    el.id = 'calibrate-screen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '校定内容');
    el.innerHTML = shell();
    /* ⚠ 与加工编排工作台同一套做法：挂 <body>（不进 #overlay-root，避免被弹窗清空），
       并且自己绑一次事件委托（#app 上那份管不到这块新屏） */
    document.body.appendChild(el);
    if (U.initDelegation) U.initDelegation(el);
    bindSegments();
  }

  function paint(parts) {
    (parts || []).forEach(function (p) {
      var box = document.getElementById(p.id);
      if (box) box.innerHTML = p.html();
    });
  }

  function repaintMiddle() {
    flushSegment();
    var doc = buildDoc();
    paint([{ id: 'cal-middle', html: function () { return renderMiddleBody(doc); } }]);
  }

  function repaintAll() {
    flushSegment();
    var doc = buildDoc();
    paint([
      { id: 'cal-left', html: renderNav },
      { id: 'cal-middle', html: function () { return renderMiddleBody(doc); } },
      { id: 'cal-right-head', html: renderRightHead },
      { id: 'cal-right', html: renderRightBody }
    ]);
  }

  function scrollToHit() {
    var el = document.getElementById('cal-page-' + state.page);
    if (el) el.scrollIntoView({ block: 'center' });
  }

  function doOpen(taskId) {
    var t = S.getTask(taskId);
    if (!t) return;
    state.taskId = taskId;
    state.editing = false;
    state.page = 1;
    state.hitKey = null;
    var first = allItems()[0];
    state.chapterId = first ? first.chapterId : (nodes()[0] || {}).id || null;
    if (first) {
      var doc = buildDoc();
      state.page = pageOfOffset(doc, hitOffset(doc, first));
      state.hitKey = first.kind + ':' + first.id;
    }
    mount();
    U.toast('已打开「校定内容」（全屏，Esc 退出）：点右侧命中项可跳到对应页并标黄', 'ok');
  }

  function close() {
    flushSegment();
    var el = document.getElementById('calibrate-screen');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    state.taskId = null;
  }

  function register() {
    U.register('cal:close', function () { close(); });
    U.register('cal:chapter', function (ds) {
      state.chapterId = ds.id;
      state.editing = false;
      var hit = hitsOfChapter(ds.id).filter(function (h) {
        return !state.filter || h.kind === state.filter; })[0] || hitsOfChapter(ds.id)[0];
      var doc = buildDoc();
      if (hit) {
        state.hitKey = hit.kind + ':' + hit.id;
        state.page = pageOfOffset(doc, hitOffset(doc, hit));
      } else {
        state.hitKey = null;
        var base = doc.chapterStart[ds.id] || 0;
        state.page = pageOfOffset(doc, base);
      }
      repaintAll();
      scrollToHit();
    });
    U.register('cal:goto', function (ds) {
      /* 点右栏命中项：左栏跟着选中该章，中栏跳到命中所在页并标黄 */
      var key = ds.kind + ':' + ds.id;
      var it = itemByKey(key);
      if (!it) return;
      state.hitKey = key;
      state.chapterId = it.chapterId;
      state.editing = false;
      var doc = buildDoc();
      state.page = pageOfOffset(doc, hitOffset(doc, it));
      repaintAll();
      scrollToHit();
    });
    U.register('cal:status', function (ds, el) {
      state.status = el.value;
      repaintAll();
    });
    U.register('cal:save', function () {
      /* 正文平时是"失焦即存"；这颗按钮给一个**显式存档点**，也把还停在输入框里的改动立刻落盘 */
      var changed = flushSegment();
      repaintAll();
      U.toast(changed ? '已保存正文修改' : '当前没有未保存的修改（正文失焦时已自动保存）', 'ok');
    });
    U.register('cal:preview', function () {
      flushSegment();
      var t = S.getTask(state.taskId);
      var sum = S.auditSummary(state.taskId);
      var list = chapters();
      var body = list.length
        ? list.map(function (c, i) {
          var text = String(c.text || '').trim();
          return '<div class="pv-ch lv1">' +
            '<div class="pv-title"><span class="tnum">' + (i + 1) + '.</span>' + esc(c.title) + '</div>' +
            (text ? '<div class="pv-text">' + esc(text).replace(/\n/g, '<br>') + '</div>'
              : '<div class="pv-empty">（本章尚未编写）</div>') +
          '</div>';
        }).join('')
        : '<div class="pv-empty">还没有大纲。</div>';
      U.modal({
        title: '预览 · ' + (t ? t.topicName : ''),
        width: 900,
        okText: '关闭',
        cancelText: null,
        body: '<div class="pv-doc">' +
            '<h1 class="pv-doc-title">' + esc(t ? t.topicName : '') + '</h1>' +
            '<div class="pv-doc-sub">' + sum.total + ' 处命中：未校定 ' + sum.open +
              '　·　已校定 ' + (sum.kinds.political.fixed + sum.kinds.professional.fixed +
                sum.kinds.compliance.fixed) +
              '　·　已忽略 ' + (sum.kinds.political.ignored + sum.kinds.professional.ignored +
                sum.kinds.compliance.ignored) + '　·　按大纲顺序预览</div>' +
            body +
          '</div>' +
          '<div class="data-note">' + icon('info') +
            '<span>这是按大纲顺序拼起来的预览稿，只读；校定请回中栏直接改正文。</span></div>'
      });
    });
    U.register('cal:mark', function (ds) {
      var r = S.markAuditFixed(state.taskId, ds.kind, ds.id);
      U.toast(r.message, r.ok ? 'ok' : 'warn');
      repaintAll();
    });
    U.register('cal:autofix', function (ds) {
      var r = S.fixAuditItem(state.taskId, ds.kind, ds.id, { mode: 'ai' });
      U.toast(r.message, r.ok ? 'ok' : 'warn');
      repaintAll();
    });
    U.register('cal:ignore', function (ds) {
      var r = S.ignoreAuditItem(state.taskId, ds.kind, ds.id);
      U.toast(r.message, r.ok ? 'ok' : 'warn');
      repaintAll();
    });
    U.register('cal:scope', function () {
      if (state.chapterId) state.chapterId = null;      /* 展开成全部 */
      else state.chapterId = (allItems()[0] || {}).chapterId || (nodes()[0] || {}).id || null;
      repaintAll();
    });
  }

  /** Esc 退出全屏校定界面（弹层打开时先关弹层） */
  function bindKeys() {
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !open()) return;
      if (document.querySelector('.modal')) return;
      close();
    });
  }

  /* 挂进 App.pages 让 boot() 自动调用 register()（与其它页面一致） */
  App.pages = App.pages || {};
  App.pages['task/calibrate'] = { register: register, render: function () { return ''; } };

  App.reviewCalibrate = {
    open: doOpen,
    close: close,
    isOpen: open,
    register: register,
    bindKeys: bindKeys,
    PAGE_SIZE: PAGE_SIZE,
    /* 供验证脚本读取内部状态与分页模型 */
    state: function () {
      return { taskId: state.taskId, chapterId: state.chapterId, hitKey: state.hitKey,
        page: state.page, editing: state.editing };
    },
    doc: function (taskId) {
      var keep = state.taskId;
      state.taskId = taskId || keep;
      var d = buildDoc();
      state.taskId = keep;
      return d;
    }
  };
})(window);
