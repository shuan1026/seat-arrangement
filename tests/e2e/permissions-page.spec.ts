// 權限頁 /permissions（D-026）：docs/spec/permissions.md v1.2 第 2.1 節（版面、新增帳號、帳號清單、元件、狀態、手機）、PRM-R05～R15、
// PRM-R35、PRM-R36、第 4.1 節文案；驗收條件 PRM-AC04～AC16、AC37～AC44；docs/spec/README.md AUTH-R12～R14、AUTH-R16、AUTH-R17、
// AUTH-AC18、COM-R07、COM-R08、第 9 節（Alert Dialog 在手機按鈕滿版、確認在上；不可整頁水平捲動）。
// email 欄位的尺寸依 ui-design-system 03-components.md Input：`md` 高 36 px、`vertical`（錯誤在欄位下方）。
// 「別人剛在權限頁改了名單」用 helpers/permissions-db.ts 直接改資料庫模擬（和另一位編輯者按下按鈕的結果相同）。
// 甲、乙、丙、丁是 docs/spec/permissions.md 第 5 節的虛構帳號；登入用 helpers/auth.ts（signIn 會把帳號寫進名單，所以都在 signIn 之後才設定名單）。
// 每支測試開頭自己設定名單（手機組依序跑在同一個資料庫上）。無障礙結構的假設見 helpers/permissions-page.ts 開頭。
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { BING, DING, JIA, setSessionCookie, signIn, signInAsViewer, signInWithoutAccess, YI, type TestUser } from './helpers/auth';
import { expectNoHorizontalScroll, fetchFromPage, isMobileWidth, requireBaseURL } from './helpers/page-checks';
import { makeViewer, memberIdOf, memberList, removeMember, setMembers, type MemberSeed } from './helpers/permissions-db';
import {
  addButton,
  addedToast,
  addMember,
  addRoleSelect,
  alreadyMessage,
  changedToast,
  chooseRole,
  CONFLICT_TOAST,
  demoteAndConfirm,
  demoteBody,
  demoteTitle,
  emailField,
  expectMemberList,
  expectNoAccessPage,
  gotoPermissions,
  LAST_EDITOR_NOTE,
  navNames,
  NOT_EDITOR_TOAST,
  openDemoteConfirm,
  openNav,
  openRemoveConfirm,
  PERMISSIONS_DESCRIPTION,
  removeAndConfirm,
  removeBody,
  removeButton,
  removedToast,
  removeTitle,
  roleOptions,
  roleSelect,
  rowDisabled,
  rowEmail,
  saveStatusText,
  SELF_DEMOTE_BODY,
  SELF_REMOVE_BODY,
  sendJson,
  viewOnlyBadge,
  visibleHeader,
} from './helpers/permissions-page';
import { expectNoToast, expectToast, toasts } from './helpers/seating-page';

const E = (user: TestUser): MemberSeed => ({ email: user.email, role: 'EDITOR' });
const V = (user: TestUser): MemberSeed => ({ email: user.email, role: 'VIEWER' });

/** 以甲登入，名單依序是 members（甲要在裡面才開得了權限頁） */
async function asJiaWith(context: BrowserContext, baseURL: string | undefined, members: MemberSeed[]) {
  await signIn(context, requireBaseURL(baseURL), JIA);
  await setMembers(members);
}

