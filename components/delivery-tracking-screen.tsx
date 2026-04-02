"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  APIProvider,
  Map,
} from "@vis.gl/react-google-maps"
import {
  MapPin,
  Navigation,
  Clock,
  Pause,
  CheckCircle2,
  Radio,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmArrival } from "@/components/delivery/confirm-arrival"
import { supabase } from "@/lib/supabase"

type DeliveryStatus = "en-route" | "near-destination" | "arrived"

interface TrackingMetrics {
  distanceRemaining: string
  eta: string
  movementTime: string
  stopTime: string
  speed: string
}

interface PositionState {
  lat: number
  lng: number
  accuracy?: number
}

const DEFAULT_CENTER = {
  lat: 35.6595, // 東京・渋谷（Street View確認用）
  lng: 139.7004,
}

const ARRIVAL_RADIUS_M = 30
const ARRIVAL_DWELL_MS = 3000

function calcDistanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function DeliveryTrackingScreen() {
  const router = useRouter()
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  const [status, setStatus] = useState<DeliveryStatus>("en-route")
  const [isRecording, setIsRecording] = useState(true)
  const [language, setLanguage] = useState<"en" | "hi">("en")
  const [deliveryCompleted, setDeliveryCompleted] = useState(false)
  const [showArrivalBanner, setShowArrivalBanner] = useState(false)

  const [metrics] = useState<TrackingMetrics>({
    distanceRemaining: "0.8 km",
    eta: "4 min",
    movementTime: "12:34",
    stopTime: "02:15",
    speed: "18 km/h",
  })

  const [blink, setBlink] = useState(true)
  const [position, setPosition] = useState<PositionState | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [deliveryId, setDeliveryId] = useState<string | null>(null)

  const nearbyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs for use inside watchPosition closure (stale closure対策)
  const deliveryIdRef = useRef<string | null>(null)
  const isRecordingRef = useRef(true)
  const lastSavedAtRef = useRef<number>(0)
  const startedAtRef = useRef<Date>(new Date())
  const positionRef = useRef<PositionState | null>(null)

  // Sync isRecording → ref
  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  // On mount: create gps_delivery_summary record
  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase
        .from("gps_delivery_summary")
        .insert({
          driver_id: "demo",
          job_id: "mock-123",
          started_at: startedAtRef.current.toISOString(),
        })
        .select("id")
        .single()
      if (!error && data) {
        deliveryIdRef.current = data.id
        setDeliveryId(data.id)
      }
    }
    init()
  }, [])

  // On arrived: update gps_delivery_summary
  useEffect(() => {
    if (status !== "arrived" || !deliveryIdRef.current || !positionRef.current) return
    const durationMin = Math.round(
      (Date.now() - startedAtRef.current.getTime()) / 60000
    )
    supabase
      .from("gps_delivery_summary")
      .update({
        completed_at: new Date().toISOString(),
        total_duration_min: durationMin,
        end_lat: positionRef.current.lat,
        end_lng: positionRef.current.lng,
      })
      .eq("id", deliveryIdRef.current)
  }, [status])

  // Blink interval for REC indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink((prev) => !prev)
    }, 800)
    return () => clearInterval(interval)
  }, [])

  // GPS watchPosition
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser.")
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocationError(null)
        const newPos: PositionState = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }
        setPosition(newPos)
        positionRef.current = newPos

        // Save track point every 30s (skip if stopped or paused)
        const speed = pos.coords.speed
        const now = Date.now()
        if (
          deliveryIdRef.current &&
          isRecordingRef.current &&
          speed !== 0 &&
          now - lastSavedAtRef.current >= 30000
        ) {
          lastSavedAtRef.current = now
          supabase.from("gps_track_points").insert({
            delivery_id: deliveryIdRef.current,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speed: speed ?? null,
            accuracy: pos.coords.accuracy ?? null,
          })
        }
      },
      (error) => {
        setLocationError(error.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 5000,
      }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // Auto-arrival detection: must be within 30m for 3 seconds continuously
  useEffect(() => {
    if (status !== "en-route" || !position) return

    const distance = calcDistanceMeters(
      position.lat, position.lng,
      DEFAULT_CENTER.lat, DEFAULT_CENTER.lng
    )

    if (distance <= ARRIVAL_RADIUS_M) {
      if (!nearbyTimerRef.current) {
        nearbyTimerRef.current = setTimeout(() => {
          nearbyTimerRef.current = null
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200])
          }
          setShowArrivalBanner(true)
          setTimeout(() => {
            setShowArrivalBanner(false)
            router.push('/arrival')
          }, 1500)
        }, ARRIVAL_DWELL_MS)
      }
    } else {
      if (nearbyTimerRef.current) {
        clearTimeout(nearbyTimerRef.current)
        nearbyTimerRef.current = null
      }
    }
  }, [position, status])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (nearbyTimerRef.current) {
        clearTimeout(nearbyTimerRef.current)
      }
    }
  }, [])

  // Debug: deliveryCompleted の変化を監視
  useEffect(() => {
    console.log('[DeliveryTracking] deliveryCompleted 変化:', deliveryCompleted)
  }, [deliveryCompleted])

  const mapCenter = useMemo(() => {
    if (status === "arrived") return DEFAULT_CENTER
    if (position) return { lat: position.lat, lng: position.lng }
    return DEFAULT_CENTER
  }, [position, status])

  const mapZoom = status === "arrived" ? 18 : 16

  const statusConfig = {
    "en-route": {
      label: language === "en" ? "En Route" : "रास्ते में",
      color: "bg-accent",
      progress: 33,
    },
    "near-destination": {
      label: language === "en" ? "Near Destination" : "गंतव्य के पास",
      color: "bg-chart-4",
      progress: 66,
    },
    arrived: {
      label: language === "en" ? "Arrived" : "पहुँच गए",
      color: "bg-chart-3",
      progress: 100,
    },
  }

  return (
    <div className="min-h-screen bg-background relative flex flex-col">
      {/* Arrival Banner */}
      {showArrivalBanner && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-chart-3 text-foreground text-sm font-bold py-3 px-4 text-center animate-in slide-in-from-top duration-300 shadow-lg">
          {language === "en" ? "You have arrived! 🎉" : "आप पहुँच गए! 🎉"}
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-2 bg-card border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm text-foreground">
            {language === "en" ? "Live Tracking" : "लाइव ट्रैकिंग"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-secondary rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setLanguage("en")}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                language === "en"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage("hi")}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                language === "hi"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              हिंदी
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                blink && isRecording ? "bg-destructive" : "bg-destructive/30"
              } transition-opacity`}
            />
            <span className="text-xs text-destructive font-mono">REC</span>
          </div>
        </div>
      </div>

      {/* Street View (arrived only) */}
      {status === "arrived" && (
        <div className="relative w-full bg-muted border-b border-border" style={{ height: "200px" }}>
          {!apiKey ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-foreground bg-secondary">
              {language === "en" ? "Could not load Street View" : "Street View लोड नहीं हो सका"}
            </div>
          ) : (
            <>
              <img
                src={`https://maps.googleapis.com/maps/api/streetview?size=600x200&location=${DEFAULT_CENTER.lat},${DEFAULT_CENTER.lng}&fov=90&heading=0&pitch=0&key=${apiKey}`}
                alt="Street View"
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget
                  target.style.display = "none"
                  const fallback = target.nextElementSibling as HTMLElement | null
                  if (fallback) fallback.style.display = "flex"
                }}
              />
              <div
                className="absolute inset-0 items-center justify-center text-sm text-foreground bg-secondary"
                style={{ display: "none" }}
              >
                {language === "en" ? "Could not load Street View" : "Street View लोड नहीं हो सका"}
              </div>
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded">
                Street View
              </div>
            </>
          )}
        </div>
      )}

      {/* Map Area */}
      <div
        className="relative overflow-hidden rounded-b-lg bg-muted"
        style={{ height: "320px", display: status === "arrived" ? "none" : undefined }}
      >
        {!apiKey ? (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-destructive bg-card">
            Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          </div>
        ) : (
          <APIProvider apiKey={apiKey}>
            <Map
              defaultCenter={DEFAULT_CENTER}
              center={mapCenter}
              defaultZoom={mapZoom}
              zoom={mapZoom}
              gestureHandling="greedy"
              disableDefaultUI={false}
              className="w-full h-full"
            />
          </APIProvider>
        )}

        {/* Center dot overlay = current location */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <div className="w-10 h-10 bg-primary/20 rounded-full animate-ping absolute" />
            <div className="w-10 h-10 bg-primary/30 rounded-full flex items-center justify-center">
              <div className="w-5 h-5 bg-primary rounded-full border-2 border-primary-foreground shadow-lg" />
            </div>
          </div>
        </div>

        {/* Top-right panel */}
        <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-muted-foreground border border-border shadow-sm">
          {language === "en" ? "Live Position" : "लाइव स्थिति"}
        </div>

        {/* Bottom-left location info */}
        <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-sm px-3 py-2 rounded text-[10px] text-muted-foreground border border-border shadow-sm max-w-[240px]">
          {position ? (
            <div className="space-y-0.5">
              <div className="font-medium text-foreground">
                {language === "en" ? "Current Location" : "वर्तमान स्थान"}
              </div>
              <div>Lat: {position.lat.toFixed(6)}</div>
              <div>Lng: {position.lng.toFixed(6)}</div>
              {position.accuracy !== undefined && (
                <div>
                  {language === "en" ? "Accuracy" : "सटीकता"}:{" "}
                  {Math.round(position.accuracy)} m
                </div>
              )}
            </div>
          ) : locationError ? (
            <div className="text-destructive">
              {language === "en" ? "Location error:" : "लोकेशन त्रुटि:"}{" "}
              {locationError}
            </div>
          ) : (
            <div>
              {language === "en"
                ? "Waiting for current location..."
                : "वर्तमान स्थान प्राप्त किया जा रहा है..."}
            </div>
          )}
        </div>
      </div>

      {/* Metrics Panel */}
      <div className="bg-card border-t border-border p-3">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-secondary rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-3.5 h-3.5 text-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {language === "en" ? "Distance" : "दूरी"}
              </span>
            </div>
            <div className="text-xl font-bold text-accent font-mono">
              {metrics.distanceRemaining}
            </div>
          </div>

          <div className="bg-secondary rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5 text-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {language === "en" ? "ETA" : "समय"}
              </span>
            </div>
            <div className="text-xl font-bold text-accent font-mono">
              {metrics.eta}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-secondary/50 rounded p-2 border border-border/50">
            <div className="flex items-center gap-1 mb-0.5">
              <Navigation className="w-3 h-3 text-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase">
                {language === "en" ? "Moving" : "चलना"}
              </span>
            </div>
            <div className="text-sm font-semibold text-foreground font-mono">
              {metrics.movementTime}
            </div>
          </div>

          <div className="bg-secondary/50 rounded p-2 border border-border/50">
            <div className="flex items-center gap-1 mb-0.5">
              <Pause className="w-3 h-3 text-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase">
                {language === "en" ? "Stopped" : "रुका"}
              </span>
            </div>
            <div className="text-sm font-semibold text-foreground font-mono">
              {metrics.stopTime}
            </div>
          </div>

          <div className="bg-secondary/50 rounded p-2 border border-border/50">
            <div className="flex items-center gap-1 mb-0.5">
              <Radio className="w-3 h-3 text-foreground" />
              <span className="text-[9px] text-muted-foreground uppercase">
                {language === "en" ? "Speed" : "गति"}
              </span>
            </div>
            <div className="text-sm font-semibold text-accent font-mono">
              {metrics.speed}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-secondary/30 rounded px-3 py-1.5 mb-3 border border-border/30">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                blink && isRecording ? "bg-destructive" : "bg-destructive/30"
              }`}
            />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {language === "en"
                ? "GPS Recording Active"
                : "GPS रिकॉर्डिंग सक्रिय"}
            </span>
          </div>

          <button
            onClick={() => setIsRecording(!isRecording)}
            className="text-[10px] text-primary hover:text-primary/80 transition-colors"
          >
            {isRecording
              ? language === "en"
                ? "Pause"
                : "रोकें"
              : language === "en"
              ? "Resume"
              : "जारी रखें"}
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-card border-t border-border px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {language === "en" ? "Delivery Status" : "डिलीवरी स्थिति"}
          </span>
          <span
            className={`text-xs font-semibold ${
              status === "arrived" ? "text-chart-3" : "text-primary"
            }`}
          >
            {statusConfig[status].label}
          </span>
        </div>

        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full ${statusConfig[status].color} transition-all duration-500 ease-out`}
            style={{ width: `${statusConfig[status].progress}%` }}
          />
        </div>

        <div className="flex justify-between mt-1">
          <span className="text-[8px] text-muted-foreground">
            {language === "en" ? "Start" : "शुरू"}
          </span>
          <span className="text-[8px] text-muted-foreground">
            {language === "en" ? "Near" : "पास"}
          </span>
          <span className="text-[8px] text-muted-foreground">
            {language === "en" ? "Arrived" : "पहुँचे"}
          </span>
        </div>
      </div>

      {/* Action Button */}
      <div className="p-4 pb-8 bg-card space-y-2">
        <div className="w-full h-14 flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-secondary/30">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-muted-foreground">
            {language === "en"
              ? "Auto-detecting arrival (30m)..."
              : "到着を自動検知中 (30m)..."}
          </span>
        </div>
        <button
          onClick={() => router.push('/arrival')}
          className="w-full h-14 rounded-xl bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors"
        >
          {language === "en" ? "I'm at the destination" : "गंतव्य पर पहुँच गया"}
        </button>
        <p className="text-xs text-muted-foreground text-center">
          ※ Use only when GPS cannot detect arrival
        </p>
      </div>

      {/* Delivery Completed Overlay */}
      {deliveryCompleted && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-chart-3/95">
          <div className="text-6xl mb-4">✅</div>
          <div className="text-3xl font-bold text-foreground tracking-wide">
            {language === "en" ? "Delivery Complete" : language === "hi" ? "डिलीवरी पूर्ण" : "配達完了"}
          </div>
        </div>
      )}
    </div>
  )
}
