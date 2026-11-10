// POST /api/participants/import：上傳 Google 表單尾牙報名表的原始 CSV（multipart，欄位名稱 file），回 ImportResult。
// 依據：D-010；docs/spec/participants.md 第 3.6 節（PPL-R64～R74、PPL-R79～R85）、第 4.4 節（錯誤清單的原因）、
// 第 5.7 節（PPL-AC62～AC70、PPL-AC78～AC83）；待確認 PPL-Q01、Q06、Q20、Q22～Q26 依目前假設（D-008）；
// src/contracts/imports.ts（ImportResult）、src/server/csv.ts（上傳與編碼）。報名表都是虛構資料。
// 員工名單上標記為不參加的員工（D-014）：填「是」照一般新增、標記清掉；填「否」的人不會因匯入被標記（PPL-R72、EMP-R64）。
//
// ImportResult 的對應（假設）：
//   imported = 這次新增或更新的報名員工人數（「已匯入 {n} 位」，眷屬不另外計算）= created + updated
//   created  = 新報名的員工人數；updated = 已報名而依表單更新的員工人數
//   errors   = 需要處理的人（「{m} 筆需要處理」）：row 是原檔的列號（表頭是第 1 列），reason 是第 4.4 節的文案，
//              values 給「下載錯誤清單」用，要有名字與部門、不含電子郵件與時間戳記（PPL-Q06）
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/participants/import/route';
import { importResultSchema } from '@/contracts/imports';
import { prisma, resetData } from '../../helpers/db';
import { createDependent, createEmployee, createGuest, createRegisteredEmployee } from '../../helpers/factory';
import { demoRoster, errorOf, okJson, seatAt, snapshot } from '../../helpers/participants-fixtures';
import {
  answer,
  fakeEmail,
  fakeTimestamp,
  FORM_COLUMNS,
  FULL_WIDTH_HEADERS,
  ISSUE_REASON,
  registrationCsv,
  registrationRows,
  ROSTER_CSV,
  toCsvText,
  type RegistrationAnswer,
} from '../../helpers/participants-registration-csv';

vi.mock('@/server/auth', () => ({
  currentUser: async () => ({ id: 'u1', name: '測試', email: 't@program.com.tw' }),
}));

/** 上傳 CSV 文字（加上 BOM，模擬 Google 表單匯出的 UTF-8 檔案，PPL-Q01）；content 是 null 時不附檔案 */
function upload(content: string | null, filename = 'registrations.csv') {
  const form = new FormData();
  if (content !== null) form.append('file', new File([`﻿${content}`], filename, { type: 'text/csv' }));
  return POST(new Request('http://localhost:3000/api/participants/import', { method: 'POST', body: form }), {
    params: Promise.resolve({}),
  });
}

const sheet = (...answers: RegistrationAnswer[]) => registrationCsv(answers, { headers: FULL_WIDTH_HEADERS });
const importOk = async (content: string) => okJson(await upload(content), importResultSchema);

const findP = (id: number) => prisma.participant.findUnique({ where: { id } });
const registrationOf = (employeeId: number) => prisma.participant.findUnique({ where: { employeeId } });

beforeEach(async () => {
  await resetData();
});