/** 另開一個瀏覽器，用這個帳號原本的 session（不改名單）開啟頁面；用完關掉 */
async function withSessionOf(page: Page, baseURL: string | undefined, user: TestUser, fn: (p: Page) => Promise<void>) {
  const context = await page.context().browser()!.newContext({
    baseURL,
    viewport: page.viewportSize() ?? undefined,
    isMobile: isMobileWidth(page),
    hasTouch: isMobileWidth(page),
  });
  try {
    await setSessionCookie(context, requireBaseURL(baseURL), user);
    await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

/** 這個帳號開座位安排時是編輯者：有「新增人員」與「權限」導覽，沒有「只能檢視」 */
async function expectEditorAt(p: Page) {
  await p.goto('/');
  await expect(p.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
  await expect(p.getByRole('button', { name: '新增人員', exact: true }).first()).toBeVisible();
  await expect(viewOnlyBadge(p)).toHaveCount(0);
  expect(await navNames(await openNav(p))).toEqual(['座位安排', '參與人員', '員工名單', '權限']);
}

/** 這個帳號開座位安排時是檢視者：看得到頁面，Header「只能檢視」，導覽沒有「權限」，沒有編輯操作 */
async function expectViewerAt(p: Page) {
  await p.goto('/');
  await expect(p.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
  await expect(viewOnlyBadge(p)).toBeVisible();
  await expect(p.getByRole('button', { name: '新增人員', exact: true })).toHaveCount(0);
  await expect(p.getByRole('button', { name: '發布', exact: true })).toHaveCount(0);
  expect(await navNames(await openNav(p))).toEqual(['座位安排', '參與人員', '員工名單']);
}

test.describe('開啟權限頁（PRM-AC04、第 2.1 節、第 4.1 節）', () => {
  test('名單依序加入甲（編輯者）、乙（檢視者），甲按導覽「權限」→ H1、頁面說明、「新增帳號」（email、權限選單「檢視者」、「新增」）與「帳號」清單；甲那一列停用、乙那一列可以操作', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), V(YI)]);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();

    const nav = await openNav(page);
    await nav.getByRole('link', { name: '權限', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/permissions');

    await expect(page.getByRole('heading', { level: 1, name: '權限', exact: true })).toBeVisible();
    await expect(page.getByText(PERMISSIONS_DESCRIPTION, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '新增帳號', exact: true })).toBeVisible();
    await expect(emailField(page)).toHaveAttribute('placeholder', 'name@program.com.tw');
    await expect(addRoleSelect(page)).toHaveText('檢視者');
    await expect(addButton(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: '帳號', exact: true })).toBeVisible();
    // D-021 的舊區塊已經不在
    await expect(page.getByRole('heading', { name: '新增編輯者', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '新增編輯者', exact: true })).toHaveCount(0);
    await expect(page.getByText('編輯者可以修改所有資料，也能管理權限。', { exact: true })).toHaveCount(0);

    expect(await roleOptions(page, addRoleSelect(page))).toEqual(['檢視者', '編輯者']);

    await expectMemberList(page, [E(JIA), V(YI)]);
    await expect(removeButton(page, YI.email)).toHaveText('移除');
    expect(await rowDisabled(page, JIA.email)).toEqual({ select: true, remove: true });
    expect(await rowDisabled(page, YI.email)).toEqual({ select: false, remove: false });
    await expect(page.getByText(LAST_EDITOR_NOTE, { exact: true })).toBeVisible();
  });

  test('兩位編輯者：每一列都可以操作，沒有最後一位的說明', async ({ page, context, baseURL }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI), V(BING)]);
    await gotoPermissions(page);
    await expectMemberList(page, [E(JIA), E(YI), V(BING)]);
    for (const user of [JIA, YI, BING]) expect(await rowDisabled(page, user.email), user.email).toEqual({ select: false, remove: false });
    await expect(page.getByText(LAST_EDITOR_NOTE, { exact: true })).toHaveCount(0);
  });
});

