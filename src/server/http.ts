import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { errorStatus, type ErrorCode } from '@/contracts/errors';
import { currentUser } from './auth';
import { logError, logInfo } from './log';
import { isEditor } from './services/editors';

// Route Handler 的共用外殼（docs/architecture.md 第 8 節）：確認登入、檢查編輯權限、記錄請求、把錯誤轉成統一格式。
// 業務規則放 domain，資料存取放 services；handler 只做「解析輸入 → 呼叫服務 → 回 JSON」。
// 權限（D-021、docs/architecture.md 第 9.3 節）：會修改資料的方法（POST、PUT、PATCH、DELETE）一律要是編輯者，
// 依 HTTP 方法自動檢查，之後新增的寫入 API 不會漏掉；在讀本體之前就擋下，所以匯入的 multipart 請求不會先讀檔。
// 編輯者每個請求查一次資料庫，不放進 JWT，權限變更從對方的下一次請求起生效（AUTH-R11）。

/** 服務層丟出的業務錯誤，會轉成 { error: { code, message } } */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const errorResponse = (code: ErrorCode, message: string = code, fields?: Record<string, string>) =>
  Response.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status: errorStatus[code] });

export type ApiContext<P> = {
  req: Request;
  params: P;
  user: { id: string; name: string; email: string };
  requestId: string;
};

type RouteArgs<P> = { params: Promise<P> };

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type RouteOptions = {
  /** 讀取也只給編輯者（GET /api/editors，PRM-R06）；寫入方法不必設，一律檢查 */
  editorOnly?: boolean;
};

/** 包一個需要登入的 Route Handler；寫入方法另外要是編輯者 */
export function route<P = Record<string, string>>(handler: (ctx: ApiContext<P>) => Promise<Response>, options: RouteOptions = {}) {
  return async (req: Request, args: RouteArgs<P>): Promise<Response> => {
    const started = performance.now();
    const requestId = req.headers.get('x-request-id') || `req_${randomUUID()}`;
    const path = new URL(req.url).pathname;
    let status = 500;
    let userId: string | undefined;
    let errorCode: string | undefined;
    try {
      const user = await currentUser();
      if (!user) {
        status = 401;
        errorCode = 'UNAUTHENTICATED';
        return errorResponse('UNAUTHENTICATED', 'sign-in required');
      }
      userId = user.id;
      if ((options.editorOnly || WRITE_METHODS.has(req.method.toUpperCase())) && !(await isEditor(user.email))) {
        status = 403;
        errorCode = 'NOT_EDITOR';
        return errorResponse('NOT_EDITOR', 'editor permission required');
      }
      const res = await handler({ req, params: await args.params, user, requestId });
      status = res.status;
      return res;
    } catch (err) {
      if (err instanceof AppError) {
        status = errorStatus[err.code];
        errorCode = err.code;
        return errorResponse(err.code, err.message, err.fields);
      }
      if (err instanceof z.ZodError) {
        status = 400;
        errorCode = 'VALIDATION_FAILED';
        return errorResponse('VALIDATION_FAILED', 'invalid input', zodFields(err));
      }
      status = 500;
      errorCode = 'INTERNAL';
      logError({
        eventType: 'api_request_failed',
        message: err instanceof Error ? err.message : 'unknown error',
        requestId,
        method: req.method,
        path,
        stack: err instanceof Error ? (err.stack ?? null) : null,
      });
      return errorResponse('INTERNAL', 'internal error');
    } finally {
      logInfo({
        eventType: 'api_request_completed',
        message: 'API request completed',
        requestId,
        userId,
        method: req.method,
        path,
        status,
        errorCode,
        durationMs: Math.round(performance.now() - started),
      });
    }
  };
}

/** 讀 JSON 本體並依 schema 驗證；格式不對丟 ZodError（轉成 400 VALIDATION_FAILED） */
export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError('VALIDATION_FAILED', 'body must be JSON');
  }
  return schema.parse(body);
}

/** 路徑參數的 id */
export function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 0) throw new AppError('NOT_FOUND', 'invalid id');
  return id;
}

function zodFields(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
