/* ==========================================================================
   验证套件：编研任务列表 —— 每行 3 个、每页固定 12 个、超过翻页

   运行：node tools/verify/task-list.mjs [file:///.../index.html]
   ========================================================================== */

import { openChrome, sleep, makeChecks } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ||
  new URL('../../prototype-system/index.html', import.meta.url).href;
const SHOT_DIR = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

const check = makeChecks();

/* 列表页快照：卡片、行、分页条一次量全 */
const SNAP = `
  var grid = document.querySelector('#main .task-grid');
  var cards = grid ? Array.prototype.slice.call(grid.querySelectorAll('.task-card')) : [];
  var pager = document.querySelector('#main .pager');
  function box(el) { var r = el.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }
  var rows = {};
  cards.forEach(function (c) {
    var t = Math.round(c.getBoundingClientRect().top);
    (rows[t] = rows[t] || []).push(c);
  });
  var rowKeys = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
  return {
    hash: location.hash,
    cardCount: cards.length,
    ids: cards.map(function (c) { return c.querySelector('.task-title').getAttribute('data-id'); }),
    cardBoxes: cards.map(box),
    gridBox: grid ? box(grid) : null,
    gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
    rowCount: rowKeys.length,
    rowSizes: rowKeys.map(function (k) { return rows[k].length; }),
    chips: document.querySelectorAll('#main .task-card .stage-chip').length,
    clipped: Array.prototype.filter.call(
      document.querySelectorAll('#main .task-card .task-meta dd'),
      function (d) { return d.scrollWidth > d.clientWidth + 1; })
      .map(function (d) { return d.parentNode.querySelector('dt').textContent + '=' + d.textContent; }),
    metaRows: (function () {
      var m = document.querySelector('#main .task-card .task-meta');
      if (!m) return -1;
      var tops = {};
      Array.prototype.forEach.call(m.children, function (c) {
        tops[Math.round(c.getBoundingClientRect().top)] = 1;
      });
      return Object.keys(tops).length;
    })(),
    pager: pager ? {
      info: pager.querySelector('.pager-info').textContent.trim(),
      nums: Array.prototype.map.call(pager.querySelectorAll('.pager-num'), function (b) {
        return { n: b.textContent.trim(), current: b.classList.contains('current') }; }),
      prevDisabled: pager.querySelector('[data-page]').getAttribute('aria-disabled') === 'true',
      nextDisabled: pager.querySelectorAll('[data-page]')[pager.querySelectorAll('[data-page]').length - 1]
        .getAttribute('aria-disabled') === 'true',
      current: (pager.querySelector('.pager-num.current') || {}).textContent
    } : null,
    empty: !!document.querySelector('#main .empty, #main .empty-state'),
    text: document.getElementById('main').textContent.replace(/\\s+/g, ' '),
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  };
`;

const page = await openChrome({ width: 1440, height: 950 });
let exitCode = 0;

async function toPage(n) {
  await page.evaluate(`
    var b = document.querySelector('#main .pager [data-page="' + ${n} + '"]');
    if (b) b.click();
    return 1;
  `);
  await sleep(300);
  return page.evaluate(SNAP);
}

/** 按 data-action 点一个按钮（真实鼠标事件，坐标取元素中心） */
async function clickAction(action, extra) {
  const pt = await page.evaluate(`
    var sel = '[data-action="${action}"]' + (${JSON.stringify(extra || '')});
    var el = document.querySelector(sel);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.textContent || '').trim() };
  `);
  if (!pt) throw new Error('找不到元素：data-action=' + action + ' ' + (extra || ''));
  await page.mouseClick(pt.x, pt.y);
  await sleep(320);
  return pt;
}

