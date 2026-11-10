// 工作人員桌（桌面；手機見 seating-mobile.spec.ts）。
// docs/spec/seating.md 2.5、4.5；SEAT-R34、R40～R51、R57、R58、R89；SEAT-AC38～AC47、AC49；docs/spec/README.md COM-R10。
// D-018：工作人員桌和一般桌相同，標準 10 位、拖移與「加入人員」最多到 12 位（SEAT-R42、SEAT-R50）；其他情況見 seating-overflow.spec.ts。
// 座位圖上工作人員桌的外觀（AC48）見 seating-map.spec.ts。
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { rosterNames, seatOf, seed, STAFF } from './helpers/seating-data';
import {
  clickUndo,
  detailRows,
  dragAndDrop,
  expectNoToast,
  expectRoster,
  expectStats,
  expectToast,
  menuItemsOf,
  openSeating,
  openStaffDetail,
  openTableDetail,
  panelTab,
  peoplePanel,
  personRow,
  rowAction,
  rowWithName,
  staffTable,
  staffTableButton,
  tableButton,
  toast,
  waitForOperation,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL, page }) => {
  test.skip(isMobileWidth(page), '手機的工作人員桌操作見 seating-mobile.spec.ts');
  await signIn(context, requireBaseURL(baseURL));
});

