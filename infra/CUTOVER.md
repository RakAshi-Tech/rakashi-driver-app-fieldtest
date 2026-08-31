# Phase 1 cutover runbook

Steps 0-3 are already done. This is the single short window that takes the API
from open to closed.

| Done | Step | State |
|---|---|---|
| ✅ | 0. CORS allows `authorization` | applied - `content-type`, `authorization`, `x-api-key` |
| ✅ | 1. `RakashiAuthStack` | `CREATE_COMPLETE` |
| ✅ | 2. `.env.local` | set locally; Vercel Preview and Production both set |
| ✅ | 3. RDS migration 001 | applied, verified |
| ✅ | Gate C. A token can be minted | **PASSED** - see P4 |
| ⏳ | D. Lambda → Phase 1 | zip built, **not deployed** |
| ⏳ | E-G. Routes → JWT | all three still `NONE` |
| ⏳ | H-I. main merge → Production | feature branch pushed, **not merged** |
| ⏳ | J. Drop `x-api-key` | deferred until the app is stable |

**Identifiers** (re-verified against AWS before this revision)

```
API id                zjhgxrmv5i          stage: prod (AutoDeploy: true)
Route ids             /query              mtqd6vi
                      /storage/upload-url rfgzkf4
                      /realtime/poll      geoh502
Authorizer id         0txbwd              JWT, aud 2kgf163oc5gc9rto35f2tfa2da
User pool             ap-northeast-1_jeds8qN5R   tier ESSENTIALS
App client            2kgf163oc5gc9rto35f2tfa2da
Rollback Lambda ver   1   (arn:aws:lambda:ap-northeast-1:<account>:function:rakashi-driver-api:1)
Rollback sha256       dL/m9gIXFzWfVzp2uE660PUOe//vNxbqG9CdDDcCtaE=
New Lambda sha256     sFSVjEaB4spAtZRbcroX8rSMjjuh+gSYJ6N3z6rZPkg=
```

---

## The one combination that must never reach production

**The new frontend must never run against the old Lambda.** Not for a minute,
not behind a feature flag, not as a "harmless" early deploy. This supersedes the
earlier version of this runbook, which deployed the frontend first and called it
`no impact`. That was wrong, and the reason is worth stating plainly because the
failure is silent.

The new frontend stopped sending ownership filters, because the new Lambda
derives ownership from the token instead. The old Lambda has no such derivation -
it has no authentication or authorization of any kind, and builds SQL from
exactly what the client sends. Put the two together and:

| New frontend call | Old Lambda's SQL | Result |
|---|---|---|
| `driver_profiles.update({fcm_token})`, no filter | `UPDATE driver_profiles SET fcm_token = $1` — **no WHERE** | every driver's push token overwritten |
| `driver_profiles.select('*').single()`, no filter | `SELECT * FROM driver_profiles LIMIT 1` | the driver sees someone else's profile, and caches that foreign `id` as their own |
| `upsert(..., {onConflict:'cognito_sub'})` | client no longer sends `cognito_sub`, so nothing ever conflicts | duplicate profile rows with a NULL `cognito_sub` |

`buildWhere([])` returns an empty string and the old handler's UPDATE branch has
no "refuse an unscoped write" guard - only its DELETE branch does. So the first
row of that table is not a hypothetical.

The ordering below exists to make that combination impossible: **AWS first, the
frontend last.** It also keeps rollback inside AWS for the whole outage window,
because nothing in Git or Vercel has moved yet.

## The outage window

Every ordering has an outage. The frontend in production today sends
`x-api-key` and no `Authorization` header, so it is refused by the authorizer the
moment stages E-G land, whichever Lambda is behind it. There is no zero-downtime
variant available: the only one that would serve traffic throughout is new
frontend plus old Lambda, which is the combination above.

So the goal is not to avoid the outage. It is to keep the failure mode at 401 -
loud, immediate and reversible - and to keep it short.

```
P1-P4  Preflight                no impact
─────────────────────────────────────────────────── outage starts
D      Lambda -> Phase 1        401 everywhere: the routes send no claims yet
E      /realtime/poll -> JWT    poll works with a token; the rest still 401
F      /query -> JWT            query works with a token
G      /storage/upload-url      the whole API works with a token
─────────────────────────────────────────────────── API restored
H      main merge -> Vercel     production frontend starts sending tokens
I      End-to-end               drivers register and work again
─────────────────────────────────────────────────── outage ends
J      Drop x-api-key           no impact, run it days later
```

**Budget 4-8 minutes for D-G**, dominated by the checks rather than by AWS: each
command takes seconds. H adds a Vercel build, so plan 6-10 minutes end to end.
Run it outside delivery hours.

Do not start D until P1-P4 are all green. A rollback artifact you have not
actually downloaded is the one thing that turns a bad window into a long one.

---

# Preflight

