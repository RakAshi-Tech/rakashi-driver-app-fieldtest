"use client"

import { Signal, WifiOff, BatteryMedium, Package } from "lucide-react"

export function StatusBar() {
  return (
    <div className="flex items-center justify-between bg-background px-4 py-2">
      {/* Order ID */}
      <div className="flex items-center gap-1.5">
        <Package className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-bold text-foreground">#DLV-8834</span>
      </div>

      {/* GPS */}
      <div className="flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5">
        <Signal className="h-3 w-3 text-success" />
        <span className="text-[10px] font-black text-success">GPS</span>
      </div>

      {/* Offline */}
      <div className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5">
        <WifiOff className="h-3 w-3 text-accent" />
        <span className="text-[10px] font-black text-accent">OFFLINE</span>
      </div>

      {/* Battery */}
      <div className="flex items-center gap-1">
        <BatteryMedium className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-bold text-primary">62%</span>
      </div>
    </div>
  )
}
