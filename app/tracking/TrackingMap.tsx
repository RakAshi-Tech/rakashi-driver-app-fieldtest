import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet"
import { useEffect } from "react"

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

function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true })
  }, [center, map])
  return null
}

export interface TrackingMapProps {
  currentLocation: [number, number] | null
  destination: [number, number]
  routeCoordinates: [number, number][]
}

export default function TrackingMap({
  currentLocation,
  destination,
  routeCoordinates,
}: TrackingMapProps) {
  const center = currentLocation ?? destination

  return (
    <MapContainer
      center={center}
      zoom={15}
      style={{ width: "100%", height: "100%" }}
      zoomControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Follow current location */}
      {currentLocation && <MapCenterUpdater center={currentLocation} />}

      {/* Current location — blue */}
      {currentLocation && (
        <Marker position={currentLocation} icon={blueIcon} />
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
