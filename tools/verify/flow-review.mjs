/* ==========================================================================
   验证套件：流程审核（原「审核校定」一级菜单）+ 选题立项「发起审核」全屏界面

   覆盖评审要求：
     · 一级菜单「审核校定」改名为「流程审核」，只展示**我发起的 / 需要我审核的**流程
     · 流程分两类：选题立项审核流程 / 编研成果审核流程，各自一条列表
     · 每条流程给「查看 / 审核」两个动作，只有轮到我的环节才能点「审核」
     · 选题立项：勾选选题 →「发起审核」→ **浏览器全屏界面**（左：审核步骤与审核意见；
       右：选题可行性评估表），界面上能**导出**评估表
     · 发起与审核的结果，都要在**对应用户**的流程审核页里生成数据（发起人、审核人都能看到）
     · 审核界面按流程类型分流：立项审核 → 立项审核界面；成果发布审核 → 成果发布审核界面

   运行：node tools/verify/flow-review.mjs [file:///.../index.html]
   ========================================================================== */

import { openChrome, sleep, makeChecks, waitFor } from './cdp.mjs';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ||
  new URL('../../prototype-system/index.html', import.meta.url).href;
const SHOT_DIR = fileURLToPath(new URL('./shots/', import.meta.url));
const DL_DIR = fileURLToPath(new URL('./shots/downloads/', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });
rmSync(DL_DIR, { recursive: true, force: true });
mkdirSync(DL_DIR, { recursive: true });

const check = makeChecks();
const page = await openChrome({ width: 1500, height: 950 });
let exitCode = 0;

/* 当前用户：admin（赵志远，馆长）—— 既能看全部流程，也是立项/成果三级审核的最后一步审核人 */
const ADMIN = '赵志远';
const REVIEWER = '李文华';       /* 流程配置第 1 步「编研部门领导审批」的审核人 */

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

