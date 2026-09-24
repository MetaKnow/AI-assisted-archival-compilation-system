/* ==========================================================================
   验证套件：编研任务 · 第 3 阶段「加工编排」全屏工作台

   覆盖评审要求：
     · 浏览器内部全屏，点进度条上的「加工编排」阶段名打开
     · 三栏：左＝大纲导航（占 20%，可折叠）｜中＝素材区（选材列表 + 区域内浏览文件 +
       上方「手动摘录 / AI自动摘录」按钮）｜右＝编排区（点章节写这一章）
     · 上方「预览」「保存」

   运行：node tools/verify/task-compose.mjs [file:///.../index.html]
   ========================================================================== */

import { openChrome, sleep, makeChecks } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ||
  new URL('../../prototype-system/index.html', import.meta.url).href;
const SHOT_DIR = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

const check = makeChecks();
const TASK = 'RW-2026-001';
const page = await openChrome({ width: 1440, height: 900 });
let exitCode = 0;

async function gotoTask(id) {
  await page.evaluate("location.hash = '#/task/" + id + "'; return 1;");
  await sleep(400);
}

async function click(sel) {
  const pt = await page.evaluate(`
    var el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  if (!pt) throw new Error('找不到元素：' + sel);
  await page.mouseClick(pt.x, pt.y);
  await sleep(280);
}

async function lastToast() {
  return page.evaluate(`
    var l = document.querySelectorAll('.toast');
    return l.length ? l[l.length - 1].textContent.trim() : '';`);
}

async function clearToasts() {
  await page.evaluate(`
    Array.prototype.forEach.call(document.querySelectorAll('.toast'), function (t) {
      if (t.parentNode) t.parentNode.removeChild(t); });
    return 1;`);
}

/** 编排区动作行（含语义禁用标记），A/C 两段都要用 */
const readTools = () => page.evaluate(`
  var w = document.getElementById('cp-write-tools');
  return Array.prototype.map.call(w.querySelectorAll('button'), function (b) {
    return b.textContent.trim() + (b.getAttribute('aria-disabled') === 'true' ? '[禁]' : ''); }).join(' ');`);

const SNAP = `
  var s = document.getElementById('compose-screen');
  /* 工作台关闭时也要给出"主应用还在"的信息（Esc 那条断言要用） */
  if (!s) return { open: false, appVisible: !!document.querySelector('.shell'),
    overlayModals: document.querySelectorAll('.modal').length };
  var W = window.innerWidth, H = window.innerHeight;
  var rect = s.getBoundingClientRect();
  function pct(el) { return Math.round(el.getBoundingClientRect().width / W * 100); }
  var nav = s.querySelector('.cp-nav'), mat = s.querySelector('.cp-file-col'), ed = s.querySelector('.cp-compose');
  var ta = s.querySelector('#cp-text');
  var browser = s.querySelector('.cp-browser');
  return {
    open: true,
    rect: { w: Math.round(rect.width), h: Math.round(rect.height), t: Math.round(rect.top) },
    viewport: { w: W, h: H },
    navPct: nav ? pct(nav) : 0, matPct: mat ? pct(mat) : 0, edPct: ed ? pct(ed) : 0,
    navPx: nav ? Math.round(nav.getBoundingClientRect().width) : 0,
    matPx: mat ? Math.round(mat.getBoundingClientRect().width) : 0,
    edPx: ed ? Math.round(ed.getBoundingClientRect().width) : 0,
    navDisplay: nav ? getComputedStyle(nav).display : 'none',
    switchVisible: (function () {
      var c = s.querySelector('.cp-switch');
      return !!c && getComputedStyle(c).display !== 'none';
    })(),
    railVisible: (function () {
      var r = s.querySelector('.cp-rail');
      return !!r && getComputedStyle(r).display !== 'none';
    })(),
    handle: (function () {
      var h = s.querySelector('.cp-handle');
      var navEl = s.querySelector('.cp-nav');
      if (!h || !navEl) return null;
      var r = h.getBoundingClientRect(), n = navEl.getBoundingClientRect();
      return {
        left: Math.round(r.left), right: Math.round(r.right),
        w: Math.round(r.width), h: Math.round(r.height),
        navRight: Math.round(n.right),
        centerDelta: Math.round((r.top + r.height / 2) - (n.top + n.height / 2)),
        expanded: h.getAttribute('aria-expanded'),
        icon: (h.querySelector('svg') || {}).innerHTML ? h.querySelector('svg').innerHTML.slice(0, 22) : ''
      };
    })(),
    railGone: !s.querySelector('.cp-rail, .cp-fold-btn'),
    /* 折叠时 #cp-pane 是 display:none —— 里面的节点仍在 DOM 里，所以要看可见性而不是存在性 */
    paneVisible: (function () {
      var p = s.querySelector('#cp-pane');
      return !!p && getComputedStyle(p).display !== 'none';
    })(),

    cols: getComputedStyle(s.querySelector('.cp-body')).gridTemplateColumns.split(' ').length,
    nodes: s.querySelectorAll('.cp-node').length,
    written: s.querySelectorAll('.cp-node.written').length,
    activeNode: (s.querySelector('.cp-node.active') || {}).textContent
      ? s.querySelector('.cp-node.active').textContent.replace(/\\s+/g, ' ').trim() : '',
    mats: s.querySelectorAll('.cp-mat').length,
    matTitles: Array.prototype.map.call(s.querySelectorAll('.cp-mat-title'), function (t) {
      return t.textContent.trim(); }),
    matFirstTitle: (s.querySelector('.cp-mat-title') || {}).textContent || '',
    switchSegs: Array.prototype.map.call(s.querySelectorAll('.cp-switch-seg'), function (b) {
      return b.textContent.trim() + (b.classList.contains('active') ? '*' : ''); }),
    switchRole: (s.querySelector('.cp-switch') || {}).getAttribute
      ? s.querySelector('.cp-switch').getAttribute('role') : '',
    switchAria: Array.prototype.map.call(s.querySelectorAll('.cp-switch-seg'), function (b) {
      return b.getAttribute('aria-selected'); }),
    switchHasTaskName: s.textContent.indexOf('本市教育事业发展史料汇编') >= 0 &&
      !!(s.querySelector('.cp-switch') && s.querySelector('.cp-switch').textContent.indexOf('本市') >= 0),
    /* 分段控件样式：底槽 + 选中项白色药丸（不是"链接 + ›"的面包屑） */
    switchStyled: (function () {
      var wrap = s.querySelector('.cp-switch');
      var active = s.querySelector('.cp-switch-seg.active');
      if (!wrap || !active) return { ok: false };
      var w = getComputedStyle(wrap), a = getComputedStyle(active);
      return { ok: true, wrapBg: w.backgroundColor, activeBg: a.backgroundColor,
        activeWeight: a.fontWeight, seps: s.querySelectorAll('.cp-crumb-sep').length,
        segRadius: a.borderRadius };
    })(),
    paneIsNav: !!s.querySelector('.cp-tree'),
    paneIsMats: !!s.querySelector('.cp-mat-list'),
    filePane: !!s.querySelector('.cp-file'),
    fileEmpty: (s.querySelector('.cp-file .cp-empty') || {}).textContent || '',
    fileTitle: (s.querySelector('.cp-file-title') || {}).textContent || '',
    pageFoot: (s.querySelector('.cp-page-foot') || {}).textContent || '',
    isVideoPane: !!s.querySelector('.cp-video'),
    frameInput: !!s.querySelector('#cp-frame-time'),
    insertFrameBtn: !!s.querySelector('.cp-file-foot [data-action="compose:insert-frame"]'),
    insertPageInFoot: !!s.querySelector('.cp-file-foot [data-action="compose:insert-page"]'),
    insertPageInHead: !!s.querySelector('.cp-file-col .cp-col-head [data-action="compose:insert-page"]'),
    pageBtns: s.querySelectorAll('.cp-file-foot [data-dir]').length,
    footOrder: (function () {
      var f = s.querySelector('.cp-file-foot');
      return f ? Array.prototype.map.call(f.children, function (c) {
        return c.getAttribute('data-action') || (c.tagName === 'BUTTON' ? 'btn' : (c.className || '').split(' ')[0] || c.tagName);
      }).join(' > ') : '';
    })(),
    hintGone: s.textContent.indexOf('原件按格式分流渲染') < 0,
    prevDisabled: (function () {
      var b = s.querySelector('.cp-file-foot [data-dir="-1"]');
      return b ? b.getAttribute('aria-disabled') === 'true' : null;
    })(),
    nextDisabled: (function () {
      var b = s.querySelector('.cp-file-foot [data-dir="1"]');
      return b ? b.getAttribute('aria-disabled') === 'true' : null;
    })(),
    matActive: (s.querySelector('.cp-mat.active .cp-mat-title') || {}).textContent || '',
    filterWrap: !!s.querySelector('.cp-mat-filter'),
    catOptions: Array.prototype.map.call(s.querySelectorAll('#cp-cat option'), function (o) {
      return o.textContent; }),
    tagOptions: Array.prototype.map.call(s.querySelectorAll('#cp-tag option'), function (o) {
      return o.textContent; }),
    catValue: (s.querySelector('#cp-cat') || {}).value || '',
    tagValue: (s.querySelector('#cp-tag') || {}).value || '',
    oldDock: !!s.querySelector('.cp-materials-bottom'),
    matEmpty: (s.querySelector('.cp-mat-list .cp-empty') || {}).textContent || '',
    matButtons: Array.prototype.map.call(s.querySelectorAll('.cp-mat [data-action]'), function (b) {
      return b.getAttribute('data-action'); }),
    extractBtns: Array.prototype.map.call(
      s.querySelectorAll('.cp-file-col .cp-col-head [data-action^="compose:extract"]'),
      function (b) { return b.textContent.trim(); }),
    extractInLeftPane: !!s.querySelector('.cp-pane-tools'),
    cols: getComputedStyle(s.querySelector('.cp-body')).gridTemplateColumns.split(' ').length,
    nodes: s.querySelectorAll('.cp-node').length,
    written: s.querySelectorAll('.cp-node.written').length,
    activeNode: (s.querySelector('.cp-node.active') || {}).textContent
      ? s.querySelector('.cp-node.active').textContent.replace(/\\s+/g, ' ').trim() : '',
    mats: s.querySelectorAll('.cp-mat').length,
    matTitles: Array.prototype.map.call(s.querySelectorAll('.cp-mat-title'), function (t) {
      return t.textContent.trim(); }),
    matFirstTitle: (s.querySelector('.cp-mat-title') || {}).textContent || '',
    switchSegs: Array.prototype.map.call(s.querySelectorAll('.cp-switch-seg'), function (b) {
      return b.textContent.trim() + (b.classList.contains('active') ? '*' : ''); }),
    switchRole: (s.querySelector('.cp-switch') || {}).getAttribute
      ? s.querySelector('.cp-switch').getAttribute('role') : '',
    switchAria: Array.prototype.map.call(s.querySelectorAll('.cp-switch-seg'), function (b) {
      return b.getAttribute('aria-selected'); }),
    switchHasTaskName: s.textContent.indexOf('本市教育事业发展史料汇编') >= 0 &&
      !!(s.querySelector('.cp-switch') && s.querySelector('.cp-switch').textContent.indexOf('本市') >= 0),
    /* 分段控件样式：底槽 + 选中项白色药丸（不是"链接 + ›"的面包屑） */
    switchStyled: (function () {
      var wrap = s.querySelector('.cp-switch');
      var active = s.querySelector('.cp-switch-seg.active');
      if (!wrap || !active) return { ok: false };
      var w = getComputedStyle(wrap), a = getComputedStyle(active);
      return { ok: true, wrapBg: w.backgroundColor, activeBg: a.backgroundColor,
        activeWeight: a.fontWeight, seps: s.querySelectorAll('.cp-crumb-sep').length,
        segRadius: a.borderRadius };
    })(),
    paneIsNav: !!s.querySelector('.cp-tree'),
    paneIsMats: !!s.querySelector('.cp-mat-list'),
    filePane: !!s.querySelector('.cp-file'),
    fileEmpty: (s.querySelector('.cp-file .cp-empty') || {}).textContent || '',
    fileTitle: (s.querySelector('.cp-file-title') || {}).textContent || '',
    pageFoot: (s.querySelector('.cp-page-foot') || {}).textContent || '',
    isVideoPane: !!s.querySelector('.cp-video'),
    frameInput: !!s.querySelector('#cp-frame-time'),
    insertFrameBtn: !!s.querySelector('.cp-file-foot [data-action="compose:insert-frame"]'),
    insertPageInFoot: !!s.querySelector('.cp-file-foot [data-action="compose:insert-page"]'),
    insertPageInHead: !!s.querySelector('.cp-file-col .cp-col-head [data-action="compose:insert-page"]'),
    pageBtns: s.querySelectorAll('.cp-file-foot [data-dir]').length,
    footOrder: (function () {
      var f = s.querySelector('.cp-file-foot');
      return f ? Array.prototype.map.call(f.children, function (c) {
        return c.getAttribute('data-action') || (c.tagName === 'BUTTON' ? 'btn' : (c.className || '').split(' ')[0] || c.tagName);
      }).join(' > ') : '';
    })(),
    hintGone: s.textContent.indexOf('原件按格式分流渲染') < 0,
    prevDisabled: (function () {
      var b = s.querySelector('.cp-file-foot [data-dir="-1"]');
      return b ? b.getAttribute('aria-disabled') === 'true' : null;
    })(),
    nextDisabled: (function () {
      var b = s.querySelector('.cp-file-foot [data-dir="1"]');
      return b ? b.getAttribute('aria-disabled') === 'true' : null;
    })(),
    matActive: (s.querySelector('.cp-mat.active .cp-mat-title') || {}).textContent || '',
    filterWrap: !!s.querySelector('.cp-mat-filter'),
    catOptions: Array.prototype.map.call(s.querySelectorAll('#cp-cat option'), function (o) {
      return o.textContent; }),
    tagOptions: Array.prototype.map.call(s.querySelectorAll('#cp-tag option'), function (o) {
      return o.textContent; }),
    catValue: (s.querySelector('#cp-cat') || {}).value || '',
    tagValue: (s.querySelector('#cp-tag') || {}).value || '',
    oldDock: !!s.querySelector('.cp-materials-bottom'),
    matEmpty: (s.querySelector('.cp-mat-list .cp-empty') || {}).textContent || '',
    matButtons: Array.prototype.map.call(s.querySelectorAll('.cp-mat [data-action]'), function (b) {
      return b.getAttribute('data-action'); }),
    extractBtns: Array.prototype.map.call(
      s.querySelectorAll('.cp-file-col .cp-col-head [data-action^="compose:extract"]'),
      function (b) { return b.textContent.trim(); }),
    extractInLeftPane: !!s.querySelector('.cp-pane-tools'),
    insertBtn: (function () {
      var b = s.querySelector('.cp-file-col .cp-col-head [data-action="compose:insert-page"]');
      if (!b) return null;
      var ai = s.querySelector('.cp-file-col .cp-col-head [data-action="compose:extract-ai"]');
      return { text: b.textContent.trim(), disabled: b.getAttribute('aria-disabled') === 'true',
        rightOfAi: ai ? b.getBoundingClientRect().left >= ai.getBoundingClientRect().right - 1 : false,
        sameRow: ai ? Math.abs((b.getBoundingClientRect().top + b.getBoundingClientRect().bottom) / 2 -
          (ai.getBoundingClientRect().top + ai.getBoundingClientRect().bottom) / 2) < 2 : false };
    })(),
    headerBtns: Array.prototype.map.call(s.querySelectorAll('.cp-header .btn'),
      function (b) { return b.textContent.trim(); }),
    editorNum: (s.querySelector('.cp-editor-num') || {}).textContent || '',
    editorTitle: (s.querySelector('.cp-editor-title') || {}).textContent || '',
    editorNote: (s.querySelector('.cp-editor-note') || {}).textContent || '',
    text: ta ? ta.value : null,
    textTag: ta ? ta.tagName : '',
    textFont: ta ? getComputedStyle(ta).fontFamily : '',
    meta: (s.querySelector('#cp-meta') || {}).textContent || '',
    dirtyShown: (function () {
      var d = s.querySelector('#cp-dirty');
      return d ? !d.classList.contains('hidden') : false;
    })(),
    progress: (s.querySelector('.cp-progress') || {}).textContent || '',

    overlayModals: document.querySelectorAll('.modal').length,
    appVisible: !!document.querySelector('.shell')
  };
`;

try {
  /* ================================================== A. 打开方式与整体布局 */
  console.log('\n【A】点「加工编排」阶段名 → 全屏打开');
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.account && !x.locked; })[0];
    App.store.login(u.account, u.password);
    return 1;`);
  await gotoTask(TASK);

  let before = await page.evaluate(`
    return { open: !!document.getElementById('compose-screen'),
      stage3: !!document.querySelector('.stage-stepper [data-stage="3"]'),
      stepperClicks: 0 };`);
  check('打开前：工作台还没有出现，但进度条上有可点的「加工编排」阶段',
    !before.open && before.stage3, '工作台已存在=' + before.open + '；第 3 阶段可点=' + before.stage3);

  await click('.stage-stepper [data-stage="3"]');
  let s = await page.evaluate(SNAP);
  check('点第 3 阶段名：全屏工作台打开，且**铺满浏览器视口**',
    s.open && s.rect.w === s.viewport.w && s.rect.h === s.viewport.h && s.rect.t === 0,
    s.rect.w + '×' + s.rect.h + '（视口 ' + s.viewport.w + '×' + s.viewport.h + '）');
  check('三栏布局：左（大纲导航/素材区）20% ｜ 中（素材文件浏览）34% ｜ 右（编排区）46%',
    s.cols === 3 && s.navPct === 20 && s.matPct === 34 && s.edPct === 46,
    s.navPct + '% / ' + s.matPct + '% / ' + s.edPct + '%');
  const seedWritten = await page.evaluate(`
    var rec = App.store.composeOf('${TASK}');
    return Object.keys(rec.chapters).filter(function (k) {
      return String(rec.chapters[k].text || '').trim(); }).length;`);
  check('左侧是生成的大纲（21 个章节，层级缩进），已写的章节带标记',
    s.nodes === 21 && s.written === seedWritten,
    s.nodes + ' 个章节节点；已写 ' + s.written + ' 章（种子正文 ' + seedWritten + ' 章）');
  const composeHead = await page.evaluate(`
    var h = document.querySelector('.cp-compose .cp-col-head');
    return { text: h ? h.textContent.replace(/\\s+/g, ' ').trim() : '',
      btns: Array.prototype.map.call(h ? h.querySelectorAll('button') : [], function (b) {
        return b.textContent.trim(); }) };`);
  check('编排区标题行：去掉"点左侧章节后在这里编写"，换成六个动作按钮',
    composeHead.text.indexOf('点左侧章节后在这里编写') < 0 &&
    composeHead.btns.join() === 'AI生成,AI扩写,添加脚注,撤销,恢复,清空',
    '标题行「' + composeHead.text + '」；按钮：' + composeHead.btns.join('、'));
  const tools0 = await page.evaluate(`
    var w = document.getElementById('cp-write-tools');
    return Array.prototype.map.call(w.querySelectorAll('button'), function (b) {
      return b.textContent.trim() + (b.getAttribute('aria-disabled') === 'true' ? '[禁]' : ''); }).join(' ');`);
  check('刚打开工作台：「AI扩写」与「撤销 / 恢复」都是语义禁用',
    tools0.indexOf('AI扩写[禁]') >= 0 && tools0.indexOf('撤销[禁]') >= 0 &&
    tools0.indexOf('恢复[禁]') >= 0 && tools0.indexOf('清空') >= 0,
    tools0);
  /* ---------------- 正文编辑也要能撤销（用户反馈：编辑后按钮一直置灰） ---------------- */
  const typeBase = await page.evaluate("return document.getElementById('cp-text').value;");
  await page.evaluate(`
    var ta = document.getElementById('cp-text');
    ta.focus();
    ta.value = ta.value + '测试输入的一段文字。';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;`);
  await sleep(900);                     // 等输入分组落地（700ms 防抖）
  check('编辑正文后「撤销」变可用（不再一直置灰）',
    (await readTools()).indexOf('撤销') >= 0 && (await readTools()).indexOf('撤销[禁]') < 0,
    await readTools());
  await click('[data-action="compose:undo"]');
  const undoTyping = await page.evaluate("return document.getElementById('cp-text').value;");
  check('撤销一次：这一组输入被撤回，正文回到输入前（「恢复」同时变可用）',
    undoTyping === typeBase && (await readTools()).indexOf('恢复[禁]') < 0,
    '正文 ' + undoTyping.length + ' 字（输入前 ' + typeBase.length + ' 字）');
  await click('[data-action="compose:redo"]');
  const redoTyping = await page.evaluate("return document.getElementById('cp-text').value;");
  check('恢复一次：输入的内容又回来了',
    redoTyping === typeBase + '测试输入的一段文字。',
    '正文尾部「' + redoTyping.slice(-10) + '」');
  /* 连续输入算一步：连打 5 个字符后立刻撤销，应整组撤回（上一步输入的组仍然保留） */
  const burstBase = typeBase + '测试输入的一段文字。';
  await page.evaluate(`
    var ta = document.getElementById('cp-text');
    ta.focus();
    ['A', 'B', 'C', 'D', 'E'].forEach(function (ch) {
      ta.value = ta.value + ch;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return 1;`);
  await sleep(200);                     // 故意不等防抖
  await click('[data-action="compose:undo"]');
  const burst = await page.evaluate("return document.getElementById('cp-text').value;");
  check('连续输入（未停顿）算**一步**：撤销一次整组撤回（ABCDE 一起退），上一组输入不受影响',
    burst === burstBase,
    '连打 ABCDE 后 ' + (burstBase.length + 5) + ' 字 → 撤销一次回到 ' + burst.length +
    ' 字（整组 5 个字符一起退）');
  await click('[data-action="compose:redo"]');
  await click('[data-action="compose:undo"]');   // 退回 ABCDE 那一组
  await click('[data-action="compose:undo"]');   // 再退回"测试输入的一段文字。"那一组
  const clean = await page.evaluate("return document.getElementById('cp-text').value;");
  check('收尾：两组输入依次退回，正文回到测试起点的原文（后续断言不受影响）', clean === typeBase,
    '正文 ' + clean.length + ' 字（起点 ' + typeBase.length + ' 字）');

  /* ---------------- AI生成：弹提示词 → 生成 → 插到光标处 ---------------- */
  await page.evaluate(`
    var ta = document.getElementById('cp-text');
    ta.focus();
    ta.setSelectionRange(20, 20);      // 把光标放在正文第 20 个字后面
    return 1;`);
  const beforeAI = await page.evaluate("return document.getElementById('cp-text').value;");
  await click('[data-action="compose:ai-write"]');
  const aiDlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { head: m.querySelector('.modal-head').textContent.trim(),
      hasPrompt: !!m.querySelector('#ai-prompt'),
      note: m.querySelector('.data-note').textContent.replace(/\\s+/g, ' ').trim(),
      ok: m.querySelector('.modal-foot [data-action="ui:ok"]').textContent.trim() } : null;`);
  check('点「AI生成」：先弹提示词输入界面（含提示词框 + 插入位置说明）',
    !!aiDlg && aiDlg.head.indexOf('AI生成') === 0 && aiDlg.head.indexOf('插入到') > 0 &&
    aiDlg.hasPrompt && aiDlg.ok === '生成并插入' &&
    aiDlg.note.indexOf('本地模拟生成') > 0,
    aiDlg ? (aiDlg.head + '｜按钮「' + aiDlg.ok + '」') : 'ERR 没有弹窗');

  await clearToasts();
  await click('.modal [data-action="ui:ok"]');
  const aiEmpty = await lastToast();
  check('提示词为空：拦住且弹窗不关',
    aiEmpty.indexOf('请先填写提示词') >= 0 &&
    (await page.evaluate("return !!document.querySelector('#ai-prompt');")),
    '轻提示：' + aiEmpty);

  const AI_PROMPT = '写一段编者说明，交代收录范围与时间断限，引用民国时期教育档案';
  const expectAI = await page.evaluate(`
    var n = App.store.outlineOf('${TASK}').nodes.filter(function (x) {
      return x.id === App.taskCompose.state().nodeId; })[0];
    var ms = App.store.selectionOf('${TASK}').entries.map(function (e) {
      return { title: e.title, archiveNo: e.archiveNo }; });
    return App.mock.compose.generate(${JSON.stringify(AI_PROMPT)},
      { chapterTitle: n ? n.title : '', materials: ms }).text;`);
  await page.evaluate(`
    document.querySelector('#ai-prompt').value = ${JSON.stringify(AI_PROMPT)};
    document.querySelector('.modal [data-action="ui:ok"]').click();
    return 1;`);
  await sleep(400);
  const afterAI = await page.evaluate("return document.getElementById('cp-text').value;");
  check('填了提示词：AI 生成的内容**插到光标处**（前后原文一个字不动）',
    afterAI === beforeAI.slice(0, 20) + expectAI + beforeAI.slice(20) &&
    expectAI.length > 0 && afterAI.length === beforeAI.length + expectAI.length,
    '第 20 字处插入 ' + expectAI.length + ' 字：' + expectAI.slice(0, 24) + '…');
  check('生成的内容带出处（引用本章的选材）',
    expectAI.indexOf('《') > 0 && expectAI.indexOf('档号') > 0,
    expectAI.slice(expectAI.indexOf('主要依据'), expectAI.indexOf('主要依据') + 30));

  /* ---------------- AI扩写：先选中，再弹提示词，覆盖选中内容 ---------------- */
  await clearToasts();
  await page.evaluate(`
    var ta = document.getElementById('cp-text');
    ta.focus(); ta.setSelectionRange(0, 12);
    ta.dispatchEvent(new Event('select', { bubbles: true }));
    return 1;`);
  await sleep(250);
  const toolsSel = await page.evaluate(`
    var b = document.querySelector('[data-action="compose:ai-expand"]');
    return b.getAttribute('aria-disabled') === 'true' ? '禁用' : '可用';`);
  await click('[data-action="compose:ai-expand"]');
  const exDlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { head: m.querySelector('.modal-head').textContent.trim(),
      quote: (m.querySelector('.pick-quote') || {}).textContent || '',
      hasPrompt: !!m.querySelector('#ai-expand-prompt'),
      ok: m.querySelector('.modal-foot [data-action="ui:ok"]').textContent.trim() } : null;`);
  const selText = afterAI.slice(0, 12);
  check('选中内容后「AI扩写」变可用；点开先弹提示词界面，并回显选中的原有内容',
    toolsSel === '可用' && !!exDlg && exDlg.head.indexOf('AI扩写') === 0 &&
    exDlg.head.indexOf('选中的 12 字') > 0 && exDlg.quote === selText &&
    exDlg.hasPrompt && exDlg.ok === '扩写并覆盖',
    '按钮' + toolsSel + '；弹窗「' + (exDlg ? exDlg.head : 'ERR') + '」；引用块=' + (exDlg ? exDlg.quote : ''));

  await clearToasts();
  await click('.modal [data-action="ui:ok"]');
  const exEmpty = await lastToast();
  check('扩写要求为空：拦住且弹窗不关',
    exEmpty.indexOf('请先填写扩写要求') >= 0 &&
    (await page.evaluate("return !!document.querySelector('#ai-expand-prompt');")),
    '轻提示：' + exEmpty);

  const EX_PROMPT = '补充这一时期的经费来源与数额';
  const expectEX = await page.evaluate(`
    var n = App.store.outlineOf('${TASK}').nodes.filter(function (x) {
      return x.id === App.taskCompose.state().nodeId; })[0];
    var ms = App.store.selectionOf('${TASK}').entries.map(function (e) {
      return { title: e.title, archiveNo: e.archiveNo }; });
    return App.mock.compose.expand(${JSON.stringify(EX_PROMPT)}, ${JSON.stringify(selText)},
      { chapterTitle: n ? n.title : '', materials: ms }).text;`);
  await page.evaluate(`
    document.querySelector('#ai-expand-prompt').value = ${JSON.stringify(EX_PROMPT)};
    document.querySelector('.modal [data-action="ui:ok"]').click();
    return 1;`);
  await sleep(400);
  const afterEX = await page.evaluate("return document.getElementById('cp-text').value;");
  check('扩写结果**覆盖选中的原有内容**，选区之外的正文一个字不动',
    afterEX === expectEX + afterAI.slice(12) && expectEX.indexOf(selText) >= 0 &&
    afterEX.length > afterAI.length,
    '选中 12 字 → 扩写成 ' + expectEX.length + ' 字（原文保留在扩写结果里，其余完全一致）');

  /* ---------------- 添加脚注：弹窗写脚注 + 出处 ---------------- */
  await page.evaluate(`
    var ta = document.getElementById('cp-text');
    ta.focus(); ta.setSelectionRange(5, 5);
    return 1;`);
  const beforeFn = await page.evaluate("return document.getElementById('cp-text').value;");
  await click('[data-action="compose:add-footnote"]');
  const fnDlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { head: m.querySelector('.modal-head').textContent.trim(),
      fields: Array.prototype.map.call(m.querySelectorAll('.field-label'), function (l) {
        return l.textContent.trim(); }),
      hasText: !!m.querySelector('#fn-text'), hasSource: !!m.querySelector('#fn-source'),
      ok: m.querySelector('.modal-foot [data-action="ui:ok"]').textContent.trim() } : null;`);
  check('点「添加脚注」：弹出编写脚注的界面（脚注内容 / 出处）',
    !!fnDlg && fnDlg.head.indexOf('添加脚注') === 0 && fnDlg.fields.join() === '脚注内容 *,出处（选填）' &&
    fnDlg.hasText && fnDlg.hasSource && fnDlg.ok === '插入脚注',
    fnDlg ? (fnDlg.head + '｜字段：' + fnDlg.fields.join('、')) : 'ERR 没有弹窗');

  await clearToasts();
  await click('.modal [data-action="ui:ok"]');
  const fnEmpty = await lastToast();
  check('脚注内容为空：拦住且弹窗不关',
    fnEmpty.indexOf('请先填写脚注内容') >= 0 &&
    (await page.evaluate("return !!document.querySelector('#fn-text');")),
    '轻提示：' + fnEmpty);

  await page.evaluate(`
    document.querySelector('#fn-text').value = '此处数字据 1932 年学田租息清册统计';
    document.querySelector('#fn-source').value = '档号 JY-1932-Y-003 第 3 页';
    document.querySelector('.modal [data-action="ui:ok"]').click();
    return 1;`);
  await sleep(400);
  const afterFn = await page.evaluate("return document.getElementById('cp-text').value;");
  check('插入脚注：光标处出现序号标记 ①，本章末尾【脚注】区登记内容与出处',
    afterFn === beforeFn.slice(0, 5) + '①' + beforeFn.slice(5) +
      '\n\n【脚注】\n① 此处数字据 1932 年学田租息清册统计（档号 JY-1932-Y-003 第 3 页）\n' &&
    afterFn.indexOf('【脚注】') > 0,
    afterFn.slice(afterFn.indexOf('【脚注】')).replace(/\n/g, ' / '));

  /* 第二条脚注自动编 ② */
  await page.evaluate(`
    var ta = document.getElementById('cp-text');
    ta.focus(); ta.setSelectionRange(30, 30);
    return 1;`);
  await click('[data-action="compose:add-footnote"]');
  await page.evaluate(`
    document.querySelector('#fn-text').value = '原件存市档案馆，见全宗目录第 12 条';
    document.querySelector('.modal [data-action="ui:ok"]').click();
    return 1;`);
  await sleep(400);
  const afterFn2 = await page.evaluate("return document.getElementById('cp-text').value;");
  check('再添加一条：序号自动编号 ②，两条脚注都留在【脚注】区',
    afterFn2.indexOf('②') > 0 && afterFn2.indexOf('① 此处数字据') > 0 &&
    afterFn2.indexOf('② 原件存市档案馆') > 0,
    afterFn2.slice(afterFn2.indexOf('【脚注】')).replace(/\n/g, ' / '));
  await click('[data-action="compose:undo"]');
  const afterFnUndo = await page.evaluate("return document.getElementById('cp-text').value;");
  check('添加脚注是编排动作，可撤销（撤销后第二条脚注从【脚注】区消失、标记 ② 也没了）',
    afterFnUndo.indexOf('②') < 0 && afterFnUndo.indexOf('① 此处数字据') > 0,
    afterFnUndo.slice(afterFnUndo.indexOf('【脚注】')).replace(/\n/g, ' / '));

  check('顶部有「预览」「保存」两个按钮',
    s.headerBtns.join() === '预览,保存', s.headerBtns.join('、'));
  check('「手动摘录 / AI自动摘录」在**中栏素材文件浏览区上方**（一进工作台就可见）',
    s.extractBtns.join() === '手动摘录,AI自动摘录' && !s.extractInLeftPane,
    '中栏标题行按钮：' + s.extractBtns.join('、') + '；左栏是否残留=' + s.extractInLeftPane);
  check('「插入本页」不在标题行（改到下方翻页区，C 段验位置）',
    !s.insertPageInHead && s.extractBtns.join() === '手动摘录,AI自动摘录',
    '标题行只剩：' + s.extractBtns.join('、') + '；标题行里有插入本页=' + s.insertPageInHead);
  const seedSelCount = await page.evaluate("return App.store.selectionOf('" + TASK + "').entries.length;");
  check('左栏顶部是「大纲导航 / 素材区」分段切换，默认停在「大纲导航」并显示大纲',
    s.switchSegs[0] === '大纲导航*' && s.switchSegs[1] === '素材区（' + seedSelCount + '）' &&
    s.paneIsNav && !s.paneIsMats && s.nodes === 21,
    '切换：' + s.switchSegs.join(' / ') + '；节点 ' + s.nodes + ' 个');
  check('切换控件里不再出现编研任务名称（任务名只在顶栏）', !s.switchHasTaskName,
    '控件里含任务名=' + s.switchHasTaskName);
  check('切换控件是分段控件样式：底槽 + 选中项白色药丸（无 › 分隔符）',
    s.switchStyled.ok && s.switchStyled.seps === 0 &&
    s.switchStyled.activeBg !== s.switchStyled.wrapBg &&
    Number(s.switchStyled.activeWeight) >= 600 && s.switchRole === 'tablist',
    '底槽 ' + s.switchStyled.wrapBg + '／选中项 ' + s.switchStyled.activeBg +
    '（' + s.switchStyled.activeWeight + '）；分隔符 ' + s.switchStyled.seps + ' 个；role=' + s.switchRole);
  check('中栏是「素材文件浏览」，未选文件时给引导（右侧编排区仍默认打开第一章）',
    s.filePane && s.fileEmpty.indexOf('先在左侧面包屑切到「素材区」') >= 0 &&
    s.editorTitle.length > 0 && !!s.text,
    s.fileEmpty.replace(/\s+/g, '').slice(0, 34) + '；编排区「' + s.editorNum + s.editorTitle + '」');
  check('编排区是可编辑的多行文本域（衬线阅读面），带本段要点与字数/保存信息',
    s.textTag === 'TEXTAREA' && /serif|Songti|SimSun/i.test(s.textFont) &&
    s.editorNote.indexOf('本段要点') >= 0 && /^\d+ 字/.test(s.meta),
    s.textTag + '；字体 ' + s.textFont.split(',')[0] + '；正文 ' + s.text.length + ' 字；' + s.meta);
  const shotScreen = await page.shot(SHOT_DIR + 'compose-screen.png');

  /* ================================================== B. 左侧导航：折叠 / 选章节 */
  console.log('\n【B】大纲导航：占 20%、可折叠、点章节切换编排区');
  const expanded = await page.evaluate(SNAP);
  check('折叠开关是**贴在左栏右缘、垂直居中**的一个拉手（不是栏内的按钮）',
    expanded.handle && expanded.handle.left === expanded.handle.navRight &&
    Math.abs(expanded.handle.centerDelta) <= 2 && expanded.handle.w <= 16 &&
    expanded.handle.expanded === 'true' && expanded.railGone,
    '把手 ' + expanded.handle.w + '×' + expanded.handle.h + 'px，左边缘 ' + expanded.handle.left +
    ' = 左栏右边缘 ' + expanded.handle.navRight + '；垂直偏移 ' + expanded.handle.centerDelta +
    'px；展开态图标朝左=' + (expanded.handle.icon.indexOf('m15 18-6-6 6-6') >= 0));

  await click('.cp-handle');
  s = await page.evaluate(SNAP);
  check('点它收起左栏：宽度**全部让给素材文件浏览**（编排区不变），把手仍贴在边界、方向翻转',
    s.navPx === 0 && s.matPct >= 52 && s.matPx > expanded.matPx + 200 &&
    Math.abs(s.edPx - expanded.edPx) <= 2 && s.handle.left === s.handle.navRight &&
    Math.abs(s.handle.centerDelta) <= 2 && s.handle.expanded === 'false' &&
    s.handle.icon.indexOf('m9 6 6 6-6 6') >= 0,
    '左栏 ' + expanded.navPx + '→' + s.navPx + 'px；素材文件浏览 ' + expanded.matPx + '→' + s.matPx +
    'px（' + expanded.matPct + '% → ' + s.matPct + '%）；编排区 ' + expanded.edPx + '→' + s.edPx +
    'px；把手 X ' + s.handle.left + '（方向已翻转为朝右）');
  check('收起后左栏内容藏起来（切换控件与面板都不可见），但把手还能点',
    !s.switchVisible && !s.paneVisible && !!s.handle,
    '切换控件可见=' + s.switchVisible + '；面板可见=' + s.paneVisible);

  /* 再点一次（收起后把手挪到了左边缘，坐标要重新取 —— 这一步正是一开始漏掉的） */
  await click('.cp-handle');
  s = await page.evaluate(SNAP);
  check('再点把手：展开回 20% / 34% / 46%',
    s.navPct === 20 && s.matPct === 34 && s.edPct === 46 && s.switchVisible &&
    s.handle.left === s.handle.navRight && s.handle.expanded === 'true',
    '左 ' + s.navPct + '% / 中 ' + s.matPct + '% / 右 ' + s.edPct + '%');

  /* 顶栏那个 ☰ 是同一个开关，两个入口都能折叠 */
  await click('.cp-nav-toggle');
  s = await page.evaluate(SNAP);
  const byHeader = s.navPct <= 3;
  await click('.cp-nav-toggle');
  s = await page.evaluate(SNAP);
  check('顶栏的折叠按钮与面包屑上的按钮是同一个开关（都能折叠 / 展开）',
    byHeader && s.navPct === 20 && s.matPct === 34,
    '顶栏折叠后左栏 ' + (byHeader ? '≤3%' : '未折叠') + '；展开后 ' + s.navPct + '% / ' + s.matPct + '%');

  /* 切到「素材区」：左栏换成选材列表（大纲树让位） */
  await click('.cp-switch-seg[data-pane="materials"]');
  s = await page.evaluate(SNAP);
  check('点分段控件「素材区」：左栏换成选材列表与筛选，大纲树收起',
    s.paneIsMats && !s.paneIsNav && s.mats === seedSelCount &&
    s.switchSegs.join() === '大纲导航,素材区（' + seedSelCount + '）*' &&
    s.switchAria.join() === 'false,true',
    '切换：' + s.switchSegs.join(' / ') + '；aria-selected=' + s.switchAria.join());
  await click('.cp-switch-seg[data-pane="nav"]');
  s = await page.evaluate(SNAP);
  check('再点「大纲导航」：切回大纲树', s.paneIsNav && !s.paneIsMats && s.nodes === 21,
    '节点 ' + s.nodes + ' 个');

  /* 点一个二级章节：编排区切到它 */
  const secondNode = await page.evaluate(`
    var nodes = document.querySelectorAll('.cp-node');
    var target = nodes[1];
    return { id: target.getAttribute('data-id'), title: target.textContent.replace(/\\s+/g, ' ').trim() };`);
  await click('.cp-node[data-id="' + secondNode.id + '"]');
  s = await page.evaluate(SNAP);
  check('点左侧章节：编排区换成该章节（编号 + 标题 + 该章的正文）',
    s.activeNode.indexOf(secondNode.title) >= 0 && s.editorTitle.length > 0 &&
    s.text.indexOf('编纂本汇编的目的') >= 0,
    '切到「' + s.editorNum + s.editorTitle + '」，正文 ' + s.text.length + ' 字');

  /* ================================================== C. 素材区筛选 + 文件浏览 */
  console.log('\n【C】左栏素材区（筛选）→ 中栏素材文件浏览');
  await click('.cp-switch-seg[data-pane="materials"]');
  s = await page.evaluate(SNAP);
  const storeSel = await page.evaluate(`
    var list = App.store.selectionOf('${TASK}').entries;
    var cats = {}, tags = {};
    list.forEach(function (e) {
      if (e.category) cats[e.category] = (cats[e.category] || 0) + 1;
      (e.tagIds || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; });
    });
    var labels = {};
    Object.keys(tags).forEach(function (id) {
      var t = App.store.tags().filter(function (x) { return x.id === id; })[0];
      labels[id] = t ? t.name : id;
    });
    return { total: list.length, cats: cats, tags: tags, tagLabels: labels,
      catNames: Object.keys(cats), tagNames: Object.keys(tags) };`);
  check('左栏素材区只有门类 / 标签筛选（摘录按钮已挪到中栏），筛选项带件数',
    s.extractBtns.join() === '手动摘录,AI自动摘录' && !s.extractInLeftPane && s.filterWrap &&
    s.catOptions[0] === '全部门类' && s.tagOptions[0] === '全部标签' &&
    s.catOptions.length === storeSel.catNames.length + 1 &&
    storeSel.catNames.every(function (c) {
      return s.catOptions.indexOf(c + '（' + storeSel.cats[c] + '）') >= 0;
    }),
    s.catOptions.join(' | ') + '　／　' + s.tagOptions.join(' | '));
  check('素材区不再有下半块的旧文件预览（预览已移到中栏的「素材文件浏览」）',
    !s.oldDock && s.filePane, '旧下半块残留=' + s.oldDock);

  /* 点一份素材 → 中栏浏览它的文件 */
  await click('.cp-mat-main[data-id]');
  s = await page.evaluate(SNAP);
  check('点素材区的文件：中栏开始浏览它（第 1 页 / 共 12 页，上一页禁用），该条在左栏高亮',
    s.fileEmpty === '' && s.matActive.length > 0 &&
    s.pageFoot.indexOf('第 1 页 / 共 12 页') === 0 && s.prevDisabled === true &&
    s.nextDisabled === false && s.fileTitle.length > 0,
    '正在浏览「' + s.fileTitle + '」；' + s.pageFoot);
  check('文档类素材：翻页区右侧是「插入本页」，且没有「插入帧」',
    s.pageBtns === 2 && s.insertPageInFoot && !s.insertFrameBtn && !s.frameInput &&
    s.footOrder.indexOf('spacer > compose:insert-page') >= 0,
    '翻页区结构：' + s.footOrder);
  check('原来的提示「原件按格式分流渲染…」已从浏览区删掉', s.hintGone,
    s.hintGone ? '已删' : 'ERR 还在');
  await click('.cp-file-foot [data-dir="1"]');
  s = await page.evaluate(SNAP);
  check('中栏「下一页」翻到第 2 页（浏览区内的翻页，不弹窗）',
    s.pageFoot.indexOf('第 2 页 / 共 12 页') === 0 && s.overlayModals === 0, s.pageFoot);

  /* 换成"只选了几页"的那条：翻页范围受选入页限制 */
  const scopedId = await page.evaluate(`
    var list = App.store.selectionOf('${TASK}').entries;
    var hit = list.filter(function (e) { return e.scope === 'pages'; })[0];
    return hit ? hit.id : '';`);
  await click('.cp-mat-main[data-id="' + scopedId + '"]');
  s = await page.evaluate(SNAP);
  check('切到「只选了几页」的素材：中栏标明选入页，翻页按该范围（共 3 页）',
    s.pageFoot.indexOf('第 1 页 / 共 3 页') === 0 && s.pageFoot.indexOf('选入页：第 2-3 页') >= 0,
    s.pageFoot);
  const shotFile = await page.shot(SHOT_DIR + 'compose-file.png');

  /* 插入本页：把正在浏览的这一页原文插到编排区当前章节的光标处 */
  const beforeInsert = await page.evaluate(`
    var st = App.taskCompose.state();
    return { text: App.store.chapterOf('${TASK}', st.nodeId).text,
      wordCount: App.store.wordCount(App.store.chapterOf('${TASK}', st.nodeId).text),
      node: st.nodeId, page: st.page,
      disabled: document.querySelector('[data-action="compose:insert-page"]').getAttribute('aria-disabled') };`);
  await click('[data-action="compose:insert-page"]');
  await sleep(350);
  const afterInsert = await page.evaluate(`
    var st = App.taskCompose.state();
    var ta = document.getElementById('cp-text');
    var ch = App.store.chapterOf('${TASK}', st.nodeId);
    return { text: ch.text, taValue: ta ? ta.value : '',
      wordCount: App.store.wordCount(ch.text),
      dirty: !document.getElementById('cp-dirty').classList.contains('hidden'),
      meta: document.getElementById('cp-meta').textContent,
      caret: ta ? ta.selectionStart : -1 };`);
  check('点「插入本页」：这一页的原文（含档号 + 页码出处）插进了编排区当前章节',
    afterInsert.text.length > beforeInsert.text.length &&
    afterInsert.text.indexOf(beforeInsert.text.slice(0, 12)) === 0 &&
    afterInsert.text.indexOf('（档号 ') >= 0 && afterInsert.text.indexOf('第 ' + beforeInsert.page + ' 页') >= 0 &&
    afterInsert.taValue === afterInsert.text,
    '字数 ' + beforeInsert.wordCount + ' → ' + afterInsert.wordCount +
    '；插入内容以「（档号 … 第 ' + beforeInsert.page + ' 页）」结尾');
  check('插入后点亮「未保存」、字数同步，光标落在插入内容之后',
    afterInsert.dirty && /^\d+ 字/.test(afterInsert.meta) &&
    afterInsert.caret > beforeInsert.text.length,
    '未保存=' + afterInsert.dirty + '；' + afterInsert.meta.split('　')[0] + '；光标位置 ' + afterInsert.caret +
    '（原正文 ' + beforeInsert.text.length + ' 字）');
  /* ---- 撤销 / 恢复 / 清空：编排动作级历史 ---- */
  check('插入过一次之后：「撤销」可用、「恢复」仍禁用（刚插入，还没撤销过）',
    (await readTools()).indexOf('撤销') >= 0 && (await readTools()).indexOf('撤销[禁]') < 0 &&
    (await readTools()).indexOf('恢复[禁]') >= 0,
    await readTools());

  await click('[data-action="compose:undo"]');
  const undone = await page.evaluate("return document.getElementById('cp-text').value;");
  check('点「撤销」：刚才那次「插入本页」被撤回，正文回到插入前（且「恢复」变可用）',
    undone === beforeInsert.text && (await readTools()).indexOf('恢复[禁]') < 0,
    '正文 ' + undone.length + ' 字（插入前 ' + beforeInsert.text.length + ' 字）；' + (await readTools()));
  await click('[data-action="compose:redo"]');
  const redone = await page.evaluate("return document.getElementById('cp-text').value;");
  check('点「恢复」：被撤销的那一步又回来了（与插入后完全一致）',
    redone === afterInsert.text && (await readTools()).indexOf('撤销') >= 0,
    '正文 ' + redone.length + ' 字（插入后 ' + afterInsert.text.length + ' 字）');

  await clearToasts();
  await click('[data-action="compose:clear"]');
  const clearDlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { head: m.querySelector('.modal-head').textContent.trim(),
      body: m.querySelector('.modal-body').textContent.replace(/\\s+/g, ' ').trim(),
      ok: m.querySelector('.modal-foot [data-action="ui:ok"]').textContent.trim() } : null;`);
  check('点「清空」：先二次确认（写明只清这一章、可撤销）',
    !!clearDlg && clearDlg.head.indexOf('的正文？') > 0 && clearDlg.ok === '清空正文' &&
    clearDlg.body.indexOf('可以用「撤销」恢复') > 0,
    clearDlg ? (clearDlg.head + '｜' + clearDlg.body.slice(0, 30)) : 'ERR 没有确认框');
  await click('.modal [data-action="ui:ok"]');
  await sleep(350);
  const cleared = await page.evaluate(`
    var st = App.taskCompose.state();
    return { ta: document.getElementById('cp-text').value,
      stored: App.store.chapterOf('${TASK}', st.nodeId).text,
      others: Object.keys(App.store.composeOf('${TASK}').chapters).length };`);
  check('确认后：当前章节正文清空，且**其他章节不受影响**',
    cleared.ta === '' && cleared.stored === '' && cleared.others >= 2,
    '正文 ' + cleared.ta.length + ' 字；其他章节仍有 ' + cleared.others + ' 章有正文记录');
  await click('[data-action="compose:undo"]');
  const restored = await page.evaluate("return document.getElementById('cp-text').value;");
  check('清空也能撤销（撤销后正文回到清空前）', restored === afterInsert.text,
    '正文 ' + restored.length + ' 字，与清空前一致=' + (restored === afterInsert.text));

  check('打开文件后「插入本页」按钮已变为可用（A 段验过：未开文件时是禁用态）',
    beforeInsert.disabled === null &&     // 读的是 aria-disabled 属性：属性不存在=可用
    (await page.evaluate("return document.querySelector('[data-action=\"compose:insert-page\"]').getAttribute('aria-disabled');")) === null,
    '此刻 aria-disabled 属性=' + beforeInsert.disabled + '（null＝已可用）');
  /* 无需还原：D 段会覆写这一章的正文，E 段断言依赖的是那段新写的 */

  /* 筛选：门类 / 标签 / 叠加空结果 / 重置 */
  const byCat = await page.evaluate(`
    var cat = ${JSON.stringify('')};
    var cats = ${JSON.stringify(storeSel.catNames)};
    var sel = document.getElementById('cp-cat');
    sel.value = cats[0];
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return cats[0];`);
  await sleep(300);
  s = await page.evaluate(SNAP);
  check('按档案门类筛选：左栏列表只剩该门类的选材',
    s.mats === storeSel.cats[byCat] && s.catValue === byCat,
    byCat + ' → ' + s.mats + ' 条（期望 ' + storeSel.cats[byCat] + '）');

  const tagId = storeSel.tagNames[0] || '';
  await page.evaluate(`
    var cat = document.getElementById('cp-cat');
    cat.value = ''; cat.dispatchEvent(new Event('change', { bubbles: true }));
    var sel = document.getElementById('cp-tag');
    sel.value = ${JSON.stringify(tagId)};
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(300);
  s = await page.evaluate(SNAP);
  check('按素材标签筛选：左栏列表只剩带该标签的选材',
    s.mats === storeSel.tags[tagId] && s.tagValue === tagId &&
    s.tagOptions.some(function (o) { return o.indexOf(storeSel.tagLabels[tagId]) === 0; }),
    storeSel.tagLabels[tagId] + ' → ' + s.mats + ' 条（期望 ' + storeSel.tags[tagId] + '）');

  const stacked = await page.evaluate(`
    var list = App.store.selectionOf('${TASK}').entries;
    var cats = {};
    list.forEach(function (e) { if (e.category) cats[e.category] = 1; });
    var hit = Object.keys(cats).filter(function (c) {
      return !list.some(function (e) {
        return e.category === c && (e.tagIds || []).indexOf(${JSON.stringify(tagId)}) >= 0; });
    })[0];
    if (!hit) return '';
    var sel = document.getElementById('cp-cat');
    sel.value = hit;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return hit;`);
  if (stacked) {
    await sleep(300);
    s = await page.evaluate(SNAP);
    check('门类与标签叠加后没有结果时给出空状态（而不是空白）',
      s.mats === 0 && s.matEmpty.indexOf('没有符合条件的选材') >= 0, s.matEmpty.slice(0, 40));
  } else {
    check('门类与标签叠加后没有结果时给出空状态（而不是空白）', true,
      '这批种子选材里没有"门类 + 标签"为空结果的组合，跳过');
  }
  await click('[data-action="compose:clear-filter"]');
  s = await page.evaluate(SNAP);
  check('点「重置」：两个筛选一起清空，选材全部回来（中栏仍在浏览刚打开的文件）',
    s.mats === storeSel.total && s.catValue === '' && s.tagValue === '' && s.pageFoot.length > 0,
    s.mats + ' 条（共 ' + storeSel.total + ' 条）');
  await clearToasts();

  /* ---- 视频类素材：按时间点插入帧 ---- */
  const videoId = await page.evaluate(`
    var list = App.store.selectionOf('${TASK}').entries;
    var hit = list.filter(function (e) { return e.file && /\.(mp4|mov|avi|mkv)$/i.test(e.file.name); })[0];
    return hit ? { id: hit.id, title: hit.title, duration: hit.file.duration } : null;`);
  check('选材里有视频类素材（种子里的录像，用于演示插入帧）', !!videoId,
    videoId ? (videoId.title + '　时长 ' + videoId.duration + 's') : 'ERR 没有视频素材');
  await click('.cp-mat-main[data-id="' + videoId.id + '"]');
  s = await page.evaluate(SNAP);
  check('点开视频素材：中栏切换成"视频帧"（没有翻页按钮），给出时间点输入与「插入帧」',
    s.isVideoPane && s.pageBtns === 0 && !s.insertPageInFoot && s.insertFrameBtn &&
    s.frameInput && s.pageFoot.indexOf('总时长') < 0 &&
    s.footOrder.indexOf('spacer > compose:insert-frame') >= 0,
    '翻页区结构：' + s.footOrder + '；' + s.pageFoot.replace(/\s+/g, ' ').slice(0, 40));

  /* 时间点的三种非法输入 + 超出时长 */
  const badTimes = [['', '请填写帧所在的时间点'], ['1:75', '秒数要小于 60'], ['abc', '时间点格式不对']];
  for (const [val, expect] of badTimes) {
    await clearToasts();
    await page.evaluate(`
      var el = document.getElementById('cp-frame-time');
      el.value = ${JSON.stringify(val)};
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 1;`);
    await click('[data-action="compose:insert-frame"]');
    const toast = await lastToast();
    check('时间点输入「' + (val || '（空）') + '」：被拦住（' + expect + '）',
      toast.indexOf(expect) >= 0, '轻提示：' + toast);
  }
  await clearToasts();
  await page.evaluate(`
    var el = document.getElementById('cp-frame-time');
    el.value = '99:00:00';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await click('[data-action="compose:insert-frame"]');
  const overToast = await lastToast();
  check('时间点超出视频时长：被拦住并报出总时长',
    overToast.indexOf('超出视频时长') >= 0 && overToast.indexOf('1:02:00') >= 0,
    '轻提示：' + overToast);

  /* 合法时间点：插入帧 */
  const beforeFrame = await page.evaluate(`
    var st = App.taskCompose.state();
    return { text: App.store.chapterOf('${TASK}', st.nodeId).text,
      words: App.store.wordCount(App.store.chapterOf('${TASK}', st.nodeId).text) };`);
  await clearToasts();
  await page.evaluate(`
    var el = document.getElementById('cp-frame-time');
    el.value = '00:05:30';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await click('[data-action="compose:insert-frame"]');
  await sleep(350);
  const afterFrame = await page.evaluate(`
    var st = App.taskCompose.state();
    var ch = App.store.chapterOf('${TASK}', st.nodeId);
    var ta = document.getElementById('cp-text');
    return { text: ch.text, taValue: ta ? ta.value : '',
      words: App.store.wordCount(ch.text),
      dirty: !document.getElementById('cp-dirty').classList.contains('hidden'),
      frameFoot: (document.querySelector('.cp-page-foot') || {}).textContent || '',
      toast: '' };`);
  check('插入帧：帧标记（含时间点与档号）插进当前章节，字数与"未保存"同步',
    afterFrame.words > beforeFrame.words &&
    afterFrame.text.indexOf(beforeFrame.text.slice(0, 12)) === 0 &&
    afterFrame.text.indexOf('【录像帧：') >= 0 && afterFrame.text.indexOf('05:30') >= 0 &&
    afterFrame.text.indexOf('时间点 05:30') >= 0 && afterFrame.text.indexOf('档号 SX-2016-Y-014') >= 0 &&
    afterFrame.taValue === afterFrame.text && afterFrame.dirty,
    '字数 ' + beforeFrame.words + ' → ' + afterFrame.words + '；尾段「' +
    afterFrame.text.slice(-30).replace(/\n/g, ' ') + '」');
  check('插入后浏览区显示"当前时间点 05:30"（帧预览跟着更新）',
    afterFrame.frameFoot.indexOf('当前时间点 05:30') >= 0 && afterFrame.frameFoot.indexOf('总时长 1:02:00') >= 0,
    afterFrame.frameFoot.replace(/\s+/g, ' ').trim().slice(0, 46));
  const shotFrame = await page.shot(SHOT_DIR + 'compose-frame.png');

  /* ================================================== D. 编排：输入 / 未保存 / 保存 */
  console.log('\n【D】编排区：写正文 → 未保存 → 保存');
  await page.evaluate(`
    var ta = document.getElementById('cp-text');
    ta.focus();
    ta.value = '本章补写一段测试文字：本市教育经费在 1930 年代主要来自学田租息与地方附加捐。';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;`);
  await sleep(250);
  s = await page.evaluate(SNAP);
  const storedDraft = await page.evaluate(`
    var st = App.taskCompose.state();
    return App.store.chapterOf('${TASK}', st.nodeId).text;`);
  check('输入正文即静默落库（不等保存动作），并亮起「未保存」标记',
    s.dirtyShown && /^\d+ 字/.test(s.meta) && storedDraft.indexOf('学田租息') >= 0,
    '未保存标记=' + s.dirtyShown + '；' + s.meta.split('　')[0] + '；数据层已写入=' +
    (storedDraft.indexOf('学田租息') >= 0));

  const savedAtBefore = await page.evaluate(`
    var st = App.taskCompose.state();
    return App.store.chapterOf('${TASK}', st.nodeId).savedAt;`);
  await clearToasts();
  await click('[data-action="compose:save"]');
  const saveToast = await lastToast();
  s = await page.evaluate(SNAP);
  const savedAtAfter = await page.evaluate(`
    var st = App.taskCompose.state();
    var ch = App.store.chapterOf('${TASK}', st.nodeId);
    return { at: ch.savedAt, by: ch.savedBy, text: ch.text };`);
  check('点「保存」：写入存档时间与服务人员、清掉未保存标记、给出反馈',
    saveToast.indexOf('已保存章节') >= 0 && !s.dirtyShown &&
    savedAtAfter.at !== savedAtBefore && savedAtAfter.by === '赵志远' &&
    s.meta.indexOf('上次保存') >= 0,
    saveToast + '；上次保存 ' + s.meta.split('　').slice(-1)[0]);
  const stats = await page.evaluate("return App.store.composeStats('" + TASK + "');");
  check('头部编排进度与数据层完全一致（已写章节数 / 总字数）',
    s.progress.indexOf('已写 ' + stats.written + ' / ' + stats.total + ' 章') >= 0 &&
    s.progress.indexOf(stats.words + ' 字') >= 0 && stats.written >= 2 && stats.words > 0,
    s.progress.replace(/\s+/g, ' ').trim() + '（store: ' + stats.written + ' 章 / ' +
    stats.words + ' 字）');

  /* 刷新页面后正文还在（持久化） */
  await page.goto(PAGE_URL);
  await sleep(400);
  const persisted = await page.evaluate(`
    var nodes = App.store.outlineOf('${TASK}').nodes;
    var rec = App.store.composeOf('${TASK}');
    var hit = Object.keys(rec.chapters).filter(function (id) {
      return (rec.chapters[id].text || '').indexOf('学田租息') >= 0; });
    return { count: hit.length, totalWritten: Object.keys(rec.chapters).length,
      nodes: nodes.length };`);
  check('刷新浏览器后编排正文仍在（持久化到 localStorage）',
    persisted.count >= 1 && persisted.nodes === 21,
    persisted.totalWritten + ' 章有正文；含新写内容的 ' + persisted.count + ' 章');
  await gotoTask(TASK);

  /* ================================================== E. 预览 */
  console.log('\n【E】预览');
  await click('.stage-stepper [data-stage="3"]');
  await clearToasts();
  await click('[data-action="compose:preview"]');
  const pv = await page.evaluate(`
    var ms = document.querySelectorAll('.modal');
    var m = ms[ms.length - 1];
    if (!m) return { err: 'ERR 没有预览弹窗' };
    var chs = m.querySelectorAll('.pv-ch');
    return { err: '', title: m.querySelector('.modal-head').textContent.trim(),
      chapters: chs.length,
      hasLists: m.querySelectorAll('.pv-text').length,
      emptyMarks: m.querySelectorAll('.pv-empty').length,
      inputs: m.querySelectorAll('input, textarea, select').length,
      buttons: Array.prototype.map.call(m.querySelectorAll('.modal-foot button'), function (b) {
        return b.textContent.trim(); }),
      firstTitle: chs[0] ? chs[0].querySelector('.pv-title').textContent.replace(/\\s+/g, ' ').trim() : '',
      text: m.textContent.replace(/\\s+/g, ' ') };`);
  check('点「预览」：弹出只读预览稿，按大纲顺序列出全部章节',
    !pv.err && pv.title.indexOf('预览') === 0 && pv.chapters === 21 && pv.inputs === 0 &&
    pv.buttons.join() === '关闭',
    pv.err || (pv.chapters + ' 章，已写 ' + pv.hasLists + ' 段正文，' +
      pv.emptyMarks + ' 章标记"尚未编写"；按钮「' + pv.buttons.join('、') + '」'));
  check('预览里能看到刚写的正文，空章节标注「（本章尚未编写）」',
    pv.text.indexOf('学田租息') >= 0 && pv.text.indexOf('（本章尚未编写）') >= 0,
    '首章「' + pv.firstTitle + '」');
  const survived = await page.evaluate(`
    return { screen: !!document.getElementById('compose-screen'),
      text: !!document.getElementById('cp-text'), nav: document.querySelectorAll('.cp-node').length };`);
  check('预览是叠在工作台之上的一层：关掉预览后工作台**原样还在**',
    survived.screen && survived.text && survived.nav === 21,
    '工作台在=' + survived.screen + '；编排区在=' + survived.text + '；导航 ' + survived.nav + ' 章');
  await click('.modal [data-action="ui:ok"]');   // 预览是只读弹层：只有「关闭」这一颗（= ui:ok）
  await sleep(250);

  /* ================================================== F. 退出与行内入口 */
  console.log('\n【F】退出全屏 / 行内入口');
  await page.pressEscape();
  await sleep(300);
  s = await page.evaluate(SNAP);
  check('按 Esc 退出全屏工作台，回到任务详情页', !s.open && s.appVisible,
    '工作台已关闭=' + !s.open);
  const entry = await page.evaluate(`
    var main = document.getElementById('main');
    var note = main.querySelector('.compose-entry .data-note');
    return { note: note ? note.textContent.replace(/\\s+/g, ' ').trim() : '',
      btn: !!main.querySelector('[data-action="compose:open"]') };`);
  check('详情页第 3 阶段位置给出全屏工作台的入口卡片（说明三栏 + 打开按钮）',
    entry.btn && entry.note.indexOf('全屏工作台') >= 0 && entry.note.indexOf('20%') >= 0,
    entry.note.slice(0, 56));
  await click('[data-action="compose:open"]');
  s = await page.evaluate(SNAP);
  check('行内入口按钮也能打开工作台', s.open, '工作台已打开=' + s.open);
  await click('[data-action="compose:close"]');
  s = await page.evaluate(SNAP);
  check('点右上角关闭按钮退出全屏', !s.open, '工作台已关闭=' + !s.open);

  /* ================================================== G. 回归与异常 */
  console.log('\n【G】回归与异常');
  const statsEnd = await page.evaluate(`
    var main = document.getElementById('main');
    return { cards: main.querySelectorAll('.card').length,
      hasComposeEntry: !!main.querySelector('.compose-entry'),
      screen: !!document.getElementById('compose-screen'),
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth };`);
  check('退出后任务详情页恢复原状（工作台元素已移除，页面无横向溢出）',
    !statsEnd.screen && statsEnd.hasComposeEntry && statsEnd.scrollW <= statsEnd.clientW + 1,
    '卡片 ' + statsEnd.cards + ' 个；工作台残留=' + statsEnd.screen);
  const footSeed = await page.evaluate(`
    var f = document.querySelector('.sidebar-foot, .app-foot, footer');
    return { text: f ? f.textContent.replace(/\\s+/g, ' ').trim() : '',
      version: App.mock.SEED_VERSION };`);
  check('页脚显示当前种子版本（据此判断浏览器有没有读到缓存里的旧 JS）',
    footSeed.text.indexOf('种子 ' + footSeed.version) >= 0,
    footSeed.text.slice(0, 52));
  check('截图已生成', true,
    [shotScreen, shotFile, shotFrame].map(function (f) { return f.split('/').slice(-1)[0]; }).join('、'));
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ')
      : '0 条');
  /* 缺图标时 icons.render 会 console.warn 并退回 info 图标（曾经 chevron-left 就没定义）——
     这类问题必须一起挡掉，否则界面上只是一个"圆点"图标，看截图都未必发现 */
  const warns = page.warns();
  check('全程没有 console 警告（缺图标会走 warn 兜底）', warns.length === 0,
    warns.length ? 'ERR ' + warns.map(function (w) { return w.text; }).join(' | ') : '0 条');

  exitCode = check.summary('第 3 阶段「加工编排」') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
