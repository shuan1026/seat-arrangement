'use client';
// UI 基礎元件展示頁：列出 src/components/ui 每個元件的變體與狀態，給開發與截圖檢查用。正式環境回 404。
import { useState, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import {
  ArrowRightLeft,
  Baby,
  ChevronRight,
  Download,
  Eraser,
  Eye,
  Leaf,
  LogOut,
  Maximize,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  Upload,
  UserPlus,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input, SearchInput, Textarea } from '@/components/ui/input';
import { Checkbox, type CheckedState } from '@/components/ui/checkbox';
import { Badge, MarkBadge } from '@/components/ui/badge';
import {
  ActionMenu,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  UserMenuContent,
} from '@/components/ui/dropdown-menu';
import { Select, type SelectOption } from '@/components/ui/select';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert } from '@/components/ui/alert';
import { Toaster, notify } from '@/components/ui/toaster';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton, SkeletonCard, SkeletonLine, SkeletonPanel } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableShell } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';

export default function UiGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Gallery />;
}

function Section({ id, title, source, children }: { id: string; title: string; source: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4" data-section={id}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="type-lg-semi-bold text-foreground">
          {title}
        </h2>
        <p className="type-xs-regular text-muted-foreground">{source}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-4 edge-card md:p-6">{children}</div>
    </section>
  );
}

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="type-xs-medium text-muted-foreground">{label}</span>
      <div className={className ?? 'flex min-w-0 flex-wrap items-center gap-3'}>{children}</div>
    </div>
  );
}

const BUTTON_VARIANTS = [
  'primary',
  'outline',
  'ghost',
  'link',
  'destructive-primary',
  'destructive-outline',
  'destructive-ghost',
] as const;

const TABLE_OPTIONS: SelectOption[] = [
  { value: 'none', label: '未入座' },
  { value: '2', label: 'A1 桌', description: '剩 2 位・業務部' },
  { value: '22', label: 'A2 桌', description: '剩 0 位', disabled: true, disabledReason: '已滿' },
  { value: '17', label: 'A3 桌', description: '剩 5 位' },
  { value: '27', label: 'A4 桌（貴賓桌）', description: '剩 1 位・備註：董事長與來賓' },
  { value: '23', label: 'A5 桌', description: '剩 0 位', disabled: true, disabledReason: '已滿' },
  { value: '18', label: 'A6 桌', description: '剩 10 位' },
];

const EMPLOYEE_OPTIONS: SelectOption[] = [
  { value: 'e1', label: '王小明', description: '人資部・分機 1234', keywords: ['1234'] },
  { value: 'e2', label: '陳怡君', description: '業務部・分機 812', keywords: ['812'] },
  { value: 'e3', label: '林志豪', description: '研發部・分機 915', keywords: ['915'], disabled: true, disabledReason: '已報名' },
  { value: 'e4', label: '張雅婷', description: '財務部', keywords: [] },
  { value: 'e5', label: '黃冠宇', description: '研發部・分機 1234／1235', keywords: ['1234', '1235'] },
  { value: 'e6', label: '李佩珊', description: '行政部・分機 701', keywords: ['701'] },
  { value: 'e7', label: '吳承恩', description: '業務部・分機 813', keywords: ['813'] },
  { value: 'e8', label: '周芷若', description: '人資部・分機 808', keywords: ['808'] },
];

const CATEGORY_OPTIONS: SelectOption[] = [
  { value: 'all', label: '全部類別' },
  { value: 'staff', label: '員工' },
  { value: 'family', label: '眷屬' },
  { value: 'guest', label: '外部貴賓' },
];

interface PersonRow {
  id: string;
  name: string;
  meta: string;
  ext: string;
  table: number | null;
  child?: boolean;
  veg?: boolean;
  guest?: boolean;
}

