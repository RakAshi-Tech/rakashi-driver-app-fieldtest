"use client"

import { StatusBar } from "./status-bar"
import { EntrancePhoto } from "./entrance-photo"
import { DirectionArrow } from "./direction-arrow"
import { LocalInstructions } from "./local-instructions"
import { ConfidenceBar } from "./confidence-bar"
import { MiniMap } from "./mini-map"
import { ConfirmArrival } from "./confirm-arrival"

export function DeliveryScreen() {
  return (
    <main className="relative mx-auto flex h-dvh max-w-md flex-col bg-background">
      {/* Scrollable content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Status bar - fixed top */}
        <StatusBar />

        {/* 1. Entrance Photo - primary visual */}
        <EntrancePhoto />

        {/* 2. AR-like Direction Arrow */}
        <DirectionArrow />

        {/* Divider */}
        <div className="mx-4 h-px bg-border" />

        {/* 3. Hyper-local Instructions */}
        <LocalInstructions />

        {/* 4+5. Confidence Bar with Arrival Badge */}
        <ConfidenceBar />

        {/* 6. Minimal Map - secondary, small */}
        <MiniMap />

        {/* 7. Confirm Arrival - giant button */}
        <ConfirmArrival />
      </div>
    </main>
  )
}
