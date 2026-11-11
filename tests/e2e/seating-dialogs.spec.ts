// 座位安排的對話框（桌面；手機見 seating-mobile.spec.ts）：選擇桌次、加入人員、調換桌次、清空確認，以及只用鍵盤操作。
// docs/spec/seating.md 2.3.3～2.3.5、2.4、4.3、4.4；SEAT-R22～R25、R28～R31、R39、R72、R84；
// SEAT-AC08～AC11、AC17～AC19、AC35～AC37、AC86；SEAT-Q05、SEAT-Q06（原型的做法，目前假設）。
// D-018：「加入人員」最多勾到這一桌 12 位（SEAT-R30）；超過 10 位的其他情況見 seating-overflow.spec.ts。
// 參與人員頁的「入座…」（SEAT-AC12）用同一個 TableSelectDialog，元件本身見 tests/unit/components/table-select-dialog.test.tsx；
// 參與人員頁入口的 E2E 在 people-seating.spec.ts。
// 桌號 A1～A15、B1～B15（D-019）：測試資料用內部編號（3 = B4、4 = B7、5 = B10、7 = B2、8 = B5、9 = B8），
// 畫面上的字用桌號；選項依 A1～A15、B1～B15 排列（SEAT-R04）。對應見 tests/helpers/table-codes.ts。
import { expect, test, type Page } from '@playwright/test';
import { CODES_IN_LIST_ORDER } from '../helpers/table-codes';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { noteNameAt, noteNameOf, participantCount, rosterNames, rosterNamesAt, seatOf, seed, tableIdAt } from './helpers/seating-data';
import {
  arrowToOption,
  chooseOption,
  detailRows,
  emptySlot,
  expectRoster,
  expectToast,
  mapTable,
  openSeating,
  openTableDetail,
  optionLabels,
  panelTab,
  personRow,
  rowAction,
  rowWithName,
  slotPanel,
  stagedDetail,
  stagedTableButton,
  tabUntilFocused,
  tableButton,
  tableDetail,
  tokenShadow,
  waitForOperation,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL, page }) => {
  test.skip(isMobileWidth(page), '桌面版面；手機見 seating-mobile.spec.ts');
  await signIn(context, requireBaseURL(baseURL));
});

const selectDialog = (page: Page, title: string) => page.getByRole('dialog', { name: title, exact: true });

/** 選項開頭的桌號，例如「B2 桌（剩 6 位）・主桌」→ 'B2' */
const codeInLabel = (label: string) => /^([AB]\d{1,2}) 桌/.exec(label)?.[1];

