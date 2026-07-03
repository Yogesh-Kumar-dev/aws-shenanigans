// Small helpers for API Gateway (HTTP API v2) Lambda responses.

// Throw this from a handler to return a specific 4xx with a message.
export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Build a JSON response.
export function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Parse a JSON request body, tolerating empty bodies. Throws HttpError(400)
// on malformed JSON so callers don't each repeat the try/catch.
export function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

// Wrap a handler so thrown HttpErrors become their status code and any other
// error becomes a 500. Keeps each CRUD handler focused on the happy path.
export function handler(fn) {
  return async (event) => {
    try {
      return await fn(event);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(err.statusCode, { message: err.message });
      }
      console.error("Unhandled error:", err);
      return json(500, { message: "Internal server error" });
    }
  };
}
