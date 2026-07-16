# AWS Deployment Checklist

This is the operator runbook for the shared HTTPS ALB and the CI/CD API mounted at `/cicd`. Use the fresh-deployment workflow when neither stack has been deployed. Use the existing-environment cutover workflow when `DeployApi` already owns a dedicated ALB.

Do not use a zone-apex domain such as `example.com`: GoDaddy cannot map a normal apex CNAME to an ALB. Use a subdomain such as `api.example.com`. Stop if a shared ALB already exists under another stack, priority `100` is already allocated, the certificate and ALB Regions differ, or a CDK diff replaces the DynamoDB table, S3 bucket, or API Lambda.

## 1. Set Operator Variables

Install repository dependencies and configure an AWS CLI profile with permission to inspect and deploy the stacks. Set every value for the target environment:

```bash
export AWS_PROFILE=example
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity \
  --profile "$AWS_PROFILE" \
  --query Account \
  --output text)"

export DOMAIN_NAME=api.example.com
export INGRESS_STACK_NAME=SharedIngress
export API_STACK_NAME=DeployApi
export PATH_PREFIX=/cicd
export LISTENER_RULE_PRIORITY=100
export DEPLOY_TARGET_PREFIX=deploy-target-
export TARGET_FUNCTION=deploy-target-example
export PACKAGE_ZIP=./function.zip
```

`TARGET_FUNCTION` must already exist, start with `DEPLOY_TARGET_PREFIX`, and be included in the provisioned client's allow-list. `DOMAIN_NAME` must be a public subdomain controlled in GoDaddy.

## 2. Request and Validate the ACM Certificate

Request the public certificate in the same Region as the ALB:

```bash
export CERTIFICATE_ARN="$(
  aws acm request-certificate \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --domain-name "$DOMAIN_NAME" \
    --validation-method DNS \
    --query CertificateArn \
    --output text
)"
printf '%s\n' "$CERTIFICATE_ARN"
```

Wait until ACM publishes its validation record, then retrieve it:

```bash
export VALIDATION_NAME=None
while [ "$VALIDATION_NAME" = "None" ]; do
  export VALIDATION_NAME="$(
    aws acm describe-certificate \
      --profile "$AWS_PROFILE" \
      --region "$AWS_REGION" \
      --certificate-arn "$CERTIFICATE_ARN" \
      --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Name' \
      --output text
  )"
  [ "$VALIDATION_NAME" = "None" ] && sleep 5
done

aws acm describe-certificate \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --certificate-arn "$CERTIFICATE_ARN" \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord.[Name,Type,Value]' \
  --output table
```

In GoDaddy, add the returned record as a CNAME:

- Remove the root-domain suffix from ACM's record `Name`; enter the remainder in GoDaddy's **Name** field. For example, if ACM returns `_token.api.example.com.` and the GoDaddy zone is `example.com`, enter `_token.api`.
- Enter ACM's validation hostname in GoDaddy's **Value** field. A trailing dot may be omitted if GoDaddy removes it.
- Do not include `https://`, a port, or a path in either field.
- This is the **ACM validation CNAME**, not the application CNAME. Keep it permanently so ACM can renew the certificate.

Wait for validation and confirm the terminal status:

```bash
aws acm wait certificate-validated \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --certificate-arn "$CERTIFICATE_ARN"

aws acm describe-certificate \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --certificate-arn "$CERTIFICATE_ARN" \
  --query 'Certificate.Status' \
  --output text
```

Continue only when the status is `ISSUED`. Do not change the existing application DNS during certificate validation.

## 3. Verify and Bootstrap

Run repository verification and build the Lambda asset:

```bash
npm ci
npm run check
npm run build
```

Synthesize and inspect with all deployment contexts:

```bash
npx cdk synth \
  --app 'tsx infra/app.ts' \
  --all \
  -c domainName="$DOMAIN_NAME" \
  -c certificateArn="$CERTIFICATE_ARN" \
  -c ingressStackName="$INGRESS_STACK_NAME" \
  -c stackName="$API_STACK_NAME" \
  -c pathPrefix="$PATH_PREFIX" \
  -c listenerRulePriority="$LISTENER_RULE_PRIORITY" \
  -c deployTargetPrefix="$DEPLOY_TARGET_PREFIX"

npx cdk bootstrap "aws://${AWS_ACCOUNT_ID}/${AWS_REGION}" \
  --profile "$AWS_PROFILE"
```

