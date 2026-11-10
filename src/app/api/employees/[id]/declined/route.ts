import { employeeDeclinedInputSchema } from '@/contracts/employees';
import { parseId, parseJson, route } from '@/server/http';
import { setEmployeeDeclined } from '@/server/services/employees';

type Params = { id: string };

// PUT /api/employees/{id}/declined：標記為不參加（{ declined: true }）或改回未報名（{ declined: false }）
// （EMP-R63、D-014）→ EmployeeResult；這位員工已報名時 409 CONFLICT、不存在時 404 NOT_FOUND（EMP-R65）
export const PUT = route<Params>(async ({ req, params }) => {
  const id = parseId(params.id);
  const { declined } = await parseJson(req, employeeDeclinedInputSchema);
  return Response.json({ employee: await setEmployeeDeclined(id, declined) });
});
