"use client"

import { Badge } from "@/components/ui/badge"
import { Package, ChevronRight } from "lucide-react"
import Link from "next/link"

export interface Job {
  id: string
  shipperName: string
  blockNumber: string
  quantity: number
  fee: number
  status: "pending" | "in_progress" | "done"
}

interface TodayJobsListProps {
  jobs: Job[]
}

export function TodayJobsList({ jobs }: TodayJobsListProps) {
  const getStatusBadge = (status: Job["status"]) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-accent text-accent">
            Pending
          </Badge>
        )
      case "in_progress":
        return (
          <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-0">
            In Progress
          </Badge>
        )
      case "done":
        return (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
            Done
          </Badge>
        )
    }
  }

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">
          Today&apos;s Jobs
        </h3>
        <Link
          href="/history"
          className="text-[10px] text-primary hover:underline"
        >
          View all
        </Link>
      </div>

      <div className="divide-y divide-border">
        {jobs.slice(0, 3).map((job) => (
          <Link
            key={job.id}
            href={`/job/${job.id}`}
            className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-secondary/50 transition-colors active:bg-secondary"
          >
            <div className="h-8 w-8 rounded bg-secondary flex items-center justify-center shrink-0">
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground truncate">
                  {job.shipperName}
                </span>
                {getStatusBadge(job.status)}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                <span>Block {job.blockNumber}</span>
                <span>•</span>
                <span>{job.quantity} items</span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs font-semibold text-primary">₹{job.fee}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
