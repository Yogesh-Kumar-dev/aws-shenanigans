# aws-shenanigans

A multi-runtime AWS Serverless playground. Each runtime is a self-contained
Serverless Framework v4 service under `apps/`, deployed as its own independent
CloudFormation stack.

| Service        | Runtime     | Path                         | What it does                                                        |
| -------------- | ----------- | ---------------------------- | ------------------------------------------------------------------- |
| `aws-automation` | Python 3.12 | [`apps/python`](apps/python) | `budget-alert`: daily AWS Free Tier usage report to Telegram.       |
| `crud-api`       | Node.js 20  | [`apps/node`](apps/node)     | Tasks CRUD API (API Gateway + DynamoDB) with interactive Swagger UI at `/docs`. |

Each app has its own `serverless.yml`, dependencies, `.env.example`, and README.
See each app's README for details:

- [apps/python/functions/budget_alert/README.md](apps/python/functions/budget_alert/README.md)
- [apps/node/README.md](apps/node/README.md)

## Layout

```text
aws-shenanigans/
|-- package.json              # workspace root + convenience deploy scripts
|-- pnpm-workspace.yaml       # packages: apps/*
|-- apps/
|   |-- python/               # Python runtime (service: aws-automation)
|   |   |-- serverless.yml
|   |   |-- package.json
|   |   |-- pyproject.toml
|   |   |-- requirements*.txt
|   |   |-- functions/budget_alert/
|   |   `-- tests/
|   `-- node/                 # Node.js runtime (service: crud-api)
|       |-- serverless.yml
|       |-- package.json
|       |-- lib/              # shared db client, http helpers, OpenAPI spec
|       |-- events/
|       `-- functions/        # tasks/ (CRUD) + docs/ (Swagger UI + spec)
`-- README.md
```

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io/)
- Python 3.12 (for the Python service)
- AWS credentials configured for your target account/region

## Install

The repo is a pnpm workspace. Install the Serverless CLI and Node dependencies
for every app from the root:

```bash
pnpm install
```

For the Python service, also set up a virtualenv and install its dev deps:

```bash
cd apps/python
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
# macOS/Linux:        source .venv/bin/activate
pip install -r requirements-dev.txt
```

## Deploy

From the repo root, deploy either service independently:

```bash
pnpm run deploy:python     # deploys the aws-automation stack
pnpm run deploy:node       # deploys the credit-api stack
pnpm run deploy:all        # deploys both (recursively)
```

Pass stage/region through to a single service by running from its directory:

```bash
cd apps/node
pnpm exec serverless deploy --stage prod --region us-east-1
```

Remove a stack:

```bash
pnpm run remove:python
pnpm run remove:node
```

## Environment variables

Each app loads its own `.env` via `useDotenv: true`. Copy the example in each
app directory:

```bash
cp apps/python/.env.example apps/python/.env
cp apps/node/.env.example   apps/node/.env
```

Never commit `.env`. Configure production secrets through your CI/CD system or
shell environment (the Python service also reads secrets from SSM Parameter
Store — see its README).

## Adding another service

1. Create a new folder under `apps/`, e.g. `apps/go/`.
2. Add a `serverless.yml` with its own `service:` name (its own stack).
3. Give it a `package.json` named `@aws-shenanigans/<name>` so it joins the
   pnpm workspace, plus deploy/remove scripts.
4. Add convenience `deploy:<name>` / `remove:<name>` scripts to the root
   `package.json`.
