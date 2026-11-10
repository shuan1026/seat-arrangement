'use client';
// 「匯出座位表」按鈕（docs/spec/export.md 第 2 節、第 4 節文案、EXP-R01、EXP-R03、EXP-R06、EXP-R07）。
// 樣式依 README.md 第 11.3 節的元件對應：Button `outline`，前置 `download` 圖示（原型 people.html、seating.html 的頁首）；
// 處理中用 Button 的 loading（spinner 取代圖示、不能再按）。按下直接下載，不開對話框。
// 參與人員頁與座位安排頁頁首各放一個，行為相同。
// 登入已過期（401）不算匯出失敗：不下載、不顯示提示，和儲存佇列一樣整頁回到登入頁（D-016、EXP-AC21、README AUTH-R07）。
import { Download } from 'lucide-react';
import { useState } from 'react';
import { redirectToExpiredLogin } from '@/client/auth-redirect';
import { downloadBlob } from '@/client/download';
import { Button } from '@/components/ui/button';
import { notify } from '@/components/ui/toaster';

const EXPORT_URL = '/api/export/seating';
const SUCCESS = '已匯出座位表。';
const FAILURE = '匯出座位表失敗，請確認網路連線後再試一次。';

/** Content-Disposition 的檔名：優先讀 filename*=UTF-8''…（RFC 5987），其次 filename="…" */
function fileNameFrom(header: string | null): string | undefined {
  if (!header) return undefined;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* 編碼不正確時改用 filename */
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(header);
  return (plain?.[1] ?? plain?.[2])?.trim() || undefined;
}

/** 回應沒有帶檔名時的備用檔名「座位表_{台灣日期}.xlsx」（EXP-R03） */
function fallbackFileName(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `座位表_${get('year')}${get('month')}${get('day')}.xlsx`;
}

export function ExportSeatingButton() {
  const [busy, setBusy] = useState(false);

  const exportSeating = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(EXPORT_URL, { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) {
        redirectToExpiredLogin();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      downloadBlob(fileNameFrom(res.headers.get('Content-Disposition')) ?? fallbackFileName(), blob);
      notify(SUCCESS);
    } catch {
      // 伺服器錯誤或網路中斷：不下載，可以再按一次（EXP-R07）
      notify(FAILURE, { type: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" leadingIcon={<Download />} loading={busy} onClick={() => void exportSeating()}>
      匯出座位表
    </Button>
  );
}
