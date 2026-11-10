'use client';

// 匯入參與人員對話框（docs/spec/participants.md 第 2.5 節、第 3.6 節、第 4.4 節；D-010、D-013）。
// 上傳 Google 表單尾牙報名表的原始 CSV；完成後內容改為「已匯入 {n} 位，{m} 筆需要處理。」，有需要處理的人時可以下載錯誤清單。
// 待確認依目前假設（D-008）：匯入中「開始匯入」顯示載入中、完成後的按鈕是「關閉」與「下載錯誤清單」（PPL-Q06），
// 沒有「下載範本」（PPL-Q21）。
// 這個請求不排進儲存佇列：檔案格式不對是欄位錯誤，要留在對話框裡顯示，不能變成重新載入與 Sonner（docs/spec/README.md 第 9 節）。
import { Download } from 'lucide-react';
import { useState } from 'react';
import { useReload } from '@/client/app-provider';
import { apiFetch, ApiFailure } from '@/client/api';
import { CONFLICT_FALLBACK } from '@/client/conflict-messages';
import { downloadCsv } from '@/client/download';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FileInput } from '@/components/ui/file-input';
import { isConflictCode } from '@/contracts/errors';
import type { ImportResult } from '@/contracts/imports';

const DESCRIPTION =
  '上傳尾牙報名表（Google 表單匯出的 CSV 檔），一次加入報名參加的員工與眷屬。系統會依名字與部門對應員工名單；外部貴賓、桌次與工作人員請在畫面上處理。';
const FILE_HELP = '請上傳 Google 表單匯出的原始檔案，不用修改內容。';
const DUPLICATE_NOTE =
  '已報名的員工會更新兒童椅與素食，不會重複新增，座位不動；備註只在系統裡沒有備註時填入。對不到員工名單或改填不參加的人會列為需要處理，不會自動取消報名。';
const NO_FILE = '請選擇要匯入的檔案。';
const FORMAT_ERROR = '檔案欄位和報名表不一致，請上傳 Google 表單匯出的原始檔案。';
const SYSTEM_ERROR = '系統發生問題，請稍後再試。';

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <ImportForm onOpenChange={onOpenChange} /> : null}
    </Dialog>
  );
}

function ImportForm({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const reload = useReload();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function start() {
    if (busy) return;
    if (!file) return setError(NO_FILE);
    // 只接受 CSV 檔（PPL-R65）
    if (!/\.csv$/i.test(file.name)) return setError(FORMAT_ERROR);
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const imported = await apiFetch<ImportResult>('/api/participants/import', { method: 'POST', body });
      setResult(imported);
      // 匯入後重新載入全部資料（src/contracts/imports.ts）
      await reload().catch(() => undefined);
    } catch (err) {
      const code = err instanceof ApiFailure ? err.code : 'INTERNAL';
      if (code === 'UNAUTHENTICATED') {
        const back = `${window.location.pathname}${window.location.search}`;
        // 登入過期：和儲存佇列相同，整頁回到登入頁（AUTH-R07）
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/login?expired=1&callbackUrl=${encodeURIComponent(back)}`);
        return;
      }
      if (code === 'IMPORT_FORMAT_INVALID') setError(FORMAT_ERROR);
      else if (code === 'VALIDATION_FAILED') setError((err instanceof ApiFailure && err.fields?.file) || NO_FILE);
      else if (code !== 'NETWORK' && isConflictCode(code)) {
        // 別人同時改了參與人員：這次沒有匯入，重新載入最新資料後可以再匯入一次（COM-R07）
        setError(CONFLICT_FALLBACK);
        await reload().catch(() => undefined);
      } else setError(SYSTEM_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function downloadErrors(r: ImportResult) {
    // 錯誤清單：原檔的列號、名字、部門與原因，不含電子郵件（PPL-Q06）
    downloadCsv(
      '匯入錯誤清單.csv',
      ['列號', ...r.header, '原因'],
      r.errors.map((e) => [e.row, ...e.values, e.reason]),
    );
  }

  if (result) {
    return (
      <DialogContent title="匯入參與人員">
        <DialogBody>
          <p className="type-sm-regular text-foreground">{`已匯入 ${result.imported} 位，${result.errors.length} 筆需要處理。`}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            關閉
          </Button>
          {result.errors.length > 0 ? (
            <Button variant="primary" leadingIcon={<Download />} onClick={() => downloadErrors(result)}>
              下載錯誤清單
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent title="匯入參與人員" description={DESCRIPTION}>
      <DialogBody>
        <FileInput
          label="檔案"
          required
          accept=".csv,text/csv"
          file={file}
          onFileChange={(f) => {
            setFile(f);
            setError(f ? null : NO_FILE);
          }}
          description={FILE_HELP}
          error={error}
        />
        <Alert title={DUPLICATE_NOTE} />
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button variant="primary" loading={busy} onClick={() => void start()}>
          開始匯入
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
