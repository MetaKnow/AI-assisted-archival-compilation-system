/* ==========================================================================
   验证套件：系统管理 · 审核规则 + 第 4 阶段「审核校定」

   覆盖本轮评审要求：
     · 审核规则模块放在「归档设置」下，原型与数据对齐参照系统（敏感内容管理）
     · 政治性审核：依托规则，命中要显示"规则标题 + 命中内容"
     · 专业性审核：不依赖规则（错别字 / 纪年 / 规范表述），错别字可 AI 自动修改并显示修改信息
     · 合规性审核：**不依赖审核规则** —— 模型判定知识产权风险 + 个人隐私及个人信息
     · 三类结果单独列出，且支持修改内容片段

   运行：node tools/verify/audit.mjs [file:///.../index.html]
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
const DEMO_CHAPTER = 'n3';          // 种子里故意播入问题的演示章节
const page = await openChrome({ width: 1500, height: 1000 });
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

/** 进到第 4 阶段（任务在第 2 阶段，不能跳级：先停到 3 再点 4） */
async function openReview() {
  await page.evaluate("location.hash = '#/task/" + TASK + "'; return 1;");
  await sleep(420);
  await page.evaluate(`document.querySelector('.stage-stepper [data-stage="3"]').click(); return 1;`);
  await sleep(500);
  await page.evaluate("if (App.taskCompose) App.taskCompose.close(); return 1;");
  await sleep(200);
  await page.evaluate(`document.querySelector('.stage-stepper [data-stage="4"]').click(); return 1;`);
  await sleep(500);
}

const RV = `
  var main = document.getElementById('main');
  function card(key) { return main.querySelector('.rv-' + key); }
  return {
    stage: App.store.getTask('${TASK}').stage,
    ops: (main.querySelector('.review-ops-main') || {}).textContent
      ? main.querySelector('.review-ops-main').textContent.replace(/\\s+/g, ' ').trim() : '',
    badges: Array.prototype.map.call(main.querySelectorAll('.review-ops-tags .tag'),
      function (t) { return t.textContent.trim(); }),
    cards: Array.prototype.map.call(main.querySelectorAll('.rv-card'), function (c) {
      return c.querySelector('.card-head span').textContent.trim(); }),
    /* 评审要求：三类不再各自审核，只保留顶部一个入口 */
    kindRunBtns: main.querySelectorAll('[data-action="audit:run"]').length,
    runAllBtns: main.querySelectorAll('[data-action="audit:run-all"]').length,
    kindHeadBtns: Array.prototype.map.call(main.querySelectorAll('.rv-card .card-head button'),
      function (b) { return b.textContent.trim(); }),
    runInfo: Array.prototype.map.call(main.querySelectorAll('.rv-run-info'),
      function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }),
    cardNotes: Array.prototype.map.call(main.querySelectorAll('.rv-card .data-note'), function (x) {
      return x.textContent.replace(/\s+/g, ' ').trim(); }),
    political: card('political') ? {
      tag: (card('political').querySelector('.card-head .tag') || {}).textContent || '',
      items: card('political').querySelectorAll('.rv-item').length,
      ruleLines: Array.prototype.map.call(card('political').querySelectorAll('.rv-rule'),
        function (r) { return r.textContent.replace(/\\s+/g, ' ').trim(); }),
      contexts: Array.prototype.map.call(card('political').querySelectorAll('.rv-context'),
        function (c) { return c.textContent.replace(/\\s+/g, ' ').trim(); }),
      fixedInfos: card('political').querySelectorAll('.rv-fix').length,
      marks: Array.prototype.map.call(card('political').querySelectorAll('.rv-context mark'),
        function (m) { return m.textContent; }),
      actions: card('political').querySelectorAll('.rv-item [data-action]').length
    } : null,
    professional: card('professional') ? {
      items: card('professional').querySelectorAll('.rv-item').length,
      titles: Array.prototype.map.call(card('professional').querySelectorAll('.rv-item-title'),
        function (t) { return t.textContent.trim(); }),
      details: Array.prototype.map.call(card('professional').querySelectorAll('.rv-detail'),
        function (d) { return d.textContent.replace(/\\s+/g, ' ').trim(); }),
      autofix: card('professional').querySelectorAll('[data-action="audit:autofix"]').length,
      fixInfos: Array.prototype.map.call(card('professional').querySelectorAll('.rv-fix'),
        function (f) { return f.textContent.replace(/\\s+/g, ' ').trim(); })
    } : null,
    compliance: card('compliance') ? {
      items: card('compliance').querySelectorAll('.rv-item').length,
      titles: Array.prototype.map.call(card('compliance').querySelectorAll('.rv-item-title'),
        function (t) { return t.textContent.trim(); }),
      /* 合规性不再依托审核规则：这两处应当是 0 */
      ruleLines: Array.prototype.map.call(card('compliance').querySelectorAll('.rv-rule'),
        function (r) { return r.textContent.replace(/\\s+/g, ' ').trim(); }),
      basis: (card('compliance').querySelector('.rv-basis') || {}).textContent || '',
      details: Array.prototype.map.call(card('compliance').querySelectorAll('.rv-detail'),
        function (x) { return x.textContent.replace(/\\s+/g, ' ').trim(); }),
      autofix: card('compliance').querySelectorAll('[data-action="audit:autofix"]').length
    } : null,
    fixRows: main.querySelectorAll('.rv-fix-table tbody tr').length,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  };
`;

const AR = `
  var main = document.getElementById('main');
  return {
    cols: Array.prototype.map.call(main.querySelectorAll('th'), function (t) {
      return t.textContent.trim(); }).filter(Boolean),
    rows: main.querySelectorAll('tbody tr').length,
    first: (function () {
      var tr = main.querySelectorAll('tbody tr')[0];
      if (!tr) return null;
      var tds = tr.querySelectorAll('td');
      return { title: tds[2].textContent.trim(), content: tds[3].textContent.trim(),
        type: tds[4].textContent.trim(), flag: tds[5].textContent.trim(),
        date: tds[6].textContent.trim(), enable: tds[7].textContent.trim(),
        actions: Array.prototype.map.call(tr.querySelectorAll('.row-actions button'),
          function (b) { return b.textContent.trim(); }) };
    })(),
    toolbarBtns: Array.prototype.map.call(main.querySelectorAll('.toolbar button'),
      function (b) { return b.textContent.trim(); }),
    filters: Array.prototype.map.call(main.querySelectorAll('.toolbar select'), function (s) {
      return s.options.length; }),
    note: (main.querySelector('.data-note') || {}).textContent
      ? main.querySelector('.data-note').textContent.replace(/\\s+/g, ' ').trim() : '',
    pager: (main.querySelector('.pager-info') || {}).textContent || ''
  };
`;

