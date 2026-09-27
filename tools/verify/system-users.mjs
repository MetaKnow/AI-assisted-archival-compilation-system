/* ==========================================================================
   验证套件：系统管理 · 用户管理

   覆盖本轮评审要求：
     · 用户列表**去掉**「角色 / 部门 / 涉及数据」三列
     · 列表与「新增用户」表单都**增加「职位」**
   外加模块本身的回归：新增用户的校验与落库、勾选联动、权限迁移窗口仍可用。

   运行：node tools/verify/system-users.mjs [file:///.../index.html]
   ========================================================================== */

import { openChrome, sleep, makeChecks } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE_URL = process.argv[2] ||
  new URL('../../prototype-system/index.html', import.meta.url).href;
const SHOT_DIR = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

const check = makeChecks();
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

async function setField(id, value) {
  await page.evaluate(`
    var el = document.getElementById(${JSON.stringify(id)});
    if (el) el.value = ${JSON.stringify(String(value))};
    return 1;`);
}

try {
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.isAdmin && !x.locked; })[0];
    App.store.login(u.account, u.password);
    location.hash = '#/system/users';
    return 1;`);
  await sleep(500);

  /* ================================================== A. 列表列 */
  console.log('\n【A】用户列表：去掉「角色 / 部门 / 涉及数据」，增加「职位」');
  const table = await page.evaluate(`
    var m = document.getElementById('main');
    var heads = Array.prototype.map.call(m.querySelectorAll('.usr-table thead th'), function (t) {
      return t.textContent.trim(); });
    var first = Array.prototype.map.call(m.querySelectorAll('.usr-table tbody tr')[0].querySelectorAll('td'),
      function (td) { return td.textContent.replace(/\\s+/g, ' ').trim(); });
    var u = App.store.users()[0];
    return { heads: heads, first: first, users: App.store.users().length,
      titles: App.store.users().map(function (x) { return x.title || ''; }),
      hasTitleRule: !!Array.prototype.slice.call(document.styleSheets).length };`);
  check('表头＝勾选框 + 序号 / 用户名 / 姓名 / 职位 / 状态 / 创建时间（不含角色、部门、涉及数据）',
    table.heads.slice(1).join() === '序号,用户名,姓名,职位,状态,创建时间',
    table.heads.slice(1).join('、'));
  check('列表里已经没有「角色 / 部门 / 涉及数据」这三列（表头与单元格都没有）',
    table.heads.indexOf('角色') < 0 && table.heads.indexOf('部门') < 0 &&
    table.heads.indexOf('涉及数据') < 0,
    '表头：' + table.heads.slice(1).join('、'));
  check('每行的第 5 列（职位）显示用户的职位值，不再是角色/部门',
    table.first.length === 7 && table.first[4] === (table.titles[0] || '—'),
    '第一行：' + table.first.join(' | '));
  const shotList = await page.shot(SHOT_DIR + 'system-users.png');

  /* ================================================== B. 新增表单：职位 */
  console.log('\n【B】新增用户表单：用户名 / 姓名 / 职位 / 密码');
  await click('[data-action="usr:new"]');
  const form = await page.evaluate(`
    var m = document.querySelector('.modal');
    return { title: m.querySelector('.modal-head').textContent.trim(),
      labels: Array.prototype.map.call(m.querySelectorAll('.rec-label'), function (x) {
        return x.textContent.replace(/\\s+/g, '').trim(); }),
      fields: Array.prototype.map.call(m.querySelectorAll('.modal input, .modal textarea'), function (x) {
        return x.id; }),
      titlePlaceholder: (m.querySelector('#u-title') || {}).placeholder || '' };`);
  check('表单字段顺序＝用户名 / 姓名 / 职位 / 密码（职位在姓名与密码之间，非必填）',
    form.labels.join() === '*用户名：,*姓名：,职位：,*密码：' &&
    form.fields.join() === 'u-account,u-name,u-title,u-pwd',
    form.labels.join('　'));
  check('职位输入框有明确的填写提示（留空显示「—」）',
    form.titlePlaceholder.indexOf('编研项目负责人') >= 0 && form.titlePlaceholder.indexOf('—') >= 0,
    form.titlePlaceholder);
  const shotForm = await page.shot(SHOT_DIR + 'system-users-form.png');

  /* 校验仍然生效（用户名 / 姓名 / 密码必填） */
  await setField('u-title', '档案编研员');
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(400);
  const blocked = await page.evaluate(`
    var box = document.querySelector('.modal #u-account-error');
    return { open: !!document.querySelector('.modal'),
      msg: box && !box.hasAttribute('hidden') ? box.textContent.trim() : '',
      users: App.store.users().length };`);
  check('必填校验仍在：只填职位保存被拦住（弹窗不关、用户数不变）',
    blocked.open && blocked.msg.indexOf('用户名') >= 0 && blocked.users === table.users,
    blocked.msg || 'ERR 没看到报错');

  /* ================================================== C. 职位落库 */
  console.log('\n【C】保存后职位落库：列表与数据层都能看到');
  await setField('u-account', 'zhangwei');
  await setField('u-name', '张伟');
  await setField('u-pwd', '123456');
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(600);
  const created = await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.account === 'zhangwei'; })[0];
    var tr = null;
    Array.prototype.forEach.call(document.querySelectorAll('.usr-table tbody tr'), function (r) {
      if (r.textContent.indexOf('zhangwei') >= 0) tr = r; });
    var cells = tr ? Array.prototype.map.call(tr.querySelectorAll('td'), function (td) {
      return td.textContent.replace(/\\s+/g, ' ').trim(); }) : [];
    return { exists: !!u, name: u ? u.name : '', title: u ? u.title : '',
      users: App.store.users().length, cells: cells,
      roleKept: u ? u.roleLabel : '', deptKept: u ? u.dept : '' };`);
  check('新增成功：职位写进用户数据，并显示在列表的「职位」列',
    created.exists && created.name === '张伟' && created.title === '档案编研员' &&
    created.users === table.users + 1 && created.cells[4] === '档案编研员',
    '张伟 / ' + created.title + '｜列表：' + created.cells.slice(1).join(' | '));
  check('角色 / 部门仍留在数据层（权限迁移窗口要用），只是列表不再显示',
    !!created.roleKept && !!created.deptKept,
    '角色 ' + created.roleKept + '／部门 ' + created.deptKept);

  /* 留空职位 → 列表显示「—」 */
  await click('[data-action="usr:new"]');
  await setField('u-account', 'liumin');
  await setField('u-name', '刘敏');
  await setField('u-pwd', '123456');
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(600);
  const blank = await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.account === 'liumin'; })[0];
    var tr = null;
    Array.prototype.forEach.call(document.querySelectorAll('.usr-table tbody tr'), function (r) {
      if (r.textContent.indexOf('liumin') >= 0) tr = r; });
    var cells = tr ? Array.prototype.map.call(tr.querySelectorAll('td'), function (td) {
      return td.textContent.replace(/\\s+/g, ' ').trim(); }) : [];
    return { title: u ? u.title : 'ERR', cells: cells };`);
  check('职位留空时不写默认值：数据里是空串，列表显示「—」',
    blank.title === '' && blank.cells[4] === '—', '列表：' + blank.cells.slice(1).join(' | '));

  /* ================================================== D. 勾选与权限迁移回归 */
  console.log('\n【D】回归：勾选联动与权限迁移窗口');
  const newId = await page.evaluate(`
    return App.store.users().filter(function (x) { return x.account === 'zhangwei'; })[0].id;`);
  await page.evaluate(`
    document.querySelector('input[data-change="usr:select"][data-id="${newId}"]').click(); return 1;`);
  await sleep(250);
  const sel = await page.evaluate(`
    var edit = document.querySelector('[data-action="usr:edit"]');
    var del = document.querySelector('[data-action="usr:delete"]');
    var tr = document.querySelector('input[data-change="usr:select"][data-id="${newId}"]').closest('tr');
    return { editEnabled: edit.getAttribute('aria-disabled') !== 'true',
      delEnabled: del.getAttribute('aria-disabled') !== 'true',
      rowSelected: tr.classList.contains('selected') };`);
  check('勾选一个用户后：「修改 / 删除」变为可用、行高亮',
    sel.editEnabled && sel.delEnabled && sel.rowSelected, JSON.stringify(sel));

  await click('[data-action="ui:menu"][data-menu-trigger="usr-more"]');
  const migr = await page.evaluate(`
    var menu = document.getElementById('usr-more');
    return { open: !!menu && !menu.classList.contains('hidden'),
      items: Array.prototype.map.call(menu.querySelectorAll('.menu-item'), function (b) {
        return b.textContent.trim(); }) };`);
  check('「更多操作」菜单仍完整（权限迁移 / 重置密码 / 批量导入导出 / 锁定解锁）',
    migr.items.join() === '权限迁移,重置密码,批量导入,批量导出,锁定,解锁', migr.items.join('、'));
  await page.evaluate("document.querySelector('[data-action=\"usr:migrate\"]').click(); return 1;");
  await sleep(500);
  const migrate = await page.evaluate(`
    var m = document.querySelector('.modal');
    if (!m) return null;
    return { title: m.querySelector('.modal-head').textContent.trim(),
      hasDataBlock: m.textContent.indexOf('要迁移的数据') >= 0,
      targets: m.querySelectorAll('.pick-row').length,
      keepsRoleDept: m.textContent.indexOf('编研利用科') >= 0 };`);
  check('权限迁移窗口仍可用（迁移清单 + 接收人列表；接收人那里仍能看到角色与部门）',
    !!migrate && migrate.title.indexOf('权限迁移') === 0 && migrate.hasDataBlock &&
    migrate.targets >= 1 && migrate.keepsRoleDept,
    migrate ? migrate.title + '｜接收人 ' + migrate.targets + ' 个' : 'ERR 窗口没打开');
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:close\"]').click(); return 1;");
  await sleep(300);

  /* ================================================== E. 回归与异常 */
  console.log('\n【E】回归与异常');
  const finalCheck = await page.evaluate(`
    var m = document.getElementById('main');
    return { scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      rows: m.querySelectorAll('.usr-table tbody tr').length,
      modal: !!document.querySelector('.modal'),
      total: App.store.users().length };`);
  check('页面正常渲染、无横向溢出、没有残留弹窗',
    finalCheck.scrollW <= finalCheck.clientW + 1 && finalCheck.rows === finalCheck.total && !finalCheck.modal,
    'scrollW ' + finalCheck.scrollW + ' / ' + finalCheck.clientW + '，行 ' + finalCheck.rows);
  check('关键界面截图已生成', true,
    [shotList, shotForm].map(function (f) { return f.split('/').slice(-1)[0]; }).join('、'));
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ') : '0 条');
  const warns = page.warns();
  check('全程没有 console 警告（重复动作名/缺图标都会走到这里）', warns.length === 0,
    warns.length ? 'ERR ' + warns.map(function (w) { return w.text; }).join(' | ') : '0 条');

  exitCode = check.summary('系统管理 · 用户管理') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
