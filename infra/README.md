# Phase 1 authentication — deployment

Everything here is additive. `DeliveryAwsStack` (the CDK stack that owns the VPC,
RDS instance, S3 bucket, secrets and the legacy `delivery-user-pool`) is not
referenced or modified by any step below, and the legacy pool is left in place.

> **IaC note.** The API Gateway HTTP API (`rakashi-driver-gateway`) and the Lambda
> (`rakashi-driver-api`) were created outside CloudFormation and belong to no
> stack. New resources go into `rakashi-auth.yaml` so they are version-controlled;
> the two route/function updates below act on resources that were never in IaC, so
> they introduce no new drift. Importing the API and Lambda into a stack is a
> Phase 2 task.

Region for every command: `ap-northeast-1`.

---

## 1. Deploy the auth stack

Creates a new Cognito user pool that signs in with a phone number, its app
client, two small Cognito triggers, and a JWT authorizer on the existing API.
Creating the authorizer changes nothing on its own — no route uses it until
step 5.

```bash
aws cloudformation deploy \
  --template-file infra/rakashi-auth.yaml \
  --stack-name RakashiAuthStack \
  --parameter-overrides ApiId=zjhgxrmv5i \
  --capabilities CAPABILITY_IAM \
  --region ap-northeast-1
```

Read back the values the later steps need:

```bash
aws cloudformation describe-stacks \
  --stack-name RakashiAuthStack --region ap-northeast-1 \
  --query 'Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}' --output table
```

The app client is confidential, so fetch its secret separately (treat it as a
credential — it belongs in Vercel's env vars, never in git):

```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id <UserPoolId> --client-id <UserPoolClientId> \
  --region ap-northeast-1 --query 'UserPoolClient.ClientSecret' --output text
```

## 2. Environment variables

Server-side only — none of these carry the `NEXT_PUBLIC_` prefix, so none reach
the browser bundle. Set them in `.env.local` for development and in the Vercel
project settings for deployment.

```
COGNITO_REGION=ap-northeast-1
COGNITO_USER_POOL_ID=<UserPoolId>
COGNITO_CLIENT_ID=<UserPoolClientId>
COGNITO_CLIENT_SECRET=<from the command above>
```

`NEXT_PUBLIC_API_KEY` is no longer read by anything and should be deleted from
both places. HTTP APIs never enforced it, and it shipped inside the client bundle.

## 3. Database migration

Adds a nullable `cognito_sub` column plus a partial unique index. It reads no
existing row and writes to none.

```bash
psql "$DATABASE_URL" -f infra/migrations/001_add_cognito_sub.sql
```

The RDS instance is not publicly reachable, so run this from inside the VPC (a
bastion, or a one-off Lambda/ECS task on the same subnets).

## 4. Deploy the Lambda

```bash
cd lambda && npm run deploy      # tsc -> dist -> lambda.zip
aws lambda update-function-code \
  --function-name rakashi-driver-api \
  --zip-file fileb://lambda.zip --region ap-northeast-1
```

The new code requires a JWT on every request. Because the routes still send no
authorizer context at this point, **the API will return 401 for everything from
here until step 5 completes.** Keep the gap between these two steps short, and
run them outside delivery hours.

## 5. Attach the authorizer to the routes  (the cutover)

This is the step that closes the public API. Do it only after step 4 is live and
the frontend is deployed.

```bash
API=zjhgxrmv5i
AUTH=<AuthorizerId from step 1>
for ROUTE in $(aws apigatewayv2 get-routes --api-id $API --region ap-northeast-1 \
                 --query 'Items[].RouteId' --output text); do
  aws apigatewayv2 update-route --api-id $API --route-id $ROUTE \
    --authorization-type JWT --authorizer-id $AUTH \
    --authorization-scopes aws.cognito.signin.user.admin \
    --region ap-northeast-1
done
```

Verify — an unauthenticated call must now be refused:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://$API.execute-api.ap-northeast-1.amazonaws.com/prod/query \
  -H 'Content-Type: application/json' \
  -d '{"table":"driver_profiles","operation":"select","countExact":true}'
# expect 401
```

### Rollback

Reopening the routes restores the previous behaviour immediately:

```bash
aws apigatewayv2 update-route --api-id $API --route-id <ROUTE_ID> \
  --authorization-type NONE --region ap-northeast-1
```

Roll the Lambda back alongside it, since the new code refuses requests that
arrive without claims.

---

## Phase 2 — already prepared for

- **SMS OTP.** Add `phone_number` to `AutoVerifiedAttributes`, add `SMS_OTP` to
  `AllowedFirstAuthFactors`, give the pool an `SmsConfiguration` role, and drop
  the pre-signup trigger. On the frontend, `AUTH_MODE` in `lib/auth.ts` becomes
  `"SMS_OTP"` and the OTP screen — still present in `app/login/page.tsx` — renders
  again. Sending to Indian numbers additionally needs TRAI DLT registration and
  an SNS sandbox exit; both are external processes, which is why Phase 1 does not
  depend on them.
- Move the Lambda's DB credentials to Secrets Manager (needs a VPC interface
  endpoint), give `ocr_logs` a `driver_id`, recompute profile totals server-side,
  and import the API and Lambda into IaC.
