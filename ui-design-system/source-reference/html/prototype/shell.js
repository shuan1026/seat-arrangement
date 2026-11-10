/* Seat Arrangement 原型的 App Shell（Sidebar、Header、Mobile Drawer）與示範工具列。 */
(function () {
  const { $, esc, C } = GH;
  const { icon, node } = UI;
  const NAV = [
    { key: 'seating', label: '座位安排', href: 'seating.html', icon: 'armchair' },
    { key: 'people', label: '參與人員', href: 'people.html', icon: 'users' },
    { key: 'employees', label: '員工名單', href: 'employees.html', icon: 'id-card' },
  ];
  const cfg = { shell: true };
  let drawerOpen = false;

  // Logo（第 6.2 節）：圓桌加一個座位，字標是 Inter SemiBold 外框；與 assets/logo/ 的 SVG 同一組路徑
  const LOGO_SYMBOL = 'M40.74 25.86C40.74 36.14 32.41 44.46 22.14 44.46C11.86 44.46 3.54 36.14 3.54 25.86C3.54 15.59 11.86 7.26 22.14 7.26C23.99 7.26 25.78 7.53 27.46 8.04V13.14C27.46 17.22 30.78 20.54 34.86 20.54H39.96C40.47 22.22 40.74 24.01 40.74 25.86ZM34.86 3.54H40.06C42.49 3.54 44.46 5.51 44.46 7.94V13.14C44.46 15.57 42.49 17.54 40.06 17.54H34.86C32.43 17.54 30.46 15.57 30.46 13.14V7.94C30.46 5.51 32.43 3.54 34.86 3.54Z';
  const LOGO_WORD = 'M145.15 46.43Q143.96 46.43 143.09 46.13Q142.22 45.83 141.66 45.32Q141.1 44.8 140.86 44.16L142.79 43.46Q142.95 43.74 143.22 44.03Q143.5 44.31 143.96 44.5Q144.43 44.7 145.14 44.7Q146.2 44.7 146.84 44.2Q147.48 43.7 147.48 42.65V40.79H147.29Q147.12 41.14 146.8 41.52Q146.47 41.89 145.92 42.15Q145.37 42.4 144.52 42.4Q143.39 42.4 142.48 41.87Q141.56 41.34 141.02 40.27Q140.48 39.2 140.48 37.61Q140.48 35.99 141.02 34.88Q141.57 33.76 142.49 33.18Q143.41 32.6 144.54 32.6Q145.41 32.6 145.97 32.89Q146.54 33.18 146.87 33.59Q147.2 34 147.38 34.35H147.5V32.72H149.75V42.58Q149.75 43.88 149.15 44.74Q148.55 45.6 147.51 46.02Q146.47 46.43 145.15 46.43ZM92.29 42.55 96.86 29.45H99.85L104.51 42.55H101.94L100.83 39.3H95.93L94.86 42.55ZM162.45 42.55V32.72H164.6L164.67 34.59Q164.86 34.04 165.17 33.66Q165.62 33.1 166.21 32.83Q166.8 32.56 167.45 32.56Q168.52 32.56 169.17 33.23Q169.69 33.77 169.97 34.69Q170.17 34.14 170.51 33.73Q171 33.15 171.68 32.86Q172.35 32.56 173.11 32.56Q174 32.56 174.7 32.95Q175.41 33.33 175.82 34.08Q176.23 34.83 176.23 35.92V42.55H173.95V36.27Q173.95 35.36 173.45 34.94Q172.95 34.51 172.25 34.51Q171.69 34.51 171.29 34.75Q170.89 34.99 170.67 35.41Q170.45 35.82 170.45 36.38V42.55H168.23V36.17Q168.23 35.42 167.76 34.96Q167.3 34.51 166.56 34.51Q166.07 34.51 165.65 34.74Q165.23 34.98 164.98 35.42Q164.73 35.87 164.73 36.52V42.55ZM54.92 42.75Q53.4 42.75 52.27 42.28Q51.15 41.8 50.52 40.9Q49.89 39.99 49.84 38.7H52.15Q52.21 39.38 52.58 39.84Q52.95 40.29 53.56 40.52Q54.16 40.74 54.9 40.74Q55.67 40.74 56.26 40.51Q56.86 40.27 57.19 39.84Q57.53 39.42 57.53 38.86Q57.53 38.34 57.23 38.01Q56.94 37.67 56.4 37.45Q55.87 37.22 55.16 37.04L53.67 36.65Q52.04 36.23 51.11 35.37Q50.19 34.52 50.19 33.13Q50.19 31.97 50.82 31.11Q51.44 30.24 52.53 29.76Q53.61 29.28 54.98 29.28Q56.38 29.28 57.43 29.76Q58.48 30.24 59.07 31.09Q59.67 31.94 59.7 33.04H57.42Q57.33 32.2 56.67 31.73Q56 31.27 54.94 31.27Q54.21 31.27 53.67 31.49Q53.14 31.72 52.85 32.11Q52.57 32.5 52.57 32.99Q52.57 33.54 52.91 33.89Q53.24 34.25 53.76 34.46Q54.27 34.67 54.8 34.8L56.02 35.11Q56.75 35.28 57.44 35.58Q58.13 35.87 58.68 36.31Q59.23 36.76 59.55 37.39Q59.87 38.02 59.87 38.87Q59.87 40.02 59.28 40.9Q58.7 41.77 57.59 42.26Q56.48 42.75 54.92 42.75ZM122.67 42.75Q121.73 42.75 120.98 42.41Q120.24 42.08 119.8 41.42Q119.37 40.75 119.37 39.78Q119.37 38.95 119.68 38.41Q120 37.87 120.53 37.54Q121.06 37.22 121.73 37.05Q122.4 36.88 123.12 36.81Q123.98 36.71 124.51 36.64Q125.04 36.57 125.29 36.41Q125.55 36.26 125.55 35.92V35.88Q125.55 35.39 125.35 35.06Q125.16 34.72 124.78 34.54Q124.39 34.36 123.83 34.36Q123.26 34.36 122.84 34.54Q122.42 34.71 122.16 34.99Q121.9 35.27 121.77 35.6L119.65 35.17Q119.95 34.29 120.55 33.73Q121.16 33.16 122 32.88Q122.84 32.6 123.82 32.6Q124.51 32.6 125.22 32.76Q125.93 32.93 126.52 33.31Q127.11 33.69 127.47 34.35Q127.83 35 127.83 35.98V42.55H125.65V41.19H125.55Q125.34 41.61 124.95 41.97Q124.57 42.32 124 42.54Q123.43 42.75 122.67 42.75ZM75.13 42.75Q74.19 42.75 73.44 42.41Q72.7 42.08 72.26 41.42Q71.83 40.75 71.83 39.78Q71.83 38.95 72.14 38.41Q72.45 37.87 72.99 37.54Q73.52 37.22 74.19 37.05Q74.86 36.88 75.57 36.81Q76.43 36.71 76.97 36.64Q77.5 36.57 77.75 36.41Q78.01 36.26 78.01 35.92V35.88Q78.01 35.39 77.81 35.06Q77.62 34.72 77.23 34.54Q76.85 34.36 76.29 34.36Q75.72 34.36 75.3 34.54Q74.88 34.71 74.62 34.99Q74.35 35.27 74.23 35.6L72.11 35.17Q72.4 34.29 73.01 33.73Q73.62 33.16 74.46 32.88Q75.3 32.6 76.28 32.6Q76.97 32.6 77.68 32.76Q78.39 32.93 78.98 33.31Q79.57 33.69 79.93 34.35Q80.29 35 80.29 35.98V42.55H78.1V41.19H78.01Q77.8 41.61 77.41 41.97Q77.02 42.32 76.46 42.54Q75.89 42.75 75.13 42.75ZM182.82 42.75Q181.34 42.75 180.27 42.12Q179.2 41.5 178.62 40.37Q178.05 39.24 178.05 37.69Q178.05 36.18 178.62 35.03Q179.18 33.89 180.22 33.24Q181.26 32.6 182.67 32.6Q183.57 32.6 184.38 32.89Q185.19 33.18 185.82 33.78Q186.45 34.39 186.81 35.33Q187.17 36.26 187.17 37.56V38.27H180.32Q180.35 39.09 180.63 39.66Q180.95 40.3 181.52 40.63Q182.09 40.95 182.85 40.95Q183.35 40.95 183.76 40.81Q184.17 40.67 184.46 40.38Q184.76 40.1 184.91 39.68L187.01 40.11Q186.78 40.9 186.21 41.5Q185.63 42.09 184.77 42.42Q183.92 42.75 182.82 42.75ZM66.08 42.75Q64.6 42.75 63.53 42.12Q62.46 41.5 61.88 40.37Q61.31 39.24 61.31 37.69Q61.31 36.18 61.88 35.03Q62.45 33.89 63.49 33.24Q64.53 32.6 65.93 32.6Q66.83 32.6 67.64 32.89Q68.45 33.18 69.08 33.78Q69.71 34.39 70.07 35.33Q70.43 36.26 70.43 37.56V38.27H63.58Q63.61 39.09 63.89 39.66Q64.21 40.3 64.78 40.63Q65.36 40.95 66.11 40.95Q66.61 40.95 67.02 40.81Q67.43 40.67 67.72 40.38Q68.02 40.1 68.18 39.68L70.28 40.11Q70.04 40.9 69.47 41.5Q68.89 42.09 68.04 42.42Q67.18 42.75 66.08 42.75ZM156.33 42.75Q154.85 42.75 153.78 42.12Q152.71 41.5 152.13 40.37Q151.56 39.24 151.56 37.69Q151.56 36.18 152.12 35.03Q152.69 33.89 153.73 33.24Q154.77 32.6 156.18 32.6Q157.08 32.6 157.89 32.89Q158.7 33.18 159.33 33.78Q159.96 34.39 160.32 35.33Q160.67 36.26 160.67 37.56V38.27H153.83Q153.86 39.09 154.14 39.66Q154.46 40.3 155.03 40.63Q155.6 40.95 156.36 40.95Q156.86 40.95 157.27 40.81Q157.68 40.67 157.97 40.38Q158.27 40.1 158.42 39.68L160.52 40.11Q160.29 40.9 159.71 41.5Q159.14 42.09 158.28 42.42Q157.43 42.75 156.33 42.75ZM132.36 36.79V42.55H130.07V32.72H132.24L132.27 34.68Q132.66 33.75 133.3 33.24Q134.1 32.6 135.31 32.6Q136.32 32.6 137.07 33.03Q137.83 33.46 138.25 34.29Q138.67 35.12 138.67 36.3V42.55H136.38V36.65Q136.38 35.66 135.87 35.1Q135.36 34.54 134.46 34.54Q133.85 34.54 133.38 34.81Q132.9 35.07 132.63 35.57Q132.36 36.07 132.36 36.79ZM191.22 36.79V42.55H188.94V32.72H191.11L191.13 34.68Q191.52 33.75 192.17 33.24Q192.97 32.6 194.17 32.6Q195.18 32.6 195.94 33.03Q196.69 33.46 197.11 34.29Q197.53 35.12 197.53 36.3V42.55H195.25V36.65Q195.25 35.66 194.73 35.1Q194.22 34.54 193.32 34.54Q192.72 34.54 192.24 34.81Q191.77 35.07 191.5 35.57Q191.22 36.07 191.22 36.79ZM87.08 32.72V34.51H85.18V39.78Q85.18 40.31 85.41 40.56Q85.63 40.81 86.16 40.81Q86.31 40.81 86.57 40.78Q86.83 40.74 86.99 40.7L87.35 42.47Q86.97 42.58 86.58 42.63Q86.19 42.68 85.82 42.68Q84.41 42.68 83.65 41.98Q82.89 41.28 82.89 39.98V34.51H81.5V32.72H82.89V30.38H85.18V32.72ZM204.32 32.72V34.51H202.42V39.78Q202.42 40.31 202.64 40.56Q202.87 40.81 203.4 40.81Q203.55 40.81 203.81 40.78Q204.07 40.74 204.23 40.7L204.59 42.47Q204.21 42.58 203.82 42.63Q203.43 42.68 203.06 42.68Q201.65 42.68 200.89 41.98Q200.13 41.28 200.13 39.98V34.51H198.74V32.72H200.13V30.38H202.42V32.72ZM105.98 42.55V32.72H108.19V34.37H108.3Q108.57 33.51 109.22 33.05Q109.88 32.59 110.73 32.59Q110.92 32.59 111.16 32.61Q111.39 32.62 111.56 32.65V34.76Q111.42 34.71 111.1 34.67Q110.79 34.64 110.48 34.64Q109.85 34.64 109.34 34.91Q108.84 35.18 108.55 35.66Q108.26 36.14 108.26 36.77V42.55ZM113.12 42.55V32.72H115.33V34.37H115.44Q115.71 33.51 116.37 33.05Q117.02 32.59 117.87 32.59Q118.06 32.59 118.3 32.61Q118.54 32.62 118.7 32.65V34.76Q118.56 34.71 118.24 34.67Q117.93 34.64 117.63 34.64Q116.99 34.64 116.48 34.91Q115.98 35.18 115.69 35.66Q115.4 36.14 115.4 36.77V42.55ZM145.16 40.6Q145.91 40.6 146.43 40.24Q146.95 39.88 147.22 39.21Q147.49 38.53 147.49 37.59Q147.49 36.66 147.22 35.96Q146.96 35.26 146.44 34.87Q145.92 34.48 145.16 34.48Q144.39 34.48 143.87 34.89Q143.35 35.29 143.08 35.99Q142.82 36.69 142.82 37.59Q142.82 38.49 143.08 39.17Q143.35 39.85 143.87 40.22Q144.4 40.6 145.16 40.6ZM100.18 37.41 99.61 35.75Q99.27 34.69 98.9 33.36Q98.64 32.41 98.33 31.28Q98.04 32.42 97.78 33.38Q97.42 34.72 97.11 35.75L96.55 37.41ZM75.71 41.05Q76.42 41.05 76.94 40.77Q77.45 40.49 77.74 40.03Q78.02 39.57 78.02 39.02V37.86Q77.91 37.95 77.64 38.03Q77.38 38.11 77.04 38.17Q76.71 38.23 76.39 38.27Q76.07 38.32 75.85 38.35Q75.34 38.41 74.93 38.58Q74.52 38.74 74.28 39.02Q74.04 39.31 74.04 39.76Q74.04 40.18 74.26 40.47Q74.48 40.76 74.85 40.91Q75.23 41.05 75.71 41.05ZM123.25 41.05Q123.96 41.05 124.48 40.77Q124.99 40.49 125.28 40.03Q125.56 39.57 125.56 39.02V37.86Q125.45 37.95 125.18 38.03Q124.92 38.11 124.58 38.17Q124.25 38.23 123.93 38.27Q123.62 38.32 123.39 38.35Q122.88 38.41 122.47 38.58Q122.06 38.74 121.82 39.02Q121.59 39.31 121.59 39.76Q121.59 40.18 121.8 40.47Q122.02 40.76 122.39 40.91Q122.77 41.05 123.25 41.05ZM153.84 36.72H158.45Q158.39 36.17 158.21 35.72Q157.95 35.09 157.45 34.74Q156.94 34.39 156.19 34.39Q155.44 34.39 154.91 34.75Q154.38 35.1 154.1 35.7Q153.88 36.17 153.84 36.72ZM63.59 36.72H68.2Q68.15 36.17 67.96 35.72Q67.7 35.09 67.2 34.74Q66.69 34.39 65.94 34.39Q65.19 34.39 64.66 34.75Q64.13 35.1 63.86 35.7Q63.64 36.17 63.59 36.72ZM180.33 36.72H184.94Q184.88 36.17 184.7 35.72Q184.44 35.09 183.94 34.74Q183.43 34.39 182.68 34.39Q181.93 34.39 181.4 34.75Q180.87 35.1 180.59 35.7Q180.37 36.17 180.33 36.72Z';
  // 產品名稱只由 Logo 呈現，桌面與手機 Header 都不顯示；Logo 已確認為正式版（第 6.2 節）
  const logoFull = () => `<svg viewBox="0 0 208 72" role="img" aria-label="Seat Arrangement"><path fill="currentColor" transform="translate(0 17) scale(0.791667)" d="${LOGO_SYMBOL}"/><path fill="currentColor" d="${LOGO_WORD}"/></svg>`;
  UI.logoFull = logoFull; // 登入頁也放完整 Logo（第 7.1.3 節）
  const logoHTML = collapsed => `<div class="sidebar-logo">${collapsed
    ? `<svg viewBox="0 0 48 48" role="img" aria-label="Seat Arrangement"><path fill="currentColor" d="${LOGO_SYMBOL}"/></svg>`
    : logoFull()}</div>`;
  const faviconHTML = () => `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#1F2430" d="${LOGO_SYMBOL}"/></svg>`)}">`;

  const navHTML = collapsed => NAV.map(n => `<a class="nav-item" href="${n.href}" ${document.body.dataset.nav === n.key ? 'aria-current="page"' : ''} ${collapsed ? `aria-label="${n.label}" data-tip="${n.label}" data-tip-side="right"` : ''}>${icon(n.icon)}<span class="nav-label">${n.label}</span></a>`).join('');
  const sidebarState = () => GH.state.sidebar || (innerWidth < 1024 ? 'collapsed' : 'expanded');
  // 儲存狀態（第 7.1.1 節）：原型只會出現「已儲存」
  GH.savedLabel = () => (GH.state.savedAt ? `已儲存 ${GH.state.savedAt}` : '已儲存');
  GH.paintSaved = () => document.querySelectorAll('[data-save-state]').forEach(el => { el.textContent = GH.savedLabel(); });
  const actionsHTML = () => `<span class="save-state" data-save-state aria-live="polite">${esc(GH.savedLabel())}</span>`;
  // 使用者區塊（第 6.2 節）：Sidebar 底部顯示登入者；收合時只剩頭像，滑過以 Tooltip 顯示姓名
  const userHTML = collapsed => {
    const u = C.USER;
    const avatar = `<span class="sidebar-avatar" aria-hidden="true">${esc(u.name.slice(0, 1))}</span>`;
    const body = collapsed ? avatar : `${avatar}<span class="sidebar-user-text"><span class="sidebar-user-name truncate">${esc(u.name)}</span><span class="sidebar-user-meta truncate">${esc(u.email)}</span></span><span class="sidebar-user-chevron">${icon('chevrons-up-down')}</span>`;
    const label = collapsed ? `aria-label="${esc(u.name)}" data-tip="${esc(u.name)}" data-tip-side="right"` : '';
    return `<div class="sidebar-footer"><button type="button" class="sidebar-user-trigger" data-act="userMenu" aria-haspopup="menu" aria-expanded="false" ${label}>${body}</button></div>`;
  };

  function mountShell() {
    const content = [...document.body.children].filter(n => n.tagName !== 'SCRIPT');
    const shell = node(`<div class="app-shell"><aside class="desktop-sidebar sidebar" data-sidebar-scope="desktop"></aside>
      <header class="mobile-header"><button type="button" class="header-toggle" data-act="drawerOpen" aria-label="開啟選單">${icon('menu')}</button><div class="header-actions" data-header-actions></div></header>
      <div class="app-main"><header class="app-header desktop-header"><button type="button" class="header-toggle" data-act="sidebarToggle" aria-label="收合或展開側選單">${icon('panel-left')}</button><div class="header-actions" data-header-actions></div></header></div></div>`);
    const main = $('.app-main', shell);
    content.forEach(n => main.append(n));
    document.body.prepend(shell);
    addEventListener('resize', paintShell);
  }
  function paintShell() {
    const shell = $('.app-shell'); if (!shell) return;
    const st = sidebarState();
    shell.dataset.sidebar = st;
    const side = $('.desktop-sidebar', shell);
    side.dataset.state = st;
    side.innerHTML = `${logoHTML(st === 'collapsed')}<nav class="sidebar-nav" aria-label="主要導覽">${navHTML(st === 'collapsed')}</nav>${userHTML(st === 'collapsed')}`;
    document.querySelectorAll('[data-header-actions]').forEach(el => { el.innerHTML = actionsHTML(); });
    const demo = $('.demo-bar');
    if (demo) demo.classList.add('in-shell');
    document.documentElement.style.setProperty('--sidebar-width', st === 'collapsed' ? '48px' : '240px');
    const left = innerWidth >= 768 ? `calc(${st === 'collapsed' ? '48px' : '240px'} + 48px)` : '0px';
    if (demo && !demo.classList.contains('is-collapsed')) demo.style.left = left;
  }
  function closeDrawer() {
    drawerOpen = false;
    $('.mobile-drawer-backdrop')?.remove(); $('.mobile-drawer')?.remove();
    document.body.classList.remove('is-locked');
    document.removeEventListener('keydown', drawerKey);
    $('.mobile-header .header-toggle')?.focus();
  }
  const drawerKey = e => { if (e.key === 'Escape' && !document.querySelector('.floating')) closeDrawer(); };

  GH.act({
    sidebarToggle() { GH.state.sidebar = sidebarState() === 'collapsed' ? 'expanded' : 'collapsed'; GH.save(true); paintShell(); GH.afterShellChange && GH.afterShellChange(); },
    // 使用者選單（Dropdown Menu user-menu）：桌面在觸發區右側、底邊對齊；手機在 Drawer 裡往上開、和觸發區同寬
    userMenu(t) {
      const u = C.USER;
      const inDrawer = !!t.closest('.mobile-drawer');
      UI.menu(t, [
        { html: `<div class="user-menu-profile"><span class="name">${esc(u.name)}</span><span class="meta">${esc(u.email)}</span></div>` },
        { sep: true },
        { label: '登出', icon: 'log-out', onClick: () => { GH.state.signedIn = false; GH.flash('已登出。'); GH.save(true); location.href = 'login.html'; } },
      ], inDrawer ? { matchWidth: true, align: 'start', cls: 'user-menu' } : { side: 'right', minWidth: '200px', cls: 'user-menu' });
    },
    drawerOpen() {
      if (drawerOpen) return;
      drawerOpen = true;
      const back = node('<div class="mobile-drawer-backdrop"></div>');
      const d = node(`<aside class="mobile-drawer sidebar" aria-label="主要導覽">${logoHTML(false)}<nav class="sidebar-nav">${navHTML(false)}</nav>${userHTML(false)}</aside>`);
      back.addEventListener('click', closeDrawer);
      document.body.append(back, d);
      document.body.classList.add('is-locked');
      document.addEventListener('keydown', drawerKey);
      d.querySelector('a')?.focus();
    },
  });

  // ---- 示範工具列（第 4.3 節）
  function demoHTML(collapsed) {
    return collapsed
      ? `<button type="button" class="icon-btn demo-toggle-open" data-act="demoToggle" aria-label="展開示範工具列" data-tip="示範工具列">${icon('wrench')}</button>`
      : `<div class="demo-head"><span class="demo-title">${icon('wrench')}示範工具</span></div>
         ${UI.btn('情境導覽', { sm: true, icon: 'list-checks', act: 'demoScenario' })}
         ${Object.keys(GH.Q).length ? UI.btn(GH.state.pins ? '隱藏確認點' : '顯示確認點', { sm: true, icon: 'circle-help', act: 'demoPins', attrs: { 'aria-pressed': String(!!GH.state.pins) } }) : ''}
         <span data-demo-mode></span>
         ${UI.btn('重設資料', { sm: true, icon: 'rotate-ccw', act: 'demoReset' })}
         <span class="demo-end">${UI.iconBtn('chevron-down', '收合示範工具列', { act: 'demoToggle', sm: true })}</span>`;
  }
  let demoCollapsed = false;
  function paintDemo() {
    let bar = $('.demo-bar');
    if (!bar) { bar = node('<div class="demo-bar" role="region" aria-label="示範工具列（僅原型使用）"></div>'); document.body.append(bar); new ResizeObserver(syncDemoHeight).observe(bar); }
    bar.classList.toggle('is-collapsed', demoCollapsed);
    bar.innerHTML = demoHTML(demoCollapsed);
    bar.style.left = '';
    if (!demoCollapsed) {
      // 登入頁沒有資料，改放自己的示範控制項（登入結果，第 4.3 節）
      const mode = cfg.demoSelect ? cfg.demoSelect() : UI.select({ sm: true, ariaLabel: '資料狀態', prefix: '資料', value: GH.state.mode, options: [{ value: 'normal', label: '有資料' }, { value: 'empty', label: '空白' }, { value: 'loading', label: '載入中' }], onChange: v => { GH.state.mode = v; GH.save(true); GH.refresh && GH.refresh(); } });
      $('[data-demo-mode]', bar).replaceWith(mode);
    }
    if (cfg.shell) bar.classList.add('in-shell');
    paintShell();
    syncDemoHeight();
  }
  function syncDemoHeight() {
    const bar = $('.demo-bar');
    const h = bar && !demoCollapsed ? bar.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--demo-h', `${Math.ceil(h)}px`);
    GH.afterShellChange && GH.afterShellChange();
  }
  GH.act({
    demoToggle() { demoCollapsed = !demoCollapsed; GH.state.demoOpen = !demoCollapsed; GH.save(true); paintDemo(); },
    demoPins() { GH.state.pins = !GH.state.pins; GH.save(true); applyPins(); paintDemo(); },
    demoReset() {
      UI.alertDialog({ title: '要重設示範資料嗎？', body: '會清除這次示範新增與修改的內容，回到初始資料。', confirm: '重設資料', onConfirm: () => { GH.reset(); location.reload(); } });
    },
    demoScenario() {
      const body = node(`<div>${C.SCENARIO.map((s, i) => `<div class="scenario-step"><span class="scenario-no">${i + 1}</span><div><div>${esc(s.text)}</div>${s.hint ? `<div class="muted text-xs">${esc(s.hint)}</div>` : ''}</div>${UI.btn('前往', { sm: true, attrs: { 'data-step': i } })}</div>`).join('')}</div>`);
      body.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) { GH.state.mode = 'normal'; GH.save(true); location.href = C.SCENARIO[+b.dataset.step].href; } });
      UI.dialog({ title: '情境導覽', desc: '依核心情境逐步示範，點「前往」會開啟對應畫面。', body, wide: true });
    },
  });
  const applyPins = () => document.documentElement.classList.toggle('pins-on', !!GH.state.pins);

  // ---- 頁面生命週期
  GH.page = (o) => {
    GH.load();
    Object.assign(cfg, o);
    // 沒登入時先到登入頁，登入後回到原本要開的頁面（第 7.1.3 節）
    if (cfg.shell && !GH.state.signedIn) {
      document.documentElement.style.visibility = 'hidden';
      location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`);
      return;
    }
    if (!document.querySelector('link[rel="icon"]')) document.head.append(node(faviconHTML()));
    demoCollapsed = innerWidth < 768 ? true : GH.state.demoOpen === false;
    if (cfg.shell) mountShell();
    applyPins();
    const view = $('#view');
    const staticEls = () => document.querySelectorAll('.page-static');
    const draw = () => {
      UI.closeFloats();
      staticEls().forEach(n => { n.hidden = false; });
      if (!cfg.modeless && GH.mode() === 'loading') { view.innerHTML = cfg.skeleton === false ? '' : UI.skeleton(cfg.skeleton); return; }
      cfg.render(view);
      GH.afterRender && GH.afterRender();
    };
    GH.refresh = () => { if (cfg.shell) paintShell(); draw(); };
    paintDemo();
    draw();
    const fl = GH.state.flash;
    if (fl) { delete GH.state.flash; GH.save(true); UI.toast(fl.text, fl); }
    GH.save(true);
  };
  GH.notFound = () => {
    document.querySelectorAll('.page-static').forEach(n => { n.hidden = true; });
    $('#view').innerHTML = UI.empty({ icon: 'circle-help', title: '找不到這個頁面。', body: '連結可能已失效，或內容已被移除。', btn: UI.btn('回到座位安排', { v: 'primary', href: 'seating.html' }) });
  };
})();
