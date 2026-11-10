import { employeeInputSchema } from '@/contracts/employees';
import { parseJson, route } from '@/server/http';
import { createEmployee } from '@/server/services/employees';

// POST /api/employees：新增員工（docs/spec/employees.md EMP-R32～R38）→ EmployeeResult
export const POST = route(async ({ req }) => {
  const input = await parseJson(req, employeeInputSchema);
  return Response.json({ employee: await createEmployee(input) }, { status: 201 });
});
