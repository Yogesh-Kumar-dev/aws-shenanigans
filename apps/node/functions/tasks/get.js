// GET /tasks/{id} — fetch a single task by id.
import { GetCommand } from "@aws-sdk/lib-dynamodb";

import { ddb, TABLE } from "../../lib/db.js";
import { HttpError, handler, json } from "../../lib/http.js";

export const handle = handler(async (event) => {
  const id = event.pathParameters?.id;
  if (!id) {
    throw new HttpError(400, "Path parameter `id` is required");
  }

  const { Item } = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { id } }),
  );

  if (!Item) {
    throw new HttpError(404, `No task found for id ${id}`);
  }

  return json(200, Item);
});
