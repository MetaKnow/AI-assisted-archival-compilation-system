/* ==========================================================================
   数据层（Store）—— 原型的「AuthPort + 领域服务」浏览器实现

   为什么有这一层：
     原型要求 file:// 双击即用、零依赖，所以没有后端。这一层把「数据与规则」集中起来，
     页面只调用这里的方法，将来接真实接口时替换这一个文件即可（对应《技术选型方案》的 AuthPort 思路）。

   数据放在 localStorage：键名 archive-proto-system:<数据集>；
   不可用（隐私模式等）时自动退化为内存态，功能不受影响，只是刷新不保留。

   ⚠ 演示数据版本：种子数据（mock.js）一变，必须把 mock.js 里的 SEED_VERSION 加一，
     否则浏览器里存的旧数据会盖住新种子，出现"两台机器上不一样"。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});

  /* 所有演示数据的键前缀：新增数据集必须用它命名，种子版本变化时才会被一起清掉 */
  var PREFIX = 'archive-proto-system:';
  var STORAGE_KEY = PREFIX + 'session';
  /* 任务进展（阶段 / 状态 / 暂停 / 阶段史）：**单独一个键，且不随种子版本清除**。
     种子数据是"演示素材"，但"我把任务推到第几阶段"是用户的操作结果 ——
     评审反馈"刷新后阶段又回去了"，就是因为种子版本一变、连进展一起被清掉了。 */
  var PROGRESS_KEY = PREFIX + 'taskProgress';
  var KEEP_ON_RESEED = [STORAGE_KEY, PROGRESS_KEY];
  var TOPICS_KEY = 'archive-proto-system:topics';
  var TAGS_KEY = 'archive-proto-system:tags';
  var MATERIALS_KEY = 'archive-proto-system:materials';
  var TASKS_KEY = 'archive-proto-system:tasks';
  var PRODUCTS_KEY = 'archive-proto-system:products';
  var ARCHIVE_KEY = 'archive-proto-system:archive';
  var USERS_KEY = 'archive-proto-system:users';
  var FLOW_KEY = 'archive-proto-system:flow';
  var DICT_KEY = 'archive-proto-system:dict';
  var OUTLINE_KEY = 'archive-proto-system:outline';
  var SELECTION_KEY = 'archive-proto-system:selections';
  var COMPOSE_KEY = 'archive-proto-system:compose';
  var SEED_KEY = 'archive-proto-system:seed';

  var state = {
    user: null,
    lastLoginAt: null,
    persistent: true,
    /* 各数据集（首次访问时从 mock 种子载入） */
    users: null,
    topics: null,
    flows: null,
    flowSeq: 0,
    tags: null,
    materials: null,
    tasks: null,
    products: null,
    archiveItems: null,
    archiveFields: null,
    flowSteps: null,
    dataDicts: null,
    outlines: null,
    selections: null,
    composes: null,
    auditRules: null,
    auditResults: null,
    auditSeedMisses: null,
    taskProgress: null,
    messages: null,
    publish: null,
    reseeded: false
  };

  var listeners = [];

  function subscribe(fn) { listeners.push(fn); }
  function notify() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) { /* 单个订阅者出错不影响其它 */ }
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ==================================================================
     本地存储读写（统一容错：读不了就退化为内存态）
     ================================================================== */

  function readJSON(key) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      state.persistent = false;
      return null;
    }
  }

  function writeJSON(key, value) {
    if (!state.persistent) return;
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      state.persistent = false;
    }
  }

  function removeKey(key) {
    try { global.localStorage.removeItem(key); } catch (e) { /* 忽略 */ }
  }

  /**
   * 种子版本校验：版本不一致 → 清空本地演示数据，让各模块重新灌种子。
   * 不加这一步，旧数据会一直盖住新种子（例如"每部成果必须关联编研任务"之前存下的成果 taskId 为空，
   * 卡片上就会时有时无）。
   */
  function checkSeedVersion() {
    try {
      var v = global.localStorage.getItem(SEED_KEY);
      if (v === App.mock.SEED_VERSION) return true;
      /* ⚠ 这里**按前缀清**，不再逐个列键名。
         早先是写死的一份白名单（topics/tags/materials/tasks/products/archive/users/flow/dict）——
         后来陆续加了 outline、selections、compose、auditRules、auditResults，
         白名单没跟着补：版本号一变，**新数据集的旧数据照样活着、新种子进不来**，
         表现成"改了种子但界面没变"（审核校定就因此扫不到播入的问题章节）。
         现在只要新数据集按 PREFIX 命名，就自动会被清掉，不会再有下一次漏加。
         会话（登录态）保留：换种子不代表要把人踢下线。 */
      var kill = [];
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0 && KEEP_ON_RESEED.indexOf(k) < 0) kill.push(k);
      }
      kill.forEach(removeKey);
      state.reseeded = true;          /* 供启动时提示一句"演示数据已更新、任务进展已保留" */
      global.localStorage.setItem(SEED_KEY, App.mock.SEED_VERSION);
      return false;
    } catch (e) {
      state.persistent = false;
      return false;
    }
  }

  function seedVersion() { return App.mock.SEED_VERSION; }

  /* ==================================================================
     会话与登录
     ================================================================== */

  function readStorage() { return readJSON(STORAGE_KEY); }

  function writeStorage() {
    writeJSON(STORAGE_KEY, { userId: state.user ? state.user.id : null, lastLoginAt: state.lastLoginAt });
  }

  function clearStorage() { removeKey(STORAGE_KEY); }

  function users() {
    if (!state.users) state.users = clone(App.mock.USERS);
    return state.users;
  }

  function saveUsers() { writeJSON(USERS_KEY, state.users); }

  function readUsers() {
    var d = readJSON(USERS_KEY);
    if (!d) return false;
    state.users = d;
    return true;
  }

  function resetUsers() {
    state.users = clone(App.mock.USERS);
    saveUsers();
  }

  function findById(id) {
    return users().filter(function (u) { return u.id === id; })[0] || null;
  }

  function findByAccount(account) {
    var key = String(account || '').trim().toLowerCase();
    if (!key) return null;
    return users().filter(function (u) {
      return u.account && u.account.toLowerCase() === key;
    })[0] || null;
  }

  /** 可用于登录的账号（演示账号一键填入用） */
  function loginableAccounts() {
    return users().filter(function (u) { return !!u.account; });
  }

  function currentUser() { return state.user; }
  function isLoggedIn() { return !!state.user; }

  /** @returns {{ok:boolean, error?:string, user?:Object}} */
  function login(account, password) {
    var user = findByAccount(account);
    if (!user) return { ok: false, error: '账号不存在。可点击下方演示账号一键填入。' };
    if (user.locked) return { ok: false, error: '该账号已锁定，请联系系统管理员解锁。' };
    if (String(password || '') !== user.password) return { ok: false, error: '密码不正确，请重新输入。' };
    state.user = user;
    state.lastLoginAt = new Date().toISOString();
    writeStorage();
    notify();
    return { ok: true, user: user };
  }

  function logout() {
    state.user = null;
    state.lastLoginAt = null;
    clearStorage();
    notify();
  }

  /** 顶栏演示用的角色切换（不校验密码） */
  function switchUser(id) {
    var u = findById(id);
    if (!u) return { ok: false, message: '用户不存在' };
    if (u.locked) return { ok: false, message: '「' + u.name + '」已锁定，无法切换' };
    state.user = u;
    state.lastLoginAt = new Date().toISOString();
    writeStorage();
    notify();
    return { ok: true, message: '已切换为 ' + u.name + '（' + u.roleLabel + '）' };
  }

  /* ==================================================================
     选题立项
     —— 选题、审核流程、流程序号存在同一个载荷里（它们总成对变化）
     ================================================================== */

  function readTopics() {
    var d = readJSON(TOPICS_KEY);
    if (!d) return false;
    state.topics = d.topics || [];
    state.flows = d.flows || [];
    state.flowSeq = d.flowSeq || 0;
    return true;
  }

  function saveTopics() {
    writeJSON(TOPICS_KEY, { topics: state.topics, flows: state.flows, flowSeq: state.flowSeq });
  }

  function resetTopics() {
    state.topics = clone(App.mock.TOPICS);
    state.flows = clone(App.mock.REVIEW_FLOWS);
    state.flowSeq = state.flows.reduce(function (max, f) {
      var n = parseInt(String(f.flowNo).split('-')[2], 10);
      return Math.max(max, isNaN(n) ? 0 : n);
    }, 0);
    saveTopics();
  }

  function topics() {
    if (!state.topics) state.topics = clone(App.mock.TOPICS);
    return state.topics;
  }

  function getTopic(id) {
    return topics().filter(function (t) { return t.id === id; })[0] || null;
  }

  function nextTopicId() {
    var max = topics().reduce(function (m, t) {
      var n = parseInt(String(t.id).replace(/\D/g, ''), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return 'T-' + String(max + 1).padStart(3, '0');
  }

  function topicNameExists(name, exceptId) {
    var key = String(name || '').trim();
    return topics().some(function (t) {
      return t.id !== exceptId && String(t.name).trim() === key;
    });
  }

  /** 仅「未开始」的选题可删除 */
  function canDeleteTopic(t) {
    return !!t && t.status === 'NOT_STARTED';
  }

  function addTopic(data) {
    var t = {
      id: nextTopicId(),
      name: String(data.name || '').trim(),
      status: 'NOT_STARTED',
      createdAt: new Date().toISOString(),
      createdBy: (state.user && state.user.name) || '未知',
      team: data.team || {},
      budget: data.budget || '',
      fundingSources: data.fundingSources || '',
      subsidy: data.subsidy || '',
      background: data.background || '',
      content: data.content || '',
      plan: data.plan || '',
      guarantee: data.guarantee || '',
      comment: data.comment || '',
      review: null,
      attachments: clone(data.attachments || [])
    };
    topics().unshift(t);
    saveTopics();
    notify();
    return t;
  }

  function updateTopic(id, data) {
    var t = getTopic(id);
    if (!t) return { ok: false, message: '选题不存在' };
    ['name', 'team', 'budget', 'fundingSources', 'subsidy', 'background',
      'content', 'plan', 'guarantee', 'comment', 'attachments'].forEach(function (k) {
      if (data[k] !== undefined) t[k] = data[k];
    });
    t.updatedAt = new Date().toISOString();
    saveTopics();
    notify();
    return { ok: true, message: '已保存选题「' + t.name + '」' };
  }

  function deleteTopics(ids) {
    var deleted = [];
    (ids || []).forEach(function (id) {
      var t = getTopic(id);
      if (!t) return;
      if (!canDeleteTopic(t)) return;      // 非「未开始」不允许删除（调用方会提示规则）
      deleted.push(t.name);
      state.topics = topics().filter(function (x) { return x.id !== id; });
    });
    if (deleted.length) { saveTopics(); notify(); }
    return { deleted: deleted };
  }

  /** 该选题是否已被某个编研任务占用 */
  function topicTakenBy(topicId) {
    return tasks().filter(function (t) { return t.topicId === topicId; })[0] || null;
  }

  /** 可关联的选题：未开始 且 未被其它任务占用 */
  function linkableTopics(exceptTaskId) {
    return topics().filter(function (t) {
      if (t.status !== 'NOT_STARTED') return false;
      var owner = topicTakenBy(t.id);
      return !owner || owner.id === exceptTaskId;
    });
  }

  /** 任务状态变化后同步选题状态（仅启动/完成时改，删除任务不回退） */
  function syncTopicStatus(task) {
    if (!task) return;
    var t = getTopic(task.topicId);
    if (!t) return;
    if (task.status === 'IN_PROGRESS') t.status = 'IN_PROGRESS';
    else if (task.status === 'DONE') t.status = 'DONE';
    saveTopics();
  }

  /* ==================================================================
     素材标签
     ================================================================== */

  function readTags() {
    var d = readJSON(TAGS_KEY);
    if (!d) return false;
    state.tags = d;
    return true;
  }

  function saveTags() { writeJSON(TAGS_KEY, state.tags); }

  function resetTags() {
    state.tags = clone(App.mock.TAGS);
    saveTags();
  }

  function tags() {
    if (!state.tags) state.tags = clone(App.mock.TAGS);
    return state.tags;
  }

  /**
   * 标签 + **派生的**关联素材数（页面展示用）
   *
   * 为什么单独一个入口：`tags()` 返回的是内部数组本身（`addTag` 要 unshift 它、
   * `deleteTags` 要按它重建），不能改成返回副本；而 `materialCount` 是算出来的、
   * 不该被写进 localStorage 冒充数据。
   *
   * ⚠️ 曾经踩过的坑：页面统一写 `t.materialCount`，但 store 从来没提供过这个字段 ——
   * 于是标签管理的「用量」列全显示"未使用"、标签筛选下拉显示"（undefined）"、
   * 更改标签与新增素材弹窗显示"已用 undefined 件"，**没有任何报错**。
   * 现在页面一律走 `tagsWithUsage()`，并且验证脚本里有"全站不出现 undefined / NaN"的兜底断言。
   */
  function tagsWithUsage() {
    return tags().map(function (t) {
      var copy = {};
      Object.keys(t).forEach(function (k) { copy[k] = t[k]; });
      copy.materialCount = tagUsage(t.id);
      return copy;
    });
  }

  function getTag(id) {
    return tags().filter(function (t) { return t.id === id; })[0] || null;
  }

  function tagNameExists(name, exceptId) {
    var key = String(name || '').trim();
    return tags().some(function (t) {
      return t.id !== exceptId && String(t.name).trim() === key;
    });
  }

  /** 关联素材数：由素材库实时聚合，不单独存字段（避免两处数据不一致） */
  function tagUsage(tag) {
    var id = typeof tag === 'string' ? tag : (tag && tag.id);
    if (!id) return 0;
    return materials().filter(function (m) {
      return (m.tagIds || []).indexOf(id) >= 0;
    }).length;
  }

  /** 已关联素材的标签不允许删除（原型假设，见 README） */
  function canDeleteTag(tag) {
    return tagUsage(tag) === 0;
  }

  function nextTagId() {
    var max = tags().reduce(function (m, t) {
      var n = parseInt(String(t.id).replace(/\D/g, ''), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return 'G-' + String(max + 1).padStart(3, '0');
  }

  function addTag(data) {
    var t = {
      id: nextTagId(),
      name: String(data.name || '').trim(),
      note: data.note || '',
      createdAt: new Date().toISOString(),
      createdBy: (state.user && state.user.name) || '未知'
    };
    tags().unshift(t);
    saveTags();
    notify();
    return t;
  }

  function updateTag(id, data) {
    var t = getTag(id);
    if (!t) return { ok: false, message: '标签不存在' };
    if (data.name !== undefined) t.name = String(data.name).trim();
    if (data.note !== undefined) t.note = data.note;
    t.updatedAt = new Date().toISOString();
    saveTags();
    notify();
    return { ok: true, message: '已保存标签「' + t.name + '」' };
  }

  function deleteTags(ids) {
    var deleted = [];
    (ids || []).forEach(function (id) {
      var t = getTag(id);
      if (!t || !canDeleteTag(t)) return;
      deleted.push(t.name);
      state.tags = tags().filter(function (x) { return x.id !== id; });
    });
    if (deleted.length) { saveTags(); notify(); }
    return { deleted: deleted };
  }

  /* ==================================================================
     素材库（素材管理 / 查找素材）
     ================================================================== */

  function readMaterials() {
    var d = readJSON(MATERIALS_KEY);
    if (!d) return false;
    state.materials = d;
    return true;
  }

  function saveMaterials() { writeJSON(MATERIALS_KEY, state.materials); }

  function resetMaterials() {
    state.materials = clone(App.mock.MATERIALS);
    saveMaterials();
  }

  function materials() {
    if (!state.materials) state.materials = clone(App.mock.MATERIALS);
    return state.materials;
  }

  function getMaterial(id) {
    return materials().filter(function (m) { return m.id === id; })[0] || null;
  }

  /** 该档号是否已在素材库（「查找素材」判重与禁用勾选用） */
  function hasMaterial(archiveNo) {
    return materials().some(function (m) { return m.archiveNo === archiveNo; });
  }

  function nextMaterialId() {
    var max = materials().reduce(function (m, x) {
      var n = parseInt(String(x.id).replace(/\D/g, ''), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return 'M-' + String(max + 1).padStart(3, '0');
  }

  /**
   * 把检索结果加入素材库（按档号判重）
   * @returns {{added:Array, skipped:Array}} 两个都是数组（页面按长度与下标使用）
   */
  /** 按档号回查档案目录（目录是 mock 里的静态数据，不落 localStorage） */
  function catalogByArchiveNo(no) {
    return (App.mock.ARCHIVE_CATALOG || []).filter(function (a) { return a.archiveNo === no; })[0] || null;
  }

  /** 标题是否已在素材库（手工新增没有档号，判重只能按标题） */
  function hasMaterialTitle(title) {
    var t = String(title || '').trim().toLowerCase();
    if (!t) return false;
    return materials().some(function (m) {
      return String(m.title || '').trim().toLowerCase() === t;
    });
  }

  /** 档号前缀 → 全宗：从档案目录里现推，不写死映射表 */
  function fondsOfArchiveNo(no) {
    var prefix = String(no || '').split('-')[0];
    var hit = (App.mock.ARCHIVE_CATALOG || []).filter(function (a) {
      return String(a.archiveNo).split('-')[0] === prefix;
    })[0];
    if (hit) return hit.fonds;
    return prefix ? prefix + ' 全宗（未编）' : '';
  }

  /** 档号里的 4 位年份 */
  function yearOfArchiveNo(no) {
    var m = String(no || '').match(/(19|20)\d{2}/);
    return m ? m[0] : '';
  }

  /**
   * 手工新增一件素材（素材管理 →「新增素材」）
   * 档号唯一（与「查找素材」加入素材库用的是同一个判重口径）；
   * 能在档案目录里匹配到档号时，自动带出全宗 / 年度 / 题名。
   * @returns {{ok:boolean, item?:Object, catalog?:Object, message:string}}
   */
  function addMaterial(data) {
    data = data || {};
    var title = String(data.title || '').trim();
    /* 界面上去掉了档号字段：手工新增的素材没有档号，只有从「查找素材」加入的才有 */
    var no = String(data.archiveNo || '').trim();
    if (!title) return { ok: false, message: '请填写标题' };
    if (hasMaterialTitle(title)) {
      return { ok: false, message: '素材「' + title + '」已在素材库中，不能重复新增' };
    }

    var cat = no ? catalogByArchiveNo(no) : null;
    var m = {
      id: nextMaterialId(),
      archiveId: cat ? cat.id : null,
      archiveNo: no,
      title: title,
      fonds: (cat && cat.fonds) || (no ? fondsOfArchiveNo(no) : ''),
      year: (cat && cat.year) || (no ? yearOfArchiveNo(no) : ''),
      note: String(data.note || '').trim(),
      category: (App.mock.ARCHIVE_CATEGORIES || []).indexOf(data.category) >= 0
        ? data.category : '文书档案',
      tagIds: (data.tagIds || []).slice(),
      /* 附件只记文件名与大小（原型不保存文件内容） */
      file: data.file ? { name: String(data.file.name || ''), size: Number(data.file.size) || 0 } : null,
      addedAt: new Date().toISOString(),
      addedBy: (state.user && state.user.name) || '未知'
    };
    materials().unshift(m);
    saveMaterials();
    notify();
    return {
      ok: true, item: m, catalog: cat,
      message: '已新增素材「' + m.title + '」' + (cat ? '（已与档案目录 ' + no + ' 关联）' : '')
    };
  }

  function addMaterials(archives, tagIds) {
    var added = [], skipped = [];
    (archives || []).forEach(function (a) {
      if (hasMaterial(a.archiveNo)) { skipped.push(a.archiveNo); return; }
      var m = {
        id: nextMaterialId(),
        archiveId: a.id || null,
        archiveNo: a.archiveNo,
        title: a.title,
        fonds: a.fonds || '',
        year: a.year || '',
        /* 备注默认取档案摘要：说明这条素材是什么 */
        note: a.summary || '',
        category: a.category || '',
        tagIds: (tagIds || []).slice(),
        addedAt: new Date().toISOString(),
        addedBy: (state.user && state.user.name) || '未知'
      };
      materials().unshift(m);
      added.push(m);
    });
    if (added.length) { saveMaterials(); notify(); }
    return { added: added, skipped: skipped, items: added };
  }

  function deleteMaterials(ids) {
    var deleted = [];
    (ids || []).forEach(function (id) {
      var m = getMaterial(id);
      if (!m) return;
      deleted.push(m.title);
      state.materials = materials().filter(function (x) { return x.id !== id; });
    });
    if (deleted.length) { saveMaterials(); notify(); }
    return { deleted: deleted };
  }

  /**
   * 批量改标签
   * @param {string} mode 'append' 追加 | 'replace' 替换
   */
  function updateMaterialTags(ids, tagIds, mode) {
    var changed = 0;
    (ids || []).forEach(function (id) {
      var m = getMaterial(id);
      if (!m) return;
      var next = mode === 'replace'
        ? (tagIds || []).slice()
        : (m.tagIds || []).concat((tagIds || []).filter(function (t) {
            return (m.tagIds || []).indexOf(t) < 0;
          }));
      m.tagIds = next;
      changed++;                       // 计"处理的件数"：幂等保存也返回 1（界面提示"更改 N 件素材的标签"）
    });
    if (changed) { saveMaterials(); notify(); }
    return { changed: changed };
  }

  /* ==================================================================
     编研任务
     ================================================================== */

  function readTasks() {
    var d = readJSON(TASKS_KEY);
    if (!d) return false;
    state.tasks = applyProgress(d);
    return true;
  }

  function saveTasks() { writeJSON(TASKS_KEY, state.tasks); }

  /* ---- 任务进展覆盖层：把"用户推进到哪"记在单独一个键里，种子更新也不丢 ---- */

  function readTaskProgress() {
    var d = readJSON(PROGRESS_KEY);
    state.taskProgress = (d && typeof d === 'object') ? d : {};
    return state.taskProgress;
  }

  function saveTaskProgress() { writeJSON(PROGRESS_KEY, state.taskProgress || {}); }

  /** 把任务当前的进展记进覆盖层（阶段 / 状态 / 暂停 / 阶段史 / 起止时间） */
  function rememberProgress(t) {
    if (!t) return;
    state.taskProgress = state.taskProgress || {};
    state.taskProgress[t.id] = {
      stage: t.stage, status: t.status, paused: !!t.paused,
      stageHistory: clone(t.stageHistory || []),
      startedAt: t.startedAt || null, finishedAt: t.finishedAt || null
    };
    saveTaskProgress();
  }

  /** 读取任务列表时套用覆盖层：种子变了也保留用户推到哪一阶段 */
  function applyProgress(list) {
    var prog = state.taskProgress || {};
    (list || []).forEach(function (t) {
      var p = prog[t.id];
      if (!p) return;
      if (p.stage != null) t.stage = p.stage;
      if (p.status) t.status = p.status;
      if (p.paused != null) t.paused = !!p.paused;
      if (p.stageHistory) t.stageHistory = clone(p.stageHistory);
      if (p.startedAt) t.startedAt = p.startedAt;
      if (p.finishedAt) t.finishedAt = p.finishedAt;
    });
    return list;
  }

  function resetTasks() {
    state.tasks = applyProgress(clone(App.mock.TASKS));
    saveTasks();
  }

  /** 「重置演示数据」时连任务进展一起清空（按钮的语义就是全部回到种子状态） */
  function clearTaskProgress() {
    state.taskProgress = {};
    saveTaskProgress();
  }

  function tasks() {
    if (!state.tasks) state.tasks = applyProgress(clone(App.mock.TASKS));
    return state.tasks;
  }

  function getTask(id) {
    return tasks().filter(function (t) { return t.id === id; })[0] || null;
  }

  /** 六阶段定义（文档口径） */
  function taskStages() { return App.mock.TASK_STAGES; }

  /** 第 index 个阶段（1 起） */
  function stageDef(index) {
    return taskStages().filter(function (s) { return s.index === index; })[0] || null;
  }

  function isTaskDone(t) { return !!t && t.status === 'DONE'; }

  /**
   * 任务的呈现状态（唯一入口）
   * 存储只有三态 + paused 标记，这里换算成互斥的四档：
   * 未开始 / 进行中 / 已暂停 / 已完成 —— 「进行中」与「已暂停」不会同时出现。
   */
  function taskState(t) {
    var S = App.mock.TASK_STATES;
    if (!t) return S.NOT_STARTED;
    if (t.status === 'DONE') return S.DONE;
    if (t.status === 'NOT_STARTED') return S.NOT_STARTED;
    return t.paused ? S.PAUSED : S.IN_PROGRESS;
  }

  function taskMatchesState(t, key) { return taskState(t).key === key; }

  function nextTaskId() {
    var year = new Date().getFullYear();
    var max = tasks().reduce(function (m, t) {
      var mm = /^RW-(\d{4})-(\d+)$/.exec(t.id);
      if (!mm || parseInt(mm[1], 10) !== year) return m;
      return Math.max(m, parseInt(mm[2], 10));
    }, 0);
    return 'RW-' + year + '-' + String(max + 1).padStart(3, '0');
  }

  function addTask(data) {
    var topic = getTopic(data.topicId);
    if (!topic) return null;
    var now = new Date().toISOString();
    var who = (state.user && state.user.name) || '未知';
    var t = {
      id: nextTaskId(),
      type: data.type || topic.type || '',
      topicId: topic.id,
      topicName: topic.name,
      status: 'NOT_STARTED',
      paused: false,
      stage: 1,
      planStart: data.planStart || '',
      planEnd: data.planEnd || '',
      team: data.team || {},
      note: data.note || '',
      createdAt: now,
      createdBy: who,
      stageHistory: [{ stage: 1, at: now, by: who, action: 'CREATE' }]
    };
    tasks().unshift(t);
    saveTasks();
    notify();
    return t;
  }

  function updateTask(id, data) {
    var t = getTask(id);
    if (!t) return { ok: false, message: '任务不存在' };
    if (data.topicId && data.topicId !== t.topicId) {
      var topic = getTopic(data.topicId);
      if (topic) { t.topicId = topic.id; t.topicName = topic.name; }
    }
    ['planStart', 'planEnd', 'team', 'note'].forEach(function (k) {
      if (data[k] !== undefined) t[k] = data[k];
    });
    t.updatedAt = new Date().toISOString();
    saveTasks();
    notify();
    return { ok: true, message: '已保存任务 ' + t.id };
  }

  function deleteTasks(ids) {
    var deleted = [];
    (ids || []).forEach(function (id) {
      var t = getTask(id);
      if (!t) return;
      deleted.push(t.id);
      state.tasks = tasks().filter(function (x) { return x.id !== id; });
    });
    if (deleted.length) {
      deleted.forEach(function (t) {
        if (state.taskProgress) delete state.taskProgress[t.id];
      });
      saveTaskProgress();
      saveTasks();
      notify();
    }
    return { deleted: deleted };
  }

  function pushStageHistory(t, stage, action) {
    t.stageHistory = t.stageHistory || [];
    t.stageHistory.push({
      stage: stage,
      at: new Date().toISOString(),
      by: (state.user && state.user.name) || '未知',
      action: action || ''
    });
  }

  function startTask(id) {
    var t = getTask(id);
    if (!t) return { ok: false, message: '任务不存在' };
    if (t.status !== 'NOT_STARTED') return { ok: false, message: '只有「未开始」的任务可以启动' };
    t.status = 'IN_PROGRESS';
    t.paused = false;
    t.startedAt = new Date().toISOString();
    pushStageHistory(t, t.stage, 'START');
    rememberProgress(t);
    saveTasks();
    syncTopicStatus(t);
    notify();
    return { ok: true, message: '已启动任务 ' + t.id + '，选题同步转为「进行中」' };
  }

  function pauseTask(id) {
    var t = getTask(id);
    if (!t) return { ok: false, message: '任务不存在' };
    if (t.status !== 'IN_PROGRESS') return { ok: false, message: '只有「进行中」的任务可以暂停' };
    if (t.paused) return { ok: false, message: '任务已处于暂停状态' };
    t.paused = true;
    pushStageHistory(t, t.stage, 'PAUSE');
    rememberProgress(t);
    saveTasks();
    notify();
    return { ok: true, message: '已暂停任务 ' + t.id };
  }

  function resumeTask(id) {
    var t = getTask(id);
    if (!t) return { ok: false, message: '任务不存在' };
    if (!t.paused) return { ok: false, message: '任务未处于暂停状态' };
    t.paused = false;
    pushStageHistory(t, t.stage, 'RESUME');
    rememberProgress(t);
    saveTasks();
    notify();
    return { ok: true, message: '已继续任务 ' + t.id };
  }

  /**
   * 把任务的进展**停在**某个阶段（评审要求：点进度条上的某个环节就停在这里）。
   *
   * 规则：
   *   · 后面的环节一律回到「未开始」—— 阶段史截断到该阶段，之后再按顺序推进
   *   · 已经完成的任务往回点，状态回到「进行中」（否则会出现"第 2 阶段 + 已完成"这种矛盾）
   *   · 只能点"当前阶段及以前"和"下一个阶段"，**不能跳过下一环**（校验在页面侧，store 只夹范围）
   */
  function setTaskStage(id, stage) {
    var _lock = lockedGuard(id);
    if (_lock) return _lock;
    var t = getTask(id);
    if (!t) return { ok: false, message: '任务不存在' };
    var max = taskStages().length;
    var n = Math.max(1, Math.min(Number(stage) || 1, max));
    t.stage = n;
    t.status = 'IN_PROGRESS';
    t.startedAt = t.startedAt || new Date().toISOString();
    /* 阶段史：只留 n 之前的记录 + 本阶段这一条（后面的环节就当没来过） */
    var hist = (t.stageHistory || []).filter(function (h) { return h.stage < n; });
    hist.push({ stage: n, at: new Date().toISOString(),
      by: (state.user && state.user.name) || '未知' });
    t.stageHistory = hist;
    rememberProgress(t);
    saveTasks();
    syncTopicStatus(t);
    notify();
    var def = stageDef(n) || { title: '' };
    return { ok: true, message: '进展已停在第 ' + n + ' 阶段「' + def.title + '」，后面的环节回到未开始' };
  }

  function advanceStage(id) {
    var _lock = lockedGuard(id);
    if (_lock) return _lock;
    var t = getTask(id);
    if (!t) return { ok: false, message: '任务不存在' };
    if (t.status === 'NOT_STARTED') return { ok: false, message: '请先启动任务' };
    if (t.paused) return { ok: false, message: '任务已暂停，请先继续' };
    if (t.status === 'DONE') return { ok: false, message: '任务已完成' };
    if (t.stage >= taskStages().length) {
      t.status = 'DONE';
      t.paused = false;
      t.finishedAt = new Date().toISOString();
      pushStageHistory(t, t.stage, 'FINISH');
      rememberProgress(t);
    saveTasks();
      syncTopicStatus(t);
      notify();
      return { ok: true, message: '任务已完成，选题同步转为「已完成」' };
    }
    t.stage += 1;
    pushStageHistory(t, t.stage, 'ADVANCE');
    saveTasks();
    notify();
    return { ok: true, message: '已进入第 ' + t.stage + ' 阶段「' + ((stageDef(t.stage) || {}).title || '') + '」' };
  }

  function backStage(id) {
    var t = getTask(id);
    if (!t) return { ok: false, message: '任务不存在' };
    if (t.status === 'DONE') {
      /* 已完成的任务可以重新打开，回到当前阶段继续修改 */
      t.status = 'IN_PROGRESS';
      t.finishedAt = null;
      pushStageHistory(t, t.stage, 'REOPEN');
      rememberProgress(t);
    saveTasks();
      syncTopicStatus(t);
      notify();
      return { ok: true, message: '已重新打开任务，回到第 ' + t.stage + ' 阶段' };
    }
    if (t.stage <= 1) return { ok: false, message: '已在第 1 阶段，无法回退' };
    t.stage -= 1;
    pushStageHistory(t, t.stage, 'BACK');
    saveTasks();
    notify();
    return { ok: true, message: '已回退到第 ' + t.stage + ' 阶段「' + ((stageDef(t.stage) || {}).title || '') + '」' };
  }

  /* ==================================================================
     编研任务 · 第 1 阶段「生成大纲」

     一条任务一份大纲记录：
       { taskId, prompt, nodes:[{id,level,title,note,collapsed}], thinking:[], regenSeq, nextId, updatedAt }
     nodes 是**扁平数组**，层级由 level 表达（1/2/3），顺序即大纲顺序 ——
     这样"折叠一段""重新生成子树"都只是对这个数组做区间操作，不用维护树结构。
     ================================================================== */

  function readOutlines() {
    var d = readJSON(OUTLINE_KEY);
    if (!d) return false;
    state.outlines = d;
    return true;
  }

  function saveOutlines() { writeJSON(OUTLINE_KEY, state.outlines); }

  function resetOutlines() {
    state.outlines = clone(App.mock.OUTLINES || {});
    saveOutlines();
  }

  function outlines() {
    if (!state.outlines) state.outlines = clone(App.mock.OUTLINES || {});
    return state.outlines;
  }

  /** 取某任务的大纲记录；没有就补一条空的（只在第一次落库时才写 localStorage） */
  function outlineOf(taskId) {
    var all = outlines();
    if (!all[taskId]) {
      all[taskId] = {
        taskId: taskId, prompt: '', nodes: [], thinking: [],
        regenSeq: 0, nextId: 1, updatedAt: ''
      };
    }
    return all[taskId];
  }

  /**
   * 写大纲
   * ⚠️ outlineOf() 返回的是**活对象**（页面里就地改字段后由本函数落库）；
   *    传 opts.silent = true 时只落库、不 notify —— 文本输入要走这条路，
   *    否则每敲一个字都整页重渲染，光标会丢。
   */
  function saveOutline(taskId, patch, opts) {
    var _lock = lockedGuard(taskId);
    if (_lock) return _lock;
    var rec = outlineOf(taskId);
    Object.keys(patch || {}).forEach(function (k) { rec[k] = patch[k]; });
    rec.updatedAt = new Date().toISOString();
    saveOutlines();
    if (!(opts && opts.silent)) notify();
    return rec;
  }

  function setOutlineNodes(taskId, nodes, opts) {
    return saveOutline(taskId, { nodes: nodes }, opts);
  }

  function setOutlinePrompt(taskId, prompt, opts) {
    return saveOutline(taskId, { prompt: prompt }, opts);
  }

  function updateOutlineNode(taskId, nodeId, patch, opts) {
    var rec = outlineOf(taskId);
    var hit = null;
    rec.nodes.forEach(function (n) { if (n.id === nodeId) hit = n; });
    if (!hit) return null;
    Object.keys(patch || {}).forEach(function (k) { hit[k] = patch[k]; });
    return saveOutline(taskId, {}, opts);
  }

  function clearOutline(taskId, opts) {
    return saveOutline(taskId, {
      nodes: [], thinking: [], regenSeq: 0, nextId: 1
    }, opts);
  }

  /* ---- 大纲节点的增 / 删 / 移动（结构操作，页面只负责"记撤销 + 报错提示"） ---- */

  function outlineMaxLevel() { return (App.mock.outline && App.mock.outline.maxLevel) || 8; }

  function outlineNextId(taskId) {
    var rec = outlineOf(taskId);
    var id = 'n' + (rec.nextId || 1);
    rec.nextId = (rec.nextId || 1) + 1;
    return id;
  }

  /** 某个节点及其全部后代的区间 [起, 止] */
  function subtreeRange(nodes, id) {
    var start = -1;
    nodes.forEach(function (n, i) { if (n.id === id) start = i; });
    if (start < 0) return null;
    var end = start;
    for (var i = start + 1; i < nodes.length; i++) {
      if (nodes[i].level <= nodes[start].level) break;
      end = i;
    }
    return { start: start, end: end, size: end - start + 1 };
  }

  /**
   * 插入一个标题
   * @param {{level:number, title?:string, note?:string, at?:{mode:'before'|'after'|'end', id?:string}}} data
   *   mode='before' 插在参照节点之前（同级）；'after' 插在参照节点**整个子树之后**（同级）；
   *   'end' 或没有参照节点时追加在最后。
   * @returns {{ok:boolean, id?:string, message:string}}
   */
  function insertOutlineNode(taskId, data) {
    var rec = outlineOf(taskId);
    var level = parseInt(data.level, 10);
    if (!(level >= 1)) level = 1;
    if (level > outlineMaxLevel()) {
      return { ok: false, message: '最多支持 ' + outlineMaxLevel() + ' 级标题' };
    }
    var nodes = clone(rec.nodes);
    var at = data.at || {};
    var idx = nodes.length;                       // 默认追加在最后
    if (at.id) {
      var range = subtreeRange(nodes, at.id);
      if (!range) return { ok: false, message: '参照的标题不存在' };
      idx = at.mode === 'before' ? range.start : range.end + 1;
    }
    var node = {
      id: outlineNextId(taskId), level: level,
      title: data.title || '', note: data.note || '', collapsed: false
    };
    nodes.splice(idx, 0, node);
    saveOutline(taskId, { nodes: nodes });
    return {
      ok: true, id: node.id, index: idx,
      message: '已在' + (at.mode === 'before' ? '前' : (at.mode === 'after' ? '后' : '末尾')) +
        '添加一个' + (App.mock.outline.levelLabels[level - 1] || (level + ' 级标题'))
    };
  }

  /** 删除当前章节（含其全部子标题） */
  function deleteOutlineNode(taskId, nodeId) {
    var rec = outlineOf(taskId);
    var nodes = clone(rec.nodes);
    var range = subtreeRange(nodes, nodeId);
    if (!range) return { ok: false, removed: 0, message: '标题不存在' };
    var removed = nodes.splice(range.start, range.size);
    saveOutline(taskId, { nodes: nodes });
    return {
      ok: true, removed: removed.length, ids: removed.map(function (n) { return n.id; }),
      message: removed.length > 1
        ? '已删除「' + (removed[0].title || '未命名标题') + '」及其 ' + (removed.length - 1) + ' 个子标题'
        : '已删除「' + (removed[0].title || '未命名标题') + '」'
    };
  }

  /**
   * 拖动排序：把 src 及其子树挪到 target 之前 / 之后，并整体升降到 target 的层级
   * 规则（界面上有提示）：不允许挪进自己的子树；升降后层级超过 8 级则拒绝。
   */
  function moveOutlineNode(taskId, srcId, targetId, mode) {
    var rec = outlineOf(taskId);
    if (srcId === targetId) return { ok: false, message: '没有移动' };
    var nodes = clone(rec.nodes);
    var src = subtreeRange(nodes, srcId);
    var tgt = subtreeRange(nodes, targetId);
    if (!src || !tgt) return { ok: false, message: '标题不存在' };
    if (tgt.start > src.start && tgt.start <= src.end) {
      return { ok: false, message: '不能把章节移动到它自己的子标题里' };
    }

    var targetTitle = nodes[tgt.start].title;
    var delta = nodes[tgt.start].level - nodes[src.start].level;
    var moved = nodes.slice(src.start, src.end + 1).map(function (n) {
      return Object.assign({}, n, { level: n.level + delta });
    });
    if (moved.some(function (n) { return n.level > outlineMaxLevel() || n.level < 1; })) {
      return { ok: false, message: '移动后层级会超过 ' + outlineMaxLevel() + ' 级，已取消' };
    }

    /* 先在原数组里定位插入点，再按"移除源区间"修正偏移 */
    var insertAt = mode === 'before' ? tgt.start : tgt.end + 1;
    nodes.splice(src.start, src.size);
    if (insertAt > src.start) insertAt -= src.size;
    nodes.splice.apply(nodes, [insertAt, 0].concat(moved));
    saveOutline(taskId, { nodes: nodes });
    return {
      ok: true, moved: moved.length, index: insertAt,
      message: '已把「' + (moved[0].title || '未命名标题') + '」移动到「' + (targetTitle || '未命名标题') + '」' +
        (mode === 'before' ? '之前' : '之后') +
        (delta ? '，层级调整为' + (App.mock.outline.levelLabels[moved[0].level - 1] || '') : '')
    };
  }

  /** 全部折叠 / 全部展开（视图状态，不进撤销栈） */
  function setOutlineCollapsed(taskId, collapsed, opts) {
    var rec = outlineOf(taskId);
    var nodes = clone(rec.nodes).map(function (n) {
      return Object.assign({}, n, { collapsed: !!collapsed });
    });
    return saveOutline(taskId, { nodes: nodes }, opts);
  }

  /* ==================================================================
     第 2 阶段「确定选材」的选材库

     一个任务一份：{ taskId, seq, entries: [...] }
     一条选材 = 素材库里的素材（或本地上传的素材）+ 选入范围（整份 / 指定页）。
     "整份"与"第 2-3 页"算**两条不同的选材**，所以判重按 (素材 + 范围)。
     移除选材**只影响选材库**，素材库里的素材不动 —— 这是两层的区别，界面上也这么说。
     ================================================================== */

  function readSelections() {
    var d = readJSON(SELECTION_KEY);
    if (!d) return false;
    state.selections = d;
    return true;
  }

  function saveSelections() { writeJSON(SELECTION_KEY, state.selections); }

  function resetSelections() {
    state.selections = clone(App.mock.SELECTIONS || {});
    saveSelections();
  }

  function selections() {
    if (!state.selections) state.selections = clone(App.mock.SELECTIONS || {});
    return state.selections;
  }

  /**
   * 一条素材条目下的**文件清单**（评审要求：一条条目里可能有多份文件）。
   * · 素材自带 `files` 就用它（每份文件各有页数，页码按文件校验）；
   * · 没有 `files` 的条目视为"1 份文件"：文件名取上传的文件名，否则按档号与题名推导（与「查看」一致），
   *   页数取档案目录的著录页数。
   * @returns {Array<{no:number,name:string,size:number,pages:number,duration?:number,note?:string,implicit?:boolean}>}
   */
  function materialFileList(m) {
    if (!m) return [];
    if (m.files && m.files.length) {
      return m.files.map(function (f, i) {
        return { no: Number(f.no) || (i + 1), name: String(f.name || ''),
          size: Number(f.size) || 0, pages: Number(f.pages) || 0,
          duration: Number(f.duration) || 0, note: f.note || '' };
      });
    }
    var cat = catalogByArchiveNo(m.archiveNo);
    var size = Number((m.file && m.file.size) || 0);
    var duration = Number((m.file && m.file.duration) || 0);
    var name = m.file && m.file.name
      ? m.file.name
      : (m.archiveNo ? m.archiveNo + '_' + (m.title || '未命名') + '.pdf' : (m.title || '电子文件') + '.pdf');
    /* 视频/音频类没有页码：留着"按时长/体积推算的页数"只会误导（曾经推成 1126 页） */
    var isMedia = /\.(mp4|mov|avi|mkv|wmv|webm|m4v|mp3|wav)$/i.test(name) || duration > 0;
    var pages = isMedia ? 0 : Number((cat && cat.pages) || m.pages || 0);
    if (!pages && !isMedia && size) pages = Math.max(1, Math.round(size / 380000));
    return [{
      no: 1,
      name: name,
      size: size, pages: pages,
      duration: duration,
      note: m.file ? '' : '预置的电子文件元数据（按档号与页数推导）。',
      implicit: true
    }];
  }

  /** 取某一份文件（编号缺省＝第 1 份） */
  function materialFileOf(m, no) {
    var list = materialFileList(m);
    var n = Number(no) || 1;
    return list.filter(function (f) { return f.no === n; })[0] || list[0] || null;
  }

  /** 某任务的选材库（没有就补一个空的，落库与否由调用方决定） */
  function selectionOf(taskId) {
    var all = selections();
    if (!all[taskId]) all[taskId] = { taskId: taskId, seq: 0, entries: [] };
    return all[taskId];
  }

  /** 选入范围的文字：整份 12 页 / 第 2-3 页 / 第 3 页 */
  function scopeText(entry) {
    if (!entry) return '';
    /* 条目下有多份文件时，范围文字前面带上文件名 —— 否则同一素材的两份文件看起来一模一样 */
    var m = entry.materialId ? getMaterial(entry.materialId) : null;
    var multi = m ? materialFileList(m).length > 1 : false;
    var prefix = (multi && entry.file && entry.file.name) ? entry.file.name + ' · ' : '';
    if (entry.scope !== 'pages' || !(entry.pages || []).length) {
      return prefix + '整个文件' + (entry.pageCount ? '（共 ' + entry.pageCount + ' 页）' : '');
    }
    return prefix + pagesText(entry.pages) + (entry.pageCount ? '（共 ' + entry.pageCount + ' 页）' : '');
  }

  /** 把指定页的页码区间压成文字：1,2,3,5,6 → 1-3、5-6 */
  function pagesText(pages) {
    var list = (pages || []).slice().sort(function (a, b) { return a - b; });
    if (!list.length) return '';
    var parts = [], start = list[0], prev = list[0];
    for (var i = 1; i <= list.length; i++) {
      var cur = list[i];
      if (cur === prev + 1) { prev = cur; continue; }
      parts.push(start === prev ? String(start) : start + '-' + prev);
      if (cur === undefined) break;
      start = prev = cur;
    }
    return '第 ' + parts.join('、') + ' 页';
  }

  /**
   * 加入选材库
   * @param {string} taskId
   * @param {Array} items [{ materialId, source, title, archiveNo, category, tagIds, file, pageCount, pages }]
   *        pages 为空＝整份文件
   * @returns {{added:Array, skipped:Array}}
   */
  function addSelections(taskId, items) {
    var _lock = lockedGuard(taskId);
    if (_lock) return _lock;
    var rec = selectionOf(taskId);
    var added = [], skipped = [];
    (items || []).forEach(function (it) {
      var pages = (it.pages || []).slice().sort(function (a, b) { return a - b; });
      /* 判重口径＝「素材 + 文件 + 范围」：同一条素材下的两份文件可以分别加入 */
      var fileNo = Number(it.fileNo) || 1;
      var sig = (it.materialId || it.title) + '#' + fileNo + '|' + (pages.length ? pages.join(',') : 'all');
      var dup = rec.entries.some(function (e) {
        var ep = (e.pages || []).slice().sort(function (a, b) { return a - b; });
        return ((e.materialId || e.title) + '#' + (Number(e.fileNo) || 1) + '|' +
          (ep.length ? ep.join(',') : 'all')) === sig;
      });
      if (dup) { skipped.push(it.title); return; }
      rec.seq = (rec.seq || 0) + 1;
      rec.entries.unshift({
        id: 'SE-' + String(rec.seq).padStart(3, '0'),
        taskId: taskId,
        source: it.source || 'library',
        materialId: it.materialId || null,
        title: it.title || '',
        archiveNo: it.archiveNo || '',
        category: it.category || '',
        tagIds: (it.tagIds || []).slice(),
        scope: pages.length ? 'pages' : 'all',
        pages: pages,
        pageCount: Number(it.pageCount) || 0,
        /* 一条素材可能有多份文件：选材记录要记住"选的是哪一份"，下游（加工编排的文件浏览）也按它取文件 */
        fileNo: fileNo,
        note: it.note || '',
        /* ⚠️ 视频素材要靠 file.duration 做"插入帧"的时长校验，
           这里只留 name/size 会把时长丢掉（曾经就是这个原因，选进来的视频看不出是视频/没有时长） */
        file: it.file ? Object.assign({}, it.file, {
          name: it.file.name, size: Number(it.file.size) || 0
        }) : null,
        addedAt: new Date().toISOString(),
        addedBy: (state.user && state.user.name) || '未知'
      });
      added.push(rec.entries[0]);
    });
    if (added.length) { saveSelections(); notify(); }
    return { added: added, skipped: skipped };
  }

  function removeSelections(taskId, ids) {
    var _lock = lockedGuard(taskId);
    if (_lock) return _lock;
    var rec = selectionOf(taskId);
    var removed = [];
    (ids || []).forEach(function (id) {
      var hit = rec.entries.filter(function (e) { return e.id === id; })[0];
      if (hit) removed.push(hit.title);
    });
    if (!removed.length) return { removed: [] };
    rec.entries = rec.entries.filter(function (e) { return ids.indexOf(e.id) < 0; });
    saveSelections();
    notify();
    return { removed: removed };
  }

  /* ==================================================================
     第 3 阶段「加工编排」的正文

     一个任务一份：{ taskId, chapters: { <大纲节点 id>: { text, savedAt, savedBy } } }
     章节键就是大纲节点 id —— 导航区显示大纲、编排区写这个节点的正文，两边天然对齐。
     ================================================================== */

  function readComposes() {
    var d = readJSON(COMPOSE_KEY);
    if (!d) return false;
    state.composes = d;
    return true;
  }

  function saveComposes() { writeJSON(COMPOSE_KEY, state.composes); }

  function resetComposes() {
    state.composes = clone(App.mock.COMPOSES || {});
    saveComposes();
  }

  function composes() {
    if (!state.composes) state.composes = clone(App.mock.COMPOSES || {});
    return state.composes;
  }

  function composeOf(taskId) {
    var all = composes();
    if (!all[taskId]) all[taskId] = { taskId: taskId, chapters: {}, savedAt: '', savedBy: '' };
    if (!all[taskId].chapters) all[taskId].chapters = {};
    return all[taskId];
  }

  /** 某一章的正文（没写过就返回空记录） */
  function chapterOf(taskId, nodeId) {
    var rec = composeOf(taskId);
    return rec.chapters[nodeId] || { text: '', savedAt: '', savedBy: '' };
  }

  /** 正文字数（中文按字、英文按词都算 1，够用来做进度提示） */
  function wordCount(text) {
    var t = String(text || '').trim();
    if (!t) return 0;
    return t.replace(/\s+/g, '').length;
  }

  /**
   * 保存某一章的正文
   * ⚠️ 与大纲一样：编辑时传 opts.silent = true（只落库不 notify），
   *    否则每敲一个字都整页重渲染、光标会丢。
   */
  function saveChapter(taskId, nodeId, text, opts) {
    var _lock = lockedGuard(taskId);
    if (_lock) return _lock;
    var rec = composeOf(taskId);
    var now = new Date().toISOString();
    var who = (state.user && state.user.name) || '未知';
    rec.chapters[nodeId] = { text: String(text == null ? '' : text), savedAt: now, savedBy: who };
    rec.savedAt = now;
    rec.savedBy = who;
    saveComposes();
    if (!(opts && opts.silent)) notify();
    return rec.chapters[nodeId];
  }

  /** 编排进度：写了多少章 / 共多少章 / 总字数 */
  function composeStats(taskId) {
    var nodes = outlineOf(taskId).nodes || [];
    var rec = composeOf(taskId);
    var written = 0, words = 0;
    nodes.forEach(function (n) {
      var ch = rec.chapters[n.id];
      if (ch && String(ch.text || '').trim()) { written += 1; words += wordCount(ch.text); }
    });
    return { total: nodes.length, written: written, words: words };
  }

  function resetCompose(taskId, opts) {
    var rec = composeOf(taskId);
    rec.chapters = {};
    rec.savedAt = '';
    rec.savedBy = '';
    saveComposes();
    if (!(opts && opts.silent)) notify();
    return rec;
  }

  /* ==================================================================
     审核规则（系统管理 · 归档设置 → 审核规则）

     数据对齐参照系统「档博通档案智能开放鉴定系统」的敏感内容管理：
     敏感内容标题 / 敏感内容（长文本）/ 敏感类型 / 控制标志 / 是否启用。
     ================================================================== */

  var AUDIT_RULE_KEY = 'archive-proto-system:auditRules';

  function readAuditRules() {
    var d = readJSON(AUDIT_RULE_KEY);
    if (!d) return false;
    state.auditRules = d;
    return true;
  }

  function saveAuditRules() { writeJSON(AUDIT_RULE_KEY, state.auditRules); }

  function resetAuditRules() {
    state.auditRules = clone(App.mock.AUDIT_RULES || []);
    saveAuditRules();
  }

  function auditRules() {
    if (!state.auditRules) state.auditRules = clone(App.mock.AUDIT_RULES || []);
    return state.auditRules;
  }

  function auditRuleTypes() { return App.mock.AUDIT_RULE_TYPES || []; }

  function auditControlFlags() { return App.mock.AUDIT_CONTROL_FLAGS || []; }

  function controlFlagTitle(v) {
    var f = auditControlFlags().filter(function (x) { return x.value === v; })[0];
    return f ? f.title : (v || '');
  }

  function getAuditRule(id) {
    return auditRules().filter(function (r) { return r.id === id; })[0] || null;
  }

  /** 审核规则命中判定的最小单位：把长文本按「（一）…（二）…」拆成条款 */
  function auditRuleClauses(rule) {
    if (!rule) return [];
    if (rule.clauses && rule.clauses.length) return rule.clauses;
    var parts = String(rule.content || '').split(/\n+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x; });
    /* 每行就是一条（参照系统的敏感内容就是按（一）（二）逐行排的） */
    return parts.map(function (line, i) {
      var m = line.match(/^（([一二三四五六七八九十]+)）\s*(.*)$/);
      return { no: i + 1, marker: m ? '（' + m[1] + '）' : '', text: (m ? m[2] : line).trim() };
    }).filter(function (c) { return c.text; });
  }

  /** 新增 / 修改 / 删除（id 形如 AR-021，接着现有最大号往后编） */
  function nextAuditRuleId() {
    var max = 0;
    auditRules().forEach(function (r) {
      var n = parseInt(String(r.id).replace(/\D/g, ''), 10) || 0;
      if (n > max) max = n;
    });
    return 'AR-' + String(max + 1).padStart(3, '0');
  }

  function addAuditRule(data) {
    var title = String((data && data.title) || '').trim();
    if (!title) return { ok: false, message: '请填写敏感内容标题' };
    if (auditRules().some(function (r) { return r.title === title; })) {
      return { ok: false, message: '已有同名规则：' + title };
    }
    var typeId = Number(data.typeId) || 0;
    var type = auditRuleTypes().filter(function (t) { return t.id === typeId; })[0];
    var flag = data.controlFlag || (type && type.controlFlag) || 'CONTROL';
    var now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    var rule = {
      id: nextAuditRuleId(), title: title,
      typeId: typeId, typeName: type ? type.name : (data.typeName || ''),
      controlFlag: flag, controlFlagTitle: controlFlagTitle(flag),
      enable: data.enable !== false, createDate: now,
      content: String(data.content || '')
    };
    auditRules().unshift(rule);
    saveAuditRules();
    notify();
    return { ok: true, message: '已新增审核规则「' + title + '」', rule: rule };
  }

  function updateAuditRule(id, data) {
    var rule = getAuditRule(id);
    if (!rule) return { ok: false, message: '规则不存在' };
    var title = String((data && data.title) || '').trim();
    if (!title) return { ok: false, message: '请填写敏感内容标题' };
    if (auditRules().some(function (r) { return r.id !== id && r.title === title; })) {
      return { ok: false, message: '已有同名规则：' + title };
    }
    var typeId = Number(data.typeId) || 0;
    var type = auditRuleTypes().filter(function (t) { return t.id === typeId; })[0];
    var flag = data.controlFlag || rule.controlFlag;
    rule.title = title;
    rule.content = String(data.content || '');
    rule.typeId = typeId || rule.typeId;
    rule.typeName = type ? type.name : rule.typeName;
    rule.controlFlag = flag;
    rule.controlFlagTitle = controlFlagTitle(flag);
    rule.enable = data.enable !== false;
    rule.modifyDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    saveAuditRules();
    notify();
    return { ok: true, message: '已保存审核规则「' + title + '」', rule: rule };
  }

  function deleteAuditRules(ids) {
    var list = ids || [];
    var before = auditRules().length;
    state.auditRules = auditRules().filter(function (r) { return list.indexOf(r.id) < 0; });
    saveAuditRules();
    notify();
    return { ok: true, message: '已删除 ' + (before - state.auditRules.length) + ' 条审核规则' };
  }

  /* ==================================================================
     成果发布（第 5 阶段）：消息中心 + 三步审核流程 + 发布生成成果

     流程按「系统管理 · 流程配置」里配的步骤与审核人走（seed 里三步都配了人）：
       ① 编研部门领导审批 → ② 主管副馆长审批 → ③ 馆长审批
     发起后逐级**推送审核消息**；某一步不通过 → 任务退回第 4 阶段「审核校定」并通知发起人；
     三步都通过 → 成果推送到「编研成果」模块生成数据，任务随之**锁定**（各环节只能看、不能改），
     并生成审核信息表（表 D.1）。
     ================================================================== */

  var MESSAGE_KEY = PREFIX + 'messages';
  var PUBLISH_KEY = PREFIX + 'publish';

  function readMessages() {
    var d = readJSON(MESSAGE_KEY);
    if (!d) return false;
    state.messages = d;
    return true;
  }
  function saveMessages() { writeJSON(MESSAGE_KEY, state.messages); }
  function resetMessages() { state.messages = clone(App.mock.MESSAGES || []); saveMessages(); }

  function messages() {
    if (!state.messages) state.messages = clone(App.mock.MESSAGES || []);
    return state.messages;
  }

  /** 推一条消息（审核消息带 flowNo / taskId，点开就能弹审核界面） */
  function pushMessage(m) {
    var now = new Date().toISOString();
    var msg = {
      id: 'MSG-' + String((messages().length + 1)).padStart(3, '0') + '-' + Date.now().toString(36).slice(-4),
      to: m.to || '', toUserId: m.toUserId || '',
      title: m.title || '', body: m.body || '',
      kind: m.kind || 'info',
      taskId: m.taskId || '', flowNo: m.flowNo || '', stepKey: m.stepKey || '',
      at: now, read: false
    };
    messages().unshift(msg);
    saveMessages();
    notify();
    return msg;
  }

  function messageOf(id) {
    return messages().filter(function (m) { return m.id === id; })[0] || null;
  }

  function readMessage(id) {
    var m = messageOf(id);
    if (!m) return null;
    m.read = true;
    saveMessages();
    notify();
    return m;
  }

  function unreadMessageCount() {
    return messages().filter(function (m) { return !m.read; }).length;
  }

  /** 当前用户的消息（按姓名匹配；原型里用户就是流程审核人） */
  function myMessages() {
    var me = (state.user && state.user.name) || '';
    return messages().filter(function (m) { return !m.to || m.to === me; });
  }

  /* ---------------- 成果发布流程（多步，按流程配置） ---------------- */

  function readPublish() {
    var d = readJSON(PUBLISH_KEY);
    if (!d) return false;
    state.publish = d;
    return true;
  }
  function savePublish() { writeJSON(PUBLISH_KEY, state.publish); }

  /** 已发布任务的写操作统一拦在这里（各阶段只读） */
  var LOCK_MSG = '该任务成果已发布，各环节为只读；如需修改请先由管理员撤回发布';
  function lockedGuard(taskId) {
    return isTaskLocked(taskId) ? { ok: false, locked: true, message: LOCK_MSG } : null;
  }

  /**
   * 某任务的"成果发布流程"视图（页面/审核信息表都用它）。
   * 数据源就是 :flows 里的多步流程记录 —— 步骤、意见、状态都在那儿，不再单独存一份。
   */
  function publishOf(taskId) {
    var list = flows().filter(function (f) {
      return f.type === 'PRODUCT_REVIEW' && f.targetId === taskId;
    });
    var f = list.length ? list[list.length - 1] : null;
    return f ? flowView(f.flowNo) : null;
  }

  /**
   * 把 :flows 里的一条流程记录规范成"审核界面/审核信息表"用的视图对象：
   * steps 一定是**数组**（老的单审核人流程也会补成一步），current 指向当前待审环节的序号。
   */
  function flowView(flowNo) {
    var f = typeof flowNo === 'string' ? getFlow(flowNo) : flowNo;
    if (!f) return null;
    var steps = flowStepsOf(f);
    return {
      flowNo: f.flowNo, type: f.type, taskId: f.targetId, title: f.targetName,
      at: f.at, by: f.by, status: f.status, steps: steps,
      current: (f.steps && f.steps.length) ? f.current : (f.status === 'REVIEWING' ? 0 : -1),
      opinion: f.opinion, reviewedAt: f.reviewedAt || null, reviewedBy: f.reviewedBy || null,
      finishedAt: f.finishedAt || null, publishedAt: f.finishedAt || null,
      productId: f.productId || '', history: f.history || []
    };
  }


  /** 任务是否已发布（发布后各环节锁定，只能查看） */
  function isTaskLocked(taskId) {
    var p = publishOf(taskId);
    var t = getTask(taskId);
    if (!t) return false;
    /* 已发布（published 标记或流程通过）→ 只读；
       种子里的"已完成"任务成果早已登记在编研成果里，同样按只读处理（评审要求：发布后各环节只能看） */
    return !!t.published || !!(p && p.status === 'APPROVED') || t.status === 'DONE';
  }

  /** 第 5 阶段「发起审核」：按流程配置建多步流程 + 给第一步审核人推消息 */
  function startPublishReview(taskId) {
    var t = getTask(taskId);
    if (!t) return { ok: false, message: '任务不存在' };
    if (t.status !== 'IN_PROGRESS') return { ok: false, message: '只有进行中的任务可以发起成果发布审核' };
    if (t.stage !== taskStages().length) {
      return { ok: false, message: '请先把任务推进到第 ' + taskStages().length + ' 阶段「成果发布」' };
    }
    if (isTaskLocked(taskId)) return { ok: false, message: '该任务成果已发布，无需重复发起' };
    var exist = flows().filter(function (f) {
      return f.type === 'PRODUCT_REVIEW' && f.targetId === taskId && f.status === 'REVIEWING';
    })[0];
    if (exist) return { ok: false, message: '已有审核中的流程（' + exist.flowNo + '），请等待审核结果' };
    var f = startFlow('PRODUCT_REVIEW', { id: t.id, name: t.topicName }, { submitOpinion: t.note || '' });
    var cur = flowCurrentStep(f);
    return { ok: true, flowNo: f.flowNo,
      message: '已发起成果发布审核（流程 ' + f.flowNo + '），审核消息已推送给「' +
        (cur ? cur.name + ' · ' + cur.reviewer : '—') + '」' };
  }

  /** 审某任务的成果发布流程的当前环节 */
  function reviewPublishStep(taskId, opts) {
    var f = flows().filter(function (x) {
      return x.type === 'PRODUCT_REVIEW' && x.targetId === taskId;
    }).slice(-1)[0];
    if (!f) return { ok: false, message: '没有进行中的发布流程' };
    return reviewFlowStep(f.flowNo, opts);
  }

  /** 兼容旧名：按流程编号审一步（流程审核模块用） */
  function reviewStepByFlowNo(flowNo, opts) { return reviewFlowStep(flowNo, opts); }

  /** 审核信息表（表 D.1）的数据：名称 / 简介 / 审核人员 / 审核意见 / 备注 —— 全部自动从系统取 */
  function reviewFormOf(taskId) {
    var t = getTask(taskId);
    var rec = publishOf(taskId);
    if (!t) return null;
    var chapters = composeOf(taskId).chapters || {};
    var nodes = outlineOf(taskId).nodes || [];
    var words = 0;
    var intro = '';
    nodes.forEach(function (n) {
      var ch = chapters[n.id];
      if (!ch || !String(ch.text || '').trim()) return;
      words += wordCount(ch.text);
      if (!intro) intro = String(ch.text).replace(/\s+/g, ' ').trim().slice(0, 80);
    });
    var people = [];
    (rec ? rec.steps : []).forEach(function (s) {
      (s.reviewers || []).slice(0, 1).forEach(function (r) {
        people.push({ name: r.name, dept: r.dept || '', role: r.roleLabel || '', step: s.name,
          opinion: s.opinion || '', at: s.at || '', status: s.status });
      });
    });
    /* 审核人员信息表按样例固定 3 行 */
    while (people.length < 3) people.push({ name: '', dept: '', role: '', step: '', opinion: '', at: '', status: '' });
    var opinions = (rec ? rec.steps : []).filter(function (s) { return s.opinion; })
      .map(function (s) { return '【' + s.name + '·' + (s.by || '') + '】' + s.opinion; });
    var last = (rec ? rec.steps : []).filter(function (s) { return s.status === 'PASSED'; }).slice(-1)[0];
    return {
      taskId: t.id, taskNo: t.id, flowNo: rec ? rec.flowNo : '',
      name: t.topicName,
      intro: intro || (t.note || ''),
      words: words, chapters: nodes.length,
      category: t.type,
      people: people.slice(0, 3),
      opinion: opinions.join('；') || '',
      signer: last ? (last.by || '') : '',
      date: rec && rec.publishedAt ? String(rec.publishedAt).slice(0, 10) : '',
      remark: '本表由系统按「成果发布」审核流程自动生成' + (rec ? '（流程 ' + rec.flowNo + '）' : '') +
        '；审核方式：系统内逐级推送审核' + (rec && rec.productId ? '；已生成成果 ' + rec.productId : ''),
      productId: rec ? rec.productId : '',
      status: rec ? rec.status : 'NOT_STARTED',
      steps: rec ? rec.steps : []
    };
  }

  /** 某任务最新的《编研成果审核》流程（兼容旧调用；数据源同样是 :flows） */
  function productReviewOf(taskId) {
    var list = flows().filter(function (f) {
      return f.type === 'PRODUCT_REVIEW' && f.targetId === taskId;
    });
    return list.length ? list[list.length - 1] : null;
  }

  /** 兼容旧入口：发起《编研成果审核》＝发起成果发布审核流程（按流程配置逐级审核） */
  function createProductReview(taskId) {
    return startPublishReview(taskId);
  }

  /** 「重置演示数据」以外的地方不要动消息与发布记录 */
  function resetPublish() { state.publish = {}; savePublish(); }
  function reseedMessages() { resetMessages(); }

  /* ==================================================================
     审核校定（第 4 阶段）的审核结果与修改记录

     结构：{ [taskId]: { runs: { political|professional|compliance: { at, by, items: [] } },
                        fixes: [ { itemId, kind, chapterId, from, to, at, by, mode } ] } }
     审核结果**不预置**：要点了"开始审核"才跑（跑的是 audit.js 里的本地模拟审核引擎）。
     ================================================================== */

  var AUDIT_RESULT_KEY = 'archive-proto-system:auditResults';

  function readAuditResults() {
    var d = readJSON(AUDIT_RESULT_KEY);
    if (!d) return false;
    state.auditResults = d;
    return true;
  }

  function saveAuditResults() { writeJSON(AUDIT_RESULT_KEY, state.auditResults); }

  function optAuditResults() {
    if (!state.auditResults) state.auditResults = {};
    return state.auditResults;
  }

  function auditOf(taskId) {
    var all = optAuditResults();
    if (!all[taskId]) all[taskId] = { taskId: taskId, runs: {}, fixes: [] };
    if (!all[taskId].runs) all[taskId].runs = {};
    if (!all[taskId].fixes) all[taskId].fixes = [];
    return all[taskId];
  }

  /**
   * 审核项的"身份"：同一处问题重复审核时要认得出是同一条。
   * 用 类别 + 章节 + 命中文本（规则命中再加规则 id）—— 位置不作数（改过正文后位置会变）。
   */
  function auditItemKey(it) {
    return [it.kind, it.chapterId, it.ruleId || '', String(it.text || '')].join('|');
  }

  /**
   * 跑完一类审核后把结果存下来。
   * ⚠ **追加而不是覆盖**（评审要求）：之前审核出的问题（含已校定 / 已忽略的状态）保留，
   * 这次新发现的才追加进来 —— 否则"改完再审核"会把历史处理结果冲掉。
   * @returns {{run:object, added:number, kept:number}}
   */
  function saveAuditRun(taskId, kind, items) {
    var _lock = lockedGuard(taskId);
    if (_lock) return _lock;
    var rec = auditOf(taskId);
    var prev = (rec.runs[kind] && rec.runs[kind].items) || [];
    var seen = {};
    prev.forEach(function (it) { seen[auditItemKey(it)] = true; });
    var added = [];
    (items || []).forEach(function (it) {
      var key = auditItemKey(it);
      if (seen[key]) return;              /* 老问题：保留原来那条（状态 / 修改信息都在） */
      seen[key] = true;
      added.push(it);
    });
    rec.runs[kind] = {
      at: new Date().toISOString(),
      by: (state.user && state.user.name) || '未知',
      items: prev.concat(added)
    };
    saveAuditResults();
    notify();
    return { run: rec.runs[kind], added: added.length, kept: prev.length };
  }

  /** 还没处理（未校定）的审核项 —— 重跑审核前要求先处理完 */
  function pendingAuditItems(taskId) {
    var rec = auditOf(taskId);
    var out = [];
    ['political', 'professional', 'compliance'].forEach(function (k) {
      var run = rec.runs[k];
      if (!run) return;
      run.items.forEach(function (it) {
        if (it.status === 'open') out.push(it);
      });
    });
    return out;
  }

  function auditItems(taskId, kind) {
    var run = auditOf(taskId).runs[kind];
    return run ? run.items : null;      /* null = 这类还没跑过 */
  }

  /** 把某一项的片段替换成新文本（改的是**章节正文**本身），并把后续项的位置顺移 */
  function replaceFragment(taskId, chapterId, start, end, newText) {
    var ch = chapterOf(taskId, chapterId);
    var text = String(ch.text || '');
    if (start < 0 || end > text.length || start > end) {
      return { ok: false, message: '片段位置已失效，请重新审核' };
    }
    var from = text.slice(start, end);
    var next = text.slice(0, start) + newText + text.slice(end);
    saveChapter(taskId, chapterId, next, { silent: true });

    var delta = newText.length - from.length;
    var rec = auditOf(taskId);
    Object.keys(rec.runs).forEach(function (kind) {
      var keep = [];
      rec.runs[kind].items.forEach(function (it) {
        if (it.chapterId !== chapterId) { keep.push(it); return; }
        /* 与修改范围重叠的项：已经被这次修改覆盖，去掉 */
        if (it.start < end && it.end > start) return;
        if (it.start >= end) { it.start += delta; it.end += delta; }
        if (it.hits) {
          it.hits = it.hits.filter(function (h) {
            if (h.start < end && h.end > start) return false;
            if (h.start >= end) { h.start += delta; h.end += delta; }
            return true;
          });
        }
        keep.push(it);
      });
      rec.runs[kind].items = keep;
    });
    saveAuditResults();
    notify();
    return { ok: true, message: '已修改片段', from: from, to: newText };
  }

  /** 采用建议（AI 自动修改 / 手工改）→ 改正文 + 标记该项已修改 + 记修改信息 */
  function fixAuditItem(taskId, kind, itemId, opts) {
    var _lock = lockedGuard(taskId);
    if (_lock) return _lock;
    var rec = auditOf(taskId);
    var run = rec.runs[kind];
    if (!run) return { ok: false, message: '这类审核还没跑过' };
    var it = run.items.filter(function (x) { return x.id === itemId; })[0];
    if (!it) return { ok: false, message: '审核项不存在' };
    var to = (opts && opts.text != null) ? String(opts.text) : String(it.suggestion || '');
    if (!to) return { ok: false, message: '这一项没有可用的修改建议，请手工填写' };
    var from = it.text;
    var r = replaceFragment(taskId, it.chapterId, it.start, it.end, to);
    if (!r.ok) return r;
    /* replaceFragment 会把重叠项删掉 —— 这里把本项补回去并标记已修改 */
    run.items.push(Object.assign({}, it, {
      status: 'fixed',
      fix: { itemId: it.id, kind: kind, chapterId: it.chapterId, chapterTitle: it.chapterTitle,
        start: it.start, from: from, to: to, at: new Date().toISOString(),
        by: (state.user && state.user.name) || '未知',
        mode: (opts && opts.mode) || 'manual',
        reason: it.ruleTitle || it.title || '' }
    }));
    rec.fixes.unshift(run.items[run.items.length - 1].fix);
    saveAuditResults();
    notify();
    return { ok: true, message: '已' + (((opts && opts.mode) === 'ai') ? '由 AI 自动修改' : '修改') +
      '：「' + from + '」→「' + to + '」', item: run.items[run.items.length - 1] };
  }

  /**
   * 标注已修改：正文由用户在"校定内容"界面里改过了，这里只做**标注 + 记录修改信息**。
   * 取当前正文里该位置的片段与命中时的原文对比：
   *   · 变了 → 记为一次修改（原文 → 改后）
   *   · 没变 → 记为"人工确认"（from === to，修改记录里看得出来）
   */
  function markAuditFixed(taskId, kind, itemId, opts) {
    var _lock = lockedGuard(taskId);
    if (_lock) return _lock;
    var rec = auditOf(taskId);
    var run = rec.runs[kind];
    if (!run) return { ok: false, message: '这类审核还没跑过' };
    var it = run.items.filter(function (x) { return x.id === itemId; })[0];
    if (!it) return { ok: false, message: '审核项不存在' };
    var text = String(chapterOf(taskId, it.chapterId).text || '');
    var now = text.slice(it.start, it.start + Math.max(it.end - it.start, 0));
    var fix = {
      itemId: it.id, kind: kind, chapterId: it.chapterId, chapterTitle: it.chapterTitle,
      start: it.start, from: it.text, to: now, at: new Date().toISOString(),
      by: (state.user && state.user.name) || '未知',
      mode: 'mark',
      reason: it.ruleTitle || it.title || '',
      note: (opts && opts.note) || (now === it.text ? '人工确认（正文未变）' : '在校定界面修改后标注')
    };
    it.status = 'fixed';
    it.fix = fix;
    rec.fixes.unshift(fix);
    saveAuditResults();
    notify();
    return {
      ok: true,
      message: (now === it.text ? '已标注为「已修改」（正文未变，记录为人工确认）'
        : '已标注「已修改」：「' + it.text + '」→「' + now + '」'),
      item: it
    };
  }

  function ignoreAuditItem(taskId, kind, itemId, note) {
    var _lock = lockedGuard(taskId);
    if (_lock) return _lock;
    var rec = auditOf(taskId);
    var run = rec.runs[kind];
    if (!run) return { ok: false, message: '这类审核还没跑过' };
    var it = run.items.filter(function (x) { return x.id === itemId; })[0];
    if (!it) return { ok: false, message: '审核项不存在' };
    it.status = 'ignored';
    it.ignoreNote = note || '';
    saveAuditResults();
    notify();
    return { ok: true, message: '已忽略该项（可再次审核重新命中）' };
  }

  function resetAudit(taskId) {
    /* 默认审核结果是**写进代码的种子数据**（mock.AUDIT_RESULTS）：
       重置某个任务的审核结果＝回到那份默认结果，而不是变成"一片空白" */
    delete optAuditResults()[taskId];
    seedDefaultAuditResults();
    saveAuditResults();
    notify();
  }

  /* ------------------------------------------------------------------
     默认审核结果（评审要求：审核校定环节**一打开就要有审核结果**，而且这份数据不能丢）

     数据来源：mock.js 的 AUDIT_RESULTS —— 它只声明"谁、什么时候审的"与
     **已经处理过的项**（已校定 / 已忽略）；命中项本体由**本地审核引擎**
     （js/audit.js）现扫一遍种子正文算出，与页面点「一键全部审核」的结果完全一致。

     三个要点：
       · **不写死位置**：按「类别 + 章节 + 命中文本」认项，正文改了位置跟着变；
       · **不覆盖用户结果**：某个任务只要已经有审核记录（用户自己跑过 / 处理过），就整条跳过；
       · **不会丢**：种子版本变化时会照这里重新生成（而不是只剩浏览器里的旧数据）。
     认不上的项记进 state.auditSeedMisses，供验证套件断言"种子里没有写错的项"。
     ------------------------------------------------------------------ */
  function seedDefaultAuditResults() {
    var seeds = (App.mock && App.mock.AUDIT_RESULTS) || {};
    var all = optAuditResults();
    var seeded = 0;
    if (!state.auditSeedMisses) state.auditSeedMisses = [];
    if (!App.audit || typeof App.audit.run !== 'function') return;   /* 引擎还没加载（脚本顺序） */

    Object.keys(seeds).forEach(function (taskId) {
      var seed = seeds[taskId] || {};
      /* 任务不在种子里（编号写错 / 任务被删）：不播种，免得留下一条"不存在任务的审核结果" */
      if (!tasks().some(function (t) { return t.id === taskId; })) return;
      var rec = all[taskId];
      if (rec && Object.keys(rec.runs || {}).length) return;        /* 已有审核记录：保留 */
      var handled = (seed.handled || []).slice();
      var used = [];
      var runs = {};
      var fixes = [];

      ['political', 'professional', 'compliance'].forEach(function (kind) {
        var items = App.audit.run(taskId, kind) || [];
        items.forEach(function (it) {
          var hit = null;
          for (var i = 0; i < handled.length; i++) {
            var h = handled[i];
            if (h.kind === it.kind && h.chapterId === it.chapterId && h.text === it.text) {
              hit = h;
              used.push(i);
              break;
            }
          }
          if (!hit) return;
          if (hit.status === 'ignored') {
            it.status = 'ignored';
            it.ignoreNote = hit.note || '';
          } else if (hit.status === 'fixed') {
            it.status = 'fixed';
            it.fix = {
              itemId: it.id, kind: it.kind, chapterId: it.chapterId, chapterTitle: it.chapterTitle,
              start: it.start, from: it.text, to: it.text,
              at: seed.at || '', by: seed.by || '系统预置',
              mode: hit.mode || 'mark', reason: it.ruleTitle || it.title || '',
              note: hit.note || '人工确认（正文未变）'
            };
            fixes.unshift(it.fix);
          }
        });
        /* 三类都记一条"审核记录"（没有命中就是"已审核·无问题"），与点一键审核一致；
           seeded 标记它是**默认审核结果**（页面上会写明，用户自己重跑后就没有这个标记了） */
        runs[kind] = { at: seed.at || '', by: seed.by || '系统预置', items: items, seeded: true };
      });

      handled.forEach(function (h, i) {
        if (used.indexOf(i) < 0) {
          state.auditSeedMisses.push(taskId + '｜' + h.kind + '｜' + h.chapterId + '｜' + h.text);
        }
      });

      all[taskId] = { taskId: taskId, runs: runs, fixes: fixes };
      seeded++;
    });
    if (seeded) saveAuditResults();
  }

  /** 汇总：每类的命中/待处理/已修改/已忽略，以及历史修改条数 */
  function auditSummary(taskId) {
    var rec = auditOf(taskId);
    var out = { kinds: {}, fixes: rec.fixes.length, hasRun: false };
    ['political', 'professional', 'compliance'].forEach(function (k) {
      var run = rec.runs[k];
      if (run) out.hasRun = true;
      var items = run ? run.items : [];
      out.kinds[k] = {
        ran: !!run, at: run ? run.at : '', by: run ? run.by : '',
        /* seeded＝这条审核记录来自**默认审核结果**（种子），不是用户自己跑的 */
        seeded: !!(run && run.seeded),
        total: items.length,
        open: items.filter(function (i) { return i.status === 'open'; }).length,
        fixed: items.filter(function (i) { return i.status === 'fixed'; }).length,
        ignored: items.filter(function (i) { return i.status === 'ignored'; }).length
      };
    });
    out.open = out.kinds.political.open + out.kinds.professional.open + out.kinds.compliance.open;
    out.total = out.kinds.political.total + out.kinds.professional.total + out.kinds.compliance.total;
    return out;
  }

  /* ==================================================================
     编研成果
     ================================================================== */

  function readProducts() {
    var d = readJSON(PRODUCTS_KEY);
    if (!d) return false;
    state.products = d;
    return true;
  }

  function saveProducts() { writeJSON(PRODUCTS_KEY, state.products); }

  function resetProducts() {
    state.products = clone(App.mock.PRODUCTS);
    saveProducts();
  }

  function products() {
    if (!state.products) state.products = clone(App.mock.PRODUCTS);
    return state.products;
  }

  function getProduct(id) {
    return products().filter(function (p) { return p.id === id; })[0] || null;
  }

  /**
   * 某编研任务发布的成果（**一个任务可以有多部成果**，如多卷本、多版本）
   * 按发布时间倒序，最新的在前。
   */
  function productsOfTask(taskId) {
    return products().filter(function (p) { return p.taskId === taskId; })
      .sort(function (a, b) { return String(b.publishedAt).localeCompare(String(a.publishedAt)); });
  }

  function productOfTask(taskId) { return productsOfTask(taskId)[0] || null; }

  function nextProductId() {
    var max = products().reduce(function (m, p) {
      var n = parseInt(String(p.id).replace(/\D/g, ''), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return 'CP-' + String(max + 1).padStart(3, '0');
  }

  /** 按编研类型统计成果数（工作台图表现算） */
  function productCountByType() {
    var out = {};
    products().forEach(function (p) { out[p.type] = (out[p.type] || 0) + 1; });
    return out;
  }

  /**
   * 登记发布成果（编研任务第 6 阶段「成果发布」产生）
   * 规则：必须来自某个编研任务、任务须已完成、名称不能为空；
   *       **允许多部成果关联同一个任务**。
   */
  function addProduct(data) {
    if (!data.taskId) return { ok: false, message: '编研成果必须关联来源编研任务' };
    var t = getTask(data.taskId);
    if (!t) return { ok: false, message: '关联的编研任务不存在' };
    if (t.status !== 'DONE') return { ok: false, message: '只有已完成的任务才能登记成果' };
    if (!String(data.title || '').trim()) return { ok: false, message: '成果名称不能为空' };

    var p = {
      id: nextProductId(),
      title: String(data.title).trim(),
      type: data.type || '档案文献汇编',
      taskId: t.id,
      compiledBy: data.compiledBy || ((state.user && state.user.name) || '未知'),
      publishedAt: data.publishedAt || new Date().toISOString().slice(0, 10),
      words: Number(data.words) || 0,
      formats: (data.formats && data.formats.length) ? data.formats.slice() : ['PDF'],
      security: data.security || '公开',
      summary: String(data.summary || '').trim()
    };
    products().unshift(p);
    saveProducts();
    notify();
    return { ok: true, message: '已登记成果「' + p.title + '」', product: p };
  }

  /* ==================================================================
     材料归档
     —— 归档材料（按编研任务组织）+ 归档字段字典（归档设置维护后者）
     ================================================================== */

  function readArchive() {
    var d = readJSON(ARCHIVE_KEY);
    if (!d) return false;
    state.archiveItems = d.items || [];
    state.archiveFields = d.fields || null;
    return true;
  }

  function saveArchive() {
    writeJSON(ARCHIVE_KEY, { items: state.archiveItems, fields: archiveFields() });
  }

  function resetArchive() {
    state.archiveItems = clone(App.mock.ARCHIVE_ITEMS);
    state.archiveFields = clone(App.mock.ARCHIVE_FIELDS);
    saveArchive();
  }

  function archiveItems() {
    if (!state.archiveItems) state.archiveItems = clone(App.mock.ARCHIVE_ITEMS);
    return state.archiveItems;
  }

  function archiveOfTask(taskId) {
    return archiveItems().filter(function (a) { return a.taskId === taskId; })
      .sort(function (a, b) {
        return (a.stage - b.stage) || String(a.formedAt).localeCompare(String(b.formedAt));
      });
  }

  function archiveCount(taskId) {
    return taskId ? archiveOfTask(taskId).length : archiveItems().length;
  }

  function archiveCategories() {
    var seen = {}, out = [];
    archiveItems().forEach(function (a) {
      if (!seen[a.category]) { seen[a.category] = 1; out.push(a.category); }
    });
    return out;
  }

  /* ==================================================================
     归档材料的增删改（评审要求：每条目录都能修改，也能新增数据）

     字段来自「归档设置」的字典 —— 表单与列表同一份口径：归档设置里加一个字段，
     材料归档的列表列与录入表单会同时出现它（这里是"配置驱动"的落点）。
     ================================================================== */

  function archiveItemOf(id) {
    return archiveItems().filter(function (a) { return a.id === id; })[0] || null;
  }

  function nextArchiveItemId() {
    var max = 0;
    archiveItems().forEach(function (a) {
      var m = /^AR-(\d+)$/.exec(String(a.id));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'AR-' + String(max + 1).padStart(4, '0');
  }

  /** 「所属阶段」的可选值：立项 + 五个阶段（列表里显示成"第 N 阶段 · 名称"） */
  function archiveStageChoices() {
    return [{ value: 0, label: '立项' }].concat(taskStages().map(function (st, i) {
      return { value: i + 1, label: '第 ' + (i + 1) + ' 阶段 · ' + st.title };
    }));
  }

  function archiveStageLabel(n) {
    n = parseInt(n, 10) || 0;
    return n === 0 ? '立项' : String(((taskStages()[n - 1] || {}).title) || '');
  }

  /** 用字段字典把表单数据规整成一条归档材料（新字段自动带上；日期/数字按类型收口） */
  function buildArchiveItem(data) {
    var item = {};
    archiveFields().forEach(function (f) {
      var raw = data[f.key];
      if (f.type === '数字') item[f.key] = Math.max(0, parseInt(raw, 10) || 0);
      else item[f.key] = String(raw === undefined || raw === null ? '' : raw).trim();
    });
    item.stage = parseInt(data.stage, 10) || 0;
    item.stageLabel = archiveStageLabel(item.stage);
    item.attachments = (data.attachments || []).map(function (a) {
      var m = /\.([A-Za-z0-9]+)$/.exec(String(a.name || ''));
      return { name: String(a.name || '').trim(), size: Number(a.size) || 0,
        format: String(a.format || (m ? m[1].toUpperCase() : '')).trim() };
    }).filter(function (a) { return !!a.name; });
    return item;
  }

  /** 必填校验取字段字典的 required（材料名称默认必填，字段可改） */
  function validateArchiveItem(data) {
    var missing = archiveFields().filter(function (f) {
      var v = data[f.key];
      return f.required && !String(v === undefined || v === null ? '' : v).trim();
    });
    if (missing.length) {
      return { ok: false, message: '请填写' + missing.map(function (f) { return '「' + f.name + '」'; }).join('、') };
    }
    return { ok: true };
  }

  function addArchiveItem(data) {
    var t = getTask(data.taskId);
    if (!t) return { ok: false, message: '请选择所属编研任务' };
    var v = validateArchiveItem(data);
    if (!v.ok) return v;
    var item = buildArchiveItem(data);
    item.id = nextArchiveItemId();
    item.taskId = t.id;
    item.taskTopic = t.topicName;
    item.createdAt = new Date().toISOString();
    item.updatedAt = item.createdAt;
    item.updatedBy = (state.user && state.user.name) || '';
    item.manual = true;
    archiveItems().unshift(item);
    saveArchive();
    notify();
    return { ok: true, item: item, message: '已新增归档材料「' + item.name + '」' };
  }

  function updateArchiveItem(id, data) {
    var item = archiveItemOf(id);
    if (!item) return { ok: false, message: '归档材料不存在' };
    var t = getTask(data.taskId || item.taskId);
    if (!t) return { ok: false, message: '请选择所属编研任务' };
    var v = validateArchiveItem(data);
    if (!v.ok) return v;
    var next = buildArchiveItem(data);
    Object.keys(next).forEach(function (k) { item[k] = next[k]; });
    item.taskId = t.id;
    item.taskTopic = t.topicName;
    item.manual = true;         /* 人工改过的条目：自动归档不再覆盖 */
    item.updatedAt = new Date().toISOString();
    item.updatedBy = (state.user && state.user.name) || '';
    saveArchive();
    notify();
    return { ok: true, item: item, message: '已保存「' + item.name + '」的修改' };
  }

  function deleteArchiveItems(ids) {
    var names = [];
    (ids || []).forEach(function (id) {
      var item = archiveItemOf(id);
      if (item) names.push(item.name);
    });
    if (!names.length) return { ok: false, message: '没有可删除的归档材料' };
    state.archiveItems = archiveItems().filter(function (a) { return ids.indexOf(a.id) < 0; });
    saveArchive();
    notify();
    return { ok: true, deleted: names,
      message: names.length === 1 ? '已删除「' + names[0] + '」' : '已删除 ' + names.length + ' 件归档材料' };
  }

  /* ==================================================================
     成果发布审核通过后的自动归档（评审要求）

     四类材料随编研任务一起归档：
       ① 选题可行性评估表及附件（附件清单挂在这一条目里）② 审核意见表
       ③ 确定选材环节的素材目录（只生成目录表，不含素材文件）④ 编研成果定稿
     幂等：同一个任务、同一类材料只补一次（`autoKey` 认人），人工改过的条目不覆盖。
     ================================================================== */

  var PUBLISH_ARCHIVE_DEFS = [
    { key: 'topic-form', name: '选题可行性评估表及附件', category: '立项材料', stage: 0,
      format: 'PDF+OFD', retention: '永久', carrier: '电子',
      /* 种子里每个任务本来就有一条「选题可行性评估表」（立项材料）：把附件并进它，
         而不是再加一行——材料名称按评审要求改成「选题可行性评估表及附件」 */
      mergeWith: function (a) { return a.stage === 0 && a.name === '选题可行性评估表'; } },
    { key: 'audit-form', name: '审核意见表', category: '审校记录', stage: 5,
      format: 'PDF+OFD', retention: '永久', carrier: '电子' },
    { key: 'material-catalog', name: '素材目录', category: '选材材料', stage: 2,
      format: 'PDF', retention: '长期', carrier: '电子',
      mergeWith: function (a) { return a.stage === 2 && String(a.name).indexOf('选材清单') === 0; } },
    { key: 'final-draft', name: '编研成果定稿', category: '成果文件', stage: 5,
      format: 'PDF+OFD', retention: '永久', carrier: '电子',
      mergeWith: function (a) { return a.stage === 5 && a.name === '成果正式文件'; } }
  ];

  function autoArchiveOf(taskId) {
    return archiveOfTask(taskId).filter(function (a) { return a.auto === 'publish'; });
  }

  /** 《选题可行性评估表》的附件：取立选项题上登记的附件（原型不存实体文件，只登记名称/大小/格式） */
  function topicAttachmentsOf(taskId) {
    var t = getTask(taskId);
    var topic = t && t.topicId ? getTopic(t.topicId) : null;
    return (((topic && topic.attachments) || [])).map(function (a) {
      var m = /\.([A-Za-z0-9]+)$/.exec(String(a.name || ''));
      return { name: a.name, size: Number(a.size) || 0, format: m ? m[1].toUpperCase() : '' };
    });
  }

  /**
   * 把"发布审核通过后应归档的四类材料"补进材料归档。
   * @param {string} taskId
   * @param {Object} [product] 编研成果（缺省取该任务已登记的成果）
   * @param {Object} [flow]    成果发布流程（缺省取最近一次通过的流程）
   * @returns {{added:Array}}
   */
  function autoArchiveProduct(taskId, product, flow) {
    var t = getTask(taskId);
    if (!t) return { added: [] };
    var p = product || productOfTask(taskId);
    if (!p) return { added: [] };              /* 没有成果 = 发布流程还没走完 */
    var f = flow || flows().filter(function (x) {
      return x.type === 'PRODUCT_REVIEW' && x.targetId === taskId && x.status === 'APPROVED';
    }).slice(-1)[0] || null;
    var now = new Date().toISOString();
    var pubDate = String((f && (f.finishedAt || f.at)) || p.publishedAt || now).slice(0, 10);
    var words = Number(p.words) || 0;
    var selCount = selectionOf(taskId).entries.length;
    var attach = topicAttachmentsOf(taskId);
    var stageDate = function (stage) {
      var h = (t.stageHistory || []).filter(function (x) { return x.stage === stage; })[0];
      return String((h && h.at) || t.createdAt || now).slice(0, 10);
    };
    var detail = {
      'topic-form': { pages: 6, formedAt: stageDate(0), note: '立项时填报的《选题可行性评估表》' +
          (attach.length ? '，含 ' + attach.length + ' 个附件（附件清单见本条目的「附件」）' : '（无附件）'),
        attachments: attach },
      'audit-form': { pages: 2, formedAt: pubDate, note: '表 D.1《审核意见表》：含各级审核意见、签字与日期' +
          (f ? '（流程 ' + f.flowNo + '）' : ''), attachments: [] },
      'material-catalog': { pages: 1 + Math.ceil(selCount / 12), formedAt: stageDate(2),
        note: '确定选材环节生成的素材目录表，共 ' + selCount + ' 条（仅目录，不含素材文件）', attachments: [] },
      'final-draft': { pages: Math.max(1, Math.ceil(words / 800)), formedAt: pubDate,
        note: '编研成果定稿：' + (words || 0) + ' 字，格式 ' + ((p.formats || []).join('+') || 'PDF'),
        attachments: [] }
    };
    var added = [];
    PUBLISH_ARCHIVE_DEFS.forEach(function (def) {
      var exist = autoArchiveOf(taskId).filter(function (a) { return a.autoKey === def.key; })[0];
      if (exist) {
        /* 种子里的历史成果没有附件清单：没人改过就补一次（人工改过的不动） */
        if (!exist.manual && def.key === 'topic-form' && attach.length &&
            !(exist.attachments || []).length) {
          exist.attachments = attach;
          added.push(exist);
        }
        return;
      }
      /* 既有过程材料能对上号：并成一条（改名/改格式/挂附件/标自动归档），不新增重复行 */
      var merge = def.mergeWith ? archiveOfTask(taskId).filter(function (a) {
        return !a.auto && def.mergeWith(a);
      })[0] : null;
      var d = detail[def.key] || {};
      if (merge) {
        merge.name = def.name;
        merge.category = def.category;
        merge.stage = def.stage;
        merge.stageLabel = archiveStageLabel(def.stage);
        merge.format = def.format;
        merge.retention = def.retention;
        merge.carrier = def.carrier;
        merge.note = [merge.note, d.note].filter(Boolean).join('　');
        merge.attachments = (d.attachments || []).concat(merge.attachments || []);
        merge.security = p.security || merge.security || '公开';
        merge.auto = 'publish';
        merge.autoKey = def.key;
        merge.flowNo = f ? f.flowNo : '';
        merge.productId = p.id || '';
        merge.updatedAt = now;
        merge.updatedBy = '系统自动归档';
        added.push(merge);
        return;
      }
      archiveItems().push({
        id: nextArchiveItemId(),
        taskId: t.id, taskTopic: t.topicName,
        name: def.name, category: def.category,
        stage: def.stage, stageLabel: archiveStageLabel(def.stage),
        format: def.format, pages: d.pages || 1, copies: 1, carrier: def.carrier,
        formedAt: d.formedAt || pubDate, archivedAt: pubDate,
        archivist: (t.team && t.team.archivist) || ((state.user && state.user.name) || '系统'),
        retention: def.retention, security: p.security || '公开',
        fileNo: t.id + '-' + def.stage + String(archiveItems().length % 9 + 1),
        note: d.note || '',
        attachments: d.attachments || [],
        auto: 'publish', autoKey: def.key,
        flowNo: f ? f.flowNo : '', productId: p.id || '',
        createdAt: now, updatedAt: now, updatedBy: '系统自动归档'
      });
      added.push(archiveItems()[archiveItems().length - 1]);
    });
    if (added.length) { saveArchive(); notify(); }
    return { added: added };
  }

  /**
   * 给"已完成且已登记编研成果"的任务补齐这四类材料。
   * 种子里早年的成果没走过这次加的流程，补齐后各任务的归档口径才一致。
   */
  function syncPublishedArchives() {
    var added = [];
    tasks().forEach(function (t) {
      var p = productOfTask(t.id);
      if (!p && !t.published) return;
      added = added.concat(autoArchiveProduct(t.id, p, null).added);
    });
    return added;
  }

  /**
   * 「素材目录」条目里的目录表：直接由该任务的**选材库**派生
   * （发布后任务锁定、选材库已冻结，派生结果等价于发布那一刻的快照；
   *   这样种子里的历史成果与人工新增的条目都能看到真实的目录，不用另存一份）
   */
  function archiveCatalog(item) {
    if (!item) return [];
    var byName = String(item.name || '').indexOf('素材目录') >= 0;
    if (!byName && item.autoKey !== 'material-catalog') return [];
    return selectionOf(item.taskId).entries.map(function (e, i) {
      return {
        no: i + 1, id: e.id, title: e.title, archiveNo: e.archiveNo,
        category: e.category || '', source: e.source === 'library' ? '素材库' : '档案检索',
        scope: e.scope === 'pages' ? pagesText(e.pages) : '整份文件',
        pageCount: e.pageCount || 0,
        file: e.file ? e.file.name : '', size: e.file ? e.file.size : 0
      };
    });
  }

  /* ---- 归档字段字典 ---- */

  function archiveFields() {
    if (!state.archiveFields) state.archiveFields = clone(App.mock.ARCHIVE_FIELDS);
    return state.archiveFields;
  }

  function getArchiveField(key) {
    return archiveFields().filter(function (f) { return f.key === key; })[0] || null;
  }

  /**
   * 材料归档列表当前显示的列（列序即字典顺序）
   * 注意：字段的 required 只表示「录入时必填」，**不影响能否删除或隐藏** ——
   * 所有著录项都可以改名、隐藏、删除（评审要求，材料名称也不例外）。
   */
  function archiveColumns() {
    return archiveFields().filter(function (f) { return !!f.visible; })
      .map(function (f) { return f.key; });
  }

  function setArchiveColumns(keys) {
    var want = keys || [];
    archiveFields().forEach(function (f) { f.visible = want.indexOf(f.key) >= 0; });
    saveArchive();
    notify();
    return archiveColumns();
  }

  function archiveFieldNameExists(name, exceptKey) {
    var key = String(name || '').trim();
    return archiveFields().some(function (f) {
      return f.key !== exceptKey && f.name.trim() === key;
    });
  }

  function nextArchiveFieldKey() {
    var n = 0;
    archiveFields().forEach(function (f) {
      var m = /^f(\d+)$/.exec(f.key);
      if (m) n = Math.max(n, parseInt(m[1], 10));
    });
    return 'f' + (n + 1);
  }

  /** 按类型清理无关属性：日期不要长度、文本不要小数位 */
  function normalizeField(data) {
    var f = {
      key: null,
      name: String(data.name || '').trim(),
      hint: String(data.hint || '').trim(),
      type: App.mock.ARCHIVE_FIELD_TYPES.indexOf(data.type) >= 0 ? data.type : '文本',
      dateFormat: '',
      totalLength: 0,
      decimalLength: 0,
      required: !!data.required,
      visible: data.visible === undefined ? true : !!data.visible,
      meta: data.meta || '',
      dict: data.dict || '无',
      defaultType: data.defaultType || '无'
    };
    if (f.type === '日期') {
      f.dateFormat = data.dateFormat || 'YYYY-MM-DD';
    } else {
      f.totalLength = Math.max(1, parseInt(data.totalLength, 10) || 0);
      if (f.type === '数字') f.decimalLength = Math.max(0, parseInt(data.decimalLength, 10) || 0);
    }
    return f;
  }

  function addArchiveField(data) {
    var name = String(data.name || '').trim();
    if (!name) return { ok: false, message: '字段名称不能为空' };
    if (archiveFieldNameExists(name)) return { ok: false, message: '已存在同名字段：' + name };
    var f = normalizeField(data);
    f.key = nextArchiveFieldKey();
    archiveFields().push(f);
    saveArchive();
    notify();
    return { ok: true, message: '已新增字段「' + f.name + '」', field: f };
  }

  function updateArchiveField(key, data) {
    var f = getArchiveField(key);
    if (!f) return { ok: false, message: '字段不存在' };
    var name = String(data.name || '').trim();
    if (!name) return { ok: false, message: '字段名称不能为空' };
    if (archiveFieldNameExists(name, key)) return { ok: false, message: '已存在同名字段：' + name };
    var next = normalizeField(data);
    next.key = f.key;
    Object.keys(next).forEach(function (k) { f[k] = next[k]; });
    saveArchive();
    notify();
    return { ok: true, message: '已保存字段「' + f.name + '」', field: f };
  }

  function deleteArchiveFields(keys) {
    var deleted = [];
    (keys || []).forEach(function (k) {
      var f = getArchiveField(k);
      if (!f) return;
      deleted.push(f.name);
      state.archiveFields = archiveFields().filter(function (x) { return x.key !== k; });
    });
    if (deleted.length) { saveArchive(); notify(); }
    return { deleted: deleted, skipped: [] };
  }

  /* ==================================================================
     审核校定（立项审核 + 成果审核，两类流程共用）
     ================================================================== */

  function flows() {
    if (!state.flows) state.flows = clone(App.mock.REVIEW_FLOWS);
    return state.flows;
  }

  function getFlow(flowNo) {
    return flows().filter(function (f) { return f.flowNo === flowNo; })[0] || null;
  }

  function flowsOfType(type) {
    return flows().filter(function (f) { return !type || f.type === type; });
  }

  /** 权限：admin 可见全部；其他用户只看"需自己审核"或"自己发起/审过"的流程 */
  function canSeeFlow(f, user) {
    user = user || state.user;
    if (!user) return false;
    if (user.isAdmin) return true;
    if (f.reviewer === user.name || f.by === user.name || f.reviewedBy === user.name) return true;
    /* 多步流程：任一环节的审核人、审核过的人都要能看到（评审要求：发起或审核都在流程审核页生成数据） */
    return flowStepsOf(f).some(function (s) {
      return s.by === user.name || s.reviewer === user.name ||
        (s.reviewers || []).some(function (r) { return r.name === user.name; });
    });
  }

  /** 能否审批：审核中 且（是它指定的审核人 或 admin） */
  function canReviewFlow(f, user) {
    user = user || state.user;
    if (!f || !user) return false;
    if (f.status !== 'REVIEWING') return false;
    return !!user.isAdmin || f.reviewer === user.name;
  }

  /** 角色为「审核人员」的用户名（默认审核人，原型假设） */
  function defaultReviewer() {
    var u = users().filter(function (x) { return x.role === 'REVIEWER'; })[0];
    return u ? u.name : '';
  }

  /** 流程编号：前缀 LX（立项审核）/ SH（成果审核），两类共用一个序号池 */
  function nextFlowNo(prefix) {
    state.flowSeq = (state.flowSeq || 0) + 1;
    return (prefix || 'LX') + '-' + new Date().getFullYear() + '-' + String(state.flowSeq).padStart(4, '0');
  }

  function pushFlowHistory(f, action, opinion) {
    f.history = f.history || [];
    f.history.push({
      at: new Date().toISOString(),
      by: (state.user && state.user.name) || '未知',
      action: action,
      opinion: opinion || ''
    });
  }


  /* ---------------- 多步流程引擎（选题立项审核 / 编研成果审核共用） ----------------
     评审要求：两类流程都按「流程配置」的步骤与审核人走，**发起或审核都要在对应用户的
     流程审核页面生成数据** —— 所以步骤级状态直接落在 :flows 记录里（reviewer 始终指向
     "当前环节审核人"，这样上面的 canSeeFlow / canReviewFlow 不用改）。 */

  /** 按流程配置生成步骤快照（发起时冻结，之后改配置不影响已发起的流程） */
  function flowStepsSnapshot() {
    return flowSteps().map(function (s) {
      var rs = (s.reviewers || []).slice();
      return {
        key: s.key, name: s.name, icon: s.icon || 'file-text',
        reviewers: rs.map(function (r) { return { name: r.name, roleLabel: r.roleLabel, dept: r.dept }; }),
        reviewer: rs.length ? rs[0].name : '',
        status: rs.length ? 'PENDING' : 'SKIPPED',
        opinion: '', at: '', by: ''
      };
    });
  }

  function firstPendingStepOf(steps) {
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].status === 'PENDING') return i;
    }
    return -1;
  }

  /** 流程的步骤序列（兼容早期"单审核人"的老流程：把它当成只有一步） */
  function flowStepsOf(f) {
    if (!f) return [];
    if (f.steps && f.steps.length) return f.steps;
    return [{ key: 'single', name: '审核', reviewers: [], reviewer: f.reviewer || '',
      status: f.status === 'REVIEWING' ? 'PENDING'
        : (f.status === 'APPROVED' ? 'PASSED' : 'REJECTED'),
      opinion: f.opinion || '', at: f.reviewedAt || '', by: f.reviewedBy || '' }];
  }

  function flowCurrentStep(f) {
    if (!f || f.status !== 'REVIEWING') return null;
    if (f.steps && f.steps.length) return f.steps[f.current] || null;
    return flowStepsOf(f)[0] || null;
  }

  /**
   * 发起一个多步流程
   * @param kind 'TOPIC_REVIEW'（选题立项审核）| 'PRODUCT_REVIEW'（编研成果审核）
   */
  function startFlow(kind, target, opts) {
    opts = opts || {};
    var now = new Date().toISOString();
    var who = (state.user && state.user.name) || '未知';
    var steps = flowStepsSnapshot();
    var f = {
      flowNo: nextFlowNo(kind === 'PRODUCT_REVIEW' ? 'FB' : 'LX'),
      type: kind,
      targetId: target.id,
      targetName: target.name,
      at: now, by: who,
      steps: steps,
      current: firstPendingStepOf(steps),
      totalSteps: steps.length,
      reviewer: '',            /* 见下：始终指向当前环节审核人 */
      status: 'REVIEWING',
      opinion: '', reviewedAt: null, reviewedBy: null,
      history: [{ at: now, by: who, action: 'SUBMIT', opinion: opts.submitOpinion || '' }]
    };
    var cur = f.current >= 0 ? steps[f.current] : null;
    f.reviewer = cur ? cur.reviewer : '';
    state.flows.push(f);
    pushMessage({
      to: cur ? cur.reviewer : who,
      title: (kind === 'PRODUCT_REVIEW' ? '成果发布审核待办：' : '选题立项审核待办：') + target.name,
      body: '流程 ' + f.flowNo + '　环节：' + (cur ? cur.name : '—') + '　发起人：' + who,
      kind: kind === 'PRODUCT_REVIEW' ? 'publish-review' : 'topic-review',
      taskId: kind === 'PRODUCT_REVIEW' ? target.id : '', flowNo: f.flowNo,
      stepKey: cur ? cur.key : ''
    });
    saveFlows();
    notify();
    return f;
  }

  /** 流程记录与选题存在同一个载荷里（见 readTopics / saveTopics） */
  function saveFlows() { saveTopics(); }

  /**
   * 审核流程的当前环节：通过 → 推下一步（或收尾）；不通过 → 终止并通知发起人
   * @param {{pass:boolean, opinion:string}} opts
   */
  function reviewFlowStep(flowNo, opts) {
    var f = getFlow(flowNo);
    if (!f) return { ok: false, message: '流程不存在' };
    if (f.status !== 'REVIEWING') return { ok: false, message: '该流程已结束' };
    var steps = flowStepsOf(f);
    var idx = (f.steps && f.steps.length) ? f.current : 0;
    var step = steps[idx];
    if (!step) return { ok: false, message: '没有待审核的环节' };
    var opinion = String((opts && opts.opinion) || '').trim();
    if (!(opts && opts.pass) && !opinion) {
      return { ok: false, message: '审核不通过时必须填写审核意见' };
    }
    var now = new Date().toISOString();
    var who = (state.user && state.user.name) || '未知';

    step.status = (opts && opts.pass) ? 'PASSED' : 'REJECTED';
    step.opinion = opinion;
    step.at = now;
    step.by = who;
    if (!f.steps) { f.steps = steps; f.totalSteps = steps.length; f.current = 0; }

    /* ---------- 不通过：终止 + 通知发起人（成果流程还要退回审核校定） ---------- */
    if (!(opts && opts.pass)) {
      f.status = 'REJECTED';
      f.opinion = opinion;
      f.reviewedAt = now;
      f.reviewedBy = who;
      f.finishedAt = now;
      f.current = -1;
      f.reviewer = '';
      pushFlowHistory(f, 'REJECTED', opinion);
      var extra = '';
      if (f.type === 'PRODUCT_REVIEW') {
        var task = getTask(f.targetId);
        if (task) {
          task.paused = false;
          saveTasks();
          setTaskStage(task.id, 4);
        }
        extra = '　任务已退回「审核校定」';
      } else {
        var topic = getTopic(f.targetId);
        if (topic && topic.review) {
          topic.review.status = 'REJECTED';
          topic.review.opinion = opinion;
          topic.review.reviewedAt = now;
          topic.review.reviewedBy = who;
          topic.updatedAt = now;
          saveTopics();
        }
      }
      pushMessage({
        to: f.by,
        title: (f.type === 'PRODUCT_REVIEW' ? '成果发布审核未通过：' : '选题立项审核未通过：') + f.targetName,
        body: '流程 ' + f.flowNo + '　环节：' + step.name + '　审核人：' + who +
          '　意见：' + opinion + extra,
        kind: f.type === 'PRODUCT_REVIEW' ? 'publish-rejected' : 'topic-rejected',
        taskId: f.type === 'PRODUCT_REVIEW' ? f.targetId : '',
        flowNo: f.flowNo, stepKey: step.key
      });
      saveFlows();
      notify();
      return { ok: true, rejected: true,
        message: '已记录不通过意见' + (f.type === 'PRODUCT_REVIEW'
          ? '，任务退回「审核校定」' : '，选题立项审核未通过') + '，并已通知发起人 ' + f.by };
    }

    /* ---------- 通过：还有下一步就流转，否则收尾 ---------- */
    var next = firstPendingStepOf(steps);
    if (next >= 0) {
      f.current = next;
      f.reviewer = steps[next].reviewer;
      pushFlowHistory(f, 'PASS', opinion);
      pushMessage({
        to: f.reviewer,
        title: (f.type === 'PRODUCT_REVIEW' ? '成果发布审核待办：' : '选题立项审核待办：') + f.targetName,
        body: '流程 ' + f.flowNo + '　环节：' + steps[next].name + '　上一环节「' + step.name + '」已通过',
        kind: f.type === 'PRODUCT_REVIEW' ? 'publish-review' : 'topic-review',
        taskId: f.type === 'PRODUCT_REVIEW' ? f.targetId : '',
        flowNo: f.flowNo, stepKey: steps[next].key
      });
      saveFlows();
      notify();
      return { ok: true, message: '「' + step.name + '」已通过，已推送下一环节「' + steps[next].name +
        ' · ' + steps[next].reviewer + '」' };
    }

    f.status = 'APPROVED';
    f.opinion = opinion;
    f.reviewedAt = now;
    f.reviewedBy = who;
    f.finishedAt = now;
    f.current = -1;
    f.reviewer = '';
    pushFlowHistory(f, 'APPROVED', opinion);

    var productId = '';
    if (f.type === 'PRODUCT_REVIEW') {
      var t2 = getTask(f.targetId);
      if (t2) {
        t2.status = 'DONE';
        t2.paused = false;
        t2.finishedAt = now;
        var words = 0;
        var chapters = composeOf(t2.id).chapters || {};
        (outlineOf(t2.id).nodes || []).forEach(function (n) {
          var ch = chapters[n.id];
          if (ch && String(ch.text || '').trim()) words += wordCount(ch.text);
        });
        var pr = addProduct({
          taskId: t2.id, title: t2.topicName, type: t2.type,
          compiledBy: (App.mock.ORG && App.mock.ORG.name) || '市档案馆',
          words: words,
          summary: String((t2.note || '') + '　（由编研任务 ' + t2.id + ' 成果发布审核通过后自动生成）').trim(),
          security: '公开', formats: ['PDF', 'OFD']
        });
        productId = (pr && pr.product) ? pr.product.id : '';
        f.productId = productId;
        t2.published = true;
        t2.publishedAt = now;
        t2.productId = productId;
        t2.stage = taskStages().length;
        rememberProgress(t2);
      }
      saveTasks();
      /* 评审要求：成果发布审核流程走完后，四类材料自动归档到「材料归档」并与编研任务关联 */
      autoArchiveProduct(f.targetId, (pr && pr.product) || productOfTask(f.targetId), f);
    } else {
      var tp = getTopic(f.targetId);
      if (tp && tp.review) {
        tp.review.status = 'APPROVED';
        tp.review.reviewedAt = now;
        tp.review.reviewedBy = who;
        tp.updatedAt = now;
        saveTopics();
      }
    }
    pushMessage({
      to: f.by,
      title: (f.type === 'PRODUCT_REVIEW' ? '成果发布审核通过：' : '选题立项审核通过：') + f.targetName,
      body: '流程 ' + f.flowNo + '　全部环节通过' +
        (productId ? '，成果已推送到「编研成果」模块（' + productId + '），任务已锁定为只读' : ''),
      kind: f.type === 'PRODUCT_REVIEW' ? 'publish-approved' : 'topic-approved',
      taskId: f.type === 'PRODUCT_REVIEW' ? f.targetId : '',
      flowNo: f.flowNo
    });
    saveFlows();
    notify();
    return { ok: true, approved: true, productId: productId,
      message: f.type === 'PRODUCT_REVIEW'
        ? ('全部环节通过：成果已生成到「编研成果」模块' + (productId ? '（' + productId + '）' : '') + '，任务已锁定')
        : '全部环节通过：选题立项审核通过' };
  }

  /** 流程审核页用的列表：只要与我有关（我发起 / 待我审核 / 我审过）就出现 */
  function flowsForUser(scope, type) {
    var me = (state.user && state.user.name) || '';
    return flows().filter(function (f) {
      var steps = flowStepsOf(f);
      var iDid = f.by === me || steps.some(function (s) {
        return s.by === me || (s.reviewers || []).some(function (r) { return r.name === me; }) ||
          s.reviewer === me;
      });
      if (!iDid && !(state.user && state.user.isAdmin)) return false;
      if (type && f.type !== type) return false;
      if (scope === 'mine' && f.by !== me) return false;
      if (scope === 'todo' && !(f.status === 'REVIEWING' && f.reviewer === me)) return false;
      if (scope === 'done' && f.status === 'REVIEWING') return false;
      return true;
    }).slice().reverse();
  }

  /** 我能否审这个流程（当前环节的审核人；admin 可代办） */
  function canReviewFlowNow(f) {
    if (!f || f.status !== 'REVIEWING') return false;
    var me = state.user || {};
    return !!me.isAdmin || f.reviewer === me.name;
  }

  /** 选题发起《编研选题立项审核》 */
  function submitTopicReview(id, note) {
    var t = getTopic(id);
    if (!t) return { ok: false, message: '选题不存在' };
    if (t.status !== 'NOT_STARTED') {
      return { ok: false, message: '状态为「' + ((App.mock.TOPIC_STATUS[t.status] || {}).label || t.status) + '」，不再需要立项审核' };
    }
    if (t.review && t.review.status === 'REVIEWING') {
      return { ok: false, message: '该选题已有审核中的流程（' + t.review.flowNo + '）' };
    }
    var f = startFlow('TOPIC_REVIEW', { id: t.id, name: t.name },
      { submitOpinion: String(note || '').trim() });
    var cur = flowCurrentStep(f);
    t.review = { flowNo: f.flowNo, at: f.at, by: f.by, reviewer: f.reviewer, status: 'REVIEWING' };
    t.updatedAt = f.at;
    saveTopics();
    notify();
    return { ok: true, flowNo: f.flowNo,
      message: '已发起立项审核（流程 ' + f.flowNo + '），审核消息已推送给「' +
        (cur ? cur.name + ' · ' + cur.reviewer : '—') + '」' };
  }

  /** 审批流程：通过/不通过都回写到来源对象 */
  function submitReview(flowNo, result, opinion) {
    var f = getFlow(flowNo);
    if (!f) return { ok: false, message: '流程不存在' };
    if (f.status !== 'REVIEWING') return { ok: false, message: '该流程已审批完成，无需重复审批' };
    if (!canReviewFlow(f)) return { ok: false, message: '当前用户不是该流程的审核人' };
    var text = String(opinion || '').trim();
    if (result === 'REJECTED' && !text) return { ok: false, message: '审核不通过时必须填写审核意见' };

    var now = new Date().toISOString();
    var who = (state.user && state.user.name) || '未知';
    f.status = result;
    f.opinion = text;
    f.reviewedAt = now;
    f.reviewedBy = who;
    pushFlowHistory(f, result, text);

    if (f.type === 'TOPIC_REVIEW') {
      var t = getTopic(f.targetId);
      if (t && t.review) {
        t.review.status = result;
        t.review.opinion = text;
        t.review.reviewedAt = now;
        t.review.reviewedBy = who;
        t.updatedAt = now;
      }
    } else {
      var task = getTask(f.targetId);
      if (task) {
        task.reviewPassed = (result === 'APPROVED');
        task.reviewOpinion = text;
        task.reviewCheckedAt = now;
        saveTasks();
      }
    }
    saveTopics();
    notify();
    return { ok: true, message: result === 'APPROVED' ? '已审核通过' : '已退回（审核不通过）' };
  }

  /* ==================================================================
     系统用户（系统管理 · 用户管理）
     ================================================================== */

  function nextUserId() {
    var max = users().reduce(function (m, u) {
      var n = parseInt(String(u.id).replace(/\D/g, ''), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return 'U-' + String(max + 1).padStart(3, '0');
  }

  /** 新增用户：用户名、姓名、密码 */
  function addUser(data) {
    var account = String(data.account || '').trim();
    var name = String(data.name || '').trim();
    var password = String(data.password || '');
    if (!account) return { ok: false, message: '用户名不能为空' };
    if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(account)) {
      return { ok: false, message: '用户名需以字母开头，由字母/数字/下划线组成，3—20 位' };
    }
    if (findByAccount(account)) return { ok: false, message: '用户名已存在：' + account };
    if (!name) return { ok: false, message: '姓名不能为空' };
    if (password.length < 6) return { ok: false, message: '密码至少 6 位' };

    var u = {
      id: nextUserId(),
      account: account,
      password: password,
      name: name,
      role: 'EDITOR',
      roleLabel: '编研人员',
      dept: data.dept || '编研利用科',
      isAdmin: false,
      /* 职位由「新增用户」表单填写（留空＝未填写，列表显示「—」）；
         角色 / 部门不在界面上维护，仍按原型假设给默认值 */
      title: String(data.title || '').trim(),
      locked: false,
      createdAt: new Date().toISOString()
    };
    users().push(u);
    saveUsers();
    notify();
    return { ok: true, message: '已新增用户「' + u.name + '（' + u.account + '）」', user: u };
  }

  /** 修改用户：用户名、姓名、密码 */
  function updateUser(id, data) {
    var u = findById(id);
    if (!u) return { ok: false, message: '用户不存在' };
    var account = String(data.account || '').trim();
    var name = String(data.name || '').trim();
    var password = String(data.password || '');
    if (!account) return { ok: false, message: '用户名不能为空' };
    var dup = findByAccount(account);
    if (dup && dup.id !== id) return { ok: false, message: '用户名已存在：' + account };
    if (!name) return { ok: false, message: '姓名不能为空' };
    if (password && password.length < 6) return { ok: false, message: '密码至少 6 位' };
    u.account = account;
    u.name = name;
    if (data.title !== undefined) u.title = String(data.title || '').trim();
    if (password) u.password = password;
    saveUsers();
    notify();
    return { ok: true, message: '已保存用户「' + u.name + '」', user: u };
  }

  function deleteUsers(ids) {
    var deleted = [];
    (ids || []).forEach(function (id) {
      var u = findById(id);
      if (!u) return;
      if (state.user && state.user.id === id) return;   // 不能删除当前登录用户
      deleted.push(u.name);
      state.users = users().filter(function (x) { return x.id !== id; });
    });
    if (deleted.length) { saveUsers(); notify(); }
    return { deleted: deleted };
  }

  /**
   * 「涉及本人」的业务数据 —— 权限迁移要迁移的就是这些关联，而不是全宗/门类：
   *   · 编研任务：本人在任务团队里担任角色（或本人创建）
   *   · 审核流程：本人是发起人或审核人
   * 团队里存的是姓名（沿用现有数据模型），因此按姓名匹配。
   */
  function userInvolvement(userId) {
    var u = findById(userId);
    if (!u) return { tasks: [], flows: [] };
    var roles = App.mock.TASK_TEAM_ROLES;

    var invTasks = tasks().filter(function (t) {
      if (t.createdBy === u.name) return true;
      return roles.some(function (r) { return t.team && t.team[r.key] === u.name; });
    }).map(function (t) {
      var as = [];
      if (t.createdBy === u.name) as.push('创建人');
      roles.forEach(function (r) {
        if (t.team && t.team[r.key] === u.name) as.push(r.label);
      });
      return { id: t.id, topicName: t.topicName, status: t.status, as: as };
    });

    var invFlows = flows().filter(function (f) {
      return f.by === u.name || f.reviewer === u.name;
    }).map(function (f) {
      var as = [];
      if (f.by === u.name) as.push('发起人');
      if (f.reviewer === u.name) as.push('审核人');
      return { flowNo: f.flowNo, targetName: f.targetName, status: f.status, as: as };
    });

    return { tasks: invTasks, flows: invFlows };
  }

  function involvementText(userId) {
    var inv = userInvolvement(userId);
    return '编研任务 ' + inv.tasks.length + ' · 审核流程 ' + inv.flows.length;
  }

  /**
   * 权限迁移
   * **本次只生成界面**：这里做校验并给出"将被迁移的数据"清单，不改动任务/流程数据 ——
   * 迁移的落库逻辑由评审后续统一处理（见 README 待确认项）。
   */
  function migratePermissions(fromId, toId) {
    var from = findById(fromId);
    var to = findById(toId);
    if (!from) return { ok: false, message: '请选择要迁移的用户' };
    if (!to) return { ok: false, message: '请选择接收权限的用户' };
    if (from.id === to.id) return { ok: false, message: '不能迁移给用户本人' };

    var inv = userInvolvement(from.id);
    if (!inv.tasks.length && !inv.flows.length) {
      return { ok: false, message: '「' + from.name + '」没有涉及本人的编研任务或审核流程' };
    }
    return {
      ok: true,
      pending: true,
      involvement: inv,
      message: '已提交权限迁移：' + inv.tasks.length + ' 个编研任务、' + inv.flows.length +
        ' 条审核流程 → ' + to.name + '（落库逻辑待统一处理）'
    };
  }

  /* ==================================================================
     流程配置（系统管理 · 流程配置）
     —— 审核流程的三个环节，每个环节各自配置审核人（指定到人）
     ================================================================== */

  function readFlow() {
    var d = readJSON(FLOW_KEY);
    if (!d) return false;
    state.flowSteps = d;
    return true;
  }

  function saveFlow() { writeJSON(FLOW_KEY, state.flowSteps); }

  function resetFlow() {
    state.flowSteps = clone(App.mock.FLOW_STEPS);
    saveFlow();
  }

  function flowSteps() {
    if (!state.flowSteps) state.flowSteps = clone(App.mock.FLOW_STEPS);
    return state.flowSteps;
  }

  function getFlowStep(key) {
    return flowSteps().filter(function (s) { return s.key === key; })[0] || null;
  }

  function stepReviewers(key) {
    var s = getFlowStep(key);
    return s ? s.reviewers : [];
  }

  function nextFlowReviewerId() {
    var max = 0;
    flowSteps().forEach(function (s) {
      s.reviewers.forEach(function (r) {
        var m = /^FR-(\d+)$/.exec(r.id || '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
    });
    return 'FR-' + (max + 1);
  }

  /** 为某环节添加审核人（指定到人） */
  function addFlowReviewer(stepKey, data) {
    var step = getFlowStep(stepKey);
    if (!step) return { ok: false, message: '环节不存在' };

    var u = findById(data.userId);
    if (!u) return { ok: false, message: '请选择审核人' };
    var dup = step.reviewers.some(function (r) { return r.userId === u.id; });
    if (dup) return { ok: false, message: '「' + u.name + '」已在该环节的审核人里' };

    var reviewer = {
      id: nextFlowReviewerId(),
      userId: u.id,
      name: u.name,
      roleLabel: u.roleLabel || '',
      dept: u.dept || ''
    };
    step.reviewers.push(reviewer);
    saveFlow();
    notify();
    return { ok: true, message: '已添加审核人「' + u.name + '」', id: reviewer.id, reviewer: reviewer };
  }

  function removeFlowReviewer(stepKey, reviewerId) {
    var step = getFlowStep(stepKey);
    if (!step) return { ok: false, message: '环节不存在' };
    var r = step.reviewers.filter(function (x) { return x.id === reviewerId; })[0];
    if (!r) return { ok: false, message: '该审核人不在本环节' };
    step.reviewers = step.reviewers.filter(function (x) { return x.id !== reviewerId; });
    saveFlow();
    notify();
    return { ok: true, message: '已移除「' + (r.name || '') + '」' };
  }

  /** 可添加的审核人（排除本环节已配置的） */
  function flowAddableUsers(stepKey) {
    var step = getFlowStep(stepKey);
    if (!step) return users();
    var used = step.reviewers.map(function (r) { return r.userId; });
    return users().filter(function (u) { return used.indexOf(u.id) < 0; });
  }

  /* ==================================================================
     数据字典（系统管理 · 数据字典）

     一本字典 = 名称 + 若干字典值（值 / 值名 / 描述）+ 元数据。
     「归档设置」里"字典类型"的下拉就是读这里的字典名，两处口径一致。
     ================================================================== */

  function readDicts() {
    var d = readJSON(DICT_KEY);
    if (!d) return false;
    state.dataDicts = d;
    return true;
  }

  function saveDicts() { writeJSON(DICT_KEY, state.dataDicts); }

  function resetDicts() {
    state.dataDicts = clone(App.mock.DATA_DICTS);
    saveDicts();
  }

  function dataDicts() {
    if (!state.dataDicts) state.dataDicts = clone(App.mock.DATA_DICTS);
    return state.dataDicts;
  }

  function getDataDict(id) {
    return dataDicts().filter(function (d) { return d.id === id; })[0] || null;
  }

  function dataDictNameExists(name, exceptId) {
    var key = String(name || '').trim();
    return dataDicts().some(function (d) {
      return d.id !== exceptId && String(d.name).trim() === key;
    });
  }

  /** 字典名列表（供「归档设置 · 字典类型」下拉使用） */
  function dictNameOptions() {
    return dataDicts().map(function (d) { return d.name + '字典'; });
  }

  /** 元数据选项 */
  function dictMetaOptions() { return App.mock.DICT_META_OPTIONS; }

  function nextDictId() {
    var max = dataDicts().reduce(function (m, d) {
      var n = parseInt(String(d.id).replace(/\D/g, ''), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return 'DD-' + String(max + 1).padStart(3, '0');
  }

  /** 归一化字典值：去空白、丢掉完全空白的行 */
  function normalizeDictItems(items) {
    return (items || []).map(function (it) {
      return {
        value: String((it && it.value) || '').trim(),
        name: String((it && it.name) || '').trim(),
        note: String((it && it.note) || '').trim()
      };
    }).filter(function (it) { return it.value || it.name || it.note; });
  }

  /**
   * 校验字典表单
   * @returns {{ok:boolean, message:string, field?:string, row?:number}}
   */
  function validateDict(data, exceptId) {
    var name = String(data.name || '').trim();
    if (!name) return { ok: false, message: '名称不能为空', field: 'name' };
    if (dataDictNameExists(name, exceptId)) return { ok: false, message: '已存在同名字典：' + name, field: 'name' };

    var items = normalizeDictItems(data.items);
    if (!items.length) return { ok: false, message: '请至少添加一个字典值', field: 'items' };

    var seen = {};
    for (var i = 0; i < items.length; i++) {
      if (!items[i].value && !items[i].name) {
        return { ok: false, message: '第 ' + (i + 1) + ' 行：字典值不能为空', field: 'row', row: i };
      }
      var key = (items[i].value || items[i].name);
      if (seen[key]) {
        return { ok: false, message: '第 ' + (i + 1) + ' 行：字典值「' + key + '」重复', field: 'row', row: i };
      }
      seen[key] = 1;
    }
    return { ok: true, items: items, name: name };
  }

  function addDataDict(data) {
    var v = validateDict(data, null);
    if (!v.ok) return v;
    var d = {
      id: nextDictId(),
      name: v.name,
      meta: data.meta || '无',
      items: v.items
    };
    dataDicts().unshift(d);
    saveDicts();
    notify();
    return { ok: true, message: '已新增字典「' + d.name + '」（' + d.items.length + ' 个字典值）', dict: d };
  }

  function updateDataDict(id, data) {
    var d = getDataDict(id);
    if (!d) return { ok: false, message: '字典不存在' };
    var v = validateDict(data, id);
    if (!v.ok) return v;
    d.name = v.name;
    d.meta = data.meta || '无';
    d.items = v.items;
    saveDicts();
    notify();
    return { ok: true, message: '已保存字典「' + d.name + '」', dict: d };
  }

  function deleteDataDicts(ids) {
    var deleted = [];
    (ids || []).forEach(function (id) {
      var d = getDataDict(id);
      if (!d) return;
      deleted.push(d.name);
      state.dataDicts = dataDicts().filter(function (x) { return x.id !== id; });
    });
    if (deleted.length) { saveDicts(); notify(); }
    return { deleted: deleted };
  }

  /* ==================================================================
     初始化
     ================================================================== */

  function init() {
    checkSeedVersion();
    var saved = readStorage();
    if (saved) {
      state.lastLoginAt = saved.lastLoginAt || null;
      var u = findById(saved.userId);
      // 已登录过则恢复会话，刷新页面不掉线
      if (u && !u.locked) state.user = u;
    }
    readTaskProgress();          /* 先读"任务进展"覆盖层，后面 tasks() 会把它套上去 */
    if (!readUsers()) resetUsers();
    if (!readTopics()) resetTopics();
    if (!readTags()) resetTags();
    if (!readMaterials()) resetMaterials();
    if (!readTasks()) resetTasks();
    if (!readProducts()) resetProducts();
    if (!readArchive()) resetArchive();
    if (!readFlow()) resetFlow();
    if (!readDicts()) resetDicts();
    if (!readOutlines()) resetOutlines();
    if (!readSelections()) resetSelections();
    if (!readComposes()) resetComposes();
    if (!readAuditRules()) resetAuditRules();
    if (!readAuditResults()) state.auditResults = {};
    /* 默认审核结果（写在 mock.AUDIT_RESULTS 里）：没有审核记录的任务按种子播种 */
    seedDefaultAuditResults();
    if (!readMessages()) resetMessages();
    if (!readPublish()) state.publish = {};
    /* 已完成且已登记成果的任务：补齐"发布审核通过后应归档"的四类材料（幂等） */
    syncPublishedArchives();
    return state;
  }

  App.store = {
    init: init,
    subscribe: subscribe,
    seedVersion: seedVersion,

    /* 会话与用户 */
    users: users,
    findById: findById,
    findByAccount: findByAccount,
    loginableAccounts: loginableAccounts,
    currentUser: currentUser,
    isLoggedIn: isLoggedIn,
    login: login,
    logout: logout,
    switchUser: switchUser,

    /* 选题立项 */
    topics: topics,
    getTopic: getTopic,
    addTopic: addTopic,
    updateTopic: updateTopic,
    deleteTopics: deleteTopics,
    canDeleteTopic: canDeleteTopic,
    topicNameExists: topicNameExists,
    topicTakenBy: topicTakenBy,
    linkableTopics: linkableTopics,
    syncTopicStatus: syncTopicStatus,
    submitTopicReview: submitTopicReview,
    resetTopics: resetTopics,
    /* 第 1 阶段「生成大纲」 */
    outlineOf: outlineOf,
    saveOutline: saveOutline,
    setOutlineNodes: setOutlineNodes,
    setOutlinePrompt: setOutlinePrompt,
    updateOutlineNode: updateOutlineNode,
    clearOutline: clearOutline,
    insertOutlineNode: insertOutlineNode,
    deleteOutlineNode: deleteOutlineNode,
    moveOutlineNode: moveOutlineNode,
    setOutlineCollapsed: setOutlineCollapsed,
    resetOutlines: resetOutlines,
    /* 第 2 阶段「确定选材」 */
    selectionOf: selectionOf,
    materialFileList: materialFileList,
    materialFileOf: materialFileOf,
    addSelections: addSelections,
    removeSelections: removeSelections,
    scopeText: scopeText,
    pagesText: pagesText,
    resetSelections: resetSelections,
    /* 审核规则（系统管理） */
    auditRules: auditRules,
    auditRuleTypes: auditRuleTypes,
    auditControlFlags: auditControlFlags,
    controlFlagTitle: controlFlagTitle,
    getAuditRule: getAuditRule,
    auditRuleClauses: auditRuleClauses,
    addAuditRule: addAuditRule,
    updateAuditRule: updateAuditRule,
    deleteAuditRules: deleteAuditRules,
    resetAuditRules: resetAuditRules,
    /* 审核校定（第 4 阶段） */
    auditOf: auditOf,
    saveAuditRun: saveAuditRun,
    auditItems: auditItems,
    auditItemKey: auditItemKey,
    pendingAuditItems: pendingAuditItems,
    replaceFragment: replaceFragment,
    fixAuditItem: fixAuditItem,
    markAuditFixed: markAuditFixed,
    ignoreAuditItem: ignoreAuditItem,
    resetAudit: resetAudit,
    auditSummary: auditSummary,
    /* 默认审核结果（种子）：可显式重播；misses 供验证套件核对种子没写错项 */
    seedAuditResults: seedDefaultAuditResults,
    auditSeedMisses: function () { return (state.auditSeedMisses || []).slice(); },
    /* 消息中心 */
    messages: messages,
    myMessages: myMessages,
    messageOf: messageOf,
    pushMessage: pushMessage,
    readMessage: readMessage,
    unreadMessageCount: unreadMessageCount,
    resetMessages: resetMessages,
    /* 成果发布（第 5 阶段） */
    publishOf: publishOf,
    flowView: flowView,
    /* 多步流程引擎（选题立项审核 / 编研成果审核） */
    startFlow: startFlow,
    reviewFlowStep: reviewFlowStep,
    reviewStepByFlowNo: reviewStepByFlowNo,
    flowsForUser: flowsForUser,
    flowStepsOf: flowStepsOf,
    flowCurrentStep: flowCurrentStep,
    canReviewFlowNow: canReviewFlowNow,
    isTaskLocked: isTaskLocked,
    startPublishReview: startPublishReview,
    reviewPublishStep: reviewPublishStep,
    reviewFormOf: reviewFormOf,
    resetPublish: resetPublish,
    /* 第 3 阶段「加工编排」 */
    composeOf: composeOf,
    chapterOf: chapterOf,
    saveChapter: saveChapter,
    composeStats: composeStats,
    wordCount: wordCount,
    resetCompose: resetCompose,
    resetComposes: resetComposes,

    /* 素材标签 */
    tags: tags,
    tagsWithUsage: tagsWithUsage,
    getTag: getTag,
    addTag: addTag,
    updateTag: updateTag,
    deleteTags: deleteTags,
    tagUsage: tagUsage,
    canDeleteTag: canDeleteTag,
    tagNameExists: tagNameExists,
    resetTags: resetTags,

    /* 素材库 */
    materials: materials,
    getMaterial: getMaterial,
    hasMaterial: hasMaterial,
    addMaterials: addMaterials,
    addMaterial: addMaterial,
    catalogByArchiveNo: catalogByArchiveNo,
    hasMaterialTitle: hasMaterialTitle,
    fondsOfArchiveNo: fondsOfArchiveNo,
    yearOfArchiveNo: yearOfArchiveNo,
    deleteMaterials: deleteMaterials,
    updateMaterialTags: updateMaterialTags,
    resetLibrary: function () { resetMaterials(); resetTags(); notify(); },

    /* 编研任务 */
    tasks: tasks,
    getTask: getTask,
    addTask: addTask,
    updateTask: updateTask,
    deleteTasks: deleteTasks,
    startTask: startTask,
    pauseTask: pauseTask,
    resumeTask: resumeTask,
    advanceStage: advanceStage,
    setTaskStage: setTaskStage,
    backStage: backStage,
    taskStages: taskStages,
    stageDef: stageDef,
    taskState: taskState,
    taskMatchesState: taskMatchesState,
    isTaskDone: isTaskDone,
    resetTasks: resetTasks,
    rememberProgress: rememberProgress,
    clearTaskProgress: clearTaskProgress,
    reseeded: function () { return !!state.reseeded; },
    taskProgress: function () { return state.taskProgress || {}; },

    /* 编研成果 */
    products: products,
    getProduct: getProduct,
    productsOfTask: productsOfTask,
    productOfTask: productOfTask,
    productCountByType: productCountByType,
    addProduct: addProduct,
    resetProducts: resetProducts,

    /* 材料归档 */
    archiveItems: archiveItems,
    archiveItemOf: archiveItemOf,
    archiveOfTask: archiveOfTask,
    addArchiveItem: addArchiveItem,
    updateArchiveItem: updateArchiveItem,
    deleteArchiveItems: deleteArchiveItems,
    archiveStageChoices: archiveStageChoices,
    autoArchiveProduct: autoArchiveProduct,
    syncPublishedArchives: syncPublishedArchives,
    autoArchiveOf: autoArchiveOf,
    archiveCatalog: archiveCatalog,
    archiveCount: archiveCount,
    archiveCategories: archiveCategories,
    archiveFields: archiveFields,
    getArchiveField: getArchiveField,
    archiveColumns: archiveColumns,
    setArchiveColumns: setArchiveColumns,
    archiveFieldNameExists: archiveFieldNameExists,
    addArchiveField: addArchiveField,
    updateArchiveField: updateArchiveField,
    deleteArchiveFields: deleteArchiveFields,
    resetArchive: resetArchive,

    /* 审核校定 */
    flows: flows,
    getFlow: getFlow,
    flowsOfType: flowsOfType,
    canSeeFlow: canSeeFlow,
    canReviewFlow: canReviewFlow,
    productReviewOf: productReviewOf,
    createProductReview: createProductReview,
    submitReview: submitReview,
    defaultReviewer: defaultReviewer,

    /* 用户管理 */
    addUser: addUser,
    updateUser: updateUser,
    deleteUsers: deleteUsers,
    userInvolvement: userInvolvement,
    involvementText: involvementText,
    migratePermissions: migratePermissions,
    resetUsers: resetUsers,

    /* 数据字典 */
    dataDicts: dataDicts,
    getDataDict: getDataDict,
    dataDictNameExists: dataDictNameExists,
    dictNameOptions: dictNameOptions,
    dictMetaOptions: dictMetaOptions,
    addDataDict: addDataDict,
    updateDataDict: updateDataDict,
    deleteDataDicts: deleteDataDicts,
    resetDicts: resetDicts,
    /* 流程配置 */
    flowSteps: flowSteps,
    getFlowStep: getFlowStep,
    stepReviewers: stepReviewers,
    addFlowReviewer: addFlowReviewer,
    removeFlowReviewer: removeFlowReviewer,
    flowAddableUsers: flowAddableUsers,
    resetFlow: resetFlow
  };
})(window);
