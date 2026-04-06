"use client"

import { useState, useEffect, useRef } from "react"
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
import { requestNotificationPermission, onMessage } from "@/lib/firebase"

export default function HomePage() {
  const router = useRouter()
  const { t } = useLang()
  const [driverProfile, setDriverProfile] = useState<any>(null)
  const [todayJobs, setTodayJobs] = useState<Job[]>([])
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [incomingRequest, setIncomingRequest] = useState<any>(null)
  const [countdown, setCountdown] = useState(60)
  const incomingRequestRef = useRef<any>(null)

  // ── calcStarRating ──────────────────────────────────────────────────────────
  const calcStarRating = (trustScore: number): number => {
    if (trustScore >= 80) return Math.min(5.0, 4.5 + (trustScore - 80) / 100)
    if (trustScore >= 60) return 4.0 + (trustScore - 60) / 80
    if (trustScore >= 30) return 3.5 + (trustScore - 30) / 120
    return 3.0 + (trustScore - 10) / 100
  }

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

      // Store driverId and name for tracking page and fallback
      if (profile.id) localStorage.setItem("driverId", profile.id)
      if (profile.name) localStorage.setItem("driverName", profile.name)

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

  // ── driverId フォールバック（phone での取得が失敗した場合）────────────────
  useEffect(() => {
    const fetchDriverProfile = async () => {
      if (driverProfile) return  // 既に取得済みならスキップ
      const driverId = localStorage.getItem('driverId')
      if (!driverId) return

      const { data } = await supabase
        .from('driver_profiles')
        .select('name, trust_score, total_deliveries, experience_years, vehicle_type, id')
        .eq('id', driverId)
        .single()

      if (data) {
        setDriverProfile(data)
        localStorage.setItem('driverName', data.name)
      } else {
        const savedName = localStorage.getItem('driverName')
        if (savedName) setDriverProfile((prev: any) => prev ?? { name: savedName, trust_score: 10 })
      }
    }
    fetchDriverProfile()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverProfile])

  // ── Notification sound ──────────────────────────────────────────────────────
  const playNotificationSound = () => {
    try {
      const ctx = new AudioContext()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.frequency.setValueAtTime(880, ctx.currentTime)
      oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.1)
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.2)
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.5)
    } catch (err) {
      console.log('Audio not available')
    }
  }

  // ── Supabase Realtime: watch request_notifications ───────────────────────────
  useEffect(() => {
    const driverId = localStorage.getItem('driverId') || 'demo'

    const subscription = supabase
      .channel('new_requests')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'request_notifications',
        filter: `driver_id=eq.${driverId}`,
      }, async (payload: any) => {
        const { data: request } = await supabase
          .from('delivery_requests')
          .select('*')
          .eq('id', payload.new.request_id)
          .single()

        if (request) {
          incomingRequestRef.current = request
          setIncomingRequest(request)
          setShowRequestModal(true)
          playNotificationSound()
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(subscription) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Web Push setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const setupPushNotification = async () => {
      try {
        const subscriptionJson = await requestNotificationPermission()
        if (!subscriptionJson) return

        const driverId = localStorage.getItem('driverId') || 'demo'

        await supabase
          .from('driver_profiles')
          .update({ fcm_token: subscriptionJson })
          .eq('id', driverId)

        localStorage.setItem('pushSubscription', subscriptionJson)

        onMessage((payload) => {
          console.log('Foreground push received:', payload)
          // Foreground: handled by existing Realtime modal
        })
      } catch (err) {
        console.error('Push notification setup error:', err)
      }
    }

    setupPushNotification()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Countdown timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showRequestModal) return
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          const req = incomingRequestRef.current
          if (req) {
            const driverId = localStorage.getItem('driverId') || 'demo'
            supabase
              .from('request_notifications')
              .update({ status: 'rejected', responded_at: new Date().toISOString() })
              .eq('request_id', req.id)
              .eq('driver_id', driverId)
              .then(() => {})
          }
          setShowRequestModal(false)
          setIncomingRequest(null)
          incomingRequestRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [showRequestModal])

  // ── Accept handler ───────────────────────────────────────────────────────────
  const handleAcceptRequest = async () => {
    if (!incomingRequest) return
    const driverId = localStorage.getItem('driverId') || 'demo'

    await supabase
      .from('delivery_requests')
      .update({
        driver_id: driverId,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', incomingRequest.id)

    await supabase
      .from('request_notifications')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('request_id', incomingRequest.id)
      .eq('driver_id', driverId)

    localStorage.setItem('currentRequestId', incomingRequest.id)
    localStorage.setItem('pickupLat', incomingRequest.pickup_lat ?? '')
    localStorage.setItem('pickupLng', incomingRequest.pickup_lng ?? '')
    localStorage.setItem('pickupAddress', incomingRequest.pickup_address ?? '')
    localStorage.setItem('deliveryLat', incomingRequest.delivery_lat ?? '')
    localStorage.setItem('deliveryLng', incomingRequest.delivery_lng ?? '')
    localStorage.setItem('deliveryAddress', incomingRequest.delivery_address ?? '')
    localStorage.setItem('requestFare', incomingRequest.proposed_fare_inr ?? '')

    setShowRequestModal(false)
    incomingRequestRef.current = null
    router.push('/pickup')
  }

  // ── Reject handler ───────────────────────────────────────────────────────────
  const handleRejectRequest = async () => {
    if (!incomingRequest) return
    const driverId = localStorage.getItem('driverId') || 'demo'

    await supabase
      .from('request_notifications')
      .update({ status: 'rejected', responded_at: new Date().toISOString() })
      .eq('request_id', incomingRequest.id)
      .eq('driver_id', driverId)

    setShowRequestModal(false)
    setIncomingRequest(null)
    incomingRequestRef.current = null
  }

  const activeJobs  = todayJobs.filter((job) => job.status !== "done")
  const completedJobs = todayJobs.filter((job) => job.status === "done")
  const firstPendingJob = todayJobs.find((job) => job.status === "pending")

  const handleStartNextJob = () => {
    router.push("/ocr")
  }

  return (
    <>
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
            rating={calcStarRating(driverProfile?.trust_score ?? 10)}
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

    {/* ── Incoming request modal ─────────────────────────────────────────── */}
    {showRequestModal && incomingRequest && (
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}>
        <div style={{
          background: '#1a1a2e',
          borderRadius: '20px',
          padding: '24px',
          width: '100%',
          maxWidth: '380px',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>🚚</div>
            <h2 style={{ color: '#f97316', fontSize: '20px', margin: '0 0 4px' }}>
              {t('newRequestTitle')}
            </h2>
            <div style={{
              fontSize: '28px',
              fontWeight: 'bold',
              color: countdown <= 10 ? '#ef4444' : '#ffffff',
            }}>
              {countdown}s
            </div>
          </div>

          {/* Delivery info */}
          {[
            { icon: '📍', label: t('pickupLabel'), value: incomingRequest.pickup_address },
            { icon: '🏁', label: t('deliveryLabel'), value: incomingRequest.delivery_address },
            { icon: '📦', label: t('itemLabel'), value: `${incomingRequest.item_description ?? '—'} × ${incomingRequest.item_quantity ?? '—'}` },
            { icon: '💰', label: t('fareLabel'), value: `₹${incomingRequest.proposed_fare_inr ?? '—'}` },
          ].map(item => (
            <div key={item.label} style={{
              display: 'flex',
              gap: '12px',
              padding: '10px 0',
              borderBottom: '1px solid #374151',
            }}>
              <span style={{ fontSize: '18px' }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>{item.label}</div>
                <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '500' }}>
                  {item.value ?? '—'}
                </div>
              </div>
            </div>
          ))}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button
              onClick={handleRejectRequest}
              style={{
                flex: 1,
                padding: '16px',
                background: '#374151',
                border: 'none',
                borderRadius: '12px',
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              {t('rejectRequest')}
            </button>
            <button
              onClick={handleAcceptRequest}
              style={{
                flex: 2,
                padding: '16px',
                background: '#f97316',
                border: 'none',
                borderRadius: '12px',
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              ✓ {t('acceptRequest')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
