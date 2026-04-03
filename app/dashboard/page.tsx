"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DriverProfileCard } from "@/components/driver-profile-card"
import { TrustScoreCard } from "@/components/trust-score-card"
import { TodayJobsList, type Job } from "@/components/today-jobs-list"
import { CompletedJobsList } from "@/components/completed-jobs-list"
import { Button } from "@/components/ui/button"
import { Truck } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useLang } from "@/app/context/LanguageContext"
import { LangToggle } from "@/app/components/LangToggle"

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
  const { t } = useLang()
  const [driverProfile, setDriverProfile] = useState<any>(null)

  useEffect(() => {
    const loadProfile = async () => {
      const phone = localStorage.getItem("rakashi_phone")
      if (!phone) return

      const { data } = await supabase
        .from("driver_profiles")
        .select("*")
        .eq("phone_number", phone)
        .single()

      if (data) {
        setDriverProfile(data)
      }
    }
    loadProfile()
  }, [])

  const activeJobs = mockJobs.filter((job) => job.status !== "done")
  const completedJobs = mockJobs.filter((job) => job.status === "done")
  const firstPendingJob = mockJobs.find((job) => job.status === "pending")

  const handleStartNextJob = () => {
    router.push("/ocr")
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
        {/* Header with Language Toggle */}
        <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">DriverHub</span>
          </div>
          <LangToggle />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
          <DriverProfileCard
            {...mockDriverData}
            name={driverProfile?.name ?? mockDriverData.name}
          />
          <TrustScoreCard score={driverProfile?.trust_score ?? 87} trend="up" />
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            <TodayJobsList jobs={activeJobs} />
            <CompletedJobsList jobs={completedJobs} />
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="p-3 pt-0 shrink-0 space-y-2">
          <Button
            onClick={() => router.push("/set-destination")}
            variant="outline"
            className="w-full h-12 text-base font-semibold rounded-xl border border-primary text-primary"
          >
            {t('setDestinationBtn')}
          </Button>
          <Button
            onClick={handleStartNextJob}
            disabled={!firstPendingJob}
            className="w-full h-14 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 text-white"
          >
            {firstPendingJob ? t('startNextJob') : t('noPendingJobs')}
          </Button>
        </div>
    </div>
  )
}
