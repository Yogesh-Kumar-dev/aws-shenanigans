// DELETE /tasks/{id} — delete a task, returning 404 if it did not exist.
import { handler } from "../../lib/http.js";
import { deleteTask } from "../../lib/tasks.js";

export const handle = handler(async (event) => {
  await deleteTask(event.pathParameters?.id);
  return { statusCode: 204, body: "" };
});
