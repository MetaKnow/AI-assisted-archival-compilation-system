/* ==========================================================================
   验证套件：编研任务 · 第 2 阶段「确定选材」

   覆盖评审的三条要求：
     1) 选择素材：弹窗数据与素材管理一致、可查看目录与文件、可按标签筛选，
        加入时可选整个文件或某一页 / 某几页
     2) 移除素材：单选 / 多选移除，且**不影响素材库**
     3) 上传素材：填素材名称 + 素材标签后上传本地文件

   运行：node tools/verify/task-selection.mjs [file:///.../index.html]
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
/* 种子数据的"基数"集中放这里：种子一变只改这一处，别散落在断言里 */
const SEED = { selections: 4, materials: 37 };
const page = await openChrome({ width: 1440, height: 1000 });
let exitCode = 0;

async function gotoTask(id) {
  await page.evaluate("location.hash = '#/task/" + id + "'; return 1;");
  await sleep(420);
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

/** 在「选择素材」弹窗里勾选指定素材 */
async function pickMaterials(ids) {
  await page.evaluate(`
    var wanted = ${JSON.stringify(ids)};
    Array.prototype.forEach.call(document.querySelectorAll('.pick-table tbody tr'), function (tr) {
      var cb = tr.querySelector('input[data-change="sel:pick-select"]');
      if (wanted.indexOf(cb.getAttribute('data-id')) >= 0 && !cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    return 1;`);
  await sleep(250);
}

/** 选材库列表快照 */
const LIB = `
  var main = document.getElementById('main');
  var rows = Array.prototype.slice.call(main.querySelectorAll('.sel-table tbody tr'));
  function box(el) { if (!el) return null; var r = el.getBoundingClientRect();
    return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right),
      w: Math.round(r.width), h: Math.round(r.height) }; }
  var heights = {};
  rows.forEach(function (r) { var h = Math.round(r.getBoundingClientRect().height);
    heights[h] = (heights[h] || 0) + 1; });
  return {
    hasSelStep: !!main.querySelector('.sel-step'),
    hasOutline: !!main.querySelector('.outline-step'),
    hasTodo: !!main.querySelector('.step-todo'),
    banner: (main.querySelector('.step-banner') || {}).textContent || '',
    cols: Array.prototype.map.call(main.querySelectorAll('.sel-table thead th'), function (t) {
      return t.textContent.trim(); }).filter(Boolean),
    rows: rows.length,
    titles: Array.prototype.map.call(main.querySelectorAll('.sel-table .title-cell'), function (t) {
      return t.textContent.trim(); }),
    scopes: Array.prototype.map.call(main.querySelectorAll('.sel-table td.col-scope'), function (t) {
      return t.textContent.trim(); }),
    sources: Array.prototype.map.call(main.querySelectorAll('.sel-table td.col-src'), function (t) {
      return t.textContent.trim(); }),
    actions: Array.prototype.map.call(rows[0] ? rows[0].querySelectorAll('.row-actions button') : [],
      function (b) { return b.textContent.trim(); }),
    heights: heights,
    removeDisabled: (function () {
      var b = main.querySelector('.sel-step [data-action="sel:remove"]');
      return b ? b.getAttribute('aria-disabled') === 'true' : null;
    })(),
    empty: (main.querySelector('.sel-step .empty') || {}).textContent || '',
    ariaStage: (function () {
      var el = main.querySelector('.stage-stepper [aria-current="step"]');
      return el ? el.getAttribute('data-stage') : '';
    })(),
    viewingStage: (function () {
      var el = main.querySelector('.stage-stepper .viewing');
      return el ? el.getAttribute('data-stage') : '';
    })(),
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  };
`;

const MODAL = `
  var m = document.querySelector('.modal');
  if (!m) return { err: 'ERR 没有弹窗' };
  function box(el) { if (!el) return null; var r = el.getBoundingClientRect();
    return { t: Math.round(r.top), b: Math.round(r.bottom) }; }
  return {
    title: m.querySelector('.modal-head').textContent.trim(),
    ok: m.querySelector('.modal-foot [data-action="ui:ok"]').textContent.trim(),
    rows: m.querySelectorAll('.pick-table tbody tr').length,
    cols: Array.prototype.map.call(m.querySelectorAll('.pick-table thead th'), function (t) {
      return t.textContent.trim(); }).filter(Boolean),
    first: (function () {
      var tr = m.querySelector('.pick-table tbody tr');
      if (!tr) return null;
      var tds = tr.querySelectorAll('td');
      return { title: tds[2].textContent.trim(), cat: tds[3].textContent.trim(),
        tags: tds[4].textContent.trim(), pages: tds[5].textContent.trim() };
    })(),
    scope: m.querySelector('.scope-box') ? m.querySelector('.scope-box').textContent.replace(/\\s+/g, ' ').trim() : '',
    scopeMode: (function () {
      var r = m.querySelector('input[name="sel-scope"]:checked');
      return r ? r.value : '';
    })(),
    pagesInput: !!m.querySelector('#sel-pages'),
    inputs: m.querySelectorAll('input[type="text"], input:not([type]), textarea, select').length,
    fields: Array.prototype.map.call(m.querySelectorAll('.field-label'), function (e) {
      return e.textContent.trim(); }),
    text: m.textContent.replace(/\\s+/g, ' ')
  };
`;

try {
  /* ================================================== A. 阶段与选材库骨架 */
  console.log('\n【A】第 2 阶段「确定选材」骨架');
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.account && !x.locked; })[0];
    App.store.login(u.account, u.password);
    return 1;`);
  await gotoTask(TASK);

  const t = await page.evaluate(`
    var t = App.store.getTask('${TASK}');
    var rec = App.store.selectionOf('${TASK}');
    return { stage: t.stage, history: t.stageHistory.length, entries: rec.entries.length,
      scopes: rec.entries.map(function (e) { return App.store.scopeText(e); }),
      sources: rec.entries.map(function (e) { return e.source; }) };`);
  check('RW-2026-001 在第 2 阶段，选材库有 ' + SEED.selections + ' 条种子选材',
    t.stage === 2 && t.history === 2 && t.entries === SEED.selections,
    'stage=' + t.stage + '，阶段史 ' + t.history + ' 条，选材 ' + t.entries + ' 条');

  let lib = await page.evaluate(LIB);
  check('详情页显示「确定选材」工作界面（进度条下方，卡片结构不变）',
    lib.hasSelStep && !lib.hasOutline && !lib.hasTodo && lib.ariaStage === '2',
    '选材界面=' + lib.hasSelStep + '；进度条当前阶段=' + lib.ariaStage);
  check('选材库列：序号 / 素材名称 / 档案门类 / 素材标签 / 加入范围 / 来源 / 加入时间 / 加入人 / 操作',
    lib.cols.join() === '序号,素材名称,档案门类,素材标签,加入范围,来源,加入时间,加入人,操作',
    lib.cols.join(' / '));
  check('加入范围区分「整个文件」与「指定页」（含总页数；视频素材没有页数，只写整个文件）',
    lib.scopes.filter(function (x) { return x.indexOf('整个文件') === 0; }).length === 3 &&
    lib.scopes.indexOf('整个文件') >= 0 &&
    lib.scopes.some(function (x) { return x === '第 2-3 页（共 9 页）'; }),
    lib.scopes.join('；'));
  check('行内操作是「查看 / 移除」，工具栏有选择素材 / 上传素材 / 移除素材',
    lib.actions.join() === '查看,移除' && lib.removeDisabled === true,
    lib.actions.join('、') + '；未勾选时移除按钮语义禁用=' + lib.removeDisabled);
  check('选材库整表行高一致、页面无横向溢出',
    Object.keys(lib.heights).length === 1 && lib.scrollW <= lib.clientW + 1,
    JSON.stringify(lib.heights) + '；scrollW ' + lib.scrollW + ' / ' + lib.clientW);

  /* ================================================== B. 进度条：点环节＝停在那一环 */
  console.log('\n【B】点环节＝把进展停在这一环（不能跳过下一环）');
  const stageState = () => page.evaluate(`
    var t = App.store.getTask('${TASK}');
    return { stage: t.stage, hist: t.stageHistory.map(function (h) { return h.stage; }).join(','),
      sel: !!document.querySelector('#main .sel-step'),
      outline: !!document.querySelector('#main .outline-step') };`);

  await click('.stage-stepper [data-stage="1"]');
  let stB = await stageState();
  check('点第 1 阶段：进展退回并停在「生成大纲」，后面的环节回到未开始',
    stB.stage === 1 && stB.hist === '1' && stB.outline && !stB.sel,
    'stage=' + stB.stage + '；阶段史=' + stB.hist);

  await clearToasts();
  await click('.stage-stepper [data-stage="3"]');
  const skipToast = await lastToast();
  stB = await stageState();
  check('在第 1 阶段点第 3 阶段（跳过第 2 阶段）：被拦住、进度不动',
    stB.stage === 1 && skipToast.indexOf('不能跳过第 2 阶段') >= 0, '轻提示：' + skipToast);

  await click('.stage-stepper [data-stage="2"]');
  stB = await stageState();
  check('点第 2 阶段（下一环）：进展推进到「确定选材」，选材界面回来',
    stB.stage === 2 && stB.hist === '1,2' && stB.sel && !stB.outline,
    'stage=' + stB.stage + '；阶段史=' + stB.hist);

  /* 第 3 阶段是全屏工作台：点它＝停到这一阶段并打开工作台；Esc 退出后行内给入口卡片 */
  await click('.stage-stepper [data-stage="3"]');
  const cpOpen = await page.evaluate(`
    var s = document.getElementById('compose-screen');
    return { open: !!s, w: s ? Math.round(s.getBoundingClientRect().width) : 0,
      viewport: window.innerWidth, stage: App.store.getTask('${TASK}').stage };`);
  check('点第 3 阶段：进展停在「加工编排」并全屏打开工作台',
    cpOpen.open && cpOpen.w === cpOpen.viewport && cpOpen.stage === 3,
    '工作台 ' + cpOpen.w + 'px（视口 ' + cpOpen.viewport + 'px）；stage=' + cpOpen.stage);
  await page.pressEscape();
  await sleep(350);
  const inline3 = await page.evaluate(`
    return { compose: !!document.getElementById('compose-screen'),
      entry: !!document.querySelector('#main .compose-entry'),
      btn: !!document.querySelector('#main [data-action="compose:open"]') };`);
  check('Esc 退出工作台后，行内停在「加工编排」的入口卡片（可再次打开）',
    !inline3.compose && inline3.entry && inline3.btn,
    '入口卡片=' + inline3.entry + '；打开按钮=' + inline3.btn);

  /* 第 4 阶段「审核校定」已交付：三类审核各一张卡片；再退回第 2 阶段继续做选材相关的验证 */
  await click('.stage-stepper [data-stage="4"]');
  const review4 = await page.evaluate(`
    var main = document.getElementById('main');
    return { stage: App.store.getTask('${TASK}').stage,
      cards: ['political', 'professional', 'compliance'].map(function (k) {
        var c = main.querySelector('.rv-' + k + ' .card-head span');
        return c ? c.textContent.trim() : ''; }).filter(function (x) { return x; }) };`);
  check('点第 4 阶段：进入「审核校定」（政治性 / 专业性 / 合规性三类）',
    review4.stage === 4 && review4.cards.join() === '政治性审核,专业性审核,合规性审核',
    '第 4 阶段卡片：' + review4.cards.join('、'));
  await click('.stage-stepper [data-stage="2"]');
  lib = await page.evaluate(LIB);
  const back2 = await stageState();
  check('点回第 2 阶段：进展回到「确定选材」，选材库正常渲染',
    lib.hasSelStep && back2.stage === 2 && back2.hist === '1,2',
    'stage=' + back2.stage + '；阶段史=' + back2.hist);

  /* ================================================== C. 选择素材 */
  console.log('\n【C】选择素材：数据与素材管理一致 + 整份 / 指定页');
  await click('[data-action="sel:pick"]');
  let mo = await page.evaluate(MODAL);
  const storeInfo = await page.evaluate(`
    var ms = App.store.materials();
    var m = ms[0];
    var cat = App.store.catalogByArchiveNo(m.archiveNo);
    return { count: ms.length, title: m.title, cat: m.category, tags: (m.tagIds || []).length,
      pages: (cat && cat.pages) || 0, tagOptions: App.store.tagsWithUsage().length };`);
  check('弹窗里的素材就是素材库那一份（' + storeInfo.count + ' 条），并带页数',
    !mo.err && mo.rows === storeInfo.count &&
    mo.first.title === storeInfo.title && mo.first.cat === storeInfo.cat &&
    mo.first.pages === storeInfo.pages + ' 页' &&
    mo.cols.join() === '序号,素材名称,档案门类,素材标签,页数,操作',
    mo.err || (mo.rows + ' 条；首行「' + mo.first.title + '」' + mo.first.cat +
      '／' + mo.first.pages));
  check('加入方式：整个文件 / 指定页（默认整个文件）',
    mo.scopeMode === 'all' && !mo.pagesInput &&
    mo.scope.indexOf('整个文件') >= 0 && mo.scope.indexOf('指定页') >= 0,
    '默认=' + mo.scopeMode);

  /* 视频素材：页数列显示"视频 · 时长"，而不是"0 页" */
  const videoRow = await page.evaluate(`
    var trs = Array.prototype.slice.call(document.querySelectorAll('.pick-table tbody tr'));
    var hit = trs.filter(function (tr) { return tr.textContent.indexOf('录像') >= 0; })[0];
    if (!hit) return null;
    var tds = hit.querySelectorAll('td');
    return { title: tds[2].textContent.trim(), cat: tds[3].textContent.trim(),
      pages: tds[5].textContent.trim(), id: hit.querySelector('input').getAttribute('data-id') };`);
  check('素材弹窗里视频素材的"页数"列显示识别结果（视频 · 时长），不是 0 页',
    !!videoRow && videoRow.pages.indexOf('视频') === 0 && videoRow.pages.indexOf(':') >= 0 &&
    videoRow.cat === '声像档案',
    videoRow ? (videoRow.title + '／' + videoRow.cat + '／' + videoRow.pages) : 'ERR 弹窗里没有录像素材');

  /* 视频 + 指定页：拦住（视频没有页码） */
  await clearToasts();
  await page.evaluate(`
    var cb = document.querySelector('.pick-table input[data-id="${videoRow.id}"]');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    var r = document.querySelector('input[name="sel-scope"][value="pages"]');
    r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(250);
  await click('.modal [data-action="ui:ok"]');
  const vidToast = await lastToast();
  check('选中视频素材时切到「指定页」：保存被拦住并说明视频没有页码',
    vidToast.indexOf('视频素材没有页码') >= 0 && vidToast.indexOf('整个文件') >= 0,
    '轻提示：' + vidToast);

  /* 先用弹窗把种子里那条录像移除，再重新加入一次：
     验"通过「选择素材」加进来的视频，选材记录里同样保留 file.duration"（插入帧要用它做时长校验） */
  const vidDropped = await page.evaluate(`
    var rec = App.store.selectionOf('${TASK}');
    var ids = rec.entries.filter(function (e) { return e.file && /\.mp4$/i.test(e.file.name); })
      .map(function (e) { return e.id; });
    App.store.removeSelections('${TASK}', ids);
    return { removed: ids.length, left: App.store.selectionOf('${TASK}').entries.length };`);
  check('先把种子里的录像选材移除（为下面"从弹窗重新加入"做准备）',
    vidDropped.removed === 1 && vidDropped.left === SEED.selections - 1,
    '移除 ' + vidDropped.removed + ' 条，剩 ' + vidDropped.left + ' 条');

  await page.evaluate(`
    var r = document.querySelector('input[name="sel-scope"][value="all"]');
    r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  const vidAdded = await page.evaluate(`
    var rec = App.store.selectionOf('${TASK}');
    var hit = rec.entries.filter(function (e) { return e.file && /\.mp4$/i.test(e.file.name); })[0];
    return { total: rec.entries.length, duration: hit ? hit.file.duration : 0,
      name: hit ? hit.file.name : '', scope: hit ? hit.scope : '',
      fresh: hit ? (hit.addedBy === '赵志远') : false };`);
  check('视频素材从弹窗以「整个文件」加入：选材记录里保留了 file.duration（插入帧靠它做时长校验）',
    vidAdded.total === SEED.selections && vidAdded.duration === 3720 &&
    vidAdded.scope === 'all' && vidAdded.fresh,
    '文件 ' + vidAdded.name + '，时长 ' + vidAdded.duration + 's，范围 ' + vidAdded.scope +
    '；选材回到 ' + vidAdded.total + ' 条（＝种子基数）');

  await click('[data-action="sel:pick"]');
  await sleep(300);
  /* 按素材标签筛选 */
  const byTag = await page.evaluate(`
    var tag = App.store.tags()[0];
    var sel = document.getElementById('pick-tag');
    sel.value = tag.id;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { tag: tag.id, expect: App.store.materials().filter(function (m) {
      return (m.tagIds || []).indexOf(tag.id) >= 0; }).length,
      label: document.querySelector('#pick-tag option:checked').textContent };`);
  await sleep(300);
  const afterTag = await page.evaluate("return document.querySelectorAll('.pick-table tbody tr').length;");
  check('按素材标签筛选：只列该标签下的素材（行数 = 该标签的素材件数）',
    afterTag === byTag.expect && afterTag < storeInfo.count,
    byTag.label + ' → ' + afterTag + ' 行（期望 ' + byTag.expect + '）');
  await page.evaluate(`
    var sel = document.getElementById('pick-tag');
    sel.value = '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(250);

  /* 查看（叠在弹窗之上；关掉只关这一层） */
  await page.evaluate("document.querySelector('.pick-table [data-action=\"sel:pick-view\"]').click(); return 1;");
  await sleep(450);
  const viewStack = await page.evaluate(`
    var modals = document.querySelectorAll('.modal');
    var view = modals[modals.length - 1];
    return { modals: modals.length,
      secs: Array.prototype.map.call(view.querySelectorAll('.mv-sec-head'), function (e) {
        return e.textContent.replace(/\\s+/g, ' ').trim(); }),
      inputs: view.querySelectorAll('input, textarea, select').length,
      pickerStillOpen: Array.prototype.map.call(modals, function (m) {
        return m.querySelector('.modal-head').textContent.trim(); })
        .some(function (x) { return x.indexOf('选择素材') === 0; }) };`);
  check('在弹窗里点「查看」：叠加打开只读的目录与文件视图，选择素材弹窗仍在下面',
    viewStack.modals === 2 && viewStack.inputs === 0 && viewStack.pickerStillOpen &&
    viewStack.secs.length === 2,
    viewStack.modals + ' 层弹窗；分段：' + viewStack.secs.join(' | ') + '；输入控件 ' + viewStack.inputs + ' 个');
  await page.evaluate("App.ui.closeTop(); return 1;");
  await sleep(250);

  /* 未勾选就保存 */
  await clearToasts();
  await click('.modal [data-action="ui:ok"]');
  const noPick = await lastToast();
  check('一份素材都没勾选就保存：拦住不放行',
    noPick.indexOf('请先勾选') >= 0 &&
    (await page.evaluate("return !!document.querySelector('.modal');")),
    '轻提示：' + noPick);

  /* 勾 2 份 + 整个文件：挑两条**还没以整份加入过**的素材，避免撞上判重 */
  const freeIds = await page.evaluate(`
    var rec = App.store.selectionOf('${TASK}');
    return App.store.materials().filter(function (m) {
      return !rec.entries.some(function (e) { return e.materialId === m.id && e.scope === 'all'; });
    }).slice(0, 2).map(function (m) { return m.id; });`);
  await pickMaterials(freeIds);
  const picked2 = await page.evaluate(`
    return { count: document.getElementById('pick-count').textContent.trim(),
      hint: document.getElementById('sel-scope-hint').textContent.trim() };`);
  check('勾选后就地提示"已勾选 N 份"，并说明都会以整个文件加入（不整页重渲染）',
    picked2.count.indexOf('已勾选 2 份') >= 0 &&
    picked2.hint.indexOf('已勾选 2 份素材') === 0 && picked2.hint.indexOf('整个文件') >= 0,
    picked2.count + '；' + picked2.hint);
  await click('.modal [data-action="ui:ok"]');
  await sleep(450);
  lib = await page.evaluate(LIB);
  const added2 = await page.evaluate(`
    var rec = App.store.selectionOf('${TASK}');
    var two = rec.entries.filter(function (e) { return e.scope === 'all'; });
    return { total: rec.entries.length, all: two.length,
      pageCounts: two.slice(0, 2).map(function (e) { return e.pageCount; }) };`);
  check('加入 2 条（整份文件）：选材库 +2，来源=素材库、范围=整个文件（带总页数）',
    lib.rows === SEED.selections + 2 && added2.total === SEED.selections + 2 &&
    added2.all === SEED.selections + 1 &&
    lib.scopes.filter(function (x) { return /^整个文件（共 \d+ 页）$/.test(x); }).length === SEED.selections,
    '共 ' + lib.rows + ' 条；' + lib.scopes.join('；'));

  /* 重复加入同样范围 → 跳过（用种子里已有的那条 M-001「整份」） */
  await clearToasts();
  const dupId = await page.evaluate(`
    var rec = App.store.selectionOf('${TASK}');
    var e = rec.entries.filter(function (x) { return x.scope === 'all'; })[0];
    return e ? e.materialId : '';`);
  await click('[data-action="sel:pick"]');
  await pickMaterials([dupId]);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  const dupToast = await lastToast();
  lib = await page.evaluate(LIB);
  check('同一条素材同样的范围重复加入：跳过并说明（按「素材 + 范围」判重，选材库不变）',
    lib.rows === SEED.selections + 2 && dupToast.indexOf('已加入 0 条') >= 0 &&
    dupToast.indexOf('跳过重复 1 条') >= 0,
    '轻提示：' + dupToast);

  /* 多选只对「整个文件」成立；「指定页」只能一份 */
  await clearToasts();
  await click('[data-action="sel:pick"]');
  const threeFree = await page.evaluate(`
    var rec = App.store.selectionOf('${TASK}');
    return App.store.materials().filter(function (m) {
      return !rec.entries.some(function (e) { return e.materialId === m.id && e.scope === 'all'; });
    }).slice(0, 3).map(function (m) { return m.id; });`);
  await pickMaterials(threeFree);
  const multiOk = await page.evaluate(`
    return { checked: document.querySelectorAll('.pick-table tbody input:checked').length,
      count: document.getElementById('pick-count').textContent.trim() };`);
  check('「整个文件」模式可以多选（勾 3 份都留着）',
    multiOk.checked === 3 && multiOk.count.indexOf('已勾选 3 份') >= 0,
    multiOk.checked + ' 份；' + multiOk.count);

  await clearToasts();
  const toPages = await page.evaluate(`
    var r = document.querySelector('input[name="sel-scope"][value="pages"]');
    r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(250);
  const trimmed = await page.evaluate(`
    return { checked: document.querySelectorAll('.pick-table tbody input:checked').length,
      count: document.getElementById('pick-count').textContent.trim(),
      hint: document.getElementById('sel-scope-hint').textContent.trim(),
      radioLabel: document.querySelector('input[name="sel-scope"][value="pages"]').parentNode.textContent.trim(),
      allLabel: document.querySelector('input[name="sel-scope"][value="all"]').parentNode.textContent.trim() };`);
  const trimToast = await lastToast();
  check('切到「指定页」：勾选自动裁到一份，并提示原因',
    trimmed.checked === 1 && trimmed.count.indexOf('已勾选 1 份') >= 0 &&
    trimToast.indexOf('一次只能选一份素材') >= 0,
    '剩 ' + trimmed.checked + ' 份；轻提示：' + trimToast);

  /* 指定页模式下再勾另一份 → 替换（单选语义） */
  await clearToasts();
  const other = await page.evaluate(`
    var ids = ${JSON.stringify(threeFree)};
    var free = ids.filter(function (id) {
      var cb = document.querySelector('.pick-table input[data-id="' + id + '"]');
      return cb && !cb.checked;
    });
    return free[0] || '';`);
  await pickMaterials([other]);
  const replaced = await page.evaluate(`
    var checked = Array.prototype.map.call(document.querySelectorAll('.pick-table tbody input:checked'),
      function (cb) { return cb.getAttribute('data-id'); });
    return { checked: checked, hint: document.getElementById('sel-scope-hint').textContent.trim(),
      count: document.getElementById('pick-count').textContent.trim() };`);
  const replaceToast = await lastToast();
  check('「指定页」下再勾另一份：替换前一份（始终只有一份），提示条说明页码针对哪一份',
    replaced.checked.length === 1 && replaced.checked[0] === other &&
    replaceToast.indexOf('已改为只选') >= 0 &&
    replaced.hint.indexOf('页码针对《') === 0,
    replaced.checked.join() + '；' + replaced.hint.slice(0, 40));
  check('两个选项的文字本身就写明了能不能多选',
    trimmed.allLabel.indexOf('可多选') >= 0 && trimmed.radioLabel.indexOf('只能选一份') >= 0,
    trimmed.allLabel + ' / ' + trimmed.radioLabel);

  const pagesUi = await page.evaluate(MODAL);
  check('指定页的页码校验按**这一份**素材的页数（不再是多份取最小）',
    pagesUi.scope.indexOf('页码针对《') >= 0 && pagesUi.scope.indexOf('1 – ') >= 0,
    pagesUi.scope.slice(0, 70));

  /* 用这一份 + 指定页继续往下（下面是原来的指定页断言） */
  const shotPicker = await page.shot(SHOT_DIR + 'selection-picker.png');
  const pagesUi2 = await page.evaluate(MODAL);
  check('「指定页」显示页码输入框',
    pagesUi2.scopeMode === 'pages' && pagesUi2.pagesInput, '页码输入框=' + pagesUi2.pagesInput);

  /* 校验：格式错、空、超范围 */
  const badCases = [['abc', '页码格式不对'], ['', '请填写页码'], ['999', '超出该文件']];
  for (const [input, expect] of badCases) {
    await clearToasts();
    await page.evaluate(`
      var el = document.getElementById('sel-pages');
      el.value = ${JSON.stringify(input)};
      return 1;`);
    await click('.modal [data-action="ui:ok"]');
    const toast = await lastToast();
    check('指定页输入「' + (input || '（空）') + '」：被拦住（' + expect + '）',
      toast.indexOf(expect) >= 0 &&
      (await page.evaluate("return !!document.querySelector('.modal');")),
      '轻提示：' + toast);
  }

  /* 合法页码：1,3,5-6 */
  await page.evaluate(`
    document.getElementById('sel-pages').value = '1,3,5-6';
    return 1;`);
  await click('.modal [data-action="ui:ok"]');
  await sleep(450);
  const scoped = await page.evaluate(`
    var rec = App.store.selectionOf('${TASK}');
    var e = rec.entries.filter(function (x) { return x.scope === 'pages'; })
      .filter(function (x) { return (x.pages || []).length === 4; })[0];
    return { total: rec.entries.length, pages: e ? e.pages : null,
      text: e ? App.store.scopeText(e) : '' };`);
  check('指定页「1,3,5-6」：解析成 4 页并单独成为一条选材，范围文字折叠区间',
    scoped.total === SEED.selections + 3 && scoped.pages && scoped.pages.join() === '1,3,5,6' &&
    scoped.text.indexOf('第 1、3、5-6 页') === 0,
    scoped.text + '（pages=' + (scoped.pages || []).join(',') + '）');

  /* 选材库里「查看」会带上本次选入范围 */
  const shotLib = await page.shot(SHOT_DIR + 'selection-library.png');

  /* ================================================== D. 移除素材 */
  console.log('\n【D】移除素材（单选 / 多选）');
  await gotoTask(TASK);
  const before = await page.evaluate(`
    return { sel: App.store.selectionOf('${TASK}').entries.length,
      materials: App.store.materials().length };`);
  await click('.sel-table tbody tr:first-child input[data-change="sel:select"]');
  const oneSel = await page.evaluate(`
    return { disabled: document.querySelector('.sel-step [data-action="sel:remove"]')
        .getAttribute('aria-disabled'),
      label: document.querySelector('.sel-step [data-action="sel:remove"]').textContent.trim() };`);
  check('勾选一条：移除按钮变可用并显示条数',
    oneSel.disabled === 'false' && oneSel.label.indexOf('（1）') >= 0, oneSel.label);
  await clearToasts();
  await click('.sel-step [data-action="sel:remove"]');
  const delDlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? m.querySelector('.modal-body').textContent.replace(/\\s+/g, ' ').trim() : '';`);
  check('移除前二次确认，并说明不影响素材库',
    delDlg.indexOf('素材库里的素材不会被删除') >= 0, delDlg.slice(0, 54));
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  const after1 = await page.evaluate(`
    return { sel: App.store.selectionOf('${TASK}').entries.length,
      materials: App.store.materials().length,
      checked: document.querySelectorAll('.sel-table tbody input:checked').length,
      disabled: document.querySelector('.sel-step [data-action="sel:remove"]').getAttribute('aria-disabled') };`);
  check('移除 1 条：选材库少 1 条，素材库一条没少，勾选清空、按钮回到禁用',
    after1.sel === before.sel - 1 && after1.materials === before.materials &&
    after1.checked === 0 && after1.disabled === 'true',
    '选材 ' + before.sel + ' → ' + after1.sel + '；素材库 ' + after1.materials + ' 条（不变）');

  const multi = await page.evaluate(`
    var cbs = document.querySelectorAll('.sel-table tbody input[data-change="sel:select"]');
    for (var i = 0; i < 2; i++) { cbs[i].checked = true; cbs[i].dispatchEvent(new Event('change', { bubbles: true })); }
    return cbs.length;`);
  await click('.sel-step [data-action="sel:remove"]');
  const multiDlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? m.querySelector('.modal-head').textContent.trim() : '';`);
  check('多选移除：确认框写明条数', multiDlg.indexOf('移除选中的 2 条选材') >= 0, multiDlg);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  const after2 = await page.evaluate(`
    return { sel: App.store.selectionOf('${TASK}').entries.length,
      materials: App.store.materials().length };`);
  check('移除 2 条：选材库再少 2 条，素材库仍不变',
    after2.sel === after1.sel - 2 && after2.materials === before.materials,
    '选材 ' + after1.sel + ' → ' + after2.sel + '；素材库 ' + after2.materials + ' 条');

  /* 行内单条移除 */
  const inline = await page.evaluate(`
    var tr = document.querySelector('.sel-table tbody tr');
    var title = tr.querySelector('.title-cell').textContent.trim();
    tr.querySelector('[data-action="sel:remove"]').click();
    return title;`);
  await sleep(350);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  const after3 = await page.evaluate(`
    return { sel: App.store.selectionOf('${TASK}').entries.length,
      titles: Array.prototype.map.call(document.querySelectorAll('.sel-table .title-cell'), function (t) {
        return t.textContent.trim(); }) };`);
  check('行内「移除」也能单条移除', after3.sel === after2.sel - 1 &&
    after3.titles.indexOf(inline) < 0, '移除了「' + inline + '」，剩 ' + after3.sel + ' 条');

  /* ================================================== E. 上传素材 */
  console.log('\n【E】上传素材');
  await clearToasts();
  await click('[data-action="sel:upload"]');
  const up = await page.evaluate(MODAL);
  check('上传弹窗字段：素材名称 / 素材标签 / 上传文件，并说明会同时进素材库',
    !up.err && up.title.indexOf('上传素材') === 0 &&
    up.fields.join('|').indexOf('素材名称') === 0 &&
    up.fields.join('|').indexOf('素材标签') >= 0 && up.fields.join('|').indexOf('上传文件') >= 0 &&
    up.text.indexOf('同时进入素材库') >= 0,
    up.fields.join('、'));

  await click('.modal [data-action="ui:ok"]');
  const upErr1 = await lastToast();
  check('素材名称为空：拦住', upErr1.indexOf('请填写素材名称') >= 0, '轻提示：' + upErr1);
  await page.evaluate("document.querySelector('#sel-up-title').value = '测试：本地上传的访谈记录'; return 1;");
  await click('.modal [data-action="ui:ok"]');
  const upErr2 = await lastToast();
  check('未选标签：拦住', upErr2.indexOf('请至少选择一个素材标签') >= 0, '轻提示：' + upErr2);
  await page.evaluate("document.querySelectorAll('input[name=\"up-tag\"]')[0].checked = true; return 1;");
  await click('.modal [data-action="ui:ok"]');
  const upErr3 = await lastToast();
  check('未选文件：拦住', upErr3.indexOf('请选择要上传的文件') >= 0, '轻提示：' + upErr3);

  const upFile = await page.evaluate(`
    var input = document.getElementById('sel-up-file');
    var dt = new DataTransfer();
    dt.items.add(new File([new Array(180000).join('y')], '访谈记录_1985.pdf', { type: 'application/pdf' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return document.getElementById('sel-up-list').textContent.replace(/\\s+/g, ' ').trim();`);
  check('选择本地文件：文件名与大小显示出来（只记这两项）',
    upFile.indexOf('访谈记录_1985.pdf') >= 0 && /KB|MB/.test(upFile), upFile.slice(0, 44));
  const shotUpload = await page.shot(SHOT_DIR + 'selection-upload.png');

  const matBefore = await page.evaluate("return App.store.materials().length;");
  await click('.modal [data-action="ui:ok"]');
  await sleep(500);
  const upAfter = await page.evaluate(`
    var rec = App.store.selectionOf('${TASK}');
    var e = rec.entries.filter(function (x) { return x.source === 'upload'; })[0];
    var m = App.store.materials().filter(function (x) { return x.title === '测试：本地上传的访谈记录'; })[0];
    return { sel: rec.entries.length, entries: e ? { scope: e.scope, pageCount: e.pageCount,
        file: e.file ? e.file.name : '', category: e.category } : null,
      materials: App.store.materials().length,
      inLibrary: !!m, matTags: m ? m.tagIds.length : 0,
      matFile: m && m.file ? m.file.name : '' };`);
  check('上传本地素材：进入本任务选材库（整个文件），**同时进入素材库**',
    upAfter.sel === after3.sel + 1 && upAfter.entries && upAfter.entries.scope === 'all' &&
    upAfter.entries.file === '访谈记录_1985.pdf' &&
    upAfter.materials === matBefore + 1 && upAfter.inLibrary &&
    upAfter.matFile === '访谈记录_1985.pdf',
    '选材 ' + after3.sel + ' → ' + upAfter.sel + '；素材库 ' + matBefore + ' → ' +
    upAfter.materials + '；文件 ' + upAfter.entries.file);

  /* 上传的选材也能查看，文件段显示上传的文件 */
  await gotoTask(TASK);
  const upView = await page.evaluate(`
    var tr = null;
    Array.prototype.forEach.call(document.querySelectorAll('.sel-table tbody tr'), function (r) {
      if (r.querySelector('.title-cell').textContent.trim() === '测试：本地上传的访谈记录') tr = r;
    });
    if (!tr) return 'ERR 找不到上传的那条选材';
    tr.querySelector('[data-action="sel:view"]').click();
    return 'ok';`);
  await sleep(450);
  const upViewModal = await page.evaluate(MODAL);
  check('上传的选材可以查看：文件段是上传的文件，并带「本次选入」范围',
    upView === 'ok' && upViewModal.text.indexOf('访谈记录_1985.pdf') >= 0 &&
    upViewModal.text.indexOf('本次选入') >= 0 && upViewModal.text.indexOf('整个文件') >= 0,
    '文件与范围都在');
  await page.evaluate("App.ui.closeTop(); return 1;");
  await sleep(250);

  /* 从选材库点查看（指定页那条）也要说明范围 */
  const scopedView = await page.evaluate(`
    var tr = null;
    Array.prototype.forEach.call(document.querySelectorAll('.sel-table tbody tr'), function (r) {
      if (r.querySelector('.col-scope').textContent.indexOf('页') >= 0 &&
          r.querySelector('.col-scope').textContent.indexOf('整个文件') < 0) tr = r;
    });
    if (!tr) return 'ERR 没有"指定页"的选材';
    tr.querySelector('[data-action="sel:view"]').click();
    return 'ok';`);
  await sleep(450);
  const scopedModal = await page.evaluate(MODAL);
  check('指定页的选材在查看里标出「本次选入：第 x 页」，不会让人以为整份都选了',
    scopedView === 'ok' && scopedModal.text.indexOf('本次选入') >= 0 &&
    /本次选入\s*第 /.test(scopedModal.text),
    scopedModal.text.slice(scopedModal.text.indexOf('本次选入'), scopedModal.text.indexOf('本次选入') + 30));
  await page.evaluate("App.ui.closeTop(); return 1;");
  await sleep(250);

  /* ================================================== F. 异常与截图 */
  console.log('\n【F】回归与截图');
  await gotoTask(TASK);
  lib = await page.evaluate(LIB);
  check('收尾：选材库仍可正常渲染、行高一致、无横向溢出',
    lib.hasSelStep && Object.keys(lib.heights).length === 1 && lib.scrollW <= lib.clientW + 1,
    lib.rows + ' 条；行高 ' + JSON.stringify(lib.heights));
  check('截图已生成', true,
    [shotLib, shotPicker, shotUpload].map(function (f) { return f.split('/').slice(-1)[0]; }).join('、'));
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ')
      : '0 条（console 警告 ' + page.warns().length + ' 条）');

  exitCode = check.summary('第 2 阶段「确定选材」') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
