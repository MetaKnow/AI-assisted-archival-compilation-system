/* ==========================================================================
   UI 基础设施：轻提示、对话框、下拉菜单、事件委托
   全部原生 DOM 实现，零依赖。

   无障碍要点：
     · 图标一律内联 SVG（不用 emoji / 文字符号）
     · 轻提示按语义使用 role="status" / role="alert"
     · 对话框 role=dialog + aria-modal + aria-labelledby，Esc 关闭，关闭后焦点归位
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  /* ========================================================== 轻提示 */

  var TOAST_ICON = { ok: 'check', err: 'x', warn: 'alert-triangle', info: 'info' };

  function toast(message, type) {
    var root = document.getElementById('toast-root');
    if (!root) return;
    var div = document.createElement('div');
    div.className = 'toast' + (type ? ' toast-' + type : '');
    // 错误用 alert（assertive），其余用 status（polite）
    div.setAttribute('role', type === 'err' ? 'alert' : 'status');
    div.innerHTML = icon(TOAST_ICON[type] || 'info') + '<span>' + esc(message) + '</span>';
    root.appendChild(div);
    setTimeout(function () {
      div.style.transition = 'opacity 240ms, transform 240ms';
      div.style.opacity = '0';
      div.style.transform = 'translateY(-6px)';
      setTimeout(function () {
        if (div.parentNode) div.parentNode.removeChild(div);
      }, 260);
    }, 2800);
  }

  /* ======================================================== 覆盖层 */

  var openStack = [];

  function overlayRoot() { return document.getElementById('overlay-root'); }

  function closeTop() {
    var item = openStack.pop();
    if (!item) return;
    if (item.onClose) item.onClose();
    if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
    if (openStack.length === 0 && overlayRoot()) overlayRoot().innerHTML = '';
    // 焦点归位到打开弹层前的元素
    if (item.returnFocus && item.returnFocus.focus) {
      try { item.returnFocus.focus(); } catch (e) { /* 元素可能已移除 */ }
    }
  }

  function closeAll() { while (openStack.length) closeTop(); }

  function mount(innerHtml, opts) {
    opts = opts || {};
    var root = overlayRoot();
    if (!root) return null;
    var wrap = document.createElement('div');
    wrap.className = 'overlay' + (opts.center ? ' center' : '');
    wrap.innerHTML = innerHtml;
    if (openStack.length === 0) root.innerHTML = '';
    root.appendChild(wrap);

    openStack.push({ el: wrap, onClose: opts.onClose, returnFocus: document.activeElement });

    if (opts.maskClosable !== false) {
      wrap.addEventListener('mousedown', function (e) {
        if (e.target === wrap) closeTop();
      });
    }
    return wrap;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (openStack.length) {
      e.preventDefault();
      closeTop();
      return;
    }
    closeMenus();
  });

  /** 居中对话框；onOk 返回 false 可阻止关闭 */
  function modal(opts) {
    var titleId = 'modal-title-' + Date.now().toString(36);
    var html =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="' + titleId + '"' +
        (opts.width ? ' style="width:' + opts.width + 'px"' : '') + '>' +
        '<div class="modal-head" id="' + titleId + '">' + esc(opts.title || '') + '</div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        '<div class="modal-foot">' +
          (opts.cancelText === null ? '' :
            '<button class="btn" data-action="ui:close">' + esc(opts.cancelText || '取消') + '</button>') +
          '<button class="btn btn-primary" data-action="ui:ok">' + esc(opts.okText || '确定') + '</button>' +
        '</div>' +
      '</div>';
    var wrap = mount(html, { center: true, onClose: opts.onClose });
    if (!wrap) return null;
    var modalEl = wrap.querySelector('.modal');

    modalEl.querySelector('[data-action="ui:ok"]').addEventListener('click', function () {
      if (opts.onOk) {
        var keep = opts.onOk(modalEl);
        if (keep === false) return;
      }
      closeTop();
    });

    var first = modalEl.querySelector('input, textarea, select, button');
    if (first) setTimeout(function () { first.focus(); }, 40);
    return modalEl;
  }

  function confirm(opts) {
    return new Promise(function (resolve) {
      var done = false;
      modal({
        title: opts.title,
        body: '<div style="padding:2px 0 var(--s2)">' + (opts.content || '') + '</div>',
        okText: opts.okText || '确定',
        cancelText: opts.cancelText || '取消',
        onOk: function () { done = true; resolve(true); },
        onClose: function () { if (!done) resolve(false); }
      });
    });
  }

  /* ====================================================== 下拉菜单 */

  function closeMenus() {
    var menus = document.querySelectorAll('.menu');
    for (var i = 0; i < menus.length; i++) menus[i].classList.add('hidden');
    var triggers = document.querySelectorAll('[data-menu-trigger]');
    for (var j = 0; j < triggers.length; j++) triggers[j].setAttribute('aria-expanded', 'false');
  }

  /** 触发元素往上找最近的"会裁剪"的祖先（overflow 不是 visible 的那个） */
  function clipBox(el) {
    var node = el.parentNode;
    while (node && node.nodeType === 1 && node !== document.body) {
      var ov = getComputedStyle(node).overflow;
      if (ov && ov !== 'visible') return node.getBoundingClientRect();
      node = node.parentNode;
    }
    return { top: 0, bottom: global.innerHeight };
  }

  function toggleMenu(triggerEl) {
    var id = triggerEl.getAttribute('data-menu-trigger');
    var menu = document.getElementById(id);
    if (!menu) return;
    var willOpen = menu.classList.contains('hidden');
    closeMenus();
    if (!willOpen) return;
    menu.classList.remove('hidden');
    menu.classList.remove('menu-up');

    /* 下方放不下就向上弹：
       列表最后几个标题的菜单原本会被卡片/面板的 overflow:hidden 裁掉，
       而且聚焦菜单项还会把页面滚走（撤销/恢复那一行"消失"就是被滚上去的）。
       这里先按默认方向量一次，放不下再翻到触发元素上方。 */
    var t = triggerEl.getBoundingClientRect();
    var box = clipBox(triggerEl);
    var h = menu.offsetHeight;
    var roomBelow = box.bottom - t.bottom;
    var roomAbove = t.top - box.top;
    if (roomBelow < h + 6 && roomAbove > roomBelow) menu.classList.add('menu-up');

    triggerEl.setAttribute('aria-expanded', 'true');
    var first = menu.querySelector('.menu-item');
    /* preventScroll：聚焦是为了键盘可达，但不能让浏览器顺手把页面滚走 */
    if (first) first.focus({ preventScroll: true });
  }

  /** 点击空白处收起菜单（在 document 上监听一次） */
  function bindMenus() {
    document.addEventListener('mousedown', function (e) {
      if (e.target.closest && (e.target.closest('.menu') || e.target.closest('[data-menu-trigger]'))) return;
      closeMenus();
    });
  }

  /* ======================================================== 事件委托 */

  var actions = {};

  function register(name, fn) { actions[name] = fn; }

  function initDelegation(root) {
    if (!root || root.__delegationBound) return;
    root.__delegationBound = true;

    root.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!el || !root.contains(el)) return;
      var fn = actions[el.getAttribute('data-action')];
      if (!fn) return;
      e.preventDefault();
      fn(el.dataset, el, e);
    });

    root.addEventListener('change', function (e) {
      var el = e.target.closest ? e.target.closest('[data-change]') : null;
      if (!el) return;
      var fn = actions[el.getAttribute('data-change')];
      if (fn) fn(el.dataset, el, e);
    });

    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var el = e.target;
      if (el.dataset && el.dataset.enter) {
        var fn = actions[el.getAttribute('data-enter')];
        if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
      }
    });
  }

  /* ========================================================== 小组件 */

  /** tag(文字, 样式类, 悬停说明) */
  function tag(text, cls, title) {
    return '<span class="tag ' + (cls || '') + '"' +
      (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(text) + '</span>';
  }

  function empty(text, iconName, actionHtml) {
    return '<div class="empty">' +
      '<div class="empty-icon">' + icon(iconName || 'file-text') + '</div>' +
      '<div class="empty-title">' + esc(text) + '</div>' +
      (actionHtml ? '<div class="empty-actions">' + actionHtml + '</div>' : '') +
      '</div>';
  }

  App.ui = {
    icon: icon,
    toast: toast,
    modal: modal,
    confirm: confirm,
    closeTop: closeTop,
    closeAll: closeAll,
    closeMenus: closeMenus,
    toggleMenu: toggleMenu,
    bindMenus: bindMenus,
    register: register,
    initDelegation: initDelegation,
    tag: tag,
    empty: empty,
    esc: esc
  };
})(window);
