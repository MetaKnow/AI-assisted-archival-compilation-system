/* ==========================================================================
   验证套件：编研素材库 —— 查看目录与文件 / 新增素材 / 按任务筛选

   覆盖本轮三条评审要求：
     1) 查找素材与素材管理的每条数据都有「查看」，能看目录与文件
     2) 素材管理新增「新增素材」（标题 / 备注 / 素材标签 / 上传文件；评审随后把「档号」换成了「备注」）
     3) 素材管理新增「按任务筛选」（过滤逻辑留到「确定选材」环节）

   运行：node tools/verify/material.mjs [file:///.../index.html]
   ========================================================================== */

import { openChrome, sleep, makeChecks } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ||
  new URL('../../prototype-system/index.html', import.meta.url).href;
const SHOT_DIR = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

/* 种子基数集中放这里：种子一变只改这一处，别散落在断言里 */
const SEED = { materials: 37, catalog: 55, tasks: 39 };

const check = makeChecks();
const page = await openChrome({ width: 1440, height: 1000 });
let exitCode = 0;

async function goto(route) {
  await page.evaluate("location.hash = '" + route + "'; return 1;");
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

/** 弹窗内容快照 */
const MODAL = `
  var m = document.querySelector('.modal');
  if (!m) return { err: 'ERR 没有弹窗' };
  return {
    title: m.querySelector('.modal-head').textContent.trim(),
    secs: Array.prototype.map.call(m.querySelectorAll('.mv-sec-head'), function (e) {
      return e.textContent.replace(/\\s+/g, ' ').trim(); }),
    inputs: m.querySelectorAll('input, textarea, select').length,
    buttons: Array.prototype.map.call(m.querySelectorAll('.modal-foot button'), function (b) {
      return b.textContent.trim(); }),
    rows: (function () {
      var out = {};
      Array.prototype.forEach.call(m.querySelectorAll('.form-row'), function (r) {
        out[r.querySelector('.form-label').textContent.trim()] =
          r.querySelector('.form-field').textContent.trim();
      });
      return out;
    })(),
    text: m.textContent.replace(/\\s+/g, ' ')
  };
`;

try {
  /* ================================================== A. 数据与入口 */
  console.log('\n【A】素材库与档案目录（前置）');
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.account && !x.locked; })[0];
    App.store.login(u.account, u.password);
    return 1;`);
  await goto('#/material/list');

  const base = await page.evaluate(`
    return { materials: App.store.materials().length,
      catalog: App.mock.ARCHIVE_CATALOG.length,
      tasks: App.store.tasks().length,
      seeded: App.store.materials().filter(function (m) { return !!m.file; }).length };`);
  check('素材库 ' + SEED.materials + ' 件 / 档案目录 ' + SEED.catalog + ' 条 / 编研任务 ' + SEED.tasks + ' 个（种子数据）',
    base.materials === SEED.materials && base.catalog === SEED.catalog && base.tasks === SEED.tasks,
    base.materials + ' 件素材、' + base.catalog + ' 条目录、' + base.tasks + ' 个任务；' +
    '其中带上传文件的 ' + base.seeded + ' 件');
  const coverage = await page.evaluate(`
    var cat = {};
    App.mock.ARCHIVE_CATALOG.forEach(function (a) { cat[a.archiveNo] = 1; });
    var miss = App.store.materials().filter(function (m) { return !cat[m.archiveNo]; });
    return { miss: miss.map(function (m) { return m.archiveNo; }),
      extra: App.mock.ARCHIVE_CATALOG.length - App.store.materials().length };`);
  check('每一条素材的档号都能在档案目录里查到（"素材来自档案目录"这个前提成立）',
    coverage.miss.length === 0,
    coverage.miss.length ? 'ERR 目录里查不到：' + coverage.miss.join('、')
      : SEED.materials + ' 条素材全部命中；目录另有 ' + coverage.extra + ' 条尚未入库');

  /* ================================================== B. 查找素材：查看目录与文件 */
  console.log('\n【B】查找素材 · 每条都能查看目录与文件');
  await goto('#/material/search');
  const intro = await page.evaluate(`
    return { rows: document.querySelectorAll('#main tbody tr').length,
      hasIntro: document.getElementById('main').textContent.indexOf('先搜索') >= 0 ||
        document.querySelectorAll('#main .suggest, #main .tag-action').length > 0 };`);
  check('查找素材首屏是引导态（不自动检索，没有结果行）', intro.rows === 0 && intro.hasIntro,
    intro.rows + ' 行；引导态=' + intro.hasIntro);

  await page.evaluate(`
    var kw = document.getElementById('find-kw');
    kw.value = '教育';
    document.querySelector('[data-action="find:search"]').click();
    return 1;`);
  await sleep(500);
  const found = await page.evaluate(`
    var rows = document.querySelectorAll('#main tbody tr');
    return { rows: rows.length,
      views: document.querySelectorAll('#main [data-action="material:view"]').length,
      firstNo: rows[0] ? rows[0].querySelectorAll('td')[2].textContent.trim() : '' };`);
  check('检索「教育」出结果，且**每条**都有一个「查看」按钮',
    found.rows >= 5 && found.views === found.rows,
    found.rows + ' 行 / ' + found.views + ' 个查看按钮；首行档号 ' + found.firstNo);

  await click('#main [data-action="material:view"]');
  const cv = await page.evaluate(MODAL);
  check('点「查看」：弹窗只读（0 个输入控件、只有「关闭」），分「目录」与「文件」两段',
    !cv.err && cv.inputs === 0 && cv.buttons.join() === '关闭' &&
    cv.secs.length === 2 && cv.secs[0].indexOf('目录') >= 0 && cv.secs[1].indexOf('文件') >= 0,
    cv.err || ('控件 ' + cv.inputs + ' 个；按钮「' + cv.buttons.join('、') + '」；分段：' + cv.secs.join(' | ')));

  const needCatalog = ['档号', '题名', '全宗', '档案门类', '年度', '责任者', '保管期限', '密级', '页数', '内容摘要', '原文摘录'];
  const missingCatalog = needCatalog.filter(function (k) {
    return !cv.rows[k] || cv.rows[k] === '未著录';
  });
  check('目录段把著录信息逐项列全（' + needCatalog.length + ' 项都非空）',
    missingCatalog.length === 0,
    missingCatalog.length ? 'ERR 缺：' + missingCatalog.join('、')
      : needCatalog.map(function (k) { return k + '=' + cv.rows[k].slice(0, 8); }).join('；'));

  check('文件段给出电子文件的实际元数据（文件名 / 格式 / 大小 / 页数 / 存储位置 / 挂接状态）',
    /\.pdf$/i.test(cv.rows['文件名']) && cv.rows['文件格式'] === 'PDF' &&
    /MB|KB/.test(cv.rows['文件大小']) && /页$/.test(cv.rows['页数']) &&
    cv.rows['存储位置'].indexOf('电子文件中心') >= 0 && cv.rows['挂接状态'] === '已挂接',
    cv.rows['文件名'] + '　' + cv.rows['文件格式'] + '　' + cv.rows['文件大小'] +
    '　' + cv.rows['页数'] + '　' + cv.rows['挂接状态']);
  check('文件区是预览占位，并明确标注"原型不含实体扫描件 / 预置结果"',
    cv.text.indexOf('文件预览') >= 0 && cv.text.indexOf('预置结果') >= 0 &&
    cv.text.indexOf('原型不含实体扫描件') >= 0,
    cv.text.indexOf('原型不含实体扫描件') >= 0 ? '已标注' : 'ERR 没标注');
  check('弹窗底部说明这是只读查看，并标明该档号是否已在素材库',
    cv.text.indexOf('只读查看') >= 0 &&
    (cv.text.indexOf('该档号已在素材库中') >= 0 || cv.text.indexOf('该档号尚未加入素材库') >= 0),
    cv.text.indexOf('该档号已在素材库中') >= 0 ? '已在素材库' : '尚未加入素材库');
  await page.evaluate("App.ui.closeTop(); return 1;");
  await sleep(250);

  /* 未数字化的档案：文件段要如实说"没有电子文件" */
  await page.evaluate(`
    var kw = document.getElementById('find-kw');
    kw.value = '校舍';
    document.querySelector('[data-action="find:search"]').click();
    return 1;`);
  await sleep(450);
  await click('#main [data-action="material:view"]');
  const cv2 = await page.evaluate(MODAL);
  check('未数字化的档案：文件段如实说明"只有纸质件"，挂接状态为未挂接',
    !cv2.err && cv2.rows['数字化状态'] === '未数字化' && cv2.rows['挂接状态'] === '未挂接' &&
    cv2.text.indexOf('尚未数字化') >= 0 && cv2.text.indexOf('无电子文件') >= 0,
    cv2.err || (cv2.rows['数字化状态'] + ' / ' + cv2.rows['挂接状态'] + ' / ' +
      (cv2.text.indexOf('无电子文件') >= 0 ? '标签：无电子文件' : 'ERR 缺标签')));
  const shotView = await page.shot(SHOT_DIR + 'material-view-catalog.png');
  await page.evaluate("App.ui.closeTop(); return 1;");
  await sleep(250);

  /* ================================================== C. 素材管理：查看 */
  console.log('\n【C】素材管理 · 查看 / 行内操作');
  await goto('#/material/list');
  const lib = await page.evaluate(`
    var rows = document.querySelectorAll('#main tbody tr');
    var first = rows[0];
    return { rows: rows.length,
      views: document.querySelectorAll('#main [data-action="material:view"]').length,
      news: document.querySelectorAll('#main [data-action="mat:new"]').length,
      acts: Array.prototype.map.call(first.querySelectorAll('.row-actions button'), function (b) {
        return b.textContent.trim(); }) };`);
  check('素材管理：' + SEED.materials + ' 行数据、每行都有「查看」，「新增素材」按钮在工具栏',
    lib.rows === SEED.materials && lib.views === SEED.materials && lib.news === 1,
    lib.rows + ' 行 / ' + lib.views + ' 个查看 / 新增素材按钮 ' + lib.news + ' 个');
  check('行内操作是「查看 / 更改标签 / 删除」',
    lib.acts.join() === '查看,更改标签,删除', lib.acts.join('、'));

  /* 操作列不换行：逐行检查三个按钮的顶边是否在同一条线上 */
  const actionLayout = await page.evaluate(`
    var rows = Array.prototype.slice.call(document.querySelectorAll('#main tbody tr'));
    var wraps = rows.filter(function (tr) {
      var tops = Array.prototype.slice.call(tr.querySelectorAll('.row-actions button'))
        .map(function (b) { return Math.round(b.getBoundingClientRect().top); });
      return new Set(tops).size > 1;
    }).length;
    var acts = rows[0].querySelector('.row-actions');
    return { rows: rows.length, wraps: wraps,
      flexWrap: getComputedStyle(acts).flexWrap,
      height: Math.round(acts.getBoundingClientRect().height),
      colWidth: Math.round(rows[0].querySelector('td.col-actions').getBoundingClientRect().width),
      clipped: (function () {
        var td = rows[0].querySelector('td.col-actions');
        return td.scrollWidth > td.clientWidth + 1;
      })(),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };`);
  check('操作列不换行、不裁切：' + actionLayout.rows + ' 行里三个按钮都在同一条线上（列宽 ' +
    actionLayout.colWidth + 'px）',
    actionLayout.wraps === 0 && actionLayout.flexWrap === 'nowrap' && !actionLayout.clipped &&
    actionLayout.height <= 30 && actionLayout.colWidth >= 220 && !actionLayout.pageOverflow,
    '换行的行数 ' + actionLayout.wraps + '；flex-wrap=' + actionLayout.flexWrap +
    '；按钮区高 ' + actionLayout.height + 'px（单行约 28px）；列宽 ' + actionLayout.colWidth +
    'px；单元格内容被裁=' + actionLayout.clipped + '；页面横向溢出=' + actionLayout.pageOverflow);

  /* 窄屏也不换行：宁可表格内部横向滚动 */
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 900, deviceScaleFactor: 2, mobile: false });
  await sleep(300);
  const narrow = await page.evaluate(`
    var acts = document.querySelector('#main tbody tr .row-actions');
    var scroller = document.querySelector('#main .table-scroll');
    return { flexWrap: getComputedStyle(acts).flexWrap,
      height: Math.round(acts.getBoundingClientRect().height),
      canScrollX: scroller.scrollWidth > scroller.clientWidth,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };`);
  check('375px 窄屏：操作按钮仍不换行，改为表格内部横向滚动，页面本身不横向溢出',
    narrow.flexWrap === 'nowrap' && narrow.height <= 30 && narrow.canScrollX && !narrow.pageOverflow,
    'flex-wrap=' + narrow.flexWrap + '；高 ' + narrow.height + 'px；表格可横向滚动=' +
    narrow.canScrollX + '；页面溢出=' + narrow.pageOverflow);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1000, deviceScaleFactor: 2, mobile: false });
  await sleep(250);

  const columns = await page.evaluate(`
    var ths = Array.prototype.map.call(document.querySelectorAll('#main thead th'), function (t) {
      return t.textContent.trim(); }).filter(Boolean);
    var tr = document.querySelector('#main tbody tr');
    var notes = Array.prototype.map.call(document.querySelectorAll('#main tbody tr .col-note'), function (td) {
      return td.textContent.trim(); });
    var heights = {};
    Array.prototype.forEach.call(document.querySelectorAll('#main tbody tr'), function (r) {
      var h = Math.round(r.getBoundingClientRect().height);
      heights[h] = (heights[h] || 0) + 1; });
    return { ths: ths, heights: heights,
      notesFilled: notes.filter(function (n) { return n && n !== '未填写'; }).length,
      noteFirst: notes[0], hasTitleCell: !!tr.querySelector('.title-cell'),
      hasNoCell: !!tr.querySelector('.col-no') };`);
  check('素材管理列表：去掉「档号」列、加「备注」列，并增加「档案门类」列',
    columns.ths.join() === '序号,标题,档案门类,标签,备注,加入时间,创建人,操作' &&
    !columns.hasNoCell && columns.hasTitleCell,
    columns.ths.join(' / '));
  check(SEED.materials + ' 行的备注都从档案摘要带过来了（新列不是空的）',
    columns.notesFilled === SEED.materials, '有备注 ' + columns.notesFilled + ' / ' + SEED.materials + '；首行「' +
    columns.noteFirst.slice(0, 22) + '」');
  check('整张表行高一致（每格都在一行内，' + Object.keys(columns.heights).join('px / ') + 'px）',
    Object.keys(columns.heights).length === 1,
    JSON.stringify(columns.heights));

  await click('#main tbody tr:first-child [data-action="material:view"]');
  const lv = await page.evaluate(MODAL);
  check('素材库的「查看」：标题是查看素材，除目录/文件外还显示素材标签、备注与加入信息',
    !lv.err && lv.title.indexOf('查看素材') === 0 && lv.secs.length === 2 &&
    lv.rows['素材标签'] && lv.rows['素材标签'] !== '未著录' &&
    lv.rows['备注'] && lv.rows['备注'] !== '未著录' && /·/.test(lv.rows['加入素材库']),
    lv.err || (lv.title + '；标签：' + lv.rows['素材标签'] +
      '；加入：' + lv.rows['加入素材库']));
  check('素材的目录信息按档号回查档案目录（全宗 / 门类 / 责任者有值）',
    lv.rows['全宗'] !== '未著录' && lv.rows['档案门类'] !== '未著录' &&
    lv.rows['责任者'] !== '未著录',
    [lv.rows['档号'], lv.rows['全宗'], lv.rows['档案门类'], lv.rows['责任者']].join(' / '));
  await page.evaluate("App.ui.closeTop(); return 1;");
  await sleep(250);


  /* ================================================== D. 新增素材 */
  console.log('\n【D】新增素材');
  await click('[data-action="mat:new"]');
  const nf = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? {
      title: m.querySelector('.modal-head').textContent.trim(),
      fields: Array.prototype.map.call(m.querySelectorAll('.field-label'), function (e) {
        return e.textContent.trim(); }),
      tags: m.querySelectorAll('input[name="new-tag"]').length,
      hasFileInput: !!m.querySelector('#mat-file') } : { err: 'ERR 没弹窗' };`);
  const nfMore = await page.evaluate(`
    var m = document.querySelector('.modal');
    return { hasNoInput: !!m.querySelector('#mat-f-no'), hasNote: !!m.querySelector('#mat-f-note'),
      noteTag: m.querySelector('#mat-f-note') ? m.querySelector('#mat-f-note').tagName : '' };`);
  check('「新增素材」弹窗字段：标题 / 备注 / 素材标签 / 上传文件（档号已去掉）',
    !nf.err && nf.title === '新增素材' &&
    nf.fields.join('|').indexOf('标题') === 0 && nf.fields.join('|').indexOf('备注') >= 0 &&
    nf.fields.join('|').indexOf('档号') < 0 &&
    nf.fields.join('|').indexOf('素材标签') >= 0 && nf.fields.join('|').indexOf('上传文件') >= 0 &&
    nf.tags === 10 && nf.hasFileInput && !nfMore.hasNoInput &&
    nfMore.hasNote && nfMore.noteTag === 'TEXTAREA',
    nf.err || ('字段：' + nf.fields.join('、') + '；可选标签 ' + nf.tags + ' 个；' +
      '档号输入框=' + nfMore.hasNoInput + '；备注控件=' + nfMore.noteTag));

  /* 三项必填校验 */
  await click('.modal [data-action="ui:ok"]');
  const v1 = await page.evaluate("return { open: !!document.querySelector('.modal'), toast: '' };");
  const t1 = await lastToast();
  check('标题为空：拦住不放行', v1.open && t1.indexOf('请填写标题') >= 0, '轻提示：' + t1);

  const noteTyped = await page.evaluate(`
    var el = document.querySelector('#mat-f-note');
    el.value = '从市教育局 1979 年经费卷中选出，供第三章"教育经费与办学条件"使用。';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value.length;`);
  check('可以填写备注（多行文本）', noteTyped > 20, noteTyped + ' 字');
  await page.evaluate(`
    document.querySelector('#mat-f-title').value = '测试素材：教育经费史料';
    return 1;`);

  /* 上传文件（用 DataTransfer 造一个真 File，走页面自己的 change 处理） */
  const uploaded = await page.evaluate(`
    var input = document.getElementById('mat-file');
    var dt = new DataTransfer();
    dt.items.add(new File([new Array(240000).join('x')], '教育经费史料_1979年经费卷.pdf',
      { type: 'application/pdf' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return document.getElementById('mat-file-list').textContent.replace(/\\s+/g, ' ').trim();`);
  check('上传文件：文件名与大小显示在表单里（原型只记这两项）',
    uploaded.indexOf('教育经费史料_1979年经费卷.pdf') >= 0 && /KB|MB/.test(uploaded),
    uploaded.slice(0, 60));

  /* 勾标签 + 保存 */
  const saved = await page.evaluate(`
    document.querySelectorAll('input[name="new-tag"]')[0].checked = true;
    document.querySelectorAll('input[name="new-tag"]')[1].checked = true;
    return 1;`);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  const after = await page.evaluate(`
    var ms = App.store.materials();
    var m = ms.filter(function (x) { return x.title === '测试素材：教育经费史料'; })[0];
    return { total: ms.length, first: ms[0].title, found: !!m,
      title: m ? m.title : '', tags: m ? m.tagIds.length : 0,
      archiveNo: m ? m.archiveNo : 'x', note: m ? (m.note || '') : '',
      file: m && m.file ? (m.file.name + '|' + m.file.size) : '',
      by: m ? m.addedBy : '', modalOpen: !!document.querySelector('.modal') };`);
  check('手工新增的素材没有档号（界面上不再有这个字段）', after.archiveNo === '',
    'archiveNo=「' + after.archiveNo + '」');
  check('保存成功：素材 ' + SEED.materials + ' → ' + (SEED.materials + 1) + '，新素材排在第一行，标题/备注/标签/文件都落库（无档号）',
    after.total === SEED.materials + 1 && after.found && after.first === '测试素材：教育经费史料' &&
    after.tags === 2 && after.file.indexOf('教育经费史料_1979年经费卷.pdf') === 0 &&
    after.by === '赵志远' && after.note.indexOf('1979 年经费卷') >= 0 && !after.modalOpen,
    '共 ' + after.total + ' 件；标签 ' + after.tags + ' 个；创建人 ' + after.by +
    '；备注「' + after.note.slice(0, 18) + '…」；文件 ' + after.file +
    '；弹窗还开着=' + after.modalOpen);

  const persisted = await page.evaluate(`
    var tr = document.querySelector('#main tbody tr');
    return { firstTitle: tr.querySelector('.title-cell').textContent.trim(),
      firstNote: tr.querySelector('.col-note').textContent.trim(),
      rows: document.querySelectorAll('#main tbody tr').length };`);
  check('列表立刻出现新素材（第一行），备注列显示刚填的内容',
    persisted.rows === SEED.materials + 1 && persisted.firstTitle === '测试素材：教育经费史料' &&
    persisted.firstNote.indexOf('1979 年经费卷') >= 0,
    persisted.rows + ' 行；首行「' + persisted.firstTitle + '」/ 备注「' +
    persisted.firstNote.slice(0, 18) + '…」');

  /* 新增的素材同样能查看，且文件段显示上传的文件 */
  await click('#main tbody tr:first-child [data-action="material:view"]');
  const nv = await page.evaluate(MODAL);
  check('新增素材的「查看」：文件段显示上传的文件名与大小，并说明不保存内容',
    !nv.err && nv.rows['文件名'].indexOf('教育经费史料_1979年经费卷.pdf') >= 0 &&
    /KB|MB/.test(nv.rows['文件大小']) && nv.text.indexOf('只记录文件名与大小') >= 0,
    nv.err || (nv.rows['文件名'] + '　' + nv.rows['文件大小']));
  await page.evaluate("App.ui.closeTop(); return 1;");
  await sleep(250);

  /* 手工新增的素材没有档号：查看时目录段要如实说明，且不出现空的"档号"行 */
  await click('#main tbody tr:first-child [data-action="material:view"]');
  const orphanView = await page.evaluate(MODAL);
  check('手工新增（无档号）的素材：查看时说明"没有档案目录信息"，不编造著录信息、也不留空的档号行',
    !orphanView.err && orphanView.text.indexOf('手工新增') >= 0 &&
    orphanView.text.indexOf('没有档号') >= 0 && orphanView.rows['档号'] === undefined &&
    orphanView.rows['档案门类'] === '未著录' && orphanView.rows['备注'],
    orphanView.err || ('档号行=' + orphanView.rows['档号'] + '；档案门类=' +
      orphanView.rows['档案门类'] + '；备注「' + orphanView.rows['备注'].slice(0, 16) + '…」'));
  await page.evaluate("App.ui.closeTop(); return 1;");
  await sleep(250);

  /* 标题重复：拦住并留在弹窗里改（判重口径从档号换成了标题） */
  await clearToasts();
  await click('[data-action="mat:new"]');
  await page.evaluate(`
    document.querySelector('#mat-f-title').value = '测试素材：教育经费史料';
    document.querySelectorAll('input[name="new-tag"]')[0].checked = true;
    return 1;`);
  await click('.modal [data-action="ui:ok"]');
  const dupToast = await lastToast();
  const dupState = await page.evaluate(`
    return { open: !!document.querySelector('.modal'), total: App.store.materials().length };`);
  check('标题重复：拦住不保存、弹窗不关，素材数不变',
    dupState.open && dupState.total === SEED.materials + 1 && dupToast.indexOf('已在素材库中') >= 0,
    '轻提示：' + dupToast);

  const shotNew = await page.shot(SHOT_DIR + 'material-new.png');
  await page.evaluate("App.ui.closeTop(); return 1;");
  await sleep(250);

  /* 刷新后仍在（localStorage 持久化） */
  await page.goto(PAGE_URL);
  await sleep(400);
  const reload = await page.evaluate(`
    var m = App.store.materials().filter(function (x) { return x.title === '测试素材：教育经费史料'; })[0];
    return { total: App.store.materials().length, title: m ? m.title : 'ERR 丢失',
      note: m ? (m.note || '') : '' };`);
  check('刷新浏览器后新增的素材（含备注）仍在（持久化到 localStorage）',
    reload.total === SEED.materials + 1 && reload.title === '测试素材：教育经费史料' &&
    reload.note.indexOf('1979 年经费卷') >= 0,
    reload.total + ' 件；「' + reload.title + '」备注「' + reload.note.slice(0, 18) + '…」');

  /* ================================================== E. 按任务筛选 */
  console.log('\n【E】按任务筛选（过滤逻辑留待「确定选材」）');
  await goto('#/material/list');
  const picker = await page.evaluate(`
    var sel = document.getElementById('mat-task');
    return { options: Array.prototype.map.call(sel.options, function (o) { return o.textContent; }),
      rows: document.querySelectorAll('#main tbody tr').length };`);
  check('任务下拉列出「全部任务」+ 39 个编研任务（编号 · 选题名）',
    picker.options.length === 40 && picker.options[0] === '全部任务' &&
    /^RW-\d{4}-\d{3} · /.test(picker.options[1]),
    picker.options.length + ' 项：' + picker.options.slice(0, 3).join(' | ') + ' …');

  const chosen = await page.evaluate(`
    var sel = document.getElementById('mat-task');
    sel.value = 'RW-2026-001';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(400);
  const filtered = await page.evaluate(`
    var note = document.querySelector('#main .data-note');
    return { note: note ? note.textContent.replace(/\\s+/g, ' ').trim() : '',
      rows: document.querySelectorAll('#main tbody tr').length,
      selected: (document.getElementById('mat-task') || {}).value,
      hasReset: !!document.querySelector('[data-action="mat:clear-filter"]') };`);
  check('选择任务后：出现说明条，讲清"过滤逻辑在确定选材环节实现"，列表未被悄悄过滤',
    filtered.note.indexOf('RW-2026-001') >= 0 &&
    filtered.note.indexOf('本市教育事业发展史料汇编') >= 0 &&
    filtered.note.indexOf('确定选材') >= 0 &&
    filtered.rows === SEED.materials + 1 && filtered.selected === 'RW-2026-001' && filtered.hasReset,
    filtered.note.slice(0, 74) + '…（列表仍 ' + filtered.rows + ' 行）');
  const shotTask = await page.shot(SHOT_DIR + 'material-task-filter.png');

  await click('[data-action="mat:clear-filter"]');
  const cleared = await page.evaluate(`
    return { note: !!document.querySelector('#main .data-note'),
      selected: document.getElementById('mat-task').value,
      rows: document.querySelectorAll('#main tbody tr').length };`);
  check('点「重置」：说明条消失、任务下拉回到「全部任务」',
    !cleared.note && cleared.selected === '' && cleared.rows === SEED.materials + 1,
    '下拉=' + (cleared.selected || '全部任务') + '，' + cleared.rows + ' 行');

  /* ================================================== E2. 按档案门类筛选 */
  console.log('\n【E2】按档案门类筛选（这一个是真过滤）');
  await goto('#/material/list');
  const catUi = await page.evaluate(`
    var opts = Array.prototype.map.call(document.querySelectorAll('#mat-cat option'), function (o) {
      return o.textContent; });
    var counts = {};
    App.store.materials().forEach(function (m) { counts[m.category] = (counts[m.category] || 0) + 1; });
    var cells = Array.prototype.map.call(document.querySelectorAll('#main tbody td.col-cat'), function (td) {
      return td.textContent.trim(); });
    return { opts: opts, counts: counts, cells: cells,
      noCat: App.store.materials().filter(function (m) { return !m.category; }).length };`);
  const catNames = Object.keys(catUi.counts);
  check('每条素材都有档案门类（种子数据从档案目录带过来），列表逐行显示',
    catUi.noCat === 0 && catUi.cells.length === catUi.cells.filter(function (c) { return c && c !== '未著录'; }).length,
    catUi.cells.length + ' 行都有门类：' + Object.keys(catUi.counts).map(function (c) {
      return c + ' ' + catUi.counts[c]; }).join('、'));
  check('门类下拉只列素材库里实际出现的门类，并带件数（不列空门类）',
    catUi.opts[0] === '全部门类' && catUi.opts.length === catNames.length + 1 &&
    catNames.every(function (c) {
      return catUi.opts.some(function (o) { return o === c + '（' + catUi.counts[c] + '）'; });
    }),
    catUi.opts.join(' | '));

  /* 选一个有代表性的门类做真过滤（用件数最多的那个以外的，能看出差异） */
  const pick = catNames.filter(function (c) { return catUi.counts[c] < catUi.cells.length; })
    .sort(function (a, b) { return catUi.counts[a] - catUi.counts[b]; })[0] || catNames[0];
  const catFiltered = await page.evaluate(`
    var sel = document.getElementById('mat-cat');
    sel.value = ${JSON.stringify(pick)};
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(400);
  const catState = await page.evaluate(`
    return { rows: document.querySelectorAll('#main tbody tr').length,
      cells: Array.prototype.map.call(document.querySelectorAll('#main tbody td.col-cat'), function (td) {
        return td.textContent.trim(); }),
      note: document.querySelector('#main .toolbar-note').textContent.replace(/\\s+/g, ' ').trim(),
      selected: document.getElementById('mat-cat').value,
      hasReset: !!document.querySelector('[data-action="mat:clear-filter"]') };`);
  check('选「' + pick + '」后列表真的只剩该门类（' + catUi.counts[pick] + ' 件），逐行门类一致',
    catState.rows === catUi.counts[pick] && catState.selected === pick &&
    catState.cells.every(function (c) { return c === pick; }) &&
    catState.note.indexOf('当前筛选出 ' + catUi.counts[pick] + ' 件') >= 0 && catState.hasReset,
    catState.rows + ' 行；' + catState.note);

  /* 门类 + 标签叠加过滤 */
  const stacked = await page.evaluate(`
    var expected = App.store.materials().filter(function (m) { return m.category === ${JSON.stringify(pick)}; });
    var tagCount = {};
    expected.forEach(function (m) { (m.tagIds || []).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; }); });
    var tag = Object.keys(tagCount).sort(function (a, b) { return tagCount[b] - tagCount[a]; })[0];
    var sel = document.getElementById('mat-tag');
    sel.value = tag;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { tag: tag, expect: App.store.materials().filter(function (m) {
      return m.category === ${JSON.stringify(pick)} && (m.tagIds || []).indexOf(tag) >= 0; }).length };`);
  await sleep(400);
  const stackedRows = await page.evaluate("return document.querySelectorAll('#main tbody tr').length;");
  check('门类与标签筛选可以叠加（两个条件同时生效）',
    stackedRows === stacked.expect && stacked.expect > 0,
    pick + ' + 标签 ' + stacked.tag + ' → ' + stackedRows + ' 行（期望 ' + stacked.expect + '）');

  await click('[data-action="mat:clear-filter"]');
  const catCleared = await page.evaluate(`
    return { cat: document.getElementById('mat-cat').value,
      tag: document.getElementById('mat-tag').value,
      rows: document.querySelectorAll('#main tbody tr').length };`);
  check('重置：门类与标签筛选一起清空，列表还原',
    catCleared.cat === '' && catCleared.tag === '' && catCleared.rows === SEED.materials + 1,
    '门类=' + (catCleared.cat || '全部') + '，标签=' + (catCleared.tag || '全部') +
    '，' + catCleared.rows + ' 行');

  /* 新增素材：门类可选，保存后能按该门类筛到 */
  await click('[data-action="mat:new"]');
  const catForm = await page.evaluate(`
    var sel = document.querySelector('#mat-f-cat');
    return { exists: !!sel, options: sel ? Array.prototype.map.call(sel.options, function (o) { return o.value; }) : [],
      value: sel ? sel.value : '' };`);
  check('「新增素材」有档案门类下拉，选项就是系统里的档案门类、默认第一项',
    catForm.exists && catForm.options.join() === (await page.evaluate("return App.mock.ARCHIVE_CATEGORIES.join();")) &&
    catForm.value === '文书档案',
    catForm.options.join(' / ') + '；默认 ' + catForm.value);

  await page.evaluate(`
    document.querySelector('#mat-f-title').value = '测试素材：科技档案一条';
    document.querySelector('#mat-f-cat').value = '科技档案';
    document.querySelectorAll('input[name="new-tag"]')[0].checked = true;
    return 1;`);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  const savedCat = await page.evaluate(`
    var m = App.store.materials().filter(function (x) { return x.title === '测试素材：科技档案一条'; })[0];
    return m ? m.category : 'ERR 没保存';`);
  check('新增素材时选的门类会落库', savedCat === '科技档案', '门类=' + savedCat);

  await page.evaluate(`
    var sel = document.getElementById('mat-cat');
    sel.value = '科技档案';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(400);
  const techRows = await page.evaluate(`
    return { rows: document.querySelectorAll('#main tbody tr').length,
      titles: Array.prototype.map.call(document.querySelectorAll('#main tbody .title-cell'), function (t) {
        return t.textContent.trim(); }) };`);
  check('按「科技档案」筛选：只剩刚新增的那条（原来素材库里没有科技档案）',
    techRows.rows === 1 && techRows.titles[0] === '测试素材：科技档案一条',
    techRows.rows + ' 行：' + techRows.titles.join('、'));
  await click('[data-action="mat:clear-filter"]');
  await clearToasts();

  /* ================================================== F. 标签用量（历史缺陷回归） */
  console.log('\n【F】标签「关联素材」数必须是派生真值');
  await goto('#/material/tags');
  const tagPage = await page.evaluate(`
    var t = App.store.tagsWithUsage().filter(function (x) { return x.id === 'G-001'; })[0];
    var row = document.querySelector('#main tbody tr');
    return { derived: App.store.tagUsage('G-001'), field: t ? t.materialCount : null,
      cell: row ? row.textContent.replace(/\s+/g, ' ').trim() : '',
      rawHasField: Object.prototype.hasOwnProperty.call(App.store.tags()[0], 'materialCount') };`);
  check('标签管理「用量」列显示派生真值（G-001 实际关联 ' + tagPage.derived + ' 件素材）',
    tagPage.derived > 0 && tagPage.field === tagPage.derived &&
    tagPage.cell.indexOf(tagPage.derived + ' 件') >= 0 && tagPage.cell.indexOf('未使用') < 0,
    'tagUsage=' + tagPage.derived + '、tagsWithUsage.materialCount=' + tagPage.field +
    '；首行：' + tagPage.cell.slice(0, 46));
  check('派生用量不写进标签对象本体（避免被当成数据落进 localStorage）',
    tagPage.rawHasField === false, 'tags() 里有 materialCount 字段=' + tagPage.rawHasField);

  await goto('#/material/list');
  const tagUi = await page.evaluate(`
    var opt = document.querySelector('#mat-tag option:nth-child(2)').textContent;
    return { opt: opt, derived: App.store.tagUsage('G-001') };`);
  check('素材管理的标签筛选下拉显示真实用量（不再是 undefined）',
    tagUi.opt.indexOf('（' + tagUi.derived + '）') >= 0 && tagUi.opt.indexOf('undefined') < 0,
    '「' + tagUi.opt + '」');

  await click('[data-action="mat:retag"][data-id]');
  const retagCount = await page.evaluate(`
    var m = document.querySelector('.modal');
    var el = m.querySelector('.pick-count');
    return { text: el ? el.textContent.trim() : 'ERR 没有用量',
      derived: App.store.tagUsage('G-001') };`);
  check('「更改标签」弹窗里的用量是真实数字',
    retagCount.text === '已用 ' + retagCount.derived + ' 件',
    retagCount.text + '（tagUsage=' + retagCount.derived + '）');
  await page.evaluate("App.ui.closeTop(); return 1;");
  await sleep(250);

  /* 兜底断言：全站不该出现 undefined / NaN / [object Object] 这类渲染事故 */
  const dirty = [];
  for (const route of ['#/material/list', '#/material/tags', '#/material/search', '#/task', '#/workbench']) {
    await goto(route);
    if (route === '#/material/search') {
      await page.evaluate(`
        document.getElementById('find-kw').value = '教育';
        document.querySelector('[data-action="find:search"]').click();
        return 1;`);
      await sleep(400);
    }
    const bad = await page.evaluate(`
      var t = document.getElementById('main').textContent;
      var hits = [];
      ['undefined', 'NaN', '[object Object]', 'null '].forEach(function (w) {
        if (t.indexOf(w) >= 0) hits.push(w);
      });
      return hits;`);
    if (bad.length) dirty.push(route + '→' + bad.join('/'));
  }
  check('5 个页面渲染文本里都没有 undefined / NaN / [object Object]',
    dirty.length === 0, dirty.length ? 'ERR ' + dirty.join('；') : '干净');

  /* ================================================== G. 异常与截图 */
  console.log('\n【G】运行时异常');
  check('截图已生成', true,
    [shotView, shotNew, shotTask].map(function (f) { return f.split('/').slice(-1)[0]; }).join('、'));
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ')
      : '0 条（console 警告 ' + page.warns().length + ' 条）');

  exitCode = check.summary('编研素材库：查看 / 新增 / 按任务筛选') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
