/* ==========================================================================
   哈希路由

   为什么用 hash 而不是 History API：
     原型要能「双击 index.html」以 file:// 直接打开，
     而 file:// 下 pathname 路由刷新即 404。hash 在 file:// 与静态服务器下都可用。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});

  var DEFAULT_ROUTE = '#/workbench';
  var LOGIN_ROUTE = '#/login';

  var handler = null;

  /** 归一化当前 hash：空 hash、'#'、'#/' 都回落到默认页 */
  function current() {
    var h = global.location.hash || '';
    if (!h || h === '#' || h === '#/') return DEFAULT_ROUTE;
    return h;
  }

  /** 解析路由：#/system/users → { route, id:'user', sub:'users' } */
  function parse(route) {
    var path = String(route || current()).replace(/^#\/?/, '');
    var parts = path.split('/').filter(Boolean);
    return { route: '#' + '/' + parts.join('/'), id: parts[0] || 'workbench', sub: parts[1] || null };
  }

  function navigate(route, opts) {
    var target = route || DEFAULT_ROUTE;
    if (current() === target) {
      emit();
      return;
    }
    if (opts && opts.replace && global.history && global.history.replaceState) {
      try {
        global.history.replaceState(null, '', target);
        emit();
        return;
      } catch (e) {
        // file:// 下文档 origin 为 null，replaceState 会抛 SecurityError；
        // 原型必须能双击打开，故回退为直接改 hash（会多一次 hashchange，无副作用）。
        if (global.location.hash !== target) global.location.hash = target;
        emit();
        return;
      }
    }
    global.location.hash = target;
  }

  function emit() {
    if (handler) handler(parse(current()));
  }

  function init(fn) {
    handler = fn;
    global.addEventListener('hashchange', emit);
    emit();
  }

  App.router = {
    DEFAULT_ROUTE: DEFAULT_ROUTE,
    LOGIN_ROUTE: LOGIN_ROUTE,
    current: current,
    parse: parse,
    navigate: navigate,
    init: init,
    refresh: emit
  };
})(window);
