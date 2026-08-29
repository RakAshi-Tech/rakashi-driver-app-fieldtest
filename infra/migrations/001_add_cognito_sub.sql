-- ============================================================
--  Phase 1 auth: link driver_profiles to Cognito users
--
--  Additive only. No existing row is read, updated or deleted by this script;
--  the two profiles that predate Cognito keep every value they have and simply
--  gain a NULL cognito_sub, which the Lambda fills in when that driver first
--  signs in with the phone number already on their row.
-- ============================================================

BEGIN;

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS cognito_sub TEXT;

-- Partial unique index rather than a UNIQUE constraint: many rows may sit at
-- NULL while migration is in progress, but a Cognito subject must never map to
-- two profiles.
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profiles_cognito_sub
  ON driver_profiles (cognito_sub)
  WHERE cognito_sub IS NOT NULL;

COMMIT;

-- Verification (returns counts only, no personal data):
--   SELECT COUNT(*) AS total,
--          COUNT(cognito_sub) AS linked,
--          COUNT(*) FILTER (WHERE cognito_sub IS NULL) AS unlinked
--     FROM driver_profiles;
