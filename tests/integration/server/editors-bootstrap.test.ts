// 初始編輯者與身分判斷（D-021、D-026）：docs/spec/permissions.md PRM-R02（伺服器啟動時，權限名單是空的就把 INITIAL_EDITOR_EMAILS 的 email
// 以編輯者寫進名單；寫入後和在權限頁新增的編輯者完全相同，可以改權限或移除；名單不是空的時不讀這個變數；不是公司網域或格式不對的略過；
// 名單是空的、變數也沒有設定時沒有人能修改資料，也沒有人能看三頁；檢視者沒有對應的環境變數）、PRM-R03、PRM-AC01～AC03；
// docs/architecture.md 第 7.3 節（bootstrap 在 server/services/members.ts，由 src/instrumentation.ts 在 seed 之後呼叫；Member 表是空的時以
// EDITOR 寫入，表裡只要有任何一列（包括只有檢視者）就跳過；createMany skipDuplicates，多個執行個體同時啟動不會重複；
// 表是空的又沒有有效 email 時記 WARNING）、第 9.3 節（getRole 把 email 轉小寫後查 Member，回傳 EDITOR、VIEWER 或 null，每次都查資料庫）、
// 第 15.2 節（Log 事件 editors_bootstrapped、editors_bootstrap_skipped，不記 email）。
//
// 假設的介面（src/server/services/members.ts）：
//   export function getRole(email: string): Promise<'EDITOR' | 'VIEWER' | null>;
//   export function bootstrapEditors(env?: NodeJS.ProcessEnv): Promise<unknown>;   // 讀 env.INITIAL_EDITOR_EMAILS 與 env.ALLOWED_EMAIL_DOMAIN
// 回傳值不檢查，只看資料庫與 Log 的結果。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PATCH } from '@/app/api/members/[id]/route';
import { GET as getState } from '@/app/api/state/route';
import { bootstrapEditors, getRole } from '@/server/services/members';
import { prisma, resetData } from '../../helpers/db';
import { BING, JIA, memberIdOf, memberList, setMembers, YI, type TestUser } from '../../helpers/editors';

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<TestUser | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

/** 目前的環境變數，換掉 INITIAL_EDITOR_EMAILS（undefined 表示沒有設定）；公司網域固定 program.com.tw */
function envWith(initial: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ALLOWED_EMAIL_DOMAIN: 'program.com.tw' };
  delete env.INITIAL_EDITOR_EMAILS;
  if (initial !== undefined) env.INITIAL_EDITOR_EMAILS = initial;
  return env;
}

/** 這個帳號開座位安排時讀資料的結果（(main)/layout.tsx 與 GET /api/state 用同一個 getRole 判斷） */
async function stateCodeAs(user: TestUser): Promise<string | number> {
  currentUser.mockResolvedValue(user);
  const res = await getState(new Request('http://localhost:3000/api/state'), { params: Promise.resolve({}) });
  if (res.ok) return res.status;
  return ((await res.json()) as { error: { code: string } }).error.code;
}

const cleanups: (() => void)[] = [];

/** 打開 Log 輸出（整合測試預設 LOG_SILENT=1）並收集每一行 */
function captureLogs() {
  const saved = process.env.LOG_SILENT;
  delete process.env.LOG_SILENT;
  const raw: string[] = [];
  const collect = (...args: unknown[]) => {
    raw.push(args.map(String).join(' '));
  };
  const spies = [
    vi.spyOn(console, 'info').mockImplementation(collect),
    vi.spyOn(console, 'error').mockImplementation(collect),
    vi.spyOn(console, 'warn').mockImplementation(collect),
    vi.spyOn(console, 'log').mockImplementation(collect),
  ];
  cleanups.push(() => {
    for (const s of spies) s.mockRestore();
    if (saved === undefined) delete process.env.LOG_SILENT;
    else process.env.LOG_SILENT = saved;
  });
  return {
    raw,
    events: () =>
      raw.flatMap((line) => {
        try {
          return [JSON.parse(line) as Record<string, unknown>];
        } catch {
          return [];
        }
      }),
  };
}

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
  // 啟動時的情境從空的名單開始
  await prisma.member.deleteMany({});
});

afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

