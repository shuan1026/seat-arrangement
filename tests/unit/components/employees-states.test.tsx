// 員工名單頁的載入與系統錯誤：docs/spec/employees.md 2.1、EMP-AC07；docs/spec/README.md 第 9 節「通用狀態」
// （載入：依內容形狀顯示 Skeleton，不顯示文字；系統錯誤：「系統發生問題，請稍後再試。」與「再試一次」）。
// 假設用 Next.js 的路由慣例：src/app/(main)/employees/loading.tsx（切換到員工名單、頁面還在載入時）與
// src/app/(main)/employees/error.tsx（這一頁發生錯誤時，props 是 { error, reset }）。
// 全部資料由共用的 (main)/layout.tsx 在伺服器端讀取；layout 讀取失敗不會進到這一頁的 error.tsx，那部分屬於共用版面。
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EmployeesError from '@/app/(main)/employees/error';
import EmployeesLoading from '@/app/(main)/employees/loading';

describe('載入中（EMP-AC07）', () => {
  it('顯示 Skeleton、不顯示任何文字，並讓輔助技術知道正在載入', () => {
    const { container } = render(<EmployeesLoading />);
    expect(container.textContent?.trim()).toBe('');
    expect(container.querySelector('[role="status"], [aria-busy="true"]')).not.toBeNull();
  });

  it('依表格形狀：有多條列狀的 Skeleton', () => {
    const { container } = render(<EmployeesLoading />);
    // Skeleton 本身沒有文字也不給輔助技術讀（aria-hidden），用元素數量確認不是單一色塊
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });
});

describe('系統錯誤（EMP-AC07）', () => {
  it('顯示「系統發生問題，請稍後再試。」；按「再試一次」重新載入這一頁', async () => {
    const reset = vi.fn();
    render(<EmployeesError error={Object.assign(new Error('測試錯誤'), { digest: 'x' })} reset={reset} />);
    expect(screen.getByText('系統發生問題，請稍後再試。')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '再試一次' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('不顯示錯誤代碼或內部訊息（README 第 12 節）', () => {
    const { container } = render(<EmployeesError error={Object.assign(new Error('ECONNREFUSED 內部訊息'), { digest: 'abc123' })} reset={vi.fn()} />);
    expect(container.textContent).not.toContain('ECONNREFUSED');
    expect(container.textContent).not.toContain('abc123');
  });
});
