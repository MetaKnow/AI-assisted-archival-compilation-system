/* ==========================================================================
   通用工具：转义、数字/日期格式化
   零依赖，挂在 window.App.util
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});

  function escapeHtml(input) {
    if (input === null || input === undefined) return '';
    return String(input)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 千分位整数：1284600 → 1,284,600 */
  function fmtInt(n) {
    var num = Number(n) || 0;
    return num.toLocaleString('zh-CN');
  }

  /**
   * 中文口语化的「万」单位：12846500 → 1284.7
   * 大数用万更符合中文报表阅读习惯，避免一长串数字难以核对。
   */
  function fmtWan(n, digits) {
    var num = Number(n) || 0;
    var d = digits === undefined ? 1 : digits;
    return (num / 10000).toFixed(d).replace(/\.0$/, '');
  }

  /** 占比：返回整数百分比字符串（不含 %） */
  function pctOf(part, total) {
    if (!total) return '0';
    return String(Math.round((Number(part) || 0) / total * 100));
  }

  function fmtDate(input) {
    var d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function fmtDateTime(input) {
    var d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return '';
    return fmtDate(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** 中文长日期：2026年9月14日 星期一 */
  function fmtDateCn(input) {
    var d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return '';
    var week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()];
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + week;
  }

  /** 相对时间：刚刚 / 12 分钟前 / 3 小时前 / 2 天前 */
  function timeAgo(input, now) {
    var t = (input instanceof Date ? input : new Date(input)).getTime();
    if (isNaN(t)) return '';
    var diff = Math.max(0, ((now ? now.getTime() : Date.now()) - t));
    var min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    var hour = Math.floor(min / 60);
    if (hour < 24) return hour + ' 小时前';
    var day = Math.floor(hour / 24);
    if (day < 30) return day + ' 天前';
    return fmtDate(t);
  }

  /** 按当前时间给出问候语 */
  function greeting(now) {
    var h = (now ? now : new Date()).getHours();
    if (h < 6) return '夜深了';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  /** 取姓名末两字做头像文字：王建国 → 建国 */
  function nameInitials(name) {
    var s = String(name || '').trim();
    if (!s) return '—';
    return s.length <= 2 ? s : s.slice(-2);
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  App.util = {
    escapeHtml: escapeHtml,
    fmtInt: fmtInt,
    fmtWan: fmtWan,
    pctOf: pctOf,
    fmtDate: fmtDate,
    fmtDateTime: fmtDateTime,
    fmtDateCn: fmtDateCn,
    timeAgo: timeAgo,
    greeting: greeting,
    nameInitials: nameInitials,
    uid: uid
  };
})(window);
