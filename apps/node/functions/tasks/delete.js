// DELETE /tasks/{id} — delete a task, returning 404 if it did not exist.
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";

import { ddb, TABLE } from "../../lib/db.js";
import { HttpError, handler } from "../../lib/http.js";

export const handle = handler(async (event) => {
  const id = event.pathParameters?.id;
  if (!id) {
    throw new HttpError(400, "Path parameter `id` is required");
  }

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

  return { statusCode: 204, body: "" };
});
