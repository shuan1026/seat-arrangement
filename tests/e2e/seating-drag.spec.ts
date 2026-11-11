// 座位安排的拖移（桌面；手機不提供拖移，見 seating-mobile.spec.ts）。
// docs/spec/seating.md 2.1.9、2.2.4、3.3、3.5、3.6、3.7；SEAT-R06、R10、R15～R21、R26～R28、R32、R33、R35～R38；
// SEAT-AC01～AC07、AC13～AC16、AC22、AC24、AC30～AC34；docs/architecture.md 第 10.4 節（dnd-kit，分多步移動才會觸發）。
// D-018 起拖移可以放到 12 位（SEAT-R20、SEAT-R88）；超過 10 位的其他情況見 seating-overflow.spec.ts。
// 無障礙名稱的假設見 tests/e2e/helpers/seating-page.ts 開頭。
// 桌號 A1～A15、B1～B15（D-019）：測試資料用內部編號（3 = B4、5 = B10、7 = B2、9 = B8），畫面上的字用桌號。
import { expect, test } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { noteNameAt, noteNameOf, participantCount, rosterNames, rosterNamesAt, seed } from './helpers/seating-data';
import {
  blankPointIn,
  emptySlot,
  cardRows,
  cursorAt,
  detailRows,
  dragAndDrop,
  dragOver,
  dragOverPoint,
  drop,
  expandAll,
  expectNoToast,
  expectRoster,
  expectStats,
  expectToast,
  hasBorderColor,
  hasOpacity,
  hasShadow,
  landmark,
  mapTable,
  openSeating,
  openTableDetail,
  panelTab,
  peoplePanel,
  personRow,
  rowAction,
  rowWithName,
  seatMap,
  staffTableButton,
  startDrag,
  tableButton,
  tableDetail,
  tableHandle,
  waitForOperation,
  widenMap,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL, page }) => {
  test.skip(isMobileWidth(page), '手機不提供拖移（SEAT-R82）');
  await signIn(context, requireBaseURL(baseURL));
});

