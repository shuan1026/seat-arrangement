// 初始編輯者與編輯者判斷：docs/spec/permissions.md PRM-R02（伺服器啟動時，編輯者名單是空的就把 INITIAL_EDITOR_EMAILS 的 email 寫進名單；
// 寫入後和在權限頁新增的完全相同，可以被移除；名單不是空的時不讀這個變數；不是公司網域或格式不對的略過；名單是空的、變數也沒有設定時沒有人能修改資料）、
// PRM-R03、PRM-AC01～AC03；docs/architecture.md 第 7.3 節（bootstrap 由 src/instrumentation.ts 在 seed 之後呼叫，不看 SEED_IMPORT；
// 依 domain/editors.ts 正規化，只收網域等於 ALLOWED_EMAIL_DOMAIN 的；createMany skipDuplicates，多個執行個體同時啟動不會重複；
// 表不是空的就跳過；表是空的又沒有有效 email 時記 WARNING）、第 9.3 節（isEditor 把 email 轉小寫後查 Editor，每次都查資料庫）。
//
// 假設的介面（src/server/services/editors.ts）：
//   export function isEditor(email: string): Promise<boolean>;
//   export function bootstrapEditors(env?: NodeJS.ProcessEnv): Promise<unknown>;   // 讀 env.INITIAL_EDITOR_EMAILS 與 env.ALLOWED_EMAIL_DOMAIN
// 回傳值不檢查，只看資料庫的結果。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE } from '@/app/api/editors/[id]/route';
import { bootstrapEditors, isEditor } from '@/server/services/editors';
import { prisma, resetData } from '../../helpers/db';
import { BING, editorEmails, editorIdOf, JIA, setEditors, YI, type TestUser } from '../../helpers/editors';

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<() => Promise<TestUser | null>>() }));
vi.mock('@/server/auth', () => ({ currentUser }));

/** 目前的環境變數，換掉 INITIAL_EDITOR_EMAILS（undefined 表示沒有設定）；公司網域固定 program.com.tw */
function envWith(initial: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ALLOWED_EMAIL_DOMAIN: 'program.com.tw' };
  delete env.INITIAL_EDITOR_EMAILS;
  if (initial !== undefined) env.INITIAL_EDITOR_EMAILS = initial;
  return env;
}

beforeEach(async () => {
  await resetData();
  currentUser.mockReset();
  // 啟動時的情境從空的名單開始
  await prisma.editor.deleteMany({});
});

describe('bootstrapEditors（PRM-R02）', () => {
  it('PRM-AC01：名單是空的，變數是「 Jia@program.com.tw ,yi@program.com.tw,x@gmail.com,abc」→ 名單有甲、乙，沒有另外兩個；甲是編輯者', async () => {
    await bootstrapEditors(envWith(' Jia@program.com.tw ,yi@program.com.tw,x@gmail.com,abc'));
    expect((await editorEmails()).sort()).toEqual([JIA.email, YI.email].sort());
    expect(await prisma.editor.count()).toBe(2);
    expect(await isEditor('Jia@program.com.tw')).toBe(true);
    expect(await isEditor('x@gmail.com')).toBe(false);
  });

  it('寫入的編輯者沒有新增者（createdBy 是 null）', async () => {
    await bootstrapEditors(envWith('jia@program.com.tw'));
    expect((await prisma.editor.findUnique({ where: { email: JIA.email } }))?.createdBy).toBeNull();
  });

  it('PRM-AC02：名單已有甲 → 變數改成丙再啟動 → 名單仍只有甲，丙只能檢視', async () => {
    await setEditors([JIA.email]);
    await bootstrapEditors(envWith(BING.email));
    expect(await editorEmails()).toEqual([JIA.email]);
    expect(await isEditor(BING.email)).toBe(false);
  });

  it('名單不是空的時不讀變數：變數裡的人被移除後再啟動也不會加回來', async () => {
    await bootstrapEditors(envWith(`${JIA.email},${YI.email}`));
    await prisma.editor.deleteMany({ where: { email: JIA.email } });
    await bootstrapEditors(envWith(`${JIA.email},${YI.email}`));
    expect(await editorEmails()).toEqual([YI.email]);
  });

  it('PRM-AC03：名單是空的、變數沒有設定 → 沒有人是編輯者；設定變數後重新部署 → 甲是編輯者', async () => {
    await bootstrapEditors(envWith(undefined));
    expect(await prisma.editor.count()).toBe(0);
    expect(await isEditor(JIA.email)).toBe(false);

    await bootstrapEditors(envWith(JIA.email));
    expect(await isEditor(JIA.email)).toBe(true);
  });

  it.each(['', 'x@gmail.com,abc', ' , '])('名單是空的、變數「%s」沒有有效的 email → 名單維持空的，不丟錯（只記 WARNING）', async (value) => {
    await bootstrapEditors(envWith(value));
    expect(await prisma.editor.count()).toBe(0);
  });

  it('同一個人寫兩次（大小寫不同）只寫入一筆', async () => {
    await bootstrapEditors(envWith('jia@program.com.tw, JIA@Program.com.tw'));
    expect(await editorEmails()).toEqual([JIA.email]);
  });

  it('多個執行個體同時啟動：不會重複寫入、也不會失敗', async () => {
    const env = envWith(`${JIA.email},${YI.email}`);
    await Promise.all([bootstrapEditors(env), bootstrapEditors(env), bootstrapEditors(env)]);
    expect((await editorEmails()).sort()).toEqual([JIA.email, YI.email].sort());
  });

  it('寫入後和在權限頁新增的編輯者完全相同，可以被移除（甲移除乙）', async () => {
    await bootstrapEditors(envWith(`${JIA.email},${YI.email}`));
    currentUser.mockResolvedValue(JIA);
    const id = await editorIdOf(YI.email);
    const res = await DELETE(new Request(`http://localhost:3000/api/editors/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.ok).toBe(true);
    expect(await editorEmails()).toEqual([JIA.email]);
  });
});

describe('isEditor（PRM-R03、AUTH-R11）', () => {
  beforeEach(async () => {
    await setEditors([JIA.email]);
  });

  it.each(['jia@program.com.tw', 'Jia@Program.com.tw', ' JIA@PROGRAM.COM.TW '])('「%s」是編輯者', async (email) => {
    expect(await isEditor(email)).toBe(true);
  });

  it.each(['yi@program.com.tw', '', 'jia@program.com.tw.example.com', 'jia'])('「%s」不是編輯者', async (email) => {
    expect(await isEditor(email)).toBe(false);
  });

  it('每次都查資料庫：移除後立刻不是編輯者，加回後立刻又是', async () => {
    expect(await isEditor(JIA.email)).toBe(true);
    await prisma.editor.deleteMany({ where: { email: JIA.email } });
    expect(await isEditor(JIA.email)).toBe(false);
    await prisma.editor.create({ data: { email: JIA.email } });
    expect(await isEditor(JIA.email)).toBe(true);
  });
});
