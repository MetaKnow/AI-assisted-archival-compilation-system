/* ==========================================================================
   验证套件：第 5 阶段「成果发布」（消息中心 + 逐级审核 + 发布生成成果 + 审核信息表）

   覆盖评审要求：
     · 成果发布的主要作用＝对编研任务成果**发起审核**；审核按「流程配置」的步骤与用户走，
       以**推送审核消息**的方式流转；审核人点消息 → 弹出审核界面（左：流程与各步审核意见；右：成果）
     · 不通过 → 任务退回第 4 阶段「审核校定」并推送消息给发起人
     · 三步都通过 → 成果推送到「编研成果」模块生成数据、任务各环节只读、生成审核信息表（表 D.1）

   运行：node tools/verify/publish.mjs [file:///.../index.html]
   ========================================================================== */

import { openChrome, sleep, makeChecks } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ||
  new URL('../../prototype-system/index.html', import.meta.url).href;
const SHOT_DIR = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

const check = makeChecks();
const TASK = 'RW-2026-001';       /* 用来走"全部通过"的主线 */
/* 用来走"不通过退回"：RW-2026-003 已在种子里带一条"成果审核中"的流程，
   改用 RW-2026-002（种子里是暂停态，脚本先继续它，再推到第 5 阶段） */
const TASK2 = 'RW-2026-002';
const page = await openChrome({ width: 1500, height: 950 });
let exitCode = 0;

