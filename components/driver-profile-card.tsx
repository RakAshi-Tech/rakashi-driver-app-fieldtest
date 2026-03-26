"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Star, Clock, CheckCircle, TrendingUp } from "lucide-react"

interface DriverProfileCardProps {
  name: string
  avatarUrl?: string
  totalDeliveries: number
  yearsExperience: number
  onTimeRate: number
  responseRate: number
  rating: number
  deliveryTimes: {
    under5km: number
    from5to10km: number
    over10km: string
  }
  isAccepting: boolean
}

export function DriverProfileCard({
  name,
  avatarUrl,
  totalDeliveries,
  yearsExperience,
  onTimeRate,
  responseRate,
  rating,
  deliveryTimes,
  isAccepting,
}: DriverProfileCardProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  return (
    <div className="bg-card rounded-lg p-3 border border-border">
      <div className="flex items-center gap-3">
        <Avatar className="h-14 w-14 border-2 border-primary">
          <AvatarImage src={avatarUrl} alt={name} />
          <AvatarFallback className="bg-secondary text-foreground text-sm font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground truncate">{name}</h2>
            <Badge
              variant={isAccepting ? "default" : "secondary"}
              className={`text-[10px] px-2 py-0.5 shrink-0 ${
                isAccepting ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              {isAccepting ? "Accepting" : "Offline"}
            </Badge>
          </div>

          <div className="flex items-center gap-1 mt-0.5">
            <div className="flex items-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-3 w-3 ${
                    star <= Math.floor(rating)
                      ? "fill-accent text-accent"
                      : star - 0.5 <= rating
                        ? "fill-accent/50 text-accent"
                        : "text-muted-foreground/40"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-1">{rating.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-3">
        <div className="text-center">
          <div className="text-sm font-bold text-foreground">{totalDeliveries.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">Deliveries</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-foreground">{yearsExperience}y</div>
          <div className="text-[10px] text-muted-foreground">Experience</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-primary">{onTimeRate}%</div>
          <div className="text-[10px] text-muted-foreground">On-time</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-foreground">{responseRate}%</div>
          <div className="text-[10px] text-muted-foreground">Response</div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="text-[10px]">Avg delivery:</span>
        </div>
        <div className="flex gap-2 text-[10px]">
          <span className="text-foreground">
            <span className="text-muted-foreground">{"<"}5km:</span> {deliveryTimes.under5km}m
          </span>
          <span className="text-foreground">
            <span className="text-muted-foreground">5-10:</span> {deliveryTimes.from5to10km}m
          </span>
          <span className="text-muted-foreground">
            10+: {deliveryTimes.over10km}
          </span>
        </div>
      </div>
    </div>
  )
}
