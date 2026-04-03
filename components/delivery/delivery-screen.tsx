"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { User, Package, IndianRupee } from "lucide-react"
import { EntrancePhoto } from "./entrance-photo"
import { DirectionArrow } from "./direction-arrow"
import { LocalInstructions } from "./local-instructions"
import { ConfidenceBar } from "./confidence-bar"
import { ConfirmArrival } from "./confirm-arrival"
import { useLang } from "@/app/context/LanguageContext"
import { LangToggle } from "@/app/components/LangToggle"

interface DeliveryInfoProps {
  shipperName?: string
  quantity?: number
  fee?: number
}

const defaultDeliveryInfo: Required<DeliveryInfoProps> = {
  shipperName: "Apex Logistics Co.",
  quantity: 24,
  fee: 580,
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
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

function calcBearing(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180)
  const x =
    Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/** Returns the index of the route point closest to current position */
function findNearestRouteIndex(
  lat: number, lng: number,
  route: [number, number][]
): number {
  let nearestIndex = 0
  let minDist = Infinity
  for (let i = 0; i < route.length; i++) {
    const d = haversineDistance(lat, lng, route[i][0], route[i][1])
    if (d < minDist) { minDist = d; nearestIndex = i }
  }
  return nearestIndex
}

/**
 * Bearing from current position toward the next road segment on the route.
 * Looks up to 5 points ahead of the nearest point for a stable direction.
 * Falls back to straight-line bearing if route is too short.
 */
function calcRouteBearing(
  lat: number, lng: number,
  route: [number, number][],
  fallbackDestLat: number,
  fallbackDestLng: number
): number {
  if (route.length < 2) {
    return calcBearing(lat, lng, fallbackDestLat, fallbackDestLng)
  }
  const nearestIndex = findNearestRouteIndex(lat, lng, route)
  const lookAhead = Math.min(nearestIndex + 5, route.length - 1)
  const [targetLat, targetLng] = route[lookAhead]
  return calcBearing(lat, lng, targetLat, targetLng)
}

/**
 * Remaining distance along the route from current position.
 * Sums segments from the nearest route point to the destination.
 */
function calcRemainingRouteDistance(
  lat: number, lng: number,
  route: [number, number][]
): number {
  if (route.length < 2) return 0
  const nearestIndex = findNearestRouteIndex(lat, lng, route)
  // Distance from current pos to nearest point, plus remaining route segments
  let total = haversineDistance(lat, lng, route[nearestIndex][0], route[nearestIndex][1])
  for (let i = nearestIndex; i < route.length - 1; i++) {
    total += haversineDistance(
      route[i][0], route[i][1],
      route[i + 1][0], route[i + 1][1]
    )
  }
  return total
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DeliveryScreen({
  shipperName = defaultDeliveryInfo.shipperName,
  quantity = defaultDeliveryInfo.quantity,
  fee = defaultDeliveryInfo.fee,
}: DeliveryInfoProps = {}) {
  const router = useRouter()
  const { t } = useLang()

  const [showArrived, setShowArrived] = useState(false)

  // GPS state (watchPosition)
  const [currentPos, setCurrentPos] = useState<{
    lat: number
    lng: number
    heading: number | null
  } | null>(null)

  // Destination from localStorage
  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null)

  // OSRM route coordinates [[lat, lng], ...]
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([])

  // Computed navigation state
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null)
  const [bearingDeg, setBearingDeg] = useState<number | null>(null)

  // Prevent duplicate OSRM fetches
  const osrmFetchedRef = useRef(false)

  // ── Load destination from localStorage ──────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("destination")
    if (saved) {
      const d = JSON.parse(saved)
      setDestination({ lat: d.lat, lng: d.lng })
    }
  }, [])

  // ── Load route from localStorage ────────────────────────────────────────────
  useEffect(() => {
    const savedRoute = localStorage.getItem("route")
    if (savedRoute) {
      const parsed = JSON.parse(savedRoute)
      if (Array.isArray(parsed.coordinates) && parsed.coordinates.length > 0) {
        setRouteCoordinates(parsed.coordinates)
      }
    }
  }, [])

  // ── GPS watchPosition — continuous tracking ─────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
        })
      },
      (err) => console.error("GPS error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // ── OSRM fallback: fetch route if not in localStorage ───────────────────────
  useEffect(() => {
    if (routeCoordinates.length > 0) return       // already have route
    if (osrmFetchedRef.current) return             // already fetched
    if (!currentPos || !destination) return        // need both to fetch

    osrmFetchedRef.current = true

    const url =
      `https://router.project-osrm.org/route/v1/foot/` +
      `${currentPos.lng},${currentPos.lat};${destination.lng},${destination.lat}` +
      `?overview=full&geometries=geojson`

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.routes?.length > 0) {
          const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
            ([lo, la]: [number, number]) => [la, lo]
          )
          setRouteCoordinates(coords)
        }
      })
      .catch((e) => console.error("OSRM fetch failed:", e))
  }, [currentPos, destination, routeCoordinates.length])

  // ── Recalculate bearing + distance on every GPS / route update ──────────────
  useEffect(() => {
    if (!currentPos || !destination) return

    let absBearing: number
    let dist: number

    if (routeCoordinates.length >= 2) {
      // Route-based: direction to next road segment, distance along route
      absBearing = calcRouteBearing(
        currentPos.lat, currentPos.lng,
        routeCoordinates,
        destination.lat, destination.lng
      )
      dist = calcRemainingRouteDistance(
        currentPos.lat, currentPos.lng,
        routeCoordinates
      )
    } else {
      // Fallback: straight line to destination
      absBearing = calcBearing(
        currentPos.lat, currentPos.lng,
        destination.lat, destination.lng
      )
      dist = haversineDistance(
        currentPos.lat, currentPos.lng,
        destination.lat, destination.lng
      )
    }

    setDistanceMeters(dist)

    // Relative bearing: subtract device heading so arrow faces correct direction
    const relative = currentPos.heading != null
      ? (absBearing - currentPos.heading + 360) % 360
      : absBearing
    setBearingDeg(relative)

  }, [currentPos, destination, routeCoordinates])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="relative mx-auto flex h-dvh max-w-md flex-col bg-background">
      {/* Language toggle */}
      <div className="flex justify-end px-4 pt-2">
        <LangToggle />
      </div>

      {/* Scrollable content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Delivery info bar */}
        <div className="flex h-12 items-center border-b border-border bg-card px-4">
          <div className="flex flex-1 items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-foreground truncate">{shipperName}</span>
          </div>
          <div className="flex flex-1 items-center justify-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-accent shrink-0" />
            <span className="text-xs text-accent">{quantity} items</span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-1">
            <IndianRupee className="h-3.5 w-3.5 text-accent shrink-0" />
            <span className="text-sm font-bold text-accent">{fee}</span>
          </div>
        </div>

        {/* 1. Entrance Photo */}
        <EntrancePhoto
          latitude={currentPos?.lat}
          longitude={currentPos?.lng}
        />

        {/* 2. AR-like Direction Arrow — OSRM route-based bearing + distance */}
        <DirectionArrow
          distanceMeters={distanceMeters}
          bearingDeg={bearingDeg}
        />

        {/* Divider */}
        <div className="mx-4 h-px bg-border" />

        {/* 3. Hyper-local Instructions */}
        <LocalInstructions />

        {/* 4+5. Confidence Bar */}
        <ConfidenceBar />

        {/* 7. Confirm Arrival */}
        <ConfirmArrival onConfirm={() => {
          setShowArrived(true)
          setTimeout(() => {
            router.push("/completion")
          }, 2000)
        }} />
      </div>

      {showArrived && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-green-500">
          <div className="text-6xl mb-4">📍</div>
          <div className="text-3xl font-bold text-white tracking-wide">
            {t("destinationArrived")}
          </div>
        </div>
      )}
    </main>
  )
}
