'use client';

// 權限頁 /permissions（docs/spec/permissions.md 第 2.1 節、PRM-R06～R15、第 4.1 節文案）。沒有原型 HTML：
// 依 04-patterns-and-ux.md New Feature Unit Composition 的 Settings Pattern——頁面標題與說明、一張 --card 面板裡分組：
// 「新增編輯者」（Input `vertical` 的 `with-button`：桌面欄位與按鈕同一列，手機上下堆疊、按鈕滿版）、Separator、「編輯者」清單。
// 移除用 Alert Dialog 確認（destructive）。內容寬最多 760 px，在 Sidebar 旁的區域置中；手機滿版。
// 新增與移除都經過儲存佇列（Header 的儲存狀態跟著更新，PRM-R15）：
// - 新增：伺服器回應成功後加到清單最後；別人剛加入同一個 email（409 EDITOR_EXISTS）時欄位顯示「{email} 已經是編輯者。」並重新載入名單。
// - 移除：先從畫面拿掉（COM-R02），被拒時（最後一位 LAST_EDITOR、已被別人移除 404）重新載入名單，提示由佇列顯示（COM-R08）。
// - 自己的編輯權限剛被移除（403 NOT_EDITOR）：佇列重新載入並提示，這裡回到座位安排（AUTH-R13）。
// - 移除自己成功：回到座位安排，畫面切換成只能檢視（PRM-R13）。
import { useRouter } from 'next/navigation';
import { useCallback, useId, useRef, useState, type FormEvent } from 'react';
import { apiFetch } from '@/client/api';
import { useAppStore } from '@/client/app-provider';
import type { Editor } from '@/contracts/permissions';
import { alreadyEditorMessage, COMPANY_EMAIL_DOMAIN, editorEmailError, normalizeEmail } from '@/domain/editors';
import { PageHead } from '@/components/shell/page-head';
import { AlertDialog, AlertDialogContent } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { controlClasses, Field, fieldAria, useFieldIds } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { notify } from '@/components/ui/toaster';
import { useAwaitedSave } from '../people/use-awaited-save';

const DESCRIPTION = '編輯者可以修改資料；其他同仁用公司帳號登入後只能檢視。';
const FIELD_HELP = '編輯者可以修改所有資料，也能管理權限。';
const LAST_EDITOR_NOTE = '至少要有一位編輯者，最後一位不能移除。';
const SELF_REMOVE_BODY = '這是你自己的帳號。移除後你只能檢視，不能再修改資料，也不能再開啟這一頁。';

export interface PermissionsViewProps {
  /** 伺服器端讀好的名單，依加入先後 */
  initialEditors: Editor[];
  /** 公司網域（伺服器的 ALLOWED_EMAIL_DOMAIN）；省略時用規格寫明的 program.com.tw */
  domain?: string;
}

