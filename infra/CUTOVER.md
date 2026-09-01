# Phase 1 cutover runbook

## Current state

Everything up to the window is done. What remains is P5, then D through J.

| Done | Stage | State |
|---|---|---|
| ✅ | CORS allows `authorization` | `content-type`, `authorization`, `x-api-key` |
| ✅ | `RakashiAuthStack` | `CREATE_COMPLETE` |
| ✅ | RDS migration 001 | `cognito_sub` column and unique index applied |
| ✅ | Vercel env vars | Preview and Production both carry the four `COGNITO_*` values |
| ✅ | P1. Rollback artifact | downloaded and verified - see P1 |
| ✅ | P4. Gate C, a token can be minted | **PASSED** - see P4 |
| ⏳ | P2. Vercel / Production prerequisites | confirm before the window |
| ⏳ | P3. Legacy test rows | no migration needed; one row needs P5 |
| ⏳ | P5. Release the Preview number | migration 002 written, **not applied** |
| ⏳ | D. Lambda → Phase 1 | zip built, **not deployed** |
| ⏳ | E-G. Routes → JWT | all three still `NONE` |
| ⏳ | Canary. Preview end-to-end | the gate on H |
| ⏳ | H. main merge → Production | feature branch pushed, **not merged** |
| ⏳ | I. Production end-to-end | needs a real Indian mobile number |
| ⏳ | J. Drop `x-api-key` | days after the window |

The API answers 401 for everything from stage D until stage G completes.
**Budget 4-8 minutes for D-G**, dominated by the checks rather than by AWS -
each command takes seconds. The canary adds 2-3 minutes, and H adds a Vercel
build, so plan 10-15 minutes end to end. Run it outside delivery hours.

```
P1-P4  Preflight                no impact
P5     Release Preview number   no impact: one column of one dead test row
─────────────────────────────────────────────────── outage starts
D      Lambda -> Phase 1        401 everywhere: the routes send no claims yet
E      /realtime/poll -> JWT    poll reaches the Lambda; the rest still 401
F      /query -> JWT            query reaches the Lambda
G      /storage/upload-url      the whole API reaches the Lambda
─────────────────────────────────────────────────── API restored
CANARY Preview, real browser    register -> profile -> dashboard, end to end
─────────────────────────────────────────────────── gate on H
H      main merge -> Vercel     production frontend starts sending tokens
I      Production end-to-end    when a real Indian number is available
─────────────────────────────────────────────────── outage ends
J      Drop x-api-key           no impact, run it days later
```

Do not start D until P1-P5 are green. **Do not start H until the canary
passes.** A failed canary means the stack is wrong for every driver, not just
for the test account, and merging would only widen the blast radius.

## Identifiers

Re-verified against AWS immediately before this revision.

```
API id                zjhgxrmv5i          stage: prod (AutoDeploy: true)
Route ids             /query              mtqd6vi
                      /storage/upload-url rfgzkf4
                      /realtime/poll      geoh502
Authorizer id         0txbwd              JWT
  audience            2kgf163oc5gc9rto35f2tfa2da
  issuer              https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_jeds8qN5R
User pool             ap-northeast-1_jeds8qN5R   tier ESSENTIALS
App client            2kgf163oc5gc9rto35f2tfa2da
Region                ap-northeast-1
Rollback artifact     rollback/rakashi-driver-api-v1.zip
Rollback sha256       dL/m9gIXFzWfVzp2uE660PUOe//vNxbqG9CdDDcCtaE=
New Lambda sha256     sFSVjEaB4spAtZRbcroX8rSMjjuh+gSYJ6N3z6rZPkg=
```

Stages D through G and the rollback all use the same four shell variables. Set
them once, in the shell you will run the window from:

```bash
API=zjhgxrmv5i
AUTH=0txbwd
R=ap-northeast-1
TOKEN=   # set in P4, a Cognito access token; re-mint if it expires (15 minutes)
```

