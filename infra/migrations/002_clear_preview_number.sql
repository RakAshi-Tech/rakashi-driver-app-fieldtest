--  002  Release the Preview test number from the legacy test row.
--
--  driver_profiles.phone_number is UNIQUE, and resolveCaller refuses any caller
--  whose number already sits on a row carrying a different cognito_sub:
--
--      403  Phone number already belongs to another profile
--
--  One of the two legacy development rows holds the Preview test number, so the
--  Preview test account would meet that 403 at profile creation and the canary
--  could never run. Releasing the number clears the collision.
--
--  The row itself is kept. It is development data with no cognito_sub, so it
--  stays unreachable through the API either way - `driver_profiles` is
--  ownership: 'own' on `id`, resolved from the caller's cognito_sub alone - and
--  keeping it means this migration changes exactly one column of one row.
--
--  Safe to re-run: the guard fails the transaction rather than the update
--  silently matching zero rows, so a second run is refused loudly.

BEGIN;

--  Refuse to touch anything unless the predicate matches exactly one row.
--  RAISE aborts the transaction, so a surprise here changes nothing at all.
DO $$
DECLARE matched integer;
BEGIN
  SELECT COUNT(*) INTO matched
    FROM driver_profiles
   WHERE phone_number = '+911234567890'
     AND cognito_sub IS NULL;

  IF matched <> 1 THEN
    RAISE EXCEPTION
      'refusing to run: expected exactly 1 matching row, found %', matched;
  END IF;
END $$;

--  `cognito_sub IS NULL` is carried into the UPDATE itself rather than trusted
--  from the check above: it is what makes it impossible for this statement to
--  strip the number from a row belonging to a real Cognito account.
--  The returned id is the rollback target - record it.
UPDATE driver_profiles
   SET phone_number = NULL
 WHERE phone_number = '+911234567890'
   AND cognito_sub IS NULL
RETURNING id;

COMMIT;
