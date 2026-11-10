// 立即儲存、多人衝突與載入中（桌面）：docs/spec/seating.md SEAT-R85～R87、SEAT-AC87、SEAT-AC88、SEAT-AC90；
// docs/spec/README.md COM-R01～R05、COM-R07、COM-R08、COM-AC01、COM-AC03、COM-AC04；docs/architecture.md 第 10.3 節。
// 別人剛改過資料用直接寫資料庫模擬（畫面不會自動更新別人的改動，COM-R06）。
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { addMore, deleteParticipant, rosterNames, seatOf, seed, STAFF } from './helpers/seating-data';
import {
  chooseOption,
  dragAndDrop,
  expectToast,
  mapTable,
  openSeating,
  panelTab,
  personRow,
  rowAction,
  staffTable,
  staffTableButton,
  tableButton,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL, page }) => {
  test.skip(isMobileWidth(page), '桌面版面');
  await signIn(context, requireBaseURL(baseURL));
});

const saveStatus = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true });

async function seatViaDialog(page: Page, name: string, table: number) {
  await rowAction(page, personRow(page, name), '入座…');
  const dialog = page.getByRole('dialog', { name: `安排 ${name} 入座`, exact: true });
  await chooseOption(page, dialog, /^桌次/, new RegExp(`^第 ${table} 桌`));
  await dialog.getByRole('button', { name: '確認入座' }).click();
  // modal 關掉之後背景才不再是 aria-hidden，才能用角色查座位圖與人員面板
  await expect(dialog).toBeHidden();
}

test('把王小明安排到第 3 桌：Header 先「儲存中…」再「已儲存 {時:分}」；重新整理後仍在第 3 桌（SEAT-R85、SEAT-AC87、COM-AC01、COM-R05）', async ({
  page,
}) => {
  const wang = await seed(async (s) => s.employee('王小明'));
  await openSeating(page);

  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/api/seating/operations', async (route) => {
    await gate;
    await route.continue();
  });

  await seatViaDialog(page, '王小明', 3);
  // 畫面立即反映（COM-R02）
  await expect(mapTable(page, 3)).toContainText('1/10');
  await expect(saveStatus(page, '儲存中…')).toBeVisible();
  release();
  await expect(saveStatus(page, /^已儲存 \d{2}:\d{2}$/)).toBeVisible();
  await page.unroute('**/api/seating/operations');

  await openSeating(page);
  await panelTab(page, '全部').click();
  await expect(personRow(page, '王小明').getByRole('button', { name: '第 3 桌', exact: true })).toBeVisible();
  expect(await seatOf(wang)).toEqual({ tableId: 3, seatOrder: 0 });
});

test('網路中斷：畫面保留結果，Header「儲存失敗，請檢查網路後再試一次。」與「重試」；恢復後按「重試」儲存成功（COM-R04、COM-AC03）', async ({ page }) => {
  const wang = await seed(async (s) => s.employee('王小明'));
  await openSeating(page);
  await page.route('**/api/seating/operations', (route) => route.abort('internetdisconnected'));

  await seatViaDialog(page, '王小明', 7);
  await expect(saveStatus(page, '儲存失敗，請檢查網路後再試一次。')).toBeVisible();
  await expect(mapTable(page, 7)).toContainText('1/10');
  expect(await seatOf(wang)).toEqual({ tableId: null, seatOrder: null });

  await page.unroute('**/api/seating/operations');
  await page.getByRole('button', { name: '重試' }).filter({ visible: true }).click();
  await expect(saveStatus(page, /^已儲存 \d{2}:\d{2}$/)).toBeVisible();
  await expect.poll(() => seatOf(wang)).toEqual({ tableId: 7, seatOrder: 0 });
});