## Safety rule: new frontend × old Lambda is forbidden

**The new frontend must never run against the old Lambda.** Not for a minute,
not behind a feature flag, not as a "harmless" early deploy.

The new frontend stopped sending ownership filters, because the new Lambda
derives ownership from the token instead. The old Lambda has no such derivation -
it performs no authentication or authorization of any kind and builds SQL from
exactly what the client sends. Put the two together and:

| New frontend call | Old Lambda's SQL | Result |
|---|---|---|
| `driver_profiles.update({fcm_token})`, no filter | `UPDATE driver_profiles SET fcm_token = $1` — **no WHERE** | every driver's push token overwritten |
| `driver_profiles.select('*').single()`, no filter | `SELECT * FROM driver_profiles LIMIT 1` | the driver sees someone else's profile and caches that foreign `id` as their own |
| `upsert(..., {onConflict:'cognito_sub'})` | the client no longer sends `cognito_sub`, so nothing ever conflicts | duplicate profile rows with a NULL `cognito_sub` |

`buildWhere([])` returns an empty string, and the old handler's UPDATE branch has
no "refuse an unscoped write" guard - only its DELETE branch does. The first row
of that table is not hypothetical.

This is why AWS moves first and the frontend last. It also means that for the
whole outage window nothing in Git or Vercel has moved, so a rollback during
D-G touches AWS only.

The canary is the one place the new frontend and the new Lambda meet before
production, and it is safe precisely because Preview is already running the new
frontend: by the time it runs, the Lambda behind it is the new one too.

There is no zero-downtime ordering. The frontend in production today sends
`x-api-key` and no `Authorization` header, so the authorizer refuses it the
moment E-G land, whichever Lambda is behind it. The only ordering that would
serve traffic throughout is the forbidden combination above. So the goal is not
to avoid the outage but to keep the failure mode at 401 - loud, immediate,
reversible - and short.

## P1. Rollback artifact  **DONE**

Version 1 is the code running in production right now: it and `$LATEST` report
the same sha256, so version 1 is a true snapshot rather than an older release.

Already downloaded to `rollback/rakashi-driver-api-v1.zip` (17,127,881 bytes,
`rollback/` is gitignored) and verified:

| Check | Result |
|---|---|
| sha256, base64 | `dL/m9gIXFzWfVzp2uE660PUOe//vNxbqG9CdDDcCtaE=` — matches version 1 and `$LATEST` |
| `handler.js` | present, 13,996 bytes |
| `node_modules` | 31 top-level packages including `pg`, `@aws-sdk`, `@smithy`, `@aws-crypto` |
| Archive integrity | `testzip()` reports no corruption |

To reproduce it, or to re-fetch if the file is lost:

```bash
aws lambda get-function --function-name rakashi-driver-api --qualifier 1 \
  --region ap-northeast-1 --query 'Code.Location' --output text \
  | xargs curl -s -o rollback/rakashi-driver-api-v1.zip

python -c "
import hashlib,base64
print(base64.b64encode(hashlib.sha256(open('rollback/rakashi-driver-api-v1.zip','rb').read()).digest()).decode())
"
```

**Success:** prints `dL/m9gIXFzWfVzp2uE660PUOe//vNxbqG9CdDDcCtaE=`. If it does
not, stop - the rollback path is unproven and stage D must not start.

## P2. Vercel / Production prerequisites

The stage `prod` has `AutoDeploy: true`, so route changes in E-G take effect the
moment they are applied. There is no separate deployment step and no way to
stage them, which is why they are applied one at a time.

Confirm all three before the window:

1. **The four `COGNITO_*` variables are set on the Vercel Production
   environment.** None carry `NEXT_PUBLIC_`, so none reach the browser bundle.
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

2. **Whether merging to `main` auto-deploys Production.** If it does, H is one
   action rather than two, which is fine - H is deliberately last. What must not
   happen is a merge before D.