export function PermissionsView({ initialEditors, domain = COMPANY_EMAIL_DOMAIN }: PermissionsViewProps) {
  const router = useRouter();
  const me = useAppStore((s) => normalizeEmail(s.user.email));
  const setIsEditor = useAppStore((s) => s.setIsEditor);
  const save = useAwaitedSave();

  const [editors, setEditors] = useState<Editor[]>(initialEditors);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<Editor | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldIds = useFieldIds();
  const addHeadingId = useId();
  const listHeadingId = useId();

  /** 重新載入名單（別人剛改過名單時，COM-R07）；不是編輯者或網路問題時保留畫面 */
  const reloadEditors = useCallback(async () => {
    try {
      const res = await apiFetch<{ editors: Editor[] }>('/api/editors');
      setEditors(res.editors);
    } catch {
      /* 回到座位安排或由 Header 的儲存狀態處理 */
    }
  }, []);

  /** 自己的編輯權限剛被移除：回到座位安排，提示與重新載入由儲存佇列處理（AUTH-R13） */
  const leave = useCallback(() => router.replace('/'), [router]);

  /** 欄位驗證（PRM-R08）：空白、格式、網域，最後看是不是已經在名單上（依 PRM-R03 比對） */
  const validate = (raw: string): string | null => {
    const found = editorEmailError(raw, domain);
    if (found) return found;
    const email = normalizeEmail(raw);
    return editors.some((e) => e.email === email) ? alreadyEditorMessage(email) : null;
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const found = validate(value);
    setError(found);
    if (found) {
      inputRef.current?.focus();
      return;
    }
    const email = normalizeEmail(value);
    setSubmitting(true);
    const outcome = await save<{ editor: Editor }>({
      send: () => apiFetch<{ editor: Editor }>('/api/editors', { method: 'POST', json: { email } }),
      onSuccess: ({ editor }) => {
        // 加到清單最後、欄位清空；不帶「復原」，要撤銷就移除（PRM-R09）
        setEditors((list) => (list.some((e) => e.id === editor.id) ? list : [...list, editor]));
        setValue('');
        setError(null);
        notify(`已把 ${editor.email} 設為編輯者。`);
      },
      // 已經是編輯者、欄位格式不對：錯誤顯示在欄位下方，不另外用 Sonner（README 第 9 節）
      conflictMessage: (code) => (code === 'EDITOR_EXISTS' || code === 'VALIDATION_FAILED' ? '' : undefined),
    });
    setSubmitting(false);
    if (outcome.status !== 'rejected') return;
    if (outcome.code === 'NOT_EDITOR') return leave();
    if (outcome.code === 'EDITOR_EXISTS') setError(alreadyEditorMessage(email));
    else if (outcome.code === 'VALIDATION_FAILED') setError(outcome.fields?.email ?? editorEmailError(email, domain));
    void reloadEditors();
  }

  async function remove(target: Editor) {
    const self = target.email === me;
    // 先從畫面拿掉（COM-R02），被拒時重新載入名單
    setEditors((list) => list.filter((e) => e.id !== target.id));
    const outcome = await save<{ removedId: number }>({
      send: () => apiFetch<{ removedId: number }>(`/api/editors/${target.id}`, { method: 'DELETE' }),
      onSuccess: () => {
        notify(`已移除 ${target.email} 的編輯權限。`);
        if (self) {
          // 移除自己：畫面切換成只能檢視，回到座位安排（PRM-R13）
          setIsEditor(false);
          leave();
        }
      },
    });
    if (outcome.status === 'rejected' && outcome.code === 'NOT_EDITOR') return leave();
    if (outcome.status === 'rejected' || outcome.status === 'dropped') void reloadEditors();
  }

  const onlyOne = editors.length <= 1;

  return (
    <section className="mx-auto w-full max-w-[760px] min-w-0">
      <PageHead title="權限" description={DESCRIPTION} />
      <div className="min-w-0 rounded-xl border border-border bg-card p-6 text-card-foreground edge-card max-md:p-4">
        <form noValidate onSubmit={submit} aria-labelledby={addHeadingId}>
          <h2 id={addHeadingId} className="mb-4 type-lg-semi-bold text-foreground">
            新增編輯者
          </h2>
          <Field ids={fieldIds} label="email" description={FIELD_HELP} error={error}>
            {/* 桌面：欄位與按鈕同一列，說明與錯誤在下方。手機：這一列拆開（contents），按鈕排到說明與錯誤之後、滿版，
                錯誤文字仍緊接在欄位下方（README 第 9 節） */}
            <div className="flex min-w-0 gap-2 max-md:contents">
              <input
                ref={inputRef}
                id={fieldIds.id}
                type="text"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={`name@${domain}`}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                // 離開欄位時驗證（README 第 9 節）；還沒輸入任何字就離開不提示
                onBlur={() => {
                  if (value.trim()) setError(validate(value));
                }}
                className={cn(controlClasses({ size: 'md', error: !!error }), 'h-9 flex-1')}
                {...fieldAria(fieldIds, { description: FIELD_HELP, error })}
              />
              <Button type="submit" variant="primary" loading={submitting} className="shrink-0 max-md:order-1 max-md:mt-2 max-md:w-full">
                新增編輯者
              </Button>
            </div>
          </Field>
        </form>

        <Separator className="my-6" />

        <h2 id={listHeadingId} className="type-lg-semi-bold text-foreground">
          編輯者
        </h2>
        <ul aria-labelledby={listHeadingId} className="m-0 mt-2 flex list-none flex-col p-0">
          {editors.map((editor) => (
            <li key={editor.id} className="flex min-w-0 items-center gap-3 border-b border-border py-3 last:border-b-0">
              {/* 太長時在任何字元處換行，不截斷（第 2.1 節手機） */}
              <span className="min-w-0 flex-1 type-sm-regular text-foreground [overflow-wrap:anywhere]">{editor.email}</span>
              <Button
                variant="destructive-outline"
                size="sm"
                aria-label={`移除 ${editor.email}`}
                disabled={onlyOne}
                onClick={() => setRemoving(editor)}
                className="shrink-0"
              >
                移除
              </Button>
            </li>
          ))}
        </ul>
        {onlyOne ? <p className="mt-2 type-xs-regular text-muted-foreground">{LAST_EDITOR_NOTE}</p> : null}
      </div>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        {removing ? (
          <AlertDialogContent
            title={`要移除 ${removing.email} 的編輯權限嗎？`}
            description={removing.email === me ? SELF_REMOVE_BODY : `移除後 ${removing.email} 只能檢視，不能再修改資料。`}
            confirmLabel="移除編輯權限"
            destructive
            onConfirm={() => void remove(removing)}
          />
        ) : null}
      </AlertDialog>
    </section>
  );
}
