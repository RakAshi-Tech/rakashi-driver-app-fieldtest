"use client"

import { TrendingUp, Info } from "lucide-react"
import { useLang } from "@/app/context/LanguageContext"

interface TrustScoreCardProps {
  score: number
  trend: "up" | "stable" | "down"
}

export function TrustScoreCard({ score, trend }: TrustScoreCardProps) {
  const { t } = useLang()

  const getTrendIcon = () => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-3.5 w-3.5 text-primary" />
      case "stable":
        return <span className="text-xs text-muted-foreground">→</span>
      case "down":
        return <TrendingUp className="h-3.5 w-3.5 text-destructive rotate-180" />
    }
  }

  const getScoreColor = () => {
    if (score >= 80) return "text-accent"
    if (score >= 60) return "text-accent"
    return "text-destructive"
  }

  const getProgressColor = () => {
    if (score >= 80) return "bg-primary"
    if (score >= 60) return "bg-accent"
    return "bg-destructive"
  }

  return (
    <div className="bg-card rounded-lg p-3 border border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('trustScore')}
          </span>
          <Info className="h-3 w-3 text-muted-foreground/60" />
        </div>
        <div className="flex items-center gap-1">
          {getTrendIcon()}
          <span className="text-[10px] text-muted-foreground">
            {trend === "up" ? t('improving') : trend === "stable" ? t('stable') : t('declining')}
          </span>
        </div>
      </div>

      <div className="flex items-end gap-3 mt-2">
        <span className={`text-4xl font-bold ${getScoreColor()}`}>{score}</span>
        <div className="flex-1 pb-2">
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor()} rounded-full transition-all duration-500`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
        {t('trustScoreDesc')}
      </p>

      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border">
        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="text-[10px] text-foreground">
          {t('trustScoreBenefit')}
        </span>
      </div>
    </div>
  )
}
