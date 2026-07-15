# GitHub Actions deploy role

IAM policies for the `github-actions-aws-automation-deploy` role that `ci-python.yml` /
`ci-node.yml` assume via OIDC to run `serverless deploy`. Region is fixed at `ap-south-2`
to match both `serverless.yml` files.

Substitute your account ID and apply:

```bash
export AWS_ACCOUNT_ID=<your-account-id>

sed "s/<AWS_ACCOUNT_ID>/$AWS_ACCOUNT_ID/g" infra/iam/github-actions-deploy-trust-policy.json \
  > /tmp/trust-policy.json
sed "s/<AWS_ACCOUNT_ID>/$AWS_ACCOUNT_ID/g" infra/iam/github-actions-deploy-permissions.json \
  > /tmp/permissions.json

aws iam create-role \
  --role-name github-actions-aws-automation-deploy \
  --assume-role-policy-document file:///tmp/trust-policy.json

aws iam put-role-policy \
  --role-name github-actions-aws-automation-deploy \
  --policy-name deploy-permissions \
  --policy-document file:///tmp/permissions.json
```

Requires a GitHub OIDC provider already registered in the account
(`token.actions.githubusercontent.com`) — see `aws iam list-open-id-connect-providers`.