test.describe('選擇桌次對話框（2.4、SEAT-R22～R25）', () => {
  test('未入座：人員面板列操作「入座…」，標題「安排 {顯示名稱} 入座」；選 B2 桌按「確認入座」，排到最後並顯示 Sonner（SEAT-AC08）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.fill(7, 2, { prefix: '七' });
      await s.employee('王小明');
    });
    await openSeating(page);

    await rowAction(page, personRow(page, '王小明'), '入座…');
    const dialog = selectDialog(page, '安排 王小明 入座');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /^桌次/ })).toBeVisible();
    await chooseOption(page, dialog, /^桌次/, /^B2 桌/);
    const saved = waitForOperation(page);
    await dialog.getByRole('button', { name: '確認入座' }).click();
    await saved;

    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 王小明 安排到 B2 桌。', { undo: true });
    expect(await rosterNames(7)).toEqual(['七1', '七2', '王小明']);
  });

  test('已入座：列操作「移至其他桌次…」，標題「把 {顯示名稱} 移到其他桌次」，選項不含目前的桌；確認後搬到 B2 桌（SEAT-AC09）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
    });
    await openSeating(page);
    await panelTab(page, '全部').click();

    await rowAction(page, personRow(page, '王小明'), '移至其他桌次…');
    const dialog = selectDialog(page, '把 王小明 移到其他桌次');
    await expect(dialog).toBeVisible();
    const labels = await optionLabels(page, dialog, /^桌次/);
    expect(labels).toHaveLength(29);
    expect(labels.some((l) => l.startsWith('B4 桌'))).toBe(false);
    // 其餘 29 桌依 A1～A15、B1～B15 排列（SEAT-R23、D-019）
    expect(labels.map(codeInLabel)).toEqual(CODES_IN_LIST_ORDER.filter((c) => c !== 'B4'));
    await page.getByRole('option', { name: /^B2 桌/ }).click();
    await dialog.getByRole('button', { name: '確認移動' }).click();

    await expectToast(page, '已把 王小明 從 B4 桌移到 B2 桌。', { undo: true });
    await expect.poll(() => rosterNames(7)).toEqual(['王小明']);
    expect(await rosterNames(3)).toEqual([]);
  });

  test('選項「{桌號} 桌（剩 {k} 位）・{備註名稱或部門}」，不列工作人員桌；空桌沒有備註名稱時省略「・」（SEAT-R23、SEAT-AC10、SEAT-Q05）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.noteName(7, '主桌');
      await s.fill(7, 4, { department: '研發一部', prefix: '七' });
      await s.fill(8, 2, { department: '研發一部', prefix: '八' });
      await s.staff('工作甲');
      await s.employee('王小明');
    });
    await openSeating(page);
    await rowAction(page, personRow(page, '王小明'), '入座…');
    const labels = await optionLabels(page, selectDialog(page, '安排 王小明 入座'), /^桌次/);

    expect(labels).toHaveLength(30);
    expect(labels).toContain('B2 桌（剩 6 位）・主桌');
    expect(labels).toContain('B5 桌（剩 8 位）・研發一部');
    expect(labels).toContain('B8 桌（剩 10 位）');
    expect(labels.some((l) => l.includes('工作人員'))).toBe(false);
  });

  test('選項依 A1～A15、B1～B15 的順序排列（SEAT-R04、SEAT-R23、D-019）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明');
    });
    await openSeating(page);
    await rowAction(page, personRow(page, '王小明'), '入座…');
    const labels = await optionLabels(page, selectDialog(page, '安排 王小明 入座'), /^桌次/);
    expect(labels.map(codeInLabel)).toEqual(CODES_IN_LIST_ORDER);
  });

  test('已滿的桌次停用並標示「已滿」，不能選（SEAT-R23、SEAT-AC17）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(5, 10);
      await s.employee('王小明');
    });
    await openSeating(page);
    await rowAction(page, personRow(page, '王小明'), '入座…');
    const dialog = selectDialog(page, '安排 王小明 入座');
    await dialog.getByRole('combobox', { name: /^桌次/ }).click();
    const full = page.getByRole('option', { name: /^B10 桌/ });
    await expect(full).toHaveAttribute('aria-disabled', 'true');
    await expect(full).toContainText('已滿');
    await full.click({ force: true });
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '確認入座' }).click();
    await expect(dialog.getByText('請選擇桌次。')).toBeVisible();
    expect(await rosterNames(5)).toHaveLength(10);
  });

  test('沒選桌次就按「確認入座」：欄位下方「請選擇桌次。」，對話框不關閉，沒有人入座（SEAT-R24、SEAT-AC11）', async ({ page }) => {
    const wang = await seed(async (s) => s.employee('王小明'));
    await openSeating(page);
    await rowAction(page, personRow(page, '王小明'), '入座…');
    const dialog = selectDialog(page, '安排 王小明 入座');
    await dialog.getByRole('button', { name: '確認入座' }).click();
    await expect(dialog.getByText('請選擇桌次。')).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(await seatOf(wang)).toEqual({ tableId: null, seatOrder: null });

    // 選擇桌次對話框是 modal，開著時背景被設為 aria-hidden；關掉再確認人員面板
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    await expect(personRow(page, '王小明')).toHaveCount(1);
  });

  test('按「取消」：關閉，不入座', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明');
    });
    await openSeating(page);
    await rowAction(page, personRow(page, '王小明'), '入座…');
    const dialog = selectDialog(page, '安排 王小明 入座');
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    await expect(personRow(page, '王小明')).toHaveCount(1);
  });

  test('桌次詳情名單列的「移至其他桌次…」也開啟同一個對話框（SEAT-R22）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await rowAction(page, rowWithName(detailRows(detail), page, '王小明'), '移至其他桌次…');
    const dialog = selectDialog(page, '把 王小明 移到其他桌次');
    await chooseOption(page, dialog, /^桌次/, /^B5 桌/);
    await dialog.getByRole('button', { name: '確認移動' }).click();
    await expectToast(page, '已把 王小明 從 B4 桌移到 B5 桌。', { undo: true });
    await expect(detail).toContainText('0/10 人');
  });

  test('詳情名單列的「移出桌次」：變成未入座、Sonner 帶「復原」（SEAT-R26）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('甲', { tableId: 3 });
      await s.employee('王小明', { tableId: 3 });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await rowAction(page, rowWithName(detailRows(detail), page, '王小明'), '移出桌次');
    await expectToast(page, '已把 王小明 移出 B4 桌。', { undo: true });
    await expectRoster(detailRows(detail), ['甲']);
    await expect(personRow(page, '王小明')).toHaveCount(1);
  });

  test('人員面板「全部」分頁的列操作「移出桌次」：結果同拖回面板，參與人員總數不變（SEAT-R26、SEAT-R28、SEAT-AC06）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('甲', { tableId: 3 });
      await s.employee('王小明', { tableId: 3 });
    });
    const total = await participantCount();
    await openSeating(page);
    await panelTab(page, '全部').click();
    await rowAction(page, personRow(page, '王小明'), '移出桌次');
    await expectToast(page, '已把 王小明 移出 B4 桌。', { undo: true });
    await expect(personRow(page, '王小明')).toContainText('未入座');
    await panelTab(page, '未入座').click();
    await expect(personRow(page, '王小明')).toHaveCount(1);
    await expect.poll(() => rosterNames(3)).toEqual(['甲']);
    expect(await participantCount()).toBe(total);
  });
});

