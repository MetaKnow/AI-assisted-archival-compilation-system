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

  var STORAGE_KEY = 'archive-proto-system:session';
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
    outlines: null
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
      [TOPICS_KEY, TAGS_KEY, MATERIALS_KEY, TASKS_KEY, PRODUCTS_KEY,
        ARCHIVE_KEY, USERS_KEY, FLOW_KEY, DICT_KEY].forEach(removeKey);
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
    state.tasks = d;
    return true;
  }

  function saveTasks() { writeJSON(TASKS_KEY, state.tasks); }

  function resetTasks() {
    state.tasks = clone(App.mock.TASKS);
    saveTasks();
  }

  function tasks() {
    if (!state.tasks) state.tasks = clone(App.mock.TASKS);
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
    if (deleted.length) { saveTasks(); notify(); }
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
    saveTasks();
    notify();
    return { ok: true, message: '已继续任务 ' + t.id };
  }

  function advanceStage(id) {
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
    return f.reviewer === user.name || f.by === user.name || f.reviewedBy === user.name;
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

  /** 选题发起《编研选题立项审核》 */
  function submitTopicReview(id) {
    var t = getTopic(id);
    if (!t) return { ok: false, message: '选题不存在' };
    if (t.review && t.review.status === 'REVIEWING') {
      return { ok: false, message: '该选题已有审核中的流程（' + t.review.flowNo + '）' };
    }
    var now = new Date().toISOString();
    var who = (state.user && state.user.name) || '未知';
    var flowNo = nextFlowNo('LX');
    var reviewer = defaultReviewer();
    t.review = { flowNo: flowNo, at: now, by: who, reviewer: reviewer, status: 'REVIEWING' };
    t.updatedAt = now;
    state.flows.push({
      flowNo: flowNo,
      type: 'TOPIC_REVIEW',
      targetId: t.id,
      targetName: t.name,
      at: now,
      by: who,
      reviewer: reviewer,
      status: 'REVIEWING',
      opinion: '', reviewedAt: null, reviewedBy: null,
      history: [{ at: now, by: who, action: 'SUBMIT', opinion: '' }]
    });
    saveTopics();
    notify();
    return { ok: true, message: '已发起立项审核，流程编号 ' + flowNo, flowNo: flowNo };
  }

  /** 某任务的成果审核流程（最新一条） */
  function productReviewOf(taskId) {
    var list = flows().filter(function (f) {
      return f.type === 'PRODUCT_REVIEW' && f.targetId === taskId;
    });
    return list.length ? list[list.length - 1] : null;
  }

  /**
   * 编研任务发起《编研成果审核校定》流程
   * 审核人取该任务的「编辑审核人员」，未指定时用默认审核人。
   */
  function createProductReview(taskId) {
    var t = getTask(taskId);
    if (!t) return { ok: false, message: '任务不存在' };
    if (t.status !== 'IN_PROGRESS') return { ok: false, message: '只有进行中的任务可以发起成果审核' };
    if (t.stage < 5) return { ok: false, message: '请先推进到第 5 阶段「审核校定」再发起审核' };
    var exist = productReviewOf(taskId);
    if (exist && exist.status === 'REVIEWING') {
      return { ok: false, message: '该任务已有审核中的流程（' + exist.flowNo + '）' };
    }
    var now = new Date().toISOString();
    var who = (state.user && state.user.name) || '未知';
    var reviewer = (t.team && t.team.editor) || defaultReviewer();
    var flow = {
      flowNo: nextFlowNo('SH'),
      type: 'PRODUCT_REVIEW',
      targetId: t.id,
      targetName: t.topicName,
      at: now, by: who, reviewer: reviewer,
      status: 'REVIEWING', opinion: '', reviewedAt: null, reviewedBy: null,
      history: [{ at: now, by: who, action: 'SUBMIT', opinion: '' }]
    };
    state.flows.push(flow);
    t.reviewFlowNo = flow.flowNo;
    saveTasks();
    saveTopics();
    notify();
    return { ok: true, message: '已发起成果审核，流程编号 ' + flow.flowNo + '，审核人 ' + reviewer, flowNo: flow.flowNo };
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
      title: '编研人员',
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

    /* 素材标签 */
    tags: tags,
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
    backStage: backStage,
    taskStages: taskStages,
    stageDef: stageDef,
    taskState: taskState,
    taskMatchesState: taskMatchesState,
    isTaskDone: isTaskDone,
    resetTasks: resetTasks,

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
    archiveOfTask: archiveOfTask,
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
