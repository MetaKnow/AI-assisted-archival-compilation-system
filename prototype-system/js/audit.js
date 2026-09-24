/* ==========================================================================
   审核校定 · 审核引擎（**本地模拟 AI**，不调用大模型）

   三类审核的判定依据（与评审要求一致）：
     1) 政治性审核 —— **依托审核规则**（系统管理 · 归档设置 → 审核规则）：
        从规则的敏感内容里抽出敏感词条，扫编研成果正文，命中即报"规则标题 + 命中内容"。
     2) 专业性审核 —— **不依赖规则**：错别字词典 + 民国纪年换算 + 编研规范表述。
     3) 合规性审核 —— 个人隐私/个人信息由**模型识别**（身份证号 / 手机号 / 银行卡 / 邮箱等
        正则识别，不依赖规则）；"不宜公开内容"**依托审核规则**（个人信息 / 数据安全 / 司法执法
        / 纪检监察 / 公共安全 / 科技 / 经济 / 开放规则 等类型）。

   为什么把敏感词条从规则文本里抽：参照系统里的"敏感内容"是整段法规式文本
   （「（一）涉及重大政治事件及敏感历史问题的材料…」），直接拿整段去比对正文永远不会命中；
   实际系统也是维护"敏感词库"（参照系统里就有「通用敏感词库 / 全宗敏感词库」两个菜单）。
   所以这里按标点与常见虚词切出 2–8 字的词条，作为规则的匹配项 —— 词条来源仍是规则本身。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});

  /* 政治性审核用到的规则类型（其余受控类型归到"合规性 · 不宜公开"） */
  var POLITICAL_TYPES = ['通用敏感规则', '政治类', '历史类', '民族宗教类', '涉外类',
    '国土类', '军事类', '国家安全类', '干部人事类', '文化类'];
  /* 合规性审核 · 不宜公开用到的规则类型 */
  var UNPUBLIC_TYPES = ['个人信息类', '数据安全类', '司法执法类', '纪检监察类',
    '公共安全类', '科技类', '经济类', '开放规则', '测试类'];

  /* 泛化词：这些词到处出现，作为敏感词条只会制造误报（"历史""教育""重大"…） */
  var GENERIC_WORDS = ['教育', '学校', '教学', '教师', '学生', '材料', '档案', '历史', '重大',
    '活动', '工作', '管理', '建设', '发展', '服务', '记录', '数据', '情况', '内容', '方面',
    '问题', '有关', '涉及', '信息', '事件', '事项', '关系', '制度', '机制', '过程', '细节',
    '行为', '单位', '部门', '地方', '有关人员', '相关人员', '人民群众',
    '重要文件', '基本情况', '基本信息', '有关规定', '具体内容', '具体问题'];

  /* 抽词时要丢掉的虚词（长度与泛化词之外的第二道闸） */
  var STOP_WORDS = ['涉及', '有关', '以及', '及其', '相关', '可能', '其他', '进行', '尚未',
    '不宜', '依法', '法规', '需要', '应当', '属于', '包括', '依法依规'];

  /* 错别字词典（原型只收常用的一小批，够演示"AI 自动修改"） */
  var TYPO_DICT = [
    ['帐号', '账号'], ['帐目', '账目'], ['帐簿', '账簿'], ['复盖', '覆盖'], ['按排', '安排'],
    ['必竟', '毕竟'], ['精减', '精简'], ['迫不急待', '迫不及待'], ['一如继往', '一如既往'],
    ['兴高彩烈', '兴高采烈'], ['层出不究', '层出不穷'], ['既使', '即使'],
    ['园满', '圆满'], ['成积', '成绩'], ['座落', '坐落'], ['幅射', '辐射']
  ];

  /* 编研规范表述：出现"建国前/后"这类不规范纪年表述时给建议（档案编研规范要求写明公元纪年） */
  var STYLE_DICT = [
    ['建国后', '1949 年 10 月以后'],
    ['建国前', '1949 年 10 月以前'],
    ['解放前', '1949 年 10 月以前'],
    ['解放后', '1949 年 10 月以后']
  ];

  function chaptersOf(taskId) {
    /* 编研成果正文 = 加工编排里写的各章正文（按大纲顺序） */
    var nodes = App.store.outlineOf(taskId).nodes || [];
    var rec = App.store.composeOf(taskId);
    return nodes.map(function (n) {
      var ch = rec.chapters[n.id] || {};
      return { id: n.id, title: n.title, text: String(ch.text || '') };
    }).filter(function (c) { return c.text.trim(); });
  }

  /* ------------------------------------------------------------------ 抽词 */

  function cleanTerm(t) {
    var x = String(t || '').replace(/^[0-9]+、/, '').replace(/[。；;，,]$/, '').trim();
    if (x.length < 3 || x.length > 8) return '';
    if (/^[0-9]+$/.test(x)) return '';
    if (GENERIC_WORDS.indexOf(x) >= 0) return '';
    if (STOP_WORDS.indexOf(x) >= 0) return '';
    return x;
  }

  /**
   * 从一条敏感内容里抽敏感词条。
   * 参照系统的规则文本基本都是「涉及XXX的档案/材料」这种句式，所以**优先取"涉及…的"里的名词短语**，
   * 这比无脑按标点切精确得多（否则"历史""教育"这种词会到处命中）。
   * 没有该句式时（例如开放规则里的"已通过正式渠道发布…"），退回按标点切并过滤泛化词。
   */
  function extractTerms(text) {
    var out = [];
    var src = String(text || '');
    var re = /涉及([^。；;]{2,40}?)(?:的|等|、|，|,|；|;|$)/g;
    var m, matched = false;
    while ((m = re.exec(src))) {
      matched = true;
      m[1].split(/[、，,和与及]/).forEach(function (part) {
        var t = cleanTerm(part);
        if (t && out.indexOf(t) < 0) out.push(t);
      });
    }
    if (!matched) {
      src.split(/[、，,。；;：:（）()「」“”"\s]+/).forEach(function (part) {
        var t = cleanTerm(part);
        if (t && out.indexOf(t) < 0) out.push(t);
      });
    }
    return out;
  }

  /** 规则 → 词条（带出处：第几条敏感内容） */
  function ruleTerms(rule) {
    var clauses = App.store.auditRuleClauses(rule);
    var out = [];
    clauses.forEach(function (c) {
      /* 一条敏感内容里的子项（1、2、3）各自成条，命中时能报到更细的出处 */
      var subs = String(c.text).split(/\s*\d+、\s*/).map(function (x) { return x.trim(); })
        .filter(function (x) { return x; });
      subs.forEach(function (sub, i) {
        extractTerms(sub).forEach(function (t) {
          out.push({ term: t, clauseNo: c.no, clauseMarker: c.marker,
            clauseText: sub, subNo: subs.length > 1 ? i + 1 : 0 });
        });
      });
    });
    return out;
  }

  function flagOf(rule) { return rule.controlFlag || 'CONTROL'; }

  /** 按类型挑出参与某类审核的规则（只取启用的） */
  function rulesFor(kind) {
    var types = kind === 'political' ? POLITICAL_TYPES : UNPUBLIC_TYPES;
    return App.store.auditRules().filter(function (r) {
      return r.enable !== false && types.indexOf(r.typeName) >= 0;
    });
  }

  /* ------------------------------------------------------ 1) 政治性审核 */

  function runPolitical(taskId) {
    var rules = rulesFor('political');
    var items = [];
    chaptersOf(taskId).forEach(function (ch) {
      rules.forEach(function (rule) {
        var hits = [];                       /* 同一章节同一规则的多处命中并成一条 */
        ruleTerms(rule).forEach(function (t) {
          var from = 0;
          for (;;) {
            var at = ch.text.indexOf(t.term, from);
            if (at < 0) break;
            hits.push({ start: at, end: at + t.term.length, term: t.term, meta: t });
            from = at + t.term.length;
            if (hits.length > 40) break;
          }
        });
        if (!hits.length) return;
        hits.sort(function (a, b) { return a.start - b.start; });
        var first = hits[0];
        items.push({
          id: 'RV-P-' + rule.id + '-' + ch.id,
          kind: 'political', sub: 'rule',
          chapterId: ch.id, chapterTitle: ch.title,
          ruleId: rule.id, ruleTitle: rule.title, ruleType: rule.typeName,
          controlFlagTitle: rule.controlFlagTitle || App.store.controlFlagTitle(flagOf(rule)),
          clauseNo: first.meta.clauseNo, clauseMarker: first.meta.clauseMarker,
          clauseText: first.meta.clauseText,
          start: first.start, end: first.end, text: ch.text.slice(first.start, first.end),
          hitCount: hits.length,
          hits: hits.map(function (h) { return { start: h.start, end: h.end, term: h.term }; }),
          status: 'open'
        });
      });
    });
    return items;
  }

  /* ------------------------------------------------------ 2) 专业性审核 */

  /** 民国 N 年 ↔ 公元 Y 年：民国元年 = 1912 年（N + 1911） */
  function checkMinguo(ch) {
    var items = [];
    var re = /民国\s*([0-9]{1,2}|[一二三四五六七八九十]{1,4})\s*年[^。；\n]{0,20}?公元\s*(\d{4})\s*年/g;
    var m;
    while ((m = re.exec(ch.text))) {
      var n = minguoNum(m[1]);
      var y = parseInt(m[2], 10);
      if (!n || !y) continue;
      var expect = n + 1911;
      if (y !== expect) {
        items.push({
          id: 'RV-T-' + ch.id + '-' + m.index,
          kind: 'professional', sub: 'common',
          chapterId: ch.id, chapterTitle: ch.title,
          start: m.index, end: m.index + m[0].length, text: m[0],
          title: '民国纪年与公元纪年不一致',
          detail: '民国 ' + n + ' 年应为公元 ' + expect + ' 年（民国元年＝1912 年），此处写作公元 ' + y + ' 年',
          suggestion: m[0].replace(/公元\s*\d{4}\s*年/, '公元 ' + expect + ' 年'),
          autoFixable: true, status: 'open'
        });
      }
    }
    return items;
  }

  function minguoNum(s) {
    if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
    var map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    if (s === '元') return 1;
    if (s.length === 1) return map[s] || 0;
    if (s.length === 2 && s[0] === '十') return 10 + (map[s[1]] || 0);
    if (s.length === 3 && s[1] === '十') return (map[s[0]] || 0) * 10 + (map[s[2]] || 0);
    if (s.length === 2) return (map[s[0]] || 0) * 10 + (map[s[1]] || 0);
    return 0;
  }

  function findDict(ch, dict, sub, label, fixable) {
    var items = [];
    dict.forEach(function (pair) {
      var bad = pair[0], good = pair[1];
      var from = 0;
      for (;;) {
        var at = ch.text.indexOf(bad, from);
        if (at < 0) break;
        items.push({
          id: 'RV-' + sub + '-' + ch.id + '-' + at + '-' + bad,
          kind: 'professional', sub: sub,
          chapterId: ch.id, chapterTitle: ch.title,
          start: at, end: at + bad.length, text: bad,
          title: label, detail: '「' + bad + '」应为「' + good + '」',
          suggestion: good, autoFixable: !!fixable, status: 'open'
        });
        from = at + bad.length;
      }
    });
    return items;
  }

  function runProfessional(taskId) {
    var items = [];
    chaptersOf(taskId).forEach(function (ch) {
      items = items.concat(findDict(ch, TYPO_DICT, 'typo', '错别字', true));
      items = items.concat(findDict(ch, STYLE_DICT, 'style', '编研规范表述', true));
      items = items.concat(checkMinguo(ch));
    });
    return items;
  }

  /* ------------------------------------------------------ 3) 合规性审核 */

  /* 个人隐私 / 个人信息：模型自动识别（不依赖规则） */
  var PRIVACY_PATTERNS = [
    { key: 'idcard', label: '身份证号', re: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
      mask: function (m) { return m.slice(0, 6) + '********' + m.slice(-4); } },
    { key: 'phone', label: '手机号', re: /1[3-9]\d{9}/g,
      mask: function (m) { return m.slice(0, 3) + '****' + m.slice(-4); } },
    { key: 'bankcard', label: '银行卡号', re: /\b\d{16,19}\b/g,
      mask: function (m) { return m.slice(0, 4) + '********' + m.slice(-4); } },
    { key: 'email', label: '电子邮箱', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
      mask: function (m) { var i = m.indexOf('@'); return m.slice(0, 2) + '***' + m.slice(i); } }
  ];

  function runPrivacy(taskId) {
    var items = [];
    chaptersOf(taskId).forEach(function (ch) {
      PRIVACY_PATTERNS.forEach(function (p) {
        ch.text.replace(p.re, function (m, offset) {
          /* 银行卡号会把身份证号也吃进来，重叠时以身份证号为准 */
          var dup = items.some(function (it) {
            return it.chapterId === ch.id && offset < it.end && (offset + m.length) > it.start;
          });
          if (!dup) {
            items.push({
              id: 'RV-C-' + p.key + '-' + ch.id + '-' + offset,
              kind: 'compliance', sub: 'privacy', privacy: p.key,
              chapterId: ch.id, chapterTitle: ch.title,
              start: offset, end: offset + m.length, text: m,
              title: p.label + '（模型识别）',
              detail: '命中' + p.label + '，建议脱敏后再公开：' + p.mask(m),
              suggestion: p.mask(m), autoFixable: true, status: 'open'
            });
          }
          return m;
        });
      });
    });
    return items;
  }

  /** 不宜公开内容：依托审核规则（合规性那一组类型） */
  function runUnpublic(taskId) {
    var rules = rulesFor('compliance');
    var items = [];
    chaptersOf(taskId).forEach(function (ch) {
      rules.forEach(function (rule) {
        var hits = [];
        ruleTerms(rule).forEach(function (t) {
          var from = 0;
          for (;;) {
            var at = ch.text.indexOf(t.term, from);
            if (at < 0) break;
            hits.push({ start: at, end: at + t.term.length, term: t.term, meta: t });
            from = at + t.term.length;
            if (hits.length > 40) break;
          }
        });
        if (!hits.length) return;
        hits.sort(function (a, b) { return a.start - b.start; });
        var first = hits[0];
        items.push({
          id: 'RV-U-' + rule.id + '-' + ch.id,
          kind: 'compliance', sub: 'unpublic',
          chapterId: ch.id, chapterTitle: ch.title,
          ruleId: rule.id, ruleTitle: rule.title, ruleType: rule.typeName,
          controlFlagTitle: rule.controlFlagTitle || App.store.controlFlagTitle(flagOf(rule)),
          clauseNo: first.meta.clauseNo, clauseMarker: first.meta.clauseMarker,
          clauseText: first.meta.clauseText,
          start: first.start, end: first.end, text: ch.text.slice(first.start, first.end),
          hitCount: hits.length,
          hits: hits.map(function (h) { return { start: h.start, end: h.end, term: h.term }; }),
          status: 'open'
        });
      });
    });
    return items;
  }

  function runCompliance(taskId) {
    return runPrivacy(taskId).concat(runUnpublic(taskId));
  }

  App.audit = {
    KINDS: [
      { key: 'political', title: '政治性审核', icon: 'shield-check',
        basis: '依托审核规则（通用 / 政治 / 历史 / 民族宗教 / 涉外 / 国土 / 军事 / 国家安全 / 干部人事 / 文化类）',
        note: '命中后显示审核规则中的敏感内容标题与编研成果里的命中内容' },
      { key: 'professional', title: '专业性审核', icon: 'spell-check',
        basis: '不依赖规则：错别字词典 + 民国纪年换算 + 编研规范表述',
        note: '错别字可由 AI 自动修改，并显示修改信息（原文 → 改后）' },
      { key: 'compliance', title: '合规性审核', icon: 'user-shield',
        basis: '个人隐私 / 个人信息由模型识别；不宜公开内容依托审核规则（个人信息 / 数据安全 / 司法执法 / 纪检监察 / 公共安全 / 科技 / 经济 / 开放规则类）',
        note: '隐私信息给脱敏建议，不宜公开内容显示命中规则' }
    ],
    run: function (taskId, kind) {
      if (kind === 'political') return runPolitical(taskId);
      if (kind === 'professional') return runProfessional(taskId);
      if (kind === 'compliance') return runCompliance(taskId);
      return [];
    },
    /* 供页面/验证脚本使用 */
    chaptersOf: chaptersOf,
    extractTerms: extractTerms,
    ruleTerms: ruleTerms,
    TYPO_DICT: TYPO_DICT,
    STYLE_DICT: STYLE_DICT,
    PRIVACY_PATTERNS: PRIVACY_PATTERNS
  };
})(window);