test.describe('放進工作人員桌（SEAT-R40～R44、R47）', () => {
  test('未入座的員工拖到工作人員桌：「1/10」、Sonner 帶「復原」、離開「未入座」、「全部」顯示「工作人員」、列操作、統計列（SEAT-AC38）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('王小明', { department: '研發一部' });
      await s.employee('李小華');
    });
    await openSeating(page);
    await expectStats(page, { seated: 0, total: 2, unseated: 2, empty: 300, full: 0 });

    await dragAndDrop(page, personRow(page, '王小明'), staffTableButton(page));

    await expect(staffTable(page)).toContainText('1/10');
    await expectToast(page, '已把 王小明 放進工作人員桌。', { undo: true });
    await expect(personRow(page, '王小明')).toHaveCount(0);
    await expectStats(page, { seated: 0, total: 1, unseated: 1, empty: 300, full: 0 });

    await panelTab(page, '全部').click();
    const row = personRow(page, '王小明');
    await expect(row).toContainText('工作人員');
    expect(await menuItemsOf(page, row)).toEqual(['移出工作人員桌', '編輯', '取消報名']);
    expect((await seatOf(await idOf(page, '王小明'))).tableId).toBe(STAFF);
  });

  test('坐在第 3 桌第 1 列的員工拖到工作人員桌：其他人往前補；Sonner「已把 王小明 從第 3 桌移到工作人員桌。」；統計列已入座與總人數各減 1（SEAT-AC39）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
      await s.employee('李小華');
    });
    await openSeating(page);
    await expectStats(page, { seated: 3, total: 4, unseated: 1, empty: 297, full: 0 });
    await panelTab(page, '全部').click();

    await dragAndDrop(page, personRow(page, '王小明'), staffTableButton(page));

    await expectToast(page, '已把 王小明 從第 3 桌移到工作人員桌。', { undo: true });
    await expect.poll(() => rosterNames(3)).toEqual(['甲', '乙']);
    await expectStats(page, { seated: 2, total: 3, unseated: 1, empty: 298, full: 0 });
  });

  test('從桌次詳情把名單列拖到工作人員桌也可以（SEAT-R40）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await dragAndDrop(page, rowWithName(detailRows(detail), page, '王小明'), staffTableButton(page));
    await expectToast(page, '已把 王小明 從第 3 桌移到工作人員桌。', { undo: true });
    expect(await rosterNames(STAFF)).toEqual(['王小明']);
  });

  test('員工成為工作人員時，眷屬留在原本的桌次（SEAT-R44、SEAT-AC40）', async ({ page }) => {
    await seed(async (s) => {
      const wang = await s.employee('王小明', { tableId: 3 });
      await s.dependent(wang, { tableId: 3 });
    });
    await openSeating(page);
    await panelTab(page, '全部').click();
    await dragAndDrop(page, personRow(page, '王小明'), staffTableButton(page));
    await expectToast(page, '已把 王小明 從第 3 桌移到工作人員桌。', { undo: true });
    await expect.poll(() => rosterNames(3)).toEqual(['王小明_眷屬']);
  });

  test('眷屬、外部貴賓拖到工作人員桌：不放進，Sonner「只有員工可以放進工作人員桌。」，留在原處（SEAT-R41、SEAT-AC41）', async ({
    page,
  }) => {
    await seed(async (s) => {
      const wang = await s.employee('王小明', { tableId: 4 });
      await s.dependent(wang);
      await s.guest('林董', { tableId: 12 });
    });
    await openSeating(page);

    await dragAndDrop(page, personRow(page, '王小明_眷屬'), staffTableButton(page));
    await expectToast(page, '只有員工可以放進工作人員桌。', { undo: false });
    await expect(personRow(page, '王小明_眷屬')).toHaveCount(1);

    // 重新開啟頁面，清掉上一則 Sonner，再試外部貴賓
    await openSeating(page);
    await panelTab(page, '全部').click();
    await dragAndDrop(page, personRow(page, '林董'), staffTableButton(page));
    await expectToast(page, '只有員工可以放進工作人員桌。', { undo: false });
    expect(await rosterNames(12)).toEqual(['林董']);
    expect(await rosterNames(STAFF)).toEqual([]);
  });

  // D-018：原本 9 位放進第 10 位後就「已滿」並擋下第 11 位；改為 11 位放進第 12 位後「超過」、擋下第 13 位（改過的 SEAT-AC42）
  test('工作人員桌有 11 位：第一位放進後 12 位「超過」、詳情的「加入人員」停用；第二位不放進，Sonner「工作人員桌已達 12 位，請先移出一位。」（SEAT-R42、SEAT-AC42）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.fill(STAFF, 11, { prefix: '工作' });
      await s.employee('王小明');
      await s.employee('李小華', { tableId: 3 });
    });
    await openSeating(page);

    const saved = waitForOperation(page);
    await dragAndDrop(page, personRow(page, '王小明'), staffTableButton(page));
    await saved;
    await expectToast(page, '已把 王小明 放進工作人員桌，這一桌已超過 10 位。', { undo: true });
    await expect(staffTable(page)).toContainText('超過');
    expect(await rosterNames(STAFF)).toHaveLength(12);

    await panelTab(page, '全部').click();
    await dragAndDrop(page, personRow(page, '李小華'), staffTableButton(page));
    await expectToast(page, '工作人員桌已達 12 位，請先移出一位。', { undo: false });
    expect(await rosterNames(3)).toEqual(['李小華']);

    const detail = await openStaffDetail(page);
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeDisabled();
  });

  test('工作人員桌有 9 位：放進第 10 位後「已滿」，不加「這一桌已超過 10 位。」；詳情的「加入人員」仍可以按（SEAT-R42、SEAT-R89）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.fill(STAFF, 9, { prefix: '工作' });
      await s.employee('王小明');
    });
    await openSeating(page);

    await dragAndDrop(page, personRow(page, '王小明'), staffTableButton(page));
    await expectToast(page, '已把 王小明 放進工作人員桌。', { undo: true });
    await expect(toast(page, '這一桌已超過 10 位。')).toHaveCount(0);
    await expect(staffTable(page)).toContainText('已滿');
    const detail = await openStaffDetail(page);
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeEnabled();
  });

  test('已經是工作人員的人從「全部」分頁拖到工作人員桌：沒有任何改變（SEAT-R51、SEAT-AC49）', async ({ page }) => {
    await seed(async (s) => {
      await s.staff('王小明');
      await s.staff('甲');
    });
    await openSeating(page);
    await panelTab(page, '全部').click();
    await dragAndDrop(page, personRow(page, '王小明'), staffTableButton(page));
    await page.waitForTimeout(500);
    await expectNoToast(page);
    await expect(staffTable(page)).toContainText('2/10');
  });
});

