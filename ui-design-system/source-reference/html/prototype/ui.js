/* Seat Arrangement 原型的共用元件，形狀與狀態依 references/03-components.md。 */
(function () {
  const { esc, $, $$, C } = GH;
  const ICONS = {
    armchair: '<path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z"/><path d="M5 18v2"/><path d="M19 18v2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'id-card': '<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
    'user-minus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/>',
    'user-x': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    baby: '<path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/>',
    'zoom-in': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
    'zoom-out': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    'unfold-vertical': '<path d="M12 22v-6"/><path d="M12 8V2"/><path d="M4 12H2"/><path d="M10 12H8"/><path d="M16 12h-2"/><path d="M22 12h-2"/><path d="m15 19-3 3-3-3"/><path d="m15 5-3-3-3 3"/>',
    'fold-vertical': '<path d="M12 22v-6"/><path d="M12 8V2"/><path d="M4 12H2"/><path d="M10 12H8"/><path d="M16 12h-2"/><path d="M22 12h-2"/><path d="m15 19-3-3-3 3"/><path d="m15 5-3 3-3-3"/>',
    'grip-vertical': '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    'panel-left': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
    'panel-left-close': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
    'panel-left-open': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
    'arrow-right-left': '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    'wand-sparkles': '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
    crosshair: '<circle cx="12" cy="12" r="10"/><path d="M22 12h-4"/><path d="M6 12H2"/><path d="M12 6V2"/><path d="M12 22v-4"/>',
    menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>', 'chevron-up': '<path d="m18 15-6-6-6 6"/>', 'chevron-right': '<path d="m9 18 6-6-6-6"/>', 'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevrons-left': '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>', 'chevrons-right': '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    ellipsis: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    'list-checks': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    'log-in': '<path d="m10 17 5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    'log-out': '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    'chevrons-up-down': '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  };
  const icon = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  const UI = (window.UI = { icon });
  const node = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  UI.node = node;

  // ---- 動作委派：data-act
  const actions = {};
  GH.act = map => Object.assign(actions, map);
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const fn = actions[t.dataset.act];
    if (fn) { e.preventDefault(); fn(t, e); }
  });

  // ---- 徽章（第 6.3 節）
  const STATUS = { 已滿: 'pos', 已報名: 'pos', 未入座: 'wait', 未報名: 'wait', 空桌: 'neu', 工作人員: 'neu' };
  const KIND_ICON = { pos: 'check', wait: 'clock' };
  UI.status = (key, label = key) => { const k = STATUS[key] || 'third'; return `<span class="badge badge--${k}">${KIND_ICON[k] ? icon(KIND_ICON[k]) : ''}${esc(label)}</span>`; };
  UI.badge = (text, v = 'outline') => `<span class="badge badge--${v}">${esc(text)}</span>`;
  // 兒童椅只放圖示的小徽章，滑過顯示 Tooltip，人員列和座位圖名單共用
  UI.childBadge = () => `<span class="badge badge--third seat-mark" data-tip="兒童椅" aria-label="兒童椅">${icon('baby')}</span>`;
  UI.vegBadge = () => `<span class="badge badge--third seat-mark" data-tip="素食" aria-label="素食">${icon('leaf')}</span>`;
  // 類別徽章：貴賓用 outline、兒童椅與素食用圖示；眷屬已經寫在顯示名稱裡，不另加徽章
  UI.catBadges = (p, o = {}) => `${p.cat === '外部貴賓' ? UI.badge('貴賓') : ''}${p.childSeat && o.child !== false ? UI.childBadge() : ''}${p.veg && o.veg !== false ? UI.vegBadge() : ''}`;
  // 人員列的第一行：顯示名稱加徽章，不換行，過長時姓名截斷；有兒童椅、素食欄的表格不重複標示
  UI.nameLine = (p, o = {}) => `<div class="person-name"><span class="truncate">${esc(GH.displayName(p))}</span>${UI.catBadges(p, o)}</div>`;
  // 座位安排人員面板的第二行（第 7.2.2 節）：員工與眷屬顯示「部門・組別」，部門可截斷、組別一定看得到；不放分機（分機看桌次詳情）
  UI.metaLine = p => {
    if (p.cat === '外部貴賓') return `<span class="person-meta truncate">${esc(p.org || '—')}</span>`;
    const dept = GH.deptOf(p), group = GH.groupOf(p);
    if (group) return `<span class="person-meta"><span class="truncate">${esc(dept)}</span><span class="meta-ext">・${esc(group)}</span></span>`;
    return `<span class="person-meta truncate">${esc(dept || '—')}</span>`;
  };
  // 座位圖名單卡片的小標示（第 6.6 節）：空間有限，貴賓用一個字「賓」、兒童椅與素食只放圖示，滑過顯示 Tooltip
  UI.seatMarks = p => `${p.cat === '外部貴賓' ? '<span class="badge badge--outline seat-mark" data-tip="貴賓" aria-label="貴賓">賓</span>' : ''}${p.childSeat ? UI.childBadge() : ''}${p.veg ? UI.vegBadge() : ''}`;
  // 桌次徽章：按下後在座位圖標示那一桌（第 7.2.2 節）；工作人員坐工作人員桌，顯示「工作人員」
  UI.seatBadge = (p, o = {}) => {
    if (GH.isStaff(p)) return UI.status('工作人員');
    const t = GH.tableOf(p.id);
    if (!t) return UI.status('未入座');
    return o.link ? `<a class="badge badge--outline" href="seating.html?table=${t.no}">第 ${t.no} 桌</a>` : `<button type="button" class="badge badge--outline" data-act="locate" data-no="${t.no}" aria-label="在座位圖標示第 ${t.no} 桌">第 ${t.no} 桌</button>`;
  };
  UI.pin = q => `<button type="button" class="q-pin" data-act="pin" data-q="${q}" aria-label="確認點 ${q}">${q.slice(1)}</button>`;

  // ---- 按鈕
  const attrs = o => Object.entries(o || {}).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
  UI.btn = (label, o = {}) => {
    const cls = `btn btn--${o.v || 'outline'} ${o.sm ? 'btn--sm' : ''} ${o.cls || ''}`;
    const inner = `${o.icon ? icon(o.icon) : ''}<span>${esc(label)}</span>`;
    const tip = o.tip ? `data-tip="${esc(o.tip)}"` : '';
    const act = o.act ? `data-act="${o.act}"` : '';
    if (o.href && !o.disabled) return `<a class="${cls}" href="${esc(o.href)}" ${tip} ${act} ${attrs(o.attrs)}>${inner}</a>`;
    const b = `<button type="button" class="${cls}" ${act} ${o.disabled ? 'disabled' : ''} ${o.disabled ? '' : tip} ${attrs(o.attrs)}>${inner}</button>`;
    return o.disabled && o.tip ? `<span data-tip="${esc(o.tip)}" tabindex="0">${b}</span>` : b;
  };
  UI.iconBtn = (ic, label, o = {}) => {
    const cls = `icon-btn ${o.sm ? 'icon-btn--sm' : ''} ${o.xs ? 'icon-btn--xs' : ''} ${o.outline ? 'icon-btn--outline' : ''} ${o.cls || ''}`;
    const b = `<button type="button" class="${cls}" aria-label="${esc(label)}" ${o.act ? `data-act="${o.act}"` : ''} ${o.disabled ? 'disabled' : `data-tip="${esc(o.tip || label)}"`} ${attrs(o.attrs)}>${icon(ic)}</button>`;
    return o.disabled && o.tip ? `<span data-tip="${esc(o.tip)}" tabindex="0">${b}</span>` : b;
  };
  UI.rowMenu = (act, id, label = '更多操作') => UI.iconBtn('ellipsis', label, { act, sm: true, attrs: { 'data-id': id } });

  // ---- 浮層（portal 到 body，捲動與縮放時重新定位）
  const floats = [];
  const place = (f) => {
    const { el, anchor, side, align, matchWidth } = f;
    if (!anchor.isConnected) return closeFloat(f);
    const a = anchor.getBoundingClientRect(), gap = 4, pad = 16, W = innerWidth, H = innerHeight;
    if (matchWidth) el.style.width = `${Math.min(a.width, W - 32)}px`;
    const r = el.getBoundingClientRect();
    let x, y;
    if (side === 'right') { x = a.right + gap; y = a.bottom - r.height; if (x + r.width > W - pad) { x = pad; y = a.top - r.height - gap; } }
    else {
      x = align === 'end' ? a.right - r.width : a.left;
      y = a.bottom + gap;
      if (y + r.height > H - pad - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--demo-h')) || 0) && a.top - r.height - gap > pad) y = a.top - r.height - gap;
    }
    x = Math.max(pad, Math.min(x, W - r.width - pad)); y = Math.max(pad, Math.min(y, H - r.height - pad));
    el.style.left = `${x}px`; el.style.top = `${y}px`;
  };
  const closeFloat = (f, refocus) => {
    const i = floats.indexOf(f);
    if (i < 0) return;
    floats.splice(i, 1); f.el.remove();
    if (f.anchor.setAttribute) f.anchor.setAttribute('aria-expanded', 'false');
    if (refocus && f.anchor.focus) f.anchor.focus();
    f.onClose && f.onClose();
  };
  UI.closeFloats = () => [...floats].reverse().forEach(f => closeFloat(f));
  UI.floating = (anchor, content, o = {}) => {
    const existing = floats.find(f => f.anchor === anchor);
    if (existing) { closeFloat(existing); return null; }
    [...floats].reverse().forEach(f => { if (!f.el.contains(anchor)) closeFloat(f); });
    const el = document.createElement('div');
    el.className = `floating ${o.cls || ''}`;
    if (typeof content === 'string') el.innerHTML = content; else el.append(content);
    document.body.append(el);
    const f = { el, anchor, side: o.side, align: o.align, matchWidth: o.matchWidth, onClose: o.onClose };
    floats.push(f);
    anchor.setAttribute && anchor.setAttribute('aria-expanded', 'true');
    place(f);
    return { el, close: refocus => closeFloat(f, refocus), place: () => place(f) };
  };
  const reposition = () => floats.forEach(place);
  addEventListener('scroll', reposition, true);
  addEventListener('resize', reposition);
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.floating')) return;
    [...floats].reverse().forEach(f => { if (!f.anchor.contains(e.target)) closeFloat(f); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && floats.length) { e.stopPropagation(); closeFloat(floats[floats.length - 1], true); } }, true);

  // ---- Dropdown Menu：action-menu
  UI.menu = (anchor, items, o = {}) => {
    const box = document.createElement('div');
    box.className = 'menu'; box.setAttribute('role', 'menu');
    let handle;
    items.filter(Boolean).forEach(it => {
      if (it.sep) { box.append(node('<div class="menu-sep"></div>')); return; }
      if (it.html) { box.append(node(it.html)); return; }
      const lead = it.icon ? `<span style="display:inline-flex">${icon(it.icon)}</span>` : '';
      const inner = `${lead}<span>${esc(it.label)}</span>`;
      const b = node(it.href && !it.disabled ? `<a class="menu-item" role="menuitem" href="${esc(it.href)}">${inner}</a>` : `<button type="button" class="menu-item" role="menuitem" ${it.disabled ? 'disabled' : ''}>${inner}</button>`);
      if (it.danger) b.classList.add('is-danger');
      if (it.tip) b.dataset.tip = it.tip;
      if (it.onClick) b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); handle && handle.close(); it.onClick(); });
      box.append(b);
    });
    box.addEventListener('keydown', e => {
      const list = $$('.menu-item:not([disabled])', box), i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (list[i + 1] || list[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (list[i - 1] || list[list.length - 1]).focus(); }
    });
    handle = UI.floating(anchor, box, { align: o.align || 'end', side: o.side, cls: o.cls, matchWidth: o.matchWidth });
    if (handle) { const first = $('.menu-item:not([disabled])', box); first && first.focus({ preventScroll: true }); box.style.minWidth = o.minWidth || '136px'; handle.place(); }
    return handle;
  };

  // ---- Dropdown Menu：select（可搜尋；allowNew 時找不到就能新增，給部門與稱謂欄位用）
  UI.select = (o) => {
    let value = o.value == null ? '' : o.value;
    const norm = list => (list || []).map(x => (typeof x === 'string' ? { value: x, label: x } : x));
    let options = norm(o.options);
    const root = node(`<div class="select ${o.sm ? 'select--sm' : ''}"><button type="button" class="select-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" ${o.ariaLabel ? `aria-label="${esc(o.ariaLabel)}"` : ''} ${o.id ? `id="${o.id}"` : ''} ${o.disabled ? 'disabled' : ''}><span class="value"></span>${icon('chevron-down')}</button></div>`);
    const trigger = $('.select-trigger', root), val = $('.value', root);
    const paint = () => {
      const cur = value === '' && o.placeholder ? null : options.find(x => x.value === value);
      val.textContent = cur ? (o.prefix ? `${o.prefix}：${cur.label}` : cur.label) : (o.placeholder || '請選擇');
      val.classList.toggle('is-placeholder', !cur);
    };
    paint();
    const choose = v => { value = v; paint(); o.onChange && o.onChange(v); };
    const open = () => {
      const box = document.createElement('div');
      box.className = 'menu'; box.setAttribute('role', 'listbox');
      let handle, active = -1;
      const renderList = q => {
        $$('.option,.option-empty', box).forEach(n => n.remove());
        const k = q.trim();
        const list = options.filter(x => !k || x.label.toLowerCase().includes(k.toLowerCase()));
        if (!list.length && !o.allowNew) box.append(node('<div class="option-empty">找不到符合的項目。</div>'));
        list.forEach(x => {
          const b = node(`<button type="button" class="option" role="option" aria-selected="${x.value === value}" ${x.disabled ? 'disabled' : ''}><span class="label">${esc(x.label)}</span>${x.value === value ? icon('check') : ''}</button>`);
          if (!x.disabled) b.addEventListener('click', () => { choose(x.value); handle.close(true); });
          box.append(b);
        });
        if (o.allowNew && k && !options.some(x => x.label === k)) {
          const b = node(`<button type="button" class="option option--new" role="option"><span class="label">${esc(o.allowNew(k))}</span></button>`);
          b.addEventListener('click', () => { options.push({ value: k, label: k }); choose(k); handle.close(true); });
          box.append(b);
        }
      };
      const keys = e => {
        const list = $$('.option:not([disabled])', box);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          active = e.key === 'ArrowDown' ? Math.min(active + 1, list.length - 1) : Math.max(active - 1, 0);
          list.forEach((n, i) => n.classList.toggle('is-active', i === active));
          list[active] && list[active].scrollIntoView({ block: 'nearest' });
          if (!o.searchable && list[active]) list[active].focus({ preventScroll: true });
        }
        if (e.key === 'Enter' && o.searchable && list[active]) { e.preventDefault(); list[active].click(); }
      };
      if (o.searchable) {
        const s = node(`<div class="option-search"><input class="input input--sm" placeholder="${esc(o.searchPlaceholder || '搜尋')}" aria-label="${esc(o.searchPlaceholder || '搜尋')}"></div>`);
        box.append(s);
        $('input', s).addEventListener('input', e => { active = -1; renderList(e.target.value); handle && handle.place(); });
      }
      renderList('');
      box.addEventListener('keydown', keys);
      handle = UI.floating(trigger, box, { matchWidth: !o.panelWidth, align: 'start' });
      if (!handle) return;
      if (o.panelWidth) { box.parentElement.style.width = o.panelWidth; handle.place(); }
      const focus = o.searchable ? $('input', box) : ($('.option[aria-selected="true"]', box) || $('.option', box));
      focus && focus.focus({ preventScroll: true });
    };
    trigger.addEventListener('click', open);
    trigger.addEventListener('keydown', e => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && trigger.getAttribute('aria-expanded') !== 'true') { e.preventDefault(); open(); } });
    root.getValue = () => value;
    root.setValue = v => { value = v; paint(); };
    root.setOptions = list => { options = norm(list); paint(); };
    root.focusTrigger = () => trigger.focus();
    return root;
  };

  // ---- 表單
  let fid = 0;
  UI.form = (fields, init = {}) => {
    const form = document.createElement('form');
    form.className = 'form'; form.noValidate = true;
    form.addEventListener('submit', e => e.preventDefault());
    const reg = {};
    const clear = name => { const r = reg[name]; if (!r) return; r.box.classList.remove('is-error'); r.help.textContent = r.f.help || ''; r.help.hidden = !r.f.help; };
    const setErr = (name, msg) => { const r = reg[name]; r.box.classList.add('is-error'); r.help.textContent = msg; r.help.hidden = false; };
    const check = name => {
      const r = reg[name], f = r.f, v = r.get(), empty = v === '' || v == null || (Array.isArray(v) && !v.length) || v === false;
      clear(name);
      let msg = '';
      if (f.required && empty) msg = f.requiredMsg || (['select', 'file', 'checks'].includes(f.type) ? `請選擇${f.label}。` : `請輸入${f.label}。`);
      if (!msg && f.validate) msg = f.validate(v, api.values()) || '';
      if (msg) setErr(name, msg);
      return !msg;
    };
    fields.filter(Boolean).forEach(f => {
      if (f.section !== undefined) { if (form.children.length) form.append(node('<hr class="separator" style="margin:0">')); if (f.section) form.append(node(`<div class="form-section">${esc(f.section)}${f.pin ? UI.pin(f.pin) : ''}</div>`)); return; }
      if (f.el) { form.append(f.el); return; }
      const id = `f${++fid}`, val = init[f.name] !== undefined ? init[f.name] : f.value;
      const box = node(`<div class="field" data-field="${esc(f.name)}"></div>`);
      const reqMark = f.required ? '<span class="req" aria-hidden="true">*</span>' : '';
      if (f.type !== 'checkbox') box.append(node(`<label for="${id}">${esc(f.label)}${reqMark}${f.pin ? UI.pin(f.pin) : ''}</label>`));
      let get, set, ctrl;
      switch (f.type) {
        case 'textarea': ctrl = node(`<textarea id="${id}" class="textarea" placeholder="${esc(f.placeholder || '')}" ${f.disabled ? 'disabled' : ''}></textarea>`); ctrl.value = val || ''; get = () => ctrl.value.trim(); set = v => { ctrl.value = v; }; break;
        case 'select': ctrl = UI.select({ id, options: f.options, value: val, placeholder: f.placeholder, searchable: f.searchable, searchPlaceholder: f.searchPlaceholder, allowNew: f.allowNew, disabled: f.disabled, onChange: v => { clear(f.name); f.onChange && f.onChange(v, api); } }); get = () => ctrl.getValue(); set = v => ctrl.setValue(v); break;
        case 'checkbox': ctrl = node(`<label class="checkbox"><input type="checkbox" id="${id}" ${val ? 'checked' : ''} ${f.disabled ? 'disabled' : ''}><span class="box">${icon('check')}</span><span>${esc(f.label)}${f.pin ? UI.pin(f.pin) : ''}</span></label>`); get = () => $('input', ctrl).checked; set = v => { $('input', ctrl).checked = !!v; }; $('input', ctrl).addEventListener('change', () => f.onChange && f.onChange(get(), api)); break;
        case 'file': {
          ctrl = node(`<div class="file-control"><span class="file-name truncate">${esc(val || f.placeholder || '尚未選擇檔案')}</span><input type="file" id="${id}" class="sr-only" accept="${esc(f.accept || '')}"><button type="button" class="btn btn--outline btn--sm">${esc(f.button || '選擇檔案')}</button></div>`);
          let name = val || '';
          const inp = $('input', ctrl);
          $('button', ctrl).addEventListener('click', () => inp.click());
          inp.addEventListener('change', () => { name = inp.files[0] ? inp.files[0].name : ''; $('.file-name', ctrl).textContent = name || f.placeholder || '尚未選擇檔案'; clear(f.name); check(f.name); f.onChange && f.onChange(name, api); });
          get = () => name; set = v => { name = v; $('.file-name', ctrl).textContent = v; };
          break;
        }
        case 'custom': ctrl = f.control; get = () => ctrl.getValue(); set = v => ctrl.setValue && ctrl.setValue(v); break;
        default: ctrl = node(`<input id="${id}" class="input" type="text" placeholder="${esc(f.placeholder || '')}" ${f.disabled ? 'disabled' : ''} autocomplete="off">`); ctrl.value = val || ''; get = () => ctrl.value.trim(); set = v => { ctrl.value = v; };
      }
      box.append(ctrl);
      const help = node(`<p class="field-help" ${f.help ? '' : 'hidden'}>${esc(f.help || '')}</p>`);
      box.append(help);
      const slot = node('<div data-slot hidden></div>');
      box.append(slot);
      form.append(box);
      reg[f.name] = { f, box, help, get, set, ctrl, slot };
      if (ctrl.matches && ctrl.matches('input,textarea')) {
        ctrl.addEventListener('blur', () => { if (ctrl.value || f.validateOnBlur !== false) { check(f.name); f.onBlur && f.onBlur(get(), api); } });
        ctrl.addEventListener('input', () => { if (box.classList.contains('is-error')) clear(f.name); f.onInput && f.onInput(get(), api); });
      }
    });
    const api = {
      el: form,
      has: n => !!reg[n],
      values: () => Object.fromEntries(Object.entries(reg).map(([k, r]) => [k, r.get()])),
      get: n => (reg[n] ? reg[n].get() : undefined), set: (n, v) => reg[n].set(v), ctrl: n => reg[n].ctrl, slot: n => reg[n].slot, error: setErr, clear,
      show: (n, on) => { if (reg[n]) reg[n].box.hidden = !on; },
      validate: () => {
        const names = Object.keys(reg).filter(n => !reg[n].box.hidden), bad = names.filter(n => !check(n));
        if (bad.length) { const b = reg[bad[0]].box; const t = b.querySelector('input,textarea,button'); t && t.focus(); }
        return !bad.length;
      },
    };
    return api;
  };

  // ---- Dialog / Alert Dialog
  const stack = [];
  UI.dialog = (o) => {
    UI.closeFloats();
    const prevFocus = document.activeElement;
    const overlay = node(`<div class="overlay"><div class="dialog ${o.wide ? 'dialog--wide' : ''} ${o.alert ? 'alert-dialog' : ''}" role="${o.alert ? 'alertdialog' : 'dialog'}" aria-modal="true" tabindex="-1">
      <div class="dialog-head"><h2></h2>${o.alert ? '' : `<button type="button" class="dialog-close" aria-label="關閉">${icon('x')}</button>`}</div><div class="dialog-body"></div><div class="dialog-foot"></div></div></div>`);
    const box = $('.dialog', overlay), body = $('.dialog-body', overlay), foot = $('.dialog-foot', overlay);
    const h = {
      el: box, body,
      setTitle: (t, pin) => { $('h2', overlay).innerHTML = esc(t) + (pin ? [].concat(pin).map(UI.pin).join('') : ''); box.setAttribute('aria-label', t); },
      setDesc: t => { let p = $('.dialog-head p', overlay); if (!p) { p = document.createElement('p'); $('h2', overlay).after(p); } p.textContent = t; },
      setBody: c => { body.innerHTML = ''; if (typeof c === 'string') body.innerHTML = c; else if (c) body.append(c); },
      setActions: list => {
        foot.innerHTML = '';
        foot.hidden = !list || !list.length;
        (list || []).forEach(a => {
          const b = node(UI.btn(a.label, { v: a.v || 'outline', icon: a.icon, disabled: a.disabled, tip: a.tip }));
          const target = b.matches('button,a') ? b : $('button', b);
          if (!a.disabled) target.addEventListener('click', ev => { ev.preventDefault(); if (a.onClick) { const r = a.onClick(h); if (r === false) return; } if (!a.keepOpen) h.close(); });
          foot.append(b);
        });
      },
      close: () => {
        const i = stack.indexOf(h); if (i < 0) return;
        stack.splice(i, 1); overlay.remove(); document.removeEventListener('keydown', onKey, true);
        if (!stack.length) document.body.classList.remove('is-locked');
        UI.closeFloats();
        if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
        o.onClose && o.onClose();
      },
    };
    const onKey = e => {
      if (stack[stack.length - 1] !== h) return;
      if (e.key === 'Escape' && !$$('.floating').length && !o.alert) { e.preventDefault(); h.close(); }
      if (e.key === 'Tab') {
        const list = $$('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]', box).filter(n => n.offsetParent !== null);
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    h.setTitle(o.title, o.pin);
    if (o.desc) h.setDesc(o.desc);
    h.setBody(o.body);
    h.setActions(o.actions);
    if (!o.alert) $('.dialog-close', overlay).addEventListener('click', () => h.close());
    overlay.addEventListener('mousedown', e => { if (e.target === overlay && !o.alert) h.close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    document.body.classList.add('is-locked');
    stack.push(h);
    const auto = o.focus === false ? null : $('input:not([type=file]):not([type=checkbox]):not([disabled]),textarea', body) || $('.select-trigger:not([disabled])', body);
    (auto || box).focus({ preventScroll: true });
    return h;
  };
  UI.alertDialog = (o) => UI.dialog({
    alert: true, title: o.title, desc: o.body, pin: o.pin,
    actions: [{ label: o.cancel || '取消', onClick: o.onCancel }, { label: o.confirm, v: o.danger ? 'danger' : 'primary', onClick: o.onConfirm }],
  });

  // ---- Sonner / Toast
  let viewport;
  UI.toast = (text, o = {}) => {
    if (!viewport) { viewport = node('<div class="toast-viewport" role="status" aria-live="polite"></div>'); document.body.append(viewport); }
    const type = o.type || 'success';
    const ic = { success: 'check', warning: 'triangle-alert', destructive: 'triangle-alert', info: 'info' }[type];
    const t = node(`<div class="toast toast--${type}">${ic ? icon(ic) : ''}<div class="body">${esc(text)}</div></div>`);
    if (o.action) {
      const b = node(UI.btn(o.action.label, { v: 'primary', sm: true }));
      b.addEventListener('click', () => { t.remove(); o.action.onClick(); });
      t.append(b);
    }
    // 按通知任何地方就關閉（第 6.7 節）；按「復原」這類按鈕則執行動作
    t.addEventListener('click', e => { if (!e.target.closest('.btn')) t.remove(); });
    viewport.append(t);
    setTimeout(() => t.remove(), o.duration || (o.action ? 6000 : 4000));
  };
  GH.flash = (text, o) => { GH.state.flash = { text, ...o }; };
  // 可復原的操作：Sonner 帶「復原」，按下後還原並重畫（第 7.1.2 節）
  UI.undoToast = (text, undo) => UI.toast(text, { action: { label: '復原', onClick: () => { undo(); GH.save(); UI.toast('已復原。'); GH.refresh && GH.refresh(); } } });

  // ---- Alert / Empty / Skeleton
  UI.alert = (title, o = {}) => `<div class="alert" role="${o.role || 'note'}">${icon(o.icon || 'info')}<div><div class="title">${esc(title)}</div>${o.body ? `<div class="muted">${esc(o.body)}</div>` : ''}${o.actions ? `<div class="actions">${o.actions}</div>` : ''}</div></div>`;
  UI.empty = (o) => `<div class="empty ${o.inline ? 'empty--inline' : ''}">${o.inline ? '' : `<span class="empty-icon">${icon(o.icon || 'inbox')}</span>`}<div class="title">${esc(o.title)}</div>${o.body ? `<div class="body">${esc(o.body)}</div>` : ''}${o.btn ? `<div class="actions">${o.btn}</div>` : ''}</div>`;
  const bars = n => Array.from({ length: n }, (_, i) => `<span class="skeleton" style="width:${[92, 78, 86, 64, 72][i % 5]}%"></span>`).join('');
  UI.skeleton = (kind = 'table') => {
    if (kind === 'map') return `<div class="skeleton-panel" style="margin-bottom:var(--space-4)">${bars(1)}</div><div class="skeleton-map" aria-busy="true">${Array(30).fill('<span class="skeleton"></span>').join('')}</div>`;
    return `<div class="skeleton-panel" aria-busy="true">${bars(8)}</div>`;
  };

  // ---- Tabs
  UI.tabsPill = (items, value, onChange, o = {}) => {
    const root = node(`<div class="tabs-pill ${o.cls || ''}" role="tablist"></div>`);
    items.forEach(it => {
      const b = node(`<button type="button" class="tab" role="tab" aria-selected="${it.value === value}">${esc(it.label)}${it.count != null ? ` <span class="num">${it.count}</span>` : ''}</button>`);
      b.addEventListener('click', () => onChange(it.value));
      root.append(b);
    });
    return root;
  };

  // ---- Pagination + Table（Data Management Pattern）
  UI.pagination = (total, page, size, onPage) => {
    const pages = Math.max(1, Math.ceil(total / size)), from = total ? (page - 1) * size + 1 : 0, to = Math.min(total, page * size);
    const root = node(`<div class="pagination"><span class="summary">第 ${from}-${to} 列，共 ${total} 列</span></div>`);
    if (pages > 1) {
      // 超過 7 頁時，只列第一頁、最後一頁與目前頁附近，中間用省略號
      const show = p => pages <= 7 || p === 1 || p === pages || Math.abs(p - page) <= 1 || (page <= 4 && p <= 4) || (page >= pages - 3 && p >= pages - 3);
      let nums = '', gap = false;
      for (let p = 1; p <= pages; p++) {
        if (!show(p)) { if (!gap) nums += '<span class="page-item page-item--ellipsis" aria-hidden="true">…</span>'; gap = true; continue; }
        gap = false;
        nums += `<button type="button" class="page-item num" data-p="${p}" ${p === page ? 'aria-current="page"' : ''} aria-label="第 ${p} 頁">${p}</button>`;
      }
      root.append(node(`<nav class="desktop-only" aria-label="分頁"><button type="button" class="page-nav" data-p="${page - 1}" ${page === 1 ? 'disabled' : ''}>${icon('chevron-left')}上一頁</button>${nums}<button type="button" class="page-nav" data-p="${page + 1}" ${page === pages ? 'disabled' : ''}>下一頁${icon('chevron-right')}</button></nav>`));
      root.append(node(`<nav class="mobile-only" aria-label="分頁">${[['chevrons-left', 1, '第一頁', page === 1], ['chevron-left', page - 1, '上一頁', page === 1], ['chevron-right', page + 1, '下一頁', page === pages], ['chevrons-right', pages, '最後一頁', page === pages]].map(([ic, p, l, d]) => `<button type="button" class="icon-btn icon-btn--outline" data-p="${p}" aria-label="${l}" ${d ? 'disabled' : ''}>${icon(ic)}</button>`).join('')}</nav>`));
      root.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b && !b.disabled) onPage(+b.dataset.p); });
    }
    return root;
  };
  UI.table = (o) => {
    const size = o.pageSize || 20, total = o.rows.length, pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(o.page || 1, pages);
    const rows = o.paged === false ? o.rows : o.rows.slice((page - 1) * size, page * size);
    const wrap = document.createElement('div');
    wrap.style.minWidth = '0';
    const hasCheck = o.columns.some(c => c.check);
    const th = c => `<th scope="col" class="${c.num ? 'is-num' : ''} ${c.check ? 'cell-check' : ''}">${c.actions ? '<span class="sr-only">操作</span>' : c.check ? (c.header ? c.header(rows) : `<span class="sr-only">${esc(c.label || '勾選')}</span>`) : esc(c.label)}${c.pin ? UI.pin(c.pin) : ''}</th>`;
    const td = (c, r) => `<td class="${[c.num && 'is-num', c.primary && 'cell-primary', c.hideMobile && 'hide-mobile', c.actions && 'cell-actions', c.check && 'cell-check'].filter(Boolean).join(' ')}" data-label="${esc(c.label || '')}"><span style="min-width:0">${c.render(r)}</span></td>`;
    wrap.append(node(`<div class="table-shell"><div class="table-scroll" tabindex="-1"><table class="data table--stack ${hasCheck ? 'table--check' : ''}" ${o.minWidth ? `style="min-width:${o.minWidth}"` : ''}><thead><tr>${o.columns.map(th).join('')}</tr></thead><tbody>${rows.map(r => `<tr ${o.rowKey ? `data-key="${esc(o.rowKey(r))}"` : ''}>${o.columns.map(c => td(c, r)).join('')}</tr>`).join('')}</tbody></table></div></div>`));
    if (o.paged !== false) wrap.append(UI.pagination(total, page, size, p => { o.onPage(p); }));
    return wrap;
  };

  // ---- Tooltip
  let tipEl = null;
  const hideTip = () => { tipEl && tipEl.remove(); tipEl = null; };
  const showTip = t => {
    hideTip();
    const text = t.dataset.tip; if (!text) return;
    tipEl = node(`<div class="tooltip" role="tooltip">${esc(text)}</div>`);
    document.body.append(tipEl);
    const a = t.getBoundingClientRect(), r = tipEl.getBoundingClientRect(), side = t.dataset.tipSide;
    let x = a.left + a.width / 2 - r.width / 2, y = a.top - r.height - 4;
    if (side === 'right') { x = a.right + 8; y = a.top + a.height / 2 - r.height / 2; }
    else if (y < 8) y = a.bottom + 4;
    tipEl.style.left = `${Math.max(16, Math.min(x, innerWidth - r.width - 16))}px`;
    tipEl.style.top = `${Math.max(8, y)}px`;
  };
  document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (t && !matchMedia('(hover: none)').matches) showTip(t); });
  document.addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) hideTip(); });
  document.addEventListener('focusin', e => { const t = e.target.closest('[data-tip]'); if (t && t.matches(':focus-visible')) showTip(t); });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('click', hideTip, true);
  document.addEventListener('dragstart', hideTip, true);

  // ---- 確認點
  GH.act({
    pin(el) {
      const q = el.dataset.q, [text, assume] = GH.Q[q] || ['', ''];
      UI.floating(el, `<div class="popover-panel stack-sm"><div class="row"><span class="badge badge--outline">${q}</span><span class="muted text-xs">第 9 節確認事項</span></div><div>${esc(text)}</div><div class="muted">目前假設：${esc(assume)}</div></div>`, { align: 'start' });
    },
  });

  // ---- 共用：桌次選項（第 7.2.4 節），已滿的停用並標示
  UI.tableOptions = (exceptNo) => GH.tables().filter(t => t.no !== exceptNo).map(t => {
    const full = GH.isFull(t);
    const desc = t.note || GH.tableLabels(t).join('＋');
    return { value: String(t.no), label: `第 ${t.no} 桌（剩 ${GH.remaining(t)} 位）${desc ? `・${desc}` : ''}${full ? '・已滿' : ''}`, disabled: full };
  });
  const fullToast = no => UI.toast(`第 ${no} 桌已滿，請先移出一位。`, { type: 'warning' });

  // ---- 共用對話框：選擇桌次（入座…／移至其他桌次…）
  UI.tableSelectDialog = (p, onDone) => {
    const cur = GH.tableOf(p.id), name = GH.displayName(p);
    const f = UI.form([{ name: 'no', label: '桌次', type: 'select', required: true, requiredMsg: '請選擇桌次。', placeholder: '選擇桌次', searchable: true, searchPlaceholder: '搜尋桌號、部門或備註名稱', options: UI.tableOptions(cur ? cur.no : null) }]);
    UI.dialog({
      title: cur ? `把 ${name} 移到其他桌次` : `安排 ${name} 入座`, body: f.el,
      actions: [{ label: '取消' }, {
        label: cur ? '確認移動' : '確認入座', v: 'primary',
        onClick: () => {
          if (!f.validate()) return false;
          const no = +f.get('no');
          const r = GH.place(p.id, no);
          if (!r) { fullToast(no); return false; }
          GH.save();
          UI.undoToast(cur ? `已把 ${name} 從第 ${cur.no} 桌移到第 ${no} 桌。` : `已把 ${name} 安排到第 ${no} 桌。`, r.undo);
          onDone ? onDone(no) : GH.refresh();
        },
      }],
    });
  };
  // 工作人員桌（第 7.2.5 節）：移出後變成未入座，可復原
  UI.unstaffPerson = (p, onDone) => {
    const r = GH.setStaff(p, false);
    if (!r) return;
    GH.save();
    UI.undoToast(`已把 ${GH.displayName(p)} 移出工作人員桌。`, r.undo);
    onDone ? onDone() : GH.refresh();
  };
  // 放進工作人員桌：只有員工可以放，桌滿或類別不對時提示；已入座的人會離開原本的桌次
  UI.toStaff = (p, onDone) => {
    if (!p || GH.isStaff(p)) return false;
    if (p.cat !== '員工') { UI.toast('只有員工可以放進工作人員桌。', { type: 'warning' }); return false; }
    const r = GH.setStaff(p, true);
    if (!r) { UI.toast('工作人員桌已滿，請先移出一位。', { type: 'warning' }); return false; }
    GH.save();
    const name = GH.displayName(p);
    UI.undoToast(r.from ? `已把 ${name} 從第 ${r.from.no} 桌移到工作人員桌。` : `已把 ${name} 放進工作人員桌。`, r.undo);
    onDone ? onDone() : GH.refresh();
    return true;
  };
  UI.unseatPerson = (p, onDone) => {
    const r = GH.unseat(p.id);
    if (!r) return;
    GH.save();
    UI.undoToast(`已把 ${GH.displayName(p)} 移出第 ${r.from.no} 桌。`, r.undo);
    onDone ? onDone() : GH.refresh();
  };
  // 刪除眷屬或外部貴賓（第 8.4 節）
  UI.deletePerson = (p, onDone) => {
    const name = GH.displayName(p);
    UI.alertDialog({ title: `要刪除 ${name} 嗎？`, body: '刪除後無法復原；已安排的座位會空出來。', confirm: '刪除人員', danger: true, onConfirm: () => { GH.removePerson(p); GH.save(); UI.toast(`已刪除 ${name}。`); onDone ? onDone() : GH.refresh(); } });
  };
  // 取消員工的報名（第 7.3.1、8.4 節）：員工名單不受影響
  UI.unregisterPerson = (p, onDone) => {
    const name = GH.nameOf(p);
    UI.alertDialog({ title: `要取消 ${name} 的報名嗎？`, body: `${name} 會從參與人員移除，眷屬一併移除，已安排的座位會空出來；員工名單不受影響，之後可以再加入。`, confirm: '確認取消報名', cancel: '返回', danger: true, onConfirm: () => { GH.unregister(p); GH.save(); UI.toast(`已取消 ${name} 的報名。`); onDone ? onDone() : GH.refresh(); } });
  };
  // 列操作：人員面板、桌次詳情、參與人員共用（第 7.2.2、7.2.3、7.3.1 節）；items 決定順序與範圍
  UI.personMenu = (el, p, o = {}) => {
    const seated = !!GH.tableOf(p.id);
    const items = {
      seat: { label: seated ? '移至其他桌次…' : '入座…', icon: seated ? 'arrow-right-left' : 'armchair', onClick: () => UI.tableSelectDialog(p, o.onDone) },
      unseat: seated && { label: '移出桌次', icon: 'user-minus', onClick: () => UI.unseatPerson(p, o.onDone) },
      edit: { label: '編輯', icon: 'pencil', onClick: () => UI.personDialog({ person: p, onDone: o.onDone }) },
      delete: p.cat === '員工'
        ? { label: '取消報名', icon: 'user-x', danger: true, onClick: () => UI.unregisterPerson(p, o.onDone) }
        : { label: '刪除', icon: 'trash', danger: true, onClick: () => UI.deletePerson(p, o.onDone) },
    };
    // 工作人員坐工作人員桌：入座與移出換成「移出工作人員桌」
    items.unstaff = { label: '移出工作人員桌', icon: 'user-minus', onClick: () => UI.unstaffPerson(p, o.onDone) };
    let order = o.items || ['seat', 'unseat', 'edit', 'delete'];
    if (GH.isStaff(p)) order = order.flatMap(k => (k === 'seat' ? ['unstaff'] : k === 'unseat' ? [] : [k]));
    UI.menu(el, order.flatMap(k => (k === 'delete' && items[k] ? [{ sep: 1 }, items[k]] : [items[k]])).filter(Boolean), { minWidth: '168px' });
  };

  // ---- 新增、編輯人員對話框（第 7.3.2 節）；從員工名單按「加入尾牙」時帶入 roster（第 7.4.3 節）
  UI.personDialog = (o = {}) => {
    const p = o.person || null, edit = !!p, roster = o.roster || null;
    const cat0 = roster ? '員工' : p ? p.cat : '員工';
    const fam = edit && p.cat === '員工' ? GH.familyOf(p.id) : [];
    const cur = p ? GH.tableOf(p.id) : null;
    const otherFamily = emp => GH.familyOf(emp.id).some(f => !p || f.id !== p.id);
    // 員工只能從員工名單選，已報名者停用（已確認）
    const rosterOpts = GH.sortedEmployees().map(e => { const taken = GH.isRegistered(e); return { value: e.id, label: `${e.name}（${GH.deptExt(e)}）${taken ? '・已報名' : ''}`, disabled: taken }; });
    // 眷屬的所屬員工只能選已報名的員工，已有眷屬的停用（第 8.1 節）
    const empOpts = GH.sortedPeople().filter(x => x.cat === '員工' && (!p || x.id !== p.id)).map(x => { const taken = otherFamily(x); return { value: x.id, label: `${GH.nameOf(x)}（${GH.secondary(x)}）${taken ? '・已有眷屬' : ''}`, disabled: taken }; });
    const relations = val => [...C.RELATIONS, ...(val && !C.RELATIONS.includes(val) ? [val] : [])];
    const relationField = (name, value, pin) => ({ name, label: '稱謂', type: 'select', value, placeholder: '選擇或輸入稱謂', searchable: true, searchPlaceholder: '選擇或輸入稱謂', allowNew: q => `新增稱謂「${q}」`, options: relations(value), pin });
    const rosterPreview = node('<p class="field-help" style="margin-top:calc(var(--space-2) * -1)"></p>');
    const paintRoster = id => { const e = id && GH.employee(id); rosterPreview.textContent = e ? GH.deptExt(e) : ''; rosterPreview.hidden = !e; };
    const preview = node('<p class="field-help" style="margin-top:calc(var(--space-2) * -1)"></p>');
    const paintPreview = id => { const e = id && GH.person(id); preview.textContent = e ? `將顯示為「${GH.nameOf(e)}_眷屬」` : ''; preview.hidden = !e; };
    const tableSep = node('<hr class="separator" style="margin:0">');
    const tableOpts = [{ value: '', label: '未入座' }, ...GH.tables().map(t => { const full = GH.isFull(t) && !(cur && cur.no === t.no); return { value: String(t.no), label: `第 ${t.no} 桌（剩 ${GH.remaining(t)} 位）${full ? '・已滿' : ''}`, disabled: full }; })];
    const f = UI.form([
      { name: 'cat', label: '類別', type: 'select', required: true, value: cat0, options: C.CATEGORIES, disabled: !!roster || !!fam.length, onChange: v => apply(v) },
      fam.length ? { el: node(UI.alert(`${GH.nameOf(p)} 有 ${fam.length} 位眷屬，要變更類別請先處理眷屬。`)) } : null,
      edit && p.cat === '員工'
        ? { name: 'rosterView', label: '員工', value: `${GH.nameOf(p)}（${GH.secondary(p)}）`, disabled: true, help: '姓名、部門與分機請到員工名單修改。' }
        : { name: 'rosterId', label: '員工', type: 'select', required: true, requiredMsg: '請選擇員工。', value: roster ? roster.id : '', placeholder: '搜尋姓名、分機或部門', searchable: true, searchPlaceholder: '搜尋姓名、分機或部門', options: rosterOpts, disabled: !!roster, help: '找不到？請先到員工名單新增。', onChange: paintRoster, validate: v => { const e = v && GH.employee(v); return e && GH.isRegistered(e) ? `${e.name} 已經報名了。` : ''; } },
      { el: rosterPreview },
      { name: 'childSeatEmp', type: 'checkbox', label: '需要兒童椅', value: p && p.cat === '員工' ? p.childSeat : false },
      { name: 'vegEmp', type: 'checkbox', label: '素食', value: p && p.cat === '員工' ? p.veg : false },
      // 工作人員放在工作人員桌（第 8.1 節），勾選後隱藏桌次；工作人員桌最多 10 位
      { name: 'staffEmp', type: 'checkbox', label: '工作人員', value: p && p.cat === '員工' ? p.staff : false, help: '活動當天值勤，放在座位圖右上角的工作人員桌，不算入座統計。', onChange: () => apply(f.get('cat')), validate: v => (v && !(p && p.staff) && GH.staffFull() ? '工作人員桌已滿，請先移出一位。' : '') },
      !edit ? { name: 'withFamily', type: 'checkbox', label: '同時加一位眷屬', onChange: () => apply(f.get('cat')) } : null,
      !edit ? { ...relationField('famRelation', ''), label: '眷屬稱謂' } : null,
      !edit ? { name: 'famChild', type: 'checkbox', label: '眷屬需要兒童椅' } : null,
      !edit ? { name: 'famVeg', type: 'checkbox', label: '眷屬素食' } : null,
      { name: 'employeeId', label: '所屬員工', type: 'select', required: true, value: p ? p.employeeId || '' : '', placeholder: '搜尋員工姓名', searchable: true, searchPlaceholder: '搜尋員工姓名', options: empOpts, onChange: paintPreview, validate: v => { const e = v && GH.person(v); return e && otherFamily(e) ? `${GH.nameOf(e)} 已經有一位眷屬，一位員工最多一位。` : ''; } },
      { el: preview },
      relationField('relation', p ? p.relation : ''),
      { name: 'name', label: '姓名', required: true, value: p ? p.name : '' },
      { name: 'org', label: '單位／頭銜', value: p ? p.org : '', placeholder: '例如 ○○科技 總經理' },
      { name: 'childSeat', type: 'checkbox', label: '需要兒童椅', value: p ? p.childSeat : false },
      { name: 'veg', type: 'checkbox', label: '素食', value: p ? p.veg : false },
      { name: 'note', label: '備註', type: 'textarea', value: p ? p.note : '', placeholder: '只給承辦人看，例如需要靠走道' },
      { el: tableSep },
      { name: 'tableNo', label: '桌次', type: 'select', value: cur ? String(cur.no) : '', options: tableOpts, help: '也可以之後在座位圖拖移入座。' },
    ]);
    const isStaff = () => f.get('cat') === '員工' && !!f.get('staffEmp');
    const apply = cat => {
      const emp = cat === '員工', famc = cat === '眷屬', guest = cat === '外部貴賓';
      ['rosterId', 'rosterView', 'childSeatEmp', 'vegEmp', 'staffEmp'].forEach(n => f.show(n, emp));
      paintRoster(emp ? (roster ? roster.id : f.get('rosterId')) : '');
      if (!edit) { f.show('withFamily', emp); const wf = emp && !!f.get('withFamily'); ['famRelation', 'famChild', 'famVeg'].forEach(n => f.show(n, wf)); }
      ['employeeId', 'relation'].forEach(n => f.show(n, famc));
      f.show('childSeat', famc || guest); f.show('veg', famc || guest);
      paintPreview(famc ? f.get('employeeId') : '');
      f.show('name', guest); f.show('org', guest);
      const seatable = !(emp && f.get('staffEmp'));
      f.show('tableNo', seatable); tableSep.hidden = !seatable;
    };
    apply(cat0);
    const seatTo = (person, no) => { const r = GH.place(person.id, no); if (!r) fullToast(no); return !!r; };
    UI.dialog({
      title: edit ? '編輯人員' : '新增人員', body: f.el,
      actions: [{ label: '取消' }, {
        label: roster ? '加入尾牙' : edit ? '儲存' : '新增人員', v: 'primary',
        onClick: () => {
          if (!f.validate()) return false;
          const v = f.values(), want = v.tableNo && !isStaff() ? +v.tableNo : null;
          if (v.cat === '員工' && !edit) {
            const e = GH.employee(v.rosterId);
            const r = GH.register(e, { note: v.note, childSeat: v.childSeatEmp, veg: v.vegEmp, staff: v.staffEmp, family: v.withFamily ? { relation: v.famRelation, childSeat: v.famChild, veg: v.famVeg } : null });
            if (!r) { UI.toast(`${e.name} 已經報名了。`, { type: 'warning' }); return false; }
            if (want) {
              seatTo(r.person, want);
              // 眷屬和員工進同一桌；剩一位時眷屬留在未入座（第 7.3.2 節）
              if (r.family) { if (GH.remaining(GH.table(want)) >= 1) GH.place(r.family.id, want); else UI.toast(`第 ${want} 桌只剩 1 位，${e.name}_眷屬先留在未入座。`, { type: 'info' }); }
            }
            GH.save();
            UI.toast(roster ? `已把 ${e.name} 加入尾牙。` : r.family ? `已新增 ${e.name} 與 1 位眷屬。` : `已新增 ${e.name}。`);
            o.onDone ? o.onDone(r.person) : GH.refresh();
            return;
          }
          const person = edit ? GH.updatePerson(p, v.cat === '員工' ? { ...v, childSeat: v.childSeatEmp, veg: v.vegEmp, staff: v.staffEmp } : v) : GH.addPerson(v);
          const now = GH.tableOf(person.id);
          if (want && (!now || now.no !== want)) seatTo(person, want);
          else if (!want && now) GH.unseat(person.id);
          GH.save();
          // 改成工作人員時會從原本的桌次移到工作人員桌（第 8.1 節）
          UI.toast(edit && cur && GH.isStaff(person) ? `已儲存，${GH.nameOf(person)} 已從第 ${cur.no} 桌移到工作人員桌。` : edit ? '已儲存' : `已新增 ${GH.displayName(person)}。`);
          o.onDone ? o.onDone(person) : GH.refresh();
        },
      }],
    });
  };

  // ---- 新增、編輯員工對話框（第 7.4.2 節）
  UI.employeeDialog = (o = {}) => {
    const e = o.employee || null, edit = !!e;
    const sameSlot = (name, api) => {
      const slot = api.slot('name'), d = name ? GH.sameName(name, e && e.id) : null;
      slot.hidden = !d;
      slot.innerHTML = d ? UI.alert(`已經有一位 ${d.name}（${d.dept}），請確認不是同一個人。`, { icon: 'triangle-alert' }) : '';
    };
    const f = UI.form([
      { name: 'name', label: '姓名', required: true, value: e ? e.name : '', onBlur: sameSlot, onInput: sameSlot },
      { name: 'en', label: '英文名', value: e ? e.en : '', placeholder: '例如 Tony' },
      { name: 'dept', label: '部門', type: 'select', required: true, value: e ? e.dept : '', placeholder: '選擇部門', searchable: true, searchPlaceholder: '搜尋或輸入部門', allowNew: q => `新增部門「${q}」`, options: GH.depts(), help: '選擇既有部門，或輸入新的部門名稱', onChange: (v, api) => { api.ctrl('group').setOptions(GH.groups(v)); api.set('group', ''); } },
      // 組別選項只列目前選的部門已有的組別，換部門後跟著換（第 7.4.2 節）
      { name: 'group', label: '組別', type: 'select', value: e ? e.group : '', placeholder: '選擇或輸入組別', searchable: true, searchPlaceholder: '選擇或輸入組別', allowNew: q => `新增組別「${q}」`, options: [...GH.groups(e ? e.dept : ''), ...(e && e.group && !GH.groups(e.dept).includes(e.group) ? [e.group] : [])] },
      { name: 'ext', label: '分機', value: e ? e.ext : '', placeholder: '例如 1234' },
      { name: 'area', label: '地區', type: 'select', value: e ? e.area : '', placeholder: '選擇或輸入地區', searchable: true, searchPlaceholder: '選擇或輸入地區', allowNew: q => `新增地區「${q}」`, options: [...GH.areas(), ...(e && e.area && !GH.areas().includes(e.area) ? [e.area] : [])] },
      { name: 'note', label: '備註', type: 'textarea', value: e ? e.note : '', placeholder: '只給承辦人看' },
    ]);
    if (e) sameSlot(e.name, f);
    UI.dialog({
      title: edit ? '編輯員工' : '新增員工', body: f.el,
      actions: [{ label: '取消' }, {
        label: edit ? '儲存' : '新增員工', v: 'primary',
        onClick: () => {
          if (!f.validate()) return false;
          const x = edit ? GH.updateEmployee(e, f.values()) : GH.addEmployee(f.values());
          GH.save();
          UI.toast(edit ? '已儲存' : `已新增 ${x.name}。`);
          o.onDone ? o.onDone(x) : GH.refresh();
        },
      }],
    });
  };
  // 刪除員工（第 8.4 節，已確認）：已報名者一併取消報名
  UI.deleteEmployee = (e, onDone) => {
    const reg = GH.isRegistered(e);
    UI.alertDialog({
      title: `要刪除 ${e.name} 嗎？`, confirm: '刪除員工', danger: true,
      body: reg ? `${e.name} 已報名尾牙，刪除後會一併取消報名、移除眷屬並空出座位。刪除後無法復原。` : '刪除後無法復原。',
      onConfirm: () => { GH.removeEmployee(e); GH.save(); UI.toast(`已刪除 ${e.name}。`); onDone ? onDone() : GH.refresh(); },
    });
  };

  // ---- 勾選人員加入：桌次（第 7.2.3 節）與工作人員桌（第 7.2.5 節）共用；k 是最多能勾的人數
  const pickPeopleDialog = ({ title, list: all, k, meta, emptyTitle, onConfirm }) => {
    if (!all.length) { UI.dialog({ title, body: UI.empty({ title: emptyTitle, inline: true }), actions: [{ label: '關閉' }] }); return; }
    const picked = new Set();
    const body = node(`<div class="stack-sm"><div class="input-icon">${icon('search')}<input class="input input--sm" placeholder="搜尋姓名、分機、部門或單位" aria-label="搜尋姓名、分機、部門或單位"></div><div class="stack-sm" data-list style="gap:0"></div></div>`);
    const list = $('[data-list]', body), input = $('input', body);
    let d;
    const paintActions = () => d && d.setActions([{ label: '取消' }, { label: `加入 ${picked.size} 位`, v: 'primary', disabled: !picked.size, onClick: () => onConfirm([...picked]) }]);
    const paintList = () => {
      const q = input.value;
      const rows = all.filter(p => GH.matches(p, q));
      list.innerHTML = rows.length ? rows.map(p => `<label class="checkbox tp-seat" style="min-height:44px"><input type="checkbox" value="${p.id}" ${picked.has(p.id) ? 'checked' : ''}><span class="box">${icon('check')}</span><span class="person-main">${UI.nameLine(p)}<span class="person-meta">${esc(meta(p) || '—')}</span></span></label>`).join('') : `<div class="option-empty">找不到「${esc(q)}」。</div>`;
    };
    list.addEventListener('change', e => {
      const c = e.target;
      if (c.checked && picked.size >= k) { c.checked = false; UI.toast(`最多只能再加入 ${k} 位。`, { type: 'warning' }); return; }
      if (c.checked) picked.add(c.value); else picked.delete(c.value);
      paintActions();
    });
    input.addEventListener('input', paintList);
    paintList();
    d = UI.dialog({ title, desc: `還有 ${k} 個空位。`, body, actions: [] });
    paintActions();
  };
  // 加入人員到桌次：從未入座的參與人員中勾選
  UI.addPeopleDialog = (t, onDone) => pickPeopleDialog({
    title: `加入人員到第 ${t.no} 桌`, k: GH.remaining(t), emptyTitle: '所有人都已入座。', meta: GH.secondary,
    list: GH.sortedPeople().filter(p => !GH.isStaff(p) && !GH.tableOf(p.id)),
    onConfirm: ids => {
      const r = GH.addToTable(ids, t);
      GH.save();
      UI.undoToast(`已把 ${r.count} 位人員加入第 ${t.no} 桌。`, r.undo);
      onDone ? onDone() : GH.refresh();
    },
  });
  // 加入人員到工作人員桌：從已報名的員工中勾選，已入座的人會離開原本的桌次
  UI.addStaffDialog = onDone => pickPeopleDialog({
    title: '加入人員到工作人員桌', k: C.CAPACITY - GH.staff().length, emptyTitle: '已報名的員工都在工作人員桌。',
    meta: p => { const t = GH.tableOf(p.id), g = GH.groupOf(p); return `${GH.deptOf(p)}${g ? `・${g}` : ''}${t ? `・第 ${t.no} 桌` : ''}`; },
    list: GH.sortedPeople().filter(p => p.cat === '員工' && !GH.isStaff(p)),
    onConfirm: ids => {
      const undos = ids.map(id => GH.setStaff(GH.person(id), true)).filter(Boolean);
      GH.save();
      UI.undoToast(`已把 ${undos.length} 位人員放進工作人員桌。`, () => undos.reverse().forEach(r => r.undo()));
      onDone ? onDone() : GH.refresh();
    },
  });

  // ---- 匯入（畫面示意）：參與人員（第 7.3.3 節）與員工名單（第 7.4.4 節）
  // 有 template 才顯示「下載範本」；參與人員匯入的是 Google 表單原檔，沒有範本（第 7.3.3 節）
  const importFlow = (o) => {
    const formatError = o.formatError || '檔案欄位和範本不一致，請下載範本後重新整理。';
    const f = UI.form([
      o.template ? { el: node(`<div>${UI.btn('下載範本', { v: 'link', icon: 'download', attrs: { 'data-template': 1 } })}</div>`) } : null,
      { name: 'file', label: '檔案', type: 'file', required: true, accept: '.csv', requiredMsg: '請選擇要匯入的檔案。', help: o.fileHelp, validate: v => (v && !/\.csv$/i.test(v) ? formatError : '') },
      { el: node(UI.alert(o.dupNote)) },
    ]);
    if (o.template) $('[data-template]', f.el).addEventListener('click', () => GH.download(o.templateName, o.template));
    const d = UI.dialog({
      title: o.title, pin: o.pin, desc: o.desc, body: f.el,
      actions: [{ label: '取消' }, {
        label: '開始匯入', v: 'primary', keepOpen: true,
        onClick: () => {
          if (!f.validate()) return false;
          d.setDesc(o.demoNote);
          d.setBody(`<div>${esc(o.done)}</div>`);
          d.setActions([{ label: '關閉' }, { label: '下載錯誤清單', v: 'primary', icon: 'download', keepOpen: true, onClick: () => UI.toast('已開始下載「匯入錯誤清單.csv」。原型不會產生實際檔案。', { type: 'info' }) }]);
          return false;
        },
      }],
    });
  };
  UI.importDialog = () => importFlow({
    title: '匯入參與人員',
    desc: '上傳尾牙報名表（Google 表單匯出的 CSV 檔），一次加入報名參加的員工與眷屬。系統會依名字與部門對應員工名單；外部貴賓、桌次與工作人員請在畫面上處理。',
    fileHelp: '請上傳 Google 表單匯出的原始檔案，不用修改內容。',
    formatError: '檔案欄位和報名表不一致，請上傳 Google 表單匯出的原始檔案。',
    dupNote: '已報名的員工會更新兒童椅、素食與備註，不會重複新增，座位不動；對不到員工名單或改填不參加的人會列為需要處理，不會自動取消報名。',
    demoNote: '這是畫面示意，不會實際新增人員。', done: '已匯入 24 位，2 筆需要處理。',
  });
  UI.importEmployeesDialog = () => importFlow({
    title: '匯入員工名單',
    desc: '上傳公司通訊錄匯出的 CSV 檔，一次建立或更新全部員工。',
    dupNote: '姓名與部門相同的員工會更新內容，不會重複新增；公共區域、會議室與「空位」的列會略過。',
    templateName: '員工名單範本.csv', template: '分機,姓名,英文名,手機號碼,部門,地區,辦公室,代接群組,組別\n',
    demoNote: '這是畫面示意，不會實際新增員工。', done: '已匯入 182 位員工，3 筆需要處理。',
  });
  // ---- 匯出座位表（第 7.3.4 節）：Excel 檔，版面和座位圖一樣；產生 Excel 的套件在第一次匯出時才載入
  const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  let excelLib = null;
  const loadExcel = () => excelLib || (excelLib = new Promise((resolve, reject) => {
    if (window.ExcelJS) { resolve(window.ExcelJS); return; }
    const s = document.createElement('script');
    s.src = EXCELJS;
    s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS')));
    s.onerror = () => { excelLib = null; s.remove(); reject(new Error('ExcelJS')); };
    document.head.append(s);
  }));
  // Excel 的顏色由語意 token 算出來：在頁面上量出實際顏色，轉成 ARGB
  const argb = (css, fallback) => {
    const el = document.createElement('span');
    el.style.color = css; document.body.append(el);
    const c = getComputedStyle(el).color; el.remove();
    let m = c.match(/^rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    let rgb = m ? m.slice(1, 4).map(Number) : null;
    if (!rgb) { m = c.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/); rgb = m ? m.slice(1, 4).map(x => Number(x) * 255) : null; }
    return rgb ? `FF${rgb.map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase()}` : fallback;
  };
  const sheetColors = () => ({
    guest: argb('color-mix(in srgb, var(--chart-cat-2) 24%, white)', 'FFE6DDF7'),
    child: argb('color-mix(in srgb, var(--chart-cat-4) 34%, white)', 'FFFBE7B5'),
    veg: argb('color-mix(in srgb, var(--chart-cat-5) 26%, white)', 'FFD5EED9'),
    title: argb('var(--muted)', 'FFF2F2F2'),
    border: argb('var(--semantic-border)', 'FFD9D9D9'),
  });
  UI.seatingWorkbook = async () => {
    const ExcelJS = await loadExcel();
    const sheet = GH.seatingSheet(), color = sheetColors();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('座位表', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = Array.from({ length: sheet.cols }, (_, i) => ({ width: i === 0 ? 8 : 15 }));
    const line = { style: 'thin', color: { argb: color.border } };
    const box = { top: line, left: line, bottom: line, right: line };
    const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
    sheet.cells.forEach(x => {
      const cell = ws.getCell(x.r, x.c);
      cell.value = x.v;
      cell.border = box;
      if (x.mark) cell.fill = fill(color[x.mark]);
      if (x.kind === 'title') {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.fill = fill(color.title);
        if (x.height > 1) ws.mergeCells(x.r, x.c, x.r + x.height - 1, x.c);
      }
    });
    // 桌次的十格名單都畫框線，空位也看得出來
    sheet.cells.filter(x => x.kind === 'title').forEach(x => { for (let i = 0; i < x.slots; i++) ws.getCell(x.r + i, x.c + 1).border = box; });
    return wb;
  };
  UI.exportSeating = async () => {
    try {
      const wb = await UI.seatingWorkbook();
      const buf = await wb.xlsx.writeBuffer();
      GH.download(GH.seatingFileName(), new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      UI.toast('已匯出座位表。');
    } catch (e) {
      UI.toast('匯出座位表失敗，請確認網路連線後再試一次。', { type: 'destructive' });
    }
  };
})();
