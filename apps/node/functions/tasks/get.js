// GET /tasks/{id} — fetch a single task by id.
import { handler, json } from "../../lib/http.js";
import { getTask } from "../../lib/tasks.js";

export const handle = handler(async (event) => {
  const task = await getTask(event.pathParameters?.id);
  return json(200, task);
});