3. **`NEXT_PUBLIC_API_KEY` stays in place until J.** The frontend in production
   still sends it and CORS still allows the header.

The Preview environment needs nothing: it already runs the new frontend against
the same API, which is what makes the canary possible.

## P3. Legacy test rows

`driver_profiles` holds two rows, both with a NULL `cognito_sub`. **They are
development test data, not real drivers, and neither is migrated, linked or
deleted.** Phase 1 has no migration path by design: `identity.ts` never adopts a
row by phone number, because Phase 1 confirms sign-ups without verifying phone
ownership.

They are unreachable by every new user once the new Lambda is live. `POLICIES`
gives `driver_profiles` `ownership: 'own'` with `ownerColumn: 'id'`, so every
statement is rewritten to `... AND "id" = <the caller's own driver id>`, and that
id is resolved from the caller's `cognito_sub` alone. A caller with no profile
row cannot read at all - `requireDriverId` answers 403 first. Rows belonging to
no subject are invisible by construction.

**One of them still blocks the canary, for a different reason.** Ownership
scoping is not the only rule touching these rows: `phone_number` is UNIQUE, and
`resolveCaller` refuses a caller whose number already sits on a row carrying a
different `cognito_sub`. One legacy row holds the Preview test number, so the
Preview test account would meet

```
403  Phone number already belongs to another profile
```

at profile creation. P5 releases that number. The row itself stays.

Production is unaffected either way, as long as the number used in stage I sits
on neither legacy row. Check it before the window, while `/query` is still open -
counts only, no PII. Set `PHONE` to the number stage I will use:

```bash
PHONE='+91...'   # the real Indian mobile number for stage I, E.164
curl -s -X POST https://zjhgxrmv5i.execute-api.ap-northeast-1.amazonaws.com/prod/query \
  -H 'Content-Type: application/json' \
  -d "{\"table\":\"driver_profiles\",\"operation\":\"select\",\"countExact\":true,
       \"filters\":[{\"column\":\"phone_number\",\"op\":\"eq\",\"value\":\"$PHONE\"}]}"
```

**Success:** `{"count":0}` - the number is free.

## P4. Gate C - a token can be minted  **PASSED**

The gate on the whole window, closed. Recorded so the window does not
re-litigate it:

| Check | Result |
|---|---|
| Cognito user created, `UserStatus` | 1 user, **CONFIRMED** |
| `phone_number` attribute | present, E.164 `+91…` |
| Pre-signup trigger | ran, no errors |
| Pre-token trigger | ran once at token issuance, 4.80 ms, no errors |
| V2_0 response shape | deployed code returns `claimsAndScopeOverrideDetails.accessTokenGeneration`; pool is `LambdaVersion: V2_0` on the ESSENTIALS tier |
| `token_use` = `access` | ✅ verified in the browser |
| `client_id` = `2kgf163oc5gc9rto35f2tfa2da` | ✅ Cognito access tokens carry no `aud`; API Gateway falls back to `client_id` |
| `scope` contains `aws.cognito.signin.user.admin` | ✅ the scope pinned on E-G |
| `phone_number` present and `+91` E.164 | ✅ the pre-token trigger's first real test |

That user exists in Cognito and has **no `driver_profiles` row yet**. That is
the canary's starting state, and it is also why stages E-G expect a 403 rather
than a 200 from a token minted for it.

Stages E-G still need a token in hand. **No new phone number is needed for
this.** `toE164India` is application code on the Next.js side; the AWS CLI talks
to Cognito directly and never goes through it. So the Preview test user that
already exists in the pool can re-issue an access token from its own username
and password as often as the window needs:

