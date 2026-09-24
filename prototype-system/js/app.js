/* ==========================================================================
   应用外壳：登录入口、侧边导航、顶栏、用户菜单、未生成模块的占位页

   模块交付方式：按《档案辅助编研系统功能模块设计》逐个模块生成原型。
   本期已生成：登录、工作台。其余模块先给出菜单入口与规划说明页，
   保证导航结构完整、评审时能看清全局，而不是留一堆死链接。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var ui = {
    navCollapsed: false,
    navOpen: false,
    /* 一级菜单（分组）的展开状态：未显式设置过时默认展开，
       导航进入某个二级菜单时自动展开其所属分组。
       navLastRoute 用来区分"换页"与"手动折叠" —— 只在换页时自动展开，
       否则会出现"当前页所在分组怎么点都折不上"的问题。 */
    navExpanded: {},
    navLastRoute: null
  };

  /* ======================================================================
     各模块的功能要点（直接取自设计文档，作为占位页的说明内容）
     ====================================================================== */

  var PLACEHOLDERS = {
    topic: {
      title: '选题立项',
      intro: '选题的立项池，与编研任务解耦：先完成可行性评估与立项审核，再由编研任务关联使用。',
      points: [
        '新增选题：按《表 C.1 选题可行性评估表示例》弹出评估表 —— 选题名称、编研团队、经费情况、背景与意义、内容与目标、实施方案、保障措施、评估意见，表单下方支持上传附件',
        '保存后以列表展现：勾选框、序号、选题名称、状态（未开始 / 进行中 / 已完成）、创建时间、创建人',
        '选题名称右侧提供「AI 辅助选题」入口，调用 AI 生成候选主题（原型仅呈现页面，不实现 AI 能力）',
        '修改选题：弹出同一张评估表，允许修改并保存',
        '删除选题：仅状态为「未开始」的选题允许删除',
        '发起审核：调用《编研选题立项审核》流程'
      ]
    },
    material: {
      title: '编研素材库',
      intro: '跨任务复用的素材池：先检索馆藏、再打标签入库，最后由素材管理维护。' +
        '本模块含三个子模块，均已生成，见左侧子菜单。',
      points: [
        '标签管理：素材分类的新增、修改、删除（✅ 已生成）',
        '查找素材：目录检索与全文检索 → 勾选结果 → 选择素材标签后加入素材库（✅ 已生成）',
        '素材管理：列表（勾选框、序号、标题、档号、标签、加入时间、创建人）+ 删除 / 按标签筛选 / 更改标签（✅ 已生成）',
        '三个子模块的数据是打通的：查找素材入库 → 素材管理维护 → 标签管理的「关联素材」数实时聚合'
      ]
    },
    task: {
      title: '编研任务',
      intro: '系统的中枢：一个任务对应一项编研工作，任务内按六阶段推进。',
      points: [
        '新建任务：关联选题立项中状态为「未开始」的选题；设置编研团队成员（团队负责人、档案收集人员、编辑审核人员、成果发布人员、宣传推介人员、材料归档人员）；填写备注',
        '任务卡片：显示选题名称、任务日期、任务状态（未开始 / 进行中 / 已完成）、任务进度（' +
          App.mock.TASK_STAGES.map(function (s) { return s.title; }).join(' → ') + '）',
        '卡片右上角「⋮」菜单：修改、删除、启动、暂停',
        '点击卡片进入编研任务管理界面 —— 该界面沿用《原型功能模块规划》的七步原型，作为本模块的设计参考'
      ]
    },
    review: {
      title: '流程审核',
      intro: '跨模块的审批流台账：谁发起了什么、现在轮到谁审、审过没有。',
      points: [
        '两类流程分开看：选题立项审核流程（《编研选题立项审核》）/ 编研成果审核流程（成果发布审核）',
        '列表字段：流程编号、名称、发起日期、发起人、当前环节（第几步 / 共几步）、当前审核人、状态、操作',
        '数据权限：admin 用户显示所有流程；其他用户显示需要自己审核或自己发起的流程',
        '操作分「查看 / 审核」两个：查看看流程详情与各环节意见；需要当前用户审核的流程，点「审核」进入审核界面',
        '发起与审核都会在本页生成数据：选题立项的「发起审核」、任务第 5 阶段的「发起审核」都登记到这里',
        '与任务第 4 阶段「审核校定」的分工：本模块管审批流，第 4 阶段管成果正文的政治性 / 专业性 / 合规性校对'
      ]
    },
    product: {
      title: '编研成果',
      intro: '已发布编研成果的统一展示与取用入口。',
      points: [
        '以封面图形式展现成果，并显示选题名称',
        '点击封面图打开编研成果文件，支持在线浏览或下载'
      ]
    },
    archive: {
      title: '材料归档',
      intro: '每项编研任务的过程材料归档与查阅。',
      points: [
        '能够切换编研任务，并以列表形式显示该任务的归档材料',
        '列表字段根据「系统管理 · 归档设置」中的配置显示'
      ]
    },
    system: {
      title: '系统管理',
      intro: '系统级配置，其中「归档设置」直接决定材料归档模块的列表字段。',
      points: [
        '用户管理、流程配置、归档设置、数据字典、日志管理、备份恢复、接口维护、系统参数',
        '归档设置：用来设置材料归档模块需要显示的字段',
        '其余子模块的需求细节待补充后设计与实现'
      ]
    }
  };

  /* 二级菜单里尚未生成的模块：给出各自的规划说明，避免都落到父模块那一段 */
  var CHILD_PLACEHOLDERS = {
    'material/search': {
      title: '查找素材',
      intro: '从馆藏检索结果中挑出可用素材，打上标签后加入素材库。',
      points: [
        '先生成一个检索界面，包括目录检索和全文检索',
        '点击搜索后可以出现一些测试数据',
        '允许勾选数据后点击「加入素材库」按钮',
        '点击「加入素材库」先弹出素材标签选择页面，然后加入素材库',
        '与本系统「档案检索」的区别：此处面向编研场景，检索结果可直接沉淀为素材'
      ]
    },
    'material/list': {
      title: '素材管理',
      intro: '素材库的日常维护：查看、筛选、改标签、清理。',
      points: [
        '以列表形式显示素材数据，字段包括：勾选框、序号、标题、档号、加入时间、创建人',
        '删除：可以删除素材',
        '筛选：按照素材标签筛选素材',
        '更改标签：修改素材的标签',
        '与标签管理的联动：素材的标签决定了各标签下的「关联素材数」，也是标签能否删除的依据'
      ]
    },

    /* ---- 系统管理里尚未生成的四个二级模块（设计文档只有标题，要点为原型拟稿，待确认） ---- */
    'system/log': {
      title: '日志管理',
      intro: '系统操作与登录的留痕查询：谁、什么时间、对哪个对象做了什么。',
      points: [
        '操作日志：新增 / 修改 / 删除 / 审批 / 导出等动作，记录操作人、时间、模块、对象与结果，关键动作保留变更前后的值',
        '登录日志：登录、退出、验证码失败、密码错误、账号锁定与解锁',
        '检索与导出：按时间范围、操作人、模块、操作类型组合检索，结果可导出（导出本身也记一条日志）',
        '日志只读：任何用户不可修改或删除；保留期限、是否异地留存由「系统参数」配置',
        '与审计的衔接：满足档案行业与等保的审计留痕要求（具体条款待确认）'
      ]
    },
    'system/backup': {
      title: '备份恢复',
      intro: '编研业务数据与系统配置的备份、恢复与备份历史管理。',
      points: [
        '备份策略：全量 / 增量，可设置每日或每周自动执行、保留最近 N 份',
        '备份范围：选题、素材、编研任务、编研成果、归档材料与系统配置（字典、流程、著录项、参数）',
        '手动备份：管理员可随时发起并填写备份说明',
        '备份历史：时间、类型、数据量、存放位置、执行结果与失败原因',
        '恢复：选择一个备份点恢复；恢复前二次确认并明确提示影响范围（会覆盖当前数据）',
        '异地 / 离线备份与恢复演练记录是否需要纳入，待确认'
      ]
    },
    'system/api': {
      title: '接口维护',
      intro: '与外部系统的接口配置、连通性测试与调用留痕。',
      points: [
        '接口清单：档案管理系统（馆藏与著录数据）、统一身份认证、消息通知等',
        '每个接口可配置：名称、类型（HTTP / 数据库 / 文件）、地址、认证方式、超时与重试、启用状态',
        '字段映射：外部字段与系统内部字段（著录项、全宗、门类等）的对应关系',
        '连通性测试：一键测试并给出失败原因；保留最近若干次调用与返回摘要',
        '密钥与凭据的存放方式需与信息安全要求一致（待确认）'
      ]
    },
    'system/params': {
      title: '系统参数',
      intro: '全馆级与业务级的全局参数（开关与规则），区别于可枚举值与环节配置。',
      points: [
        '全馆参数：单位名称、系统名称、编号规则（任务 / 流程 / 成果编号）',
        '业务参数：任务阶段门是否强制、审核层级（三级审批）是否启用、素材判重字段',
        '展示参数：列表每页条数、日期格式、字数统计口径',
        '与其它配置的分工：可枚举值走「数据字典」，审批环节走「流程配置」，归档字段走「归档设置」，这里只放开关与规则',
        '参数修改需留操作日志（与「日志管理」联动）'
      ]
    }
  };

  /* 导航项查找与二级菜单中文名（不再写死 system） */
  function findNav(id) {
    return App.mock.NAV.filter(function (i) { return i.id === id; })[0] || null;
  }

  function childLabel(parentId, sub) {
    var parent = findNav(parentId);
    var found = '';
    ((parent && parent.children) || []).forEach(function (c) {
      if (c.route === '#/' + parentId + '/' + sub) found = c.label;
    });
    return found;
  }

  /* ======================================================================
     侧边导航
     ====================================================================== */

  function navButton(item, active, sub) {
    return '<button type="button" class="nav-item' + (sub ? ' nav-item-sub' : '') +
        (active ? ' active' : '') + '" data-action="nav:go" data-route="' + esc(item.route) + '"' +
        ' title="' + esc(item.label) + '"' +
        (active ? ' aria-current="page"' : '') + '>' +
      icon(item.icon) +
      '<span class="nav-label">' + esc(item.label) + '</span>' +
      (item.badge ? '<span class="nav-badge">' + esc(item.badge) + '</span>' : '') +
    '</button>';
  }

  /**
   * 一级菜单（分组）：整行是一个展开/折叠开关，右侧带展开折叠按钮样式的小方块图标。
   * 点击**不跳转**（分组本身没有页面），只切换二级菜单的显示。
   */
  function navGroupButton(item, open, hasActive) {
    return '<button type="button" class="nav-item nav-parent' + (open ? ' is-open' : '') +
        (hasActive ? ' has-active' : '') + '"' +
        ' data-action="nav:group" data-id="' + esc(item.id) + '"' +
        ' aria-expanded="' + (open ? 'true' : 'false') + '"' +
        ' aria-controls="nav-sub-' + esc(item.id) + '"' +
        ' title="' + esc(item.label) + '（点击展开/折叠）">' +
      icon(item.icon) +
      '<span class="nav-label">' + esc(item.label) + '</span>' +
      (item.badge ? '<span class="nav-badge">' + esc(item.badge) + '</span>' : '') +
      '<span class="nav-caret" aria-hidden="true">' +
        icon(open ? 'chevron-down' : 'chevron-right') + '</span>' +
    '</button>';
  }

  /** 分组是否展开：显式设置过就按设置，否则默认展开 */
  function isGroupOpen(item) {
    var v = ui.navExpanded[item.id];
    return v === undefined ? true : !!v;
  }

  /** 当前路由是否落在这个分组的某个二级菜单里 */
  function groupHasActive(item, parsed) {
    return item.children.some(function (c) {
      return c.route === '#/' + parsed.id + '/' + parsed.sub;
    });
  }

  function renderSidebar(parsed) {
    var prevRoute = ui.navLastRoute;
    ui.navLastRoute = parsed.route;
    var items = App.mock.NAV.map(function (item) {
      if (!item.children) return navButton(item, parsed.id === item.id, false);

      // 只在"换页"时自动展开（手动折叠后不再被强行展开）
      if (prevRoute !== parsed.route && groupHasActive(item, parsed)) {
        ui.navExpanded[item.id] = true;
      }
      var open = isGroupOpen(item);

      var subs = open ? '<div class="nav-sub" id="nav-sub-' + esc(item.id) + '">' +
        item.children.map(function (c) {
          var sub = c.route.split('/').pop();
          return navButton(c, parsed.id === item.id && parsed.sub === sub, true);
        }).join('') + '</div>' : '';

      /* 分组折叠时，若当前页面就在这个分组里，用 has-active 提示"你在这组里"，
         否则整条侧栏看不到任何当前位置 */
      return navGroupButton(item, open, groupHasActive(item, parsed)) + subs;
    }).join('');

    return '<aside class="sidebar" id="app-sidebar">' +
      '<div class="sidebar-head">' +
        '<span class="hero-mark">' + icon('archive') + '</span>' +
        '<span class="brand-text">' +
          '<b>' + esc(App.mock.ORG.system) + '</b>' +
          '<small>' + esc(App.mock.ORG.name) + '</small>' +
        '</span>' +
      '</div>' +
      '<nav class="nav" aria-label="主导航">' + items + '</nav>' +
      '<div class="sidebar-foot">' +
        esc(App.mock.ORG.version) + ' · ' + esc(App.mock.ORG.env) + '<br>' +
        '种子 ' + (App.mock && App.mock.SEED_VERSION ? App.mock.SEED_VERSION : '-') + '　·　' +
        '生产架构见《技术选型方案》' +
      '</div>' +
    '</aside>' +
    (ui.navOpen ? '<div class="nav-scrim" data-action="nav:close" aria-hidden="true"></div>' : '');
  }

  /* ======================================================================
     顶栏与用户菜单
     ====================================================================== */

  function renderUserMenu() {
    var user = S.currentUser() || {};
    var roles = S.users().map(function (u) {
      var checked = u.id === user.id;
      return '<button type="button" class="menu-item' + (checked ? ' checked' : '') + '" ' +
        'data-action="user:switch" data-id="' + esc(u.id) + '">' +
        icon(checked ? 'check' : 'user') +
        '<span>' + esc(u.name + ' · ' + u.roleLabel) + '</span>' +
      '</button>';
    }).join('');

    return '<div class="menu hidden" id="user-menu" role="menu" aria-label="用户菜单">' +
      '<div class="menu-head">' +
        '<b>' + esc(user.name || '') + '</b>' +
        '<span>' + esc((user.dept || '') + ' · ' + (user.roleLabel || '')) + '</span>' +
      '</div>' +
      '<button type="button" class="menu-item" data-action="user:profile">' +
        icon('user') + '<span>个人信息</span></button>' +
      '<button type="button" class="menu-item" data-action="user:password">' +
        icon('key') + '<span>修改密码</span></button>' +
      '<div class="menu-sep"></div>' +
      '<div class="menu-label">切换演示角色（观察权限差异）</div>' +
      roles +
      '<div class="menu-sep"></div>' +
      '<button type="button" class="menu-item" data-action="user:reset-demo">' +
        icon('rotate-ccw') + '<span>重置演示数据</span></button>' +
      '<button type="button" class="menu-item" data-action="user:logout">' +
        icon('log-out') + '<span>退出登录</span></button>' +
    '</div>';
  }

  function renderTopbar(pageTitle, crumb, actionsHtml) {
    var user = S.currentUser() || {};
    return '<header class="topbar">' +
      '<button type="button" class="icon-btn" data-action="nav:toggle" ' +
        'aria-label="展开或收起导航" title="展开或收起导航">' + icon('panel-left') + '</button>' +
      '<span class="topbar-title">' + esc(pageTitle) + '</span>' +
      (crumb ? '<span class="topbar-sep"></span><span class="topbar-crumb">' + esc(crumb) + '</span>' : '') +
      '<span class="spacer"></span>' +
      (actionsHtml || '') +
      '<button type="button" class="icon-btn" data-action="app:notify" ' +
        'aria-label="消息通知" title="消息通知">' + icon('bell') +
        '<span class="dot"></span>' +
        (S.unreadMessageCount && S.unreadMessageCount()
          ? '<span class="badge">' + S.unreadMessageCount() + '</span>' : '') +
        '</button>' +
      '<button type="button" class="user-trigger" data-action="ui:menu" ' +
        'data-menu-trigger="user-menu" aria-haspopup="true" aria-expanded="false">' +
        '<span class="avatar">' + esc(App.util.nameInitials(user.name)) + '</span>' +
        '<span class="u-name">' + esc(user.name || '') + '</span>' +
        '<span class="u-role">' + esc(user.roleLabel || '') + '</span>' +
        icon('chevron-down') +
      '</button>' +
      renderUserMenu() +
    '</header>';
  }

  /* ======================================================================
     占位页 / 404
     ====================================================================== */

  function renderPlaceholder(parsed) {
    var childKey = parsed.sub ? parsed.id + '/' + parsed.sub : null;
    var meta = (childKey && CHILD_PLACEHOLDERS[childKey]) || PLACEHOLDERS[parsed.id];
    var title = parsed.sub ? (childLabel(parsed.id, parsed.sub) || meta.title) : meta.title;

    var points = meta.points.map(function (p, i) {
      return '<div class="ph-step"><span class="ph-no">' + (i + 1) + '</span><span>' + esc(p) + '</span></div>';
    }).join('');

    return '<div class="page-head">' +
        '<div class="ph-main">' +
          '<h1>' + esc(title) + '</h1>' +
          '<div class="ph-sub">' + esc(meta.intro) + '</div>' +
        '</div>' +
        '<div class="ph-actions">' +
          U.tag('原型待生成', 'tag-warn') +
          '<button class="btn btn-sm" data-action="nav:go" data-route="#/workbench">' +
            icon('arrow-left') + '返回工作台</button>' +
        '</div>' +
      '</div>' +
      '<section class="card placeholder-card">' +
        '<div class="card-head">' +
          '<span>规划功能要点</span>' +
          '<span class="spacer"></span>' +
          '<span class="head-note">摘自《档案辅助编研系统功能模块设计》</span>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="alert alert-info" role="note">' +
            '<span class="alert-icon">' + icon('info') + '</span>' +
            '<div><div class="alert-title">本模块原型尚未生成</div>' +
            '本模块按约定逐模块交付，尚未生成本期原型。' +
            '本页先列出该模块的功能要点，便于评审时确认范围与优先级。</div>' +
          '</div>' +
          '<div class="ph-steps">' + points + '</div>' +
        '</div>' +
      '</section>';
  }

  function renderNotFound(parsed) {
    return '<div class="page-head"><div class="ph-main"><h1>页面不存在</h1>' +
      '<div class="ph-sub">未找到路由 <code>' + esc(parsed.route) + '</code> 对应的页面。</div></div></div>' +
      '<section class="card"><div class="card-body">' +
        U.empty('该地址没有对应的原型页面', 'alert-triangle',
          '<button class="btn btn-primary" data-action="nav:go" data-route="#/workbench">' +
          icon('dashboard') + '返回工作台</button>') +
      '</div></section>';
  }

  /* ======================================================================
     渲染
     ====================================================================== */

  function isMobileNav() {
    return global.matchMedia ? global.matchMedia('(max-width: 1024px)').matches : false;
  }

  /* ---- 导航开合：就地改类，不整体重渲染 ----
     整体重渲染会让被点击的按钮从文档中移除，键盘焦点随之丢失。
     导航开合属于纯视觉状态，只切 class 即可。 */

  function setNavCollapsed(collapsed) {
    ui.navCollapsed = collapsed;
    var shell = document.querySelector('.shell');
    if (shell) shell.classList.toggle('nav-collapsed', collapsed);
  }

  function setNavOpen(open) {
    ui.navOpen = open;
    var shell = document.querySelector('.shell');
    if (!shell) return;
    shell.classList.toggle('nav-open', open);

    // 移动端遮罩由 JS 动态挂载/移除，与 renderSidebar 的输出保持一致
    var scrim = shell.querySelector('.nav-scrim');
    if (open && !scrim) {
      scrim = document.createElement('div');
      scrim.className = 'nav-scrim';
      scrim.setAttribute('data-action', 'nav:close');
      scrim.setAttribute('aria-hidden', 'true');
      shell.appendChild(scrim);
    } else if (!open && scrim) {
      scrim.parentNode.removeChild(scrim);
    }
  }

  /** 页面键：一级模块用 id，二级模块用 'parent/sub'（如 material/tags） */
  function pageKey(parsed) {
    return parsed.sub ? parsed.id + '/' + parsed.sub : parsed.id;
  }

  function resolvePage(parsed) {
    var nav = findNav(parsed.id);
    return (nav && nav.label) || '工作台';
  }

  function render() {
    var appEl = document.getElementById('app');
    if (!appEl) return;

    var parsed = App.router.parse(App.router.current());

    /* 一级菜单只作分组、没有自己的页面：直接落到它的第一个二级菜单。
       （这样从别处粘 #/material 这类链接也不会看到空页或规划说明页） */
    var asGroup = findNav(parsed.id);
    if (asGroup && asGroup.children && !parsed.sub && parsed.id !== 'login') {
      App.router.navigate(asGroup.children[0].route);
      return;
    }

    /* 未登录：只允许停在登录页 */
    if (!S.isLoggedIn()) {
      if (parsed.id !== 'login') {
        App.router.navigate(App.router.LOGIN_ROUTE, { replace: true });
        return;
      }
      appEl.innerHTML = '<a class="skip-link" href="#login-form">跳到登录表单</a>' +
        App.pages.login.render();
      App.pages.login.mount(appEl);
      return;
    }

    /* 已登录：登录页不再可达 */
    if (parsed.id === 'login') {
      App.router.navigate(App.router.DEFAULT_ROUTE, { replace: true });
      return;
    }

    /* 页面解析：先找二级模块页（material/tags），再退回一级模块页 ——
       一级模块可自行处理 sub（如 #/task/RW-2026-001 的任务详情） */
    var page = App.pages[pageKey(parsed)] || (parsed.sub ? (App.pages[parsed.id] || null) : null);
    var title = resolvePage(parsed);
    var crumb = (page && page.crumb)
      ? page.crumb(parsed)
      : (parsed.sub ? (childLabel(parsed.id, parsed.sub) || '') : '');
    var body;
    var topbarActions = page && page.topbarActions ? page.topbarActions() : '';
    var pageClass = page && page.pageClass ? ' ' + page.pageClass : '';

    if (page) {
      body = page.render(parsed);
    } else if (PLACEHOLDERS[parsed.id]) {
      // 未生成的模块（含二级模块）统一给出规划说明页
      body = renderPlaceholder(parsed);
    } else {
      body = renderNotFound(parsed);
    }

    appEl.innerHTML =
      '<a class="skip-link" href="#main">跳到主要内容</a>' +
      '<div class="shell' + (ui.navCollapsed ? ' nav-collapsed' : '') +
        (ui.navOpen ? ' nav-open' : '') + '">' +
        renderSidebar(parsed) +
        '<div class="main-col">' +
          renderTopbar(title, crumb, topbarActions) +
          '<main class="page' + pageClass + '" id="main" tabindex="-1">' + body + '</main>' +
        '</div>' +
      '</div>';

    if (page && page.mount) page.mount(appEl);
  }

  /* ======================================================================
     交互注册
     ====================================================================== */

  function registerApp() {
    U.register('ui:close', function () { U.closeTop(); });

    /* 导航 */
    /* 一级菜单（分组）展开 / 折叠：不跳转，只切换二级菜单 */
    /* 注意：动作名不能叫 nav:toggle —— 顶栏「展开或收起导航」已经用了这个名字，
       同名注册会互相覆盖（这里曾经踩过：分组按钮点了没反应、侧栏收起也失灵） */
    U.register('nav:group', function (ds) {
      var item = findNav(ds.id);
      if (!item || !item.children) return;
      ui.navExpanded[item.id] = !isGroupOpen(item);
      App.app.render();
    });

    U.register('nav:go', function (ds) {
      if (!ds.route) return;
      if (ui.navOpen) setNavOpen(false);
      App.router.navigate(ds.route);
    });

    U.register('nav:toggle', function () {
      if (isMobileNav()) setNavOpen(!ui.navOpen);
      else setNavCollapsed(!ui.navCollapsed);
    });

    U.register('nav:close', function () {
      if (ui.navOpen) setNavOpen(false);
    });

    /* 顶栏 */
    U.register('ui:menu', function (ds, el) { U.toggleMenu(el); });

    U.register('app:notify', function () {
      U.closeMenus();
      if (App.messages) App.messages.openPanel();
      else U.toast('消息中心尚未实现', 'info');
    });

    /* 用户 */
    U.register('user:switch', function (ds) {
      var u = S.findById(ds.id);
      if (!u) return;
      U.closeMenus();
      if (!S.switchUser(ds.id)) return;
      // 切换角色后，当前用户可能无权停留在原页面，统一回到工作台更易观察差异
      App.router.navigate('#/workbench');
      U.toast('已切换为 ' + u.name + '（' + u.roleLabel + '）', 'ok');
    });

    U.register('user:profile', function () {
      var u = S.currentUser() || {};
      U.closeMenus();
      U.modal({
        title: '个人信息',
        width: 520,
        cancelText: null,
        okText: '知道了',
        body: '<dl class="desc">' +
          '<dt>姓名</dt><dd>' + esc(u.name || '') + '</dd>' +
          '<dt>账号</dt><dd>' + esc(u.account || '—') + '</dd>' +
          '<dt>角色</dt><dd>' + esc(u.roleLabel || '') + '</dd>' +
          '<dt>部门</dt><dd>' + esc(u.dept || '') + '</dd>' +
          '<dt>职务</dt><dd>' + esc(u.title || '') + '</dd>' +
        '</dl>' +
        '<div class="data-note" style="margin-top:var(--s4)">' + icon('info') +
        '<span>原型用「角色切换」模拟权限；生产环境由统一身份认证下发角色与数据权限。</span></div>'
      });
    });

    U.register('user:password', function () {
      U.closeMenus();
      U.toast('修改密码需对接统一身份认证，原型暂不实现', 'info');
    });

    /* 演示数据存在浏览器本地：评审时若数据被改乱、或本地是旧版本，用这里一键回到初始状态 */
    U.register('user:reset-demo', function () {
      U.closeMenus();
      U.confirm({
        title: '重置演示数据？',
        content: '将清空本浏览器中保存的选题、素材、任务、成果与归档设置，恢复到初始演示数据；' +
          '当前登录状态会保留。',
        okText: '重置并重新加载'
      }).then(function (ok) {
        if (!ok) return;
        ['archive-proto-system:topics', 'archive-proto-system:tags', 'archive-proto-system:materials',
         'archive-proto-system:tasks', 'archive-proto-system:products', 'archive-proto-system:archive',
         'archive-proto-system:outline', 'archive-proto-system:selections',
         'archive-proto-system:compose', 'archive-proto-system:auditRules', 'archive-proto-system:auditResults',
         'archive-proto-system:taskProgress',
         'archive-proto-system:messages', 'archive-proto-system:publish',
         'archive-proto-system:seed'].forEach(function (k) {
          try { localStorage.removeItem(k); } catch (e) {}
        });
        location.reload();
      });
    });

    U.register('user:logout', function () {
      U.closeMenus();
      U.confirm({
        title: '退出登录？',
        content: '退出后需要重新输入账号、密码与验证码。原型数据仍保留在本机浏览器中。',
        okText: '退出登录'
      }).then(function (ok) {
        if (!ok) return;
        S.logout();
        U.toast('已退出登录', 'ok');
        // 退出后由 render 统一跳转到登录页
        App.router.navigate(App.router.LOGIN_ROUTE, { replace: true });
      });
    });
  }

  /* ======================================================================
     启动
     ====================================================================== */

  function boot() {
    S.init();
    if (S.reseeded && S.reseeded()) {
      /* 种子更新会重置演示数据；任务进展（阶段/状态）是用户的操作结果，单独保留 */
      setTimeout(function () {
        U.toast('演示数据已更新到「种子 ' + (App.mock.SEED_VERSION || '-') +
          '」；任务进展（阶段 / 状态）已保留', 'ok');
      }, 400);
    }
    /* 页面动作注册：遍历 App.pages 自动注册，新增模块不必再改这里 */
    Object.keys(App.pages).forEach(function (name) {
      var page = App.pages[name];
      if (page && typeof page.register === 'function') page.register();
      else if (typeof page === 'function') page();
    });
    registerApp();

    U.initDelegation(document.getElementById('app'));
    U.initDelegation(document.getElementById('overlay-root'));
    U.bindMenus();
    /* 全屏工作台（加工编排）的 Esc 退出 */
    if (App.taskCompose && App.taskCompose.bindKeys) App.taskCompose.bindKeys();
    /* 全屏校定界面（校定内容）的 Esc 退出 */
    if (App.reviewCalibrate && App.reviewCalibrate.bindKeys) App.reviewCalibrate.bindKeys();
    /* 全屏审核界面（成果发布审核）的 Esc 退出 */
    if (App.messages && App.messages.bindKeys) App.messages.bindKeys();
    /* 全屏立项审核界面（选题立项审核）的 Esc 退出 */
    if (App.topicReview && App.topicReview.bindKeys) App.topicReview.bindKeys();

    // 视口变宽后自动收起移动端抽屉，避免留下遮罩
    global.addEventListener('resize', function () {
      if (ui.navOpen && !isMobileNav()) setNavOpen(false);
    });

    S.subscribe(render);
    App.router.init(render);
  }

  App.app = { render: render, boot: boot, ui: ui };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
