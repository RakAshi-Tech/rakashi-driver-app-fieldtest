"use client";

import { Camera, Zap, ZapOff, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DocumentScanViewProps {
  isFlashOn: boolean;
  onFlashToggle: () => void;
  onCapture: () => void;
  onGallery: () => void;
  lightCondition: "ok" | "dark";
  isProcessing: boolean;
}

export function DocumentScanView({
  isFlashOn,
  onFlashToggle,
  onCapture,
  onGallery,
  lightCondition,
  isProcessing,
}: DocumentScanViewProps) {
  return (
    <div className="relative flex flex-col h-full">
      {/* Camera Preview Area */}
      <div className="relative flex-1 bg-secondary/30 rounded-xl overflow-hidden">
        {/* Simulated camera view with document frame */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[85%] h-[75%] relative">
            {/* Document frame with corner guides */}
            <div className="absolute inset-0">
              {/* Top-left corner */}
              <div className="absolute top-0 left-0 w-8 h-8 border-l-3 border-t-3 border-primary rounded-tl-lg" />
              {/* Top-right corner */}
              <div className="absolute top-0 right-0 w-8 h-8 border-r-3 border-t-3 border-primary rounded-tr-lg" />
              {/* Bottom-left corner */}
              <div className="absolute bottom-0 left-0 w-8 h-8 border-l-3 border-b-3 border-primary rounded-bl-lg" />
              {/* Bottom-right corner */}
              <div className="absolute bottom-0 right-0 w-8 h-8 border-r-3 border-b-3 border-primary rounded-br-lg" />
            </div>

            {/* Mock document paper effect */}
            <div className="absolute inset-4 bg-card/5 rounded-md border border-dashed border-muted-foreground/30 flex items-center justify-center">
              <div className="text-center space-y-2">
                <svg
                  className="w-12 h-12 mx-auto text-muted-foreground/50"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
                <p className="text-xs text-muted-foreground">
                  Position waybill within frame
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Status badge - top area */}
        <div className="absolute top-3 left-3">
          <Badge
            variant="secondary"
            className="bg-secondary/80 backdrop-blur-sm text-xs"
          >
            Auto-detect ON
          </Badge>
        </div>

        {/* Hold steady hint */}
        {isProcessing && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
            <Badge
              variant="secondary"
              className="bg-primary/90 text-primary-foreground animate-pulse"
            >
              Hold steady...
            </Badge>
          </div>
        )}
      </div>

      {/* Capture controls */}
      <div className="flex items-center justify-between px-6 py-2">
        {/* Flash toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onFlashToggle}
          className="h-10 w-10 rounded-full bg-secondary/50"
          aria-label={isFlashOn ? "Turn flash off" : "Turn flash on"}
        >
          {isFlashOn ? (
            <Zap className="h-4 w-4 text-primary" />
          ) : (
            <ZapOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>

        {/* Shutter button */}
        <Button
          variant="default"
          size="icon"
          onClick={onCapture}
          disabled={isProcessing}
          className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30"
          aria-label="Capture waybill"
        >
          <Camera className="h-6 w-6" />
        </Button>

        {/* Gallery/import */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onGallery}
          className="h-10 w-10 rounded-full bg-secondary/50"
          aria-label="Import from gallery"
        >
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}
