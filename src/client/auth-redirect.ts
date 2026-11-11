// 登入已過期（docs/spec/README.md AUTH-R07）：整頁導到登入頁並顯示「登入已過期。」，登入後回到原本的頁面（含網址參數）。
// 儲存佇列（app-provider.tsx 的 onUnauthenticated）與「匯出座位表」（export.md EXP-R07、D-016）共用。

/** 登入頁網址：/login?expired=1&callbackUrl={目前的路徑與網址參數} */
export function expiredLoginUrl(location: Pick<Location, 'pathname' | 'search'> = window.location): string {
  const back = `${location.pathname}${location.search}`;
  return `/login?expired=1&callbackUrl=${encodeURIComponent(back)}`;
}

/** 刻意整頁重新載入：登入過期時要丟掉畫面上還沒存的狀態 */
export function redirectToExpiredLogin(): void {
  window.location.assign(expiredLoginUrl(window.location));
}

