'use client';

// 新增、編輯人員對話框與從員工名單「加入尾牙」（docs/spec/participants.md 第 2.3、2.4 節、第 3.4、3.5 節、第 4.2、4.3 節）。
// 版面依原型 people.html 的 UI.personDialog：最上面是類別，其下的欄位依類別變化，最後以 Separator 分隔出桌次。
// 待確認依目前假設（D-008）：類別預設「員工」（PPL-Q09）、編輯時可以變更類別（PPL-Q07）、編輯時也有桌次欄位（PPL-Q08）、
// 已有眷屬的員工停用並標示「・已有眷屬」（PPL-Q10）、「找不到？請先到員工名單新增。」一直顯示（PPL-Q11）、
// 加入尾牙並同時加眷屬時的成功訊息用「已把 {姓名} 加入尾牙。」（PPL-Q12）。
// 送出時等伺服器的結果：別人剛把員工加入尾牙、剛替所屬員工加了眷屬時，對話框留著並在欄位顯示原因（PPL-R45、PPL-R49）。
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useAppStore } from '@/client/app-provider';
import { apiFetch } from '@/client/api';
import { tableFullMessage } from '@/client/conflict-messages';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { notify } from '@/components/ui/toaster';
import { STAFF_TABLE_ID, type Participant, type ParticipantKind } from '@/contracts/entities';
import type { ErrorCode } from '@/contracts/errors';
import type { ParticipantCreateInput, ParticipantUpdateInput, ParticipantsResult } from '@/contracts/participants';
import { displayName, employeeOf, employeeSecondLine, type Directory } from '@/domain/display';
import {
  canMarkStaff,
  KIND_NAMES,
  mergeParticipants,
  rosterOrder,
  sortParticipants,
  tableChoices,
} from '@/domain/participants';
import { RelationSelect } from './relation-select';
import { useAwaitedSave } from './use-awaited-save';

export type PersonDialogMode = 'create' | 'edit' | 'join';

export interface PersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PersonDialogMode;
  /** edit：要編輯的參與人員 */
  participantId?: number;
  /** join：從員工名單帶入的員工 */
  employeeId?: number;
  /** 儲存成功、畫面已用伺服器回應校正之後（例如員工名單取消這位員工的勾選，EMP-R23） */
  onSaved?: (participants: Participant[]) => void;
}

/** 對話框開著時才掛上表單，每次開啟都從目前的資料重新帶入 */
export function PersonDialog(props: PersonDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? <PersonForm {...props} /> : null}
    </Dialog>
  );
}

type FormState = {
  kind: ParticipantKind;
  employeeId: number | null;
  hostId: number | null;
  relation: string | null;
  guestName: string;
  organization: string;
  childSeat: boolean;
  vegetarian: boolean;
  note: string;
  isStaff: boolean;
  /** 1–30；null 是未入座 */
  tableId: number | null;
  withDependent: boolean;
  dependentRelation: string | null;
  dependentChildSeat: boolean;
  dependentVegetarian: boolean;
};

type FieldName = 'employeeId' | 'hostId' | 'guestName' | 'isStaff' | 'tableId';
type Errors = Partial<Record<FieldName, string>>;
const FIELD_ORDER: FieldName[] = ['employeeId', 'hostId', 'guestName', 'isStaff', 'tableId'];

const STAFF_HELP = '活動當天值勤，放在座位圖右上角的工作人員桌，不算入座統計。';
const STAFF_FULL = '工作人員桌已滿，請先移出一位。';
const NO_TABLE = 'none';

function initialForm(mode: PersonDialogMode, self: Participant | null, employeeId?: number): FormState {
  return {
    kind: self?.kind ?? 'EMPLOYEE',
    employeeId: self?.employeeId ?? (mode === 'join' ? (employeeId ?? null) : null),
    hostId: self?.hostId ?? null,
    relation: self?.relation ?? null,
    guestName: self?.guestName ?? '',
    organization: self?.organization ?? '',
    childSeat: self?.childSeat ?? false,
    vegetarian: self?.vegetarian ?? false,
    note: self?.note ?? '',
    isStaff: self?.tableId === STAFF_TABLE_ID,
    tableId: self?.tableId != null && self.tableId !== STAFF_TABLE_ID ? self.tableId : null,
    withDependent: false,
    dependentRelation: null,
    dependentChildSeat: false,
    dependentVegetarian: false,
  };
}

