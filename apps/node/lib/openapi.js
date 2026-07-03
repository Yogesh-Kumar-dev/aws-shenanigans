// OpenAPI 3.0 spec for the tasks CRUD API. Served as JSON at GET /openapi.json
// and rendered by the Swagger UI page at GET /docs. A relative server URL ("/")
// makes Swagger "Try it out" call this same API on the same origin.
//
// The same five operations are exposed under two prefixes:
//   /tasks       (v1) - one Lambda per route
//   /v2/tasks    (v2) - a single Lambda routing on method
// They behave identically, so we define the operations once and mount them
// under both prefixes (see buildPaths at the bottom).

const Task = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid", readOnly: true },
    title: { type: "string" },
    description: { type: "string" },
    done: { type: "boolean" },
    priority: { type: "string", enum: ["low", "medium", "high"] },
    dueDate: { type: "string", format: "date-time", nullable: true },
    tags: { type: "array", items: { type: "string" } },
    createdAt: { type: "string", format: "date-time", readOnly: true },
    updatedAt: { type: "string", format: "date-time", readOnly: true },
  },
};

const TaskInput = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string", example: "Write the AWS demo" },
    description: { type: "string", example: "Wire Swagger to DynamoDB" },
    done: { type: "boolean", default: false },
    priority: {
      type: "string",
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    dueDate: { type: "string", format: "date-time", example: "2026-08-01T00:00:00Z" },
    tags: { type: "array", items: { type: "string" }, example: ["aws", "demo"] },
  },
};

const TaskUpdate = {
  ...TaskInput,
  required: [],
  description: "Any subset of the writable task fields.",
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Task id.",
};

// GET (list) query-parameter filters.
const listFilters = [
  { name: "done", in: "query", schema: { type: "boolean" }, description: "Filter by completion state." },
  {
    name: "priority",
    in: "query",
    schema: { type: "string", enum: ["low", "medium", "high"] },
    description: "Filter by exact priority.",
  },
  {
    name: "q",
    in: "query",
    schema: { type: "string" },
    description: "Case-insensitive substring match on title and description.",
  },
  { name: "tag", in: "query", schema: { type: "string" }, description: "Only tasks that include this tag." },
  {
    name: "dueBefore",
    in: "query",
    schema: { type: "string", format: "date-time" },
    description: "Only tasks with dueDate before this ISO timestamp.",
  },
  {
    name: "dueAfter",
    in: "query",
    schema: { type: "string", format: "date-time" },
    description: "Only tasks with dueDate at/after this ISO timestamp.",
  },
  {
    name: "sort",
    in: "query",
    schema: { type: "string", enum: ["createdAt", "dueDate", "priority", "title"], default: "createdAt" },
    description: "Field to sort by.",
  },
  {
    name: "order",
    in: "query",
    schema: { type: "string", enum: ["asc", "desc"], default: "asc" },
    description: "Sort direction.",
  },
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 1000 },
    description: "Maximum number of tasks to return.",
  },
];

// The collection endpoint (list + create) and the item endpoint (get/update/
// delete), defined once and mounted under each version prefix below.
const collection = {
  get: {
    summary: "List tasks",
    operationId: "listTasks",
    parameters: listFilters,
    responses: {
      200: {
        description: "Matching tasks.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                count: { type: "integer" },
                items: { type: "array", items: { $ref: "#/components/schemas/Task" } },
              },
            },
          },
        },
      },
    },
  },
  post: {
    summary: "Create a task",
    operationId: "createTask",
    requestBody: {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/TaskInput" } } },
    },
    responses: {
      201: {
        description: "Created task.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } },
      },
      400: { $ref: "#/components/responses/BadRequest" },
    },
  },
};

const item = {
  get: {
    summary: "Get a task by id",
    operationId: "getTask",
    parameters: [idParam],
    responses: {
      200: {
        description: "The task.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } },
      },
      404: { $ref: "#/components/responses/NotFound" },
    },
  },
  put: {
    summary: "Update a task",
    operationId: "updateTask",
    parameters: [idParam],
    requestBody: {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/TaskUpdate" } } },
    },
    responses: {
      200: {
        description: "The updated task.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } },
      },
      400: { $ref: "#/components/responses/BadRequest" },
      404: { $ref: "#/components/responses/NotFound" },
    },
  },
  delete: {
    summary: "Delete a task",
    operationId: "deleteTask",
    parameters: [idParam],
    responses: {
      204: { description: "Deleted." },
      404: { $ref: "#/components/responses/NotFound" },
    },
  },
};

// Clone a path-item and stamp a tag + unique operationId suffix onto each op,
// so both versions can coexist in one spec.
function tagged(pathItem, tag, suffix) {
  const out = {};
  for (const [method, op] of Object.entries(pathItem)) {
    out[method] = { ...op, tags: [tag], operationId: `${op.operationId}${suffix}` };
  }
  return out;
}

function buildPaths() {
  return {
    "/tasks": tagged(collection, "tasks (v1 - function per route)", "V1"),
    "/tasks/{id}": tagged(item, "tasks (v1 - function per route)", "V1"),
    "/v2/tasks": tagged(collection, "tasks (v2 - single Lambda)", "V2"),
    "/v2/tasks/{id}": tagged(item, "tasks (v2 - single Lambda)", "V2"),
  };
}

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Tasks CRUD API",
    version: "1.0.0",
    description:
      "A learning demo: Swagger UI -> API Gateway (HTTP API) -> Lambda -> DynamoDB. " +
      "v1 routes use one Lambda per route; v2 routes use a single Lambda that switches on method.",
  },
  servers: [{ url: "/", description: "This deployment" }],
  paths: buildPaths(),
  components: {
    schemas: { Task, TaskInput, TaskUpdate },
    responses: {
      BadRequest: {
        description: "Invalid request.",
        content: {
          "application/json": {
            schema: { type: "object", properties: { message: { type: "string" } } },
          },
        },
      },
      NotFound: {
        description: "Task not found.",
        content: {
          "application/json": {
            schema: { type: "object", properties: { message: { type: "string" } } },
          },
        },
      },
    },
  },
};