test.describe('新增（PRM-R08～R10、PRM-R15）', () => {
  test('PRM-AC05：輸入丙、權限維持「檢視者」按「新增」→ 丙以「檢視者」加到清單最後、欄位清空；Sonner 沒有「復原」；Header 是「已儲存」；丙之後開啟座位安排是檢視者', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await removeMember(BING.email);
    await gotoPermissions(page);

    await emailField(page).fill(BING.email);
    await addButton(page).click();

    await expectMemberList(page, [E(JIA), E(YI), V(BING)]);
    await expect(emailField(page)).toHaveValue('');
    await expectToast(page, addedToast(BING.email, 'VIEWER'), { undo: false });
    await expect(visibleHeader(page).getByText(/^已儲存 \d{2}:\d{2}$/)).toBeVisible();
    await expect.poll(() => memberList()).toEqual([E(JIA), E(YI), V(BING)]);

    // 丙不必重新登入：用丙原本的 session 開啟頁面就是檢視者（AUTH-R14）
    await withSessionOf(page, baseURL, BING, expectViewerAt);
  });

  test('PRM-AC37：權限選「編輯者」、在 email 欄位按 Enter → 丙以「編輯者」加到最後；Sonner；欄位清空，權限選單回到「檢視者」；丙之後開啟頁面時是編輯者', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), V(YI)]);
    await removeMember(BING.email);
    await gotoPermissions(page);

    await chooseRole(page, addRoleSelect(page), '編輯者');
    await expect(addRoleSelect(page)).toHaveText('編輯者');
    await emailField(page).fill(BING.email);
    await emailField(page).press('Enter');

    await expectMemberList(page, [E(JIA), V(YI), E(BING)]);
    await expectToast(page, addedToast(BING.email, 'EDITOR'), { undo: false });
    await expect(emailField(page)).toHaveValue('');
    await expect(addRoleSelect(page)).toHaveText('檢視者');
    await expect.poll(() => memberList()).toEqual([E(JIA), V(YI), E(BING)]);

    await withSessionOf(page, baseURL, BING, expectEditorAt);
  });

  test('PRM-AC06：空白按「新增」、再輸入「abc」、再輸入「c@gmail.com」→ 依序顯示三種錯誤，名單都不變；錯誤不用 Sonner', async ({ page, context, baseURL }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await gotoPermissions(page);

    await addButton(page).click();
    await expect(page.getByText('請輸入 email。', { exact: true })).toBeVisible();

    await emailField(page).fill('abc');
    await addButton(page).click();
    await expect(page.getByText('請輸入正確的 email。', { exact: true })).toBeVisible();

    await emailField(page).fill('c@gmail.com');
    await addButton(page).click();
    await expect(page.getByText('只能新增公司帳號（@program.com.tw）。', { exact: true })).toBeVisible();

    await expectMemberList(page, [E(JIA), E(YI)]);
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
    await expect(toasts(page).filter({ hasText: '只能新增公司帳號' })).toHaveCount(0);
  });

  test('PRM-AC07：乙是檢視者，輸入「 Yi@Program.com.tw 」、權限選「編輯者」並按 Enter →「yi@program.com.tw 已經是檢視者。」；名單不變，乙仍是檢視者', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), V(YI)]);
    await gotoPermissions(page);

    await chooseRole(page, addRoleSelect(page), '編輯者');
    await emailField(page).fill(' Yi@Program.com.tw ');
    await emailField(page).press('Enter');

    await expect(page.getByText(alreadyMessage(YI.email, 'VIEWER'), { exact: true })).toBeVisible();
    await expectMemberList(page, [E(JIA), V(YI)]);
    expect(await memberList()).toEqual([E(JIA), V(YI)]);
  });

  test('PRM-AC08：甲、乙都是編輯者，乙先以「檢視者」新增丙 → 甲以「編輯者」新增丙：不新增，欄位顯示「bing@program.com.tw 已經是檢視者。」；清單重新載入後有丙，只有一筆、是檢視者', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await gotoPermissions(page);
    await expectMemberList(page, [E(JIA), E(YI)]);

    await makeViewer(BING.email); // 乙在自己的權限頁以檢視者新增了丙

    await addMember(page, BING.email, 'EDITOR');

    await expect(page.getByText(alreadyMessage(BING.email, 'VIEWER'), { exact: true })).toBeVisible();
    await expectMemberList(page, [E(JIA), E(YI), V(BING)]);
    await expect(removeButton(page, BING.email)).toHaveCount(1);
    expect(await memberList()).toEqual([E(JIA), E(YI), V(BING)]);
    await expect(toasts(page).filter({ hasText: addedToast(BING.email, 'EDITOR') })).toHaveCount(0);
  });
});

