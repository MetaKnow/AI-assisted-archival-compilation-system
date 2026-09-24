/* ==========================================================================
   验证套件：材料归档（发布后自动归档四类材料 + 每条目录可改可增）

   覆盖评审要求：
     · 编研成果审核流程走完后，四类材料自动归档到「材料归档」并与编研任务关联：
         ① 选题可行性评估表及附件（附件清单挂在该条目里）② 审核意见表
         ③ 确定选材环节的素材目录（只生成目录表，不含素材文件）④ 编研成果定稿
     · 材料归档里的**每条目录都能修改，也能新增数据**

   跑法：整条链路走界面 —— 用「流程审核」把 RW-2026-003 的成果审核审过（种子里的
   FB-2026-0002）→ 任务发布 → 回到「材料归档」核对四类材料 → 再验证新增/修改/删除。

   运行：node tools/verify/archive.mjs [file:///.../index.html]
   ========================================================================== */

import { openChrome, sleep, makeChecks, waitFor } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ||
  new URL('../../prototype-system/index.html', import.meta.url).href;
const SHOT_DIR = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

const check = makeChecks();
const TASK = 'RW-2026-003';       /* 种子里"成果审核中"的任务：审过它就触发自动归档 */
const REVIEWER = '李文华';         /* 该流程当前环节的审核人 */
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

