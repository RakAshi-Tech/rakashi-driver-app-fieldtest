# Phase 1 cutover runbook

Steps 0–3 are already done. This is the single short window that takes the API
from open to closed.

| Done | Step | State |
|---|---|---|
| ✅ | 0. CORS allows `authorization` | applied |
| ✅ | 1. `RakashiAuthStack` | `CREATE_COMPLETE` |
| ✅ | 2. `.env.local` | set locally; **Vercel still to do** |
| ✅ | 3. RDS migration 001 | applied, verified |
| ⏳ | 4. Lambda → Phase 1 | zip built, **not deployed** |
| ⏳ | 5. Routes → JWT | all three still `NONE` |

**Identifiers**

```
API id                zjhgxrmv5i          stage: prod
Route ids             /query              mtqd6vi
                      /storage/upload-url rfgzkf4
                      /realtime/poll      geoh502
Authorizer id         0txbwd
User pool             ap-northeast-1_jeds8qN5R
App client            2kgf163oc5gc9rto35f2tfa2da
Rollback Lambda ver   1   (arn:aws:lambda:ap-northeast-1:<account>:function:rakashi-driver-api:1)
Rollback sha256       dL/m9gIXFzWfVzp2uE660PUOe//vNxbqG9CdDDcCtaE=
```

---

## The outage window

The API returns 401 for everything from the moment stage D lands until stage G
completes. Nothing before D affects the running app, and nothing after G does.

```
A  Vercel env vars          no impact
B  Deploy new frontend      no impact - old Lambda ignores the token it now sends
C  Register + get a token   no impact
─────────────────────────────────────────────────── outage starts
D  Lambda -> Phase 1        401 everywhere: the routes send no claims yet
E  /realtime/poll -> JWT    poll works; /query and upload still 401
F  /query -> JWT            query works
G  /storage/upload-url      all three work
─────────────────────────────────────────────────── outage ends
H  Cleanup                  no impact
```

**Budget 5–10 minutes**, dominated by the checks at E, not by AWS. D and E–G
each take seconds to apply. Run it outside delivery hours.

Do not start D until C has succeeded. A token that cannot be minted is the one
failure that leaves you stuck mid-window with nothing to verify against.

---

## A. Vercel environment variables

Set on the `rakashi-driver-app-fieldtest` project, all environments. None carry
`NEXT_PUBLIC_`, so none reach the browser bundle.

| Name | Value |
|---|---|
| `COGNITO_REGION` | `ap-northeast-1` |
| `COGNITO_USER_POOL_ID` | `ap-northeast-1_jeds8qN5R` |
| `COGNITO_CLIENT_ID` | `2kgf163oc5gc9rto35f2tfa2da` |
| `COGNITO_CLIENT_SECRET` | read it with the command below; never paste it into chat or a ticket |

```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id ap-northeast-1_jeds8qN5R \
  --client-id 2kgf163oc5gc9rto35f2tfa2da \
  --region ap-northeast-1 --query 'UserPoolClient.ClientSecret' --output text
```

**Leave `NEXT_PUBLIC_API_KEY` in place.** The frontend currently in production
still sends it, and CORS still allows the header. It is removed in stage H.

## B. Deploy the frontend

Deploy the `feature/phase1-cognito-auth` build. Harmless while the old Lambda is
live: it starts sending `Authorization`, which the old code ignores, and the
routes are still open.

Check afterwards: `/login` renders the password screen, and the browser console
shows no CORS error.

## C. Prove a token can be minted — the gate on the whole window

This is the first real exercise of the pre-token trigger. Register through
`/login` in the browser, then read the access token from DevTools, or mint one
directly:

