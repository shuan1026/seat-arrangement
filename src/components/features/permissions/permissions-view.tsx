'use client';

// 權限頁 /permissions（docs/spec/permissions.md 第 2.1 節、PRM-R06～R15、PRM-R35、PRM-R36、第 4.1 節文案；D-021、D-026）。沒有原型 HTML：
// 依 04-patterns-and-ux.md New Feature Unit Composition 的 Settings Pattern——頁面標題與說明、一張 --card 面板裡分組：
// 「新增帳號」（email Input、「權限」Select、「新增」；桌面同一列、底邊對齊，手機上下堆疊、滿版）、Separator、「帳號」清單。
// 清單每列：email、權限 Select、「移除」；手機上 email 一行，權限與「移除」在第二行。
// 改為檢視者用 Alert Dialog 確認（primary）；移除用 Alert Dialog 確認（destructive）。內容寬最多 760 px，在 Sidebar 旁的區域置中。
// 新增、改權限與移除都經過儲存佇列（Header 的儲存狀態跟著更新，PRM-R15）：
// - 新增：伺服器回應成功後加到清單最後；別人剛加入同一個 email（409 MEMBER_EXISTS）時欄位顯示伺服器組好的「{email} 已經是{權限}。」並重新載入名單。
// - 改權限、移除：先改畫面（COM-R02），被拒時（最後一位 LAST_EDITOR、已被別人移除 404）重新載入名單，提示由佇列顯示（COM-R08）。
// - 自己被改為檢視者（403 NOT_EDITOR）：佇列重新載入並提示，這裡回到座位安排（AUTH-R13）。
// - 自己被移除（403 NO_ACCESS）：佇列換成「沒有權限」頁（AUTH-R17）。
// - 把自己改為檢視者成功：回到座位安排，畫面切換成只能檢視（PRM-R36）；移除自己成功：換成「沒有權限」頁、不顯示 Sonner（PRM-R13）。
import { useRouter } from 'next/navigation';
import { useCallback, useId, useRef, useState, type FormEvent } from 'react';
import { apiFetch } from '@/client/api';
import { useAppStore } from '@/client/app-provider';
import type { Member } from '@/contracts/permissions';
import {
  alreadyMemberMessage,
  COMPANY_EMAIL_DOMAIN,
  DEFAULT_MEMBER_ROLE,
  MEMBER_ROLES,
  memberEmailError,
  normalizeEmail,
  roleLabel,
  type MemberRole,
} from '@/domain/members';
import { PageHead } from '@/components/shell/page-head';
import { AlertDialog, AlertDialogContent } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { controlClasses, Field, fieldAria, useFieldIds } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { notify } from '@/components/ui/toaster';
import { useAwaitedSave } from '../people/use-awaited-save';

const DESCRIPTION = '編輯者可以修改所有資料，也能管理權限；檢視者可以看座位安排、參與人員、員工名單，也能匯出座位表。其他同仁只能看發布的座位表。';
const LAST_EDITOR_NOTE = '至少要有一位編輯者，最後一位不能移除，也不能改為檢視者。';
const SELF_DEMOTE_BODY = '這是你自己的帳號。改了之後你只能檢視，不能再修改資料，也不能再開啟這一頁。';
const SELF_REMOVE_BODY = '這是你自己的帳號。移除後你看不到排座資料，只能看發布的座位表，也不能再開啟這一頁。';

const ROLE_OPTIONS: SelectOption[] = MEMBER_ROLES.map((role) => ({ value: role, label: roleLabel(role) }));
const isRole = (value: string | null): value is MemberRole => value === 'EDITOR' || value === 'VIEWER';

export interface PermissionsViewProps {
  /** 伺服器端讀好的名單，依加入先後 */
  initialMembers: Member[];
  /** 公司網域（伺服器的 ALLOWED_EMAIL_DOMAIN）；省略時用規格寫明的 program.com.tw */
  domain?: string;
}