There is no HTTP deployment mode. Omitting `domainName` or `certificateArn` is a synthesis error; local development is the supported no-AWS/no-TLS environment.

## 4. Fresh Deployment

Use this section only when `SharedIngress` and `DeployApi` have never been deployed in the account/Region.

Deploy both stacks:

```bash
npx cdk deploy \
  --app 'tsx infra/app.ts' \
  --all \
  --profile "$AWS_PROFILE" \
  -c domainName="$DOMAIN_NAME" \
  -c certificateArn="$CERTIFICATE_ARN" \
  -c ingressStackName="$INGRESS_STACK_NAME" \
  -c stackName="$API_STACK_NAME" \
  -c pathPrefix="$PATH_PREFIX" \
  -c listenerRulePriority="$LISTENER_RULE_PRIORITY" \
  -c deployTargetPrefix="$DEPLOY_TARGET_PREFIX"
```

Retrieve the shared-ingress outputs:

```bash
export ALB_DNS_NAME="$(
  aws cloudformation describe-stacks \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --stack-name "$INGRESS_STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue | [0]" \
    --output text
)"

export HTTPS_LISTENER_ARN="$(
  aws cloudformation describe-stacks \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --stack-name "$INGRESS_STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='HttpsListenerArn'].OutputValue | [0]" \
    --output text
)"

printf 'ALB DNS: %s\nListener ARN: %s\n' "$ALB_DNS_NAME" "$HTTPS_LISTENER_ARN"
```

In GoDaddy, create the separate **application CNAME**:

- For `api.example.com` in the `example.com` zone, set **Name** to `api`.
- Set **Value** to the `AlbDnsName` output, such as `internal-name.region.elb.amazonaws.com`.
- Do not include `https://`, `/cicd`, or any other path.
- Do not point the record to an ALB IP address; ALB addresses can change.

This application CNAME is distinct from the ACM validation CNAME. Both records must remain present.

## 5. Retrieve Service Outputs and Provision a Client

```bash
export API_URL="$(
  aws cloudformation describe-stacks \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --stack-name "$API_STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue | [0]" \
    --output text
)"

export TABLE_NAME="$(
  aws cloudformation describe-stacks \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --stack-name "$API_STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue | [0]" \
    --output text
)"

printf 'API URL: %s\nTable: %s\n' "$API_URL" "$TABLE_NAME"

TABLE_NAME="$TABLE_NAME" npm run create-client -- \
  --client-id ci-example \
  --scopes upload,deploy \
  --functions "$TARGET_FUNCTION" \
  --write
```

Store the printed bearer token immediately in the CI secret store; it is shown only once. Export it temporarily for smoke testing:

```bash
export API_TOKEN='<new bearer token>'
```

## 6. Smoke-Test the Mounted API

Wait for GoDaddy DNS to resolve to the ALB, then verify the public health route:

```bash
curl -fsS "https://${DOMAIN_NAME}${PATH_PREFIX}/healthz"
```

Verify one authenticated read:

```bash
curl -fsS \
  -H "Authorization: Bearer $API_TOKEN" \
  "https://${DOMAIN_NAME}${PATH_PREFIX}/v1/builds"
```

The public prefix is an ingress concern. The ALB rewrites `/cicd/healthz` to internal `/healthz` and `/cicd/v1/builds` to internal `/v1/builds`. An unmatched shared-domain path returns the listener's fixed 404 instead of reaching this Lambda.

## 7. Run the Upload and Deploy Journey

This journey uses `https://api.example.com/cicd` as its base. It requires `jq` and a valid Lambda deployment zip at `PACKAGE_ZIP`.

