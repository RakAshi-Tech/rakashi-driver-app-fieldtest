"use client"

import { useState, useEffect } from "react"
import { useLang } from "@/app/context/LanguageContext"

interface DirectionArrowProps {
  distanceMeters: number | null
  bearingDeg: number | null
}

function formatDistance(meters: number): { value: string; unit: string; isKm: boolean } {
  if (meters < 1000) {
    return { value: String(Math.round(meters)), unit: "", isKm: false }
  }
  return { value: (meters / 1000).toFixed(1), unit: " km", isKm: true }
}

export function DirectionArrow({ distanceMeters, bearingDeg }: DirectionArrowProps) {
  const { t } = useLang()
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setPulse((p) => !p), 1200)
    return () => clearInterval(interval)
  }, [])

  const distFormatted = distanceMeters != null ? formatDistance(distanceMeters) : null

  return (
    <section
      className="flex flex-col items-center gap-1.5 py-2"
      aria-label="Direction indicator pointing to entrance"
    >
      {/* AR-like large arrow — rotates toward destination */}
      <div
        className="relative"
        style={{
          transform: bearingDeg != null ? `rotate(${bearingDeg}deg)` : undefined,
          transition: "transform 0.6s ease",
        }}
      >
        {/* Glow ring */}
        <div
          className={`absolute -inset-3 rounded-full bg-primary/20 transition-all duration-700 ${
            pulse ? "scale-110 opacity-100" : "scale-100 opacity-40"
          }`}
        />
        <svg
          width="64"
          height="64"
          viewBox="0 0 80 80"
          fill="none"
          className="relative drop-shadow-[0_0_12px_rgba(234,179,8,0.6)]"
          aria-hidden="true"
        >
          {/* Arrow body */}
          <path
            d="M40 8 L62 44 L52 44 L52 72 L28 72 L28 44 L18 44 Z"
            fill="currentColor"
            className="text-primary"
          />
          {/* Inner highlight */}
          <path
            d="M40 18 L54 42 L48 42 L48 66 L32 66 L32 42 L26 42 Z"
            fill="currentColor"
            className="text-primary-foreground"
            opacity="0.15"
          />
        </svg>
      </div>

      {/* Distance callout — live GPS value */}
      <div className="flex items-baseline gap-1.5">
        {distFormatted != null ? (
          distFormatted.isKm ? (
            <span className="text-2xl font-black text-primary">
              {distFormatted.value}{distFormatted.unit}
            </span>
          ) : (
            <>
              <span className="text-2xl font-black text-primary">
                {distFormatted.value}
              </span>
              <span className="text-sm font-bold text-primary/70">{t("mAhead")}</span>
            </>
          )
        ) : (
          <span className="text-2xl font-black text-primary/40">—</span>
        )}
      </div>

      {/* Door-level label */}
      <span className="rounded-lg bg-primary/15 px-3 py-0.5 text-xs font-black uppercase tracking-widest text-primary">
        {t("doorLevelPrecision")}
      </span>
    </section>
  )
}
