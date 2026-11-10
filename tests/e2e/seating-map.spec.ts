// 座位安排：頁首、統計列、座位圖排列、桌次標示、備註名稱、桌次詳情、座位圖上的工作人員桌。
// docs/spec/seating.md 2.1.1～2.1.9、2.3.1、2.3.2、2.5.1、4.1、4.3、4.5；SEAT-R01、R03～R05、R07～R13、R48、R49、R72～R75；
// SEAT-AC20～AC23、AC25～AC29、AC48、AC89；docs/spec/participants.md PPL-R33 與 docs/plan/implementation-plan.md 5.2
// （參與人員頁的「{桌號}」開啟 /?table={桌號}，顯示並標示那一桌）。桌號 A1～A15、B1～B15（D-019）。
// 測試資料用內部編號（tableId 1–30）建立，畫面上的字用桌號（對應見 tests/helpers/table-codes.ts）。
// 適合視窗的比例常低於 80%（精簡顯示，只有桌號與人數），所以看備註名稱與部門時先「全部展開」或放大到 80% 以上。
// 無障礙名稱的假設見 tests/e2e/helpers/seating-page.ts 開頭。
import { expect, test, type Page } from '@playwright/test';
import { CODES_IN_LIST_ORDER, codeOf } from '../helpers/table-codes';
import { signIn } from './helpers/auth';
import { isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { noteNameOf, seed, setEmployeeDepartmentByName, STAFF } from './helpers/seating-data';
import {
  cardRows,
  detailRows,
  expandAll,
  expectRoster,
  expectStats,
  expectToast,
  hasBorderColor,
  hasDashedBorder,
  isInside,
  landmark,
  mapTable,
  menuItemsOf,
  openSeating,
  openTableDetail,
  peoplePanel,
  rowWithName,
  seatMap,
  staffTable,
  styleOfText,
  tableButton,
  tableDetail,
  tableHandle,
  tokenColor,
  toolbarButton,
  zoomToRegular,
} from './helpers/seating-page';

test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, requireBaseURL(baseURL));
});

const desktopOnly = (page: Page) => test.skip(isMobileWidth(page), '桌面版面；手機見 seating-mobile.spec.ts');

/** 內部編號 → [欄, 列]（docs/spec/seating.md 2.1.4 的欄與列對照；欄 0–5 是 A 外、A 中、A 內、B 內、B 中、B 外；例如 1 是 B1、2 是 A1） */
const LAYOUT: Record<number, [number, number]> = {
  1: [3, 0], 2: [2, 0], 3: [5, 1], 4: [5, 2], 5: [5, 3], 6: [5, 4], 7: [4, 0.5], 8: [4, 1.5], 9: [4, 2.5], 10: [4, 3.5],
  11: [4, 4.5], 12: [3, 1], 13: [3, 2], 14: [3, 3], 15: [3, 4], 16: [3, 5], 17: [2, 1], 18: [2, 2], 19: [2, 3], 20: [2, 4],
  21: [2, 5], 22: [1, 0.5], 23: [1, 1.5], 24: [1, 2.5], 25: [1, 3.5], 26: [1, 4.5], 27: [0, 1], 28: [0, 2], 29: [0, 3], 30: [0, 4],
};