```bash
POOL=ap-northeast-1_jeds8qN5R
CLIENT=2kgf163oc5gc9rto35f2tfa2da
SECRET=$(aws cognito-idp describe-user-pool-client --user-pool-id $POOL \
  --client-id $CLIENT --region ap-northeast-1 \
  --query 'UserPoolClient.ClientSecret' --output text)
PHONE='+91XXXXXXXXXX'          # a real E.164 number you control
PASS='<at least 8 chars, lowercase + digits>'

SECRET_HASH=$(python -c "
import hmac,hashlib,base64,sys
print(base64.b64encode(hmac.new(sys.argv[3].encode(),(sys.argv[1]+sys.argv[2]).encode(),hashlib.sha256).digest()).decode())
" "$PHONE" "$CLIENT" "$SECRET")

aws cognito-idp sign-up --client-id $CLIENT --username "$PHONE" --password "$PASS" \
  --secret-hash "$SECRET_HASH" --user-attributes Name=phone_number,Value="$PHONE" \
  --region ap-northeast-1

TOKEN=$(aws cognito-idp initiate-auth --client-id $CLIENT \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$PHONE",PASSWORD="$PASS",SECRET_HASH="$SECRET_HASH" \
  --region ap-northeast-1 --query 'AuthenticationResult.AccessToken' --output text)

python -c "
import base64,json,sys
p=sys.argv[1].split('.')[1]; p+='='*(-len(p)%4)
c=json.loads(base64.urlsafe_b64decode(p))
for k in ['token_use','client_id','scope','phone_number','sub','exp']:
    print('%-14s %s' % (k, c.get(k, '*** MISSING ***')))
" "$TOKEN"
```

All five must hold, or stop and fix before going further:

- `token_use` = `access`
- `client_id` = `2kgf163oc5gc9rto35f2tfa2da` — Cognito access tokens carry no
  `aud`, and API Gateway falls back to `client_id` only when `aud` is absent
- `scope` contains `aws.cognito.signin.user.admin` — Cognito API sign-in issues
  exactly this one, and stage E requires it
- `phone_number` is present and E.164 — **the pre-token trigger's first real
  test.** If it is missing, profile creation fails on the NOT NULL constraint.
  Check `/aws/lambda/rakashi-driver-pre-token` in CloudWatch
- `exp` is ~15 minutes out

Keep `$TOKEN` for stages E–G. Re-mint if it expires.

## D. Lambda → Phase 1  *(outage starts)*

```bash
cd lambda && npm test          # 36 tests must pass
aws lambda update-function-code \
  --function-name rakashi-driver-api \
  --zip-file fileb://lambda.zip --region ap-northeast-1 \
  --query '{Sha:CodeSha256,Modified:LastModified,State:State}' --output json
aws lambda wait function-updated-v2 --function-name rakashi-driver-api --region ap-northeast-1
```

Expected sha256 of the built zip: `sFSVjEaB4spAtZRbcroX8rSMjjuh+gSYJ6N3z6rZPkg=`
(re-check with `npm run deploy` if the code changed since).

Everything answers 401 from here. That is correct, not a fault: the routes still
attach no authorizer, so no claims reach the handler and it fails closed.

## E. `/realtime/poll` → JWT

The least-used route goes first, so the audience/scope pairing is proven on one
route rather than three.

```bash
API=zjhgxrmv5i; AUTH=0txbwd; R=ap-northeast-1
aws apigatewayv2 update-route --api-id $API --route-id geoh502 \
  --authorization-type JWT --authorizer-id $AUTH \
  --authorization-scopes aws.cognito.signin.user.admin --region $R
```

Both checks must pass:

```bash
BODY='{"table":"delivery_requests","since":"2026-01-01T00:00:00Z"}'
URL=https://$API.execute-api.$R.amazonaws.com/prod/realtime/poll

curl -s -o /dev/null -w 'no token  -> %{http_code}\n' -X POST $URL \
  -H 'Content-Type: application/json' -d "$BODY"        # expect 401

curl -s -o /dev/null -w 'token     -> %{http_code}\n' -X POST $URL \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" -d "$BODY"          # expect 200
```

A 401 *with* a valid token means the authorizer rejected it — check the audience
and the `scope` claim from stage C. A 403 means the token was accepted and the
Lambda's ownership guard refused: read the body, it is a policy answer, not an
authorizer one.