test.describe('移除（PRM-R11～R14）', () => {
  test('PRM-AC09：按乙的「移除」→ Alert Dialog 的標題、內文與按鈕；「取消」→ 名單不變；再按「移除權限」→ 乙移除，Sonner 沒有「復原」；乙之後開座位安排看到「沒有權限」頁', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await gotoPermissions(page);

    let dialog = await openRemoveConfirm(page, YI.email);
    await expect(dialog.getByRole('heading', { name: removeTitle(YI.email) })).toBeVisible();
    await expect(dialog.getByText(removeBody(YI.email), { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '移除權限', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectMemberList(page, [E(JIA), E(YI)]);
    expect(await memberList()).toEqual([E(JIA), E(YI)]);

    dialog = await openRemoveConfirm(page, YI.email);
    await dialog.getByRole('button', { name: '移除權限', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectMemberList(page, [E(JIA)]);
    await expectToast(page, removedToast(YI.email), { undo: false });
    await expect.poll(() => memberList()).toEqual([E(JIA)]);

    await withSessionOf(page, baseURL, YI, async (p) => {
      await p.goto('/');
      await expect(p).toHaveURL((url) => url.pathname === '/');
      await expectNoAccessPage(p, YI.email);
    });
  });

  test('PRM-AC38：甲是唯一的編輯者、丙是檢視者 → 按丙的「移除」同樣要確認（標題「要移除 bing@program.com.tw 的權限嗎？」）；按「移除權限」→ 丙移除，Sonner', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), V(BING)]);
    await gotoPermissions(page);

    const dialog = await openRemoveConfirm(page, BING.email);
    await expect(dialog.getByRole('heading', { name: removeTitle(BING.email) })).toBeVisible();
    await expect(dialog.getByText(removeBody(BING.email), { exact: true })).toBeVisible();
    expect(await memberList()).toEqual([E(JIA), V(BING)]);
    await dialog.getByRole('button', { name: '移除權限', exact: true }).click();

    await expectMemberList(page, [E(JIA)]);
    await expectToast(page, removedToast(BING.email), { undo: false });
    await expect.poll(() => memberList()).toEqual([E(JIA)]);
  });

  test('PRM-AC10：甲是唯一的編輯者、乙是檢視者 → 甲那一列的權限選單與「移除」停用，清單下方有說明；直接呼叫移除甲、把甲改為檢視者的 API → 都被拒（409 LAST_EDITOR），甲仍是編輯者', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), V(YI)]);
    await gotoPermissions(page);

    await expect(removeButton(page, JIA.email)).toBeVisible();
    expect(await rowDisabled(page, JIA.email)).toEqual({ select: true, remove: true });
    await expect(page.getByText(LAST_EDITOR_NOTE, { exact: true })).toBeVisible();

    const jiaId = await memberIdOf(JIA.email);
    const removed = await fetchFromPage(page, `/api/members/${jiaId}`, 'DELETE');
    expect(removed.status).toBe(409);
    expect(removed.body).toMatchObject({ error: { code: 'LAST_EDITOR' } });
    const demoted = await sendJson(page, `/api/members/${jiaId}`, 'PATCH', { role: 'VIEWER' });
    expect(demoted.status).toBe(409);
    expect(demoted.body).toMatchObject({ error: { code: 'LAST_EDITOR' } });
    expect(await memberList()).toEqual([E(JIA), V(YI)]);
  });

  test('PRM-AC11：甲、乙都是編輯者，甲移除自己 → 內文是提醒；按「移除權限」→ 畫面換成「沒有權限」頁（甲的 email、「查看座位表」「登出」），沒有 Sidebar、Header、導覽，沒有 Sonner', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await gotoPermissions(page);

    const dialog = await openRemoveConfirm(page, JIA.email);
    await expect(dialog.getByRole('heading', { name: removeTitle(JIA.email) })).toBeVisible();
    await expect(dialog.getByText(SELF_REMOVE_BODY, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '移除權限', exact: true }).click();

    await expectNoAccessPage(page, JIA.email);
    await page.waitForTimeout(500);
    await expectNoToast(page);
    await expect.poll(() => memberList()).toEqual([E(YI)]);
  });

  test('PRM-AC12：甲、乙都開著權限頁，乙先移除自己 → 甲的畫面仍有兩位；甲移除自己 → 不移除、重新載入、Sonner；清單只有甲，權限選單與「移除」停用', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await gotoPermissions(page);

    await removeMember(YI.email); // 乙在自己的權限頁移除了自己
    await page.waitForTimeout(500);
    await expectMemberList(page, [E(JIA), E(YI)]); // 畫面不會自動更新（COM-R06）

    await removeAndConfirm(page, JIA.email);

    await expectToast(page, CONFLICT_TOAST, { undo: false });
    await expect(page).toHaveURL((url) => url.pathname === '/permissions');
    await expectMemberList(page, [E(JIA)]);
    expect(await rowDisabled(page, JIA.email)).toEqual({ select: true, remove: true });
    await expect(page.getByText(LAST_EDITOR_NOTE, { exact: true })).toBeVisible();
    expect(await memberList()).toEqual([E(JIA)]);
  });

  test('PRM-AC13：甲、乙是編輯者，丙是檢視者；乙移除了丙 → 甲也移除丙：不儲存，重新載入並顯示「資料已被其他人更新，已重新載入。」', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI), V(BING)]);
    await gotoPermissions(page);
    await expectMemberList(page, [E(JIA), E(YI), V(BING)]);

    await removeMember(BING.email); // 乙移除了丙

    await removeAndConfirm(page, BING.email);
    await expectToast(page, CONFLICT_TOAST, { undo: false });
    await expectMemberList(page, [E(JIA), E(YI)]);
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });

  test('PRM-AC13：同樣的前提，乙移除丙後甲把丙改為編輯者 → 也不儲存，同樣的提示；清單沒有丙', async ({ page, context, baseURL }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI), V(BING)]);
    await gotoPermissions(page);
    await expectMemberList(page, [E(JIA), E(YI), V(BING)]);

    await removeMember(BING.email); // 乙移除了丙

    await chooseRole(page, roleSelect(page, BING.email), '編輯者');
    await expectToast(page, CONFLICT_TOAST, { undo: false });
    await expectMemberList(page, [E(JIA), E(YI)]);
    await expect(toasts(page).filter({ hasText: changedToast(BING.email, 'EDITOR') })).toHaveCount(0);
    expect(await memberList()).toEqual([E(JIA), E(YI)]);
  });
});

