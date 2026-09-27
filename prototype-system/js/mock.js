/* ==========================================================================
   原型数据源（Mock）

   说明：本文件是原型的「后端替身」。将来接真实服务时，
   只需把 App.mock.WORKBENCH 换成一次 fetch，页面渲染代码不用动。
   所有数据均为演示数据，不具备业务真实性。
   ========================================================================== */

(function (global) {
  'use strict';

  var App = (global.App = global.App || {});

  /* ---- 时间基准：让「最近动态」始终显示为刚发生，便于演示 ---- */
  function minsAgo(n) { return new Date(Date.now() - n * 60000).toISOString(); }

  var ORG = {
    name: '某某市档案馆',
    system: '档案辅助编研系统',
    version: 'V1.0 · 原型',
    env: '内网演示环境'
  };

  /* ======================================================================
     人员与账号
     角色用于演示权限差异：流程审核模块中 admin 可见全部流程，
     其他用户只看「需我审核」与「我发起的」以及自己审过的。
     ====================================================================== */

  /* ======================================================================
     系统用户
     —— 用途：登录校验、编研团队选人、成果审核人、以及「系统管理 · 用户管理」。
        「权限迁移」迁移的不是全宗/门类这类数据权限，而是**"涉及本人"的业务数据关联**：
        编研任务（本人在任务团队里 / 本人创建）与审核流程（本人是发起人或审核人）。
        迁移的落库逻辑待统一处理，当前只呈现将被迁移的数据。
     ====================================================================== */

  var USERS = [
    {
      id: 'U-001', account: 'admin', password: 'admin123',
      name: '赵志远', role: 'ADMIN', roleLabel: '系统管理员',
      dept: '信息技术科', isAdmin: true, title: '馆长',
      locked: false, createdAt: '2023-01-05T09:00:00'
    },
    {
      id: 'U-002', account: 'wangjg', password: '123456',
      name: '王建国', role: 'EDITOR', roleLabel: '编研人员',
      dept: '编研利用科', isAdmin: false, title: '编研项目负责人',
      locked: false, createdAt: '2023-03-12T09:00:00',
    },
    {
      id: 'U-003', account: 'liwh', password: '123456',
      name: '李文华', role: 'REVIEWER', roleLabel: '审核人员',
      dept: '编研利用科', isAdmin: false, title: '编研成果审核',
      locked: false, createdAt: '2023-03-12T09:10:00',
    },
    {
      id: 'U-004', account: 'chenj', password: '123456',
      name: '陈静', role: 'COLLECTOR', roleLabel: '档案收集人员',
      dept: '保管利用科', isAdmin: false, title: '档案收集与整理',
      locked: false, createdAt: '2023-06-01T09:00:00',
    },
    {
      id: 'U-005', account: 'liuy', password: '123456',
      name: '刘洋', role: 'PUBLISHER', roleLabel: '成果发布人员',
      dept: '编研利用科', isAdmin: false, title: '成果编发与推介',
      locked: false, createdAt: '2023-09-18T09:00:00',
    },
    {
      id: 'U-006', account: 'sunl', password: '123456',
      name: '孙丽', role: 'EDITOR', roleLabel: '编研人员',
      dept: '编研利用科', isAdmin: false, title: '主管副馆长',
      locked: false, createdAt: '2024-04-08T09:00:00',
    },
    {
      id: 'U-007', account: 'zhoum', password: '123456',
      name: '周敏', role: 'ARCHIVIST', roleLabel: '材料归档人员',
      dept: '保管利用科', isAdmin: false, title: '归档管理',
      locked: false, createdAt: '2024-07-22T09:00:00',
    },
    {
      id: 'U-008', account: 'huangq', password: '123456',
      name: '黄强', role: 'EDITOR', roleLabel: '编研人员',
      dept: '编研利用科', isAdmin: false, title: '编研人员',
      locked: true, createdAt: '2024-10-30T09:00:00',
    }
  ];


  /* ======================================================================
     编研素材库 · 素材（素材管理的数据）
     —— 36 件。其中 3 件引用上面的馆藏目录（同档号），用于演示「查找素材」里的
        "已在素材库" 状态；其余 33 件代表未纳入检索测试集的馆藏，只存在于素材库中。
     ====================================================================== */

  var MATERIALS = [
    /* 教育・民国时期 */
    { id: 'M-001', archiveId: null, archiveNo: 'JY-1932-Y-003', title: '县立师范讲习所沿革与课程表', fonds: '教育全宗', year: '1932', tagIds: ['G-001'], addedAt: '2026-06-02T09:12:00', addedBy: '陈静',
      /* ⚠️ 一条素材条目下**可以有多份文件**（评审要求）：按文件选、按文件校验页码。
         这里 `pages` 之和＝档案目录里该条目的著录页数（18 + 7 = 25）。
         没有 files 的条目视为"1 份文件"（由 store.materialFileList 兜底生成）。 */
      files: [
        { no: 1, name: '县立师范讲习所沿革与课程表.pdf', size: 5872026, pages: 18,
          note: '正文：沿革叙述与逐年课程表。' },
        { no: 2, name: '讲习所校舍与课程附图.tif', size: 8808038, pages: 7,
          note: '附图：校舍平面图、课程时数表扫描件。' }
      ] },
    { id: 'M-002', archiveId: null, archiveNo: 'JY-1941-Y-018', title: '私立小学立案卷（含校董名录）', fonds: '教育全宗', year: '1941', tagIds: ['G-001'], addedAt: '2026-06-02T09:15:00', addedBy: '陈静' },
    { id: 'M-003', archiveId: null, archiveNo: 'JY-1946-Y-025', title: '中学教员资格审定清册', fonds: '教育全宗', year: '1946', tagIds: ['G-001'], addedAt: '2026-06-02T09:20:00', addedBy: '刘洋' },
    { id: 'M-004', archiveId: null, archiveNo: 'JY-1949-Y-031', title: '各校接收与复课情况报告', fonds: '教育全宗', year: '1949', tagIds: ['G-001', 'G-002'], addedAt: '2026-06-02T09:26:00', addedBy: '王建国' },
    { id: 'M-005', archiveId: null, archiveNo: 'JY-1938-Y-009', title: '战时学校迁移与借用校舍文书', fonds: '教育全宗', year: '1938', tagIds: ['G-001', 'G-003'], addedAt: '2026-06-02T09:31:00', addedBy: '陈静',
      files: [
        { no: 1, name: '战时学校迁移报告.pdf', size: 3250585, pages: 6, note: '迁移缘由、路线与安置情况。' },
        { no: 2, name: '借用校舍清册.xlsx', size: 629145, pages: 4, note: '借用校舍位置、间数与借用期限。' },
        { no: 3, name: '迁移往来函件.pdf', size: 5033164, pages: 11, note: '与县府、区公所的往来函件。' }
      ] },
    /* 教育・新中国 */
    { id: 'M-006', archiveId: null, archiveNo: 'JY-1958-Y-072', title: '普及小学教育规划与实施简报', fonds: '教育全宗', year: '1958', tagIds: ['G-002', 'G-007'], addedAt: '2026-06-05T10:02:00', addedBy: '王建国' },
    { id: 'M-007', archiveId: null, archiveNo: 'JY-1964-Y-096', title: '半工半读学校试办情况汇报', fonds: '教育全宗', year: '1964', tagIds: ['G-002'], addedAt: '2026-06-05T10:06:00', addedBy: '刘洋' },
    { id: 'M-008', archiveId: null, archiveNo: 'JY-1980-Y-141', title: '中小学教师进修与培训材料', fonds: '教育全宗', year: '1980', tagIds: ['G-002'], addedAt: '2026-06-05T10:11:00', addedBy: '陈静' },
    { id: 'M-009', archiveId: null, archiveNo: 'JY-1993-Y-288', title: '普及九年义务教育验收材料', fonds: '教育全宗', year: '1993', tagIds: ['G-002'], addedAt: '2026-06-05T10:15:00', addedBy: '王建国' },
    { id: 'M-010', archiveId: null, archiveNo: 'JY-2001-Y-352', title: '教育强市建设实施方案', fonds: '教育全宗', year: '2001', tagIds: ['G-002'], addedAt: '2026-06-05T10:20:00', addedBy: '赵志远' },
    { id: 'M-011', archiveId: null, archiveNo: 'JY-1971-Y-118', title: '中学招生与分配名册', fonds: '教育全宗', year: '1971', tagIds: ['G-002'], addedAt: '2026-06-05T10:24:00', addedBy: '刘洋' },
    /* 声像：一条录像素材（file.duration 用于"插入帧"的时长校验） */
    { id: 'M-037', archiveId: null, archiveNo: 'SX-2016-Y-014', title: '全市教育工作会议实况录像', fonds: '声像全宗', year: '2016', tagIds: ['G-002'],
      category: '声像档案', file: { name: '全市教育工作会议实况录像.mp4', size: 428000000, duration: 3720 },
      addedAt: '2026-06-20T15:30:00', addedBy: '陈静' },

    /* 抗战史料 */
    { id: 'M-012', archiveId: null, archiveNo: 'MZ-1939-Y-021', title: '战时难民救济款项发放清册', fonds: '民政全宗', year: '1939', tagIds: ['G-003'], addedAt: '2026-06-09T14:30:00', addedBy: '王建国',
      files: [
        { no: 1, name: '救济款项发放清册（正文）.pdf', size: 2516582, pages: 6, note: '按发放批次登记领款人。' },
        { no: 2, name: '发放清册附表.pdf', size: 1258291, pages: 3, note: '款项来源与收支对照表。' }
      ] },
    { id: 'M-013', archiveId: null, archiveNo: 'MZ-1940-Y-033', title: '防空疏散与临时安置文书', fonds: '民政全宗', year: '1940', tagIds: ['G-003'], addedAt: '2026-06-09T14:34:00', addedBy: '陈静' },
    { id: 'M-014', archiveId: null, archiveNo: 'MZ-1941-Y-047', title: '各界抗敌后援会工作报告', fonds: '民政全宗', year: '1941', tagIds: ['G-003'], addedAt: '2026-06-09T14:38:00', addedBy: '刘洋' },
    { id: 'M-015', archiveId: null, archiveNo: 'MZ-1942-Y-052', title: '战时物价管制与物资配给材料', fonds: '民政全宗', year: '1942', tagIds: ['G-003'], addedAt: '2026-06-09T14:42:00', addedBy: '赵志远' },
    /* 民国商会 */
    { id: 'M-016', archiveId: null, archiveNo: 'SH-1934-Y-011', title: '米业同业公会营业规则', fonds: '商会全宗', year: '1934', tagIds: ['G-004'], addedAt: '2026-06-12T09:05:00', addedBy: '刘洋' },
    { id: 'M-017', archiveId: 'A-013', archiveNo: 'SH-1951-Y-092', title: '工商业户登记与行业归口材料', fonds: '商会全宗', year: '1951', tagIds: ['G-004'], addedAt: '2026-06-12T09:10:00', addedBy: '赵志远' },
    { id: 'M-018', archiveId: null, archiveNo: 'SH-1947-Y-066', title: '商会调解同业纠纷案卷', fonds: '商会全宗', year: '1947', tagIds: ['G-004'], addedAt: '2026-06-12T09:14:00', addedBy: '李文华' },
    /* 水利工程 */
    { id: 'M-019', archiveId: 'A-021', archiveNo: 'SL-1998-W-003', title: '抗洪抢险实物档案登记册', fonds: '水利全宗', year: '1998', tagIds: ['G-005'], addedAt: '2026-06-16T11:20:00', addedBy: '王建国' },
    { id: 'M-020', archiveId: null, archiveNo: 'SL-1959-Y-021', title: '水库大坝竣工技术鉴定书', fonds: '水利全宗', year: '1959', tagIds: ['G-005'], addedAt: '2026-06-16T11:25:00', addedBy: '赵志远' },
    { id: 'M-021', archiveId: null, archiveNo: 'SL-1974-Y-118', title: '机电排灌站建设与移交材料', fonds: '水利全宗', year: '1974', tagIds: ['G-005'], addedAt: '2026-06-16T11:30:00', addedBy: '陈静' },
    { id: 'M-022', archiveId: null, archiveNo: 'SL-1988-Y-190', title: '河道整治工程验收报告', fonds: '水利全宗', year: '1988', tagIds: ['G-005'], addedAt: '2026-06-16T11:34:00', addedBy: '刘洋' },
    /* 交通建设 */
    { id: 'M-023', archiveId: null, archiveNo: 'JT-1956-Y-014', title: '城区道路翻修工程计划与决算', fonds: '交通全宗', year: '1956', tagIds: ['G-006'], addedAt: '2026-06-19T15:02:00', addedBy: '赵志远' },
    { id: 'M-024', archiveId: null, archiveNo: 'JT-1968-Y-042', title: '跨河桥梁设计图纸与批复', fonds: '交通全宗', year: '1968', tagIds: ['G-006', 'G-007'], addedAt: '2026-06-19T15:06:00', addedBy: '王建国' },
    { id: 'M-025', archiveId: null, archiveNo: 'JT-1985-Y-133', title: '公共汽车线路开辟与票价材料', fonds: '交通全宗', year: '1985', tagIds: ['G-006'], addedAt: '2026-06-19T15:10:00', addedBy: '刘洋' },
    { id: 'M-026', archiveId: null, archiveNo: 'JT-1997-Y-244', title: '高速公路连接线征地拆迁文书', fonds: '交通全宗', year: '1997', tagIds: ['G-006', 'G-007'], addedAt: '2026-06-19T15:15:00', addedBy: '陈静' },
    { id: 'M-027', archiveId: null, archiveNo: 'JT-2005-Y-301', title: '城市轨道交通前期调研报告', fonds: '交通全宗', year: '2005', tagIds: ['G-006', 'G-007'], addedAt: '2026-06-19T15:20:00', addedBy: '赵志远' },
    /* 城市规划 */
    { id: 'M-028', archiveId: null, archiveNo: 'GH-1957-Y-006', title: '城市总体规划说明书（初稿）', fonds: '城建全宗', year: '1957', tagIds: ['G-007'], addedAt: '2026-06-23T09:40:00', addedBy: '王建国' },
    { id: 'M-029', archiveId: null, archiveNo: 'GH-1983-Y-058', title: '旧城改造详细规划方案', fonds: '城建全宗', year: '1983', tagIds: ['G-007'], addedAt: '2026-06-23T09:45:00', addedBy: '陈静' },
    /* 名人手稿 */
    { id: 'M-030', archiveId: null, archiveNo: 'MR-1948-S-003', title: '乡贤手札与诗文稿', fonds: '个人全宗', year: '1948', tagIds: ['G-008'], addedAt: '2026-06-26T14:12:00', addedBy: '李文华' },
    { id: 'M-031', archiveId: null, archiveNo: 'MR-1965-S-011', title: '老校长回忆录手稿', fonds: '个人全宗', year: '1965', tagIds: ['G-008'], addedAt: '2026-06-26T14:16:00', addedBy: '陈静' },
    /* 照片档案 */
    { id: 'M-032', archiveId: 'A-020', archiveNo: 'MZ-1985-Z-012', title: '城市旧影：主要街区历史照片专辑', fonds: '民政全宗', year: '1985', tagIds: ['G-009'], addedAt: '2026-06-30T10:05:00', addedBy: '陈静' },
    { id: 'M-033', archiveId: null, archiveNo: 'ZP-1959-Z-004', title: '国庆十周年游行照片', fonds: '照片全宗', year: '1959', tagIds: ['G-009'], addedAt: '2026-06-30T10:09:00', addedBy: '刘洋' },
    { id: 'M-034', archiveId: null, archiveNo: 'ZP-1978-Z-021', title: '恢复高考考场照片', fonds: '照片全宗', year: '1978', tagIds: ['G-009', 'G-002'], addedAt: '2026-06-30T10:13:00', addedBy: '王建国' },
    { id: 'M-035', archiveId: null, archiveNo: 'ZP-1994-Z-045', title: '开发区奠基仪式照片', fonds: '照片全宗', year: '1994', tagIds: ['G-009', 'G-007'], addedAt: '2026-06-30T10:17:00', addedBy: '赵志远' },
    { id: 'M-036', archiveId: null, archiveNo: 'ZP-2008-Z-078', title: '城市风貌航拍照片', fonds: '照片全宗', year: '2008', tagIds: ['G-009'], addedAt: '2026-06-30T10:21:00', addedBy: '李文华' }
  ];

  /* ======================================================================
     编研素材库 · 查找素材：馆藏档案目录（检索用的测试数据）
     —— 目录检索打的是著录字段（档号/题名/全宗/年度/责任者/保管期限/密级），
        全文检索打的是 fullText。数据仅 18 条，够演示两种检索的差异。
     ====================================================================== */

  var ARCHIVE_CATALOG = [
    { id: 'A-001', archiveNo: 'JY-1947-Y-012', title: '本市私立中学立案与改制文件', fonds: '教育全宗', category: '文书档案', year: '1947', author: '市教育局', retention: '永久', security: '公开', pages: 12, digitized: true,
      summary: '私立中学立案审批、校名变更与课程设置相关文书',
      fullText: '据本市私立中学呈请，经教育局核查校舍、师资与经费，准予立案。该校原设初中部，现拟增设高中部，课程依照部颁标准设置，并报省教育厅备案。' },
    { id: 'A-002', archiveNo: 'JY-1952-Y-038', title: '全市小学整顿与并校工作方案', fonds: '教育全宗', category: '文书档案', year: '1952', author: '市教育局', retention: '永久', security: '公开', pages: 8, digitized: true,
      summary: '小学布局调整、并校与教师调配方案',
      fullText: '为改善小学布局分散、师资不足的状况，制定本方案。全市原有小学一百三十二所，拟合并为九十八所，教师按学区统一调配，校舍逐步改建。' },
    { id: 'A-003', archiveNo: 'JY-1978-Y-104', title: '恢复高考后本市招生工作纪要', fonds: '教育全宗', category: '文书档案', year: '1978', author: '市招生委员会', retention: '永久', security: '公开', pages: 16, digitized: true,
      summary: '恢复高考当年的报名、考试组织与录取情况',
      fullText: '本年恢复高等学校招生考试，全市报名人数达一万二千余人。地区设考点十一个，考试科目为政治、语文、数学、物理、化学。录取工作于九月完成。' },
    { id: 'A-004', archiveNo: 'JY-1985-Y-217', title: '全市中小学校舍安全普查报告', fonds: '教育全宗', category: '文书档案', year: '1985', author: '市教育局', retention: '长期', security: '公开', pages: 24, digitized: false,
      summary: '校舍危房鉴定与改造计划',
      fullText: '普查覆盖全市中小学四百余所，查出危房面积约二万三千平方米，主要集中在农村地区。建议分三年完成改造，所需资金由市县两级分担。' },
    { id: 'A-005', archiveNo: 'JY-1996-Y-330', title: '市属高校合并组建可行性论证材料', fonds: '教育全宗', category: '文书档案', year: '1996', author: '市教育委员会', retention: '长期', security: '内部', pages: 32, digitized: true,
      summary: '两所市属高校合并的论证报告与专家意见',
      fullText: '两校专业设置重叠度较高，合并后可形成工、管、文相结合的专业群。专家组认为合有利于提高办学效益，建议先行试点，再报省教育部门审批。' },

    { id: 'A-006', archiveNo: 'SX-2016-Y-014', title: '全市教育工作会议实况录像', fonds: '声像全宗', category: '声像档案', year: '2016', author: '市教育局', retention: '永久', security: '公开', pages: 0, digitized: true,
      summary: '全市教育工作会议全程实况录像，含领导讲话与经验交流',
      fullText: '' },

    { id: 'A-007', archiveNo: 'SL-1954-Y-007', title: '城区防洪堤加固工程设计与批复', fonds: '水利全宗', category: '科技档案', year: '1954', author: '市水利局', retention: '永久', security: '公开', pages: 28, digitized: true,
      summary: '防洪堤加固设计方案、批复与预算',
      fullText: '去岁汛期洪水位超过保证水位，堤身出现渗漏。市水利局拟将城区段堤防加高一点二米，迎水面加做浆砌石护坡，工程预算共计人民币十八万元。' },
    { id: 'A-007', archiveNo: 'SL-1963-Y-045', title: '水库灌区配套工程年度总结', fonds: '水利全宗', category: '文书档案', year: '1963', author: '市水利局', retention: '长期', security: '公开', pages: 14, digitized: true,
      summary: '灌区渠道配套建设与灌溉面积统计',
      fullText: '本年度完成干渠衬砌十一公里，支渠配套二十三公里，新增灌溉面积八千六百亩。灌区受益乡十二个，群众投工投劳共计三万余工日。' },
    { id: 'A-008', archiveNo: 'SL-1991-Y-158', title: '河道清障与采砂管理通告', fonds: '水利全宗', category: '文书档案', year: '1991', author: '市水利局', retention: '定期', security: '公开', pages: 4, digitized: false,
      summary: '河道管理范围内的清障要求与采砂审批',
      fullText: '任何单位和个人不得在河道管理范围内设置阻水障碍物。采砂须经水行政主管部门批准，划定范围与时限，违者按有关规定处理。' },
    { id: 'A-009', archiveNo: 'SL-2003-Y-266', title: '流域综合治理规划（2003—2010）', fonds: '水利全宗', category: '科技档案', year: '2003', author: '市水利局', retention: '永久', security: '公开', pages: 56, digitized: true,
      summary: '流域防洪、供水与水环境综合治理规划',
      fullText: '规划以防洪安全为前提，统筹供水保障与水生态修复。近期重点治理干流险工险段，远期结合城市总体规划调整水系，逐步实现水系连通。' },

    { id: 'A-010', archiveNo: 'SH-1936-Y-021', title: '商会会员名册与行业分会章程', fonds: '商会全宗', category: '文书档案', year: '1936', author: '本市商会', retention: '永久', security: '公开', pages: 36, digitized: true,
      summary: '商会会员登记、行业分会设置与章程',
      fullText: '本会现有会员二百七十八家，分设米业、绸布、药材、木作等十一个行业分会。各分会章程均须报本会备案，会费按营业规模分等缴纳。' },
    { id: 'A-011', archiveNo: 'SH-1946-Y-053', title: '商会关于物价波动的呈文与往来函', fonds: '商会全宗', category: '文书档案', year: '1946', author: '本市商会', retention: '永久', security: '公开', pages: 18, digitized: true,
      summary: '物价上涨情形呈报及同业应对措施',
      fullText: '近月以来米、油、布匹价格迭次上涨，各业经营困难。本会据实呈请核减捐税，并议定同业不得囤积居奇，违者由分会公议处理。' },
    { id: 'A-012', archiveNo: 'SH-1948-Y-070', title: '同业公会理监事联席会议记录', fonds: '商会全宗', category: '文书档案', year: '1948', author: '本市商会', retention: '长期', security: '公开', pages: 22, digitized: false,
      summary: '联席会议讨论事项与决议',
      fullText: '会议议决：一、推举代表三人向市政府陈情，请求稳定币值；二、各分会按月造报营业概况；三、筹设商人补习学校，经费由各业分摊。' },
    { id: 'A-013', archiveNo: 'SH-1951-Y-092', title: '工商业户登记与行业归口材料', fonds: '商会全宗', category: '文书档案', year: '1951', author: '市工商业联合会筹备处', retention: '长期', security: '公开', pages: 20, digitized: true,
      summary: '工商业户重新登记与行业归口管理',
      fullText: '全市登记工商业户一千零四十三户，按行业归口为十八个组。原商会行业分会相应调整，人员一并转入各组，原有档案资料移交筹备处保管。' },

    { id: 'A-014', archiveNo: 'MZ-1938-Y-004', title: '抗战时期难民收容与救济清册', fonds: '民政全宗', category: '文书档案', year: '1938', author: '市赈济委员会', retention: '永久', security: '公开', pages: 42, digitized: true,
      summary: '难民收容所设置、救济粮发放清册',
      fullText: '抗战军兴以来，城区设收容所七处，收容难民三千二百余人。每日发放米粮两次，另设诊疗所一处。各方捐助款项及实物，均按月造册公布，以备稽核。' },
    { id: 'A-015', archiveNo: 'MZ-1939-Y-017', title: '各界募捐支援抗战收支报告', fonds: '民政全宗', category: '文书档案', year: '1939', author: '市赈济委员会', retention: '永久', security: '公开', pages: 26, digitized: true,
      summary: '募捐收入与支出明细报告',
      fullText: '本年度共收捐款法币四万七千余元，棉衣一万一千件。支出以救济难童、慰劳抗战伤兵为主，结余款项存储备荒，账目经地方士绅五人共同审核。' },
    { id: 'A-016', archiveNo: 'MZ-1956-Y-061', title: '城市居民生活困难救济暂行办法', fonds: '民政全宗', category: '文书档案', year: '1956', author: '市民政局', retention: '长期', security: '公开', pages: 10, digitized: false,
      summary: '生活困难救济的对象、标准与审批程序',
      fullText: '凡无依无靠、无劳动能力、无生活来源的居民，经街道评定、区民政部门批准，可给予定期救济。临时困难者给予一次性救济，标准按季核定。' },
    { id: 'A-017', archiveNo: 'MZ-1962-Y-088', title: '城镇精简职工安置情况报告', fonds: '民政全宗', category: '文书档案', year: '1962', author: '市民政局', retention: '长期', security: '内部', pages: 30, digitized: true,
      summary: '精简职工返乡安置与生活补助',
      fullText: '全市精简职工一万一千余人，其中回农村安置九千四百人。发放安置补助费及口粮补贴，并协助解决住房与自留地问题，安置情况逐户登记。' },
    { id: 'A-018', archiveNo: 'MZ-1998-Y-205', title: '城市居民最低生活保障制度实施办法', fonds: '民政全宗', category: '文书档案', year: '1998', author: '市民政局', retention: '永久', security: '公开', pages: 18, digitized: true,
      summary: '最低生活保障标准、申请与动态管理',
      fullText: '凡家庭人均收入低于本市最低生活保障标准的居民，均可申请保障。街道办事处受理、区民政部门审批，实行按月发放、年度复核、动态管理。' },
    { id: 'A-019', archiveNo: 'JY-1953-K-006', title: '市属学校经费决算报告', fonds: '教育全宗', category: '会计档案', year: '1953', author: '市教育局', retention: '定期', security: '公开', pages: 15, digitized: false,
      summary: '市属中小学年度经费收支决算',
      fullText: '本年度市属中小学经费总收入人民币八十六万元，支出八十一万元，结余五万元。支出以人员经费为主，占七成三，修缮购置占二成。' },
    { id: 'A-020', archiveNo: 'MZ-1985-Z-012', title: '城市旧影：主要街区历史照片专辑', fonds: '民政全宗', category: '照片档案', year: '1985', author: '市档案馆', retention: '永久', security: '公开', pages: 60, digitized: true,
      summary: '城区主要街区与地标建筑历史照片 120 幅',
      fullText: '本专辑收录 1949 年至 1985 年间城区主要街区与地标建筑照片一百二十幅，含已拆除的城墙、鼓楼与老码头，均附拍摄时间与方位说明。' },
    { id: 'A-021', archiveNo: 'SL-1998-W-003', title: '抗洪抢险实物档案登记册', fonds: '水利全宗', category: '实物档案', year: '1998', author: '市防汛指挥部', retention: '永久', security: '公开', pages: 9, digitized: false,
      summary: '抗洪抢险期间的水位标尺、奖旗、工具等实物登记',
      fullText: '登记实物共四十七件，含水位标尺两根、奖旗十二面、抢险工具二十三件、群众慰问信十封。每件均记录来源、尺寸与保存状况。' }
  ];

  /* 档案门类的规范顺序（下拉按此排序，而不是按数据出现顺序） */
  var ARCHIVE_CATEGORIES = ['文书档案', '科技档案', '会计档案', '照片档案', '声像档案', '实物档案', '专业档案'];

  /* 检索界面上的示例检索词，点一下即可发起检索 */
  var SEARCH_SUGGESTIONS = ['教育', '水利', '商会', '抗战', '救济', '规划'];

  /* ======================================================================
     编研成果数据
     —— 24 部，按编研类型的分布与工作台「编研类型统计 · 成果数量」一致
        （汇编 4 / 选编 3 / 大事记 3 / 组织沿革 2 / 年鉴年谱 2 / 专题概要 2 /
          咨政报告 2 / 史志成果 2 / 论著文章 2 / 知识图谱 1 / 展览展示 1 = 24）。
        其中 3 部关联到已完成的编研任务（成果发布产生），其余为往年成果。
        封面由 CSS 依据这些字段绘制，不依赖任何图片文件（离线可用）。
     ====================================================================== */

  var PRODUCTS = [
    /* 档案文献汇编 */
    { id: 'CP-001', title: '本市工业遗产档案汇编（一）', type: '档案文献汇编', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2025-11-18', words: 428000, formats: ['PDF', 'OFD'], security: '公开', summary: '收录 1950—2000 年工业建设档案 260 件，按行业与厂区分编。' },
    { id: 'CP-002', title: '民国时期市政建设档案汇编', type: '档案文献汇编', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2024-09-26', words: 396000, formats: ['PDF'], security: '公开', summary: '含道路、路灯、下水道等市政工程文书 210 件。' },
    { id: 'CP-003', title: '城区街巷地名档案汇编', type: '档案文献汇编', taskId: null, compiledBy: '市档案馆保管利用科', publishedAt: '2023-12-08', words: 268000, formats: ['PDF', 'HTML'], security: '公开', summary: '梳理城区街巷命名与更名文书，附新旧地名对照表。' },
    { id: 'CP-004', title: '市属企业改制档案汇编', type: '档案文献汇编', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2023-06-15', words: 512000, formats: ['PDF', 'OFD'], security: '内部', summary: '1992—2005 年企业改制批复、清产核资与职工安置材料。' },

    /* 档案文献选编 */
    { id: 'CP-005', title: '抗战时期本地民众救助档案选编', type: '档案文献选编', taskId: 'RW-2025-004', compiledBy: '市档案馆编研利用科', publishedAt: '2026-03-28', words: 386000, formats: ['PDF', 'OFD', 'HTML'], security: '公开', summary: '选编救助类档案 260 件，结合报刊资料互证，获省档案优秀成果二等奖。' },
    { id: 'CP-006', title: '本地名人文书档案选编', type: '档案文献选编', taskId: 'RW-2025-006', compiledBy: '市档案馆编研利用科', publishedAt: '2026-05-26', words: 342000, formats: ['PDF', 'OFD'], security: '公开', summary: '一人一辑，选编文书 180 件，附人物小传与年表。' },
    { id: 'CP-007', title: '民国商会同业公会档案选编', type: '档案文献选编', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2024-04-12', words: 274000, formats: ['PDF'], security: '公开', summary: '按行业分会分编，收录章程、营业规则与纠纷调处文书。' },

    /* 大事记 */
    { id: 'CP-008', title: '本市城市建设大事记（1949—2020）', type: '大事记', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2024-06-20', words: 236000, formats: ['PDF', 'HTML'], security: '公开', summary: '按年度立条 1,860 条，附重大工程索引。' },
    { id: 'CP-009', title: '本市教育大事记（1901—1949）', type: '大事记', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2023-09-01', words: 168000, formats: ['PDF'], security: '公开', summary: '清末兴学至新中国成立前的教育事项编年。' },
    { id: 'CP-010', title: '本市水利大事记（1950—2000）', type: '大事记', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2023-03-16', words: 194000, formats: ['PDF', 'OFD'], security: '公开', summary: '河道治理、水库建设与防汛抗洪事项编年。' },

    /* 组织沿革 */
    { id: 'CP-011', title: '本市行政区划沿革（1949—2010）', type: '组织沿革', taskId: null, compiledBy: '市档案馆保管利用科', publishedAt: '2024-11-05', words: 152000, formats: ['PDF'], security: '公开', summary: '县级及以上区划调整沿革，附区划示意图 18 幅。' },
    { id: 'CP-012', title: '市档案馆机构沿革（1959—2020）', type: '组织沿革', taskId: null, compiledBy: '市档案馆办公室', publishedAt: '2022-10-21', words: 98000, formats: ['PDF', 'HTML'], security: '公开', summary: '机构设置、职能调整与领导成员名录。' },

    /* 年鉴年谱 */
    { id: 'CP-013', title: '本市教育年鉴（2015—2019）', type: '年鉴年谱', taskId: null, compiledBy: '市教育局、市档案馆', publishedAt: '2023-11-30', words: 486000, formats: ['PDF', 'OFD'], security: '公开', summary: '五个年度的教育工作与关键指标数据表。' },
    { id: 'CP-014', title: '乡贤年谱：李明远先生年谱', type: '年鉴年谱', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2022-05-18', words: 132000, formats: ['PDF'], security: '公开', summary: '以手稿、书信为据编次生平年表，附著述目录。' },

    /* 专题概要 */
    { id: 'CP-015', title: '民国时期本地商会史料概要', type: '专题概要', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2024-02-28', words: 118000, formats: ['PDF', 'HTML'], security: '公开', summary: '商会沿革、行业构成与经营活动综述。' },
    { id: 'CP-016', title: '本市抗洪救灾史料概要', type: '专题概要', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2025-08-14', words: 146000, formats: ['PDF'], security: '公开', summary: '历次洪涝灾害与处置措施综述，附灾情统计。' },

    /* 咨政报告 */
    { id: 'CP-017', title: '防汛历史经验咨政报告汇编', type: '咨政报告', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2025-07-02', words: 86000, formats: ['PDF', 'OFD'], security: '内部', summary: '六篇专题报告，提炼历史防汛处置经验与建议。' },
    { id: 'CP-018', title: '城市更新中的档案服务专题报告', type: '咨政报告', taskId: null, compiledBy: '市档案馆编研利用科', publishedAt: '2024-08-09', words: 64000, formats: ['PDF'], security: '内部', summary: '面向城市更新的档案利用需求分析与服务建议。' },

    /* 史志成果 */
    { id: 'CP-019', title: '本市教育志（史料长编）', type: '史志成果', taskId: null, compiledBy: '市教育局、市档案馆', publishedAt: '2025-05-20', words: 926000, formats: ['PDF', 'OFD'], security: '公开', summary: '教育志书稿的史料依据长编，按章节对勘。' },
    { id: 'CP-020', title: '本市交通志（史料长编）', type: '史志成果', taskId: null, compiledBy: '市交通运输局、市档案馆', publishedAt: '2024-12-16', words: 784000, formats: ['PDF'], security: '公开', summary: '交通志书稿的史料依据长编，附线路与枢纽沿革。' },

    /* 论著文章 */
    { id: 'CP-021', title: '档案编研中的原文保护方法研究', type: '论著文章', taskId: null, compiledBy: '王建国', publishedAt: '2025-09-10', words: 12000, formats: ['PDF'], security: '公开', summary: '讨论原文与编者文字分离的模型设计与校勘记规范。' },
    { id: 'CP-022', title: '民国档案识读与释文规范刍议', type: '论著文章', taskId: null, compiledBy: '李文华', publishedAt: '2023-08-22', words: 9800, formats: ['PDF'], security: '公开', summary: '就异体字、缺字与存疑标记的处理提出规范建议。' },

    /* 知识图谱 */
    { id: 'CP-023', title: '本市工业遗产档案知识图谱（一期）', type: '知识图谱', taskId: null, compiledBy: '市档案馆信息技术科', publishedAt: '2025-12-05', words: 42000, formats: ['HTML'], security: '公开', summary: '覆盖 320 个实体、1,100 条关系的可交互图谱。' },

    /* 展览展示 */
    { id: 'CP-024', title: '城市记忆：老照片展览展示方案', type: '展览展示', taskId: 'RW-2025-005', compiledBy: '市档案馆编研利用科', publishedAt: '2025-12-18', words: 36000, formats: ['PDF', 'HTML'], security: '公开', summary: '遴选照片 300 张，按年代分五个单元，线上线下同步展陈。' }
  ];

  /* 在线浏览用的目录模板：按编研类型给一套符合体例的框架（原型用于模拟"打开成果文件"） */
  var PRODUCT_TOC = {
    '档案文献汇编': ['凡例', '编辑说明', '第一编 综合史料', '第二编 专题史料', '附录：档案来源一览', '后记'],
    '档案文献选编': ['凡例', '选编说明', '上编 综合类', '下编 专题类', '附录一 目录出处', '后记'],
    '大事记': ['编写说明', '1949—1965', '1966—1978', '1979—2000', '2001—2025', '附录：条目索引'],
    '组织沿革': ['编写说明', '机构设置沿革', '职能调整', '领导成员名录', '附录：文号索引'],
    '年鉴年谱': ['编纂说明', '生平与年表', '重要文献选录', '附录：著述目录'],
    '专题概要': ['概述', '专题一 历史沿革', '专题二 重要事件', '专题三 相关人物', '结语'],
    '咨政报告': ['报告一 历史经验', '报告二 现状分析', '报告三 对策建议', '附录：数据来源'],
    '史志成果': ['凡例', '第一章 概述', '第二章 事业发展', '第三章 专题记述', '附录：大事记'],
    '论著文章': ['摘要', '引言', '正文', '结论', '参考文献'],
    '知识图谱': ['建设说明', '实体与关系定义', '数据来源与加工', '图谱示例', '后续建设计划'],
    '展览展示': ['策展说明', '第一单元 旧影', '第二单元 变迁', '第三单元 新貌', '结语']
  };

  /* ======================================================================
     流程审核数据
     —— 两类流程共用一个数组：选题的《编研选题立项审核》(TOPIC_REVIEW)
        与编研任务的《编研成果审核》(PRODUCT_REVIEW)。
        多环节流程把步骤级的审核人、审核意见与状态直接记在记录里（见 store 的流程引擎）；
        权限口径（设计文档）：admin 可见全部；其他用户只看"需自己审核""自己发起"或"自己审过"的。
     ====================================================================== */

  var REVIEW_FLOW_TYPES = {
    PRODUCT_REVIEW: { label: '编研成果审核', short: '成果审核', prefix: 'FB' },
    TOPIC_REVIEW: { label: '编研选题立项审核', short: '立项审核', prefix: 'LX' }
  };

  var REVIEW_FLOW_STATUS = {
    REVIEWING: { label: '审核中', tag: 'tag-warn' },
    APPROVED: { label: '审核通过', tag: 'tag-ok' },
    REJECTED: { label: '审核不通过', tag: 'tag-danger' }
  };

  /* 内容审核校对：设计文档要求"利用 AI 完成错别字校对、政治性审核、专业性审核、合规性审核"，
     并注明原型可以先不实现。这里是**预置结果**，只用于呈现界面形态。 */
  var REVIEW_AI_CHECKS = [
    { key: 'TYPO', label: '错别字校对',
      findings: [
        { where: '第 2 章 · 第 3 节', text: '「按排」应为「安排」' },
        { where: '第 4 章 · 第 1 节', text: '「截止 1949 年」建议改为「截至 1949 年」' }
      ] },
    { key: 'POLITICS', label: '政治性审核',
      findings: [
        { where: '第 5 章 · 概述', text: '涉及历史时期表述，建议核对规范用语' }
      ] },
    { key: 'PRO', label: '专业性审核',
      findings: [
        { where: '第 3 章 · 附录', text: '「档号 JY-1947-Y-012」与著录信息不一致，请复核' }
      ] },
    { key: 'COMPLIANCE', label: '合规性审核',
      findings: [
        { where: '全文', text: '含 2 处内部级档案原文，公开出版前需办理解密或删节手续' }
      ] }
  ];

  var REVIEW_FLOWS = [
    { flowNo: 'FB-2026-0002', type: 'PRODUCT_REVIEW', targetId: 'RW-2026-003',
      targetName: '本市行政区划沿革（1949—2025）',
      at: '2026-09-08T09:20:00', by: '陈静', reviewer: '李文华', status: 'REVIEWING',
      opinion: '', reviewedAt: null, reviewedBy: null,
      history: [{ at: '2026-09-08T09:20:00', by: '陈静', action: 'SUBMIT', opinion: '初稿及辅文已完成，提交审核。' }] },
    { flowNo: 'FB-2026-0001', type: 'PRODUCT_REVIEW', targetId: 'RW-2025-004',
      targetName: '抗战时期本地民众救助档案选编',
      at: '2026-03-10T14:00:00', by: '刘洋', reviewer: '李文华', status: 'APPROVED',
      opinion: '三审三校完成，原文与编者文字分离清楚，同意发布。',
      reviewedAt: '2026-03-12T11:30:00', reviewedBy: '李文华',
      history: [
        { at: '2026-03-10T14:00:00', by: '刘洋', action: 'SUBMIT', opinion: '' },
        { at: '2026-03-12T11:30:00', by: '李文华', action: 'APPROVED', opinion: '三审三校完成，原文与编者文字分离清楚，同意发布。' }
      ] },
    { flowNo: 'LX-2026-0005', type: 'TOPIC_REVIEW', targetId: 'T-007',
      targetName: '本市抗洪救灾咨政报告汇编',
      at: '2026-09-06T09:30:00', by: '赵志远', reviewer: '李文华', status: 'REVIEWING',
      opinion: '', reviewedAt: null, reviewedBy: null,
      history: [{ at: '2026-09-06T09:30:00', by: '赵志远', action: 'SUBMIT', opinion: '' }] },
    { flowNo: 'LX-2026-0004', type: 'TOPIC_REVIEW', targetId: 'T-004',
      targetName: '交通事业发展大事记',
      at: '2026-05-19T10:30:00', by: '王建国', reviewer: '李文华', status: 'REJECTED',
      opinion: '经费预算需细化，请补充年度用款计划后重新提交。',
      reviewedAt: '2026-05-21T09:40:00', reviewedBy: '李文华',
      history: [
        { at: '2026-05-19T10:30:00', by: '王建国', action: 'SUBMIT', opinion: '' },
        { at: '2026-05-21T09:40:00', by: '李文华', action: 'REJECTED', opinion: '经费预算需细化，请补充年度用款计划后重新提交。' }
      ] },
    { flowNo: 'LX-2026-0003', type: 'TOPIC_REVIEW', targetId: 'T-001',
      targetName: '本市教育事业发展史料汇编',
      at: '2026-03-13T09:10:00', by: '王建国', reviewer: '李文华', status: 'APPROVED',
      opinion: '材料齐备，同意立项。', reviewedAt: '2026-03-14T16:20:00', reviewedBy: '李文华',
      history: [
        { at: '2026-03-13T09:10:00', by: '王建国', action: 'SUBMIT', opinion: '' },
        { at: '2026-03-14T16:20:00', by: '李文华', action: 'APPROVED', opinion: '材料齐备，同意立项。' }
      ] },
    { flowNo: 'LX-2025-0001', type: 'TOPIC_REVIEW', targetId: 'T-002',
      targetName: '抗战时期本地民众救助档案选编',
      at: '2025-11-06T10:00:00', by: '李文华', reviewer: '王建国', status: 'APPROVED',
      opinion: '选题价值明确，同意立项。', reviewedAt: '2025-11-07T15:30:00', reviewedBy: '王建国',
      history: [
        { at: '2025-11-06T10:00:00', by: '李文华', action: 'SUBMIT', opinion: '' },
        { at: '2025-11-07T15:30:00', by: '王建国', action: 'APPROVED', opinion: '选题价值明确，同意立项。' }
      ] }
  ];

  /* ======================================================================
     编研任务数据
     —— 阶段口径取自设计文档「编研任务卡片」：生成大纲 → 确定选材 → 加工编排
        → 辅文编写 → 审核校定 → 成果发布（选题不在任务内，已上移到「选题立项」）。
        门禁规则与阶段产物参考《原型功能模块规划》的阶段门设计，待各阶段工作界面
        生成后逐条落地，当前在界面上标注为"待实现"。
     ====================================================================== */

  /* 任务**存储状态**：设计文档明确的三态（未开始 / 进行中 / 已完成） */
  var TASK_STATUS = {
    NOT_STARTED: { label: '未开始', tag: '' },
    IN_PROGRESS: { label: '进行中', tag: 'tag-accent' },
    DONE: { label: '已完成', tag: 'tag-ok' }
  };

  /* 任务**呈现状态**：在存储三态之上，把「暂停」拆成互斥的一档 ——
     进行中的任务被暂停时只显示「已暂停」，不再同时挂着「进行中」。
     存储仍只存三态 + paused 标记，由 store.taskState() 统一换算，
     页面一律通过它取状态，避免各处各写一套而出现"两个状态并存"。 */
  var TASK_STATES = {
    NOT_STARTED: { key: 'NOT_STARTED', label: '未开始', tag: '' },
    IN_PROGRESS: { key: 'IN_PROGRESS', label: '进行中', tag: 'tag-accent' },
    PAUSED: { key: 'PAUSED', label: '已暂停', tag: 'tag-warn' },
    DONE: { key: 'DONE', label: '已完成', tag: 'tag-ok' }
  };

  var TASK_STAGES = [
    { key: 'OUTLINE', index: 1, title: '生成大纲',
      goal: '形成编研成果的篇章结构', outputs: '大纲树：章节 / 编写要点 / 建议史料范围',
      gate: '大纲已确认（章节完整、主题一致）' },
    { key: 'MATERIAL', index: 2, title: '确定选材',
      goal: '从素材库中选定入编档案', outputs: '选材清单、大纲覆盖率',
      gate: '选材清单非空，且主要章节均有史料支撑' },
    /* 评审要求：去掉原第 4 阶段「辅文编写」—— 序言 / 按语 / 注释 / 索引等辅文并入「加工编排」，
       所以 EDIT 的产出里带上辅文；后面的阶段各上移一位（审核校定 4、成果发布 5）。 */
    { key: 'EDIT', index: 3, title: '加工编排',
      goal: '转录、编排、影印与格式加工，并编写序言 / 按语 / 注释 / 索引等辅文',
      outputs: '编排稿（档案原文与编者文字分离）＋辅文（注释 / 索引 / 附录）',
      gate: '原文保护校验通过（改动均附校勘记），辅文齐备' },
    { key: 'REVIEW', index: 4, title: '审核校定',
      goal: '完成三审三校', outputs: '审校记录、定稿',
      gate: '三审三校全部通过' },
    { key: 'PUBLISH', index: 5, title: '成果发布',
      goal: '生成终稿并发布成果', outputs: 'PDF / OFD / HTML 成果、发布记录',
      gate: '终稿确认，密级与输出格式相符' }
  ];

  /* 团队成员角色（设计文档列出的六类） */
  var TASK_TEAM_ROLES = [
    { key: 'leader', label: '团队负责人' },
    { key: 'collector', label: '档案收集人员' },
    { key: 'editor', label: '编辑审核人员' },
    { key: 'publisher', label: '成果发布人员' },
    { key: 'promoter', label: '宣传推介人员' },
    { key: 'archivist', label: '材料归档人员' }
  ];

  /* 演示任务：3 个进行中、3 个已完成、1 个未开始。
     关联的选题状态与之一致（任务启动后选题转「进行中」，任务完成转「已完成」）。 */
  /* 「乡村振兴档案史料汇编（续编）」这个演示任务的编号：由下面的在建任务生成逻辑算出来，
     大纲与正文（OUTLINES / COMPOSES）按它落键，避免把编号写死、以后改 plan 就错位 */
  var XC_TASK_ID = '';

  var TASKS = [
    {
      id: 'RW-2026-001', type: '档案文献汇编', topicId: 'T-001', topicName: '本市教育事业发展史料汇编',
      status: 'IN_PROGRESS', paused: false, stage: 2,
      planStart: '2026-03-16', planEnd: '2026-12-20',
      team: { leader: '王建国', collector: '陈静', editor: '李文华', publisher: '刘洋', promoter: '刘洋', archivist: '陈静' },
      note: '按「学制变迁—学校沿革—教育人物」三条线索编排，重点保证民国段完整性。',
      createdAt: '2026-03-16T09:30:00', createdBy: '赵志远',
      /* 评审要求：这条任务的进度先重置到第 1 阶段「生成大纲」，现在推进到第 2 阶段「确定选材」——
         它是本原型里唯一停在「确定选材」的在建任务，详情页因此显示该阶段的工作界面
         （进度条上的阶段可以点着看，第 1 阶段的界面还在） */
      stageHistory: [
        { stage: 1, at: '2026-03-20T10:00:00', by: '王建国' },
        { stage: 2, at: '2026-05-08T14:20:00', by: '王建国' }
      ]
    },
    {
      id: 'RW-2026-002', type: '大事记', topicId: 'T-004', topicName: '交通事业发展大事记',
      status: 'IN_PROGRESS', paused: true, stage: 2,
      planStart: '2026-05-20', planEnd: '2026-09-30',
      team: { leader: '王建国', collector: '陈静', editor: '刘洋', publisher: '', promoter: '', archivist: '陈静' },
      note: '按年度立条，先建条目库再成文；暂停原因：等待交通局补充 1980 年前线路图。',
      createdAt: '2026-05-20T10:05:00', createdBy: '赵志远',
      stageHistory: [
        { stage: 1, at: '2026-05-26T15:40:00', by: '王建国' },
        { stage: 2, at: '2026-06-30T11:05:00', by: '陈静' }
      ]
    },
    {
      id: 'RW-2026-003', type: '组织沿革', topicId: 'T-005', topicName: '本市行政区划沿革（1949—2025）',
      status: 'IN_PROGRESS', paused: false, stage: 5,
      planStart: '2026-02-12', planEnd: '2026-08-31',
      team: { leader: '陈静', collector: '陈静', editor: '李文华', publisher: '李文华', promoter: '', archivist: '刘洋' },
      note: '以政府批复文件为准，逐条标注文号与日期；已完成初稿并提交成果审核。',
      createdAt: '2026-02-12T14:00:00', createdBy: '赵志远',
      stageHistory: [
        { stage: 1, at: '2026-02-18T09:20:00', by: '陈静' },
        { stage: 2, at: '2026-03-24T10:30:00', by: '陈静' },
        { stage: 3, at: '2026-05-19T16:10:00', by: '李文华' },
        { stage: 4, at: '2026-08-28T10:20:00', by: '陈静' },
        { stage: 5, at: '2026-09-08T09:20:00', by: '陈静' }
      ]
    },
    {
      id: 'RW-2025-004', type: '档案文献选编', topicId: 'T-002', topicName: '抗战时期本地民众救助档案选编',
      status: 'DONE', paused: false, stage: 5,
      planStart: '2025-11-10', planEnd: '2026-03-31',
      team: { leader: '李文华', collector: '陈静', editor: '李文华', publisher: '刘洋', promoter: '刘洋', archivist: '陈静' },
      note: '已出版，成果同时归档。',
      createdAt: '2025-11-10T09:00:00', createdBy: '赵志远',
      finishedAt: '2026-03-28T17:20:00',
      stageHistory: [
        { stage: 1, at: '2025-11-14T10:00:00', by: '李文华' },
        { stage: 2, at: '2025-12-08T15:30:00', by: '陈静' },
        { stage: 3, at: '2026-01-16T11:20:00', by: '李文华' },
        { stage: 4, at: '2026-03-12T14:00:00', by: '刘洋' },
        { stage: 5, at: '2026-03-28T17:20:00', by: '刘洋' }
      ]
    },
    {
      id: 'RW-2025-005', type: '展览展示', topicId: 'T-008', topicName: '城市记忆：老照片展览展示方案',
      status: 'DONE', paused: false, stage: 5,
      planStart: '2025-09-26', planEnd: '2025-12-20',
      team: { leader: '陈静', collector: '陈静', editor: '刘洋', publisher: '刘洋', promoter: '刘洋', archivist: '刘洋' },
      note: '线上线下同步展陈，照片说明经党史部门审核。',
      createdAt: '2025-09-26T10:30:00', createdBy: '赵志远',
      finishedAt: '2025-12-18T16:00:00',
      stageHistory: [
        { stage: 1, at: '2025-10-08T09:30:00', by: '陈静' },
        { stage: 2, at: '2025-10-24T14:10:00', by: '陈静' },
        { stage: 3, at: '2025-11-12T10:20:00', by: '刘洋' },
        { stage: 4, at: '2025-12-10T11:30:00', by: '刘洋' },
        { stage: 5, at: '2025-12-18T16:00:00', by: '刘洋' }
      ]
    },
    {
      id: 'RW-2025-006', type: '档案文献选编', topicId: 'T-011', topicName: '本地名人文书档案选编',
      status: 'DONE', paused: false, stage: 5,
      planStart: '2025-12-20', planEnd: '2026-05-31',
      team: { leader: '刘洋', collector: '陈静', editor: '李文华', publisher: '刘洋', promoter: '', archivist: '陈静' },
      note: '一人一辑，附人物小传与年表。',
      createdAt: '2025-12-20T09:40:00', createdBy: '赵志远',
      finishedAt: '2026-05-26T15:40:00',
      stageHistory: [
        { stage: 1, at: '2025-12-26T10:10:00', by: '刘洋' },
        { stage: 2, at: '2026-01-20T14:30:00', by: '陈静' },
        { stage: 3, at: '2026-02-26T09:50:00', by: '李文华' },
        { stage: 4, at: '2026-04-28T15:20:00', by: '刘洋' },
        { stage: 5, at: '2026-05-26T15:40:00', by: '刘洋' }
      ]
    },
    {
      id: 'RW-2026-007', type: '档案文献汇编', topicId: 'T-003', topicName: '本市水利建设档案史料汇编',
      status: 'NOT_STARTED', paused: false, stage: 1,
      planStart: '2026-10-08', planEnd: '2027-06-30',
      team: { leader: '赵志远', collector: '', editor: '', publisher: '', promoter: '', archivist: '' },
      note: '新建后尚未启动。',
      createdAt: '2026-09-12T11:20:00', createdBy: '赵志远',
      stageHistory: []
    }
  ];

  /* ======================================================================
     编研素材库 · 标签管理数据
     —— 「素材的分类」。
        注意：标签**不存**关联素材数，「关联素材数」由素材库聚合派生（store.tagUsage()），
        这样标签管理与素材管理两页的数字必然一致；它也决定该标签能否删除。
     ====================================================================== */

  var TAGS = [
    { id: 'G-001', name: '教育・民国时期', note: '民国时期教育类档案素材，含学校沿革、学制文件', createdAt: '2026-03-18T09:12:00', createdBy: '陈静' },
    { id: 'G-002', name: '教育・新中国', note: '1949 年后的教育工作、招生、校舍建设类素材', createdAt: '2026-03-18T09:20:00', createdBy: '陈静' },
    { id: 'G-003', name: '抗战史料', note: '抗战时期本地相关档案，含救助、募捐、防空', createdAt: '2026-03-19T14:05:00', createdBy: '王建国' },
    { id: 'G-004', name: '民国商会', note: '商会及同业公会档案，涉及行业经营与物价', createdAt: '2026-03-25T10:40:00', createdBy: '刘洋' },
    { id: 'G-005', name: '水利工程', note: '河道治理、水库、堤防工程档案', createdAt: '2026-04-02T11:18:00', createdBy: '赵志远' },
    { id: 'G-006', name: '交通建设', note: '公路、桥梁、港口及公共交通档案', createdAt: '2026-04-02T11:26:00', createdBy: '赵志远' },
    { id: 'G-007', name: '城市规划', note: '城市总体规划、详细规划与建设批复', createdAt: '2026-04-11T15:02:00', createdBy: '陈静' },
    { id: 'G-008', name: '名人手稿', note: '本地籍或曾在本地任职人士的手稿、书信', createdAt: '2026-05-06T09:48:00', createdBy: '李文华' },
    { id: 'G-009', name: '照片档案', note: '各时期照片、底片与影像资料', createdAt: '2026-05-06T09:55:00', createdBy: '李文华' },
    { id: 'G-010', name: '民俗非遗', note: '民俗活动、非物质文化遗产相关素材（待补充）', createdAt: '2026-08-14T16:20:00', createdBy: '刘洋' }
  ];


  /* ======================================================================
     选题立项数据
     —— 字段与《表 C.1 选题可行性评估表示例》一一对应
     ====================================================================== */

  var TOPIC_STATUS = {
    NOT_STARTED: { label: '未开始', tag: '' },
    IN_PROGRESS: { label: '进行中', tag: 'tag-accent' },
    DONE: { label: '已完成', tag: 'tag-ok' }
  };

  /* 经费来源：对应评估表中的勾选项 */
  var FUNDING_SOURCES = [
    { value: 'SELF', label: '自筹' },
    { value: 'SUBSIDY', label: '申请补助' }
  ];

  /* AI 辅助选题的候选主题。
     文档明确「原型中只需要呈现页面即可，不需要实现 AI 功能」，故这里是预置结果，
     不调用任何模型；但每条都带「立项依据」与「史料支撑度」，保留将来接真实模型时的
     输出结构（字段与「选题立项」AI 候选卡片一致）。 */
  /* 「AI 辅助选题」的候选主题（**预置结果**，原型不调用真实模型）。
     每一条除了名称与史料支撑情况，还按《表 C.1 选题可行性评估表》里三个多行文本框的
     **填写要点**起草了三段正文（评审要求：采用候选主题时把这三栏也生成出来）：
       · background —— 对应「背景与意义」：1. 立项依据 / 2. 背景介绍 / 3. 创新点
       · content    —— 对应「内容与目标」：1. 项目内容 / 2. 项目目标（含量化指标与时间节点）
       · plan       —— 对应「实施方案」：1. 工作思路 / 2. 工作计划 / 3. 工作方法
       · guarantee  —— 对应「保障措施」：1. 前期保障 / 2. 人才保障 / 3. 硬件保障
     basis 只用于候选卡片上的一句话摘要，不再直接写进表单。 */
  var AI_TOPIC_CANDIDATES = [
    {
      name: '本市重大工程建设项目档案史料汇编',
      basis: '馆藏基建类全宗 1980—2010 年项目档案 4,200 余卷，成体系、连续性好，近年查阅频次居前。',
      support: '强',
      background: '1. 立项依据：重大工程建设项目档案是城市建设的原始凭证，立项评审、工程审计与产权确认都常来查，' +
        '而馆藏尚无成体系的汇编，利用者只能按卷逐一借阅，项目必要且可行；\n' +
        '2. 背景介绍：馆藏基建类全宗 1980—2010 年项目档案 4,200 余卷，覆盖立项、设计、施工、竣工验收全过程；' +
        '已有零散的单项工程简介，存在口径不一、图件缺失的问题；\n' +
        '3. 创新点：按「项目全生命周期」编排，设计图与竣工验收文件对照收录，并为每个项目编制一张工程要素卡片。',
      content: '1. 项目内容：完成 4,200 余卷项目档案的普查与筛选，选录代表性项目 120 个，' +
        '转录立项批复、设计要点与验收结论，编制工程要素卡片与图件目录；难点是早期图件著录不全，需逐件核对；\n' +
        '2. 项目目标：2026 年 6 月完成普查与选目，2026 年 10 月完成转录与编排，2026 年 12 月完成初稿并送审；' +
        '成稿不少于 40 万字、收录图件不少于 300 幅。',
      plan: '1. 工作思路：先建项目台账，再按项目逐个配齐「批复—设计—施工—验收」四类文件；\n' +
        '2. 工作计划：分普查建账、选目转录、编排成稿三个阶段推进，每阶段出阶段稿并交编研部门评议；\n' +
        '3. 工作方法：档案原文与编者文字分离；图件统一著录工程名称、桩号与绘制年份；涉改原文一律附校勘记。',
      guarantee: '1. 前期保障：已完成基建类全宗的摸底清点，形成项目台账 1,260 条，并试编了 10 个项目的工程要素卡片；\n' +
        '2. 人才保障：团队负责人主持完成过基建类编研成果，熟悉工程档案与图件识读；成员含档案学与土木工程背景各 1 人，可互相校核；\n' +
        '3. 硬件保障：配备大幅面扫描仪 1 台、A0 图件翻拍架 1 套与专业工作站 3 台，工程图件可原尺寸数字化。'
    },
    {
      name: '城市变迁影像档案专题汇编',
      basis: '照片档案 1.8 万张，时间跨度 1949—2020 年，覆盖主要街区与地标，可支撑图版式成果。',
      support: '强',
      background: '1. 立项依据：城市更新过程中街区影像的查证需求明显上升（规划、文旅、媒体都来查），' +
        '而照片档案尚无公开可检索的专题成果；\n' +
        '2. 背景介绍：馆藏照片档案 1.8 万张，时间跨度 1949—2020 年，覆盖主要街区、地标与重大活动；' +
        '目前只有按卷目录，缺少地名与年代索引，利用效率低；\n' +
        '3. 创新点：以「同一地点、不同年代」的对照方式编排，形成可检索的影像时间轴。',
      content: '1. 项目内容：完成 1.8 万张照片的清理与著录，选出 1,200 张编入汇编，' +
        '建立地名、年代、拍摄者三项索引；难点是部分底片无拍摄信息，需结合报刊与口述核实；\n' +
        '2. 项目目标：2026 年 5 月完成清理著录，2026 年 9 月完成选片与考订，2026 年 11 月完成编排并提交审核；' +
        '收录照片不少于 1,200 张、对照图组不少于 120 组。',
      plan: '1. 工作思路：先建「地点—年代」二维索引，再按街区成组选片，最后统一撰写出图说明；\n' +
        '2. 工作计划：分清理著录、选片考订、编排成稿三个阶段，每阶段留一份问题清单交编研部门确认；\n' +
        '3. 工作方法：照片说明区分「档案原始著录」与「编者考订」，存疑的一律加注；重要街区附位置示意图。',
      guarantee: '1. 前期保障：已完成照片档案的清理与去重，摸清 1.8 万张底片的保存状况，并试编了 2 个街区的对照图组；\n' +
        '2. 人才保障：团队负责人有影像类编研成果出版经验，成员中 1 人熟悉老照片考订、1 人负责图版与版式；\n' +
        '3. 硬件保障：配备专业底片扫描仪 1 台、色彩校样显示器 2 台，具备影像修复与色彩管理条件。'
    },
    {
      name: '本市非物质文化遗产档案选编',
      basis: '非遗专题档案 620 卷，门类较全，但 2000 年以前材料偏少，需补充口述采集。',
      support: '中',
      background: '1. 立项依据：非遗项目传承人年事渐高，相关档案急需系统整理与汇编，文化主管部门已有明确需求；\n' +
        '2. 背景介绍：非遗专题档案 620 卷，门类较全（传统技艺、民俗、曲艺等），' +
        '但 2000 年以前材料偏少，部分项目只有名录、没有过程记录；\n' +
        '3. 创新点：档案记载与口述采集互补，为每个项目建立「名录—过程—传承人」三段式档案链。',
      content: '1. 项目内容：梳理 620 卷非遗档案，选录代表性项目 36 个，补采传承人口述 20 人次，' +
        '编制项目一览与传承谱系；难点是早期材料不足，需靠口述与实物照片补齐；\n' +
        '2. 项目目标：2026 年 7 月完成档案梳理与选目，2026 年 10 月完成口述采集与考订，2026 年 12 月完成初稿；' +
        '每个项目不少于 3,000 字并附档案原件影印件。',
      plan: '1. 工作思路：以项目为单元，先补档案、再采口述、最后统一体例成稿；\n' +
        '2. 工作计划：分档案梳理、口述采集、编排成稿三个阶段；口述采集需与文化主管部门联合组织；\n' +
        '3. 工作方法：档案记载与口述内容分栏排印，口述部分标注采集时间、地点与访谈人；存疑之处加注而不改写。',
      guarantee: '1. 前期保障：已完成非遗专题档案的项目级归类，形成 36 个项目的档案清单，并与文化主管部门初步对接；\n' +
        '2. 人才保障：团队负责人参与过口述史采集项目，成员中有 1 人熟悉民俗与方言，可承担访谈与整理；\n' +
        '3. 硬件保障：配备便携录音设备 2 套、摄像机 1 台与降噪工作站 1 台，满足口述采集与音视频整理需要。'
    },
    {
      name: '民生保障政策沿革史料汇编',
      basis: '劳动、民政、社保三个全宗的政策文件 2,300 余件，可按年代与事项双线编排。',
      support: '中',
      background: '1. 立项依据：劳动、民政、社保政策的沿革查询频繁（信访答复、政策研究、编史修志），' +
        '现有检索只能按文号，按事项查很困难；\n' +
        '2. 背景介绍：三个全宗的政策文件 2,300 余件，时间连续但散见各处，' +
        '同类事项前后多次修订，缺少沿革对照；\n' +
        '3. 创新点：按「事项」而非「文号」编排，同一事项的历次修订纵向排列，形成政策沿革链。',
      content: '1. 项目内容：普查三类政策文件 2,300 余件，按 60 个民生事项归集，' +
        '梳理每一事项的修订沿革，编制废止与替代对照表；难点是早期文件的废止依据不全，需逐件核实；\n' +
        '2. 项目目标：2026 年 6 月完成普查与事项归类，2026 年 9 月完成沿革梳理，2026 年 12 月完成初稿；' +
        '覆盖事项不少于 60 个，每次修订均标注依据文号。',
      plan: '1. 工作思路：先立事项清单，再按事项抽取历次文件，最后做沿革对照；\n' +
        '2. 工作计划：分普查归类、沿革梳理、编排成稿三个阶段，沿革表先交业务处室核对再定稿；\n' +
        '3. 工作方法：现行有效文件与已废止文件分栏标注；只作沿革陈述，不作政策评价。',
      guarantee: '1. 前期保障：已完成三个全宗的文号列表，梳理出 60 个民生事项的初步框架，并与业务处室确认了核对口径；\n' +
        '2. 人才保障：团队负责人长期从事政策类档案编研，成员含 1 名熟悉社保业务的人员，便于沿革逐条核对；\n' +
        '3. 硬件保障：配备高速扫描仪 1 台与政策文本 OCR 工具，可批量完成 2,300 余件文件的转录与比对。'
    },
    {
      name: '本市对外交往大事记（1978—2020）',
      basis: '外事档案 480 卷，部分年度存在缺档，需先做馆藏完整性核查。',
      support: '弱',
      background: '1. 立项依据：对外交往档案是研究地方开放历程的基础材料，外事部门与高校均有整理需求；\n' +
        '2. 背景介绍：外事档案 480 卷，部分年度存在缺档（1990 年前后尤甚），' +
        '需先做馆藏完整性核查，再确定收录边界；\n' +
        '3. 创新点：以大事记体例串联出访、来访与友城缔结三条线，条末统一注明档号，可核对、可追溯。',
      content: '1. 项目内容：核查 480 卷外事档案的年度完整性，按年月编录大事 1,500 条，' +
        '含出访、来访、友城缔结与国际会议；难点是缺档年度需以公开报道补证并注明来源；\n' +
        '2. 项目目标：2026 年 8 月完成完整性核查，2026 年 11 月完成条目编录，2026 年 12 月完成初稿；' +
        '补证条目须逐条标注「档案记载」或「公开报道」。',
      plan: '1. 工作思路：先核查缺档情况、划定收录边界，再按年月立条，最后统一编校；\n' +
        '2. 工作计划：分完整性核查、条目编录、编校成稿三个阶段；缺档年度先出一份缺口清单报编研部门；\n' +
        '3. 工作方法：一事一条、条末注明档号；同一事项有不同记载时并列收录并加注说明。',
      guarantee: '1. 前期保障：已完成外事档案的年度分布统计，摸清 480 卷中的缺档年度（1990 年前后），并提出补证思路；\n' +
        '2. 人才保障：团队负责人有大事记类编研成果经验，成员中 1 人熟悉公开报道检索与核实；\n' +
        '3. 硬件保障：配备报刊数据库检索终端 2 台与文档比对工作站 1 台，满足条目编录与考订需要。'
    }
  ];

  /* 选题列表：12 条演示数据，覆盖未开始 / 进行中 / 已完成三种状态。
     T-007 已发起立项审核，用于演示「审核中」不可重复提交。 */
  var TOPICS = [
    {
      id: 'T-001', name: '本市教育事业发展史料汇编', status: 'IN_PROGRESS',
      createdAt: '2026-03-12T09:20:00', createdBy: '王建国',
      team: '组长：王建国（编研利用科，档案学硕士，主持完成《抗战时期本地民众救助档案选编》，获省档案优秀成果二等奖）；成员：陈静（保管利用科，负责档案调阅与核对）、刘洋（负责成果校核与发布）。',
      budget: '120000', fundingSources: ['SELF'], subsidy: '',
      background: '1. 立项依据：本市教育事业自清末兴学至今缺乏系统性史料整理，教育类档案查阅需求逐年上升；\n2. 背景介绍：涉及教育全宗 3,600 余卷，已有零散校史资料，但存在时段断层、口径不一的问题；\n3. 创新点：首次按「学制变迁—学校沿革—教育人物」三条线索立体编排。',
      content: '1. 项目内容：梳理清末至 2020 年教育类档案，完成选材、转录、编排与辅文编写；\n2. 项目目标：2026 年 6 月完成选材，2026 年 10 月完成初稿，2026 年 12 月完成审核校定。',
      plan: '1. 工作思路：先做馆藏普查，再按大纲分章选材；\n2. 工作计划：分三个阶段推进，每阶段产出阶段稿；\n3. 工作方法：档案原文与编者文字分离，涉改原文一律附校勘记。',
      guarantee: '1. 前期保障：已完成教育全宗普查与大纲编写；\n2. 人才保障：团队具备档案编研成果出版经验；\n3. 硬件保障：配备高速扫描与 OCR 设备，工作站 3 台。',
      comment: '同意立项。（盖章）\n2026 年 3 月 15 日',
      review: { flowNo: 'LX-2026-0003', at: '2026-03-13T09:10:00', by: '王建国', status: 'APPROVED',
                reviewer: '李文华', reviewedAt: '2026-03-14T16:20:00', reviewedBy: '李文华', opinion: '材料齐备，同意立项。' },
      attachments: [
        { name: '教育全宗普查表.xlsx', size: 184320 },
        { name: '编研大纲（初稿）.docx', size: 96256 }
      ]
    },
    {
      id: 'T-002', name: '抗战时期本地民众救助档案选编', status: 'DONE',
      createdAt: '2025-11-05T14:05:00', createdBy: '李文华',
      team: '组长：李文华；成员：王建国、陈静。',
      budget: '80000', fundingSources: ['SELF', 'SUBSIDY'], subsidy: '30000',
      background: '1. 立项依据：抗战时期本地民众救助史料具有重要史料价值，尚未系统整理；\n2. 背景介绍：涉及民政、慈善团体档案 900 余卷；\n3. 创新点：结合报刊资料互证。',
      content: '1. 项目内容：选编救助类档案 260 件；\n2. 项目目标：2026 年 3 月完成出版。',
      plan: '1. 工作思路：档案原文为主，辅以考订；\n2. 工作计划：2025 年 12 月完成选材；\n3. 工作方法：三审三校。',
      guarantee: '1. 前期保障：已完成预研；\n2. 人才保障：具备民国档案识读能力；\n3. 硬件保障：高精度扫描仪 1 台。',
      comment: '同意立项。（盖章）\n2025 年 11 月 8 日',
      review: { flowNo: 'LX-2025-0001', at: '2025-11-06T10:00:00', by: '李文华', status: 'APPROVED',
                reviewer: '王建国', reviewedAt: '2025-11-07T15:30:00', reviewedBy: '王建国', opinion: '选题价值明确，同意立项。' },
      attachments: [{ name: '救助档案选编（终稿）.pdf', size: 5242880 }]
    },
    {
      id: 'T-003', name: '本市水利建设档案史料汇编', status: 'NOT_STARTED',
      createdAt: '2026-08-20T10:32:00', createdBy: '赵志远',
      team: '组长：赵志远（馆长，主持完成《本市行政区划沿革》等编研项目）；成员：陈静（保管利用科，负责水利全宗调阅与核对）、刘洋（负责图件整理与成果校核）。',
      budget: '90000', fundingSources: ['SELF', 'SUBSIDY'], subsidy: '30000',
      background: '1. 立项依据：本市河道治理、水库建设与防汛档案利用频繁，尚无系统的水利史料汇编；\n' +
        '2. 背景介绍：涉及水利、城建、民政等全宗约 2,400 卷，另有工程图件 300 余幅，年代跨 1950 至 2020 年；\n' +
        '3. 创新点：按「流域—工程—管理」三层编排，工程图件与批复文件对照收录。',
      content: '1. 项目内容：普查水利类档案，选录批复、设计与验收文件，完成转录、编排与辅文编写；\n' +
        '2. 项目目标：2026 年 11 月完成选材，2027 年 3 月完成初稿，2027 年 6 月完成审核校定。',
      plan: '1. 工作思路：先按流域建立工程台账，再逐项配齐批复与图件；\n' +
        '2. 工作计划：分普查建账、选材转录、编排成稿三个阶段推进；\n' +
        '3. 工作方法：档案原文与编者文字分离，图件统一著录工程名称、桩号与绘制年份。',
      guarantee: '1. 前期保障：已完成水利全宗普查，形成工程台账初稿；\n' +
        '2. 人才保障：团队熟悉水利类档案与工程图件识读；\n' +
        '3. 硬件保障：配备大幅面扫描设备 1 台、专业工作站 2 台。',
      comment: '',
      attachments: [
        { name: '水利全宗普查表.xlsx', size: 156672 },
        { name: '工程台账（初稿）.xlsx', size: 84224 }
      ],
      review: null
    },
    {
      id: 'T-004', name: '交通事业发展大事记', status: 'IN_PROGRESS',
      createdAt: '2026-05-18T16:40:00', createdBy: '王建国',
      team: '组长：王建国；成员：刘洋。',
      budget: '60000', fundingSources: ['SELF'], subsidy: '',
      background: '1. 立项依据：交通类档案利用需求集中在城建与规划部门；\n2. 背景介绍：涉及交通全宗 2,100 卷；\n3. 创新点：以大事记体例串联线路与枢纽建设。',
      content: '1. 项目内容：编纂 1949—2025 年交通大事记；\n2. 项目目标：2026 年 9 月成形。',
      plan: '1. 工作思路：按年度立条；\n2. 工作计划：先建条目库再成文；\n3. 工作方法：区分档案依据与编者补述。',
      guarantee: '1. 前期保障：条目库完成 60%；\n2. 人才保障：熟悉交通口档案；\n3. 硬件保障：现有设备可满足。',
      comment: '',
      attachments: [],
      review: { flowNo: 'LX-2026-0004', at: '2026-05-19T10:30:00', by: '王建国', status: 'REJECTED',
                reviewer: '李文华', reviewedAt: '2026-05-21T09:40:00', reviewedBy: '李文华', opinion: '经费预算需细化，请补充年度用款计划后重新提交。' }
    },
    {
      id: 'T-005', name: '本市行政区划沿革（1949—2025）', status: 'IN_PROGRESS',
      createdAt: '2026-02-09T11:15:00', createdBy: '陈静',
      team: '组长：陈静；成员：李文华。',
      budget: '45000', fundingSources: ['SELF'], subsidy: '',
      background: '1. 立项依据：区划调整频繁，需一份权威沿革资料；\n2. 背景介绍：涉及民政、测绘档案 1,200 卷；\n3. 创新点：附区划调整示意图。',
      content: '1. 项目内容：梳理县级及以上区划调整；\n2. 项目目标：2026 年 8 月完成。',
      plan: '1. 工作思路：以政府批复文件为准；\n2. 工作计划：先做年表再做图；\n3. 工作方法：逐条标注文号与日期。',
      guarantee: '1. 前期保障：年表已完成；\n2. 人才保障：具备地图编制协作资源；\n3. 硬件保障：绘图软件已配置。',
      comment: '同意立项。（盖章）\n2026 年 2 月 12 日',
      attachments: [
        { name: '区划变更年表（1949—2025）.xlsx', size: 143360 },
        { name: '区划调整示意图（草）.pdf', size: 2359296 }
      ],
      review: null
    },
    {
      id: 'T-006', name: '民国时期本地商会档案专题概要', status: 'NOT_STARTED',
      createdAt: '2026-09-01T09:05:00', createdBy: '刘洋',
      team: '组长：刘洋。',
      budget: '30000', fundingSources: ['SUBSIDY'], subsidy: '20000',
      background: '1. 立项依据：商会档案是研究本地近代经济的重要史料；\n2. 背景介绍：涉及商会全宗 380 卷；\n3. 创新点：按行业分会分述。',
      content: '', plan: '', guarantee: '', comment: '',
      attachments: [],
      review: null
    },
    {
      id: 'T-007', name: '本市抗洪救灾咨政报告汇编', status: 'NOT_STARTED',
      createdAt: '2026-09-05T15:48:00', createdBy: '赵志远',
      team: '组长：赵志远；成员：王建国、陈静、刘洋。',
      budget: '50000', fundingSources: ['SELF'], subsidy: '',
      background: '1. 立项依据：为防汛决策提供历史依据，服务当前中心工作；\n2. 背景介绍：涉及水利、民政、应急档案 1,500 余卷；\n3. 创新点：以咨政报告体例提炼历史经验。',
      content: '1. 项目内容：形成咨政报告 6—8 篇；\n2. 项目目标：2026 年 11 月前完成报送。',
      plan: '1. 工作思路：历史灾害—处置措施—经验启示三段式；\n2. 工作计划：先出专题报告再汇编；\n3. 工作方法：档案实证与数据分析结合。',
      guarantee: '1. 前期保障：已完成灾害年表；\n2. 人才保障：团队具备咨政报告撰写经验；\n3. 硬件保障：现有设备可满足。',
      comment: '',
      attachments: [{ name: '历年洪涝灾害年表.xlsx', size: 215040 }],
      review: { flowNo: 'LX-2026-0005', at: '2026-09-06T09:30:00', by: '赵志远', status: 'REVIEWING',
                reviewer: '李文华' }
    },
    {
      id: 'T-008', name: '城市记忆：老照片展览展示方案', status: 'DONE',
      createdAt: '2025-09-22T13:20:00', createdBy: '陈静',
      team: '组长：陈静；成员：刘洋。',
      budget: '150000', fundingSources: ['SELF', 'SUBSIDY'], subsidy: '60000',
      background: '1. 立项依据：配合城市建成纪念活动；\n2. 背景介绍：照片档案 1.8 万张；\n3. 创新点：线上线下同步展陈。',
      content: '1. 项目内容：遴选照片 300 张并配说明；\n2. 项目目标：2025 年 12 月开展。',
      plan: '1. 工作思路：按年代分五个单元；\n2. 工作计划：两个月完成布展；\n3. 工作方法：档案照片与口述互证。',
      guarantee: '1. 前期保障：已完成照片数字化；\n2. 人才保障：具备展陈设计协作方；\n3. 硬件保障：展厅与展柜已落实。',
      comment: '同意立项。（盖章）\n2025 年 9 月 25 日',
      attachments: [],
      review: null
    },
    {
      id: 'T-009', name: '本市工业遗产档案知识图谱建设', status: 'NOT_STARTED',
      createdAt: '2026-08-28T10:10:00', createdBy: '李文华',
      team: '', budget: '', fundingSources: [], subsidy: '',
      background: '', content: '', plan: '', guarantee: '', comment: '',
      attachments: [],
      review: null
    },
    {
      id: 'T-010', name: '本市教育年鉴（2020—2025）', status: 'IN_PROGRESS',
      createdAt: '2026-06-11T09:00:00', createdBy: '王建国',
      team: '组长：王建国；成员：陈静。',
      budget: '90000', fundingSources: ['SELF'], subsidy: '',
      background: '1. 立项依据：教育年鉴需按年续编；\n2. 背景介绍：历年教育统计与总结材料齐全；\n3. 创新点：关键指标附数据表。',
      content: '1. 项目内容：编纂六个年度的教育年鉴；\n2. 项目目标：2026 年 12 月交付。',
      plan: '1. 工作思路：先体例后内容；\n2. 工作计划：每年一册；\n3. 工作方法：数据以正式统计报表为准。',
      guarantee: '1. 前期保障：数据已收集；\n2. 人才保障：有年鉴编纂经验；\n3. 硬件保障：排版设备齐备。',
      comment: '',
      attachments: [],
      review: null
    },
    {
      id: 'T-011', name: '本地名人文书档案选编', status: 'DONE',
      createdAt: '2025-12-15T14:30:00', createdBy: '刘洋',
      team: '组长：刘洋；成员：李文华。',
      budget: '70000', fundingSources: ['SELF'], subsidy: '',
      background: '1. 立项依据：名人档案利用率高；\n2. 背景介绍：涉及个人文书档案 260 卷；\n3. 创新点：附人物小传与年表。',
      content: '1. 项目内容：选编文书 180 件；\n2. 项目目标：2026 年 5 月完成。',
      plan: '1. 工作思路：一人一辑；\n2. 工作计划：先整理后选编；\n3. 工作方法：释文与原件对照。',
      guarantee: '1. 前期保障：已完成整理；\n2. 人才保障：具备手稿识读能力；\n3. 硬件保障：现有设备可满足。',
      comment: '同意立项。（盖章）\n2025 年 12 月 18 日',
      attachments: [],
      review: null
    },
    {
      id: 'T-012', name: '乡村振兴档案史料汇编', status: 'NOT_STARTED',
      createdAt: '2026-09-10T08:50:00', createdBy: '赵志远',
      team: '组长：赵志远。',
      budget: '', fundingSources: [], subsidy: '',
      background: '1. 立项依据：服务乡村振兴中心工作；\n2. 背景介绍：涉农档案分布在全宗多个门类，需先做专题目录；\n3. 创新点：按产业、生态、文化、治理四类编排。',
      content: '', plan: '', guarantee: '', comment: '',
      attachments: [],
      review: null
    }
  ];

  /* ======================================================================
     工作台数据
     ====================================================================== */

  /* 编研类型：11 类，按业务口径（与《功能模块设计》确认的类型清单一致）。
     两张类型统计图共用同一套颜色 —— 同一类型在不同图中颜色一致，
     否则读者需要在两图之间反复对照，是最常见的图表误用。
     11 类已超出饼图 5–6 类的可读性上限（最小的两类仅占 3%，只剩细条），
     故这两张图改用横向排序条形图，排序约定：
       · 两张图行序一致（同一行 = 同一类型），可横向对照
       · 条内直接给出「数量 + 占比」文本，不依赖颜色即可读数

     配色：当前**不使用** TYPE_COLORS，两张类型图与「任务进度分布」图一样
     统一用主题强调色（见 pages/workbench.js 调用 bars() 时的 mono: true）——
     11 类各给一色仍显花哨，类型靠行标签区分已经足够。
     下面这套冷色调色板保留备用：想恢复“一类型一色”，把 mono: true 去掉即可。 */
  var TYPE_COLORS = {
    '档案文献汇编': '#1e3a8a',
    '档案文献选编': '#60a5fa',
    '大事记': '#1d4ed8',
    '组织沿革': '#38bdf8',
    '年鉴年谱': '#0369a1',
    '专题概要': '#22d3ee',
    '咨政报告': '#155e75',
    '史志成果': '#2dd4bf',
    '论著文章': '#0f766e',
    '知识图谱': '#4ade80',
    '展览展示': '#166534'
  };

  var STATUS_COLORS = {
    '未开始': '#94a3b8',
    '进行中': '#0369a1',
    '已完成': '#15803d'
  };

  var WORKBENCH = {
    /* 统计口径截止时间 */
    updatedAt: minsAgo(6),

    /* ① 五项核心指标 —— 对应设计文档第 7 条
       注意：本期卡片只显示「图标 + 名称 + 数值」。
       下面的 delta（环比）与 note（口径备注）字段**保留但不再渲染**，
       后续若要恢复，在 pages/workbench.js 的 statCard() 里加回两行即可。 */
    stats: [
      {
        key: 'topics', label: '选题数量', icon: 'lightbulb',
        /* 实际渲染时由 pages/workbench.js 覆盖为选题库实时条数 */
        value: '12', unit: '个',
        delta: { text: '+4', unit: '本月', dir: 'up', tone: 'good' },
        note: '未开始待提交审核 4 个'
      },
      {
        key: 'tasks', label: '编研任务数量', icon: 'clipboard-list',
        value: '32', unit: '个',
        delta: { text: '+5', unit: '本月', dir: 'up', tone: 'good' },
        note: '进行中 14 个'
      },
      {
        key: 'words', label: '编研总字数', icon: 'file-text',
        value: App.util.fmtWan(3864200), unit: '万字',
        delta: { text: '+12.6%', unit: '环比', dir: 'up', tone: 'good' },
        note: '全部任务累计'
      },
      {
        key: 'products', label: '编研成果数量', icon: 'book-open',
        value: '24', unit: '部',
        delta: { text: '+3', unit: '本月', dir: 'up', tone: 'good' },
        note: '已发布 18 部'
      },
      {
        key: 'tokens', label: '模型 Token 消耗', icon: 'activity',
        value: App.util.fmtWan(12846500), unit: '万',
        delta: { text: '-8.3%', unit: '环比', dir: 'down', tone: 'good' },
        note: 'AI 辅助能力累计调用'
      }
    ],

    /* ② 编研类型统计 —— 编研任务数量（合计 32，等于指标卡的「编研任务数量」） */
    chartTaskType: [
      { label: '档案文献汇编', value: 7, color: TYPE_COLORS['档案文献汇编'] },
      { label: '档案文献选编', value: 5, color: TYPE_COLORS['档案文献选编'] },
      { label: '大事记', value: 4, color: TYPE_COLORS['大事记'] },
      { label: '组织沿革', value: 3, color: TYPE_COLORS['组织沿革'] },
      { label: '专题概要', value: 3, color: TYPE_COLORS['专题概要'] },
      { label: '年鉴年谱', value: 2, color: TYPE_COLORS['年鉴年谱'] },
      { label: '咨政报告', value: 2, color: TYPE_COLORS['咨政报告'] },
      { label: '史志成果', value: 2, color: TYPE_COLORS['史志成果'] },
      { label: '论著文章', value: 2, color: TYPE_COLORS['论著文章'] },
      { label: '知识图谱', value: 1, color: TYPE_COLORS['知识图谱'] },
      { label: '展览展示', value: 1, color: TYPE_COLORS['展览展示'] }
    ],

    /* ③ 编研类型统计 —— 编研成果数量（合计 24，等于指标卡的「编研成果数量」）
       注意：顺序**刻意与②保持一致**（按任务数量降序）。
       两张图并排展示同一批类型，行序一致时读者可以“横着看”同一类型的两个数值；
       若各自按自身数值排序，同一类型会落在不同行，颜色相同也要来回找。
       该顺序下本图数值仍是非递增的（4 3 3 2 2 2 2 2 2 1 1），不影响条形图的排序观感。 */
    chartProductType: [
      { label: '档案文献汇编', value: 4, color: TYPE_COLORS['档案文献汇编'] },
      { label: '档案文献选编', value: 3, color: TYPE_COLORS['档案文献选编'] },
      { label: '大事记', value: 3, color: TYPE_COLORS['大事记'] },
      { label: '组织沿革', value: 2, color: TYPE_COLORS['组织沿革'] },
      { label: '专题概要', value: 2, color: TYPE_COLORS['专题概要'] },
      { label: '年鉴年谱', value: 2, color: TYPE_COLORS['年鉴年谱'] },
      { label: '咨政报告', value: 2, color: TYPE_COLORS['咨政报告'] },
      { label: '史志成果', value: 2, color: TYPE_COLORS['史志成果'] },
      { label: '论著文章', value: 2, color: TYPE_COLORS['论著文章'] },
      { label: '知识图谱', value: 1, color: TYPE_COLORS['知识图谱'] },
      { label: '展览展示', value: 1, color: TYPE_COLORS['展览展示'] }
    ],

    /* ④ 编研状态统计 —— 编研任务数量（合计 32） */
    chartTaskStatus: [
      { label: '未开始', value: 9, color: STATUS_COLORS['未开始'] },
      { label: '进行中', value: 14, color: STATUS_COLORS['进行中'] },
      { label: '已完成', value: 9, color: STATUS_COLORS['已完成'] }
    ],

    /* ⑤ 任务进度分布：六阶段（文档「编研任务卡片」定义的进度口径）
       合计 14，等于「进行中」的任务数 */
    stageDistribution: [
      { label: '生成大纲', value: 4 },
      { label: '确定选材', value: 4 },
      { label: '加工编排', value: 3 },
      { label: '辅文编写', value: 1 },
      { label: '审核校定', value: 1 },
      { label: '成果发布', value: 1 }
    ],

    /* ⑥ 我的待办：点击跳转到对应模块 */
    todos: [
      { icon: 'file-check', title: '待我审核的编研成果', meta: '编研成果审核校定流程', count: 2, route: '#/review' },
      { icon: 'lightbulb', title: '未开始的选题待提交立项审核', meta: '选题立项', count: 4, route: '#/topic' },
      { icon: 'clipboard-list', title: '我负责的编研任务待推进', meta: '编研任务', count: 6, route: '#/task' },
      { icon: 'archive', title: '归档材料待补充', meta: '材料归档', count: 1, route: '#/archive' }
    ],

    /* ⑦ 最近动态 */
    activities: [
      { actor: '王建国', action: '提交成果审核', target: '《本市教育事业发展史料汇编》', at: minsAgo(12) },
      { actor: '李文华', action: '审核通过', target: '《抗战时期本地民众救助档案选编》', at: minsAgo(48) },
      { actor: 'AI 助手', action: '生成大纲 23 个节点', target: '《交通事业发展大事记》', at: minsAgo(126), ai: true },
      { actor: '赵志远', action: '新增选题', target: '《水利建设档案史料汇编》', at: minsAgo(195) },
      { actor: '陈静', action: '加入素材库 18 件', target: '教育 · 民国时期', at: minsAgo(1510) },
      { actor: '王建国', action: '发布成果', target: '《本市教育事业发展史料汇编》PDF', at: minsAgo(1620) },
      { actor: '刘洋', action: '归档材料 6 件', target: '《水利工程档案资料汇编》', at: minsAgo(2880) }
    ]
  };

  /* ======================================================================
     导航结构 —— 与《档案辅助编研系统功能模块设计》一级/二级模块一致
     placeholder: 该模块原型尚未生成，先给出规划说明页
     ====================================================================== */

  var NAV = [
    { id: 'workbench', label: '工作台', icon: 'dashboard', route: '#/workbench' },
    { id: 'topic', label: '选题立项', icon: 'lightbulb', route: '#/topic' },
    {
      /* 有二级菜单的一级菜单只作分组：点击只展开/折叠，不跳转、不单独成页 */
      id: 'material', label: '编研素材库', icon: 'library',
      children: [
        { id: 'material-tags', label: '标签管理', icon: 'tag', route: '#/material/tags' },
        { id: 'material-search', label: '查找素材', icon: 'search', route: '#/material/search' },
        { id: 'material-list', label: '素材管理', icon: 'layers', route: '#/material/list' }
      ]
    },
    { id: 'task', label: '编研任务', icon: 'clipboard-list', route: '#/task' },
    { id: 'review', label: '流程审核', icon: 'file-check', route: '#/review' },
    { id: 'product', label: '编研成果', icon: 'book-open', route: '#/product' },
    { id: 'archive', label: '材料归档', icon: 'archive', route: '#/archive' },
    {
      id: 'system', label: '系统管理', icon: 'settings',
      children: [
        { id: 'system-users', label: '用户管理', icon: 'users', route: '#/system/users' },
        { id: 'system-flow', label: '流程配置', icon: 'workflow', route: '#/system/flow' },
        { id: 'system-archive', label: '归档设置', icon: 'list-checks', route: '#/system/archive' },
        /* 评审要求：审核规则放在归档设置模块下（数据对齐参照系统"敏感内容管理"） */
        { id: 'system-audit-rules', label: '审核规则', icon: 'shield-check', route: '#/system/audit-rules' },
        { id: 'system-dict', label: '数据字典', icon: 'database', route: '#/system/dict' },
        /* 以下两项按评审要求排在「数据字典」之后，原型先不实现（走规划说明页） */
        { id: 'system-log', label: '日志管理', icon: 'file-text', route: '#/system/log' },
        { id: 'system-backup', label: '备份恢复', icon: 'rotate-ccw', route: '#/system/backup' },
        { id: 'system-api', label: '接口维护', icon: 'plug', route: '#/system/api' },
        { id: 'system-param', label: '系统参数', icon: 'sliders', route: '#/system/params' }
      ]
    }
  ];

  /* ======================================================================
     数据字典（系统管理 · 数据字典）

     对应客户参考图：一条字典 = 名称 + 若干"字典值" + 元数据；
     每条字典值有 值 / 值名 / 描述三列（参考图里前两列填了同样的内容）。

     这里的几本字典正是「归档设置」里"字典类型"下拉的数据来源
     （材料类型 / 密级 / 保管期限 / 载体类型 / 文件格式），两处口径保持一致。
     ====================================================================== */

  function dict(id, name, meta, values) {
    return {
      id: id,
      name: name,
      meta: meta,
      items: values.map(function (v) {
        return { value: v, name: v, note: '' };
      })
    };
  }

  var DATA_DICTS = [
    dict('DD-001', '材料类型', '材料类型',
      ['立项材料', '编研大纲', '选材材料', '过程稿', '辅文', '审校记录', '成果文件', '归档材料']),
    dict('DD-002', '保管期限', '保管期限', ['永久', '长期', '10年', '30年']),
    dict('DD-003', '密级', '密级', ['公开', '内部', '秘密']),
    dict('DD-004', '载体类型', '载体类型', ['电子', '纸质']),
    dict('DD-005', '文件格式', '文件格式', ['PDF', 'OFD', 'HTML', 'DOCX', 'XLSX'])
  ];

  /* 「元数据」下拉：字典可挂到某个著录元数据上（与归档设置的元数据口径一致） */
  var DICT_META_OPTIONS = ['无', '材料类型', '保管期限', '密级', '载体类型', '文件格式'];

  /* ======================================================================
     流程配置 · 审核流程图

     对应「系统管理 · 流程配置」：一条审核流程分三个环节，每个环节单独配置审核人。
     环节名称由评审给定（编研部门领导审批 / 主管副馆长审批 / 馆长审批），
     界面按客户参考图实现：顶部三节点流程图 + 下方「添加审核人」与「已配置审核人」两栏。
     审核人**指定到人**（users 里选人）；参考图里的「形成/移交单位用户」按评审要求去掉了，
     因此不再有"用户类型"这一概念。
     ====================================================================== */

  var FLOW_STEPS = [
    {
      key: 'dept', name: '编研部门领导审批', icon: 'file-text',
      desc: '配置此环节允许审核的人员',
      reviewers: [
        { id: 'FR-1', userId: 'U-003', name: '李文华', roleLabel: '审核人员', dept: '编研利用科' },
        { id: 'FR-2', userId: 'U-004', name: '陈静', roleLabel: '档案收集人员', dept: '保管利用科' }
      ]
    },
    { key: 'deputy', name: '主管副馆长审批', icon: 'file-check', desc: '配置此环节允许审核的人员',
      reviewers: [
        { id: 'FR-3', userId: 'U-006', name: '孙丽', roleLabel: '主管副馆长', dept: '馆领导' }
      ] },
    { key: 'chief', name: '馆长审批', icon: 'check-circle', desc: '配置此环节允许审核的人员',
      reviewers: [
        { id: 'FR-4', userId: 'U-001', name: '赵志远', roleLabel: '馆长', dept: '馆领导' }
      ] }
  ];

  /* ======================================================================
     材料归档数据
     —— 两部分：
        ① ARCHIVE_FIELDS：归档字段字典 + 默认显示与否。设计文档说
           「材料归档的列表字段根据归档设置模块中的设置显示」，所以字段是**配置**，
           材料归档只按启用字段渲染列；「归档设置」模块将来只改这份配置。
        ② ARCHIVE_ITEMS：各编研任务的归档材料（按任务的阶段与团队生成，
           不逐个手写；成果文件的密级与格式取自该任务的成果）
     ====================================================================== */

  var ARCHIVE_FIELDS = [
    /* 归档字段字典：字段可增删改，字段元数据参照客户界面的列
       （名称 / 提示语 / 类型 / 日期格式 / 总长度 / 小数长度），
       另加两个本系统需要的开关：required（录入时必填）、visible（是否在材料归档列表显示）。
       两者都只影响"录入/显示"，不影响能否删除字段本身。
       dateFormat 仅「日期」类型有意义，totalLength 仅「文本 / 数字」有意义，decimalLength 仅「数字」有意义。 */
    { key: 'name', name: '材料名称', hint: '如：编研大纲（含编写要点）', type: '文本', dateFormat: '', totalLength: 200, decimalLength: 0, required: true, visible: true },
    { key: 'category', name: '材料类型', hint: '立项材料 / 编研大纲 / 选材材料 / 过程稿 / 辅文 / 审校记录 / 成果文件 / 归档材料', type: '文本', dateFormat: '', totalLength: 30, decimalLength: 0, required: false, visible: true },
    { key: 'stage', name: '所属阶段', hint: '留空表示立项阶段', type: '文本', dateFormat: '', totalLength: 20, decimalLength: 0, required: false, visible: true },
    { key: 'format', name: '文件格式', hint: '如：PDF / DOCX / XLSX', type: '文本', dateFormat: '', totalLength: 30, decimalLength: 0, required: false, visible: true },
    { key: 'pages', name: '页数', hint: '', type: '数字', dateFormat: '', totalLength: 6, decimalLength: 0, required: false, visible: false },
    { key: 'copies', name: '份数', hint: '', type: '数字', dateFormat: '', totalLength: 4, decimalLength: 0, required: false, visible: false },
    { key: 'carrier', name: '载体类型', hint: '电子 / 纸质', type: '文本', dateFormat: '', totalLength: 10, decimalLength: 0, required: false, visible: false },
    { key: 'formedAt', name: '形成日期', hint: '', type: '日期', dateFormat: 'YYYY-MM-DD', totalLength: 10, decimalLength: 0, required: false, visible: true },
    { key: 'archivedAt', name: '归档日期', hint: '', type: '日期', dateFormat: 'YYYY-MM-DD', totalLength: 10, decimalLength: 0, required: false, visible: true },
    { key: 'archivist', name: '归档人', hint: '取编研任务的「材料归档人员」', type: '文本', dateFormat: '', totalLength: 20, decimalLength: 0, required: false, visible: true },
    { key: 'retention', name: '保管期限', hint: '永久 / 长期 / 定期', type: '文本', dateFormat: '', totalLength: 10, decimalLength: 0, required: false, visible: true },
    { key: 'security', name: '密级', hint: '公开 / 内部 / 秘密', type: '文本', dateFormat: '', totalLength: 10, decimalLength: 0, required: false, visible: true },
    { key: 'fileNo', name: '电子文件号', hint: '任务编号-阶段-序号', type: '文本', dateFormat: '', totalLength: 40, decimalLength: 0, required: false, visible: false },
    { key: 'note', name: '备注', hint: '', type: '文本', dateFormat: '', totalLength: 200, decimalLength: 0, required: false, visible: false }
  ];

  /* 字段类型与日期格式的可选项（新增/修改字段时的下拉） */
  var ARCHIVE_FIELD_TYPES = ['文本', '数字', '日期'];
  var ARCHIVE_DATE_FORMATS = ['YYYY', 'YYYY-MM', 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm'];


  /* 材料类型 → 标签样式（克制用色：只有成果/审校/立项做区分） */
  var ARCHIVE_CATEGORY_TAG = {
    '立项材料': 'tag-accent',
    '编研大纲': 'tag-accent',
    '选材材料': '',
    '过程稿': '',
    '辅文': '',
    '审校记录': 'tag-warn',
    '成果文件': 'tag-ok',
    '归档材料': ''
  };

  /* ======================================================================
     演示数据的完整性收尾

     设计约束（评审意见）：**每一部编研成果都必须来自某个编研任务**。
     而工作台的任务统计若继续写死，就会出现"成果 24 部、已完成任务只有 9 个"的矛盾
     （成果发布是第 6 阶段，成果必然意味着任务已完成）。
     因此这里按成果数据生成对应的**历史任务**，再补一批**在建任务**，
     让「任务数量 / 状态 / 进度分布 / 类型统计」都有真实来源。
     ====================================================================== */

  (function buildTasksFromProducts() {
    var who = ['王建国', '李文华', '陈静', '刘洋', '赵志远'];
    var roles = ['leader', 'collector', 'editor', 'publisher', 'promoter', 'archivist'];

    function team(seed) {
      var t = {};
      roles.forEach(function (r, i) { t[r] = who[(seed + i) % who.length]; });
      return t;
    }
    function history(startYear) {
      var out = [];
      /* 去掉「辅文编写」后只有 5 个阶段 */
      for (var i = 1; i <= 5; i++) {
        out.push({
          stage: i,
          at: new Date(Date.UTC(startYear, i - 1, 10 + (i % 3) * 4, 9, 30)).toISOString(),
          by: who[i % who.length]
        });
      }
      return out;
    }
    function yearOf(dateStr) { return parseInt(String(dateStr).slice(0, 4), 10); }

    /* ① 历史任务：21 部成果还没有来源任务，各生成一个已完成任务并回填 taskId */
    PRODUCTS.filter(function (p) { return !p.taskId; }).forEach(function (p, i) {
      var y = yearOf(p.publishedAt);
      var id = 'RW-' + (y - 1) + '-' + String(300 + i).padStart(3, '0');
      TASKS.push({
        id: id, type: p.type, topicId: null, topicName: p.title,
        status: 'DONE', paused: false, stage: 5,
        planStart: (y - 1) + '-03-01', planEnd: y + '-06-30',
        team: team(i),
        note: '历史任务：成果《' + p.title + '》的编研过程记录（选题档案已归档）。',
        createdAt: (y - 1) + '-02-20T09:00:00', createdBy: who[i % who.length],
        finishedAt: p.publishedAt + 'T16:00:00',
        stageHistory: history(y - 1)
      });
      p.taskId = id;
    });

    /* ①-b 多卷本成果：**允许多部成果关联同一编研任务**（评审要求）。
       用一部两卷本做示例：两卷各自是一部成果，来源任务同一个，任务名取系列名而不是某一卷。 */
    [
      { id: 'CP-025', fromTaskOf: 'CP-001', taskName: '本市工业遗产档案汇编（全二卷）',
        title: '本市工业遗产档案汇编（二）', type: '档案文献汇编',
        compiledBy: '市档案馆编研利用科', publishedAt: '2026-09-20', words: 396000,
        formats: ['PDF', 'OFD'], security: '公开',
        summary: '第二卷收录 1960—2000 年厂区建设与设备档案 180 件，与第一卷同体例。' }
    ].forEach(function (x) {
      var src = PRODUCTS.filter(function (p) { return p.id === x.fromTaskOf; })[0];
      if (!src || !src.taskId) return;
      var host = TASKS.filter(function (t) { return t.id === src.taskId; })[0];
      if (host && x.taskName) host.topicName = x.taskName;
      PRODUCTS.push({
        id: x.id, title: x.title, type: x.type, taskId: src.taskId,
        compiledBy: x.compiledBy, publishedAt: x.publishedAt, words: x.words,
        formats: x.formats, security: x.security, summary: x.summary
      });
    });

    /* ② 在建任务：让「任务进度分布」有足够样本（否则只有 3 个在建任务，图表几乎全空）。
       去掉「辅文编写」后按 5 个阶段分布：已有 3 个（第 2×2、第 4×1），
       这里补第 1×3、第 2×1、第 3×2、第 4×3、第 5×2 = 11 个。 */
    /* 阶段分布目标 3/3/2/2/2/2 = 14；类型按「让任务与成果两张图在同一行序下都单调不增」配平：
       已在建/未开始的任务占 汇编×2、大事记×1、组织沿革×1，
       这里再补 汇编×2、选编×2、专题概要×1、年鉴年谱×1、咨政报告×1、史志成果×1、论著文章×1、知识图谱×1、展览展示×1。 */
    var plan = [
      { stage: 1, types: ['档案文献汇编', '档案文献汇编', '档案文献选编'] },
      { stage: 2, types: ['专题概要'] },
      { stage: 3, types: ['年鉴年谱', '档案文献选编'] },
      { stage: 4, types: ['咨政报告', '史志成果', '论著文章'] },
      { stage: 5, types: ['知识图谱', '展览展示'] }
    ];
    var names = [
      '本市教育年鉴（2026）', '城市更新档案史料汇编', '本市非物质文化遗产档案选编',
      /* 乡村振兴放在第 4 阶段那一组（与 names[6] 换位）：它是「审核校定」的演示任务，
         要停在**第 4 阶段·审核校定**，方便一进去就能跑三类审核；换位不改变各阶段的任务数量 */
      '本市卫生防疫档案选编', '本市工业遗产档案知识图谱（二期）', '城区水系变迁史料汇编',
      '乡村振兴档案史料汇编（续编）', '老字号企业档案史料汇编', '本市交通运输大事记（2001—2025）',
      '社区治理档案专题概要', '本市人才政策档案选编'
    ];
    var k = 0;
    plan.forEach(function (g) {
      for (var i = 0; i < g.types.length; i++) {
        var stage = g.stage;
        var y = 2026;
        TASKS.push({
          id: 'RW-' + y + '-' + String(400 + k).padStart(3, '0'),
          type: g.types[i],
          topicId: null,
          topicName: names[k % names.length],
          status: 'IN_PROGRESS', paused: false, stage: stage,
          planStart: y + '-0' + (1 + (k % 8)) + '-05', planEnd: (y + 1) + '-06-30',
          team: team(k + 1),
          note: '在建任务（演示数据）：用于工作台的任务进度分布。',
          createdAt: y + '-0' + (1 + (k % 8)) + '-01T09:00:00', createdBy: who[k % who.length],
          stageHistory: history(y).filter(function (h) { return h.stage <= stage; })
        });
        k++;
      }
    });
    /* 「乡村振兴档案史料汇编（续编）」：第 4 阶段「审核校定」的演示任务 ——
       它的大纲与正文见 OUTLINES / COMPOSES，正文里**故意留了三类审核都能命中的问题**
       （政治性：审核规则命中的敏感表述；专业性：错别字/规范表述/民国纪年；合规性：模型识别的
         知识产权风险 + 个人隐私及个人信息 —— 已按评审要求去掉"不宜公开依托规则"那一支。原口径：
       身份证号手机号等个人信息 + 不宜公开内容），点「开始审核」就能看到问题。 */
    var xc = TASKS.filter(function (t) { return t.topicName === '乡村振兴档案史料汇编（续编）'; })[0];
    if (xc) {
      XC_TASK_ID = xc.id;
      xc.note = '第 3 阶段已完成初稿，现处于审核校定：初稿按「产业—生态—文化—治理」四类编排，' +
        '已按评审要求放入一批待校定的问题（政治性 / 专业性 / 合规性三类都有）。';
      xc.planStart = '2026-01-05';
      xc.planEnd = '2026-12-31';
      xc.createdAt = '2026-01-01T09:00:00';
      xc.createdBy = '王建国';
      xc.stageHistory = history(2026).filter(function (h) { return h.stage <= 4; });
    }
  })();

  /* ---- 归档材料：按任务生成（立项 3 件 + 已完成阶段各 2 件，成果阶段 3 件） ---- */
  var ARCHIVE_ITEM_TEMPLATES = [
    { stage: 0, name: '选题可行性评估表', category: '立项材料', format: 'PDF', pages: 6, carrier: '纸质', retention: '永久' },
    { stage: 0, name: '立项审核批复', category: '立项材料', format: 'PDF', pages: 2, carrier: '纸质', retention: '永久' },
    { stage: 0, name: '编研任务书（含团队分工）', category: '立项材料', format: 'DOCX', pages: 4, carrier: '电子', retention: '永久' },
    { stage: 1, name: '编研大纲（含编写要点）', category: '编研大纲', format: 'DOCX', pages: 18, carrier: '电子', retention: '永久' },
    { stage: 1, name: '大纲讨论记录', category: '编研大纲', format: 'DOCX', pages: 5, carrier: '电子', retention: '永久' },
    { stage: 2, name: '选材清单（含档号与出处）', category: '选材材料', format: 'XLSX', pages: 12, carrier: '电子', retention: '长期' },
    { stage: 2, name: '史料支撑情况说明', category: '选材材料', format: 'DOCX', pages: 8, carrier: '电子', retention: '长期' },
    { stage: 3, name: '编排稿（送审稿）', category: '过程稿', format: 'DOCX', pages: 320, carrier: '电子', retention: '定期' },
    { stage: 3, name: '原文校勘记', category: '过程稿', format: 'DOCX', pages: 26, carrier: '电子', retention: '永久' },
    /* 辅文相关的归档材料并入第 3 阶段（加工编排）之后不再单列，见 TASK_STAGES 说明 */
    { stage: 4, name: '审校记录（三审三校）', category: '审校记录', format: 'DOCX', pages: 36, carrier: '纸质', retention: '永久' },
    { stage: 4, name: '成果定稿', category: '过程稿', format: 'DOCX', pages: 340, carrier: '电子', retention: '永久' },
    { stage: 5, name: '成果正式文件', category: '成果文件', format: 'PDF', pages: 356, carrier: '电子', retention: '永久' },
    { stage: 5, name: '发布与推介材料', category: '成果文件', format: 'DOCX', pages: 12, carrier: '电子', retention: '长期' },
    { stage: 5, name: '归档说明（含元数据）', category: '归档材料', format: 'DOCX', pages: 6, carrier: '电子', retention: '永久' }
  ];

  var ARCHIVE_ITEMS = [];
  (function buildArchiveItems() {
    var seq = 0;
    TASKS.forEach(function (t) {
      var reach = t.status === 'DONE' ? 6 : (t.status === 'IN_PROGRESS' ? t.stage : -1);
      if (reach < 0) return;                     // 未开始的任务没有归档材料
      var product = PRODUCTS.filter(function (p) { return p.taskId === t.id; })[0];
      var archivist = (t.team && t.team.archivist) || t.createdBy;
      ARCHIVE_ITEM_TEMPLATES.filter(function (tpl) { return tpl.stage <= reach; })
        .forEach(function (tpl) {
          seq += 1;
          var hist = t.stageHistory.filter(function (h) { return h.stage === tpl.stage; })[0];
          var base = tpl.stage === 0 ? String(t.createdAt) : (hist ? hist.at : t.createdAt);
          var formed = String(base).slice(0, 10);
          var archived = new Date(new Date(base).getTime() + 2 * 86400000).toISOString().slice(0, 10);
          var isResult = tpl.category === '成果文件';
          ARCHIVE_ITEMS.push({
            id: 'AR-' + String(seq).padStart(4, '0'),
            taskId: t.id,
            taskTopic: t.topicName,
            name: tpl.name,
            category: tpl.category,
            stage: tpl.stage,
            stageLabel: tpl.stage === 0 ? '立项' : (TASK_STAGES[tpl.stage - 1] || {}).title || '',
            format: (isResult && product && product.formats) ? product.formats.join('+') : tpl.format,
            pages: tpl.pages,
            copies: tpl.carrier === '纸质' ? 2 : 1,
            carrier: tpl.carrier,
            formedAt: formed,
            archivedAt: archived,
            archivist: archivist,
            retention: tpl.retention,
            security: (isResult && product) ? product.security : (tpl.category === '过程稿' ? '内部' : '公开'),
            fileNo: t.id + '-' + String(tpl.stage) + String(ARCHIVE_ITEMS.length % 9 + 1),
            note: tpl.category === '审校记录' ? '含初审、复审、终审与三次校对记录' : ''
          });
        });
    });
  })();

  /* ======================================================================
     编研任务 · 第 1 阶段「生成大纲」的 AI 预置结果

     ⚠️ 这里没有任何真实模型调用：大纲由下面的骨架 + 提示词派生的写法拼出来，
        目的是让界面有真实感、演示可复现（界面上有「AI 预置结果」标注）。
        接真实模型时替换 buildOutline / regenerate 两个函数即可，页面不用改。

     层级：1 一级标题 / 2 二级标题 / 3 三级标题
     每个标题都必须带「主要内容说明」（note）—— 这是评审明确要求的输出。
     ====================================================================== */

  /* 大纲最多支持几级标题（评审要求：8 级） */
  var OUTLINE_MAX_LEVEL = 8;
  var OUTLINE_LEVEL_LABELS = ['一级标题', '二级标题', '三级标题', '四级标题',
    '五级标题', '六级标题', '七级标题', '八级标题'];

  var OUTLINE_SKELETON = [
    {
      level: 1, title: '编纂说明',
      note: '说明本汇编的编纂目的、收录范围、时间断限与编排体例，交代史料来源及利用注意事项。',
      kids: [
        { title: '编纂目的与意义', note: '阐述汇编对保存本市教育事业发展记忆、服务教育史研究与编史修志的作用。' },
        { title: '收录范围与时间断限', note: '界定收录的档案类型与起止年代，说明未予收录的部分及其原因。' },
        { title: '体例与编排说明', note: '说明按专题与时间双重顺序编排的规则、标题体例与文件标题的处理方式。' }
      ]
    },
    {
      level: 1, title: '教育事业发展概述',
      note: '综述本市教育事业在不同历史时期的发展脉络、阶段特征与主要成就。',
      kids: [
        { title: '清末民初的学堂与书院', note: '收录书院改学堂的章程、学堂设立与经费文书，反映新旧教育交替的过程。' },
        { title: '民国时期学校教育的推进', note: '按学制改革分段，反映小学、中学、师范教育的规模变化与办学状况。' },
        { title: '新中国成立以来的教育变革', note: '收录教育接管、院系调整、普及义务教育等阶段的档案，反映教育体系的重建与扩展。' }
      ]
    },
    {
      level: 1, title: '教育行政管理',
      note: '反映教育行政机构的设置沿革、经费保障与制度规章。',
      kids: [
        { title: '教育行政机构沿革', note: '收录机构设立、更名、撤并的批复与人员编制文书。' },
        { title: '教育经费与办学条件', note: '收录经费预算、校舍修建、设备购置等档案，反映办学条件的改善。' },
        {
          title: '教育规章与重要章程', note: '选录有代表性的教育规章、章程与实施办法。',
          kids: [
            { title: '学制与课程类章程', note: '收录学制、课程设置与考试制度方面的章程文本。' },
            { title: '教师管理类规定', note: '收录教师资格、任用、考核与待遇方面的规定。' }
          ]
        }
      ]
    },
    {
      level: 1, title: '各级各类教育',
      note: '分门类反映本市初等、中等、高等与职业教育的发展状况。',
      kids: [
        { title: '初等教育', note: '收录小学设置、学额、教学与扫盲运动的档案。' },
        { title: '中等教育', note: '收录中学与师范学校的设立、招生与毕业情况的档案。' },
        { title: '高等教育与职业教育', note: '收录高等学校、职业学校及各类培训机构的设置与发展档案。' }
      ]
    },
    {
      level: 1, title: '大事记与附录',
      note: '以编年形式列出重要教育事项，并附录统计资料与检索工具。',
      kids: [
        { title: '教育事业大事记', note: '按年月编排重大教育事项，条末注明出处。' },
        { title: '附录', note: '收录统计表、学校一览、人名索引与参考文献。' }
      ]
    }
  ];

  /* 「主要内容说明」的三种写法：初次生成按提示词挑一种，重新生成时依次轮换 */
  var OUTLINE_NOTE_TAILS = [
    '写作按「背景—事实—影响」三段展开，重要史料注明出处与档号。',
    '以时间为序编排；同一事项有不同记载时并列收录并加注说明。',
    '突出与本市直接相关的记载，兼收省级以上文件中涉及本市的内容。'
  ];

  /* 重新生成标题时的同义改写（命中即换，没命中就保持原题，只重写内容说明） */
  var OUTLINE_TITLE_SYNONYMS = [
    ['概述', '综述'], ['编纂说明', '编例说明'], ['沿革', '历史沿革'],
    ['大事记', '大事编年'], ['附录', '附录与索引'], ['史料', '档案史料'],
    ['初等教育', '小学教育'], ['中等教育', '中学教育']
  ];

  /** 这条内容说明当前用的是第几种写法（没带写法说明就返回 -1） */
  function outlineTailIndex(note) {
    for (var i = 0; i < OUTLINE_NOTE_TAILS.length; i++) {
      if (String(note || '').indexOf(OUTLINE_NOTE_TAILS[i]) >= 0) return i;
    }
    return -1;
  }

  /** 从选题名称推出「核心主题」：去掉汇编/史料/资料等收尾词 */
  function outlineCore(topicName) {
    var s = String(topicName || '').replace(/[（(].*?[)）]/g, '').trim();
    var tails = ['档案史料汇编', '史料汇编', '档案汇编', '资料汇编', '史料选编', '资料选辑',
      '汇编', '选编', '资料', '史料', '专题'];
    for (var i = 0; i < 3; i++) {
      var hit = tails.filter(function (x) { return s.length > x.length + 1 && s.slice(-x.length) === x; })[0];
      if (!hit) break;
      s = s.slice(0, -hit.length);
    }
    return s || String(topicName || '本专题');
  }

  function outlineHash(str) {
    var h = 0;
    for (var i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 9973;
    return h;
  }

  /** 骨架 → 扁平节点数组（层级用 level 表达，编号由界面按层级算） */
  function outlineFlatten() {
    var nodes = [], seq = 0;
    (function walk(list, level) {
      list.forEach(function (item) {
        seq += 1;
        nodes.push({ id: 'n' + seq, level: level, title: item.title, note: item.note, collapsed: false });
        if (item.kids) walk(item.kids, level + 1);
      });
    })(OUTLINE_SKELETON, 1);
    return nodes;
  }

  function outlineTally(nodes) {
    return [1, 2, 3].map(function (lv) {
      return nodes.filter(function (n) { return n.level === lv; }).length;
    });
  }

  /**
   * 生成整篇大纲
   * @returns {{nodes:Array, thinking:Array<string>}}
   */
  function buildOutline(task, prompt, ctx) {
    ctx = ctx || {};
    var topic = (task && task.topicName) || '本专题';
    var core = outlineCore(topic);
    var type = (task && task.type) || '档案文献汇编';
    var text = String(prompt || '').trim();
    /* 同一提示词反复生成时写法也要轮换，否则「重新生成」看起来什么都没变 */
    var variant = (outlineHash(text || topic) + (ctx.generation || 0)) % OUTLINE_NOTE_TAILS.length;
    var tail = OUTLINE_NOTE_TAILS[variant];

    var nodes = outlineFlatten().map(function (n) {
      var note = n.note;
      /* 第 2 章换成选题核心词，让大纲看起来是"为这个选题写的" */
      if (n.id === 'n5') n = Object.assign({}, n, { title: core + '概述' });
      /* 二级及以下：附上按提示词选定的写法说明 */
      if (n.level >= 2) note = n.note + ' ' + tail;
      return Object.assign({}, n, { note: note });
    });

    var tally = outlineTally(nodes);
    var hits = ctx.materials ? ctx.materials : 36;
    var thinking = [
      text
        ? '读取提示词：「' + (text.length > 42 ? text.slice(0, 42) + '…' : text) + '」（共 ' + text.length + ' 字）'
        : '未填写提示词，按选题名称与编研类型推断编纂意图',
      '解析编研意图：选题「' + topic + '」· 编研类型「' + type + '」',
      '检索馆藏目录与素材库：命中 ' + hits + ' 条候选素材（' + Math.max(4, Math.round(hits / 6)) + ' 个主题簇）',
      '确定内容边界：以「' + core + '」为主线，剔除与本专题无关的记载',
      '拟订章节层级：一级标题 ' + tally[0] + ' 个、二级标题 ' + tally[1] + ' 个、三级标题 ' + tally[2] + ' 个',
      '为每个标题生成主要内容说明（共 ' + nodes.length + ' 条），交回右侧编辑区'
    ];
    return { nodes: nodes, thinking: thinking, variant: variant };
  }

  /**
   * 重新生成某个标题（mode='node'）或它及其子标题（mode='sub'）
   * 规则（见 README 原型假设）：层级与编号不动，标题命中同义改写才换，
   * 内容说明按「第 K 稿」的写法轮换 —— 这样每次重新生成都看得见变化。
   */
  function regenerateOutlineNodes(rec, nodeId, mode, prompt) {
    var nodes = JSON.parse(JSON.stringify(rec.nodes));
    var idx = -1;
    nodes.forEach(function (n, i) { if (n.id === nodeId) idx = i; });
    if (idx < 0) return { nodes: nodes, thinking: rec.thinking || [], targets: 0 };

    var level = nodes[idx].level;
    var targets = [idx];
    if (mode === 'sub') {
      for (var i = idx + 1; i < nodes.length; i++) {
        if (nodes[i].level <= level) break;
        targets.push(i);
      }
    }

    var usedVariants = {};
    targets.forEach(function (i) {
      var n = nodes[i];
      /* 每条都换成"与它当前不同的下一种写法" ——
         否则重新生成可能正好轮回到原来的写法，用户点了看不出任何变化
         （种子大纲出来后才暴露：同一提示词生成的稿子本来就在同一个写法上）。 */
      var cur = outlineTailIndex(n.note);
      var k = cur < 0
        ? ((rec.regenSeq || 0) % OUTLINE_NOTE_TAILS.length)
        : (cur + 1) % OUTLINE_NOTE_TAILS.length;
      usedVariants[k] = true;
      var tail = OUTLINE_NOTE_TAILS[k];

      var swapped = n.title;
      OUTLINE_TITLE_SYNONYMS.forEach(function (pair) {
        if (n.title.indexOf(pair[0]) >= 0 && n.title.indexOf(pair[1]) < 0) {
          swapped = n.title.split(pair[0]).join(pair[1]);
        }
      });
      /* 去掉上一次留下的写法说明（以「写作/以时间/突出与」开头的整句），避免越堆越长 */
      var base = n.note.replace(/\s*(写作按「背景—事实—影响」三段展开[^。]*。|以时间为序编排[^。]*。|突出与本市直接相关的记载[^。]*。)\s*/g, ' ').trim();
      nodes[i] = Object.assign({}, n, { title: swapped, note: base + ' ' + tail });
    });

    var variantText = Object.keys(usedVariants).map(function (k) { return '第 ' + (+k + 1) + ' 种'; }).join('、');
    var t = nodes[idx];
    var titleChanged = targets.some(function (i) { return nodes[i].title !== rec.nodes[i].title; });
    var thinking = (rec.thinking || []).concat([
      '—— 重新生成 ——',
      '目标：' + (mode === 'sub'
        ? '第 ' + t.level + ' 级标题「' + t.title + '」及其 ' + (targets.length - 1) + ' 个子标题'
        : '标题「' + t.title + '」'),
      '读取补充提示词：「' + (String(prompt).length > 42 ? String(prompt).slice(0, 42) + '…' : prompt) + '」',
      '保持层级与编号不变，标题' + (titleChanged ? '按提示词做同义改写' : '措辞已稳定、保持不变') +
        '，内容说明重写为' + (variantText || '新的') + '写法（与原稿不同）',
      '已更新 ' + targets.length + ' 条标题的内容说明'
    ]);

    return { nodes: nodes, thinking: thinking, targets: targets.length,
      variant: Object.keys(usedVariants).map(Number)[0] };
  }

  /* ======================================================================
     补齐档案目录：素材库里的每一条素材都应当来自档案目录（系统前提）

     种子里 36 件素材的档号，只有 3 条能在 21 条目录样本里找到 ——
     「查看目录与文件」上线后，这个缺口会直接表现成"素材的目录全是未著录"。
     这里按素材补齐目录条目：题名 / 全宗 / 年度 直接取素材自身的字段，
     责任者按全宗沿用已有条目（或按全宗名推），页数按档号推导，其余给合理默认值。
     素材是"已经数字化并入库"的东西，所以补出来的条目 digitized 一律为 true。
     ====================================================================== */
  (function fillCatalogFromMaterials() {
    var AUTHOR_BY_FONDS = {};
    ARCHIVE_CATALOG.forEach(function (a) { if (!AUTHOR_BY_FONDS[a.fonds]) AUTHOR_BY_FONDS[a.fonds] = a.author; });
    /* 目录样本里没有的全宗，按主管单位补上 */
    var EXTRA_AUTHOR = {
      '交通全宗': '市交通局', '城建全宗': '市建设局',
      '个人全宗': '市档案馆', '照片全宗': '市档案馆'
    };
    var CATEGORY_BY_PREFIX = { ZP: '照片档案', KJ: '科技档案', CW: '会计档案' };

    MATERIALS.forEach(function (m) {
      var exists = ARCHIVE_CATALOG.some(function (a) { return a.archiveNo === m.archiveNo; });
      if (exists) return;
      var h = 0;
      for (var i = 0; i < m.archiveNo.length; i++) h = (h * 31 + m.archiveNo.charCodeAt(i)) % 9973;
      ARCHIVE_CATALOG.push({
        id: 'A-' + String(ARCHIVE_CATALOG.length + 1).padStart(3, '0'),
        archiveNo: m.archiveNo,
        title: m.title,
        fonds: m.fonds || '',
        category: CATEGORY_BY_PREFIX[String(m.archiveNo).split('-')[0]] || '文书档案',
        year: m.year || '',
        author: AUTHOR_BY_FONDS[m.fonds] || EXTRA_AUTHOR[m.fonds] || '市档案馆',
        retention: h % 5 === 0 ? '长期' : '永久',
        security: h % 11 === 0 ? '内部' : '公开',
        pages: 4 + (h % 24),
        digitized: true,
        summary: (m.fonds || '') + (m.year ? m.year + ' 年' : '') + '「' + m.title + '」相关文书',
        fullText: ''
      });
    });
  })();

  /* 素材的「备注」：已有的不动，没有的从对应档案目录的摘要带过来 ——
     素材本来就是从目录里挑出来的，摘要正好说明"这条素材是什么"，
     否则列表新增的备注列对 36 条种子数据全是空的。 */
  (function fillMaterialNotes() {
    var byNo = {};
    ARCHIVE_CATALOG.forEach(function (a) { byNo[a.archiveNo] = a; });
    MATERIALS.forEach(function (m) {
      var a = byNo[m.archiveNo];
      if (!m.note) m.note = a ? (a.summary || '') : '';
      /* 档案门类同理：素材取自档案目录，门类直接沿用目录里的 */
      if (!m.category) m.category = a ? a.category : '文书档案';
    });
  })();

  /* ======================================================================
     第 2 阶段「确定选材」的选材库

     一个任务一份选材库。一条选材 = 从素材库挑中的一份素材 + **选入范围**
     （整个文件，或其中某一页 / 某几页）—— 评审明确要求"可以整份加入，也可以只加入几页"。
     pageCount 是加入时的快照（取自档案目录著录的页数），用于展示"整份 N 页 / 第 x-y 页"。
     ====================================================================== */
  var SELECTIONS = {
    'RW-2026-001': {
      taskId: 'RW-2026-001',
      seq: 4,
      entries: [
        {
          id: 'SE-001', taskId: 'RW-2026-001', source: 'library', materialId: 'M-001', fileNo: 1,
          title: '县立师范讲习所沿革与课程表', archiveNo: 'JY-1932-Y-003', category: '文书档案',
          tagIds: ['G-001'], scope: 'all', pages: [], pageCount: 18,
          note: '', file: { name: '县立师范讲习所沿革与课程表.pdf', size: 5872026 },
          addedAt: '2026-05-11T09:20:00', addedBy: '王建国'
        },
        {
          id: 'SE-002', taskId: 'RW-2026-001', source: 'library', materialId: 'M-006', fileNo: 1,
          title: '普及小学教育规划与实施简报', archiveNo: 'JY-1958-Y-072', category: '文书档案',
          tagIds: ['G-002', 'G-007'], scope: 'all', pages: [], pageCount: 18,
          note: '', file: null,
          addedAt: '2026-05-11T09:26:00', addedBy: '王建国'
        },
        {
          id: 'SE-004', taskId: 'RW-2026-001', source: 'library', materialId: 'M-037', fileNo: 1,
          title: '全市教育工作会议实况录像', archiveNo: 'SX-2016-Y-014', category: '声像档案',
          tagIds: ['G-002'], scope: 'all', pages: [], pageCount: 0,
          note: '', file: { name: '全市教育工作会议实况录像.mp4', size: 428000000, duration: 3720 },
          addedAt: '2026-05-13T10:05:00', addedBy: '陈静'
        },
        {
          id: 'SE-003', taskId: 'RW-2026-001', source: 'library', materialId: 'M-012', fileNo: 1,
          title: '战时难民救济款项发放清册', archiveNo: 'MZ-1939-Y-021', category: '文书档案',
          tagIds: ['G-003'], scope: 'pages', pages: [2, 3], pageCount: 6,
          note: '', file: { name: '救济款项发放清册（正文）.pdf', size: 2516582 },
          addedAt: '2026-05-12T15:40:00', addedBy: '陈静'
        }
      ]
    },
    /* RW-2026-003（行政区划沿革，已推进到第 5 阶段、成果审核中）的选材库：
       ① 它是"发布审核通过 → 自动归档《素材目录》"这条链路的演示任务，
          选材库为空的话归档出来的目录表就是空的；
       ② 素材本身复用已有素材与馆藏目录，不新增素材，避免影响素材库的件数口径 */
    'RW-2026-003': {
      taskId: 'RW-2026-003',
      seq: 4,
      entries: [
        {
          id: 'SE-004', taskId: 'RW-2026-003', source: 'library', materialId: 'M-028',
          title: '城市总体规划说明书（初稿）', archiveNo: 'GH-1957-Y-006', category: '文书档案',
          tagIds: ['G-007'], scope: 'all', pages: [], pageCount: 46,
          note: '规划区范围与行政区划的对应关系见附图。', file: null,
          addedAt: '2026-03-02T09:30:00', addedBy: '陈静'
        },
        {
          id: 'SE-003', taskId: 'RW-2026-003', source: 'library', materialId: 'M-029',
          title: '旧城改造详细规划方案', archiveNo: 'GH-1983-Y-058', category: '文书档案',
          tagIds: ['G-007'], scope: 'pages', pages: [4, 5, 6, 7], pageCount: 32,
          note: '涉及街道办事处辖域调整的部分。', file: null,
          addedAt: '2026-03-02T09:36:00', addedBy: '陈静'
        },
        {
          id: 'SE-002', taskId: 'RW-2026-003', source: 'library', materialId: 'M-032',
          title: '城市旧影：主要街区历史照片专辑', archiveNo: 'MZ-1985-Z-012', category: '照片档案',
          tagIds: ['G-009'], scope: 'all', pages: [], pageCount: 60,
          note: '用于核对街区与乡镇辖域的历史范围。', file: null,
          addedAt: '2026-03-05T14:20:00', addedBy: '刘洋'
        },
        {
          id: 'SE-001', taskId: 'RW-2026-003', source: 'archive', materialId: null,
          title: '城镇精简职工安置情况报告', archiveNo: 'MZ-1962-Y-088', category: '文书档案',
          tagIds: [], scope: 'all', pages: [], pageCount: 30,
          note: '馆藏目录检索所得，反映建制调整后的人员安置。', file: null,
          addedAt: '2026-03-05T14:28:00', addedBy: '刘洋'
        }
      ]
    }
  };

  /* 每个任务的大纲。
     RW-2026-001 已经有生成好的大纲 —— 它在种子里已经推进到第 2/3 阶段，
     按第 1 阶段的门禁「大纲已确认」它本来就该有；其余任务留空（去点「AI生成大纲」）。
     内容由 buildOutline 现算，与界面上点按钮生成的结果完全一致。 */
  var OUTLINES = {
    'RW-2026-001': (function () {
      var plan = buildOutline(TASKS[0], '按「学制变迁—学校沿革—教育人物」三条线索编排，重点保证民国时期教育史料的完整性。', { materials: MATERIALS.length });
      return {
        taskId: 'RW-2026-001',
        prompt: '按「学制变迁—学校沿革—教育人物」三条线索编排，重点保证民国时期教育史料的完整性。',
        nodes: plan.nodes,
        thinking: plan.thinking,
        regenSeq: 1,
        nextId: plan.nodes.length + 1,
        updatedAt: '2026-05-06T10:20:00'
      };
    })(),
    /* RW-2026-003 是"已推进到第 5 阶段、成果正在审核中"的演示任务：
       它的大纲与正文一起种下，这样成果发布审核界面右侧能看到真实的成果文件 */
    'RW-2026-003': {
      taskId: 'RW-2026-003',
      prompt: '以政府批复文件为准，按「分期—事项」编排，逐条标注文号与日期。',
      nodes: [
        { id: 'n1', level: 1, title: '编纂说明', collapsed: false,
          note: '说明本汇编的编纂目的、收录范围、时间断限与编排体例，交代史料来源及利用注意事项。' },
        { id: 'n2', level: 2, title: '编纂目的与收录范围', collapsed: false,
          note: '说明汇编对厘清本市行政区划变迁、服务区划管理与编史修志的作用，界定收录的批复、通告与图件范围。' },
        { id: 'n3', level: 2, title: '体例与编排说明', collapsed: false,
          note: '说明按历史分期分章、章内以时间为序编排的规则，以及文号、日期与图件的著录方式。' },
        { id: 'n4', level: 1, title: '行政区划沿革概述', collapsed: false,
          note: '综述本市自民国以来行政区划的总体变迁脉络、阶段特征与主要调整事项。' },
        { id: 'n5', level: 2, title: '民国时期的区划调整（1912—1949）', collapsed: false,
          note: '收录废府设道、设县与区乡调整的批令与图件，反映新旧区划体系的交替。' },
        { id: 'n6', level: 2, title: '新中国成立初期的区划调整（1949—1978）', collapsed: false,
          note: '收录专区与市县的设立、撤并、更名与辖域调整文件。' },
        { id: 'n7', level: 2, title: '改革开放以来的区划调整（1978—2025）', collapsed: false,
          note: '收录撤县设市、撤市设区、街道乡镇调整等批复，反映城镇化进程中的区划变化。' },
        { id: 'n8', level: 1, title: '附录与索引', collapsed: false,
          note: '收录区划变更一览表、图件目录与文献出处索引，便于检索核对。' },
        { id: 'n9', level: 2, title: '行政区划变更一览表', collapsed: false,
          note: '按年月列出变更事项、依据文号与变更前后名称，条末注明档号。' },
        { id: 'n10', level: 2, title: '文献出处与档号索引', collapsed: false,
          note: '汇总本汇编引用档案的全宗号、目录号与案卷号，编制索引备查。' }
      ],
      thinking: [
        '读取提示词：「以政府批复文件为准，按「分期—事项」编排，逐条标注文号与日期。」',
        '解析编研意图：选题「本市行政区划沿革（1949—2025）」· 编研类型「组织沿革」',
        '检索馆藏目录与素材库：命中 68 条候选素材（11 个主题簇）',
        '确定内容边界：以「行政区划变更」为主线，剔除与本专题无关的记载',
        '拟订章节层级：一级标题 3 个、二级标题 7 个',
        '为每个标题生成主要内容说明（共 10 条），交回右侧编辑区'
      ],
      regenSeq: 1,
      nextId: 11,
      updatedAt: '2026-08-20T15:40:00'
    },
    /* 乡村振兴档案史料汇编（续编）（第 4 阶段·审核校定）的大纲。
       它同时是「审核校定」的演示任务：正文见 COMPOSES，里面留了三类审核都能命中的问题。 */
    [XC_TASK_ID]: (function () {
      var nodes = [
        { id: 'n1', level: 1, title: '编纂说明', collapsed: false,
          note: '说明本汇编的编纂目的、收录范围、时间断限与编排体例，交代史料来源及利用注意事项。' },
        { id: 'n2', level: 2, title: '编纂目的与收录范围', collapsed: false,
          note: '说明汇编对记录乡村振兴历程、服务涉农决策与编史修志的作用，界定收录的档案类型与起止年代。' },
        { id: 'n3', level: 2, title: '体例与编排说明', collapsed: false,
          note: '说明按「产业—生态—文化—治理」四类分章、章内以时间为序编排的规则与著录方式。' },
        { id: 'n4', level: 1, title: '产业振兴', collapsed: false,
          note: '收录特色种养、产业扶持、农产品加工与流通等方面的档案，反映乡村产业的发展脉络。' },
        { id: 'n5', level: 2, title: '特色种养与产业扶持', collapsed: false,
          note: '收录产业扶持项目的申报、批复、验收与资金使用文件。' },
        { id: 'n6', level: 2, title: '农产品加工与流通', collapsed: false,
          note: '收录加工企业设立、品牌培育与产销对接材料。' },
        { id: 'n7', level: 1, title: '生态宜居', collapsed: false,
          note: '收录人居环境整治、农村水利与防灾减灾等方面的档案。' },
        { id: 'n8', level: 2, title: '人居环境整治', collapsed: false,
          note: '收录村庄规划、污水垃圾治理与村容村貌整治材料。' },
        { id: 'n9', level: 2, title: '农村水利与防灾减灾', collapsed: false,
          note: '收录农田水利建设、河道治理与灾害防范的文件。' },
        { id: 'n10', level: 1, title: '文化振兴', collapsed: false,
          note: '收录乡村文化设施与活动、传统村落与非物质文化遗产保护等方面的档案。' },
        { id: 'n11', level: 2, title: '乡村文化设施与活动', collapsed: false,
          note: '收录文化礼堂、农家书屋建设与群众文化活动材料。' },
        { id: 'n12', level: 2, title: '传统村落与非物质文化遗产', collapsed: false,
          note: '收录传统村落申报、保护规划与非遗项目传承材料。' },
        { id: 'n13', level: 1, title: '组织与治理', collapsed: false,
          note: '收录村级组织建设、涉农政策落实与监督等方面的档案。' },
        { id: 'n14', level: 2, title: '村级组织建设', collapsed: false,
          note: '收录村级组织换届、干部任免与村民自治制度材料。' },
        { id: 'n15', level: 2, title: '涉农政策落实与监督', collapsed: false,
          note: '收录惠农补贴发放、项目资金监管与信访办理材料。' },
        { id: 'n16', level: 1, title: '附录与索引', collapsed: false,
          note: '收录涉农档案专题目录与文献出处索引，便于检索核对。' },
        { id: 'n17', level: 2, title: '涉农档案专题目录', collapsed: false,
          note: '按产业、生态、文化、治理四类编制专题目录，标注档号。' }
      ];
      return {
        taskId: XC_TASK_ID,
        prompt: '按「产业—生态—文化—治理」四类编排，涉农档案按门类归集，逐条标注档号与年度。',
        nodes: nodes,
        thinking: [
          '读取提示词：「按「产业—生态—文化—治理」四类编排，涉农档案按门类归集，逐条标注档号与年度。」',
          '解析编研意图：选题「乡村振兴档案史料汇编（续编）」· 编研类型「档案文献选编」',
          '检索馆藏目录与素材库：命中 122 条候选素材（9 个主题簇）',
          '确定内容边界：以「涉农档案」为主线，剔除与本专题无关的记载',
          '拟订章节层级：一级标题 5 个、二级标题 12 个',
          '为每个标题生成主要内容说明（共 17 条），交回右侧编辑区'
        ],
        regenSeq: 1,
        nextId: nodes.length + 1,
        updatedAt: '2026-05-26T10:30:00'
      };
    })()
  };

  /* ======================================================================
     第 3 阶段「加工编排」的正文

     一个任务一份：{ taskId, chapters: { <大纲节点 id>: { text, savedAt, savedBy } } }
     用**大纲节点 id** 当章节键：导航区就是大纲，编排区写的就是这个节点的正文。
     重新生成大纲会让标题与正文错位（id 不变、标题可能变），这点记在 README 待确认里。
     ====================================================================== */
  var COMPOSES = {
    'RW-2026-001': {
      taskId: 'RW-2026-001',
      chapters: {
        n1: {
          text: '本汇编选录本市教育事业发展历程中的档案史料，起自清末书院改学堂，讫于 2025 年底。\n\n' +
            '收录范围以本市教育行政、学校教育与教育人物三类档案为主，兼收省级以上文件中涉及本市教育的部分。' +
            '所收史料均注明出处与档号，重要文件附影印件。',
          savedAt: '2026-05-14T14:05:00', savedBy: '李文华'
        },
        n2: {
          text: '编纂本汇编的目的，在于集中保存本市教育事业发展过程中形成的档案史料，' +
            '为教育史研究、编史修志与资政参考提供系统的第一手材料。',
          savedAt: '2026-05-14T14:12:00', savedBy: '李文华'
        },
        /* n3 是**故意播入的演示稿**：含错别字、纪年不一致、不规范表述、隐私信息，
           以及命中审核规则的敏感内容 —— 让三类审核一打开就有东西可看（详见 README 审核校定一节） */
        n3: {
          text: '本汇编收录范围复盖全市各级各类学校，史料按排以时间为序。\n\n' +
            '民国 25 年（公元 1932 年）县立师范讲习所改办为县立简易师范学校，' +
            '建国后该校几经调整，1958 年定名为市第二师范学校。\n\n' +
            '所收材料中涉及重大政治事件及敏感历史问题的记载，一律暂不收录；' +
            '涉及公民隐私的材料需另行审定后使用。\n\n' +
            '联系人为张某某，身份证号 330106199001011234，电话 13800138000，' +
            '通讯地址与联系方式见卷内备考表。\n\n' +
            '经费部分依据各校逐年报送的帐目清册统计，其中学田租息、地方附加捐与省款补助三项合计占七成以上；' +
            '1956 年以前的部分数据缺环，编者按现存报表作了推算，并在各表下逐一注明推算依据。' +
            '需要说明的是，个别年份的收支差额较大，与当年校舍修建支出集中有关；' +
            '涉及不宜公开的内部讨论记录，本汇编一律不收录，仅保留结论性表述。\n\n' +
            '各校报送的材料在体例上并不统一，有以学年为单位的，也有以自然年为单位的，' +
            '本汇编统一折算为自然年，折算口径见附录二。\n\n' +
            /* 故意留下的**知识产权风险**（合规性审核：模型判定，不依赖规则） */
            '书前插图转载自《本市教育志》，部分照片来源于网络，未获授权，待与权利人沟通。\n\n' +
            /* 故意留下的**个人信息关键词**（模型提示复核）。
               ⚠️ 别用"婚姻状况 / 健康状况"：它们同时是政治性审核规则里的敏感词，
                  会让两个不同审核项命中同一处文字，校定界面就会一次标黄两处（踩过）。 */
            '个别教师的家庭住址与个人简历在报送材料中有记载，公开前需评估必要性。',
          savedAt: '2026-05-15T09:20:00', savedBy: '李文华'
        }
      },
      savedAt: '2026-05-14T14:12:00', savedBy: '李文华'
    },
    /* RW-2026-003 的正文：成果发布审核界面右侧要展示的"编研成果文件" */
    'RW-2026-003': {
      taskId: 'RW-2026-003',
      chapters: {
        n1: {
          text: '本汇编收录本市行政区划变迁过程中形成的批复、通告、图件与统计表，起自 1912 年，讫于 2025 年底。\n\n' +
            '收录范围以省、市政府及民政部门关于区划调整的批复文件为主，兼收涉及本市辖域变化的上级文件与图件。' +
            '所收文件均标注文号与档号，重要批复附影印件。',
          savedAt: '2026-08-18T10:10:00', savedBy: '李文华'
        },
        n2: {
          text: '编纂本汇编，在于集中保存区划变迁的原始依据，为区划管理、边界争议调处与编史修志提供系统的第一手材料。',
          savedAt: '2026-08-18T10:16:00', savedBy: '李文华'
        },
        n3: {
          text: '全书按历史分期分章，章内以时间为序；同一事项涉及多次调整的，按批复时间先后排列并加注说明。',
          savedAt: '2026-08-18T10:22:00', savedBy: '李文华'
        },
        n4: {
          text: '本市行政区划自民国以来经历废府设道、专区撤并、撤县设市与撤市设区几个阶段，' +
            '总体趋势是由分散的县乡体系逐步整合为市辖区与街道乡镇两级管理格局。',
          savedAt: '2026-08-19T09:05:00', savedBy: '李文华'
        },
        n5: {
          text: '民国初年废府设道，本境属道辖县；民国 20 年前后推行区乡制，县以下设区、乡（镇）、闾邻。\n\n' +
            '民国 25 年（公元 1936 年）调整区乡边界，将邻县数乡划入，县的辖域自此基本定型。',
          savedAt: '2026-08-19T09:20:00', savedBy: '李文华'
        },
        n6: {
          text: '1949 年后本境设专区，辖数县；1958 年前后部分县撤并，1961 年恢复原建制。\n\n' +
            '1970 年专区改称地区，1983 年实行市管县体制，本县划归本市管辖。',
          savedAt: '2026-08-19T14:40:00', savedBy: '李文华'
        },
        n7: {
          text: '改革开放以来，区划调整以城镇化为主线：1988 年撤县设市，2001 年撤市设区，' +
            '此后陆续撤销城关镇与近郊乡镇，改设街道办事处。\n\n' +
            '2015 年、2021 年两次调整街道管辖范围，将开发区代管区域纳入属地管理，区划格局延续至今。',
          savedAt: '2026-08-20T15:30:00', savedBy: '李文华'
        },
        n8: {
          text: '附录收录区划变更一览表与文献出处索引，便于按年月与文号检索核对。',
          savedAt: '2026-08-20T15:36:00', savedBy: '李文华'
        }
      },
      savedAt: '2026-08-20T15:36:00', savedBy: '李文华'
    },
    /* 乡村振兴档案史料汇编（续编）（第 4 阶段·审核校定）的正文。
       ⚠️ 这是**故意留下的问题稿**，专供「审核校定」演示（评审要求：
          「乡村振兴档案史料汇编，给这个编研任务的审核校定环节，生成一些审核问题，三类审核都需要」）。
       三类审核都能真实命中（不是预置结果，是审核引擎扫这份正文算出来的）：
         · 政治性（依托审核规则）：重大政治事件 / 敏感历史问题 / 灾害风险评估 / 土地权属争议 /
           文化遗产保护中 / 干部任免 / 民族纠纷 / 群体性事件 / 维稳部署 / 举报材料
         · 专业性（不依赖规则）：错别字（复盖・按排・座落・园满・兴高彩烈・既使）、
           规范表述（建国后）、民国纪年不一致（民国 23 年写成公元 1930 年）
         · 合规性：个人信息（身份证号 / 手机号 / 电子邮箱）+ 知识产权风险 + 个人信息关键词（住址 /
           健康 / 婚姻 / 薪酬 / 简历）。原先还有"不宜公开依托审核规则"那一支，已按评审要求去掉。原口径：专项资金 /
           企业核心经营数据 / 问题线索来源 / 初步核查 / 重大风险隐患排查 / 社会救助对象 / 共享机制）
       改这份正文会直接影响审核命中数，改前先看 audit.js 的判定口径。 */
    [XC_TASK_ID]: {
      taskId: XC_TASK_ID,
      chapters: {
        n1: {
          text: '本续编承接前编体例，选录本市乡村振兴工作中形成的档案史料，起自 1949 年，讫于 2025 年底。\n\n' +
            '凡涉及重大政治事件与敏感历史问题的记载，本汇编一律按有关规定作技术处理，不作展开叙述。',
          savedAt: '2026-05-20T09:10:00', savedBy: '刘洋'
        },
        n2: {
          text: '编纂本汇编，在于集中保存乡村振兴过程中形成的档案史料，为涉农决策与编史修志提供第一手材料。\n\n' +
            '收录范围复盖全市各县（区）的涉农档案，含文书、照片、声像等门类。',
          savedAt: '2026-05-20T09:18:00', savedBy: '刘洋'
        },
        n3: {
          text: '全书按「产业—生态—文化—治理」四类分章，章内史料按排以时间为序；同一事项涉及多次调整的，按文件时间先后排列。\n\n' +
            '建国后形成的涉农文件，一律标注文号与档号；原文中的纪年保持原样，必要时加注公元纪年。',
          savedAt: '2026-05-20T09:26:00', savedBy: '刘洋'
        },
        n4: {
          text: '民国 23 年（公元 1930 年）本地曾开展乡村建设实验，留下合作农场与信用合作社的少量文书。\n\n' +
            '新中国成立后，乡村产业经历合作化、乡镇企业发展与现代农业三个阶段，本编按阶段分节收录。',
          savedAt: '2026-05-21T10:05:00', savedBy: '刘洋'
        },
        n5: {
          text: '收录特色种养基地申报与产业扶持项目文件，含涉农专项资金的分配、使用与验收材料。\n\n' +
            '部分项目材料附有实施主体的经营数据，编者按年度归集，形成产业扶持项目一览。',
          savedAt: '2026-05-21T10:20:00', savedBy: '刘洋'
        },
        n6: {
          text: '收录农产品加工企业设立、品牌培育与产销对接材料。\n\n' +
            '企业核心经营数据不予收录，仅在统计口径说明中作汇总性表述；流通环节的价格与销售记录按年度汇总，' +
            '反映主要农产品的产销变化。',
          savedAt: '2026-05-21T10:34:00', savedBy: '刘洋'
        },
        n7: {
          text: '收录人居环境整治、农村水利与防灾减灾等方面的档案，反映村容村貌与生产条件的改善。',
          savedAt: '2026-05-22T09:15:00', savedBy: '刘洋'
        },
        n8: {
          text: '收录村庄规划、污水垃圾治理与村容村貌整治材料。\n\n' +
            '部分村居座落于丘陵地带，整治方案园满完成，附图册与验收记录。',
          savedAt: '2026-05-22T09:28:00', savedBy: '刘洋'
        },
        n9: {
          text: '收录农田水利建设、河道治理与灾害防范文件，重点工程的做法与灾害风险评估结论一并收录。\n\n' +
            '部分河段存在土地权属争议，调处记录与附图见本编附录；既使在丰水期，也按既定调度方案运行。',
          savedAt: '2026-05-22T09:40:00', savedBy: '刘洋'
        },
        n10: {
          text: '收录乡村文化设施建设、群众文化活动与传统村落、非物质文化遗产保护等方面的档案。',
          savedAt: '2026-05-23T10:10:00', savedBy: '刘洋'
        },
        n11: {
          text: '收录文化礼堂、农家书屋建设与群众文化活动材料；各村组织的农民丰收节活动兴高彩烈，参与人数逐年增加。',
          savedAt: '2026-05-23T10:22:00', savedBy: '刘洋'
        },
        n12: {
          text: '收录传统村落申报、保护规划与非遗项目传承材料。\n\n' +
            '传统村落在文化遗产保护中形成的规划文本、修缮方案与资金凭证，一并选录。\n\n' +
            /* 故意留下的**知识产权风险**：转载 / 网络图片 / 未获授权（合规性审核由模型判定，不依赖规则） */
            '本编所选插图转载自《本市非物质文化遗产图录》，部分图片来源于网络，未获授权，待与权利人沟通。',
          savedAt: '2026-05-23T10:35:00', savedBy: '刘洋'
        },
        n13: {
          text: '收录村级组织建设、涉农政策落实与监督等方面的档案。',
          savedAt: '2026-05-24T09:30:00', savedBy: '刘洋'
        },
        n14: {
          text: '收录村级组织换届、干部任免的批复与人员名单，以及村民自治制度的实施材料。\n\n' +
            '历史上民族纠纷的调解记录一并选录，反映基层治理的沿革。\n\n' +
            /* 故意留下的**个人信息**（关键词类，模型提示复核）：住址 / 简历。
               ⚠️ 同上：避开"婚姻状况 / 健康状况"（政治性规则也命中，会重复标黄）。 */
            '个别人员的家庭住址与个人简历在任职材料中有记载，公开前需评估必要性。',
          savedAt: '2026-05-24T09:44:00', savedBy: '刘洋'
        },
        n15: {
          text: '收录惠农补贴发放、项目资金监管与信访办理材料。\n\n' +
            '对问题线索来源、初步核查过程的材料按年度归集；涉及重大风险隐患排查的记录单独成卷。\n\n' +
            '卷内备考表载明：社会救助对象的家庭情况与涉农数据共享机制的说明另附；' +
            '联系人为王某某，身份证号 330106198501012345，手机号 13812345678，电子邮箱 wang@example.gov.cn。\n\n' +
            '个别年份曾发生群体性事件，维稳部署与举报材料的办理情况见卷内备考表。',
          savedAt: '2026-05-24T10:05:00', savedBy: '刘洋'
        },
        n16: {
          text: '附录收录涉农档案专题目录与文献出处索引，按产业、生态、文化、治理四类编制。',
          savedAt: '2026-05-25T09:50:00', savedBy: '刘洋'
        },
        n17: {
          text: '专题目录逐条标注档号、年度与门类，便于按类检索核对；索引按档案形成时间排序。',
          savedAt: '2026-05-25T10:02:00', savedBy: '刘洋'
        }
      },
      savedAt: '2026-05-25T10:02:00', savedBy: '刘洋'
    }
  };

  /* ======================================================================
     第 4 阶段「审核校定」的**默认审核结果**（预置数据，直接写在代码里）

     评审要求：审核校定环节**一打开就要有审核结果**，而且这份数据**不能丢**。
     所以它不靠"先点一次一键全部审核"、也不只躺在浏览器 localStorage 里：

       · 命中项由**本地审核引擎**（js/audit.js）在播种时重新扫一遍种子正文算出，
         与页面上点「一键全部审核」得到的结果**完全一致**（章节、位置、规则出处都对得上）；
       · 这里只声明"谁、什么时候审的"，以及**已经处理过的项**（已校定 / 已忽略）——
         按「类别 + 章节 + 命中文本」认项，不写死位置：正文一改，位置自然跟着变。

     种子版本变化（重新播种）时这份数据会照这里重新生成，所以**不会因为清本地数据而丢失**。

     handled 的两种写法：
       { kind, chapterId, text, status: 'ignored', note: '…' }
         → 已忽略（并记忽略说明）
       { kind, chapterId, text, status: 'fixed', mode: 'mark', note: '…' }
         → 已校定（正文未变，修改记录里写成"人工确认"）
     ====================================================================== */
  var AUDIT_RESULTS = {
    /* 主演示任务：第 3 章 n3 是故意留了问题的演示稿（错别字 / 纪年 / 规范表述 / 隐私 / 知识产权） */
    'RW-2026-001': {
      by: '李文华', at: '2026-05-16T10:05:00',
      handled: []
    },
    /* 乡村振兴（第 4 阶段演示任务）：三类问题都有；另预置"已忽略""已校定"各一条，
       一进去就能演示状态筛选与「修改记录」 */
    [XC_TASK_ID]: {
      by: '刘洋', at: '2026-05-26T15:20:00',
      handled: [
        { kind: 'professional', chapterId: 'n3', text: '建国后', status: 'ignored',
          note: '属体例说明里的概述用语，已在辅文中注明起止年代，保留原表述' },
        { kind: 'compliance', chapterId: 'n14', text: '家庭住址', status: 'fixed', mode: 'mark',
          note: '已核对并作去标识处理，正文表述保留（人工确认）' }
      ]
    }
  };

  /* ======================================================================
     演示数据版本

     演示数据会持久化到 localStorage。**种子数据一变，旧数据就会盖住新种子**
     （例如"每部成果必须关联编研任务"这条规则加入前存下的成果，taskId 是空的，
     界面上就会出现"有的卡片有来源任务、有的没有"）。
     因此每次改动种子数据都要把这个版本号加一：版本不一致时清掉本地数据、重新灌种子。
     ====================================================================== */
  /* 2026-09-22.1：RW-2026-001 进度重置到「生成大纲」+ 新增大纲数据集 */
  /* 2026-09-29.1：新增第 5 阶段「成果发布」——消息中心 + 三步审核流程 + 审核信息表；
     流程配置的三个步骤都配上审核人（成果发布按它逐级推送） */
  /* 2026-09-30.4：成果发布审核通过后自动归档四类材料（选题可行性评估表及附件 / 审核意见表 /
     素材目录 / 编研成果定稿）；T-005 补两个立项附件、RW-2026-003 补选材库（目录表的演示数据） */
  /* 2026-09-30.8：合规性审核改成"知识产权风险 + 个人隐私及个人信息"（不再依托审核规则），
     乡村振兴的问题稿里补上对应的演示文字（插图转载/网络图片/未获授权、婚姻与健康状况） */
  /* 2026-09-30.7：素材条目支持**多份文件**（M-001/M-005/M-012 各配了 2—3 份）；
     选材记录补 fileNo/file（范围文字会带文件名，页码按所选文件的页数校验） */
  /* 2026-09-30.6：用户管理的「职位」改成真正的职务名（原先几处是把流程角色抄进了 title） */
  /* 2026-09-30.5：新增「审核校定」的第二个演示任务 RW-2026-403（乡村振兴档案史料汇编（续编），
     停在第 4 阶段）+ 它的问题稿（三类审核都能真实命中），供演示"生成审核问题" */
  /* 2026-09-30.9：「审核校定」加上**默认审核结果**（AUDIT_RESULTS，写进代码）——
     一进第 4 阶段三类卡片就有命中项（不用先点一键全部审核），且种子版本变化会重新生成、不会丢 */
  var SEED_VERSION = '2026-09-30.9';

  /* ======================================================================
     第 3 阶段「加工编排」的**本地模拟生成**（原型不调用大模型）

     和"AI生成大纲"一样：按提示词 + 上下文拼出**确定性的**编者文字，
     同一提示词给同一结果、换个提示词就换一种写法。
       · generate(prompt, ctx)          → AI生成：一段编者文字
       · expand(prompt, selected, ctx)  → AI扩写：把选中的内容扩写成一段
     ====================================================================== */
  var COMPOSE_LEADS = [
    '就本段所涉问题，编者依据馆藏档案作如下说明：',
    '按照编纂体例，现将有关情况梳理如下：',
    '综合所收史料，可以看清这一段脉络：',
    '现将查得的档案情况辑录如下：'
  ];
  var COMPOSE_POINTS = [
    '所需材料在本馆馆藏中保存较为完整，可支撑本章的记述',
    '相关文件在时间上前后衔接，能够反映其演变过程',
    '档案记载与同期报刊、志书可以互相印证',
    '个别年份的材料尚有缺环，需要辅以其他全宗的记载'
  ];
  var COMPOSE_TAILS = [
    '以上情况，供编写与审核时参考。',
    '本段所述均以档案原文为据，编者未作改动。',
    '为保持史料原貌，引用时一律照录原文，异体字与旧地名加注说明。',
    '凡涉及数字与统计口径者，均按档案记载照录，不作换算。'
  ];

  function hashText(t) {
    var h = 0;
    var str = String(t || '');
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 99991;
    return h;
  }

  /* 提示词里的领域词表：中文没有词间空格，靠词表命中比"按空格切"自然得多 */
  var COMPOSE_TERMS = ['教育', '学制', '学校', '经费', '教师', '课程', '人物', '抗战', '救济', '规划',
    '行政区划', '交通', '水利', '商会', '工业', '照片', '录像', '会议', '政策', '统计', '名录', '民国'];

  /** 命中的领域词（用于"像回应了提示词"，也写进思考说明） */
  function keywords(prompt) {
    var t = String(prompt || '');
    return COMPOSE_TERMS.filter(function (w) { return t.indexOf(w) >= 0; }).slice(0, 4);
  }

  /** 提示词的第一句（截断到 18 字）——用它当"本段围绕…"的主题 */
  function promptTopic(prompt, fallback) {
    var clause = String(prompt || '').replace(/[。；;.!?！？]/g, '，').split('，')[0].trim();
    if (!clause) return fallback || '本段内容';
    return clause.length > 18 ? clause.slice(0, 18) + '…' : clause;
  }

  function citeMaterials(ctx) {
    var ms = (ctx && ctx.materials) || [];
    if (!ms.length) return '';
    return ms.slice(0, 2).map(function (m) {
      return '《' + m.title + '》' + (m.archiveNo ? '（档号 ' + m.archiveNo + '）' : '');
    }).join('、');
  }

  /**
   * AI扩写：在**选中的原文**基础上补背景、补细节（带档案出处）、补意义。
   * 保留选中内容本身（编者文字与档案原文分离的体例），只是把一段扩成三句。
   */
  function composeExpand(prompt, selected, ctx) {
    ctx = ctx || {};
    var picked = String(selected || '').trim();
    var h = hashText(prompt + '|' + picked);
    var kws = keywords(prompt);
    var cite = citeMaterials(ctx);
    var point = COMPOSE_POINTS[(h >> 2) % COMPOSE_POINTS.length];
    var tail = COMPOSE_TAILS[(h >> 5) % COMPOSE_TAILS.length];
    var focus = kws.length ? kws.join('、') : promptTopic(prompt, '本段');
    var text =
      '编者按：' + picked +
      '就' + focus + '而言，' + point + '。' +
      (cite ? '可与 ' + cite + ' 等档案互相参证。' : '') +
      tail;
    return {
      text: text,
      thinking: '保留选中原文 ' + picked.length + ' 字，补写背景/细节/意义三句，共 ' +
        text.length + ' 字（本地模拟生成，未接大模型）'
    };
  }

  function composeGenerate(prompt, ctx) {
    ctx = ctx || {};
    var h = hashText(prompt + '|' + (ctx.chapterTitle || ''));
    var kws = keywords(prompt);
    var lead = COMPOSE_LEADS[h % COMPOSE_LEADS.length];
    var point = COMPOSE_POINTS[(h >> 3) % COMPOSE_POINTS.length];
    var tail = COMPOSE_TAILS[(h >> 6) % COMPOSE_TAILS.length];
    var topic = promptTopic(prompt, ctx.chapterTitle);
    var cite = citeMaterials(ctx);
    var body = lead + '本段围绕「' + topic + '」展开：' + point + '。' +
      (cite ? '主要依据 ' + cite + ' 等档案。' : '') + tail;
    return {
      text: body,
      thinking: '提示词关键词：' + (kws.join('、') || '（无）') +
        '；参考本章要点与 ' + ((ctx.materials || []).length) + ' 件选材，写成 ' + body.length + ' 字（本地模拟生成，未接大模型）'
    };
  }

  App.mock = {
    SEED_VERSION: SEED_VERSION,
    /* 审核规则（系统管理 · 归档设置 → 审核规则）：数据在 mock-audit.js 里，单独成文件避免这里过大 */
    AUDIT_RULE_TYPES: (global.App.mockAudit || {}).AUDIT_RULE_TYPES || [],
    AUDIT_CONTROL_FLAGS: (global.App.mockAudit || {}).AUDIT_CONTROL_FLAGS || [],
    AUDIT_RULES: (global.App.mockAudit || {}).AUDIT_RULES || [],
    AUDIT_SOURCE: (global.App.mockAudit || {}).AUDIT_SOURCE || {},
    ORG: ORG,
    USERS: USERS,
    FLOW_STEPS: FLOW_STEPS,
    DATA_DICTS: DATA_DICTS,
    DICT_META_OPTIONS: DICT_META_OPTIONS,
    WORKBENCH: WORKBENCH,
    NAV: NAV,
    TYPE_COLORS: TYPE_COLORS,
    STATUS_COLORS: STATUS_COLORS,
    /* 第 3 阶段「加工编排」的本地模拟生成 */
    compose: { generate: composeGenerate, expand: composeExpand },
    /* 材料归档 */
    ARCHIVE_FIELDS: ARCHIVE_FIELDS,
    ARCHIVE_FIELD_TYPES: ARCHIVE_FIELD_TYPES,
    ARCHIVE_DATE_FORMATS: ARCHIVE_DATE_FORMATS,
    ARCHIVE_ITEMS: ARCHIVE_ITEMS,
    ARCHIVE_CATEGORY_TAG: ARCHIVE_CATEGORY_TAG,
    /* 编研成果 */
    PRODUCTS: PRODUCTS,
    PRODUCT_TOC: PRODUCT_TOC,
    /* 审核校定 */
    REVIEW_FLOWS: REVIEW_FLOWS,
    REVIEW_FLOW_TYPES: REVIEW_FLOW_TYPES,
    REVIEW_FLOW_STATUS: REVIEW_FLOW_STATUS,
    REVIEW_AI_CHECKS: REVIEW_AI_CHECKS,
    /* 编研任务 */
    TASKS: TASKS,
    /* 第 1 阶段「生成大纲」 */
    OUTLINES: OUTLINES,
    /* 第 2 阶段「确定选材」 */
    SELECTIONS: SELECTIONS,
    /* 第 3 阶段「加工编排」 */
    COMPOSES: COMPOSES,
    /* 第 4 阶段「审核校定」的默认审核结果（预置数据，写进代码） */
    AUDIT_RESULTS: AUDIT_RESULTS,
    OUTLINE_MAX_LEVEL: OUTLINE_MAX_LEVEL,
    OUTLINE_LEVEL_LABELS: OUTLINE_LEVEL_LABELS,
    outline: {
      maxLevel: OUTLINE_MAX_LEVEL,
      levelLabels: OUTLINE_LEVEL_LABELS,
      build: buildOutline,
      regenerate: regenerateOutlineNodes,
      core: outlineCore,
      noteTails: OUTLINE_NOTE_TAILS,
      skeleton: OUTLINE_SKELETON
    },
    TASK_STAGES: TASK_STAGES,
    TASK_STATUS: TASK_STATUS,
    TASK_STATES: TASK_STATES,
    TASK_TEAM_ROLES: TASK_TEAM_ROLES,
    /* 编研素材库 */
    TAGS: TAGS,
    MATERIALS: MATERIALS,
    ARCHIVE_CATALOG: ARCHIVE_CATALOG,
    ARCHIVE_CATEGORIES: ARCHIVE_CATEGORIES,
    SEARCH_SUGGESTIONS: SEARCH_SUGGESTIONS,
    /* 选题立项 */
    TOPICS: TOPICS,
    TOPIC_STATUS: TOPIC_STATUS,
    FUNDING_SOURCES: FUNDING_SOURCES,
    AI_TOPIC_CANDIDATES: AI_TOPIC_CANDIDATES,
    minsAgo: minsAgo
  };
})(window);
