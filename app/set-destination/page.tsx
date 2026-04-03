"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { useLang } from "@/app/context/LanguageContext"
import { LangToggle } from "@/app/components/LangToggle"
import type { SetDestinationMapProps } from "./SetDestinationMap"

const DELHI_CENTER: [number, number] = [28.6139, 77.209]

// Leaflet must not run on the server
const SetDestinationMap = dynamic<SetDestinationMapProps>(
  () => import("./SetDestinationMap"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1e293b",
          color: "#9ca3af",
          fontSize: "13px",
        }}
      >
        Loading map…
      </div>
    ),
  }
)

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let shift = 0, result = 0, b
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : result >> 1
    points.push([lat / 1e5, lng / 1e5])
  }
  return points
}

interface RouteInfo {
  distanceText: string
  durationText: string
  distanceValue: number
  durationValue: number
  polylinePoints: [number, number][]
}

export default function SetDestinationPage() {
  const router = useRouter()
  const { t } = useLang()

  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null)
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation([pos.coords.latitude, pos.coords.longitude])
      },
      () => { /* fallback to Delhi */ },
      { timeout: 8000, enableHighAccuracy: true }
    )
  }, [])

  const fetchRoute = async (dest: [number, number]) => {
    if (!currentLocation) return
    setLoadingRoute(true)
    try {
      const origin = `${currentLocation[0]},${currentLocation[1]}`
      const destination = `${dest[0]},${dest[1]}`
      const res = await fetch(
        `/api/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=walking`
      )
      const data = await res.json()
      if (data.routes && data.routes.length > 0) {
        const leg = data.routes[0].legs[0]
        const polylinePoints = decodePolyline(data.routes[0].overview_polyline.points)
        setRouteInfo({
          distanceText: leg.distance.text,
          durationText: leg.duration.text,
          distanceValue: leg.distance.value,
          durationValue: leg.duration.value,
          polylinePoints,
        })
      }
    } catch (e) {
      console.error("Failed to fetch route:", e)
    } finally {
      setLoadingRoute(false)
    }
  }

  const handleMapClick = (lat: number, lng: number) => {
    const dest: [number, number] = [lat, lng]
    setSelected(dest)
    setRouteInfo(null)
    fetchRoute(dest)
  }

  const handleSetDestination = () => {
    if (!selected) return
    if (routeInfo) {
      localStorage.setItem("route", JSON.stringify({ coordinates: routeInfo.polylinePoints }))
    }
    localStorage.setItem(
      "destination",
      JSON.stringify({
        lat: selected[0],
        lng: selected[1],
        distance: routeInfo?.distanceValue ?? 0,
        duration: routeInfo?.durationValue ?? 0,
      })
    )
    router.push("/tracking")
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="px-4 py-3 bg-card border-b border-border shrink-0 flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {t("tapMapInstruction")}
        </p>
        <LangToggle />
      </div>

      {/* Map */}
      <div
        style={{
          position: "relative",
          height: "calc(100vh - 200px)",
          width: "100%",
          touchAction: "pan-x pan-y pinch-zoom",
          WebkitOverflowScrolling: "touch",
          pointerEvents: "auto",
          zIndex: 0,
        } as React.CSSProperties}
      >
        <SetDestinationMap
          initialCenter={currentLocation ?? DELHI_CENTER}
          currentLocation={currentLocation}
          selected={selected}
          routePoints={routeInfo?.polylinePoints ?? []}
          onMapClick={handleMapClick}
        />
      </div>

      {/* Bottom panel */}
      <div className="p-4 bg-card border-t border-border shrink-0 space-y-3">
        {!selected ? (
          <p className="text-sm text-muted-foreground text-center">
            {t("tapMapInstruction")}
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">📍 {t("destinationSet")}</p>
            {loadingRoute ? (
              <p className="text-sm text-muted-foreground">{t("calculating")}</p>
            ) : routeInfo ? (
              <>
                <p className="text-sm text-foreground">📏 {t("distance")}: {routeInfo.distanceText}</p>
                <p className="text-sm text-foreground">⏱️ {t("walkingTime")}: {routeInfo.durationText}</p>
              </>
            ) : null}
          </div>
        )}

        <Button
          onClick={handleSetDestination}
          disabled={!selected || loadingRoute}
          className="w-full h-14 text-base font-bold rounded-xl text-white"
          style={{ backgroundColor: selected && !loadingRoute ? "#F97316" : undefined }}
        >
          {t("setAsDestination")}
        </Button>

        <Button
          onClick={() => router.push("/dashboard")}
          variant="outline"
          className="w-full h-12 text-base font-semibold rounded-xl"
        >
          {t("cancel")}
        </Button>
      </div>
    </div>
  )
}
