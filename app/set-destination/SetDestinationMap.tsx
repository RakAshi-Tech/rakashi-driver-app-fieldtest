import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from "react-leaflet"
import { useEffect, useRef } from "react"

// Fix default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
})

const blueIcon = new L.DivIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z
             M12 17c-2.761 0-5-2.239-5-5s2.239-5 5-5 5 2.239 5 5-2.239 5-5 5z"
          fill="#4285F4" stroke="white" stroke-width="1"/>
  </svg>`,
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  className: "",
})

const orangeIcon = new L.DivIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z
             M12 17c-2.761 0-5-2.239-5-5s2.239-5 5-5 5 2.239 5 5-2.239 5-5 5z"
          fill="#F97316" stroke="white" stroke-width="1"/>
  </svg>`,
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  className: "",
})

/**
 * Handles map click for destination setting.
 * Uses a ref-based isDragging flag to prevent click from firing after a drag.
 */
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  const isDraggingRef = useRef(false)

  useMapEvents({
    dragstart() {
      isDraggingRef.current = true
    },
    dragend() {
      // Small delay so the click event that fires after dragend is ignored
      setTimeout(() => { isDraggingRef.current = false }, 150)
    },
    click(e) {
      if (isDraggingRef.current) return
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })

  return null
}

/**
 * Flies to GPS location once when it first becomes available.
 */
function GpsCenterSetter({ gpsLocation }: { gpsLocation: [number, number] | null }) {
  const map = useMap()
  const centeredRef = useRef(false)

  useEffect(() => {
    if (gpsLocation && !centeredRef.current) {
      centeredRef.current = true
      map.flyTo(gpsLocation, map.getZoom(), { animate: true, duration: 1 })
    }
  }, [gpsLocation, map])

  return null
}

export interface SetDestinationMapProps {
  initialCenter: [number, number]
  currentLocation: [number, number] | null
  selected: [number, number] | null
  routePoints: [number, number][]
  onMapClick: (lat: number, lng: number) => void
}

export default function SetDestinationMap({
  initialCenter,
  currentLocation,
  selected,
  routePoints,
  onMapClick,
}: SetDestinationMapProps) {
  return (
    <MapContainer
      center={initialCenter}
      zoom={15}
      dragging
      scrollWheelZoom
      doubleClickZoom
      touchZoom
      zoomControl
      style={{
        width: "100%",
        height: "100%",
        touchAction: "pan-x pan-y pinch-zoom",
      }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Click handler with drag-conflict protection */}
      <MapClickHandler onMapClick={onMapClick} />

      {/* Fly to GPS once when obtained */}
      <GpsCenterSetter gpsLocation={currentLocation} />

      {/* Current location — blue */}
      {currentLocation && (
        <Marker position={currentLocation} icon={blueIcon} />
      )}

      {/* Selected destination — orange */}
      {selected && (
        <Marker position={selected} icon={orangeIcon} />
      )}

      {/* Route polyline — orange */}
      {routePoints.length > 0 && (
        <Polyline positions={routePoints} color="#F97316" weight={4} />
      )}
    </MapContainer>
  )
}