describe('檔案檢查（PPL-R65、PPL-R68）', () => {
  it('沒選檔案：400 VALIDATION_FAILED，檔案欄位「請選擇要匯入的檔案。」；沒有匯入任何人（PPL-AC62）', async () => {
    await demoRoster();
    const before = await snapshot();
    expect(await errorOf(await upload(null))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      fields: { file: '請選擇要匯入的檔案。' },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('不是 CSV 檔：400，沒有匯入任何人（PPL-R65）', async () => {
    await demoRoster();
    const before = await snapshot();
    const error = await errorOf(await upload(sheet(answer('陳大文／研發一部／是')), 'registrations.xlsx'));
    expect(error.status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });

  it('上傳員工名單的通訊錄：400 IMPORT_FORMAT_INVALID，參與人員沒有任何改變（PPL-R68、PPL-AC63）', async () => {
    await demoRoster();
    const before = await snapshot();
    expect(await errorOf(await upload(ROSTER_CSV))).toMatchObject({ status: 400, code: 'IMPORT_FORMAT_INVALID' });
    expect(await snapshot()).toEqual(before);
  });

  it('少了「是否攜帶眷屬 ？」欄的報名表：400 IMPORT_FORMAT_INVALID，有效的列也不匯入（PPL-R68、PPL-AC63）', async () => {
    await demoRoster();
    const before = await snapshot();
    const content = registrationCsv([answer('陳大文／研發一部／是')], {
      columns: FORM_COLUMNS.filter((c) => c !== 'dependent'),
    });
    expect(await errorOf(await upload(content))).toMatchObject({ status: 400, code: 'IMPORT_FORMAT_INVALID' });
    expect(await snapshot()).toEqual(before);
  });
});

describe('新增報名的員工（PPL-R70～R74）', () => {
  it('欄位順序不同也照表頭讀；新增的員工不素食、未入座、不是工作人員；不存電子郵件與填寫時間（PPL-R66、PPL-R67、PPL-R72、PPL-AC64）', async () => {
    const { chen } = await demoRoster();
    const content = registrationCsv([answer('陳大文／研發一部／是／否／否／葷食')], {
      columns: [...FORM_COLUMNS].reverse(),
    });

    const result = await importOk(content);

    expect(result).toMatchObject({ imported: 1, created: 1, updated: 0, errors: [] });
    expect(await registrationOf(chen.id)).toMatchObject({
      kind: 'EMPLOYEE',
      vegetarian: false,
      childSeat: false,
      note: null,
      tableId: null,
      seatOrder: null,
    });
    expect(await prisma.participant.count({ where: { kind: 'DEPENDENT' } })).toBe(0);
    const stored = JSON.stringify(await snapshot());
    expect(stored).not.toContain(fakeEmail(1));
    expect(stored).not.toContain(fakeTimestamp(1));
    expect(JSON.stringify(result)).not.toContain(fakeEmail(1));
  });

  it('攜帶眷屬：員工素食與備註；眷屬需要兒童椅、素食、沒有稱謂、未入座；眷屬不另外計算（PPL-R72、PPL-R73、PPL-R74、PPL-AC65）', async () => {
    const { chen } = await demoRoster();

    const result = await importOk(sheet(answer('陳大文／研發一部／是／是／是／素食／蛋奶素／需要靠走道')));

    expect(result).toMatchObject({ imported: 1, created: 1, errors: [] });
    const host = await registrationOf(chen.id);
    expect(host).toMatchObject({ vegetarian: true, childSeat: false, note: '需要靠走道', tableId: null });
    expect(await prisma.participant.findUnique({ where: { hostId: host?.id ?? -1 } })).toMatchObject({
      kind: 'DEPENDENT',
      relation: null,
      childSeat: true,
      vegetarian: true,
      tableId: null,
      note: null,
    });
  });

  it('同一人填了兩次，以最後一列為準：最後改成不攜帶眷屬，就只新增員工（PPL-R69、PPL-AC66）', async () => {
    const lee = await createEmployee({ name: '李美華', department: '業務部', extension: '5678' });
    const result = await importOk(sheet(answer('李美華／業務部／是／是'), answer('李美華／業務部／是／否')));
    expect(result).toMatchObject({ imported: 1, errors: [] });
    expect(await registrationOf(lee.id)).not.toBeNull();
    expect(await prisma.participant.count({ where: { kind: 'DEPENDENT' } })).toBe(0);
  });

  it('最後一次改成不參加、還沒報名：不新增，也不算需要處理（PPL-R69、PPL-R70、PPL-AC67）', async () => {
    const { chen } = await demoRoster();
    const result = await importOk(sheet(answer('陳大文／研發一部／是'), answer('陳大文／研發一部／否')));
    expect(result).toMatchObject({ imported: 0, errors: [] });
    expect(await registrationOf(chen.id)).toBeNull();
  });

  it('員工名單上找不到：不新增；需要處理，原因「員工名單上找不到 趙六。」，錯誤清單有名字與部門、沒有電子郵件（PPL-R71、PPL-R74、PPL-R85、PPL-AC68、PPL-Q06）', async () => {
    await demoRoster();
    const before = await snapshot();

    const result = await importOk(sheet(answer('趙六／行政部／是')));

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    const [error] = result.errors;
    expect(error).toMatchObject({ row: 2, reason: ISSUE_REASON.notFound('趙六') });
    expect(error?.values).toEqual(expect.arrayContaining(['趙六', '行政部']));
    const listed = JSON.stringify({ header: result.header, errors: result.errors });
    for (const secret of [fakeEmail(1), fakeTimestamp(1), '電子郵件地址', '時間戳記']) {
      expect(listed).not.toContain(secret);
    }
    expect(await snapshot()).toEqual(before);
  });

  it('同名時用部門判斷；部門也判斷不出時需要處理（PPL-R71、PPL-AC69）', async () => {
    await demoRoster();
    const bizWang = await createEmployee({ name: '王小明', department: '業務部', extension: '9999' });

    const first = await importOk(sheet(answer('王小明／業務部／是')));
    expect(first).toMatchObject({ imported: 1, created: 1, errors: [] });
    expect(await registrationOf(bizWang.id)).not.toBeNull();

    const before = await snapshot();
    const second = await importOk(sheet(answer('王小明／行政部／是')));
    expect(second.imported).toBe(0);
    expect(second.errors).toEqual([
      expect.objectContaining({ row: 2, reason: ISSUE_REASON.ambiguous('王小明') }),
    ]);
    expect(await snapshot()).toEqual(before);
  });

  it('名字後面有全形空白也對應到員工（PPL-R71、PPL-AC70）', async () => {
    const { chen } = await demoRoster();
    const result = await importOk(sheet(answer('陳大文　／研發一部／是')));
    expect(result).toMatchObject({ imported: 1, errors: [] });
    expect(await registrationOf(chen.id)).not.toBeNull();
  });

  it('三列中一位對不到員工名單：另外兩位照常新增並儲存（PPL-R74、PPL-R85、PPL-AC83）', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部' });
    const lee = await createEmployee({ name: '李美華', department: '業務部', extension: '5678' });

    const result = await importOk(
      sheet(answer('陳大文／研發一部／是'), answer('李美華／業務部／是'), answer('趙六／行政部／是')),
    );

    expect(result).toMatchObject({ imported: 2, created: 2, updated: 0 });
    expect(result.errors).toEqual([expect.objectContaining({ row: 4, reason: ISSUE_REASON.notFound('趙六') })]);
    expect(await registrationOf(chen.id)).not.toBeNull();
    expect(await registrationOf(lee.id)).not.toBeNull();
    expect(await prisma.participant.count()).toBe(2);
    expect(await prisma.participant.count({ where: { kind: 'GUEST' } })).toBe(0);
  });

  it('沒有 BOM 的 UTF-8 檔也可以匯入（PPL-Q01）', async () => {
    const { chen } = await demoRoster();
    const form = new FormData();
    form.append('file', new File([sheet(answer('陳大文／研發一部／是'))], 'registrations.csv', { type: 'text/csv' }));
    const res = await POST(new Request('http://localhost:3000/api/participants/import', { method: 'POST', body: form }), {
      params: Promise.resolve({}),
    });
    expect(await okJson(res, importResultSchema)).toMatchObject({ imported: 1 });
    expect(await registrationOf(chen.id)).not.toBeNull();
  });
});

describe('重複匯入：已報名的員工（PPL-R79～R84、PPL-Q20）', () => {
  async function wangAtTable3() {
    const { wang, lee, chen } = await demoRoster();
    await prisma.participant.update({ where: { id: wang.participant.id }, data: { vegetarian: false, note: '舊備註' } });
    const dependent = await createDependent(wang.participant.id, { childSeat: false, vegetarian: true });
    await seatAt(3, wang.participant.id, dependent.id);
    return { wang, lee, chen, dependent };
  }

  it('不重複新增；更新員工的素食與眷屬的兒童椅、素食；座位不動；已有備註時保留（PPL-R80、PPL-AC78、D-013）', async () => {
    // 系統已有備註時保留，不用表單的備註（D-013、PPL-R80、PPL-AC78）
    const { wang, dependent } = await wangAtTable3();

    const result = await importOk(sheet(answer('王小明／研發一部／是／是／是／素食／葷食／新備註')));

    expect(result).toMatchObject({ imported: 1, created: 0, updated: 1, errors: [] });
    expect(await prisma.participant.count({ where: { employeeId: wang.employee.id } })).toBe(1);
    expect(await findP(wang.participant.id)).toMatchObject({ vegetarian: true, note: '舊備註', tableId: 3, seatOrder: 0 });
    expect(await findP(dependent.id)).toMatchObject({ childSeat: true, vegetarian: false, tableId: 3, seatOrder: 1 });
    expect(await prisma.participant.count({ where: { kind: 'DEPENDENT' } })).toBe(1);
  });

  it('系統裡沒有備註：填入表單的備註（PPL-R80）', async () => {
    const { wang } = await wangAtTable3();
    await prisma.participant.update({ where: { id: wang.participant.id }, data: { note: null } });
    await importOk(sheet(answer('王小明／研發一部／是／是／否／葷食／葷食／新備註')));
    expect(await findP(wang.participant.id)).toMatchObject({ note: '新備註', tableId: 3 });
  });

  it('表單攜帶眷屬、系統裡還沒有眷屬：補一位未入座的眷屬；員工仍在原桌（PPL-R81、PPL-AC79）', async () => {
    const { wang } = await demoRoster();
    await seatAt(3, wang.participant.id);

    const result = await importOk(sheet(answer('王小明／研發一部／是／是')));

    expect(result).toMatchObject({ imported: 1, errors: [] });
    expect(await prisma.participant.findUnique({ where: { hostId: wang.participant.id } })).toMatchObject({
      kind: 'DEPENDENT',
      relation: null,
      tableId: null,
    });
    expect(await findP(wang.participant.id)).toMatchObject({ tableId: 3, seatOrder: 0 });
  });

  it('最後一次填不參加：不自動取消報名，資料與座位都不變；需要處理（PPL-R69、PPL-R82、PPL-AC80）', async () => {
    const { wang } = await demoRoster();
    await seatAt(3, wang.participant.id);
    const before = await snapshot();

    const result = await importOk(sheet(answer('王小明／研發一部／是'), answer('王小明／研發一部／否')));

    expect(result.imported).toBe(0);
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 3, reason: ISSUE_REASON.notAttending('王小明') }),
    ]);
    expect(await snapshot()).toEqual(before);
  });

  it('系統有眷屬、表單沒有攜帶眷屬：不刪除眷屬，需要處理；員工照常更新（PPL-R74、PPL-R83、PPL-AC81）', async () => {
    const { wang, dependent } = await wangAtTable3();

    const result = await importOk(sheet(answer('王小明／研發一部／是／否')));

    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 2, reason: ISSUE_REASON.noDependent('王小明') }),
    ]);
    expect(await findP(dependent.id)).toMatchObject({ hostId: wang.participant.id, tableId: 3 });
  });

  it('表單裡沒有的人不受影響；不新增外部貴賓；不改座位與工作人員（PPL-R79、PPL-R80、PPL-R84、PPL-AC82）', async () => {
    // 李美華已報名、外部貴賓林董在 B10 桌（內部編號 5）、陳大文已報名而且是工作人員
    const { participant: lee } = await createRegisteredEmployee({ name: '李美華', department: '業務部', extension: '5678' });
    const lin = await createGuest({ guestName: '林董', organization: '○○科技 董事長' });
    await seatAt(5, lin.id);
    const { participant: chenStaff } = await createRegisteredEmployee(
      { name: '陳大文', department: '研發一部' },
      { tableId: 0, seatOrder: 0 },
    );
    const leeBefore = await findP(lee.id);
    const linBefore = await findP(lin.id);

    const result = await importOk(sheet(answer('陳大文／研發一部／是')));

    expect(result).toMatchObject({ imported: 1, errors: [] });
    expect(await findP(lee.id)).toEqual(leeBefore);
    expect(await findP(lin.id)).toEqual(linBefore);
    expect(await findP(chenStaff.id)).toMatchObject({ tableId: 0, seatOrder: 0 });
    expect(await prisma.participant.count({ where: { kind: 'GUEST' } })).toBe(1);
  });

  it('匯入不改員工名單（PPL-R02）', async () => {
    await demoRoster();
    const before = await prisma.employee.findMany({ orderBy: { id: 'asc' } });
    await importOk(sheet(answer('陳大文／行銷部／是／否／否／素食／／備註文字')));
    expect(await prisma.employee.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });
});