test.describe('加入人員到桌次（2.3.4、SEAT-R30、SEAT-R31）', () => {
  // D-018：「加入人員」最多勾到這一桌 12 位（SEAT-R30，{k} 是 12 減這一桌的人數），7 位的桌可以勾 5 位；
  // 說明的空位仍只算到 10 位。原本「勾第 4 位時不會勾選、顯示『最多只能再加入 3 位。』」和 SEAT-R30 衝突，改為第 4 位可以勾。
  test('還有 3 個空位：說明「還有 3 個空位。」；第 4 位也可以勾（上限 12 位）；取消第 4 位後按「加入 3 位」，排在第 8–10 列、已滿、Sonner 帶「復原」（SEAT-AC18、SEAT-R30）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.fill(3, 7, { prefix: '三' });
      for (const name of ['甲', '乙', '丙', '丁', '戊']) await s.employee(name);
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();

    const dialog = selectDialog(page, '加入人員到 B4 桌');
    await expect(dialog).toContainText('還有 3 個空位。');
    await expect(dialog.getByPlaceholder('搜尋姓名、分機、部門或單位')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '加入 0 位' })).toBeDisabled();

    for (const name of ['丙', '甲', '戊']) await dialog.getByRole('checkbox', { name: new RegExp(`^${name}`) }).check();
    const fourth = dialog.getByRole('checkbox', { name: /^乙/ });
    await fourth.click();
    await expect(fourth).toBeChecked();
    await expect(dialog.getByText(/最多只能再加入/)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '加入 4 位' })).toBeEnabled();
    await fourth.click();
    await expect(fourth).not.toBeChecked();

    await dialog.getByRole('button', { name: '加入 3 位' }).click();
    await expect(dialog).toBeHidden();
    await expectToast(page, '已把 3 位人員加入 B4 桌。', { undo: true });
    // 依勾選順序排入（SEAT-Q06 的目前假設）
    await expect.poll(async () => (await rosterNames(3)).slice(7)).toEqual(['丙', '甲', '戊']);
    await expect(mapTable(page, 3)).toContainText('已滿');
    await expect(detail).toContainText('10/10 人');
  });

  test('只列未入座的人，不列已入座的人與工作人員；第二行是員工的「{部門}・分機 {分機}」；可以用分機搜尋（SEAT-R30、SEAT-AC19、COM-R10、COM-R14）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('已坐甲', { tableId: 4 });
      await s.staff('工作甲');
      await s.employee('王小明', { department: '研發一部', extension: '1234' });
      await s.employee('李小華', { department: '業務部' });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();
    const dialog = selectDialog(page, '加入人員到 B4 桌');

    await expect(dialog.getByRole('checkbox')).toHaveCount(2);
    await expect(dialog).not.toContainText('已坐甲');
    await expect(dialog).not.toContainText('工作甲');
    await expect(dialog).toContainText('研發一部・分機 1234');

    await dialog.getByPlaceholder('搜尋姓名、分機、部門或單位').fill('1234');
    await expect(dialog.getByRole('checkbox')).toHaveCount(1);
    await expect(dialog.getByRole('checkbox', { name: /^王小明/ })).toBeVisible();
  });

  test('沒有未入座的人：顯示「所有人都已入座。」（SEAT-R30、SEAT-AC19）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('甲', { tableId: 4 });
      await s.staff('工作甲');
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await detail.getByRole('button', { name: '加入人員', exact: true }).click();
    await expect(selectDialog(page, '加入人員到 B4 桌')).toContainText('所有人都已入座。');
  });

  test('一般桌次已滿時「加入人員」不停用（SEAT-Q06 的目前假設）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(5, 10);
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 5);
    await expect(detail.getByRole('button', { name: '加入人員', exact: true })).toBeEnabled();
  });
});

