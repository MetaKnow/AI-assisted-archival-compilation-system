/* ==========================================================================
   第 4 阶段「审核校定」工作界面

   评审要求：审核分三类，每类结果**单独列出**，并支持修改内容片段。
     1) 政治性审核：依托"审核规则"（系统管理 · 归档设置 → 审核规则），
        AI 辅助审核编研成果；命中就显示**规则的敏感内容标题**与**编研成果里的命中内容**。
     2) 专业性审核：AI 审核错别字、专业性及常识性错误；模型自动判断，不依赖规则。
        错别字可由 AI 自动修改，并**显示修改信息**（原文 → 改后、位置、时间、操作人）。
     3) 合规性审核：**不依赖审核规则**，由模型判定是否涉及知识产权风险、
        是否涉及个人隐私及个人信息（个人信息给脱敏建议）。

   审核统一由顶部的「一键全部审核」触发（评审要求：去掉三类各自的单独审核按钮），
   跑的是 js/audit.js 里的**本地模拟审核引擎**（不调大模型）：
   它真的去扫各章正文，所以命中结果与正文内容一一对应，改完再跑命中就会减少。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});
  var U = App.ui;
  var S = App.store;
  var esc = App.util.escapeHtml;
  var icon = App.icons.render;

  var state = {
    open: {},                 /* 三个分区的展开/收起（默认全展开） */
    status: ''                /* 状态筛选：'' 全部 / open 未校定 / fixed 已校定 / ignored 已忽略 */
  };

  /* 状态口径（评审要求）：未校定 / 已校定 / 已忽略 —— 主页面只**显示**状态，不在这里改 */
  var STATUS_LABEL = { open: '未校定', fixed: '已校定', ignored: '已忽略' };
  var STATUS_TAG = { open: 'tag-warn', fixed: 'tag-ok', ignored: '' };

  function filterItems(items) {
    if (!state.status) return items;
    return items.filter(function (it) { return it.status === state.status; });
  }

  function kinds() { return App.audit.KINDS; }

  /* ---------------------------------------------------------- 顶部操作区 */

  /** 编研成果（加工编排里的各章正文）—— 三类审核都扫它；空的话要说清楚，而不是"都没问题" */
  function authoredChapters(t) {
    var nodes = S.outlineOf(t.id).nodes || [];
    var rec = S.composeOf(t.id);
    return nodes.filter(function (n) {
      var ch = rec.chapters[n.id];
      return ch && String(ch.text || '').trim();
    });
  }

  function renderNoTextNote(t) {
    var nodes = (S.outlineOf(t.id).nodes || []).length;
    var written = authoredChapters(t).length;
    if (written) return '';
    return '<div class="data-note rv-warn">' + icon('alert-triangle') +
      '<span><b>编研成果还没有正文，三类审核都无从判定</b> —— ' +
      (nodes
        ? '大纲有 ' + nodes + ' 章，但第 3 阶段「加工编排」里还没有写过内容。'
        : '这个任务还没有大纲。') +
      '请先到第 3 阶段「加工编排」写正文，再回来审核。</span></div>';
  }

  function renderOps(t) {
    var sum = S.auditSummary(t.id);
    var badges = kinds().map(function (k) {
      var s = sum.kinds[k.key];
      if (!s.ran) return U.tag(k.title + '：未审核', '');
      if (!s.total) return U.tag(k.title + '：无问题', 'tag-ok');
      if (s.open) return U.tag(k.title + '：待处理 ' + s.open, 'tag-warn');
      return U.tag(k.title + '：已处理', 'tag-ok');
    }).join('');

    var pending = S.pendingAuditItems(t.id).length;
    var statusOptions = [['', '全部状态'], ['open', '未校定'], ['fixed', '已校定'], ['ignored', '已忽略']]
      .map(function (p) {
        return '<option value="' + p[0] + '"' + (state.status === p[0] ? ' selected' : '') +
          '>' + p[1] + '</option>';
      }).join('');
    return renderNoTextNote(t) +
      '<div class="review-ops">' +
      '<div class="review-ops-main">' +
        '<button type="button" class="btn btn-primary" data-action="audit:run-all" data-task="' + esc(t.id) + '" ' +
          'title="' + (pending
            ? '还有 ' + pending + ' 项未处理：请先在校定界面里处理完，再重新审核（新问题会追加，不会覆盖已有结果）'
            : '重新审核；新发现的问题会追加，不会覆盖已有结果') + '">' +
          icon('scan-text') + '一键全部审核</button>' +
        '<button type="button" class="btn" data-action="audit:calibrate" data-task="' + esc(t.id) + '">' +
          icon('book-open') + '校定内容</button>' +
        '<span class="review-ops-hint">' +
          (sum.hasRun
            ? ('共命中 <b>' + sum.total + '</b> 项：未校定 <b>' + sum.open + '</b>、已校定 <b>' +
               (sum.kinds.political.fixed + sum.kinds.professional.fixed + sum.kinds.compliance.fixed) +
               '</b>、已忽略 <b>' +
               (sum.kinds.political.ignored + sum.kinds.professional.ignored + sum.kinds.compliance.ignored) +
               '</b>；历史修改 <b>' + sum.fixes + '</b> 处')
            : '还没有跑过审核：点顶部的「一键全部审核」（三类一起跑）') +
        '</span>' +
        '<span class="spacer"></span>' +
        '<label class="sr-only" for="rv-status">按状态筛选</label>' +
        '<select class="select select-inline" id="rv-status" data-change="audit:filter">' + statusOptions + '</select>' +
      '</div>' +
      '<div class="review-ops-tags">' + badges + '</div>' +
    '</div>';
  }

  /* ---------------------------------------------------------- 单项渲染 */

  var currentTaskId = null;      /* 当前任务：渲染时赋值，供命中上下文与操作使用 */

  function chapterText(chapterId) {
    return String(S.chapterOf(currentTaskId, chapterId).text || '');
  }

  function withMarks(text, start, end) {
    var from = Math.max(0, start - 16), to = Math.min(text.length, end + 16);
    return (from > 0 ? '…' : '') + esc(text.slice(from, start)) +
      '<mark>' + esc(text.slice(start, end)) + '</mark>' +
      esc(text.slice(end, to)) + (to < text.length ? '…' : '');
  }

  function statusTag(it) {
    var label = STATUS_LABEL[it.status] || it.status;
    if (it.status === 'fixed' && it.fix && it.fix.mode === 'ai') label = '已校定（AI 自动修改）';
    return U.tag(label, STATUS_TAG[it.status] || '');
  }

  /** 一条审核结果：标题行 + 命中内容 + 修改信息 + 操作 */
  function renderItem(it) {
    var text = chapterText(it.chapterId);
    var body = '';
    if (it.status === 'fixed' && it.fix) {
      body += '<div class="rv-fix">' + icon('check') +
        '<span>修改信息：第 ' + (it.fix.start + 1) + ' 字处　「' + esc(it.fix.from) + '」→「' +
        esc(it.fix.to) + '」　·　' + (it.fix.mode === 'ai' ? 'AI 自动修改' : '人工修改') +
        '　·　' + esc(String(it.fix.at).slice(0, 19).replace('T', ' ')) + '　·　' + esc(it.fix.by) +
        '</span></div>';
    } else if (it.start <= text.length) {
      body += '<div class="rv-context">' + withMarks(text, it.start, it.end) + '</div>';
    }
    if (it.clauseText) {
      body += '<div class="rv-rule">' + icon('shield-check') +
        '<span>命中规则：<b>' + esc(it.ruleTitle) + '</b>（' + esc(it.ruleType || '') + '　' +
        esc(it.controlFlagTitle || '') + '）<br>敏感内容' +
        (it.clauseMarker ? ' ' + esc(it.clauseMarker) : '') + '：' + esc(it.clauseText) +
        (it.hitCount > 1 ? '　（本章共命中 ' + it.hitCount + ' 处）' : '') + '</span></div>';
    }
    if (it.detail) {
      body += '<div class="rv-detail">' + icon('info') + '<span>' + esc(it.detail) + '</span></div>';
    }

    var actions = '';
    if (it.status === 'open') {
      actions += '<span class="rv-hint">' + icon('info') +
        '到「校定内容」里处理（AI 自动修改 / 忽略 / 直接改正文）</span>';
    } else if (it.status === 'ignored') {
      actions += '<span class="rv-hint">已忽略，重新审核仍会命中</span>';
    } else {
      actions += '<span class="rv-hint">已校定</span>';
    }

    return '<div class="rv-item' + (it.status === 'open' ? '' : ' rv-' + it.status) + '">' +
      '<div class="rv-item-head">' +
        '<span class="rv-item-title">' + esc(it.ruleTitle || it.title || '') + '</span>' +
        '<span class="rv-item-where">' + esc(it.chapterTitle) + '</span>' +
        '<span class="spacer"></span>' + statusTag(it) +
      '</div>' +
      body +
      '<div class="rv-item-actions">' + actions + '</div>' +
    '</div>';
  }

  /* ---------------------------------------------------------- 三类分区 */

  function renderKind(t, kind) {
    var k = kinds().filter(function (x) { return x.key === kind.key; })[0];
    var all = S.auditItems(t.id, kind.key);
    var ran = all !== null;
    var items = ran ? filterItems(all) : null;
    var sum = S.auditSummary(t.id).kinds[kind.key];

    var head = '<div class="card-head rv-head">' +
      icon(kind.icon) + '<span>' + esc(kind.title) + '</span>' +
      '<span class="rv-basis" title="' + esc(kind.basis) + '">' + esc(kind.basis) + '</span>' +
      '<span class="spacer"></span>' +
      (ran ? U.tag(state.status ? ('筛选出 ' + items.length + ' 项') :
        ('命中 ' + all.length + ' 项：未校定 ' + sum.open + '、已校定 ' + sum.fixed + '、已忽略 ' + sum.ignored),
        sum.open ? 'tag-warn' : 'tag-ok') : U.tag('未审核', '')) +
      /* 评审要求（本轮）：去掉三类各自的"单独审核"按钮 —— 审核统一走顶部的「一键全部审核」，
         这里只留展开 / 收起（三类卡片仍各自列出命中项与状态） */
      (ran ? '<button type="button" class="btn btn-sm btn-text" data-action="audit:toggle" data-kind="' +
        esc(kind.key) + '">' + (state.open[kind.key] === false ? '展开' : '收起') + '</button>' : '') +
    '</div>';

    if (!ran) {
      return '<section class="card rv-card rv-' + kind.key + '">' + head +
        '<div class="card-body"><div class="data-note">' + icon('info') +
          '<span>' + esc(kind.note) + '（<b>' + esc(kind.title) + '</b>：' + esc(kind.basis) + '）<br>' +
            '点顶部的「一键全部审核」即可三类一起跑。</span>' +
        '</div></div></section>';
    }

    var body = state.open[kind.key] === false ? '' :
      '<div class="card-body">' +
        (items.length
          ? '<div class="rv-list">' + items.map(renderItem).join('') + '</div>'
          : '<div class="data-note">' + icon('check') +
            '<span>' + esc(kind.title) + '未发现问题。</span></div>') +
        (sum.ran ? '<div class="rv-run-info">' +
          /* 默认审核结果（写在 mock.AUDIT_RESULTS 里的种子）与"用户自己跑的"要分得清 */
          (sum.seeded ? '默认审核结果（种子数据）：' : '本次审核：') +
          esc(String(sum.at).slice(0, 19).replace('T', ' ')) + '　·　' + esc(sum.by) +
          '　·　本地模拟 AI（未接大模型）</div>' : '') +
      '</div>';

    return '<section class="card rv-card rv-' + kind.key + '">' + head + body + '</section>';
  }

  /** 修改记录：所有已落库的修改（原文 → 改后、位置、时间、操作人、方式） */
  function renderFixes(t) {
    var fixes = S.auditOf(t.id).fixes;
    if (!fixes.length) return '';
    return '<section class="card rv-card rv-fixes">' +
      '<div class="card-head">' + icon('list-checks') + '<span>修改记录</span>' +
        '<span class="spacer"></span>' + U.tag('共 ' + fixes.length + ' 处', 'tag-ok') +
      '</div>' +
      '<div class="card-body"><div class="table-wrap"><table class="data-table rv-fix-table">' +
        '<thead><tr><th>序号</th><th>章节</th><th>原文</th><th>改后</th><th>位置</th>' +
          '<th>方式</th><th>时间</th><th>操作人</th></tr></thead><tbody>' +
        fixes.map(function (f, i) {
          return '<tr>' +
            '<td class="tnum">' + (i + 1) + '</td>' +
            '<td>' + esc(f.chapterTitle || '') + '</td>' +
            '<td><span class="rv-from">' + esc(f.from) + '</span></td>' +
            '<td><span class="rv-to">' + esc(f.to) + '</span></td>' +
            '<td class="tnum">第 ' + ((f.start || 0) + 1) + ' 字</td>' +
            '<td>' + (f.mode === 'ai' ? 'AI 自动修改' : '人工修改') + '</td>' +
            '<td>' + esc(String(f.at || '').slice(0, 19).replace('T', ' ')) + '</td>' +
            '<td>' + esc(f.by || '') + '</td>' +
          '</tr>';
        }).join('') +
      '</tbody></table></div></div></section>';
  }

  function render(t) {
    currentTaskId = t.id;
    return '' +
      '<section class="card"><div class="card-body">' + renderOps(t) + '</div></section>' +
      kinds().map(function (k) { return renderKind(t, k); }).join('') +
      renderFixes(t);
  }

  /* ---------------------------------------------------------- 交互 */

  /** 跑一类审核（结果**追加**，不覆盖历史） */
  function runOne(taskId, kind) {
    var found = App.audit.run(taskId, kind);
    var r = S.saveAuditRun(taskId, kind, found);
    var k = kinds().filter(function (x) { return x.key === kind; })[0];
    return { kind: kind, title: k.title, found: found.length, added: r.added, kept: r.kept };
  }

  /** 重跑前的前置条件（评审要求）：当前审核出的问题必须全部处理完 */
  function guardPending(taskId) {
    var pending = S.pendingAuditItems(taskId);
    if (!pending.length) return true;
    var byKind = {};
    pending.forEach(function (it) { byKind[it.kind] = (byKind[it.kind] || 0) + 1; });
    var detail = ['political', 'professional', 'compliance'].filter(function (k) { return byKind[k]; })
      .map(function (k) {
        var d = kinds().filter(function (x) { return x.key === k; })[0];
        return d.title + ' ' + byKind[k] + ' 项';
      }).join('、');
    U.toast('还有 ' + pending.length + ' 项未处理（' + detail + '）：请先在「校定内容」里校定或忽略，再重新审核',
      'warn');
    return false;
  }

  function register() {
    U.register('audit:run-all', function (ds) {
      if (!guardPending(ds.task)) return;
      var rs = ['political', 'professional', 'compliance'].map(function (k) { return runOne(ds.task, k); });
      var added = rs.reduce(function (a, b) { return a + b.added; }, 0);
      var kept = rs.reduce(function (a, b) { return a + b.kept; }, 0);
      U.toast('三类审核完成：新发现 ' + added + ' 项，已有 ' + kept + ' 项保留（结果追加，不覆盖）', 'ok');
    });
    U.register('audit:filter', function (ds, el) {
      state.status = el.value;
      App.app.render();
    });
    U.register('audit:toggle', function (ds) {
      state.open[ds.kind] = state.open[ds.kind] === false;
      App.app.render();
    });
    U.register('audit:mark', function (ds) {
      var r = S.markAuditFixed(ds.task, ds.kind, ds.id);
      U.toast(r.message, r.ok ? 'ok' : 'warn');
    });
    /* 「校定内容」：打开浏览器内部全屏的三栏校定界面（左 大纲导航 / 中 编研成果预览 / 右 命中项） */
    U.register('audit:calibrate', function (ds) {
      if (App.reviewCalibrate) App.reviewCalibrate.open(ds.task);
    });
    U.register('audit:autofix', function (ds) {
      var r = S.fixAuditItem(ds.task, ds.kind, ds.id, { mode: 'ai' });
      U.toast(r.message, r.ok ? 'ok' : 'warn');
    });
    U.register('audit:ignore', function (ds) {
      var r = S.ignoreAuditItem(ds.task, ds.kind, ds.id);
      U.toast(r.message, r.ok ? 'ok' : 'warn');
    });
    U.register('audit:reopen', function (ds) {
      var items = S.auditItems(ds.task, ds.kind) || [];
      var it = items.filter(function (x) { return x.id === ds.id; })[0];
      if (!it) return;
      it.status = 'open';
      S.saveAuditRun(ds.task, ds.kind, items);
      U.toast('已恢复为待处理', 'ok');
    });
  }

  App.taskReview = { render: render, register: register };
})(window);
