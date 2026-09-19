/* ==========================================================================
   验证套件：编研任务 · 第 1 阶段「生成大纲」工作界面

   覆盖评审的 5 条要求：
     1) 40 / 60 分栏与区块位置   2) 生成 + 覆盖确认   3) 折叠 + 单标题重新生成
     4) 手工编写（多级标题选择器 + 可编辑）  5) 10 步撤销 / 恢复

   运行：node tools/verify/task-outline.mjs [file:///.../index.html]
   ========================================================================== */

import { openChrome, sleep, makeChecks } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ||
  new URL('../../prototype-system/index.html', import.meta.url).href;
const SHOT_DIR = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

const check = makeChecks();
const TASK = 'RW-2026-001';        // 评审要求把这条任务重置到「生成大纲」

const SNAP = `
  var main = document.getElementById('main');
  var step = main.querySelector('.outline-step');
  var layout = main.querySelector('.outline-layout');
  var left = main.querySelector('.ol-col-left');
  var right = main.querySelector('.ol-col-right');
  var promptPanel = main.querySelector('.ol-prompt');
  var thinkBox = main.querySelector('#ol-thinking');
  var nodes = Array.prototype.slice.call(main.querySelectorAll('.ol-node'));
  function box(el) { if (!el) return null; var r = el.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }
  var cards = Array.prototype.slice.call(main.querySelectorAll('.card'));
  return {
    hash: location.hash,
    cardCount: cards.length,
    progressBox: box(cards[0]),
    stepBox: step ? box(step) : null,
    hasStep: !!step,
    layoutCols: layout ? getComputedStyle(layout).gridTemplateColumns.split(' ').length : 0,
    layoutBox: box(layout),
    leftBox: box(left),
    rightBox: box(right),
    promptBox: box(main.querySelector('.ol-panel')),
    thinkBox: box(main.querySelectorAll('.ol-panel')[1]),
    promptValue: promptPanel ? promptPanel.value : null,
    thinkLines: thinkBox ? Array.prototype.map.call(thinkBox.querySelectorAll('.think-line'), function (l) {
      return l.textContent.trim(); }) : [],
    genBtn: (function () {
      var b = main.querySelector('[data-action="outline:generate"]');
      return b ? { text: b.textContent.trim(), disabled: b.getAttribute('aria-disabled') === 'true',
        icon: !!b.querySelector('svg') } : null;
    })(),
    nodes: nodes.map(function (n) {
      var b = n.getBoundingClientRect();
      var t = n.querySelector('.ol-title');
      var note = n.querySelector('.ol-note');
      return {
        id: n.getAttribute('data-node'),
        cls: n.className,
        level: (n.className.match(/lv(\\d)/) || [])[1],
        num: n.querySelector('.ol-num').textContent.trim(),
        title: t.value,
        note: note.value,
        left: b.left,
        bodyVisible: getComputedStyle(n.querySelector('.ol-node-body')).display !== 'none',
        levelTag: n.querySelector('.ol-level').textContent.trim(),
        foldIcon: n.querySelector('.ol-fold svg') ? n.querySelector('.ol-fold').getAttribute('aria-expanded') : ''
      };
    }),
    tags: Array.prototype.map.call(main.querySelectorAll('.ol-panel-head .tag'), function (t) {
      return t.textContent.trim(); }),
    levelOptions: Array.prototype.map.call(main.querySelectorAll('#ol-level option'), function (o) {
      return o.textContent.trim(); }),
    histText: (main.querySelector('#ol-hist') || {}).textContent,
    histBox: box(main.querySelector('#ol-hist')),
    undoBox: box(main.querySelector('[data-action="outline:undo"]')),
    redoBox: box(main.querySelector('[data-action="outline:redo"]')),
    clearBox: box(main.querySelector('[data-action="outline:clear"]')),
    clearDisabled: (function () {
      var b = main.querySelector('[data-action="outline:clear"]');
      return b ? b.getAttribute('aria-disabled') === 'true' : null;
    })(),
    resultHeadBox: box(main.querySelector('.ol-panel-result .ol-panel-head')),
    row2Box: box(main.querySelectorAll('.ol-tools-row')[1]),
    hasDragHint: main.textContent.indexOf('拖动标题左侧的手柄') >= 0,
    hasSelHint: !!main.querySelector('#ol-sel-hint') ||
      main.textContent.indexOf('先点选一个标题') >= 0,
    undoDisabled: (function () {
      var b = main.querySelector('[data-action="outline:undo"]');
      return b ? b.getAttribute('aria-disabled') === 'true' : null;
    })(),
    redoDisabled: (function () {
      var b = main.querySelector('[data-action="outline:redo"]');
      return b ? b.getAttribute('aria-disabled') === 'true' : null;
    })(),
    emptyText: (main.querySelector('.ol-empty') || {}).textContent || '',
    note: (main.querySelector('.step-todo') || {}).textContent || '',
    text: main.textContent.replace(/\\s+/g, ' '),
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  };
`;

const page = await openChrome({ width: 1440, height: 1250 });
let exitCode = 0;

async function snap() { return page.evaluate(SNAP); }

async function gotoTask(id) {
  await page.evaluate("location.hash = '#/task/" + id + "'; return 1;");
  await sleep(320);
}

/** 用真实鼠标点一个元素（按选择器） */
async function click(sel) {
  /* 先滚到视口中间再点：大纲有 21 个节点，靠后的标题（及其下拉菜单）
     默认在视口外，按坐标点会点空 —— 这里踩过一次 */
  const pt = await page.evaluate(`
    var el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.textContent || '').trim() };
  `);
  if (!pt) throw new Error('找不到元素：' + sel);
  await page.mouseClick(pt.x, pt.y);
  await sleep(260);
  return pt;
}

/** 给输入框赋值并派发 input（+ 可选 change）事件 —— 走页面自己的处理函数 */
async function fill(sel, value, commit) {
  return page.evaluate(`
    var el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return 'ERR 找不到 ' + ${JSON.stringify(sel)};
    el.focus();
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (${!!commit}) el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  `);
}

/** 清掉屏幕上的轻提示（toast 会存活 2.8s，跨步骤断言时会读到上一条） */
async function clearToasts() {
  await page.evaluate(`
    Array.prototype.forEach.call(document.querySelectorAll('.toast'), function (t) {
      if (t.parentNode) t.parentNode.removeChild(t);
    });
    return 1;`);
}

/** 取最后一个轻提示（toast 会短时间累积，第一个可能不是本次的） */
async function lastToast() {
  return page.evaluate(`
    var list = document.querySelectorAll('.toast');
    return list.length ? list[list.length - 1].textContent.trim() : '';
  `);
}

/** 等生成结束（思考过程逐行出现 + 收尾 360ms） */
async function waitGenerated() {
  await sleep(500);                 // 先等 click → 确认 → runGenerate 这段链路把按钮置灰
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    const done = await page.evaluate(`
      var b = document.querySelector('[data-action="outline:generate"]');
      return b ? (b.getAttribute('aria-disabled') === 'true' ? 0 : 1) : -1;
    `);
    if (done === 1) { await sleep(200); return true; }
  }
  return false;
}

