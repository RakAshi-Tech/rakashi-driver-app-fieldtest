"use client"

import { Eye } from "lucide-react"

const DEFAULT_CENTER = { lat: 35.6595, lng: 139.7004 }

interface EntrancePhotoProps {
  latitude?: number
  longitude?: number
  language?: string
}

export function EntrancePhoto({ latitude, longitude, language }: EntrancePhotoProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const lat = latitude ?? DEFAULT_CENTER.lat
  const lng = longitude ?? DEFAULT_CENTER.lng

  return (
    <section className="relative" aria-label="Entrance photo confirmation">
      {/* Street View image */}
      <div className="relative h-36 w-full overflow-hidden">
        {!apiKey ? (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-sm text-foreground">
            {language === "hi" ? "Street View उपलब्ध नहीं" : "Street Viewデータがありません"}
          </div>
        ) : (
          <>
            <img
              src={`https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${lat},${lng}&fov=90&heading=0&pitch=0&key=${apiKey}`}
              alt="Delivery destination entrance - Street View"
              className="h-full w-full object-cover"
              onError={(e) => {
                const target = e.currentTarget
                target.style.display = "none"
                const fallback = target.nextElementSibling as HTMLElement | null
                if (fallback) fallback.style.display = "flex"
              }}
            />
            <div
              className="absolute inset-0 items-center justify-center bg-secondary text-sm text-foreground"
              style={{ display: "none" }}
            >
              {language === "hi" ? "Street View उपलब्ध नहीं" : "Street Viewデータがありません"}
            </div>
          </>
        )}

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
