// 前端呼叫 API 的共用函式：成功回 JSON，失敗回帶 code 的 ApiFailure（docs/architecture.md 第 8.2 節）。
import { apiErrorSchema, type ErrorCode } from '@/contracts/errors';

export class ApiFailure extends Error {
  constructor(
    /** 'NETWORK' 表示沒有收到回應（離線、逾時） */
    readonly code: ErrorCode | 'NETWORK',
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(input: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(input, {
      ...rest,
      credentials: 'same-origin',
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (err) {
    throw new ApiFailure('NETWORK', 0, err instanceof Error ? err.message : 'network error');
  }
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON 錯誤頁 */
  }
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const e = parsed.data.error;
    throw new ApiFailure(e.code, res.status, e.message, e.fields);
  }
  throw new ApiFailure(res.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL', res.status, `HTTP ${res.status}`);
}
