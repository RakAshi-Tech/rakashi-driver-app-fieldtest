"use client"

import { useEffect, useRef, useState } from "react"
import { Navigation } from "lucide-react"
import { useLang } from "@/app/context/LanguageContext"

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()
}

interface RouteStep {
  instruction: string
  stepDistance: string
  totalDistance: string
  totalDuration: string
}

export function LocalInstructions() {
  const { lang: language, t } = useLang()
  const [step, setStep] = useState<RouteStep | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [animate, setAnimate] = useState(false)
  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null)

  const prevInstructionRef = useRef<string>("")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load destination from localStorage (replaces hardcoded coordinates)
  useEffect(() => {
    const saved = localStorage.getItem("destination")
    if (saved) {
      const d = JSON.parse(saved)
      setDestination({ lat: d.lat, lng: d.lng })
    } else {
      // No destination saved — show error immediately
      setError(true)
      setLoading(false)
    }
  }, [])

  const fetchRoute = (dest: { lat: number; lng: number }) => {
    if (!navigator.geolocation) {
      setError(true)
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const origin = `${pos.coords.latitude},${pos.coords.longitude}`
          const destinationParam = `${dest.lat},${dest.lng}`
          const res = await fetch(
            `/api/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destinationParam)}&language=${language}`
          )
          const data = await res.json()

          if (data.routes?.[0]?.legs?.[0]) {
            const leg = data.routes[0].legs[0]
            const firstStep = leg.steps?.[0]
            const instruction = firstStep
              ? stripHtml(firstStep.html_instructions)
              : ""
            const stepDistance = firstStep?.distance?.text ?? ""
            const totalDistance = leg.distance?.text ?? ""
            const totalDuration = leg.duration?.text ?? ""

            if (instruction !== prevInstructionRef.current) {
              setAnimate(true)
              setTimeout(() => setAnimate(false), 400)
              prevInstructionRef.current = instruction
            }

            setStep({ instruction, stepDistance, totalDistance, totalDuration })
            setError(false)
          } else {
            setError(true)
          }
        } catch {
          setError(true)
        } finally {
          setLoading(false)
        }
      },
      () => {
        setError(true)
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    )
  }

  // Start polling once destination is loaded; restart if language changes
  useEffect(() => {
    if (!destination) return

    if (intervalRef.current) clearInterval(intervalRef.current)

    fetchRoute(destination)
    intervalRef.current = setInterval(() => fetchRoute(destination), 3000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [destination, language])

  return (
    <section className="px-4 py-1" aria-label="Navigation instructions">
      <h2 className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
        {t("nextStep")}
      </h2>

      {loading ? (
        <div className="rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground animate-pulse">
          {t("routeLoading")}
        </div>
      ) : error ? (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          {t("routeError")}
        </div>
      ) : step ? (
        <div
          className={`rounded-lg bg-card border border-border p-2 space-y-1 transition-all duration-300 ${
            animate ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
          }`}
        >
          <div className="flex items-start gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
              <Navigation className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground leading-snug">
                {step.instruction}
              </p>
              {step.stepDistance && (
                <p className="text-xs text-accent mt-0.5">
                  {step.stepDistance}
                </p>
              )}
            </div>
          </div>

          {(step.totalDistance || step.totalDuration) && (
            <div className="flex items-center gap-3 pt-1 border-t border-border/50 text-xs text-muted-foreground">
              {step.totalDistance && (
                <span className="text-accent">📍 {step.totalDistance}</span>
              )}
              {step.totalDuration && (
                <span className="text-accent">⏱ {step.totalDuration}</span>
              )}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
