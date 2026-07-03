// GET /tasks — list tasks with optional filters, sorting, and a limit.
//
// This scans the whole table and filters in memory. That is the simplest thing
// to read and supports substring/tag filters trivially, which is what we want
// for a learning demo. At real scale you would model access patterns with a
// partition/sort key or GSIs and use Query + FilterExpression instead of Scan.
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

import { ddb, TABLE } from "../../lib/db.js";
import { handler, json } from "../../lib/http.js";

const PRIORITY_RANK = { low: 0, medium: 1, high: 2 };

async function scanAll() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new ScanCommand({ TableName: TABLE, ExclusiveStartKey }),
    );
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

export const handle = handler(async (event) => {
  const q = event.queryStringParameters ?? {};

  let items = await scanAll();
  items = applyFilters(items, q);
  items = sortItems(items, q.sort, q.order);

  const limit = Number.parseInt(q.limit, 10);
  if (Number.isInteger(limit) && limit > 0) {
    items = items.slice(0, limit);
  }

  return json(200, { count: items.length, items });
});
