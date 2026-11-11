// 立即儲存的佇列（docs/spec/README.md 第 6、7 節；docs/architecture.md 第 10.3 節）。
// - 一次只送一個請求，依操作順序送出（COM-R03）。
// - 網路或系統錯誤：暫停，畫面保留結果，按「重試」從失敗的那一次接著送（COM-R04）。
// - 409／404（別人剛改過資料）：不重試，還沒送出的操作一併取消，交給 onConflict 重新載入（COM-R07）。
// - 401（登入過期）：暫停並交給 onUnauthenticated 導向登入頁（AUTH-R07）。
// - 403 NOT_EDITOR（被改為檢視者）：不重試，還沒送出的操作一併取消，交給 onNotEditor 重新載入並切換成只能檢視（AUTH-R13）。
// - 403 NO_ACCESS（權限被移除，D-026）：同樣一併取消，交給 onNoAccess 換成「沒有權限」頁（AUTH-R17）。
//   佇列不暫停：之後又取得編輯權限時，新的操作照常送出。
// 與畫面無關，方便單元測試。
import { isConflictCode, type ErrorCode } from '@/contracts/errors';
import { ApiFailure } from './api';

export type SaveState = 'idle' | 'saving' | 'failed';

export type SaveStatus = {
  state: SaveState;
  /** 最後一次成功儲存的時間 */
  savedAt: Date | null;
};

export type Job<T = unknown> = {
  /** 送出請求；失敗時丟 ApiFailure */
  send: () => Promise<T>;
  /** 成功後用回應校正畫面 */
  onSuccess?: (result: T) => void;
  /** 別人剛改過資料、這次不能完成時的既有提示（例如「{桌號} 桌已滿，請先移出一位。」）；沒有時用共用文案 */
  conflictMessage?: (code: ErrorCode) => string | undefined;
};

export type QueueHooks = {
  onStatus: (status: SaveStatus) => void;
  onConflict: (code: ErrorCode) => void;
  onUnauthenticated: () => void;
  /** 403 NOT_EDITOR；沒有給時當成衝突交給 onConflict */
  onNotEditor?: () => void;
  /** 403 NO_ACCESS（權限被移除，D-026）；沒有給時當成衝突交給 onConflict */
  onNoAccess?: () => void;
  now?: () => Date;
};

export class SaveQueue {
  private jobs: Job[] = [];
  private running = false;
  private paused = false;
  private status: SaveStatus = { state: 'idle', savedAt: null };
  /** 最近一次衝突時，那個操作自己的提示（onConflict 讀取） */
  lastConflictMessage: string | undefined;

  constructor(private readonly hooks: QueueHooks) {}

  get current(): SaveStatus {
    return this.status;
  }

  get pending(): number {
    return this.jobs.length;
  }

  enqueue<T>(job: Job<T>): void {
    this.jobs.push(job as Job);
    if (!this.paused) void this.run();
  }

  /** 儲存失敗後按「重試」 */
  retry(): void {
    if (!this.paused) return;
    this.paused = false;
    void this.run();
  }

  private setStatus(next: Partial<SaveStatus>) {
    this.status = { ...this.status, ...next };
    this.hooks.onStatus(this.status);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.setStatus({ state: 'saving' });
    try {
      while (this.jobs.length > 0 && !this.paused) {
        const job = this.jobs[0]!;
        try {
          const result = await job.send();
          this.jobs.shift();
          job.onSuccess?.(result);
          this.setStatus({ savedAt: (this.hooks.now ?? (() => new Date()))() });
        } catch (err) {
          const failure = err instanceof ApiFailure ? err : new ApiFailure('INTERNAL', 0, String(err));
          if (failure.code === 'UNAUTHENTICATED') {
            this.paused = true;
            this.setStatus({ state: 'failed' });
            this.hooks.onUnauthenticated();
            return;
          }
          if (failure.code === 'NOT_EDITOR') {
            // 後面的操作也會被拒絕，一併取消；不是儲存失敗，不顯示「重試」
            this.jobs = [];
            this.setStatus({ state: 'idle' });
            if (this.hooks.onNotEditor) this.hooks.onNotEditor();
            else this.hooks.onConflict('NOT_EDITOR');
            return;
          }
          if (failure.code === 'NO_ACCESS') {
            // 權限被移除：後面的操作也會被拒絕，一併取消；畫面換成「沒有權限」頁，不顯示「重試」（AUTH-R17）
            this.jobs = [];
            this.setStatus({ state: 'idle' });
            if (this.hooks.onNoAccess) this.hooks.onNoAccess();
            else this.hooks.onConflict('NO_ACCESS');
            return;
          }

          const code = failure.code;
          const conflict = code !== 'NETWORK' && code !== 'INTERNAL' && isConflictCode(code);
          // 輸入格式錯誤是程式錯誤，重試也不會成功：當成衝突處理，重新載入最新資料
          const unrecoverable = code === 'VALIDATION_FAILED' || code === 'IMPORT_FORMAT_INVALID' || code === 'FORBIDDEN_ORIGIN';
          if (conflict || unrecoverable) {
            // 後面的操作是根據舊資料做的，一併取消
            this.jobs = [];
            this.lastConflictMessage = job.conflictMessage?.(code);
            this.setStatus({ state: 'idle' });
            this.hooks.onConflict(code);
            return;
          }
          this.paused = true;
          this.setStatus({ state: 'failed' });
          return;
        }
      }
      if (!this.paused) this.setStatus({ state: 'idle' });
    } finally {
      this.running = false;
    }
  }
}