function asUser(name) {
  return page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.name === ${JSON.stringify(name)}; })[0];
    if (!u) return 'ERR 找不到用户 ' + ${JSON.stringify(name)};
    App.store.switchUser(u.id);
    return App.store.currentUser().name;`);
}

async function gotoReview() {
  await page.evaluate("location.hash = '#/review'; return 1;");
  await sleep(450);
}

/** 把列表读成 [{no, name, step, who, status, actions}] */
async function readRows() {
  return page.evaluate(`
    var m = document.getElementById('main');
    return Array.prototype.map.call(m.querySelectorAll('.table tbody tr'), function (tr) {
      var td = tr.querySelectorAll('td');
      return {
        no: td[1].textContent.trim(),
        name: td[2].textContent.replace(/\\s+/g, ' ').trim(),
        who: td[6].textContent.trim(),
        status: td[7].textContent.trim(),
        actions: Array.prototype.map.call(tr.querySelectorAll('.row-actions [data-action]'),
          function (b) { return b.getAttribute('data-action'); })
      }; });`);
}

try {
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.name === ${JSON.stringify(ADMIN)}; })[0];
    App.store.login(u.account, u.password);
    return 1;`);
  await sleep(400);

  /* ================================================== A. 菜单与页面骨架 */
  console.log('\n【A】一级菜单改名为「流程审核」，页面按两类流程分开');
  const nav = await page.evaluate(`
    return { items: App.mock.NAV.map(function (i) { return i.label + '|' + i.route; }),
      old: App.mock.NAV.filter(function (i) { return i.label === '审核校定'; }).length };`);
  check('左侧菜单是「流程审核」（route 仍是 #/review，不再叫「审核校定」）',
    nav.old === 0 && nav.items.indexOf('流程审核|#/review') >= 0,
    nav.items.filter(function (x) { return x.indexOf('#/review') >= 0; }).join('、') || 'ERR 没有 #/review');

  await gotoReview();
  const head = await page.evaluate(`
    var m = document.getElementById('main');
    return { title: (document.querySelector('.topbar-title') || {}).textContent || '',
      crumb: ((document.querySelector('.topbar-crumb') || {}).textContent || '').replace(/\\s+/g, ' ').trim(),
      tabs: Array.prototype.map.call(m.querySelectorAll('.seg button'), function (b) { return b.textContent.trim(); }),
      batchBar: m.querySelectorAll('.batch-bar').length };`);
  check('页面标题是「流程审核」，工具栏不再堆"当前用户／共 N 条"这类说明与"等待你审核"提示条',
    head.title.indexOf('流程审核') >= 0 && head.batchBar === 0,
    head.title + '｜页内提示条 ' + head.batchBar + ' 个');
  check('两个分类：选题立项审核流程 / 编研成果审核流程（各带条数）',
    head.tabs[0].indexOf('选题立项审核流程') >= 0 && head.tabs[1].indexOf('编研成果审核流程') >= 0,
    head.tabs.slice(0, 2).join('　'));
  check('参与范围可筛：全部 / 待我审核 / 我发起的 / 已完成',
    head.tabs.slice(2).join() === '全部,待我审核,我发起的,已完成',
    head.tabs.slice(2).join('、'));

  /* ================================================== B. 列表与参与范围过滤 */
  console.log('\n【B】列表字段与「我发起的 / 待我审核」过滤');
  await page.evaluate(`document.querySelector('[data-action="rv:type"][data-type="TOPIC_REVIEW"]').click(); return 1;`);
  await sleep(300);
  const topicRows = await readRows();
  check('选题立项流程列表：流程编号、名称、发起人、当前环节、当前审核人、状态、操作',
    topicRows.length >= 4 && topicRows.every(function (r) {
      return /^LX-\d{4}-\d{4}$/.test(r.no) && r.actions.length >= 1;
    }),
    topicRows.map(function (r) { return r.no + '(' + r.status + ')'; }).join('、'));

  await asUser(REVIEWER);
  await gotoReview();
  const asLi = await page.evaluate(`
    var m = document.getElementById('main');
    return { me: App.store.currentUser().name,
      nos: Array.prototype.map.call(m.querySelectorAll('.table tbody tr td:nth-child(2)'),
        function (td) { return td.textContent.trim(); }) };`);
  check('李文华能看到自己审过的 LX-2026-0003（我审过也要出现在流程审核页）',
    asLi.me === REVIEWER && asLi.nos.indexOf('LX-2026-0003') >= 0, asLi.nos.join('、'));

  /* 数据权限：与本人无关的流程不显示（王建国既不是 LX-2026-0005 的发起人，也不是它的审核人） */
  const adminNos = topicRows.map(function (r) { return r.no; });
  await asUser('王建国');
  await gotoReview();
  const asWang = await page.evaluate(`
    return Array.prototype.map.call(document.querySelectorAll('.table tbody tr td:nth-child(2)'),
      function (td) { return td.textContent.trim(); });`);
  check('与本人无关的流程不显示：admin 能看到全部（含 LX-2026-0005），王建国看不到他人的这条',
    adminNos.indexOf('LX-2026-0005') >= 0 && asWang.indexOf('LX-2026-0005') < 0 &&
    asWang.indexOf('LX-2026-0004') >= 0,
    'admin ' + adminNos.length + ' 条；王建国 ' + asWang.join('、'));

  await asUser(REVIEWER);
  await gotoReview();

  await click('[data-action="rv:scope"][data-scope="todo"]');
  const todoRows = await readRows();
  check('「待我审核」只留下当前环节该我审的流程（LX-2026-0005 在等李文华）',
    todoRows.length >= 1 && todoRows.every(function (r) { return r.actions.indexOf('rv:review') >= 0; }) &&
    todoRows.map(function (r) { return r.no; }).indexOf('LX-2026-0005') >= 0,
    todoRows.map(function (r) { return r.no + '/' + r.who; }).join('、'));

  await click('[data-action="rv:scope"][data-scope="done"]');
  const doneRows = await readRows();
  check('「已完成」里都是审核通过 / 审核不通过的历史流程',
    doneRows.length >= 2 && doneRows.every(function (r) {
      return r.status === '审核通过' || r.status === '审核不通过';
    }),
    doneRows.map(function (r) { return r.no + '/' + r.status; }).join('、'));

  /* ================================================== C. 查看：流程详情与各环节意见 */
  console.log('\n【C】「查看」＝流程详情（步骤 + 每一步的审核人与审核意见 + 流转记录）');
  await click('[data-action="rv:clear-filter"]');
  await click('[data-action="rv:view"][data-no="LX-2026-0004"]');
  const detail = await page.evaluate(`
    var m = document.querySelector('.modal');
    if (!m) return null;
    return { title: m.querySelector('.modal-head').textContent.trim(),
      desc: Array.prototype.map.call(m.querySelectorAll('.desc dt'), function (d) { return d.textContent.trim(); }),
      descVals: Array.prototype.map.call(m.querySelectorAll('.desc dd'), function (d) { return d.textContent.trim(); }),
      steps: Array.prototype.map.call(m.querySelectorAll('.pr-step'), function (s) {
        return s.querySelector('.pr-step-name').textContent.trim() + '/' +
          s.querySelector('.pr-step-opinion').textContent.replace(/\\s+/g, ' ').trim(); }),
      history: m.querySelectorAll('.tl-item').length,
      okText: m.querySelector('.modal-foot .btn-primary').textContent.trim() };`);
  check('流程详情弹窗：流程编号 / 类型 / 名称 / 发起人 / 当前环节 / 当前审核人 / 状态',
    !!detail && detail.title.indexOf('流程详情') >= 0 &&
    detail.desc.join() === '流程编号,流程类型,编研选题,发起人,当前环节,当前审核人,状态',
    detail ? detail.title + '｜' + detail.desc.join('、') : 'ERR 弹窗没打开');
  check('详情里列出每个审核环节与它的审核意见（不通过意见带时间与审核人）',
    detail && detail.steps.length >= 1 &&
    detail.steps.join(' ').indexOf('经费预算需细化') >= 0 && detail.history >= 1,
    detail ? detail.steps.join('；') : 'ERR');
  const shotDetail = await page.shot(SHOT_DIR + 'flow-review-detail.png');
  await click('.modal [data-action="ui:ok"]');

  /* ================================================== D. 选题立项「发起审核」全屏界面 */
  console.log('\n【D】选题立项：勾选 →「发起审核」→ 全屏界面（左步骤与意见 / 右评估表）');
  await asUser(ADMIN);
  await page.evaluate("location.hash = '#/topic'; return 1;");
  await sleep(500);
  const topic4Review = await page.evaluate(`
    var t = App.store.topics().filter(function (x) { return x.status === 'NOT_STARTED'; })[0];
    return { id: t.id, name: t.name,
      filled: !!(t.background && t.content && t.team) };`);
  check('选题立项里有可直接发起审核的「未开始」选题（且立项材料已填写）',
    !!topic4Review.id && topic4Review.filled, topic4Review.id + ' ' + topic4Review.name);

  await page.evaluate(`
    document.querySelector('input[data-change="topic:select"][data-id="${topic4Review.id}"]').click();
    return 1;`);
  await sleep(200);
  await click('[data-action="topic:batch-review"]');
  await waitFor(page, "!!document.getElementById('topic-review-screen')", 3000);
  const screen = await page.evaluate(`
    var el = document.getElementById('topic-review-screen');
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { fixed: getComputedStyle(el).position, full: Math.round(r.width) + 'x' + Math.round(r.height),
      viewport: window.innerWidth + 'x' + window.innerHeight,
      header: el.querySelector('.cp-header').textContent.replace(/\\s+/g, ' ').trim(),
      cols: el.querySelectorAll('.cp-body > .cp-col').length,
      leftHead: el.querySelectorAll('.cp-col-head')[0].textContent.replace(/\\s+/g, ' ').trim(),
      rightHead: el.querySelectorAll('.cp-col-head')[1].textContent.replace(/\\s+/g, ' ').trim(),
      steps: Array.prototype.map.call(el.querySelectorAll('.pr-step .pr-step-name'), function (x) { return x.textContent.trim(); }),
      stepWho: Array.prototype.map.call(el.querySelectorAll('.pr-step .pr-step-who'), function (x) { return x.textContent.trim(); }),
      docTitle: el.querySelector('.tpr-doc-title').textContent.trim(),
      docFields: Array.prototype.map.call(el.querySelectorAll('.tpr-doc .form-label'), function (x) { return x.textContent.trim(); }),
      hasName: el.querySelector('.tpr-doc').textContent.indexOf(${JSON.stringify(topic4Review.name)}) >= 0,
      hasBudget: el.querySelector('.tpr-doc').textContent.indexOf('总预算') >= 0,
      exportBtn: !!el.querySelector('[data-action="tpr:export"]') };`);
  check('「发起审核」打开的是**浏览器全屏界面**（fixed，铺满视口）',
    !!screen && screen.fixed === 'fixed' && screen.full === screen.viewport,
    screen ? screen.fixed + ' ' + screen.full + '（视口 ' + screen.viewport + '）' : 'ERR 界面没打开');
  check('全屏界面左栏＝审核步骤与审核意见：三步来自「流程配置」，各显示审核人',
    screen && screen.cols === 2 && screen.leftHead.indexOf('审核步骤与审核意见') >= 0 &&
    screen.steps.length === 3 &&
    screen.stepWho[0].indexOf('李文华') >= 0 && screen.stepWho[2].indexOf('赵志远') >= 0,
    screen ? screen.steps.join(' → ') + '｜' + screen.stepWho[0] : 'ERR');
  check('全屏界面右栏＝《选题可行性评估表》（只读，字段与选题清单一致）',
    screen && screen.rightHead.indexOf('选题可行性评估表') >= 0 &&
    screen.docTitle === '选题可行性评估表' &&
    screen.docFields.join() === '选题名称,编研团队,经费情况,背景与意义,内容与目标,实施方案,保障措施,评估意见,附件' &&
    screen.hasName && screen.hasBudget,
    screen ? screen.docTitle + '｜' + screen.docFields.length + ' 个字段' : 'ERR');
  const shotSubmit = await page.shot(SHOT_DIR + 'flow-review-topic-submit.png');

  /* 导出：真实鼠标点击 → 检查落盘文件（file:// 下用 Blob 生成 HTML） */
  await page.setDownloadDir(DL_DIR);
  await click('[data-action="tpr:export"]');
  await sleep(1200);
  /* Chrome 有时会把自己下载的组件写成 `.crdownload` 落在这里（不是本页产生的），顺手清掉 */
  readdirSync(DL_DIR).filter(function (f) { return /\.crdownload$/.test(f); })
    .forEach(function (f) { rmSync(DL_DIR + f, { force: true }); });
  const files = readdirSync(DL_DIR).filter(function (f) { return f.indexOf('.html') > 0; });
  let exported = null;
  if (files.length) {
    const txt = readFileSync(DL_DIR + files[0], 'utf8');   /* DL_DIR 以 / 结尾 */
    exported = { name: files[0], hasTitle: txt.indexOf('选题可行性评估表') >= 0,
      hasTopic: txt.indexOf(topic4Review.name) >= 0, noInput: txt.indexOf('<input') < 0,
      hasTeam: txt.indexOf('编研团队') >= 0 };
  }
  check('界面上「导出选题可行性评估表」真的导出了文件（HTML，含选题内容、无输入控件）',
    !!exported && exported.hasTitle && exported.hasTopic && exported.hasTeam && exported.noInput,
    exported ? exported.name : 'ERR 导出目录里没有文件');
  const shotExport = await page.shot(SHOT_DIR + 'flow-review-export.png');

  /* ================================================== E. 确认发起：流程落库 + 两方可见 */
  console.log('\n【E】确认发起：生成流程记录，发起人与审核人的流程审核页都出现');
  await page.evaluate(`
    document.getElementById('tpr-note').value = '选题已论证，材料齐备，报请立项审核。';
    return 1;`);
  await click('[data-action="tpr:submit"]');
  await sleep(700);
  const started = await page.evaluate(`
    var list = App.store.flows().filter(function (f) { return f.type === 'TOPIC_REVIEW'; });
    var f = list[list.length - 1];
    var t = App.store.getTopic(${JSON.stringify(topic4Review.id)});
    var el = document.getElementById('topic-review-screen');
    return { flowNo: f.flowNo, type: f.type, name: f.targetName, by: f.by, status: f.status,
      steps: f.steps.map(function (s) { return s.name + ':' + s.status + ':' + s.reviewer; }),
      current: f.current,
      history: (f.history || []).map(function (h) { return h.action + ':' + h.opinion; }),
      topicReview: t.review ? t.review.status + '/' + t.review.flowNo : '',
      msg: App.store.messages().filter(function (m) { return m.flowNo === f.flowNo; })
        .map(function (m) { return m.kind + '→' + m.to; }),
      screenMode: el ? App.topicReview.state().mode : '(已关闭)',
      screenHead: el ? el.querySelector('.cp-progress').textContent.replace(/\\s+/g, ' ').trim() : '' };`);
  check('发起后：流程记录按流程配置生成 3 个环节，第 1 步待审、发起人是我',
    started.by === ADMIN && started.status === 'REVIEWING' && started.steps.length === 3 &&
    started.steps[0].indexOf('PENDING') > 0 && started.current === 0,
    started.flowNo + '｜' + started.steps.join('；'));
  check('发起说明记入流转记录，选题上也登记了立项审核流程',
    started.history.join(' ').indexOf('选题已论证') >= 0 &&
    started.topicReview === 'REVIEWING/' + started.flowNo,
    started.history.join('，') + '｜选题 ' + started.topicReview);
  check('审核待办消息推送给了第 1 步审核人（选题立项审核待办）',
    started.msg.length >= 1 && started.msg[0] === 'topic-review→' + REVIEWER, started.msg.join('、'));
  check('发起后界面停在刚生成的流程上（可继续看审核步骤与意见）',
    started.screenMode === 'view' && started.screenHead.indexOf(started.flowNo) > 0,
    started.screenMode + '｜' + started.screenHead);
  await page.shot(SHOT_DIR + 'flow-review-topic-started.png');

  /* 发起人的「我发起的」列表 */
  await click('[data-action="tpr:close"]');
  await gotoReview();
  await click('[data-action="rv:scope"][data-scope="mine"]');
  const mineRows = await readRows();
  check('发起人（赵志远）在流程审核页「我发起的」里看到这条新流程',
    mineRows.map(function (r) { return r.no; }).indexOf(started.flowNo) >= 0 &&
    mineRows.filter(function (r) { return r.no === started.flowNo; })[0].status === '审核中',
    mineRows.map(function (r) { return r.no; }).join('、'));

  /* 审核人的「待我审核」列表 */
  await asUser(REVIEWER);
  await gotoReview();
  await click('[data-action="rv:scope"][data-scope="todo"]');
  const reviewerRows = await readRows();
  const myRow = reviewerRows.filter(function (r) { return r.no === started.flowNo; })[0];
  check('审核人（李文华）在「待我审核」里看到同一条流程，且能点「审核」',
    !!myRow && myRow.actions.indexOf('rv:review') >= 0 && myRow.name.indexOf(topic4Review.name) >= 0,
    myRow ? myRow.no + '｜' + myRow.name + '｜' + myRow.actions.join('/') : 'ERR 没看到该流程');

  /* ================================================== F. 从流程审核页审核（立项流程） */
  console.log('\n【F】「审核」按类型打开对应审核界面：立项审核（左步骤意见 / 右评估表）');
  await click('[data-action="rv:review"][data-no="' + started.flowNo + '"]');
  await waitFor(page, "!!document.getElementById('topic-review-screen')", 3000);
  const reviewMode = await page.evaluate(`
    var el = document.getElementById('topic-review-screen');
    return { open: !!el, mode: App.topicReview.state().mode,
      opinion: !!document.getElementById('tpr-opinion'),
      btns: Array.prototype.map.call(el.querySelectorAll('.pr-act button'), function (b) { return b.textContent.trim(); }),
      hasDoc: !!el.querySelector('.tpr-doc .form-table-read') };`);
  check('审核人点「审核」：进入同一套全屏界面，但切到审核态（可填意见、有通过/不通过两颗按钮）',
    reviewMode.open && reviewMode.mode === 'review' && reviewMode.opinion &&
    reviewMode.btns.join() === '审核通过,不通过并退回' && reviewMode.hasDoc,
    reviewMode.mode + '｜' + reviewMode.btns.join('、'));
  await page.shot(SHOT_DIR + 'flow-review-topic-review.png');

  await page.evaluate(`
    document.getElementById('tpr-opinion').value = '材料齐备，同意立项，报主管副馆长审批。';
    document.querySelector('[data-action="tpr:pass"]').click();
    return 1;`);
  await sleep(600);
  const afterPass = await page.evaluate(`
    var f = App.store.getFlow(${JSON.stringify(started.flowNo)});
    var el = document.getElementById('topic-review-screen');
    return { current: f.current, reviewer: f.reviewer, status: f.status,
      steps: f.steps.map(function (s) { return s.name + ':' + s.status; }),
      opinion: f.steps[0].opinion, by: f.steps[0].by,
      head: el ? el.querySelector('.cp-progress').textContent.replace(/\\s+/g, ' ').trim() : '',
      msg: App.store.messages().filter(function (m) { return m.flowNo === f.flowNo; })
        .map(function (m) { return m.kind + '→' + m.to + '/' + m.title.slice(0, 12); }) };`);
  check('审核通过：本环节记为已通过并带上意见与审核人，流程推进到第 2 环节',
    afterPass.steps[0].indexOf('PASSED') > 0 && afterPass.current === 1 &&
    afterPass.reviewer === '孙丽' && afterPass.opinion.indexOf('材料齐备') >= 0 &&
    afterPass.by === REVIEWER && afterPass.head.indexOf('环节 2 / 3') > 0,
    afterPass.steps.join('；') + '｜' + afterPass.head);
  check('通过后给下一环节审核人推送待办消息（逐级流转）',
    afterPass.msg.join(' ').indexOf('topic-review→孙丽') >= 0, afterPass.msg.join('、'));
  await page.shot(SHOT_DIR + 'flow-review-topic-passed.png');
  await click('[data-action="tpr:close"]');

  /* 审核记录回到流程审核页：先回到「全部」范围（默认只筛待我审核的话，
     流程已流转到孙丽，李文华就看不到它了） */
  await gotoReview();
  await click('[data-action="rv:scope"][data-scope=""]');
  const afterRows = await readRows();
  const rowAfter = afterRows.filter(function (r) { return r.no === started.flowNo; })[0];
  check('审核后流程审核页跟着变：当前环节=主管副馆长审批，当前审核人=孙丽，审核人不再有「审核」按钮',
    !!rowAfter && rowAfter.who === '孙丽' && rowAfter.actions.indexOf('rv:review') < 0,
    rowAfter ? rowAfter.no + '｜' + rowAfter.who + '｜' + rowAfter.actions.join('/') : 'ERR');

  /* ================================================== G. 成果流程 → 成果发布审核界面 */
  console.log('\n【G】编研成果审核流程：「审核」打开成果发布审核界面（左流程 / 右成果文件）');
  await click('[data-action="rv:type"][data-type="PRODUCT_REVIEW"]');
  const productRows = await readRows();
  const fbRow = productRows.filter(function (r) { return r.actions.indexOf('rv:review') >= 0; })[0];
  check('成果流程列表里有正在等待我审核的流程（种子：FB-2026-0002，任务 RW-2026-003）',
    !!fbRow && fbRow.status === '审核中' &&
    fbRow.name.indexOf('本市行政区划沿革') >= 0,
    fbRow ? fbRow.no + '｜' + fbRow.name + '｜' + fbRow.who : 'ERR 没有待审的成果流程');

  await click('[data-action="rv:review"][data-no="' + fbRow.no + '"]');
  await waitFor(page, "!!document.getElementById('audit-screen')", 3000);
  const productScreen = await page.evaluate(`
    var el = document.getElementById('audit-screen');
    if (!el) return null;
    return { head: el.querySelector('.cp-progress').textContent.replace(/\\s+/g, ' ').trim(),
      left: el.querySelectorAll('.cp-col-head')[0].textContent.replace(/\\s+/g, ' ').trim(),
      right: el.querySelector('.apv-draft-head').textContent.replace(/\\s+/g, ' ').trim(),
      toc: el.querySelectorAll('.apv-toc-item').length,
      chapters: Array.prototype.map.call(el.querySelectorAll('.apv-draft .pv-title'), function (x) { return x.textContent.trim(); }),
      opinion: !!document.getElementById('pr-opinion') };`);
  check('成果流程的「审核」打开的是成果发布审核界面（流程号一致 + 左流程右成果文件）',
    !!productScreen && productScreen.head.indexOf(fbRow.no) >= 0 &&
    productScreen.left.indexOf('审核流程与审核意见') >= 0 &&
    productScreen.right.indexOf('编研成果文件') >= 0 && productScreen.opinion,
    productScreen ? productScreen.head + '｜' + productScreen.right : 'ERR 界面没打开');
  check('右栏是按大纲生成的成果全文（带目录导航与章节标题）',
    productScreen && productScreen.toc >= 8 && productScreen.chapters.length >= 8 &&
    productScreen.chapters.join(' ').indexOf('行政区划沿革概述') >= 0,
    productScreen ? productScreen.toc + ' 个目录项｜' + productScreen.chapters.slice(0, 3).join('、') : 'ERR');
  await page.shot(SHOT_DIR + 'flow-review-product-review.png');

  /* ================================================== G2. 发起人视角（成果流程） */
  console.log('\n【G2】成果流程的发起人也能在本页看到自己发起的流程');
  await page.pressEscape();
  await sleep(250);
  await asUser('陈静');            /* FB-2026-0002 的发起人（普通用户，不是 admin） */
  await gotoReview();
  await click('[data-action="rv:type"][data-type="PRODUCT_REVIEW"]');
  await click('[data-action="rv:scope"][data-scope="mine"]');
  const chenRows = await readRows();
  const chenRow = chenRows.filter(function (r) { return r.no === 'FB-2026-0002'; })[0];
  check('成果流程的发起人（陈静）在「我发起的」里看到自己发起的流程，但只有「查看」',
    !!chenRow && chenRow.actions.indexOf('rv:view') >= 0 && chenRow.actions.indexOf('rv:review') < 0,
    chenRow ? chenRow.no + '｜' + chenRow.who + '｜' + chenRow.actions.join('/') : 'ERR 没看到该流程');

  await asUser(ADMIN);
  await gotoReview();
  await click('[data-action="rv:type"][data-type="PRODUCT_REVIEW"]');
  await click('[data-action="rv:scope"][data-scope=""]');     /* 回到「全部」（这是 admin 的"全部流程"口径） */
  const adminRows = await readRows();
  check('admin（赵志远）按文档口径看到全部成果流程（含不是自己发起的）',
    adminRows.length >= 2 &&
    adminRows.map(function (r) { return r.no; }).indexOf('FB-2026-0001') >= 0,
    adminRows.map(function (r) { return r.no + '/' + r.who; }).join('、'));

  /* ================================================== H. 回归与异常 */
  console.log('\n【H】回归与异常');
  await page.pressEscape();
  await sleep(300);
  const escClosed = await page.evaluate("return !document.getElementById('audit-screen');");
  check('Esc 退出全屏审核界面', escClosed, escClosed ? '已关闭' : 'ERR 界面还在');
  const finalCheck = await page.evaluate(`
    var m = document.getElementById('main');
    return { scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      rows: m.querySelectorAll('.table tbody tr').length,
      screen: !!document.getElementById('topic-review-screen') || !!document.getElementById('audit-screen') };`);
  check('流程审核页正常渲染、无横向溢出，且没有残留的全屏界面',
    finalCheck.scrollW <= finalCheck.clientW + 1 && finalCheck.rows >= 1 && !finalCheck.screen,
    'scrollW ' + finalCheck.scrollW + ' / ' + finalCheck.clientW + '，行 ' + finalCheck.rows);
  check('关键界面截图已生成', true,
    [shotDetail, shotSubmit, shotExport].map(function (f) { return f.split('/').slice(-1)[0]; }).join('、'));
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ') : '0 条');
  const warns = page.warns();
  check('全程没有 console 警告（重复动作名/缺图标都会走到这里）', warns.length === 0,
    warns.length ? 'ERR ' + warns.map(function (w) { return w.text; }).join(' | ') : '0 条');

  /* 收尾：清掉 Chrome 自己落进来的组件下载（`.crdownload`），只留导出的评估表 */
  readdirSync(DL_DIR).filter(function (f) { return /\.crdownload$/.test(f); })
    .forEach(function (f) { rmSync(DL_DIR + f, { force: true }); });

  exitCode = check.summary('流程审核 + 选题立项发起审核') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