test('畫面上第 5 桌 9 位、別人已把它坐滿：拖王小明進去不儲存，重新載入最新資料，顯示「第 5 桌已滿，請先移出一位。」（SEAT-R86、SEAT-AC88、COM-AC04）', async ({
  page,
}) => {
  const wang = await seed(async (s) => {
    await s.fill(5, 9);
    return s.employee('王小明');
  });
  await openSeating(page);
  await expect(mapTable(page, 5)).toContainText('9/10');

  await addMore(async (s) => {
    await s.employee('別人加的', { tableId: 5, seatOrder: 9 });
  });

  await dragAndDrop(page, personRow(page, '王小明'), tableButton(page, 5));
  await expectToast(page, '第 5 桌已滿，請先移出一位。', { undo: false });
  await expect(mapTable(page, 5)).toContainText('已滿');
  await expect(personRow(page, '王小明')).toHaveCount(1);
  expect(await seatOf(wang)).toEqual({ tableId: null, seatOrder: null });
  expect(await rosterNames(5)).toContain('別人加的');
});

test('工作人員桌被別人放滿：放進工作人員桌不儲存，重新載入，顯示「工作人員桌已滿，請先移出一位。」（SEAT-R86）', async ({ page }) => {
  const wang = await seed(async (s) => {
    await s.fill(STAFF, 9, { prefix: '工作' });
    return s.employee('王小明');
  });
  await openSeating(page);
  await addMore(async (s) => {
    await s.employee('別人加的工作人員', { tableId: STAFF, seatOrder: 9 });
  });

  await dragAndDrop(page, personRow(page, '王小明'), staffTableButton(page));
  await expectToast(page, '工作人員桌已滿，請先移出一位。', { undo: false });
  await expect(staffTable(page)).toContainText('已滿');
  expect(await seatOf(wang)).toEqual({ tableId: null, seatOrder: null });
});

test('人員已被別人刪除：操作不儲存，重新載入，顯示「資料已被其他人更新，已重新載入。」（COM-R07、COM-R08）', async ({ page }) => {
  const wang = await seed(async (s) => {
    await s.employee('李小華');
    return s.employee('王小明');
  });
  await openSeating(page);
  await deleteParticipant(wang);

  await seatViaDialog(page, '王小明', 3);
  await expect(page.getByText('資料已被其他人更新，已重新載入。')).toBeVisible();
  await expect(personRow(page, '王小明')).toHaveCount(0);
  await expect(mapTable(page, 3)).toContainText('0/10');
});

test('資料還在載入：座位圖顯示 30 個圓形的 Skeleton，人員面板顯示列形狀的 Skeleton，沒有文字（SEAT-R87、SEAT-AC90）', async ({ page }) => {
  await seed(async (s) => {
    await s.employee('王小明');
  });
  await page.goto('/people');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // 擋住切到座位安排的那一次 RSC 請求，讓頁面停在載入中
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(
    (url) => url.pathname === '/',
    async (route) => {
      const h = route.request().headers();
      if (h['rsc'] === '1' && !h['next-router-prefetch']) await gate;
      await route.continue();
    },
  );
  await page.getByRole('link', { name: '座位安排', exact: true }).filter({ visible: true }).click();

  const loading = page.getByRole('status', { name: '載入中' });
  await expect(loading.first()).toBeVisible();
  const info = await page.evaluate(() => {
    const regions = Array.from(document.querySelectorAll('[role="status"]'));
    let circles = 0;
    let others = 0;
    let text = '';
    for (const region of regions) {
      text += (region as HTMLElement).innerText;
      for (const el of Array.from(region.querySelectorAll('*'))) {
        const s = getComputedStyle(el);
        const w = parseFloat(s.width);
        const h = parseFloat(s.height);
        if (!(w > 0 && h > 0) || el.children.length > 0) continue;
        if (Math.abs(w - h) < 1 && parseFloat(s.borderTopLeftRadius) >= w / 2 - 1) circles++;
        else others++;
      }
    }
    return { circles, others, text: text.trim() };
  });
  expect(info.circles, '座位圖的圓形 Skeleton').toBe(30);
  expect(info.others, '人員面板的列形狀 Skeleton').toBeGreaterThan(0);
  expect(info.text).toBe('');

  release();
  await expect(tableButton(page, 1)).toBeVisible();
});