Do not continue until both lines read as expected.

## F. `/query` → JWT

```bash
aws apigatewayv2 update-route --api-id $API --route-id mtqd6vi \
  --authorization-type JWT --authorizer-id $AUTH \
  --authorization-scopes aws.cognito.signin.user.admin --region $R

Q='{"table":"driver_profiles","operation":"select","countExact":true}'
URL=https://$API.execute-api.$R.amazonaws.com/prod/query
curl -s -o /dev/null -w 'no token  -> %{http_code}\n' -X POST $URL -H 'Content-Type: application/json' -d "$Q"
curl -s -w 'token     -> %{http_code}\n' -X POST $URL -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d "$Q"
```

401 then 200. The authenticated count is scoped to the caller, so a driver with
no profile yet sees `{"count":0}` — the two test rows carry a NULL `cognito_sub`
and belong to nobody.

## G. `/storage/upload-url` → JWT  *(outage ends)*

```bash
aws apigatewayv2 update-route --api-id $API --route-id rfgzkf4 \
  --authorization-type JWT --authorizer-id $AUTH \
  --authorization-scopes aws.cognito.signin.user.admin --region $R

aws apigatewayv2 get-routes --api-id $API --region $R \
  --query 'Items[].{Route:RouteKey,Auth:AuthorizationType,Scopes:AuthorizationScopes}' --output table
```

All three rows must read `JWT` with the scope set.

## H. Cleanup and end-to-end

1. Remove `NEXT_PUBLIC_API_KEY` from Vercel and redeploy.
2. Drop the now-unused header:
   ```bash
   aws apigatewayv2 update-api --api-id zjhgxrmv5i --region ap-northeast-1 \
     --cors-configuration file://infra/api-cors.final.json
   ```
3. Walk the app: register → profile → dashboard → a delivery with GPS → complete
   it → confirm the delivery count increments and the route was stored.
4. Confirm `driver_profiles` gained exactly one row and the two test rows are
   untouched (counts only).

---

## Rollback

Reopening the routes restores service immediately; do that first, then the code.

```bash
API=zjhgxrmv5i; R=ap-northeast-1
for RID in geoh502 mtqd6vi rfgzkf4; do
  aws apigatewayv2 update-route --api-id $API --route-id $RID \
    --authorization-type NONE --region $R
done

# Then the Lambda, from the artifact taken before the cutover.
aws lambda update-function-code --function-name rakashi-driver-api \
  --zip-file fileb://<path>/rakashi-driver-api-v1.zip --region $R \
  --query 'CodeSha256' --output text
# must print dL/m9gIXFzWfVzp2uE660PUOe//vNxbqG9CdDDcCtaE=
```

If that artifact is lost, it is always recoverable from published version 1:

```bash
curl -o rollback.zip "$(aws lambda get-function --function-name rakashi-driver-api \
  --qualifier 1 --region ap-northeast-1 --query 'Code.Location' --output text)"
```

The RDS migration does not need rolling back — the old code ignores
`cognito_sub`. Only if you are abandoning Phase 1 entirely:

```sql
BEGIN;
DROP INDEX IF EXISTS idx_driver_profiles_cognito_sub;
ALTER TABLE driver_profiles DROP COLUMN IF EXISTS cognito_sub;
COMMIT;
```

`RakashiAuthStack` can stay: it costs nothing while no route uses the authorizer.

---

## Note: the outage is avoidable, at a price

Attaching the authorizer *before* updating the Lambda (E–G, then D) would keep
the API serving throughout: the old handler ignores authorizer context entirely,
so authenticated calls keep working while unauthenticated ones are refused at the
gateway.

The cost is that during that window the old, unscoped handler serves authenticated
users — any signed-in driver could still read every driver's rows. That is
strictly better than today, but it is not the Phase 1 guarantee, and it makes a
failure harder to attribute because two things change under load rather than one.

The order above is the deliberate choice: a few minutes of clean downtime, one
change at a time, each independently verifiable and reversible.
