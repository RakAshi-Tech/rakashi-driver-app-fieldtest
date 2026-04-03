"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { useLang } from "@/app/context/LanguageContext"
import { LangToggle } from "@/app/components/LangToggle"
import type { TrackingMapProps } from "./TrackingMap"
import { supabase } from "@/lib/supabase"

const TrackingMap = dynamic<TrackingMapProps>(
  () => import("./TrackingMap"),
  {
    ssr: false,
    loading: () => (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#16213e", color: "#9ca3af", fontSize: "13px" }}>
        Loading map…
      </div>
    ),
  }
)

// ── Types ─────────────────────────────────────────────────────────────────────

interface Destination {
  lat: number
  lng: number
  distance: number
  duration: number
}

type MovingStatus   = "STOPPED" | "MOVING"
type DeliveryStatus = "Preparing" | "En Route" | "Approaching" | "Arrived"
type MapType        = "street" | "satellite"

// ── Pure helpers ──────────────────────────────────────────────────────────────

const haversineDistance = (
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number => {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function calcRemainingDistance(
  current: [number, number],
  route: [number, number][]
): number {
  if (route.length === 0) return 0
  let minDist = Infinity
  let closestIdx = 0
  for (let i = 0; i < route.length; i++) {
    const d = haversineDistance(current[0], current[1], route[i][0], route[i][1])
    if (d < minDist) { minDist = d; closestIdx = i }
  }
  let total = minDist
  for (let i = closestIdx; i < route.length - 1; i++) {
    total += haversineDistance(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1])
  }
  return total
}

function distToNearestRoutePoint(
  current: [number, number],
  route: [number, number][]
): number {
  let minDist = Infinity
  for (const pt of route) {
    const d = haversineDistance(current[0], current[1], pt[0], pt[1])
    if (d < minDist) minDist = d
  }
  return minDist
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

function formatEta(minutes: number): string {
  if (minutes < 1) return "< 1 min"
  return `${Math.round(minutes)} min`
}

function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

// ── Supabase helpers (module-level, no component state) ───────────────────────

async function dbStartDelivery(destLat: number | null): Promise<string | null> {
  try {
    const driverId = localStorage.getItem("driverId") || "demo"
    const jobId    = localStorage.getItem("jobId")    || "mock-123"
    const now      = new Date().toISOString()

    const { data, error } = await supabase
      .from("gps_delivery_summary")
      .insert({
        driver_id:  driverId,
        job_id:     jobId,
        started_at: now,
        start_lat:  destLat ?? null,
      })
      .select()
      .single()

    if (error) { console.error("startDelivery error:", error); return null }
    if (data?.id) {
      localStorage.setItem("currentDeliveryId", data.id)
      return data.id as string
    }
  } catch (e) {
    console.error("startDelivery exception:", e)
  }
  return null
}

async function dbRecordTrackPoint(
  deliveryId: string,
  pos: GeolocationPosition
): Promise<void> {
  try {
    await supabase
      .from("gps_track_points")
      .insert({
        delivery_id: deliveryId,
        recorded_at: new Date().toISOString(),
        lat:         pos.coords.latitude,
        lng:         pos.coords.longitude,
        speed:       pos.coords.speed    ?? 0,
        accuracy:    pos.coords.accuracy,
      })
  } catch (e) {
    console.error("recordTrackPoint failed:", e)
  }
}

async function dbCompleteDelivery(
  deliveryId: string,
  startedAt: string,
  totalTraveledMeters: number
): Promise<void> {
  try {
    const now         = new Date()
    const durationMin = Math.round(
      (now.getTime() - new Date(startedAt).getTime()) / 60000
    )
    const totalDistKm = parseFloat((totalTraveledMeters / 1000).toFixed(2))

    await supabase
      .from("gps_delivery_summary")
      .update({
        completed_at:      now.toISOString(),
        total_distance_km: totalDistKm,
        total_duration_min: durationMin,
        on_time:           true,
      })
      .eq("id", deliveryId)
  } catch (e) {
    console.error("completeDelivery error:", e)
  }

  // Increment driver total_deliveries
  try {
    const driverId = localStorage.getItem("driverId") || "demo"
    const { data: profile } = await supabase
      .from("driver_profiles")
      .select("total_deliveries")
      .eq("id", driverId)
      .single()

    if (profile) {
      await supabase
        .from("driver_profiles")
        .update({ total_deliveries: (profile.total_deliveries || 0) + 1 })
        .eq("id", driverId)
    }
  } catch (e) {
    console.error("updateDriverProfile error:", e)
  }

  localStorage.removeItem("currentDeliveryId")
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BG_MAIN  = "#0f0f1a"
const BG_CARD  = "#16213e"
const ORANGE   = "#f97316"
const GRAY_SUB = "#9ca3af"
const GRAY_BAR = "#374151"

const DELIVERY_BADGE_COLOR: Record<DeliveryStatus, string> = {
  Preparing:   "#6b7280",
  "En Route":  "#3b82f6",
  Approaching: ORANGE,
  Arrived:     "#22c55e",
}

const DELIVERY_PROGRESS: Record<DeliveryStatus, number> = {
  Preparing:   0,
  "En Route":  33,
  Approaching: 66,
  Arrived:     100,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrackingPage() {
  const router = useRouter()
  const { lang, t } = useLang()

  // ── UI state ──────────────────────────────────────────────────────────────
  const [mapType, setMapType]               = useState<MapType>("street")
  const [isRecording, setIsRecording]       = useState(true)
  const [forceCenterTrigger, setForceCenterTrigger] = useState(0)

  // ── Tracking state ─────────────────────────────────────────────────────────
  const [dest, setDest]                     = useState<Destination | null>(null)
  const [routeCoords, setRouteCoords]       = useState<[number, number][]>([])
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null)
  const [accuracy, setAccuracy]             = useState<number | undefined>(undefined)
  const [speed, setSpeed]                   = useState(0)
  const [movingStatus, setMovingStatus]     = useState<MovingStatus>("STOPPED")
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>("Preparing")
  const [remainingDist, setRemainingDist]   = useState(0)
  const [eta, setEta]                       = useState(0)
  const [showDeviation, setShowDeviation]   = useState(false)
  const [showArrived, setShowArrived]       = useState(false)

  // ── Timer state ────────────────────────────────────────────────────────────
  const [movingDisplay,  setMovingDisplay]  = useState("00:00")
  const [stoppedDisplay, setStoppedDisplay] = useState("00:00")

  // ── Refs (tracking) ────────────────────────────────────────────────────────
  const destRef         = useRef<Destination | null>(null)
  const routeCoordsRef  = useRef<[number, number][]>([])
  const prevPosRef      = useRef<{ pos: [number, number]; time: number } | null>(null)
  const arrivedShownRef = useRef(false)
  const needsOsrmRef    = useRef(false)
  const osrmFetchedRef  = useRef(false)
  const isRecordingRef  = useRef(true)
  const movingStatusRef = useRef<MovingStatus>("STOPPED")
  const movingSecsRef   = useRef(0)
  const stoppedSecsRef  = useRef(0)
  const langRef         = useRef<'hi' | 'en'>('hi')

  // ── Refs (Supabase) ────────────────────────────────────────────────────────
  const deliveryIdRef       = useRef<string | null>(null)
  const startedAtRef        = useRef<string>(new Date().toISOString())
  const lastRecordedRef     = useRef<number>(0)
  const totalTraveledRef    = useRef<number>(0)   // meters accumulated via GPS

  // Keep refs in sync
  useEffect(() => { destRef.current        = dest        }, [dest])
  useEffect(() => { routeCoordsRef.current = routeCoords }, [routeCoords])
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])
  useEffect(() => { movingStatusRef.current = movingStatus }, [movingStatus])
  useEffect(() => { langRef.current = lang }, [lang])

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (!isRecordingRef.current) return
      if (movingStatusRef.current === "MOVING") {
        movingSecsRef.current++
        setMovingDisplay(formatMmSs(movingSecsRef.current))
      } else {
        stoppedSecsRef.current++
        setStoppedDisplay(formatMmSs(stoppedSecsRef.current))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Load from localStorage ─────────────────────────────────────────────────
  useEffect(() => {
    const destRaw = localStorage.getItem("destination")
    if (destRaw) {
      const d: Destination = JSON.parse(destRaw)
      setDest(d)
      destRef.current = d
      setRemainingDist(d.distance)
      setEta((d.distance / 1000 / 4) * 60)
    }
    const routeRaw = localStorage.getItem("route")
    if (routeRaw) {
      const coords: [number, number][] = JSON.parse(routeRaw).coordinates
      setRouteCoords(coords)
      routeCoordsRef.current = coords
    } else {
      needsOsrmRef.current = true
    }
  }, [])

  // ── STEP 2: Start delivery record in Supabase ──────────────────────────────
  useEffect(() => {
    const start = async () => {
      const destRaw = localStorage.getItem("destination")
      const destLat = destRaw ? (JSON.parse(destRaw) as Destination).lat : null
      const now = new Date().toISOString()
      startedAtRef.current = now

      const id = await dbStartDelivery(destLat)
      if (id) deliveryIdRef.current = id
    }
    start()
  }, [])

  // ── OSRM fallback ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!needsOsrmRef.current || osrmFetchedRef.current) return
    if (!dest || !currentLocation) return
    osrmFetchedRef.current = true
    const [lat, lng] = currentLocation
    fetch(
      `https://router.project-osrm.org/route/v1/foot/${lng},${lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.routes?.length > 0) {
          const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
            ([lo, la]: [number, number]) => [la, lo]
          )
          setRouteCoords(coords)
          routeCoordsRef.current = coords
        }
      })
      .catch((e) => console.error("OSRM initial fetch failed:", e))
  }, [dest, currentLocation])

  // ── Arrived overlay ────────────────────────────────────────────────────────
  useEffect(() => {
    if (deliveryStatus === "Arrived" && !arrivedShownRef.current) {
      arrivedShownRef.current = true
      setShowArrived(true)
      setTimeout(() => setShowArrived(false), 3000)
    }
  }, [deliveryStatus])

  // ── GPS watchPosition ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return

    let rerouteCooldownUntil = 0
    let isRerouting = false

    const handleDeviation = async (curr: [number, number]) => {
      const d = destRef.current
      if (!d) return
      isRerouting = true
      setShowDeviation(true)

      if ("speechSynthesis" in window) {
        speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(
          langRef.current === 'hi'
            ? 'मार्ग से भटक गए। पुनः गणना हो रही है।'
            : 'Route deviation detected. Recalculating route.'
        )
        utterance.lang = langRef.current === 'hi' ? 'hi-IN' : 'en-US'
        speechSynthesis.speak(utterance)
      }

      try {
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/foot/${curr[1]},${curr[0]};${d.lng},${d.lat}?overview=full&geometries=geojson`
        )
        const data = await res.json()
        if (data.routes?.length > 0) {
          const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
            ([lo, la]: [number, number]) => [la, lo]
          )
          setRouteCoords(coords)
          routeCoordsRef.current = coords
          setRemainingDist(calcRemainingDistance(curr, coords))
        }
      } catch (e) {
        console.error("Re-routing failed:", e)
      }

      setTimeout(() => {
        setShowDeviation(false)
        isRerouting = false
        rerouteCooldownUntil = Date.now() + 10000
      }, 3000)
    }

    const handleSuccess = (pos: GeolocationPosition) => {
      const curr: [number, number] = [pos.coords.latitude, pos.coords.longitude]
      setCurrentLocation(curr)
      setAccuracy(Math.round(pos.coords.accuracy))

      // ── STEP 3: Accumulate traveled distance (before prevPosRef update) ────
      if (prevPosRef.current) {
        const stepM = haversineDistance(
          prevPosRef.current.pos[0], prevPosRef.current.pos[1],
          curr[0], curr[1]
        )
        totalTraveledRef.current += stepM
      }

      // ── STEP 3: Record track point — throttled to 30s ─────────────────────
      const tsNow = Date.now()
      if (tsNow - lastRecordedRef.current > 30000 && deliveryIdRef.current) {
        lastRecordedRef.current = tsNow
        dbRecordTrackPoint(deliveryIdRef.current, pos)
      }

      if (!isRecordingRef.current) return

      const d = destRef.current
      if (!d) return
      const route = routeCoordsRef.current

      const now = Date.now()
      let speedKmh = 0
      if (prevPosRef.current && now - prevPosRef.current.time > 0) {
        const distM = haversineDistance(
          prevPosRef.current.pos[0], prevPosRef.current.pos[1],
          curr[0], curr[1]
        )
        speedKmh = (distM / ((now - prevPosRef.current.time) / 1000)) * 3.6
      }
      prevPosRef.current = { pos: curr, time: now }
      setSpeed(speedKmh)
      const status: MovingStatus = speedKmh < 0.5 ? "STOPPED" : "MOVING"
      setMovingStatus(status)

      const remaining = calcRemainingDistance(curr, route)
      setRemainingDist(remaining)
      const effectiveSpeed = speedKmh < 0.5 ? 4 : speedKmh
      setEta(((remaining / 1000) / effectiveSpeed) * 60)

      const distToDest = haversineDistance(curr[0], curr[1], d.lat, d.lng)
      if (distToDest <= 50) {
        setDeliveryStatus("Arrived")
      } else if (distToDest <= 500) {
        setDeliveryStatus("Approaching")
      } else if (status === "MOVING") {
        setDeliveryStatus("En Route")
      } else {
        setDeliveryStatus("Preparing")
      }

      if (!isRerouting && Date.now() > rerouteCooldownUntil && route.length > 0) {
        if (distToNearestRoutePoint(curr, route) > 50) {
          handleDeviation(curr)
        }
      }
    }

    const watchId = navigator.geolocation.watchPosition(
      handleSuccess,
      (err) => console.error("GPS error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // ── STEP 4: Complete delivery on "I'm at the destination" ─────────────────
  const handleAtDestination = () => {
    // Fire-and-forget: don't block navigation on Supabase write
    if (deliveryIdRef.current) {
      dbCompleteDelivery(
        deliveryIdRef.current,
        startedAtRef.current,
        totalTraveledRef.current
      ).catch((e) => console.error("completeDelivery failed:", e))
    }
    router.push("/arrival")
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const destTuple: [number, number] = dest ? [dest.lat, dest.lng] : [28.6139, 77.209]
  const progressPercent = DELIVERY_PROGRESS[deliveryStatus]

  const statusLabel: Record<DeliveryStatus, string> = {
    Preparing:   t('preparing'),
    "En Route":  t('enRoute'),
    Approaching: t('approaching'),
    Arrived:     t('arrivedStatus'),
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: BG_MAIN, color: "#ffffff", fontFamily: "sans-serif" }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: BG_CARD, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontWeight: "bold", fontSize: "16px" }}>{t('liveTracking')}</span>
        <LangToggle />
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ color: "red", fontSize: "10px" }}>🔴</span>
          <span style={{ fontSize: "11px", fontWeight: "bold" }}>REC</span>
        </div>
      </div>

      {/* ── Map type tabs ──────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: BG_CARD, display: "flex", borderBottom: `1px solid ${GRAY_BAR}`, flexShrink: 0 }}>
        {(["street", "satellite"] as MapType[]).map((type) => (
          <button
            key={type}
            onClick={() => setMapType(type)}
            style={{
              flex: 1,
              padding: "8px",
              border: "none",
              fontSize: "13px",
              fontWeight: "bold",
              cursor: "pointer",
              backgroundColor: mapType === type ? ORANGE : "transparent",
              color: mapType === type ? "#fff" : GRAY_SUB,
              borderBottom: mapType === type ? `2px solid ${ORANGE}` : "2px solid transparent",
            }}
          >
            {type === "street" ? t('mapTab') : t('satelliteTab')}
          </button>
        ))}
      </div>

      {/* ── Map ───────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", height: "45vh", flexShrink: 0, touchAction: "pan-x pan-y pinch-zoom", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        <TrackingMap
          currentLocation={currentLocation}
          destination={destTuple}
          routeCoordinates={routeCoords}
          mapType={mapType}
          accuracy={accuracy}
          forceCenterTrigger={forceCenterTrigger}
        />

        {/* Live Position button */}
        <button
          onClick={() => setForceCenterTrigger((t) => t + 1)}
          style={{
            position: "absolute", top: "10px", right: "10px", zIndex: 1000,
            backgroundColor: BG_CARD, color: "#fff", padding: "6px 12px",
            borderRadius: "8px", fontSize: "12px", fontWeight: "bold",
            border: `1px solid ${GRAY_BAR}`, cursor: "pointer",
          }}
        >
          📍 {t('livePosition')}
        </button>

        {/* Deviation popup */}
        {showDeviation && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, pointerEvents: "none" }}>
            <div style={{ backgroundColor: BG_CARD, border: `2px solid ${ORANGE}`, borderRadius: "16px", padding: "20px 24px", textAlign: "center", maxWidth: "240px", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>⚠️</div>
              <div style={{ fontSize: "14px", fontWeight: "bold", lineHeight: 1.5 }}>
                {t('routeDeviation')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Info cards: DISTANCE / ETA ─────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", padding: "12px 16px 0", flexShrink: 0 }}>
        <div style={{ backgroundColor: BG_CARD, borderRadius: "12px", padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: GRAY_SUB, fontWeight: "bold", letterSpacing: "1px" }}>📍 {t('distance').toUpperCase()}</div>
          <div style={{ fontSize: "22px", fontWeight: "bold", marginTop: "6px" }}>{formatDistance(remainingDist)}</div>
        </div>
        <div style={{ backgroundColor: BG_CARD, borderRadius: "12px", padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: GRAY_SUB, fontWeight: "bold", letterSpacing: "1px" }}>🕐 {t('eta').toUpperCase()}</div>
          <div style={{ fontSize: "22px", fontWeight: "bold", marginTop: "6px" }}>{formatEta(eta)}</div>
        </div>
      </div>

      {/* ── Stats row: MOVING / STOPPED / SPEED ───────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", padding: "8px 16px 0", flexShrink: 0 }}>
        <div style={{ backgroundColor: BG_CARD, borderRadius: "10px", padding: "10px 6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", color: GRAY_SUB, letterSpacing: "0.5px", fontWeight: "bold" }}>✈ {t('moving')}</div>
          <div style={{ fontSize: "15px", fontWeight: "bold", marginTop: "4px", color: movingStatus === "MOVING" ? "#22c55e" : "#fff" }}>
            {movingDisplay}
          </div>
        </div>
        <div style={{ backgroundColor: BG_CARD, borderRadius: "10px", padding: "10px 6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", color: GRAY_SUB, letterSpacing: "0.5px", fontWeight: "bold" }}>⏹ {t('stopped')}</div>
          <div style={{ fontSize: "15px", fontWeight: "bold", marginTop: "4px", color: movingStatus === "STOPPED" ? "#f59e0b" : "#fff" }}>
            {stoppedDisplay}
          </div>
        </div>
        <div style={{ backgroundColor: BG_CARD, borderRadius: "10px", padding: "10px 6px", textAlign: "center" }}>
          <div style={{ fontSize: "9px", color: GRAY_SUB, letterSpacing: "0.5px", fontWeight: "bold" }}>📶 {t('speed')}</div>
          <div style={{ fontSize: "15px", fontWeight: "bold", marginTop: "4px" }}>{speed.toFixed(0)} km/h</div>
        </div>
      </div>

      {/* ── GPS Recording bar ──────────────────────────────────────────────── */}
      <div style={{ margin: "8px 16px 0", backgroundColor: BG_CARD, borderRadius: "10px", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: isRecording ? ORANGE : GRAY_SUB, fontSize: "14px" }}>●</span>
          <span style={{ fontSize: "12px", fontWeight: "bold", color: isRecording ? "#fff" : GRAY_SUB }}>
            {isRecording ? t('gpsActive') : t('gpsPaused')}
          </span>
        </div>
        <button
          onClick={() => setIsRecording((r) => !r)}
          style={{
            backgroundColor: isRecording ? GRAY_BAR : ORANGE, color: "#fff",
            border: "none", borderRadius: "6px", padding: "4px 12px",
            fontSize: "12px", fontWeight: "bold", cursor: "pointer",
          }}
        >
          {isRecording ? t('pause') : t('resume')}
        </button>
      </div>

      {/* ── Delivery Status ────────────────────────────────────────────────── */}
      <div style={{ margin: "8px 16px 0", backgroundColor: BG_CARD, borderRadius: "12px", padding: "14px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <span style={{ fontSize: "11px", fontWeight: "bold", color: GRAY_SUB, letterSpacing: "1px" }}>{t('deliveryStatus')}</span>
          <span style={{ backgroundColor: DELIVERY_BADGE_COLOR[deliveryStatus], color: "#fff", padding: "3px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "bold" }}>
            {statusLabel[deliveryStatus]}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ height: "4px", backgroundColor: GRAY_BAR, borderRadius: "2px", position: "relative", marginBottom: "6px" }}>
          <div style={{ height: "100%", width: `${progressPercent}%`, backgroundColor: ORANGE, borderRadius: "2px", transition: "width 0.5s ease", position: "relative" }}>
            {progressPercent > 0 && progressPercent < 100 && (
              <div style={{ position: "absolute", right: "-6px", top: "-4px", width: "12px", height: "12px", backgroundColor: ORANGE, borderRadius: "50%", border: `2px solid ${BG_CARD}` }} />
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: GRAY_SUB, marginBottom: "8px" }}>
          <span>{t('start')}</span>
          <span>{t('near')}</span>
          <span>{t('arrived')}</span>
        </div>

        <div style={{ fontSize: "11px", color: GRAY_SUB }}>
          {t('autoDetecting')}
        </div>
      </div>

      {/* ── I'm at the destination ─────────────────────────────────────────── */}
      <div style={{ padding: "10px 16px 4px", flexShrink: 0 }}>
        <button
          onClick={handleAtDestination}
          style={{ width: "100%", height: "52px", backgroundColor: ORANGE, color: "#fff", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "bold", cursor: "pointer" }}
        >
          {t('atDestination')}
        </button>
      </div>

      {/* ── Footer note ───────────────────────────────────────────────────── */}
      <div style={{ padding: "4px 16px 16px", textAlign: "center", flexShrink: 0 }}>
        <span style={{ fontSize: "11px", color: GRAY_SUB }}>{t('gpsNote')}</span>
      </div>

      {/* ── Arrived overlay ───────────────────────────────────────────────── */}
      {showArrived && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99999 }}>
          <div style={{ backgroundColor: BG_CARD, borderRadius: "24px", padding: "40px 48px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}>
            <div style={{ fontSize: "56px", marginBottom: "12px" }}>🎉</div>
            <div style={{ fontSize: "20px", fontWeight: "bold" }}>{t('arrivedOverlay')}</div>
          </div>
        </div>
      )}
    </div>
  )
}