```bash
export BASE_URL="https://${DOMAIN_NAME}${PATH_PREFIX}"

export REGISTER_RESPONSE="$(
  curl -fsS -X POST "$BASE_URL/v1/builds" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H 'content-type: application/json' \
    -d '{"name":"smoke-test","gitCommit":"operator-smoke"}'
)"
export BUILD_ID="$(printf '%s' "$REGISTER_RESPONSE" | jq -r '.build.buildId')"
export UPLOAD_URL="$(printf '%s' "$REGISTER_RESPONSE" | jq -r '.uploadUrl')"

curl -fsS -X PUT \
  -H 'content-type: application/zip' \
  --upload-file "$PACKAGE_ZIP" \
  "$UPLOAD_URL"

curl -fsS -X POST "$BASE_URL/v1/builds/$BUILD_ID/complete" \
  -H "Authorization: Bearer $API_TOKEN"

export DEPLOY_RESPONSE="$(
  curl -fsS -X POST "$BASE_URL/v1/deployments" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H 'content-type: application/json' \
    -d "$(jq -n \
      --arg buildId "$BUILD_ID" \
      --arg targetFunction "$TARGET_FUNCTION" \
      '{buildId: $buildId, targetFunction: $targetFunction}')"
)"
printf '%s\n' "$DEPLOY_RESPONSE" | jq .

export DEPLOYMENT_ID="$(printf '%s' "$DEPLOY_RESPONSE" | jq -r '.deployment.deploymentId')"
curl -fsS \
  -H "Authorization: Bearer $API_TOKEN" \
  "$BASE_URL/v1/deployments/$DEPLOYMENT_ID"
```

The PUT goes directly to the presigned S3 URL. Package bytes bypass the ALB and its approximately 1 MB request-body limit.

## 8. Existing-Environment Cutover

This migration is prepared here but must not be executed without explicit operator approval. Do not use the fresh `cdk deploy --all` command for an existing environment.

1. Complete certificate request and GoDaddy validation without changing the current application CNAME.
2. Run a credentialed diff with the exact contexts:

   ```bash
   npx cdk diff \
     --app 'tsx infra/app.ts' \
     --all \
     --profile "$AWS_PROFILE" \
     -c domainName="$DOMAIN_NAME" \
     -c certificateArn="$CERTIFICATE_ARN" \
     -c ingressStackName="$INGRESS_STACK_NAME" \
     -c stackName="$API_STACK_NAME" \
     -c pathPrefix="$PATH_PREFIX" \
     -c listenerRulePriority="$LISTENER_RULE_PRIORITY" \
     -c deployTargetPrefix="$DEPLOY_TARGET_PREFIX"
   ```

3. Confirm that the diff creates the shared VPC, ALB, HTTPS listener, target group, `/cicd` rule, and fixed 404 default. Confirm that it does **not** replace the DynamoDB table, S3 bucket, or API Lambda. Stop on any stateful replacement.
4. Use an operator-reviewed two-phase CloudFormation/CDK change that deploys the new shared ingress and `/cicd` route while retaining the old dedicated ingress during validation. The final-state template removes the old ingress, so a one-step service-stack update does not by itself provide this safety window. Stop if the reviewed migration cannot defer those removals.
5. Verify the new target group is healthy through AWS target-health inspection. The new ALB's AWS DNS name may be used only for lower-level DNS, TCP, and TLS diagnostics. It is not the public HTTPS endpoint and direct HTTPS hostname verification will fail because the certificate covers `DOMAIN_NAME`, not the AWS ALB hostname.
6. Change only the GoDaddy application CNAME (for example, Name `api`) to the new `AlbDnsName`. Do not alter ACM's validation CNAME.
7. Verify `https://<domain>/cicd/healthz` and one authenticated `GET /cicd/v1/builds`.
8. Observe API Lambda logs, ALB target health, and client errors through at least the DNS TTL window.
9. Only after the new path is healthy and the DNS window has passed should an explicitly approved second phase permit CloudFormation to remove the obsolete dedicated ALB and VPC resources.

This runbook intentionally contains no destroy or manual resource-deletion command. If the repository has never been deployed, skip this cutover section: deploy both stacks normally and create the GoDaddy application CNAME after `AlbDnsName` exists.

## 9. Add a Future API

The shared stack's `HttpsListenerArn` is the integration contract for another repository or stack. A future API must:

1. import that listener ARN instead of creating another VPC, ALB, certificate, or listener;
2. select an unused listener-rule priority and record it in the registry in [design doc 0005](design-docs/0005-shared-alb-path-routing.md);
3. create and own its Lambda target group and health check;
4. match both its exact prefix and wildcard prefix, such as `/orders` and `/orders/*`;
5. rewrite the external prefix before forwarding so its internal routes remain unchanged;
6. leave the shared listener's fixed 404 default action unchanged.

The current registry reserves priority `100` for `/cicd`.