function asUser(name) {
  return page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.name === ${JSON.stringify(name)}; })[0];
    if (!u) return 'ERR 找不到用户';
    App.store.switchUser(u.id);
    return App.store.currentUser().name;`);
}

async function setField(id, value) {
  await page.evaluate(`
    var el = document.getElementById(${JSON.stringify(id)});
    if (!el) return 0;
    el.value = ${JSON.stringify(String(value))};
    return 1;`);
}

async function gotoArchive(taskId) {
  await page.evaluate("location.hash = '#/archive/" + taskId + "'; return 1;");
  await sleep(450);
}

/** 列表读成 [{id, cells}] */
async function readRows() {
  return page.evaluate(`
    var m = document.getElementById('main');
    return Array.prototype.map.call(m.querySelectorAll('.ar-table tbody tr'), function (tr) {
      var cb = tr.querySelector('input[data-change="ar:select"]');
      return { id: cb ? cb.getAttribute('data-id') : '',
        cells: Array.prototype.map.call(tr.querySelectorAll('td'), function (td) {
          return td.textContent.replace(/\\s+/g, ' ').trim(); }) }; });`);
}

try {
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.name === ${JSON.stringify(REVIEWER)}; })[0];
    App.store.login(u.account, u.password);
    return 1;`);
  await sleep(400);

  /* ================================================== A. 列表结构 */
  console.log('\n【A】材料归档：按编研任务组织，列由「归档设置」驱动');
  await gotoArchive(TASK);
  const list = await page.evaluate(`
    var m = document.getElementById('main');
    var cols = App.store.archiveColumns();
    return { task: (m.querySelector('#ar-task') || {}).value,
      rows: m.querySelectorAll('.ar-table tbody tr').length,
      heads: Array.prototype.map.call(m.querySelectorAll('.ar-table thead th'), function (t) { return t.textContent.trim(); }),
      expect: ['序号'].concat(cols.map(function (k) {
        var f = App.store.getArchiveField(k); return f ? f.name : k; })).concat(['操作']),
      tasks: m.querySelectorAll('#ar-task option').length };`);
  check('切到某个编研任务：列出该任务的归档材料（材料名称可点开查看全部著录字段）',
    list.task === TASK && list.rows > 0, list.task + '｜' + list.rows + ' 件');
  /* 第 1 列是勾选框（表头没有文字），跳过它再比 */
  check('列表列＝「归档设置」里的可见字段（外加固定的序号 / 操作两列）',
    list.heads.slice(1).join() === list.expect.join(),
    list.heads.slice(1).join('、'));

  /* ================================================== B. 走完成果审核 → 自动归档 */
  console.log('\n【B】成果审核流程走完 → 四类材料自动归档到该任务');
  await page.evaluate("location.hash = '#/review'; return 1;");
  await sleep(500);
  await click('[data-action="rv:type"][data-type="PRODUCT_REVIEW"]');
  const beforeRows = await readRows();
  const fbRow = await page.evaluate(`
    var rows = Array.prototype.map.call(document.querySelectorAll('.table tbody tr'), function (tr) {
      var b = tr.querySelector('[data-action="rv:review"]');
      return b ? { no: b.getAttribute('data-no'),
        cells: Array.prototype.map.call(tr.querySelectorAll('td'), function (td) { return td.textContent.replace(/\\s+/g,' ').trim(); }) } : null;
    }).filter(Boolean);
    return rows[0] || null;`);
  check('在「流程审核」里找到等待审核的成果流程（种子的 FB-2026-0002，任务 RW-2026-003）',
    !!fbRow && fbRow.cells.join(' ').indexOf('本市行政区划沿革') >= 0,
    fbRow ? fbRow.no + '｜' + fbRow.cells[2] : 'ERR 没有待审的成果流程');
  await click('[data-action="rv:review"][data-no="' + fbRow.no + '"]');
  await waitFor(page, "!!document.getElementById('audit-screen')", 3000);
  await page.evaluate(`
    document.getElementById('pr-opinion').value = '三审三校完成，同意发布。';
    document.querySelector('[data-action="pr:pass"]').click();
    return 1;`);
  await sleep(700);

  const published = await page.evaluate(`
    var t = App.store.getTask(${JSON.stringify(TASK)});
    var items = App.store.autoArchiveOf(${JSON.stringify(TASK)});
    return { status: t.status, published: !!t.published, locked: App.store.isTaskLocked(${JSON.stringify(TASK)}),
      product: (App.store.productOfTask(${JSON.stringify(TASK)}) || {}).id,
      names: items.map(function (a) { return a.name; }),
      detail: items.map(function (a) {
        return { key: a.autoKey, name: a.name, category: a.category, stage: a.stage,
          stageLabel: a.stageLabel, format: a.format, taskId: a.taskId,
          retention: a.retention, security: a.security,
          attach: (a.attachments || []).map(function (x) { return x.name + '(' + x.format + ')'; }),
          catalog: App.store.archiveCatalog(a).length, note: a.note }; }) };`);
  check('审核通过 → 任务发布（成果已生成、任务锁定）',
    published.status === 'DONE' && published.published && published.locked && !!published.product,
    published.product + '｜任务 ' + published.status + '／published=' + published.published);
  check('自动归档四类材料，名称与评审要求一字不差，且都关联到该编研任务',
    published.names.slice().sort().join('｜') ===
      ['选题可行性评估表及附件', '审核意见表', '素材目录', '编研成果定稿'].sort().join('｜') &&
    published.detail.every(function (d) { return d.taskId === TASK; }),
    published.detail.map(function (d) { return d.name + '→' + d.taskId; }).join('；'));

  const byKey = {};
  published.detail.forEach(function (d) { byKey[d.key] = d; });
  check('① 选题可行性评估表及附件：立项材料·立项阶段，PDF+OFD，附件清单挂在这一条目里',
    byKey['topic-form'] && byKey['topic-form'].category === '立项材料' &&
    byKey['topic-form'].stage === 0 && byKey['topic-form'].stageLabel === '立项' &&
    byKey['topic-form'].format === 'PDF+OFD' && byKey['topic-form'].attach.length >= 2 &&
    byKey['topic-form'].attach.join(' ').indexOf('区划变更年表') >= 0,
    byKey['topic-form'] ? byKey['topic-form'].format + '｜附件：' + byKey['topic-form'].attach.join('、') : 'ERR');
  check('② 审核意见表：审校记录·成果发布阶段，PDF 及 OFD',
    byKey['audit-form'] && byKey['audit-form'].category === '审校记录' &&
    byKey['audit-form'].format === 'PDF+OFD' &&
    byKey['audit-form'].note.indexOf('表 D.1') >= 0,
    byKey['audit-form'] ? byKey['audit-form'].format + '｜' + byKey['audit-form'].note.slice(0, 30) : 'ERR');
  check('③ 素材目录：选材材料·确定选材阶段，目录表由选材库派生（不含素材文件）',
    byKey['material-catalog'] && byKey['material-catalog'].category === '选材材料' &&
    byKey['material-catalog'].stage === 2 && byKey['material-catalog'].catalog >= 4 &&
    byKey['material-catalog'].note.indexOf('不含素材文件') >= 0,
    byKey['material-catalog'] ? byKey['material-catalog'].catalog + ' 条目录｜' +
      byKey['material-catalog'].note.slice(0, 26) : 'ERR');
  check('④ 编研成果定稿：成果文件·成果发布阶段，PDF 及 OFD',
    byKey['final-draft'] && byKey['final-draft'].category === '成果文件' &&
    byKey['final-draft'].format === 'PDF+OFD' && byKey['final-draft'].stage === 5,
    byKey['final-draft'] ? byKey['final-draft'].format + '｜' + byKey['final-draft'].note.slice(0, 26) : 'ERR');

  check('同类过程材料不重复出现：原「选题可行性评估表」并成一条，附件不再单独占行',
    published.names.filter(function (n) { return n === '选题可行性评估表'; }).length === 0 &&
    published.names.filter(function (n) { return n === '选题可行性评估表及附件'; }).length === 1,
    published.names.join('、'));
  const extraRows = await page.evaluate(`
    return App.store.archiveOfTask(${JSON.stringify(TASK)}).filter(function (a) {
      return a.name === '区划变更年表（1949—2025）.xlsx'; }).length;`);
  check('附件不会单独成为归档条目（只在「选题可行性评估表及附件」里列清单）',
    extraRows === 0, '同名独立条目 ' + extraRows + ' 条');
  check('自动归档是幂等的：再同步两次，条数不变',
    await page.evaluate(`
      var n1 = App.store.archiveOfTask(${JSON.stringify(TASK)}).length;
      App.store.syncPublishedArchives(); App.store.syncPublishedArchives();
      return n1 === App.store.archiveOfTask(${JSON.stringify(TASK)}).length;`),
    '同步前后一致');

  /* 界面：材料归档里能看到这四条 */
  await page.evaluate("document.querySelector('[data-action=\"apv:close\"]').click(); return 1;");
  await gotoArchive(TASK);
  const uiRows = await readRows();
  const marked = uiRows.filter(function (r) { return r.cells.join(' ').indexOf('自动归档') >= 0; });
  check('材料归档列表里这四条都在，并标出「自动归档」',
    marked.length === 4 &&
    ['选题可行性评估表及附件', '审核意见表', '素材目录', '编研成果定稿'].every(function (n) {
      return uiRows.some(function (r) { return r.cells.join(' ').indexOf(n) >= 0; });
    }),
    marked.length + ' 条标自动归档｜共 ' + uiRows.length + ' 件');
  const shotList = await page.shot(SHOT_DIR + 'archive-list.png');

  /* ================================================== C. 查看：附件与目录表 */
  console.log('\n【C】「查看」：附件清单 + 素材目录表');
  const formId = await page.evaluate(`
    return App.store.archiveOfTask(${JSON.stringify(TASK)}).filter(function (a) {
      return a.autoKey === 'topic-form'; })[0].id;`);
  await page.evaluate(`
    document.querySelector('[data-action="ar:view"][data-id="${formId}"]').click(); return 1;`);
  await sleep(400);
  const detail = await page.evaluate(`
    var m = document.querySelector('.modal');
    if (!m) return null;
    return { title: m.querySelector('.modal-head').textContent.trim(),
      dts: Array.prototype.map.call(m.querySelectorAll('.desc dt'), function (x) { return x.textContent.trim(); }),
      attach: Array.prototype.map.call(m.querySelectorAll('.attach-item .attach-name'), function (x) { return x.textContent.trim(); }),
      source: m.textContent.indexOf('自动归档') >= 0,
      hasEdit: !!m.querySelector('[data-action="ar:edit-one"]') };`);
  check('查看弹窗：全部著录字段（不重复）+ 附件清单 + 归档来源 + 「修改这条材料」入口',
    !!detail && detail.dts[0] === '材料名称' &&
    detail.dts.filter(function (x) { return x === '材料名称'; }).length === 1 &&
    detail.attach.length >= 2 && detail.source && detail.hasEdit,
    detail ? detail.dts.length + ' 个字段｜附件 ' + detail.attach.join('、') : 'ERR 弹窗没打开');
  const shotDetail = await page.shot(SHOT_DIR + 'archive-detail-attach.png');
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(250);

  const catId = await page.evaluate(`
    return App.store.archiveOfTask(${JSON.stringify(TASK)}).filter(function (a) {
      return a.autoKey === 'material-catalog'; })[0].id;`);
  await page.evaluate(`
    document.querySelector('[data-action="ar:view"][data-id="${catId}"]').click(); return 1;`);
  await sleep(400);
  const catView = await page.evaluate(`
    var m = document.querySelector('.modal');
    if (!m) return null;
    var t = m.querySelector('.ar-catalog-table');
    return { rows: t ? t.querySelectorAll('tbody tr').length : 0,
      heads: t ? Array.prototype.map.call(t.querySelectorAll('thead th'), function (x) { return x.textContent.trim(); }) : [],
      first: t ? t.querySelector('tbody tr').textContent.replace(/\\s+/g, ' ').trim() : '',
      note: m.textContent.indexOf('不含素材文件') >= 0 };`);
  check('「素材目录」条目里能看到整张目录表（题名/档号/门类/来源/选入范围/页数），并注明不含素材文件',
    !!catView && catView.rows >= 4 &&
    catView.heads.join() === '序号,素材题名,档号,门类,来源,选入范围,页数' && catView.note,
    catView ? catView.rows + ' 行｜' + catView.first.slice(0, 40) : 'ERR');
  const shotCatalog = await page.shot(SHOT_DIR + 'archive-detail-catalog.png');
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(250);

  /* ================================================== D. 新增 */
  console.log('\n【D】新增：表单字段＝「归档设置」的字段字典');
  const countBefore = await page.evaluate("return App.store.archiveCount('" + TASK + "');");
  await click('[data-action="ar:new"]');
  const form = await page.evaluate(`
    var m = document.querySelector('.modal');
    var keys = App.store.archiveFields().map(function (f) { return 'af-' + (f.key === 'stage' ? 'stage' : f.key); });
    var missing = keys.filter(function (k) { return !m.querySelector('#' + k); });
    return { title: m.querySelector('.modal-head').textContent.trim(),
      labels: Array.prototype.map.call(m.querySelectorAll('.form-label'), function (x) { return x.textContent.trim(); }),
      missing: missing,
      task: !!m.querySelector('#af-task'), stages: m.querySelectorAll('#af-stage option').length,
      attach: !!m.querySelector('#af-files') };`);
  check('新增表单：所属编研任务 + 字段字典的每个字段（含日期/数字控件）+ 所属阶段下拉 + 附件',
    !!form && form.missing.length === 0 && form.task && form.stages === 6 && form.attach &&
    form.labels[0] === '所属编研任务*' &&
    form.labels.indexOf('材料名称*') > 0,
    form ? (form.missing.length ? 'ERR 缺字段 ' + form.missing.join() : form.labels.length + ' 行') : 'ERR 表单没打开');
  const shotForm = await page.shot(SHOT_DIR + 'archive-form.png');

  /* 必填校验：材料名称留空 */
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(400);
  const blocked = await page.evaluate(`
    var l = document.querySelectorAll('.toast');
    return { open: !!document.querySelector('.modal'),
      toast: l.length ? l[l.length - 1].textContent.trim() : '',
      count: App.store.archiveCount('${TASK}') };`);
  check('必填校验：材料名称留空时保存被拦住（弹窗不关、条数不变）',
    blocked.open && blocked.toast.indexOf('请填写') >= 0 && blocked.count === countBefore,
    blocked.toast + '｜条数 ' + blocked.count);

  await setField('af-name', '编研工作日志');
  await setField('af-category', '过程稿');
  await setField('af-stage', '3');
  await setField('af-format', 'DOCX');
  await setField('af-pages', '42');
  await setField('af-carrier', '电子');
  await setField('af-retention', '长期');
  await setField('af-note', '含每周例会记录与审稿意见。');
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(600);
  const added = await page.evaluate(`
    var it = App.store.archiveItems().filter(function (a) { return a.name === '编研工作日志'; })[0];
    return { count: App.store.archiveCount('${TASK}'), id: it ? it.id : '',
      stage: it ? it.stage : -1, stageLabel: it ? it.stageLabel : '', pages: it ? it.pages : -1,
      retention: it ? it.retention : '', task: it ? it.taskId : '', manual: it ? !!it.manual : false,
      inList: !!(it && document.querySelector('[data-action="ar:view"][data-id="' + it.id + '"]')) };`);
  check('新增成功：出现在该任务的列表里，阶段/页数/保管期限都按填写值落库',
    added.count === countBefore + 1 && added.manual && added.task === TASK &&
    added.stage === 3 && added.stageLabel === '加工编排' && added.pages === 42 &&
    added.retention === '长期' && added.inList,
    '材料 ' + added.id + '｜第 ' + added.stage + ' 阶段·' + added.stageLabel + '｜' + added.pages + ' 页');

  /* ================================================== E. 修改 */
  console.log('\n【E】修改：行内「修改」与「查看 → 修改这条材料」两条入口都能改');
  await page.evaluate(`
    document.querySelector('[data-action="ar:edit-one"][data-id="${added.id}"]').click(); return 1;`);
  await sleep(400);
  const editForm = await page.evaluate(`
    var m = document.querySelector('.modal');
    return { title: m.querySelector('.modal-head').textContent.trim(),
      name: (m.querySelector('#af-name') || {}).value || '',
      pages: (m.querySelector('#af-pages') || {}).value || '',
      attachments: m.querySelectorAll('.attach-item').length };`);
  check('行内「修改」：表单带出该材料的现有值（可改，不是空表）',
    editForm.name === '编研工作日志' && editForm.pages === '42' && editForm.attachments === 0,
    editForm.title + '｜名称 ' + editForm.name + '｜页数 ' + editForm.pages);

  await setField('af-name', '编研工作日志（含例会记录）');
  await setField('af-pages', '48');
  await setField('af-retention', '永久');
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(600);
  const edited = await page.evaluate(`
    var it = App.store.archiveItemOf('${added.id}');
    return { name: it.name, pages: it.pages, retention: it.retention,
      by: it.updatedBy, updated: !!it.updatedAt, count: App.store.archiveCount('${TASK}') };`);
  check('修改保存：字段落库、记录修改人与时间，且条数不变（不是新增一条）',
    edited.name === '编研工作日志（含例会记录）' && edited.pages === 48 &&
    edited.retention === '永久' && edited.by === REVIEWER && edited.updated &&
    edited.count === added.count,
    edited.name + '｜' + edited.pages + ' 页｜' + edited.retention + '｜修改人 ' + edited.by);

  /* 刷新后仍在（持久化） */
  await gotoArchive(TASK);
  const persisted = await page.evaluate(`
    var it = App.store.archiveItemOf('${added.id}');
    return { ok: !!it && it.name === '编研工作日志（含例会记录）',
      inList: !!document.querySelector('[data-action="ar:view"][data-id="${added.id}"]') };`);
  check('切页 / 重新渲染后修改仍在（落 localStorage，不是内存假象）',
    persisted.ok && persisted.inList, '条目仍在列表中');

  /* 「查看 → 修改这条材料」入口 */
  await page.evaluate(`
    document.querySelector('[data-action="ar:view"][data-id="${added.id}"]').click(); return 1;`);
  await sleep(350);
  await page.evaluate("document.querySelector('.modal [data-action=\"ar:edit-one\"]').click(); return 1;");
  await sleep(400);
  const fromView = await page.evaluate(`
    var m = document.querySelector('.modal');
    return { title: m.querySelector('.modal-head').textContent.trim(),
      viewClosed: document.querySelectorAll('.modal').length === 1 };`);
  check('「查看」弹窗里的「修改这条材料」也能进入编辑（查看弹窗自动让位，不叠两层）',
    fromView.title.indexOf('修改归档材料') === 0 && fromView.viewClosed,
    fromView.title + '｜弹窗层数 ' + (fromView.viewClosed ? 1 : 2));
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:close\"]').click(); return 1;");
  await sleep(250);

  /* ================================================== F. 删除 */
  console.log('\n【F】删除：勾选后删除（含确认）');
  await page.evaluate(`
    document.querySelector('input[data-change="ar:select"][data-id="${added.id}"]').click(); return 1;`);
  await sleep(200);
  await click('[data-action="ar:delete"]');
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(600);
  const removed = await page.evaluate(`
    return { count: App.store.archiveCount('${TASK}'), gone: !App.store.archiveItemOf('${added.id}'),
      inList: !!document.querySelector('[data-action="ar:view"][data-id="${added.id}"]') };`);
  check('删除成功：条目消失、条数回落，且不影响自动归档的四类材料',
    removed.gone && !removed.inList && removed.count === countBefore &&
    await page.evaluate("return App.store.autoArchiveOf('" + TASK + "').length === 4;"),
    '剩余 ' + removed.count + ' 件');

  /* ================================================== G. 回归与异常 */
  console.log('\n【G】回归与异常');
  const finalCheck = await page.evaluate(`
    var m = document.getElementById('main');
    return { scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      rows: m.querySelectorAll('.ar-table tbody tr').length,
      modal: !!document.querySelector('.modal') };`);
  check('材料归档页正常渲染、无横向溢出、没有残留弹窗',
    finalCheck.scrollW <= finalCheck.clientW + 1 && finalCheck.rows > 0 && !finalCheck.modal,
    'scrollW ' + finalCheck.scrollW + ' / ' + finalCheck.clientW + '，行 ' + finalCheck.rows);
  check('关键界面截图已生成', true,
    [shotList, shotDetail, shotCatalog, shotForm].map(function (f) { return f.split('/').slice(-1)[0]; }).join('、'));
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ') : '0 条');
  const warns = page.warns();
  check('全程没有 console 警告（重复动作名/缺图标都会走到这里）', warns.length === 0,
    warns.length ? 'ERR ' + warns.map(function (w) { return w.text; }).join(' | ') : '0 条');

  exitCode = check.summary('材料归档（自动归档 + 增删改）') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