test.describe('調換桌次對話框（2.3.3、SEAT-R39）', () => {
  test('標題「把 B4 桌和哪一桌對調？」；選項不含自己、已滿的 B2 桌「B2 桌（10/10）・{部門}」可以選；沒選就確認顯示「請選擇桌次。」；確認後對調（SEAT-AC35）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.noteName(3, '主桌');
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
      await s.fill(7, 10, { department: '研發一部', prefix: '七' });
      await s.fill(8, 2, { department: '業務部', prefix: '八' });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await detail.getByRole('button', { name: '調換桌次…', exact: true }).click();
    const dialog = selectDialog(page, '把 B4 桌和哪一桌對調？');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: '確認對調' }).click();
    await expect(dialog.getByText('請選擇桌次。')).toBeVisible();
    await expect(dialog).toBeVisible();

    const labels = await optionLabels(page, dialog, /^桌次/);
    expect(labels).toHaveLength(29);
    expect(labels.some((l) => l.startsWith('B4 桌'))).toBe(false);
    expect(labels).toContain('B2 桌（10/10）・研發一部');
    expect(labels).toContain('B5 桌（2/10）・業務部');
    expect(labels).toContain('B8 桌（0/10）');
    const seven = page.getByRole('option', { name: /^B2 桌/ });
    await expect(seven).not.toHaveAttribute('aria-disabled', 'true');
    await seven.click();
    await dialog.getByRole('button', { name: '確認對調' }).click();

    // D-027：兩桌交換位置；用位置查名單（B2 的位置上是甲乙與「主桌」）
    await expectToast(page, '已把 B4 桌和 B2 桌對調。', { undo: true });
    await expect.poll(() => rosterNamesAt(7)).toEqual(['甲', '乙']);
    expect(await rosterNamesAt(3)).toHaveLength(10);
    expect(await noteNameAt(7)).toBe('主桌');
    expect(await noteNameAt(3)).toBeNull();
  });

  test('D-027：選項也列出「未放桌」的位置「B8（未放桌）」；選它按「確認對調」就是搬過去，Sonner「已把 B4 桌搬到 B8。」（SEAT-R39、SEAT-AC116）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.emptyPosition(9);
      await s.noteName(3, '主桌');
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await detail.getByRole('button', { name: '調換桌次…', exact: true }).click();
    const dialog = selectDialog(page, '把 B4 桌和哪一桌對調？');
    const labels = await optionLabels(page, dialog, /^桌次/);
    expect(labels).toHaveLength(29);
    expect(labels).toContain('B8（未放桌）');
    expect(labels.map((l) => /^([AB]\d{1,2})/.exec(l)?.[1])).toEqual(CODES_IN_LIST_ORDER.filter((c) => c !== 'B4'));
    await page.getByRole('option', { name: 'B8（未放桌）', exact: true }).click();
    await dialog.getByRole('button', { name: '確認對調' }).click();

    await expectToast(page, '已把 B4 桌搬到 B8。', { undo: true });
    await expect.poll(() => rosterNamesAt(9)).toEqual(['甲', '乙']);
    expect(await noteNameAt(9)).toBe('主桌');
    expect(await tableIdAt(3)).toBeNull();
    await expect(emptySlot(page, 3)).toBeVisible();
    await expect(mapTable(page, 9)).toContainText('B8');
  });

  test('選項依 A1～A15、B1～B15 的順序列出自己以外的 29 桌（SEAT-R39、D-019）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('甲', { tableId: 3 });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await detail.getByRole('button', { name: '調換桌次…', exact: true }).click();
    const labels = await optionLabels(page, selectDialog(page, '把 B4 桌和哪一桌對調？'), /^桌次/);
    expect(labels.map(codeInLabel)).toEqual(CODES_IN_LIST_ORDER.filter((c) => c !== 'B4'));
  });

  test('按「取消」：關閉，不對調', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('甲', { tableId: 3 });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await detail.getByRole('button', { name: '調換桌次…', exact: true }).click();
    const dialog = selectDialog(page, '把 B4 桌和哪一桌對調？');
    await chooseOption(page, dialog, /^桌次/, /^B2 桌/);
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    expect(await rosterNames(3)).toEqual(['甲']);
  });
});

