#!/usr/bin/env bash
#
# Step 3: apply infra/migrations/001_add_cognito_sub.sql to the RDS instance.
#
# The database is not publicly reachable and there is no bastion, so the
# statements have to originate inside the VPC. This creates a throwaway Lambda on
# the same subnets and security group as the API Lambda, runs the migration
# through it, verifies the result, and deletes the Lambda again. Nothing it
# creates outlives the run.
#
# Credentials: no password or secret is stored in this file or written to disk.
# The database credentials are read from the existing API Lambda's own
# environment at run time and passed straight to the throwaway function. They are
# never printed.
#
# Output: counts and the index definition only. No row data is selected.
#
# Usage:
#   bash infra/run-migration.sh            # apply and verify
#   bash infra/run-migration.sh --verify   # verify only, change nothing
#
set -euo pipefail

REGION=ap-northeast-1
SRC_FN=rakashi-driver-api          # supplies the VPC config and DB credentials
TMP_FN=rakashi-migration-runner    # created and deleted by this script
# Override to run a different file, e.g. MIGRATION=002_clear_preview_number.sql
MIGRATION="${MIGRATION:-001_add_cognito_sub.sql}"

VERIFY_ONLY=0
[ "${1:-}" = "--verify" ] && VERIFY_ONLY=1

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$HERE/migration-runner"
WORK="$(mktemp -d)"
export AWS_PAGER=""

# The throwaway function is removed on every exit path: success, failure, or
# interrupt. Verified afterwards so a failed delete is visible rather than
# silently leaving a VPC Lambda behind holding database credentials.
cleanup() {
  local code=$?
  if aws lambda get-function --function-name "$TMP_FN" --region "$REGION" >/dev/null 2>&1; then
    echo
    echo "--- removing the throwaway runner ---"
    aws lambda delete-function --function-name "$TMP_FN" --region "$REGION" || true
    if aws lambda get-function --function-name "$TMP_FN" --region "$REGION" >/dev/null 2>&1; then
      echo "WARNING: $TMP_FN still exists. Delete it manually:"
      echo "  aws lambda delete-function --function-name $TMP_FN --region $REGION"
    else
      echo "deleted $TMP_FN"
    fi
  fi
  rm -rf "$WORK"
  exit $code
}
trap cleanup EXIT INT TERM

# Git Bash converts POSIX paths when it hands them to a native Windows program
# as a bare argument, but not when they sit inside a file:// URI - the AWS CLI
# then receives /tmp/... and cannot resolve it. Convert explicitly; on a POSIX
# host cygpath is absent and this is a no-op.
uri_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

invoke() { # $1 = path to a JSON payload file
  local out="$WORK/out.json"
  aws lambda invoke --function-name "$TMP_FN" --region "$REGION" \
    --cli-binary-format raw-in-base64-out \
    --payload "file://$(uri_path "$1")" "$out" >/dev/null
  cat "$out"
}

# ---------------------------------------------------------------------------
echo "=== 1/6  build the runner package ==="
python "$RUNNER/build.py" "$WORK/runner.zip"

# ---------------------------------------------------------------------------
echo
echo "=== 2/6  read VPC config and credentials from $SRC_FN (not printed) ==="
aws lambda get-function-configuration --function-name "$SRC_FN" --region "$REGION" \
  --output json > "$WORK/src.json"

ROLE=$(python -c "import json,sys;print(json.load(open(sys.argv[1]))['Role'])" "$WORK/src.json")
SUBNETS=$(python -c "import json,sys;print(','.join(json.load(open(sys.argv[1]))['VpcConfig']['SubnetIds']))" "$WORK/src.json")
SGS=$(python -c "import json,sys;print(','.join(json.load(open(sys.argv[1]))['VpcConfig']['SecurityGroupIds']))" "$WORK/src.json")
# Written to the temp dir only, and removed by the cleanup trap.
python -c "import json,sys;json.dump({'Variables':json.load(open(sys.argv[1]))['Environment']['Variables']},open(sys.argv[2],'w'))" \
  "$WORK/src.json" "$WORK/env.json"
echo "role, subnets and security groups resolved; credentials held in memory only"

# ---------------------------------------------------------------------------
echo
echo "=== 3/6  create the throwaway runner ==="
if aws lambda get-function --function-name "$TMP_FN" --region "$REGION" >/dev/null 2>&1; then
  echo "a previous $TMP_FN exists; removing it first"
  aws lambda delete-function --function-name "$TMP_FN" --region "$REGION"
fi
aws lambda create-function \
  --function-name "$TMP_FN" \
  --runtime nodejs22.x \
  --handler index.handler \
  --role "$ROLE" \
  --vpc-config "SubnetIds=$SUBNETS,SecurityGroupIds=$SGS" \
  --environment "file://$(uri_path "$WORK/env.json")" \
  --timeout 60 --memory-size 512 \
  --zip-file "fileb://$(uri_path "$WORK/runner.zip")" \
  --region "$REGION" \
  --query '{Name:FunctionName,State:State}' --output json
echo "waiting for the function to become active (VPC ENI setup takes a minute)..."
aws lambda wait function-active-v2 --function-name "$TMP_FN" --region "$REGION"
echo "runner active"

# ---------------------------------------------------------------------------
echo
echo "=== 4/6  BEFORE: counts only ==="
python - "$WORK/before.json" <<'PY'
import json, sys
json.dump({"statements": [
    "SELECT COUNT(*) AS total FROM driver_profiles",
    "SELECT COUNT(*) AS has_column FROM information_schema.columns "
    "WHERE table_name='driver_profiles' AND column_name='cognito_sub'",
]}, open(sys.argv[1], "w"))
PY
invoke "$WORK/before.json"

# ---------------------------------------------------------------------------
echo
if [ "$VERIFY_ONLY" = "1" ]; then
  echo "=== 5/6  SKIPPED (--verify): no changes made ==="
else
  echo "=== 5/6  apply $MIGRATION ==="
  python - "$HERE/migrations/$MIGRATION" "$WORK/apply.json" <<'PY'
import io, json, sys
sql = io.open(sys.argv[1], encoding="utf-8").read()
json.dump({"statements": [sql]}, open(sys.argv[2], "w"))
PY
  invoke "$WORK/apply.json"
fi

# ---------------------------------------------------------------------------
echo
echo "=== 6/6  AFTER: verification (counts and index definition only) ==="
python - "$WORK/after.json" <<'PY'
import json, sys
json.dump({"statements": [
    "SELECT COUNT(*) AS has_column FROM information_schema.columns "
    "WHERE table_name='driver_profiles' AND column_name='cognito_sub'",
    "SELECT indexdef FROM pg_indexes "
    "WHERE tablename='driver_profiles' AND indexname='idx_driver_profiles_cognito_sub'",
    "SELECT COUNT(*) AS total, COUNT(cognito_sub) AS cognito_sub_not_null FROM driver_profiles",
]}, open(sys.argv[1], "w"))
PY
invoke "$WORK/after.json" > "$WORK/after-result.json"
cat "$WORK/after-result.json"
echo
python "$RUNNER/verify.py" < "$WORK/after-result.json"

echo
echo "Rollback, if it is ever needed (run through this same script's approach):"
echo "  BEGIN;"
echo "  DROP INDEX IF EXISTS idx_driver_profiles_cognito_sub;"
echo "  ALTER TABLE driver_profiles DROP COLUMN IF EXISTS cognito_sub;"
echo "  COMMIT;"
