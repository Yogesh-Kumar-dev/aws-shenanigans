// v2 — all task CRUD in ONE Lambda, routed by HTTP method.
//
// This is the "fat function" / monolithic-router pattern, in contrast to v1
// where each route is its own Lambda (functions/tasks/*). Both call the exact
// same core operations in lib/tasks.js, so behavior is identical; only the
// packaging/deployment shape differs.
//
// Trade-offs vs v1:
//  + One function to deploy; one warm container serves every route.
//  + Shared code/imports load once per container.
//  - Coarser IAM/metrics/logs (all methods share one role, one log group).
//  - Larger blast radius: a bad deploy takes down every route at once.
import { HttpError, handler, json, parseBody } from "../../lib/http.js";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from "../../lib/tasks.js";

export const handle = handler(async (event) => {
  // HTTP API (payload v2.0) puts the method here.
  const method = event.requestContext?.http?.method;
  const id = event.pathParameters?.id;

  switch (method) {
    case "POST":
      return json(201, await createTask(parseBody(event)));

    case "GET":
      // /v2/tasks/{id} -> one task; /v2/tasks -> filtered list.
      return id
        ? json(200, await getTask(id))
        : json(200, await listTasks(event.queryStringParameters ?? {}));

    case "PUT":
      return json(200, await updateTask(id, parseBody(event)));

    case "DELETE":
      await deleteTask(id);
      return { statusCode: 204, body: "" };

    default:
      throw new HttpError(405, `Method ${method ?? "unknown"} not allowed`);
  }
});
