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

-- A plain (non-partial) unique index, not a partial one.
--
-- PostgreSQL never treats two NULLs as equal in a unique index (NULLS DISTINCT
-- is the default), so this already permits any number of unlinked rows - the
-- two pre-Cognito profiles included - while still guaranteeing that one Cognito
-- subject maps to at most one profile. It is deliberately NOT declared
-- `WHERE cognito_sub IS NOT NULL`: `ON CONFLICT (cognito_sub)`, which the
-- profile upsert depends on, can only infer a PARTIAL index when the statement
-- repeats the index predicate, and it does not. A partial index here makes
-- every profile upsert fail with:
--   ERROR: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profiles_cognito_sub
  ON driver_profiles (cognito_sub);

COMMIT;

-- Verification (returns counts only, no personal data):
--   SELECT COUNT(*) AS total,
--          COUNT(cognito_sub) AS linked,
--          COUNT(*) FILTER (WHERE cognito_sub IS NULL) AS unlinked
--     FROM driver_profiles;

-- Rollback:
--   BEGIN;
--   DROP INDEX IF EXISTS idx_driver_profiles_cognito_sub;
--   ALTER TABLE driver_profiles DROP COLUMN IF EXISTS cognito_sub;
--   COMMIT;