test.describe('改權限（PRM-R35、PRM-R36）', () => {
  test('PRM-AC39：甲是唯一的編輯者、乙是檢視者 → 在乙的權限選單選「編輯者」：不需確認，立即儲存；Sonner 沒有「復原」；乙在原來的位置；甲那一列變成可以操作；乙重新整理 → 出現編輯操作與「權限」導覽', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), V(YI), V(BING)]);
    await gotoPermissions(page);

    await chooseRole(page, roleSelect(page, YI.email), '編輯者');

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expectToast(page, changedToast(YI.email, 'EDITOR'), { undo: false });
    await expectMemberList(page, [E(JIA), E(YI), V(BING)]);
    expect(await rowDisabled(page, JIA.email)).toEqual({ select: false, remove: false });
    await expect(page.getByText(LAST_EDITOR_NOTE, { exact: true })).toHaveCount(0);
    await expect(saveStatusText(page)).toHaveText(/^已儲存 \d{2}:\d{2}$/);
    await expect.poll(() => memberList()).toEqual([E(JIA), E(YI), V(BING)]);

    // 乙不必重新登入（AUTH-R14）
    await withSessionOf(page, baseURL, YI, expectEditorAt);
  });

  test('PRM-AC40：甲、乙都是編輯者 → 在乙的權限選單選「檢視者」：Alert Dialog 的標題、內文與按鈕；「取消」→ 乙仍是編輯者；再選一次按「改為檢視者」→ Sonner 沒有「復原」，乙是檢視者', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await gotoPermissions(page);

    let dialog = await openDemoteConfirm(page, YI.email);
    await expect(dialog.getByRole('heading', { name: demoteTitle(YI.email) })).toBeVisible();
    await expect(dialog.getByText(demoteBody(YI.email), { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '改為檢視者', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(roleSelect(page, YI.email)).toHaveText('編輯者');
    expect(await memberList()).toEqual([E(JIA), E(YI)]);

    dialog = await openDemoteConfirm(page, YI.email);
    await dialog.getByRole('button', { name: '改為檢視者', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectToast(page, changedToast(YI.email, 'VIEWER'), { undo: false });
    await expectMemberList(page, [E(JIA), V(YI)]);
    expect(await rowDisabled(page, JIA.email)).toEqual({ select: true, remove: true });
    await expect.poll(() => memberList()).toEqual([E(JIA), V(YI)]);

    // 乙之後開啟頁面時是檢視者（AUTH-R14）
    await withSessionOf(page, baseURL, YI, expectViewerAt);
  });

  test('PRM-AC41：甲、乙都是編輯者 → 甲把自己改為檢視者：內文是提醒；按「改為檢視者」→ 回到座位安排，Sonner；導覽沒有「權限」、Header「只能檢視」、沒有編輯操作', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await gotoPermissions(page);

    const dialog = await openDemoteConfirm(page, JIA.email);
    await expect(dialog.getByRole('heading', { name: demoteTitle(JIA.email) })).toBeVisible();
    await expect(dialog.getByText(SELF_DEMOTE_BODY, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '改為檢視者', exact: true }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expectToast(page, changedToast(JIA.email, 'VIEWER'), { undo: false });
    await expect(viewOnlyBadge(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '新增人員', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '發布', exact: true })).toHaveCount(0);
    expect(await navNames(await openNav(page))).toEqual(['座位安排', '參與人員', '員工名單']);
    expect(await memberList()).toEqual([V(JIA), E(YI)]);
  });

  test('PRM-AC42：甲、乙都開著權限頁，乙先把自己改為檢視者 → 甲把自己改為檢視者並確認：不儲存、重新載入、Sonner；甲是唯一的編輯者，權限選單與「移除」停用', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await gotoPermissions(page);

    await makeViewer(YI.email); // 乙在自己的權限頁把自己改為檢視者
    await page.waitForTimeout(500);
    await expectMemberList(page, [E(JIA), E(YI)]); // 畫面不會自動更新（COM-R06）

    await demoteAndConfirm(page, JIA.email);

    await expectToast(page, CONFLICT_TOAST, { undo: false });
    await expect(page).toHaveURL((url) => url.pathname === '/permissions');
    await expectMemberList(page, [E(JIA), V(YI)]);
    expect(await rowDisabled(page, JIA.email)).toEqual({ select: true, remove: true });
    await expect(page.getByText(LAST_EDITOR_NOTE, { exact: true })).toBeVisible();
    await expect(toasts(page).filter({ hasText: changedToast(JIA.email, 'VIEWER') })).toHaveCount(0);
    expect(await memberList()).toEqual([E(JIA), V(YI)]);
  });
});

