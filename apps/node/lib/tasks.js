// Core task operations, independent of any HTTP wiring. Both API surfaces use
// these: the v1 handlers (one Lambda per route) and the v2 router (one Lambda
// switching on method). Each function takes already-parsed inputs and throws
// HttpError on invalid input / not-found, so callers stay thin.
import { randomUUID } from "node:crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import { ddb, TABLE } from "./db.js";
import { HttpError } from "./http.js";

const PRIORITIES = ["low", "medium", "high"];
const WRITABLE = ["title", "description", "done", "priority", "dueDate", "tags"];
const PRIORITY_RANK = { low: 0, medium: 1, high: 2 };

export async function createTask(body) {
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
  return task;
}

export async function getTask(id) {
  if (!id) throw new HttpError(400, "Path parameter `id` is required");

  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }));
  if (!Item) throw new HttpError(404, `No task found for id ${id}`);
  return Item;
}

export async function updateTask(id, body) {
  if (!id) throw new HttpError(400, "Path parameter `id` is required");
  if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
    throw new HttpError(400, `\`priority\` must be one of ${PRIORITIES.join(", ")}`);
  }

  // Build a dynamic SET expression from whichever writable fields were sent.
  const sets = ["#updatedAt = :updatedAt"];
  const names = { "#updatedAt": "updatedAt" };
  const values = { ":updatedAt": new Date().toISOString() };

  for (const field of WRITABLE) {
    if (body[field] !== undefined) {
      sets.push(`#${field} = :${field}`);
      names[`#${field}`] = field;
      values[`:${field}`] = body[field];
    }
  }

  if (sets.length === 1) {
    throw new HttpError(400, `Provide at least one field to update: ${WRITABLE.join(", ")}`);
  }

  try {
    const { Attributes } = await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { id },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(id)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return Attributes;
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      throw new HttpError(404, `No task found for id ${id}`);
    }
    throw err;
  }
}

export async function deleteTask(id) {
  if (!id) throw new HttpError(400, "Path parameter `id` is required");

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { id },
        ConditionExpression: "attribute_exists(id)",
      }),
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      throw new HttpError(404, `No task found for id ${id}`);
    }
    throw err;
  }
}

// --- list with filtering/sorting/limit ---------------------------------------
// Scans the whole table and filters in memory. Simplest thing to read and it
// supports substring/tag filters trivially, which is what we want for a demo.
// At real scale you would model access patterns with a sort key / GSIs and use
// Query + FilterExpression instead of Scan.

async function scanAll() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function applyFilters(items, q) {
  let result = items;

  if (q.done === "true" || q.done === "false") {
    const wanted = q.done === "true";
    result = result.filter((t) => Boolean(t.done) === wanted);
  }
  if (q.priority) {
    result = result.filter((t) => t.priority === q.priority);
  }
  if (q.q) {
    const needle = q.q.toLowerCase();
    result = result.filter(
      (t) =>
        (t.title ?? "").toLowerCase().includes(needle) ||
        (t.description ?? "").toLowerCase().includes(needle),
    );
  }
  if (q.tag) {
    result = result.filter((t) => Array.isArray(t.tags) && t.tags.includes(q.tag));
  }
  if (q.dueBefore) {
    result = result.filter((t) => t.dueDate && t.dueDate < q.dueBefore);
  }
  if (q.dueAfter) {
    result = result.filter((t) => t.dueDate && t.dueDate >= q.dueAfter);
  }

  return result;
}

function sortItems(items, sort = "createdAt", order = "asc") {
  const dir = order === "desc" ? -1 : 1;
  const key = (t) => (sort === "priority" ? PRIORITY_RANK[t.priority] ?? -1 : t[sort]);
  return [...items].sort((a, b) => {
    const av = key(a);
    const bv = key(b);
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    return av < bv ? -dir : dir;
  });
}

export async function listTasks(query = {}) {
  let items = await scanAll();
  items = applyFilters(items, query);
  items = sortItems(items, query.sort, query.order);

  const limit = Number.parseInt(query.limit, 10);
  if (Number.isInteger(limit) && limit > 0) {
    items = items.slice(0, limit);
  }

  return { count: items.length, items };
}