test.describe('從人員面板拖到桌次（SEAT-R15、R16、R18、R21）', () => {
  test('拖到收合的桌次上：放置樣式；放開後入座、排到最後、Sonner 帶「復原」、離開「未入座」、統計列更新（SEAT-AC01）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.fill(3, 4);
      await s.employee('王小明', { department: '研發一部', team: '前端組' });
      await s.employee('李小華');
    });
    await openSeating(page);
    await expectStats(page, { seated: 4, total: 6, unseated: 2, empty: 296, full: 0 });

    const source = personRow(page, '王小明');
    await startDrag(page, source);
    await dragOver(page, tableButton(page, 3));
    await expect.poll(() => hasBorderColor(page, mapTable(page, 3), '--primary')).toBe(true);
    await expect.poll(() => hasShadow(page, mapTable(page, 3), '--shadow-md')).toBe(true);
    await expect.poll(() => hasOpacity(source, 0.5)).toBe(true);
    const saved = waitForOperation(page);
    await drop(page);
    await saved;

    await expect(mapTable(page, 3)).toContainText('5/10');
    await expectToast(page, '已把 王小明 安排到 B4 桌。', { undo: true });
    await expect(personRow(page, '王小明')).toHaveCount(0);
    await expectStats(page, { seated: 5, total: 6, unseated: 1, empty: 295, full: 0 });
    expect((await rosterNames(3))[4]).toBe('王小明');

    const detail = await openTableDetail(page, 3);
    await expect(detailRows(detail).nth(4)).toContainText('王小明');
  });

  test('「全部」分頁的人員列也可以拖（SEAT-R15）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明');
    });
    await openSeating(page);
    await panelTab(page, '全部').click();
    await dragAndDrop(page, personRow(page, '王小明'), tableButton(page, 9));
    await expectToast(page, '已把 王小明 安排到 B8 桌。', { undo: true });
    expect(await rosterNames(9)).toEqual(['王小明']);
  });

  test('展開狀態，拖到卡片的某一列：插入那一列，原本那一列與之後的人往後移（SEAT-R17、SEAT-AC02）', async ({ page }) => {
    await seed(async (s) => {
      for (const name of ['甲', '乙', '丙']) await s.employee(name, { tableId: 3 });
      await s.employee('王小明');
    });
    await openSeating(page);
    await expandAll(page);

    await dragAndDrop(page, personRow(page, '王小明'), cardRows(page, 3).nth(1));

    await expect.poll(() => rosterNames(3)).toEqual(['甲', '王小明', '乙', '丙']);
    await expectRoster(cardRows(page, 3), ['甲', '王小明', '乙', '丙']);
  });

  test('桌次詳情打開時，從人員面板拖到詳情名單的空位列：排到名單最後，副標更新（SEAT-R17、SEAT-R73、SEAT-R74、SEAT-AC03）', async ({
    page,
  }) => {
    await seed(async (s) => {
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
      await s.employee('王小明');
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);

    await dragAndDrop(page, personRow(page, '王小明'), detailRows(detail).nth(6));

    await expectRoster(detailRows(detail), ['甲', '乙', '王小明']);
    await expect(detail).toContainText('3/10 人');
    await expect.poll(() => rosterNames(3)).toEqual(['甲', '乙', '王小明']);
  });

  // D-018 起拖移可以放到 12 位：原本「拖到 10 位的桌擋下」改為「拖到 12 位的桌擋下」（SEAT-R20、改過的 SEAT-AC14）
  test('拖到已有 12 位的桌次：游標 not-allowed、沒有放置樣式；放開後不入座，Sonner「{桌號} 桌已達 12 位，請先移出一位。」不帶「復原」（SEAT-R20、SEAT-AC14）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.fill(5, 12);
      await s.employee('王小明');
    });
    await openSeating(page);
    const before = await rosterNames(5);

    await startDrag(page, personRow(page, '王小明'));
    const point = await dragOver(page, tableButton(page, 5));
    await expect.poll(() => cursorAt(page, point)).toBe('not-allowed');
    expect(await hasBorderColor(page, mapTable(page, 5), '--primary')).toBe(false);
    await drop(page);

    await expectToast(page, 'B10 桌已達 12 位，請先移出一位。', { undo: false });
    await expect(personRow(page, '王小明')).toHaveCount(1);
    expect(await rosterNames(5)).toEqual(before);
  });

  test('拖進第 10 位：人數改為「已滿」，統計列已滿桌數加 1（SEAT-R02、SEAT-R11、SEAT-AC13）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(5, 9);
      await s.employee('王小明');
    });
    await openSeating(page);
    await expectStats(page, { seated: 9, total: 10, unseated: 1, empty: 291, full: 0 });
    await dragAndDrop(page, personRow(page, '王小明'), tableButton(page, 5));
    await expect(mapTable(page, 5)).toContainText('已滿');
    await expectStats(page, { seated: 10, total: 10, unseated: 0, empty: 290, full: 1 });
  });
});

test.describe('桌次之間搬移（SEAT-R06、R15、R19、R20）', () => {
  test('展開狀態，把名單列從 B4 桌卡片拖到 B2 桌卡片的標頭：排到最後，原桌往前補（SEAT-AC04）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('甲', { tableId: 3 });
      await s.employee('王小明', { tableId: 3 });
      await s.employee('乙', { tableId: 3 });
      await s.employee('丙', { tableId: 3 });
      await s.employee('丁', { tableId: 7 });
    });
    await openSeating(page);
    await widenMap(page);
    await expandAll(page);

    // 展開卡片的標頭寫「{桌號} 桌」（2.1.7）
    const header = mapTable(page, 7).getByText('B2 桌', { exact: true });
    await header.scrollIntoViewIfNeeded();
    await dragAndDrop(page, rowWithName(cardRows(page, 3), page, '王小明'), header);

    await expectToast(page, '已把 王小明 從 B4 桌移到 B2 桌。', { undo: true });
    await expect.poll(() => rosterNames(7)).toEqual(['丁', '王小明']);
    expect(await rosterNames(3)).toEqual(['甲', '乙', '丙']);
    await expectRoster(cardRows(page, 3), ['甲', '乙', '丙']);
  });

  // D-018：原本拖到 10 位的桌就擋下，改為拖到 12 位的桌才擋下（SEAT-R20、改過的 SEAT-AC15）
  test('從「全部」分頁把已入座的人拖到已有 12 位的桌：留在原桌，Sonner「B10 桌已達 12 位，請先移出一位。」（SEAT-R20、SEAT-AC15）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
      await s.fill(5, 12);
    });
    await openSeating(page);
    await panelTab(page, '全部').click();
    await dragAndDrop(page, personRow(page, '王小明'), tableButton(page, 5));
    await expectToast(page, 'B10 桌已達 12 位，請先移出一位。', { undo: false });
    expect(await rosterNames(3)).toEqual(['王小明']);
  });

  test('已在這一桌的人放回同一桌的圓形上：沒有改變，也沒有 Sonner（SEAT-Q03 的目前假設）', async ({ page }) => {
    await seed(async (s) => {
      for (const name of ['甲', '王小明', '乙']) await s.employee(name, { tableId: 3 });
    });
    await openSeating(page);
    await panelTab(page, '全部').click();
    await dragAndDrop(page, personRow(page, '王小明'), tableButton(page, 3));
    await page.waitForTimeout(500);
    await expectNoToast(page);
    expect(await rosterNames(3)).toEqual(['甲', '王小明', '乙']);
  });
});

