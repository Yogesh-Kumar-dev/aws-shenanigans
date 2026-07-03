// PUT /tasks/{id} — update writable fields of an existing task.
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { ddb, TABLE } from "../../lib/db.js";
import { HttpError, handler, json, parseBody } from "../../lib/http.js";

const WRITABLE = ["title", "description", "done", "priority", "dueDate", "tags"];
const PRIORITIES = ["low", "medium", "high"];

export const handle = handler(async (event) => {
  const id = event.pathParameters?.id;
  if (!id) {
    throw new HttpError(400, "Path parameter `id` is required");
  }

  const body = parseBody(event);

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
    return json(200, Attributes);
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      throw new HttpError(404, `No task found for id ${id}`);
    }
    throw err;
  }
});