try {
  /* ================================================== A. 版面 40 / 60 */
  console.log('\n【A】进度条下方的 40 / 60 分栏');
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.account && !x.locked; })[0];
    App.store.login(u.account, u.password);
    return 1;
  `);
  await gotoTask(TASK);

  let s = await snap();
  check('RW-2026-001 的进度已重置到第 1 阶段「生成大纲」', s.hash === '#/task/' + TASK,
    'hash=' + s.hash);
  check('详情页 = 进度条卡片 + 阶段工作界面卡片（工作界面在进度条下方）',
    s.cardCount === 2 && s.hasStep && s.stepBox.t >= s.progressBox.b - 1,
    s.cardCount + ' 个卡片；进度条底部 ' + s.progressBox.b.toFixed(1) +
    ' → 工作界面顶部 ' + s.stepBox.t.toFixed(1));
  check('左右分栏是两列', s.layoutCols === 2, 'grid 列数=' + s.layoutCols);
  const leftW = s.leftBox.w, rightW = s.rightBox.w;
  const ratio = leftW / (leftW + rightW);
  check('左栏 40% / 右栏 60%（按内容宽度实测，±2%）', Math.abs(ratio - 0.4) <= 0.02,
    '左 ' + leftW.toFixed(1) + 'px / 右 ' + rightW.toFixed(1) + 'px → 实际 ' + (ratio * 100).toFixed(1) + '%');
  check('左栏：提示词在上、模型思考和推理过程在下',
    s.promptBox.b <= s.thinkBox.t + 1 && s.promptBox.t < s.thinkBox.t,
    '提示词 ' + s.promptBox.t.toFixed(1) + '–' + s.promptBox.b.toFixed(1) +
    '；思考过程 ' + s.thinkBox.t.toFixed(1) + '–' + s.thinkBox.b.toFixed(1));
  check('右栏是大纲结果：位置在左栏右侧、宽度更大',
    s.rightBox.l > s.leftBox.r - 1 && rightW > leftW,
    '左栏右 ' + s.leftBox.r.toFixed(1) + ' → 右栏左 ' + s.rightBox.l.toFixed(1));
  check('页面无横向溢出', s.scrollW <= s.clientW + 1, s.scrollW + ' vs ' + s.clientW);

  /* ================================================== B. 初始态 */
  console.log('\n【B】初始状态');
  check('右侧初始为空状态，给出下一步引导', s.nodes.length === 0 &&
    s.emptyText.indexOf('右侧还没有大纲') >= 0 && s.emptyText.indexOf('AI生成大纲') >= 0,
    s.emptyText.replace(/\s+/g, ' ').slice(0, 60));
  check('思考区初始给出说明，右侧状态标签为「未生成」',
    s.thinkLines.length === 0 && s.tags.indexOf('未生成') >= 0 && s.tags.indexOf('AI 预置结果') >= 0,
    '标签：' + s.tags.join(' / '));
  check('「AI生成大纲」按钮存在、带图标、初始可用',
    s.genBtn && s.genBtn.text === 'AI生成大纲' && s.genBtn.icon && !s.genBtn.disabled,
    JSON.stringify(s.genBtn));

  /* ================================================== C. 生成大纲 */
  console.log('\n【C】写提示词 → 生成大纲');
  const typed = await page.evaluate(`
    var el = document.getElementById('ol-prompt');
    el.focus();
    return el.tagName + ':' + (el.placeholder || '').length;
  `);
  await page.send('Input.insertText', {
    text: '按「学制变迁—学校沿革—教育人物」三条线索编排，重点保证民国时期教育史料的完整性，标题控制在 12 字以内。'
  });
  await sleep(200);
  const promptStored = await page.evaluate(`
    return App.store.outlineOf('${TASK}').prompt;
  `);
  check('提示词录入后落到数据层（真实键入，未整页重渲染）',
    typed.indexOf('TEXTAREA') === 0 && promptStored.indexOf('学制变迁') >= 0,
    promptStored.slice(0, 24) + '…（' + promptStored.length + ' 字）');

  await click('[data-action="outline:generate"]');
  await waitGenerated();
  s = await snap();
  check('生成结果：21 个标题节点，层级为 5 / 14 / 2',
    s.nodes.length === 21 &&
    s.nodes.filter(function (n) { return n.level === '1'; }).length === 5 &&
    s.nodes.filter(function (n) { return n.level === '2'; }).length === 14 &&
    s.nodes.filter(function (n) { return n.level === '3'; }).length === 2,
    s.nodes.length + ' 个节点；标签「' + s.tags.filter(function (t) { return t.indexOf('共 ') === 0; })[0] + '」');
  check('每个标题都输出了「主要内容说明」（21 / 21 非空）',
    s.nodes.filter(function (n) { return n.note && n.note.length >= 10; }).length === 21,
    '最短说明 ' + Math.min.apply(null, s.nodes.map(function (n) { return n.note.length; })) + ' 字，' +
    '最长 ' + Math.max.apply(null, s.nodes.map(function (n) { return n.note.length; })) + ' 字');
  check('标题保持层级关系：编号按层级递进（1. / 1.1 / 3.3.1）',
    s.nodes[0].num === '1.' && s.nodes[1].num === '1.1' && s.nodes[2].num === '1.2' &&
    s.nodes[8].num === '3.' && s.nodes[12].num === '3.3.1' && s.nodes[20].num === '5.2',
    s.nodes.slice(0, 4).map(function (n) { return n.num + n.title; }).join(' | ') + ' … ' +
    s.nodes[20].num + s.nodes[20].title);
  check('层级用缩进与标签双重表达（lv2 比 lv1 更靠右，lv3 最右）',
    s.nodes[1].left > s.nodes[0].left && s.nodes[12].left > s.nodes[1].left &&
    s.nodes[12].levelTag === '三级标题',
    'lv1 ' + s.nodes[0].left.toFixed(1) + ' < lv2 ' + s.nodes[1].left.toFixed(1) +
    ' < lv3 ' + s.nodes[12].left.toFixed(1) + '（' + s.nodes[12].num + s.nodes[12].title + '）');
  check('思考过程逐行记录（含提示词、选题、层级统计）',
    s.thinkLines.length === 6 && s.thinkLines[0].indexOf('读取提示词') === 0 &&
    s.thinkLines.some(function (l) { return l.indexOf('一级标题 5 个、二级标题 14 个、三级标题 2 个') >= 0; }),
    s.thinkLines.length + ' 行；末行：' + s.thinkLines[s.thinkLines.length - 1]);
  check('生成后按钮恢复可用',
    s.genBtn && s.genBtn.text === 'AI生成大纲' && !s.genBtn.disabled, JSON.stringify(s.genBtn));

  const afterFirst = s.nodes.map(function (n) { return n.title + '|' + n.note; });

  /* ================================================== D. 重新生成全部（覆盖确认） */
  console.log('\n【D】再次点击：覆盖确认');
  await click('[data-action="outline:generate"]');
  const dlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { title: m.querySelector('.modal-head').textContent.trim(),
      body: m.querySelector('.modal-body').textContent.replace(/\\s+/g, ' ').trim(),
      ok: m.querySelector('[data-action="ui:ok"]').textContent.trim() } : null;
  `);
  check('弹出确认框，提示文字与评审要求逐字一致',
    !!dlg && dlg.body.indexOf('AI重新生成大纲会覆盖已有大纲内容，是否确定重新生成？') >= 0,
    dlg ? '「' + dlg.body + '」（按钮：' + dlg.ok + '）' : 'ERR 没有弹窗');

  await click('.modal [data-action="ui:close"]');
  await sleep(200);
  s = await snap();
  check('点「取消」：大纲一字节都没变',
    s.nodes.map(function (n) { return n.title + '|' + n.note; }).join() === afterFirst.join(),
    '仍为 ' + s.nodes.length + ' 个标题');

  await click('[data-action="outline:generate"]');
  await click('.modal [data-action="ui:ok"]');
  const okWait = await waitGenerated();
  s = await snap();
  const afterSecond = s.nodes.map(function (n) { return n.title + '|' + n.note; });
  check('点「重新生成」：确认后整篇重新生成（标题层级与数量不变）',
    okWait && s.nodes.length === 21 && s.nodes[1].num === '1.1', s.nodes.length + ' 个标题');
  check('重新生成的内容确实是新的（内容说明换了写法，不是原样贴回）',
    afterSecond.join() !== afterFirst.join() &&
    s.nodes.filter(function (n, i) { return n.note !== afterFirst[i].split('|')[1]; }).length >= 14,
    s.nodes.filter(function (n, i) { return n.note !== afterFirst[i].split('|')[1]; }).length + ' 条内容说明被重写');

  /* ================================================== E. 单标题重新生成 */
  console.log('\n【E】单个标题的重新生成');
  await click('.ol-node[data-node="n1"] [data-action="ui:menu"]');
  const menu = await page.evaluate(`
    var m = document.querySelector('#ol-menu-n1');
    return m ? { hidden: m.classList.contains('hidden'),
      items: Array.prototype.map.call(m.querySelectorAll('.menu-item'), function (b) {
        return b.textContent.trim(); }) } : null;
  `);
  check('标题右侧按钮下拉出评审要求的两项（删除项在 K/L 段另测）',
    !!menu && !menu.hidden && menu.items.length === 3 &&
    menu.items[0] === '重新生成当前标题及内容说明' &&
    menu.items[1] === '重新生成子标题及内容说明',
    menu ? menu.items.join(' / ') : 'ERR 菜单没出来');

  await click('#ol-menu-n1 [data-action="outline:regen"][data-mode="node"]');
  const regen = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { title: m.querySelector('.modal-head').textContent.trim(),
      hasPrompt: !!m.querySelector('#ol-regen-prompt'),
      body: m.querySelector('.modal-body').textContent.replace(/\\s+/g, ' ') } : null;
  `);
  check('点「重新生成当前标题及内容说明」：先要求输入 prompt',
    !!regen && regen.hasPrompt && regen.title === '重新生成当前标题及内容说明',
    regen ? regen.title : 'ERR 没弹窗');

  await click('.modal [data-action="ui:ok"]');
  const kept = await page.evaluate("return !!document.querySelector('.modal');");
  const keptToast = await lastToast();
  check('prompt 为空时不放行，弹窗保持打开并提示',
    kept && keptToast.indexOf('请先输入提示词') >= 0,
    '弹窗仍打开=' + kept + '，轻提示：' + keptToast);

  const beforeRegen = s.nodes.map(function (n) { return n.title + '|' + n.note; });
  const shapeBefore = s.nodes.map(function (n) { return n.level + ':' + n.num; }).join(' ');
  await fill('#ol-regen-prompt', '改为按学制改革分段叙述，并补充女子教育的记载', true);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  s = await snap();
  const changed = s.nodes.filter(function (n, i) { return n.note !== beforeRegen[i].split('|')[1]; });
  check('输入 prompt 后重新生成：只改这一个标题（其他 20 个不受影响）',
    changed.length === 1 && changed[0].id === 'n1',
    changed.length + ' 条被改：' + changed.map(function (n) { return n.id; }).join());
  check('重新生成保持层级与编号不变；标题只在命中同义改写时才变，其余 20 条标题原样',
    s.nodes.map(function (n) { return n.level + ':' + n.num; }).join(' ') === shapeBefore &&
    s.nodes.filter(function (n, i) { return n.title !== beforeRegen[i].split('|')[0]; }).length <= 1,
    '层级编号不变；标题变化 ' +
    s.nodes.filter(function (n, i) { return n.title !== beforeRegen[i].split('|')[0]; }).length +
    ' 条（' + s.nodes[0].title + '）');

  /* 叶子节点的「重新生成子标题」应当是禁用的 */
  const leafId = s.nodes.filter(function (n) { return n.level === '2'; })
    .filter(function (n) { return !s.nodes.some(function (m, i) {
      return m.level === '3' && s.nodes.indexOf(n) + 1 === i; }); })[0].id;
  await click('.ol-node[data-node="' + leafId + '"] [data-action="ui:menu"]');
  const leafMenu = await page.evaluate(`
    var m = document.querySelector('#ol-menu-${leafId}');
    var sub = m.querySelector('[data-mode="sub"]');
    return { disabled: sub.getAttribute('aria-disabled') === 'true', title: sub.getAttribute('title') };
  `);
  check('叶子标题的「重新生成子标题及内容说明」标为不可用并说明原因',
    leafMenu.disabled && leafMenu.title.indexOf('没有子标题') >= 0,
    'aria-disabled=' + leafMenu.disabled + '，title=「' + leafMenu.title + '」');
  await click('#ol-menu-' + leafId + ' [data-action="outline:regen"][data-mode="sub"]');
  const leafToast = await lastToast();
  check('点禁用的那一项：给出引导而不是弹窗',
    leafToast.indexOf('没有子标题') >= 0 &&
    (await page.evaluate('return !document.querySelector(\'.modal\');')),
    '轻提示：' + leafToast);

  /* 有子标题的章节：连子标题一起重新生成 */
  const hasKid = s.nodes.filter(function (n) { return n.level === '1'; })[2];   // 第 3 章
  const beforeSub = s.nodes.map(function (n) { return n.title + '|' + n.note; });
  await click('.ol-node[data-node="' + hasKid.id + '"] [data-action="ui:menu"]');
  await click('#ol-menu-' + hasKid.id + ' [data-action="outline:regen"][data-mode="sub"]');
  const subDlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? m.querySelector('.modal-body').textContent.replace(/\\s+/g, ' ') : '';
  `);
  check('点「重新生成子标题及内容说明」：弹窗说明影响范围',
    subDlg.indexOf('及其 5 个子标题') >= 0, subDlg.slice(0, 78));
  await fill('#ol-regen-prompt', '结合本市教育行政机构的档案细化', true);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  s = await snap();
  const subChanged = s.nodes.filter(function (n, i) { return n.note !== beforeSub[i].split('|')[1]; });
  check('重新生成子树：该章节 + 其子标题（含孙标题）共 6 条被改写，其他章节不动',
    subChanged.length === 6 &&
    subChanged.map(function (n) { return n.id; }).join() === 'n9,n10,n11,n12,n13,n14',
    subChanged.map(function (n) { return n.id; }).join());

  /* ================================================== F. 折叠 */
  console.log('\n【F】折叠 / 展开');
  const visibleBefore = s.nodes.length;
  await click('.ol-node[data-node="n1"] .ol-fold');
  s = await snap();
  check('折叠一级标题：标题行还在，本章节的内容说明与 3 个子标题不再渲染',
    s.nodes.length === visibleBefore - 3 && s.nodes[0].id === 'n1' &&
    s.nodes[0].bodyVisible === false && s.nodes[0].foldIcon === 'false',
    visibleBefore + ' → ' + s.nodes.length + ' 个可见节点（3 个子标题被折叠）');
  await click('.ol-node[data-node="n1"] .ol-fold');
  s = await snap();
  check('再次点击展开，节点全部回来', s.nodes.length === visibleBefore && s.nodes[0].bodyVisible,
    s.nodes.length + ' 个可见节点');

  /* ================================================== G. 自己编写 */
  console.log('\n【G】自己编写大纲（点选 + 在前/在后添加）');
  check('多级标题选择器提供 8 级（一级…八级标题）',
    s.levelOptions.length === 8 && s.levelOptions[0] === '一级标题' &&
    s.levelOptions[7] === '八级标题', s.levelOptions.length + ' 项：' + s.levelOptions.join(' / '));

  const beforeG = s.nodes.length;
  await clearToasts();
  const idle = await page.evaluate(`
    return { el: !!document.getElementById('ol-sel-hint'),
      text: document.getElementById('main').textContent.indexOf('先点选一个标题') >= 0 };`);
  check('工具栏右侧不再有「先点选一个标题」提示（元素已删除，不是隐藏）',
    !idle.el && !idle.text,
    '提示元素存在=' + idle.el + '；页面出现该字样=' + idle.text);
  await click('[data-action="outline:add-after"]');
  const noSelToast = await lastToast();
  s = await snap();
  check('没点选任何标题时点「在后添加」：拦住并提示先点选',
    s.nodes.length === beforeG && noSelToast.indexOf('请先点选一个标题') >= 0,
    '轻提示：' + noSelToast);

  /* 点选第 4 章（n15 各级各类教育） */
  await click('.ol-node[data-node="n15"] .ol-title');
  const picked = await page.evaluate(`
    var el = document.querySelector('.ol-node[data-node="n15"]');
    var level = document.getElementById('ol-level');
    return {
      selected: el.classList.contains('is-selected'),
      only: document.querySelectorAll('.ol-node.is-selected').length,
      saidSelected: document.getElementById('main').textContent.indexOf('已选中') >= 0,
      level: level.value,
      store: App.taskOutline.history().selected
    };
  `);
  check('点标题即选中：高亮唯一、级别选择器同步为该标题的级别、页面上没有选中回显文字',
    picked.selected && picked.only === 1 && picked.store === 'n15' &&
    picked.saidSelected === false && picked.level === '1',
    '级别选择器=' + picked.level + '；全页出现"已选中"字样=' + picked.saidSelected);

  await page.evaluate("document.getElementById('ol-level').value = '2'; return 1;");
  await click('[data-action="outline:add-after"]');
  s = await snap();
  const addedId = await page.evaluate("return App.taskOutline.history().selected;");
  const addedNode = s.nodes.filter(function (n) { return n.id === addedId; })[0];
  const orderAfterAdd = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.map(function (n) { return n.id; });
  `);
  check('选中第 4 章后用「在后添加」+ 二级标题：插在它整棵子树之后（不是插进它的子标题里）',
    s.nodes.length === beforeG + 1 && addedNode.level === '2' && addedNode.num === '4.4' &&
    orderAfterAdd.indexOf(addedId) > orderAfterAdd.indexOf('n18') &&
    orderAfterAdd[orderAfterAdd.indexOf(addedId) + 1] === 'n19',
    addedNode.num + ' ' + addedNode.title + '（' + addedNode.levelTag + '）；位置 ' +
    orderAfterAdd.indexOf(addedId) + '，其后是 ' + orderAfterAdd[orderAfterAdd.indexOf(addedId) + 1]);
  const focused = await page.evaluate(`
    var a = document.activeElement;
    return a && a.getAttribute('data-edit') === 'title' ? a.getAttribute('data-id') : '';
  `);
  check('新增后光标落在新标题输入框、且新标题成为下一次添加的参照物',
    focused === addedId, '焦点=' + focused);

  await page.send('Input.insertText', { text: '教育经费史料选辑' });
  await sleep(150);
  const titleStored = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.filter(function (n) { return n.id === '${addedId}'; })[0].title;
  `);
  check('标题可直接编辑并即时落到数据层（不整页重渲染）',
    titleStored === '教育经费史料选辑', '「' + titleStored + '」');

  await fill('.ol-node[data-node="' + addedId + '"] .ol-note', '收录历年教育经费预算与决算档案，反映经费来源与投入变化。', true);
  const noteStored = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.filter(function (n) { return n.id === '${addedId}'; })[0].note;
  `);
  check('内容说明可直接编辑并落库', noteStored.indexOf('教育经费预算') >= 0, noteStored.slice(0, 26) + '…');

  /* 在前添加：插在选中标题之前（同级） */
  await page.evaluate("document.getElementById('ol-level').value = '1'; return 1;");
  await click('[data-action="outline:add-before"]');
  s = await snap();
  const beforeId = await page.evaluate("return App.taskOutline.history().selected;");
  const orderBefore = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.map(function (n) { return n.id; });
  `);
  const beforeNode = s.nodes.filter(function (n) { return n.id === beforeId; })[0];
  check('「在前添加」：插在选中标题之前一位，且级别取自选择器',
    orderBefore[orderBefore.indexOf(addedId) - 1] === beforeId && beforeNode.level === '1',
    beforeNode.num + ' ' + beforeNode.title + '（' + beforeNode.levelTag + '）插在 ' + addedId + ' 之前');

  /* 刷新后仍在（localStorage 持久化） */
  await page.goto(PAGE_URL);
  await sleep(300);
  const afterReload = await page.evaluate(`
    var n = App.store.outlineOf('${TASK}').nodes.filter(function (x) { return x.id === '${addedId}'; })[0];
    return n ? (n.title + '|' + n.note.slice(0, 6)) : 'ERR 丢失';
  `);
  check('刷新浏览器后自己写的大纲仍在（持久化到 localStorage）',
    afterReload.indexOf('教育经费史料选辑') === 0, afterReload);
  await gotoTask(TASK);

  /* ================================================== H. 撤销 / 恢复（10 步上限） */
  console.log('\n【H】撤销 / 恢复（上限 10 步）');
  const base = (await snap()).nodes.length;
  await click('.ol-node[data-node="n1"] .ol-title');       // 先点选一个参照标题
  for (let i = 0; i < 13; i++) {
    await page.evaluate(`
      var el = document.getElementById('ol-level');
      el.value = String(1 + (${i} % 3));
      document.querySelector('[data-action="outline:add-after"]').click();
      return 1;
    `);
    await sleep(90);
  }
  await sleep(200);
  s = await snap();
  let h = await page.evaluate("return App.taskOutline.history();");
  check('连做 13 次变更：撤销栈封顶在 10 步',
    s.nodes.length === base + 13 && h.past === 10,
    base + ' → ' + s.nodes.length + ' 个节点；撤销栈 ' + h.past + ' / 10');
  check('面板上的计数与撤销 / 恢复按钮状态与栈一致',
    s.histText.indexOf('可撤销 10 / 10 步') >= 0 && !s.undoDisabled && s.redoDisabled,
    '「' + s.histText + '」撤销禁用=' + s.undoDisabled + ' 恢复禁用=' + s.redoDisabled);

  for (let i = 0; i < 10; i++) {
    await page.evaluate("document.querySelector('[data-action=\"outline:undo\"]').click(); return 1;");
    await sleep(110);
  }
  s = await snap();
  h = await page.evaluate("return App.taskOutline.history();");
  check('撤销 10 次：回到 10 步之前（只保留最近 10 步，更早的确实找不回）',
    s.nodes.length === base + 3 && h.past === 0 && h.future === 10,
    '节点数 ' + s.nodes.length + '（期望 ' + (base + 3) + '），可恢复 ' + h.future + ' 步');
  check('撤销到底后「撤销」按钮语义禁用',
    s.undoDisabled && !s.redoDisabled, '「' + s.histText + '」');

  for (let i = 0; i < 3; i++) {
    await page.evaluate("document.querySelector('[data-action=\"outline:redo\"]').click(); return 1;");
    await sleep(110);
  }
  s = await snap();
  h = await page.evaluate("return App.taskOutline.history();");
  check('恢复 3 次：节点数回来了，且这 3 步从「可恢复」转到「可撤销」',
    s.nodes.length === base + 6 && h.past === 3 && h.future === 7,
    '节点数 ' + s.nodes.length + '，可撤销 ' + h.past + '，可恢复 ' + h.future);

  await click('.ol-node .ol-title');          // 撤销后选中项可能已经不在，重新点选一个
  await page.evaluate("document.querySelector('[data-action=\"outline:add-after\"]').click(); return 1;");
  await sleep(200);
  h = await page.evaluate("return App.taskOutline.history();");
  check('产生新变更后，恢复栈被清空（Word 的行为）',
    h.past === 4 && h.future === 0, '可撤销 ' + h.past + '，可恢复 ' + h.future);

  /* ================================================== I. 其他阶段 / 其他任务 */
  console.log('\n【I】未生成工作界面的阶段');
  const others = await page.evaluate(`
    var ts = App.store.tasks();
    function pick(f) { var t = ts.filter(f)[0]; return t ? { id: t.id, stage: t.stage,
      title: (App.store.stageDef(t.stage) || {}).title || '' } : null; }
    return {
      other: pick(function (t) { return t.status === 'IN_PROGRESS' && !t.paused && t.stage !== 1; }),
      fresh: pick(function (t) { return t.status === 'NOT_STARTED'; }),
      done: pick(function (t) { return t.status === 'DONE'; })
    };
  `);
  const cases = [
    ['其他在建任务', others.other, '第 ' + others.other.stage + ' 阶段「' + others.other.title + '」的工作界面尚未生成'],
    ['未开始的任务', others.fresh, '任务尚未启动'],
    ['已完成的任务', others.done, '第 ' + others.done.stage + ' 阶段「' + others.done.title + '」的工作界面尚未生成']
  ];
  for (const [label, target, expect] of cases) {
    await gotoTask(target.id);
    const o = await snap();
    check(label + '（' + target.id + '）：给出阶段说明，不显示生成大纲界面',
      !o.hasStep && o.note.indexOf(expect) >= 0, o.note.replace(/\s+/g, ' ').slice(0, 56));
  }

  /* ================================================== K. 全部折叠 / 全部展开 */
  console.log('\n【K】全部折叠 / 全部展开');
  await gotoTask(TASK);          // I 段把页面停在别的任务上了，先回来
  s = await snap();
  const totalNow = s.nodes.length;
  const lv1Count = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.filter(function (n) { return n.level === 1; }).length;`);
  await click('[data-action="outline:collapse-all"]');
  s = await snap();
  check('点「全部折叠」：只剩一级标题可见（' + lv1Count + ' 个），所有节点都标记为已折叠',
    s.nodes.length === lv1Count && s.nodes.every(function (n) { return n.foldIcon === 'false'; }),
    totalNow + ' → ' + s.nodes.length + ' 个可见节点');
  await click('[data-action="outline:expand-all"]');
  s = await snap();
  check('点「全部展开」：全部节点回来，折叠标记清零',
    s.nodes.length === totalNow && s.nodes.every(function (n) { return n.foldIcon === 'true'; }),
    s.nodes.length + ' 个可见节点');

  /* ================================================== L. 删除当前章节 */
  console.log('\n【L】删除当前章节');
  await click('.ol-node[data-node="n1"] [data-action="ui:menu"]');
  const menu3 = await page.evaluate(`
    var m = document.querySelector('#ol-menu-n1');
    return Array.prototype.map.call(m.querySelectorAll('.menu-item'), function (b) {
      return b.textContent.trim(); });
  `);
  check('三个点下拉里增加了「删除当前章节」，排在两个重新生成之后',
    menu3.length === 3 && menu3[2] === '删除当前章节', menu3.join(' / '));

  await click('.ol-node[data-node="n1"] .ol-title');     // 先选中它，删掉后才谈得上"清掉选中态"
  const selBeforeDel = await page.evaluate("return App.taskOutline.history().selected;");
  const beforeDel = (await snap()).nodes.length;
  await click('.ol-node[data-node="n1"] [data-action="ui:menu"]');
  await click('#ol-menu-n1 [data-action="outline:delete"]');
  const delDlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? m.querySelector('.modal-body').textContent.replace(/\s+/g, ' ') : '';
  `);
  check('删除前二次确认，并说明会连带删除几个子标题、可用撤销恢复',
    delDlg.indexOf('及其 3 个子标题') >= 0 && delDlg.indexOf('撤销') >= 0, delDlg.slice(0, 60));
  await click('.modal [data-action="ui:ok"]');
  await sleep(300);
  s = await snap();
  check('确认后删除该章节及其子标题（4 个节点），其余大纲不受影响',
    s.nodes.length === beforeDel - 4 && s.nodes.every(function (n) { return n.id !== 'n1'; }),
    beforeDel + ' → ' + s.nodes.length + ' 个节点');
  check('被删章节若是选中的，选中态一并清掉',
    selBeforeDel === 'n1' &&
    (await page.evaluate("return App.taskOutline.history().selected;")) === null,
    '删除前 selected=' + selBeforeDel + '，删除后 selected=' +
    (await page.evaluate("return App.taskOutline.history().selected;")));
  await page.evaluate("document.querySelector('[data-action=\"outline:undo\"]').click(); return 1;");
  await sleep(300);
  s = await snap();
  check('撤销后章节与子标题整棵回来（删除也进撤销栈）',
    s.nodes.length === beforeDel && s.nodes[0].id === 'n1', s.nodes.length + ' 个节点');

  /* ================================================== L2. 头部排布 + 清空 */
  console.log('\n【L2】撤销计数位置 / 清空');
  await click('.ol-node[data-node="n1"] .ol-title');   // 制造一次选中，顺带刷新头部
  s = await snap();
  const midY = function (b) { return (b.t + b.b) / 2; };
  check('「可撤销 K / 10 步，可恢复 M 步」紧贴在「撤销」按钮前面（同一行）',
    s.histBox.r <= s.undoBox.l + 1 && Math.abs(midY(s.histBox) - midY(s.undoBox)) < 2,
    '计数右 ' + s.histBox.r.toFixed(1) + ' → 撤销左 ' + s.undoBox.l.toFixed(1) +
    '；中线差 ' + Math.abs(midY(s.histBox) - midY(s.undoBox)).toFixed(2) + 'px');
  check('「清空」排在「恢复」之后，且头部仍是单行（行高不变才不会被 mousedown 位移吞掉点击）',
    s.clearBox.l >= s.redoBox.r - 1 && s.resultHeadBox.h < 60,
    '恢复右 ' + s.redoBox.r.toFixed(1) + ' → 清空左 ' + s.clearBox.l.toFixed(1) +
    '；头部高 ' + s.resultHeadBox.h.toFixed(1) + 'px');
  check('工具栏里不再有「拖动标题左侧的手柄…」这句说明',
    !s.hasDragHint, s.hasDragHint ? 'ERR 还在' : '已删除（拖动手柄的 title 提示仍保留）');
  check('工具栏右侧也不再有「先点选一个标题」提示',
    !s.hasSelHint, s.hasSelHint ? 'ERR 还在' : '已删除');
  const bar = await page.evaluate(`
    function b(sel) { var el = document.querySelector(sel); if (!el) return null;
      var r = el.getBoundingClientRect();
      return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; }
    return { tools: b('.ol-tools'), rows: document.querySelectorAll('.ol-tools-row').length,
      addAfter: b('[data-action="outline:add-after"]'),
      foldAll: b('[data-action="outline:collapse-all"]'),
      expandAll: b('[data-action="outline:expand-all"]') };`);
  check('「全部折叠 / 全部展开」紧跟「在后添加」且同排（工具栏只剩一行）',
    bar.rows === 1 && bar.foldAll.l >= bar.addAfter.r - 1 &&
    bar.expandAll.l >= bar.foldAll.r - 1 &&
    Math.abs((bar.foldAll.t + bar.foldAll.b) / 2 - (bar.addAfter.t + bar.addAfter.b) / 2) < 2 &&
    bar.foldAll.t >= bar.tools.t && bar.foldAll.b <= bar.tools.b,
    '在后添加右 ' + bar.addAfter.r + ' → 全部折叠左 ' + bar.foldAll.l +
    ' → 全部展开左 ' + bar.expandAll.l + '；工具栏行数 ' + bar.rows);

  const beforeClear = await page.evaluate(`
    var r = App.store.outlineOf('${TASK}');
    return { nodes: r.nodes.length, ids: r.nodes.map(function (n) { return n.id; }),
      prompt: r.prompt.length, thinking: r.thinking.length,
      past: App.taskOutline.history().past };`);
  await click('[data-action="outline:clear"]');
  const clearDlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? m.querySelector('.modal-body').textContent.replace(/\s+/g, ' ') : '';`);
  check('清空前二次确认：写明标题数量、提示词保留、可用撤销恢复',
    clearDlg.indexOf('全部 ' + beforeClear.nodes + ' 个标题') >= 0 &&
    clearDlg.indexOf('提示词保留') >= 0 && clearDlg.indexOf('撤销') >= 0,
    clearDlg.slice(0, 70));
  await click('.modal [data-action="ui:ok"]');
  await sleep(350);
  s = await snap();
  const afterClear = await page.evaluate(`
    var r = App.store.outlineOf('${TASK}');
    var h = App.taskOutline.history();
    return { nodes: r.nodes.length, prompt: r.prompt.length, thinking: r.thinking.length,
      past: h.past, future: h.future };`);
  check('清空后：标题与内容说明全清、空状态回来、思考过程一并清掉，但提示词保留',
    afterClear.nodes === 0 && afterClear.thinking === 0 &&
    afterClear.prompt === beforeClear.prompt && beforeClear.prompt > 0 &&
    s.emptyText.indexOf('右侧还没有大纲') >= 0,
    '节点 ' + beforeClear.nodes + ' → 0；思考 ' + beforeClear.thinking + ' → 0；提示词仍有 ' +
    afterClear.prompt + ' 字');
  check('清空进撤销栈，且重渲染后头部计数立即与撤销栈一致（没有滞后一拍）',
    afterClear.past === beforeClear.past + 1 &&
    s.histText === '可撤销 ' + afterClear.past + ' / 10 步，可恢复 ' + afterClear.future + ' 步',
    '撤销栈 ' + beforeClear.past + ' → ' + afterClear.past + '；DOM 显示「' + s.histText + '」');
  check('空大纲时「清空」语义禁用', s.clearDisabled === true, 'aria-disabled=' + s.clearDisabled);

  /* 清空后新增：id 不能与撤销栈里的历史节点撞号（nextId 不能被重置） */
  await page.evaluate("document.querySelector('[data-action=\"outline:add-before\"]').click(); return 1;");
  await sleep(300);
  const newId = await page.evaluate("return App.taskOutline.history().selected;");
  check('清空后可以直接新增（空大纲不要求先点选），新 id 不与清空前的节点撞号',
    !!newId && beforeClear.ids.indexOf(newId) < 0,
    '新节点 ' + newId + '；清空前共有 ' + beforeClear.ids.length + ' 个 id');

  await page.evaluate("document.querySelector('[data-action=\"outline:undo\"]').click(); return 1;");
  await sleep(250);
  await page.evaluate("document.querySelector('[data-action=\"outline:undo\"]').click(); return 1;");
  await sleep(300);
  const restored = await page.evaluate(`
    var ns = App.store.outlineOf('${TASK}').nodes;
    return { n: ns.length, ids: ns.map(function (x) { return x.id; }) };`);
  check('两次撤销后整篇大纲原样回来（清空 → 新增 两步都能退回去）',
    restored.n === beforeClear.nodes && restored.ids.join() === beforeClear.ids.join(),
    restored.n + ' 个标题，顺序与清空前一致');

  /* ================================================== L3. 末尾标题的菜单不被裁掉 */
  console.log('\n【L3】末尾标题的操作菜单');
  const lastId = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.slice(-1)[0].id;`);
  const beforeMenu = await page.evaluate(`
    var el = document.querySelector('.ol-node[data-node="${lastId}"] [data-action="ui:menu"]');
    el.scrollIntoView({ block: 'center' });
    var head = document.querySelector('.ol-panel-result .ol-panel-head').getBoundingClientRect();
    var card = document.querySelector('.outline-step').getBoundingClientRect();
    return { y: window.scrollY, headTop: Math.round(head.top), cardBottom: Math.round(card.bottom) };`);
  await click('.ol-node[data-node="' + lastId + '"] [data-action="ui:menu"]');
  const opened = await page.evaluate(`
    function b(el) { var r = el.getBoundingClientRect();
      return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right) }; }
    var menu = document.querySelector('.menu:not(.hidden)');
    if (!menu) return { err: 'ERR 菜单没出来' };
    return { y: window.scrollY,
      headTop: Math.round(document.querySelector('.ol-panel-result .ol-panel-head').getBoundingClientRect().top),
      cardBottom: Math.round(document.querySelector('.outline-step').getBoundingClientRect().bottom),
      viewportH: window.innerHeight, up: menu.classList.contains('menu-up'),
      menu: b(menu),
      items: Array.prototype.map.call(menu.querySelectorAll('.menu-item'), b) };`);
  check('打开最后一个标题的 ⋮：菜单改为向上弹出，三项都完整可见（不再被卡片下边缘裁掉）',
    !opened.err && opened.up && opened.items.length === 3 &&
    opened.menu.b <= opened.cardBottom + 1 && opened.menu.t >= 0 &&
    opened.items.every(function (i) { return i.t >= opened.menu.t - 1 && i.b <= opened.menu.b + 1; }),
    opened.err || ('menu-up=' + opened.up + '，菜单 ' + opened.menu.t + '–' + opened.menu.b +
      '（卡片底 ' + opened.cardBottom + '、视口高 ' + opened.viewportH + '），' + opened.items.length + ' 项都在菜单范围内'));
  check('打开菜单不会把页面滚走：撤销 / 恢复那一行的位置一动不动',
    !opened.err && opened.y === beforeMenu.y && opened.headTop === beforeMenu.headTop,
    opened.err || ('scrollY ' + beforeMenu.y + ' → ' + opened.y +
      '；大纲结果头部 top ' + beforeMenu.headTop + ' → ' + opened.headTop));
  /* 留一张截图：末尾标题的菜单向上弹出、三项完整可见（先清掉前面的轻提示，别糊在图上） */
  await clearToasts();
  await sleep(200);
  const shotMenu = await page.shot(SHOT_DIR + 'task-outline-menu-last.png', { full: false });
  await page.evaluate("App.ui.closeMenus(); return 1;");
  check('末尾标题菜单截图已生成', true, shotMenu.split('/').slice(-1)[0]);

  const firstId = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes[0].id;`);
  await click('.ol-node[data-node="' + firstId + '"] [data-action="ui:menu"]');
  const firstMenu = await page.evaluate(`
    var menu = document.querySelector('.menu:not(.hidden)');
    return menu ? menu.classList.contains('menu-up') : null;`);
  check('第一个标题的菜单仍然向下弹出（不是无脑向上）', firstMenu === false,
    'menu-up=' + firstMenu);
  await page.evaluate("App.ui.closeMenus(); return 1;");
  await clearToasts();

  /* ================================================== M. 拖动排序 */
  console.log('\n【M】拖动标题更改位置');
  /* 先把大纲重置成"刚生成"的样子，拖动的前后位置才可复现 */
  await page.evaluate(`
    App.store.clearOutline('${TASK}');
    App.store.setOutlinePrompt('${TASK}', '按「学制变迁—学校沿革—教育人物」三条线索编排。');
    return 1;`);
  await sleep(300);
  await click('[data-action="outline:generate"]');
  await waitGenerated();
  await sleep(300);
  s = await snap();
  check('拖动前先重置成刚生成的 21 个标题（本节断言才可复现）', s.nodes.length === 21,
    s.nodes.length + ' 个标题');

  /* 拖动：所有坐标都要落在视口内，否则鼠标事件落在画面外、什么都不会发生 */
  async function dragNode(srcId, tgtId, half) {
    const pts = await page.evaluate(`
      var src = document.querySelector('.ol-node[data-node="${srcId}"] .ol-grip');
      var tgt = document.querySelector('.ol-node[data-node="${tgtId}"] .ol-node-head');
      if (!src || !tgt) return { err: 'ERR 找不到节点' };
      function pt(el, f) {
        var r = el.getBoundingClientRect();
        return { x: r.left + Math.min(80, r.width / 2), y: r.top + r.height * f };
      }
      /* 先试"目标居中"，不行再试"源居中"，两个都在视口内才动手 */
      var tries = [tgt, src];
      for (var i = 0; i < tries.length; i++) {
        tries[i].scrollIntoView({ block: 'center' });
        var a = pt(src, 0.5), b = pt(tgt, ${half});
        var minY = 90, maxY = window.innerHeight - 40;
        if (a.y > minY && a.y < maxY && b.y > minY && b.y < maxY) return { from: a, to: b };
      }
      return { err: 'ERR 源与目标无法同时进入视口（把窗口调高或换一对节点）' };
    `);
    if (pts.err) throw new Error(pts.err + '：' + srcId + ' → ' + tgtId);
    await page.dragTo(pts.from, pts.to);
    await sleep(400);
  }

  const idsFresh = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.map(function (n) { return n.id; });`);

  /* 1) 整章拖动：把第 2 章（n5，带 3 个子标题）拖到第 1 章上方 */
  await dragNode('n5', 'n1', 0.25);
  let dragState = await page.evaluate(`
    var ns = App.store.outlineOf('${TASK}').nodes;
    var main = document.getElementById('main');
    return {
      ids: ns.map(function (n) { return n.id; }),
      head: ns.slice(0, 4).map(function (n) { return n.id + ':' + n.level; }).join(','),
      nums: Array.prototype.map.call(main.querySelectorAll('.ol-node'), function (el) {
        return el.querySelector('.ol-num').textContent.trim() + el.querySelector('.ol-title').value;
      }).slice(0, 4)
    };`);
  check('拖动整章到第 1 章之前：子树跟着走、它成为第 1 章、编号随之重排',
    dragState.head === 'n5:1,n6:2,n7:2,n8:2' && dragState.ids.length === 21,
    dragState.nums.join(' | '));
  check('拖动后没有丢节点、也没有重复（id 集合与拖动前一致）',
    dragState.ids.slice().sort().join() === idsFresh.slice().sort().join(),
    dragState.ids.length + ' 个节点，集合一致');

  /* 2) 跨级拖动：把 3.1（n10，二级）拖到第 4 章（n15，一级）下半区 → 放到它之后并升为一级 */
  const beforeDrag2 = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.map(function (n) { return n.id; });`);
  await dragNode('n10', 'n15', 0.85);
  const drag2 = await page.evaluate(`
    var ns = App.store.outlineOf('${TASK}').nodes;
    var m = ns.filter(function (n) { return n.id === 'n10'; })[0];
    var t = ns.filter(function (n) { return n.id === 'n15'; })[0];
    var ti = ns.indexOf(t);
    var end = ti;
    for (var i = ti + 1; i < ns.length && ns[i].level > t.level; i++) end = i;
    return { level: m.level, idx: ns.indexOf(m), targetEnd: end };`);
  check('拖到目标标题下半区＝放到它整棵子树之后，层级随目标（二级 → 一级）',
    drag2.level === 1 && drag2.idx === drag2.targetEnd + 1,
    'n10 层级 ' + drag2.level + '，位置 ' + drag2.idx + '（目标子树末尾 ' + drag2.targetEnd + '）');

  /* 3) 禁止拖进自己的子标题 */
  await clearToasts();
  const guardBefore = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.map(function (n) { return n.id + ':' + n.level; });`);
  await dragNode('n9', 'n13', 0.25);
  const guardToast = await lastToast();
  const guardAfter = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.map(function (n) { return n.id + ':' + n.level; });`);
  const diff = guardBefore.filter(function (x, i) { return guardAfter[i] !== x; }).slice(0, 3);
  check('把章节拖进它自己的子标题：拒绝并说明原因，大纲一字未动',
    guardAfter.join() === guardBefore.join() &&
    guardToast.indexOf('不能把章节移动到它自己的子标题里') >= 0,
    '轻提示：' + guardToast + '；前 3 处差异：' + (diff.length ? diff.join(',') : '无'));

  /* 4) 拖动进撤销栈：撤销一次回到第 2 次拖动之前 */
  await page.evaluate("document.querySelector('[data-action=\"outline:undo\"]').click(); return 1;");
  await sleep(350);
  const afterUndo = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.map(function (n) { return n.id; });`);
  check('拖动同样进撤销栈：一次撤销回到第 2 次拖动之前',
    afterUndo.join() === beforeDrag2.join(),
    '撤销后顺序与拖动前一致（' + afterUndo.length + ' 个节点）');

  /* ================================================== N. 8 级标题 */
  console.log('\n【N】8 级标题');
  const anchorId = await page.evaluate(`
    return App.store.outlineOf('${TASK}').nodes.slice(-1)[0].id;`);
  await click('.ol-node[data-node="' + anchorId + '"] .ol-title');   // 真实点击才会触发选中
  const deep = [];
  for (let lv = 3; lv <= 8; lv++) {
    await page.evaluate(`
      document.querySelector('.ol-node[data-node="' + ${JSON.stringify(anchorId)} + '"] .ol-title');
      document.getElementById('ol-level').value = '${lv}';
      document.querySelector('[data-action="outline:add-after"]').click();
      return 1;`);
    await sleep(140);
    deep.push(await page.evaluate("return App.taskOutline.history().selected;"));
  }
  s = await snap();
  const deepest = s.nodes.filter(function (n) { return n.id === deep[deep.length - 1]; })[0];
  const indent = function (id) {
    return s.nodes.filter(function (n) { return n.id === id; })[0].left;
  };
  check('可以一路加到八级标题：级别标签、编号段数与缩进都对',
    deepest && deepest.level === '8' && deepest.levelTag === '八级标题' &&
    deepest.num.split('.').length === 8 && indent(deep[5]) > indent(deep[0]),
    deepest ? deepest.num + ' ' + deepest.levelTag + '；缩进 ' +
      deep.map(function (id) { return indent(id).toFixed(0); }).join(' < ') : 'ERR 没加出来');
  const deepOk = await page.evaluate(`
    var ns = App.store.outlineOf('${TASK}').nodes;
    return ns.filter(function (n) { return n.level > 8; }).length;`);
  check('数据层没有出现超过 8 级的标题', deepOk === 0, '超过 8 级的节点 ' + deepOk + ' 个');

  /* ================================================== J. 截图 + 异常 */
  console.log('\n【J】截图与运行时异常');
  await gotoTask(TASK);
  /* 前面的对抗测试往大纲里塞了十几个空标题，先清掉再生成一份干净的用于截图 */
  await page.evaluate(`
    App.store.clearOutline('${TASK}');
    App.store.setOutlinePrompt('${TASK}',
      '按「学制变迁—学校沿革—教育人物」三条线索编排，重点保证民国时期教育史料的完整性，标题控制在 12 字以内。');
    return 1;
  `);
  await sleep(350);
  await click('[data-action="outline:generate"]');
  await waitGenerated();
  await sleep(3600);   // 轻提示 2.8s 后消失：整页截图会把 fixed 的提示糊进画面，等它退场
  const shot1 = await page.shot(SHOT_DIR + 'task-outline.png', { full: true });

  await click('.ol-node[data-node="n1"] .ol-fold');
  await sleep(300);
  const shot3 = await page.shot(SHOT_DIR + 'task-outline-collapsed.png');
  await click('.ol-node[data-node="n1"] .ol-fold');
  await sleep(200);

  await click('[data-action="outline:generate"]');
  await sleep(400);
  const shot2 = await page.shot(SHOT_DIR + 'task-outline-confirm.png');
  await click('.modal [data-action="ui:close"]');
  await sleep(300);

  /* 拖到一半停住截图：能看到落点指示线与半透明的被拖章节 */
  const hold = await page.evaluate(`
    var src = document.querySelector('.ol-node[data-node="n5"] .ol-grip');
    var tgt = document.querySelector('.ol-node[data-node="n1"] .ol-node-head');
    src.scrollIntoView({ block: 'center' });
    var a = src.getBoundingClientRect(), b = tgt.getBoundingClientRect();
    return { from: { x: a.left + 6, y: a.top + a.height / 2 },
      to: { x: b.left + 80, y: b.top + b.height * 0.25 } };`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hold.from.x, y: hold.from.y, buttons: 0 });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: hold.from.x, y: hold.from.y, button: 'left', clickCount: 1, buttons: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hold.to.x, y: hold.to.y, buttons: 1 });
  await sleep(250);
  const dragging = await page.evaluate(`
    return { dragging: !!document.querySelector('.ol-node.is-dragging'),
      dragged: (document.querySelector('.ol-node.is-dragging') || {}).getAttribute
        ? document.querySelector('.ol-node.is-dragging').getAttribute('data-node') : null,
      selected: Array.prototype.map.call(document.querySelectorAll('.ol-node.is-selected'),
        function (el) { return el.getAttribute('data-node'); }),
      mark: document.querySelectorAll('.ol-node.drop-above, .ol-node.drop-below').length };`);
  const shot4 = await page.shot(SHOT_DIR + 'task-outline-drag.png');
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: hold.to.x, y: hold.to.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(300);
  check('拖动过程中：被拖章节半透明并被选中、目标标题上方出现落点指示线',
    dragging.dragging && dragging.mark === 1 &&
    dragging.selected.join() === 'n5' && dragging.selected.join() === dragging.dragged,
    'is-dragging=' + dragging.dragged + '；选中=' + dragging.selected.join() +
    '；指示线 ' + dragging.mark + ' 条');
  await page.evaluate("document.querySelector('[data-action=\"outline:undo\"]').click(); return 1;");
  await sleep(250);

  check('界面 / 折叠 / 覆盖确认 / 拖动中截图已生成', true,
    [shot1, shot2, shot3, shot4].map(function (f) { return f.split('/').slice(-1)[0]; }).join('、'));

  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ')
      : '0 条（console 警告 ' + page.warns().length + ' 条）');

  exitCode = check.summary('生成大纲工作界面') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