test.describe('拖回人員面板移出（SEAT-R26～R28、2.2.4）', () => {
  test('從詳情把名單列拖到人員面板：拖移中顯示「放開以移出桌次」；放開後變成未入座，Sonner 帶「復原」，參與人員總數不變（SEAT-AC05）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.employee('甲', { tableId: 3 });
      await s.employee('王小明', { tableId: 3 });
      await s.employee('李小華');
    });
    const total = await participantCount();
    await openSeating(page);
    const detail = await openTableDetail(page, 3);

    await startDrag(page, rowWithName(detailRows(detail), page, '王小明'));
    const hint = peoplePanel(page).getByText('放開以移出桌次');
    await expect(hint).toBeVisible();
    await dragOver(page, peoplePanel(page).getByRole('list').first());
    await drop(page);

    await expectToast(page, '已把 王小明 移出 B4 桌。', { undo: true });
    await expect(personRow(page, '王小明')).toHaveCount(1);
    await expect(panelTab(page, '未入座')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => rosterNames(3)).toEqual(['甲']);
    expect(await participantCount()).toBe(total);
    await expect(hint).toBeHidden();
  });

  test('從展開卡片拖回人員面板也是移出（SEAT-R15、SEAT-R26）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 3 });
      await s.employee('李小華');
    });
    await openSeating(page);
    await expandAll(page);
    await dragAndDrop(page, rowWithName(cardRows(page, 3), page, '王小明'), peoplePanel(page).getByRole('list').first());
    await expectToast(page, '已把 王小明 移出 B4 桌。', { undo: true });
    await expect.poll(() => rosterNames(3)).toEqual([]);
  });

  test('空位列不能拖（SEAT-R15）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('甲', { tableId: 3 });
      await s.employee('李小華');
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await startDrag(page, detailRows(detail).nth(5));
    await expect(peoplePanel(page).getByText('放開以移出桌次')).toBeHidden();
    await dragOver(page, peoplePanel(page).getByRole('list').first());
    await drop(page);
    await page.waitForTimeout(300);
    await expectNoToast(page);
    expect(await rosterNames(3)).toEqual(['甲']);
  });
});

test.describe('調整順序（SEAT-R32、R33）', () => {
  test('在桌次詳情把丁拖到甲那一列：丁、甲、乙、丙，人數不變，Sonner「已調整 B4 桌的座位順序。」帶「復原」（SEAT-AC07）', async ({ page }) => {
    await seed(async (s) => {
      for (const name of ['甲', '乙', '丙', '丁']) await s.employee(name, { tableId: 3 });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);
    await dragAndDrop(page, rowWithName(detailRows(detail), page, '丁'), rowWithName(detailRows(detail), page, '甲'));

    await expectToast(page, '已調整 B4 桌的座位順序。', { undo: true });
    await expectRoster(detailRows(detail), ['丁', '甲', '乙', '丙']);
    await expect(detail).toContainText('4/10 人');
    await expect.poll(() => rosterNames(3)).toEqual(['丁', '甲', '乙', '丙']);
  });

  test('已滿的桌次也可以調整順序：第 10 列拖到第 1 列，仍是 10 位（SEAT-R33、SEAT-AC16）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(5, 10, { prefix: '滿' });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 5);
    await dragAndDrop(page, detailRows(detail).nth(9), detailRows(detail).nth(0));

    await expectToast(page, '已調整 B10 桌的座位順序。', { undo: true });
    await expect.poll(async () => (await rosterNames(5))[0]).toBe('滿10');
    expect(await rosterNames(5)).toHaveLength(10);
  });

  test('展開的卡片也可以調整順序（SEAT-R32）', async ({ page }) => {
    await seed(async (s) => {
      for (const name of ['甲', '乙', '丙']) await s.employee(name, { tableId: 3 });
    });
    await openSeating(page);
    await widenMap(page);
    await expandAll(page);
    await dragAndDrop(page, rowWithName(cardRows(page, 3), page, '丙'), rowWithName(cardRows(page, 3), page, '甲'));
    await expectToast(page, '已調整 B4 桌的座位順序。', { undo: true });
    await expect.poll(() => rosterNames(3)).toEqual(['丙', '甲', '乙']);
  });
});