describe('bootstrapEditors（PRM-R02）', () => {
  it('PRM-AC01：名單是空的，變數是「 Jia@program.com.tw ,yi@program.com.tw,x@gmail.com,abc」→ 名單有甲、乙，權限都是編輯者，沒有另外兩個；甲登入是編輯者', async () => {
    await bootstrapEditors(envWith(' Jia@program.com.tw ,yi@program.com.tw,x@gmail.com,abc'));
    const members = await memberList();
    expect(members.map((m) => m.email).sort()).toEqual([JIA.email, YI.email].sort());
    expect(members.every((m) => m.role === 'EDITOR')).toBe(true);
    expect(await prisma.member.count()).toBe(2);
    expect(await getRole('Jia@program.com.tw')).toBe('EDITOR');
    expect(await getRole('x@gmail.com')).toBeNull();
  });

  it('寫入的編輯者沒有新增者（createdBy 是 null）', async () => {
    await bootstrapEditors(envWith('jia@program.com.tw'));
    const row = await prisma.member.findUnique({ where: { email: JIA.email } });
    expect(row?.createdBy).toBeNull();
    expect(row?.role).toBe('EDITOR');
  });

  it('PRM-AC02：名單已有甲（編輯者）與乙（檢視者）→ 變數改成丙再啟動 → 名單仍是甲（編輯者）與乙（檢視者）；丙沒有權限，開座位安排拿不到資料（NO_ACCESS）', async () => {
    await setMembers([
      { email: JIA.email, role: 'EDITOR' },
      { email: YI.email, role: 'VIEWER' },
    ]);
    await bootstrapEditors(envWith(BING.email));
    expect(await memberList()).toEqual([
      { email: JIA.email, role: 'EDITOR' },
      { email: YI.email, role: 'VIEWER' },
    ]);
    expect(await getRole(BING.email)).toBeNull();
    expect(await stateCodeAs(BING)).toBe('NO_ACCESS');
  });

  it('名單上只有檢視者（沒有編輯者）也算不是空的：跳過，不把變數裡的人加成編輯者（docs/architecture.md 第 7.3 節）', async () => {
    await setMembers([{ email: YI.email, role: 'VIEWER' }]);
    await bootstrapEditors(envWith(JIA.email));
    expect(await memberList()).toEqual([{ email: YI.email, role: 'VIEWER' }]);
    expect(await getRole(JIA.email)).toBeNull();
  });

  it('名單不是空的時不讀變數：變數裡的人被移除後再啟動也不會加回來；被改為檢視者後再啟動也不會改回編輯者', async () => {
    await bootstrapEditors(envWith(`${JIA.email},${YI.email}`));
    await prisma.member.deleteMany({ where: { email: JIA.email } });
    await prisma.member.update({ where: { email: YI.email }, data: { role: 'VIEWER' } });
    await bootstrapEditors(envWith(`${JIA.email},${YI.email}`));
    expect(await memberList()).toEqual([{ email: YI.email, role: 'VIEWER' }]);
  });

  it('PRM-AC03：名單是空的、變數沒有設定 → 沒有人有權限，甲開座位安排拿不到資料（NO_ACCESS）；設定變數後重新部署 → 甲是編輯者', async () => {
    await bootstrapEditors(envWith(undefined));
    expect(await prisma.member.count()).toBe(0);
    expect(await getRole(JIA.email)).toBeNull();
    expect(await stateCodeAs(JIA)).toBe('NO_ACCESS');

    await bootstrapEditors(envWith(JIA.email));
    expect(await getRole(JIA.email)).toBe('EDITOR');
    expect(await stateCodeAs(JIA)).toBe(200);
  });

  it.each(['', 'x@gmail.com,abc', ' , '])('名單是空的、變數「%s」沒有有效的 email → 名單維持空的，不丟錯', async (value) => {
    await bootstrapEditors(envWith(value));
    expect(await prisma.member.count()).toBe(0);
  });

  it('同一個人寫兩次（大小寫不同）只寫入一筆', async () => {
    await bootstrapEditors(envWith('jia@program.com.tw, JIA@Program.com.tw'));
    expect(await memberList()).toEqual([{ email: JIA.email, role: 'EDITOR' }]);
  });

  it('多個執行個體同時啟動：不會重複寫入、也不會失敗', async () => {
    const env = envWith(`${JIA.email},${YI.email}`);
    await Promise.all([bootstrapEditors(env), bootstrapEditors(env), bootstrapEditors(env)]);
    const members = await memberList();
    expect(members.map((m) => m.email).sort()).toEqual([JIA.email, YI.email].sort());
    expect(members.every((m) => m.role === 'EDITOR')).toBe(true);
  });

  it('寫入後和在權限頁新增的編輯者完全相同：可以改為檢視者，也可以移除（甲操作乙）', async () => {
    await bootstrapEditors(envWith(`${JIA.email},${YI.email}`));
    currentUser.mockResolvedValue(JIA);
    const id = await memberIdOf(YI.email);
    const patched = await PATCH(
      new Request(`http://localhost:3000/api/members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'VIEWER' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(patched.status).toBe(200);
    expect(await getRole(YI.email)).toBe('VIEWER');

    const removed = await DELETE(new Request(`http://localhost:3000/api/members/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(removed.status).toBe(200);
    expect(await memberList()).toEqual([{ email: JIA.email, role: 'EDITOR' }]);
  });
});

describe('bootstrapEditors 的 Log（docs/architecture.md 第 15.2 節：事件名稱不變，不記 email）', () => {
  it('寫入：editors_bootstrapped，記寫入幾位', async () => {
    const logs = captureLogs();
    await bootstrapEditors(envWith(`${JIA.email},${YI.email}`));
    const written = logs.events().filter((e) => e.eventType === 'editors_bootstrapped');
    expect(written).toHaveLength(1);
    expect(written[0]?.count).toBe(2);
    for (const line of logs.raw) expect(line).not.toContain('@program.com.tw');
  });

  it('名單不是空的（只有檢視者）：editors_bootstrap_skipped', async () => {
    await setMembers([{ email: YI.email, role: 'VIEWER' }]);
    const logs = captureLogs();
    await bootstrapEditors(envWith(JIA.email));
    expect(logs.events().filter((e) => e.eventType === 'editors_bootstrap_skipped')).toHaveLength(1);
    expect(logs.events().filter((e) => e.eventType === 'editors_bootstrapped')).toEqual([]);
    for (const line of logs.raw) expect(line).not.toContain('@program.com.tw');
  });

  it('名單是空的、變數沒有有效的 email：editors_bootstrap_skipped，等級是 WARNING（這時沒有人能編輯）', async () => {
    const logs = captureLogs();
    await bootstrapEditors(envWith('x@gmail.com,abc'));
    const skipped = logs.events().filter((e) => e.eventType === 'editors_bootstrap_skipped');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.severity).toBe('WARNING');
    for (const line of logs.raw) expect(line).not.toMatch(/@gmail\.com|@program\.com\.tw/);
  });
});

describe('getRole（PRM-R03、AUTH-R11）', () => {
  beforeEach(async () => {
    await setMembers([
      { email: JIA.email, role: 'EDITOR' },
      { email: YI.email, role: 'VIEWER' },
    ]);
  });

  it.each(['jia@program.com.tw', 'Jia@Program.com.tw', ' JIA@PROGRAM.COM.TW '])('「%s」是編輯者', async (email) => {
    expect(await getRole(email)).toBe('EDITOR');
  });

  it.each(['yi@program.com.tw', 'YI@program.com.tw ', '  yi@Program.COM.tw'])('「%s」是檢視者', async (email) => {
    expect(await getRole(email)).toBe('VIEWER');
  });

  it.each(['bing@program.com.tw', '', '   ', 'jia@program.com.tw.example.com', 'jia'])('「%s」不在名單上（null）', async (email) => {
    expect(await getRole(email)).toBeNull();
  });

  it('每次都查資料庫：改權限、移除、加回後立刻反映', async () => {
    expect(await getRole(JIA.email)).toBe('EDITOR');
    await prisma.member.update({ where: { email: JIA.email }, data: { role: 'VIEWER' } });
    expect(await getRole(JIA.email)).toBe('VIEWER');
    await prisma.member.deleteMany({ where: { email: JIA.email } });
    expect(await getRole(JIA.email)).toBeNull();
    await prisma.member.create({ data: { email: JIA.email, role: 'EDITOR' } });
    expect(await getRole(JIA.email)).toBe('EDITOR');
  });
});