## P1. The rollback artifact

Version 1 is the code running in production right now - both it and `$LATEST`
report the same sha256, so version 1 is a true snapshot rather than an older one.
Download it before touching anything:

```bash
aws lambda get-function --function-name rakashi-driver-api --qualifier 1 \
  --region ap-northeast-1 --query 'Code.Location' --output text \
  | xargs curl -s -o rakashi-driver-api-v1.zip

python -c "
import hashlib,base64
print(base64.b64encode(hashlib.sha256(open('rakashi-driver-api-v1.zip','rb').read()).digest()).decode())
"
```

**Success:** prints `dL/m9gIXFzWfVzp2uE660PUOe//vNxbqG9CdDDcCtaE=`. If it does
not, stop: the rollback path is not proven and stage D must not start.

## P2. Production and Vercel preconditions

The stage `prod` has `AutoDeploy: true`, so route changes in E-G take effect the
moment they are applied. There is no separate deployment step, and no way to
stage them - which is exactly why they are applied one at a time.

Confirm before the window:

- The four `COGNITO_*` variables are set on the Vercel **Production**
  environment. None carry `NEXT_PUBLIC_`, so none reach the browser bundle.
  `COGNITO_CLIENT_SECRET` must equal the pool's own client secret:
  ```bash
  aws cognito-idp describe-user-pool-client \
    --user-pool-id ap-northeast-1_jeds8qN5R \
    --client-id 2kgf163oc5gc9rto35f2tfa2da \
    --region ap-northeast-1 --query 'UserPoolClient.ClientSecret' --output text
  ```
  Never paste that value into chat or a ticket. A mismatch fails every
  production sign-in, but costs only an env var fix - it does not extend the
  window.
- **Whether merging to `main` auto-deploys Production.** If it does, H is a
  single action rather than two, which is fine - H is deliberately last. What
  must not happen is a merge before D. Know which it is before you start.
- `NEXT_PUBLIC_API_KEY` stays in place until J. The frontend in production still
  sends it and CORS still allows the header.

## P3. The two legacy `driver_profiles` rows - no migration needed

`driver_profiles` holds two rows, both with a NULL `cognito_sub`. **They are
development test data, not real drivers.** There is deliberately no migration
path in Phase 1 - `identity.ts` never adopts a row by phone number, because
Phase 1 confirms sign-ups without verifying phone ownership - and none is wanted
here. Nothing needs to be linked, moved or deleted for the cutover.

They are invisible to every new user once the new Lambda is live. `POLICIES`
gives `driver_profiles` `ownership: 'own'` with `ownerColumn: 'id'`, so every
statement is rewritten to `... AND "id" = <the caller's own driver id>`, and that
id comes from the caller's `cognito_sub`. A caller with no profile row yet cannot
read at all - `requireDriverId` answers 403 first. Two rows belonging to no
subject are unreachable by construction.

**One exception, and it will bite the test account.** Ownership scoping is not
the only rule touching these rows: `phone_number` carries a UNIQUE constraint,
and `resolveCaller` refuses a caller whose number already sits on a row with a
different `cognito_sub`:

```
403  Phone number already belongs to another profile
```

One of the two legacy rows holds the Preview test number `+91**********90`. So
after stage D:

- **Production is unaffected**, as long as the number used in stage I is not on
  either legacy row. Check it first - counts only, no PII:
  ```bash
  URL=https://zjhgxrmv5i.execute-api.ap-northeast-1.amazonaws.com/prod/query
  curl -s -X POST $URL -H 'Content-Type: application/json' \
    -d '{"table":"driver_profiles","operation":"select","countExact":true,
         "filters":[{"column":"phone_number","op":"eq","value":"+91XXXXXXXXXX"}]}'
  ```
  `{"count":0}` means the number is free. Run this **before** the window, while
  `/query` is still open.
- **The Preview test account will get that 403** at profile creation, because its
  number is the one on the legacy row. Clear it when you want Preview testing to
  continue - either delete the row or null its number. It is test data, so either
  is fine, but it is a write to RDS and belongs outside the cutover window:
  ```sql
  -- pick one, run it before or after the window, never during
  DELETE FROM driver_profiles WHERE phone_number = '+91XXXXXXXXXX' AND cognito_sub IS NULL;
  UPDATE driver_profiles SET phone_number = NULL WHERE phone_number = '+91XXXXXXXXXX' AND cognito_sub IS NULL;
  ```

Until then, leave the Preview test user parked on the profile screen. Pressing
"complete registration" while the old Lambda is still live writes a third junk
row with a NULL `cognito_sub` - harmless, but pointless.

## P4. Gate C - a token can be minted  **PASSED**

This was the gate on the whole window, and it is closed. Recorded here so the
window does not re-litigate it:

