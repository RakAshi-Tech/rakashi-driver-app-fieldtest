"use client"

import { ShieldCheck, Award } from "lucide-react"

export function ConfidenceBar() {
  const confidence = "high" as "high" | "medium" | "low"
  const successCount = 42

  const config = {
    high: {
      label: "High Reliability",
      barColor: "bg-success",
      textColor: "text-success",
      bgColor: "bg-success/15",
      borderColor: "border-success/30",
      width: "w-[92%]",
    },
    medium: {
      label: "Medium",
      barColor: "bg-primary",
      textColor: "text-primary",
      bgColor: "bg-primary/15",
      borderColor: "border-primary/30",
      width: "w-[60%]",
    },
    low: {
      label: "Low",
      barColor: "bg-destructive",
      textColor: "text-destructive",
      bgColor: "bg-destructive/15",
      borderColor: "border-destructive/30",
      width: "w-[30%]",
    },
  }

  const c = config[confidence]

  return (
    <section className="px-4 py-3" aria-label="Route confidence information">
      <div className={`rounded-xl border ${c.borderColor} ${c.bgColor} px-4 py-3`}>
        {/* Confidence bar */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className={`h-4 w-4 ${c.textColor}`} />
            <span className={`text-xs font-black uppercase tracking-wider ${c.textColor}`}>
              Route Confidence
            </span>
          </div>
          <span className={`text-xs font-black ${c.textColor}`}>{c.label}</span>
        </div>

        {/* Progress bar */}
        <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-background/50">
          <div
            className={`h-full rounded-full ${c.barColor} transition-all duration-1000`}
            style={{ width: confidence === "high" ? "92%" : confidence === "medium" ? "60%" : "30%" }}
          />
        </div>

        {/* Arrival success badge */}
        <div className="flex items-center gap-2">
          <Award className={`h-5 w-5 ${c.textColor}`} />
          <span className={`text-sm font-bold ${c.textColor}`}>
            Arrived Successfully{" "}
            <span className="text-lg font-black">{successCount}</span> times
          </span>
        </div>
      </div>
    </section>
  )
}
