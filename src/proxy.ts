// 存取檢查（docs/spec/README.md 第 8 節、docs/architecture.md 第 9.2 節）。Next.js 16 的 proxy（舊名 middleware）。
// - 沒登入：頁面導向 /login（記住原本的路徑）；API 回 401。
// - 寫入 API 的 Origin 必須是本站，搭配 SameSite=Lax cookie 防跨站請求。
// 每個 Route Handler 另外再確認一次登入，避免這裡的路徑比對寫漏。
import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_PATHS = ['/login', '/api/health', '/api/auth'];
const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const apiError = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const isApi = pathname.startsWith('/api/');
  if (isApi && WRITE_METHODS.has(req.method)) {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== req.headers.get('host')) {
      return apiError(403, 'FORBIDDEN_ORIGIN', 'cross-site request blocked');
    }
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  if (isApi) return apiError(401, 'UNAUTHENTICATED', 'sign-in required');
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('callbackUrl', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Next.js 內部路徑（靜態檔、圖片、開發模式的熱更新連線）與公開的靜態檔不檢查。
  // 熱更新連線若被導向登入頁，開發模式會不斷重新整理頁面。
  matcher: ['/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico|woff2?)$).*)'],
};
