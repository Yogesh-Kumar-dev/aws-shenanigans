# AWS Automation

A small Serverless Framework project for learning AWS Lambda with Python. It
currently has one Lambda, `budget-alert`, which sends a daily AWS Free Tier
usage report to Telegram at 8:00 AM IST.

## Tech Stack

- Serverless Framework v4
- Python 3.12
- AWS Lambda
- Amazon EventBridge
- AWS Free Tier API through boto3
- pytest, Ruff, Black

## Project Structure

```text
aws-automation/
|-- serverless.yml
|-- package.json
|-- pyproject.toml
|-- requirements.txt
|-- requirements-dev.txt
|-- .env.example
|-- .gitignore
|-- README.md
|-- functions/
|   `-- budget_alert/
|       |-- handler.py
|       `-- README.md
`-- tests/
```

Each Lambda lives in its own folder under `functions/` with its own README.
See [functions/budget_alert/README.md](functions/budget_alert/README.md) for how
`budget-alert` works, its function-specific environment variables, and how to run
and test it.

## Setup

Create and activate a virtual environment.

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

On macOS/Linux:

```bash
python -m venv .venv
source .venv/bin/activate
```

Install Python dependencies:

```bash
pip install -r requirements-dev.txt
```

Install the Serverless CLI:

```bash
pnpm install
```

The Lambda runtime is Python. `package.json` only pins the Serverless CLI for
reproducible local and CI deployments.

## Environment Variables

Copy the example file for local development:

```bash
cp .env.example .env
```

Project-wide variables:

| Name | Description |
| --- | --- |
| `STAGE` | Deployment stage. Defaults to `dev`. |
| `AWS_REGION` | AWS region. Defaults to `us-east-1`. |
| `LOG_LEVEL` | Logging level. Defaults to `INFO`. |

Each Lambda's own variables (for `budget-alert`, the Telegram and Free Tier
settings) are documented in its function README.

Do not commit `.env`. Configure production secrets through your CI/CD system or
shell environment before deployment.

Serverless is configured with `useDotenv: true`, so both `deploy` and
`invoke local` load values from `.env` automatically.

## IAM

The Lambda has the minimum application permission it needs:

```yaml
- freetier:GetFreeTierUsage
```

CloudWatch Logs permissions are also included so Lambda can write logs.

## Quality Checks

Run Ruff:

```bash
ruff check .
```

Format with Black:

```bash
black .
```

Run tests:

```bash
pytest
```

## Deployment

Deploy to the default `dev` stage:

```bash
npx serverless deploy
```

Deploy to a specific stage and region:

```bash
npx serverless deploy --stage prod --region us-east-1
```

Remove a stack:

```bash
npx serverless remove --stage dev --region us-east-1
```

Functions are packaged individually to keep Lambda artifacts small.

To run a Lambda locally, see its function README.

## Adding New Lambdas Later

1. Create a new folder under `functions/`, for example `functions/cost_report/`.
2. Add a `handler.py` with a `handle(event, context)` function.
3. Add the function to `serverless.yml` with the package patterns and events it needs.
4. Add least-privilege IAM permissions for the AWS APIs the Lambda calls.
5. Add tests under `tests/`.

Once a handler grows too large to read comfortably, split it into smaller files.
Start simple.

## Troubleshooting

- Deploy fails on credentials: Confirm your AWS credentials and region are set.
- Local packaging fails: Confirm your active Python version is 3.12 and run `pip install -r requirements-dev.txt`.
- No useful logs: Check `/aws/lambda/aws-automation-<stage>-<function>` in CloudWatch Logs and set `LOG_LEVEL=DEBUG` for more detail.

For issues specific to a Lambda, see its function README.