```bash
CLIENT=2kgf163oc5gc9rto35f2tfa2da
SECRET=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id ap-northeast-1_jeds8qN5R \
  --client-id $CLIENT --region ap-northeast-1 \
  --query 'UserPoolClient.ClientSecret' --output text)
PHONE='+911234567890'   # the existing Preview test user, in E.164
PASS='...'              # the password it was registered with

SECRET_HASH=$(python -c "
import hmac,hashlib,base64,sys
print(base64.b64encode(hmac.new(sys.argv[3].encode(),(sys.argv[1]+sys.argv[2]).encode(),hashlib.sha256).digest()).decode())
" "$PHONE" "$CLIENT" "$SECRET")

TOKEN=$(aws cognito-idp initiate-auth --client-id $CLIENT \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$PHONE",PASSWORD="$PASS",SECRET_HASH="$SECRET_HASH" \
  --region ap-northeast-1 --query 'AuthenticationResult.AccessToken' --output text)
```

To create a *different* account for the window instead, sign up from the CLI.
Cognito validates `phone_number` as E.164 and nothing narrower, so this too is
independent of the Indian-mobile rule the app applies:

```bash
POOL=ap-northeast-1_jeds8qN5R
CLIENT=2kgf163oc5gc9rto35f2tfa2da
SECRET=$(aws cognito-idp describe-user-pool-client --user-pool-id $POOL \
  --client-id $CLIENT --region ap-northeast-1 \
  --query 'UserPoolClient.ClientSecret' --output text)
PHONE='+91...'   # a real E.164 number you control
PASS='...'       # at least 8 characters, lowercase and digits

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

`$TOKEN` lives 15 minutes. Re-mint it rather than hurrying.

`1234567890` is a **Preview-only** number as far as the *app* is concerned:
`toE164India` accepts it when `VERCEL_ENV === "preview"` and nowhere else, so
**registering through the Production app needs a real Indian mobile number**
(stage I). That rule does not change, and no Production exception may be added
for a test number. It simply does not constrain the CLI, which never calls that
function.

## P5. Release the Preview number from the legacy test row

One column of one dead test row. No impact on anything serving traffic, so it
runs before the window rather than inside it - and it must, because the canary
cannot pass without it.

> **Attempt 1 failed, safely, and the column is the reason.**
>
> The first version of migration 002 set `phone_number = NULL`. Postgres
> refused it:
>
> ```
> null value in column "phone_number" of relation "driver_profiles"
> violates not-null constraint          (SQLSTATE 23502)
> ```
>
> `driver_profiles.phone_number` is `TEXT NOT NULL UNIQUE` (`rds_schema.sql:16`),
> so NULL was never available. The whole migration ran as one statement inside
> `BEGIN ... COMMIT`, so the error aborted it and **nothing changed** - the four
> counts after the attempt were identical to the four before.
>
> Do not fix this by dropping the constraint. `NOT NULL` is load-bearing for
> Phase 1: it is what makes a missing `phone_number` claim fail profile creation
> loudly instead of writing a profile nobody can be contacted through.

`infra/migrations/002_clear_preview_number.sql` therefore *retires* the number
rather than nulling it: it sets `phone_number = 'retired-' || id::text` on the
single legacy row holding the Preview test number. That keeps both properties
the plan wanted - the row survives, and the Preview number is released so
`resolveCaller` stops finding a collision. The sentinel is unique by
construction (`id` is the primary key), and it is not E.164, so `toE164India`
can never produce it and no Cognito account can ever claim it.

The statement carries `cognito_sub IS NULL` in its own WHERE clause, so it
cannot touch a row belonging to a real account even if the table changes under
it, and a `DO` block aborts the transaction unless the predicate matches exactly
one row.

**Before:** confirm the target is exactly one row. Counts only, no PII, and
`/query` is still open at this point so no token is needed:

```bash
URL=https://zjhgxrmv5i.execute-api.ap-northeast-1.amazonaws.com/prod/query
PREVIEW_E164='+911234567890'

count() {  # $1 = filters JSON array
  curl -s -X POST "$URL" -H 'Content-Type: application/json' \
    -d "{\"table\":\"driver_profiles\",\"operation\":\"select\",\"countExact\":true,\"filters\":$1}"
}

