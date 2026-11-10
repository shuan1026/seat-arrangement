'use client';

// 新增、編輯員工對話框（docs/spec/employees.md 2.5、3.6 節、4.2 節；原型 ui.js UI.employeeDialog）。
// 單欄表單：姓名、英文名、部門、組別、分機、地區、備註；沒有辦公室（EMP-Q06 第 4 點）。
// 欄位錯誤：離開欄位時驗證，送出時顯示全部錯誤並聚焦第一個（docs/spec/README.md 第 9 節）；不用 Sonner。
// 同名提示：行內 Alert，不阻擋儲存（EMP-R37）。
import { TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useAppStore } from '@/client/app-provider';
import type { Employee } from '@/contracts/entities';
import { departmentOptions, findSameNameEmployee, regionOptions, teamOptions } from '@/domain/employees';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { CreatableSelect, type CreatableSelectHandle } from './creatable-select';
import type { EmployeeFormValues } from './use-employee-actions';

export type EmployeeDialogTarget = { mode: 'create' } | { mode: 'edit'; employee: Employee };

type Draft = {
  name: string;
  englishName: string;
  department: string | null;
  team: string | null;
  extension: string;
  region: string | null;
  note: string;
};

type Errors = { name?: string; department?: string };

const NAME_REQUIRED = '請輸入姓名。';
const DEPARTMENT_REQUIRED = '請選擇部門。';

const draftOf = (e?: Employee): Draft => ({
  name: e?.name ?? '',
  englishName: e?.englishName ?? '',
  department: e?.department ?? null,
  team: e?.team ?? null,
  extension: e?.extension ?? '',
  region: e?.region ?? null,
  note: e?.note ?? '',
});

/** 去掉前後空白，只有空白的欄位視為沒填（EMP-Q08 第 8 點） */
const clean = (v: string | null): string | null => (v ?? '').trim() || null;

const withCurrent = (list: string[], current: string | null) =>
  current && !list.includes(current) ? [...list, current] : list;

export interface EmployeeDialogProps {
  target: EmployeeDialogTarget | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (target: EmployeeDialogTarget, values: EmployeeFormValues) => void;
}

/** 對話框外殼：每次開啟都換一份新的表單狀態 */
export function EmployeeDialog({ target, onOpenChange, onSubmit }: EmployeeDialogProps) {
  return (
    <Dialog open={target != null} onOpenChange={onOpenChange}>
      {target ? (
        <EmployeeForm
          key={target.mode === 'edit' ? `edit-${target.employee.id}` : 'create'}
          target={target}
          onCancel={() => onOpenChange(false)}
          onSubmit={(values) => {
            onSubmit(target, values);
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function EmployeeForm({
  target,
  onCancel,
  onSubmit,
}: {
  target: EmployeeDialogTarget;
  onCancel: () => void;
  onSubmit: (values: EmployeeFormValues) => void;
}) {
  const editing = target.mode === 'edit' ? target.employee : undefined;
  const employees = useAppStore((s) => s.data.employees);
  const [draft, setDraft] = useState<Draft>(() => draftOf(editing));
  const [errors, setErrors] = useState<Errors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const departmentRef = useRef<CreatableSelectHandle>(null);

  const departments = useMemo(() => departmentOptions(employees), [employees]);
  // 組別選項只列目前部門既有的組別；編輯時這位員工自己的組別也列出（原型 UI.employeeDialog）
  const teams = useMemo(
    () =>
      withCurrent(
        draft.department ? teamOptions(employees, draft.department) : [],
        editing && draft.department === editing.department ? editing.team : null,
      ),
    [employees, draft.department, editing],
  );
  const regions = useMemo(() => withCurrent(regionOptions(employees), editing?.region ?? null), [employees, editing]);
  const sameName = findSameNameEmployee(employees, draft.name, editing?.id);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const validateName = (name = draft.name) => (name.trim() ? undefined : NAME_REQUIRED);
  const validateDepartment = (department = draft.department) => (department ? undefined : DEPARTMENT_REQUIRED);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = { name: validateName(), department: validateDepartment() };
    setErrors(next);
    if (next.name) {
      nameRef.current?.focus();
      return;
    }
    if (next.department) {
      departmentRef.current?.focus();
      return;
    }
    onSubmit({
      name: draft.name.trim(),
      englishName: clean(draft.englishName),
      department: draft.department!.trim(),
      team: clean(draft.team),
      extension: clean(draft.extension),
      region: clean(draft.region),
      note: clean(draft.note),
    });
  };

  const title = editing ? '編輯員工' : '新增員工';
  return (
    <DialogContent title={title}>
      <form className="contents" noValidate onSubmit={submit}>
        <DialogBody>
          <div className="flex min-w-0 flex-col gap-2">
            <Input
              ref={nameRef}
              label="姓名"
              required
              autoComplete="off"
              value={draft.name}
              error={errors.name}
              onChange={(e) => {
                set('name', e.target.value);
                if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
              }}
              onBlur={(e) => setErrors((x) => ({ ...x, name: validateName(e.target.value) }))}
            />
            {sameName ? (
              <Alert
                icon={<TriangleAlert />}
                title={`已經有一位 ${sameName.name}（${sameName.department}），請確認不是同一個人。`}
              />
            ) : null}
          </div>
          <Input
            label="英文名"
            placeholder="例如 Tony"
            autoComplete="off"
            value={draft.englishName}
            onChange={(e) => set('englishName', e.target.value)}
          />
          <CreatableSelect
            ref={departmentRef}
            label="部門"
            required
            options={departments}
            value={draft.department}
            placeholder="選擇部門"
            searchPlaceholder="搜尋或輸入部門"
            createLabel={(q) => `新增部門「${q}」`}
            description="選擇既有部門，或輸入新的部門名稱"
            error={errors.department}
            onValueChange={(department) => {
              // 換部門後組別選項跟著換，已選的組別清掉（EMP-R35）
              setDraft((d) => ({ ...d, department, team: department === d.department ? d.team : null }));
              setErrors((x) => ({ ...x, department: validateDepartment(department) }));
            }}
            onBlur={() => setErrors((x) => ({ ...x, department: validateDepartment() }))}
          />
          <CreatableSelect
            label="組別"
            options={teams}
            value={draft.team}
            placeholder="選擇或輸入組別"
            searchPlaceholder="選擇或輸入組別"
            createLabel={(q) => `新增組別「${q}」`}
            onValueChange={(team) => set('team', team)}
          />
          <Input
            label="分機"
            placeholder="例如 1234"
            autoComplete="off"
            value={draft.extension}
            onChange={(e) => set('extension', e.target.value)}
          />
          <CreatableSelect
            label="地區"
            options={regions}
            value={draft.region}
            placeholder="選擇或輸入地區"
            searchPlaceholder="選擇或輸入地區"
            createLabel={(q) => `新增地區「${q}」`}
            onValueChange={(region) => set('region', region)}
          />
          <Textarea
            label="備註"
            placeholder="只給承辦人看"
            value={draft.note}
            onChange={(e) => set('note', e.target.value)}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button type="submit" variant="primary">
            {editing ? '儲存' : '新增員工'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
