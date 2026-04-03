"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import type { TrackingMapProps } from "./TrackingMap"

const TrackingMap = dynamic<TrackingMapProps>(
  () => import("./TrackingMap"),
  { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground bg-secondary">Loading map…</div> }
)

// ── Types ────────────────────────────────────────────────────────────────────

interface Destination {
  lat: number
  lng: number
  distance: number  // meters
  duration: number  // seconds
}

type MovingStatus = "STOPPED" | "MOVING"
type DeliveryStatus = "Preparing" | "En Route" | "Approaching" | "Arrived"

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

export default function TrackingPage() {
  const router = useRouter()

  const [dest, setDest] = useState<Destination | null>(null)
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([])
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null)
  const [speed, setSpeed] = useState(0)
  const [movingStatus, setMovingStatus] = useState<MovingStatus>("STOPPED")
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>("Preparing")
  const [remainingDist, setRemainingDist] = useState(0)
  const [eta, setEta] = useState(0)
  const [showDeviation, setShowDeviation] = useState(false)
  const [showArrived, setShowArrived] = useState(false)

  // Refs for mutable values accessed inside GPS callback
  const destRef = useRef<Destination | null>(null)
  const routeCoordsRef = useRef<[number, number][]>([])
  const prevPosRef = useRef<{ pos: [number, number]; time: number } | null>(null)
  const arrivedShownRef = useRef(false)
  const needsOsrmRef = useRef(false)
  const osrmFetchedRef = useRef(false)

  // Keep refs in sync with state
  useEffect(() => { destRef.current = dest }, [dest])
  useEffect(() => { routeCoordsRef.current = routeCoords }, [routeCoords])

  // ── Load from localStorage ─────────────────────────────────────────────────
  useEffect(() => {
    const destRaw = localStorage.getItem("destination")
    if (destRaw) {
      const d: Destination = JSON.parse(destRaw)
      setDest(d)
      destRef.current = d
      setRemainingDist(d.distance)
      setEta((d.distance / 1000 / 4) * 60) // initial ETA at walking speed
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

  // ── Fetch OSRM route if not in localStorage (needs GPS first) ──────────────
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
        speechSynthesis.speak(
          new SpeechSynthesisUtterance("Route deviation detected. Recalculating route.")
        )
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
          const remaining = calcRemainingDistance(curr, coords)
          setRemainingDist(remaining)
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

      const d = destRef.current
      if (!d) return
      const route = routeCoordsRef.current

      // ── Speed ──────────────────────────────────────────────────────────────
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

      // ── Distance & ETA ─────────────────────────────────────────────────────
      const remaining = calcRemainingDistance(curr, route)
      setRemainingDist(remaining)
      const effectiveSpeed = speedKmh < 0.5 ? 4 : speedKmh
      setEta(((remaining / 1000) / effectiveSpeed) * 60)

      // ── Delivery status ────────────────────────────────────────────────────
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

      // ── Route deviation ────────────────────────────────────────────────────
      if (!isRerouting && Date.now() > rerouteCooldownUntil && route.length > 0) {
        const nearestDist = distToNearestRoutePoint(curr, route)
        if (nearestDist > 50) {
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
  }, []) // empty deps — reads mutable values via refs

  // ── Badge helpers ──────────────────────────────────────────────────────────
  const deliveryBadgeStyle: Record<DeliveryStatus, { bg: string; text: string }> = {
    Preparing:   { bg: "bg-gray-400",   text: "text-white" },
    "En Route":  { bg: "bg-blue-500",   text: "text-white" },
    Approaching: { bg: "bg-orange-500", text: "text-white" },
    Arrived:     { bg: "bg-green-500",  text: "text-white" },
  }
  const movingBadgeStyle: Record<MovingStatus, { bg: string; text: string }> = {
    STOPPED: { bg: "bg-gray-400",  text: "text-white" },
    MOVING:  { bg: "bg-green-500", text: "text-white" },
  }

  const destTuple: [number, number] = dest
    ? [dest.lat, dest.lng]
    : [28.6139, 77.209]

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 bg-card border-b border-border shrink-0 flex items-center gap-2">
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold ${deliveryBadgeStyle[deliveryStatus].bg} ${deliveryBadgeStyle[deliveryStatus].text}`}
        >
          {deliveryStatus}
        </span>
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold ${movingBadgeStyle[movingStatus].bg} ${movingBadgeStyle[movingStatus].text}`}
        >
          {movingStatus}
        </span>
      </div>

      {/* ── Map ─────────────────────────────────────────────────────────────── */}
      <div className="relative shrink-0" style={{ height: "55vh" }}>
        <TrackingMap
          currentLocation={currentLocation}
          destination={destTuple}
          routeCoordinates={routeCoords}
        />

        {/* Deviation popup */}
        {showDeviation && (
          <div className="absolute inset-0 flex items-center justify-center z-[9999] pointer-events-none">
            <div className="bg-white dark:bg-gray-800 border border-orange-400 rounded-2xl shadow-xl px-6 py-4 text-center max-w-[260px]">
              <p className="text-2xl mb-1">⚠️</p>
              <p className="text-sm font-bold text-foreground leading-snug">
                Route Deviation<br />Detected.<br />Recalculating...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Info panel ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-card border-t border-border shrink-0 space-y-1">
        <p className="text-sm font-medium text-foreground">
          📍 Distance&nbsp;&nbsp;: {formatDistance(remainingDist)}
        </p>
        <p className="text-sm font-medium text-foreground">
          ⏱&nbsp;&nbsp;ETA&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: {formatEta(eta)}
        </p>
        <p className="text-sm font-medium text-foreground">
          🚗 Speed&nbsp;&nbsp;&nbsp;&nbsp;: {speed.toFixed(1)} km/h
        </p>
      </div>

      {/* ── Complete Delivery ────────────────────────────────────────────────── */}
      <div className="p-4 bg-card shrink-0">
        <Button
          onClick={() => router.push("/arrival")}
          className="w-full h-14 text-base font-bold rounded-xl text-white"
          style={{ backgroundColor: "#F97316" }}
        >
          Complete Delivery
        </Button>
      </div>

      {/* ── Arrived overlay ─────────────────────────────────────────────────── */}
      {showArrived && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[99999]">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl px-8 py-8 text-center">
            <p className="text-5xl mb-3">🎉</p>
            <p className="text-xl font-bold text-foreground">Arrived at Destination!</p>
          </div>
        </div>
      )}
    </div>
  )
}
