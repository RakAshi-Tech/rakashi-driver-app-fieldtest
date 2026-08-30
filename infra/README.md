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

## 0. Allow the Authorization header through CORS

Phase 1 sends `Authorization: Bearer <access token>` on every API call. The app
runs on Vercel and the API on `execute-api`, so those calls are cross-origin and
the browser sends a preflight first. The API was created with
`AllowHeaders: ["content-type", "x-api-key"]`, which does not list
`authorization` - so the browser refuses every request before it leaves the page.
Nothing reaches API Gateway or the Lambda, and nothing appears in any log.

The desired configuration is version-controlled in `infra/api-cors.json`. This
HTTP API predates CloudFormation and belongs to no stack, so it cannot be
expressed as a template resource until the API is imported (a Phase 2 task);
until then that file is the source of truth and the command below applies it.

```bash
aws apigatewayv2 update-api --api-id zjhgxrmv5i --region ap-northeast-1 \
  --cors-configuration file://infra/api-cors.json
```

Verify:

```bash
aws apigatewayv2 get-api --api-id zjhgxrmv5i --region ap-northeast-1 \
  --query 'CorsConfiguration.AllowHeaders'
# expect ["content-type","authorization"]
```

`AllowOrigins` stays `*` and `AllowCredentials` stays `false`: the token travels
in a header, and the only cookie in the design is the refresh cookie, which is
same-origin to the Next.js route handlers and never sent to this API.

**Do this first.** While the routes are still `AuthorizationType: NONE` the extra
allowed header changes nothing, so it is safe to apply well ahead of the cutover
- and applying it afterwards would ship a window in which every call fails.

### Rollback

```bash
aws apigatewayv2 update-api --api-id zjhgxrmv5i --region ap-northeast-1 \
  --cors-configuration file://infra/api-cors.rollback.json
```

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

Adds a nullable `cognito_sub` column plus a unique index on it. It reads no
existing row and writes to none.

The index is deliberately *not* partial. `ON CONFLICT (cognito_sub)`, which the
profile upsert emits, can only infer a partial index when the statement repeats
the index predicate - and it does not - so a `WHERE cognito_sub IS NOT NULL`
index would make every profile upsert fail with `there is no unique or exclusion
constraint matching the ON CONFLICT specification`. A plain unique index is
equivalent here anyway: PostgreSQL never treats two NULLs as equal, so any number
of unlinked rows is still allowed.

```bash
psql "$DATABASE_URL" -f infra/migrations/001_add_cognito_sub.sql
```

The RDS instance is not publicly reachable, so run this from inside the VPC (a
bastion, or a one-off Lambda/ECS task on the same subnets).

## 4. Deploy the Lambda

Run the tests first. They cover the ownership guard, the server-settled columns
and the upsert/index pairing:

```bash
cd lambda && npm test
```

```bash
cd lambda && npm run deploy      # tsc -> dist -> lambda.zip
aws lambda update-function-code \
  --function-name rakashi-driver-api \
  --zip-file fileb://lambda.zip --region ap-northeast-1
```

`npm run zip` deletes any previous `lambda.zip` before building a new one (`zip
-r` appends to an existing archive, which would leave stale modules behind) and
uses Python's `shutil.make_archive`. Windows PowerShell 5.1's `Compress-Archive`
is not a substitute: it writes backslash path separators into the archive, which
Lambda cannot unpack.

Take a rollback point before overwriting the function:

```bash
aws lambda publish-version --function-name rakashi-driver-api \
  --region ap-northeast-1 --query 'Version' --output text
```

The new code requires a JWT on every request. Because the routes still send no
authorizer context at this point, **the API will return 401 for everything from
here until step 5 completes.** Keep the gap between these two steps short, and
run them outside delivery hours.

## 5. Attach the authorizer to the routes  (the cutover)

This is the step that closes the public API. Do it only after step 4 is live and
the frontend is deployed.

This API has exactly three routes and no `OPTIONS` or `$default` route, so
attaching the authorizer cannot break CORS preflight - API Gateway answers
preflight from the API-level CORS configuration without consulting an authorizer.

Go one route at a time. The audience/scope pairing below is verified against the
documentation but not against this pool until a real token has been through it,
so prove it on the least-used route before closing the other two.