test.describe('清空桌次（2.3.5、SEAT-R28、SEAT-R29）', () => {
  test('Alert Dialog「要清空 B4 桌嗎？」「6 位人員會變成未入座，名單不會刪除。」；確認後空桌、備註名稱保留、6 位回到「未入座」、總數不變（SEAT-AC36）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.noteName(3, '主桌');
      await s.fill(3, 6, { prefix: '清' });
    });
    const total = await participantCount();
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await detail.getByRole('button', { name: '清空桌次', exact: true }).click();

    const alert = page.getByRole('alertdialog', { name: '要清空 B4 桌嗎？' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('6 位人員會變成未入座，名單不會刪除。');
    // 桌面：取消在左、確認在右
    const cancel = await alert.getByRole('button', { name: '取消' }).boundingBox();
    const confirm = await alert.getByRole('button', { name: '清空桌次' }).boundingBox();
    if (!cancel || !confirm) throw new Error('量不到按鈕');
    expect(cancel.x).toBeLessThan(confirm.x);

    await alert.getByRole('button', { name: '清空桌次' }).click();
    await expectToast(page, '已清空 B4 桌。', { undo: true });
    await expect.poll(() => rosterNames(3)).toEqual([]);
    expect(await noteNameOf(3)).toBe('主桌');
    expect(await participantCount()).toBe(total);
    for (let i = 1; i <= 6; i++) await expect(personRow(page, `清${i}`)).toHaveCount(1);
    await expect(detail.getByRole('textbox', { name: '備註名稱' })).toHaveValue('主桌');
  });

  test('按「取消」：名單不變（SEAT-AC37）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(3, 2, { prefix: '清' });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await detail.getByRole('button', { name: '清空桌次', exact: true }).click();
    const alert = page.getByRole('alertdialog', { name: '要清空 B4 桌嗎？' });
    await alert.getByRole('button', { name: '取消' }).click();
    await expect(alert).toBeHidden();
    expect(await rosterNames(3)).toEqual(['清1', '清2']);
  });

  test('空桌的「清空桌次」停用（SEAT-Q06 的目前假設）', async ({ page }) => {
    await seed(async () => {});
    await openSeating(page);
    const detail = await openTableDetail(page, 9);
    await expect(detail.getByRole('button', { name: '清空桌次', exact: true })).toBeDisabled();
  });
});

