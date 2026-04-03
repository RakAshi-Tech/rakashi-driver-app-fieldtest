"use client"

import { ShieldCheck, Award } from "lucide-react"
import { useLang } from "@/app/context/LanguageContext"

export function ConfidenceBar() {
  const { t } = useLang()
  const confidence = "high" as "high" | "medium" | "low"
  const successCount = 42

  const config = {
    high: {
      label: t('highReliability'),
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
    <section className="px-4 py-1" aria-label="Route confidence information">
      <div className={`rounded-xl border ${c.borderColor} ${c.bgColor} px-3 py-2`}>
        {/* Confidence bar */}
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className={`h-4 w-4 ${c.textColor}`} />
            <span className={`text-xs font-black uppercase tracking-wider ${c.textColor}`}>
              {t('routeConfidence')}
            </span>
          </div>
          <span className={`text-xs font-black ${c.textColor}`}>{c.label}</span>
        </div>

        {/* Progress bar */}
        <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-background/50">
          <div
            className={`h-full rounded-full ${c.barColor} transition-all duration-1000`}
            style={{ width: confidence === "high" ? "92%" : confidence === "medium" ? "60%" : "30%" }}
          />
        </div>

        {/* Arrival success badge */}
        <div className="flex items-center gap-2">
          <Award className={`h-4 w-4 ${c.textColor}`} />
          <span className={`text-xs font-bold ${c.textColor}`}>
            {t('arrivedSuccessfully')}{" "}
            <span className="text-sm font-black">{successCount}</span> {t('times')}
          </span>
        </div>
      </div>
    </section>
  )
}
