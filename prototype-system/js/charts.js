/* ==========================================================================
   图表：手写 SVG，零依赖

   为什么不用 ECharts：
     原型要求「无外链、离线可用」，而 ECharts 需要引入 1MB 级脚本。
     本期只需环形图与条形图，手写 SVG 反而更小、更可控、更易无障碍化。
     生产环境如需复杂交互图表，再按《技术选型方案》接 ECharts。

   无障碍：
     · 环形图用 role="img" + aria-label 给出整体描述
     · 图例是真实文本（分类名、数量、占比），色盲用户不依赖颜色也能读数
     · 悬停高亮只做视觉增强，不承载唯一信息
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var esc = App.util.escapeHtml;

  var seq = 0;

  var R = 60;                 // 半径
  var CX = 90;                // 圆心 x
  var CY = 90;                // 圆心 y
  var SW = 26;                // 环宽
  var CIRC = 2 * Math.PI * R; // 周长

  function resolveId(opts) {
    return (opts && opts.id) || ('dc' + (++seq));
  }

  function sum(items) {
    return items.reduce(function (n, it) { return n + (Number(it.value) || 0); }, 0);
  }

  /**
   * 环形图（不含图例）
   * @param {Array} items [{label, value, color}]
   * @param {Object} opts {id, centerLabel, ariaLabel}
   */
  function donut(items, opts) {
    opts = opts || {};
    var id = resolveId(opts);
    var total = sum(items);
    var centerLabel = opts.centerLabel || '合计';

    var segs;
    if (total > 0) {
      var offset = 0;
      segs = items.map(function (it, i) {
        var v = Number(it.value) || 0;
        var len = CIRC * v / total;
        // dashoffset 负向累加把各段首尾相接；整组旋转 -90° 从 12 点方向起画
        var seg = '<circle class="donut-seg" data-chart="' + id + '" data-i="' + i + '" ' +
          'cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="none" ' +
          'stroke="' + esc(it.color) + '" stroke-width="' + SW + '" ' +
          'stroke-dasharray="' + len + ' ' + (CIRC - len) + '" ' +
          'stroke-dashoffset="' + (-offset) + '"></circle>';
        offset += len;
        return seg;
      }).join('');
    } else {
      segs = '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="none" ' +
        'stroke="var(--line)" stroke-width="' + SW + '"></circle>';
    }

    var aria = opts.ariaLabel || (centerLabel + '共 ' + total + '，' + items.map(function (it) {
      return it.label + ' ' + (Number(it.value) || 0);
    }).join('，'));

    return '<div class="donut-wrap" data-chart="' + id + '">' +
      '<svg class="donut" viewBox="0 0 180 180" role="img" aria-label="' + esc(aria) + '">' +
        '<g transform="rotate(-90 ' + CX + ' ' + CY + ')">' + segs + '</g>' +
      '</svg>' +
      '<div class="donut-center" data-chart="' + id + '" ' +
        'data-total="' + total + '" data-total-label="' + esc(centerLabel) + '">' +
        '<span class="dc-value">' + total + '</span>' +
        '<span class="dc-label">' + esc(centerLabel) + '</span>' +
      '</div>' +
    '</div>';
  }

  /** 图例：与环形图同属一个 data-chart 分组，用于悬停联动高亮 */
  function legend(items, opts) {
    opts = opts || {};
    var total = sum(items);
    var unit = opts.unit || '';
    var id = opts.chartId;
    // 类别多（>6）时压缩行高，否则 11 行图例会把卡片撑得过高
    var cls = 'legend' + (opts.dense ? ' legend-dense' : '');
    return '<ul class="' + cls + '">' + items.map(function (it, i) {
      var v = Number(it.value) || 0;
      return '<li data-chart="' + esc(id) + '" data-i="' + i + '" ' +
        'title="' + esc(it.label + '：' + v + unit + '，占 ' + App.util.pctOf(v, total) + '%') + '">' +
        '<span class="lg-dot" style="background:' + esc(it.color) + '"></span>' +
        '<span class="lg-name">' + esc(it.label) + '</span>' +
        '<span class="lg-val">' + v + '</span>' +
        '<span class="lg-pct">' + App.util.pctOf(v, total) + '%</span>' +
      '</li>';
    }).join('') + '</ul>';
  }

  /**
   * 环形图 + 图例（完整块）
   * @returns {Object} {id, html} —— id 需回传给 charts.register 以启用悬停联动
   */
  function donutBlock(items, opts) {
    opts = opts || {};
    var id = resolveId(opts);
    return {
      id: id,
      html: '<div class="chart-2col">' +
        donut(items, { id: id, centerLabel: opts.centerLabel, ariaLabel: opts.ariaLabel }) +
        legend(items, {
          unit: opts.unit, chartId: id, dense: opts.dense !== undefined ? opts.dense : items.length > 6
        }) +
      '</div>'
    };
  }

  /**
   * 横向条形图
   * 适用于两类场景：① 阶段分布这类有序分类；② 类别较多的排行榜（如 11 类编研类型）
   * @param {Array} items [{label, value, color?}]
   * @param {Object} opts {unit, rank, showPct, dense, mono, ariaLabel}
   *   rank     排行榜版式：加宽标签列以容纳「档案文献汇编」这类 6 字类名
   *   showPct  是否显示占比列（可单独关闭，版式不受影响）
   *   color    条目自带颜色；mono=true 时忽略之，统一用主题强调色（与阶段分布图一致）
   */
  function bars(items, opts) {
    opts = opts || {};
    var max = items.reduce(function (m, it) { return Math.max(m, Number(it.value) || 0); }, 0) || 1;
    var total = sum(items);
    var unit = opts.unit || '';
    var showPct = !!opts.showPct;
    var useItemColor = !opts.mono;

    var cls = 'bar-list' +
      (opts.dense ? ' bar-list-dense' : '') +
      (opts.rank ? ' bar-list-rank' : '') +
      (opts.rank && showPct ? ' has-pct' : '');

    return '<div class="' + cls + '"' +
        (opts.ariaLabel ? ' role="group" aria-label="' + esc(opts.ariaLabel) + '"' : '') + '>' +
      items.map(function (it) {
        var v = Number(it.value) || 0;
        var w = v ? Math.max(Math.round(v / max * 100), 3) : 0;
        // 未指定颜色（或 mono）时不着色，由 .br-fill 的默认背景（--accent）决定
        var color = (useItemColor && it.color) ? ';background:' + esc(it.color) : '';
        var rowAria = it.label + ' ' + v + unit +
          (showPct ? '，占 ' + App.util.pctOf(v, total) + '%' : '');
        return '<div class="bar-row">' +
          '<span class="br-label" title="' + esc(it.label) + '">' + esc(it.label) + '</span>' +
          '<span class="br-track" role="img" aria-label="' + esc(rowAria) + '">' +
            '<span class="br-fill' + (v ? '' : ' zero') + '" style="width:' + w + '%' + color + '"></span>' +
          '</span>' +
          '<span class="br-val"><b>' + v + '</b> ' + esc(unit) + '</span>' +
          (showPct ? '<span class="br-pct">' + App.util.pctOf(v, total) + '%</span>' : '') +
        '</div>';
      }).join('') +
    '</div>';
  }

  /* ------------------------------------------------------------------
     悬停联动：在容器上做一次事件委托，避免为每个扇区单独绑定
     ------------------------------------------------------------------ */

  function chartElOf(target, root) {
    var el = target && target.closest ? target.closest('[data-chart]') : null;
    return el && root.contains(el) ? el : null;
  }

  function bind(root) {
    if (!root || root.__chartsBound) return;
    root.__chartsBound = true;

    root.addEventListener('mouseover', function (e) {
      var el = chartElOf(e.target, root);
      if (!el) return;
      // 只处理「扇区」与「图例项」两类带索引的元素
      if (!el.classList.contains('donut-seg') && !el.closest('.legend')) return;

      var id = el.getAttribute('data-chart');
      var idx = el.getAttribute('data-i');
      if (idx === null) return;

      var items = (root.__chartData || {})[id];
      var wrap = root.querySelector('.donut-wrap[data-chart="' + id + '"]');
      var center = root.querySelector('.donut-center[data-chart="' + id + '"]');
      if (!items || !wrap || !center) return;

      var svg = wrap.querySelector('.donut');
      svg.classList.add('dimmed');
      var segs = svg.querySelectorAll('.donut-seg');
      for (var i = 0; i < segs.length; i++) {
        segs[i].classList.toggle('on', segs[i].getAttribute('data-i') === idx);
      }

      var it = items[parseInt(idx, 10)];
      if (it) {
        center.querySelector('.dc-value').textContent = Number(it.value) || 0;
        center.querySelector('.dc-label').textContent = it.label;
      }
    });

    root.addEventListener('mouseout', function (e) {
      var el = chartElOf(e.target, root);
      if (!el) return;
      var id = el.getAttribute('data-chart');
      var to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('[data-chart]') : null;
      if (to && to.getAttribute('data-chart') === id) return; // 未离开该图

      var wrap = root.querySelector('.donut-wrap[data-chart="' + id + '"]');
      var center = root.querySelector('.donut-center[data-chart="' + id + '"]');
      if (!wrap || !center) return;

      var svg = wrap.querySelector('.donut');
      if (svg) {
        svg.classList.remove('dimmed');
        var on = svg.querySelectorAll('.donut-seg.on');
        for (var i = 0; i < on.length; i++) on[i].classList.remove('on');
      }
      center.querySelector('.dc-value').textContent = center.getAttribute('data-total');
      center.querySelector('.dc-label').textContent = center.getAttribute('data-total-label');
    });
  }

  /**
   * 注册图表数据并启用联动。
   * 每个含图表的页面渲染后调用：charts.register(root, { 'chart-x': items, ... })
   */
  function register(root, dataMap) {
    root.__chartData = Object.assign(root.__chartData || {}, dataMap);
    bind(root);
  }

  App.charts = {
    donut: donut,
    legend: legend,
    donutBlock: donutBlock,
    bars: bars,
    register: register,
    sum: sum
  };
})(window);