test.describe('離開工作人員桌（SEAT-R45、R46）', () => {
  test('從工作人員桌詳情拖到第 7 桌：排到最後、不再是工作人員；按「復原」回到工作人員桌（SEAT-R45、SEAT-R78、SEAT-AC43）', async ({ page }) => {
    await seed(async (s) => {
      await s.staff('王小明');
      await s.employee('甲', { tableId: 7 });
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);

    const saved = waitForOperation(page);
    await dragAndDrop(page, rowWithName(detailRows(detail), page, '王小明'), tableButton(page, 7));
    await saved;
    await expectToast(page, '已把 王小明 從工作人員桌移到第 7 桌。', { undo: true });
    await expect.poll(() => rosterNames(7)).toEqual(['甲', '王小明']);
    expect(await rosterNames(STAFF)).toEqual([]);

    await clickUndo(page, '已把 王小明 從工作人員桌移到第 7 桌。');
    await expectToast(page, '已復原。', { undo: false });
    await expect.poll(() => rosterNames(STAFF)).toEqual(['王小明']);
    expect(await rosterNames(7)).toEqual(['甲']);
  });

  // D-018：原本拖到 10 位的桌就擋下，改為拖到 12 位的桌才擋下（改過的 SEAT-AC44）
  test('拖到已有 12 位的桌：Sonner「第 5 桌已達 12 位，請先移出一位。」，仍是工作人員（SEAT-R45、SEAT-AC44）', async ({ page }) => {
    await seed(async (s) => {
      await s.staff('王小明');
      await s.fill(5, 12);
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);
    await dragAndDrop(page, rowWithName(detailRows(detail), page, '王小明'), tableButton(page, 5));
    await expectToast(page, '第 5 桌已達 12 位，請先移出一位。', { undo: false });
    expect(await rosterNames(STAFF)).toEqual(['王小明']);
  });

  test('拖到已有 10 位的桌：入座第 11 位、不再是工作人員，Sonner「已把 王小明 從工作人員桌移到第 5 桌，這一桌已超過 10 位。」帶「復原」（SEAT-R45、SEAT-R89）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.staff('王小明');
      await s.fill(5, 10);
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);
    const saved = waitForOperation(page);
    await dragAndDrop(page, rowWithName(detailRows(detail), page, '王小明'), tableButton(page, 5));
    await saved;
    await expectToast(page, '已把 王小明 從工作人員桌移到第 5 桌，這一桌已超過 10 位。', { undo: true });
    expect(await rosterNames(STAFF)).toEqual([]);
    expect((await rosterNames(5))[10]).toBe('王小明');
  });

  test('拖回人員面板：變成未入座，Sonner「已把 王小明 移出工作人員桌。」帶「復原」（SEAT-R46、SEAT-AC45）', async ({ page }) => {
    await seed(async (s) => {
      await s.staff('王小明');
      await s.employee('李小華');
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);
    await dragAndDrop(page, rowWithName(detailRows(detail), page, '王小明'), peoplePanel(page).getByRole('list').first());
    await expectToast(page, '已把 王小明 移出工作人員桌。', { undo: true });
    await expect(personRow(page, '王小明')).toHaveCount(1);
    expect(await rosterNames(STAFF)).toEqual([]);
  });

  test('列操作「移出工作人員桌」：變成未入座，出現在「未入座」分頁（SEAT-R46、SEAT-AC45）', async ({ page }) => {
    await seed(async (s) => {
      await s.staff('王小明');
    });
    await openSeating(page);
    await panelTab(page, '全部').click();
    await rowAction(page, personRow(page, '王小明'), '移出工作人員桌');
    await expectToast(page, '已把 王小明 移出工作人員桌。', { undo: true });
    await panelTab(page, '未入座').click();
    await expect(personRow(page, '王小明')).toHaveCount(1);
  });
});

test.describe('工作人員桌詳情（2.5.2、SEAT-R34、SEAT-R48、SEAT-R72）', () => {
  test('標題、副標「3/10 人」、說明、部門；名單 3 位與 7 列空位、第二行「{部門}・分機 {分機}」；沒有備註名稱、調換桌次、清空桌次（SEAT-AC46）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.staff('工作甲', { department: '研發一部', extension: '2001' });
      await s.staff('工作乙', { department: '研發一部' });
      await s.staff('工作丙', { department: '業務部', extension: '3001' });
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);

    await expect(detail.getByRole('heading', { name: '工作人員桌' })).toBeVisible();
    await expect(detail).toContainText('3/10 人');
    await expect(detail).toContainText('活動當天值勤的員工，不算入座統計；匯出時列在座位表右上角。');
    await expect(detail).toContainText('部門：研發一部＋業務部');
    await expect(detail).toContainText('從人員面板或其他桌次拖進來，或按「加入人員」。只有員工可以放進來。');

    const rows = detailRows(detail);
    await expect(rows).toHaveCount(10);
    for (let i = 3; i < 10; i++) await expect(rows.nth(i)).toContainText('空位');
    await expect(rowWithName(rows, page, '工作甲')).toContainText('研發一部・分機 2001');
    await expect(rowWithName(rows, page, '工作乙')).not.toContainText('分機');
    expect(await menuItemsOf(page, rowWithName(rows, page, '工作甲'))).toEqual(['移出工作人員桌', '編輯']);

    await expect(detail.getByRole('textbox', { name: '備註名稱' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: '調換桌次…' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: '清空桌次' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeEnabled();
    await expect(detail.getByRole('button', { name: '關閉' })).toBeVisible();
  });

  test('沒有人時「部門：—」，10 列空位（2.5.2）', async ({ page }) => {
    await seed(async () => {});
    await openSeating(page);
    const detail = await openStaffDetail(page);
    await expect(detail).toContainText('0/10 人');
    await expect(detail).toContainText('部門：—');
    await expectRoster(detailRows(detail), []);
  });

  test('名單不能調整順序：在詳情裡拖移名單列，順序不變（SEAT-R34、SEAT-AC46）', async ({ page }) => {
    await seed(async (s) => {
      for (const name of ['工作甲', '工作乙', '工作丙']) await s.staff(name);
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);
    const rows = detailRows(detail);
    const before = await rows.allInnerTexts();
    await dragAndDrop(page, rows.nth(2), rows.nth(0));
    await page.waitForTimeout(500);
    expect(await rows.allInnerTexts()).toEqual(before);
    await expect(page.getByText(/座位順序/)).toHaveCount(0);
  });
});

test.describe('加入人員到工作人員桌（2.5.3、SEAT-R50）', () => {
  test('只列還不是工作人員的員工（含已入座）；第二行最後「・第 3 桌」；勾陳大華與乙按「加入 2 位」；復原後各自回到原處（SEAT-AC47）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.fill(STAFF, 8, { prefix: '工作' });
      await s.employee('甲', { tableId: 3 });
      await s.employee('陳大華', { department: '研發一部', team: '前端組', tableId: 3 });
      await s.employee('丙', { tableId: 3 });
      const yi = await s.employee('乙', { department: '業務部' });
      await s.dependent(yi);
      await s.guest('林董');
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: '加入人員到工作人員桌', exact: true });
    await expect(dialog).toContainText('還有 2 個空位。');
    await expect(dialog).not.toContainText('乙_眷屬');
    await expect(dialog).not.toContainText('林董');
    await expect(dialog).not.toContainText('工作1');
    await expect(dialog.getByRole('checkbox')).toHaveCount(4);

    const chenBox = dialog.getByRole('checkbox', { name: /^陳大華/ });
    const chenLine = dialog.getByText(/研發一部・前端組・第 3 桌$/);
    await expect(chenLine).toBeVisible();
    await expect(dialog.getByText(/^業務部$/)).toBeVisible();

    await chenBox.check();
    await dialog.getByRole('checkbox', { name: /^乙/ }).check();
    // D-018：工作人員桌最多勾到 12 位（8 位時可以勾 4 位），第 3 位可以勾；這裡取消後照驗收條件只加入 2 位（SEAT-R50）
    const third = dialog.getByRole('checkbox', { name: /^甲/ });
    await third.click();
    await expect(third).toBeChecked();
    await expect(dialog.getByText(/最多只能再加入/)).toHaveCount(0);
    await third.click();
    await expect(third).not.toBeChecked();

    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '加入 2 位' }).click();
    await saved;
    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 2 位人員放進工作人員桌。', { undo: true });
    await expect(staffTable(page)).toContainText('已滿');
    expect(await rosterNames(3)).toEqual(['甲', '丙']);

    await clickUndo(page, '已把 2 位人員放進工作人員桌。');
    await expectToast(page, '已復原。', { undo: false });
    await expect.poll(() => rosterNames(3)).toEqual(['甲', '陳大華', '丙']);
    expect((await rosterNames(STAFF)).sort()).not.toContain('乙');
    await expect(personRow(page, '乙')).toHaveCount(1);
  });

  test('沒有可加的人：顯示「已報名的員工都在工作人員桌。」（SEAT-R50）', async ({ page }) => {
    await seed(async (s) => {
      const wang = await s.staff('王小明');
      await s.dependent(wang);
      await s.guest('林董');
    });
    await openSeating(page);
    const detail = await openStaffDetail(page);
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '加入人員到工作人員桌', exact: true })).toContainText(
      '已報名的員工都在工作人員桌。',
    );
  });
});

/** 從伺服器的全部資料找出這個顯示名稱的參與人員 id */
async function idOf(page: Page, name: string): Promise<number> {
  const state = await page.evaluate(async () => {
    const res = await fetch('/api/state');
    return (await res.json()) as {
      employees: { id: number; name: string }[];
      participants: { id: number; kind: string; employeeId: number | null }[];
    };
  });
  const employee = state.employees.find((e) => e.name === name);
  const participant = state.participants.find((p) => p.kind === 'EMPLOYEE' && p.employeeId === employee?.id);
  if (!participant) throw new Error(`找不到 ${name}`);
  return participant.id;
}
