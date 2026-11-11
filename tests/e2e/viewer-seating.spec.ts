// 檢視者的座位安排頁與寫入 API：docs/spec/seating.md SEAT-R90（隱藏的操作與照常的操作）、第 5.13 節 SEAT-AC99～AC105；
// docs/spec/README.md COM-R19、COM-AC23（座位安排的部分）、AUTH-R12、AUTH-R13、AUTH-AC16、AUTH-AC17；D-021、D-026。
// 檢視者用 helpers/auth.ts 的 signInAsViewer（以 VIEWER 寫進權限名單）。
// 「乙在權限頁把甲改為檢視者」（AUTH-AC17；SEAT-AC105 寫的「移除了甲的編輯權限」依預期結果也是這個情況，AUTH-R13）
// 用 helpers/permissions-db.ts 的 makeViewer 直接改資料庫模擬；從名單移除（AUTH-R17）見 tests/e2e/no-access.spec.ts。
// 桌號（D-019）：測試資料用內部編號（3 = B4、7 = B2、8 = B5），畫面上用桌號。無障礙結構的假設見 helpers/seating-page.ts 開頭。
import { expect, test, type Page } from '@playwright/test';
import { signIn, signInAsViewer, TEST_USER, VIEWER_USER } from './helpers/auth';
import { expectNoHorizontalScroll, fetchFromPage, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { isPublished, makeViewer, memberIdOf, memberList, setMembers, setPublished } from './helpers/permissions-db';
import { navNames, NOT_EDITOR_TOAST, openNav, recordWrites, sendJson, viewOnlyBadge } from './helpers/permissions-page';
import { noteNameOf, participantCount, seatOf, seed } from './helpers/seating-data';
import {
  cardRows,
  dragAndDrop,
  detailRows,
  expandAll,
  expectNoToast,
  expectToast,
  hasBorderColor,
  mapTable,
  openSeating,
  openStaffDetail,
  openTableDetail,
  panelSearch,
  panelTab,
  peoplePanel,
  personRow,
  rowWithName,
  seatMap,
  showMap,
  showPeople,
  statsLine,
  tableButton,
  tableDetail,
  toolbarButton,
} from './helpers/seating-page';

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面才有拖移與浮出的桌次詳情');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.describe('檢視者（SEAT-R90）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInAsViewer(context, requireBaseURL(baseURL));
  });

  test('SEAT-AC99：頁首只有「匯出座位表」；工具列沒有「自動排座」、其他照常；沒有拖移把手；人員列沒有列操作；統計列、搜尋、分頁照常', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('王小明', { department: '研發一部', extension: '1234' });
      await s.employee('王大同', { department: '研發一部', tableId: 3 });
      await s.employee('李美華', { department: '業務部', tableId: 7 });
    });
    await openSeating(page);

    await expect(button(page, '匯出座位表')).toBeVisible();
    await expect(button(page, '新增人員')).toHaveCount(0);
    await expect(button(page, '發布')).toHaveCount(0);
    await expect(statsLine(page)).toBeVisible();

    for (const name of ['縮小', '放大', '適合視窗', '全部展開']) await expect(toolbarButton(page, name), name).toBeVisible();
    await expect(toolbarButton(page, '自動排座')).toHaveCount(0);
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);

    await showPeople(page);
    await expect(peoplePanel(page).getByRole('button', { name: '更多操作' })).toHaveCount(0);
    await panelSearch(page).fill('王小明');
    await expect(personRow(page, '王小明')).toBeVisible();
    await panelSearch(page).fill('');
    await panelTab(page, '全部').click();
    await expect(personRow(page, '李美華')).toBeVisible();
    await expect(peoplePanel(page).getByRole('button', { name: '更多操作' })).toHaveCount(0);
  });

  test('SEAT-AC100：把王小明的列拖到 B4 桌、全部展開後把 B4 桌的名單列拖到 B2 桌 → 都拖不動，資料不變，沒有 Sonner', async ({ page }) => {
    desktopOnly(page);
    const { wang, dong } = await seed(async (s) => ({
      wang: await s.employee('王小明', { department: '研發一部' }),
      dong: await s.employee('王大同', { department: '研發一部', tableId: 3 }),
    }));
    const writes = recordWrites(page);
    await openSeating(page);

    await dragAndDrop(page, personRow(page, '王小明'), mapTable(page, 3));
    await page.waitForTimeout(500);
    expect(await seatOf(wang)).toEqual({ tableId: null, seatOrder: null });
    await expectNoToast(page);

    await expandAll(page);
    await dragAndDrop(page, rowWithName(cardRows(page, 3), page, '王大同'), mapTable(page, 7));
    await page.waitForTimeout(500);
    expect(await seatOf(dong)).toEqual({ tableId: 3, seatOrder: 0 });
    await expectNoToast(page);
    expect(writes).toEqual([]);
  });

  test('SEAT-AC101：B2 桌「主桌」、王小明（分機 1234、素食）→ 詳情有標題、副標、「主桌」文字、部門、素食與名單；沒有任何修改的入口；名單列不能拖。B5 桌沒有備註名稱那一行', async ({
    page,
  }) => {
    const { wang } = await seed(async (s) => {
      const id = await s.employee('王小明', { department: '研發一部', extension: '1234', tableId: 7, vegetarian: true });
      await s.employee('陳大文', { department: '研發一部', tableId: 8 });
      await s.noteName(7, '主桌');
      return { wang: id };
    });
    const writes = recordWrites(page);
    await openSeating(page);

    const detail = await openTableDetail(page, 7);
    await expect(detail.getByRole('heading', { name: 'B2 桌', exact: true })).toBeVisible();
    await expect(detail).toContainText('1/10 人');
    await expect(detail.getByText('主桌', { exact: true })).toBeVisible();
    await expect(detail).toContainText('部門：研發一部');
    await expect(detail).toContainText('素食 1 位');
    const rows = detailRows(detail);
    await expect(rowWithName(rows, page, '王小明')).toContainText('研發一部・分機 1234');
    await expect(rowWithName(rows, page, '王小明').getByLabel('素食')).toBeVisible();

    await expect(detail.getByRole('textbox', { name: '備註名稱' })).toHaveCount(0);
    for (const name of ['董事貴賓', '供應商', '客戶貴賓', '加入人員', '調換桌次…', '清空桌次']) {
      await expect(detail.getByRole('button', { name, exact: true }), name).toHaveCount(0);
    }
    await expect(detail.getByText('拖移可以調整順序，也可以從人員面板直接拖進來。')).toHaveCount(0);
    await expect(detail.getByRole('button', { name: '更多操作' })).toHaveCount(0);

    if (!isMobileWidth(page)) {
      await dragAndDrop(page, rowWithName(rows, page, '王小明'), mapTable(page, 3));
      await page.waitForTimeout(500);
      expect(await seatOf(wang)).toEqual({ tableId: 7, seatOrder: 0 });
    }

    await detail.getByRole('button', { name: '關閉' }).first().click();
    await expect(tableDetail(page, 7)).toHaveCount(0);
    const b5 = await openTableDetail(page, 8);
    await expect(b5.getByRole('textbox', { name: '備註名稱' })).toHaveCount(0);
    await expect(b5.getByText('主桌', { exact: true })).toHaveCount(0);
    await expect(b5.getByText(/備註名稱/)).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test('SEAT-AC102：工作人員桌有 3 位 → 詳情有標題、副標「3/10 人」、說明、部門與名單；沒有名單說明、列操作與「加入人員」', async ({ page }) => {
    await seed(async (s) => {
      await s.staff('工作甲', { department: '總務部' });
      await s.staff('工作乙', { department: '總務部' });
      await s.staff('工作丙', { department: '總務部' });
    });
    await openSeating(page);

    const detail = await openStaffDetail(page);
    await expect(detail.getByRole('heading', { name: '工作人員桌', exact: true })).toBeVisible();
    await expect(detail).toContainText('3/10 人');
    await expect(detail).toContainText('活動當天值勤的員工，不算入座統計；匯出時列在座位表右上角。');
    await expect(detail).toContainText('部門：總務部');
    await expect(detailRows(detail).filter({ hasText: '工作甲' })).toHaveCount(1);
    await expect(detail.getByText('從人員面板或其他桌次拖進來，或按「加入人員」。只有員工可以放進來。')).toHaveCount(0);
    await expect(detail.getByRole('button', { name: '更多操作' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toHaveCount(0);
  });

  test('SEAT-AC103：王小明在 B4 桌 → 人員面板「全部」按他的「B4」→ 座位圖標示 B4 桌；按「匯出座位表」→ 下載座位表', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明', { department: '研發一部', tableId: 3 });
    });
    await openSeating(page);

    await showPeople(page);
    await panelTab(page, '全部').click();
    await personRow(page, '王小明').getByRole('button', { name: 'B4', exact: true }).click();
    await showMap(page);
    await expect.poll(() => hasBorderColor(page, mapTable(page, 3), '--accent', '2px')).toBe(true);

    const download = page.waitForEvent('download');
    await button(page, '匯出座位表').click();
    expect((await download).suggestedFilename()).toMatch(/^座位表_\d{8}\.xlsx$/);
  });

  test('SEAT-AC104：視窗 375 px →「人員」分頁的人員列沒有列操作；點 B4 桌 → 詳情 Dialog 只有「關閉」；沒有整頁水平捲動', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明', { department: '研發一部', tableId: 3 });
      await s.employee('李美華', { department: '業務部' });
    });
    await page.setViewportSize({ width: 375, height: 800 });
    await openSeating(page);

    await page.getByRole('tab', { name: '人員', exact: true }).click();
    await expect(personRow(page, '李美華')).toBeVisible();
    await expect(peoplePanel(page).getByRole('button', { name: '更多操作' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await page.getByRole('tab', { name: '座位圖', exact: true }).click();
    await tableButton(page, 3).click();
    const detail = page.getByRole('dialog', { name: 'B4 桌', exact: true });
    await expect(detail).toBeVisible();
    const buttons = detail.getByRole('button');
    const count = await buttons.count();
    expect(count, '至少有關閉鈕').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await expect(buttons.nth(i)).toHaveAccessibleName('關閉');
    await expectNoHorizontalScroll(page);
  });
});

