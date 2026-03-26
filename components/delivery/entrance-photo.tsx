"use client"

import Image from "next/image"
import { Eye } from "lucide-react"

export function EntrancePhoto() {
  return (
    <section className="relative" aria-label="Entrance photo confirmation">
      {/* Entrance image */}
      <div className="relative h-56 w-full overflow-hidden">
        <Image
          src="/images/entrance.jpg"
          alt="Delivery destination entrance - blue shutter next to tea stall"
          fill
          className="object-cover"
          priority
        />

        {/* Highlighted door area overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-32 w-44 rounded-lg border-3 border-primary shadow-[0_0_20px_rgba(234,179,8,0.4)] animate-pulse" />
        </div>

        {/* Top gradient for readability */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background/80 to-transparent" />

        {/* Bottom gradient */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Match cue bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 px-4 py-2">
        <Eye className="h-5 w-5 text-primary" />
        <span className="text-sm font-black uppercase tracking-widest text-primary">
          Match this entrance
        </span>
        <Eye className="h-5 w-5 text-primary" />
      </div>
    </section>
  )
}
