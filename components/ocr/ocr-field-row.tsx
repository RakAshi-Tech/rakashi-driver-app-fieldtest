"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ConfidenceLevel = "high" | "medium" | "low";

interface OcrFieldRowProps {
  label: string;
  value: string;
  confidence: ConfidenceLevel;
  onChange: (value: string) => void;
  onSelectFromMaster?: () => void;
}

const confidenceConfig: Record<
  ConfidenceLevel,
  { label: string; className: string }
> = {
  high: {
    label: "High",
    className: "bg-accent/20 text-accent border-accent/30",
  },
  medium: {
    label: "Medium",
    className: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  },
  low: {
    label: "Low",
    className: "bg-destructive/20 text-destructive border-destructive/30",
  },
};

export function OcrFieldRow({
  label,
  value,
  confidence,
  onChange,
  onSelectFromMaster,
}: OcrFieldRowProps) {
  const config = confidenceConfig[confidence];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className={`text-[9px] px-1.5 py-0 h-4 ${config.className}`}
          >
            {config.label}
          </Badge>
          {confidence === "low" && (
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 h-4 bg-destructive/10 text-destructive border-destructive/30"
            >
              Needs review
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs bg-secondary/50 border-border/50 focus:border-primary"
        />
        {confidence === "low" && onSelectFromMaster && (
          <button
            onClick={onSelectFromMaster}
            className="text-[10px] text-accent hover:text-accent/80 whitespace-nowrap underline underline-offset-2"
          >
            Select from master
          </button>
        )}
      </div>
    </div>
  );
}
