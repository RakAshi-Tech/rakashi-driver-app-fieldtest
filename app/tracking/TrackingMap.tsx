import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet"
import { useEffect, useRef } from "react"

// Fix default icon paths (Next.js bundler drops the URL resolver)
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
 * SmartCenterUpdater:
 * - Auto-follows GPS position UNLESS the user is dragging the map
 * - When forceCenterTrigger increments (Live Position button), resumes auto-follow immediately
 */
function SmartCenterUpdater({
  center,
  forceCenterTrigger,
}: {
  center: [number, number]
  forceCenterTrigger: number
}) {
  const map = useMap()
  const userInteractingRef = useRef(false)
  const prevTriggerRef = useRef(forceCenterTrigger)

  // Listen for drag to pause auto-follow
  useEffect(() => {
    const onDragStart = () => { userInteractingRef.current = true }
    map.on("dragstart", onDragStart)
    return () => { map.off("dragstart", onDragStart) }
  }, [map])

  // Force-center on Live Position button (resets user-interacting flag)
  useEffect(() => {
    if (forceCenterTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = forceCenterTrigger
      userInteractingRef.current = false
      map.setView(center, map.getZoom(), { animate: true })
    }
  }, [forceCenterTrigger, center, map])

  // Auto-follow GPS — only when not user-interacting
  useEffect(() => {
    if (!userInteractingRef.current) {
      map.setView(center, map.getZoom(), { animate: true })
    }
  }, [center, map])

  return null
}

export interface TrackingMapProps {
  currentLocation: [number, number] | null
  destination: [number, number]
  routeCoordinates: [number, number][]
  mapType: "street" | "satellite"
  accuracy?: number
  forceCenterTrigger?: number
}

export default function TrackingMap({
  currentLocation,
  destination,
  routeCoordinates,
  mapType,
  accuracy,
  forceCenterTrigger = 0,
}: TrackingMapProps) {
  const center = currentLocation ?? destination

  return (
    <MapContainer
      center={center}
      zoom={15}
      style={{
        width: "100%",
        height: "100%",
        touchAction: "pan-x pan-y pinch-zoom",
      }}
      zoomControl
      dragging
      scrollWheelZoom
      doubleClickZoom
      touchZoom
    >
      {mapType === "street" ? (
        <TileLayer
          key="street"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      ) : (
        <TileLayer
          key="satellite"
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
      )}

      {/* Smart center: auto-follow GPS, pause on drag, resume on Live Position */}
      {currentLocation && (
        <SmartCenterUpdater
          center={currentLocation}
          forceCenterTrigger={forceCenterTrigger}
        />
      )}

      {/* Current location — blue, with popup */}
      {currentLocation && (
        <Marker position={currentLocation} icon={blueIcon}>
          <Popup>
            <div style={{ fontSize: "13px", lineHeight: 1.6, minWidth: "160px" }}>
              <strong>Current Location</strong>
              <br />
              Lat: {currentLocation[0].toFixed(6)}
              <br />
              Lng: {currentLocation[1].toFixed(6)}
              <br />
              Accuracy: {accuracy != null ? `${accuracy} m` : "—"}
            </div>
          </Popup>
        </Marker>
      )}

      {/* Destination — orange */}
      <Marker position={destination} icon={orangeIcon} />

      {/* Route polyline — blue */}
      {routeCoordinates.length > 0 && (
        <Polyline positions={routeCoordinates} color="#3B82F6" weight={4} />
      )}
    </MapContainer>
  )
}
