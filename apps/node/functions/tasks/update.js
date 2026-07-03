// PUT /tasks/{id} — update writable fields of an existing task.
import { handler, json, parseBody } from "../../lib/http.js";
import { updateTask } from "../../lib/tasks.js";

export const handle = handler(async (event) => {
  const task = await updateTask(event.pathParameters?.id, parseBody(event));
  return json(200, task);
});