try {
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.account && !x.locked; })[0];
    App.store.login(u.account, u.password);
    return 1;`);
  await sleep(400);

  /* ================================================== A. 审核规则模块 */
  console.log('\n【A】系统管理 · 审核规则（对齐参照系统）');
  const navPlace = await page.evaluate(`
    var navs = Array.prototype.slice.call(document.querySelectorAll('.nav-item, .nav-child, a'));
    var labels = navs.map(function (n) { return (n.textContent || '').trim(); });
    var sys = App.mock.NAV.filter(function (n) { return n.id === 'system'; })[0];
    var kids = sys.children.map(function (c) { return c.label; });
    return { kids: kids, idxArchive: kids.indexOf('归档设置'), idxRules: kids.indexOf('审核规则'),
      route: sys.children.filter(function (c) { return c.id === 'system-audit-rules'; })[0].route,
      source: App.mock.AUDIT_SOURCE };`);
  check('「审核规则」挂在系统管理下、紧跟「归档设置」之后',
    navPlace.idxRules === navPlace.idxArchive + 1 && navPlace.route === '#/system/audit-rules',
    navPlace.kids.join(' → '));

  await page.evaluate("location.hash = '#/system/audit-rules'; return 1;");
  await sleep(500);
  let ar = await page.evaluate(AR);
  const seed = await page.evaluate("return App.mock.AUDIT_RULES.length;");
  check('列表与参照系统同列：序号 / 敏感内容标题 / 敏感内容 / 敏感类型 / 控制标志 / 创建时间 / 是否启用（+ 操作）',
    ar.cols.join() === '序号,敏感内容标题,敏感内容,敏感类型,控制标志,创建时间,是否启用,操作',
    ar.cols.join(' / '));
  check('数据用参照系统的 20 条敏感内容（' + seed + ' 条），首行标题/类型/控制标志/时间一致',
    ar.rows === Math.min(seed, 20) && seed === 20 &&
    ar.first.title === '通用敏感内容' && ar.first.type === '通用敏感规则' &&
    ar.first.flag === '受控' && ar.first.date === '2026-04-28 08:54:06' && ar.first.enable === '是',
    ar.first.title + '｜' + ar.first.type + '｜' + ar.first.flag + '｜' + ar.first.date);
  check('工具栏是参照系统的「添加 / 修改 / 删除」+ 搜索，并有三组筛选',
    ar.toolbarBtns.indexOf('添加') >= 0 && ar.toolbarBtns.indexOf('修改') >= 0 &&
    ar.toolbarBtns.indexOf('删除') >= 0 && ar.filters.length === 3,
    ar.toolbarBtns.join('、') + '；筛选下拉 ' + ar.filters.length + ' 个（' +
    ar.filters.join('/') + ' 项）');
  check('页面标注了数据来源（参照系统与抓取时间）',
    ar.note.indexOf(navPlace.source.system) >= 0 && ar.note.indexOf(navPlace.source.fetchedAt) >= 0 &&
    ar.note.indexOf('审核校定') >= 0,
    ar.note.slice(0, 58));

  /* 查看：完整敏感内容 */
  await page.evaluate(`document.querySelector('[data-action="rule:view"]').click(); return 1;`);
  await sleep(400);
  const view = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { head: m.querySelector('.modal-head').textContent.trim(),
      clauses: m.querySelectorAll('.ar-clauses li').length,
      inputs: m.querySelectorAll('input, textarea').length,
      text: m.querySelector('.modal-body').textContent.replace(/\\s+/g, ' ').trim() } : null;`);
  check('点「查看」：弹出完整敏感内容（按（一）（二）分条列出，只读）',
    !!view && view.head.indexOf('查看审核规则') === 0 && view.clauses >= 15 && view.inputs === 0 &&
    view.text.indexOf('涉及我党和国家重大问题') >= 0,
    view ? (view.clauses + ' 条敏感内容；0 个输入控件') : 'ERR 没有弹窗');
  await click('.modal [data-action="ui:ok"]');

  /* 新增：字段与校验 */
  await click('[data-action="rule:new"]');
  let form = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { head: m.querySelector('.modal-head').textContent.trim(),
      labels: Array.prototype.map.call(m.querySelectorAll('.rec-label'), function (l) {
        return l.textContent.trim(); }),
      hasSwitch: !!m.querySelector('#ar-f-enable'),
      typeOptions: m.querySelectorAll('#ar-f-type option').length,
      flagOptions: Array.prototype.map.call(m.querySelectorAll('#ar-f-flag option'),
        function (o) { return o.textContent.trim(); }) } : null;`);
  const typeCount = await page.evaluate("return App.store.auditRuleTypes().length;");
  const labelSeq = form ? form.labels.map(function (l) { return l.replace(/^[*\s]+/, ''); }) : [];
  check('点「添加」：5 个字段与参照系统表单一致（标题* / 敏感内容* / 敏感类型* / 控制标志* / 是否启用）',
    !!form && form.head === '添加审核规则' &&
    labelSeq.join() === '敏感内容标题：,敏感内容：,敏感类型：,控制标志：,是否启用：' &&
    form.hasSwitch && form.typeOptions === typeCount + 1 &&
    form.flagOptions.join() === '受控,开放',
    form ? (labelSeq.join('／') + '｜类型 ' + form.typeOptions + ' 项（含占位，类型表 ' + typeCount +
      ' 项）｜控制标志 ' + form.flagOptions.join('/')) : 'ERR');

  await clearToasts();
  await click('.modal [data-action="ui:ok"]');
  const emptyTitle = await page.evaluate(`
    var e = document.querySelector('#ar-f-title-error');
    return { hidden: !e || e.hidden, text: e ? e.textContent.trim() : '' };`);
  check('标题为空：内联报错且弹窗不关（与归档设置同一套表单校验）',
    !emptyTitle.hidden && emptyTitle.text.indexOf('请填写敏感内容标题') >= 0,
    '内联报错：' + emptyTitle.text);

  await page.evaluate(`
    document.querySelector('#ar-f-title').value = '测试审核规则（套件）';
    document.querySelector('#ar-f-content').value = '（一）涉及套件专用敏感词的档案；';
    document.querySelector('#ar-f-type').value = '19';
    return 1;`);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  let added = await page.evaluate(`
    var r = App.store.auditRules().filter(function (x) { return x.title === '测试审核规则（套件）'; })[0];
    return r ? { id: r.id, type: r.typeName, flag: r.controlFlagTitle, enable: r.enable,
      first: App.store.auditRules()[0].title, total: App.store.auditRules().length } : null;`);
  check('填齐后保存：新规则入库、排在首行、类型与控制标志按所选写入',
    !!added && added.first === '测试审核规则（套件）' && added.type === '政治类' &&
    added.flag === '受控' && added.enable === true && added.total === seed + 1,
    added ? (added.id + '｜' + added.type + '｜' + added.flag + '｜共 ' + added.total + ' 条') : 'ERR 未入库');

  /* 筛选 + 修改 + 删除 */
  await page.evaluate(`
    var sel = document.querySelector('#ar-type');
    sel.value = '19';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(350);
  const filtered = await page.evaluate(`
    var rows = document.querySelectorAll('tbody tr');
    var types = Array.prototype.map.call(rows, function (tr) { return tr.querySelectorAll('td')[4].textContent.trim(); });
    return { rows: rows.length, types: types, expect: App.store.auditRules().filter(function (r) { return r.typeId === 19; }).length };`);
  check('按敏感类型筛选：只剩该类型的规则',
    filtered.rows === filtered.expect && filtered.types.every(function (t) { return t === '政治类'; }),
    '政治类 ' + filtered.rows + ' 条（期望 ' + filtered.expect + '）');

  await page.evaluate(`
    var tr = Array.prototype.filter.call(document.querySelectorAll('tbody tr'), function (t) {
      return t.textContent.indexOf('测试审核规则（套件）') >= 0; })[0];
    tr.querySelector('[data-action="rule:edit"]').click();
    return 1;`);
  await sleep(400);
  const editView = await page.evaluate(`
    var m = document.querySelector('.modal');
    return { head: m.querySelector('.modal-head').textContent.trim(),
      title: m.querySelector('#ar-f-title').value,
      content: m.querySelector('#ar-f-content').value,
      type: m.querySelector('#ar-f-type').value };`);
  check('点行内「修改」：弹窗带回这条规则的标题 / 敏感内容 / 类型',
    editView.head === '修改审核规则' && editView.title === '测试审核规则（套件）' &&
    editView.content.indexOf('套件专用敏感词') >= 0 && editView.type === '19',
    editView.head + '｜' + editView.title);
  await page.evaluate(`
    document.querySelector('#ar-f-title').value = '测试审核规则（已改）';
    document.querySelector('#ar-f-enable').checked = false;
    return 1;`);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  const edited = await page.evaluate(`
    var r = App.store.auditRules().filter(function (x) { return x.title === '测试审核规则（已改）'; })[0];
    return r ? { enable: r.enable, modify: !!r.modifyDate } : null;`);
  check('保存修改：标题与启用状态落库（停用后不再参与审核判定）',
    !!edited && edited.enable === false && edited.modify,
    edited ? ('启用=' + edited.enable + '；有修改时间=' + edited.modify) : 'ERR');

  await page.evaluate(`var b = document.querySelector('[data-action="rule:reset"]'); if (b) b.click(); return 1;`);
  await sleep(300);
  await page.evaluate(`
    var tr = Array.prototype.filter.call(document.querySelectorAll('tbody tr'), function (t) {
      return t.textContent.indexOf('测试审核规则（已改）') >= 0; })[0];
    tr.querySelector('input[data-change="rule:select"]').checked = true;
    tr.querySelector('input[data-change="rule:select"]').dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(300);
  await click('[data-action="rule:delete"]');
  const delDlg = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? m.querySelector('.modal-head').textContent.trim() : '';`);
  check('删除前二次确认（写明只影响政治性审核：合规性审核不依赖规则）',
    delDlg.indexOf('删除选中的 1 条审核规则') === 0, delDlg);
  await click('.modal [data-action="ui:ok"]');
  await sleep(400);
  const afterDel = await page.evaluate(`
    return { total: App.store.auditRules().length,
      gone: !App.store.auditRules().some(function (r) { return r.title === '测试审核规则（已改）'; }) };`);
  check('删除后规则数回到种子基数', afterDel.total === seed && afterDel.gone,
    '剩 ' + afterDel.total + ' 条（种子 ' + seed + ' 条）');
  const shotRules = await page.shot(SHOT_DIR + 'audit-rules.png');

  /* ================================================== B. 第 4 阶段三类审核 */
  console.log('\n【B】第 4 阶段「审核校定」：三类审核分列');
  await openReview();
  let rv = await page.evaluate(RV);
  check('三类审核**不再各自单独审核**：卡片里没有审核按钮（只有展开 / 收起），只有顶部「一键全部审核」一个入口',
    rv.kindRunBtns === 0 && rv.runAllBtns === 1 &&
    rv.kindHeadBtns.every(function (b) { return b === '展开' || b === '收起'; }),
    '卡片内审核按钮 ' + rv.kindRunBtns + ' 个；顶部一键按钮 ' + rv.runAllBtns + ' 个；卡片头部按钮：' +
    (rv.kindHeadBtns.join('、') || '（无）'));
  check('点第 4 阶段：进入「审核校定」，三类审核各一张卡片，且**一打开就有默认审核结果**（不再显示"尚未审核"）',
    rv.stage === 4 && rv.cards.length === 3 &&
    rv.cards.join() === '政治性审核,专业性审核,合规性审核' &&
    rv.badges.filter(function (b) { return b.indexOf('未审核') > 0; }).length === 0 &&
    rv.badges.filter(function (b) { return b.indexOf('待处理') > 0; }).length === 3,
    rv.cards.join(' / ') + '；状态：' + rv.badges.join('，'));

  /* 默认审核结果**写在代码里**（mock.AUDIT_RESULTS）：不用先点一键审核，进来就有；
     这里只读页面，不点任何按钮 */
  rv = await page.evaluate(RV);
  check('默认审核结果：三类命中项都已列出，顶部汇总按状态显示（未校定 / 已校定 / 已忽略），并标出审核人 / 时间',
    rv.political.items >= 2 && rv.professional.items >= 3 && rv.compliance.items >= 3 &&
    rv.ops.indexOf('共命中') >= 0 && rv.ops.indexOf('未校定') >= 0 &&
    rv.ops.indexOf('已校定') >= 0 && rv.ops.indexOf('已忽略') >= 0 &&
    rv.runInfo.length === 3 && rv.runInfo.join(' ').indexOf('本地模拟 AI') >= 0 &&
    rv.runInfo.join(' ').indexOf('默认审核结果（种子数据）') >= 0 &&
    rv.runInfo.join(' ').indexOf('李文华') >= 0,
    rv.ops + '｜政治性 ' + rv.political.items + ' 项 / 专业性 ' + rv.professional.items +
    ' 项 / 合规性 ' + rv.compliance.items + ' 项');

  check('主页面「只显示状态」：命中项里有状态标签、没有「标注已修改 / 忽略」按钮',
    (await page.evaluate(`
      var m = document.getElementById('main');
      var tags = Array.prototype.map.call(m.querySelectorAll('.rv-item .tag'), function (t) {
        return t.textContent.trim(); });
      var uniq = {}; tags.forEach(function (t) { uniq[t] = (uniq[t] || 0) + 1; });
      return { uniq: uniq, itemButtons: m.querySelectorAll('.rv-item button').length,
        statusOptions: Array.prototype.map.call(m.querySelectorAll('#rv-status option'),
          function (o) { return o.textContent.trim(); }) };`)).itemButtons === 0,
    '状态标签 ' + JSON.stringify(await page.evaluate(`
      var m = document.getElementById('main');
      var tags = Array.prototype.map.call(m.querySelectorAll('.rv-item .tag'), function (t) { return t.textContent.trim(); });
      var uniq = {}; tags.forEach(function (t) { uniq[t] = (uniq[t] || 0) + 1; }); return uniq;`)) +
    '；命中项内按钮 0 个');
  const statusFilter = await page.evaluate(`
    var m = document.getElementById('main');
    return { options: Array.prototype.map.call(m.querySelectorAll('#rv-status option'), function (o) {
      return o.textContent.trim(); }) };`);
  check('主页面顶部有「已校定 / 未校定 / 已忽略」状态筛选',
    statusFilter.options.join() === '全部状态,未校定,已校定,已忽略',
    statusFilter.options.join(' / '));
  await page.evaluate(`
    var sel = document.querySelector('#rv-status');
    sel.value = 'fixed';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(400);
  const filteredFixed = await page.evaluate(`
    var m = document.getElementById('main');
    return { items: m.querySelectorAll('.rv-item').length,
      tags: Array.prototype.map.call(m.querySelectorAll('.rv-item .tag'), function (t) { return t.textContent.trim(); }) };`);
  await page.evaluate(`
    var sel = document.querySelector('#rv-status');
    sel.value = 'open';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(400);
  const filteredOpen = await page.evaluate("return document.querySelectorAll('#main .rv-item').length;");
  check('状态筛选生效：选「已校定」筛出 0 项（还没校定过），选「未校定」显示全部命中项',
    filteredFixed.items === 0 && filteredOpen >= 9,
    '已校定 ' + filteredFixed.items + ' 项 / 未校定 ' + filteredOpen + ' 项');
  await page.evaluate(`
    var sel = document.querySelector('#rv-status');
    sel.value = '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;`);
  await sleep(350);

  /* 政治性审核：规则标题 + 命中内容 */
  check('政治性审核：每条都给出「规则标题 + 敏感内容条款 + 编研成果里的命中内容（高亮）」',
    rv.political.ruleLines.length === rv.political.items &&
    rv.political.ruleLines.every(function (l) {
      return l.indexOf('命中规则：') >= 0 && l.indexOf('敏感内容') > 0;
    }) &&
    rv.political.contexts.length + rv.political.fixedInfos === rv.political.items &&
    rv.political.marks.length >= 2 && rv.political.actions === 0,
    '命中词：' + rv.political.marks.join('、') + '｜例：' +
    (rv.political.ruleLines[0] || '').slice(0, 66));
  check('政治性审核命中项来自审核规则（种子里的演示章节写了敏感内容）',
    rv.political.ruleLines.some(function (l) { return l.indexOf('政治类档案敏感内容') >= 0; }) &&
    rv.political.marks.indexOf('重大政治事件') >= 0,
    rv.political.marks.join('、'));

  /* 专业性审核：错别字 / 纪年 / 规范表述 */
  check('专业性审核：命中错别字、纪年换算与规范表述三类，且每条给出具体说明',
    rv.professional.titles.indexOf('错别字') >= 0 &&
    rv.professional.titles.indexOf('民国纪年与公元纪年不一致') >= 0 &&
    rv.professional.titles.indexOf('编研规范表述') >= 0 &&
    rv.professional.details.some(function (d) { return d.indexOf('「复盖」应为「覆盖」') >= 0; }) &&
    rv.professional.details.some(function (d) { return d.indexOf('民国 25 年应为公元 1936 年') >= 0; }),
    rv.professional.titles.join('、') + '｜' + rv.professional.details[0]);
  check('专业性审核不依赖审核规则：主面板只列问题（AI 自动修改按钮在校定界面里）',
    rv.professional.autofix === 0 && rv.professional.titles.length >= 3 &&
    rv.professional.details.some(function (d) { return d.indexOf('「复盖」应为「覆盖」') >= 0; }),
    '主面板自动修改按钮 ' + rv.professional.autofix + ' 个（应 0）；专业性问题 ' +
    rv.professional.titles.length + ' 类');

  /* 合规性审核 */
  check('合规性审核：不依赖审核规则（命中项里没有"命中规则"行，口径写明由模型判定）',
    rv.compliance.ruleLines.length === 0 &&
    rv.compliance.basis.indexOf('不依赖审核规则') >= 0 &&
    rv.compliance.basis.indexOf('知识产权风险') > 0 &&
    rv.compliance.basis.indexOf('个人隐私及个人信息') > 0,
    '规则行 ' + rv.compliance.ruleLines.length + ' 条｜' + rv.compliance.basis.slice(0, 60));
  check('合规性审核：个人隐私由模型识别（身份证号 / 手机号等），并给出脱敏建议（主面板不给按钮，与专业性一致）',
    rv.compliance.titles.filter(function (t) { return t.indexOf('（模型识别）') > 0; }).length >= 2 &&
    rv.compliance.titles.join(' ').indexOf('身份证号') >= 0 &&
    rv.compliance.titles.join(' ').indexOf('手机号') >= 0 &&
    rv.compliance.details.join(' ').indexOf('建议脱敏后再公开') >= 0 &&
    rv.compliance.autofix === 0,
    rv.compliance.titles.join('、') + '｜' + (rv.compliance.details[0] || '').slice(0, 40));
  const shotReview = await page.shot(SHOT_DIR + 'review-stage.png', { full: true });

  /* ================================================== C. 修改片段 + AI 自动修改 */
  console.log('\n【C】修改内容片段 / 错别字 AI 自动修改');
  const before = await page.evaluate(`
    return { text: App.store.chapterOf('${TASK}', '${DEMO_CHAPTER}').text,
      words: App.store.wordCount(App.store.chapterOf('${TASK}', '${DEMO_CHAPTER}').text),
      items: App.store.auditSummary('${TASK}').total, fixes: App.store.auditSummary('${TASK}').fixes };`);

  /* ① AI 自动修改在校定界面里做（主面板只显示状态）——放到 ②-b 之后验证 */
  /* ② 面板上不再有「修改片段」；「校定内容」在「一键全部审核」右侧 */
  const opsBtns = await page.evaluate(`
    var m = document.getElementById('main');
    var ops = m.querySelector('.review-ops-main');
    var list = Array.prototype.map.call(ops.querySelectorAll('button'), function (b) {
      return b.textContent.trim(); });
    var ai = ops.querySelector('[data-action="audit:run-all"]');
    var cal = ops.querySelector('[data-action="audit:calibrate"]');
    return { list: list,
      rightOfAi: !!(ai && cal) && cal.getBoundingClientRect().left >= ai.getBoundingClientRect().right - 1,
      sameRow: !!(ai && cal) &&
        Math.abs((cal.getBoundingClientRect().top + cal.getBoundingClientRect().bottom) / 2 -
                 (ai.getBoundingClientRect().top + ai.getBoundingClientRect().bottom) / 2) < 2,
      editBtns: m.querySelectorAll('[data-action="audit:edit"]').length,
      hasEditText: m.textContent.indexOf('修改片段') >= 0 };`);
  check('审核结果里不再有「修改片段」按钮（评审要求去掉）',
    opsBtns.editBtns === 0 && !opsBtns.hasEditText,
    '页面里 rv:edit 按钮 ' + opsBtns.editBtns + ' 个；出现「修改片段」字样=' + opsBtns.hasEditText);
  check('「校定内容」在「一键全部审核」右侧、同一行',
    opsBtns.list.join() === '一键全部审核,校定内容' && opsBtns.rightOfAi && opsBtns.sameRow,
    opsBtns.list.join(' | '));

  /* ②-b 打开全屏校定界面：三栏 20 / 40 / 40 */
  await click('[data-action="audit:calibrate"]');
  await sleep(600);
  let cal = await page.evaluate(`
    var s = document.getElementById('calibrate-screen');
    if (!s) return { open: false };
    var W = window.innerWidth, H = window.innerHeight, r = s.getBoundingClientRect();
    function px(el) { return el ? Math.round(el.getBoundingClientRect().width) : 0; }
    return { open: true, w: Math.round(r.width), h: Math.round(r.height), vw: W, vh: H,
      nav: Math.round(px(s.querySelector('.cal-nav')) / W * 100),
      mid: Math.round(px(s.querySelector('.cal-preview')) / W * 100),
      right: Math.round(px(s.querySelector('.cal-results')) / W * 100),
      groups: Array.prototype.map.call(s.querySelectorAll('.cal-group-title'), function (g) {
        return g.textContent.trim(); }),
      midTitle: (s.querySelector('.cal-preview .cp-col-head') || {}).textContent
        ? s.querySelector('.cal-preview .cp-col-head').textContent.replace(/\s+/g, ' ').trim() : '',
      midHeads: s.querySelectorAll('.cal-preview .cp-col-head').length,
      segs: s.querySelectorAll('.cal-seg-body').length,
      editBtns: s.querySelectorAll('[data-action="cal:mode"]').length,
      statusOptions: Array.prototype.map.call(s.querySelectorAll('#cal-status option'), function (o) {
        return o.textContent.trim(); }),
      scroll: (function () {
        function info(el) {
          if (!el) return null;
          var before = el.scrollTop;
          el.scrollTop = 9999;
          var after = el.scrollTop;
          el.scrollTop = before;
          return { canScroll: after > 0, scrollH: el.scrollHeight, clientH: el.clientHeight,
            overflowY: getComputedStyle(el).overflowY };
        }
        return { right: info(document.getElementById('cal-right')),
          left: info(document.getElementById('cal-left')),
          wrapGone: !document.getElementById('cal-right-wrap'),
          sections: s.querySelectorAll('.cal-results').length };
      })(),
      items: s.querySelectorAll('.cal-item').length,
      pages: (s.querySelector('.cp-progress') || {}).textContent.replace(/\s+/g, ' ').trim(),
      pageFoot: (s.querySelector('.cal-page-foot') || {}).textContent.replace(/\s+/g, ' ').trim(),
      navBadges: Array.prototype.map.call(s.querySelectorAll('.cal-badge'), function (b) {
        return b.textContent.trim(); }) };`);
  check('点「校定内容」：浏览器内部全屏打开（铺满视口）',
    cal.open && cal.w === cal.vw && cal.h === cal.vh,
    cal.open ? (cal.w + '×' + cal.h + '（视口 ' + cal.vw + '×' + cal.vh + '）') : 'ERR 没打开');
  check('三栏：左 大纲导航 20% ｜ 中 编研成果校定 60% ｜ 右 审核结果命中项 20%',
    cal.nav === 20 && cal.mid === 60 && cal.right === 20,
    cal.nav + '% / ' + cal.mid + '% / ' + cal.right + '%');
  check('右栏命中项区域能垂直滚动（列高固定、内容溢出滚动），且没有多余的外包容器',
    cal.scroll.right && cal.scroll.right.overflowY === 'auto' &&
    cal.scroll.right.canScroll && cal.scroll.wrapGone && cal.scroll.sections === 1,
    '右栏 scrollHeight ' + cal.scroll.right.scrollH + ' > clientHeight ' + cal.scroll.right.clientH +
    '，可滚动=' + cal.scroll.right.canScroll + '；外包容器已移除=' + cal.scroll.wrapGone);
  check('中栏标题行只有一个（不再重复显示）',
    cal.midHeads === 1, '中栏标题行 ' + cal.midHeads + ' 条：' + cal.midTitle);
  check('右侧是三类审核命中项，左侧大纲带每章命中数徽标，中栏是分页的成果预览',
    cal.groups.join() === '政治性审核,专业性审核,合规性审核' && cal.items >= 9 &&
    cal.navBadges.length >= 1 && cal.pageFoot.indexOf('第 1 页') === 0,
    '分组 ' + cal.groups.join('/') + '；命中项 ' + cal.items + ' 个；' + cal.pageFoot);

  /* ②-b2 顶部「预览 / 保存」在「退出校定」左侧 */
  const headBtns = await page.evaluate(`
    var h = document.querySelector('.cal-screen .cp-header');
    function L(sel) { var b = h.querySelector(sel); return b ? Math.round(b.getBoundingClientRect().left) : -1; }
    function T(sel) { var b = h.querySelector(sel); return b ? Math.round(b.getBoundingClientRect().top) : -1; }
    return { preview: L('[data-action="cal:preview"]'), save: L('[data-action="cal:save"]'),
      close: L('[data-action="cal:close"]'),
      row: { preview: T('[data-action="cal:preview"]'), save: T('[data-action="cal:save"]'),
        close: T('[data-action="cal:close"]') },
      labels: Array.prototype.map.call(h.querySelectorAll('button'), function (b) { return b.textContent.trim(); }) };`);
  check('顶部有「预览」「保存」，且排在「退出校定」左侧（同一行）',
    headBtns.preview > 0 && headBtns.save > 0 && headBtns.close > 0 &&
    headBtns.preview < headBtns.save && headBtns.save < headBtns.close &&
    headBtns.row.preview === headBtns.row.save && headBtns.row.save === headBtns.row.close,
    '按钮从左到右：' + headBtns.labels.join(' | ') + '（预览 ' + headBtns.preview +
    ' < 保存 ' + headBtns.save + ' < 退出 ' + headBtns.close + '）');

  /* ②-b3 保存：把"还在输入框里、尚未失焦"的改动立刻落盘 */
  const pending = await page.evaluate(`
    var segs = Array.prototype.slice.call(document.querySelectorAll('.cal-seg-body'));
    var seg = segs.filter(function (x) { return x.innerText.length > 20; })[0] || segs[0];
    var chapterId = seg.getAttribute('data-chapter');
    seg.focus();
    seg.innerText = seg.innerText.replace(/^(.{4})/, '$1［校定稿］');
    seg.dispatchEvent(new Event('input', { bubbles: true }));      /* 故意不失焦 */
    return { chapterId: chapterId,
      storedBefore: App.store.chapterOf('${TASK}', chapterId).text.indexOf('［校定稿］') >= 0 };
  `);
  check('编辑后尚未失焦时：改动还只在输入框里（还没落库）',
    pending.storedBefore === false, '落库=' + pending.storedBefore);
  /* 用"程序化点击"（不夺焦）来验证这颗按钮的价值：不等失焦也能存 */
  await page.evaluate(`document.querySelector('[data-action="cal:save"]').click(); return 1;`);
  await sleep(500);
  const saveCheck = await page.evaluate(`
    var t = App.store.chapterOf('${TASK}', '${pending.chapterId}').text;
    return { saved: t.indexOf('［校定稿］') >= 0,
      toast: (function () { var l = document.querySelectorAll('.toast');
        return l.length ? l[l.length - 1].textContent.trim() : ''; })() };`);
  check('点「保存」：不等失焦也把中栏改动落盘（提示"已保存正文修改"）',
    saveCheck.saved && saveCheck.toast.indexOf('已保存正文修改') >= 0,
    saveCheck.toast);

  /* ②-b4 预览：只读预览稿 */
  await click('[data-action="cal:preview"]');
  await sleep(500);
  const pvCal = await page.evaluate(`
    var m = document.querySelector('.modal');
    return m ? { title: m.querySelector('.modal-head').textContent.trim(),
      chapters: m.querySelectorAll('.pv-ch').length,
      inputs: m.querySelectorAll('input, textarea, select').length,
      buttons: Array.prototype.map.call(m.querySelectorAll('.modal-foot button'), function (b) {
        return b.textContent.trim(); }),
      sub: (m.querySelector('.pv-doc-sub') || {}).textContent.replace(/\s+/g, ' ').trim() } : null;`);
  check('点「预览」：弹出只读预览稿（按大纲顺序、无输入控件、只有「关闭」）',
    !!pvCal && pvCal.title.indexOf('预览 ·') === 0 && pvCal.chapters === 21 &&
    pvCal.inputs === 0 && pvCal.buttons.join() === '关闭' &&
    pvCal.sub.indexOf('未校定') >= 0 && pvCal.sub.indexOf('已校定') >= 0,
    pvCal ? (pvCal.chapters + ' 章；' + pvCal.sub) : 'ERR');
  await click('.modal [data-action="ui:ok"]');
  await sleep(300);

  /* ②-c 点一个"不在当前页"的命中项 → 中栏跳到该页并只标黄该处 */
  const target = await page.evaluate(`
    var d = App.reviewCalibrate.doc('${TASK}');
    var items = [];
    ['political', 'professional', 'compliance'].forEach(function (k) {
      (App.store.auditItems('${TASK}', k) || []).forEach(function (it) {
        if (it.status !== 'open') return;
        var base = d.chapterStart[it.chapterId];
        if (base == null) return;
        var off = base + it.start;
        items.push({ key: k + ':' + it.id, text: it.text,
          page: Math.floor(off / App.reviewCalibrate.PAGE_SIZE) + 1 });
      });
    });
    /* 故意挑"不在第 1 页"的那一处：演示稿里第 2 页本来就有多处命中，
       正好验证"点谁只标黄谁"（评审口径：只标黄当前定位的那一处） */
    var far = items.filter(function (x) { return x.page > 1; })[0] || items[items.length - 1];
    return far;`);
  await page.evaluate(`
    var el = document.querySelector('.cal-item[data-id="' + ${JSON.stringify('')} + '"]');
    return 1;`);
  await page.evaluate(`
    var key = ${JSON.stringify('')};
    return 1;`);
  await page.evaluate(`
    var items = Array.prototype.slice.call(document.querySelectorAll('.cal-item'));
    var hit = items.filter(function (it) {
      return it.getAttribute('data-kind') + ':' + it.getAttribute('data-id') === ${JSON.stringify(target.key)};
    })[0];
    hit.click();
    return 1;`);
  await sleep(500);
  cal = await page.evaluate(`
    var s = document.getElementById('calibrate-screen');
    var st = App.reviewCalibrate.state();
    var marks = Array.prototype.slice.call(s.querySelectorAll('.cal-mark'));
    var active = s.querySelector('.cal-mark-active');
    return { page: st.page, chapterId: st.chapterId, hitKey: st.hitKey,
      currentPageId: 'cal-page-' + st.page,
      pageEls: s.querySelectorAll('.cal-page').length,
      markCount: marks.length,
      activeText: active ? active.textContent : '',
      activeParentPage: active ? (active.closest('.cal-page') || {}).id : '',
      activeItem: !!s.querySelector('.cal-item-active'),
      foot: (s.querySelector('.cal-page-foot') || {}).textContent.replace(/\s+/g, ' ').trim() };`);
  check('点命中项：中栏**跳到命中内容所在页**，并把该处标黄（只标黄这一处）',
    String(cal.page) === String(target.page) && cal.currentPageId === 'cal-page-' + target.page &&
    cal.activeText === target.text && cal.activeParentPage === cal.currentPageId &&
    cal.markCount === 1 && cal.activeItem,
    '第 ' + cal.page + ' 页标黄「' + cal.activeText + '」（' + cal.foot.slice(0, 12) + '）');

  /* ②-d 中栏「编研成果校定」：正文**直接可编辑**（没有"编辑本章"按钮） */
  const midSnap = await page.evaluate(`
    var s = document.getElementById('calibrate-screen');
    var head = s.querySelector('.cal-preview .cp-col-head');
    return { title: head ? head.textContent.replace(/\s+/g, ' ').trim() : '',
      heads: s.querySelectorAll('.cal-preview .cp-col-head').length,
      segs: s.querySelectorAll('.cal-seg-body').length,
      contentEditable: s.querySelectorAll('.cal-seg-body[contenteditable="true"]').length,
      editBtns: s.querySelectorAll('[data-action="cal:mode"]').length,
      statusOptions: Array.prototype.map.call(s.querySelectorAll('#cal-status option'), function (o) {
        return o.textContent.trim(); }) };`);
  check('中栏是「编研成果校定」，正文分段可直接编辑（无「编辑本章」按钮），右栏带状态筛选',
    midSnap.title.indexOf('编研成果校定') === 0 && midSnap.segs >= 1 &&
    midSnap.contentEditable === midSnap.segs && midSnap.editBtns === 0 &&
    midSnap.statusOptions.join() === '全部状态,未校定,已校定,已忽略',
    '中栏「' + midSnap.title.slice(0, 12) + '」可编辑段落 ' + midSnap.segs + ' 块；' +
    '编辑类按钮 ' + midSnap.editBtns + ' 个；右栏筛选 ' + midSnap.statusOptions.join('/'));

  const segBefore = await page.evaluate(`
    var st = App.reviewCalibrate.state();
    return { chapterId: st.chapterId,
      text: App.store.chapterOf('${TASK}', st.chapterId).text };`);
  const segPick = await page.evaluate(`
    /* 目标文字在第 3 章，可能不在当前页 —— 先保证中栏翻到含它的那一页 */
    var d = App.reviewCalibrate.doc('${TASK}');
    var st = App.reviewCalibrate.state();
    var it = (App.store.auditItems('${TASK}', 'professional') || []).filter(function (x) {
      return x.text === '帐目'; })[0];
    if (it) {
      var base = d.chapterStart[it.chapterId];
      var page = Math.floor((base + it.start) / App.reviewCalibrate.PAGE_SIZE) + 1;
      var items = Array.prototype.slice.call(document.querySelectorAll('.cal-item'));
      var hit = items.filter(function (x) {
        return x.getAttribute('data-kind') + ':' + x.getAttribute('data-id') ===
          'professional:' + it.id; })[0];
      if (hit) hit.click();
      return { page: page, ok: true };
    }
    return { ok: false };`);
  await sleep(500);
  const segEdited = await page.evaluate(`
    var segs = Array.prototype.slice.call(document.querySelectorAll('.cal-seg-body'));
    var seg = segs.filter(function (x) { return x.innerText.indexOf('帐目清册') >= 0; })[0];
    if (!seg) return { found: false };
    seg.focus();
    seg.innerText = seg.innerText.replace('帐目清册', '账目清册');
    seg.dispatchEvent(new Event('input', { bubbles: true }));
    seg.blur();
    return { found: true };`);
  await sleep(800);
  const segAfter = await page.evaluate(`
    var st = App.reviewCalibrate.state();
    var t = App.store.chapterOf('${TASK}', st.chapterId).text;
    return { text: t, fixed: t.indexOf('帐目') < 0 && t.indexOf('账目清册') >= 0,
      toast: (function () { var l = document.querySelectorAll('.toast');
        return l.length ? l[l.length - 1].textContent.trim() : ''; })() };`);
  check('直接改中栏正文：失焦即保存到编研成果（不需要先点"编辑本章"）',
    segPick.ok && segEdited.found && segAfter.fixed &&
    segBefore.text.indexOf('帐目清册') >= 0 && segAfter.toast.indexOf('已保存正文修改') >= 0,
    segAfter.toast + '（定位第 ' + segPick.page + ' 页的段落块编辑）');

  /* ②-d2 AI 自动修改（在校定界面里）：改完**即为已校定**，不需要再手动标注 */
  const aiFixed = await page.evaluate(`
    var items = Array.prototype.slice.call(document.querySelectorAll('.cal-item'));
    var hit = items.filter(function (it) {
      return it.textContent.indexOf('复盖') >= 0 &&
        it.querySelector('[data-action="cal:autofix"]'); })[0];
    if (!hit) return { found: false };
    hit.querySelector('[data-action="cal:autofix"]').click();
    return { found: true };`);
  await sleep(700);
  const aiState = await page.evaluate(`
    var t = App.store.chapterOf('${TASK}', '${DEMO_CHAPTER}').text;
    var it = (App.store.auditItems('${TASK}', 'professional') || [])
      .filter(function (x) { return x.fix && x.fix.mode === 'ai'; })[0];
    var card = Array.prototype.filter.call(document.querySelectorAll('.cal-item'), function (c) {
      return c.textContent.indexOf('复盖') >= 0; })[0];
    return { text: t, fixed: t.indexOf('复盖') < 0 && t.indexOf('覆盖') >= 0,
      status: it ? it.status : '', mode: it ? it.fix.mode : '',
      cardText: card ? card.textContent.replace(/\s+/g, ' ').trim() : '',
      toast: (function () { var l = document.querySelectorAll('.toast');
        return l.length ? l[l.length - 1].textContent.trim() : ''; })() };`);
  check('校定界面点「AI 自动修改」：正文改掉、状态**直接是已校定**（不用手动标注）',
    aiFixed.found && aiState.fixed && aiState.status === 'fixed' && aiState.mode === 'ai' &&
    aiState.cardText.indexOf('已校定') >= 0 && aiState.cardText.indexOf('未校定') < 0,
    aiState.toast + '｜该项状态：' + aiState.status + '（' + aiState.mode + '）');

  /* ②-e 标注已修改 / 忽略（右栏） */
  const markTarget = await page.evaluate(`
    var items = Array.prototype.slice.call(document.querySelectorAll('.cal-item'));
    var open = items.filter(function (it) { return it.querySelector('[data-action="cal:mark"]'); });
    return open.length ? open[0].getAttribute('data-kind') + ':' + open[0].getAttribute('data-id') : '';`);
  await page.evaluate(`
    var items = Array.prototype.slice.call(document.querySelectorAll('.cal-item'));
    var hit = items.filter(function (it) {
      return it.getAttribute('data-kind') + ':' + it.getAttribute('data-id') === ${JSON.stringify(markTarget)};
    })[0];
    hit.querySelector('[data-action="cal:mark"]').click();
    return 1;`);
  await sleep(500);
  const marked = await page.evaluate(`
    var parts = ${JSON.stringify(markTarget)}.split(':');
    var kind = parts[0], id = parts.slice(1).join(':');
    var it = App.store.auditItems('${TASK}', kind).filter(function (x) { return x.id === id; })[0];
    var fixes = App.store.auditOf('${TASK}').fixes;
    return { status: it ? it.status : '', mode: it && it.fix ? it.fix.mode : '',
      note: it && it.fix ? it.fix.note : '', fixes: fixes.length, total: App.store.auditSummary('${TASK}').fixes };`);
  check('右栏「标注已修改」：该项标记为已修改并写入修改记录（正文未变则记为人工确认）',
    marked.status === 'fixed' && marked.mode === 'mark' && marked.fixes >= 1 &&
    (marked.note.indexOf('校定界面') >= 0 || marked.note.indexOf('人工确认') >= 0),
    '状态=' + marked.status + '；方式=' + marked.mode + '；说明=' + marked.note);
  const ignoreTarget = await page.evaluate(`
    var items = Array.prototype.slice.call(document.querySelectorAll('.cal-item'));
    var open = items.filter(function (it) { return it.querySelector('[data-action="cal:ignore"]'); });
    return open.length ? open[0].getAttribute('data-kind') + ':' + open[0].getAttribute('data-id') : '';`);
  await page.evaluate(`
    var items = Array.prototype.slice.call(document.querySelectorAll('.cal-item'));
    var hit = items.filter(function (it) {
      return it.getAttribute('data-kind') + ':' + it.getAttribute('data-id') === ${JSON.stringify(ignoreTarget)};
    })[0];
    hit.querySelector('[data-action="cal:ignore"]').click();
    return 1;`);
  await sleep(400);
  const ignoredCal = await page.evaluate(`
    var parts = ${JSON.stringify(ignoreTarget)}.split(':');
    var kind = parts[0], id = parts.slice(1).join(':');
    var it = App.store.auditItems('${TASK}', kind).filter(function (x) { return x.id === id; })[0];
    return { status: it ? it.status : '', open: App.store.auditSummary('${TASK}').open };`);
  check('右栏「忽略」：该项从待处理里去掉', ignoredCal.status === 'ignored',
    '状态=' + ignoredCal.status + '；剩余待处理 ' + ignoredCal.open + ' 项');
  const shotCal = await page.shot(SHOT_DIR + 'review-calibrate.png');

  /* ②-f 左栏点章节 → 跳到该章第一处命中 */
  const chapterJump = await page.evaluate(`
    var nodes = App.store.outlineOf('${TASK}').nodes;
    var withHits = nodes.filter(function (n) {
      return ['political', 'professional', 'compliance'].some(function (k) {
        return (App.store.auditItems('${TASK}', k) || []).some(function (it) { return it.chapterId === n.id; }); });
    });
    return withHits.length ? { id: withHits[0].id, title: withHits[0].title } : null;`);
  await page.evaluate(`
    var btn = document.querySelector('.cal-node, .cp-node[data-id="' + ${JSON.stringify(chapterJump.id)} + '"]');
    btn.click();
    return 1;`);
  await sleep(500);
  const afterChapter = await page.evaluate(`
    var st = App.reviewCalibrate.state();
    var active = document.querySelector('.cal-mark-active');
    return { chapterId: st.chapterId, page: st.page, hitKey: st.hitKey,
      activeText: active ? active.textContent : '',
      chapterOfHit: (st.hitKey || '').indexOf(':') > 0 }`);
  check('左栏点章节：中栏跳到该章第一处命中所在页并标黄',
    afterChapter.chapterId === chapterJump.id && !!afterChapter.activeText &&
    afterChapter.activeText.length > 0,
    '章节「' + chapterJump.title + '」→ 第 ' + afterChapter.page + ' 页标黄「' +
    afterChapter.activeText + '」');

  /* ②-g Esc 退出全屏 */
  await page.pressEscape();
  await sleep(400);
  const closed = await page.evaluate(`
    return { screen: !!document.getElementById('calibrate-screen'),
      app: !!document.querySelector('.shell') };`);
  check('Esc 退出校定界面，回到任务详情页', !closed.screen && closed.app,
    '校定屏已关闭=' + !closed.screen);

  /* ④ 重新审核：追加而不是覆盖（评审要求） */
  const beforeRerun = await page.evaluate(`
    var sum = App.store.auditSummary('${TASK}');
    var all = [];
    ['political', 'professional', 'compliance'].forEach(function (k) {
      (App.store.auditItems('${TASK}', k) || []).forEach(function (it) {
        all.push({ kind: k, status: it.status, text: it.text }); });
    });
    return { total: sum.total, open: sum.open, fixes: sum.fixes,
      fixedTexts: all.filter(function (x) { return x.status === 'fixed'; }).map(function (x) { return x.text; }) };`);
  /* 先把剩下的未处理项都忽略掉，才能重新审核（前面的 Esc 已退出校定界面，这里重新打开） */
  await page.evaluate("App.reviewCalibrate.open('" + TASK + "'); return 1;");
  await sleep(600);
  await page.evaluate(`
    var guard = 0;
    while (guard++ < 40) {
      var btn = document.querySelector('.cal-item [data-action="cal:ignore"]');
      if (!btn) break;
      btn.click();
    }
    return 1;`);
  await sleep(600);
  await page.evaluate("App.reviewCalibrate.close(); return 1;");
  await sleep(300);
  const cleared = await page.evaluate(`
    return { open: App.store.auditSummary('${TASK}').open, total: App.store.auditSummary('${TASK}').total };`);
  check('把未处理项全部忽略后：待处理归零（重新审核的前置条件满足）',
    cleared.open === 0 && cleared.total === beforeRerun.total,
    '待处理 ' + cleared.open + '；命中项总数 ' + cleared.total + '（不因忽略而减少）');

  /* 再点一键全部审核：这次应放行，并"追加"而不是覆盖 */
  await clearToasts();
  await click('[data-action="audit:run-all"]');
  await sleep(900);
  const rerunToast = await lastToast();
  const afterRerun = await page.evaluate(`
    var sum = App.store.auditSummary('${TASK}');
    var all = [];
    ['political', 'professional', 'compliance'].forEach(function (k) {
      (App.store.auditItems('${TASK}', k) || []).forEach(function (it) {
        all.push({ kind: k, status: it.status, text: it.text }); });
    });
    var info = Array.prototype.map.call(document.querySelectorAll('.rv-run-info'), function (x) {
      return x.textContent.replace(/\s+/g, ' ').trim(); }).join(' ');
    return { total: sum.total, open: sum.open,
      info: info, seeded: sum.kinds.political.seeded,
      ignored: all.filter(function (x) { return x.status === 'ignored'; }).length,
      fixedTexts: all.filter(function (x) { return x.status === 'fixed'; }).map(function (x) { return x.text; }) };`);
  check('处理完之后重跑：新发现 0 项时**已有结果原样保留**（总数不翻倍、已忽略仍是已忽略）',
    afterRerun.total === beforeRerun.total && afterRerun.ignored >= 1 &&
    rerunToast.indexOf('新发现 0 项') >= 0 && rerunToast.indexOf('保留') >= 0,
    '轻提示：' + rerunToast + '；命中项 ' + beforeRerun.total + ' → ' + afterRerun.total);
  check('用户自己重跑过之后：审核记录不再标成"默认审核结果"（改回"本次审核"，seeded 标记消失）',
    afterRerun.seeded === false && afterRerun.info.indexOf('本次审核：') >= 0 &&
    afterRerun.info.indexOf('默认审核结果') < 0,
    'seeded=' + afterRerun.seeded + '；' + afterRerun.info.slice(0, 60));

  /* 再制造一个新问题（模拟又写了新内容）→ 重跑应该**追加**进来 */
  await page.evaluate(`
    var t = App.store.chapterOf('${TASK}', '${DEMO_CHAPTER}').text;
    App.store.saveChapter('${TASK}', '${DEMO_CHAPTER}', t + '\\n\\n补充：各校报送的帐号信息已另行登记。', { silent: true });
    return 1;`);
  await clearToasts();
  await click('[data-action="audit:run-all"]');
  await sleep(900);
  const appendToast = await lastToast();
  const appended = await page.evaluate(`
    var sum = App.store.auditSummary('${TASK}');
    var typos = (App.store.auditItems('${TASK}', 'professional') || [])
      .filter(function (it) { return it.text === '帐号'; });
    return { total: sum.total, newItems: typos.length,
      newStatus: typos[0] ? typos[0].status : '',
      ignored: (App.store.auditItems('${TASK}', 'professional') || [])
        .filter(function (it) { return it.status === 'ignored'; }).length };`);
  check('再次审核发现新问题：**追加**到结果里（老结果与状态都还在）',
    appended.total === beforeRerun.total + 1 && appended.newItems === 1 &&
    appended.newStatus === 'open' && appendToast.indexOf('新发现 1 项') >= 0,
    '轻提示：' + appendToast + '；总数 ' + beforeRerun.total + ' → ' + appended.total);

  /* ⑤ 修改确实写进了第 3 阶段的编排正文 */
  const inEditor = await page.evaluate(`
    return { text: App.store.chapterOf('${TASK}', '${DEMO_CHAPTER}').text };`);
  check('修改落到「加工编排」的章节正文里（面板 AI 自动修改 + 校定界面编辑，改的是同一份正文）',
    inEditor.text.indexOf('覆盖全市各级各类学校') >= 0 &&
    inEditor.text.indexOf('账目清册') >= 0 &&
    inEditor.text.indexOf('复盖') < 0 && inEditor.text.indexOf('帐目') < 0,
    '演示章节正文前 34 字：「' + inEditor.text.slice(0, 34).replace(/\\n/g, ' ') + '」');

  /* ================================================== D. 回归与异常 */
  console.log('\n【D】回归与异常');
  /* ============ E. 回归：旧数据（旧种子版本 + 旧编排正文）必须被清掉并重播种 ============ */
  console.log('\n【E】旧数据回归：种子版本变化要清掉**全部**数据集');
  await page.evaluate(`
    /* 伪造"用户浏览器里存着上一版数据"：版本号写回上一版，compose 只留 n1（没有演示稿 n3） */
    localStorage.setItem('archive-proto-system:seed', '2026-09-26.1');
    localStorage.setItem('archive-proto-system:compose', JSON.stringify({
      'RW-2026-001': { taskId: 'RW-2026-001', chapters: { n1: { text: '旧版正文（没有演示问题）', savedAt: '', savedBy: '' } }, fixes: [] }
    }));
    localStorage.setItem('archive-proto-system:auditResults', JSON.stringify({
      'RW-2026-001': { runs: {}, fixes: [] } }));
    localStorage.setItem('archive-proto-system:auditRules', JSON.stringify([]));
    return 1;`);
  await page.goto(PAGE_URL);
  await sleep(1200);
  const reseed = await page.evaluate(`
    var rec = App.store.composeOf('${TASK}');
    return { version: localStorage.getItem('archive-proto-system:seed'),
      seededVersion: App.mock.SEED_VERSION,
      chapters: Object.keys(rec.chapters).sort().join(','),
      hasDemo: String((rec.chapters['${DEMO_CHAPTER}'] || {}).text || '').indexOf('复盖') >= 0,
      rules: App.store.auditRules().length,
      staleText: JSON.stringify(rec).indexOf('旧版正文') >= 0 };`);
  check('种子版本变化时：**新数据集（编排正文 / 审核规则 / 审核结果）也一起被清掉并重新播种**',
    reseed.version === reseed.seededVersion && reseed.chapters === 'n1,n2,n3' &&
    reseed.hasDemo && reseed.rules === seed && !reseed.staleText,
    '版本 ' + reseed.version + '；章节 ' + reseed.chapters + '；带演示问题=' + reseed.hasDemo +
    '；审核规则 ' + reseed.rules + ' 条；旧正文残留=' + reseed.staleText);

  /* 用重新播种后的数据，确认**默认审核结果**跟着种子一起重建（用户报过"三类都是未发现问题"） */
  await openReview();
  rv = await page.evaluate(RV);
  const rebuild = await page.evaluate(`
    var sum = App.store.auditSummary('${TASK}');
    return { total: sum.total, open: sum.open, fixes: sum.fixes,
      at: sum.kinds.political.at, by: sum.kinds.political.by,
      misses: App.store.auditSeedMisses() };`);
  check('重新播种后，三类审核**都能发现问题**（默认审核结果按种子重新生成，不是"未发现问题"）',
    rv.political.items > 0 && rv.professional.items > 0 && rv.compliance.items > 0 &&
    rebuild.total === 14 && rebuild.open === 14 && rebuild.fixes === 0 &&
    rebuild.at === '2026-05-16T10:05:00' && rebuild.by === '李文华' && rebuild.misses.length === 0,
    '政治性 ' + rv.political.items + ' 项 / 专业性 ' + rv.professional.items +
    ' 项 / 合规性 ' + rv.compliance.items + ' 项；审核记录 ' + rebuild.total + ' 项（' +
    rebuild.by + ' ' + rebuild.at + '）；种子里没认上的项 ' + rebuild.misses.length);

  /* 评审要求："这个数据不要丢失" —— 把浏览器里的审核结果删掉（换台机器 / 清了缓存），
     重新加载**仍然有默认审核结果**（因为这份数据写在代码里，不是只躺在 localStorage） */
  await page.evaluate("localStorage.removeItem('archive-proto-system:auditResults'); return 1;");
  await page.goto(PAGE_URL);
  await sleep(900);
  await openReview();
  const lost = await page.evaluate(`
    var sum = App.store.auditSummary('${TASK}');
    var d = JSON.parse(localStorage.getItem('archive-proto-system:auditResults') || '{}');
    var r = d['${TASK}'];
    return { total: sum.total, open: sum.open, misses: App.store.auditSeedMisses().length,
      stored: r ? Object.keys(r.runs).sort().join() + '|' + r.runs.political.items.length : '' };`);
  check('清掉浏览器里的审核结果后重新加载：默认审核结果**照样在**（写在代码里，不随本地数据丢）',
    lost.total === 14 && lost.open === 14 && lost.misses === 0 &&
    lost.stored === 'compliance,political,professional|2',
    '命中项 ' + lost.total + '（未校定 ' + lost.open + '）；重新落库=' + lost.stored);

  /* ================================================== C2. 第二个演示任务：乡村振兴 */
  console.log('\n【C2】演示任务「乡村振兴档案史料汇编（续编）」：三类审核都能查出问题');
  const xc = await page.evaluate(`
    var t = App.store.tasks().filter(function (x) { return x.topicName.indexOf('乡村振兴') >= 0; })[0];
    return { id: t.id, name: t.topicName, stage: t.stage, status: t.status,
      nodes: App.store.outlineOf(t.id).nodes.length,
      chapters: Object.keys(App.store.composeOf(t.id).chapters).length };`);
  check('演示任务停在第 4 阶段「审核校定」，且有大纲与正文（否则审核没东西可扫）',
    xc.stage === 4 && xc.status === 'IN_PROGRESS' && xc.nodes >= 10 && xc.chapters >= 10,
    xc.id + '｜' + xc.name + '｜第 ' + xc.stage + ' 阶段｜大纲 ' + xc.nodes + ' 条 / 正文 ' + xc.chapters + ' 章');

  await page.evaluate("location.hash = '#/task/" + xc.id + "'; return 1;");
  await sleep(500);
  const xcPanel = await page.evaluate(`
    var m = document.getElementById('main');
    return { stage: App.store.getTask('${xc.id}').stage,
      cards: Array.prototype.map.call(m.querySelectorAll('.rv-card'), function (c) {
        return c.querySelector('.card-head span').textContent.trim(); }),
      badges: Array.prototype.map.call(m.querySelectorAll('.review-ops-tags .tag'), function (t) {
        return t.textContent.trim(); }) };`);
  check('点进度条第 4 步：直接进入「审核校定」，三类卡片**一打开就带着默认审核结果**（不是"尚未审核"）',
    xcPanel.stage === 4 &&
    xcPanel.cards.slice(0, 3).join() === '政治性审核,专业性审核,合规性审核' &&
    xcPanel.cards.length === 4 &&        /* 三类 + 预置的"已校定"带来的修改记录卡 */
    xcPanel.badges.filter(function (b) { return b.indexOf('未审核') > 0; }).length === 0 &&
    xcPanel.badges.filter(function (b) { return b.indexOf('待处理') > 0; }).length === 3,
    xcPanel.cards.join(' / ') + '；' + xcPanel.badges.join('，'));

  /* 不点任何按钮：只读页面，验证默认审核结果（数据写在 mock.AUDIT_RESULTS 里） */
  const xcRun = await page.evaluate(`
    var m = document.getElementById('main');
    function n(key) { var c = m.querySelector('.rv-' + key); return c ? c.querySelectorAll('.rv-item').length : 0; }
    function titles(key) {
      var c = m.querySelector('.rv-' + key);
      return c ? Array.prototype.map.call(c.querySelectorAll('.rv-item-title'), function (x) {
        return x.textContent.trim(); }) : [];
    }
    var sum = App.store.auditSummary('${xc.id}');
    function pick(f) {
      return ['political', 'professional', 'compliance'].reduce(function (a, k) {
        return a + sum.kinds[k][f]; }, 0);
    }
    return { sum: sum,
      political: n('political'), professional: n('professional'), compliance: n('compliance'),
      ignored: pick('ignored'), fixed: pick('fixed'),
      ops: (m.querySelector('.review-ops-main') || {}).textContent
        ? m.querySelector('.review-ops-main').textContent.replace(/\s+/g, ' ').trim() : '',
      runInfo: Array.prototype.map.call(m.querySelectorAll('.rv-run-info'), function (x) {
        return x.textContent.replace(/\s+/g, ' ').trim(); }).join(' '),
      fixRows: m.querySelectorAll('.rv-fix-table tbody tr').length,
      fixFrom: (m.querySelector('.rv-fix-table tbody tr td:nth-child(3)') || {}).textContent || '',
      misses: App.store.auditSeedMisses(),
      ruleText: titles('political').join('；'),
      proTitles: titles('professional'),
      compTitles: titles('compliance'),
      marks: Array.prototype.map.call(m.querySelectorAll('.rv-compliance .rv-context mark'),
        function (x) { return x.textContent; }) };`);
  check('默认审核结果：三类都查出问题（政治性 / 专业性 / 合规性 各 ≥ 4 项，共 24 项）',
    xcRun.political >= 4 && xcRun.professional >= 4 && xcRun.compliance >= 4 &&
    xcRun.sum.total === 24 &&
    xcRun.sum.total === xcRun.political + xcRun.professional + xcRun.compliance &&
    xcRun.misses.length === 0,
    '政治性 ' + xcRun.political + ' 项 / 专业性 ' + xcRun.professional + ' 项 / 合规性 ' +
    xcRun.compliance + ' 项｜' + xcRun.ops);
  check('默认结果里预置了处理状态（1 项已忽略 + 1 项已校定），并因此生成一条修改记录',
    xcRun.ignored === 1 && xcRun.fixed === 1 && xcRun.fixRows === 1 &&
    xcRun.fixFrom.indexOf('家庭住址') >= 0 &&
    xcRun.sum.open === 22 && xcRun.ops.indexOf('已忽略 1') >= 0 &&
    xcRun.ops.indexOf('历史修改 1 处') >= 0 &&
    xcRun.runInfo.indexOf('刘洋') >= 0 && xcRun.runInfo.indexOf('本地模拟 AI') >= 0 &&
    xcRun.runInfo.indexOf('默认审核结果（种子数据）') >= 0,
    '已忽略 ' + xcRun.ignored + ' 项；已校定 ' + xcRun.fixed + ' 项；修改记录 ' + xcRun.fixRows +
    ' 条（原文「' + xcRun.fixFrom.trim() + '」）；' + xcRun.ops);
  check('政治性问题报到「审核规则」的标题与类型（政治类 / 国土类 / 文化类…，不是空泛提示）',
    xcRun.ruleText.indexOf('政治类') >= 0 && xcRun.ruleText.indexOf('国土类') >= 0 &&
    xcRun.ruleText.indexOf('文化类') >= 0 && xcRun.ruleText.indexOf('敏感内容') >= 0,
    xcRun.ruleText.slice(0, 90));
  check('专业性问题含错别字 / 规范表述 / 民国纪年不一致三类判定',
    xcRun.proTitles.join(' ').indexOf('错别字') >= 0 &&
    xcRun.proTitles.join(' ').indexOf('编研规范表述') >= 0 &&
    xcRun.proTitles.join(' ').indexOf('民国纪年与公元纪年不一致') >= 0,
    xcRun.proTitles.join('、'));
  check('合规性问题＝知识产权风险（转载 / 网络图片 / 未获授权）+ 个人隐私及个人信息（身份证号 / 手机号 / 邮箱 / 家庭住址 / 个人简历）',
    xcRun.compTitles.join(' ').indexOf('知识产权风险') >= 0 &&
    xcRun.compTitles.join(' ').indexOf('转载') >= 0 &&
    xcRun.compTitles.join(' ').indexOf('网络图片') >= 0 &&
    xcRun.compTitles.join(' ').indexOf('未获授权') >= 0 &&
    xcRun.compTitles.join(' ').indexOf('身份证号') >= 0 &&
    xcRun.compTitles.join(' ').indexOf('手机号') >= 0 &&
    xcRun.compTitles.join(' ').indexOf('电子邮箱') >= 0 &&
    xcRun.compTitles.join(' ').indexOf('家庭住址') >= 0 &&
    xcRun.compTitles.join(' ').indexOf('个人简历') >= 0 &&
    /* 不再有"依托审核规则"的命中项 */
    xcRun.compTitles.join(' ').indexOf('敏感内容') < 0,
    xcRun.compTitles.slice(0, 6).join('；'));
  const shotXc = await page.shot(SHOT_DIR + 'audit-rural.png');

  await page.evaluate("location.hash = '#/task/RW-2026-007'; return 1;");
  await sleep(500);
  const noText = await page.evaluate(`
    var t = App.store.getTask('RW-2026-007');
    return { status: t.status, stage: t.stage };`);
  check('演示数据里的第 7 个任务仍未启动（未启动任务不给阶段界面）',
    noText.status === 'NOT_STARTED' && noText.stage === 1,
    '状态=' + noText.status + '；阶段=' + noText.stage);

  /* 回到审核校定页，供 D 段的收尾检查（页面结构 / 溢出 / 异常） */
  await openReview();

  const finalSnap = await page.evaluate(RV);
  const cardClasses = await page.evaluate(`
    var main = document.getElementById('main');
    return ['political', 'professional', 'compliance'].filter(function (k) {
      return !!main.querySelector('.rv-' + k); }).join(',');`);
  check('页面无横向溢出、三类卡片结构完好（＋修改记录卡）',
    finalSnap.scrollW <= finalSnap.clientW + 1 && cardClasses === 'political,professional,compliance',
    'scrollW ' + finalSnap.scrollW + ' / ' + finalSnap.clientW + '；卡片：' + cardClasses +
    '（共 ' + finalSnap.cards.length + ' 张，含修改记录）');
  check('截图已生成', true,
    [shotRules, shotReview, shotXc].map(function (f) { return f.split('/').slice(-1)[0]; }).join('、'));
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ') : '0 条');
  const warns = page.warns();
  check('全程没有 console 警告（缺图标会走 warn 兜底）', warns.length === 0,
    warns.length ? 'ERR ' + warns.map(function (w) { return w.text; }).join(' | ') : '0 条');

  exitCode = check.summary('审核规则 + 审核校定') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
