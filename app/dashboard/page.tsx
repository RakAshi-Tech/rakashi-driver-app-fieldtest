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

export default function HomePage() {
  const router = useRouter()
  const { t } = useLang()
  const [driverProfile, setDriverProfile] = useState<any>(null)
  const [todayJobs, setTodayJobs] = useState<Job[]>([])

  useEffect(() => {
    const loadData = async () => {
      const phone = localStorage.getItem("rakashi_phone")
      if (!phone) return

      const { data: profile } = await supabase
        .from("driver_profiles")
        .select("*")
        .eq("phone_number", phone)
        .single()

      if (!profile) return
      setDriverProfile(profile)

      // Store driverId for tracking page
      if (profile.id) localStorage.setItem("driverId", profile.id)

      // Fetch today's deliveries
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: deliveries } = await supabase
        .from("gps_delivery_summary")
        .select("id, job_id, started_at, completed_at")
        .eq("driver_id", profile.id)
        .gte("started_at", todayStart.toISOString())
        .order("started_at", { ascending: false })

      if (deliveries) {
        const jobs: Job[] = deliveries.map((d, i) => ({
          id: d.id,
          shipperName: d.job_id || `Delivery #${i + 1}`,
          blockNumber: "–",
          quantity: 0,
          fee: 0,
          status: d.completed_at ? "done" : "in_progress",
        }))
        setTodayJobs(jobs)
      }
    }
    loadData()
  }, [])

  const activeJobs  = todayJobs.filter((job) => job.status !== "done")
  const completedJobs = todayJobs.filter((job) => job.status === "done")
  const firstPendingJob = todayJobs.find((job) => job.status === "pending")

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
            name={driverProfile?.name ?? "–"}
            totalDeliveries={driverProfile?.total_deliveries ?? 0}
            yearsExperience={driverProfile?.experience_years ?? 0}
            onTimeRate={98}
            responseRate={97}
            rating={4.6}
            deliveryTimes={{ under5km: 27, from5to10km: 50, over10km: "TBD" }}
            isAccepting={true}
          />
          <TrustScoreCard score={driverProfile?.trust_score ?? 10} trend="up" />
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