try {
  /* ================================================== A. 首页 12 个 / 3 列 */
  console.log('\n【A】第一页：每行 3 个、每页 12 个');
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.account && !x.locked; })[0];
    App.store.login(u.account, u.password);
    App.router.navigate('#/task');
    return 1;
  `);
  await sleep(400);

  const storeIds = await page.evaluate(`
    return App.store.tasks().map(function (t) { return t.id; });
  `);
  let snap = await page.evaluate(SNAP);

  check('任务库共 39 个任务，第一页只渲染 12 个',
    storeIds.length === 39 && snap.cardCount === 12,
    'store ' + storeIds.length + ' 个 / 页面 ' + snap.cardCount + ' 张卡片');
  check('栅格是 3 列（每行 3 个）', snap.gridColumns === 3, 'gridTemplateColumns 列数=' + snap.gridColumns);
  check('第一页排成 4 行，每行 3 个',
    snap.rowCount === 4 && snap.rowSizes.join(',') === '3,3,3,3',
    snap.rowCount + ' 行：' + snap.rowSizes.join(' / '));
  check('同一行卡片顶部对齐、宽度一致、且横向依次排开（±1px）', (function () {
    for (let i = 0; i < 12; i += 3) {
      const row = snap.cardBoxes.slice(i, i + 3);
      if (Math.abs(row[0].t - row[1].t) > 1 || Math.abs(row[0].t - row[2].t) > 1) return false;
      if (Math.abs(row[0].w - row[1].w) > 1 || Math.abs(row[0].w - row[2].w) > 1) return false;
      if (!(row[0].r <= row[1].l + 1 && row[1].r <= row[2].l + 1)) return false;
    }
    return true;
  })(), '第 1 行宽 ' + snap.cardBoxes[0].w.toFixed(1) + ' / ' +
    snap.cardBoxes[1].w.toFixed(1) + ' / ' + snap.cardBoxes[2].w.toFixed(1) + 'px');
  check('第 3 张卡片右边缘贴齐栅格右边缘（三列铺满，±1px）',
    Math.abs(snap.gridBox.r - snap.cardBoxes[2].r) <= 1,
    '栅格右 ' + snap.gridBox.r.toFixed(1) + ' / 第 3 张右 ' + snap.cardBoxes[2].r.toFixed(1));
  check('卡片高度一致（同一行等高拉伸）',
    Math.abs(snap.cardBoxes[0].h - snap.cardBoxes[2].h) <= 1,
    snap.cardBoxes[0].h.toFixed(1) + 'px');
  check('12 张卡片 = 12 × 6 = 72 个阶段切片', snap.chips === 72, snap.chips + ' 个切片');
  check('卡片变窄后元数据没有出现省略号（任务日期完整可读）',
    snap.clipped.length === 0,
    snap.clipped.length ? 'ERR 被截断：' + snap.clipped.join('、') : '12 张卡片 × 3 项元数据都完整');
  check('元数据排成两行（编号 / 负责人 + 日期占满一行）', snap.metaRows === 2,
    snap.metaRows + ' 行');
  check('无横向溢出', snap.scrollW <= snap.clientW + 1,
    'scrollWidth ' + snap.scrollW + ' / clientWidth ' + snap.clientW);

  /* ================================================== B. 分页条 */
  console.log('\n【B】分页条');
  check('出现分页条，页码 1–4，当前页 1',
    !!snap.pager && snap.pager.nums.map(function (x) { return x.n; }).join(',') === '1,2,3,4' &&
    snap.pager.current.trim() === '1',
    snap.pager ? snap.pager.nums.map(function (x) { return x.n; }).join(' ') + '；当前 ' + snap.pager.current : 'ERR 无分页条');
  check('分页说明文字正确（共 39 个 · 每页 12 个 · 第 1 / 4 页）',
    snap.pager.info === '共 39 个任务，每页 12 个 · 第 1 / 4 页', snap.pager.info);
  check('第 1 页「上一页」语义禁用、「下一页」可用',
    snap.pager.prevDisabled && !snap.pager.nextDisabled,
    '上一页禁用=' + snap.pager.prevDisabled + ' 下一页禁用=' + snap.pager.nextDisabled);

  /* ================================================== C. 翻页 */
  console.log('\n【C】翻页');
  const p2 = await toPage(2);
  check('点「下一页」到第 2 页：仍是 12 张卡片、当前页 2',
    p2.cardCount === 12 && p2.pager.current.trim() === '2', p2.pager.info);
  check('第 2 页的内容与第 1 页不同（确实是下一批任务）',
    p2.ids.join() !== snap.ids.join() && p2.ids[0] === storeIds[12],
    '第 2 页第 1 张 = ' + p2.ids[0] + '（store 第 13 个 = ' + storeIds[12] + '）');

  const p4 = await toPage(4);
  check('第 4 页只有 3 张卡片（39 = 12 + 12 + 12 + 3）',
    p4.cardCount === 3, '第 4 页 ' + p4.cardCount + ' 张；' + p4.pager.info);
  check('第 4 页「下一页」语义禁用、「上一页」可用',
    p4.pager.nextDisabled && !p4.pager.prevDisabled,
    '上一页禁用=' + p4.pager.prevDisabled + ' 下一页禁用=' + p4.pager.nextDisabled);
  check('第 4 页的 3 张就是库里最后 3 个任务',
    p4.ids.join() === storeIds.slice(36).join(), p4.ids.join(' / '));

  /* 逐页取回来的 id 顺序拼起来必须与库里完全一致：既不重复也不漏 */
  const seen = [];
  for (let n = 1; n <= 4; n++) {
    const s = await toPage(n);
    seen.push.apply(seen, s.ids);
  }
  check('4 页按顺序拼起来 = 库里的 39 个任务（无重复、无遗漏）',
    seen.join() === storeIds.join(),
    seen.length + ' 个：' + (new Set(seen)).size + ' 个唯一；与前 3 个 ' + seen.slice(0, 3).join('/') + ' …');

  const backFirst = await toPage(1);
  check('从第 4 页跳回第 1 页正常', backFirst.cardCount === 12 && backFirst.ids[0] === storeIds[0],
    backFirst.pager.info);

  /* ================================================== D. 筛选 / 搜索与分页的关系 */
  console.log('\n【D】筛选 / 搜索');
  const filtered = await page.evaluate(`
    var el = document.getElementById('task-status');
    el.value = 'IN_PROGRESS';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return App.store.tasks().filter(function (t) { return App.store.taskMatchesState(t, 'IN_PROGRESS'); }).length;
  `);
  await sleep(320);
  let fs = await page.evaluate(SNAP);
  const expectPages = Math.ceil(filtered / 12);
  check('按「进行中」筛选：先跳回第 1 页，页数按筛选结果重算',
    !!fs.pager && fs.pager.current.trim() === '1' &&
    fs.pager.info === '共 ' + filtered + ' 个任务，每页 12 个 · 第 1 / ' + expectPages + ' 页',
    fs.pager ? fs.pager.info : 'ERR 无分页条（筛选出 ' + filtered + ' 个，不足一页）');
  check('筛选后每页仍是 12 个（第 1 页 12 张）', fs.cardCount === (filtered >= 12 ? 12 : filtered),
    fs.cardCount + ' 张 / 筛选出 ' + filtered + ' 个');
  check('工具栏显示「共 39 个任务…当前筛选出 N 个」',
    fs.text.indexOf('共 39 个任务') >= 0 && fs.text.indexOf('当前筛选出 ' + filtered + ' 个') >= 0,
    '筛选出 ' + filtered + ' 个');

  /* 在第 2 页上改筛选条件，必须回到第 1 页（否则页码夹回会让人以为筛选没生效） */
  if (expectPages > 1) {
    await toPage(2);
    const afterFilter = await page.evaluate(`
      var el = document.getElementById('task-status');
      el.value = '';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 1;
    `);
    await sleep(320);
    fs = await page.evaluate(SNAP);
    check('在第 2 页上取消筛选：回到第 1 页而不是停在原页码',
      fs.pager.current.trim() === '1' && fs.ids[0] === storeIds[0], fs.pager.info);
  }

  const one = await page.evaluate(`
    var kw = document.getElementById('task-kw');
    kw.value = '${storeIds[0]}';
    document.querySelector('[data-action="task:search"]').click();
    return '${storeIds[0]}';
  `);
  await sleep(320);
  fs = await page.evaluate(SNAP);
  check('搜索出 1 个任务时：只剩 1 张卡片，分页条隐藏（没有第二页就不显示）',
    fs.cardCount === 1 && fs.pager === null, '搜「' + one + '」→ ' + fs.cardCount + ' 张；分页条=' + (fs.pager ? '有' : '无'));

  await page.evaluate(`
    var kw = document.getElementById('task-kw');
    kw.value = 'zzzz-不存在的任务';
    document.querySelector('[data-action="task:search"]').click();
    return 1;
  `);
  await sleep(320);
  fs = await page.evaluate(SNAP);
  check('搜索无结果：空状态 + 无分页条',
    fs.cardCount === 0 && fs.pager === null && fs.text.indexOf('没有符合条件的任务') >= 0,
    '文本含空状态=' + (fs.text.indexOf('没有符合条件的任务') >= 0));

  await clickAction('task:clear-filter');
  fs = await page.evaluate(SNAP);
  check('重置筛选：回到 39 个任务、第 1 页、分页条恢复',
    fs.cardCount === 12 && fs.pager.current.trim() === '1' && fs.ids[0] === storeIds[0],
    fs.pager.info);

  /* ================================================== E. 删到当前页不存在了 */
  console.log('\n【E】边界：最后一页被删空');
  const p4again = await toPage(4);
  const leftIds = p4again.ids.slice();
  const afterDelete = await page.evaluate(`
    App.store.deleteTasks(${JSON.stringify(leftIds)});
    return App.store.tasks().length;
  `);
  await sleep(400);
  fs = await page.evaluate(SNAP);
  check('删掉第 4 页的 3 个任务后（39 → 36）：页码自动夹回第 3 页，不留空白页',
    afterDelete === 36 && fs.cardCount === 12 && fs.pager.current.trim() === '3' &&
    fs.pager.info === '共 36 个任务，每页 12 个 · 第 3 / 3 页',
    fs.pager.info);

  const restored = await page.evaluate(`
    App.store.resetTasks();
    App.app.render();
    return App.store.tasks().length;
  `);
  await sleep(320);
  fs = await page.evaluate(SNAP);
  check('重置演示数据后回到 39 个任务 / 4 页，且当前页仍在合法区间（不留空白页）',
    restored === 39 && fs.cardCount === 12 &&
    fs.pager.info.indexOf('共 39 个任务，每页 12 个') === 0 && fs.pager.current.trim() === '3',
    fs.pager.info);

  /* ================================================== F. 进详情再返回，页码保留 */
  console.log('\n【F】进详情 / 返回');
  await toPage(2);
  await page.evaluate(`document.querySelectorAll('.task-card .task-title')[1].click(); return 1;`);
  await sleep(350);
  const inDetail = await page.evaluate(`
    return { hash: location.hash, title: document.querySelector('#main .detail-title').textContent };
  `);
  check('从第 2 页点卡片进详情',
    inDetail.hash === '#/task/' + storeIds[13],
    'hash=' + inDetail.hash + '，标题「' + inDetail.title + '」');
  await clickAction('task:list');
  const backList = await page.evaluate(SNAP);
  check('返回列表后仍停在第 2 页（从哪里进去就回哪里）',
    backList.hash === '#/task' && backList.pager.current.trim() === '2' && backList.ids[0] === storeIds[12],
    backList.pager.info);

  /* ================================================== G. 新建任务后回第 1 页 */
  console.log('\n【G】新建任务');
  await toPage(3);
  await clickAction('task:new');
  const created = await page.evaluate(`
    var sel = document.querySelector('.modal #tk-topic');
    if (!sel) return 'ERR 没有选题下拉';
    if (sel.options.length < 2) return 'ERR 没有可关联的选题';
    sel.selectedIndex = 1;
    document.querySelector('.modal [data-action="ui:ok"]').click();
    return sel.options[1].textContent;
  `);
  await sleep(400);
  fs = await page.evaluate(SNAP);
  check('在第 3 页新建任务：自动回到第 1 页，新任务出现在第一张',
    fs.pager.current.trim() === '1' && fs.ids[0].indexOf('RW-') === 0 && fs.ids[0] !== storeIds[0] &&
    fs.pager.info === '共 40 个任务，每页 12 个 · 第 1 / 4 页',
    '新建（' + created + '）后：' + fs.pager.info + '，第一张 = ' + fs.ids[0]);

  const reset2 = await page.evaluate(`
    App.store.resetTasks(); App.app.render(); return App.store.tasks().length;
  `);
  check('重置回 39 个任务', reset2 === 39, reset2 + ' 个');

  /* ================================================== H. 三档视口 + 截图 */
  console.log('\n【H】响应式与截图');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1250, deviceScaleFactor: 2, mobile: false
  });
  await sleep(3000);            // 等上一步的轻提示消失，别糊在卡片上
  await toPage(1);
  /* 整页截图：4 行卡片 + 分页条都在一张图里（否则分页条落在视口外） */
  const shot1 = await page.shot(SHOT_DIR + 'task-list-page1.png', { full: true });
  await toPage(4);
  const shot2 = await page.shot(SHOT_DIR + 'task-list-page4.png', { full: true });
  check('列表页截图已生成', true,
    shot1.split('/').slice(-1)[0] + '、' + shot2.split('/').slice(-1)[0]);

  await toPage(4);
  for (const [w, expectCols] of [[1440, 3], [1200, 2], [1000, 2], [900, 1], [760, 1], [375, 1]]) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: 950, deviceScaleFactor: 2, mobile: false
    });
    await sleep(220);
    const m = await page.evaluate(`
      var grid = document.querySelector('#main .task-grid');
      return {
        cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        cards: document.querySelectorAll('#main .task-card').length,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth
      };
    `);
    check(w + 'px 视口：' + expectCols + ' 列 × 每页 12 个、无横向溢出',
      m.cols === expectCols && m.cards === 3 && m.scrollW <= m.clientW + 1,
      m.cols + ' 列 / 第 4 页 ' + m.cards + ' 张 / scrollW ' + m.scrollW + ' vs ' + m.clientW);
  }
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 950, deviceScaleFactor: 2, mobile: false
  });

  /* ================================================== I. 异常 */
  console.log('\n【I】运行时异常');
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ')
      : '0 条（console 警告 ' + page.warns().length + ' 条）');

  exitCode = check.summary('编研任务列表分页') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