describe('員工名單上標記為不參加的員工（PPL-R72、EMP-R64、D-014）', () => {
  const declinedOf = async (id: number) => (await prisma.employee.findUniqueOrThrow({ where: { id } })).declined;

  it('不參加的陳大文填「是」：照一般報名者新增，不參加的標記清掉，不列為需要處理', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });

    const result = await importOk(sheet(answer('陳大文／研發一部／是／否／否／素食／／需要靠走道')));

    expect(result).toMatchObject({ imported: 1, created: 1, updated: 0, errors: [] });
    expect(await registrationOf(chen.id)).toMatchObject({
      kind: 'EMPLOYEE',
      vegetarian: true,
      note: '需要靠走道',
      tableId: null,
    });
    expect(await declinedOf(chen.id)).toBe(false);
  });

  it('不參加的員工填「是」並攜帶眷屬：員工與眷屬都新增，標記清掉（PPL-R72、PPL-R73）', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });
    await importOk(sheet(answer('陳大文／研發一部／是／是／是')));
    const host = await registrationOf(chen.id);
    expect(host).not.toBeNull();
    expect(await prisma.participant.findUnique({ where: { hostId: host?.id ?? -1 } })).toMatchObject({ kind: 'DEPENDENT', childSeat: true });
    expect(await declinedOf(chen.id)).toBe(false);
  });

  it('還沒報名的員工最後一次填「否」：不新增，也不會因匯入被標記為不參加', async () => {
    const { chen } = await demoRoster();
    const lee = await createEmployee({ name: '李小華', department: '業務部' });

    const result = await importOk(sheet(answer('陳大文／研發一部／否'), answer('李小華／業務部／是'), answer('李小華／業務部／否')));

    expect(result).toMatchObject({ imported: 0, errors: [] });
    expect(await registrationOf(chen.id)).toBeNull();
    expect(await registrationOf(lee.id)).toBeNull();
    expect(await declinedOf(chen.id)).toBe(false);
    expect(await declinedOf(lee.id)).toBe(false);
  });

  it('不參加的員工最後一次填「否」：不新增、不算需要處理，仍是不參加', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });
    const before = await snapshot();

    const result = await importOk(sheet(answer('陳大文／研發一部／否')));

    expect(result).toMatchObject({ imported: 0, errors: [] });
    expect(await snapshot()).toEqual(before);
    expect(await declinedOf(chen.id)).toBe(true);
  });

  it('匯入只清掉加入的人：表單裡沒有的不參加員工仍是不參加（PPL-R84）', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });
    const other = await createEmployee({ name: '林四', department: '研發一部', declined: true });
    await importOk(sheet(answer('陳大文／研發一部／是')));
    expect(await declinedOf(chen.id)).toBe(false);
    expect(await declinedOf(other.id)).toBe(true);
  });

  it('報名表格式錯誤時整份不匯入：不參加的標記不變（PPL-R68）', async () => {
    const chen = await createEmployee({ name: '陳大文', department: '研發一部', declined: true });
    const content = registrationCsv([answer('陳大文／研發一部／是')], {
      columns: FORM_COLUMNS.filter((c) => c !== 'dependent'),
    });
    expect(await errorOf(await upload(content))).toMatchObject({ status: 400, code: 'IMPORT_FORMAT_INVALID' });
    expect(await declinedOf(chen.id)).toBe(true);
    expect(await registrationOf(chen.id)).toBeNull();
  });
});

