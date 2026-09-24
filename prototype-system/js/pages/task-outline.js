/* ==========================================================================
   编研任务 · 第 1 阶段「生成大纲」工作界面

   评审要求（逐条对应实现）：
     1. 显示在进度条下方，左右分栏：左 40%（上：提示词；下：模型思考和推理过程），
        右 60%（AI 生成的大纲结果）
     2. 写提示词 →「AI生成大纲」→ 右侧生成大纲；标题保持层级关系，每个标题都有
        「主要内容说明」；已有大纲时再次点击先确认
        「AI重新生成大纲会覆盖已有大纲内容，是否确定重新生成」
     3. 每个标题：左侧折叠/展开按钮（折叠本章节标题与内容说明）；右侧按钮下拉
        「重新生成当前标题及内容说明 / 重新生成子标题及内容说明」，点后先输入 prompt
     4. 右侧允许自己编写：多级标题选择器（一级/二级/三级）+ 标题与内容说明可直接编辑
     5. 支持 10 步以内的撤销 / 恢复（类似 Word）

   实现约束（重要）：
     · 全站是「store 一变就整页重渲染」，所以**文本输入不能走 notify**：
       input 事件里就地改 store 并 silent 落库（saveOutline 的 silent 选项），
       change（失焦）时才记一步撤销。否则每敲一个字光标就丢，按钮点击也会被
       重渲染吃掉（mousedown → blur → change → 重渲染 → click 落在已摘除的元素上）。
     · 「生成中」的逐行思考是用 setTimeout 就地更新 #ol-thinking 这一段 DOM，
       生成结束时才 notify 整页重渲染 —— 只为一处动画不值得破坏渲染模型。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var MAX_HISTORY = 10;
  var MAX_LEVEL = (App.mock.outline && App.mock.outline.maxLevel) || 8;
  var LEVEL_LABEL = App.mock.outline.levelLabels || [];
  var THINK_STEP_MS = 300;      // 思考过程逐行出现的间隔

  /* 撤销 / 恢复：只作用于**大纲内容**（标题与内容说明），不含提示词与思考过程 */
  var hist = { taskId: null, past: [], future: [], editBase: null };
  /* 生成中的任务（只存在内存里，刷新即视为未在生成） */
  var busy = null;
  /* 当前点选的标题（"在前/在后添加"的参照物）+ 所属任务 */
  var sel = { taskId: null, id: null };
  /* 拖动排序的现场状态 */
  var drag = null;
  /* 当前渲染的任务号：拖动横跨 mousedown → mousemove → mouseup，拿不到闭包里的 t，记在模块上 */
  var outlineTaskId = null;

  function levelLabel(lv) { return LEVEL_LABEL[lv - 1] || (lv + ' 级标题'); }

  function ensureSel(taskId) {
    if (sel.taskId !== taskId) { sel.taskId = taskId; sel.id = null; }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function ensureHist(taskId) {
    if (hist.taskId !== taskId) {
      hist.taskId = taskId;
      hist.past = [];
      hist.future = [];
      hist.editBase = null;
    }
  }

  function pushHistory(taskId, nodes) {
    ensureHist(taskId);
    hist.past.push(clone(nodes));
    while (hist.past.length > MAX_HISTORY) hist.past.shift();
    hist.future.length = 0;
  }

  /**
   * 先记一步撤销、再动 store。
   * ⚠️ 顺序不能反：store 的写操作内部会 notify() **同步**渲染一次，
   *    把 pushHistory 放到后面，那次渲染里"撤销/恢复"按钮还是旧状态（按钮看着不可用）。
   *    失败时把刚压进去的那一步弹掉，不留幽灵撤销。
   */
  function commit(taskId, mutate) {
    pushHistory(taskId, S.outlineOf(taskId).nodes);
    var res = mutate();
    if (res && res.ok === false) {
      hist.past.pop();
      if (res.message) U.toast(res.message, 'warn');
      return null;
    }
    return res;
  }

  function findNode(rec, id) {
    return (rec.nodes || []).filter(function (n) { return n.id === id; })[0] || null;
  }

  /** 层级编号：一级 1. / 二级 1.1 / … / 八级 1.1.1.1.1.1.1.1（按顺序算，折叠不影响编号） */
  function numbering(nodes) {
    var counters = [];
    var map = {};
    for (var i = 0; i < MAX_LEVEL; i++) counters.push(0);
    nodes.forEach(function (n) {
      counters[n.level - 1] += 1;
      for (var i = n.level; i < MAX_LEVEL; i++) counters[i] = 0;
      map[n.id] = counters.slice(0, n.level).join('.') + (n.level === 1 ? '.' : '');
    });
    return map;
  }

  /** 折叠后要隐藏的节点：被折叠节点的所有后代都不渲染 */
  function visibleNodes(nodes) {
    var hideFrom = 0, out = [];
    nodes.forEach(function (n) {
      if (hideFrom && n.level > hideFrom) return;
      hideFrom = 0;
      if (n.collapsed) hideFrom = n.level;
      out.push(n);
    });
    return out;
  }

  function hasKids(nodes, node) {
    var i = nodes.indexOf(node);
    return !!(nodes[i + 1] && nodes[i + 1].level > node.level);
  }

  /* ------------------------------------------------------------ 片段 */

  function renderPrompt(t, rec) {
    var chars = (rec.prompt || '').length;
    return '<section class="ol-panel">' +
      '<div class="ol-panel-head">' +
        '<span class="ol-panel-title">' + icon('file-text') + '提示词（Prompt）</span>' +
        '<span class="spacer"></span>' +
        '<span class="ol-count">' + (chars ? chars + ' 字' : '未填写') + '</span>' +
      '</div>' +
      '<div class="ol-panel-body">' +
        '<label class="sr-only" for="ol-prompt">编研意图提示词</label>' +
        '<textarea class="textarea ol-prompt" id="ol-prompt" rows="8" ' +
          'data-edit="prompt" data-task="' + esc(t.id) + '" ' +
          'placeholder="说明编研意图、收录范围与体例要求，例如：&#10;' +
          '按「学制变迁—学校沿革—教育人物」三条线索编排，' +
          '重点保证民国时期教育史料的完整性，标题控制在 12 字以内。">' +
          esc(rec.prompt || '') + '</textarea>' +
        '<div class="ol-panel-foot">' +
          '<span class="ol-hint">提示词越具体，大纲越贴合编研要求；也可以直接自己编写右侧大纲。</span>' +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn btn-primary" data-action="outline:generate" ' +
            'data-task="' + esc(t.id) + '"' + (busy === t.id ? ' aria-disabled="true"' : '') + '>' +
            (busy === t.id ? icon('rotate-cw') + '生成中…' : icon('sparkles') + 'AI生成大纲') + '</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function renderThinking(t, rec) {
    var lines = rec.thinking || [];
    var body = lines.length
      ? lines.map(function (line) {
          var isSep = line.indexOf('——') === 0;
          return '<div class="think-line' + (isSep ? ' sep' : '') + '">' +
            '<span class="think-dot"></span><span>' + esc(line) + '</span></div>';
        }).join('')
      : '<div class="ol-empty-mini">' +
          (busy === t.id ? '正在思考…' : '还没有推理过程。写好提示词后点「AI生成大纲」，这里会显示模型的思考与推理步骤。') +
        '</div>';

    return '<section class="ol-panel ol-panel-grow">' +
      '<div class="ol-panel-head">' +
        '<span class="ol-panel-title">' + icon('activity') + '模型思考和推理过程</span>' +
        '<span class="spacer"></span>' +
        (busy === t.id ? U.tag('思考中', 'tag-accent') : '') +
        U.tag('AI 预置结果', 'tag-warn') +
      '</div>' +
      '<div class="ol-panel-body">' +
        '<div class="thinking" id="ol-thinking" aria-live="polite">' + body + '</div>' +
        '<div class="ol-hint" style="margin-top:var(--s2)">演示环境：思考过程与大纲均为预置结果，未调用真实模型。</div>' +
      '</div>' +
    '</section>';
  }

  function renderNode(t, rec, n, nums) {
    var kids = hasKids(rec.nodes, n);
    var menuId = 'ol-menu-' + n.id;
    var level = levelLabel(n.level);
    var isSel = sel.taskId === t.id && sel.id === n.id;

    return '<div class="ol-node lv' + n.level + (n.collapsed ? ' is-collapsed' : '') +
        (isSel ? ' is-selected' : '') + '" data-node="' + esc(n.id) + '" data-level="' + n.level + '">' +
      '<div class="ol-node-head">' +
        /* 拖动手柄单独放一个（不从标题输入框起拖，否则会和选词冲突） */
        '<span class="ol-grip" data-drag="' + esc(n.id) + '" title="按住拖动可调整位置" ' +
          'aria-label="拖动' + esc(n.title || '本章节') + '">' + icon('grip-vertical') + '</span>' +
        '<button type="button" class="ol-fold" data-action="outline:fold" data-task="' + esc(t.id) + '" ' +
          'data-id="' + esc(n.id) + '" aria-expanded="' + (n.collapsed ? 'false' : 'true') + '" ' +
          'aria-label="' + (n.collapsed ? '展开' : '折叠') + esc(n.title || '本章节') + '">' +
          icon(n.collapsed ? 'chevron-right' : 'chevron-down') + '</button>' +
        '<span class="ol-num tnum">' + esc(nums[n.id] || '') + '</span>' +
        '<label class="sr-only" for="ol-title-' + esc(n.id) + '">' + esc(level) + '</label>' +
        '<input class="ol-title" id="ol-title-' + esc(n.id) + '" type="text" ' +
          'data-edit="title" data-task="' + esc(t.id) + '" data-id="' + esc(n.id) + '" ' +
          'value="' + esc(n.title) + '" placeholder="请输入标题">' +
        '<span class="ol-level">' + esc(level) + '</span>' +
        '<span class="ol-menu-wrap">' +
          '<button type="button" class="icon-btn" data-action="ui:menu" data-menu-trigger="' + menuId + '" ' +
            'aria-haspopup="true" aria-expanded="false" aria-label="章节操作">' + icon('more-vertical') + '</button>' +
          '<div class="menu hidden" id="' + menuId + '" role="menu">' +
            '<button type="button" class="menu-item" data-action="outline:regen" data-mode="node" ' +
              'data-task="' + esc(t.id) + '" data-id="' + esc(n.id) + '">' +
              icon('refresh') + '<span>重新生成当前标题及内容说明</span></button>' +
            '<button type="button" class="menu-item" data-action="outline:regen" data-mode="sub" ' +
              'data-task="' + esc(t.id) + '" data-id="' + esc(n.id) + '"' +
              (kids ? '' : ' aria-disabled="true" title="本标题没有子标题"') + '>' +
              icon('list-tree') + '<span>重新生成子标题及内容说明</span></button>' +
            '<div class="menu-sep"></div>' +
            '<button type="button" class="menu-item danger" data-action="outline:delete" ' +
              'data-task="' + esc(t.id) + '" data-id="' + esc(n.id) + '">' +
              icon('trash') + '<span>删除当前章节</span></button>' +
          '</div>' +
        '</span>' +
      '</div>' +
      '<div class="ol-node-body">' +
        '<label class="sr-only" for="ol-note-' + esc(n.id) + '">主要内容说明</label>' +
        '<textarea class="ol-note" id="ol-note-' + esc(n.id) + '" rows="2" ' +
          'data-edit="note" data-task="' + esc(t.id) + '" data-id="' + esc(n.id) + '" ' +
          'placeholder="填写本章节的主要内容说明（这一章主要写什么）">' + esc(n.note) + '</textarea>' +
      '</div>' +
    '</div>';
  }

  /** 大纲结构统计：各级标题数量（只显示有值的级别） */
  function tallyText(nodes) {
    var parts = [];
    for (var lv = 1; lv <= MAX_LEVEL; lv++) {
      var n = nodes.filter(function (x) { return x.level === lv; }).length;
      if (n) parts.push(n);
    }
    return '共 ' + nodes.length + ' 个标题（' + parts.join(' / ') + '）';
  }

  function renderResult(t, rec) {
    var nums = numbering(rec.nodes);
    var list = visibleNodes(rec.nodes);
    var canUndo = hist.past.length;
    var canRedo = hist.future.length;
    var hasSel = !!(sel.taskId === t.id && sel.id && findNode(rec, sel.id));

    var body = rec.nodes.length
      ? list.map(function (n) { return renderNode(t, rec, n, nums); }).join('')
      : '<div class="ol-empty">' +
          '<div class="ol-empty-title">右侧还没有大纲</div>' +
          '<div class="ol-empty-text">在左侧写清编研意图与体例要求，点「AI生成大纲」由模型生成；' +
            '也可以直接选好级别后「在前添加 / 在后添加」自己编写。</div>' +
        '</div>';

    return '<section class="ol-panel ol-panel-result">' +
      '<div class="ol-panel-head">' +
        '<span class="ol-panel-title">' + icon('list-tree') + '大纲结果</span>' +
        '<span class="spacer"></span>' +
        (rec.nodes.length ? U.tag(tallyText(rec.nodes), 'tag-ok') : U.tag('未生成', '')) +
        /* 撤销 / 恢复的步数紧贴「撤销」按钮，改动量一眼能看到 */
        '<span class="ol-count" id="ol-hist">可撤销 ' + canUndo + ' / ' + MAX_HISTORY +
          ' 步，可恢复 ' + canRedo + ' 步</span>' +
        '<button type="button" class="btn btn-sm" data-action="outline:undo" data-task="' + esc(t.id) + '"' +
          (canUndo ? '' : ' aria-disabled="true"') + ' title="撤销上一步（上限 ' + MAX_HISTORY + ' 步）">' +
          icon('rotate-ccw') + '撤销</button>' +
        '<button type="button" class="btn btn-sm" data-action="outline:redo" data-task="' + esc(t.id) + '"' +
          (canRedo ? '' : ' aria-disabled="true"') + ' title="恢复被撤销的一步">' +
          icon('rotate-cw') + '恢复</button>' +
        '<button type="button" class="btn btn-sm" data-action="outline:clear" data-task="' + esc(t.id) + '"' +
          (rec.nodes.length ? '' : ' aria-disabled="true"') +
          ' title="清空全部标题与内容说明（提示词保留，可用撤销恢复）">' +
          icon('trash') + '清空</button>' +
      '</div>' +

      '<div class="ol-tools">' +
        '<div class="ol-tools-row">' +
          '<label class="ol-tools-label" for="ol-level">插入标题</label>' +
          '<select class="select select-inline" id="ol-level">' +
            LEVEL_LABEL.map(function (label, i) {
              return '<option value="' + (i + 1) + '">' + esc(label) + '</option>';
            }).join('') +
          '</select>' +
          '<button type="button" class="btn btn-sm" data-action="outline:add-before" data-task="' + esc(t.id) + '"' +
            (hasSel || !rec.nodes.length ? '' : ' aria-disabled="true"') + ' title="插在选中标题之前（同级）">' +
            icon('arrow-left') + '在前添加</button>' +
          '<button type="button" class="btn btn-sm" data-action="outline:add-after" data-task="' + esc(t.id) + '"' +
            (hasSel || !rec.nodes.length ? '' : ' aria-disabled="true"') + ' title="插在选中标题（含其子标题）之后（同级）">' +
            '在后添加' + icon('arrow-right') + '</button>' +
          '<button type="button" class="btn btn-sm" data-action="outline:collapse-all" data-task="' + esc(t.id) + '"' +
            (rec.nodes.length ? '' : ' aria-disabled="true"') + ' title="折叠全部章节，只留标题行">' +
            icon('chevrons-up') + '全部折叠</button>' +
          '<button type="button" class="btn btn-sm" data-action="outline:expand-all" data-task="' + esc(t.id) + '"' +
            (rec.nodes.length ? '' : ' aria-disabled="true"') + ' title="展开全部章节与内容说明">' +
            icon('chevrons-down') + '全部展开</button>' +
          '<span class="spacer"></span>' +
        '</div>' +
      '</div>' +

      '<div class="ol-list" id="ol-list">' + body + '</div>' +
    '</section>';
  }

  /** 第 1 阶段的工作界面（由 task.js 在进度条下方调用） */
  function render(t) {
    ensureHist(t.id);
    ensureSel(t.id);
    outlineTaskId = t.id;
    var rec = S.outlineOf(t.id);
    if (sel.id && !findNode(rec, sel.id)) sel.id = null;   // 选中的标题被删/被覆盖后清掉
    return '<section class="card outline-step" data-task="' + esc(t.id) + '">' +
      '<div class="card-head">' +
        '<span>第 1 阶段 · 生成大纲</span>' +
        '<span class="spacer"></span>' +
        '<span class="head-note">提示词 → AI 生成 → 人工修改，标题层级与内容说明都可编辑</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="outline-layout">' +
          '<div class="ol-col ol-col-left">' + renderPrompt(t, rec) + renderThinking(t, rec) + '</div>' +
          '<div class="ol-col ol-col-right">' + renderResult(t, rec) + '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /** 只重画左侧思考区（生成中逐行出现，不整页重渲染） */
  function paintThinking(taskId) {
    var box = document.getElementById('ol-thinking');
    if (!box) return;
    var rec = S.outlineOf(taskId);
    var lines = rec.thinking || [];
    box.innerHTML = lines.length
      ? lines.map(function (line) {
          var isSep = line.indexOf('——') === 0;
          return '<div class="think-line' + (isSep ? ' sep' : '') + '">' +
            '<span class="think-dot"></span><span>' + esc(line) + '</span></div>';
        }).join('')
      : '<div class="ol-empty-mini">正在思考…</div>';
    box.scrollTop = box.scrollHeight;
  }

  /** 就地刷新撤销/恢复按钮与计数（文本编辑不整页重渲染，这类状态得手工同步） */
  function paintHistUI(taskId) {
    var wrap = document.querySelector('.outline-step');
    if (!wrap) return;
    var undo = wrap.querySelector('[data-action="outline:undo"]');
    var redo = wrap.querySelector('[data-action="outline:redo"]');
    if (undo) {
      if (hist.past.length) undo.removeAttribute('aria-disabled');
      else undo.setAttribute('aria-disabled', 'true');
    }
    if (redo) {
      if (hist.future.length) redo.removeAttribute('aria-disabled');
      else redo.setAttribute('aria-disabled', 'true');
    }
    var counter = document.getElementById('ol-hist');
    if (counter) {
      counter.textContent = '可撤销 ' + hist.past.length + ' / ' + MAX_HISTORY +
        ' 步，可恢复 ' + hist.future.length + ' 步';
    }
  }

  /* ------------------------------------------------------------ 生成 */

  function runGenerate(t, rec) {
    var plan = App.mock.outline.build(t, rec.prompt, {
      materials: S.materials().length,
      generation: rec.regenSeq || 0        // 每次整篇重新生成，写法轮换一种
    });
    busy = t.id;
    S.saveOutline(t.id, { thinking: [], nodes: rec.nodes }, { silent: true });
    paintThinking(t.id);
    var btn = document.querySelector('[data-action="outline:generate"]');
    if (btn) {
      btn.setAttribute('aria-disabled', 'true');
      btn.innerHTML = icon('rotate-cw') + '生成中…';
    }

    var i = 0;
    (function tick() {
      i += 1;
      S.saveOutline(t.id, { thinking: plan.thinking.slice(0, i) }, { silent: true });
      paintThinking(t.id);
      if (i < plan.thinking.length) {
        global.setTimeout(tick, THINK_STEP_MS);
        return;
      }
      global.setTimeout(function () {
        pushHistory(t.id, rec.nodes);
        busy = null;
        S.saveOutline(t.id, {
          nodes: plan.nodes,
          thinking: plan.thinking,
          regenSeq: (rec.regenSeq || 0) + 1,
          nextId: plan.nodes.length + 1
        });   // 不带 silent：整页重渲染，右侧出现新大纲
        U.toast('已生成大纲：' + plan.nodes.length + ' 个标题，均已附主要内容说明', 'ok');
      }, 360);
    })();
  }

  function doGenerate(taskId) {
    var t = S.getTask(taskId);
    if (!t || busy) return;
    var rec = S.outlineOf(taskId);
    if (rec.nodes.length) {
      U.confirm({
        title: '重新生成大纲？',
        content: 'AI重新生成大纲会覆盖已有大纲内容，是否确定重新生成？',
        okText: '重新生成'
      }).then(function (ok) {
        if (ok) runGenerate(t, S.outlineOf(taskId));
      });
      return;
    }
    runGenerate(t, rec);
  }

  /* ------------------------------------------------------------ 单标题重新生成 */

  function openRegenDialog(taskId, nodeId, mode) {
    var rec = S.outlineOf(taskId);
    var node = findNode(rec, nodeId);
    if (!node) return;
    var isSub = mode === 'sub';
    var kids = 0;
    if (isSub) {
      var idx = rec.nodes.indexOf(node);
      for (var i = idx + 1; i < rec.nodes.length && rec.nodes[i].level > node.level; i++) kids += 1;
    }
    var title = node.title || '（未命名标题）';

    U.modal({
      title: isSub ? '重新生成子标题及内容说明' : '重新生成当前标题及内容说明',
      width: 640,
      okText: '重新生成',
      body:
        '<div class="field">' +
          '<label class="field-label">对象</label>' +
          '<div class="regen-target">' + icon('list-tree') +
            '<span>' + esc(title) + '（' + esc(LEVEL_LABEL[node.level] || '') + '）' +
            (isSub ? '　及其 ' + kids + ' 个子标题' : '') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label" for="ol-regen-prompt">提示词（Prompt）<span class="req">*</span></label>' +
          '<textarea class="textarea" id="ol-regen-prompt" rows="4" ' +
            'placeholder="说明这次想怎么改，例如：按学制改革分段叙述，补充女子教育的记载"></textarea>' +
          '<div class="field-extra">' +
            '重新生成会保持标题层级与编号不变，只重写' + (isSub ? '该标题及其子标题' : '该标题') +
            '的标题措辞与内容说明；不满意可以点右上角「撤销」回退。' +
          '</div>' +
        '</div>',
      onOk: function (el) {
        var prompt = el.querySelector('#ol-regen-prompt').value.trim();
        if (!prompt) { U.toast('请先输入提示词', 'warn'); return false; }
        var cur = S.outlineOf(taskId);
        var res = App.mock.outline.regenerate(cur, nodeId, mode, prompt);
        if (!res.targets) { U.toast('没有找到要重新生成的标题', 'warn'); return false; }
        pushHistory(taskId, cur.nodes);
        S.saveOutline(taskId, {
          nodes: res.nodes,
          thinking: res.thinking,
          regenSeq: (cur.regenSeq || 0) + 1
        });
        U.toast('已重新生成 ' + res.targets + ' 个标题及内容说明', 'ok');
        return true;
      }
    });
  }

  /* ------------------------------------------------------------ 交互 */

  /** 文本输入：就地改活对象 + 静默落库（不 notify，保光标） */
  function onEditInput(ev) {
    var el = ev.target;
    var kind = el.getAttribute('data-edit');
    var taskId = el.getAttribute('data-task');
    if (!kind || !taskId) return;
    ensureHist(taskId);
    var rec = S.outlineOf(taskId);
    if (!hist.editBase) hist.editBase = clone(rec.nodes);
    if (kind === 'prompt') {
      S.setOutlinePrompt(taskId, el.value, { silent: true });
    } else {
      /* outlineOf() 返回活对象：就地改字段，再静默落库 */
      var n = findNode(rec, el.getAttribute('data-id'));
      if (!n) return;
      n[kind] = el.value;
      S.saveOutline(taskId, {}, { silent: true });
    }
    var counter = document.getElementById('ol-hist');
    if (counter && kind !== 'prompt') {
      counter.textContent = '可撤销 ' + Math.min(hist.past.length + 1, MAX_HISTORY) + ' / ' + MAX_HISTORY +
        ' 步，可恢复 0 步';
    }
  }

  /** 失焦提交：把这次编辑记成一步撤销（Word 里一次连续输入 = 一步） */
  function onEditCommit(ev) {
    var el = ev.target;
    var taskId = el.getAttribute('data-task');
    if (!el.getAttribute('data-edit') || !taskId) return;
    ensureHist(taskId);
    if (hist.editBase) {
      var before = hist.editBase;
      hist.editBase = null;
      if (JSON.stringify(before) !== JSON.stringify(S.outlineOf(taskId).nodes)) {
        hist.past.push(before);
        while (hist.past.length > MAX_HISTORY) hist.past.shift();
        hist.future.length = 0;
      }
    }
    S.saveOutline(taskId, {}, { silent: true });
    paintHistUI(taskId);
  }

  function bindEditors(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-edit]'), function (el) {
      el.addEventListener('input', onEditInput);
      el.addEventListener('change', onEditCommit);
    });
  }

  /** 聚焦某个标题输入框（整页重渲染之后调用） */
  function focusTitle(nodeId) {
    var el = document.querySelector('[data-edit="title"][data-id="' + nodeId + '"]');
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus();
  }

  /** 整页渲染后由 task.js 调用：绑定编辑器 / 点选 / 拖动 */
  function mount(root) {
    if (!root || !root.querySelector('.outline-step')) return;
    bindEditors(root);
    bindSelect(root);
    bindDrag(root);
  }

  function doUndo(taskId) {
    ensureHist(taskId);
    if (!hist.past.length) return;
    var rec = S.outlineOf(taskId);
    hist.future.push(clone(rec.nodes));
    while (hist.future.length > MAX_HISTORY) hist.future.shift();
    var prev = hist.past.pop();
    S.setOutlineNodes(taskId, prev);
    U.toast('已撤销（可撤销 ' + hist.past.length + ' 步）', 'ok');
  }

  function doRedo(taskId) {
    ensureHist(taskId);
    if (!hist.future.length) return;
    var rec = S.outlineOf(taskId);
    hist.past.push(clone(rec.nodes));
    while (hist.past.length > MAX_HISTORY) hist.past.shift();
    var next = hist.future.pop();
    S.setOutlineNodes(taskId, next);
    U.toast('已恢复（可恢复 ' + hist.future.length + ' 步）', 'ok');
  }

  /* ------------------------------------------------------------ 点选与拖动 */

  /** 点选一个标题（只改内存里的选中态 + 就地刷新高亮，不整页重渲染，避免丢光标） */
  function selectNode(taskId, nodeId) {
    ensureSel(taskId);
    if (sel.id === nodeId) return;
    sel.id = nodeId;
    var wrap = document.querySelector('.outline-step');
    if (!wrap) return;
    Array.prototype.forEach.call(wrap.querySelectorAll('.ol-node'), function (el) {
      el.classList.toggle('is-selected', el.getAttribute('data-node') === nodeId);
    });
    /* 选中后把级别选择器切到该标题的级别：在前/在后添加默认是"加同级兄弟" */
    var rec = S.outlineOf(taskId);
    var n = findNode(rec, nodeId);
    if (n) {
      var lv = document.getElementById('ol-level');
      if (lv) lv.value = String(n.level);
    }
    ['.ol-panel-result [data-action="outline:add-before"]',
     '.ol-panel-result [data-action="outline:add-after"]'].forEach(function (sel2) {
      var b = wrap.querySelector(sel2);
      if (b) b.removeAttribute('aria-disabled');
    });
  }

  function clearSelectionIfDeleted(taskId, ids) {
    if (sel.taskId === taskId && ids.indexOf(sel.id) >= 0) sel.id = null;
  }

  /** 点选：标题输入框获得焦点、或鼠标按在标题行上，都算选中这一条 */
  function bindSelect(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.ol-node'), function (el) {
      var id = el.getAttribute('data-node');
      var head = el.querySelector('.ol-node-head');
      if (head) {
        head.addEventListener('mousedown', function (ev) {
          /* 点折叠按钮 / ⋮ / 手柄时不算"选中这一条"：
             否则折叠一下章节，级别选择器就会跟着跳，很意外 */
          if (ev.target.closest('button, .ol-menu-wrap, .ol-grip')) return;
          selectNode(outlineTaskId, id);
        });
      }
    });
    Array.prototype.forEach.call(root.querySelectorAll('.ol-title, .ol-note'), function (el) {
      el.addEventListener('focusin', function () {
        selectNode(el.getAttribute('data-task'), el.getAttribute('data-id'));
      });
    });
  }

  /** 拖动落点：把整棵子树挪到目标前 / 后，层级随目标（层级不符/挪进自己子树会被 store 拒绝） */
  function applyDrop(taskId, srcId, targetId, mode) {
    var res = commit(taskId, function () {
      return S.moveOutlineNode(taskId, srcId, targetId, mode);
    });
    if (!res) return false;
    U.toast(res.message, 'ok');
    return true;
  }

  function clearDropMarks() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.ol-node.drop-above, .ol-node.drop-below, .ol-node.drop-invalid'),
      function (el) { el.classList.remove('drop-above', 'drop-below', 'drop-invalid'); });
  }

  function endDrag() {
    if (!drag) return;
    clearDropMarks();
    var el = document.querySelector('.ol-node[data-node="' + drag.id + '"]');
    if (el) el.classList.remove('is-dragging');
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('keydown', onDragKey);
    drag = null;
  }

  function onDragKey(ev) {
    if (ev.key === 'Escape') endDrag();
  }

  function onDragMove(ev) {
    if (!drag) return;
    drag.moved = true;
    var under = document.elementFromPoint(ev.clientX, ev.clientY);
    var nodeEl = under && under.closest ? under.closest('.ol-node') : null;
    clearDropMarks();
    drag.overId = null;
    drag.invalid = false;
    if (!nodeEl) return;
    var id = nodeEl.getAttribute('data-node');
    /* 不能拖到自己身上，也不能拖进自己的子树 */
    var rec = S.outlineOf(drag.taskId);
    var srcIdx = -1, tgtIdx = -1;
    rec.nodes.forEach(function (n, i) {
      if (n.id === drag.id) srcIdx = i;
      if (n.id === id) tgtIdx = i;
    });
    if (id === drag.id || tgtIdx < 0) return;
    for (var i = srcIdx + 1; i < rec.nodes.length && rec.nodes[i].level > rec.nodes[srcIdx].level; i++) {
      if (rec.nodes[i].id === id) {
        /* 拖到自己的子标题上：不给"可放置"的提示线，改用红线和松手后的说明 */
        nodeEl.classList.add('drop-invalid');
        drag.invalid = true;
        return;
      }
    }
    var head = nodeEl.querySelector('.ol-node-head');
    var box = (head || nodeEl).getBoundingClientRect();
    var mode = ev.clientY < box.top + box.height / 2 ? 'before' : 'after';
    nodeEl.classList.add(mode === 'before' ? 'drop-above' : 'drop-below');
    drag.overId = id;
    drag.mode = mode;
  }

  function onDragEnd() {
    if (!drag) return;
    var d = { taskId: drag.taskId, id: drag.id, overId: drag.overId, mode: drag.mode, invalid: drag.invalid };
    endDrag();
    if (d.overId) applyDrop(d.taskId, d.id, d.overId, d.mode);
    else if (d.invalid) U.toast('不能把章节移动到它自己的子标题里', 'warn');
  }

  function bindDrag(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.ol-grip'), function (el) {
      el.addEventListener('mousedown', function (ev) {
        ev.preventDefault();                        // 别触发选词
        var nodeEl = el.closest('.ol-node');
        if (!nodeEl) return;
        var taskId = outlineTaskId;      // 当前渲染的任务号（mount 时记下的）
        drag = { taskId: taskId, id: nodeEl.getAttribute('data-node'), moved: false, overId: null, mode: 'before' };
        nodeEl.classList.add('is-dragging');
        selectNode(taskId, drag.id);
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('keydown', onDragKey);
      });
    });
  }

  /* ------------------------------------------------------------ 登记 */

  function register() {
    U.register('outline:generate', function (ds) { doGenerate(ds.task); });

    U.register('outline:fold', function (ds) {
      var rec = S.outlineOf(ds.task);
      var n = findNode(rec, ds.id);
      if (!n) return;
      n.collapsed = !n.collapsed;
      S.saveOutline(ds.task, {});      // 折叠不算内容变更，不进撤销栈
    });

    /* 全部折叠 / 全部展开 */
    U.register('outline:collapse-all', function (ds) { S.setOutlineCollapsed(ds.task, true); });
    U.register('outline:expand-all', function (ds) { S.setOutlineCollapsed(ds.task, false); });

    U.register('outline:regen', function (ds) {
      U.closeMenus();
      if (ds.mode === 'sub') {
        var rec = S.outlineOf(ds.task);
        var n = findNode(rec, ds.id);
        if (n && !hasKids(rec.nodes, n)) {
          U.toast('本标题没有子标题，可改用「重新生成当前标题及内容说明」', 'warn');
          return;
        }
      }
      openRegenDialog(ds.task, ds.id, ds.mode);
    });

    /* 删除当前章节（含子标题）：先确认，再记一步撤销 */
    U.register('outline:delete', function (ds) {
      U.closeMenus();
      var rec = S.outlineOf(ds.task);
      var n = findNode(rec, ds.id);
      if (!n) return;
      var idx = rec.nodes.indexOf(n);
      var kids = 0;
      for (var i = idx + 1; i < rec.nodes.length && rec.nodes[i].level > n.level; i++) kids += 1;
      U.confirm({
        title: '删除当前章节？',
        content: '将删除「' + esc(n.title || '未命名标题') + '」' +
          (kids ? '及其 ' + kids + ' 个子标题' : '') +
          '。删除后可以用「撤销」恢复。',
        okText: '删除'
      }).then(function (ok) {
        if (!ok) return;
        var res = commit(ds.task, function () { return S.deleteOutlineNode(ds.task, ds.id); });
        if (!res) return;
        clearSelectionIfDeleted(ds.task, res.ids);
        U.toast(res.message, 'ok');
      });
    });

    /* 在前 / 在后添加：以点选的标题为参照物 */
    function addRelative(taskId, mode) {
      var rec = S.outlineOf(taskId);
      var levelSel = document.getElementById('ol-level');
      var level = levelSel ? parseInt(levelSel.value, 10) : 1;
      if (!(level >= 1 && level <= MAX_LEVEL)) level = 1;
      var anchor = (sel.taskId === taskId && sel.id) ? sel.id : null;
      if (!anchor && rec.nodes.length) {
        U.toast('请先点选一个标题，再选择「在前添加」或「在后添加」', 'warn');
        return;
      }
      /* ⚠️ insertOutlineNode 内部会 saveOutline → notify → 整页重渲染，
         所以"聚焦新标题"必须在它返回之后、直接在新 DOM 上做 ——
         提前把 id 写进 pendingFocus 是来不及的（渲染已经发生过了）。 */
      var res = commit(taskId, function () {
        return S.insertOutlineNode(taskId, {
          level: level,
          at: anchor ? { mode: mode, id: anchor } : { mode: 'end' }
        });
      });
      if (!res) return;
      sel.id = res.id;          // 新标题就是下一次添加的参照物，连续添加很顺手
      focusTitle(res.id);
      U.toast(res.message + '，请填写标题与内容说明', 'ok');
    }

    U.register('outline:add-before', function (ds) { addRelative(ds.task, 'before'); });
    U.register('outline:add-after', function (ds) { addRelative(ds.task, 'after'); });

    /* 清空：只清大纲与思考过程，**保留提示词**（方便用同一提示词重新生成），进撤销栈 */
    U.register('outline:clear', function (ds) {
      var rec = S.outlineOf(ds.task);
      if (!rec.nodes.length) return;
      U.confirm({
        title: '清空大纲？',
        content: '将删除全部 ' + rec.nodes.length + ' 个标题及其内容说明（提示词保留）。' +
          '清空后可以用「撤销」恢复。',
        okText: '清空'
      }).then(function (ok) {
        if (!ok) return;
        sel.id = null;
        commit(ds.task, function () {
          /* 直接用 saveOutline 而不是 store 的 clearOutline：
             后者会把 nextId 重置为 1，撤销恢复后又新增就可能撞 id */
          return S.saveOutline(ds.task, { nodes: [], thinking: [] });
        });
        U.toast('已清空大纲，可用「撤销」恢复', 'ok');
      });
    });

    U.register('outline:undo', function (ds) { doUndo(ds.task); });
    U.register('outline:redo', function (ds) { doRedo(ds.task); });
  }

  App.taskOutline = {
    render: render,
    mount: mount,
    register: register,
    /* 供验证脚本读取：撤销/恢复栈长度与当前选中项 */
    history: function () {
      return {
        past: hist.past.length, future: hist.future.length, taskId: hist.taskId,
        selected: sel.id, dragging: !!drag
      };
    }
  };
})(window);