const PEOPLE: PersonRow[] = [
  { id: 'p1', name: '王小明', meta: '人資部', ext: '1234', table: 3 },
  { id: 'p2', name: '王小明_眷屬', meta: '人資部', ext: '—', table: 3, child: true },
  { id: 'p3', name: '陳怡君', meta: '業務部', ext: '812', table: null, veg: true },
  { id: 'p4', name: 'Alexander Montgomery-Wellington', meta: '外部貴賓・長名稱測試股份有限公司', ext: '—', table: 4, guest: true },
  { id: 'p5', name: '黃冠宇', meta: '研發部', ext: '1234／1235', table: null },
];

function Gallery() {
  const [checks, setChecks] = useState<Record<string, boolean>>({ p1: true, p2: false, p3: true, p4: false, p5: false });
  const allState: CheckedState = Object.values(checks).every(Boolean)
    ? true
    : Object.values(checks).some(Boolean)
      ? 'indeterminate'
      : false;
  const [tableValue, setTableValue] = useState<string | null>('3');
  const [employee, setEmployee] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>('all');
  const [page, setPage] = useState(1);
  const [asyncOpen, setAsyncOpen] = useState(false);
  const [asyncLoading, setAsyncLoading] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <TooltipProvider>
      <main className="mx-auto flex w-full max-w-[1080px] min-w-0 flex-col gap-10 px-4 py-8 md:px-8">
        <header className="flex flex-col gap-2">
          <h1 className="type-2xl-bold text-foreground">UI 元件展示</h1>
          <p className="type-sm-regular text-muted-foreground">
            src/components/ui 的所有變體與狀態。規格依 ui-design-system 的 03-components.md；只在開發環境開放。
          </p>
        </header>

        <Section id="button" title="Button" source="03-components.md ## Button">
          {(['md', 'sm'] as const).map((size) => (
            <Row key={size} label={`size ${size}`}>
              {BUTTON_VARIANTS.map((v) => (
                <Button key={v} variant={v} size={size}>
                  {v}
                </Button>
              ))}
            </Row>
          ))}
          <Row label="前置與後置圖示">
            <Button variant="primary" leadingIcon={<UserPlus />}>
              新增人員
            </Button>
            <Button variant="outline" leadingIcon={<Upload />}>
              匯入員工名單
            </Button>
            <Button variant="outline" leadingIcon={<Download />}>
              匯出座位表
            </Button>
            <Button variant="ghost" trailingIcon={<ChevronRight />}>
              查看全部
            </Button>
            <Button variant="destructive-outline" leadingIcon={<Eraser />}>
              清空桌次
            </Button>
            <Button variant="link">清除篩選</Button>
          </Row>
          <Row label="loading（spinner 取代前置圖示、保留文字、aria-busy、不能點）">
            <Button variant="primary" loading leadingIcon={<UserPlus />}>
              新增人員
            </Button>
            <Button variant="primary" loading>
              加入尾牙
            </Button>
            <Button variant="outline" loading trailingIcon={<ChevronRight />}>
              下一步
            </Button>
            <Button variant="destructive-primary" loading leadingIcon={<Trash2 />}>
              刪除人員
            </Button>
            <Button variant="outline" size="sm" loading leadingIcon={<Download />}>
              匯出座位表
            </Button>
          </Row>
          <Row label="disabled">
            {BUTTON_VARIANTS.map((v) => (
              <Button key={v} variant={v} disabled leadingIcon={v === 'link' ? undefined : <Plus />}>
                {v}
              </Button>
            ))}
          </Row>
          <Row label="asChild（連結）">
            <Button asChild variant="primary" leadingIcon={<Users />}>
              <a href="#table">回到座位安排</a>
            </Button>
            <Button asChild variant="outline" disabled>
              <a href="#table">停用的連結</a>
            </Button>
            <Button asChild variant="link">
              <a href="#table">前往表格範例</a>
            </Button>
          </Row>
          <Row label="手機滿版（主要流程）" className="flex flex-col gap-3 md:flex-row">
            <Button variant="primary" className="w-full md:w-auto">
              確認入座
            </Button>
            <Button variant="outline" className="w-full md:w-auto">
              取消
            </Button>
          </Row>
        </Section>

        <Section id="icon-button" title="Icon Button" source="03-components.md ## Icon Button">
          {(['ghost', 'outline'] as const).map((variant) => (
            <Row key={variant} label={`variant ${variant}：md 36／sm 32／xs 28／2xs 20`}>
              {(['md', 'sm', 'xs', '2xs'] as const).map((size) => (
                <IconButton key={size} variant={variant} size={size} label={`放大（${size}）`}>
                  <ZoomIn />
                </IconButton>
              ))}
              <IconButton variant={variant} label="停用" disabled>
                <ZoomIn />
              </IconButton>
              <IconButton variant={variant} label="開啟中" aria-expanded>
                <Pencil />
              </IconButton>
            </Row>
          ))}
          <Row label="tooltip（座位圖工具）">
            <IconButton variant="outline" label="縮小" tooltip>
              <ZoomOut />
            </IconButton>
            <IconButton variant="outline" label="放大" tooltip>
              <ZoomIn />
            </IconButton>
            <IconButton variant="outline" label="適合視窗" tooltip tooltipSide="bottom">
              <Maximize />
            </IconButton>
            <IconButton variant="outline" label="放大" tooltip="已放到最大" disabled>
              <ZoomIn />
            </IconButton>
          </Row>
        </Section>

        <Section id="input" title="Input／Textarea／SearchInput" source="03-components.md ## Input（vertical）；docs/spec/README.md 第 11.3 節">
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            <Input label="姓名" placeholder="例如：王小明" required />
            <Input label="分機" defaultValue="1234" description="多個分機用「／」分隔。" />
            <Input label="email" defaultValue="wang@program" error="格式不正確，請輸入公司 email。" required />
            <Input label="部門" defaultValue="人資部" disabled description="部門請到員工名單修改。" />
            <Input
              label="很長的值不會撐開欄位"
              defaultValue="a-very-long-serial-number-0123456789-abcdefghijklmnopqrstuvwxyz@program.com.tw"
            />
            <Input label="size sm" size="sm" placeholder="32px 高" />
            <Textarea label="備註" placeholder="例如：需要靠近出口" description="最多 100 字。" />
            <Textarea label="備註（錯誤）" defaultValue="這段備註超過字數上限" error="備註最多 100 字。" />
          </div>
          <Row label="SearchInput（sm，預設）" className="grid min-w-0 gap-3 md:grid-cols-3">
            <SearchInput label="搜尋姓名、分機或部門" placeholder="搜尋姓名、分機或部門" />
            <SearchInput label="搜尋（md）" size="md" placeholder="md 36px" />
            <SearchInput label="搜尋（停用）" placeholder="停用" disabled />
          </Row>
        </Section>

        <Section id="checkbox" title="Checkbox" source="03-components.md ## Checkbox">
          <Row label="值與狀態">
            <Checkbox aria-label="未勾選" />
            <Checkbox aria-label="已勾選" defaultChecked />
            <Checkbox aria-label="部分勾選" checked="indeterminate" />
            <Checkbox aria-label="停用未勾選" disabled />
            <Checkbox aria-label="停用已勾選" disabled defaultChecked />
            <Checkbox aria-label="停用部分勾選" disabled checked="indeterminate" />
          </Row>
          <Row label="含文字與說明" className="flex min-w-0 flex-col gap-3">
            <Checkbox label="需要兒童椅" />
            <Checkbox label="同時加一位眷屬" description="眷屬會和員工排在同一桌。" defaultChecked />
            <Checkbox label="工作人員（工作人員桌已滿）" disabled />
          </Row>
          <Row label="全選（indeterminate）" className="flex min-w-0 flex-col gap-3">
            <Checkbox
              label="全選"
              checked={allState}
              onCheckedChange={(v) => setChecks(Object.fromEntries(Object.keys(checks).map((k) => [k, v === true])))}
            />
            <div className="flex flex-col gap-2 pl-6">
              {PEOPLE.map((p) => (
                <Checkbox
                  key={p.id}
                  label={p.name}
                  checked={checks[p.id] ?? false}
                  onCheckedChange={(v) => setChecks((c) => ({ ...c, [p.id]: v === true }))}
                />
              ))}
            </div>
          </Row>
        </Section>

        <Section id="badge" title="Badge" source="03-components.md ## Badge；docs/spec/README.md 第 11.1 節">
          <Row label="狀態（rounded，含文字）">
            <Badge variant="positive">已滿</Badge>
            <Badge variant="positive">已報名</Badge>
            <Badge variant="pending">未入座</Badge>
            <Badge variant="pending">未報名</Badge>
            <Badge variant="neutral">空桌</Badge>
            <Badge variant="neutral">工作人員</Badge>
          </Row>
          <Row label="不代表狀態的標示">
            <Badge variant="outline">貴賓</Badge>
            <Badge variant="outline" asChild>
              <button type="button" aria-label="在座位圖標示 B4 桌" onClick={() => notify('已標示 B4 桌。', { type: 'info' })}>
                B4
              </button>
            </Badge>
            <Badge variant="outline" asChild>
              <a href="#table">B3</a>
            </Badge>
            <Badge variant="outline" asChild>
              <button type="button" disabled>
                停用的篩選
              </button>
            </Badge>
            <MarkBadge icon={<Baby />} label="兒童椅" />
            <MarkBadge icon={<Leaf />} label="素食" />
          </Row>
          <Row label="其他變體">
            <Badge variant="default">本期</Badge>
            <Badge variant="third">標籤</Badge>
            <Badge variant="destructive">逾期</Badge>
            <Badge variant="positive" rounded={false}>
              rounded=false
            </Badge>
            <Badge variant="pending" icon={null}>
              不帶圖示
            </Badge>
            <span className="inline-flex max-w-40 min-w-0">
              <Badge variant="outline">很長的徽章文字會在徽章內截斷</Badge>
            </span>
          </Row>
          <Row label="已套用的篩選">
            <Badge variant="outline" asChild>
              <button type="button">類別：外部貴賓 ×</button>
            </Badge>
            <Badge variant="outline" asChild>
              <button type="button">只看未入座 ×</button>
            </Badge>
            <Button variant="link">清除篩選</Button>
          </Row>
        </Section>

        <Section id="dropdown" title="Dropdown Menu（action-menu、user-menu）" source="03-components.md ## Dropdown Menu；Sidebar User Footer Menu">
          <Row label="列操作選單（不顯示勾選，危險項目、分隔線、停用項目）">
            <ActionMenu>
              <DropdownMenuItem icon={<Eye />}>查看詳情</DropdownMenuItem>
              <DropdownMenuItem icon={<Pencil />}>編輯</DropdownMenuItem>
              <DropdownMenuItem icon={<ArrowRightLeft />}>調換桌次</DropdownMenuItem>
              <DropdownMenuItem icon={<UserPlus />} disabled>
                加入人員（已滿）
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => notify('已刪除王小明。', { action: { label: '復原', onClick: () => notify('已復原。') } })}>
                刪除人員
              </DropdownMenuItem>
            </ActionMenu>
            <ActionMenu triggerVariant="outline" triggerSize="md" label="更多操作（outline）">
              <DropdownMenuItem icon={<Eraser />} destructive>
                清空桌次
              </DropdownMenuItem>
            </ActionMenu>
            <ActionMenu disabled label="更多操作（停用）">
              <DropdownMenuItem>不會出現</DropdownMenuItem>
            </ActionMenu>
          </Row>
          <Row label="使用者選單（profile 列 + 項目，列高 36px）">
            <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen} modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-demo="user-trigger"
                  className="flex h-[52px] w-56 max-w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-hover focus-visible:focus-ring aria-expanded:bg-hover"
                >
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-primary type-sm-medium text-primary-foreground">
                    王
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate type-sm-semi-bold">王小明</span>
                    <span className="truncate type-xs-regular text-muted-foreground">wang.xm@example.com</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <UserMenuContent name="王小明" meta="wang.xiaoming.long.email@program.com.tw" side="top" align="start">
                <DropdownMenuItem icon={<LogOut />} onSelect={() => notify('已登出。')}>
                  登出
                </DropdownMenuItem>
              </UserMenuContent>
            </DropdownMenu>
          </Row>
        </Section>

        <Section id="select" title="Select（Dropdown Menu select）" source="03-components.md ## Dropdown Menu ### Select Menu">
          <div className="grid min-w-0 gap-5 md:grid-cols-2">
            <Select
              label="桌次"
              options={TABLE_OPTIONS}
              value={tableValue}
              onValueChange={setTableValue}
              description="已滿的桌次不能選。"
            />
            <Select
              label="員工"
              required
              searchable
              clearable
              searchPlaceholder="搜尋姓名、分機或部門"
              placeholder="搜尋姓名、分機或部門"
              options={EMPLOYEE_OPTIONS}
              value={employee}
              onValueChange={setEmployee}
              description="找不到？請先到員工名單新增。"
            />
            <Select label="類別（錯誤）" options={CATEGORY_OPTIONS} error="請選擇類別。" />
            <Select label="類別（停用）" options={CATEGORY_OPTIONS} defaultValue="staff" disabled description="有眷屬時不能變更類別。" />
            <Select label="可清除" options={CATEGORY_OPTIONS} defaultValue="guest" clearable />
            <Select label="size sm" size="sm" options={CATEGORY_OPTIONS} defaultValue="family" />
          </div>
          <Row label="工具列篩選（沒有可見 label，用 aria-label）" className="flex min-w-0 flex-wrap items-center gap-3">
            <SearchInput label="搜尋參與人員" placeholder="搜尋姓名或分機" className="min-w-0 flex-[1_1_260px]" />
            <Select aria-label="類別" size="sm" options={CATEGORY_OPTIONS} value={category} onValueChange={setCategory} className="flex-[0_1_164px] max-md:flex-[1_1_100%]" />
            <Select aria-label="桌次" size="sm" options={TABLE_OPTIONS} placeholder="全部桌次" clearable className="flex-[0_1_164px] max-md:flex-[1_1_100%]" />
          </Row>
        </Section>

        <Section id="dialog" title="Dialog" source="03-components.md ## Dialog">
          <Row label="表單對話框（Esc、關閉鈕、點遮罩關閉；手機按鈕滿版、主要按鈕在上）">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="primary" leadingIcon={<UserPlus />} data-demo="open-dialog">
                  新增人員
                </Button>
              </DialogTrigger>
              <DialogContent title="新增人員" description="填寫參與人員的資料，新增後會放在未入座。">
                <form
                  className="contents"
                  onSubmit={(e) => {
                    e.preventDefault();
                    notify('已新增王小明。');
                  }}
                >
                  <DialogBody>
                    <Input label="姓名" required placeholder="例如：王小明" />
                    <Select label="類別" required options={CATEGORY_OPTIONS.slice(1)} />
                    <Select label="桌次" options={TABLE_OPTIONS} defaultValue="none" />
                    <Textarea label="備註" placeholder="例如：需要靠近出口" />
                    <Checkbox label="需要兒童椅" />
                  </DialogBody>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">取消</Button>
                    </DialogClose>
                    <Button variant="primary" type="submit">
                      新增人員
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">B4 桌（wide）</Button>
              </DialogTrigger>
              <DialogContent size="wide" title="B4 桌" description="8/10 人">
                <DialogBody>
                  <Alert title="這桌還有 2 個空位。" />
                  {PEOPLE.map((p) => (
                    <div key={p.id} className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0 truncate type-sm-medium">{p.name}</span>
                      <span className="shrink-0 type-xs-regular text-muted-foreground">{p.meta}</span>
                    </div>
                  ))}
                </DialogBody>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">關閉</Button>
                  </DialogClose>
                  <Button variant="destructive-outline" leadingIcon={<Eraser />}>
                    清空桌次
                  </Button>
                  <Button variant="primary" leadingIcon={<UserPlus />}>
                    加入人員
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Row>
        </Section>

        <Section id="alert-dialog" title="Alert Dialog" source="03-components.md ## Alert Dialog">
          <Row label="桌面取消在左、確認在右；手機確認在上">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive-outline" leadingIcon={<Trash2 />} data-demo="open-alert">
                  刪除人員
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent
                title="要刪除 王小明 嗎？"
                description="刪除後無法復原；已安排的座位會空出來。"
                confirmLabel="刪除人員"
                destructive
                onConfirm={() => notify('已刪除王小明。')}
              />
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">一次加入多位</Button>
              </AlertDialogTrigger>
              <AlertDialogContent
                title="要一次加入 3 位嗎？"
                description="以下人員會加入 B4 桌："
                confirmLabel="加入 3 位"
                onConfirm={() => notify('已加入 3 位。')}
              >
                <ul className="list-disc pl-5 text-left">
                  <li>王小明</li>
                  <li>陳怡君</li>
                  <li>黃冠宇</li>
                </ul>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={asyncOpen} onOpenChange={setAsyncOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive-outline" leadingIcon={<Eraser />}>
                  清空桌次（等待完成）
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent
                title="要清空 B4 桌嗎？"
                description="桌上 8 位會移到未入座。"
                confirmLabel="清空桌次"
                destructive
                confirmLoading={asyncLoading}
                onConfirm={(e) => {
                  e.preventDefault();
                  setAsyncLoading(true);
                  setTimeout(() => {
                    setAsyncLoading(false);
                    setAsyncOpen(false);
                    notify('已清空 B4 桌。', { action: { label: '復原', onClick: () => notify('已復原。') } });
                  }, 1200);
                }}
              />
            </AlertDialog>
          </Row>
        </Section>

        <Section id="alert" title="Alert" source="03-components.md ## Alert">
          <Alert title="已經有一位 王小明（人資部），請確認不是同一個人。" icon={<TriangleAlert />} />
          <Alert title="這個帳號不能登入。" role="alert" icon={<TriangleAlert />}>
            只能使用公司的 Google 帳號（@program.com.tw），請換一個帳號再試一次。
          </Alert>
          <Alert title="匯入前請確認" items={['第一列是欄位名稱。', '員工與眷屬的所屬員工請填員工名單上的姓名。', '檔案大小不超過 5 MB。']} />
          <Alert
            title="匯入結果"
            sections={[
              { subtitle: '已新增 12 位', items: ['王小明', '陳怡君'] },
              { subtitle: '有 2 列沒有匯入', items: ['第 5 列：找不到員工「林志玲」。', '第 9 列：類別只能是員工、眷屬或外部貴賓。'] },
            ]}
            actions={
              <Button variant="outline" size="sm" leadingIcon={<Download />}>
                下載錯誤清單
              </Button>
            }
          />
        </Section>

        <Section id="toast" title="Sonner／Toast" source="03-components.md ## Sonner / Toast">
          <Row label="notify(text, { type, action })">
            <Button variant="outline" data-demo="toast-success" onClick={() => notify('已儲存')}>
              success
            </Button>
            <Button variant="outline" data-demo="toast-warning" onClick={() => notify('B4 桌已滿，請先移出一位。', { type: 'warning' })}>
              warning
            </Button>
            <Button
              variant="outline"
              data-demo="toast-destructive"
              onClick={() => notify('匯出座位表失敗，請確認網路連線後再試一次。', { type: 'destructive' })}
            >
              destructive
            </Button>
            <Button variant="outline" data-demo="toast-info" onClick={() => notify('B7 桌只剩 1 位，眷屬先留在未入座。', { type: 'info' })}>
              info
            </Button>
            <Button
              variant="outline"
              data-demo="toast-action"
              onClick={() => notify('已把王小明移到 B4 桌。', { action: { label: '復原', onClick: () => notify('已復原。') } })}
            >
              含「復原」
            </Button>
          </Row>
        </Section>

        <Section id="tooltip" title="Tooltip" source="03-components.md ## Tooltip">
          <Row label="side">
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
              <Tooltip key={side} side={side} content={`提示在 ${side}`}>
                <Button variant="outline" size="sm" data-demo={`tooltip-${side}`}>
                  {side}
                </Button>
              </Tooltip>
            ))}
            <Tooltip content="備註名稱：董事長與來賓、業務部、研發部、人資部（長文字會在 240px 內換行）">
              <Button variant="outline" size="sm">
                長文字
              </Button>
            </Tooltip>
          </Row>
        </Section>

        <Section id="tabs" title="Tabs（default／pill）" source="03-components.md ## Tabs ### Default / Pill Variant">
          <Tabs defaultValue="unseated">
            <TabsList aria-label="人員">
              <TabsTrigger value="unseated" count={11}>
                未入座
              </TabsTrigger>
              <TabsTrigger value="all" count={128}>
                全部
              </TabsTrigger>
              <TabsTrigger value="off" disabled>
                停用
              </TabsTrigger>
            </TabsList>
            <TabsContent value="unseated" className="pt-3 type-sm-regular text-muted-foreground">
              未入座的 11 位。
            </TabsContent>
            <TabsContent value="all" className="pt-3 type-sm-regular text-muted-foreground">
              全部 128 位。
            </TabsContent>
          </Tabs>
          <Tabs defaultValue="map">
            <TabsList stretch aria-label="手機檢視">
              <TabsTrigger value="map">座位圖</TabsTrigger>
              <TabsTrigger value="people">人員</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs defaultValue="all">
            <TabsList aria-label="員工名單">
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="no">未報名</TabsTrigger>
              <TabsTrigger value="yes">已報名</TabsTrigger>
            </TabsList>
          </Tabs>
        </Section>

        <Section id="table" title="Table + Pagination" source="04-patterns-and-ux.md Data Management Pattern；03-components.md ## Pagination、## Scrollbar">
          <Row label="橫向捲動（minWidth 760px；捲軸兩端內縮 16px；選單用 portal 不被裁切）" className="flex min-w-0 flex-col gap-3">
            <PeopleTable checks={checks} onCheck={(id, v) => setChecks((c) => ({ ...c, [id]: v }))} allState={allState} onAll={(v) => setChecks(Object.fromEntries(Object.keys(checks).map((k) => [k, v])))} />
            <Pagination page={page} pageSize={10} total={99} onPageChange={setPage} />
          </Row>
          <Row label="stackOnMobile（手機改成卡片）" className="flex min-w-0 flex-col gap-3">
            <PeopleTable stack checks={checks} onCheck={(id, v) => setChecks((c) => ({ ...c, [id]: v }))} allState={allState} onAll={(v) => setChecks(Object.fromEntries(Object.keys(checks).map((k) => [k, v])))} />
          </Row>
          <Row label="Pagination 位置：start／middle／end／只有一頁" className="flex min-w-0 flex-col gap-4">
            <Pagination page={1} pageSize={20} total={240} onPageChange={() => {}} />
            <Pagination page={6} pageSize={20} total={240} onPageChange={() => {}} />
            <Pagination page={12} pageSize={20} total={240} onPageChange={() => {}} />
            <Pagination page={1} pageSize={20} total={8} onPageChange={() => {}} />
          </Row>
        </Section>

        <Section id="empty" title="Empty State" source="docs/spec/README.md 第 9 節；04-patterns-and-ux.md Feedback States">
          <EmptyState
            icon={<Users />}
            title="還沒有參與人員。"
            description="新增人員或匯入名單後，就能開始安排座位。"
            action={
              <>
                <Button variant="outline" leadingIcon={<Upload />}>
                  匯入參與人員
                </Button>
                <Button variant="primary" leadingIcon={<UserPlus />}>
                  新增人員
                </Button>
              </>
            }
          />
          <TableShell>
            <EmptyState variant="plain" icon={<Search />} title="找不到符合的人員。" description="換個關鍵字，或清除篩選再試一次。" action={<Button variant="outline">清除篩選</Button>} />
          </TableShell>
          <EmptyState variant="inline" title="沒有可以加入的人員。" />
        </Section>

        <Section id="skeleton" title="Skeleton" source="03-components.md ## Skeleton">
          <div className="grid min-w-0 gap-6 md:grid-cols-3">
            <SkeletonLine />
            <SkeletonCard />
            <div className="flex flex-col gap-2">
              <Skeleton className="w-3/4" />
              <Skeleton className="w-1/2" />
            </div>
          </div>
          <SkeletonPanel lines={5} />
        </Section>

        <Section id="separator" title="Separator／Spinner" source="03-components.md ## Separator；## Button States loading">
          <Row label="horizontal" className="flex min-w-0 flex-col gap-3">
            <span className="type-sm-regular">基本資料</span>
            <Separator />
            <span className="type-sm-regular">座位</span>
          </Row>
          <Row label="vertical">
            <div className="flex h-6 items-center gap-3 type-sm-regular">
              <span>已入座 112／128</span>
              <Separator orientation="vertical" />
              <span>未入座 16</span>
              <Separator orientation="vertical" />
              <span>空位 8</span>
            </div>
          </Row>
          <Row label="Spinner 12／16／20／24">
            <Spinner size={12} />
            <Spinner size={16} />
            <Spinner size={20} />
            <Spinner size={24} label="載入中" />
          </Row>
        </Section>
      </main>
      <Toaster />
    </TooltipProvider>
  );
}