test.describe('拖移後部門標示立即更新（SEAT-R07、R08、R10）', () => {
  test('把林董拖進「研發一部＋業務部」的桌：部門變成「研發一部＋業務部＋貴賓」（SEAT-AC22）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(3, 3, { department: '研發一部', prefix: '研' });
      const biz = await s.employee('業甲', { department: '業務部', tableId: 3 });
      await s.dependent(biz, { tableId: 3 });
      await s.guest('林董');
    });
    await openSeating(page);
    await expandAll(page);
    await expect(mapTable(page, 3)).toContainText('研發一部＋業務部');
    await dragAndDrop(page, personRow(page, '林董'), mapTable(page, 3).getByText('B4 桌', { exact: true }));
    await expect(mapTable(page, 3)).toContainText('研發一部＋業務部＋貴賓');
  });

  test('人數改變就重新排列；業務部的人都移出後只剩研發一部（SEAT-AC24）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(3, 3, { department: '研發一部', prefix: '研' });
      await s.fill(3, 2, { department: '業務部', prefix: '業' });
      await s.employee('業三', { department: '業務部' });
      await s.employee('業四', { department: '業務部' });
    });
    await openSeating(page);
    await expandAll(page);
    const header = mapTable(page, 3).getByText('B4 桌', { exact: true });
    await expect(mapTable(page, 3)).toContainText('研發一部＋業務部');

    await dragAndDrop(page, personRow(page, '業三'), header);
    await expectToast(page, '已把 業三 安排到 B4 桌。', { undo: true });
    await dragAndDrop(page, personRow(page, '業四'), header);
    await expectToast(page, '已把 業四 安排到 B4 桌。', { undo: true });
    await expect(mapTable(page, 3)).toContainText('業務部＋研發一部');

    const detail = await openTableDetail(page, 3);
    for (const name of ['業1', '業2', '業三', '業四']) {
      await rowAction(page, rowWithName(detailRows(detail), page, name), '移出桌次');
      await expectToast(page, `已把 ${name} 移出 B4 桌。`, { undo: true });
    }
    await expect(detail).toContainText('部門：研發一部');
    await expect(detail).not.toContainText('業務部');
    await expect(mapTable(page, 3)).not.toContainText('業務部');
  });
});

