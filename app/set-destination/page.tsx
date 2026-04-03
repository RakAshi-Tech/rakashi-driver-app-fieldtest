"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { APIProvider, Map, Marker, MapMouseEvent, useMap } from "@vis.gl/react-google-maps"
import { Button } from "@/components/ui/button"
import { MapPin } from "lucide-react"

const DELHI_CENTER = { lat: 28.6139, lng: 77.209 }

function decodePolyline(encoded: string) {
  const points: { lat: number; lng: number }[] = []
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
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}

// Polyline renderer — must be inside APIProvider
function RoutePolyline({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap()
  const polylineRef = useRef<google.maps.Polyline | null>(null)

  useEffect(() => {
    if (!map || points.length === 0) return
    if (polylineRef.current) {
      polylineRef.current.setMap(null)
    }
    polylineRef.current = new google.maps.Polyline({
      path: points,
      strokeColor: "#F97316",
      strokeWeight: 4,
      map,
    })
    return () => {
      polylineRef.current?.setMap(null)
    }
  }, [map, points])

  return null
}

interface RouteInfo {
  distance: string
  duration: string
  polylinePoints: { lat: number; lng: number }[]
}

export default function SetDestinationPage() {
  const router = useRouter()
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""

  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [mapCenter, setMapCenter] = useState(DELHI_CENTER)
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [loadingRoute, setLoadingRoute] = useState(false)

  // Get GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCurrentLocation(loc)
        setMapCenter(loc)
      },
      () => {
        // fallback to Delhi
      },
      { timeout: 8000, enableHighAccuracy: true }
    )
  }, [])

  const fetchRoute = async (dest: { lat: number; lng: number }) => {
    if (!currentLocation) return
    setLoadingRoute(true)
    try {
      const origin = `${currentLocation.lat},${currentLocation.lng}`
      const destination = `${dest.lat},${dest.lng}`
      const res = await fetch(
        `/api/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=walking`
      )
      const data = await res.json()
      if (data.routes && data.routes.length > 0) {
        const leg = data.routes[0].legs[0]
        const polylinePoints = decodePolyline(data.routes[0].overview_polyline.points)
        setRouteInfo({
          distance: leg.distance.text,
          duration: leg.duration.text,
          polylinePoints,
        })
      }
    } catch (e) {
      console.error("Failed to fetch route:", e)
    } finally {
      setLoadingRoute(false)
    }
  }

  const handleMapClick = (e: MapMouseEvent) => {
    if (!e.detail.latLng) return
    const dest = { lat: e.detail.latLng.lat, lng: e.detail.latLng.lng }
    setSelected(dest)
    setRouteInfo(null)
    fetchRoute(dest)
  }

  const handleSetDestination = () => {
    if (!selected) return
    localStorage.setItem(
      "destination",
      JSON.stringify({
        lat: selected.lat,
        lng: selected.lng,
        distance: routeInfo?.distance ?? "",
        duration: routeInfo?.duration ?? "",
      })
    )
    router.push("/tracking")
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="px-4 py-3 bg-card border-b border-border shrink-0">
        <p className="text-sm font-medium text-center text-muted-foreground">
          Tap on map to set destination
        </p>
      </div>

      {/* Map */}
      <div className="relative" style={{ height: "calc(100vh - 200px)" }}>
        {apiKey ? (
          <APIProvider apiKey={apiKey}>
            <Map
              center={mapCenter}
              defaultZoom={15}
              onClick={handleMapClick}
              style={{ width: "100%", height: "100%", minHeight: "400px" }}
              gestureHandling="greedy"
              disableDefaultUI={false}
            >
              {/* Current location marker — blue */}
              {currentLocation && (
                <Marker
                  position={currentLocation}
                  title="You are here"
                  icon={{
                    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z",
                    fillColor: "#4285F4",
                    fillOpacity: 1,
                    strokeColor: "#fff",
                    strokeWeight: 1,
                    scale: 1.8,
                    anchor: { x: 12, y: 22 } as any,
                  }}
                />
              )}

              {/* Destination marker — orange */}
              {selected && (
                <Marker
                  position={selected}
                  title="Destination"
                  icon={{
                    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z",
                    fillColor: "#F97316",
                    fillOpacity: 1,
                    strokeColor: "#fff",
                    strokeWeight: 1,
                    scale: 1.8,
                    anchor: { x: 12, y: 22 } as any,
                  }}
                />
              )}

              {/* Route polyline */}
              {routeInfo && routeInfo.polylinePoints.length > 0 && (
                <RoutePolyline points={routeInfo.polylinePoints} />
              )}
            </Map>
          </APIProvider>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-secondary">
            Google Maps API key not configured
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="p-4 bg-card border-t border-border shrink-0 space-y-3">
        {!selected ? (
          <p className="text-sm text-muted-foreground text-center">
            Tap on the map to set your destination
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              📍 Destination set
            </p>
            {loadingRoute ? (
              <p className="text-sm text-muted-foreground">Calculating route…</p>
            ) : routeInfo ? (
              <>
                <p className="text-sm text-foreground">📏 Distance: {routeInfo.distance}</p>
                <p className="text-sm text-foreground">⏱️ Walking time: {routeInfo.duration}</p>
              </>
            ) : null}
          </div>
        )}

        {/* Set as Destination */}
        <Button
          onClick={handleSetDestination}
          disabled={!selected || loadingRoute}
          className="w-full h-14 text-base font-bold rounded-xl text-white"
          style={{ backgroundColor: selected && !loadingRoute ? "#F97316" : undefined }}
        >
          Set as Destination
        </Button>

        {/* Cancel */}
        <Button
          onClick={() => router.push("/dashboard")}
          variant="outline"
          className="w-full h-12 text-base font-semibold rounded-xl"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
