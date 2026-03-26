"use client"

import { useState } from "react"
import { CheckCircle2, Phone } from "lucide-react"

export function ConfirmArrival() {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <section className="px-4 pb-8 pt-2" aria-label="Arrival confirmation actions">
      {/* Call row */}
      <button
        className="mb-3 flex h-14 w-full items-center justify-center gap-3 rounded-2xl border-2 border-[#22c55e]/40 bg-[#22c55e]/10 font-black text-[#22c55e] transition-all active:scale-95"
        aria-label="Call receiver"
      >
        <Phone className="h-6 w-6" />
        <span className="text-base">Call Receiver</span>
      </button>

      {/* Giant confirm button */}
      <button
        onClick={() => setConfirmed(!confirmed)}
        className={`flex h-[88px] w-full items-center justify-center gap-4 rounded-2xl border-3 text-xl font-black uppercase tracking-wider transition-all active:scale-[0.97] ${
          confirmed
            ? "border-success bg-success text-success-foreground shadow-[0_0_30px_rgba(34,197,94,0.3)]"
            : "border-accent bg-accent text-accent-foreground shadow-[0_0_24px_rgba(234,179,8,0.2)]"
        }`}
        aria-label="Confirm delivery arrival"
      >
        <CheckCircle2 className={`h-10 w-10 ${confirmed ? "" : "animate-pulse"}`} />
        <span className="text-2xl">
          {confirmed ? "CONFIRMED" : "CONFIRM ARRIVAL"}
        </span>
      </button>
    </section>
  )
}
