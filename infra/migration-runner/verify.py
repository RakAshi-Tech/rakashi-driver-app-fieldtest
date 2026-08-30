"""Turn the runner's post-migration output into pass/fail lines.

Reads the Lambda response JSON on stdin and checks the four things migration 001
is supposed to have done. Prints one line per check and exits non-zero if any
fail, so run-migration.sh can stop on a bad result instead of leaving it to be
read out of raw JSON.

Only counts and the index definition are ever printed. No row data is inspected.
"""

import json
import sys

EXPECTED_ROWS = 2


def scalar(results, index, key):
    """First row's `key` from the index-th statement, or None."""
    try:
        rows = results[index][0]["rows"]
        return rows[0][key] if rows else None
    except (IndexError, KeyError, TypeError):
        return None


def main() -> int:
    payload = json.load(sys.stdin)

    if not payload.get("ok"):
        print("FAIL  runner reported an error: %s (%s)" % (payload.get("error"), payload.get("code")))
        return 1

    results = payload.get("results", [])
    checks = []

    has_column = int(scalar(results, 0, "has_column") or 0)
    checks.append(("cognito_sub column exists", has_column == 1, "found=%d" % has_column))

    indexdef = scalar(results, 1, "indexdef")
    if not indexdef:
        checks.append(("unique index exists", False, "not found"))
    else:
        is_unique = "UNIQUE INDEX" in indexdef
        # A partial index would carry a WHERE clause, which `ON CONFLICT
        # (cognito_sub)` in the profile upsert cannot infer.
        is_partial = " WHERE " in indexdef
        checks.append(("unique index exists", is_unique, indexdef))
        checks.append(("index is NOT partial", not is_partial, "partial" if is_partial else "plain"))

    total = int(scalar(results, 2, "total") or -1)
    checks.append(("driver_profiles row count unchanged", total == EXPECTED_ROWS, "total=%d" % total))

    not_null = int(scalar(results, 2, "cognito_sub_not_null") or -1)
    checks.append(("cognito_sub NOT NULL count is 0", not_null == 0, "not_null=%d" % not_null))

    failed = 0
    for name, ok, detail in checks:
        print("%-38s %s   %s" % (name, "PASS" if ok else "FAIL", detail))
        if not ok:
            failed += 1

    print()
    print("ALL CHECKS PASSED" if failed == 0 else "%d CHECK(S) FAILED" % failed)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