// D-027：對調時兩桌交換位置（名單與備註名稱跟著桌子），畫面上的結果和原本相同：B4 的位置上是原本 B2 的名單。
// 資料庫用位置查（rosterNamesAt、noteNameAt），不用桌子的 id。搬到「未放桌」、暫存區等見 seating-tables.spec.ts。
test.describe('拖移把手對調桌次（SEAT-R35～R38）', () => {
  test('拖 B4 桌的把手到 B2 桌：名單與備註名稱整組對調，桌號與位置不變，B4、B2 都還有桌，Sonner「已把 B4 桌和 B2 桌對調。」帶「復原」（SEAT-AC30）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.noteName(3, '主桌');
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
      for (const name of ['丙', '丁', '戊']) await s.employee(name, { tableId: 7 });
    });
    await openSeating(page);
    const box3 = await mapTable(page, 3).boundingBox();
    const box7 = await mapTable(page, 7).boundingBox();

    await dragAndDrop(page, tableHandle(page, 3), tableButton(page, 7));

    await expectToast(page, '已把 B4 桌和 B2 桌對調。', { undo: true });
    await expect.poll(() => rosterNamesAt(3)).toEqual(['丙', '丁', '戊']);
    expect(await rosterNamesAt(7)).toEqual(['甲', '乙']);
    expect(await noteNameAt(3)).toBeNull();
    expect(await noteNameAt(7)).toBe('主桌');
    await expect(mapTable(page, 3)).toContainText('3/10');
    await expect(mapTable(page, 7)).toContainText('2/10');
    await expect(emptySlot(page, 3)).toHaveCount(0);
    await expect(emptySlot(page, 7)).toHaveCount(0);
    expect(await mapTable(page, 3).boundingBox()).toEqual(box3);
    expect(await mapTable(page, 7).boundingBox()).toEqual(box7);
  });

  test('拖移把手經過另一桌：來源桌透明度 0.6，目標桌邊框 --primary、陰影 --shadow-md（SEAT-R37、SEAT-AC31）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(3, 2);
      await s.fill(7, 2);
    });
    await openSeating(page);
    await startDrag(page, tableHandle(page, 3));
    await dragOver(page, tableButton(page, 7));
    await expect.poll(() => hasOpacity(mapTable(page, 3), 0.6)).toBe(true);
    await expect.poll(() => hasBorderColor(page, mapTable(page, 7), '--primary')).toBe(true);
    await expect.poll(() => hasShadow(page, mapTable(page, 7), '--shadow-md')).toBe(true);
    await drop(page);
  });

  test('已滿的桌次也可以對調（SEAT-R35）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(3, 10, { prefix: '三' });
      await s.employee('甲', { tableId: 7 });
    });
    await openSeating(page);
    await dragAndDrop(page, tableHandle(page, 3), tableButton(page, 7));
    await expectToast(page, '已把 B4 桌和 B2 桌對調。', { undo: true });
    await expect.poll(() => rosterNamesAt(3)).toEqual(['甲']);
    expect(await rosterNamesAt(7)).toHaveLength(10);
  });

  test('拖到空桌：整桌（名單與備註名稱）搬過去，B4 的位置變成空桌、沒有備註名稱（SEAT-R36、SEAT-AC32）', async ({ page }) => {
    await seed(async (s) => {
      await s.noteName(3, '主桌');
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
    });
    await openSeating(page);
    await dragAndDrop(page, tableHandle(page, 3), tableButton(page, 9));
    await expectToast(page, '已把 B4 桌和 B8 桌對調。', { undo: true });
    await expect.poll(() => rosterNamesAt(9)).toEqual(['甲', '乙']);
    expect(await noteNameAt(9)).toBe('主桌');
    expect(await rosterNamesAt(3)).toEqual([]);
    expect(await noteNameAt(3)).toBeNull();
    await expect(mapTable(page, 3)).toContainText('0/10');
  });

  test('把手放到自己身上、工作人員桌、舞台、空白處或人員面板：都沒有改變，也沒有 Sonner（SEAT-R38、SEAT-R48、SEAT-AC33）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.noteName(3, '主桌');
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
      await s.staff('工作甲');
      await s.employee('李小華');
    });
    await openSeating(page);

    await dragAndDrop(page, tableHandle(page, 3), tableButton(page, 3));
    await dragAndDrop(page, tableHandle(page, 3), staffTableButton(page));
    await dragAndDrop(page, tableHandle(page, 3), landmark(page, '舞台'));
    const blank = await blankPointIn(seatMap(page));
    await startDrag(page, tableHandle(page, 3));
    await dragOverPoint(page, blank);
    await drop(page);
    await dragAndDrop(page, tableHandle(page, 3), peoplePanel(page).getByRole('list').first());

    await page.waitForTimeout(500);
    await expectNoToast(page);
    expect(await rosterNames(3)).toEqual(['甲', '乙']);
    expect(await noteNameOf(3)).toBe('主桌');
    expect(await rosterNames(0)).toEqual(['工作甲']);
  });

  test('點桌次本身開啟詳情、沒有對調；從把手以外的地方拖不動整桌；拖人員列到桌次不會對調（SEAT-R37、SEAT-AC34）', async ({ page }) => {
    await seed(async (s) => {
      for (const name of ['甲', '乙']) await s.employee(name, { tableId: 3 });
      for (const name of ['丙']) await s.employee(name, { tableId: 7 });
    });
    await openSeating(page);

    await tableButton(page, 3).click();
    await expect(tableDetail(page, 3)).toBeVisible();
    await tableDetail(page, 3).getByRole('button', { name: '關閉' }).click();

    await dragAndDrop(page, tableButton(page, 3), tableButton(page, 7));
    await page.waitForTimeout(500);
    expect(await rosterNames(3)).toEqual(['甲', '乙']);
    expect(await rosterNames(7)).toEqual(['丙']);
    await expect(page.getByText('已把 B4 桌和 B2 桌對調。')).toHaveCount(0);
  });
});
