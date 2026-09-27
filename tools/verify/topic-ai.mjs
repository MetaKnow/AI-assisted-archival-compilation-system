/* ==========================================================================
   验证套件：选题立项 · AI 辅助选题

   覆盖评审要求：
     「AI 辅助选题时，把表单中的**背景与意义、内容与目标、实施方案**也生成出来，
       按照这三个多行文本框中提示文字要求生成。」
     「**保障措施**忘记生成了，也需要一起生成。」（→ 填充清单抽成单一出处，套件按清单核对草稿齐全）

   判定方式：把三个 textarea 的**占位提示**当作要求本身 —— 从提示里取出分项标签
   （如「1. 立项依据」「2. 背景介绍」「3. 创新点」），再断言 AI 填进去的三段正文
   逐行都以这些标签开头。这样"是否按提示要求生成"是**可计算**的，而不是靠人眼看。

   运行：node tools/verify/topic-ai.mjs [file:///.../index.html]
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

/** 从提示文字里取分项标签：'1. 立项依据：包括…；' → '1. 立项依据' */
const REQUIREMENTS = `
  function requirements(ph) {
    return String(ph || '').split('\\n').map(function (line) {
      return line.replace(/[：；。].*$/, '').trim();
    }).filter(Boolean);
  }
`;

/** 读表单三栏：占位提示 + 当前值 + 是否满足提示要求 */
const FORM = `
  ${REQUIREMENTS}
  function field(id) {
    var el = document.getElementById(id);
    var req = requirements(el ? el.placeholder : '');
    var val = el ? el.value : '';
    var lines = val ? val.split('\\n') : [];
    return { id: id, req: req, value: val, lines: lines.length,
      followed: req.length > 0 && lines.length === req.length &&
        req.every(function (r, i) { return lines[i].indexOf(r) === 0; }) };
  }
  return { name: (document.getElementById('f-name') || {}).value || '',
    background: field('f-background'), content: field('f-content'), plan: field('f-plan'),
    guarantee: field('f-guarantee') };
`;