| Check | Result |
|---|---|
| Cognito user created, `UserStatus` | 1 user, **CONFIRMED** |
| `phone_number` attribute | present, E.164 `+91…` |
| Pre-signup trigger | ran, no errors |
| Pre-token trigger | ran once at token issuance, 4.80 ms, no errors |
| V2_0 response shape | deployed code returns `claimsAndScopeOverrideDetails.accessTokenGeneration`; pool is `LambdaVersion: V2_0` on the ESSENTIALS tier |
| `token_use` = `access` | ✅ verified in the browser |
| `client_id` = `2kgf163oc5gc9rto35f2tfa2da` | ✅ Cognito access tokens carry no `aud`; API Gateway falls back to `client_id` |
| `scope` contains `aws.cognito.signin.user.admin` | ✅ required by the scope pinned on E-G |
| `phone_number` present and `+91` E.164 | ✅ the pre-token trigger's first real test |

Stages E-G still need a token in hand. Take one from the Preview browser
session, or mint one from the CLI with an account you control:

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
```

Keep `$TOKEN` for stages E-G. It lives 15 minutes; re-mint it rather than
hurrying.

Note that `1234567890` is a **Preview-only** number: `toE164India` accepts it
when `VERCEL_ENV === "preview"` and nowhere else, so Production and the CLI both
need a real Indian mobile number.

---

# The window

## D. Lambda → Phase 1  *(outage starts)*

```bash
cd lambda && npm test          # 36 tests must pass
aws lambda update-function-code \
  --function-name rakashi-driver-api \
  --zip-file fileb://lambda.zip --region ap-northeast-1 \
  --query '{Sha:CodeSha256,Modified:LastModified,State:State}' --output json
aws lambda wait function-updated-v2 --function-name rakashi-driver-api --region ap-northeast-1
```

**Success:** `Sha` is `sFSVjEaB4spAtZRbcroX8rSMjjuh+gSYJ6N3z6rZPkg=` and the
function reaches `Active`.

Everything answers 401 from here. That is correct, not a fault: the routes still
attach no authorizer, so no claims reach the handler and it fails closed. The
production frontend is down from this point until H.

## E. `/realtime/poll` → JWT

The least-used route goes first, so the audience/scope pairing is proven on one
route rather than three.

```bash
API=zjhgxrmv5i; AUTH=0txbwd; R=ap-northeast-1
aws apigatewayv2 update-route --api-id $API --route-id geoh502 \
  --authorization-type JWT --authorizer-id $AUTH \
  --authorization-scopes aws.cognito.signin.user.admin --region $R
```

```bash
BODY='{"table":"delivery_requests","since":"2026-01-01T00:00:00Z"}'
URL=https://$API.execute-api.$R.amazonaws.com/prod/realtime/poll

curl -s -o /dev/null -w 'no token  -> %{http_code}\n' -X POST $URL \
  -H 'Content-Type: application/json' -d "$BODY"        # expect 401

curl -s -o /dev/null -w 'token     -> %{http_code}\n' -X POST $URL \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" -d "$BODY"          # expect 200
```

**Success:** `401` then `200`.

A 401 *with* a valid token means the authorizer rejected it - check the audience
and the `scope` claim from P4. A 403 means the token was accepted and the
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

**Success:** `401`, then a `200` whose body is scoped to the caller. A token
whose subject has no profile row yet answers `403 No driver profile` rather than
`200` - also a pass, and the clearest possible proof that the read is scoped:
the two legacy rows are not counted for anybody.

## G. `/storage/upload-url` → JWT  *(API restored)*

```bash
aws apigatewayv2 update-route --api-id $API --route-id rfgzkf4 \
  --authorization-type JWT --authorizer-id $AUTH \
  --authorization-scopes aws.cognito.signin.user.admin --region $R

aws apigatewayv2 get-routes --api-id $API --region $R \
  --query 'Items[].{Route:RouteKey,Auth:AuthorizationType,Scopes:AuthorizationScopes}' --output table
