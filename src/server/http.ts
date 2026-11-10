import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { errorStatus, type ErrorCode } from '@/contracts/errors';
import { currentUser } from './auth';
import { logError, logInfo } from './log';

// Route Handler 的共用外殼（docs/architecture.md 第 8 節）：確認登入、記錄請求、把錯誤轉成統一格式。
// 業務規則放 domain，資料存取放 services；handler 只做「解析輸入 → 呼叫服務 → 回 JSON」。

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

/** 包一個需要登入的 Route Handler */
export function route<P = Record<string, string>>(handler: (ctx: ApiContext<P>) => Promise<Response>) {
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
