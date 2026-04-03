"use client"

import { useState } from "react"
import { CheckCircle2, Phone } from "lucide-react"
import { useLang } from "@/app/context/LanguageContext"

interface ConfirmArrivalProps {
  onConfirm?: () => void
}

export function ConfirmArrival({ onConfirm }: ConfirmArrivalProps) {
  const { t } = useLang()
  const [confirmed, setConfirmed] = useState(false)

  const handleConfirm = () => {
    console.log('[ConfirmArrival] ボタン押された, confirmed:', confirmed)
    if (confirmed) return
    setConfirmed(true)
    console.log('[ConfirmArrival] setConfirmed(true) 実行')
    setTimeout(() => {
      console.log('[ConfirmArrival] onConfirm呼び出し, onConfirm:', typeof onConfirm)
      onConfirm?.()
    }, 1500)
  }

  return (
    <section className="px-4 pb-4 pt-1" aria-label="Arrival confirmation actions">
      {/* Call row */}
      <button
        className="mb-2 flex h-10 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#22c55e]/40 bg-[#22c55e]/10 font-black text-[#22c55e] transition-all active:scale-95"
        aria-label="Call receiver"
      >
        <Phone className="h-4 w-4" />
        <span className="text-sm">{t('callReceiver')}</span>
      </button>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        className={`flex h-12 w-full items-center justify-center gap-3 rounded-2xl border-3 text-base font-black uppercase tracking-wider transition-all active:scale-[0.97] ${
          confirmed
            ? "border-success bg-success text-success-foreground shadow-[0_0_30px_rgba(34,197,94,0.3)]"
            : "border-accent bg-accent text-accent-foreground shadow-[0_0_24px_rgba(234,179,8,0.2)]"
        }`}
        aria-label="Confirm delivery arrival"
        disabled={confirmed}
      >
        <CheckCircle2 className={`h-5 w-5 ${confirmed ? "" : "animate-pulse"}`} />
        <span className="text-base">
          {confirmed ? t('confirmedArrival') : t('confirmArrival')}
        </span>
      </button>
    </section>
  )
}
