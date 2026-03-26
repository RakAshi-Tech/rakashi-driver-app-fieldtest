"use client"

import { CornerDownLeft, Landmark, Coffee } from "lucide-react"

const instructions = [
  {
    icon: CornerDownLeft,
    text: "Turn left at the 3rd narrow alley",
    highlight: "3rd narrow alley",
  },
  {
    icon: Landmark,
    text: "Blue shutter next to tea stall",
    highlight: "Blue shutter",
  },
  {
    icon: Coffee,
    text: "Ring bell beside the chai counter",
    highlight: "chai counter",
  },
]

export function LocalInstructions() {
  return (
    <section className="px-4 py-3" aria-label="Hyper-local navigation instructions">
      <h2 className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
        Hyper-local steps
      </h2>
      <ol className="flex flex-col gap-2">
        {instructions.map((step, i) => {
          const Icon = step.icon
          return (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                <Icon className="h-5 w-5 text-accent" />
              </div>
              <span className="text-sm font-bold text-foreground">
                {step.text.split(step.highlight).map((part, j, arr) =>
                  j < arr.length - 1 ? (
                    <span key={j}>
                      {part}
                      <span className="text-accent">{step.highlight}</span>
                    </span>
                  ) : (
                    <span key={j}>{part}</span>
                  )
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