test.describe('不是編輯者的人（PRM-R06、AUTH-R12、AUTH-R16）', () => {
  test('PRM-AC14：丙是檢視者 → 導覽沒有「權限」；直接開 /permissions 被導向座位安排、沒有提示；讀取、新增、改權限、移除的 API 都被拒（403 NOT_EDITOR），名單不變', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAsViewer(context, requireBaseURL(baseURL), BING);
    await setMembers([E(JIA), E(YI), V(BING)]);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    expect(await navNames(await openNav(page))).toEqual(['座位安排', '參與人員', '員工名單']);
    if (isMobileWidth(page)) await page.keyboard.press('Escape');

    await page.goto('/permissions');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '權限', exact: true })).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(toasts(page)).toHaveCount(0);

    const jiaId = await memberIdOf(JIA.email);
    const bingId = await memberIdOf(BING.email);
    for (const [path, method, body] of [
      ['/api/members', 'GET', undefined],
      ['/api/members', 'POST', { email: 'new.viewer@program.com.tw', role: 'VIEWER' }],
      [`/api/members/${bingId}`, 'PATCH', { role: 'EDITOR' }],
      [`/api/members/${jiaId}`, 'DELETE', undefined],
    ] as const) {
      const res = method === 'GET' || method === 'DELETE' ? await fetchFromPage(page, path, method) : await sendJson(page, path, method, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body, `${method} ${path}`).toEqual({ error: expect.objectContaining({ code: 'NOT_EDITOR' }) });
    }
    expect(await memberList()).toEqual([E(JIA), E(YI), V(BING)]);
  });

  test('PRM-AC44：丁沒有權限 → 直接開 /permissions：網址不變，是「沒有權限」頁；直接呼叫讀取權限名單的 API → 403 NO_ACCESS，不回傳名單', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInWithoutAccess(context, requireBaseURL(baseURL), DING);
    await setMembers([E(JIA), V(YI)]);

    await page.goto('/permissions');
    await expect(page).toHaveURL((url) => url.pathname === '/permissions');
    await expectNoAccessPage(page, DING.email);
    await expect(page.getByRole('heading', { level: 1, name: '權限', exact: true })).toHaveCount(0);
    await expect(rowEmail(page, JIA.email)).toHaveCount(0);

    const res = await fetchFromPage(page, '/api/members');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'NO_ACCESS' }) });
    expect(JSON.stringify(res.body)).not.toContain(JIA.email);
  });
});

test.describe('畫面開著時自己的權限被改（AUTH-R13、AUTH-R17）', () => {
  test('PRM-AC15、AUTH-AC18：甲開著權限頁時乙把甲改為檢視者 → 甲新增丙：不新增，回到座位安排，Sonner「你沒有編輯權限，已重新載入。」，畫面變成只能檢視', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await removeMember(BING.email);
    await gotoPermissions(page);

    await makeViewer(JIA.email); // 乙在權限頁把甲改為檢視者

    await addMember(page, BING.email);

    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.getByRole('heading', { level: 1, name: '座位安排' })).toBeVisible();
    await expectToast(page, NOT_EDITOR_TOAST, { undo: false });
    await expect(viewOnlyBadge(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '新增人員', exact: true })).toHaveCount(0);
    expect(await memberList()).toEqual([V(JIA), E(YI)]);
  });

  test('PRM-AC43：甲開著權限頁時乙移除了甲 → 甲新增丙：不新增，畫面換成「沒有權限」頁，沒有 Sonner', async ({ page, context, baseURL }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await removeMember(BING.email);
    await gotoPermissions(page);

    await removeMember(JIA.email); // 乙在權限頁移除了甲

    await addMember(page, BING.email);

    await expectNoAccessPage(page, JIA.email);
    await page.waitForTimeout(500);
    await expectNoToast(page);
    expect(await memberList()).toEqual([E(YI)]);
  });
});

