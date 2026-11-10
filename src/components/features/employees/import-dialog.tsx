'use client';

// 匯入員工名單對話框（docs/spec/employees.md 2.7、3.8、4.4 節；原型 ui.js importFlow／UI.importEmployeesDialog）。
// 由上而下：標題、說明、「下載範本」、檔案欄位、重複處理說明、「開始匯入」「取消」。
// 完成後在對話框內顯示「已匯入 {n} 位員工，{m} 筆需要處理。」與「關閉」「下載錯誤清單」（EMP-Q03 依 D-008 照原型）；
// {n} 含新增與更新的員工。匯入不能復原，沒有「復原」（EMP-R31）。錯誤清單由前端產生 CSV 下載（docs/architecture.md 第 11.1 節）。
import { Download, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { ApiFailure, apiFetch } from '@/client/api';
import { useReload } from '@/client/app-provider';
import { downloadCsv } from '@/client/download';
import { ROSTER_TEMPLATE_HEADER } from '@/contracts/employees';
import type { ImportResult } from '@/contracts/imports';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FileInput } from '@/components/ui/file-input';

const FILE_REQUIRED = '請選擇要匯入的檔案。';
const FORMAT_INVALID = '檔案欄位和範本不一致，請下載範本後重新整理。';
const SYSTEM_ERROR = '系統發生問題，請稍後再試。';
const TEMPLATE_FILE = '員工名單範本.csv';
const ERROR_LIST_FILE = '匯入錯誤清單.csv';

/** 原型只檢查副檔名是不是 .csv（EMP-Q02 依 D-008） */
const isCsv = (file: File) => /\.csv$/i.test(file.name);

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <ImportForm onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

const upload = (file: File) => {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<ImportResult>('/api/employees/import', { method: 'POST', body });
};

function ImportForm({ onClose }: { onClose: () => void }) {
  const reload = useReload();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const start = async () => {
    if (!file) return setError(FILE_REQUIRED);
    if (!isCsv(file)) return setError(FORMAT_INVALID);
    setLoading(true);
    setFailed(false);
    try {
      const r = await upload(file);
      // 匯入成功後重新載入全部資料（src/contracts/imports.ts）
      await reload().catch(() => undefined);
      setResult(r);
    } catch (err) {
      const code = err instanceof ApiFailure ? err.code : 'INTERNAL';
      if (code === 'UNAUTHENTICATED') {
        const back = `${window.location.pathname}${window.location.search}`;
        // 登入過期：和儲存佇列相同，整頁回到登入頁（AUTH-R07）
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/login?expired=1&callbackUrl=${encodeURIComponent(back)}`);
        return;
      }
      if (code === 'IMPORT_FORMAT_INVALID') setError(FORMAT_INVALID);
      else if (code === 'VALIDATION_FAILED') setError((err as ApiFailure).fields?.file ?? FILE_REQUIRED);
      else setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const description = '上傳公司通訊錄匯出的 CSV 檔，一次建立或更新全部員工。';

  if (result) {
    return (
      <DialogContent title="匯入員工名單" description={description}>
        <DialogBody>
          <p className="type-sm-regular text-foreground">
            已匯入 {result.imported} 位員工，{result.errors.length} 筆需要處理。
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            關閉
          </Button>
          <Button
            variant="primary"
            leadingIcon={<Download />}
            onClick={() =>
              downloadCsv(
                ERROR_LIST_FILE,
                result.header,
                result.errors.map((e) => [e.row, e.reason, ...e.values]),
              )
            }
          >
            下載錯誤清單
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent title="匯入員工名單" description={description}>
      <form
        className="contents"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <DialogBody>
          <div>
            <Button
              variant="link"
              leadingIcon={<Download />}
              onClick={() => downloadCsv(TEMPLATE_FILE, ROSTER_TEMPLATE_HEADER, [])}
            >
              下載範本
            </Button>
          </div>
          <FileInput
            label="檔案"
            required
            accept=".csv"
            file={file}
            error={error}
            disabled={loading}
            onFileChange={(f) => {
              setFile(f);
              setFailed(false);
              setError(f ? (isCsv(f) ? undefined : FORMAT_INVALID) : FILE_REQUIRED);
            }}
          />
          <Alert title="姓名與部門相同的員工會更新內容，不會重複新增；公共區域、會議室與「空位」的列會略過。" />
          {failed ? <Alert role="alert" icon={<TriangleAlert />} title={SYSTEM_ERROR} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            開始匯入
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