const employeeOptionLabel = (e: { name: string; department: string; extension: string | null }) =>
  `${e.name}（${employeeSecondLine(e)}）`;

function PersonForm({ onOpenChange, mode, participantId, employeeId, onSaved }: PersonDialogProps) {
  const data = useAppStore((s) => s.data);
  const dir = useAppStore((s) => s.dir);
  const save = useAwaitedSave();
  const uid = useId();
  const ids = {
    kind: `${uid}-kind`,
    employeeId: `${uid}-employee`,
    hostId: `${uid}-host`,
    relation: `${uid}-relation`,
    guestName: `${uid}-guest-name`,
    organization: `${uid}-organization`,
    isStaff: `${uid}-staff`,
    tableId: `${uid}-table`,
    dependentRelation: `${uid}-dependent-relation`,
  };

  const edit = mode === 'edit';
  // 編輯中的人在開啟時的樣子（類別變更、工作人員移桌的提示都以它為準）
  const [original] = useState<Participant | null>(() =>
    edit ? (data.participants.find((p) => p.id === participantId) ?? null) : null,
  );
  const self = edit ? (data.participants.find((p) => p.id === participantId) ?? null) : null;
  const [form, setForm] = useState<FormState>(() => initialForm(mode, original, employeeId));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  // 編輯的人已被別人刪除（重新載入後找不到）：關閉對話框
  useEffect(() => {
    if (edit && !self) onOpenChange(false);
  }, [edit, self, onOpenChange]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const clearError = (name: FieldName) => setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));

  const dependents = original ? data.participants.filter((p) => p.hostId === original.id) : [];
  const originalName = original ? displayName(original, dir) : '';
  // 編輯有眷屬的員工、或從員工名單開啟時，類別不能改（PPL-R58、PPL-R61）
  const kindLocked = mode === 'join' || (original?.kind === 'EMPLOYEE' && dependents.length > 0);
  // 編輯員工時員工欄位唯讀，姓名、部門與分機讀員工名單（PPL-R47）
  const readOnlyEmployee = edit && original?.kind === 'EMPLOYEE' && form.kind === 'EMPLOYEE';
  const employeeLocked = mode === 'join';
  const isEmployee = form.kind === 'EMPLOYEE';
  const seatable = !(isEmployee && form.isStaff);
  const staffAllowed = canMarkStaff(data.participants, self);

  // ---- 選項
  const registeredBy = new Map(
    data.participants.filter((p) => p.kind === 'EMPLOYEE' && p.employeeId != null).map((p) => [p.employeeId!, p.id]),
  );
  const isRegisteredElsewhere = (eid: number) => {
    const pid = registeredBy.get(eid);
    return pid !== undefined && pid !== self?.id;
  };
  const employeeOptions: SelectOption[] = rosterOrder(data.employees).map((e) => {
    const taken = isRegisteredElsewhere(e.id);
    return {
      value: String(e.id),
      label: `${employeeOptionLabel(e)}${taken ? '・已報名' : ''}`,
      disabled: taken,
      keywords: [e.englishName ?? '', e.team ?? ''],
    };
  });
  const hostTakenBy = (hostId: number) => data.participants.find((p) => p.hostId === hostId && p.id !== self?.id);
  const hostOptions: SelectOption[] = sortParticipants(data.participants, dir)
    .filter((p) => p.kind === 'EMPLOYEE' && p.id !== self?.id)
    .map((p) => {
      const e = employeeOf(p, dir);
      const taken = !!hostTakenBy(p.id);
      return {
        value: String(p.id),
        label: `${e ? employeeOptionLabel(e) : displayName(p, dir)}${taken ? '・已有眷屬' : ''}`,
        disabled: taken,
      };
    });
  const tableOptions: SelectOption[] = [
    { value: NO_TABLE, label: '未入座' },
    ...tableChoices(data.participants, self).map((c) => ({
      value: String(c.tableId),
      label: `第 ${c.tableId} 桌（剩 ${Math.max(0, c.remaining)} 位）${c.disabled ? '・已滿' : ''}`,
      disabled: c.disabled,
    })),
  ];
  const kindOptions: SelectOption[] = (['EMPLOYEE', 'DEPENDENT', 'GUEST'] as const).map((k) => ({ value: k, label: KIND_NAMES[k] }));

  const selectedEmployee = form.employeeId == null ? undefined : dir.employees.get(form.employeeId);
  const selectedHost = form.hostId == null ? undefined : dir.participants.get(form.hostId);
  const hostName = (hostId: number) => {
    const p = dir.participants.get(hostId);
    return p ? displayName(p, dir) : '';
  };

  // ---- 驗證（離開欄位時驗證，送出時顯示全部錯誤並聚焦第一個；docs/spec/README.md 第 9 節、PPL-R59）
  const guestNameError = (f: FormState) => (f.guestName.trim() ? undefined : '請輸入姓名。');
  function validate(f: FormState): Errors {
    const e: Errors = {};
    if (f.kind === 'EMPLOYEE' && !readOnlyEmployee) {
      if (f.employeeId == null) e.employeeId = '請選擇員工。';
      else if (isRegisteredElsewhere(f.employeeId)) e.employeeId = `${selectedEmployee?.name ?? ''} 已經報名了。`;
    }
    if (f.kind === 'DEPENDENT') {
      if (f.hostId == null) e.hostId = '請選擇所屬員工。';
      else if (hostTakenBy(f.hostId)) e.hostId = `${hostName(f.hostId)} 已經有一位眷屬，一位員工最多一位。`;
    }
    if (f.kind === 'GUEST') e.guestName = guestNameError(f);
    if (f.kind === 'EMPLOYEE' && f.isStaff && !staffAllowed) e.isStaff = STAFF_FULL;
    const seatOk = !(f.kind === 'EMPLOYEE' && f.isStaff);
    const choice = f.tableId == null ? undefined : tableChoices(data.participants, self).find((c) => c.tableId === f.tableId);
    if (seatOk && choice?.disabled) e.tableId = tableFullMessage(choice.tableId);
    return Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Errors;
  }

  const focusField = (name: FieldName) => document.getElementById(ids[name])?.focus();

  // ---- 送出
  function buildCreate(f: FormState): ParticipantCreateInput {
    const common = { childSeat: f.childSeat, vegetarian: f.vegetarian, note: f.note.trim() || null };
    if (f.kind === 'EMPLOYEE') {
      return {
        kind: 'EMPLOYEE',
        employeeId: f.employeeId!,
        ...common,
        isStaff: f.isStaff,
        tableId: f.isStaff ? null : f.tableId,
        dependent: f.withDependent
          ? { relation: f.dependentRelation, childSeat: f.dependentChildSeat, vegetarian: f.dependentVegetarian }
          : null,
      };
    }
    if (f.kind === 'DEPENDENT') return { kind: 'DEPENDENT', hostId: f.hostId!, relation: f.relation, ...common, tableId: f.tableId };
    return { kind: 'GUEST', guestName: f.guestName.trim(), organization: f.organization.trim() || null, ...common, tableId: f.tableId };
  }

  function buildUpdate(f: FormState, before: Participant): ParticipantUpdateInput {
    const body: ParticipantUpdateInput = { childSeat: f.childSeat, vegetarian: f.vegetarian, note: f.note.trim() || null };
    const kindChanged = f.kind !== before.kind;
    if (kindChanged) body.kind = f.kind;
    if (f.kind === 'EMPLOYEE') {
      if (kindChanged) body.employeeId = f.employeeId!;
      body.isStaff = f.isStaff;
      if (!f.isStaff) body.tableId = f.tableId;
    } else if (f.kind === 'DEPENDENT') {
      Object.assign(body, { hostId: f.hostId!, relation: f.relation, tableId: f.tableId });
    } else {
      Object.assign(body, { guestName: f.guestName.trim(), organization: f.organization.trim() || null, tableId: f.tableId });
    }
    return body;
  }

  /** 送出前就決定好的提示文字（伺服器回應只用來判斷眷屬有沒有坐到同一桌） */
  function messages(f: FormState) {
    const employeeName = selectedEmployee?.name ?? '';
    if (edit) {
      const fromTable = original?.tableId != null && original.tableId !== STAFF_TABLE_ID ? original.tableId : null;
      const toStaff = f.kind === 'EMPLOYEE' && f.isStaff && original?.tableId !== STAFF_TABLE_ID;
      return {
        // 改成工作人員時會從原本的桌次移到工作人員桌（PPL-R55）
        success: toStaff && fromTable != null ? `已儲存，${originalName} 已從第 ${fromTable} 桌移到工作人員桌。` : '已儲存',
      };
    }
    if (f.kind === 'EMPLOYEE') {
      return {
        success:
          mode === 'join'
            ? `已把 ${employeeName} 加入尾牙。`
            : f.withDependent
              ? `已新增 ${employeeName} 與 1 位眷屬。`
              : `已新增 ${employeeName}。`,
        dependentLeft: f.tableId != null ? `第 ${f.tableId} 桌只剩 1 位，${employeeName}_眷屬先留在未入座。` : '',
      };
    }
    if (f.kind === 'DEPENDENT') return { success: `已新增 ${f.hostId == null ? '' : hostName(f.hostId)}_眷屬。` };
    return { success: `已新增 ${f.guestName.trim()}。` };
  }

  /** 別人剛改過資料時，對話框欄位上的提示（也當作佇列重新載入後的 Sonner 提示，COM-R08） */
  function conflictText(code: ErrorCode, f: FormState): { field?: FieldName; text?: string } {
    switch (code) {
      case 'DUPLICATE_PARTICIPANT':
        return { field: 'employeeId', text: `${selectedEmployee?.name ?? ''} 已經報名了。` };
      case 'DEPENDENT_EXISTS':
        return f.kind === 'DEPENDENT' && f.hostId != null
          ? { field: 'hostId', text: `${hostName(f.hostId)} 已經有一位眷屬，一位員工最多一位。` }
          : {};
      case 'TABLE_FULL':
        return f.tableId == null ? {} : { field: 'tableId', text: tableFullMessage(f.tableId) };
      case 'STAFF_TABLE_FULL':
        return { field: 'isStaff', text: STAFF_FULL };
      default:
        return {};
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const f = form;
    const found = validate(f);
    setErrors(found);
    const first = FIELD_ORDER.find((n) => found[n]);
    if (first) {
      focusField(first);
      return;
    }
    if (edit && !original) return;

    const text = messages(f);
    const send = () =>
      edit
        ? apiFetch<ParticipantsResult>(`/api/participants/${original!.id}`, { method: 'PATCH', json: buildUpdate(f, original!) })
        : apiFetch<ParticipantsResult>('/api/participants', { method: 'POST', json: buildCreate(f) });

    setSubmitting(true);
    const outcome = await save<ParticipantsResult>({
      send,
      onSuccess: (result, s) => {
        s.update((d) => ({ ...d, participants: mergeParticipants(d.participants, result.participants) }));
        // 同時加眷屬並選了桌次，那一桌只剩 1 位時眷屬先留在未入座（PPL-R57）
        const dependent = result.participants.find((p) => p.kind === 'DEPENDENT');
        if (!edit && text.dependentLeft && dependent && dependent.tableId == null) notify(text.dependentLeft, { type: 'info' });
        notify(text.success);
        onSaved?.(result.participants);
      },
      conflictMessage: (code) => conflictText(code, f).text,
    });
    setSubmitting(false);

    if (outcome.status === 'saved' || outcome.status === 'paused') {
      // 暫停時這一次仍在佇列裡，按 Header 的「重試」成功後照樣儲存並顯示結果
      onOpenChange(false);
      return;
    }
    if (outcome.status === 'rejected') {
      if (outcome.code === 'NOT_FOUND' && edit) {
        onOpenChange(false);
        return;
      }
      const { field, text: message } = conflictText(outcome.code, f);
      const serverFields = Object.fromEntries(
        Object.entries(outcome.fields ?? {}).filter(([k]) => (FIELD_ORDER as string[]).includes(k)),
      ) as Errors;
      const next: Errors = { ...serverFields, ...(field && message ? { [field]: message } : {}) };
      setErrors(next);
      const firstServer = FIELD_ORDER.find((n) => next[n]);
      if (firstServer) focusField(firstServer);
    }
  }

  const changeKind = (value: string | null) => {
    if (!value || value === form.kind) return;
    setForm((f) => ({ ...f, kind: value as ParticipantKind }));
    setErrors({});
  };

  const title = edit ? '編輯人員' : '新增人員';
  const primaryLabel = mode === 'join' ? '加入尾牙' : edit ? '儲存' : '新增人員';

  return (
    <DialogContent title={title}>
      <form noValidate onSubmit={submit} className="contents">
        <DialogBody>
          <Select
            id={ids.kind}
            label="類別"
            required
            options={kindOptions}
            value={form.kind}
            onValueChange={changeKind}
            disabled={kindLocked}
          />
          {original?.kind === 'EMPLOYEE' && dependents.length > 0 ? (
            <Alert title={`${originalName} 有 ${dependents.length} 位眷屬，要變更類別請先處理眷屬。`} />
          ) : null}

          {isEmployee ? (
            <EmployeeFields
              ids={ids}
              form={form}
              errors={errors}
              set={set}
              clearError={clearError}
              readOnlyEmployee={readOnlyEmployee}
              employeeLocked={employeeLocked}
              employeeOptions={employeeOptions}
              readOnlyText={original && readOnlyEmployee ? readOnlyLabel(original, dir) : ''}
              selectedLine={selectedEmployee ? employeeSecondLine(selectedEmployee) : null}
              staffAllowed={staffAllowed}
              canAddDependent={!edit}
            />
          ) : null}

          {form.kind === 'DEPENDENT' ? (
            <>
              <div className="flex min-w-0 flex-col gap-2">
                <Select
                  id={ids.hostId}
                  label="所屬員工"
                  required
                  options={hostOptions}
                  value={form.hostId == null ? null : String(form.hostId)}
                  onValueChange={(v) => {
                    set('hostId', v == null ? null : Number(v));
                    clearError('hostId');
                  }}
                  placeholder="搜尋員工姓名"
                  searchable
                  searchPlaceholder="搜尋員工姓名"
                  error={errors.hostId}
                />
                {selectedHost ? (
                  <p className="type-xs-regular text-muted-foreground">{`將顯示為「${displayName(selectedHost, dir)}_眷屬」`}</p>
                ) : null}
              </div>
              <RelationSelect id={ids.relation} label="稱謂" value={form.relation} onValueChange={(v) => set('relation', v)} />
            </>
          ) : null}

          {form.kind === 'GUEST' ? (
            <>
              <Input
                id={ids.guestName}
                label="姓名"
                required
                autoComplete="off"
                value={form.guestName}
                maxLength={50}
                onChange={(e) => {
                  set('guestName', e.target.value);
                  if (errors.guestName && e.target.value.trim()) clearError('guestName');
                }}
                onBlur={() => setErrors((e) => ({ ...e, guestName: guestNameError(form) }))}
                error={errors.guestName}
              />
              <Input
                id={ids.organization}
                label="單位／頭銜"
                autoComplete="off"
                placeholder="例如 ○○科技 總經理"
                maxLength={100}
                value={form.organization}
                onChange={(e) => set('organization', e.target.value)}
              />
            </>
          ) : null}

          {!isEmployee ? (
            <>
              <Checkbox label="需要兒童椅" checked={form.childSeat} onCheckedChange={(v) => set('childSeat', v === true)} />
              <Checkbox label="素食" checked={form.vegetarian} onCheckedChange={(v) => set('vegetarian', v === true)} />
            </>
          ) : null}

          <Textarea
            label="備註"
            placeholder="只給承辦人看，例如需要靠走道"
            maxLength={500}
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
          />

          {seatable ? (
            <>
              <Separator />
              <Select
                id={ids.tableId}
                label="桌次"
                options={tableOptions}
                value={form.tableId == null ? NO_TABLE : String(form.tableId)}
                onValueChange={(v) => {
                  set('tableId', v == null || v === NO_TABLE ? null : Number(v));
                  clearError('tableId');
                }}
                description="也可以之後在座位圖拖移入座。"
                error={errors.tableId}
              />
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {primaryLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** 編輯員工時的唯讀員工欄位：「{姓名}（{部門}・分機 {分機}）」 */
function readOnlyLabel(p: Participant, dir: Directory): string {
  const e = employeeOf(p, dir);
  return e ? employeeOptionLabel(e) : displayName(p, dir);
}

interface EmployeeFieldsProps {
  ids: Record<'employeeId' | 'isStaff' | 'dependentRelation', string>;
  form: FormState;
  errors: Errors;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  clearError: (name: FieldName) => void;
  readOnlyEmployee: boolean;
  employeeLocked: boolean;
  employeeOptions: SelectOption[];
  readOnlyText: string;
  /** 選好員工後下方的「{部門}・分機 {分機}」（PPL-R44） */
  selectedLine: string | null;
  staffAllowed: boolean;
  /** 新增與加入尾牙時才有「同時加一位眷屬」（PPL-R46） */
  canAddDependent: boolean;
}

function EmployeeFields({
  ids,
  form,
  errors,
  set,
  clearError,
  readOnlyEmployee,
  employeeLocked,
  employeeOptions,
  readOnlyText,
  selectedLine,
  staffAllowed,
  canAddDependent,
}: EmployeeFieldsProps) {
  return (
    <>
      {readOnlyEmployee ? (
        <Input
          id={ids.employeeId}
          label="員工"
          value={readOnlyText}
          disabled
          readOnly
          description="姓名、部門與分機請到員工名單修改。"
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <Select
            id={ids.employeeId}
            label="員工"
            required
            options={employeeOptions}
            value={form.employeeId == null ? null : String(form.employeeId)}
            onValueChange={(v) => {
              set('employeeId', v == null ? null : Number(v));
              clearError('employeeId');
            }}
            placeholder="搜尋姓名、分機或部門"
            searchable
            searchPlaceholder="搜尋姓名、分機或部門"
            disabled={employeeLocked}
            description="找不到？請先到員工名單新增。"
            error={errors.employeeId}
          />
          {selectedLine ? <p className="type-xs-regular text-muted-foreground">{selectedLine}</p> : null}
        </div>
      )}
      <Checkbox label="需要兒童椅" checked={form.childSeat} onCheckedChange={(v) => set('childSeat', v === true)} />
      <Checkbox label="素食" checked={form.vegetarian} onCheckedChange={(v) => set('vegetarian', v === true)} />
      <Checkbox
        id={ids.isStaff}
        label="工作人員"
        checked={form.isStaff}
        // 工作人員桌已滿時還不是工作人員的員工不能勾；已勾的可以取消（PPL-R54）
        disabled={!staffAllowed && !form.isStaff}
        onCheckedChange={(v) => {
          set('isStaff', v === true);
          clearError('isStaff');
        }}
        description={
          <>
            <span className="block">{STAFF_HELP}</span>
            {staffAllowed ? null : <span className="block">{STAFF_FULL}</span>}
          </>
        }
      />
      {canAddDependent ? (
        <>
          <Checkbox
            label="同時加一位眷屬"
            checked={form.withDependent}
            onCheckedChange={(v) => set('withDependent', v === true)}
          />
          {form.withDependent ? (
            <>
              <RelationSelect
                id={ids.dependentRelation}
                label="眷屬稱謂"
                value={form.dependentRelation}
                onValueChange={(v) => set('dependentRelation', v)}
              />
              <Checkbox
                label="眷屬需要兒童椅"
                checked={form.dependentChildSeat}
                onCheckedChange={(v) => set('dependentChildSeat', v === true)}
              />
              <Checkbox
                label="眷屬素食"
                checked={form.dependentVegetarian}
                onCheckedChange={(v) => set('dependentVegetarian', v === true)}
              />
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