test.describe('檢視者直接呼叫寫入 API（AUTH-R12、AUTH-AC16）', () => {
  test('新增員工、新增參與人員、座位異動、備註名稱、匯入、切換發布、新增帳號、改權限、移除帳號 → 每一個都被拒（403 NOT_EDITOR），資料不變；讀取全部資料與匯出照常', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAsViewer(context, requireBaseURL(baseURL));
    // 自己準備名單：預設的測試帳號是編輯者（改權限、移除的 API 要用到它的 id），檢視者帳號以 VIEWER 在名單上；不依賴前一支測試留下的名單
    await setMembers([
      { email: TEST_USER.email, role: 'EDITOR' },
      { email: VIEWER_USER.email, role: 'VIEWER' },
    ]);
    // 後面斷言「發布狀態不變（未發布）」：前一支測試（例如 published-seats.spec.ts）可能留下已發布，先設回未發布
    await setPublished(false);
    const { wang, guest } = await seed(async (s) => {
      const w = await s.employee('王小明', { department: '研發一部', tableId: 3 });
      const g = await s.guest('林董');
      await s.noteName(3, '主桌');
      return { wang: w, guest: g };
    });
    await openSeating(page);
    const before = { count: await participantCount(), wang: await seatOf(wang), note: await noteNameOf(3), members: await memberList() };
    const testerId = await memberIdOf(TEST_USER.email);
    const viewerId = await memberIdOf(VIEWER_USER.email);

    const requests: [string, string, unknown][] = [
      ['/api/employees', 'POST', { name: '新同事', department: '研發一部' }],
      ['/api/participants', 'POST', { kind: 'GUEST', guestName: '新貴賓' }],
      ['/api/seating/operations', 'POST', { type: 'seat', participantId: guest, tableId: 5 }],
      ['/api/seating/operations', 'POST', { type: 'unseat', participantId: wang }],
      ['/api/seating/operations', 'POST', { type: 'autoArrange', mode: 'rebuild' }],
      ['/api/tables/3', 'PATCH', { noteName: '供應商' }],
      ['/api/employees/import', 'POST', {}],
      ['/api/participants/import', 'POST', {}],
      ['/api/publish', 'PUT', { published: true }],
      ['/api/members', 'POST', { email: 'new.viewer@program.com.tw', role: 'VIEWER' }],
      [`/api/members/${viewerId}`, 'PATCH', { role: 'EDITOR' }],
      [`/api/members/${testerId}`, 'PATCH', { role: 'VIEWER' }],
      [`/api/members/${testerId}`, 'DELETE', {}],
    ];
    for (const [path, method, body] of requests) {
      const res = await sendJson(page, path, method, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body, `${method} ${path}`).toEqual({ error: expect.objectContaining({ code: 'NOT_EDITOR' }) });
    }

    expect(await participantCount()).toBe(before.count);
    expect(await seatOf(wang)).toEqual(before.wang);
    expect(await seatOf(guest)).toEqual({ tableId: null, seatOrder: null });
    expect(await noteNameOf(3)).toBe(before.note);
    expect(await isPublished()).toBe(false);
    expect(await memberList()).toEqual(before.members);

    expect((await fetchFromPage(page, '/api/state')).status).toBe(200);
    expect((await fetchFromPage(page, '/api/export/seating')).status).toBe(200);
  });
});

