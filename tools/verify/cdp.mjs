/* ==========================================================================
   极简 Chrome DevTools Protocol 驱动（零依赖）

   为什么放在仓库里而不是 /tmp：上一轮验证脚本写在 /tmp，被系统临时目录清理掉，
   462 项检查全部丢失，只能重写。验证脚本本身也是资产，跟着原型一起版本化。

   依赖：Node 22+（自带全局 WebSocket 与 fetch）。不装任何 npm 包。
   用法：import { openChrome, sleep } from './cdp.mjs';
   ========================================================================== */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/** 打开无头 Chrome 并连接第一个页面 target，返回一个 CDP 会话对象 */
export async function openChrome(opts) {
  opts = opts || {};
  var width = opts.width || 1440;
  var height = opts.height || 950;
  var scale = opts.scale || 2;
  var port = opts.port || (9300 + Math.floor(Math.random() * 500));
  var profile = mkdtempSync(join(tmpdir(), 'proto-cdp-'));

  var proc = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--allow-file-access-from-files',
    '--window-size=' + width + ',' + height,
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + port,
    'about:blank'
  ], { stdio: 'ignore' });

  var target = null;
  var deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      var res = await fetch('http://127.0.0.1:' + port + '/json/list');
      var list = await res.json();
      target = list.filter(function (t) { return t.type === 'page' && t.webSocketDebuggerUrl; })[0];
      if (target) break;
    } catch (e) { /* 浏览器还没起来 */ }
    await sleep(120);
  }
  if (!target) {
    try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
    throw new Error('Chrome 未能在 25s 内启动（调试端口 ' + port + '）');
  }

  var ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(function (resolve, reject) {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', function () { reject(new Error('CDP WebSocket 连接失败')); }, { once: true });
  });

  var pending = new Map();
  var events = [];        // 控制台消息与页面异常
  var seq = 0;

  ws.addEventListener('message', function (ev) {
    var msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      var p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      events.push({
        kind: 'console.' + msg.params.type,
        text: (msg.params.args || []).map(function (a) {
          if (a.value !== undefined) return String(a.value);
          return a.description || a.type;
        }).join(' ')
      });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      var d = msg.params.exceptionDetails || {};
      events.push({
        kind: 'exception',
        text: (d.exception && (d.exception.description || d.exception.value)) || d.text || 'unknown'
      });
    }
  });

  function send(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending.set(id, { resolve: resolve, reject: reject });
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      setTimeout(function () {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('CDP 调用超时：' + method));
        }
      }, 20000);
    });
  }

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: width, height: height, deviceScaleFactor: scale, mobile: false
  });

  var page = {
    events: events,
    send: send,

    /** 返回值里出现 exceptionDetails 就直接抛，避免把异常当数据 */
    async evaluate(body) {
      var r = await send('Runtime.evaluate', {
        expression: '(function(){' + body + '})()',
        returnByValue: true,
        awaitPromise: true,
        userGesture: true
      });
      if (r.exceptionDetails) {
        var d = r.exceptionDetails;
        throw new Error('页面内异常：' +
          ((d.exception && (d.exception.description || d.exception.value)) || d.text));
      }
      return r.result.value;
    },

    async goto(url) {
      await send('Page.navigate', { url: url });
      var t0 = Date.now();
      for (;;) {
        await sleep(120);
        var state = await page.evaluate('return document.readyState;');
        if (state === 'complete') break;
        if (Date.now() - t0 > 20000) throw new Error('页面加载超时：' + url);
      }
      await sleep(300);   // 等首次路由渲染
    },

    /** 在 CSS 像素坐标上模拟一次真实鼠标点击（比 el.click() 更接近用户操作） */
    async mouseClick(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x, y: y, buttons: 0 });
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: x, y: y, button: 'left', clickCount: 1, buttons: 1
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: x, y: y, button: 'left', clickCount: 1, buttons: 0
      });
    },

    /** 按住 from 拖到 to（分步移动，页面的 mousemove 才能算出落点） */
    async dragTo(from, to, steps) {
      steps = steps || 6;
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: from.x, y: from.y, buttons: 0
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1, buttons: 1
      });
      for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x, y: y, buttons: 1 });
        await sleep(40);
      }
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1, buttons: 0
      });
    },

    async shot(file, o) {
      o = o || {};
      var r = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: !!o.full,
        fromSurface: true
      });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },

    /** 收集页面异常与 console.error（原型要求两者都必须为 0） */
    errors() {
      return events.filter(function (e) {
        return e.kind === 'exception' || e.kind === 'console.error';
      });
    },

    warns() {
      return events.filter(function (e) { return e.kind === 'console.warning'; });
    },

    close() {
      try { ws.close(); } catch (e) { /* ignore */ }
      try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
    }
  };

  return page;
}

/* ---------------------------------------------------------------- 断言

   约定（沿用上一轮踩过的坑）：
     · 说明文字以 ERR 开头 = 失败，即使断言值为真也判失败
       （曾经把 'ERR ...' 这种真值字符串当成 PASS，掩盖了两条假通过）
     · 每项检查都打印，失败项在最后汇总                                       */

export function makeChecks() {
  var checks = [];
  function check(name, value, detail) {
    var ok = !!value && !(typeof detail === 'string' && detail.indexOf('ERR') === 0);
    checks.push({ name: name, ok: ok, detail: detail === undefined ? '' : detail });
    console.log((ok ? '  PASS  ' : '  FAIL  ') + name +
      (detail !== undefined && detail !== '' ? '\n           → ' + detail : ''));
    return ok;
  }
  check.summary = function (suite) {
    var bad = checks.filter(function (c) { return !c.ok; });
    console.log('\n' + '─'.repeat(76));
    console.log(suite + '：' + (checks.length - bad.length) + '/' + checks.length + ' 项通过');
    if (bad.length) {
      console.log('失败项：');
      bad.forEach(function (c) { console.log('  · ' + c.name + '　' + c.detail); });
    }
    return bad.length === 0;
  };
  check.list = checks;
  return check;
}
