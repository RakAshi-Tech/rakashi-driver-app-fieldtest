"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { APIProvider, Map, Marker, MapMouseEvent } from "@vis.gl/react-google-maps"
import { Button } from "@/components/ui/button"
import { MapPin } from "lucide-react"

const DELHI_CENTER = { lat: 28.6139, lng: 77.2090 }

export default function SetDestinationPage() {
  const router = useRouter()
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""

  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null)
  const [initialCenter, setInitialCenter] = useState(DELHI_CENTER)

  // Get current GPS position for initial map center
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setInitialCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        // fallback to Delhi
      },
      { timeout: 5000 }
    )
  }, [])

  const handleMapClick = (e: MapMouseEvent) => {
    if (!e.detail.latLng) return
    setSelected({ lat: e.detail.latLng.lat, lng: e.detail.latLng.lng })
  }

  const handleSetDestination = () => {
    if (!selected) return
    localStorage.setItem("destination", JSON.stringify(selected))
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
      <div className="flex-1 relative">
        {apiKey ? (
          <APIProvider apiKey={apiKey}>
            <Map
              defaultCenter={initialCenter}
              defaultZoom={15}
              onClick={handleMapClick}
              style={{ width: "100%", height: "100%" }}
              gestureHandling="greedy"
              disableDefaultUI={false}
            >
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
        {/* Selected coordinates */}
        <div className="flex items-center gap-2 min-h-[24px]">
          {selected ? (
            <p className="text-sm font-medium text-foreground">
              <MapPin className="inline w-4 h-4 mr-1" style={{ color: "#F97316" }} />
              Selected: {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No location selected</p>
          )}
        </div>

        {/* Set as Destination */}
        <Button
          onClick={handleSetDestination}
          disabled={!selected}
          className="w-full h-14 text-base font-bold rounded-xl text-white"
          style={{ backgroundColor: selected ? "#F97316" : undefined }}
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
