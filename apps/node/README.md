# crud-api (Node.js runtime)

A small **tasks** CRUD API for learning the full serverless request path:

```text
Swagger UI  ->  API Gateway (HTTP API)  ->  Lambda  ->  DynamoDB
```

Deploy it, open `/docs`, and drive every endpoint from the browser with Swagger's
"Try it out". This is the Node.js service of the
[aws-shenanigans](../../README.md) repo.

## Endpoints

| Method | Path             | Description                          |
| ------ | ---------------- | ------------------------------------ |
| POST   | `/tasks`         | Create a task.                       |
| GET    | `/tasks`         | List tasks (with filters, see below).|
| GET    | `/tasks/{id}`    | Get a task by id.                    |
| PUT    | `/tasks/{id}`    | Update writable fields of a task.    |
| DELETE | `/tasks/{id}`    | Delete a task.                       |
| GET    | `/openapi.json`  | The OpenAPI 3.0 spec.                |
| GET    | `/docs`          | Swagger UI (interactive docs).       |

### List filters

`GET /tasks` accepts these optional query parameters (all documented in Swagger):

| Param                   | Effect                                                  |
| ----------------------- | ------------------------------------------------------- |
| `done`                  | `true` / `false` — completion state.                    |
| `priority`              | `low` / `medium` / `high` — exact priority.             |
| `q`                     | Case-insensitive substring on title + description.      |
| `tag`                   | Only tasks that include this tag.                       |
| `dueBefore` / `dueAfter`| ISO-8601 range on `dueDate`.                            |
| `sort` / `order`        | Sort by `createdAt` \| `dueDate` \| `priority` \| `title`, `asc`/`desc`. |
| `limit`                 | Max number of tasks returned.                           |

Example:

```bash
curl "$API_URL/tasks?done=false&priority=high&q=demo&sort=dueDate&order=asc&limit=10"
```

## Data model

Single DynamoDB table `crud-api-<stage>-tasks`, on-demand billing, string
partition key `id`:

| Attribute     | Type     | Notes                                    |
| ------------- | -------- | ---------------------------------------- |
| `id`          | string   | UUID, partition key.                     |
| `title`       | string   | Required on create.                      |
| `description` | string   | Optional.                                |
| `done`        | boolean  | Default `false`.                         |
| `priority`    | string   | `low` \| `medium` \| `high` (def. medium).|
| `dueDate`     | string   | Optional ISO-8601 timestamp.             |
| `tags`        | string[] | Optional.                                |
| `createdAt`   | string   | ISO-8601, set on create.                 |
| `updatedAt`   | string   | ISO-8601, set on create + update.        |

> The list endpoint uses `Scan` + in-memory filtering for clarity. That is fine
> for a demo; at scale you would model access patterns with a sort key / GSIs and
> use `Query` + `FilterExpression` instead.

## Layout

```text
apps/node/
|-- serverless.yml            # service: crud-api, 7 functions + DynamoDB table
|-- package.json
|-- .env.example
|-- events/                   # sample payloads for `serverless invoke local`
|-- lib/
|   |-- db.js                 # shared DynamoDB Document client
|   |-- http.js               # json()/parseBody()/handler() + HttpError
|   `-- openapi.js            # the OpenAPI spec (paths, filters, schemas)
`-- functions/
    |-- tasks/                # create/list/get/update/delete handlers
    `-- docs/                 # openapi.js (spec) + swagger.js (UI page)
```

Handlers are ES modules (`"type": "module"`) and are bundled by the Serverless
Framework v4 built-in esbuild, so `node_modules` is not shipped raw.

## Environment variables

| Name          | Description                                          |
| ------------- | ---------------------------------------------------- |
| `STAGE`       | Deployment stage. Defaults to `dev`.                 |
| `AWS_REGION`  | AWS region. Defaults to `ap-south-2`.                |
| `LOG_LEVEL`   | Logging level. Defaults to `INFO`.                   |
| `TASKS_TABLE` | DynamoDB table name. Set automatically from service/stage. |

Copy `.env.example` to `.env` for local development. `.env` is gitignored.

## Develop & deploy

Install dependencies from the repo root (pnpm workspace):

```bash
pnpm install
```

Run a function locally against a sample event (edit the `id` in the get/update/
delete events first):

```bash
cd apps/node
pnpm run invoke:create
pnpm run invoke:list
```

Deploy (from the repo root):

```bash
pnpm run deploy:node
```

Or from this directory, targeting a stage/region:

```bash
pnpm exec serverless deploy --stage dev
```

The deploy output prints the HTTP API base URL. Open **`<base-url>/docs`** in a
browser to use Swagger UI against the live stack.

## IAM

The functions get least-privilege access to the tasks table only:

```yaml
- dynamodb:PutItem
- dynamodb:GetItem
- dynamodb:UpdateItem
- dynamodb:DeleteItem
- dynamodb:Scan
```

plus the standard CloudWatch Logs permissions.
