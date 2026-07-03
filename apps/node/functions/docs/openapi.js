// GET /openapi.json — serve the OpenAPI spec that Swagger UI reads.
import { openapi } from "../../lib/openapi.js";

export async function handle() {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(openapi),
  };
}