```

**Success:** all three rows read `JWT` with `aws.cognito.signin.user.admin`. An
unauthenticated call to the route answers 401; an authenticated one answers what
the API is supposed to answer - a presigned URL for a caller with a profile, or
`403 No driver profile` for one without.

The API is now fully closed and fully working. Only the frontend is still old.

## H. `main` merge → Vercel Production

Now, and not before, the frontend moves:

```bash
git checkout main && git pull
git merge --no-ff feature/phase1-cognito-auth
git push origin main
```

Then let Vercel build Production, or promote the build if the project is not set
to deploy `main` automatically (P2 settled which).

**Success:** the Production deployment reports Ready, `/login` renders the phone
screen, and the browser console shows no CORS error. The old bundle's
`x-api-key` calls are gone with it.

## I. End-to-end on Production

Walk the app as a driver would, with a real Indian mobile number checked against
P3:

1. Register at `/login` → the password screen accepts the number.
2. Complete the profile → `/dashboard` loads with **your own** name.
3. Run a delivery with GPS, complete it, confirm the count increments and the
   route was stored.

**Success, checked with counts only:**

- `driver_profiles` gained exactly one row, and it carries a non-NULL
  `cognito_sub`.
- The two legacy rows are untouched - same count, same NULL `cognito_sub`.
- The new driver's dashboard never shows a name or trust score that is not
  theirs. Seeing a stranger's profile is the signature of an unscoped read and
  means stage F did not take.

## J. Drop `x-api-key`  *(days later, not in the window)*

Once the app has been stable for a while and no old bundle is still cached in a
driver's browser:

1. Remove `NEXT_PUBLIC_API_KEY` from Vercel and redeploy.
2. Narrow CORS to what is actually used:
   ```bash
   aws apigatewayv2 update-api --api-id zjhgxrmv5i --region ap-northeast-1 \
     --cors-configuration file://infra/api-cors.final.json
   ```

**Success:** the app keeps working and a preflight still passes. There is no
rush: the header is unused and unenforced, so leaving it allowed costs nothing
but tidiness.

---

## Rollback

Reopening the routes restores service immediately; do that first, then the code.
Nothing in Git or Vercel has moved before H, so a rollback during D-G is
entirely inside AWS.

**1. Routes → `NONE`** (do this first - it is what restores service)

```bash
API=zjhgxrmv5i; R=ap-northeast-1
for RID in geoh502 mtqd6vi rfgzkf4; do
  aws apigatewayv2 update-route --api-id $API --route-id $RID \
    --authorization-type NONE --region $R
done

aws apigatewayv2 get-routes --api-id $API --region $R \
  --query 'Items[].{Route:RouteKey,Auth:AuthorizationType}' --output table
```

**Success:** all three rows read `NONE`. `AutoDeploy` is on, so this is live as
soon as it returns.

**2. Lambda → version 1**

```bash
aws lambda update-function-code --function-name rakashi-driver-api \
  --zip-file fileb://rakashi-driver-api-v1.zip --region ap-northeast-1 \
  --query 'CodeSha256' --output text
aws lambda wait function-updated-v2 --function-name rakashi-driver-api --region ap-northeast-1
```

**Success:** prints `dL/m9gIXFzWfVzp2uE660PUOe//vNxbqG9CdDDcCtaE=`.

If the P1 artifact is lost, it is always recoverable from published version 1:

```bash
curl -o rollback.zip "$(aws lambda get-function --function-name rakashi-driver-api \
  --qualifier 1 --region ap-northeast-1 --query 'Code.Location' --output text)"
```

**Success of 1 + 2 together:** an unauthenticated call answers 200 again.

```bash
curl -s -o /dev/null -w 'rolled back -> %{http_code}\n' -X POST \
  https://zjhgxrmv5i.execute-api.ap-northeast-1.amazonaws.com/prod/query \
  -H 'Content-Type: application/json' \
  -d '{"table":"driver_profiles","operation":"select","countExact":true}'   # expect 200
```

**3. Vercel, only if H already happened**

Roll Production back to the previous deployment - the last build from `main`
before the merge - in the Vercel dashboard (Deployments → the previous Production
build → Promote / Instant Rollback), or:

```bash
vercel rollback <previous-production-url> --scope team_e9pjfcOtrm4ePaVNHVaymG5H
```

**Success:** Production serves the old bundle again, which sends `x-api-key` and
no token - which is why step 1 must already have put the routes back to `NONE`.

Do **not** revert the merge on `main` as a first move. Rolling the deployment
back is faster and reversible; sorting out Git can wait until the app is serving.

**RDS needs no rollback.** The old code ignores `cognito_sub` entirely. Only if
Phase 1 is being abandoned outright:

```sql
BEGIN;
DROP INDEX IF EXISTS idx_driver_profiles_cognito_sub;
ALTER TABLE driver_profiles DROP COLUMN IF EXISTS cognito_sub;
COMMIT;
```

`RakashiAuthStack` can stay: it costs nothing while no route uses the authorizer.

---

## Why this order, and not the obvious one

The instinct is to ship the frontend first, because deploying a frontend feels
reversible and touching a production Lambda does not. An earlier revision of this
runbook followed that instinct and asserted the old Lambda would simply ignore
the token the new frontend sends.

It does ignore it. The mistake was looking in one direction only: the new
frontend also stopped *sending* things - the ownership filters the old Lambda
depended on - and the old handler answers an unfiltered UPDATE with an unfiltered
`UPDATE`. The dangerous window in that ordering was not a moment, either: it
spanned a login test and three route changes.

Ordering AWS first inverts that. The frontend and the Lambda that understands it
arrive together at H, the two are never mixed, and every step from D to G is
reversible with two commands that touch nothing outside AWS.
