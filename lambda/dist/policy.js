"use strict";
/**
 * Ownership policy for the /query endpoint.
 *
 * Everything is denied unless it appears here. A table with no entry, an
 * operation not in `operations`, or a column not in `writable` is rejected
 * before any SQL is built.
 *
 * The rules below were derived from the call sites that exist today, so the
 * app keeps working; anything the app does not currently do stays closed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.POLICIES = void 0;
exports.policyFor = policyFor;
exports.POLICIES = {
    // The driver's own profile. `id` is the owner column, so a caller can only
    // ever touch the single row their cognito_sub resolves to.
    driver_profiles: {
        ownership: 'own',
        ownerColumn: 'id',
        operations: ['select', 'update', 'upsert'],
        // Money, reputation, identity and activation are server-owned. A driver
        // setting their own trust_score or total_earnings_inr is the thing this
        // list exists to stop.
        writable: [
            'name',
            'email',
            'city',
            'area',
            'pin_code',
            'pan_number',
            'aadhaar_last4',
            'date_of_birth',
            'vehicle_type',
            'vehicle_code',
            'experience_years',
            'fcm_token',
        ],
        // Only ever upserted on cognito_sub, which the handler forces to the token
        // value. Upserting on phone_number would let a caller overwrite whichever
        // profile happens to carry that number.
        upsertOn: ['cognito_sub'],
    },
    // Job board. Unassigned rows are visible to everyone so a driver can accept
    // one; once accepted the row is theirs and nobody else can see or touch it.
    delivery_requests: {
        ownership: 'own_or_unassigned',
        ownerColumn: 'driver_id',
        operations: ['select', 'update'],
        // final_fare_inr is deliberately absent: it is what the driver gets paid,
        // and the browser must not be able to name that figure. The handler settles
        // it server-side from proposed_fare_inr when the row reaches 'delivered'.
        // See serverSetClauses() in guard.ts.
        writable: [
            'status',
            'accepted_at',
            'picked_up_at',
            'delivered_at',
            'cancelled_at',
        ],
    },
    request_notifications: {
        ownership: 'own',
        ownerColumn: 'driver_id',
        operations: ['select', 'update'],
        writable: ['status', 'responded_at'],
    },
    driver_shifts: {
        ownership: 'own',
        ownerColumn: 'driver_id',
        operations: ['select', 'insert', 'update'],
        // These aggregates are still computed in the browser today. Scoping them to
        // the caller's own shift rows is the Phase 1 guarantee; moving the arithmetic
        // server-side is a Phase 2 item.
        writable: [
            'shift_date',
            'start_time',
            'end_time',
            'total_deliveries',
            'total_earnings_inr',
            'total_distance_km',
        ],
    },
    // The driver's own record of one delivery. Every column here is operational
    // data about a run the caller made: where they went, how long it took, what
    // the job paid. driver_id is absent on purpose - the handler stamps it from
    // the token, so a caller can neither file a delivery against another driver
    // nor read one back.
    gps_delivery_summary: {
        ownership: 'own',
        ownerColumn: 'driver_id',
        operations: ['select', 'insert', 'update'],
        writable: [
            'job_id',
            'shift_date',
            'started_at',
            'completed_at',
            'total_distance_km',
            'total_duration_min',
            'on_time',
            'earnings_inr',
            'photo_url',
            'route_coordinates',
            'start_lat',
            'start_lng',
            'end_lat',
            'end_lng',
            'delivery_address',
            'pickup_address',
        ],
    },
    // Breadcrumb points hang off a summary row; ownership is checked against that
    // parent so a caller cannot write points into someone else's delivery.
    gps_track_points: {
        ownership: 'via',
        via: {
            column: 'delivery_id',
            parentTable: 'gps_delivery_summary',
            parentKey: 'id',
            parentOwnerColumn: 'driver_id',
        },
        operations: ['select', 'insert'],
        writable: ['delivery_id', 'recorded_at', 'lat', 'lng', 'speed', 'accuracy'],
    },
    // OCR training data has no owner column yet, so reads stay closed: a select
    // here would hand back other drivers' scanned waybills. Writes are allowed
    // because the scan flow depends on them. Phase 2 adds driver_id and this
    // becomes a normal 'own' table.
    ocr_logs: {
        ownership: 'unowned',
        operations: ['insert', 'update'],
        writable: [
            'raw_text',
            'language',
            'extracted_shipper',
            'extracted_block',
            'extracted_quantity',
            'extracted_fee',
            'corrected_shipper',
            'corrected_block',
            'corrected_quantity',
            'corrected_fee',
            'was_corrected',
        ],
    },
    // Penalties are issued by operations staff, never by the driver.
    penalties: {
        ownership: 'own',
        ownerColumn: 'driver_id',
        operations: ['select'],
        writable: [],
    },
};
function policyFor(table) {
    return Object.prototype.hasOwnProperty.call(exports.POLICIES, table)
        ? exports.POLICIES[table]
        : null;
}
