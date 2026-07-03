// GET /docs — serve a Swagger UI page. The page loads the Swagger UI assets from
// a CDN and points them at /openapi.json on this same origin, so "Try it out"
// calls the live API directly (no CORS hop).
const SWAGGER_VERSION = "5.17.14";

const PAGE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tasks CRUD API - Swagger UI</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css"
    />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
      });
    </script>
  </body>
</html>`;

export async function handle() {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: PAGE,
  };
}
