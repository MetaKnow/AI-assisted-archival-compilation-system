/* ==========================================================================
   页面：登录

   原型说明：
     · 验证码为**前端模拟**（真实系统由后端生成并校验）
     · 账号口令为演示数据，生产环境替换为统一身份认证（Keycloak / 单点登录）
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var REMEMBER_KEY = 'archive-proto-system:remembered-account';

  /* 验证码：去掉 0/O/1/I/l 等易混字符，避免演示时看不清 */
  var CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXY23456789';
  var captcha = '';

  function newCaptcha() {
    var s = '';
    for (var i = 0; i < 4; i++) {
      s += CAPTCHA_CHARS.charAt(Math.floor(Math.random() * CAPTCHA_CHARS.length));
    }
    captcha = s;
    return s;
  }

  function readRemembered() {
    try { return global.localStorage.getItem(REMEMBER_KEY) || ''; } catch (e) { return ''; }
  }

  function writeRemembered(account) {
    try {
      if (account) global.localStorage.setItem(REMEMBER_KEY, account);
      else global.localStorage.removeItem(REMEMBER_KEY);
    } catch (e) { /* 存储不可用时忽略，不影响登录 */ }
  }

  /* ------------------------------------------------------------ 视图 */

  function heroFeature(iconName, title, desc) {
    return '<li>' + icon(iconName) +
      '<span><b>' + esc(title) + '</b><span>' + esc(desc) + '</span></span></li>';
  }

  function demoAccountRow(u) {
    return '<button type="button" class="demo-account" data-action="login:fill" ' +
        'data-account="' + esc(u.account) + '" data-password="' + esc(u.password) + '">' +
        '<span class="da-name">' + esc(u.name) + '</span>' +
        '<span class="da-role">' + esc(u.roleLabel) + '</span>' +
        '<code>' + esc(u.account) + ' / ' + esc(u.password) + '</code>' +
      '</button>';
  }

  function render() {
    var org = App.mock.ORG;
    var code = newCaptcha();
    var remembered = readRemembered();

    return '<div class="login-page">' +
      '<section class="login-hero">' +
        '<div class="hero-brand">' +
          '<span class="hero-mark">' + icon('archive') + '</span>' +
          '<span><b>' + esc(org.name) + '</b>' +
            '<span class="org">' + esc(org.system) + '</span></span>' +
        '</div>' +
        '<h1>让编研工作<br>长在馆藏之上</h1>' +
        '<p class="hero-sub">从选题立项、素材聚合，到在线编研与成果发布，' +
          '把分散在检索、复制、排版、送审之间的工作流程收敛到一个系统里。</p>' +
        '<ul class="feature-list">' +
          heroFeature('lightbulb', '选题立项', '可行性评估、附件留档、立项审核流转') +
          heroFeature('library', '编研素材库', '目录与全文检索，标签化沉淀可复用素材') +
          heroFeature('clipboard-list', '编研任务', '六阶段进度、团队分工与过程留痕') +
          heroFeature('book-open', '编研成果', '在线浏览与下载，成果统一归档') +
        '</ul>' +
        '<div class="hero-foot">' +
          esc(org.version) + ' · ' + esc(org.env) + '<br>' +
          '生产环境将对接统一身份认证与三员分立；当前为无构建纯静态原型，数据仅存放在本机浏览器。' +
        '</div>' +
      '</section>' +

      '<section class="login-main">' +
        '<form class="login-card" id="login-form" novalidate>' +
          '<h2>用户登录</h2>' +
          '<p class="login-note">请使用馆内统一账号登录，或点击下方演示账号一键填入。</p>' +
          '<div id="login-error-slot"></div>' +

          '<div class="field">' +
            '<label class="field-label" for="login-account">账号<span class="req">*</span></label>' +
            '<input class="input" id="login-account" name="account" type="text" ' +
              'autocomplete="username" placeholder="请输入账号" data-enter="login:submit" ' +
              'value="' + esc(remembered) + '">' +
          '</div>' +

          '<div class="field">' +
            '<label class="field-label" for="login-password">密码<span class="req">*</span></label>' +
            '<div class="captcha-row">' +
              '<input class="input" id="login-password" name="password" type="password" ' +
                'autocomplete="current-password" placeholder="请输入密码" data-enter="login:submit">' +
              '<button class="btn btn-icon" type="button" data-action="login:toggle-pwd" ' +
                'id="login-pwd-toggle" title="显示密码" aria-label="显示密码">' + icon('eye') + '</button>' +
            '</div>' +
          '</div>' +

          '<div class="field">' +
            '<label class="field-label" for="login-captcha">验证码<span class="req">*</span></label>' +
            '<div class="captcha-row">' +
              '<input class="input" id="login-captcha" name="captcha" type="text" ' +
                'inputmode="latin" maxlength="4" autocomplete="off" placeholder="请输入右侧 4 位验证码" ' +
                'data-enter="login:submit" style="text-transform:uppercase">' +
              '<button class="captcha-box" type="button" id="login-captcha-box" ' +
                'data-action="login:captcha" title="看不清？点击更换" ' +
                'aria-label="验证码 ' + esc(code) + '，点击更换">' + esc(code) + '</button>' +
            '</div>' +
            '<div class="field-extra">演示用验证码，点击验证码可更换。</div>' +
          '</div>' +

          '<div class="login-row">' +
            '<label class="check"><input type="checkbox" id="login-remember"' +
              (remembered ? ' checked' : '') + '> 记住账号</label>' +
            '<span class="muted" style="font-size:var(--fs-xs)">忘记密码请联系系统管理员</span>' +
          '</div>' +

          '<button class="btn btn-primary btn-block" type="submit" ' +
            'style="height:38px" data-action="login:submit">' + icon('log-out') + '登 录</button>' +

          '<div class="demo-accounts">' +
            '<div class="da-title">演示账号（点击一键填入）</div>' +
            '<div class="da-list">' + S.loginableAccounts().map(demoAccountRow).join('') + '</div>' +
          '</div>' +
        '</form>' +
      '</section>' +
    '</div>';
  }

  /* ------------------------------------------------------------ 交互 */

  function showError(message) {
    var slot = document.getElementById('login-error-slot');
    if (!slot) return;
    slot.innerHTML = '<div class="login-error" role="alert">' +
      icon('alert-triangle') + '<span>' + esc(message) + '</span></div>';
  }

  function clearError() {
    var slot = document.getElementById('login-error-slot');
    if (slot) slot.innerHTML = '';
  }

  function refreshCaptcha() {
    var box = document.getElementById('login-captcha-box');
    var input = document.getElementById('login-captcha');
    var code = newCaptcha();
    if (box) {
      box.textContent = code;
      box.setAttribute('aria-label', '验证码 ' + code + '，点击更换');
    }
    if (input) input.value = '';
  }

  function submit() {
    var accountEl = document.getElementById('login-account');
    var pwdEl = document.getElementById('login-password');
    var capEl = document.getElementById('login-captcha');
    if (!accountEl || !pwdEl || !capEl) return;

    var account = accountEl.value.trim();
    var password = pwdEl.value;
    var input = capEl.value.trim().toUpperCase();

    clearError();

    if (!account) { showError('请输入账号。'); accountEl.focus(); return; }
    if (!password) { showError('请输入密码。'); pwdEl.focus(); return; }
    if (!input) { showError('请输入验证码。'); capEl.focus(); return; }
    if (input !== captcha) {
      showError('验证码不正确，请重新输入。');
      refreshCaptcha();
      capEl.focus();
      return;
    }

    var res = S.login(account, password);
    if (!res.ok) {
      showError(res.error);
      refreshCaptcha();
      return;
    }

    var remember = document.getElementById('login-remember');
    writeRemembered(remember && remember.checked ? account : '');

    U.toast('登录成功，' + res.user.name + '（' + res.user.roleLabel + '）', 'ok');
    // navigate 内部会触发一次渲染（同路由直接 emit，否则等 hashchange）
    App.router.navigate('#/workbench');
  }

  function register() {
    U.register('login:submit', function () { submit(); });

    U.register('login:captcha', function () { refreshCaptcha(); });

    U.register('login:fill', function (ds) {
      var accountEl = document.getElementById('login-account');
      var pwdEl = document.getElementById('login-password');
      if (accountEl) accountEl.value = ds.account || '';
      if (pwdEl) pwdEl.value = ds.password || '';
      clearError();
      var capEl = document.getElementById('login-captcha');
      if (capEl) capEl.focus();
      U.toast('已填入演示账号，请输入验证码后登录', 'info');
    });

    U.register('login:toggle-pwd', function (ds, el) {
      var pwdEl = document.getElementById('login-password');
      if (!pwdEl) return;
      var show = pwdEl.type === 'password';
      pwdEl.type = show ? 'text' : 'password';
      el.innerHTML = icon(show ? 'eye-off' : 'eye');
      el.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      el.setAttribute('title', show ? '隐藏密码' : '显示密码');
    });
  }

  /** 页面挂载后：绑定表单提交，保证回车不会触发浏览器原生提交导致刷新 */
  function mount(root) {
    var form = root.querySelector('#login-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        submit();
      });
    }
    var accountEl = root.querySelector('#login-account');
    if (accountEl && !accountEl.value) accountEl.focus();
  }

  App.pages = App.pages || {};
  App.pages.login = { render: render, register: register, mount: mount };
})(window);
