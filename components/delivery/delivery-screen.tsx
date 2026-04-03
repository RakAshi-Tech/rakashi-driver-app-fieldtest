"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { User, Package, IndianRupee } from "lucide-react"
import { EntrancePhoto } from "./entrance-photo"
import { DirectionArrow } from "./direction-arrow"
import { LocalInstructions } from "./local-instructions"
import { ConfidenceBar } from "./confidence-bar"
import { ConfirmArrival } from "./confirm-arrival"
import { useLang } from "@/app/context/LanguageContext"
import { LangToggle } from "@/app/components/LangToggle"

interface DeliveryInfoProps {
  shipperName?: string
  quantity?: number
  fee?: number
}

const defaultDeliveryInfo: Required<DeliveryInfoProps> = {
  shipperName: "Apex Logistics Co.",
  quantity: 24,
  fee: 580,
}

export function DeliveryScreen({
  shipperName = defaultDeliveryInfo.shipperName,
  quantity = defaultDeliveryInfo.quantity,
  fee = defaultDeliveryInfo.fee,
}: DeliveryInfoProps = {}) {
  const router = useRouter()
  const { t } = useLang()
  const [showArrived, setShowArrived] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {},
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
    )
  }, [])

  return (
    <main className="relative mx-auto flex h-dvh max-w-md flex-col bg-background">
      {/* Language toggle */}
      <div className="flex justify-end px-4 pt-2">
        <LangToggle />
      </div>

      {/* Scrollable content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Delivery info bar */}
        <div className="flex h-12 items-center border-b border-border bg-card px-4">
          <div className="flex flex-1 items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-foreground truncate">{shipperName}</span>
          </div>
          <div className="flex flex-1 items-center justify-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-accent shrink-0" />
            <span className="text-xs text-accent">{quantity} items</span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-1">
            <IndianRupee className="h-3.5 w-3.5 text-accent shrink-0" />
            <span className="text-sm font-bold text-accent">{fee}</span>
          </div>
        </div>

        {/* 1. Entrance Photo - primary visual */}
        <EntrancePhoto
          latitude={currentLocation?.lat}
          longitude={currentLocation?.lng}
        />

        {/* 2. AR-like Direction Arrow */}
        <DirectionArrow />

        {/* Divider */}
        <div className="mx-4 h-px bg-border" />

        {/* 3. Hyper-local Instructions */}
        <LocalInstructions />

        {/* 4+5. Confidence Bar with Arrival Badge */}
        <ConfidenceBar />

        {/* 7. Confirm Arrival - giant button */}
        <ConfirmArrival onConfirm={() => {
          setShowArrived(true)
          setTimeout(() => {
            router.push('/completion')
          }, 2000)
        }} />
      </div>
      {showArrived && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-green-500">
          <div className="text-6xl mb-4">📍</div>
          <div className="text-3xl font-bold text-white tracking-wide">
            {t('destinationArrived')}
          </div>
        </div>
      )}
    </main>
  )
}
