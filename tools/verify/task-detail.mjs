/* ==========================================================================
   验证套件：编研任务详情页骨架

   本轮评审要求：详情界面**只留**三样东西 ——
     进度条 / 编研任务标题 / 返回任务列表（放在标题行最右端）
   其余内容（进度明细、阶段目标·产物·门禁、团队分工、阶段流转记录、
   归档材料、修改任务、状态标签）全部先撤下。

   运行：node tools/verify/task-detail.mjs [file:///.../index.html]
   ========================================================================== */

import { openChrome, sleep, makeChecks, waitFor } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ||
  new URL('../../prototype-system/index.html', import.meta.url).href;
const SHOT_DIR = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

const check = makeChecks();

/* 一次性把详情页 DOM 该量的都量回来（每次 render 后必须重新取，不能缓存节点） */
const SNAP = `
  var main = document.getElementById('main');
  var head = main.querySelector('.detail-head');
  var title = head ? head.querySelector('.detail-title') : null;
  var btn = head ? head.querySelector('button') : null;
  var stepper = main.querySelector('.stage-stepper');
  var steps = stepper ? Array.prototype.slice.call(stepper.querySelectorAll('.step')) : [];
  function box(el) { var r = el.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }
  var headBox = head ? box(head) : null;
  var headStyle = head ? getComputedStyle(head) : null;
  return {
    hash: location.hash,
    cardCount: main.querySelectorAll('.card').length,
    headChildren: head ? Array.prototype.map.call(head.children, function (e) {
      return e.className || e.tagName; }) : [],
    titleTag: title ? title.tagName : '',
    titleText: title ? title.textContent : '',
    titleBox: title ? box(title) : null,
    headBox: headBox,
    headPadLeft: headStyle ? parseFloat(headStyle.paddingLeft) : 0,
    headPadRight: headStyle ? parseFloat(headStyle.paddingRight) : 0,
    btnBox: btn ? box(btn) : null,
    btnText: btn ? btn.textContent.trim() : '',
    btnAction: btn ? btn.getAttribute('data-action') : '',
    btnHasIcon: btn ? !!btn.querySelector('svg') : false,
    btnIsLast: (head && btn) ? head.lastElementChild === btn : false,
    mainButtons: main.querySelectorAll('button').length,
    buttonsOutsideStep: main.querySelectorAll('button').length -
      main.querySelectorAll('.outline-step button, .sel-step button, .step-todo button').length,
    buttonsOutsideWork: main.querySelectorAll('button').length -
      main.querySelectorAll('.outline-step button, .sel-step button, .step-todo button, ' +
        '.stage-stepper button').length,
    hasStepPanel: !!main.querySelector('.outline-step, .sel-step'),
    hasSelectionPanel: !!main.querySelector('.sel-step'),
    hasTodoNote: !!main.querySelector('.step-todo'),
    mainActions: Array.prototype.map.call(main.querySelectorAll('[data-action]'), function (e) {
      return e.getAttribute('data-action'); }),
    stepperClass: stepper ? stepper.className : '',
    stepperInBody: stepper ? !!stepper.closest('.card-body') : false,
    stepCount: steps.length,
    stepTags: steps.map(function (s) { return s.tagName; }),
    stepActions: stepper ? stepper.querySelectorAll('[data-action]').length : -1,
    steps: steps.map(function (s) {
      return {
        pos: (s.className.match(/step (done|current|pending)/) || [])[1] || '',
        locked: s.className.indexOf('locked') >= 0,
        disabled: s.getAttribute('aria-disabled') === 'true',
        viewing: s.className.indexOf('viewing') >= 0,
        title: s.querySelector('.step-title').textContent,
        desc: s.querySelector('.step-desc').textContent,
        dot: s.querySelector('.step-dot').textContent.trim(),
        dotIcon: !!s.querySelector('.step-dot svg'),
        current: s.getAttribute('aria-current'),
        cursor: getComputedStyle(s).cursor
      };
    }),
    leftovers: ['.split-grid', '.timeline', '.team-list', '.task-meta', '.ai-block',
                '.gate-bar', '.toolbar', '.stage-chips', '.detail-head .tag', 'hr.rule']
      .filter(function (sel) {
        /* 阶段工作界面里用到的通用容器（如选材库的 .toolbar）不算"残留" */
        return Array.prototype.slice.call(main.querySelectorAll(sel)).some(function (el) {
          return !el.closest('.outline-step, .sel-step');
        });
      }),
    text: main.textContent.replace(/\\s+/g, ' '),
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  };
`;