test.describe('只用鍵盤（SEAT-R72、SEAT-R84、SEAT-AC86）', () => {
  test('Tab 聚焦到 B4 桌（焦點 --shadow-focus-ring）按 Enter 開詳情，用「調換桌次…」只用鍵盤和 B2 桌對調', async ({ page }) => {
    await seed(async (s) => {
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
      await s.employee('丙', { tableId: 7 });
    });
    await openSeating(page);
    await page.locator('body').click({ position: { x: 1, y: 1 } });

    const t3 = tableButton(page, 3);
    await tabUntilFocused(page, t3);
    const ring = await tokenShadow(page, '--shadow-focus-ring');
    await expect.poll(() => t3.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(ring);
    await page.keyboard.press('Enter');
    const detail = tableDetail(page, 3);
    await expect(detail).toBeVisible();

    await tabUntilFocused(page, detail.getByRole('button', { name: '調換桌次…', exact: true }), 80);
    await page.keyboard.press('Enter');
    const dialog = selectDialog(page, '把 B4 桌和哪一桌對調？');
    await expect(dialog).toBeVisible();

    await tabUntilFocused(page, dialog.getByRole('combobox', { name: /^桌次/ }), 10);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option').first()).toBeVisible();
    await arrowToOption(page, 'B2 桌');
    await page.keyboard.press('Enter');
    await tabUntilFocused(page, dialog.getByRole('button', { name: '確認對調' }), 10);
    await page.keyboard.press('Enter');

    await expectToast(page, '已把 B4 桌和 B2 桌對調。', { undo: true });
    await expect.poll(() => rosterNamesAt(7)).toEqual(['甲', '乙']);
  });

  test('D-027：「未放桌」的位置與暫存的桌也可以用 Tab 聚焦並按 Enter 開啟面板與詳情（SEAT-R84、SEAT-R95）', async ({ page }) => {
    await seed(async (s) => {
      await s.emptyPosition(9);
      const staged = await s.stagedTable('貴賓桌');
      await s.employee('丙', { tableId: staged });
    });
    await openSeating(page);
    await page.locator('body').click({ position: { x: 1, y: 1 } });

    const slot = emptySlot(page, 9);
    await tabUntilFocused(page, slot);
    const ring = await tokenShadow(page, '--shadow-focus-ring');
    await expect.poll(() => slot.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(ring);
    await page.keyboard.press('Enter');
    await expect(slotPanel(page, 9)).toBeVisible();
    await slotPanel(page, 9).getByRole('button', { name: '關閉' }).click();

    const staged = stagedTableButton(page, '貴賓桌');
    await tabUntilFocused(page, staged);
    await page.keyboard.press('Enter');
    await expect(stagedDetail(page, '貴賓桌')).toBeVisible();
  });

  test('選擇桌次對話框可以只用鍵盤完成入座（SEAT-R84）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明');
    });
    await openSeating(page);
    const menuButton = personRow(page, '王小明').getByRole('button', { name: '更多操作' });
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await tabUntilFocused(page, menuButton);
    await page.keyboard.press('Enter');
    // 用鍵盤打開選單時焦點在第一項；未入座員工的第一項是「入座…」（2.2.3）
    await expect(page.getByRole('menuitem', { name: '入座…' })).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = selectDialog(page, '安排 王小明 入座');
    await expect(dialog).toBeVisible();

    await tabUntilFocused(page, dialog.getByRole('combobox', { name: /^桌次/ }), 10);
    await page.keyboard.press('ArrowDown');
    await arrowToOption(page, 'B7 桌');
    await page.keyboard.press('Enter');
    await tabUntilFocused(page, dialog.getByRole('button', { name: '確認入座' }), 10);
    await page.keyboard.press('Enter');

    await expectToast(page, '已把 王小明 安排到 B7 桌。', { undo: true });
    await expect.poll(() => rosterNames(4)).toEqual(['王小明']);
  });
});
