/* Seat Arrangement 原型示範資料。
   員工名單來自公司提供的名單（prototype/roster.js，含真實同事姓名與分機，原型只限內部使用）。
   誰報名、帶眷屬、兒童椅、素食與備註依 2026 年的報名表（prototype/registrations-2026.js），員工名單找不到的人略過；報名表沒有座位，所以一開始都未入座。
   組別依承辦人提供的分組名單（寫在 roster.js）；外部貴賓的姓名是虛構的；桌數與排列依規格第 8.3 節。 */
(function () {
  const pad = n => String(n).padStart(2, '0');
  const iso = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  // 每桌標準 10 位、最多 12 位（第 8.3 節）：拖移與「加入人員」可以放到 12 位，選單類的入口只到 10 位
  const CAPACITY = 10, MAX_SEATS = 12;

  // 桌次排列（第 8.3 節）：欄 0–5 由左到右（A 外側、A 中間、A 內側、B 內側、B 中間、B 外側），列以半格錯開
  const LAYOUT = [
    [1, 'B-1', 3, 0], [2, 'A-1', 2, 0],
    [3, 'B-4', 5, 1], [4, 'B-7', 5, 2], [5, 'B-10', 5, 3], [6, 'B-13', 5, 4],
    [7, 'B-2', 4, 0.5], [8, 'B-5', 4, 1.5], [9, 'B-8', 4, 2.5], [10, 'B-11', 4, 3.5], [11, 'B-14', 4, 4.5],
    [12, 'B-3', 3, 1], [13, 'B-6', 3, 2], [14, 'B-9', 3, 3], [15, 'B-12', 3, 4], [16, 'B-15', 3, 5],
    [17, 'A-3', 2, 1], [18, 'A-6', 2, 2], [19, 'A-9', 2, 3], [20, 'A-12', 2, 4], [21, 'A-15', 2, 5],
    [22, 'A-2', 1, 0.5], [23, 'A-5', 1, 1.5], [24, 'A-8', 1, 2.5], [25, 'A-11', 1, 3.5], [26, 'A-14', 1, 4.5],
    [27, 'A-4', 0, 1], [28, 'A-7', 0, 2], [29, 'A-10', 0, 3], [30, 'A-13', 0, 4],
  ].map(([no, code, col, row]) => ({ no, code, col, row }));

  const C = {
    CAPACITY,
    MAX_SEATS,
    CATEGORIES: ['員工', '眷屬', '外部貴賓'],
    RELATIONS: ['配偶', '子女', '父母', '兄弟姊妹'],
    NOTE_SUGGESTIONS: ['主桌', '董事貴賓', '供應商', '客戶貴賓'],
    // 原型的登入者是虛構的（第 4.4 節）；只允許公司網域的 Google 帳號登入（第 7.1.3 節）
    USER: { name: '尾牙承辦人', email: 'organizer@program.com.tw' },
    EMAIL_DOMAIN: 'program.com.tw',
    LAYOUT,
    COLS: 6,
    ROWS: 5,
    // 地標只標示位置，不可操作；cols 是佔用的欄位範圍
    LANDMARKS: [
      { key: 'award', label: '領獎區', cols: [0, 1] },
      { key: 'stage', label: '舞台', cols: [2, 3] },
      { key: 'console', label: '控台', cols: [4, 5] },
      { key: 'entrance', label: '出入口', cols: [1, 4], bottom: true },
    ],
    SCENARIO: [
      { text: '承辦人匯入公司員工名單（姓名、部門、組別、分機）', href: 'employees.html', hint: '按「匯入員工名單」是畫面示意，按「新增員工」可以實際新增' },
      { text: '在員工名單看誰還沒報名，把報名的員工加入尾牙，帶眷屬的一併加上；或直接匯入參與人員名單', href: 'employees.html?view=unregistered', hint: '列操作「加入尾牙」可同時加一位眷屬；勾選多位可一次加入' },
      { text: '按「自動排座」依部門與組別一次排好，再在座位圖把人員拖到桌次微調；同組的人盡量放在一起、同部門盡量同桌，部門湊不滿一桌時兩個部門併桌；整桌要換位置時拖桌次的把手到另一桌對調', href: 'seating.html', hint: '自動排座可選「清空後重排」或「只排未入座」，同組的人會盡量排在一起，都能復原' },
      { text: '為主桌、貴賓桌設定備註名稱（主桌、董事貴賓、供應商）', href: 'seating.html?table=1' },
      { text: '名單異動：新增眷屬、標注兒童椅與素食、指定工作人員、取消報名的人移出', href: 'people.html', hint: '工作人員放在座位圖右上角的工作人員桌：把員工拖進去，或編輯員工時勾選「工作人員」' },
      { text: '匯出座位表給餐廳與現場工作人員', href: 'people.html', hint: '按「匯出座位表」會下載 Excel 檔，版面和座位圖一樣' },
      { text: '活動當天用手機搜尋某人在第幾桌，看統計列的入座人數與兒童椅數', href: 'seating.html?view=all', hint: '在人員面板搜尋姓名或分機，按「第 n 桌」徽章' },
    ],
  };

  // 與客戶確認事項（第 9 節）：目前沒有待確認的題目；有新題目時加在這裡，示範工具列的「顯示確認點」才會出現
  const Q = {
  };

  // 外部貴賓的姓名是虛構的：報名表只有員工，貴賓由承辦人另外安排，示範時留在未入座讓人手動拖
  const GUESTS = [
    ['張淑娟', '獨立董事'], ['王進財', '董事'], ['李文華', '董事'], ['吳柏毅', '得安車業 執行長'], ['劉國棟', '董事'],
    ['蘇秀蘭', '信達停車 營運長'], ['黃雅芳', '宏越科技 總經理'], ['周明德', '泰豐電子 業務經理'], ['林志遠', '晨曜精密 採購經理'], ['許惠美', '鼎立塑膠 協理'],
    ['鄭凱文', '合順印刷 經理'], ['蔡佳穎', '昇陽物流 業務'],
  ];
  // 備註名稱沿用 2025 年座位表的主桌、供應商與客戶貴賓桌；其他桌沒有備註名稱，自動排座才排得進去
  const NOTES = { 1: '主桌', 2: '主桌', 12: '供應商', 17: '供應商', 22: '客戶貴賓' };

  function seed() {
    let seq = 0, rseq = 0;
    // 員工名單：直接取自公司名單（第 8.1 節）
    // 組別是承辦人提供的分組名單，已寫在 roster.js；名單上沒有的人沒有組別
    // declined 是承辦人手動標記的「不參加」（第 7.4.1 節）；示範資料不預先標記任何人，舊資料沒有這個欄位時視為 false
    const employees = (window.GH_ROSTER || []).map(r => ({ id: `e${++rseq}`, name: r.name, en: r.en || '', dept: r.dept, group: r.group || '', ext: r.ext || '', area: r.area || '', office: r.office || '', note: '', declined: false }));
    const people = [];
    const add = p => { const x = { id: `p${++seq}`, name: '', rosterId: null, employeeId: null, relation: '', childSeat: false, veg: false, staff: false, org: '', note: '', ...p }; people.push(x); return x; };
    // 參與人員依 2026 年報名表：會參加、員工名單找得到的員工報名；攜帶的一位眷屬掛在員工上（第 8.1 節）
    const byName = new Map(employees.map(e => [e.name, e]));
    (window.GH_REGISTRATIONS || []).forEach(r => {
      const e = byName.get(r.name); if (!e) return;
      const p = add({ cat: '員工', rosterId: e.id, veg: !!r.veg, note: r.note || '' });
      if (r.family) add({ cat: '眷屬', employeeId: p.id, childSeat: !!r.family.childSeat, veg: !!r.family.veg });
    });
    GUESTS.forEach(([name, org]) => add({ cat: '外部貴賓', name, org }));
    // 報名表沒有座位：桌次只有備註名稱，所有人從未入座開始，按「自動排座」排好再微調
    const tables = C.LAYOUT.map(t => ({ ...t, note: NOTES[t.no] || '', seats: [] }));

    return { seedVersion: SEED_VERSION, seq, rseq, employees, people, tables, mode: 'normal', pins: false, view: { zoomDesktop: null, zoomMobile: null, expanded: null, panel: null }, savedAt: null };
  }

  const SEED_VERSION = 8;
  window.GH_DATA = { C, Q, seed, iso, SEED_VERSION };
})();