```bash
API=zjhgxrmv5i
AUTH=<AuthorizerId from step 1>
R=ap-northeast-1

# Route ids: /query = mtqd6vi, /storage/upload-url = rfgzkf4, /realtime/poll = geoh502
aws apigatewayv2 update-route --api-id $API --route-id geoh502 \
  --authorization-type JWT --authorizer-id $AUTH \
  --authorization-scopes aws.cognito.signin.user.admin --region $R
```

Prove both halves on that one route before continuing - unauthenticated must be
refused, and a real access token must be accepted:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://$API.execute-api.$R.amazonaws.com/prod/realtime/poll \
  -H 'Content-Type: application/json' \
  -d '{"table":"delivery_requests","since":"2026-01-01T00:00:00Z"}'
# expect 401

curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://$API.execute-api.$R.amazonaws.com/prod/realtime/poll \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"table":"delivery_requests","since":"2026-01-01T00:00:00Z"}'
# expect 200
```

Only then close the remaining two:

```bash
for ROUTE in mtqd6vi rfgzkf4; do
  aws apigatewayv2 update-route --api-id $API --route-id $ROUTE \
    --authorization-type JWT --authorizer-id $AUTH \
    --authorization-scopes aws.cognito.signin.user.admin --region $R
done
```

The scope is not decoration. Cognito ID tokens carry `aud` equal to the app
client id, so the audience check alone would accept an ID token in place of an
access token; an ID token has no `scope` claim, so requiring one rejects it.
Amazon Cognito API sign-in issues exactly `aws.cognito.signin.user.admin`, which
is why that is the value. `identity.ts` re-checks `token_use` as a second layer.

### Rollback

Reopening the routes restores the previous behaviour immediately:

```bash
aws apigatewayv2 update-route --api-id $API --route-id <ROUTE_ID> \
  --authorization-type NONE --region ap-northeast-1
```

Roll the Lambda back alongside it, since the new code refuses requests that
arrive without claims. Reopening the routes does not undo step 0; the extra
allowed CORS header is harmless either way, and `infra/api-cors.rollback.json`
restores the original list if it ever needs to be.

---

## Phone numbers, and the two rows already in the table

There is no migration of existing users, because there are no existing users.
The two rows in `driver_profiles` are development test data. They keep a NULL
`cognito_sub` after step 3 and are simply unreachable: every caller is resolved
by `cognito_sub` alone, so a row that carries none belongs to nobody and is
returned to nobody. Nothing needs to be done to them, and this deployment does
not touch them.

Numbers are held in exactly one shape, E.164 `+91XXXXXXXXXX`, and the server is
what puts them in it:

1. `toE164India()` in `lib/phone.ts` normalises what the driver typed, in the
   route handler, before Cognito ever sees it. Ten local digits, or the same
   number carrying `+91`, `91` or a leading `0`, all converge on one string.
2. Cognito stores that as the user's `phone_number` and validates it as E.164.
3. The pre token generation trigger copies the pool's own attribute into the
   access token, so the value the API sees is signed rather than submitted.
4. `identity.ts` re-checks the claim against `/^\+[1-9]\d{7,14}$/` and the
   handler stamps it onto the profile. A number that fails the check is not
   stored at all.

There is deliberately no code that adopts an existing profile by phone number.
Phase 1 confirms accounts without proving phone ownership - the pre-signup
trigger sets `autoConfirmUser` but not `autoVerifyPhone` - so a lookup by number
would let anyone who can register a number take over whatever profile carried
it. A profile is only ever created by its own owner, keyed on `cognito_sub`.

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
  endpoint), give `ocr_logs` a `driver_id` so its reads can be opened up and its
  writes scoped by owner rather than by a required filter, and import the API and
  Lambda into IaC.
- `trust_score` still only ever holds its database default (10) or a value set by
  operations staff: nothing recomputes it. The dashboard reads it, so the card
  shows 10 for every new driver. Deciding the formula is a product question, not
  a security one, and is deliberately left alone here.
- `gps_delivery_summary.earnings_inr` is still typed in by the driver at
  completion, so the recounted `total_earnings_inr` is only as trustworthy as
  that entry. The server-settled figure is `delivery_requests.final_fare_inr`;
  moving the profile total onto it is the follow-up.
