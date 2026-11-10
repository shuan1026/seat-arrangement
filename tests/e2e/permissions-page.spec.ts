// 權限頁 /permissions：docs/spec/permissions.md 第 2.1 節、PRM-R05～R15、第 4.1 節文案；驗收條件 PRM-AC04～AC16；
// docs/spec/README.md AUTH-R12～R14、AUTH-AC18、COM-R07、COM-R08、第 9 節（Alert Dialog 在手機按鈕滿版、確認在上；不可整頁水平捲動）；D-021。
// 「別人剛在權限頁改了名單」用 helpers/permissions-db.ts 直接改資料庫模擬（和另一位編輯者按下按鈕的結果相同）。
// 甲、乙、丙是 docs/spec/permissions.md 第 5 節的虛構帳號；登入用 helpers/auth.ts（signIn 會把帳號寫進名單，所以都在 signIn 之後才設定名單）。
// 無障礙結構的假設見 helpers/permissions-page.ts 開頭。
import { expect, test, type Page } from '@playwright/test';
import { BING, JIA, setSessionCookie, signIn, signInAsViewer, YI } from './helpers/auth';
import { expectNoHorizontalScroll, fetchFromPage, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { editorEmails, editorIdOf, makeEditor, removeEditor, setEditors } from './helpers/permissions-db';
import {
  addEditorButton,
  CONFLICT_TOAST,
  emailField,
  expectEditorList,
  FIELD_HELP,
  gotoPermissions,
  LAST_EDITOR_NOTE,
  navNames,
  NOT_EDITOR_TOAST,
  openNav,
  openRemoveConfirm,
  PERMISSIONS_DESCRIPTION,
  removeAndConfirm,
  removeButton,
  SELF_REMOVE_BODY,
  viewOnlyBadge,
  visibleHeader,
} from './helpers/permissions-page';
import { expectToast, toasts } from './helpers/seating-page';

/** 以甲登入，名單依序是 editors */
async function asJiaWith(context: Parameters<typeof signIn>[0], baseURL: string | undefined, editors: string[]) {
  await signIn(context, requireBaseURL(baseURL), JIA);
  await setEditors(editors);
}

const isDisabled = (page: Page, email: string) =>
  removeButton(page, email).evaluate((el) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true');

test.describe('開啟權限頁（PRM-AC04）', () => {
  test('名單依序加入甲、乙，甲按導覽「權限」→ /permissions：H1、頁面說明、「新增編輯者」區塊與「編輯者」清單；清單依序是甲、乙，每列有「移除」', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email, YI.email]);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();

    const nav = await openNav(page);
    await nav.getByRole('link', { name: '權限', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/permissions');

    await expect(page.getByRole('heading', { level: 1, name: '權限' })).toBeVisible();
    await expect(page.getByText(PERMISSIONS_DESCRIPTION, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '新增編輯者', exact: true })).toBeVisible();
    await expect(emailField(page)).toHaveAttribute('placeholder', 'name@program.com.tw');
    await expect(page.getByText(FIELD_HELP, { exact: true })).toBeVisible();
    await expect(addEditorButton(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: '編輯者', exact: true })).toBeVisible();

    await expectEditorList(page, [JIA.email, YI.email]);
    for (const email of [JIA.email, YI.email]) {
      await expect(removeButton(page, email)).toHaveText('移除');
      await expect(removeButton(page, email)).toBeEnabled();
    }
    await expect(page.getByText(LAST_EDITOR_NOTE, { exact: true })).toHaveCount(0);
  });
});

