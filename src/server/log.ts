// 結構化 Log（docs/standard/LOG_Design_Guideline.md）：單行 JSON 輸出到 stdout／stderr，平台的網站監控頁可以直接看。
// 不記錄姓名、分機、email、CSV 內容與任何密碼或 token，只記 ID 與數量（docs/architecture.md 第 15.2 節）。

type Severity = 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type LogFields = {
  eventType: string;
  message: string;
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  [key: string]: string | number | boolean | undefined | null;
};

const SERVICE = 'seat-arrangement';

export function log(severity: Severity, fields: LogFields): void {
  if (process.env.LOG_SILENT === '1') return;
  const line = JSON.stringify({
    severity,
    service: SERVICE,
    env: process.env.APP_ENV || 'dev',
    timestamp: new Date().toISOString(),
    ...fields,
  });
  if (severity === 'ERROR' || severity === 'CRITICAL' || severity === 'WARNING') console.error(line);
  else console.info(line);
}

export const logInfo = (fields: LogFields) => log('INFO', fields);
export const logWarning = (fields: LogFields) => log('WARNING', fields);
export const logError = (fields: LogFields) => log('ERROR', fields);