async function centerOf(page: Page, n: number) {
  const box = await mapTable(page, n).boundingBox();
  if (!box) throw new Error(`量不到 ${codeOf(n)} 桌`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

test.describe('頁首與工具列（2.1.1、2.1.3）', () => {
  test('H1「座位安排」、「新增人員」按鈕與工具列（縮小、比例、放大、適合視窗、全部展開、自動排座）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明');
    });
    await openSeating(page);

    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expect(page.getByRole('button', { name: '新增人員', exact: true })).toBeVisible();
    for (const name of ['縮小', '放大', '適合視窗', '全部展開', '自動排座']) {
      await expect(toolbarButton(page, name), name).toBeVisible();
    }
    const pctText = page.getByText(/^\d+%$/).filter({ visible: true });
    await expect(pctText).toHaveCount(1);

    // 比例文字在縮小與放大之間
    const out = await toolbarButton(page, '縮小').boundingBox();
    const pct = await pctText.boundingBox();
    const zin = await toolbarButton(page, '放大').boundingBox();
    if (!out || !pct || !zin) throw new Error('量不到工具列');
    expect(pct.x).toBeGreaterThan(out.x);
    expect(pct.x).toBeLessThan(zin.x);
  });

  test('人員面板顯示時，工具列沒有「顯示人員面板」，面板有「隱藏人員面板」（2.1.3、2.2.1）', async ({ page }) => {
    desktopOnly(page);
    await seed(async () => {});
    await openSeating(page);
    await expect(peoplePanel(page).getByRole('button', { name: '隱藏人員面板' })).toBeVisible();
    await expect(toolbarButton(page, '顯示人員面板')).toHaveCount(0);
  });
});

test.describe('統計列（SEAT-R75、SEAT-R47）', () => {
  test('已入座 {n}／{總人數}・未入座 {m}・空位 {k}・已滿 {t} 桌；工作人員桌的人都不算', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(3, 4);
      await s.fill(5, 10);
      await s.unseated(2);
      await s.guest('林董');
      await s.staff('工作甲');
      await s.staff('工作乙');
    });
    await openSeating(page);
    await expectStats(page, { seated: 14, total: 17, unseated: 3, empty: 286, full: 1 });
  });
});