test.describe('新增（PRM-R08～R10、PRM-R15）', () => {
  test('PRM-AC05：輸入丙按「新增編輯者」→ 丙加到清單最後、欄位清空；Sonner 沒有「復原」；Header 是「已儲存」；丙之後開啟頁面時是編輯者', async ({
    page,
    context,
    baseURL,
    browser,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email, YI.email]);
    await gotoPermissions(page);

    await emailField(page).fill(BING.email);
    await addEditorButton(page).click();

    await expectEditorList(page, [JIA.email, YI.email, BING.email]);
    await expect(emailField(page)).toHaveValue('');
    await expectToast(page, `已把 ${BING.email} 設為編輯者。`, { undo: false });
    await expect(visibleHeader(page).getByText(/^已儲存 \d{2}:\d{2}$/)).toBeVisible();
    await expect.poll(() => editorEmails()).toEqual([JIA.email, YI.email, BING.email]);

    // 丙不必重新登入：用丙原本的 session 開啟頁面就是編輯者（AUTH-R14）
    const bingContext = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined });
    try {
      await setSessionCookie(bingContext, requireBaseURL(baseURL), BING);
      const bingPage = await bingContext.newPage();
      await bingPage.goto('/');
      await expect(bingPage.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
      await expect(bingPage.getByRole('button', { name: '新增人員', exact: true }).first()).toBeVisible();
      await expect(viewOnlyBadge(bingPage)).toHaveCount(0);
    } finally {
      await bingContext.close();
    }
  });

  test('PRM-AC06：空白按「新增編輯者」、再輸入「abc」、再輸入「c@gmail.com」→ 依序顯示三種錯誤，名單都不變', async ({ page, context, baseURL }) => {
    await asJiaWith(context, baseURL, [JIA.email, YI.email]);
    await gotoPermissions(page);

    await addEditorButton(page).click();
    await expect(page.getByText('請輸入 email。', { exact: true })).toBeVisible();

    await emailField(page).fill('abc');
    await addEditorButton(page).click();
    await expect(page.getByText('請輸入正確的 email。', { exact: true })).toBeVisible();

    await emailField(page).fill('c@gmail.com');
    await addEditorButton(page).click();
    await expect(page.getByText('只能新增公司帳號（@program.com.tw）。', { exact: true })).toBeVisible();

    await expectEditorList(page, [JIA.email, YI.email]);
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);
    // 欄位錯誤不用 Sonner（README 第 9 節）
    await expect(toasts(page).filter({ hasText: '只能新增公司帳號' })).toHaveCount(0);
  });

  test('PRM-AC07：乙已經是編輯者，輸入「 Yi@Program.com.tw 」按 Enter → 「yi@program.com.tw 已經是編輯者。」，名單不變', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email, YI.email]);
    await gotoPermissions(page);

    await emailField(page).fill(' Yi@Program.com.tw ');
    await emailField(page).press('Enter');

    await expect(page.getByText(`${YI.email} 已經是編輯者。`, { exact: true })).toBeVisible();
    await expectEditorList(page, [JIA.email, YI.email]);
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);
  });

  test('PRM-AC08：甲開著權限頁時乙先新增了丙 → 甲也新增丙：不新增，欄位顯示「bing@program.com.tw 已經是編輯者。」；清單重新載入後有丙，只有一筆', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email, YI.email]);
    await gotoPermissions(page);
    await expectEditorList(page, [JIA.email, YI.email]);

    await makeEditor(BING.email); // 乙在自己的權限頁新增了丙

    await emailField(page).fill(BING.email);
    await addEditorButton(page).click();

    await expect(page.getByText(`${BING.email} 已經是編輯者。`, { exact: true })).toBeVisible();
    await expectEditorList(page, [JIA.email, YI.email, BING.email]);
    await expect(removeButton(page, BING.email)).toHaveCount(1);
    expect(await editorEmails()).toEqual([JIA.email, YI.email, BING.email]);
  });
});

