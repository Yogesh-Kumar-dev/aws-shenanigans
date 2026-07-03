// GET /tasks — list tasks with optional filters, sorting, and a limit.
import { handler, json } from "../../lib/http.js";
import { listTasks } from "../../lib/tasks.js";

export const handle = handler(async (event) => {
  const result = await listTasks(event.queryStringParameters ?? {});
  return json(200, result);
});
