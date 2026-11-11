// 座位安排頁頁首的「發布」與發布對話框：docs/spec/seating.md 2.1.1（頁首依序是「新增人員」「匯出座位表」「發布」）、SEAT-AC106；
// docs/spec/permissions.md 第 2.2 節、PRM-R16～R20、第 4.2 節文案；驗收條件 PRM-AC17～AC22；待確認 PRM-Q02（複製失敗的提示）；
// docs/spec/README.md 第 6 節（切換發布立即儲存，Header 的儲存狀態跟著更新）、第 11.1 節（已發布是正向徽章、未發布是中性徽章）；D-021。
// D-026：permissions.md 第 5 節的驗收條件裡，沒寫到權限的人不在名單上（沒有權限），所以 PRM-AC21 的丙用沒有權限的帳號；PRM-AC20 的丙是檢視者。
// 無障礙結構的假設見 helpers/permissions-page.ts 開頭。
import { expect, test, type Page } from '@playwright/test';
import { BING, signIn, signInAsViewer, signInWithoutAccess } from './helpers/auth';
import { expectNoHorizontalScroll, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { isPublished, setPublished } from './helpers/permissions-db';
import {
  CHECK_PATH,
  gotoSeats,
  isChecked,
  linkField,
  openPublishDialog,
  PUBLISH_DESCRIPTION,
  publishCheckbox,
  publishDialog,
  resultLine,
  seatSearch,
  sendJson,
  visibleHeader,
} from './helpers/permissions-page';
import { seed } from './helpers/seating-data';
import { badgeLook, expectToast, openSeating, tokenBackground, tokenColor } from './helpers/seating-page';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.beforeEach(async () => {
  await setPublished(false);
  await seed(async (s) => {
    await s.employee('王小明', { department: '研發一部', tableId: 3 });
  });
});

test.describe('編輯者', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signIn(context, requireBaseURL(baseURL));
  });

  test('SEAT-AC106：頁首依序是「新增人員」「匯出座位表」「發布」；按「發布」開啟「發布座位表」對話框', async ({ page }) => {
    await openSeating(page);
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (const name of ['新增人員', '匯出座位表', '發布']) {
      const box = await button(page, name).first().boundingBox();
      if (!box) throw new Error(`量不到「${name}」`);
      boxes.push(box);
    }
    for (let i = 1; i < boxes.length; i++) {
      if (isMobileWidth(page)) expect(boxes[i]!.y, '手機上下堆疊').toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height - 1);
      else expect(boxes[i]!.x, '桌面由左到右').toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 1);
    }
    await openPublishDialog(page);
  });

  test('PRM-AC17：還沒發布過 → 對話框有標題、說明；「發布座位表」沒打勾、中性徽章「未發布」；連結是目前網站網址加 /seats；有「複製連結」與「關閉」', async ({
    page,
    baseURL,
  }) => {
    await openSeating(page);
    const dialog = await openPublishDialog(page);

    await expect(dialog.getByRole('heading', { name: '發布座位表' })).toBeVisible();
    await expect(dialog.getByText(PUBLISH_DESCRIPTION, { exact: true })).toBeVisible();
    expect(await isChecked(publishCheckbox(dialog))).toBe(false);
    await expect(dialog.getByText('未發布', { exact: true })).toBeVisible();
    await expect(dialog.getByText('已發布', { exact: true })).toHaveCount(0);
    const neutral = await badgeLook(dialog, '未發布');
    expect(neutral?.background).toBe(await tokenBackground(page, '--muted'));
    expect(neutral?.color).toBe(await tokenColor(page, '--muted-foreground'));

    await expect(linkField(dialog)).toHaveValue(`${new URL(requireBaseURL(baseURL)).origin}/seats`);
    await expect(linkField(dialog)).toHaveAttribute('readonly', /.*/);
    await expect(dialog.getByRole('button', { name: '複製連結', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '關閉', exact: true }).last().click();
    await expect(publishDialog(page)).toBeHidden();
  });

  test('PRM-AC18：打勾 → 不需確認，正向徽章「已發布」，Sonner 沒有「復原」；重新整理後仍是已發布 → 取消打勾 →「未發布」、Sonner', async ({ page }) => {
    await openSeating(page);
    let dialog = await openPublishDialog(page);
    await publishCheckbox(dialog).click();

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(dialog.getByText('已發布', { exact: true })).toBeVisible();
    await expect.poll(() => isChecked(publishCheckbox(dialog))).toBe(true);
    const positive = await badgeLook(dialog, '已發布');
    expect(positive?.background).toBe(await tokenBackground(page, '--status-positive-bg'));
    expect(positive?.icons.some((d) => d.startsWith(CHECK_PATH))).toBe(true);
    await expectToast(page, '已發布座位表。', { undo: false });
    await expect.poll(() => isPublished()).toBe(true);
    await expect(visibleHeader(page).getByText(/^已儲存 \d{2}:\d{2}$/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    dialog = await openPublishDialog(page);
    await expect.poll(() => isChecked(publishCheckbox(dialog))).toBe(true);
    await expect(dialog.getByText('已發布', { exact: true })).toBeVisible();

    await publishCheckbox(dialog).click();
    await expect(dialog.getByText('未發布', { exact: true })).toBeVisible();
    await expectToast(page, '已停止發布座位表。', { undo: false });
    await expect.poll(() => isPublished()).toBe(false);
  });

  test('PRM-AC19：按「複製連結」→ 剪貼簿是完整的發布頁網址，Sonner「已複製連結。」', async ({ page, context, baseURL }) => {
    test.skip(isMobileWidth(page), '剪貼簿權限在桌面寬度驗證');
    const origin = new URL(requireBaseURL(baseURL)).origin;
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await openSeating(page);
    const dialog = await openPublishDialog(page);

    await dialog.getByRole('button', { name: '複製連結', exact: true }).click();
    await expectToast(page, '已複製連結。', { undo: false });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/seats`);
  });

  test('PRM-Q02 目前假設：瀏覽器不允許存取剪貼簿 → Sonner「無法複製，請手動選取連結。」；連結欄位可以手動選取', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      });
    });
    await openSeating(page);
    const dialog = await openPublishDialog(page);

    await dialog.getByRole('button', { name: '複製連結', exact: true }).click();
    await expectToast(page, '無法複製，請手動選取連結。', { undo: false });
    await expect(linkField(dialog)).toBeEnabled();
    await linkField(dialog).selectText();
  });

  test('PRM-AC21：已發布，甲把王小明從 B4 桌移到 A3 桌 → 丙（沒有權限）重新整理發布頁 → 王小明在 A3 桌', async ({ page, browser, baseURL }) => {
    await setPublished(true);
    const wangId = await seed(async (s) => s.employee('王小明', { department: '研發一部', tableId: 3 }));

    const viewerContext = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined });
    try {
      await signInWithoutAccess(viewerContext, requireBaseURL(baseURL), BING);
      const viewer = await viewerContext.newPage();
      await gotoSeats(viewer);
      await seatSearch(viewer).fill('王小明');
      await expect(resultLine(viewer, '王小明：B4 桌')).toBeVisible();

      await openSeating(page);
      const res = await sendJson(page, '/api/seating/operations', 'POST', { type: 'seat', participantId: wangId, tableId: 17, allowOverflow: true });
      expect(res.status).toBe(200);

      await viewer.reload();
      await expect(viewer.getByRole('heading', { level: 1, name: '尾牙座位表' })).toBeVisible();
      await seatSearch(viewer).fill('王小明');
      await expect(resultLine(viewer, '王小明：A3 桌')).toBeVisible();
      await expect(resultLine(viewer, '王小明：B4 桌')).toHaveCount(0);
    } finally {
      await viewerContext.close();
    }
  });

  test('PRM-AC22：視窗 375 px 開啟發布對話框 → 連結欄位與「複製連結」滿版上下排列；網址只在欄位內，不造成整頁水平捲動', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openSeating(page);
    const dialog = await openPublishDialog(page);

    const field = await linkField(dialog).boundingBox();
    const copy = await dialog.getByRole('button', { name: '複製連結', exact: true }).boundingBox();
    const box = await dialog.boundingBox();
    if (!field || !copy || !box) throw new Error('量不到對話框');
    expect(copy.y, '「複製連結」在欄位下方').toBeGreaterThanOrEqual(field.y + field.height - 1);
    expect(Math.abs(copy.width - field.width), '和欄位同寬（滿版）').toBeLessThanOrEqual(1);
    expect(field.width, '欄位滿版').toBeGreaterThan(box.width * 0.7);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(field.x + field.width).toBeLessThanOrEqual(box.x + box.width);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('檢視者（PRM-R16、PRM-AC20）', () => {
  test('丙是檢視者 → 頁首沒有「發布」；直接呼叫切換發布的 API → 被拒（403 NOT_EDITOR），發布狀態不變', async ({ page, context, baseURL }) => {
    await signInAsViewer(context, requireBaseURL(baseURL), BING);
    await openSeating(page);
    await expect(button(page, '匯出座位表')).toBeVisible();
    await expect(button(page, '發布')).toHaveCount(0);

    const res = await sendJson(page, '/api/publish', 'PUT', { published: true });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'NOT_EDITOR' }) });
    expect(await isPublished()).toBe(false);
  });
});
