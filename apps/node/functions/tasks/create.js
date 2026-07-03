// POST /tasks — create a task.
import { handler, json, parseBody } from "../../lib/http.js";
import { createTask } from "../../lib/tasks.js";

export const handle = handler(async (event) => {
  const task = await createTask(parseBody(event));
  return json(201, task);
});
