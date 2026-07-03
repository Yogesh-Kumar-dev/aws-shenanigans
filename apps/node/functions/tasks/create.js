// POST /tasks — create a task.
import { randomUUID } from "node:crypto";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

import { ddb, TABLE } from "../../lib/db.js";
import { HttpError, handler, json, parseBody } from "../../lib/http.js";

const PRIORITIES = ["low", "medium", "high"];

export const handle = handler(async (event) => {
  const body = parseBody(event);

  if (typeof body.title !== "string" || body.title.trim() === "") {
    throw new HttpError(400, "`title` is required and must be a non-empty string");
  }
  if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
    throw new HttpError(400, `\`priority\` must be one of ${PRIORITIES.join(", ")}`);
  }

  const now = new Date().toISOString();
  const task = {
    id: randomUUID(),
    title: body.title.trim(),
    description: body.description ?? "",
    done: body.done === true,
    priority: body.priority ?? "medium",
    dueDate: body.dueDate ?? null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: task }));

  return json(201, task);
});