// 錯誤清單的列號（errors[].row）是這一列在檔案中的列號，和用 Excel 開啟時一致：表頭是第 1 列，空白列也算一列，
// 儲存格內的換行不另算一列（階段 3 決定；src/server/csv.ts 的 parseCsv 保留空白列）。空白列沒有名字，不處理也不算需要處理。
describe('錯誤清單的列號：和用 Excel 開啟時看到的列號一致（PPL-R74、PPL-Q06）', () => {
  /**
   * 報名表的 CSV 文字，插入原樣的幾行文字（'' 是空行）；at 是插入後那一行在檔案中的列號（表頭是第 1 列）。
   * 回答裡的儲存格換行只用 \n，所以用 \r\n 切開不會切到儲存格中間。
   */
  function sheetWithLines(answers: RegistrationAnswer[], inserts: readonly { at: number; text: string }[]): string {
    const lines = toCsvText(registrationRows(answers, { headers: FULL_WIDTH_HEADERS }))
      .replace(/\r\n$/, '')
      .split('\r\n');
    for (const { at, text } of [...inserts].sort((a, b) => a.at - b.at)) lines.splice(at - 1, 0, text);
    return `${lines.join('\r\n')}\r\n`;
  }
  const commasOnly = ','.repeat(FORM_COLUMNS.length - 1);

  it('中間有空行與只有逗號的列：後面對不到員工名單的人，列號照檔案算；空白列不算需要處理', async () => {
    const { chen } = await demoRoster();
    // 1 表頭、2 陳大文、3 空行、4 只有逗號、5 趙六
    const content = sheetWithLines(
      [answer('陳大文／研發一部／是'), answer('趙六／行政部／是')],
      [
        { at: 3, text: '' },
        { at: 4, text: commasOnly },
      ],
    );

    const result = await importOk(content);

    expect(result).toMatchObject({ imported: 1, created: 1 });
    expect(result.errors).toEqual([expect.objectContaining({ row: 5, reason: ISSUE_REASON.notFound('趙六') })]);
    expect(await registrationOf(chen.id)).not.toBeNull();
  });

  it('已報名的人最後一次填不參加：列號也照檔案算（PPL-R82）', async () => {
    await demoRoster();
    // 1 表頭、2 空行、3 王小明「否」
    const content = sheetWithLines([answer('王小明／研發一部／否')], [{ at: 2, text: '' }]);
    const result = await importOk(content);
    expect(result.errors).toEqual([expect.objectContaining({ row: 3, reason: ISSUE_REASON.notAttending('王小明') })]);
  });

  it('備註欄有換行的那一列只算一列；之後又有空行：後面的人列號不受影響', async () => {
    const { chen } = await demoRoster();
    // 1 表頭、2 陳大文（備註兩行）、3 空行、4 趙六
    const content = sheetWithLines(
      [answer('陳大文／研發一部／是／否／否／／／第一行\n第二行'), answer('趙六／行政部／是')],
      [{ at: 3, text: '' }],
    );
    const result = await importOk(content);
    expect(result.errors).toEqual([expect.objectContaining({ row: 4, reason: ISSUE_REASON.notFound('趙六') })]);
    expect((await registrationOf(chen.id))?.note).toContain('第一行');
  });

  it('只有空白列、沒有任何回答：「已匯入 0 位，0 筆需要處理。」', async () => {
    await demoRoster();
    const before = await snapshot();
    const content = sheetWithLines([], [
      { at: 2, text: '' },
      { at: 3, text: commasOnly },
    ]);
    expect(await importOk(content)).toMatchObject({ imported: 0, errors: [] });
    expect(await snapshot()).toEqual(before);
  });
});
