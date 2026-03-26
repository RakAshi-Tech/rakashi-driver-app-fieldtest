"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Sun, Hand, Check } from "lucide-react";

interface HelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const tips = [
  {
    icon: FileText,
    title: "Position document flat",
    description: "Keep the waybill flat and within the frame guides",
  },
  {
    icon: Sun,
    title: "Good lighting",
    description: "Ensure adequate lighting for best OCR results",
  },
  {
    icon: Hand,
    title: "Hold steady",
    description: "Keep your device stable while capturing",
  },
  {
    icon: Check,
    title: "Review fields",
    description: "Always verify extracted data before saving",
  },
];

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base">Scanning Tips</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {tips.map((tip) => (
            <div
              key={tip.title}
              className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30"
            >
              <div className="p-2 rounded-md bg-primary/10">
                <tip.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{tip.title}</p>
                <p className="text-xs text-muted-foreground">
                  {tip.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
