"use client"

import { CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Job } from "@/components/today-jobs-list"
import { useLang } from "@/app/context/LanguageContext"

interface CompletedJobsListProps {
  jobs: Job[]
}

export function CompletedJobsList({ jobs }: CompletedJobsListProps) {
  const { t } = useLang()

  if (jobs.length === 0) return null

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {t('completedJobs')}
        </h3>
      </div>

      <div className="divide-y divide-border">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex items-center gap-2.5 px-3 py-2.5 bg-[#2A2A2A] border-l-4 border-green-500"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground truncate">
                  {job.shipperName}
                </span>
                <Badge className="text-[9px] px-1.5 py-0 bg-green-500/20 text-green-400 border-0 shrink-0">
                  ✅ {t('done')}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                <span>{t('block')} {job.blockNumber}</span>
                <span>•</span>
                <span>{job.quantity} {t('items')}</span>
                <span>•</span>
                <span>Today 14:32</span>
              </div>
            </div>

            <span className="text-xs font-semibold text-accent shrink-0">₹{job.fee}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
