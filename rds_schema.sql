-- ============================================================
--  Rakashi Driver App — RDS PostgreSQL Schema
--  Generated from source-code analysis (2026-05-21)
--  Compatible with PostgreSQL 13+
-- ============================================================

-- Extension for UUID generation (enable once per DB)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. driver_profiles
--    Source: login/page.tsx, onboarding/page.tsx, dashboard/page.tsx
-- ============================================================
CREATE TABLE driver_profiles (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number        TEXT          NOT NULL UNIQUE,
  name                TEXT          NOT NULL,
  email               TEXT,
  city                TEXT,
  area                TEXT,
  pin_code            TEXT,
  pan_number          TEXT,
  aadhaar_last4       TEXT,
  date_of_birth       DATE,
  vehicle_type        TEXT          NOT NULL DEFAULT 'E-Rickshaw',
  vehicle_code        TEXT,
  experience_years    INTEGER       NOT NULL DEFAULT 0,
  trust_score         INTEGER       NOT NULL DEFAULT 10,
  total_deliveries    INTEGER       NOT NULL DEFAULT 0,
  total_earnings_inr  NUMERIC(12,2) NOT NULL DEFAULT 0,
  fcm_token           TEXT,                           -- Web Push subscription JSON
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driver_profiles_phone ON driver_profiles (phone_number);

-- ============================================================
-- 2. delivery_requests
--    Source: dashboard/page.tsx, pickup/page.tsx, tracking/page.tsx
-- ============================================================
CREATE TABLE delivery_requests (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID          REFERENCES driver_profiles (id),
  status              TEXT          NOT NULL DEFAULT 'pending',
                                    -- pending | accepted | picked_up | delivered | cancelled
  pickup_lat          NUMERIC(10,7),
  pickup_lng          NUMERIC(10,7),
  pickup_address      TEXT,
  delivery_lat        NUMERIC(10,7),
  delivery_lng        NUMERIC(10,7),
  delivery_address    TEXT,
  item_description    TEXT,
  item_quantity       INTEGER,
  proposed_fare_inr   NUMERIC(10,2),
  final_fare_inr      NUMERIC(10,2),
  accepted_at         TIMESTAMPTZ,
  picked_up_at        TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_requests_driver   ON delivery_requests (driver_id);
CREATE INDEX idx_delivery_requests_status   ON delivery_requests (status);
CREATE INDEX idx_delivery_requests_created  ON delivery_requests (created_at DESC);

-- ============================================================
-- 3. request_notifications
--    Source: dashboard/page.tsx
--    Realtime channel watch: INSERT on this table triggers modal
-- ============================================================
CREATE TABLE request_notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID        NOT NULL REFERENCES delivery_requests (id) ON DELETE CASCADE,
  driver_id     UUID        NOT NULL REFERENCES driver_profiles (id)   ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending',
                            -- pending | accepted | rejected
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_request_notif_driver     ON request_notifications (driver_id);
CREATE INDEX idx_request_notif_request    ON request_notifications (request_id);
CREATE INDEX idx_request_notif_status     ON request_notifications (status);
-- Composite index for the Realtime filter pattern used in dashboard
CREATE UNIQUE INDEX idx_request_notif_unique ON request_notifications (request_id, driver_id);

-- ============================================================
-- 4. driver_shifts
--    Source: tracking/page.tsx, unloading-status.tsx
-- ============================================================
CREATE TABLE driver_shifts (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID          NOT NULL REFERENCES driver_profiles (id),
  shift_date          DATE          NOT NULL,
  start_time          TIMESTAMPTZ   NOT NULL,
  end_time            TIMESTAMPTZ,
  total_deliveries    INTEGER       NOT NULL DEFAULT 0,
  total_earnings_inr  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_distance_km   NUMERIC(10,3) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driver_shifts_driver ON driver_shifts (driver_id);
CREATE INDEX idx_driver_shifts_date   ON driver_shifts (shift_date DESC);
-- One shift per driver per day (matches select + upsert pattern)
CREATE UNIQUE INDEX idx_driver_shifts_unique ON driver_shifts (driver_id, shift_date);

-- ============================================================
-- 5. gps_delivery_summary
--    Source: tracking/page.tsx, dashboard/page.tsx,
--            delivery-tracking-screen.tsx, confidence-bar.tsx
-- ============================================================
CREATE TABLE gps_delivery_summary (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID          NOT NULL REFERENCES driver_profiles (id),
  job_id              TEXT,
  shift_date          DATE,
  started_at          TIMESTAMPTZ   NOT NULL,
  completed_at        TIMESTAMPTZ,
  start_lat           NUMERIC(10,7),
  start_lng           NUMERIC(10,7),
  end_lat             NUMERIC(10,7),
  end_lng             NUMERIC(10,7),
  total_distance_km   NUMERIC(10,3),
  total_duration_min  INTEGER,
  on_time             BOOLEAN,
  earnings_inr        NUMERIC(10,2),
  photo_url           TEXT,
  route_coordinates   JSONB,        -- [[lat, lng], ...] from OSRM
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gps_summary_driver      ON gps_delivery_summary (driver_id);
CREATE INDEX idx_gps_summary_started     ON gps_delivery_summary (started_at DESC);
CREATE INDEX idx_gps_summary_completed   ON gps_delivery_summary (completed_at)
    WHERE completed_at IS NOT NULL;
CREATE INDEX idx_gps_summary_shift_date  ON gps_delivery_summary (driver_id, shift_date);

-- ============================================================
-- 6. gps_track_points
--    Source: tracking/page.tsx, delivery-tracking-screen.tsx
--    High-volume insert (every 30 seconds while moving)
-- ============================================================
CREATE TABLE gps_track_points (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  UUID          NOT NULL REFERENCES gps_delivery_summary (id) ON DELETE CASCADE,
  recorded_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  lat          NUMERIC(10,7) NOT NULL,
  lng          NUMERIC(10,7) NOT NULL,
  speed        NUMERIC(6,2),   -- km/h, nullable when stationary
  accuracy     NUMERIC(8,2)    -- GPS accuracy in metres
);

CREATE INDEX idx_track_points_delivery ON gps_track_points (delivery_id);
CREATE INDEX idx_track_points_recorded ON gps_track_points (recorded_at DESC);

-- ============================================================
-- 7. ocr_logs
--    Source: app/api/ocr/route.ts, app/ocr/page.tsx
-- ============================================================
CREATE TABLE ocr_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text            TEXT        NOT NULL,
  language            TEXT        NOT NULL DEFAULT 'en',
  extracted_shipper   TEXT,
  extracted_block     TEXT,
  extracted_quantity  TEXT,
  extracted_fee       TEXT,
  corrected_shipper   TEXT,
  corrected_block     TEXT,
  corrected_quantity  TEXT,
  corrected_fee       TEXT,
  was_corrected       BOOLEAN,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ocr_logs_created ON ocr_logs (created_at DESC);

-- ============================================================
-- updated_at auto-update trigger (driver_profiles)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_driver_profiles_updated_at
  BEFORE UPDATE ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 8. penalties
--    Source: rakashi-admin penalties page
-- ============================================================
CREATE TABLE IF NOT EXISTS penalties (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  driver_id   TEXT        NOT NULL,
  type        TEXT        NOT NULL,
  message     TEXT,
  created_by  TEXT        DEFAULT 'admin',
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_penalties_driver    ON penalties (driver_id);
CREATE INDEX idx_penalties_created   ON penalties (created_at DESC);

-- ============================================================
-- NOTE: Storage (S3)
--   delivery-photos bucket は RDS テーブルではなく S3 バケット。
--   photo_url カラム (gps_delivery_summary.photo_url) に
--   S3 / CloudFront の公開 URL を文字列で保存する。
-- ============================================================
