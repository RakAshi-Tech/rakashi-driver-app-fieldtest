"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { useLang } from "@/app/context/LanguageContext"
import { LangToggle } from "@/app/components/LangToggle"
import type { PickupMapProps } from "./PickupMap"
import { supabase } from "@/lib/supabase"

const PickupMap = dynamic<PickupMapProps>(
  () => import("./PickupMap"),
  {
    ssr: false,
    loading: () => (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "#16213e", color: "#9ca3af", fontSize: "13px",
      }}>
        Loading map…
      </div>
    ),
  }
)

const BG_MAIN = "#0f0f1a"
const BG_CARD = "#16213e"
const ORANGE   = "#f97316"
const GRAY_SUB = "#9ca3af"

export default function PickupPage() {
  const router = useRouter()
  const { t } = useLang()

  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null)
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([])
  const [distance, setDistance] = useState(0)
  const [duration, setDuration] = useState(0)
  const [routeFetched, setRouteFetched] = useState(false)

  const [pickupLat, setPickupLat] = useState(0)
  const [pickupLng, setPickupLng] = useState(0)
  const [pickupAddress, setPickupAddress] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")

  // Read from localStorage on client side
  useEffect(() => {
    setPickupLat(parseFloat(localStorage.getItem("pickupLat") || "0"))
    setPickupLng(parseFloat(localStorage.getItem("pickupLng") || "0"))
    setPickupAddress(localStorage.getItem("pickupAddress") || "")
    setDeliveryAddress(localStorage.getItem("deliveryAddress") || "")
  }, [])

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentLocation([pos.coords.latitude, pos.coords.longitude])
      },
      (err) => console.error("GPS error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // Fetch OSRM route: current → pickup
  useEffect(() => {
    if (!currentLocation || !pickupLat || !pickupLng || routeFetched) return
    setRouteFetched(true)
    const [lat, lng] = currentLocation
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${lng},${lat};${pickupLng},${pickupLat}` +
      `?overview=full&geometries=geojson`
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.routes?.length > 0) {
          const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
            ([lo, la]: [number, number]) => [la, lo]
          )
          setRouteCoordinates(coords)
          setDistance(data.routes[0].distance)
          setDuration(data.routes[0].duration)
        }
      })
      .catch((e) => console.error("OSRM pickup fetch failed:", e))
  }, [currentLocation, pickupLat, pickupLng, routeFetched])

  const handlePickupComplete = async () => {
    const requestId = localStorage.getItem("currentRequestId")
    if (requestId) {
      await supabase
        .from("delivery_requests")
        .update({
          status: "picked_up",
          picked_up_at: new Date().toISOString(),
        })
        .eq("id", requestId)
    }

    const deliveryLat = localStorage.getItem("deliveryLat")
    const deliveryLng = localStorage.getItem("deliveryLng")

    localStorage.setItem(
      "destination",
      JSON.stringify({
        lat: parseFloat(deliveryLat || "0"),
        lng: parseFloat(deliveryLng || "0"),
        distance: 0,
        duration: 0,
      })
    )

    router.push("/tracking")
  }

  const distLabel =
    distance >= 1000
      ? `${(distance / 1000).toFixed(1)} km`
      : `${Math.round(distance)} m`
  const etaLabel = `${Math.round(duration / 60)} min`

  const pickupTuple: [number, number] = [pickupLat, pickupLng]

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      backgroundColor: BG_MAIN,
      color: "#ffffff",
      fontFamily: "sans-serif",
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: BG_CARD,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "none",
            border: "none",
            color: "#ffffff",
            fontSize: "20px",
            cursor: "pointer",
            padding: "0 8px 0 0",
          }}
        >
          ←
        </button>
        <span style={{ fontWeight: "bold", fontSize: "16px" }}>
          {t("pickupHeading")}
        </span>
        <LangToggle />
      </div>

      {/* Map */}
      <div style={{ height: "50vh", flexShrink: 0 }}>
        <PickupMap
          currentLocation={currentLocation}
          pickupLocation={pickupTuple}
          routeCoordinates={routeCoordinates}
        />
      </div>

      {/* Info panel */}
      <div style={{
        flex: 1,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        overflowY: "auto",
      }}>
        {/* Pickup info */}
        <div style={{ backgroundColor: BG_CARD, borderRadius: "12px", padding: "14px" }}>
          <div style={{ fontSize: "11px", color: GRAY_SUB, marginBottom: "4px" }}>
            📍 {t("pickupLabel")}
          </div>
          <div style={{ fontSize: "14px", fontWeight: "500" }}>
            {pickupAddress || "—"}
          </div>
          {distance > 0 && (
            <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "13px", color: ORANGE }}>
              <span>{distLabel}</span>
              <span>ETA: {etaLabel}</span>
            </div>
          )}
        </div>

        {/* Delivery destination */}
        <div style={{ backgroundColor: BG_CARD, borderRadius: "12px", padding: "14px" }}>
          <div style={{ fontSize: "11px", color: GRAY_SUB, marginBottom: "4px" }}>
            🏁 {t("nextDestination")}
          </div>
          <div style={{ fontSize: "14px", fontWeight: "500" }}>
            {deliveryAddress || "—"}
          </div>
        </div>

        {/* Complete button */}
        <button
          onClick={handlePickupComplete}
          style={{
            width: "100%",
            height: "56px",
            backgroundColor: ORANGE,
            border: "none",
            borderRadius: "12px",
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: "bold",
            cursor: "pointer",
            marginTop: "auto",
          }}
        >
          {t("pickupComplete")}
        </button>
      </div>
    </div>
  )
}