test.describe('移除（PRM-R11～R14）', () => {
  test('PRM-AC09：按乙的「移除」→ Alert Dialog 的標題、內文與按鈕；「取消」→ 名單不變；再按「移除編輯權限」→ 乙移除，Sonner 沒有「復原」', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email, YI.email]);
    await gotoPermissions(page);

    let dialog = await openRemoveConfirm(page, YI.email);
    await expect(dialog.getByRole('heading', { name: `要移除 ${YI.email} 的編輯權限嗎？` })).toBeVisible();
    await expect(dialog.getByText(`移除後 ${YI.email} 只能檢視，不能再修改資料。`, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '移除編輯權限', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectEditorList(page, [JIA.email, YI.email]);
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);

    dialog = await openRemoveConfirm(page, YI.email);
    await dialog.getByRole('button', { name: '移除編輯權限', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectEditorList(page, [JIA.email]);
    await expectToast(page, `已移除 ${YI.email} 的編輯權限。`, { undo: false });
    await expect.poll(() => editorEmails()).toEqual([JIA.email]);
  });

  test('PRM-AC10：名單只有甲 → 甲的「移除」停用，清單下方有說明；直接呼叫移除甲的 API → 被拒（409 LAST_EDITOR），名單仍有甲', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email]);
    await gotoPermissions(page);

    await expect(removeButton(page, JIA.email)).toBeVisible();
    expect(await isDisabled(page, JIA.email)).toBe(true);
    await expect(page.getByText(LAST_EDITOR_NOTE, { exact: true })).toBeVisible();

    const res = await fetchFromPage(page, `/api/editors/${await editorIdOf(JIA.email)}`, 'DELETE');
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'LAST_EDITOR' } });
    expect(await editorEmails()).toEqual([JIA.email]);
  });

  test('PRM-AC11：甲移除自己 → 內文是提醒；確認後回到座位安排，Sonner；導覽沒有「權限」，Header 顯示「只能檢視」，沒有編輯操作', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email, YI.email]);
    await gotoPermissions(page);

    const dialog = await openRemoveConfirm(page, JIA.email);
    await expect(dialog.getByRole('heading', { name: `要移除 ${JIA.email} 的編輯權限嗎？` })).toBeVisible();
    await expect(dialog.getByText(SELF_REMOVE_BODY, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '移除編輯權限', exact: true }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expectToast(page, `已移除 ${JIA.email} 的編輯權限。`, { undo: false });
    await expect(viewOnlyBadge(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '新增人員', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '發布', exact: true })).toHaveCount(0);
    expect(await navNames(await openNav(page))).toEqual(['座位安排', '參與人員', '員工名單']);
    expect(await editorEmails()).toEqual([YI.email]);
  });

  test('PRM-AC12：甲、乙都開著權限頁，乙先移除自己 → 甲的畫面仍有兩位；甲移除自己 → 不移除、重新載入、Sonner；清單只有甲，「移除」停用', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email, YI.email]);
    await gotoPermissions(page);

    await removeEditor(YI.email); // 乙在自己的權限頁移除了自己
    await page.waitForTimeout(500);
    await expectEditorList(page, [JIA.email, YI.email]); // 畫面不會自動更新（COM-R06）

    await removeAndConfirm(page, JIA.email);

    await expectToast(page, CONFLICT_TOAST, { undo: false });
    await expect(page).toHaveURL((url) => url.pathname === '/permissions');
    await expectEditorList(page, [JIA.email]);
    expect(await isDisabled(page, JIA.email)).toBe(true);
    await expect(page.getByText(LAST_EDITOR_NOTE, { exact: true })).toBeVisible();
    expect(await editorEmails()).toEqual([JIA.email]);
  });

  test('PRM-AC13：名單有甲、乙、丙；乙移除了丙 → 甲也移除丙：不儲存，重新載入並顯示「資料已被其他人更新，已重新載入。」', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email, YI.email, BING.email]);
    await gotoPermissions(page);
    await expectEditorList(page, [JIA.email, YI.email, BING.email]);

    await removeEditor(BING.email); // 乙移除了丙

    await removeAndConfirm(page, BING.email);
    await expectToast(page, CONFLICT_TOAST, { undo: false });
    await expectEditorList(page, [JIA.email, YI.email]);
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);
  });
});