function PeopleTable({
  stack = false,
  checks,
  onCheck,
  allState,
  onAll,
}: {
  stack?: boolean;
  checks: Record<string, boolean>;
  onCheck: (id: string, v: boolean) => void;
  allState: CheckedState;
  onAll: (v: boolean) => void;
}) {
  return (
    <Table label={stack ? '參與人員（卡片）' : '參與人員'} minWidth={760} stackOnMobile={stack}>
      <TableHeader>
        <TableRow>
          <TableHead kind="check">
            <Checkbox aria-label="全選" checked={allState} onCheckedChange={(v) => onAll(v === true)} />
          </TableHead>
          <TableHead>姓名</TableHead>
          <TableHead>部門</TableHead>
          <TableHead numeric>分機</TableHead>
          <TableHead>桌次</TableHead>
          <TableHead kind="actions">
            <span className="sr-only">操作</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {PEOPLE.map((p) => (
          <TableRow key={p.id}>
            <TableCell kind="check">
              <Checkbox aria-label={`選取 ${p.name}`} checked={checks[p.id] ?? false} onCheckedChange={(v) => onCheck(p.id, v === true)} />
            </TableCell>
            <TableCell kind="primary" label="姓名">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate type-sm-medium">{p.name}</span>
                {p.guest ? <Badge variant="outline">貴賓</Badge> : null}
                {p.child ? <MarkBadge icon={<Baby />} label="兒童椅" /> : null}
                {p.veg ? <MarkBadge icon={<Leaf />} label="素食" /> : null}
              </span>
            </TableCell>
            <TableCell label="部門" className="max-w-[220px]">
              <span className="block truncate max-md:whitespace-normal">{p.meta}</span>
            </TableCell>
            <TableCell numeric label="分機">
              {p.ext}
            </TableCell>
            <TableCell label="桌次">
              {p.table ? (
                <Badge variant="outline" asChild>
                  <button type="button" aria-label={`在座位圖標示第 ${p.table} 桌`}>
                    第 {p.table} 桌
                  </button>
                </Badge>
              ) : (
                <Badge variant="pending">未入座</Badge>
              )}
            </TableCell>
            <TableCell kind="actions">
              <ActionMenu>
                <DropdownMenuItem icon={<Pencil />}>編輯</DropdownMenuItem>
                <DropdownMenuItem icon={<ArrowRightLeft />}>調換桌次</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<Trash2 />} destructive>
                  刪除人員
                </DropdownMenuItem>
              </ActionMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
