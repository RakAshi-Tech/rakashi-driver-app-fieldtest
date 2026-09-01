# Phase 1 cutover runbook

## Current state

Everything up to the window is done. What remains is stages D through J.

| Done | Stage | State |
|---|---|---|
| ✅ | CORS allows `authorization` | `content-type`, `authorization`, `x-api-key` |
| ✅ | `RakashiAuthStack` | `CREATE_COMPLETE` |
| ✅ | RDS migration 001 | `cognito_sub` column and unique index applied |
| ✅ | Vercel env vars | Preview and Production both carry the four `COGNITO_*` values |
| ✅ | P1. Rollback artifact | downloaded and verified - see P1 |
| ✅ | P4. Gate C, a token can be minted | **PASSED** - see P4 |
| ⏳ | P2. Vercel / Production prerequisites | confirm before the window |
| ⏳ | P3. Legacy test rows | no migration needed; one note for Preview |
| ⏳ | D. Lambda → Phase 1 | zip built, **not deployed** |
| ⏳ | E-G. Routes → JWT | all three still `NONE` |
| ⏳ | H. main merge → Production | feature branch pushed, **not merged** |
| ⏳ | I. Production end-to-end | **blocked** - needs a real Indian mobile number |
| ⏳ | J. Drop `x-api-key` | days after the window |

The API answers 401 for everything from stage D until stage G completes.
**Budget 4-8 minutes for D-G**, dominated by the checks rather than by AWS -
each command takes seconds. H adds a Vercel build, so plan 6-10 minutes end to
end. Run it outside delivery hours.

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

Do not start D until P1-P4 are green.

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

## P3. Legacy test rows

`driver_profiles` holds two rows, both with a NULL `cognito_sub`. **They are
development test data, not real drivers, and nothing needs to be migrated,
linked or deleted for the cutover.** Phase 1 has no migration path by design:
`identity.ts` never adopts a row by phone number, because Phase 1 confirms
sign-ups without verifying phone ownership.

They are unreachable by every new user once the new Lambda is live. `POLICIES`
gives `driver_profiles` `ownership: 'own'` with `ownerColumn: 'id'`, so every
statement is rewritten to `... AND "id" = <the caller's own driver id>`, and that
id is resolved from the caller's `cognito_sub` alone. A caller with no profile
row cannot read at all - `requireDriverId` answers 403 first. Rows belonging to
no subject are invisible by construction.

**One exception, and it affects the Preview test account only.** Ownership
scoping is not the only rule touching these rows: `phone_number` is UNIQUE, and
`resolveCaller` refuses a caller whose number already sits on a row carrying a
different `cognito_sub`:

```
403  Phone number already belongs to another profile
```

One of the two legacy rows holds the Preview test number. So after stage D the
Preview test account meets that 403 at profile creation. It is test data, so
clear it whenever Preview testing needs to continue - **outside the window**,
since it is a write to RDS:

```sql
-- Pick one. Run it before or after the cutover, never during.
DELETE FROM driver_profiles
 WHERE phone_number = :preview_number AND cognito_sub IS NULL;

UPDATE driver_profiles SET phone_number = NULL
 WHERE phone_number = :preview_number AND cognito_sub IS NULL;
```

Until then, leave the Preview test user parked on the profile screen. Pressing
"complete registration" while the old Lambda is still live writes a third junk
row with a NULL `cognito_sub` - harmless, but pointless.

Production is unaffected as long as the number used in stage I sits on neither
legacy row. Check it before the window, while `/query` is still open - counts
only, no PII. Set `PHONE` to the number stage I will use:

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

Stages E-G still need a token in hand. Take one from a browser session, or mint
one from the CLI with an account you control:

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

`1234567890` is a **Preview-only** number. `toE164India` accepts it when
`VERCEL_ENV === "preview"` and nowhere else, so Production and the CLI both need
a real Indian mobile number.

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

curl -s -o /dev/null -w 'token     -> %{http_code}\n' -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "$BODY"
```

**Success:** `no token -> 401` then `token -> 200`.

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
```

```bash
URL=https://$API.execute-api.$R.amazonaws.com/prod/query
Q='{"table":"driver_profiles","operation":"select","countExact":true}'

curl -s -o /dev/null -w 'no token  -> %{http_code}\n' -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -d "$Q"

curl -s -w 'token     -> %{http_code}\n' -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "$Q"
```

**Success:** `401`, then a `200` whose body is scoped to the caller. A token
whose subject has no profile row yet answers `403 No driver profile` instead of
`200` - also a pass, and the clearest proof the read is scoped: the two legacy
rows are counted for nobody.

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
unauthenticated call answers 401; an authenticated one answers what the API is
supposed to answer - a presigned URL for a caller with a profile, or
`403 No driver profile` for one without.

The API is now fully closed and fully working. Only the frontend is still old.

## H. `main` merge → Vercel Production

Now, and not before, the frontend moves.

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

> **Unresolved: this stage needs a real Indian mobile number.**
>
> Stage I cannot run until you, or a teammate who has agreed to it, can receive
> on a real Indian mobile number in E.164 form matching `^\+91[6-9][0-9]{9}$`.
> The Preview-only number `1234567890` is rejected in Production by design, and
> that design stays: `toE164India` accepts it only when
> `VERCEL_ENV === "preview"`. **Do not add a Production exception for a test
> number.** Phase 1 confirms sign-ups without verifying phone ownership, so a
> Production exception would be a permanent unauthenticated account, not a test
> fixture.
>
> Nothing in D-H depends on this. The API can be cut over and verified with a
> CLI-minted token (P4) while stage I waits for a number.

Once a number is available, check it against P3 first, then walk the app as a
driver would:

1. Register at `/login` - the password screen accepts the number.
2. Complete the profile - `/dashboard` loads with **your own** name.
3. Run a delivery with GPS, complete it, confirm the count increments and the
   route was stored.

**Success, checked with counts only:**

- `driver_profiles` gained exactly one row and it carries a non-NULL
  `cognito_sub`.
- The two legacy rows are untouched - same count, still NULL `cognito_sub`.
- The new driver's dashboard never shows a name or trust score that is not
  theirs. Seeing a stranger's profile is the signature of an unscoped read and
  means stage F did not take.

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
code. Before H nothing in Git or Vercel has moved, so a rollback during D-G is
entirely inside AWS.

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

**3. Vercel - only if H already happened.**

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

**RDS needs no rollback.** The old code ignores `cognito_sub` entirely. Only if
Phase 1 is being abandoned outright:

```sql
BEGIN;
DROP INDEX IF EXISTS idx_driver_profiles_cognito_sub;
ALTER TABLE driver_profiles DROP COLUMN IF EXISTS cognito_sub;
COMMIT;
```

`RakashiAuthStack` can stay: it costs nothing while no route uses the
authorizer.