test.describe('只能檢視的人（PRM-R06、AUTH-R12）', () => {
  test('PRM-AC14：丙只能檢視 → 導覽沒有「權限」；直接開 /permissions 被導向座位安排、沒有提示；讀取、新增、移除編輯者的 API 都被拒，名單不變', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAsViewer(context, requireBaseURL(baseURL), BING);
    await setEditors([JIA.email, YI.email]);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    expect(await navNames(await openNav(page))).toEqual(['座位安排', '參與人員', '員工名單']);
    if (isMobileWidth(page)) await page.keyboard.press('Escape');

    await page.goto('/permissions');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '權限' })).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(toasts(page)).toHaveCount(0);

    const jiaId = await editorIdOf(JIA.email);
    for (const [path, method] of [
      ['/api/editors', 'GET'],
      ['/api/editors', 'POST'],
      [`/api/editors/${jiaId}`, 'DELETE'],
    ] as const) {
      const res = await fetchFromPage(page, path, method);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body, `${method} ${path}`).toEqual({ error: expect.objectContaining({ code: 'NOT_EDITOR' }) });
    }
    expect(await editorEmails()).toEqual([JIA.email, YI.email]);
  });

  test('PRM-AC15、AUTH-AC18：甲開著權限頁時乙移除了甲 → 甲新增丙：不新增，回到座位安排，Sonner「你沒有編輯權限，已重新載入。」', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email, YI.email]);
    await gotoPermissions(page);

    await removeEditor(JIA.email); // 乙在權限頁移除了甲

    await emailField(page).fill(BING.email);
    await addEditorButton(page).click();

    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expectToast(page, NOT_EDITOR_TOAST, { undo: false });
    await expect(viewOnlyBadge(page)).toBeVisible();
    expect(await editorEmails()).toEqual([YI.email]);
  });
});

test.describe('手機（PRM-AC16、第 2.1 節）', () => {
  const LONG = 'a-very-long-editor-email-address-for-wrapping-0123456789@program.com.tw';

  test('視窗 320 px、名單中有很長的 email → email 欄位與「新增編輯者」上下堆疊、按鈕滿版；長 email 換行完整顯示；Alert Dialog 按鈕滿版、確認鈕在上；沒有整頁水平捲動', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [JIA.email, LONG]);
    await page.setViewportSize({ width: 320, height: 700 });
    await gotoPermissions(page);

    const field = await emailField(page).boundingBox();
    const button = await addEditorButton(page).boundingBox();
    const main = await page.getByRole('main').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { left: r.left + parseFloat(s.paddingLeft), right: r.right - parseFloat(s.paddingRight) };
    });
    if (!field || !button) throw new Error('量不到欄位或按鈕');
    expect(button.y, '按鈕在欄位下方').toBeGreaterThanOrEqual(field.y + field.height - 1);
    expect(Math.abs(button.width - field.width), '按鈕和欄位同寬（滿版）').toBeLessThanOrEqual(1);
    expect(button.x).toBeGreaterThanOrEqual(main.left - 1);
    expect(button.x + button.width).toBeLessThanOrEqual(main.right + 1);

    // 長 email 換行完整顯示：不截斷、不超出視窗；「移除」也在畫面內
    const longText = page.getByRole('main').getByText(LONG, { exact: true });
    await expect(longText).toBeVisible();
    const fits = await longText.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { notTruncated: el.scrollWidth <= el.clientWidth + 1, right: r.right, height: r.height, lineHeight: parseFloat(getComputedStyle(el).lineHeight) || 20 };
    });
    expect(fits.notTruncated, '長 email 沒有被截斷').toBe(true);
    expect(fits.right, '長 email 沒有超出視窗').toBeLessThanOrEqual(320);
    expect(fits.height, '長 email 換成兩行以上').toBeGreaterThan(fits.lineHeight * 1.5);
    const removeBox = await removeButton(page, LONG).boundingBox();
    if (!removeBox) throw new Error('量不到「移除」');
    expect(removeBox.x + removeBox.width).toBeLessThanOrEqual(320);
    await expectNoHorizontalScroll(page);

    const dialog = await openRemoveConfirm(page, LONG);
    const confirm = await dialog.getByRole('button', { name: '移除編輯權限', exact: true }).boundingBox();
    const cancel = await dialog.getByRole('button', { name: '取消', exact: true }).boundingBox();
    const dialogBox = await dialog.boundingBox();
    if (!confirm || !cancel || !dialogBox) throw new Error('量不到對話框的按鈕');
    expect(confirm.y + confirm.height, '確認鈕在上').toBeLessThanOrEqual(cancel.y + 1);
    expect(Math.abs(confirm.width - cancel.width), '兩個按鈕同寬（滿版）').toBeLessThanOrEqual(1);
    expect(confirm.width, '按鈕滿版').toBeGreaterThan(dialogBox.width * 0.7);
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(320);
    await expectNoHorizontalScroll(page);
  });
});