function has(snap, word) { return snap.text.indexOf(word) >= 0; }

/** 清掉现有轻提示，保证 lastToast 读到的就是这次操作产生的 */
async function clearToasts() {
  await page.evaluate(`
    Array.prototype.forEach.call(document.querySelectorAll('.toast'), function (t) {
      if (t.parentNode) t.parentNode.removeChild(t); });
    return 1;`);
}

function lastToast() {
  return page.evaluate(`
    var l = document.querySelectorAll('.toast');
    return l.length ? l[l.length - 1].textContent.trim() : '';`);
}

async function openTask(id) {
  await page.evaluate("location.hash = '#/task/" + id + "'; return 1;");
  await sleep(320);
  return page.evaluate(SNAP);
}

const page = await openChrome({ width: 1440, height: 950 });
let exitCode = 0;

try {
  /* ================================================== A. 前置：登录 + 列表 */
  console.log('\n【A】前置：登录与任务列表');
  await page.goto(PAGE_URL);

  const gate = await page.evaluate(`
    return { hash: location.hash, hasLoginForm: !!document.getElementById('login-form') };
  `);
  check('未登录时停在登录页', gate.hasLoginForm,
    'hash=' + gate.hash + '，登录表单=' + gate.hasLoginForm);

  const login = await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.account && !x.locked; })[0];
    var r = App.store.login(u.account, u.password);
    App.router.navigate('#/task');
    return r.ok ? (u.account + ' / ' + u.name) : ('ERR ' + r.error);
  `);
  await sleep(350);
  check('演示账号可登录并进入编研任务列表', login.indexOf('ERR') !== 0, login);

  const ids = await page.evaluate(`
    var ts = App.store.tasks();
    function pick(f) { return ts.filter(f)[0] || null; }
    var running = pick(function (t) { return t.status === 'IN_PROGRESS' && !t.paused; });
    var done = pick(function (t) { return t.status === 'DONE'; });
    var fresh = pick(function (t) { return t.status === 'NOT_STARTED'; });
    var paused = pick(function (t) { return !!t.paused; });
    return {
      total: ts.length,
      running: running ? running.id : '', runningStage: running ? running.stage : 0,
      done: done ? done.id : '', doneStage: done ? done.stage : 0,
      fresh: fresh ? fresh.id : '',
      paused: paused ? paused.id : '',
      stages: App.store.taskStages().map(function (s) { return s.title; })
    };
  `);
  check('种子数据里三档任务齐备（进行中 / 已完成 / 未开始）',
    ids.running && ids.done && ids.fresh,
    '进行中 ' + ids.running + '（第 ' + ids.runningStage + ' 阶段）· 已完成 ' + ids.done +
    ' · 未开始 ' + ids.fresh + ' · 共 ' + ids.total + ' 个任务');

  const listSnap = await page.evaluate(`
    return {
      cards: document.querySelectorAll('.task-card').length,
      chips: document.querySelectorAll('.task-card .stage-chip').length,
      pager: !!document.querySelector('#main .pager'),
      newBtn: !!document.querySelector('[data-action="task:new"]'),
      filter: !!document.getElementById('task-status'),
      search: !!document.getElementById('task-kw')
    };
  `);
  check('任务列表仍正常：第 1 页 12 张卡片 + 分页条（本轮改动没有波及列表页）',
    listSnap.cards === 12 && listSnap.pager && ids.total === 39,
    listSnap.cards + ' 张卡片 / 分页条=' + listSnap.pager + ' / store ' + ids.total + ' 个任务');
  check('卡片上的阶段进度切片仍在（每张卡片 = 每个环节一个切片）',
    listSnap.chips === listSnap.cards * ids.stages.length,
    listSnap.chips + ' 个切片 = ' + listSnap.cards + ' 张 × ' + ids.stages.length + ' 个环节');
  check('列表工具栏（新建 / 状态筛选 / 搜索）仍在',
    listSnap.newBtn && listSnap.filter && listSnap.search,
    '新建=' + listSnap.newBtn + ' 筛选=' + listSnap.filter + ' 搜索=' + listSnap.search);

  /* ================================================== B. 点卡片进详情 */
  console.log('\n【B】从卡片进入详情');
  const entered = await page.evaluate(`
    var title = document.querySelector('.task-card .task-title');
    var want = title.getAttribute('data-id');
    title.click();
    return want;
  `);
  await sleep(350);
  let snap = await page.evaluate(SNAP);
  check('点卡片标题进入任务详情', snap.hash === '#/task/' + entered,
    'hash=' + snap.hash + '（期望 #/task/' + entered + '）');
  const crumb = await page.evaluate(
    "return document.querySelector('.topbar-crumb').textContent.trim();");
  check('顶栏面包屑显示任务编号（详情页的唯一入口信息）', crumb === entered,
    '面包屑=「' + crumb + '」（期望 ' + entered + '）');

  snap = await openTask(ids.running);

  /* ================================================== C. 骨架：标题行 */
  console.log('\n【C】标题行：标题 + 最右端的返回按钮');
  check('详情页 = 进度条卡片 + 当前阶段的工作界面卡片（RW-2026-001 在第 2 阶段 → 确定选材）',
    snap.cardCount === 2 && snap.hasStepPanel && snap.hasSelectionPanel && !snap.hasTodoNote,
    snap.cardCount + ' 个 .card；工作界面=' + snap.hasStepPanel + '；选材界面=' + snap.hasSelectionPanel);
  check('卡片头是「标题 / 间隔 / 按钮」三个元素，顺序正确',
    JSON.stringify(snap.headChildren) === JSON.stringify(['detail-title', 'spacer', 'btn']),
    JSON.stringify(snap.headChildren));
  check('标题是一级标题 h1，文字为选题名称',
    snap.titleTag === 'H1' && snap.titleText.length > 0,
    '<' + snap.titleTag + '> ' + snap.titleText);
  check('返回任务列表按钮在标题行最右端（是最后一个子元素）', snap.btnIsLast,
    '最后一个子元素是按钮=' + snap.btnIsLast);
  check('按钮文字与图标正确（arrow-left + 返回任务列表）',
    snap.btnText === '返回任务列表' && snap.btnHasIcon && snap.btnAction === 'task:list',
    '「' + snap.btnText + '」action=' + snap.btnAction + ' 图标=' + snap.btnHasIcon);

  const gapRight = Math.abs(snap.headBox.r - snap.headPadRight - snap.btnBox.r);
  const gapLeft = Math.abs(snap.headBox.l + snap.headPadLeft - snap.titleBox.l);
  check('按钮右边缘贴齐标题行内容区右边缘（几何验证，±2px）', gapRight <= 2,
    '卡片头右 ' + snap.headBox.r.toFixed(1) + ' - 内边距 ' + snap.headPadRight +
    ' → 内容区右 ' + (snap.headBox.r - snap.headPadRight).toFixed(1) +
    '；按钮右 ' + snap.btnBox.r.toFixed(1) + '；差 ' + gapRight.toFixed(2) + 'px');
  check('标题左边缘贴齐标题行内容区左边缘（±2px）', gapLeft <= 2,
    '差 ' + gapLeft.toFixed(2) + 'px');
  check('按钮位于标题右侧，同一行（垂直中线相差 < 2px）',
    snap.btnBox.l > snap.titleBox.r &&
    Math.abs((snap.btnBox.t + snap.btnBox.b) / 2 - (snap.titleBox.t + snap.titleBox.b) / 2) < 2,
    '标题右 ' + snap.titleBox.r.toFixed(1) + ' → 按钮左 ' + snap.btnBox.l.toFixed(1));
  check('除工作界面与进度条外，页面上唯一的可交互元素就是返回按钮',
    snap.buttonsOutsideWork === 1 &&
    snap.mainActions.filter(function (a) { return a === 'task:list'; }).length === 1,
    snap.buttonsOutsideWork + ' 个（工作界面与进度条之外）；共 ' + snap.mainButtons + ' 个 button');
  check('没有横向溢出（顶部工具栏撤掉后不残留滚动条）',
    snap.scrollW <= snap.clientW + 1,
    'scrollWidth ' + snap.scrollW + ' / clientWidth ' + snap.clientW);

  /* ================================================== D. 骨架：进度条 */
  console.log('\n【D】六阶段进度条');
  check('进度条在卡片内容区里（不再是套在卡片里的第二层卡片）',
    snap.stepperInBody && snap.stepperClass.indexOf('stage-stepper') >= 0,
    'class="' + snap.stepperClass + '" inBody=' + snap.stepperInBody);
  check('进度条共 ' + ids.stages.length + ' 步（已去掉「辅文编写」），标题与 store 一致',
    snap.stepCount === ids.stages.length &&
    snap.steps.map(function (s) { return s.title; }).join('|') === ids.stages.join('|'),
    snap.steps.map(function (s) { return s.title; }).join(' → '));
  check('进度条每一步都是按钮（data-action=task:stage）：点它＝把任务进展停在该环节',
    snap.stepTags.every(function (t) { return t === 'BUTTON'; }) &&
    snap.stepActions === ids.stages.length,
    JSON.stringify(snap.stepTags) + '；内部 data-action ' + snap.stepActions + ' 个');
  check('可点环节鼠标指针是手型、不能跳过的环节是 not-allowed 且语义禁用',
    snap.steps.every(function (s) {
      return s.locked ? (s.cursor === 'not-allowed' && s.disabled) : (s.cursor === 'pointer' && !s.disabled);
    }),
    snap.steps.map(function (s) {
      return s.title + ':' + s.cursor + (s.locked ? '(禁)' : '');
    }).join(' '));
  const snapStage = ids.runningStage;
  check('只有"当前环节之后的那一环"可以往前点，再往后都锁住（不能跳过下一环）',
    snap.steps.filter(function (s) { return !s.locked; }).length === snapStage + 1 &&
    snap.steps[snapStage].locked === false &&
    snap.steps[snapStage + 1] && snap.steps[snapStage + 1].locked === true,
    '可点 ' + snap.steps.filter(function (s) { return !s.locked; }).length + ' 步（第 1 至第 ' +
    (snapStage + 1) + ' 步）；第 ' + (snapStage + 2) + ' 步起 locked');

  const stage = ids.runningStage;
  const expectPos = [];
  for (let i = 1; i <= ids.stages.length; i++) expectPos.push(i < stage ? 'done' : (i === stage ? 'current' : 'pending'));
  check('进行中任务（第 ' + stage + ' 阶段）的进度状态正确：前 ' + (stage - 1) + ' 步已完成、第 ' +
    stage + ' 步进行中、其余未开始',
    snap.steps.map(function (s) { return s.pos; }).join(',') === expectPos.join(','),
    snap.steps.map(function (s) { return s.title + '(' + s.pos + '/' + s.desc + ')'; }).join(' '));
  check('已完成步骤用对勾图标、未完成用阶段序号',
    snap.steps.every(function (s) {
      return s.pos === 'done' ? (s.dotIcon && s.dot === '') : (s.dot === String(snap.steps.indexOf(s) + 1));
    }),
    snap.steps.map(function (s) { return (s.dotIcon ? '[√]' : s.dot) + s.title; }).join(' '));
  check('aria-current="step" 只标在任务当前所在阶段上',
    snap.steps.filter(function (s) { return s.current === 'step'; }).length === 1 &&
    snap.steps[stage - 1].current === 'step',
    '第 ' + stage + ' 步 aria-current=' + snap.steps[stage - 1].current);

  /* ================================================== E. 撤下的内容确已消失 */
  console.log('\n【E】按要求撤下的内容');
  const gone = [
    ['归档材料 N 件按钮', '归档材料'],
    ['修改任务按钮', '修改任务'],
    ['任务状态标签', '任务状态'],
    ['进度明细：当前阶段', '当前阶段'],
    ['进度明细：创建时间', '创建'],
    ['任务日期范围（含「~」区间符号）', ' ~ '],
    ['阶段面板：阶段目标', '阶段目标'],
    ['阶段面板：阶段产物', '阶段产物'],
    ['阶段面板：门禁条件', '门禁条件'],
    ['七步原型对照入口', '七步原型'],
    ['团队分工', '团队分工'],
    ['阶段流转记录', '阶段流转记录'],
    ['任务编号文字', '任务编号']
  ];
  gone.forEach(function (pair) {
    check('详情页不再出现「' + pair[0] + '」', !has(snap, pair[1]),
      has(snap, pair[1]) ? 'ERR 仍能找到「' + pair[1] + '」' : '已撤下');
  });
  check('撤下的区块没有以残留结构留在 DOM 里',
    snap.leftovers.length === 0,
    snap.leftovers.length ? 'ERR 仍有 ' + JSON.stringify(snap.leftovers) : '无残留容器');

  /* ================================================== F. 进度条点选阶段 */
  console.log('\n【F】点环节＝把进展停在这一环；不能跳过下一环');
  const live = () => page.evaluate(`
    var t = App.store.getTask('${ids.running}');
    var main = document.getElementById('main');
    return { stage: t.stage, status: t.status,
      hist: t.stageHistory.map(function (h) { return h.stage; }).join(','),
      panel: main.querySelector('.outline-step') ? 'outline'
        : (main.querySelector('.sel-step') ? 'selection'
        : (main.querySelector('.compose-entry') ? 'compose' : 'note')),
      toast: (function () {
        var l = document.querySelectorAll('.toast');
        return l.length ? l[l.length - 1].textContent.trim() : ''; })() };`);

  /* 退回第 1 阶段：任务进展真的停在 1，第 2 阶段起回到未开始 */
  await page.evaluate("document.querySelector('#main .stage-stepper [data-stage=\"1\"]').click(); return 1;");
  await waitFor(page, "!!document.querySelector('#main .outline-step')");
  let st = await live();
  const afterBack = await page.evaluate(`
    var main = document.getElementById('main');
    return { locked: Array.prototype.map.call(main.querySelectorAll('.stage-stepper .step'),
      function (b) { return (b.className.indexOf('locked') >= 0) ? '1' : '0'; }).join('') };`);
  check('点第 1 阶段：任务进展回退并停在「生成大纲」（状态回到进行中、阶段史只剩 1）',
    st.stage === 1 && st.status === 'IN_PROGRESS' && st.hist === '1' && st.panel === 'outline',
    'stage=' + st.stage + '；状态=' + st.status + '；阶段史=' + st.hist + '；界面=' + st.panel);
  check('回退后：第 2 阶段起都是「未开始」，且只能点到第 2 阶段（后面锁住）',
    afterBack.locked === '00111',
    '第 1~' + ids.stages.length + ' 步 locked 标记=' + afterBack.locked);
  check('回退后不再有"正在查看别的阶段"那种提示条',
    !(await page.evaluate("return !!document.querySelector('#main .step-banner');")),
    '提示条已取消');

  /* 跳过第 2 阶段去点第 3 阶段：拦住 */
  await clearToasts();
  await page.evaluate("document.querySelector('#main .stage-stepper [data-stage=\"3\"]').click(); return 1;");
  await sleep(350);
  st = await live();
  check('不能跳过下一环：在第 1 阶段点第 3 阶段 → 被拦住、进度不动',
    st.stage === 1 && st.toast.indexOf('不能跳过第 2 阶段') >= 0 &&
    st.toast.indexOf('按顺序推进') >= 0,
    '轻提示：' + st.toast + '（stage 仍为 ' + st.stage + '）');

  /* 推进一环：第 2 阶段 */
  await clearToasts();
  await page.evaluate("document.querySelector('#main .stage-stepper [data-stage=\"2\"]').click(); return 1;");
  await waitFor(page, "!!document.querySelector('#main .sel-step')");
  st = await live();
  check('点第 2 阶段（下一环）：进展推进到「确定选材」，界面同步切换',
    st.stage === 2 && st.hist === '1,2' && st.panel === 'selection',
    'stage=' + st.stage + '；阶段史=' + st.hist + '；界面=' + st.panel);
  check('推进后：第 3 阶段变为可点（可继续推进），第 4 阶段起仍锁住',
    (await page.evaluate(`
      var main = document.getElementById('main');
      return Array.prototype.map.call(main.querySelectorAll('.stage-stepper .step'), function (b) {
        return (b.className.indexOf('locked') >= 0) ? '1' : '0'; }).join('');`)) === '00011',
    '第 1~5 步 locked 标记更新为 00011');

  /* ============ F2. 进展持久化：刷新与"种子更新"都不该把阶段退回去 ============ */
  const stageNow = await page.evaluate("return App.store.getTask('" + ids.running + "').stage;");
  await page.goto(PAGE_URL);
  await sleep(900);
  const afterReload = await page.evaluate(`
    var t = App.store.getTask('${ids.running}');
    return { stage: t.stage, status: t.status,
      hist: t.stageHistory.map(function (h) { return h.stage; }).join(','),
      progressKey: !!localStorage.getItem('archive-proto-system:taskProgress') };`);
  check('刷新页面后：任务进展（阶段 / 状态 / 阶段史）保持不变',
    afterReload.stage === stageNow && afterReload.progressKey,
    '刷新前第 ' + stageNow + ' 阶段 → 刷新后第 ' + afterReload.stage + ' 阶段（阶段史 ' +
    afterReload.hist + '）');

  /* 模拟"演示数据版本更新"：把种子版本写回上一版 → 数据重播种，但任务进展要保留 */
  await page.evaluate("localStorage.setItem('archive-proto-system:seed', '2026-09-27.2'); return 1;");
  await page.goto(PAGE_URL);
  await sleep(1000);
  const afterReseed = await page.evaluate(`
    var t = App.store.getTask('${ids.running}');
    var rec = App.store.composeOf('${ids.running}');
    return { stage: t.stage, seeded: localStorage.getItem('archive-proto-system:seed'),
      demoBack: Object.keys(rec.chapters).length, note: '' };`);
  check('演示数据版本更新（重播种）后：**任务进展仍然保留**，演示数据也确实是新的',
    afterReseed.stage === stageNow &&
    afterReseed.seeded === (await page.evaluate("return App.mock.SEED_VERSION;")) &&
    afterReseed.demoBack >= 2,
    '重播种后仍是第 ' + afterReseed.stage + ' 阶段；种子版本 ' + afterReseed.seeded);

  /* 重播种后回到任务详情页（goto 到 index.html 没有带 hash，路由停在默认页） */
  await page.evaluate("location.hash = '#/task/" + ids.running + "'; return 1;");
  await sleep(450);

  /* ================================================== G. 返回按钮 */
  console.log('\n【G】返回任务列表');
  const btnPt = await page.evaluate(`
    var b = document.querySelector('#main .detail-head button').getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  `);
  await page.mouseClick(btnPt.x, btnPt.y);
  await sleep(350);
  const back = await page.evaluate(`
    return { hash: location.hash, cards: document.querySelectorAll('.task-card').length };
  `);
  check('点返回按钮回到任务列表', back.hash === '#/task' && back.cards === 12,
    'hash=' + back.hash + '，' + back.cards + ' 张卡片（第 1 页）');

  /* ================================================== H. 三档状态各测一遍 */
  console.log('\n【H】不同状态任务的进度条');
  const doneSnap = await openTask(ids.done);
  check('已完成任务：' + ids.stages.length + ' 步全部「已完成」，没有当前步',
    doneSnap.steps.every(function (s) { return s.pos === 'done' && s.desc === '已完成'; }) &&
    doneSnap.steps.every(function (s) { return s.current !== 'step'; }),
    doneSnap.steps.map(function (s) { return s.title + '(' + s.desc + ')'; }).join(' '));

  const doneView = await page.evaluate(`
    var m = document.getElementById('main');
    return { publish: !!m.querySelector('.pb-card'),
      readOnly: m.textContent.indexOf('只读') >= 0,
      note: (m.querySelector('.step-todo') || {}).textContent
        ? m.querySelector('.step-todo').textContent.replace(/\s+/g, ' ').trim() : '',
      title: (m.querySelector('.pb-title') || {}).textContent || '' };`);
  check('已完成任务：显示第 ' + ids.doneStage + ' 阶段「成果发布」面板，并标明本环节只读（发布后不可再改）',
    doneView.publish && doneView.readOnly &&
    doneView.note.indexOf('只读') >= 0 && doneView.note.indexOf('尚未生成') < 0,
    '成果发布面板=' + doneView.publish + '；提示：' + doneView.note.slice(0, 40));

  const freshSnap = await openTask(ids.fresh);
  check('未开始任务：' + ids.stages.length + ' 步全部「未开始」，圆点是序号、没有对勾',
    freshSnap.steps.every(function (s) { return s.pos === 'pending' && s.desc === '未开始' && !s.dotIcon; }),
    freshSnap.steps.map(function (s) { return s.title + '(' + s.desc + ')'; }).join(' '));
  check('未开始任务：' + ids.stages.length + ' 个环节全部锁住（点环节不能替它启动）',
    freshSnap.steps.every(function (s) { return s.locked && s.disabled; }),
    freshSnap.steps.map(function (s) { return s.title + (s.locked ? '(禁)' : ''); }).join(' '));
  await page.evaluate("document.querySelector('#main .stage-stepper [data-stage=\"1\"]').click(); return 1;");
  await sleep(300);
  const freshGuard = await page.evaluate(`
    var t = App.store.getTask('${ids.fresh}');
    var l = document.querySelectorAll('.toast');
    return { status: t.status, stage: t.stage,
      toast: l.length ? l[l.length - 1].textContent.trim() : '' };`);
  check('未开始任务点环节：被拦住，提示先去「⋮」菜单启动（任务没被启动）',
    freshGuard.status === 'NOT_STARTED' && freshGuard.stage === 1 &&
    freshGuard.toast.indexOf('请先在任务卡片的「⋮」菜单里点「启动」') >= 0,
    '轻提示：' + freshGuard.toast);
  check('未开始任务：进度条 + 一句「先启动」的说明，不显示工作界面',
    freshSnap.cardCount === 2 && freshSnap.hasTodoNote && !freshSnap.hasStepPanel &&
    freshSnap.buttonsOutsideWork === 1 && freshSnap.leftovers.length === 0,
    freshSnap.cardCount + ' 卡片 / 阶段说明=' + freshSnap.hasTodoNote);

  const pausedId = await page.evaluate(`
    var t = App.store.tasks().filter(function (x) { return x.status === 'IN_PROGRESS' && !x.paused; })[0];
    if (!t) return '';
    if (t.status === 'NOT_STARTED') App.store.startTask(t.id);
    var r = App.store.pauseTask(t.id);
    return r && r.ok ? t.id : ('ERR ' + (r && r.message));
  `);
  await sleep(200);
  if (pausedId && pausedId.indexOf('ERR') === 0) {
    check('暂停态可构造（用于验证进度条文案）', false, pausedId);
  } else if (pausedId) {
    await waitFor(page, "!!document.querySelector('#main .step-todo') || !!document.querySelector('#main .outline-step') || !!document.querySelector('#main .sel-step')");
    const pausedSnap = await openTask(pausedId);
    const cur = pausedSnap.steps.filter(function (s) { return s.pos === 'current'; })[0];
    check('已暂停任务：当前阶段文案显示「已暂停」',
      !!cur && cur.desc === '已暂停', cur ? cur.title + '(' + cur.desc + ')' : 'ERR 没有当前步');
    await page.evaluate("App.store.resumeTask('" + pausedId + "'); return 1;");
  } else {
    check('暂停态可构造（用于验证进度条文案）', false, 'ERR 找不到可暂停的任务');
  }

  /* ================================================== I. 截图 */
  console.log('\n【I】截图');
  await openTask(ids.running);
  const shot1 = await page.shot(SHOT_DIR + 'task-detail-running.png');
  await openTask(ids.done);
  const shot2 = await page.shot(SHOT_DIR + 'task-detail-done.png');
  check('详情页截图已生成', true, shot1.split('/').slice(-1)[0] + '、' + shot2.split('/').slice(-1)[0]);

  /* ================================================== J. 跨模块回归 */
  console.log('\n【J】周边模块没有被带坏');
  await page.evaluate("location.hash = '#/archive/" + ids.done + "'; return 1;");
  await sleep(350);
  const arch = await page.evaluate(`
    return {
      hash: location.hash,
      rows: document.querySelectorAll('#main tbody tr').length,
      stillHasTaskEntry: !!document.querySelector('[data-action="ar:goto-task"]')
    };
  `);
  check('材料归档仍支持 #/archive/<任务编号> 直达（去掉「归档材料 N 件」按钮后这条路没断）',
    arch.rows > 0, 'hash=' + arch.hash + '，' + arch.rows + ' 行归档材料');

  for (const route of ['#/workbench', '#/topic', '#/review', '#/product', '#/archive', '#/system/dict']) {
    await page.evaluate("location.hash = '" + route + "'; return 1;");
    await sleep(260);
    const ok = await page.evaluate(`
      var main = document.getElementById('main');
      return { len: main.innerHTML.length, cards: main.querySelectorAll('.card, .task-card').length };
    `);
    check('回归：' + route + ' 正常渲染', ok.len > 200,
      ok.len + ' 字节 / ' + ok.cards + ' 个卡片');
  }

  /* ================================================== K. 异常清零 */
  console.log('\n【K】运行时异常');
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error',
    errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ')
      : '0 条（console 警告 ' + page.warns().length + ' 条）');

  exitCode = check.summary('编研任务详情页骨架') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
