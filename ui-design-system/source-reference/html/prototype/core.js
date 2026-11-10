/* Seat Arrangement 原型的狀態與業務規則。資料只存在瀏覽器，不連接任何系統。
   兩份名單（第 8.1 節）：employees 是員工名單（公司全員，含分機），people 是參與人員；參與人員中的員工以 rosterId 對應員工名單。 */
(function () {
  const KEY = 'seat-arrangement-prototype-v1';
  const { C, Q, seed, iso } = window.GH_DATA;
  const GH = (window.GH = { C, Q, iso });
  let S = null;

  // ---- 儲存：localStorage 為主；被擋或跨檔案不共用時，退回同分頁的 window.name
  GH.load = () => {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* 私密模式等情況 */ }
    if (!raw && window.name && window.name.startsWith(KEY)) raw = window.name.slice(KEY.length);
    try { S = raw ? JSON.parse(raw) : null; } catch (e) { S = null; }
    if (!S || !S.people || !S.tables || !S.employees || S.seedVersion !== GH_DATA.SEED_VERSION) S = seed();
    if (!S.view) S.view = { zoomDesktop: null, zoomMobile: null, expanded: null, panel: null }; delete S.view.zoom; // 舊版的 zoom 是自動適合視窗算出來的，不當成手動縮放沿用
    GH.state = S;
    return S;
  };
  // 使用者的操作用 GH.save()，會更新儲存時間（第 7.1.1 節）；只記偏好時用 GH.save(true)
  GH.save = silent => {
    if (!silent) S.savedAt = GH.now();
    const raw = JSON.stringify(S);
    try { localStorage.setItem(KEY, raw); } catch (e) { /* 退回 window.name */ }
    try { window.name = KEY + raw; } catch (e) { /* 忽略 */ }
    if (!silent && GH.paintSaved) GH.paintSaved();
  };
  GH.reset = () => { const keep = { pins: S.pins, sidebar: S.sidebar, demoOpen: S.demoOpen, signedIn: S.signedIn, loginResult: S.loginResult }; S = seed(); Object.assign(S, keep); GH.state = S; GH.save(true); };
  GH.commit = () => { GH.save(); GH.refresh && GH.refresh(); };
  GH.uid = p => `${p}${++S.seq}`;

  // ---- 通用工具
  GH.$ = (s, r = document) => r.querySelector(s);
  GH.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  GH.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  GH.qs = n => new URLSearchParams(location.search).get(n);
  GH.today = () => iso(new Date());
  GH.now = () => { const t = new Date(); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
  // 文字檔加 BOM 讓 Excel 認得 UTF-8；Blob（例如 Excel 檔）直接下載
  GH.download = (name, data, type = 'text/csv;charset=utf-8') => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob(['﻿' + data], { type }));
    a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const has = (s, k) => String(s || '').toLowerCase().includes(k);

  // ---- 資料狀態（示範工具列切到空白時，兩份名單與座位都回傳空集合）
  const blank = () => S.mode === 'empty';
  GH.mode = () => S.mode;

  // ---- 員工名單（第 8.1 節）
  GH.employees = () => (blank() ? [] : S.employees);
  GH.employee = id => S.employees.find(e => e.id === id);
  GH.attendeeOf = e => (blank() ? null : S.people.find(p => p.cat === '員工' && p.rosterId === e.id) || null);
  GH.isRegistered = e => !!GH.attendeeOf(e);
  // 報名狀態（第 7.4.1 節）：有對應的參與人員就是已報名（自動判斷）；承辦人手動標記的是不參加；其餘是未報名。
  // 舊資料沒有 declined 欄位時視為 false
  GH.regStatus = e => (GH.isRegistered(e) ? '已報名' : e.declined ? '不參加' : '未報名');
  GH.isDeclined = e => GH.regStatus(e) === '不參加';
  GH.isUnregistered = e => GH.regStatus(e) === '未報名';
  // 標記不參加、改回未報名：只有沒報名的員工可以改，已報名的要先取消報名
  GH.setDeclined = (e, on) => { if (!e || GH.isRegistered(e)) return false; e.declined = !!on; return true; };
  // 員工的第二行：「部門・分機 {分機}」，沒有分機時只顯示部門（第 8.5 節）
  GH.deptExt = e => (e ? (e.ext ? `${e.dept}・分機 ${e.ext}` : e.dept) : '');
  GH.depts = () => { const out = []; S.employees.forEach(e => { if (e.dept && !out.includes(e.dept)) out.push(e.dept); }); return out; };
  GH.areas = () => { const out = []; S.employees.forEach(e => { if (e.area && !out.includes(e.area)) out.push(e.area); }); return out; };
  // 組別是部門之下的分組（第 8.1 節）；某部門的組別清單依員工名單首次出現的順序
  GH.groups = dept => { const out = []; S.employees.forEach(e => { if (e.dept === dept && e.group && !out.includes(e.group)) out.push(e.group); }); return out; };
  GH.sameName = (name, exceptId) => S.employees.find(e => e.name === name && e.id !== exceptId);
  GH.rosterMatches = (e, q) => { const k = String(q || '').trim().toLowerCase(); return !k || [e.name, e.en, e.dept, e.group, e.ext, e.area].some(s => has(s, k)); };
  // 名單順序（第 8.6 節）：部門依首次出現，部門內依組別首次出現（沒有組別的最後），再依員工名單順序
  const empRank = () => {
    const depts = GH.depts(), groups = new Map(), order = new Map();
    S.employees.forEach((e, i) => { order.set(e.id, i); if (!groups.has(e.dept)) groups.set(e.dept, []); const g = groups.get(e.dept); if (e.group && !g.includes(e.group)) g.push(e.group); });
    return e => { const d = depts.indexOf(e.dept), g = groups.get(e.dept) || []; return [d < 0 ? depts.length : d, e.group ? g.indexOf(e.group) : g.length, order.get(e.id)]; };
  };
  const cmpKeys = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  GH.sortedEmployees = () => { const rank = empRank(); return GH.employees().map(e => [rank(e), e]).sort((a, b) => cmpKeys(a[0], b[0])).map(x => x[1]); };
  // 全部 = 未報名 + 已報名 + 不參加
  GH.rosterStats = () => { const list = GH.employees(), registered = list.filter(GH.isRegistered).length, declined = list.filter(GH.isDeclined).length; return { total: list.length, registered, declined, unregistered: list.length - registered - declined }; };
  const empFields = v => ({ name: (v.name || '').trim(), en: (v.en || '').trim(), dept: (v.dept || '').trim(), group: (v.group || '').trim(), ext: (v.ext || '').trim(), area: (v.area || '').trim(), note: (v.note || '').trim() });
  // 新增的員工是未報名；編輯與匯入更新既有員工時不改不參加的標記（第 7.4.4 節）
  GH.addEmployee = v => { const e = { id: `e${++S.rseq}`, office: '', declined: false, ...empFields(v) }; S.employees.push(e); return e; };
  GH.updateEmployee = (e, v) => Object.assign(e, empFields(v));
  // 刪除員工：已報名者一併取消報名（第 8.4 節，見 Q19）
  GH.removeEmployee = e => {
    const p = GH.attendeeOf(e);
    const unregistered = p ? GH.unregister(p) : 0;
    S.employees = S.employees.filter(x => x.id !== e.id);
    return { unregistered };
  };

  // ---- 參與人員（第 8.1 節）
  GH.people = () => (blank() ? [] : S.people);
  GH.person = id => S.people.find(p => p.id === id);
  GH.attendeeEmployees = () => GH.people().filter(p => p.cat === '員工');
  GH.rosterOf = p => (p.cat === '員工' ? GH.employee(p.rosterId) : null);
  GH.familyOf = id => S.people.filter(p => p.cat === '眷屬' && p.employeeId === id);
  GH.employeeOf = p => (p.cat === '眷屬' ? GH.person(p.employeeId) : null);
  GH.nameOf = p => (p.cat === '員工' ? (GH.rosterOf(p) || {}).name || '' : p.name);
  // 眷屬顯示為「員工姓名_眷屬」，不加數字；一位員工最多一位眷屬
  GH.displayName = p => {
    if (p.cat !== '眷屬') return GH.nameOf(p);
    const e = GH.employeeOf(p);
    return `${e ? GH.nameOf(e) : '眷屬'}_眷屬`;
  };
  GH.deptOf = p => (p.cat === '員工' ? (GH.rosterOf(p) || {}).dept || '' : p.cat === '眷屬' ? (GH.employeeOf(p) ? GH.deptOf(GH.employeeOf(p)) : '') : '');
  GH.extOf = p => (p.cat === '員工' ? (GH.rosterOf(p) || {}).ext || '' : '');
  // 組別跟著員工名單；眷屬跟著所屬員工，外部貴賓沒有
  GH.groupOf = p => { const a = p.cat === '眷屬' ? GH.employeeOf(p) : p.cat === '員工' ? p : null, e = a ? GH.rosterOf(a) : null; return e ? e.group || '' : ''; };
  GH.secondary = p => (p.cat === '外部貴賓' ? p.org : p.cat === '員工' ? GH.deptExt(GH.rosterOf(p)) : GH.deptOf(p));
  GH.matches = (p, q) => {
    const k = String(q || '').trim().toLowerCase();
    if (!k) return true;
    return [GH.displayName(p), GH.deptOf(p), GH.groupOf(p), GH.extOf(p), p.org, p.relation].some(s => has(s, k));
  };
  // 預設排序（第 7.3.1 節）：依部門、組別與員工名單順序，眷屬緊接在所屬員工後面、外部貴賓最後
  GH.sortedPeople = () => {
    const rank = empRank(), n = GH.depts().length, porder = new Map(S.people.map((p, i) => [p.id, i]));
    const key = p => {
      if (p.cat === '外部貴賓') return [n + 1, 0, porder.get(p.id), 0];
      const a = p.cat === '眷屬' ? GH.employeeOf(p) : p, e = a ? GH.rosterOf(a) : null;
      if (!e) return [n, 0, porder.get(p.id), 0];
      return [...rank(e), p.cat === '眷屬' ? 1 : 0];
    };
    return GH.people().map(p => [key(p), p]).sort((a, b) => cmpKeys(a[0], b[0])).map(x => x[1]);
  };

  // ---- 桌次（第 8.2、8.3 節）
  GH.tables = () => S.tables;
  GH.table = no => S.tables.find(t => t.no === +no);
  GH.seats = t => (blank() ? [] : t.seats.map(GH.person).filter(Boolean));
  GH.tableOf = pid => (blank() ? null : S.tables.find(t => t.seats.includes(pid)) || null);
  // 每桌標準 10 位、最多 12 位（第 8.3 節）：剩餘的空位只算到 10 位為止；10 位以上是已滿，11、12 位是超過，12 位是上限
  GH.remaining = t => Math.max(0, C.CAPACITY - GH.seats(t).length);
  GH.isFull = t => GH.seats(t).length >= C.CAPACITY;
  GH.isOver = t => GH.seats(t).length > C.CAPACITY;
  GH.isMax = t => GH.seats(t).length >= C.MAX_SEATS;
  // 部門由名單自動產生：依人數多到少；有貴賓時加「貴賓」
  GH.labelsOf = list => {
    const count = {}; let guests = 0;
    list.forEach(p => { if (p.cat === '外部貴賓') guests++; else { const d = GH.deptOf(p); if (d) count[d] = (count[d] || 0) + 1; } });
    const labels = Object.entries(count).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    if (guests) labels.push('貴賓');
    return labels;
  };
  GH.tableLabels = t => GH.labelsOf(GH.seats(t));
  GH.tableLabel = t => GH.tableLabels(t).join('＋') || '空桌';
  GH.childSeats = t => GH.seats(t).filter(p => p.childSeat).length;
  GH.vegCount = t => GH.seats(t).filter(p => p.veg).length;
  // 工作人員是參與尾牙、活動當天值勤的員工（第 8.1 節）：放在座位圖右上角的工作人員桌，不佔 30 桌的座位，不算未入座
  GH.isStaff = p => p.cat === '員工' && !!p.staff;
  GH.staff = () => GH.sortedPeople().filter(GH.isStaff);
  // 工作人員桌的位數和一般桌相同：人員對話框的勾選只到 10 位（staffFull），拖移與「加入人員」可以到 12 位（staffMax）
  GH.staffFull = () => GH.staff().length >= C.CAPACITY;
  GH.staffMax = () => GH.staff().length >= C.MAX_SEATS;
  GH.unseated = () => GH.people().filter(p => !GH.isStaff(p) && !GH.tableOf(p.id));
  GH.stats = () => {
    // 空位每桌只算到 10 位為止（超過的桌算 0）；已滿算 10 位以上的桌（含超過），另外算超過的桌數（第 7.2.1 節）
    const total = GH.people().filter(p => !GH.isStaff(p)).length, seated = total - GH.unseated().length;
    const empty = S.tables.reduce((n, t) => n + GH.remaining(t), 0);
    return { total, seated, unseated: total - seated, empty, child: GH.people().filter(p => p.childSeat).length, full: S.tables.filter(GH.isFull).length, over: S.tables.filter(GH.isOver).length };
  };

  // ---- 入座操作：每個都回傳復原函式，由畫面負責儲存、提示與重畫
  const snapshot = list => { const s = list.map(t => [t, [...t.seats]]); return () => s.forEach(([t, seats]) => { t.seats = seats; }); };
  // cap 是這一次最多能放到幾位：選單類的入口（選擇桌次、人員對話框）用預設的 10 位，拖移用 12 位（第 8.3 節）
  GH.place = (pid, no, index, cap = C.CAPACITY) => {
    const to = GH.table(no), from = GH.tableOf(pid), p = GH.person(pid);
    if (!to || (p && GH.isStaff(p))) return null;
    if (from !== to && GH.seats(to).length >= cap) return null;
    const undo = snapshot([from, to].filter(Boolean));
    let i = index == null ? null : +index;
    if (from) {
      const cur = from.seats.indexOf(pid);
      from.seats = from.seats.filter(x => x !== pid);
      if (from === to && i != null && cur < i) i--;
    }
    if (i == null || i > to.seats.length) i = to.seats.length;
    to.seats.splice(i, 0, pid);
    return { undo, from, to };
  };
  GH.unseat = pid => {
    const t = GH.tableOf(pid);
    if (!t) return null;
    const undo = snapshot([t]);
    t.seats = t.seats.filter(x => x !== pid);
    return { undo, from: t };
  };
  // 放進或移出工作人員桌：只有員工可以放；放進時離開原本的桌次。回傳復原函式與原本的桌次
  // cap 同 GH.place：人員對話框只到 10 位，拖移與「加入人員」到 12 位
  GH.setStaff = (p, on, cap = C.CAPACITY) => {
    if (!p || p.cat !== '員工' || !!p.staff === !!on) return null;
    if (on && GH.staff().length >= cap) return null;
    const from = GH.tableOf(p.id), undoSeats = snapshot(S.tables), was = !!p.staff;
    p.staff = !!on;
    if (on) S.tables.forEach(t => { t.seats = t.seats.filter(x => x !== p.id); });
    return { undo: () => { undoSeats(); p.staff = was; }, from };
  };
  GH.clearTable = t => { const undo = snapshot([t]), count = t.seats.length; t.seats = []; return { undo, count }; };
  GH.addToTable = (ids, t) => {
    const undo = snapshot(S.tables);
    // 「加入人員」可以放到 12 位（第 7.2.3 節）
    const list = ids.slice(0, Math.max(0, C.MAX_SEATS - GH.seats(t).length));
    list.forEach(id => { S.tables.forEach(x => { x.seats = x.seats.filter(y => y !== id); }); t.seats.push(id); });
    return { undo, count: list.length };
  };
  GH.setNote = (t, text) => { t.note = String(text || '').trim(); };
  // 自動排座（第 8.6 節）：mode 'fill' 只排未入座、'reset' 先清空沒有備註名稱的桌再全部重排
  GH.autoSeatCandidates = () => GH.sortedPeople().filter(p => p.cat !== '外部貴賓' && !GH.isStaff(p) && !GH.tableOf(p.id));
  // 排座單位：同部門同組別的人一個單位；沒有組別的員工各自連同眷屬一個單位（名單已依部門、組別排好，所以只要看前一個單位）
  const seatUnits = list => {
    const units = [];
    list.forEach(p => {
      const dept = GH.deptOf(p), group = GH.groupOf(p), last = units[units.length - 1];
      const same = !!last && last.dept === dept && (group ? last.group === group : !last.group && p.cat === '眷屬' && last.people.some(x => x.id === p.employeeId));
      if (same) last.people.push(p); else units.push({ dept, group, people: [p] });
    });
    return units;
  };
  GH.autoSeat = mode => {
    const undo = snapshot(S.tables);
    const open = S.tables.filter(t => !t.note);
    if (mode === 'reset') open.forEach(t => { t.seats = []; });
    const candidates = GH.autoSeatCandidates(), ids = new Set(candidates.map(p => p.id));
    const units = seatUnits(candidates);
    const total = units.reduce((n, u) => n + u.people.length, 0);
    let first = null, last = null, placed = 0;
    const put = (t, people) => { if (!people.length) return; people.forEach(p => t.seats.push(p.id)); placed += people.length; if (first == null) first = t.no; last = t.no; };
    // 單獨的員工：這一次要排的人裡沒有他的眷屬的員工
    const single = p => p.cat === '員工' && !GH.familyOf(p.id).some(f => ids.has(f.id));
    // 補位（第 8.6 節）：從後面的單位找第一位單獨的員工，先同部門、再後面部門；被拆的那一組剩下的人不算
    const takeSingle = dept => {
      const rest = units.slice(1), order = [...rest.filter(x => x.dept === dept), ...rest.filter(x => x.dept !== dept)];
      for (const x of order) {
        const i = x.people.findIndex(single);
        if (i < 0) continue;
        const [p] = x.people.splice(i, 1);
        if (!x.people.length) units.splice(units.indexOf(x), 1);
        return p;
      }
      return null;
    };
    for (const t of open) {
      while (units.length && t.seats.length < C.CAPACITY) {
        const free = C.CAPACITY - t.seats.length, u = units[0];
        if (u.people.length <= free) { put(t, u.people); units.shift(); continue; }
        // 這一組排不進剩下的空位：先找同部門、再找後面部門排得進去的組來填（名單已依部門排序，找到的就是最近的）
        let j = units.findIndex((x, i) => i > 0 && x.dept === u.dept && x.people.length <= free);
        if (j < 0) j = units.findIndex((x, i) => i > 0 && x.people.length <= free);
        if (j > 0) { put(t, units[j].people); units.splice(j, 1); continue; }
        // 都排不進去：桌桌填滿，拆開這一組取剛好等於空位數的人填滿這一桌，剩下的人排在下一桌最前面。
        // 員工與眷屬一定同桌：取到的最後一位是後面緊跟著眷屬的員工時，兩人一起留到下一桌，空出的位子找單獨的員工補，找不到就留空
        let take = free;
        const end = u.people[take - 1], next = u.people[take];
        if (end && next && next.cat === '眷屬' && next.employeeId === end.id) take--;
        put(t, u.people.splice(0, take));
        if (take < free) { const p = takeSingle(u.dept); if (p) put(t, [p]); }
        break;
      }
      if (!units.length) break;
    }
    return { undo, placed, first, last, left: total - placed };
  };
  // 對調兩桌（第 8.3 節）：交換名單與備註名稱，桌號與位置不變
  GH.swapTables = (a, b) => {
    const prev = [[a, [...a.seats], a.note], [b, [...b.seats], b.note]];
    [a.seats, b.seats] = [b.seats, a.seats];
    [a.note, b.note] = [b.note, a.note];
    return { undo: () => prev.forEach(([t, seats, note]) => { t.seats = seats; t.note = note; }) };
  };

  // ---- 參與人員維護（第 8.4 節）
  const trim = s => String(s || '').trim();
  // 加入尾牙：員工名單的一位變成參與人員，可同時帶一位眷屬
  GH.register = (e, v = {}) => {
    if (GH.attendeeOf(e)) return null;
    // 不參加的員工加入尾牙後變成已報名，標記清掉（第 7.4.1 節）
    e.declined = false;
    const p = { id: GH.uid('p'), cat: '員工', name: '', rosterId: e.id, employeeId: null, relation: '', childSeat: !!v.childSeat, veg: !!v.veg, staff: !!v.staff, org: '', note: trim(v.note) };
    S.people.push(p);
    let family = null;
    if (v.family) { family = { id: GH.uid('p'), cat: '眷屬', name: '', rosterId: null, employeeId: p.id, relation: trim(v.family.relation), childSeat: !!v.family.childSeat, veg: !!v.family.veg, staff: false, org: '', note: '' }; S.people.push(family); }
    return { person: p, family };
  };
  // 取消報名：從參與人員移除，眷屬一併移除，座位空出來；員工名單不變
  GH.unregister = p => {
    const ids = [p.id, ...GH.familyOf(p.id).map(f => f.id)];
    S.tables.forEach(t => { t.seats = t.seats.filter(x => !ids.includes(x)); });
    S.people = S.people.filter(x => !ids.includes(x.id));
    return ids.length;
  };
  GH.addPerson = v => {
    // 三種類別都可以標注兒童椅與素食（第 8.1 節）
    const p = { id: GH.uid('p'), cat: v.cat, name: '', rosterId: null, employeeId: null, relation: '', childSeat: !!v.childSeat, veg: !!v.veg, staff: false, org: '', note: trim(v.note) };
    if (p.cat === '眷屬') { p.employeeId = v.employeeId || null; p.relation = trim(v.relation); }
    if (p.cat === '外部貴賓') { p.name = trim(v.name); p.org = trim(v.org); }
    S.people.push(p);
    return p;
  };
  // 員工改成工作人員時移到工作人員桌（第 8.1 節）
  GH.updatePerson = (p, v) => {
    p.note = trim(v.note); p.childSeat = !!v.childSeat; p.veg = !!v.veg;
    if (p.cat === '員工') GH.setStaff(p, !!v.staff);
    if (p.cat === '眷屬') { p.employeeId = v.employeeId || p.employeeId; p.relation = trim(v.relation); }
    if (p.cat === '外部貴賓') { p.name = trim(v.name); p.org = trim(v.org); }
    return p;
  };
  // 刪除眷屬或外部貴賓；員工用 GH.unregister
  GH.removePerson = p => {
    S.tables.forEach(t => { t.seats = t.seats.filter(x => x !== p.id); });
    S.people = S.people.filter(x => x.id !== p.id);
  };

  // ---- 匯出座位表（第 7.3.4 節）：和座位圖相同版面的工作表，畫面再把它轉成 Excel 檔
  // 每桌一個區塊，左格是標題、右邊十格依座位順序放名單；錯開半格的桌放在下一段十列。
  // 有桌次坐了 11、12 位時，只有那一段改為十二列，下面所有的列往下移兩列
  // 欄號從 1 起算：1 是圖例，A 區外、中、內三列的標題在 2、3、4 欄，B 區內、中、外在 7、8、9 欄，工作人員在 11 欄
  const SHEET_COL = [2, 3, 4, 7, 8, 9];
  GH.seatingFileName = () => `座位表_${GH.today().replaceAll('-', '')}.xlsx`;
  GH.seatingSheet = () => {
    const N = C.CAPACITY, cells = [];
    // 底色只能一種：依兒童椅、素食、貴賓的順序取第一個；兒童椅與素食另外寫在名字後面
    const mark = p => (p.childSeat ? 'child' : p.veg ? 'veg' : p.cat === '外部貴賓' ? 'guest' : '');
    const text = p => `${GH.displayName(p)}${p.childSeat ? '(+兒童椅)' : ''}${p.veg ? '(素食)' : ''}`;
    // slots 是右邊一欄要畫框的格數：桌次固定十格（含空位），未入座只框有人的格
    const title = (r, c, v, height, slots = height) => cells.push({ r, c, v, kind: 'title', height, slots });
    const name = (r, c, p) => cells.push({ r, c, v: text(p), kind: 'name', mark: mark(p) });
    [['貴賓', 'guest'], ['兒童椅', 'child'], ['素食', 'veg']].forEach(([v, m], i) => cells.push({ r: 3 + i, c: 1, v, kind: 'legend', mark: m }));
    // 段的高度：那一段有桌次超過 10 位時是十二列，否則十列；段的起點是前面各段高度的累加
    const BANDS = C.ROWS * 2 + 1, band = t => Math.round(t.row * 2);
    const height = Array.from({ length: BANDS }, (_, b) => (S.tables.some(t => band(t) === b && GH.isOver(t)) ? C.MAX_SEATS : N));
    const start = height.reduce((acc, h, b) => { acc.push(b ? acc[b - 1] + height[b - 1] : 1); return acc; }, []);
    S.tables.forEach(t => {
      const seats = GH.seats(t), b = band(t), r = start[b], c = SHEET_COL[t.col];
      title(r, c, [`第 ${t.no} 桌`, t.note, GH.tableLabel(t), `(${seats.length})`].filter(Boolean).join('\n'), height[b]);
      seats.forEach((p, i) => name(r + i, c + 1, p));
    });
    // 工作人員在右上角，沒有人時名單留白
    const staff = GH.staff();
    title(1, 11, `工作人員\n(${staff.length})`, Math.max(N, staff.length));
    staff.forEach((p, i) => name(1 + i, 12, p));
    // 未入座在座位圖下方空一列，每欄十位、每段十欄；沒有未入座時不放
    const left = GH.sortedPeople().filter(p => !GH.isStaff(p) && !GH.tableOf(p.id)), top = start[BANDS - 1] + height[BANDS - 1] + 1;
    if (left.length) {
      title(top, 2, `未入座\n(${left.length})`, N * Math.ceil(left.length / (N * 10)), 0);
      left.forEach((p, i) => name(top + Math.floor(i / (N * 10)) * N + (i % N), 3 + (Math.floor(i / N) % 10), p));
    }
    return { cells, rows: Math.max(...cells.map(x => x.r + (x.height || 1) - 1)), cols: 12 };
  };
})();
