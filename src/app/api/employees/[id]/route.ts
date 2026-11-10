import { employeeInputSchema } from '@/contracts/employees';
import { parseId, parseJson, route } from '@/server/http';
import { deleteEmployee, updateEmployee } from '@/server/services/employees';

type Params = { id: string };

// PATCH /api/employees/{id}：編輯員工，整筆取代（EMP-R32、R39、R40）→ EmployeeResult
export const PATCH = route<Params>(async ({ req, params }) => {
  const id = parseId(params.id);
  const input = await parseJson(req, employeeInputSchema);
  return Response.json({ employee: await updateEmployee(id, input) });
});

// DELETE /api/employees/{id}：刪除員工；已報名者一併取消報名、移除眷屬、空出座位（EMP-R41～R43）→ EmployeeDeleteResult
export const DELETE = route<Params>(async ({ params }) => Response.json(await deleteEmployee(parseId(params.id))));
