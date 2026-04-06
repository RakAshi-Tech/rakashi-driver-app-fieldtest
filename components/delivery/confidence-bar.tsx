"use client"

import { useState, useEffect } from "react"
import { ShieldCheck, Award } from "lucide-react"
import { useLang } from "@/app/context/LanguageContext"
import { supabase } from "@/lib/supabase"

// hex color を rgba に変換
const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const calcRouteConfidence = (
  arrivalCount: number
): { labelKey: string; percentage: number; color: string } => {
  if (arrivalCount >= 100)
    return { labelKey: 'veryHighReliability', percentage: 95, color: '#16a34a' }
  if (arrivalCount >= 50)
    return { labelKey: 'highReliability',     percentage: 85, color: '#16a34a' }
  if (arrivalCount >= 20)
    return { labelKey: 'goodReliability',     percentage: 70, color: '#eab308' }
  if (arrivalCount >= 5)
    return { labelKey: 'buildingReliability', percentage: 50, color: '#eab308' }
  return   { labelKey: 'newDriver',           percentage: 20, color: '#9ca3af' }
}

export function ConfidenceBar() {
  const { t } = useLang()
  const [arrivalCount, setArrivalCount] = useState(0)

  useEffect(() => {
    const fetchArrivalCount = async () => {
      const driverId = localStorage.getItem('driverId') || 'demo'
      const { count } = await supabase
        .from('gps_delivery_summary')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', driverId)
        .not('completed_at', 'is', null)
      setArrivalCount(count ?? 0)
    }
    fetchArrivalCount()
  }, [])

  const { labelKey, percentage, color } = calcRouteConfidence(arrivalCount)

  return (
    <section className="px-4 py-1" aria-label="Route confidence information">
      <div
        className="rounded-xl border px-3 py-2"
        style={{
          backgroundColor: hexToRgba(color, 0.15),
          borderColor:     hexToRgba(color, 0.30),
        }}
      >
        {/* Header row */}
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" style={{ color }} />
            <span
              className="text-xs font-black uppercase tracking-wider"
              style={{ color }}
            >
              {t('routeConfidence')}
            </span>
          </div>
          <span className="text-xs font-black" style={{ color }}>
            {t(labelKey)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-background/50">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${percentage}%`, backgroundColor: color }}
          />
        </div>

        {/* Arrival badge */}
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4" style={{ color }} />
          <span className="text-xs font-bold" style={{ color }}>
            {t('arrivedSuccessfully')}{" "}
            <span className="text-sm font-black">{arrivalCount}</span>{" "}
            {t('times')}
          </span>
        </div>
      </div>
    </section>
  )
}
