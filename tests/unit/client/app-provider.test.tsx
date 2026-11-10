// 先改畫面、再依序儲存的整體行為：docs/spec/README.md COM-R02（畫面立即反映、儲存中／已儲存）、
// COM-R04（失敗時畫面保留結果）、COM-R07、COM-R08（衝突時重新載入；有既有提示用既有提示，否則用共用文案）、
// seating.md SEAT-R86；docs/architecture.md 第 10.3 節。
// 用假的 fetch 取代 GET /api/state，不發網路請求。
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState, Employee } from '@/contracts/entities';
import type { ErrorCode } from '@/contracts/errors';
import { ApiFailure } from '@/client/api';
import { AppProvider, useAppStore, useMutation } from '@/client/app-provider';
import { tableFullMessage } from '@/client/conflict-messages';
import { saveStatusText } from '@/client/save-time';

const employee = (id: number, name: string): Employee => ({
  id,
  name,
  englishName: null,
  department: '研發一部',
  team: null,
  extension: null,
  region: null,
  office: null,
  note: null,
  declined: false,
  sortOrder: id,
});

const INITIAL: AppState = { employees: [employee(1, '王小明')], participants: [], tables: [] };
/** 別人改過之後，伺服器上的最新資料 */
const LATEST: AppState = { employees: [employee(1, '王小明'), employee(2, '李美華')], participants: [], tables: [] };
const USER = { name: '測試承辦人', email: 'tester@program.com.tw' };

type ConflictMessage = (code: ErrorCode) => string | undefined;

/** 一個會儲存的操作：畫面先把員工清掉，再送出；可帶這次操作的既有提示 */
function Operation({ send, conflictMessage }: { send: () => Promise<unknown>; conflictMessage?: ConflictMessage }) {
  const mutate = useMutation();
  const names = useAppStore((s) => s.data.employees.map((e) => e.name).join('、'));
  const save = useAppStore((s) => s.save);
  return (
    <div>
      <button
        type="button"
        onClick={() => mutate({ optimistic: (d) => ({ ...d, employees: [] }), send, conflictMessage })}
      >
        做一次操作
      </button>
      <p data-testid="names">{names || '（沒有員工）'}</p>
      <p data-testid="save">{saveStatusText(save)}</p>
    </div>
  );
}

function setup(send: () => Promise<unknown>, conflictMessage?: ConflictMessage) {
  const notify = vi.fn<(text: string) => void>();
  const fetchMock = vi.fn<typeof fetch>(
    async () => ({ ok: true, status: 200, json: async () => LATEST }) as unknown as Response,
  );
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AppProvider initialData={INITIAL} user={USER} notify={notify}>
      <Operation send={send} conflictMessage={conflictMessage} />
    </AppProvider>,
  );
  return { notify, fetchMock };
}

/** 座位安排拖人進第 5 桌時帶的既有提示（SEAT-R86） */
const seatIntoTable5: ConflictMessage = (code) => (code === 'TABLE_FULL' ? tableFullMessage(5) : undefined);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppProvider 與 useMutation', () => {
  it('操作後畫面立即反映結果，Header 先顯示儲存中，完成後顯示已儲存 {時:分}（COM-R02、COM-AC01）', async () => {
    const pending = Promise.withResolvers<unknown>();
    setup(() => pending.promise);
    expect(screen.getByTestId('names').textContent).toBe('王小明');

    await userEvent.click(screen.getByRole('button', { name: '做一次操作' }));
    expect(screen.getByTestId('names').textContent).toBe('（沒有員工）');
    await waitFor(() => expect(screen.getByTestId('save').textContent).toBe('儲存中…'));

    pending.resolve({});
    await waitFor(() => expect(screen.getByTestId('save').textContent).toMatch(/^已儲存 \d{2}:\d{2}$/));
  });

  it('網路中斷時畫面保留結果、顯示儲存失敗，不重新載入（COM-R04、COM-AC03）', async () => {
    const { fetchMock, notify } = setup(() => Promise.reject(new ApiFailure('NETWORK', 0, 'offline')));

    await userEvent.click(screen.getByRole('button', { name: '做一次操作' }));
    await waitFor(() => expect(screen.getByTestId('save').textContent).toBe('儲存失敗，請檢查網路後再試一次。'));
    expect(screen.getByTestId('names').textContent).toBe('（沒有員工）');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it.each<[ErrorCode, number]>([
    ['NOT_FOUND', 404],
    ['DUPLICATE_PARTICIPANT', 409],
    ['DEPENDENT_EXISTS', 409],
  ])(
    '%s：這次不儲存，重新載入最新資料，提示「資料已被其他人更新，已重新載入。」（COM-R07、COM-R08、COM-AC05）',
    async (code, status) => {
      const { fetchMock, notify } = setup(() => Promise.reject(new ApiFailure(code, status, code)));

      await userEvent.click(screen.getByRole('button', { name: '做一次操作' }));

      await waitFor(() => expect(screen.getByTestId('names').textContent).toBe('王小明、李美華'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/state');
      await waitFor(() => expect(notify).toHaveBeenCalledWith('資料已被其他人更新，已重新載入。'));
      expect(screen.getByTestId('save').textContent).not.toBe('儲存失敗，請檢查網路後再試一次。');
      expect(screen.getByTestId('save').textContent).not.toBe('儲存中…');
    },
  );

  it('桌次被別人坐滿：重新載入並顯示這次操作的既有提示「第 5 桌已滿，請先移出一位。」（COM-R08、SEAT-R86、COM-AC04、SEAT-AC88）', async () => {
    const { fetchMock, notify } = setup(
      () => Promise.reject(new ApiFailure('TABLE_FULL', 409, 'table full')),
      seatIntoTable5,
    );

    await userEvent.click(screen.getByRole('button', { name: '做一次操作' }));

    await waitFor(() => expect(screen.getByTestId('names').textContent).toBe('王小明、李美華'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('第 5 桌已滿，請先移出一位。'));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('既有提示對這個 code 沒有文案時，用共用文案（COM-R08）', async () => {
    const { notify } = setup(() => Promise.reject(new ApiFailure('NOT_FOUND', 404, 'gone')), seatIntoTable5);

    await userEvent.click(screen.getByRole('button', { name: '做一次操作' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('資料已被其他人更新，已重新載入。'));
  });

  it('沒有帶既有提示時，依 code 用共用的既有提示：工作人員桌被別人放滿（SEAT-R86）', async () => {
    const { notify } = setup(() => Promise.reject(new ApiFailure('STAFF_TABLE_FULL', 409, 'staff full')));

    await userEvent.click(screen.getByRole('button', { name: '做一次操作' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('工作人員桌已滿，請先移出一位。'));
  });
});
