// 頁面資料讀取失敗的錯誤畫面：docs/spec/README.md 第 9 節「通用狀態」的系統錯誤（「系統發生問題，請稍後再試。」與「再試一次」）、
// 第 14 節共用文案、第 12 節（錯誤訊息不顯示錯誤代碼）；employees.md EMP-AC07、participants.md 第 2.1 節「錯誤」、
// seating.md 2.1.10「系統錯誤」。
// 三個頁面的資料都在共用的 src/app/(main)/layout.tsx 讀取（loadState）。layout 丟出的錯誤，同一層與下層的 error.tsx
// （例如 src/app/(main)/employees/error.tsx）都接不到，要由上一層、也就是根層級的 src/app/error.tsx 接住。
//
// 假設的介面：
//   src/app/error.tsx 預設匯出 Client Component：({ error, reset }: { error: Error & { digest?: string }; reset: () => void })
//   - 不依賴 AppProvider：共用版面讀取失敗時還沒有 store，也沒有 App Shell。
//   - 「再試一次」呼叫 reset() 重新繪製；可以同時用 next/navigation 的 router.refresh() 重新向伺服器讀取資料。
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppError from '@/app/error';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/people',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

afterEach(() => {
  router.refresh.mockReset();
});

const loadFailed = (message = '資料庫連線失敗（測試）', digest = 'digest-123') => Object.assign(new Error(message), { digest });

describe('共用版面讀取資料失敗（src/app/error.tsx）', () => {
  it('顯示「系統發生問題，請稍後再試。」與「再試一次」（README 第 9 節、第 14 節）', () => {
    render(<AppError error={loadFailed()} reset={vi.fn()} />);
    expect(screen.getByText('系統發生問題，請稍後再試。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '再試一次' })).toBeTruthy();
  });

  it('按「再試一次」重新載入：呼叫 reset 一次', async () => {
    const reset = vi.fn();
    render(<AppError error={loadFailed()} reset={reset} />);
    await userEvent.click(screen.getByRole('button', { name: '再試一次' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('不顯示錯誤代碼或內部訊息（README 第 12 節）', () => {
    const { container } = render(<AppError error={loadFailed('ECONNREFUSED 127.0.0.1:3306 內部訊息', 'abc123')} reset={vi.fn()} />);
    expect(container.textContent).not.toContain('ECONNREFUSED');
    expect(container.textContent).not.toContain('3306');
    expect(container.textContent).not.toContain('內部訊息');
    expect(container.textContent).not.toContain('abc123');
  });

  it('沒有 digest 的錯誤也顯示同一個畫面', () => {
    render(<AppError error={new Error('unknown')} reset={vi.fn()} />);
    expect(screen.getByText('系統發生問題，請稍後再試。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '再試一次' })).toBeTruthy();
  });

  it('不需要 AppProvider：共用版面讀取失敗時還沒有 store，畫面照樣顯示（不丟錯）', () => {
    // 這個測試刻意不包 AppProvider；用到 useAppStore 會丟出「必須在 AppProvider 裡使用」
    expect(() => render(<AppError error={loadFailed()} reset={vi.fn()} />)).not.toThrow();
    expect(screen.getByText('系統發生問題，請稍後再試。')).toBeTruthy();
  });
});
