"use client"

import { MapPin, Navigation } from "lucide-react"

export function MiniMap() {
  return (
    <section className="px-4 py-2" aria-label="Minimal map overview">
      <div className="relative h-28 w-full overflow-hidden rounded-xl border border-border bg-[#1a2332]">
        {/* Grid */}
        <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="mini-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#2a3a4a" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mini-grid)" />
        </svg>

        {/* Simplified route + markers */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice">
          {/* Roads */}
          <line x1="0" y1="60" x2="400" y2="60" stroke="#2d3d4d" strokeWidth="8" />
          <line x1="120" y1="0" x2="120" y2="120" stroke="#2d3d4d" strokeWidth="6" />
          <line x1="280" y1="0" x2="280" y2="120" stroke="#2d3d4d" strokeWidth="6" />

          {/* Route line */}
          <path
            d="M 80 100 L 120 60 L 280 60 L 320 30"
            fill="none"
            stroke="#f5a623"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 80 100 L 120 60 L 280 60 L 320 30"
            fill="none"
            stroke="#f5a623"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.12"
          />

          {/* Current location */}
          <circle cx="80" cy="100" r="6" fill="#f5a623" />
          <circle cx="80" cy="100" r="3" fill="#1a2332" />

          {/* Destination */}
          <circle cx="320" cy="30" r="6" fill="#ef4444" />
          <circle cx="320" cy="30" r="2.5" fill="#ffffff" />
        </svg>

        {/* Overlay labels */}
        <div className="absolute bottom-2 left-3 flex items-center gap-1.5">
          <Navigation className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-bold text-primary">1.2 km</span>
        </div>
        <div className="absolute right-3 top-2 flex items-center gap-1">
          <MapPin className="h-3 w-3 text-destructive" />
          <span className="text-[10px] font-bold text-foreground/70">Sector 22</span>
        </div>
      </div>
    </section>
  )
}