test.describe('座位圖的排列（SEAT-R01、R03～R05、SEAT-AC21）', () => {
  test('30 桌依欄與列排列：同一欄對齊、同一列對齊、相鄰的列錯開半格；A1、B1 桌最靠近舞台', async ({ page }) => {
    await seed(async () => {});
    await openSeating(page);

    await expect(seatMap(page).getByRole('group', { name: /^[AB]\d{1,2} 桌$/ })).toHaveCount(30);
    const centers = new Map<number, { x: number; y: number }>();
    for (let n = 1; n <= 30; n++) centers.set(n, await centerOf(page, n));

    for (let a = 1; a <= 30; a++) {
      for (let b = a + 1; b <= 30; b++) {
        const [ca, ra] = LAYOUT[a]!;
        const [cb, rb] = LAYOUT[b]!;
        const pa = centers.get(a)!;
        const pb = centers.get(b)!;
        const pair = `${codeOf(a)}、${codeOf(b)} 桌`;
        if (ca === cb) expect(Math.abs(pa.x - pb.x), `${pair}同一欄`).toBeLessThanOrEqual(2);
        else expect(Math.sign(pb.x - pa.x), `${pair}的左右`).toBe(Math.sign(cb - ca));
        if (ra === rb) expect(Math.abs(pa.y - pb.y), `${pair}同一列`).toBeLessThanOrEqual(2);
        else expect(Math.sign(pb.y - pa.y), `${pair}的上下`).toBe(Math.sign(rb - ra));
      }
    }

    // 錯開半格：B2 桌（內部編號 7，列 0.5）在 B1 桌（列 0）與 B3 桌（內部編號 12，列 1）的正中間
    const y1 = centers.get(1)!.y;
    expect(Math.abs(centers.get(7)!.y - (y1 + centers.get(12)!.y) / 2)).toBeLessThanOrEqual(3);

    // 主桌最靠近舞台
    const minY = Math.min(...[...centers.values()].map((c) => c.y));
    expect(Math.abs(centers.get(1)!.y - minY)).toBeLessThanOrEqual(2);
    expect(Math.abs(centers.get(2)!.y - minY)).toBeLessThanOrEqual(2);
  });

  test('工作人員桌在 B 區外側列最上面（控台下方、B4 桌上方），和 A1、B1 桌同一列（SEAT-R05）', async ({ page }) => {
    await seed(async () => {});
    await openSeating(page);
    const staff = await staffTable(page).boundingBox();
    if (!staff) throw new Error('量不到工作人員桌');
    const t3 = await centerOf(page, 3);
    const t1 = await centerOf(page, 1);
    expect(Math.abs(staff.x + staff.width / 2 - t3.x)).toBeLessThanOrEqual(2);
    expect(staff.y + staff.height / 2).toBeLessThan(t3.y);
    expect(Math.abs(staff.y + staff.height / 2 - t1.y)).toBeLessThanOrEqual(2);
  });

  test('地標：領獎區在 A 外、A 中上方；舞台在 A 內、B 內上方；控台在 B 中、B 外上方；出入口在下方中間（2.1.4）', async ({ page }) => {
    await seed(async () => {});
    await openSeating(page);
    const box = async (name: '舞台' | '領獎區' | '控台' | '出入口') => {
      const b = await landmark(page, name).boundingBox();
      if (!b) throw new Error(`量不到${name}`);
      return b;
    };
    const covers = (b: { x: number; width: number }, x: number) => b.x <= x && x <= b.x + b.width;

    const stage = await box('舞台');
    const t1 = await centerOf(page, 1);
    const t2 = await centerOf(page, 2);
    expect(covers(stage, t1.x) && covers(stage, t2.x)).toBe(true);
    expect(stage.y + stage.height).toBeLessThanOrEqual(Math.min(t1.box.y, t2.box.y) + 1);

    const award = await box('領獎區');
    expect(covers(award, (await centerOf(page, 27)).x) && covers(award, (await centerOf(page, 22)).x)).toBe(true);
    expect(award.y + award.height).toBeLessThanOrEqual(t1.box.y + 1);

    const control = await box('控台');
    expect(covers(control, (await centerOf(page, 7)).x) && covers(control, (await centerOf(page, 3)).x)).toBe(true);
    const staff = await staffTable(page).boundingBox();
    if (!staff) throw new Error('量不到工作人員桌');
    expect(control.y + control.height).toBeLessThanOrEqual(staff.y + 1);

    const exit = await box('出入口');
    const t16 = await centerOf(page, 16);
    const t21 = await centerOf(page, 21);
    expect(exit.y).toBeGreaterThanOrEqual(Math.max(t16.box.y + t16.box.height, t21.box.y + t21.box.height) - 1);
    expect(covers(exit, (t16.x + t21.x) / 2)).toBe(true);
  });

  test('桌號寫成「A1」，不寫成「A-1」；沒有新增、刪除桌次或改桌號的操作（SEAT-R01、SEAT-R04、README 第 13 節用語表）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.fill(3, 2);
    });
    await openSeating(page);
    await expect(page.locator('body')).not.toContainText(/[AB]-\d{1,2}/);
    await expect(page.getByRole('button', { name: /新增桌|刪除桌|桌號/ })).toHaveCount(0);
    await expandAll(page);
    await expect(page.locator('body')).not.toContainText(/[AB]-\d{1,2}/);
  });

  test('30 桌各顯示自己的桌號：收合時只有「A3」（不加「桌」），座位圖上沒有「第 n 桌」（SEAT-R04、SEAT-AC21、2.1.5）', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async () => {});
    await openSeating(page);
    await zoomToRegular(page);

    for (const code of CODES_IN_LIST_ORDER) {
      const table = mapTable(page, code);
      await expect(table, code).toBeVisible();
      // 收合時畫面上的桌號文字正好是「A3」（exact：「A1」不會對到「A10」）
      await expect(table.getByText(code, { exact: true }).first(), `${code} 的桌號`).toBeVisible();
    }
    await expect(seatMap(page)).not.toContainText(/第 \d+ 桌/);

    // 例子：收合的 A3 桌顯示「A3」
    await expect(mapTable(page, 'A3').getByText('A3', { exact: true })).toBeVisible();
  });

  test('精簡顯示與一般收合時，三個字元的桌號「A15」「B15」「A10」完整顯示、不被截斷或裁切（2.1.5、2.1.6）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      // 有人的桌與空桌都看：A15（內部編號 21）坐 10 位顯示「已滿」，B15（16）空桌
      await s.fill(21, 10);
    });
    await openSeating(page);

    const expectWhole = async (code: string, label: string) => {
      const table = mapTable(page, code);
      const text = table.getByText(code, { exact: true }).first();
      await expect(text, `${label}：${code}`).toBeVisible();
      // 文字沒有被截斷（內容沒有超出自己的框，所以不會出現省略號）
      expect(await text.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${label}：${code} 沒有被截斷`).toBe(true);
      // 文字在桌次的圓形裡，沒有被裁切到外面
      expect(await isInside(text, table), `${label}：${code} 在桌次裡`).toBe(true);
      // 文字的每一個祖先（到桌次為止）都沒有把它裁掉
      expect(
        await text.evaluate((el) => {
          const r = el.getBoundingClientRect();
          for (let a = el.parentElement; a && a.getAttribute('role') !== 'group'; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (s.overflow === 'visible' && s.overflowX === 'visible') continue;
            const b = a.getBoundingClientRect();
            if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) return false;
          }
          return true;
        }),
        `${label}：${code} 沒有被外層裁切`,
      ).toBe(true);
    };

    // 精簡顯示：縮放低於 80%，桌號用 Text-4xl（2.1.6）
    for (let i = 0; i < 25; i++) await toolbarButton(page, '縮小').click();
    for (const code of ['A15', 'B15', 'A10', 'B10']) await expectWhole(code, '精簡顯示');

    // 一般收合：80% 以上（2.1.5）
    await zoomToRegular(page);
    for (const code of ['A15', 'B15', 'A10', 'B10']) await expectWhole(code, '一般收合');
  });
});

test.describe('桌次標示（SEAT-R07～R13）', () => {
  test('空桌：邊框虛線、桌號用 --muted-foreground、部門「空桌」、人數「0/10」；詳情「部門：—」「兒童椅 0 張」「素食 0 位」、10 列空位（SEAT-R09、SEAT-AC20）', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(3, 2);
    });
    await openSeating(page);
    await zoomToRegular(page);

    const t9 = mapTable(page, 9);
    await expect(t9).toContainText('空桌');
    await expect(t9).toContainText('0/10');
    expect(await hasDashedBorder(t9)).toBe(true);
    expect(await hasDashedBorder(mapTable(page, 3))).toBe(false);
    // 內部編號 9 是 B8 桌：桌號文字「B8」
    expect((await styleOfText(t9, 'B8'))?.color).toBe(await tokenColor(page, '--muted-foreground'));

    const detail = await openTableDetail(page, 9);
    await expect(detail).toContainText('部門：—');
    await expect(detail).toContainText('兒童椅 0 張');
    await expect(detail).toContainText('素食 0 位');
    await expectRoster(detailRows(detail), []);
  });

  test('人數「{已入座}/10」；滿 10 位改為正向徽章「已滿」（SEAT-R02、SEAT-R11、2.1.9）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(3, 4);
      await s.fill(5, 10);
    });
    await openSeating(page);
    await expect(mapTable(page, 3)).toContainText('4/10');
    await expect(mapTable(page, 5)).toContainText('已滿');
    await expect(mapTable(page, 5)).not.toContainText('10/10');
  });

  test('部門依人數多到少以「＋」連接（眷屬算所屬員工的部門），有外部貴賓時最後加「貴賓」（SEAT-R07、SEAT-R08、SEAT-AC22）', async ({
    page,
  }) => {
    await seed(async (s) => {
      await s.fill(3, 3, { department: '研發一部', prefix: '研' });
      const biz = await s.employee('業甲', { department: '業務部', tableId: 3 });
      await s.dependent(biz, { tableId: 3 });
      await s.fill(4, 2, { department: '研發一部', prefix: '研四' });
      await s.guest('林董', { tableId: 4 });
    });
    await openSeating(page);
    await expandAll(page);
    await expect(mapTable(page, 3)).toContainText('研發一部＋業務部');
    await expect(mapTable(page, 4)).toContainText('研發一部＋貴賓');
  });

  test('只有外部貴賓的桌，部門是「貴賓」（SEAT-R08、SEAT-AC23）', async ({ page }) => {
    await seed(async (s) => {
      await s.guest('林董', { tableId: 12 });
      await s.guest('張董', { tableId: 12 });
    });
    await openSeating(page);
    await expandAll(page);
    await expect(mapTable(page, 12)).toContainText('貴賓');
    await expect(mapTable(page, 12)).not.toContainText('空桌');
  });

  test('員工名單改了部門，回到座位安排後員工與眷屬所在桌次的部門跟著變（SEAT-R10、SEAT-AC25）', async ({ page }) => {
    await seed(async (s) => {
      const wang = await s.employee('王小明', { department: '研發一部', tableId: 3 });
      await s.fill(3, 2, { department: '研發一部', prefix: '研' });
      await s.dependent(wang, { tableId: 8 });
    });
    await openSeating(page);
    await expandAll(page);
    await expect(mapTable(page, 3)).toContainText('研發一部');
    await expect(mapTable(page, 8)).toContainText('研發一部');

    await setEmployeeDepartmentByName('王小明', '業務部');
    await openSeating(page);
    // 展開狀態會記住（SEAT-R70）；沒有記住時再展開一次
    if (await toolbarButton(page, '全部展開').isVisible()) await expandAll(page);
    await expect(mapTable(page, 3)).toContainText('業務部');
    await expect(mapTable(page, 8)).toContainText('業務部');
    await expect(mapTable(page, 8)).not.toContainText('研發一部');
  });

  test('有備註名稱：收合時顯示備註名稱、部門在 Tooltip「{備註名稱}・{部門}」；沒有時顯示部門、Tooltip 只有部門；展開時備註名稱在部門上方（SEAT-R13、SEAT-AC26）', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.noteName(7, '主桌');
      await s.fill(7, 2, { department: '研發一部', prefix: '主' });
      await s.fill(8, 2, { department: '研發一部', prefix: '八' });
    });
    await openSeating(page);
    await zoomToRegular(page);

    await expect(mapTable(page, 7)).toContainText('主桌');
    await expect(mapTable(page, 7)).not.toContainText('研發一部');
    await tableButton(page, 7).hover();
    await expect(page.getByRole('tooltip').first()).toContainText('主桌・研發一部');

    await page.mouse.move(0, 0);
    await expect(mapTable(page, 8)).toContainText('研發一部');
    await tableButton(page, 8).hover();
    await expect(page.getByRole('tooltip').first()).toHaveText('研發一部');
    await page.mouse.move(0, 0);

    await expandAll(page);
    const note = await mapTable(page, 7).getByText('主桌', { exact: true }).boundingBox();
    const dept = await mapTable(page, 7).getByText('研發一部', { exact: true }).boundingBox();
    if (!note || !dept) throw new Error('量不到備註名稱或部門');
    expect(note.y).toBeLessThan(dept.y);
  });

  test('精簡顯示（低於 80%）時，備註名稱與部門改由 Tooltip 顯示（2.1.6、SEAT-R68）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.noteName(7, '主桌');
      await s.fill(7, 2, { department: '研發一部' });
    });
    await openSeating(page);
    for (let i = 0; i < 25; i++) await toolbarButton(page, '縮小').click();
    await expect(mapTable(page, 7)).not.toContainText('主桌');
    await tableButton(page, 7).hover();
    await expect(page.getByRole('tooltip').first()).toContainText('主桌・研發一部');
  });
});

test.describe('備註名稱（SEAT-R12、SEAT-R80）', () => {
  test('輸入後離開欄位就儲存，Sonner「已儲存」不帶「復原」；清空後離開就移除，改顯示部門（SEAT-AC27）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(7, 2, { department: '研發一部' });
    });
    await openSeating(page);
    await expandAll(page);
    const detail = await openTableDetail(page, 7);
    const field = detail.getByRole('textbox', { name: '備註名稱' });
    await expect(field).toHaveAttribute('placeholder', '例如主桌、董事貴賓、供應商');

    await field.fill('供應商');
    await field.press('Tab');
    await expectToast(page, '已儲存', { undo: false });
    await expect(mapTable(page, 7)).toContainText('供應商');
    await expect.poll(() => noteNameOf(7)).toBe('供應商');

    await field.fill('');
    await field.press('Tab');
    await expect.poll(() => noteNameOf(7)).toBeNull();
    await expect(mapTable(page, 7)).not.toContainText('供應商');
    await expect(mapTable(page, 7)).toContainText('研發一部');
  });

  test('按常用選項：把選項填入欄位並儲存（SEAT-R12、SEAT-AC28、SEAT-Q13 的目前假設：取代並立即儲存）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(7, 1);
    });
    await openSeating(page);
    await expandAll(page);
    const detail = await openTableDetail(page, 7);
    for (const name of ['主桌', '董事貴賓', '供應商', '客戶貴賓']) {
      await expect(detail.getByRole('button', { name, exact: true }), name).toBeVisible();
    }
    await detail.getByRole('textbox', { name: '備註名稱' }).fill('舊的');
    await detail.getByRole('button', { name: '董事貴賓', exact: true }).click();
    await expect(detail.getByRole('textbox', { name: '備註名稱' })).toHaveValue('董事貴賓');
    await expect.poll(() => noteNameOf(7)).toBe('董事貴賓');
    await expectToast(page, '已儲存', { undo: false });
    await expect(mapTable(page, 7)).toContainText('董事貴賓');
  });
});

test.describe('名單標示與兒童椅、素食（SEAT-R11、2.1.8、SEAT-AC29）', () => {
  test('詳情顯示兒童椅與素食人數；展開卡片的名單列有「賓」與圖示徽章、滑過顯示 Tooltip；姓名完整、不放分機', async ({
    page,
  }) => {
    desktopOnly(page);
    await seed(async (s) => {
      const wang = await s.employee('王小明', { department: '研發一部', extension: '1234', tableId: 3 });
      await s.dependent(wang, { tableId: 3, childSeat: true, vegetarian: true });
      await s.guest('林董', { tableId: 3, childSeat: true, organization: '測試科技 董事長' });
    });
    await openSeating(page);

    const detail = await openTableDetail(page, 3);
    await expect(detail).toContainText('兒童椅 2 張');
    await expect(detail).toContainText('素食 1 位');
    await detail.getByRole('button', { name: '關閉' }).click();

    await expandAll(page);
    const rows = cardRows(page, 3);
    await expect(rows).toHaveCount(10);
    await expect(rows.nth(9)).toContainText('空位');
    await expect(mapTable(page, 3)).not.toContainText('1234');

    const lin = rowWithName(rows, page, '林董');
    await lin.getByText('賓', { exact: true }).hover();
    await expect(page.getByRole('tooltip').first()).toContainText('貴賓');

    const dep = rowWithName(rows, page, '王小明_眷屬');
    await dep.getByLabel('兒童椅').hover();
    await expect(page.getByRole('tooltip').first()).toContainText('兒童椅');
    await dep.getByLabel('素食').hover();
    await expect(page.getByRole('tooltip').first()).toContainText('素食');

    // 姓名完整顯示，不被標示擠到截斷
    const name = dep.getByText('王小明_眷屬', { exact: true });
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    // 眷屬不另加徽章（顯示名稱已有「_眷屬」）
    await expect(dep.getByText('眷屬', { exact: true })).toHaveCount(0);
  });
});

test.describe('桌次詳情（2.3、SEAT-R72～R74）', () => {
  test('版面：標題、副標、備註名稱、部門、名單與說明、名單列第二行、列操作、底部按鈕（2.3.1、2.3.2、COM-R10）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      const wang = await s.employee('王小明', { department: '研發一部', extension: '1234', tableId: 3 });
      await s.dependent(wang, { tableId: 3 });
      await s.guest('林董', { tableId: 3, organization: '測試科技 董事長' });
      await s.employee('陳大文', { department: '研發一部', tableId: 3 });
    });
    await openSeating(page);
    const detail = await openTableDetail(page, 3);

    await expect(detail.getByRole('heading', { name: 'B4 桌', exact: true })).toBeVisible();
    await expect(detail).toContainText('4/10 人');
    await expect(detail.getByRole('textbox', { name: '備註名稱' })).toBeVisible();
    await expect(detail).toContainText('部門：研發一部＋貴賓');
    await expect(detail).toContainText('拖移可以調整順序，也可以從人員面板直接拖進來。');

    const rows = detailRows(detail);
    await expectRoster(rows, ['王小明', '王小明_眷屬', '林董', '陳大文']);
    await expect(rowWithName(rows, page, '王小明')).toContainText('研發一部・分機 1234');
    await expect(rowWithName(rows, page, '王小明_眷屬')).toContainText('研發一部');
    await expect(rowWithName(rows, page, '王小明_眷屬')).not.toContainText('分機');
    await expect(rowWithName(rows, page, '林董')).toContainText('測試科技 董事長');
    await expect(rowWithName(rows, page, '陳大文')).not.toContainText('分機');

    expect(await menuItemsOf(page, rowWithName(rows, page, '王小明'))).toEqual(['移至其他桌次…', '移出桌次', '編輯']);

    for (const name of ['加入人員', '調換桌次…', '清空桌次']) {
      await expect(detail.getByRole('button', { name, exact: true }), name).toBeVisible();
    }
    await expect(detail.getByRole('button', { name: '關閉' })).toBeVisible();
  });

  test('詳情打開時點另一桌就換成那一桌；人員面板仍可操作；按關閉鈕關閉（SEAT-R73、SEAT-AC89）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(3, 2);
      await s.fill(7, 1);
      await s.employee('王小明');
    });
    await openSeating(page);
    await openTableDetail(page, 3);

    await tableButton(page, 7).click();
    await expect(tableDetail(page, 7)).toBeVisible();
    await expect(tableDetail(page, 3)).toHaveCount(0);

    // 不是 modal：人員面板仍可操作
    await peoplePanel(page).getByPlaceholder('搜尋姓名、分機、部門或單位').fill('王');
    await expect(peoplePanel(page).getByPlaceholder('搜尋姓名、分機、部門或單位')).toHaveValue('王');
    await expect(tableDetail(page, 7)).toBeVisible();

    await tableDetail(page, 7).getByRole('button', { name: '關閉' }).click();
    await expect(tableDetail(page, 7)).toHaveCount(0);
  });

  test('點擊桌次（把手以外）開啟詳情；按把手不會開啟詳情（SEAT-R72、SEAT-R37）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(3, 1);
    });
    await openSeating(page);
    await tableHandle(page, 3).click();
    await expect(tableDetail(page, 3)).toHaveCount(0);
    await tableButton(page, 3).click();
    await expect(tableDetail(page, 3)).toBeVisible();
  });

  test('全部展開時點卡片也開啟那一桌的詳情（SEAT-R72）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.fill(3, 1);
    });
    await openSeating(page);
    await expandAll(page);
    await tableButton(page, 3).click();
    await expect(tableDetail(page, 3)).toBeVisible();
  });

  test('網址 /?table={桌號}：開啟座位安排，顯示那一桌的詳情並標示那一桌（PPL-R33、SEAT-R62、D-019）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('王小明', { tableId: 12 }); // B3 桌
    });
    await page.goto('/?table=B3');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expect(tableDetail(page, 'B3')).toBeVisible();
    await expect(detailRows(tableDetail(page, 'B3')).filter({ hasText: '王小明' })).toHaveCount(1);
    if (!isMobileWidth(page)) {
      await expect.poll(() => hasBorderColor(page, mapTable(page, 'B3'), '--accent', '2px')).toBe(true);
    }
  });

  test('網址 /?table=A1、/?table=B15：每個桌號都開到自己那一桌，不會把 A1 當成 A10～A15（D-019）', async ({ page }) => {
    await seed(async (s) => {
      await s.employee('甲', { tableId: 2 }); // A1 桌
      await s.employee('乙', { tableId: 16 }); // B15 桌
    });
    await page.goto('/?table=A1');
    await expect(tableDetail(page, 'A1')).toBeVisible();
    await expect(tableDetail(page, 'A1').getByRole('heading', { name: 'A1 桌', exact: true })).toBeVisible();
    await expect(detailRows(tableDetail(page, 'A1')).filter({ hasText: '甲' })).toHaveCount(1);
    for (const other of ['A10', 'A11', 'A12', 'A13', 'A14', 'A15']) await expect(tableDetail(page, other)).toHaveCount(0);

    await page.goto('/?table=B15');
    await expect(tableDetail(page, 'B15')).toBeVisible();
    await expect(detailRows(tableDetail(page, 'B15')).filter({ hasText: '乙' })).toHaveCount(1);
  });
});

test.describe('座位圖上的工作人員桌（2.5.1、SEAT-R48、SEAT-R49、SEAT-AC48）', () => {
  test('收合時顯示「工作人員」與「{n}/10」，沒有桌號與把手；Tooltip「工作人員桌・{部門}」', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.staff('工作甲', { department: '研發一部' });
      await s.staff('工作乙', { department: '研發一部' });
    });
    await openSeating(page);
    await zoomToRegular(page);
    const staff = staffTable(page);
    await expect(staff).toContainText('工作人員');
    await expect(staff).toContainText('2/10');
    await expect(staff).not.toContainText(/第 \d+ 桌|[AB]\d{1,2}/);
    await expect(staff.getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
    expect(await hasDashedBorder(staff)).toBe(false);
    await staff.getByRole('button', { name: /^工作人員桌/ }).hover();
    await expect(page.getByRole('tooltip').first()).toContainText('工作人員桌・研發一部');
  });

  test('縮放低於 80% 時「工作人員」用 Text-lg（2.5.1、SEAT-AC48）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.staff('工作甲', { department: '研發一部' });
    });
    await openSeating(page);
    for (let i = 0; i < 25; i++) await toolbarButton(page, '縮小').click();
    const lg = await page.evaluate(() => {
      const d = document.createElement('div');
      d.style.fontSize = 'var(--font-size-lg)';
      document.body.appendChild(d);
      const v = getComputedStyle(d).fontSize;
      d.remove();
      return v;
    });
    expect((await styleOfText(staffTable(page), '工作人員'))?.fontSize).toBe(lg);
  });

  test('沒有人的工作人員桌：邊框虛線、「0/10」（2.5.1）', async ({ page }) => {
    desktopOnly(page);
    await seed(async () => {});
    await openSeating(page);
    expect(await hasDashedBorder(staffTable(page))).toBe(true);
    await expect(staffTable(page)).toContainText('0/10');
  });

  test('工作人員桌滿 10 位：人數改為「已滿」（2.5.1）', async ({ page }) => {
    await seed(async (s) => {
      await s.fill(STAFF, 10, { prefix: '工作' });
    });
    await openSeating(page);
    await expect(staffTable(page)).toContainText('已滿');
  });

  test('展開時工作人員桌是名單卡片：標題「工作人員桌」、部門與 10 列名單，沒有把手（2.5.1、SEAT-R69）', async ({ page }) => {
    desktopOnly(page);
    await seed(async (s) => {
      await s.staff('工作甲', { department: '研發一部' });
    });
    await openSeating(page);
    await expandAll(page);
    const staff = staffTable(page);
    await expect(staff).toContainText('工作人員桌');
    await expect(staff).toContainText('研發一部');
    await expect(staff.getByRole('listitem')).toHaveCount(10);
    await expect(staff.getByRole('button', { name: '拖移調換桌次' })).toHaveCount(0);
  });
});
