"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DriverProfileCard } from "@/components/driver-profile-card"
import { TrustScoreCard } from "@/components/trust-score-card"
import { TodayJobsList, type Job } from "@/components/today-jobs-list"
import { Button } from "@/components/ui/button"
import { Truck } from "lucide-react"

const mockDriverData = {
  name: "Rajaram Kumar",
  totalDeliveries: 17280,
  yearsExperience: 20,
  onTimeRate: 98,
  responseRate: 97,
  rating: 4.6,
  deliveryTimes: {
    under5km: 27,
    from5to10km: 50,
    over10km: "TBD",
  },
  isAccepting: true,
}

const mockJobs: Job[] = [
  {
    id: "job-001",
    shipperName: "Flipkart Logistics",
    blockNumber: "A-127",
    quantity: 12,
    fee: 450,
    status: "pending",
  },
  {
    id: "job-002",
    shipperName: "Amazon Fresh",
    blockNumber: "B-045",
    quantity: 8,
    fee: 320,
    status: "in_progress",
  },
  {
    id: "job-003",
    shipperName: "BigBasket",
    blockNumber: "C-089",
    quantity: 15,
    fee: 580,
    status: "done",
  },
]

export default function HomePage() {
  const router = useRouter()
  const [language, setLanguage] = useState<"en" | "hi">("en")

  const firstPendingJob = mockJobs.find((job) => job.status === "pending")

  const handleStartNextJob = () => {
    router.push("/ocr")
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Phone Frame */}
      <div className="w-full max-w-[390px] h-[844px] bg-background rounded-[2.5rem] border-4 border-border shadow-2xl overflow-hidden flex flex-col">
        {/* Status Bar Mock */}
        <div className="h-11 bg-card flex items-center justify-between px-6 shrink-0">
          <span className="text-[11px] font-medium text-foreground">9:41</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-foreground" />
              <div className="w-1 h-1 rounded-full bg-foreground" />
              <div className="w-1 h-1 rounded-full bg-foreground" />
              <div className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            </div>
            <span className="text-[11px] text-foreground ml-1">5G</span>
            <div className="w-6 h-3 border border-foreground rounded-sm ml-1 relative">
              <div className="absolute inset-0.5 bg-primary rounded-[1px]" style={{ width: "70%" }} />
            </div>
          </div>
        </div>

        {/* Header with Language Toggle */}
        <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">DriverHub</span>
          </div>

          {/* Language Toggle */}
          <div className="flex items-center bg-secondary rounded-md p-0.5">
            <button
              onClick={() => setLanguage("en")}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                language === "en"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage("hi")}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                language === "hi"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              हिंदी
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
          {/* Driver Profile Card */}
          <DriverProfileCard {...mockDriverData} />

          {/* Trust Score Card */}
          <TrustScoreCard score={87} trend="up" />

          {/* Today's Jobs */}
          <div className="flex-1 min-h-0">
            <TodayJobsList jobs={mockJobs} />
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="p-3 pt-0 shrink-0">
          <Button
            onClick={handleStartNextJob}
            disabled={!firstPendingJob}
            className="w-full h-12 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {firstPendingJob ? "Start next job" : "No pending jobs"}
          </Button>
        </div>

        {/* Home Indicator */}
        <div className="h-8 flex items-center justify-center shrink-0">
          <div className="w-32 h-1 bg-foreground/30 rounded-full" />
        </div>
      </div>
    </div>
  )
}