test.describe('畫面開著時被改為檢視者（AUTH-R13）', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, requireBaseURL(baseURL));
  });

  test('AUTH-AC17：開著座位安排時被改為檢視者 → 把王小明拖到 B4 桌、馬上再拖一位 → 都不儲存；重新載入、Sonner；沒有拖移把手、導覽沒有「權限」、Header「只能檢視」', async ({
    page,
  }) => {
    desktopOnly(page);
    const { wang, lee } = await seed(async (s) => {
      await s.employee('王大同', { department: '研發一部', tableId: 3 });
      return { wang: await s.employee('王小明', { department: '研發一部' }), lee: await s.employee('李美華', { department: '業務部' }) };
    });
    await openSeating(page);
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' }).first()).toBeVisible();

    await makeViewer(TEST_USER.email); // 乙在權限頁把甲改為檢視者

    await dragAndDrop(page, personRow(page, '王小明'), mapTable(page, 3));
    await dragAndDrop(page, personRow(page, '李美華'), mapTable(page, 3));

    await expectToast(page, NOT_EDITOR_TOAST, { undo: false });
    await expect.poll(() => seatOf(wang)).toEqual({ tableId: null, seatOrder: null });
    expect(await seatOf(lee)).toEqual({ tableId: null, seatOrder: null });
    await expect(personRow(page, '王小明')).toBeVisible();
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
    await expect(viewOnlyBadge(page)).toBeVisible();
    expect(await navNames(await openNav(page))).toEqual(['座位安排', '參與人員', '員工名單']);
  });

  test('SEAT-AC105：開著 B4 桌詳情時被改為檢視者 → 把備註名稱改成「供應商」後離開欄位 → 不儲存，維持原本的內容；Sonner；之後備註名稱以文字顯示，沒有拖移把手與「自動排座」', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.employee('王大同', { department: '研發一部', tableId: 3 });
      await s.noteName(3, '主桌');
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    const field = detail.getByRole('textbox', { name: '備註名稱' });
    await expect(field).toHaveValue('主桌');

    await makeViewer(TEST_USER.email); // 乙在權限頁把甲改為檢視者

    await field.fill('供應商');
    await field.press('Tab');

    await expectToast(page, NOT_EDITOR_TOAST, { undo: false });
    await page.waitForTimeout(300);
    expect(await noteNameOf(3)).toBe('主桌');

    if ((await tableDetail(page, 3).count()) === 0) await openTableDetail(page, 3);
    const after = tableDetail(page, 3);
    await expect(after.getByRole('textbox', { name: '備註名稱' })).toHaveCount(0);
    await expect(after.getByText('主桌', { exact: true })).toBeVisible();
    await expect(after.getByText('供應商', { exact: true })).toHaveCount(0);
    await expect(seatMap(page).getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
    await expect(toolbarButton(page, '自動排座')).toHaveCount(0);
    await expect(viewOnlyBadge(page)).toBeVisible();
  });
});