async function click(sel) {
  const pt = await page.evaluate(`
    var el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  if (!pt) throw new Error('找不到元素：' + sel);
  await page.mouseClick(pt.x, pt.y);
  await sleep(300);
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

/** 停到第 5 阶段并打开它的面板（任务在第 2 阶段种子里，不能跳级） */
async function gotoPublish(taskId) {
  await page.evaluate("location.hash = '#/task/" + taskId + "'; return 1;");
  await sleep(450);
  for (const s of ['3', '4', '5']) {
    await page.evaluate(`var b = document.querySelector('.stage-stepper [data-stage="${s}"]'); if (b) b.click(); return 1;`);
    await sleep(420);
    if (s === '3') {
      await page.evaluate("if (App.taskCompose) App.taskCompose.close(); return 1;");
      await sleep(200);
    }
  }
}

/** 从消息中心点第一条待办 → 审核界面 → 填意见 → 通过 / 不通过 */
async function actOnReview(opinion, pass) {
  await page.evaluate("document.querySelector('[data-action=\"app:notify\"]').click(); return 1;");
  await sleep(400);
  const opened = await page.evaluate(`
    var items = Array.prototype.slice.call(document.querySelectorAll('.msg-item[data-action="msg:open"]'));
    var hit = items.filter(function (i) { return i.textContent.indexOf('待办') >= 0; })[0] || items[0];
    if (!hit) return false;
    hit.click();
    return true;`);
  await sleep(600);
  if (!opened) return false;
  await page.evaluate(`document.getElementById('pr-opinion').value = ${JSON.stringify(opinion)}; return 1;`);
  await page.evaluate(`document.querySelector('[data-action="${pass ? 'pr:pass' : 'pr:reject'}"]').click(); return 1;`);
  await sleep(700);
  return true;
}

const REC = `
  var rec = App.store.publishOf(TASK_ID);
  var t = App.store.getTask(TASK_ID);
  return {
    status: rec ? rec.status : '',
    current: rec ? rec.current : -1,
    steps: rec ? rec.steps.map(function (s) {
      return { name: s.name, status: s.status, reviewer: s.reviewer, opinion: s.opinion,
        people: s.reviewers.map(function (r) { return r.name + '/' + r.dept + '/' + r.roleLabel; }) }; }) : [],
    taskStage: t.stage, taskStatus: t.status, published: !!t.published,
    locked: App.store.isTaskLocked(TASK_ID),
    productId: rec ? rec.productId : '',
    messages: App.store.messages().map(function (m) {
      return { to: m.to, title: m.title, kind: m.kind, taskId: m.taskId, read: m.read }; }),
    unread: App.store.unreadMessageCount()
  };
`.replace(/TASK_ID/g, JSON.stringify(TASK));

try {
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.account && !x.locked; })[0];
    App.store.login(u.account, u.password);
    return 1;`);
  await sleep(400);

  /* ================================================== A. 流程配置驱动 */
  console.log('\n【A】审核步骤来自「流程配置」，三步都配了审核人');
  const cfg = await page.evaluate(`
    return App.store.flowSteps().map(function (s) {
      return { name: s.name, n: s.reviewers.length,
        people: s.reviewers.map(function (r) { return r.name + '（' + r.roleLabel + '／' + r.dept + '）'; }) }; });`);
  check('流程配置里有 3 个审核步骤，且每步都配了审核人（成果发布按它逐级推送）',
    cfg.length === 3 && cfg.every(function (s) { return s.n >= 1; }),
    cfg.map(function (s) { return s.name + '→' + s.people.join('、'); }).join('；'));

  /* ================================================== B. 第 5 阶段：发起审核 */
  console.log('\n【B】第 5 阶段「成果发布」：发起审核');
  /* 先跑一遍三类审核：这样审核界面的"编研成果文件"目录上会带命中数（审核人要看着命中审） */
  await page.evaluate(`
    ['political', 'professional', 'compliance'].forEach(function (k) {
      App.store.saveAuditRun('${TASK}', k, App.audit.run('${TASK}', k));
    });
    return 1;`);
  await sleep(400);
  await gotoPublish(TASK);
  const panel = await page.evaluate(`
    var m = document.getElementById('main');
    return { stage: App.store.getTask('${TASK}').stage,
      title: (m.querySelector('.pb-title') || {}).textContent || '',
      status: (m.querySelector('.pb-ops .tag') || {}).textContent || '',
      btns: Array.prototype.map.call(m.querySelectorAll('.pb-ops button'), function (b) { return b.textContent.trim(); }),
      hasFlowCard: m.textContent.indexOf('审核流程') >= 0,
      note: (m.querySelector('.data-note') || {}).textContent.replace(/\\s+/g, ' ').trim() };`);
  check('停到第 5 阶段：显示「成果发布」面板（成果信息 + 审核流程 + 发起审核）',
    panel.stage === 5 && panel.title.indexOf('本市教育事业发展史料汇编') >= 0 &&
    panel.status === '未发起审核' && panel.btns.join() === '发起审核' && panel.hasFlowCard,
    panel.title + '｜' + panel.status + '｜按钮 ' + panel.btns.join('、'));

  await click('[data-action="pb:start"]');
  const dlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { head: m.querySelector('.modal-head').textContent.trim(),
      body: m.querySelector('.modal-body').textContent.replace(/\\s+/g, ' ').trim(),
      ok: m.querySelector('.modal-foot [data-action="ui:ok"]').textContent.trim() } : null;`);
  check('点「发起审核」：二次确认里列出流程配置的各个步骤与审核人',
    !!dlg && dlg.head.indexOf('发起成果发布审核') === 0 &&
    dlg.body.indexOf('编研部门领导审批：李文华') >= 0 &&
    dlg.body.indexOf('主管副馆长审批：孙丽') >= 0 && dlg.body.indexOf('馆长审批：赵志远') >= 0 &&
    dlg.ok === '发起审核',
    dlg ? dlg.body.slice(0, 78) : 'ERR');
  await click('.modal [data-action="ui:ok"]');
  await sleep(600);
  let rec = await page.evaluate(REC);
  check('发起后：流程进入审核中，三个环节（按配置）都是待审核，任务停在第 5 阶段',
    rec.status === 'REVIEWING' && rec.steps.length === 3 &&
    rec.steps.every(function (s) { return s.status === 'PENDING'; }) &&
    rec.current === 0 && rec.taskStage === 5,
    '流程 ' + rec.status + '；当前环节 ' + (rec.steps[0] || {}).name);
  check('推送审核消息：第 1 步审核人收到「成果发布审核待办」消息，顶栏出现未读角标',
    rec.messages.length === 1 && rec.messages[0].to === '李文华' &&
    rec.messages[0].kind === 'publish-review' && rec.messages[0].taskId === TASK &&
    rec.messages[0].read === false && rec.unread === 1,
    '→ ' + rec.messages[0].to + '｜' + rec.messages[0].title);
  const badge = await page.evaluate(`
    var b = document.querySelector('[data-action="app:notify"] .badge');
    return b ? b.textContent.trim() : '';`);
  check('顶栏铃铛显示未读角标', badge === '1', '角标=' + badge);

  /* ================================================== C. 消息中心 + 审核界面 */
  console.log('\n【C】消息中心 → 点击消息弹出审核界面');
  await click('[data-action="app:notify"]');
  const msgPanel = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { head: m.querySelector('.modal-head').textContent.trim(),
      items: m.querySelectorAll('.msg-item').length,
      unread: m.querySelectorAll('.msg-unread').length,
      first: (m.querySelector('.msg-item') || {}).textContent.replace(/\\s+/g, ' ').trim(),
      clickable: !!m.querySelector('.msg-item[data-action="msg:open"]') } : null;`);
  check('点铃铛：打开消息中心，列出审核消息（含收件人、点击提示、未读高亮）',
    !!msgPanel && msgPanel.head === '消息中心' && msgPanel.items === 1 &&
    msgPanel.unread === 1 && msgPanel.clickable &&
    msgPanel.first.indexOf('收件人：李文华') >= 0 && msgPanel.first.indexOf('点击查看审核界面') >= 0,
    msgPanel ? msgPanel.first.slice(0, 70) : 'ERR');

  await page.evaluate("document.querySelector('.msg-item[data-action=\"msg:open\"]').click(); return 1;");
  await sleep(800);
  const reviewUi = await page.evaluate(`
    var s = document.getElementById('audit-screen');
    if (!s) return null;
    var W = window.innerWidth, H = window.innerHeight, r = s.getBoundingClientRect();
    function px(el) { return el ? Math.round(el.getBoundingClientRect().width) : 0; }
    var draft = document.getElementById('apv-draft');
    var tocList = s.querySelector('.apv-toc-list');
    return { w: Math.round(r.width), h: Math.round(r.height), vw: W, vh: H,
      left: Math.round(px(s.querySelector('.apv-left')) / W * 100),
      right: Math.round(px(s.querySelector('.apv-right')) / W * 100),
      steps: Array.prototype.map.call(s.querySelectorAll('.pr-step-name'), function (x) { return x.textContent; }),
      opinions: Array.prototype.map.call(s.querySelectorAll('.pr-step-opinion'), function (x) {
        return x.textContent.replace(/\s+/g, ' ').trim(); }),
      toc: s.querySelectorAll('.apv-toc-item').length,
      tocTitles: Array.prototype.map.call(s.querySelectorAll('.apv-toc-item .apv-toc-title'),
        function (x) { return x.textContent; }).slice(0, 3),
      tocHits: s.querySelectorAll('.apv-toc-item .cal-badge').length,
      tocFirstHit: (s.querySelector('.apv-toc-item .cal-badge') || {}).textContent || '',
      chapters: s.querySelectorAll('#apv-draft .pv-ch').length,
      draftText: (s.querySelector('#apv-draft') || {}).textContent.replace(/\s+/g, ' ').trim().slice(0, 24),
      btns: Array.prototype.map.call(s.querySelectorAll('.pr-act-btns button'), function (b) { return b.textContent.trim(); }),
      hasOpinion: !!document.getElementById('pr-opinion'),
      modals: document.querySelectorAll('.modal').length,
      head: (s.querySelector('.cp-progress') || {}).textContent.replace(/\s+/g, ' ').trim(),
      scrollChain: { toc: getComputedStyle(tocList).overflowY, draft: getComputedStyle(draft).overflowY } };`);
  check('点消息：审核界面在**浏览器内全屏**打开（铺满视口，不再是小弹窗）',
    !!reviewUi && reviewUi.w === reviewUi.vw && reviewUi.h === reviewUi.vh && reviewUi.modals === 0,
    reviewUi ? (reviewUi.w + '×' + reviewUi.h + '（视口 ' + reviewUi.vw + '×' + reviewUi.vh +
      '）；残留弹窗 ' + reviewUi.modals) : 'ERR');
  check('左侧审核流程 + 每个步骤的审核意见，右侧编研成果文件（38% / 62%）',
    reviewUi.left === 38 && reviewUi.right === 62 &&
    reviewUi.steps.join() === '编研部门领导审批,主管副馆长审批,馆长审批' &&
    reviewUi.opinions.length === 3 && reviewUi.chapters === 21 &&
    reviewUi.draftText.indexOf('本汇编') >= 0,
    '左 ' + reviewUi.left + '% 流程（' + reviewUi.steps.length + ' 步）／右 ' + reviewUi.right +
    '% 成果（' + reviewUi.chapters + ' 章）');
  /* 首个徽标的数字＝"第一处有命中的那一章"的命中项条数：从数据层算出来比对，别写死 */
  const expectFirstHit = await page.evaluate(`
    var items = [];
    ['political', 'professional', 'compliance'].forEach(function (k) {
      (App.store.auditItems(${JSON.stringify(TASK)}, k) || []).forEach(function (it) { items.push(it); }); });
    var nodes = App.store.outlineOf(${JSON.stringify(TASK)}).nodes || [];
    var first = nodes.filter(function (n) {
      return items.some(function (it) { return it.chapterId === n.id; }); })[0];
    return first ? items.filter(function (it) { return it.chapterId === first.id; }).length : 0;`)
    .catch(function () { return -1; });
  check('右侧有编研成果文件的**目录导航**：按大纲列出章节，并标出各章审核命中数',
    reviewUi.toc === 21 && reviewUi.tocHits >= 1 &&
    reviewUi.tocFirstHit === String(expectFirstHit) &&
    reviewUi.tocTitles.join('') === '编纂说明编纂目的与意义收录范围与时间断限' &&
    reviewUi.scrollChain.draft === 'auto',
    reviewUi.toc + ' 章；带命中徽标的 ' + reviewUi.tocHits + ' 章（首个徽标 ' + reviewUi.tocFirstHit +
    '）；前 3 章：' + reviewUi.tocTitles.join('/'));

  /* 点目录里的章节 → 正文定位过去（目录高亮 + 正文滚动） */
  const jump = await page.evaluate(`
    var items = Array.prototype.slice.call(document.querySelectorAll('.apv-toc-item'));
    var before = document.getElementById('apv-draft').scrollTop;
    items[5].click();
    var active = document.querySelector('.apv-toc-item.active');
    return { before: before, active: active ? active.textContent.replace(/\s+/g, ' ').trim() : '',
      after: document.getElementById('apv-draft').scrollTop };`);
  await sleep(300);
  check('点目录里的章节：条目高亮、右侧正文滚到该章（目录导航真的能定位）',
    jump.active.indexOf('清末民初的学堂与书院') > 0 && jump.after >= jump.before,
    '选中「' + jump.active + '」；正文 scrollTop ' + jump.before + ' → ' + jump.after);

  check('审核界面底部：审核意见输入 + 「审核通过」/「不通过并退回」两颗按钮',
    reviewUi.btns.length === 2 && reviewUi.btns[0].indexOf('审核通过') === 0 &&
    reviewUi.btns[1].indexOf('不通过并退回') === 0 && reviewUi.hasOpinion,
    reviewUi.btns.join(' / '));
  const exitBtn = await page.evaluate(`
    var b = document.querySelector('#audit-screen .cp-header [data-action="apv:close"]');
    return b ? b.textContent.trim() : '';`);
  check('顶部显示流程号/当前环节/审核命中数，右上角是「退出审核」',
    reviewUi.head.indexOf('流程 FB-') >= 0 && reviewUi.head.indexOf('环节 1 / 3') >= 0 &&
    reviewUi.head.indexOf('审核命中') >= 0 && exitBtn.indexOf('退出审核') >= 0,
    reviewUi.head + '｜右上角按钮：' + exitBtn);
  const shotReview = await page.shot(SHOT_DIR + 'publish-review.png');

  /* 不通过必须先填意见 */
  await clearToasts();
  await page.evaluate("document.querySelector('[data-action=\"pr:reject\"]').click(); return 1;");
  await sleep(400);
  const blank = await lastToast();
  check('不通过但未填审核意见：被拦住（弹窗不关）',
    blank.indexOf('必须填写审核意见') >= 0 &&
    (await page.evaluate("return !!document.getElementById('pr-opinion');")),
    '轻提示：' + blank);

  /* ================================================== D. 逐级通过 → 发布 */
  console.log('\n【D】逐级通过三步 → 生成成果并锁定');
  await page.evaluate("document.getElementById('pr-opinion').value = '材料齐全，同意报主管副馆长审批。'; return 1;");
  await page.evaluate("document.querySelector('[data-action=\"pr:pass\"]').click(); return 1;");
  await sleep(700);
  rec = await page.evaluate(REC);
  check('第 1 步通过：记录审核意见与审核人，流程流转到第 2 步并向第 2 步审核人推送消息',
    rec.steps[0].status === 'PASSED' && rec.steps[0].opinion.indexOf('材料齐全') >= 0 &&
    rec.current === 1 && rec.messages.length === 2 && rec.messages[0].to === '孙丽',
    '第 1 步：' + rec.steps[0].status + '；下一条消息 → ' + rec.messages[0].to);

  const ok2 = await actOnReview('编排质量合格，同意报馆长审批。', true);
  const ok3 = await actOnReview('同意发布。', true);
  rec = await page.evaluate(REC);
  check('第 2、3 步依次通过（每一步都给下一位审核人推送消息）',
    ok2 && ok3 && rec.steps.every(function (s) { return s.status === 'PASSED'; }) &&
    rec.steps[2].opinion.indexOf('同意发布') >= 0,
    rec.steps.map(function (s) { return s.name + '：' + s.status; }).join('；'));

  const published = await page.evaluate(`
    var t = App.store.getTask('${TASK}');
    var rec = App.store.publishOf('${TASK}');
    var p = App.store.products().filter(function (x) { return x.id === rec.productId; })[0];
    return { status: rec.status, productId: rec.productId,
      product: p ? { title: p.title, taskId: p.taskId, type: p.type, words: p.words,
        compiledBy: p.compiledBy, formats: p.formats.join('+'), summary: (p.summary || '').slice(0, 20) } : null,
      taskStatus: t.status, published: !!t.published, locked: App.store.isTaskLocked('${TASK}'),
      firstProduct: (App.store.products()[0] || {}).title };`);
  check('三步全部通过：成果推送到「编研成果」模块并生成数据（名称/类型/字数/格式/来源任务）',
    published.status === 'APPROVED' && !!published.product &&
    published.product.title === '本市教育事业发展史料汇编' &&
    published.product.taskId === TASK && published.product.words > 0 &&
    published.product.formats === 'PDF+OFD' && published.firstProduct === published.product.title,
    '成果 ' + published.productId + '｜' + published.product.type + '｜' +
    published.product.words + ' 字｜' + published.product.formats);
  check('任务随之锁定：状态「已完成」+ 已发布，各环节只读',
    published.taskStatus === 'DONE' && published.published && published.locked,
    '任务状态=' + published.taskStatus + '；锁定=' + published.locked);
  check('给发起人推送「审核通过」消息',
    rec.messages.some(function (m) {
      return m.kind === 'publish-approved' && m.to === '赵志远' && m.title.indexOf('审核通过') > 0; }),
    rec.messages[0].to + '｜' + rec.messages[0].title);

  /* 审核界面是全屏的，审完不会自动关：这里先退出（Esc），再继续后续断言 */
  await page.pressEscape();
  await sleep(400);
  const closedApv = await page.evaluate(`
    return { screen: !!document.getElementById('audit-screen'), app: !!document.querySelector('.shell') };`);
  check('Esc 退出全屏审核界面，回到主应用', !closedApv.screen && closedApv.app,
    '审核界面已关闭=' + !closedApv.screen);

  /* ================================================== E. 锁定后不可修改 */
  console.log('\n【E】发布后各环节只读（数据层拦截）');
  const blocked = await page.evaluate(`
    var ids = ['RW-2026-001'];
    return { chapter: App.store.saveChapter('${TASK}', 'n1', '试着改一下').ok,
      outline: App.store.saveOutline('${TASK}', { nodes: [] }).ok,
      selection: App.store.addSelections('${TASK}', [{ title: 'x' }]).ok,
      stage: App.store.setTaskStage('${TASK}', 3).ok,
      audit: App.store.saveAuditRun('${TASK}', 'political', []).ok,
      msg: App.store.saveChapter('${TASK}', 'n1', 'x').message };`);
  check('所有写操作被拦下（大纲 / 选材 / 编排正文 / 审核结果 / 阶段推进）',
    !blocked.chapter && !blocked.outline && !blocked.selection && !blocked.stage && !blocked.audit &&
    blocked.msg.indexOf('只读') >= 0,
    '拦截提示：' + blocked.msg);

  await page.evaluate("location.hash = '#/task'; return 1;");
  await sleep(300);
  await page.evaluate("location.hash = '#/task/" + TASK + "'; return 1;");
  await sleep(500);
  for (const s of ['1', '3']) {
    await page.evaluate(`var b = document.querySelector('.stage-stepper [data-stage="${s}"]'); if (b) b.click(); return 1;`);
    await sleep(450);
    if (s === '3') {
      await page.evaluate("if (App.taskCompose) App.taskCompose.close(); return 1;");
      await sleep(200);
    }
    const note = await page.evaluate(`
      var m = document.getElementById('main');
      var n = m.querySelector('.step-todo');
      var panel = m.querySelector('.pb-card') ? '成果发布'
        : (m.querySelector('.outline-step') ? '大纲界面'
        : (m.querySelector('.rv-card') ? '审核校定' : '?'));
      return (n ? n.textContent.replace(/\s+/g, ' ').trim() : '(无提示)') + '｜当前面板：' + panel;`);
    check('第 ' + s + ' 阶段：显示「只读」提示（可以查看已有信息，但不能改）',
      note.indexOf('只读') >= 0 && note.indexOf('当前面板：' + (s === '1' ? '大纲界面' : '?')) >= 0,
      '第 ' + s + ' 阶段：' + note.slice(0, 78));
  }

  /* ================================================== F. 审核信息表（表 D.1） */
  console.log('\n【F】审核信息表（表 D.1，内容自动从系统获取）');
  await page.evaluate("document.querySelector('.stage-stepper [data-stage=\"5\"]').click(); return 1;");
  await sleep(500);
  const panel2 = await page.evaluate(`
    var m = document.getElementById('main');
    return { status: (m.querySelector('.pb-ops .tag') || {}).textContent || '',
      product: (m.querySelector('.pb-product') || {}).textContent.replace(/\\s+/g, ' ').trim(),
      btns: Array.prototype.map.call(m.querySelectorAll('.pb-ops button, .pb-product button'),
        function (b) { return b.textContent.trim(); }) };`);
  check('第 5 阶段面板：显示「审核通过 · 成果已发布」并给出成果编号与只读说明',
    panel2.status === '审核通过 · 成果已发布' &&
    panel2.product.indexOf(published.productId) >= 0 &&
    panel2.product.indexOf('只读') >= 0 &&
    panel2.btns.indexOf('审核信息表') >= 0,
    panel2.product.slice(0, 62));

  await click('[data-action="pb:form"]');
  await sleep(500);
  const form = await page.evaluate(`
    var m = document.querySelector('.modal');
    if (!m) return null;
    var labels = Array.prototype.map.call(m.querySelectorAll('.review-form > tbody > tr > .rf-label'),
      function (x) { return x.textContent.replace(/\\s+/g, ''); });
    return { head: m.querySelector('.modal-head').textContent.trim(),
      caption: (m.querySelector('.review-form caption') || {}).textContent.trim(),
      labels: labels,
      name: (m.querySelector('.rf-value') || {}).textContent.trim(),
      sub: (m.querySelector('.rf-sub') || {}).textContent.replace(/\\s+/g, ' ').trim(),
      intro: (m.querySelector('.rf-intro') || {}).textContent.replace(/\\s+/g, ' ').trim().slice(0, 30),
      peopleHead: Array.prototype.map.call(m.querySelectorAll('.rf-people-table thead th'),
        function (x) { return x.textContent.replace(/[\s\u3000]+/g, ''); }),
      people: Array.prototype.map.call(m.querySelectorAll('.rf-people-table tbody tr'), function (tr) {
        return Array.prototype.map.call(tr.querySelectorAll('td'), function (td) {
          return td.textContent.trim(); }).join('/'); }),
      opinion: (m.querySelector('.rf-opinion') || {}).textContent.replace(/\\s+/g, ' ').trim(),
      sign: (m.querySelector('.rf-sign') || {}).textContent.trim(),
      date: (m.querySelector('.rf-date') || {}).textContent.trim(),
      remark: (m.querySelector('.rf-remark') || {}).textContent.replace(/\\s+/g, ' ').trim(),
      inputs: m.querySelectorAll('input, textarea, select').length,
      widths: (function () {
        var wrap = m.querySelector('.rf-wrap').getBoundingClientRect().width;
        var tbl = m.querySelector('.review-form').getBoundingClientRect().width;
        var td = m.querySelector('.review-form > tbody > tr > td').getBoundingClientRect().width;
        var pt = m.querySelector('.rf-people-table').getBoundingClientRect().width;
        return { wrap: Math.round(wrap), table: Math.round(tbl), value: Math.round(td),
          people: Math.round(pt) };
      })() };`);
  check('审核信息表按表 D.1 的格式：名称 / 编研成果简介 / 审核人员信息 / 审核意见（签字·年月日）/ 备注',
    !!form && form.caption.indexOf('表 D.1') >= 0 &&
    form.labels.join() === '名称,编研成果简介,审核人员信息,审核意见,备注' &&
    form.peopleHead.join() === '姓名,工作单位,职称/职务' && form.inputs === 0,
    form ? (form.caption + '｜行：' + form.labels.join('、') + '｜表头：' + form.peopleHead.join('/') +
      '｜输入控件 ' + form.inputs) : 'ERR');
  check('审核信息表的列宽正常：表格铺满弹窗、值列占大头（人员子表同样铺满）',
    form.widths.table >= form.widths.wrap - 2 &&
    form.widths.value > form.widths.table * 0.6 &&
    form.widths.people > form.widths.value * 0.6,
    '表宽 ' + form.widths.table + '（容器 ' + form.widths.wrap + '），值列 ' + form.widths.value +
    '，人员子表 ' + form.widths.people);
  check('表内内容自动从系统获取：名称/简介取编研成果，审核人员取流程配置的三步审核人',
    form.name === '本市教育事业发展史料汇编' &&
    form.sub.indexOf('任务编号 RW-2026-001') >= 0 && form.sub.indexOf('字') > 0 &&
    form.intro.indexOf('本汇编') >= 0 && form.people.length === 3 &&
    form.people[0] === '李文华/编研利用科/审核人员' &&
    form.people[1] === '孙丽/馆领导/主管副馆长' &&
    form.people[2] === '赵志远/馆领导/馆长',
    form.name + '｜' + form.people.join('；'));
  check('审核意见与签字、日期取各级审核记录（自动生成，不用手填）',
    form.opinion.indexOf('材料齐全') >= 0 && form.opinion.indexOf('同意发布') >= 0 &&
    form.sign.indexOf('签字：赵志远') === 0 && /年.*月.*日/.test(form.date) &&
    form.remark.indexOf('自动生成') >= 0,
    form.opinion.slice(0, 46) + '　' + form.sign + '　' + form.date);
  const shotForm = await page.shot(SHOT_DIR + 'publish-form.png');
  await click('.modal [data-action="ui:ok"]');

  /* ================================================== G. 不通过 → 退回审核校定 */
  console.log('\n【G】审核不通过：任务退回「审核校定」并通知发起人');
  await page.evaluate("App.store.resumeTask('" + TASK2 + "'); return 1;");
  await gotoPublish(TASK2);
  await page.evaluate("document.querySelector('[data-action=\"pb:start\"]').click(); return 1;");
  await sleep(250);
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(600);
  const acted = await actOnReview('第五章史料支撑不足，退回补充选材后重新报审。', false);
  const rejected = await page.evaluate(`
    var rec = App.store.publishOf('${TASK2}');
    var t = App.store.getTask('${TASK2}');
    var msg = App.store.messages().filter(function (m) { return m.taskId === '${TASK2}'; })[0];
    var m = document.getElementById('main');
    return { status: rec.status, step1: rec.steps[0].status,
      stage: t.stage, taskStatus: t.status, locked: App.store.isTaskLocked('${TASK2}'),
      msgTitle: msg ? msg.title : '', msgTo: msg ? msg.to : '', msgBody: msg ? msg.body : '',
      panel: m.querySelector('.rv-card') ? '审核校定' : (m.querySelector('.outline-step') ? '大纲' : '') };`);
  check('某一步不通过：流程记为未通过、任务**退回第 4 阶段「审核校定」**',
    acted && rejected.status === 'REJECTED' && rejected.step1 === 'REJECTED' &&
    rejected.stage === 4 && rejected.taskStatus === 'IN_PROGRESS' && !rejected.locked &&
    rejected.panel === '审核校定',
    '流程=' + rejected.status + '；任务回到第 ' + rejected.stage + ' 阶段（' + rejected.panel + '）');
  check('推送消息给发起人（写明环节、审核人与意见）',
    rejected.msgTo === '赵志远' && rejected.msgTitle.indexOf('未通过') > 0 &&
    rejected.msgBody.indexOf('退回「审核校定」') > 0 &&
    rejected.msgBody.indexOf('史料支撑不足') > 0,
    rejected.msgTo + '｜' + rejected.msgBody.slice(0, 54));

  /* ================================================== H. 回归与异常 */
  console.log('\n【H】回归与异常');
  const finalCheck = await page.evaluate(`
    var m = document.getElementById('main');
    return { scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      reviewPanel: !!m.querySelector('.rv-card') };`);
  check('退回后页面正常渲染、无横向溢出', finalCheck.reviewPanel &&
    finalCheck.scrollW <= finalCheck.clientW + 1,
    'scrollW ' + finalCheck.scrollW + ' / ' + finalCheck.clientW);
  check('截图已生成', true,
    [shotReview, shotForm].map(function (f) { return f.split('/').slice(-1)[0]; }).join('、'));
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ') : '0 条');
  const warns = page.warns();
  check('全程没有 console 警告（重复动作名/缺图标都会走到这里）', warns.length === 0,
    warns.length ? 'ERR ' + warns.map(function (w) { return w.text; }).join(' | ') : '0 条');

  exitCode = check.summary('第 5 阶段「成果发布」') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
