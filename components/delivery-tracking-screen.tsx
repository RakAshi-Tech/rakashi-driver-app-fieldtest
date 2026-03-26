"use client"

import { useState, useEffect } from "react"
import { MapPin, Navigation, Clock, Pause, CheckCircle2, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"

type DeliveryStatus = "en-route" | "near-destination" | "arrived"

interface TrackingMetrics {
  distanceRemaining: string
  eta: string
  movementTime: string
  stopTime: string
  speed: string
}

export function DeliveryTrackingScreen() {
  const [status, setStatus] = useState<DeliveryStatus>("en-route")
  const [isRecording, setIsRecording] = useState(true)
  const [language, setLanguage] = useState<"en" | "hi">("en")
  const [metrics] = useState<TrackingMetrics>({
    distanceRemaining: "0.8 km",
    eta: "4 min",
    movementTime: "12:34",
    stopTime: "02:15",
    speed: "18 km/h",
  })

  // Blinking effect for GPS recording indicator
  const [blink, setBlink] = useState(true)
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink((prev) => !prev)
    }, 800)
    return () => clearInterval(interval)
  }, [])

  const statusConfig = {
    "en-route": { 
      label: language === "en" ? "En Route" : "रास्ते में", 
      color: "bg-accent", 
      progress: 33 
    },
    "near-destination": { 
      label: language === "en" ? "Near Destination" : "गंतव्य के पास", 
      color: "bg-chart-4", 
      progress: 66 
    },
    arrived: { 
      label: language === "en" ? "Arrived" : "पहुँच गए", 
      color: "bg-chart-3", 
      progress: 100 
    },
  }

  const handleStatusChange = () => {
    if (status === "en-route") setStatus("near-destination")
    else if (status === "near-destination") setStatus("arrived")
  }

  return (
    <div className="w-[390px] h-[844px] bg-background rounded-[40px] overflow-hidden border-[8px] border-secondary relative flex flex-col shadow-2xl">
      {/* Status Bar Mock */}
      <div className="h-12 bg-card flex items-center justify-between px-6 pt-2">
        <span className="text-xs text-muted-foreground font-mono">9:41</span>
        <div className="w-28 h-6 bg-secondary rounded-full" />
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 border border-muted-foreground rounded-sm" />
        </div>
      </div>

      {/* Header */}
      <div className="px-4 py-2 bg-card border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm text-foreground">
            {language === "en" ? "Live Tracking" : "लाइव ट्रैकिंग"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Language Switcher */}
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
          {/* REC Indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2.5 h-2.5 rounded-full ${blink && isRecording ? "bg-destructive" : "bg-destructive/30"} transition-opacity`}
            />
            <span className="text-xs text-destructive font-mono">REC</span>
          </div>
        </div>
      </div>

      {/* Map Area - Fixed height container */}
      <div className="relative overflow-hidden rounded-b-lg" style={{ height: "320px" }}>
        {/* SVG Map Illustration - Sadar Bazaar, Delhi (z-index: 0) */}
        <svg 
          className="absolute inset-0 w-full h-full" 
          viewBox="0 0 390 320" 
          preserveAspectRatio="xMidYMid slice"
          style={{ zIndex: 0 }}
        >
          {/* Dark Background */}
          <rect width="390" height="320" fill="#1a1d24" />
          
          {/* Subtle gradient overlay */}
          <defs>
            <linearGradient id="mapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e2530" />
              <stop offset="100%" stopColor="#141820" />
            </linearGradient>
            <pattern id="mapGrid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#2a3040" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="390" height="320" fill="url(#mapGradient)" />
          <rect width="390" height="320" fill="url(#mapGrid)" opacity="0.6" />
          
          {/* Dense Market Blocks - High contrast for visibility */}
          <g fill="#252a35" stroke="#3a4255" strokeWidth="0.5">
            {/* Row 1 */}
            <rect x="12" y="15" width="42" height="32" rx="2" />
            <rect x="60" y="12" width="52" height="40" rx="2" />
            <rect x="118" y="16" width="38" height="35" rx="2" />
            <rect x="162" y="10" width="48" height="45" rx="2" />
            <rect x="216" y="14" width="42" height="38" rx="2" />
            <rect x="264" y="12" width="52" height="36" rx="2" />
            <rect x="322" y="16" width="55" height="32" rx="2" />
            
            {/* Row 2 */}
            <rect x="15" y="58" width="48" height="42" rx="2" />
            <rect x="68" y="62" width="56" height="45" rx="2" />
            <rect x="130" y="60" width="42" height="44" rx="2" />
            <rect x="178" y="56" width="52" height="50" rx="2" />
            <rect x="236" y="58" width="45" height="48" rx="2" />
            <rect x="287" y="55" width="40" height="46" rx="2" />
            <rect x="333" y="60" width="50" height="42" rx="2" />
            
            {/* Row 3 - Main market area */}
            <rect x="12" y="115" width="52" height="38" rx="2" />
            <rect x="70" y="118" width="45" height="42" rx="2" />
            <rect x="121" y="114" width="50" height="46" rx="2" />
            <rect x="177" y="112" width="42" height="44" rx="2" />
            <rect x="225" y="116" width="48" height="42" rx="2" />
            <rect x="279" y="112" width="52" height="46" rx="2" />
            <rect x="337" y="116" width="48" height="40" rx="2" />
            
            {/* Row 4 */}
            <rect x="15" y="168" width="45" height="40" rx="2" />
            <rect x="66" y="172" width="52" height="44" rx="2" />
            <rect x="124" y="170" width="42" height="42" rx="2" />
            <rect x="172" y="166" width="50" height="48" rx="2" />
            <rect x="228" y="170" width="45" height="44" rx="2" />
            <rect x="279" y="168" width="48" height="45" rx="2" />
            <rect x="333" y="172" width="52" height="40" rx="2" />
            
            {/* Row 5 */}
            <rect x="12" y="222" width="50" height="38" rx="2" />
            <rect x="68" y="225" width="48" height="42" rx="2" />
            <rect x="122" y="220" width="45" height="40" rx="2" />
            <rect x="173" y="218" width="52" height="45" rx="2" />
            <rect x="231" y="222" width="42" height="42" rx="2" />
            <rect x="279" y="220" width="50" height="40" rx="2" />
            <rect x="335" y="224" width="50" height="38" rx="2" />
            
            {/* Row 6 */}
            <rect x="15" y="274" width="48" height="38" rx="2" />
            <rect x="69" y="276" width="52" height="36" rx="2" />
            <rect x="127" y="272" width="45" height="40" rx="2" />
            <rect x="178" y="275" width="48" height="38" rx="2" />
            <rect x="232" y="278" width="50" height="35" rx="2" />
            <rect x="288" y="274" width="45" height="38" rx="2" />
            <rect x="339" y="276" width="46" height="36" rx="2" />
          </g>
          
          {/* Main Roads - Bright cyan lines */}
          <g stroke="#4a90a4" fill="none" strokeWidth="6" opacity="0.7">
            <line x1="0" y1="54" x2="390" y2="54" />
            <line x1="0" y1="162" x2="390" y2="162" />
            <line x1="0" y1="270" x2="390" y2="270" />
            <line x1="64" y1="0" x2="64" y2="320" />
            <line x1="172" y1="0" x2="172" y2="320" />
            <line x1="280" y1="0" x2="280" y2="320" />
          </g>
          
          {/* Secondary Streets */}
          <g stroke="#3d5a6a" fill="none" strokeWidth="3" opacity="0.6">
            <path d="M 0 108 Q 60 112 120 105 Q 180 98 240 108 Q 300 118 390 110" />
            <path d="M 0 216 Q 50 212 100 220 Q 150 228 200 218 Q 250 208 300 218 Q 350 228 390 220" />
            <path d="M 118 0 Q 115 45 122 90 Q 129 135 118 180 Q 107 225 120 320" />
            <path d="M 226 0 Q 230 50 222 100 Q 214 150 226 200 Q 238 250 228 320" />
            <path d="M 334 0 Q 338 55 330 110 Q 322 165 334 220 Q 346 275 338 320" />
          </g>
          
          {/* Narrow Alleys */}
          <g stroke="#3a4860" fill="none" strokeWidth="1.5" opacity="0.5">
            <line x1="38" y1="0" x2="35" y2="54" />
            <line x1="95" y1="54" x2="100" y2="108" />
            <line x1="145" y1="108" x2="140" y2="162" />
            <line x1="205" y1="162" x2="210" y2="216" />
            <line x1="255" y1="54" x2="250" y2="108" />
            <line x1="310" y1="108" x2="315" y2="162" />
            <line x1="355" y1="162" x2="350" y2="216" />
            <line x1="40" y1="162" x2="38" y2="216" />
            <line x1="92" y1="216" x2="95" y2="270" />
            <line x1="148" y1="270" x2="145" y2="320" />
          </g>
          
          {/* Map Labels - Inside SVG */}
          <text x="195" y="145" textAnchor="middle" fill="#6a8090" fontSize="10" fontWeight="600" letterSpacing="2">SADAR BAZAAR</text>
          <text x="320" y="42" textAnchor="middle" fill="#5a7080" fontSize="7" opacity="0.7">Chandni Chowk →</text>
          <text x="45" y="305" textAnchor="middle" fill="#4a6070" fontSize="6" opacity="0.6">DELHI</text>
          <text x="95" y="85" textAnchor="middle" fill="#4a6070" fontSize="5" opacity="0.5">Cloth Mkt</text>
          <text x="270" y="195" textAnchor="middle" fill="#4a6070" fontSize="5" opacity="0.5">Electronics</text>
          
          {/* Route Trail - Completed path (cyan dashed) */}
          <path
            d="M 55 255 Q 95 225 115 180 Q 135 135 175 125 Q 215 115 245 105 Q 275 95 285 78"
            fill="none"
            stroke="#4ecdc4"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="10 5"
            opacity="0.85"
          />
          {/* Active Route - Final segment (orange dashed) */}
          <path
            d="M 285 78 Q 305 60 325 50"
            fill="none"
            stroke="#e07850"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="6 4"
            opacity="0.9"
          />
        </svg>

        {/* Overlays - z-index: 10 */}
        <div className="absolute inset-0" style={{ zIndex: 10 }}>
          {/* Destination Marker */}
          <div className="absolute" style={{ top: "35px", left: "310px" }}>
            <div className="relative">
              <div className="w-8 h-8 bg-chart-3/20 rounded-full flex items-center justify-center border-2 border-chart-3">
                <MapPin className="w-4 h-4 text-chart-3" />
              </div>
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-card px-2 py-0.5 rounded text-[10px] text-foreground whitespace-nowrap border border-border shadow-md">
                {language === "en" ? "Destination" : "गंतव्य"}
              </div>
            </div>
          </div>

          {/* Current Location Dot */}
          <div className="absolute" style={{ top: "63px", left: "270px" }}>
            <div className="relative">
              <div className="w-10 h-10 bg-primary/20 rounded-full animate-ping absolute" />
              <div className="w-10 h-10 bg-primary/30 rounded-full flex items-center justify-center">
                <div className="w-5 h-5 bg-primary rounded-full border-2 border-primary-foreground shadow-lg" />
              </div>
            </div>
          </div>

          {/* Start Point */}
          <div className="absolute" style={{ top: "240px", left: "40px" }}>
            <div className="w-4 h-4 bg-muted rounded-full border-2 border-muted-foreground" />
          </div>

          {/* Corner Labels */}
          <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-muted-foreground border border-border">
            {language === "en" ? "Sadar Bazaar" : "सदर बाज़ार"}
          </div>
          <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-muted-foreground border border-border">
            {language === "en" ? "Delivery Point" : "डिलीवरी पॉइंट"}
          </div>
        </div>
      </div>

      {/* Metrics Panel */}
      <div className="bg-card border-t border-border p-3">
        {/* Primary Metrics */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-secondary rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-3.5 h-3.5 text-accent" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {language === "en" ? "Distance" : "दूरी"}
              </span>
            </div>
            <div className="text-xl font-bold text-foreground font-mono">{metrics.distanceRemaining}</div>
          </div>
          <div className="bg-secondary rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5 text-chart-4" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {language === "en" ? "ETA" : "समय"}
              </span>
            </div>
            <div className="text-xl font-bold text-foreground font-mono">{metrics.eta}</div>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-secondary/50 rounded p-2 border border-border/50">
            <div className="flex items-center gap-1 mb-0.5">
              <Navigation className="w-3 h-3 text-chart-3" />
              <span className="text-[9px] text-muted-foreground uppercase">
                {language === "en" ? "Moving" : "चलना"}
              </span>
            </div>
            <div className="text-sm font-semibold text-foreground font-mono">{metrics.movementTime}</div>
          </div>
          <div className="bg-secondary/50 rounded p-2 border border-border/50">
            <div className="flex items-center gap-1 mb-0.5">
              <Pause className="w-3 h-3 text-chart-4" />
              <span className="text-[9px] text-muted-foreground uppercase">
                {language === "en" ? "Stopped" : "रुका"}
              </span>
            </div>
            <div className="text-sm font-semibold text-foreground font-mono">{metrics.stopTime}</div>
          </div>
          <div className="bg-secondary/50 rounded p-2 border border-border/50">
            <div className="flex items-center gap-1 mb-0.5">
              <Radio className="w-3 h-3 text-primary" />
              <span className="text-[9px] text-muted-foreground uppercase">
                {language === "en" ? "Speed" : "गति"}
              </span>
            </div>
            <div className="text-sm font-semibold text-foreground font-mono">{metrics.speed}</div>
          </div>
        </div>

        {/* GPS Recording Status */}
        <div className="flex items-center justify-between bg-secondary/30 rounded px-3 py-1.5 mb-3 border border-border/30">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${blink && isRecording ? "bg-destructive" : "bg-destructive/30"}`} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {language === "en" ? "GPS Recording Active" : "GPS रिकॉर्डिंग सक्रिय"}
            </span>
          </div>
          <button
            onClick={() => setIsRecording(!isRecording)}
            className="text-[10px] text-primary hover:text-primary/80 transition-colors"
          >
            {isRecording ? (language === "en" ? "Pause" : "रोकें") : (language === "en" ? "Resume" : "जारी रखें")}
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-card border-t border-border px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {language === "en" ? "Delivery Status" : "डिलीवरी स्थिति"}
          </span>
          <span className={`text-xs font-semibold ${status === "arrived" ? "text-chart-3" : "text-primary"}`}>
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
          <span className="text-[8px] text-muted-foreground">{language === "en" ? "Start" : "शुरू"}</span>
          <span className="text-[8px] text-muted-foreground">{language === "en" ? "Near" : "पास"}</span>
          <span className="text-[8px] text-muted-foreground">{language === "en" ? "Arrived" : "पहुँचे"}</span>
        </div>
      </div>

      {/* Action Button */}
      <div className="p-4 pb-8 bg-card">
        {status !== "arrived" ? (
          <Button
            onClick={handleStatusChange}
            className="w-full h-14 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg"
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            {status === "en-route" 
              ? (language === "en" ? "Mark Near Destination" : "गंतव्य के पास चिह्नित करें") 
              : (language === "en" ? "Complete Delivery" : "डिलीवरी पूर्ण करें")}
          </Button>
        ) : (
          <Button
            className="w-full h-14 text-base font-bold bg-chart-3 hover:bg-chart-3/90 text-foreground rounded-xl shadow-lg"
            disabled
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            {language === "en" ? "Delivery Completed" : "डिलीवरी पूर्ण"}
          </Button>
        )}
      </div>

      {/* Home Indicator */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-muted-foreground/50 rounded-full" />
    </div>
  )
}