export function PermissionsView({ initialMembers, domain = COMPANY_EMAIL_DOMAIN }: PermissionsViewProps) {
  const router = useRouter();
  const me = useAppStore((s) => normalizeEmail(s.user.email));
  const setIsEditor = useAppStore((s) => s.setIsEditor);
  const save = useAwaitedSave();

  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [value, setValue] = useState('');
  const [role, setRole] = useState<MemberRole>(DEFAULT_MEMBER_ROLE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [demoting, setDemoting] = useState<Member | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldIds = useFieldIds();
  const addHeadingId = useId();
  const listHeadingId = useId();

  /** 重新載入名單（別人剛改過名單時，COM-R07）；不是編輯者或網路問題時保留畫面 */
  const reloadMembers = useCallback(async () => {
    try {
      const res = await apiFetch<{ members: Member[] }>('/api/members');
      setMembers(res.members);
    } catch {
      /* 回到座位安排、換成「沒有權限」頁，或由 Header 的儲存狀態處理 */
    }
  }, []);

  /** 自己被改為檢視者：回到座位安排，提示與重新載入由儲存佇列處理（AUTH-R13） */
  const leave = useCallback(() => router.replace('/'), [router]);

  /** 欄位驗證（PRM-R08）：空白、格式、網域，最後看是不是已經在名單上（依 PRM-R03 比對，不論選的權限） */
  const validate = (raw: string): string | null => {
    const found = memberEmailError(raw, domain);
    if (found) return found;
    const email = normalizeEmail(raw);
    const existing = members.find((m) => m.email === email);
    return existing ? alreadyMemberMessage(email, existing.role) : null;
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
    const outcome = await save<{ member: Member }>({
      send: () => apiFetch<{ member: Member }>('/api/members', { method: 'POST', json: { email, role } }),
      onSuccess: ({ member }) => {
        // 加到清單最後、欄位清空、權限回到預設；不帶「復原」，要撤銷就改權限或移除（PRM-R09）
        setMembers((list) => (list.some((m) => m.id === member.id) ? list : [...list, member]));
        setValue('');
        setRole(DEFAULT_MEMBER_ROLE);
        setError(null);
        notify(`已把 ${member.email} 設為${roleLabel(member.role)}。`);
      },
      // 已經在名單上、欄位格式不對：錯誤顯示在欄位下方，不另外用 Sonner（README 第 9 節）
      conflictMessage: (code) => (code === 'MEMBER_EXISTS' || code === 'VALIDATION_FAILED' ? '' : undefined),
    });
    setSubmitting(false);
    if (outcome.status !== 'rejected') return;
    if (outcome.code === 'NOT_EDITOR') return leave();
    if (outcome.code === 'NO_ACCESS') return;
    if (outcome.code === 'MEMBER_EXISTS') setError(outcome.fields?.email ?? alreadyMemberMessage(email, role));
    else if (outcome.code === 'VALIDATION_FAILED') setError(outcome.fields?.email ?? memberEmailError(email, domain));
    void reloadMembers();
  }

  /** 改權限（PRM-R35、PRM-R36）：先改畫面，被拒時重新載入名單 */
  async function changeRole(target: Member, next: MemberRole) {
    const selfDemote = target.email === me && next === 'VIEWER';
    setMembers((list) => list.map((m) => (m.id === target.id ? { ...m, role: next } : m)));
    const outcome = await save<{ member: Member }>({
      send: () => apiFetch<{ member: Member }>(`/api/members/${target.id}`, { method: 'PATCH', json: { role: next } }),
      onSuccess: ({ member }) => {
        setMembers((list) => list.map((m) => (m.id === member.id ? member : m)));
        notify(`已把 ${member.email} 改為${roleLabel(member.role)}。`);
        if (selfDemote) {
          // 把自己改為檢視者：畫面切換成只能檢視，回到座位安排（PRM-R36）
          setIsEditor(false);
          leave();
        }
      },
    });
    if (outcome.status === 'rejected' && outcome.code === 'NOT_EDITOR') return leave();
    if (outcome.status === 'rejected' && outcome.code === 'NO_ACCESS') return;
    if (outcome.status === 'rejected' || outcome.status === 'dropped') void reloadMembers();
  }

  /** 權限選單選了另一種權限：升為編輯者直接儲存；降為檢視者先確認（PRM-R35） */
  function pickRole(target: Member, next: string | null) {
    if (!isRole(next) || next === target.role) return;
    if (next === 'VIEWER') setDemoting(target);
    else void changeRole(target, next);
  }

  async function remove(target: Member) {
    const self = target.email === me;
    // 先從畫面拿掉（COM-R02），被拒時重新載入名單
    setMembers((list) => list.filter((m) => m.id !== target.id));
    const outcome = await save<{ removedId: number }>({
      send: () => apiFetch<{ removedId: number }>(`/api/members/${target.id}`, { method: 'DELETE' }),
      onSuccess: () => {
        // 移除自己：重新取得伺服器端的畫面，layout 在同一個網址改畫「沒有權限」頁，不顯示 Sonner（PRM-R13）
        if (self) router.refresh();

        else notify(`已移除 ${target.email} 的權限。`);
      },
    });
    if (outcome.status === 'rejected' && outcome.code === 'NOT_EDITOR') return leave();
    if (outcome.status === 'rejected' && outcome.code === 'NO_ACCESS') return;
    if (outcome.status === 'rejected' || outcome.status === 'dropped') void reloadMembers();
  }

  const editorCount = members.filter((m) => m.role === 'EDITOR').length;
  const lastEditor = editorCount <= 1;

  return (
    <section className="mx-auto w-full max-w-[760px] min-w-0">
      <PageHead title="權限" description={DESCRIPTION} />
      <div className="min-w-0 rounded-xl border border-border bg-card p-6 text-card-foreground edge-card max-md:p-4">
        <form noValidate onSubmit={submit} aria-labelledby={addHeadingId}>
          <h2 id={addHeadingId} className="mb-4 type-lg-semi-bold text-foreground">
            新增帳號
          </h2>
          {/* 桌面：email、權限、「新增」同一列，標籤在上、控制項底邊對齊，錯誤在 email 欄位下方。
              手機：上下堆疊，三者都滿版（第 2.1 節） */}
          <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:gap-2">
            <Field ids={fieldIds} label="email" error={error} className="md:flex-1">
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
                className={cn(controlClasses({ size: 'md', error: !!error }), 'h-9')}
                {...fieldAria(fieldIds, { error })}
              />
            </Field>
            <Select
              label="權限"
              options={ROLE_OPTIONS}
              value={role}
              onValueChange={(next) => {
                if (isRole(next)) setRole(next);
              }}
              className="md:w-32 md:shrink-0"
            />
            {/* 和欄位底邊對齊：上方留一行標籤高的空白（只在桌面） */}
            <div className="flex flex-col gap-2 md:shrink-0">
              <span aria-hidden className="type-sm-medium max-md:hidden">
                &nbsp;
              </span>
              <Button type="submit" variant="primary" loading={submitting} className="max-md:w-full">
                新增
              </Button>
            </div>
          </div>
        </form>

        <Separator className="my-6" />

        <h2 id={listHeadingId} className="type-lg-semi-bold text-foreground">
          帳號
        </h2>
        <ul aria-labelledby={listHeadingId} className="m-0 mt-2 flex list-none flex-col p-0">
          {members.map((member) => {
            const locked = lastEditor && member.role === 'EDITOR';
            return (
              <li key={member.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-3 last:border-b-0">
                {/* 太長時在任何字元處換行，不截斷；手機上獨佔第一行（第 2.1 節） */}
                <span className="min-w-0 flex-1 type-sm-regular text-foreground [overflow-wrap:anywhere] max-md:basis-full">{member.email}</span>
                <Select
                  aria-label={`${member.email} 的權限`}
                  size="sm"
                  options={ROLE_OPTIONS}
                  value={member.role}
                  disabled={locked}
                  onValueChange={(next) => pickRole(member, next)}
                  className="w-28 shrink-0 max-md:mr-auto"
                />
                <Button
                  variant="destructive-outline"
                  size="sm"
                  aria-label={`移除 ${member.email}`}
                  disabled={locked}
                  onClick={() => setRemoving(member)}
                  className="shrink-0"
                >
                  移除
                </Button>
              </li>
            );
          })}
        </ul>
        {lastEditor ? <p className="mt-2 type-xs-regular text-muted-foreground">{LAST_EDITOR_NOTE}</p> : null}
      </div>

      <AlertDialog
        open={demoting !== null}
        onOpenChange={(open) => {
          if (!open) setDemoting(null);
        }}
      >
        {demoting ? (
          <AlertDialogContent
            title={`要把 ${demoting.email} 改為檢視者嗎？`}
            description={demoting.email === me ? SELF_DEMOTE_BODY : `改了之後 ${demoting.email} 只能檢視，不能再修改資料。`}
            confirmLabel="改為檢視者"
            onConfirm={() => void changeRole(demoting, 'VIEWER')}
          />
        ) : null}
      </AlertDialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        {removing ? (
          <AlertDialogContent
            title={`要移除 ${removing.email} 的權限嗎？`}
            description={removing.email === me ? SELF_REMOVE_BODY : `移除後 ${removing.email} 看不到排座資料，只能看發布的座位表。`}
            confirmLabel="移除權限"
            destructive
            onConfirm={() => void remove(removing)}
          />
        ) : null}
      </AlertDialog>
    </section>
  );
}
