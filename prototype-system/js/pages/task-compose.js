/* ==========================================================================
   编研任务 · 第 3 阶段「加工编排」—— **全屏工作台**

   评审要求：
     · 在浏览器内部全屏显示，点进度条上的「加工编排」阶段名打开
     · 三栏：左＝大纲导航（占 20%，可折叠）｜中＝素材区（选材列表 + 区域内浏览文件，
       上方「手动摘录 / AI自动摘录」按钮）｜右＝编排区（点左侧章节后写这一章的正文）
     · 界面上方有「预览」「保存」

   实现要点：
     · 全屏＝铺满浏览器视口的一层（position:fixed; inset:0），挂在 #overlay-root 里 ——
       它不参与主应用的整页重渲染，因此编辑正文时不会被"重渲染冲掉光标"。
     · 章节正文按**大纲节点 id** 存（store.chapterOf / saveChapter），导航区就是大纲本身。
     · 正文输入走 silent 落库（不 notify）：与大纲、选材两处的做法一致，见 README 缺陷 11/12。
     · 摘录按钮本轮只生成按钮，点了给一句说明（评审：暂时只生成按钮）。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = {
    taskId: null,
    nodeId: null,          // 编排区当前编辑的章节
    /* 左栏用面包屑在两块之间切换：大纲导航 / 素材区 */
    pane: 'nav',
    /* 资料区当前浏览的文件（在左栏「素材区」里点一条即浏览） */
    materialId: null,
    page: 1,
    /* 视频类素材的时间点（插入帧用）；非视频素材忽略 */
    frameTime: '',
    /* 素材区的筛选（档案门类 / 素材标签） */
    catFilter: '',
    tagFilter: '',
    navCollapsed: false,
    dirty: false,          // 正文有未保存的修改
    hasSelection: false    // 编排区里有没有选中文本（「AI扩写」的前提）
  };

  /* 撤销 / 恢复：编排**动作**级快照（插入本页 / 插入帧 / 清空正文），上限 10 步，与第 1 阶段一致。
     正文打字不进这个栈 —— 那是 textarea 自带的 Ctrl+Z 管的，混在一起反而会让"撤销"变得不可预期。 */
  var MAX_HISTORY = 10;
  var undoStack = [];
  var redoStack = [];
  /* 正文打字也要能撤销 —— 但**不能逐字记步**（一屏字就几十步）。
     做法：把连续输入按"停顿"分组，停手 700ms（或失焦 / 切章 / 点了别的动作）时，
     用这一组输入**开始前**的文本记一步。这样"撤销"退一次就是退一段输入，符合直觉。 */
  var EDIT_DEBOUNCE = 700;
  var pendingEdit = null;      // { taskId, nodeId, text(输入开始前的正文), timer }
  var lastValue = '';          // 编辑器里"上一次已知的正文"，用来算输入开始前的文本

  /** 把"正在输入"的那一组落成一步（没有就什么都不做） */
  function commitPendingEdit() {
    if (!pendingEdit) return;
    if (pendingEdit.timer) clearTimeout(pendingEdit.timer);
    var step = { taskId: pendingEdit.taskId, nodeId: pendingEdit.nodeId,
      text: pendingEdit.text, label: '编辑正文' };
    pendingEdit = null;
    /* 这一组输入没有真正改变文本（例如选中后又被系统改回）就不记步 */
    if (step.text === S.chapterOf(step.taskId, step.nodeId).text) return;
    undoStack.push(step);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    if (open()) paint([{ id: 'cp-write-tools', html: renderWriteTools }]);
  }

  /** 动 store **之前**记一步（否则记的就是改完之后的文本） */
  function pushUndo(label) {
    if (!state.taskId || !state.nodeId) return;
    /* 打字还没落地就先落地，保证"撤销"先退动作、再退输入 */
    commitPendingEdit();
    undoStack.push({
      taskId: state.taskId, nodeId: state.nodeId,
      text: S.chapterOf(state.taskId, state.nodeId).text, label: label
    });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
  }

  /** 当前章节的上下文：给"本地模拟生成"当参考（章节标题 + 本章选材） */
  function composeCtx() {
    var n = nodes().filter(function (x) { return x.id === state.nodeId; })[0];
    return {
      chapterTitle: n ? n.title : '',
      materials: allEntries().map(function (e) {
        return { title: e.title, archiveNo: e.archiveNo };
      })
    };
  }

  /** 光标/选区：点工具按钮时 textarea 会失焦，但 selectionStart/End 仍在，所以在弹窗打开前先记下来 */
  function captureCaret() {
    var ta = document.getElementById('cp-text');
    if (!ta) return { start: 0, end: 0, text: '' };
    var a = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
    var b = ta.selectionEnd == null ? ta.value.length : ta.selectionEnd;
    return { start: Math.min(a, b), end: Math.max(a, b), text: ta.value.slice(Math.min(a, b), Math.max(a, b)) };
  }

  /** 把一段文字插到光标处（保留原文，插完光标落在插入内容之后） */
  function insertAtCaret(snippet, label) {
    var ta = document.getElementById('cp-text');
    if (!ta) return false;
    var caret = captureCaret();
    var next = ta.value.slice(0, caret.start) + snippet + ta.value.slice(caret.end);
    pushUndo(label);
    ta.value = next;
    var pos = caret.start + snippet.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    S.saveChapter(state.taskId, state.nodeId, next, { silent: true });
    state.dirty = true;
    afterEdit();
    return true;
  }

  /** 用一段文字替换选中内容（AI扩写：覆盖选中的原有内容） */
  function replaceSelection(text, label) {
    var ta = document.getElementById('cp-text');
    if (!ta) return false;
    var caret = captureCaret();
    var next = ta.value.slice(0, caret.start) + text + ta.value.slice(caret.end);
    pushUndo(label);
    ta.value = next;
    var pos = caret.start + text.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    S.saveChapter(state.taskId, state.nodeId, next, { silent: true });
    state.dirty = true;
    afterEdit();
    return true;
  }

  /* ---------------- 脚注：正文里放序号标记，本章末尾的【脚注】区登记 ---------------- */

  var FOOT_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
    '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
  var FOOT_HEAD = '【脚注】';

  function footnoteMark(no) { return FOOT_MARKS[no - 1] || ('[' + no + ']'); }

  /** 本章末尾【脚注】区里已有几条 → 下一条的序号 */
  function footnoteCount() {
    var text = S.chapterOf(state.taskId, state.nodeId).text || '';
    var at = text.indexOf(FOOT_HEAD);
    if (at < 0) return 0;
    return text.slice(at).split('\n').filter(function (l) {
      return /^[①-⑳\[]/.test(l.trim());
    }).length;
  }

  function nextFootnoteNo() { return footnoteCount() + 1; }

  /** 把一条脚注追加到本章末尾的【脚注】区（没有这个区就新建） */
  function appendFootnote(no, text, source) {
    var ta = document.getElementById('cp-text');
    if (!ta) return false;
    var body = ta.value;
    var line = footnoteMark(no) + ' ' + text + (source ? '（' + source + '）' : '');
    var at = body.indexOf(FOOT_HEAD);
    if (at < 0) {
      body = body.replace(/\s*$/, '\n\n' + FOOT_HEAD + '\n' + line + '\n');
    } else {
      body = body.replace(/\s*$/, '\n') + line + '\n';
    }
    ta.value = body;
    S.saveChapter(state.taskId, state.nodeId, body, { silent: true });
    afterEdit();
    return true;
  }

  function doUndo() {
    commitPendingEdit();                 // 先把正在输入的那一组落地，才能撤销它
    if (!undoStack.length) { U.toast('没有可撤销的编辑或编排动作', 'warn'); return; }
    var snap = undoStack.pop();
    /* 先把"当前正文"压进恢复栈，才能再恢复回来 */
    redoStack.push({ taskId: snap.taskId, nodeId: snap.nodeId,
      text: S.chapterOf(snap.taskId, snap.nodeId).text, label: snap.label });
    applySnapshot(snap);
    U.toast('已撤销：' + snap.label + '（章节「' + nodeTitle(snap.taskId, snap.nodeId) + '」）', 'ok');
  }

  function doRedo() {
    commitPendingEdit();
    if (!redoStack.length) { U.toast('没有可恢复的编辑或编排动作', 'warn'); return; }
    var snap = redoStack.pop();
    undoStack.push({ taskId: snap.taskId, nodeId: snap.nodeId,
      text: S.chapterOf(snap.taskId, snap.nodeId).text, label: snap.label });
    applySnapshot(snap);
    U.toast('已恢复：' + snap.label + '（章节「' + nodeTitle(snap.taskId, snap.nodeId) + '」）', 'ok');
  }

  /** 编辑之后的公共收尾：未保存标记、字数、编排进度、按钮态 */
  function afterEdit() {
    var dirty = document.getElementById('cp-dirty');
    if (dirty) dirty.classList.remove('hidden');
    var meta = document.getElementById('cp-meta');
    if (meta) meta.textContent = metaText(S.chapterOf(state.taskId, state.nodeId));
    paint([{ id: 'cp-write-tools', html: renderWriteTools }]);
    paintProgress();
  }

  function nodeTitle(taskId, nodeId) {
    var hit = (S.outlineOf(taskId).nodes || []).filter(function (n) { return n.id === nodeId; })[0];
    return hit ? hit.title : nodeId;
  }

  /** 回到某个快照（可能跨章节：连当前章节一起切过去） */
  function applySnapshot(snap) {
    if (pendingEdit && pendingEdit.timer) clearTimeout(pendingEdit.timer);
    pendingEdit = null;
    state.taskId = snap.taskId;
    state.nodeId = snap.nodeId;
    S.saveChapter(snap.taskId, snap.nodeId, snap.text, { silent: true });
    state.dirty = true;
    var ta = document.getElementById('cp-text');
    if (ta) {
      ta.value = snap.text;
      lastValue = snap.text;          // 程序化改动同步"已知值"，别被当成用户输入
      ta.focus();
      ta.setSelectionRange(snap.text.length, snap.text.length);
    }
    var dirty = document.getElementById('cp-dirty');
    if (dirty) dirty.classList.remove('hidden');
    var meta = document.getElementById('cp-meta');
    if (meta) meta.textContent = metaText(S.chapterOf(snap.taskId, snap.nodeId));
    paint([{ id: 'cp-pane', html: renderPane }, { id: 'cp-write-tools', html: renderWriteTools }]);
    paintProgress();
  }

  function open() { return !!(state.taskId && document.getElementById('compose-screen')); }

  function nodes() { return (S.outlineOf(state.taskId).nodes || []); }

  function numbering() {
    var counters = [], map = {}, MAX = 8;
    for (var i = 0; i < MAX; i++) counters.push(0);
    nodes().forEach(function (n) {
      counters[n.level - 1] += 1;
      for (var j = n.level; j < MAX; j++) counters[j] = 0;
      map[n.id] = counters.slice(0, n.level).join('.') + (n.level === 1 ? '.' : '');
    });
    return map;
  }

  /**
   * 这条选材是不是**视频类文件**（「插入帧」只对视频开放）。
   * 只看文件扩展名 —— 目录著录里没有"媒体类型"这一项，扩展名是最直接的依据。
   */
  var VIDEO_EXT = /^.*\.(mp4|mov|avi|mkv|wmv|flv|m4v|webm|mpg|mpeg)$/i;
  function isVideo(e) {
    return !!(e && e.file && VIDEO_EXT.test(String(e.file.name || '')));
  }

  /** 秒 → 00:12:30 / 12:30 */
  function fmtDuration(sec) {
    var n = Math.floor(Number(sec) || 0);
    if (!n) return '';
    var h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), ss = n % 60;
    function pad(x) { return x < 10 ? '0' + x : String(x); }
    return (h ? h + ':' : '') + pad(m) + ':' + pad(ss);
  }

  /**
   * 解析帧所在时间点：支持 83（秒）/ 1:23（分:秒）/ 00:01:23（时:分:秒）
   * @returns {{sec:number, text:string, error:string}}
   */
  function parseTimePoint(raw) {
    var t = String(raw || '').trim();
    if (!t) return { sec: 0, text: '', error: '请填写帧所在的时间点，例如 1:23 或 00:01:23' };
    var parts = t.split(':').map(function (x) { return x.trim(); });
    if (parts.length > 3 || parts.some(function (x) { return x === '' || !/^\d+$/.test(x); })) {
      return { sec: 0, text: '', error: '时间点格式不对：「' + t + '」，只支持 1:23 或 00:01:23' };
    }
    if (parts.length > 1 && parseInt(parts[parts.length - 1], 10) > 59) {
      return { sec: 0, text: '', error: '秒数要小于 60：「' + t + '」' };
    }
    var sec = 0;
    parts.forEach(function (x) { sec = sec * 60 + parseInt(x, 10); });
    return { sec: sec, text: fmtDuration(sec) || '00:00', error: '' };
  }

  function allEntries() { return S.selectionOf(state.taskId).entries; }

  /** 素材区当前显示的选材（按档案门类 / 素材标签筛选后） */
  function filteredEntries() {
    return allEntries().filter(function (e) {
      if (state.catFilter && (e.category || '') !== state.catFilter) return false;
      if (state.tagFilter && (e.tagIds || []).indexOf(state.tagFilter) < 0) return false;
      return true;
    });
  }

  /** 下拉项：只列这批选材里实际出现的门类 / 标签，并带件数 */
  function countBy(key) {
    var map = {};
    allEntries().forEach(function (e) {
      if (key === 'cat') {
        var c = e.category || '';
        if (c) map[c] = (map[c] || 0) + 1;
      } else {
        (e.tagIds || []).forEach(function (t) { map[t] = (map[t] || 0) + 1; });
      }
    });
    return map;
  }

  function tagName(id) {
    var t = S.tags().filter(function (x) { return x.id === id; })[0];
    return t ? t.name : id;
  }

  /* ====================================================== 三栏内容 */

  /**
   * 折叠 / 展开开关：贴在左栏**右缘的垂直中点**，像一个抽屉拉手。
   * 展开时朝左（点它收起），收起时朝右（点它展开）——两个状态下都在同一个位置，
   * 所以折起来之后仍然有地方点回来（早先折成细轨、按钮跟着跑，手感不好）。
   */
  function renderHandle() {
    var collapsed = state.navCollapsed;
    return '<button type="button" class="cp-handle" data-action="compose:nav" ' +
      'aria-expanded="' + (collapsed ? 'false' : 'true') + '" ' +
      'title="' + (collapsed ? '展开大纲导航与素材区' : '折叠大纲导航与素材区，把宽度让给素材文件浏览') + '" ' +
      'aria-label="' + (collapsed ? '展开' : '折叠') + '大纲导航与素材区">' +
      icon(collapsed ? 'chevron-right' : 'chevron-left') +
    '</button>';
  }

  /**
   * 左栏顶部的切换控件：大纲导航 / 素材区。
   * 做成**分段控件**（一个浅色底槽 + 选中项白色药丸），不显示编研任务名称
   * （任务名在顶栏已经有了，这里只留"切哪一块"）。
   */
  function renderSwitch() {
    var n = allEntries().length;
    function seg(key, label) {
      var active = state.pane === key;
      return '<button type="button" class="cp-switch-seg' + (active ? ' active' : '') + '" ' +
        'role="tab" aria-selected="' + (active ? 'true' : 'false') + '" ' +
        'data-action="compose:tab" data-pane="' + key + '">' + esc(label) + '</button>';
    }
    return '<div class="cp-switch" role="tablist" aria-label="左栏内容切换">' +
      seg('nav', '大纲导航') +
      seg('materials', '素材区' + (n ? '（' + n + '）' : '')) +
    '</div>';
  }

  /** 左栏内容：按面包屑当前选的那一块渲染 */
  function renderPane() {
    return state.pane === 'materials' ? renderMatPane() : renderNavPane();
  }

  function renderNavPane() {
    var nums = numbering();
    var list = nodes();
    var rec = S.composeOf(state.taskId);
    if (!list.length) {
      return '<div class="cp-empty">' + icon('info') +
        '<div>这个任务还没有大纲。<br>请先到第 1 阶段「生成大纲」生成或编写大纲，编排区按章节组织。</div></div>';
    }
    var hideFrom = 0;
    return '<div class="cp-tree">' + list.map(function (n) {
      if (hideFrom && n.level > hideFrom) return '';
      hideFrom = 0;
      if (n.collapsed) hideFrom = n.level;
      var ch = rec.chapters[n.id];
      var written = !!(ch && String(ch.text || '').trim());
      return '<button type="button" class="cp-node lv' + n.level +
          (n.id === state.nodeId ? ' active' : '') + (written ? ' written' : '') + '" ' +
          'data-action="compose:pick" data-id="' + esc(n.id) + '" ' +
          'title="' + esc((nums[n.id] || '') + ' ' + (n.title || '未命名标题')) + '">' +
          '<span class="cp-num tnum">' + esc(nums[n.id] || '') + '</span>' +
          '<span class="cp-title">' + esc(n.title || '未命名标题') + '</span>' +
          (written ? '<span class="cp-dot" title="本章已写"></span>' : '') +
        '</button>';
    }).join('') + '</div>';
  }

  /** 左栏「素材区」：门类/标签筛选 + 选材列表（摘录按钮在中栏的浏览区上方） */
  function renderMatPane() {
    return '<div id="cp-mat-filter">' + renderMatFilters() + '</div>' +
      '<div class="cp-pane-list" id="cp-materials">' + renderMaterials() + '</div>';
  }

  function renderMatFilters() {
    var cats = countBy('cat');
    var catOptions = ['<option value="">全部门类</option>'].concat(
      (App.mock.ARCHIVE_CATEGORIES || []).filter(function (c) { return cats[c]; }).map(function (c) {
        return '<option value="' + esc(c) + '"' + (state.catFilter === c ? ' selected' : '') + '>' +
          esc(c) + '（' + cats[c] + '）</option>';
      })
    ).join('');

    var tags = countBy('tag');
    var tagOptions = ['<option value="">全部标签</option>'].concat(
      Object.keys(tags).sort(function (a, b) { return tags[b] - tags[a]; }).map(function (t) {
        return '<option value="' + esc(t) + '"' + (state.tagFilter === t ? ' selected' : '') + '>' +
          esc(tagName(t)) + '（' + tags[t] + '）</option>';
      })
    ).join('');

    return '<div class="cp-mat-filter">' +
      '<label class="sr-only" for="cp-cat">按档案门类筛选</label>' +
      '<select class="select select-inline" id="cp-cat" data-change="compose:cat-filter" ' +
        'title="按档案门类筛选选材">' + catOptions + '</select>' +
      '<label class="sr-only" for="cp-tag">按素材标签筛选</label>' +
      '<select class="select select-inline" id="cp-tag" data-change="compose:tag-filter" ' +
        'title="按素材标签筛选选材">' + tagOptions + '</select>' +
      '<span class="spacer"></span>' +
      ((state.catFilter || state.tagFilter)
        ? '<button type="button" class="btn btn-sm btn-text" data-action="compose:clear-filter">重置</button>'
        : '') +
    '</div>';
  }

  function renderMaterials() {
    var list = filteredEntries();
    var total = allEntries().length;
    var rows = list.length
      ? list.map(function (e) {
        return '<div class="cp-mat' + (e.id === state.materialId ? ' active' : '') + '">' +
          '<button type="button" class="cp-mat-main" data-action="compose:file" data-id="' + esc(e.id) + '" ' +
            'title="在中间的素材文件浏览里打开「' + esc(e.title) + '」">' +
            '<span class="cp-mat-title" title="' + esc(e.title) + '">' + esc(e.title) + '</span>' +
            '<span class="cp-mat-meta">' + esc(S.scopeText(e)) + '</span>' +
          '</button>' +
          '<span class="cp-mat-tag">' + U.tag(e.category || '未著录', '') + '</span>' +
          '<span class="cp-mat-tags">' + tagChips(e.tagIds) + '</span>' +
        '</div>';
      }).join('')
      : '<div class="cp-empty">' + icon('info') +
        (total
          ? '<div>没有符合条件的选材（共 ' + total + ' 条，可用上面的门类 / 标签筛选）</div>'
          : '<div>选材库还是空的。<br>请先到第 2 阶段「确定选材」把素材选进来。</div>') +
        '</div>';

    return '<div class="cp-mat-list">' + rows + '</div>';
  }

  function tagChips(ids) {
    var list = ids || [];
    if (!list.length) return '<span class="muted">未打标签</span>';
    return '<span class="tag-chips">' + list.slice(0, 2).map(function (id) {
      return U.tag(tagName(id), '');
    }).join('') + (list.length > 2 ? '<span class="tag-rest">+' + (list.length - 2) + '</span>' : '') +
    '</span>';
  }

  /** 中间栏：素材文件浏览（在左栏素材区点文件后在这里翻看） */
  function renderFilePane() {
    var e = allEntries().filter(function (x) { return x.id === state.materialId; })[0] || null;
    if (!e) {
      return '<div class="cp-file"><div class="cp-empty">' + icon('file-text') +
        '<div>这里浏览素材文件。<br>先在左侧面包屑切到「素材区」，再点一份素材。</div></div></div>';
    }
    var cat = S.catalogByArchiveNo(e.archiveNo);
    var head = '<div class="cp-file-head">' +
        '<span class="cp-file-title" title="' + esc(e.title) + '">' + esc(e.title) + '</span>' +
        '<span class="spacer"></span>' +
        U.tag(e.scope === 'pages' ? '仅选出 ' + e.pages.length + ' 页' : '整个文件',
          e.scope === 'pages' ? 'tag-accent' : '') +
        (isVideo(e) ? U.tag('视频', 'tag-warn') : '') +
      '</div>';
    var metaRow = '<div class="cp-file-meta">' +
        '<span>' + esc(e.archiveNo ? '档号 ' + e.archiveNo : '本地上传（无档号）') + '</span>' +
        '<span>' + esc(e.category || '未著录') + '</span>' +
        '<span>' + esc(isVideo(e)
          ? ('时长 ' + (fmtDuration(e.file && e.file.duration) || '未著录'))
          : S.scopeText(e)) + '</span>' +
      '</div>';

    if (isVideo(e)) {
      /* 视频类：没有"页"的概念，改成按**时间点**抽帧 */
      var duration = (e.file && e.file.duration) || 0;
      return '<div class="cp-file">' + head +
        '<div class="cp-file-body">' + metaRow +
          '<div class="cp-page cp-video">' +
            '<div class="cp-frame">' + icon('play') + '<span>视频帧</span></div>' +
            '<div class="cp-page-title">' + esc(e.title) + '</div>' +
            '<div class="cp-page-line">' + esc((cat && cat.summary) || '（该素材未著录摘要）') + '</div>' +
            '<div class="cp-page-foot">' +
              (state.frameTime
                ? '当前时间点 ' + esc(state.frameTime) + (duration ? ' / 总时长 ' + fmtDuration(duration) : '')
                : '在下面填写时间点后插入帧（原型不附实体视频，生产环境按时间点抽帧）') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cp-file-foot">' +
          '<label class="cp-frame-label" for="cp-frame-time">帧所在时间点</label>' +
          '<input class="input input-sm cp-frame-input" id="cp-frame-time" maxlength="12" ' +
            'placeholder="如 1:23 或 00:01:23" value="' + esc(state.frameTime) + '" ' +
            'data-change="compose:frame-time">' +
          (duration ? '<span class="ol-hint">总时长 ' + fmtDuration(duration) + '</span>' : '') +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn btn-sm btn-primary" data-action="compose:insert-frame">' +
            icon('plus') + '插入帧</button>' +
        '</div>' +
      '</div>';
    }

    /* 文档类：按页浏览，右下方是「插入本页」 */
    var total = e.scope === 'pages'
      ? (e.pages.length ? Math.max.apply(null, e.pages) : 0)
      : (e.pageCount || 1);
    if (state.page < 1) state.page = 1;
    if (state.page > total) state.page = total;
    return '<div class="cp-file">' + head +
      '<div class="cp-file-body">' + metaRow +
        '<div class="cp-page">' +
          '<div class="cp-page-title">' + esc(e.title) + '</div>' +
          '<div class="cp-page-line">' + esc((cat && cat.summary) || '（该素材未著录摘要）') + '</div>' +
          '<div class="cp-page-line muted">' +
            esc((cat && cat.fullText) || '（无原文摘录：原型不附实体扫描件）') + '</div>' +
          '<div class="cp-page-foot">第 ' + state.page + ' 页 / 共 ' + total + ' 页' +
            (e.scope === 'pages' ? '（选入页：' + S.pagesText(e.pages) + '）' : '') + '　·　示意</div>' +
        '</div>' +
      '</div>' +
      '<div class="cp-file-foot">' +
        '<button type="button" class="btn btn-sm" data-action="compose:page" data-dir="-1"' +
          (state.page <= 1 ? ' aria-disabled="true"' : '') + '>' + icon('arrow-left') + '上一页</button>' +
        '<button type="button" class="btn btn-sm" data-action="compose:page" data-dir="1"' +
          (state.page >= total ? ' aria-disabled="true"' : '') + '>下一页' + icon('arrow-right') + '</button>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn-sm btn-primary" data-action="compose:insert-page" ' +
          'title="把当前浏览的这一页原文插入到编排区当前章节">' +
          icon('plus') + '插入本页</button>' +
      '</div>' +
    '</div>';
  }

  /**
   * 编排区标题行右侧的动作按钮：
   * 「AI生成 / AI扩写 / 添加脚注」本轮**只生成按钮**（点了说明尚未生成）；
   * 「撤销 / 恢复 / 清空」是真能用的 —— 撤销的是编排动作（插入本页 / 插入帧 / 清空正文），
   * 打字走 textarea 自带的 Ctrl+Z（混进同一个栈会让"撤销"变得不可预期）。
   */
  function renderWriteTools() {
    var canUndo = undoStack.length > 0;
    var canRedo = redoStack.length > 0;
    return '<span class="cp-write-tools" id="cp-write-tools">' +
      '<button type="button" class="btn btn-sm" data-action="compose:ai-write">' +
        icon('sparkles') + 'AI生成</button>' +
      '<button type="button" class="btn btn-sm" data-action="compose:ai-expand"' +
        (state.hasSelection ? '' : ' aria-disabled="true"') +
        ' title="' + (state.hasSelection
          ? '按提示词扩写选中的内容（会覆盖选中的原有内容）'
          : '请先在编排区选中要扩写的内容') + '">' +
        icon('sparkles') + 'AI扩写</button>' +
      '<button type="button" class="btn btn-sm" data-action="compose:add-footnote">' +
        icon('plus') + '添加脚注</button>' +
      '<button type="button" class="btn btn-sm" data-action="compose:undo"' +
        (canUndo ? '' : ' aria-disabled="true"') +
        ' title="撤销上一步（正文编辑 / 插入本页 / 插入帧 / AI 生成 / 脚注 / 清空，上限 ' +
        MAX_HISTORY + ' 步；Ctrl+Z 同效）">' +
        icon('rotate-ccw') + '撤销</button>' +
      '<button type="button" class="btn btn-sm" data-action="compose:redo"' +
        (canRedo ? '' : ' aria-disabled="true"') +
        ' title="恢复被撤销的一步（Ctrl+Shift+Z / Ctrl+Y 同效）">' +
        icon('rotate-cw') + '恢复</button>' +
      '<button type="button" class="btn btn-sm" data-action="compose:clear"' +
        (state.nodeId ? '' : ' aria-disabled="true"') +
        ' title="清空当前章节的正文（可用「撤销」恢复）">' +
        icon('trash') + '清空</button>' +
    '</span>';
  }

  function renderEditor() {
    var n = nodes().filter(function (x) { return x.id === state.nodeId; })[0];
    if (!n) {
      return '<div class="cp-editor">' + '<div class="cp-empty">' + icon('pencil') +
        '<div>在左侧大纲里点一个章节，这里写这一章的内容。</div></div></div>';
    }
    var ch = S.chapterOf(state.taskId, n.id);
    var nums = numbering();
    return '<div class="cp-editor">' +
      '<div class="cp-editor-head">' +
        '<span class="cp-editor-num tnum">' + esc(nums[n.id] || '') + '</span>' +
        '<span class="cp-editor-title">' + esc(n.title || '未命名标题') + '</span>' +
        '<span class="spacer"></span>' +
        '<span class="cp-editor-meta" id="cp-meta">' + metaText(ch) + '</span>' +
      '</div>' +
      (n.note ? '<div class="cp-editor-note">' + icon('info') +
        '<span>本段要点：' + esc(n.note) + '</span></div>' : '') +
      '<label class="sr-only" for="cp-text">' + esc((n.title || '') + '　正文') + '</label>' +
      '<textarea class="textarea textarea-read cp-text" id="cp-text" ' +
        'placeholder="在这里写「' + esc(n.title || '本章') + '」的正文；可以从中间素材区摘录档案原文，再补充编者文字。">' +
        esc(ch.text) + '</textarea>' +
    '</div>';
  }

  function metaText(ch) {
    var words = S.wordCount(ch.text);
    return (words ? words + ' 字' : '尚未编写') +
      (ch.savedAt ? '　·　上次保存 ' + App.util.fmtDateTime(ch.savedAt) + ' ' + ch.savedBy : '');
  }

  function shell() {
    var t = S.getTask(state.taskId);
    var stats = S.composeStats(state.taskId);
    return '<div class="cp-header">' +
      '<button type="button" class="icon-btn cp-nav-toggle" data-action="compose:nav" ' +
        'title="' + (state.navCollapsed ? '展开大纲导航' : '折叠大纲导航') + '" ' +
        'aria-expanded="' + (state.navCollapsed ? 'false' : 'true') + '">' +
        icon('panel-left') + '</button>' +
      '<span class="cp-brand">' + icon('layers') + '加工编排</span>' +
      '<span class="cp-sep"></span>' +
      '<span class="cp-task" title="' + esc(t ? t.topicName : '') + '">' +
        esc(t ? t.topicName : '') + '</span>' +
      '<span class="cp-progress">已写 <b>' + stats.written + '</b> / ' + stats.total +
        ' 章　·　' + stats.words + ' 字</span>' +
      '<span class="spacer"></span>' +
      (state.dirty ? '<span class="cp-dirty" id="cp-dirty">● 未保存</span>' : '<span class="cp-dirty hidden" id="cp-dirty">● 未保存</span>') +
      '<button type="button" class="btn" data-action="compose:preview">' + icon('eye') + '预览</button>' +
      '<button type="button" class="btn btn-primary" data-action="compose:save">' +
        icon('check') + '保存</button>' +
      '<button type="button" class="icon-btn" data-action="compose:close" title="退出全屏工作台（Esc）" ' +
        'aria-label="退出加工编排">' + icon('x') + '</button>' +
    '</div>' +
    '<div class="cp-body' + (state.navCollapsed ? ' nav-collapsed' : '') + '">' +
      /* 左栏：面包屑在大纲导航 / 素材区之间切换 */
      '<aside class="cp-col cp-nav">' +
        renderHandle() +
        renderSwitch() +
        '<div class="cp-col-body" id="cp-pane">' + renderPane() + '</div>' +
      '</aside>' +
      /* 中栏：素材文件浏览 */
      '<section class="cp-col cp-file-col">' +
        '<div class="cp-col-head">' + icon('file-text') + '素材文件浏览' +
          '<span class="spacer"></span>' +
          '<span class="cp-col-note">点左侧文件</span>' +
          /* 摘录按钮跟着"正在浏览的文件"走，所以放在浏览区上方（评审要求） */
          '<button type="button" class="btn btn-sm" data-action="compose:extract-manual">' +
            icon('pencil') + '手动摘录</button>' +
          '<button type="button" class="btn btn-sm" data-action="compose:extract-ai">' +
            icon('sparkles') + 'AI自动摘录</button>' +
        '</div>' +
        '<div class="cp-col-body" id="cp-file">' + renderFilePane() + '</div>' +
      '</section>' +
      /* 右栏：编排区 */
      '<section class="cp-col cp-compose">' +
        '<div class="cp-col-head">' + icon('pencil') + '编排区' +
          '<span class="spacer"></span>' +
          renderWriteTools() +
        '</div>' +
        '<div class="cp-col-body" id="cp-editor">' + renderEditor() + '</div>' +
      '</section>' +
    '</div>';
  }

  /* ====================================================== 交互 */

  function mount() {
    var old = document.getElementById('compose-screen');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.className = 'cp-screen';
    el.id = 'compose-screen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '加工编排工作台');
    el.innerHTML = shell();
    /* ⚠️ 挂在 <body> 上，不能挂 #overlay-root：
       U.mount()（弹窗）在 openStack 为空时会 `root.innerHTML = ''`，
       而预览 / 查看弹窗正是从工作台里打开的 —— 挂那儿会被连锅端掉，
       早期版本就出现过"点一次预览，工作台就没了"。
       z-index 95 < 弹层的 100，所以弹窗仍盖在工作台之上。 */
    document.body.appendChild(el);
    /* 事件委托只绑在 #app 与 #overlay-root 上，这块新屏要自己绑一次 */
    if (U.initDelegation) U.initDelegation(el);
    bindEditor();
  }

  /** 正文 textarea 的输入绑定（每次重画三栏后都要重挂） */
  function bindEditor() {
    var ta = document.getElementById('cp-text');
    if (!ta) return;
    lastValue = ta.value;               // 已知正文的起点
    ta.addEventListener('input', function () {
      if (!open()) return;
      /* 打字分组：第一次输入时记下"输入开始前的正文"，停手后再落成一步 */
      if (!pendingEdit || pendingEdit.taskId !== state.taskId || pendingEdit.nodeId !== state.nodeId) {
        pendingEdit = { taskId: state.taskId, nodeId: state.nodeId, text: lastValue, timer: null };
      }
      if (pendingEdit.timer) clearTimeout(pendingEdit.timer);
      pendingEdit.timer = setTimeout(commitPendingEdit, EDIT_DEBOUNCE);
      lastValue = ta.value;
      S.saveChapter(state.taskId, state.nodeId, ta.value, { silent: true });
      state.dirty = true;
      var dirty = document.getElementById('cp-dirty');
      if (dirty) dirty.classList.remove('hidden');
      var meta = document.getElementById('cp-meta');
      if (meta) meta.textContent = metaText({ text: ta.value, savedAt: '', savedBy: '' }) +
        (S.chapterOf(state.taskId, state.nodeId).savedAt
          ? '　·　上次保存 ' + App.util.fmtDateTime(S.chapterOf(state.taskId, state.nodeId).savedAt) +
            ' ' + S.chapterOf(state.taskId, state.nodeId).savedBy
          : '');
      paintProgress();
    });
    ta.addEventListener('change', function () {
      if (!open()) return;
      S.saveChapter(state.taskId, state.nodeId, ta.value, { silent: true });
      commitPendingEdit();            // 失焦就算一组输入结束
    });
    /* Ctrl/Cmd+Z / +Shift+Z（或 Ctrl+Y）走**同一个**撤销栈：
       否则浏览器原生撤销会改回文本、又被当成一次新输入记步，两套历史互相打架 */
    ta.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      var key = String(e.key || '').toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        doRedo();
      }
    });
    /* 「AI扩写」要求先选中内容：选中状态一变就刷新按钮（只在翻转时重画） */
    function syncSelectionState() {
      if (!open()) return;
      var has = ta.selectionStart != null && ta.selectionEnd != null &&
        Math.abs(ta.selectionEnd - ta.selectionStart) > 0;
      if (has !== state.hasSelection) {
        state.hasSelection = has;
        paint([{ id: 'cp-write-tools', html: renderWriteTools }]);
      }
    }
    ['select', 'keyup', 'mouseup'].forEach(function (ev) {
      ta.addEventListener(ev, syncSelectionState);
    });
  }

  /** 就地刷新头部进度与左侧"已写"标记 */
  function paintProgress() {
    var t = S.getTask(state.taskId);
    if (!t) return;
    var stats = S.composeStats(state.taskId);
    var prog = document.querySelector('.cp-progress');
    if (prog) {
      prog.innerHTML = '已写 <b>' + stats.written + '</b> / ' + stats.total + ' 章　·　' + stats.words + ' 字';
    }
    /* 左栏内容按当前页签整体重画（大纲树 / 素材区） */
    var pane = document.getElementById('cp-pane');
    if (pane) pane.innerHTML = renderPane();
  }

  /** 换章节/换素材时只重画需要变的部分，不整屏重建（避免滚动位置与光标乱跳） */
  function paint(parts) {
    (parts || []).forEach(function (p) {
      var box = document.getElementById(p.id);
      if (box) box.innerHTML = p.html();
    });
  }

  function doOpen(taskId) {
    var t = S.getTask(taskId);
    if (!t) return;
    state.taskId = taskId;
    var list = nodes();
    if (!state.nodeId || !list.some(function (n) { return n.id === state.nodeId; })) {
      state.nodeId = list.length ? list[0].id : null;
    }
    state.pane = 'nav';
    /* 换任务＝换一份文档：撤销历史清掉（跨任务撤销会让人莫名其妙） */
    if (undoStack.length && undoStack[0].taskId !== taskId) { undoStack.length = 0; redoStack.length = 0; }
    state.catFilter = '';
    state.tagFilter = '';
    if (!allEntries().some(function (e) { return e.id === state.materialId; })) {
      state.materialId = null;
    }
    state.page = 1;
    state.dirty = false;
    mount();
    U.toast('已打开第 3 阶段「加工编排」工作台（全屏，Esc 退出）', 'ok');
  }

  function close() {
    var el = document.getElementById('compose-screen');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    state.taskId = null;
    state.dirty = false;
  }

  function doPreview() {
    var nums = numbering();
    var list = nodes();
    var rec = S.composeOf(state.taskId);
    var t = S.getTask(state.taskId);
    var body = list.length
      ? list.map(function (n) {
        var ch = rec.chapters[n.id];
        var text = ch && String(ch.text || '').trim();
        return '<div class="pv-ch lv' + n.level + '">' +
          '<div class="pv-title"><span class="tnum">' + esc(nums[n.id] || '') + '</span>' +
            esc(n.title || '未命名标题') + '</div>' +
          (text
            ? '<div class="pv-text">' + esc(text).replace(/\n/g, '<br>') + '</div>'
            : '<div class="pv-empty">（本章尚未编写）</div>') +
        '</div>';
      }).join('')
      : '<div class="pv-empty">还没有大纲，无法预览。</div>';

    U.modal({
      title: '预览 · ' + (t ? t.topicName : ''),
      width: 900,
      okText: '关闭',
      cancelText: null,
      body: '<div class="pv-doc">' +
          '<h1 class="pv-doc-title">' + esc(t ? t.topicName : '') + '</h1>' +
          '<div class="pv-doc-sub">' + S.composeStats(state.taskId).words + ' 字　·　' +
            S.composeStats(state.taskId).written + ' / ' + S.composeStats(state.taskId).total +
            ' 章已完成　·　按大纲顺序预览</div>' +
          body +
        '</div>' +
        '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
          '<span>这是按大纲顺序拼起来的**预览稿**，只读；原型不做排版与导出。</span></div>'
    });
  }

  function doSave() {
    var ta = document.getElementById('cp-text');
    if (state.nodeId && ta) S.saveChapter(state.taskId, state.nodeId, ta.value, { silent: true });
    state.dirty = false;
    var dirty = document.getElementById('cp-dirty');
    if (dirty) dirty.classList.add('hidden');
    var ch = state.nodeId ? S.chapterOf(state.taskId, state.nodeId) : null;
    var meta = document.getElementById('cp-meta');
    if (meta && ch) meta.textContent = metaText(ch);
    paintProgress();
    var n = nodes().filter(function (x) { return x.id === state.nodeId; })[0];
    U.toast(n ? '已保存章节「' + n.title + '」' : '已保存', 'ok');
  }

  function register() {
    U.register('compose:open', function (ds) {
      var id = ds.id || (App.pages.task && null) || state.taskId;
      doOpen(id);
    });
    U.register('compose:close', function () { close(); });
    U.register('compose:nav', function () {
      state.navCollapsed = !state.navCollapsed;
      var body = document.querySelector('.cp-body');
      if (body) body.classList.toggle('nav-collapsed', state.navCollapsed);
      var btn = document.querySelector('.cp-nav-toggle');
      if (btn) {
        btn.setAttribute('aria-expanded', state.navCollapsed ? 'false' : 'true');
        btn.setAttribute('title', state.navCollapsed
          ? '展开大纲导航与素材区' : '折叠大纲导航与素材区，把宽度让给素材文件浏览');
      }
      /* 右缘把手的方向与提示也要跟着变 */
      var handle = document.querySelector('.cp-handle');
      if (handle) handle.outerHTML = renderHandle();
    });
    U.register('compose:pick', function (ds) {
      commitPendingEdit();                // 换章前把正在输入的那一组落地
      state.nodeId = ds.id;
      paint([
        { id: 'cp-pane', html: renderPane },        // 更新左栏的"当前章节"高亮
        { id: 'cp-editor', html: renderEditor }
      ]);
      bindEditor();
    });
    /* 面包屑：在大纲导航 / 素材区之间切换（左栏内容整体重画） */
    U.register('compose:tab', function (ds) {
      state.pane = ds.pane === 'materials' ? 'materials' : 'nav';
      paint([
        { id: 'cp-pane', html: renderPane }
      ]);
      /* 切换控件本身也要换高亮 */
      var sw = document.querySelector('.cp-switch');
      if (sw) sw.outerHTML = renderSwitch();
    });

    U.register('compose:cat-filter', function (ds, el) {
      state.catFilter = el.value;
      paint([
        { id: 'cp-mat-filter', html: renderMatFilters },
        { id: 'cp-materials', html: renderMaterials }
      ]);
    });
    U.register('compose:tag-filter', function (ds, el) {
      state.tagFilter = el.value;
      paint([
        { id: 'cp-mat-filter', html: renderMatFilters },
        { id: 'cp-materials', html: renderMaterials }
      ]);
    });
    U.register('compose:clear-filter', function () {
      state.catFilter = '';
      state.tagFilter = '';
      paint([
        { id: 'cp-mat-filter', html: renderMatFilters },
        { id: 'cp-materials', html: renderMaterials }
      ]);
    });

    /* 在素材区点一份素材 → 中间栏浏览它的文件 */
    U.register('compose:file', function (ds) {
      state.materialId = ds.id;
      state.page = 1;
      paint([
        { id: 'cp-file', html: renderFilePane },
        { id: 'cp-materials', html: renderMaterials }     // 顺便把"当前打开的文件"标出来
      ]);
    });
    /* 视频：记住填的时间点（重新渲染后不丢） */
    U.register('compose:frame-time', function (ds, el) {
      state.frameTime = el.value;
    });

    U.register('compose:page', function (ds) {
      var dir = parseInt(ds.dir, 10) || 0;
      var e = allEntries().filter(function (x) { return x.id === state.materialId; })[0];
      if (!e) return;
      var total = e.scope === 'pages'
        ? (e.pages.length ? Math.max.apply(null, e.pages) : 0)
        : (e.pageCount || 1);
      var next = state.page + dir;
      if (next < 1 || next > total) return;
      state.page = next;
      paint([{ id: 'cp-file', html: renderFilePane }]);
    });

    /**
     * 插入本页：把中间正在浏览的那一页的原文，插到编排区当前章节的**光标处**。
     * 带上出处（档号 + 页码），插完直接改 textarea 的值（不重画），光标留在插入内容之后。
     */
    U.register('compose:insert-page', function () {
      var e = allEntries().filter(function (x) { return x.id === state.materialId; })[0];
      if (!e) { U.toast('先在左侧「素材区」打开一份素材，再插入本页', 'warn'); return; }
      var n = nodes().filter(function (x) { return x.id === state.nodeId; })[0];
      if (!n) { U.toast('先在左侧大纲里点一个章节，这一页会插到那一章里', 'warn'); return; }
      var ta = document.getElementById('cp-text');
      if (!ta) { U.toast('编排区没有可插入的位置', 'warn'); return; }

      var cat = S.catalogByArchiveNo(e.archiveNo);
      var body = (cat && (cat.fullText || cat.summary)) || '';
      if (!body) {
        U.toast('这份素材没有可插入的原文（原型不附实体扫描件）', 'warn');
        return;
      }
      pushUndo('插入本页');
      var from = (e.archiveNo ? '档号 ' + e.archiveNo : '本地上传') + '　第 ' + state.page + ' 页';
      var snippet = (ta.value && !/\n$/.test(ta.value) ? '\n' : '') + body + '\n（' + from + '）\n';

      /* 光标在编排区里就插在光标处；否则追加到正文末尾 ——
         ⚠️ 没聚焦的 textarea，selectionStart 是 0，直接用会把内容插到开头（很意外） */
      var focused = document.activeElement === ta;
      var start = focused && ta.selectionStart != null ? ta.selectionStart : ta.value.length;
      var end = focused && ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
      var next = ta.value.slice(0, start) + snippet + ta.value.slice(end);
      ta.value = next;
      var caret = start + snippet.length;
      ta.focus();
      ta.setSelectionRange(caret, caret);

      S.saveChapter(state.taskId, state.nodeId, next, { silent: true });
      state.dirty = true;
      var dirty = document.getElementById('cp-dirty');
      if (dirty) dirty.classList.remove('hidden');
      var ch = S.chapterOf(state.taskId, state.nodeId);
      var meta = document.getElementById('cp-meta');
      if (meta) meta.textContent = metaText(ch);
      paint([{ id: 'cp-write-tools', html: renderWriteTools }]);
      paintProgress();
      U.toast('已把「' + e.title + '」的 ' + from + ' 插入到章节「' + n.title + '」', 'ok');
    });

    /**
     * 插入帧：**只对视频类文件**。按填写的时间点抽帧，把帧标记插到编排区当前章节。
     * 时间点支持 83（秒）/ 1:23 / 00:01:23；素材著录了时长就做上限校验。
     */
    U.register('compose:insert-frame', function () {
      var e = allEntries().filter(function (x) { return x.id === state.materialId; })[0];
      if (!e || !isVideo(e)) { U.toast('「插入帧」只对视频类文件可用', 'warn'); return; }
      var n = nodes().filter(function (x) { return x.id === state.nodeId; })[0];
      if (!n) { U.toast('先在左侧大纲里点一个章节，这一帧会插到那一章里', 'warn'); return; }
      var ta = document.getElementById('cp-text');
      if (!ta) { U.toast('编排区没有可插入的位置', 'warn'); return; }

      var input = document.getElementById('cp-frame-time');
      state.frameTime = input ? input.value : state.frameTime;
      var parsed = parseTimePoint(state.frameTime);
      if (parsed.error) { U.toast(parsed.error, 'warn'); return; }
      var duration = (e.file && e.file.duration) || 0;
      if (duration && parsed.sec > duration) {
        U.toast('时间点 ' + parsed.text + ' 超出视频时长 ' + fmtDuration(duration), 'warn');
        return;
      }

      pushUndo('插入帧');
      var from = '（' + (e.archiveNo ? '档号 ' + e.archiveNo : '本地上传') + '　时间点 ' + parsed.text + '）';
      var snippet = (ta.value && !/\n$/.test(ta.value) ? '\n' : '') +
        '【录像帧：' + e.title + '　' + parsed.text + '】' + from + '\n';

      var focused = document.activeElement === ta;
      var start = focused && ta.selectionStart != null ? ta.selectionStart : ta.value.length;
      var end = focused && ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
      var next = ta.value.slice(0, start) + snippet + ta.value.slice(end);
      ta.value = next;
      var caret = start + snippet.length;
      ta.focus();
      ta.setSelectionRange(caret, caret);

      S.saveChapter(state.taskId, state.nodeId, next, { silent: true });
      state.dirty = true;
      /* 时间点规范化（输入 00:05:30 → 显示与插入都用 05:30），免得预览与正文写法不一致 */
      state.frameTime = parsed.text;
      var dirty = document.getElementById('cp-dirty');
      if (dirty) dirty.classList.remove('hidden');
      var meta = document.getElementById('cp-meta');
      if (meta) meta.textContent = metaText(S.chapterOf(state.taskId, state.nodeId));
      paint([{ id: 'cp-write-tools', html: renderWriteTools }]);
      paintProgress();
      /* 帧预览里显示的"当前时间点"跟着更新 */
      paint([{ id: 'cp-file', html: renderFilePane }]);
      U.toast('已把 ' + parsed.text + ' 处的帧插入到章节「' + n.title + '」', 'ok');
    });

    U.register('compose:save', function () { doSave(); });
    U.register('compose:preview', function () { doPreview(); });
    /* 撤销 / 恢复 / 清空：真能用的编辑与编排历史（Ctrl+Z 也走这套，见 bindEditor） */
    U.register('compose:undo', function () { doUndo(); });
    U.register('compose:redo', function () { doRedo(); });
    U.register('compose:clear', function () {
      var n = nodes().filter(function (x) { return x.id === state.nodeId; })[0];
      if (!n) { U.toast('先在左侧大纲里点一个章节', 'warn'); return; }
      if (!String(S.chapterOf(state.taskId, state.nodeId).text || '').trim()) {
        U.toast('章节「' + n.title + '」还没有正文', 'warn');
        return;
      }
      U.confirm({
        title: '清空「' + esc(n.title) + '」的正文？',
        content: '只清空这一章的正文，其他章节不受影响；清空后可以用「撤销」恢复。',
        okText: '清空正文'
      }).then(function (ok) {
        if (!ok) return;
        pushUndo('清空正文');
        S.saveChapter(state.taskId, state.nodeId, '', { silent: true });
        state.dirty = true;
        var ta = document.getElementById('cp-text');
        if (ta) { ta.value = ''; ta.focus(); }
        var dirty = document.getElementById('cp-dirty');
        if (dirty) dirty.classList.remove('hidden');
        var meta = document.getElementById('cp-meta');
        if (meta) meta.textContent = metaText(S.chapterOf(state.taskId, state.nodeId));
        paint([{ id: 'cp-write-tools', html: renderWriteTools }]);
        paintProgress();
        U.toast('已清空章节「' + n.title + '」的正文（可撤销）', 'ok');
      });
    });

    /* ---------------- 编排区的三个写作动作（都先弹窗填提示词/脚注） ---------------- */

    /** AI生成：弹提示词 → 本地模拟生成 → 插到光标处 */
    U.register('compose:ai-write', function () {
      var n = nodes().filter(function (x) { return x.id === state.nodeId; })[0];
      if (!n) { U.toast('先在左侧大纲里点一个章节', 'warn'); return; }
      var caret = captureCaret();
      U.modal({
        title: 'AI生成 · 插入到「' + esc(n.title) + '」',
        width: 620,
        okText: '生成并插入',
        body: '<div class="field"><label class="field-label" for="ai-prompt">提示词 *</label>' +
            '<textarea class="textarea input-sm" id="ai-prompt" rows="4" maxlength="500" ' +
              'placeholder="例如：写一段编者说明，交代本汇编的收录范围与时间断限，并引用 2 件民国时期教育档案"></textarea>' +
          '</div>' +
          '<div class="field-extra">插入位置：正文第 ' + (caret.start + 1) + ' 个字符处（打开弹窗前光标所在处）</div>' +
          '<div class="data-note">' + icon('info') +
            '<span>原型用<b>本地模拟生成</b>（不调用大模型）：按提示词 + 本章要点 + 已选素材拼出一段编者文字，' +
            '生成后插入到光标处，可再用「撤销」撤回。</span></div>',
        /* ⚠️ 用 onOk 而不是 U.modal(...).then()：U.modal 返回的是弹窗元素（不是 Promise），
           而且只有 onOk 返回 false 才能把弹窗留住（校验失败时不能关） */
        onOk: function (modalEl) {
          var el = modalEl.querySelector('#ai-prompt');
          var prompt = el ? el.value.trim() : '';
          if (!prompt) { U.toast('请先填写提示词', 'warn'); return false; }
          var out = App.mock.compose.generate(prompt, composeCtx());
          insertAtCaret(out.text, 'AI生成');
          U.toast('已按提示词生成 ' + out.text.length + ' 字并插入到光标处', 'ok');
          return true;
        }
      });
    });

    /** AI扩写：必须先在编排区选中内容 → 弹提示词 → 覆盖选中的原有内容 */
    U.register('compose:ai-expand', function () {
      var n = nodes().filter(function (x) { return x.id === state.nodeId; })[0];
      if (!n) { U.toast('先在左侧大纲里点一个章节', 'warn'); return; }
      var caret = captureCaret();
      if (!caret.text.trim()) {
        U.toast('请先在编排区选中要扩写的内容，再点「AI扩写」', 'warn');
        return;
      }
      var picked = caret.text;
      U.modal({
        title: 'AI扩写 · 选中的 ' + picked.length + ' 字',
        width: 620,
        okText: '扩写并覆盖',
        body: '<div class="field"><label class="field-label">选中的原有内容</label>' +
            '<div class="pick-quote">' + esc(picked.length > 160 ? picked.slice(0, 160) + '…' : picked) + '</div>' +
          '</div>' +
          '<div class="field"><label class="field-label" for="ai-expand-prompt">扩写要求 *</label>' +
            '<textarea class="textarea input-sm" id="ai-expand-prompt" rows="3" maxlength="300" ' +
              'placeholder="例如：补充这一时期的经费来源与数额，并注明档案出处"></textarea>' +
          '</div>' +
          '<div class="data-note">' + icon('info') +
            '<span>原型用<b>本地模拟生成</b>：保留选中的原文，按提示词补写背景 / 细节 / 意义，' +
            '<b>覆盖选中的原有内容</b>（可用「撤销」恢复到扩写前）。</span></div>',
        onOk: function (modalEl) {
          var el = modalEl.querySelector('#ai-expand-prompt');
          var prompt = el ? el.value.trim() : '';
          if (!prompt) { U.toast('请先填写扩写要求', 'warn'); return false; }
          /* 弹窗期间选区已失焦：用打开前记下的范围覆盖回去 */
          var ta = document.getElementById('cp-text');
          if (ta) ta.setSelectionRange(caret.start, caret.end);
          var out = App.mock.compose.expand(prompt, picked, composeCtx());
          replaceSelection(out.text, 'AI扩写');
          U.toast('已将选中的 ' + picked.length + ' 字扩写为 ' + out.text.length + ' 字并覆盖', 'ok');
          return true;
        }
      });
    });

    /** 添加脚注：弹窗写脚注 + 出处 → 光标处插序号标记，本章末尾登记【脚注】 */
    U.register('compose:add-footnote', function () {
      var n = nodes().filter(function (x) { return x.id === state.nodeId; })[0];
      if (!n) { U.toast('先在左侧大纲里点一个章节', 'warn'); return; }
      var caret = captureCaret();
      /* 默认出处取当前正在浏览的素材页（没有就留空） */
      var e = allEntries().filter(function (x) { return x.id === state.materialId; })[0];
      var defSource = e ? ((e.archiveNo ? '档号 ' + e.archiveNo : '本地上传') +
        (isVideo(e) ? '' : '　第 ' + state.page + ' 页')) : '';
      U.modal({
        title: '添加脚注 · 「' + esc(n.title) + '」',
        width: 620,
        okText: '插入脚注',
        body: '<div class="field"><label class="field-label" for="fn-text">脚注内容 *</label>' +
            '<textarea class="textarea input-sm" id="fn-text" rows="3" maxlength="300" ' +
              'placeholder="例如：此处数字据 1932 年学田租息清册统计，原件存市档案馆"></textarea>' +
          '</div>' +
          '<div class="field"><label class="field-label" for="fn-source">出处（选填）</label>' +
            '<input class="input input-sm" id="fn-source" maxlength="80" value="' + esc(defSource) + '" ' +
              'placeholder="档号 / 页码 / 卷宗名"></div>' +
          '<div class="data-note">' + icon('info') +
            '<span>插入后：正文光标处出现序号标记 <b>①</b>，并在本章末尾的<b>【脚注】</b>区登记这一条（可撤销）。</span></div>',
        onOk: function (modalEl) {
          var tel = modalEl.querySelector('#fn-text');
          var sel = modalEl.querySelector('#fn-source');
          var fnText = tel ? tel.value.trim() : '';
          var source = sel ? sel.value.trim() : '';
          if (!fnText) { U.toast('请先填写脚注内容', 'warn'); return false; }
          var no = nextFootnoteNo();
          /* 顺序要紧：先插序号标记（它自己会记一步撤销），再登记脚注正文 */
          insertAtCaret(footnoteMark(no), '添加脚注');
          appendFootnote(no, fnText, source);
          U.toast('已插入脚注 ' + footnoteMark(no) + ' 并在本章末尾登记', 'ok');
          return true;
        }
      });
    });

    /* 摘录按钮：本轮只生成按钮（评审要求），点了说清楚 */
    U.register('compose:extract-manual', function () {
      U.toast('「手动摘录」的编排界面尚未生成：本轮先生成按钮与三栏工作台', 'warn');
    });
    U.register('compose:extract-ai', function () {
      U.toast('「AI自动摘录」的编排界面尚未生成：本轮先生成按钮与三栏工作台', 'warn');
    });
  }

  /* Esc 退出全屏工作台（弹层打开时先关弹层） */
  function bindKeys() {
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !open()) return;
      if (document.querySelector('.modal')) return;   // 预览弹层自己处理
      close();
    });
  }

  App.taskCompose = {
    open: doOpen,
    close: close,
    isOpen: open,
    register: register,
    bindKeys: bindKeys,
    /* 供验证脚本读取内部状态 */
    state: function () {
      return {
        taskId: state.taskId, nodeId: state.nodeId, pane: state.pane,
        materialId: state.materialId, page: state.page,
        catFilter: state.catFilter, tagFilter: state.tagFilter,
        navCollapsed: state.navCollapsed, dirty: state.dirty
      };
    }
  };
})(window);