echo -n 'target rows          : '
count "[{\"column\":\"phone_number\",\"op\":\"eq\",\"value\":\"$PREVIEW_E164\"},
         {\"column\":\"cognito_sub\",\"op\":\"is_null\"}]"
echo -n 'same number, linked  : '
count "[{\"column\":\"phone_number\",\"op\":\"eq\",\"value\":\"$PREVIEW_E164\"},
         {\"column\":\"cognito_sub\",\"op\":\"not_is_null\"}]"
echo -n 'total rows           : '
count "[]"
echo -n 'phone_number IS NULL : '
count "[{\"column\":\"phone_number\",\"op\":\"is_null\"}]"
```

**Proceed only if:** target rows `1`, same number linked `0`, total `2`,
phone_number IS NULL `0`. Anything else means the table is not in the state this
migration was written for - stop and re-check.

**Apply.** The database is not publicly reachable, so the statement has to
originate inside the VPC, through the same throwaway-runner mechanism migration
001 used (`infra/run-migration.sh`: it builds a runner Lambda on the API
Lambda's own subnets, security group and credentials, invokes it, and deletes it
on every exit path). Point it at migration 002:

```bash
MIGRATION=002_clear_preview_number.sql bash infra/run-migration.sh
```

The runner returns the `UPDATE`'s `rowCount` and the `RETURNING id`. **Record
that id** - it is the rollback target.

The script's own final verification (`verify.py`) checks migration 001's
invariants, not this one: the `cognito_sub` column, the unique index, `total=2`
and `cognito_sub_not_null=0`. All four still hold after 002, so it will report
ALL CHECKS PASSED - but it is not evidence about the phone number. The four
counts above are. Note also that those 001 invariants stop holding once the
canary creates a row, so do not re-run this script after the canary and expect
it to pass.

**After:** the first three counts must read target rows `0`, same number linked
`0`, total `2`. Total unchanged at 2 is the important one: the row was edited,
not deleted. The fourth check becomes an equality test on the sentinel, using
the id the UPDATE returned:

```bash
RETIRED_ID=   # the id returned by migration 002
count "[{\"column\":\"phone_number\",\"op\":\"eq\",\"value\":\"retired-$RETIRED_ID\"}]"
```

**Success:** `1`. `phone_number IS NULL` stays `0` - the column is `NOT NULL`.

**Rollback.** Put the number back on the same row, by the id the UPDATE
returned:

```sql
UPDATE driver_profiles
   SET phone_number = '+911234567890'
 WHERE id = '<the id returned by 002>'
   AND phone_number = 'retired-' || id::text
   AND cognito_sub IS NULL;
```

Run it the same way, through the throwaway runner. It is needed only if the
number turns out to matter for something else; the canary does not depend on
being able to undo this, and nothing else reads that row.

## D. Lambda → Phase 1  *(outage starts)*

```bash
cd lambda && npm test   # 36 tests must pass
cd ..

aws lambda update-function-code \
  --function-name rakashi-driver-api \
  --zip-file fileb://lambda/lambda.zip \
  --region $R \
  --query '{Sha:CodeSha256,Modified:LastModified,State:State}' --output json

aws lambda wait function-updated-v2 --function-name rakashi-driver-api --region $R
```

**Success:** `Sha` is `sFSVjEaB4spAtZRbcroX8rSMjjuh+gSYJ6N3z6rZPkg=` and the
function reaches `Active`.

Everything answers 401 from here. That is correct, not a fault: the routes still
attach no authorizer, so no claims reach the handler and it fails closed. The
production frontend is down from this point until H.

## How to read E, F and G

All three stages test the same thing: **did the authorizer let a valid token
through to the Lambda?** They do not test whether the caller can do anything
useful yet, because the token you hold in the window is probably minted for a
subject with no `driver_profiles` row.

| Response | Means | Verdict |
|---|---|---|
| `401` with no token | the authorizer refused an unauthenticated call | **PASS** - required |
| `401` with a valid token | the authorizer refused it: check the audience and the `scope` claim from P4 | **FAIL** |
| `200` | the token passed and the caller owns a profile | **PASS** |
| `403 No driver profile` | the token passed, reached the Lambda, and the ownership guard refused because this subject has no profile row | **PASS** |
| `403 Phone number already belongs to another profile` | the token passed and reached the Lambda, but a legacy row still holds this number | **PASS for the gate**, and a sign P5 did not run |
| `403 Forbidden` | the token passed; the table or operation is not in the policy | **PASS for the gate**, wrong test payload |
| `500` | not an authorizer answer - read the Lambda log | **FAIL** |

The distinction that matters is 401 versus everything else. A 401 is the
gateway; every 403 in that table was produced by our own code *after* the
gateway accepted the token, which is exactly what these stages are proving.
The body says which.

This is why the checks below print the body as well as the status: the status
alone cannot tell a rejected token from a refused profile.

## E. `/realtime/poll` → JWT

The least-used route goes first, so the audience and scope pairing is proven on
one route rather than three.

```bash
aws apigatewayv2 update-route --api-id $API --route-id geoh502 \
  --authorization-type JWT --authorizer-id $AUTH \
  --authorization-scopes aws.cognito.signin.user.admin --region $R
```

```bash
URL=https://$API.execute-api.$R.amazonaws.com/prod/realtime/poll
BODY='{"table":"delivery_requests","since":"2026-01-01T00:00:00Z"}'

curl -s -o /dev/null -w 'no token  -> %{http_code}\n' -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -d "$BODY"

curl -s -w '\ntoken     -> %{http_code}\n' -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "$BODY"
```

**Success:** `no token -> 401`, then `token -> 200` **or**
`token -> 403` with `{"error":"No driver profile"}`.

`delivery_requests` is `ownership: 'own_or_unassigned'` on `driver_id`, so
`handleRealtimePoll` builds its ownership predicate through `requireDriverId`,
which raises `AuthError(403, 'No driver profile')` for a subject with no row.
The handler maps that to a 403 carrying the message. Reaching it means
`readClaims` accepted the token and `resolveCaller` ran - the authorizer did its
job. Do not continue on a 401 with a token.

## F. `/query` → JWT

```bash
aws apigatewayv2 update-route --api-id $API --route-id mtqd6vi \
  --authorization-type JWT --authorizer-id $AUTH \
  --authorization-scopes aws.cognito.signin.user.admin --region $R
```

```bash
URL=https://$API.execute-api.$R.amazonaws.com/prod/query
Q='{"table":"driver_profiles","operation":"select","countExact":true}'

curl -s -o /dev/null -w 'no token  -> %{http_code}\n' -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -d "$Q"

curl -s -w '\ntoken     -> %{http_code}\n' -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "$Q"
```

**Success:** `401`, then `200` or `403 No driver profile`. A `200` here is
scoped to the caller, so the two legacy rows are counted for nobody.

## G. `/storage/upload-url` → JWT  *(API restored)*

```bash
aws apigatewayv2 update-route --api-id $API --route-id rfgzkf4 \
  --authorization-type JWT --authorizer-id $AUTH \
  --authorization-scopes aws.cognito.signin.user.admin --region $R
```

```bash
aws apigatewayv2 get-routes --api-id $API --region $R \
  --query 'Items[].{Route:RouteKey,Auth:AuthorizationType,Scopes:AuthorizationScopes}' \
  --output table
```

**Success:** all three rows read `JWT` with `aws.cognito.signin.user.admin`. An
unauthenticated call answers 401; an authenticated one answers a presigned URL,
or `403 No driver profile` for a caller without one.

The API is now fully closed and fully working. Only the frontend is still old.

## Canary. Preview end-to-end  *(the gate on H)*

Preview already runs the new frontend, and as of stage G the Lambda behind it is
the new one. So the whole stack can be exercised by a real browser, as a real
driver, **before** production is touched at all - and the account to do it with
is already sitting on the profile screen from Gate C.

This is the last point at which nothing in Git or Vercel has moved.

1. In the Preview deployment, on the parked test session, press **complete
   registration** on the profile screen.
2. Land on `/dashboard`.

**Success - all four:**

- The profile screen completes without an error. In particular not
  `403 Phone number already belongs to another profile`, which means P5 did not
  run, and not `403 No driver profile`, which means the upsert did not stamp
  `cognito_sub`.
- `/dashboard` renders **the name just entered**. Any other name is an unscoped
  read: stage F did not take, and this is exactly the failure the canary exists
  to catch before production.
- `driver_profiles` gained exactly one row, carrying a non-NULL `cognito_sub`:

  ```bash
  URL=https://$API.execute-api.$R.amazonaws.com/prod/query
  curl -s -X POST "$URL" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"table":"driver_profiles","operation":"select","countExact":true}'
  ```

  With a token minted for the canary account this must answer `{"count":1}` -
  its own row and nothing else. Total rows in the table are now 3.
- The two legacy rows are invisible: the count above is `1`, not `3`.

**If the canary fails, stop. Do not merge, do not deploy Production.** Roll back
per the Rollback section and diagnose with Preview, which costs nothing. A
canary failure is a statement about every driver, not about the test account.

## H. `main` merge → Vercel Production

**Precondition: the canary passed.** Now, and not before, the frontend moves.

```bash
git checkout main
git pull
git merge --no-ff feature/phase1-cognito-auth
git push origin main
```

Then let Vercel build Production, or promote the build if the project does not
deploy `main` automatically - P2 settled which.

**Success:** the Production deployment reports Ready, `/login` renders the phone
screen, and the browser console shows no CORS error. The old bundle's
`x-api-key` calls go away with it.

## I. Production end-to-end

> **Needs a real Indian mobile number.** Stage I cannot run until you, or a
> teammate who has agreed to it, can receive on a real Indian mobile number in
> E.164 form matching `^\+91[6-9][0-9]{9}$`. The Preview-only number
> `1234567890` is rejected in Production by design, and that design stays:
> `toE164India` accepts it only when `VERCEL_ENV === "preview"`. **Do not add a
> Production exception for a test number.** Phase 1 confirms sign-ups without
> verifying phone ownership, so a Production exception would be a permanent
> unauthenticated account, not a test fixture.
>
> **Nothing is blocked on it.** The canary already exercised the same Lambda,
> the same routes, the same authorizer and the same database through a real
> browser. What stage I adds is confirmation that the Production *deployment* -
> its env vars and its build - is wired like Preview. That is a narrow question,
> and P2 covers most of it.

Once a number is available, check it against P3 first, then walk the app as a
driver would:

1. Register at `/login` - the password screen accepts the number.
2. Complete the profile - `/dashboard` loads with **your own** name.
3. Run a delivery with GPS, complete it, confirm the count increments and the
   route was stored.

**Success, checked with counts only:**

- `driver_profiles` gained exactly one row and it carries a non-NULL
  `cognito_sub` - four rows in total, counting the canary's.
- The two legacy rows are untouched.
- The new driver's dashboard never shows a name or trust score that is not
  theirs.

## J. Drop `x-api-key`  *(days later, not in the window)*

Once the app has been stable for a while and no old bundle is still cached in a
driver's browser:

1. Remove `NEXT_PUBLIC_API_KEY` from Vercel and redeploy.
2. Narrow CORS to what is actually used:

```bash
aws apigatewayv2 update-api --api-id $API --region $R \
  --cors-configuration file://infra/api-cors.final.json
```

**Success:** the app keeps working and a preflight still passes. There is no
rush - the header is unused and unenforced, so leaving it allowed costs nothing
but tidiness.

## Rollback

Reopening the routes restores service immediately, so that goes first, then the
code. Before H nothing in Git or Vercel has moved, so a rollback during D-G or
at a failed canary is entirely inside AWS.

**1. Routes → `NONE`** - this is what restores service.

```bash
API=zjhgxrmv5i
R=ap-northeast-1

for RID in geoh502 mtqd6vi rfgzkf4; do
  aws apigatewayv2 update-route --api-id $API --route-id $RID \
    --authorization-type NONE --region $R
done

aws apigatewayv2 get-routes --api-id $API --region $R \
  --query 'Items[].{Route:RouteKey,Auth:AuthorizationType}' --output table
```

**Success:** all three rows read `NONE`. `AutoDeploy` is on, so this is live as
soon as it returns.

**2. Lambda → version 1.**

```bash
aws lambda update-function-code --function-name rakashi-driver-api \
  --zip-file fileb://rollback/rakashi-driver-api-v1.zip \
  --region $R \
  --query 'CodeSha256' --output text

aws lambda wait function-updated-v2 --function-name rakashi-driver-api --region $R
```

**Success:** prints `dL/m9gIXFzWfVzp2uE660PUOe//vNxbqG9CdDDcCtaE=`.

If that artifact is lost, it is always recoverable from published version 1:

```bash
aws lambda get-function --function-name rakashi-driver-api --qualifier 1 \
  --region $R --query 'Code.Location' --output text \
  | xargs curl -s -o rollback/rakashi-driver-api-v1.zip
```

**Success of 1 and 2 together:** an unauthenticated call answers 200 again.

```bash
curl -s -o /dev/null -w 'rolled back -> %{http_code}\n' -X POST \
  "https://$API.execute-api.$R.amazonaws.com/prod/query" \
  -H 'Content-Type: application/json' \
  -d '{"table":"driver_profiles","operation":"select","countExact":true}'
```

**3. A failed canary.** Steps 1 and 2 are the whole rollback: production is
back on the old frontend and the old Lambda, which is where it started. Then:

- Leave `main` alone. Nothing was merged.
- If the canary created a `driver_profiles` row before failing, it is a Preview
  test row with a `cognito_sub` and no bearing on production. Leave it or
  delete it later; the old Lambda ignores `cognito_sub` entirely.
- P5 does not need undoing to retry. The released number stays released, which
  is the state the next attempt wants anyway.

**4. Vercel - only if H already happened.**

Roll Production back to the previous deployment, the last build from `main`
before the merge, in the Vercel dashboard (Deployments → the previous Production
build → Instant Rollback), or:

```bash
PREV_URL=   # the previous Production deployment URL, from the Vercel dashboard
vercel rollback "$PREV_URL" --scope team_e9pjfcOtrm4ePaVNHVaymG5H
```

**Success:** Production serves the old bundle again. That bundle sends
`x-api-key` and no token, which is why step 1 must already have put the routes
back to `NONE`.

Do **not** revert the merge on `main` as a first move. Rolling the deployment
back is faster and reversible; sorting out Git can wait until the app is
serving.

**5. P5, if it ever needs undoing.** Restore the number on the same row, by the
id migration 002 returned, through the throwaway runner:

```sql
UPDATE driver_profiles
   SET phone_number = '+911234567890'
 WHERE id = '<the id returned by 002>'
   AND phone_number IS NULL
   AND cognito_sub IS NULL;
```

**RDS otherwise needs no rollback.** The old code ignores `cognito_sub`
entirely. Only if Phase 1 is being abandoned outright:

```sql
BEGIN;
DROP INDEX IF EXISTS idx_driver_profiles_cognito_sub;
ALTER TABLE driver_profiles DROP COLUMN IF EXISTS cognito_sub;
COMMIT;
```

`RakashiAuthStack` can stay: it costs nothing while no route uses the
authorizer.
