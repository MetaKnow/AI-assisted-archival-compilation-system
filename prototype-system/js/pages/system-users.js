/* ==========================================================================
   页面：系统管理 · 用户管理

   需求（评审给出）：
     1. 新增：设置用户名、姓名、密码            → **生成界面**
     2. 修改：修改用户名、姓名、密码            → 只给按钮
     3. 删除：删除用户                          → 只给按钮
     4. 更多操作：权限迁移、重置密码、批量导入、批量导出、锁定、解锁
        —— 其中**权限迁移生成界面**，其余只给按钮

   权限迁移：勾选一个用户后点击，弹出选择用户窗口，把该用户的**"涉及本人"的业务数据**迁移到目标用户。
     涉及范围（按评审口径）：
       · 编研任务：本人在任务团队里担任角色，或本人创建的任务
       · 审核校定：本人是发起人（by）或审核人（reviewer）的流程
     **本次只生成界面**：确认后不改动任务/流程数据，落库逻辑由评审后续统一处理。

   设计文档只写了「用户管理」与「权限迁移」两句，字段与权限口径按原型假设实现（见 README）。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = { selected: {}, picker: { keyword: '', targetId: null } };

  /* 只给按钮、界面本次不生成的功能 */
  var BUTTON_ONLY = {
    edit: '修改用户的界面本次不生成',
    remove: '删除用户的界面本次不生成',
    resetPwd: '重置密码的界面本次不生成',
    import: '批量导入的界面本次不生成',
    export: '批量导出的界面本次不生成',
    lock: '锁定的界面本次不生成',
    unlock: '解锁的界面本次不生成'
  };

  function selectedIds() {
    return Object.keys(state.selected).filter(function (id) {
      return state.selected[id] && S.users().some(function (u) { return u.id === id; });
    });
  }

  /** 列表摘要：该用户"涉及本人"的业务数据量 */
  function permText(u) {
    return S.involvementText(u.id);
  }

  /** 悬停显示具体涉及哪些任务与流程 */
  function involvementTitle(u) {
    var inv = S.userInvolvement(u.id);
    var parts = [];
    if (inv.tasks.length) {
      parts.push('编研任务：' + inv.tasks.slice(0, 6).map(function (t) { return t.id; }).join('、') +
        (inv.tasks.length > 6 ? ' 等 ' + inv.tasks.length + ' 个' : ''));
    }
    if (inv.flows.length) {
      parts.push('审核流程：' + inv.flows.map(function (f) { return f.flowNo; }).join('、'));
    }
    return parts.length ? parts.join('；') : '没有涉及本人的编研任务或审核流程';
  }

  /* ------------------------------------------------------------ 列表 */

  function renderToolbar() {
    var n = selectedIds().length;
    return '<div class="toolbar">' +
      '<button type="button" class="btn btn-primary" data-action="usr:new">' + icon('plus') + '新增</button>' +
      '<button type="button" class="btn" data-action="usr:edit"' +
        (n === 1 ? '' : ' aria-disabled="true"') +
        ' title="' + (n === 1 ? '修改选中的用户' : '请先勾选一个用户') + '">' +
        icon('pencil') + '修改</button>' +
      '<button type="button" class="btn" data-action="usr:delete"' +
        (n ? '' : ' aria-disabled="true"') +
        ' title="' + (n ? '删除选中的用户' : '请先勾选用户') + '">' +
        icon('minus') + '删除</button>' +
      '<span class="spacer"></span>' +
      '<span class="toolbar-note">共 ' + S.users().length + ' 个用户　·　已锁定 ' +
        S.users().filter(function (u) { return u.locked; }).length + ' 个</span>' +
      '<span class="saf-more-wrap">' +
        '<button type="button" class="btn" data-action="ui:menu" data-menu-trigger="usr-more" ' +
          'aria-haspopup="true" aria-expanded="false">' + icon('more-vertical') + '更多操作</button>' +
        '<div class="menu hidden" id="usr-more" role="menu">' +
          '<button type="button" class="menu-item" data-action="usr:migrate">' +
            icon('share') + '<span>权限迁移</span></button>' +
          '<button type="button" class="menu-item" data-action="usr:reset-pwd">' +
            icon('key') + '<span>重置密码</span></button>' +
          '<div class="menu-sep"></div>' +
          '<button type="button" class="menu-item" data-action="usr:import">' +
            icon('upload') + '<span>批量导入</span></button>' +
          '<button type="button" class="menu-item" data-action="usr:export">' +
            icon('download') + '<span>批量导出</span></button>' +
          '<div class="menu-sep"></div>' +
          '<button type="button" class="menu-item" data-action="usr:lock">' +
            icon('lock') + '<span>锁定</span></button>' +
          '<button type="button" class="menu-item" data-action="usr:unlock">' +
            icon('unlock') + '<span>解锁</span></button>' +
        '</div>' +
      '</span>' +
    '</div>';
  }

  function renderTable() {
    var rows = S.users();
    var body = rows.map(function (u, i) {
      return '<tr' + (state.selected[u.id] ? ' class="selected"' : '') + '>' +
        '<td class="col-check"><input type="checkbox" data-change="usr:select" data-id="' + esc(u.id) + '"' +
          (state.selected[u.id] ? ' checked' : '') + ' aria-label="选择 ' + esc(u.name) + '"></td>' +
        '<td class="col-idx tnum">' + (i + 1) + '</td>' +
        '<td class="usr-account">' + esc(u.account || '—') + '</td>' +
        '<td class="usr-name">' + esc(u.name) +
          (u.id === (S.currentUser() || {}).id ? ' ' + U.tag('当前登录', 'tag-accent') : '') + '</td>' +
        '<td>' + esc(u.roleLabel || u.role) + '</td>' +
        '<td class="usr-dept">' + esc(u.dept || '—') + '</td>' +
        '<td class="usr-perm" title="' + esc(involvementTitle(u)) + '">' + esc(permText(u)) + '</td>' +
        '<td>' + (u.locked ? U.tag('已锁定', 'tag-warn') : U.tag('正常', 'tag-ok')) + '</td>' +
        '<td class="tnum usr-created">' + esc(String(u.createdAt || '').slice(0, 10)) + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="table-scroll"><table class="table usr-table">' +
      '<thead><tr>' +
        '<th class="col-check"><input type="checkbox" id="usr-check-all" data-change="usr:select-all" ' +
          'aria-label="全选用户"></th>' +
        '<th class="col-idx">序号</th>' +
        '<th>用户名</th>' +
        '<th>姓名</th>' +
        '<th>角色</th>' +
        '<th>部门</th>' +
        '<th>涉及数据</th>' +
        '<th>状态</th>' +
        '<th>创建时间</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function render() {
    Object.keys(state.selected).forEach(function (id) {
      if (!S.users().some(function (u) { return u.id === id; })) delete state.selected[id];
    });
    return renderToolbar() +
      '<section class="card">' + renderTable() + '</section>';
  }

  /* ------------------------------------------------------------ 新增 */

  function openCreate() {
    U.modal({
      title: '新增用户',
      width: 640,
      okText: '保存',
      cancelText: '关闭',
      body:
        '<div class="rec-form" id="usr-form">' +
          '<div class="rec-row">' +
            '<label class="rec-label" for="u-account"><span class="req">*</span>用户名：</label>' +
            '<div class="rec-field">' +
              '<input class="input" id="u-account" maxlength="20" autocomplete="off" ' +
                'placeholder="登录账号，字母开头，3—20 位">' +
              '<div class="field-error" id="u-account-error" role="alert" hidden></div>' +
            '</div>' +
          '</div>' +
          '<div class="rec-row">' +
            '<label class="rec-label" for="u-name"><span class="req">*</span>姓名：</label>' +
            '<div class="rec-field">' +
              '<input class="input" id="u-name" maxlength="20" autocomplete="off" placeholder="请输入姓名">' +
              '<div class="field-error" id="u-name-error" role="alert" hidden></div>' +
            '</div>' +
          '</div>' +
          '<div class="rec-row">' +
            '<label class="rec-label" for="u-pwd"><span class="req">*</span>密码：</label>' +
            '<div class="rec-field">' +
              '<input class="input" id="u-pwd" type="password" maxlength="32" autocomplete="new-password" ' +
                'placeholder="至少 6 位">' +
              '<div class="field-error" id="u-pwd-error" role="alert" hidden></div>' +
              '<div class="rec-field-extra">原型里密码按明文保存仅用于演示；生产环境应加密存储并强制首次登录修改。</div>' +
            '</div>' +
          '</div>' +
        '</div>',
      onOk: function (el) {
        var modal = el.closest ? el.closest('.modal') : el;
        var data = {
          account: modal.querySelector('#u-account').value,
          name: modal.querySelector('#u-name').value,
          password: modal.querySelector('#u-pwd').value
        };
        var res = S.addUser(data);
        if (!res.ok) {
          /* 内联报错（与归档设置同一套交互） */
          var map = { '用户名': 'u-account', '姓名': 'u-name', '密码': 'u-pwd' };
          var key = Object.keys(map).filter(function (k) { return res.message.indexOf(k) >= 0; })[0];
          var box = modal.querySelector('#' + (map[key] || 'u-account') + '-error');
          if (box) { box.textContent = res.message; box.removeAttribute('hidden'); }
          var input = modal.querySelector('#' + (map[key] || 'u-account'));
          if (input) { input.classList.add('input-error'); input.focus(); }
          return false;
        }
        U.toast(res.message, 'ok');
        return true;
      }
    });
    setTimeout(function () {
      var modal = document.querySelector('.modal');
      if (!modal) return;
      [['u-account', '用户名'], ['u-name', '姓名'], ['u-pwd', '密码']].forEach(function (pair) {
        var input = modal.querySelector('#' + pair[0]);
        if (!input) return;
        input.addEventListener('input', function () {
          var box = modal.querySelector('#' + pair[0] + '-error');
          if (box && box.textContent) { box.textContent = ''; box.setAttribute('hidden', ''); }
          input.classList.remove('input-error');
        });
      });
      var first = modal.querySelector('#u-account');
      if (first) first.focus();
    }, 30);
  }

  /* -------------------------------------------------------- 权限迁移 */

  function migrateBody(from) {
    var inv = S.userInvolvement(from.id);
    var kw = state.picker.keyword.trim().toLowerCase();
    var others = S.users().filter(function (u) {
      if (u.id === from.id) return false;
      if (!kw) return true;
      return (u.name + ' ' + (u.account || '') + ' ' + (u.roleLabel || '')).toLowerCase().indexOf(kw) >= 0;
    });

    /* ① 将要迁移的业务数据：编研任务 + 审核流程 */
    var taskRows = inv.tasks.map(function (t) {
      return '<div class="mi-row">' +
        '<span class="mi-no">' + esc(t.id) + '</span>' +
        '<span class="mi-name">' + esc(t.topicName) + '</span>' +
        '<span class="mi-as">' + t.as.map(function (a) { return U.tag(a, 'tag-accent'); }).join(' ') + '</span>' +
      '</div>';
    }).join('');

    var flowRows = inv.flows.map(function (f) {
      var st = App.mock.REVIEW_FLOW_STATUS[f.status] || { label: f.status, tag: '' };
      return '<div class="mi-row">' +
        '<span class="mi-no">' + esc(f.flowNo) + '</span>' +
        '<span class="mi-name">' + esc(f.targetName) + '</span>' +
        '<span class="mi-as">' + f.as.map(function (a) { return U.tag(a, 'tag-warn'); }).join(' ') +
          ' ' + U.tag(st.label, st.tag) + '</span>' +
      '</div>';
    }).join('');

    var dataBlock =
      '<div class="mi-block">' +
        '<div class="mi-head">要迁移的数据（涉及「' + esc(from.name) + '」）' +
          '<span class="spacer"></span>' +
          '<span class="mi-count">编研任务 <b>' + inv.tasks.length + '</b> 个　·　审核流程 <b>' +
            inv.flows.length + '</b> 条</span>' +
        '</div>' +
        '<div class="mi-sub">编研任务（本人在团队中担任角色，或本人创建）</div>' +
        (taskRows || '<div class="mi-empty">无</div>') +
        '<div class="mi-sub">审核校定流程（本人是发起人或审核人）</div>' +
        (flowRows || '<div class="mi-empty">无</div>') +
      '</div>';

    /* ② 接收人 */
    var list = others.map(function (u) {
      var pu = S.userInvolvement(u.id);
      var on = state.picker.targetId === u.id;
      return '<label class="pick-row' + (on ? ' on' : '') + '">' +
        '<input type="radio" name="perm-target" value="' + esc(u.id) + '"' +
          (on ? ' checked' : '') + ' data-change="usr:pick">' +
        '<span class="pick-main">' +
          '<span class="pick-name">' + esc(u.name) +
            ' <span class="muted">（' + esc(u.account || '无账号') + '）</span></span>' +
          '<span class="pick-sub">' + esc(u.roleLabel || u.role) + '　·　' + esc(u.dept || '') +
            (u.locked ? '　·　已锁定' : '') + '</span>' +
        '</span>' +
        '<span class="pick-perm">任务 ' + pu.tasks.length + '　流程 ' + pu.flows.length + '</span>' +
      '</label>';
    }).join('');

    var emptyAll = !inv.tasks.length && !inv.flows.length;

    return '<div class="alert alert-warn" role="note">' +
        '<span class="alert-icon">' + icon('alert-triangle') + '</span><div>' +
        '权限迁移是<b>交接</b>：目标用户将承接上面这些编研任务与审核流程的关联关系。' +
        '<b>本次只生成界面</b>，确认后不会改动任务与流程数据 —— 落库逻辑由评审统一处理。</div>' +
      '</div>' +
      dataBlock +
      (emptyAll
        ? '<div class="data-note" style="margin-top:var(--s3)">' + icon('info') +
          '<span>「' + esc(from.name) + '」当前没有涉及本人的编研任务或审核流程，暂无可迁移的数据。</span></div>'
        : '') +
      '<div class="field-label" style="margin-top:var(--s4)">选择接收的用户<span class="req">*</span></div>' +
      '<div class="hstack" style="margin:var(--s2) 0">' +
        '<input class="input" id="perm-kw" placeholder="搜索姓名 / 用户名 / 角色" ' +
          'value="' + esc(state.picker.keyword) + '" data-enter="usr:pick-search">' +
        '<button type="button" class="btn" data-action="usr:pick-search">' + icon('search') + '搜索</button>' +
      '</div>' +
      '<div class="pick-list">' + (list || U.empty('没有匹配的用户', 'users')) + '</div>' +
      '<div class="field-error" id="perm-error" role="alert" hidden></div>';
  }

  function openMigrate() {
    var ids = selectedIds();
    if (ids.length !== 1) {
      U.toast('请先勾选一个用户，再执行权限迁移', 'warn');
      return;
    }
    var from = S.users().filter(function (u) { return u.id === ids[0]; })[0];
    state.picker.keyword = '';
    state.picker.targetId = null;

    U.modal({
      title: '权限迁移 · ' + from.name,
      width: 760,
      okText: '确认迁移',
      cancelText: '取消',
      body: migrateBody(from),
      onOk: function (el) {
        var modal = el.closest ? el.closest('.modal') : el;
        var box = modal.querySelector('#perm-error');
        if (!state.picker.targetId) {
          if (box) { box.textContent = '请选择接收权限的用户'; box.removeAttribute('hidden'); }
          return false;
        }
        var res = S.migratePermissions(from.id, state.picker.targetId);
        if (!res.ok) {
          if (box) { box.textContent = res.message; box.removeAttribute('hidden'); }
          return false;
        }
        U.toast(res.message, 'ok');
        return true;
      }
    });

    setTimeout(function () {
      var modal = document.querySelector('.modal');
      if (!modal) return;
      var input = modal.querySelector('#perm-kw');
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') doPickSearch();
        });
      }
    }, 30);
  }

  function doPickSearch() {
    var input = document.getElementById('perm-kw');
    state.picker.keyword = input ? input.value : '';
    var from = S.users().filter(function (u) { return u.id === selectedIds()[0]; })[0];
    if (!from) return;
    /* 就地替换列表，避免整窗重建导致已选目标丢失 */
    var modal = document.querySelector('.modal');
    var list = modal && modal.querySelector('.pick-list');
    if (!list) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = migrateBody(from);
    var next = tmp.querySelector('.pick-list');
    list.parentNode.replaceChild(next, list);
  }

  /* ------------------------------------------------------------ 交互 */

  function syncSelection() {
    var root = document.getElementById('main');
    if (!root) return;
    var rows = S.users();
    rows.forEach(function (u) {
      var cb = root.querySelector('input[data-change="usr:select"][data-id="' + u.id + '"]');
      if (!cb) return;
      var on = !!state.selected[u.id];
      cb.checked = on;
      var tr = cb.closest ? cb.closest('tr') : null;
      if (tr) tr.classList.toggle('selected', on);
    });
    var sel = selectedIds().length;
    var all = root.querySelector('#usr-check-all');
    if (all) {
      all.checked = rows.length > 0 && sel === rows.length;
      all.indeterminate = sel > 0 && sel < rows.length;
    }
    [['usr:edit', sel === 1], ['usr:delete', sel > 0]].forEach(function (pair) {
      var b = root.querySelector('[data-action="' + pair[0] + '"]');
      if (!b) return;
      if (pair[1]) b.removeAttribute('aria-disabled');
      else b.setAttribute('aria-disabled', 'true');
    });
  }

  /** 只给按钮的功能：点一下说明界面未生成 */
  function buttonOnly(key, needSelection) {
    var ids = selectedIds();
    if (needSelection && !ids.length) {
      U.toast('请先勾选用户', 'warn');
      return;
    }
    var names = ids.map(function (id) {
      var u = S.users().filter(function (x) { return x.id === id; })[0];
      return u ? u.name : '';
    }).filter(Boolean);
    U.toast(names.length
      ? ('已勾选 ' + names.join('、') + '：' + BUTTON_ONLY[key] + '，本次只提供按钮。')
      : (BUTTON_ONLY[key] + '，本次只提供按钮。'), 'warn');
  }

  function register() {
    U.register('usr:new', function () { openCreate(); });

    U.register('usr:select', function (ds, el) {
      if (el.checked) state.selected[ds.id] = true;
      else delete state.selected[ds.id];
      syncSelection();
    });
    U.register('usr:select-all', function (ds, el) {
      if (el.checked) S.users().forEach(function (u) { state.selected[u.id] = true; });
      else state.selected = {};
      syncSelection();
    });

    U.register('usr:edit', function () { buttonOnly('edit', true); });
    U.register('usr:delete', function () { buttonOnly('remove', true); });
    U.register('usr:reset-pwd', function () { U.closeMenus(); buttonOnly('resetPwd', true); });
    U.register('usr:import', function () { U.closeMenus(); buttonOnly('import', false); });
    U.register('usr:export', function () { U.closeMenus(); buttonOnly('export', false); });
    U.register('usr:lock', function () { U.closeMenus(); buttonOnly('lock', true); });
    U.register('usr:unlock', function () { U.closeMenus(); buttonOnly('unlock', true); });

    /* 权限迁移 */
    U.register('usr:migrate', function () {
      U.closeMenus();
      openMigrate();
    });
    U.register('usr:pick', function (ds, el) {
      state.picker.targetId = el.value;
      var modal = document.querySelector('.modal');
      if (modal) {
        Array.prototype.forEach.call(modal.querySelectorAll('.pick-row'), function (row) {
          var radio = row.querySelector('input[name="perm-target"]');
          row.classList.toggle('on', radio && radio.checked);
        });
        var box = modal.querySelector('#perm-error');
        if (box) { box.textContent = ''; box.setAttribute('hidden', ''); }
      }
    });
    U.register('usr:pick-search', function () { doPickSearch(); });
  }

  App.pages = App.pages || {};
  App.pages['system/users'] = {
    render: render,
    register: register,
    pageClass: 'page-compact'
  };
})(window);