async function clickInLastModal(sel) {
  const pt = await page.evaluate(`
    var ms = document.querySelectorAll('.modal');
    var m = ms[ms.length - 1];
    if (!m) return null;
    var el = m.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  if (!pt) throw new Error('找不到元素：' + sel);
  await page.mouseClick(pt.x, pt.y);
  await sleep(350);
}

try {
  await page.goto(PAGE_URL);
  await page.evaluate(`
    var u = App.store.users().filter(function (x) { return x.name === '赵志远'; })[0];
    App.store.login(u.account, u.password);
    location.hash = '#/topic';
    return 1;`);
  await sleep(500);

  /* ================================================== A. 三个多行文本框的提示要求 */
  console.log('\n【A】《选题可行性评估表》里三个多行文本框的填写要点');
  await page.evaluate("document.querySelector('[data-action=\"topic:new\"]').click(); return 1;");
  await sleep(400);
  const reqs = await page.evaluate(`
    ${REQUIREMENTS}
    return { background: requirements(document.getElementById('f-background').placeholder),
      content: requirements(document.getElementById('f-content').placeholder),
      plan: requirements(document.getElementById('f-plan').placeholder),
      guarantee: requirements(document.getElementById('f-guarantee').placeholder) };`);
  check('「背景与意义」提示要求三段：立项依据 / 背景介绍 / 创新点',
    reqs.background.join() === '1. 立项依据,2. 背景介绍,3. 创新点', reqs.background.join('　'));
  check('「内容与目标」提示要求两段：项目内容 / 项目目标',
    reqs.content.join() === '1. 项目内容,2. 项目目标', reqs.content.join('　'));
  check('「实施方案」提示要求三段：工作思路 / 工作计划 / 工作方法',
    reqs.plan.join() === '1. 工作思路,2. 工作计划,3. 工作方法', reqs.plan.join('　'));
  check('「保障措施」提示要求三段：前期保障 / 人才保障 / 硬件保障',
    reqs.guarantee.join() === '1. 前期保障,2. 人才保障,3. 硬件保障', reqs.guarantee.join('　'));

  /* ================================================== B. AI 候选弹窗 */
  console.log('\n【B】AI 辅助选题：候选主题说明会填哪些栏');
  await clickInLastModal('[data-action="topic:ai"]');
  const dialog = await page.evaluate(`
    var ms = document.querySelectorAll('.modal');
    var m = ms[ms.length - 1];
    return { cands: m.querySelectorAll('.ai-cand').length,
      note: m.querySelector('.alert-title').parentNode.textContent.replace(/\\s+/g, ' '),
      hints: Array.prototype.map.call(m.querySelectorAll('.ai-fills'), function (x) { return x.textContent.trim(); }),
      supports: m.querySelectorAll('.ai-side .tag').length };`);
  check('弹窗列出 5 条候选主题，每条都标了史料支撑度',
    dialog.cands === 5 && dialog.supports === 5, dialog.cands + ' 条候选');
  check('说明里写明「采用」会按填写要点一次填入 选题名称 + 四栏（含保障措施）',
    dialog.note.indexOf('选题名称、背景与意义、内容与目标、实施方案、保障措施') >= 0 &&
    dialog.note.indexOf('不会被覆盖') >= 0,
    dialog.note.slice(0, 96));
  check('每条候选都提示"采用后填入"的四栏（不是只填名称）',
    dialog.hints.length === 5 && dialog.hints[0].indexOf('背景与意义') > 0 &&
    dialog.hints[0].indexOf('保障措施') > 0, dialog.hints[0]);

  /* 「忘记生成某一栏」的清单级防护：填充清单（页面导出）与种子数据必须一一对上 */
  const coverage = await page.evaluate(`
    var labels = App.topic.aiFillFields();
    var ids = { '背景与意义': 'background', '内容与目标': 'content', '实施方案': 'plan', '保障措施': 'guarantee' };
    var list = App.mock.AI_TOPIC_CANDIDATES;
    var missing = [];
    list.forEach(function (c, i) {
      labels.forEach(function (lb) {
        if (!String(c[ids[lb]] || '').trim()) missing.push((i + 1) + ':' + lb);
      }); });
    return { labels: labels, missing: missing, n: list.length };`);
  check('填充清单里的每一栏，5 条候选中都真的写了草稿（防"加了栏目忘了生成"）',
    coverage.labels.join() === '背景与意义,内容与目标,实施方案,保障措施' &&
    coverage.missing.length === 0,
    coverage.labels.join('、') + '｜缺草稿：' + (coverage.missing.join('、') || '无'));

  /* ================================================== C. 采用候选 → 三栏按提示生成 */
  console.log('\n【C】采用候选主题：四段正文按提示文字的要求生成');
  await clickInLastModal('[data-action="topic:ai-use"]');
  const after = await page.evaluate(FORM);
  check('采用后：选题名称 + 背景与意义 + 内容与目标 + 实施方案 + 保障措施都已填入',
    after.name.length > 4 && after.background.value.length > 40 &&
    after.content.value.length > 40 && after.plan.value.length > 40 &&
    after.guarantee.value.length > 40,
    after.name + '｜四栏字数 ' + after.background.value.length + '/' +
    after.content.value.length + '/' + after.plan.value.length + '/' +
    after.guarantee.value.length);
  check('「背景与意义」逐行对上提示的 3 项（1 立项依据 / 2 背景介绍 / 3 创新点）',
    after.background.followed && after.background.lines === 3,
    after.background.lines + ' 行｜逐行对提示：' + after.background.followed);
  check('「内容与目标」逐行对上提示的 2 项（1 项目内容 / 2 项目目标）',
    after.content.followed && after.content.lines === 2,
    after.content.lines + ' 行｜逐行对提示：' + after.content.followed);
  check('「实施方案」逐行对上提示的 3 项（1 工作思路 / 2 工作计划 / 3 工作方法）',
    after.plan.followed && after.plan.lines === 3,
    after.plan.lines + ' 行｜逐行对提示：' + after.plan.followed);
  check('「保障措施」逐行对上提示的 3 项（1 前期保障 / 2 人才保障 / 3 硬件保障）',
    after.guarantee.followed && after.guarantee.lines === 3 &&
    after.guarantee.value.length > 40,
    after.guarantee.lines + ' 行（' + after.guarantee.value.length + ' 字）｜逐行对提示：' +
    after.guarantee.followed);
  check('生成的内容确实与该候选主题相关（四栏都带着该主题的要素）',
    after.background.value.indexOf('重大工程') >= 0 && after.content.value.indexOf('4,200') >= 0 &&
    after.plan.value.indexOf('项目台账') >= 0 && after.guarantee.value.indexOf('大幅面扫描仪') >= 0,
    '背景含「重大工程」、内容含「4,200 余卷」、方案含「项目台账」、保障含「大幅面扫描仪」');
  const toast = await page.evaluate(`
    var l = document.querySelectorAll('.toast');
    return l.length ? l[l.length - 1].textContent.trim() : '';`);
  check('提示条报出实际填入的字段（含保障措施，用户知道 AI 写了哪几栏）',
    toast.indexOf('选题名称') > 0 && toast.indexOf('背景与意义') > 0 &&
    toast.indexOf('内容与目标') > 0 && toast.indexOf('实施方案') > 0 &&
    toast.indexOf('保障措施') > 0, toast);
  const shotFilled = await page.shot(SHOT_DIR + 'topic-ai-filled.png');

  /* ================================================== D. 已手填的字段不被覆盖 */
  console.log('\n【D】人工已经写过的字段不会被 AI 覆盖');
  await page.evaluate(`
    var ta = document.getElementById('f-content');
    ta.value = '1. 项目内容：本人已按馆藏情况写好这一段；\\n2. 项目目标：2026 年 12 月前完成。';
    var g = document.getElementById('f-guarantee');
    g.value = '1. 前期保障：本人已与相关部门确认过；\\n2. 人才保障：由本部门承担；\\n3. 硬件保障：现有设备可用。';
    return 1;`);
  await clickInLastModal('[data-action="topic:ai"]');
  await page.evaluate(`
    var ms = document.querySelectorAll('.modal');
    var m = ms[ms.length - 1];
    m.querySelectorAll('[data-action="topic:ai-use"]')[3].click();   /* 换成第 4 条候选 */
    return 1;`);
  await sleep(400);
  const kept = await page.evaluate(FORM);
  const keptToast = await page.evaluate(`
    var l = document.querySelectorAll('.toast');
    return l.length ? l[l.length - 1].textContent.trim() : '';`);
  check('人工改过的「内容与目标」「保障措施」保持原样，另两栏（仍是 AI 起草的）换成新候选的内容',
    kept.content.value.indexOf('本人已按馆藏情况写好') >= 0 &&
    kept.guarantee.value.indexOf('本人已与相关部门确认过') >= 0 &&
    kept.background.value.indexOf('信访答复') >= 0 && kept.plan.value.indexOf('事项清单') >= 0,
    '内容与目标未被覆盖＝' + (kept.content.value.indexOf('本人已按馆藏情况写好') >= 0) +
    '；保障措施未被覆盖＝' + (kept.guarantee.value.indexOf('本人已与相关部门确认过') >= 0) +
    '；背景已换＝' + (kept.background.value.indexOf('信访答复') >= 0) +
    '；方案已换＝' + (kept.plan.value.indexOf('事项清单') >= 0));
  check('提示条说明"内容与目标、保障措施已有内容，未覆盖"',
    keptToast.indexOf('未覆盖') > 0 && keptToast.indexOf('内容与目标') > 0 &&
    keptToast.indexOf('保障措施') > 0, keptToast);

  /* ================================================== E. 不同候选的三段内容不同 */
  console.log('\n【E】不同候选主题生成的四段正文各自不同（不是同一段套话）');
  const diff = await page.evaluate(`
    ${REQUIREMENTS}
    var list = App.mock.AI_TOPIC_CANDIDATES;
    var uniq = {};
    list.forEach(function (c) { uniq[c.background] = 1; });
    return { n: list.length, uniqBg: Object.keys(uniq).length,
      hasAll: list.every(function (c) {
        return c.background && c.content && c.plan && c.guarantee &&
          requirements(c.background).length === 3 &&
          requirements(c.content).length === 2 &&
          requirements(c.plan).length === 3 &&
          requirements(c.guarantee).length === 3; }) };`);
  check('5 条候选各有一套内容，且每套都按 3 / 2 / 3 / 3 项写成（含保障措施）',
    diff.n === 5 && diff.uniqBg === 5 && diff.hasAll,
    diff.n + ' 条候选｜背景互不相同 ' + diff.uniqBg + ' 套｜全部符合分项数');

  /* ================================================== F. 保存后落库 */
  console.log('\n【F】保存后：四段正文随选题一起落库，查看时能看到');
  const before = await page.evaluate("return App.store.topics().length;");
  await page.evaluate(`
    document.getElementById('f-name').value = '本市重大工程建设项目档案史料汇编（AI 起草）';
    return 1;`);
  await clickInLastModal('[data-action="ui:ok"]');
  await sleep(600);
  const saved = await page.evaluate(`
    var t = App.store.topics().filter(function (x) {
      return x.name === '本市重大工程建设项目档案史料汇编（AI 起草）'; })[0];
    var tr = null;
    Array.prototype.forEach.call(document.querySelectorAll('.table tbody tr'), function (r) {
      if (r.textContent.indexOf('AI 起草') >= 0) tr = r; });
    return { total: App.store.topics().length, exists: !!t,
      bg: t ? t.background : '', content: t ? t.content : '', plan: t ? t.plan : '',
      guarantee: t ? t.guarantee : '', inList: !!tr };`);
  check('保存成功：选题落库（含背景与意义 / 内容与目标 / 实施方案 / 保障措施）并出现在列表里',
    saved.exists && saved.inList && saved.total === before + 1 &&
    saved.bg.indexOf('1. 立项依据') === 0 && saved.content.indexOf('1. 项目内容') === 0 &&
    saved.plan.indexOf('1. 工作思路') === 0 && saved.guarantee.indexOf('1. 前期保障') === 0,
    '选题数 ' + before + ' → ' + saved.total + '｜四栏各 ' +
    saved.bg.length + '/' + saved.content.length + '/' + saved.plan.length + '/' +
    saved.guarantee.length + ' 字');

  const newId = await page.evaluate(`
    return App.store.topics().filter(function (x) {
      return x.name === '本市重大工程建设项目档案史料汇编（AI 起草）'; })[0].id;`);
  await page.evaluate(`
    document.querySelector('[data-action="topic:view"][data-id="${newId}"]').click(); return 1;`);
  await sleep(450);
  const view = await page.evaluate(`
    var m = document.querySelector('.modal');
    var texts = Array.prototype.map.call(m.querySelectorAll('.read-long'), function (x) {
      return x.textContent.trim(); });
    return { n: texts.length, first: texts[0] || '', hasPlan: m.textContent.indexOf('工作方法') > 0,
      hasInnovation: m.textContent.indexOf('创新点') > 0,
      hasGuarantee: m.textContent.indexOf('硬件保障') > 0 };`);
  check('只读查看里四段正文都在（背景含创新点、方案含工作方法、保障含硬件保障）',
    view.n >= 4 && view.hasPlan && view.hasInnovation && view.hasGuarantee,
    view.n + ' 段长文本｜' + view.first.slice(0, 34));
  const shotView = await page.shot(SHOT_DIR + 'topic-ai-saved.png');
  await page.evaluate("document.querySelector('.modal [data-action=\"ui:ok\"]').click(); return 1;");
  await sleep(300);

  /* ================================================== G. 回归与异常 */
  console.log('\n【G】回归与异常');
  const finalCheck = await page.evaluate(`
    return { scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      modal: !!document.querySelector('.modal'),
      rows: document.querySelectorAll('.table tbody tr').length };`);
  check('列表正常渲染、无横向溢出、没有残留弹窗',
    finalCheck.scrollW <= finalCheck.clientW + 1 && !finalCheck.modal && finalCheck.rows > 0,
    'scrollW ' + finalCheck.scrollW + ' / ' + finalCheck.clientW + '，行 ' + finalCheck.rows);
  check('关键界面截图已生成', true,
    [shotFilled, shotView].map(function (f) { return f.split('/').slice(-1)[0]; }).join('、'));
  const errs = page.errors();
  check('全程没有 JS 异常 / console.error', errs.length === 0,
    errs.length ? 'ERR ' + errs.map(function (e) { return e.kind + ': ' + e.text; }).join(' | ') : '0 条');
  const warns = page.warns();
  check('全程没有 console 警告（重复动作名/缺图标都会走到这里）', warns.length === 0,
    warns.length ? 'ERR ' + warns.map(function (w) { return w.text; }).join(' | ') : '0 条');

  exitCode = check.summary('选题立项 · AI 辅助选题（四段正文）') ? 0 : 1;
} catch (err) {
  console.error('\n套件因异常中断：' + (err && err.stack || err));
  exitCode = 2;
} finally {
  page.close();
}

process.exit(exitCode);