test.describe('版面（第 2.1 節）', () => {
  /** 量元素的位置；量不到時丟錯 */
  async function box(loc: Locator, label: string) {
    const b = await loc.boundingBox();
    if (!b) throw new Error(`量不到${label}`);
    return b;
  }

  test('「新增帳號」：email 欄位高 36 px（Input md）；桌面由左到右是 email、權限選單、「新增」，三者底邊對齊（顯示錯誤時也一樣）；手機（767 px 以下）三者上下堆疊、都滿版，錯誤在 email 欄位下方', async ({
    page,
    context,
    baseURL,
  }) => {
    await asJiaWith(context, baseURL, [E(JIA), E(YI)]);
    await gotoPermissions(page);
    const width = page.viewportSize()?.width ?? 0;

    const check = async (label: string, error?: Locator) => {
      const field = await box(emailField(page), `${label}：email 欄位`);
      const select = await box(addRoleSelect(page), `${label}：權限選單`);
      const button = await box(addButton(page), `${label}：「新增」`);
      expect(field.height, `${label}：email 欄位高 ${field.height} px，應為 36 px（Input md）`).toBeCloseTo(36, 0);
      const err = error ? await box(error, `${label}：錯誤`) : null;
      if (err) expect(err.y, `${label}：錯誤在 email 欄位下方`).toBeGreaterThanOrEqual(field.y + field.height - 1);
      if (isMobileWidth(page)) {
        expect(select.y, `${label}：權限選單在 email 欄位下方`).toBeGreaterThanOrEqual(field.y + field.height - 1);
        if (err) expect(select.y, `${label}：權限選單在錯誤下方`).toBeGreaterThanOrEqual(err.y + err.height - 1);
        expect(button.y, `${label}：「新增」在權限選單下方`).toBeGreaterThanOrEqual(select.y + select.height - 1);
        expect(Math.abs(select.width - field.width), `${label}：權限選單和 email 欄位同寬（滿版）`).toBeLessThanOrEqual(1);
        expect(Math.abs(button.width - field.width), `${label}：「新增」和 email 欄位同寬（滿版）`).toBeLessThanOrEqual(1);
        expect(Math.abs(select.x - field.x), `${label}：左緣對齊`).toBeLessThanOrEqual(1);
      } else {
        expect(select.x, `${label}：權限選單在 email 欄位右邊`).toBeGreaterThanOrEqual(field.x + field.width - 1);
        expect(button.x, `${label}：「新增」在權限選單右邊`).toBeGreaterThanOrEqual(select.x + select.width - 1);
        const bottom = field.y + field.height;
        expect(Math.abs(select.y + select.height - bottom), `${label}：權限選單和 email 欄位底邊對齊`).toBeLessThanOrEqual(1);
        expect(Math.abs(button.y + button.height - bottom), `${label}：「新增」和 email 欄位底邊對齊`).toBeLessThanOrEqual(1);
      }
    };

    await check(`${width} px、欄位空白`);
    // 離開欄位時驗證（README 第 9 節）
    await emailField(page).fill('abc');
    await emailField(page).blur();
    const error = page.getByText('請輸入正確的 email。', { exact: true });
    await expect(error).toBeVisible();
    await check(`${width} px、顯示錯誤`, error);
    await expectNoHorizontalScroll(page);
  });

  test('桌面：清單每列左邊是 email，右邊依序是權限選單與「移除」，同一列', async ({ page, context, baseURL }) => {
    test.skip(isMobileWidth(page), '桌面版面');
    await asJiaWith(context, baseURL, [E(JIA), V(YI)]);
    await gotoPermissions(page);
    for (const user of [JIA, YI]) {
      const email = await box(rowEmail(page, user.email), `${user.email} 的文字`);
      const select = await box(roleSelect(page, user.email), `${user.email} 的權限選單`);
      const remove = await box(removeButton(page, user.email), `移除 ${user.email}`);
      expect(select.x, `${user.email}：權限選單在 email 右邊`).toBeGreaterThanOrEqual(email.x + email.width - 1);
      expect(remove.x, `${user.email}：「移除」在權限選單右邊`).toBeGreaterThanOrEqual(select.x + select.width - 1);
      const center = (b: { y: number; height: number }) => b.y + b.height / 2;
      expect(Math.abs(center(select) - center(remove)), `${user.email}：權限選單與「移除」同一列`).toBeLessThanOrEqual(4);
      expect(Math.abs(center(email) - center(select)), `${user.email}：email 與權限選單同一列`).toBeLessThanOrEqual(8);
    }
  });

  test('PRM-AC16：視窗 320 px、名單中有很長的 email → 新增區塊三者上下堆疊、滿版；清單每列第一行是 email（長 email 換行完整顯示），第二行左邊權限選單、右邊「移除」；移除確認的按鈕滿版、確認鈕在上；沒有整頁水平捲動', async ({
    page,
    context,
    baseURL,
  }) => {
    const LONG = 'a-very-long-member-email-address-for-wrapping-0123456789@program.com.tw';
    await asJiaWith(context, baseURL, [E(JIA), V({ name: '長帳號', email: LONG, sub: 'e2e-long' })]);
    await page.setViewportSize({ width: 320, height: 700 });
    await gotoPermissions(page);

    // 新增區塊：上下堆疊，三者都滿版，在內容區裡
    const field = await box(emailField(page), 'email 欄位');
    const select = await box(addRoleSelect(page), '權限選單');
    const button = await box(addButton(page), '「新增」');
    const main = await page.getByRole('main').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { left: r.left + parseFloat(s.paddingLeft), right: r.right - parseFloat(s.paddingRight) };
    });
    expect(select.y, '權限選單在 email 欄位下方').toBeGreaterThanOrEqual(field.y + field.height - 1);
    expect(button.y, '「新增」在權限選單下方').toBeGreaterThanOrEqual(select.y + select.height - 1);
    for (const [label, b] of [
      ['權限選單', select],
      ['「新增」', button],
    ] as const) {
      expect(Math.abs(b.width - field.width), `${label}和 email 欄位同寬（滿版）`).toBeLessThanOrEqual(1);
    }
    expect(field.x).toBeGreaterThanOrEqual(main.left - 1);
    expect(field.x + field.width).toBeLessThanOrEqual(main.right + 1);

    // 長 email 換行完整顯示：不截斷、不超出視窗
    const longText = rowEmail(page, LONG);
    await expect(longText).toBeVisible();
    const fits = await longText.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        notTruncated: el.scrollWidth <= el.clientWidth + 1,
        right: r.right,
        bottom: r.bottom,
        height: r.height,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight) || 20,
      };
    });
    expect(fits.notTruncated, '長 email 沒有被截斷').toBe(true);
    expect(fits.right, '長 email 沒有超出視窗').toBeLessThanOrEqual(320);
    expect(fits.height, '長 email 換成兩行以上').toBeGreaterThan(fits.lineHeight * 1.5);

    // 第二行：左邊權限選單、右邊「移除」，都在 email 下方、在視窗內
    const rowSelect = await box(roleSelect(page, LONG), '長帳號的權限選單');
    const rowRemove = await box(removeButton(page, LONG), '長帳號的「移除」');
    expect(rowSelect.y, '權限選單在 email 下方').toBeGreaterThanOrEqual(fits.bottom - 1);
    expect(rowRemove.y, '「移除」在 email 下方').toBeGreaterThanOrEqual(fits.bottom - 1);
    expect(rowRemove.x, '「移除」在權限選單右邊').toBeGreaterThanOrEqual(rowSelect.x + rowSelect.width - 1);
    expect(Math.abs(rowSelect.y + rowSelect.height / 2 - (rowRemove.y + rowRemove.height / 2)), '權限選單與「移除」同一行').toBeLessThanOrEqual(4);
    expect(rowRemove.x + rowRemove.width).toBeLessThanOrEqual(320);
    await expectNoHorizontalScroll(page);

    // 移除確認：按鈕滿版、確認鈕在上
    const dialog = await openRemoveConfirm(page, LONG);
    const confirm = await box(dialog.getByRole('button', { name: '移除權限', exact: true }), '「移除權限」');
    const cancel = await box(dialog.getByRole('button', { name: '取消', exact: true }), '「取消」');
    const dialogBox = await box(dialog, '對話框');
    expect(confirm.y + confirm.height, '確認鈕在上').toBeLessThanOrEqual(cancel.y + 1);
    expect(Math.abs(confirm.width - cancel.width), '兩個按鈕同寬（滿版）').toBeLessThanOrEqual(1);
    expect(confirm.width, '按鈕滿版').toBeGreaterThan(dialogBox.width * 0.7);
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(320);
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();

    // 權限選單的選項用 portal 浮出，不被清單裁切，也不造成整頁水平捲動
    await roleSelect(page, LONG).click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const lb = await box(listbox, '選單');
    expect(lb.x).toBeGreaterThanOrEqual(0);
    expect(lb.x + lb.width).toBeLessThanOrEqual(320);
    await expect(listbox.getByRole('option', { name: '編輯者', exact: true })).toBeInViewport();
    await expectNoHorizontalScroll(page);
    await page.keyboard.press('Escape');
  });
});
