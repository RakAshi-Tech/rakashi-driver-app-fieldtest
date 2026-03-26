"use client";

import { useState, useEffect } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface VoiceInputModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseResult: (result: {
    shipper: string;
    block: string;
    quantity: string;
    fee: string;
  }) => void;
  language: "en" | "hi";
}

export function VoiceInputModal({
  open,
  onOpenChange,
  onUseResult,
  language,
}: VoiceInputModalProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");

  // Mock listening effect
  useEffect(() => {
    if (isListening) {
      const timer = setTimeout(() => {
        setTranscript(
          language === "en"
            ? "Shipper: XYZ Transport, Block number: BLK-078, Quantity: 15 units, Delivery fee: 450 rupees"
            : "शिपर: XYZ ट्रांसपोर्ट, ब्लॉक नंबर: BLK-078, मात्रा: 15 यूनिट, डिलीवरी शुल्क: 450 रुपये"
        );
        setIsListening(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isListening, language]);

  const handleStart = () => {
    setIsListening(true);
    setTranscript("");
  };

  const handleStop = () => {
    setIsListening(false);
  };

  const handleUseResult = () => {
    onUseResult({
      shipper: "XYZ Transport Pvt Ltd",
      block: "BLK-078",
      quantity: "15",
      fee: "₹450",
    });
    setTranscript("");
    onOpenChange(false);
  };

  const handleClose = () => {
    setIsListening(false);
    setTranscript("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="dark h-[280px] rounded-t-2xl">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">
            {language === "en" ? "Voice input" : "वॉइस इनपुट"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col items-center gap-4">
          {/* Mic indicator */}
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? "bg-primary/20 animate-pulse"
                : "bg-secondary/50"
            }`}
          >
            {isListening ? (
              <Mic className="h-8 w-8 text-primary" />
            ) : (
              <MicOff className="h-8 w-8 text-muted-foreground" />
            )}
          </div>

          {/* Status text */}
          <p className="text-sm text-muted-foreground">
            {isListening
              ? language === "en"
                ? "Listening..."
                : "सुन रहा है..."
              : transcript
              ? language === "en"
                ? "Result ready"
                : "परिणाम तैयार"
              : language === "en"
              ? "Tap to start"
              : "शुरू करने के लिए टैप करें"}
          </p>

          {/* Transcript preview */}
          {transcript && (
            <p className="text-xs text-foreground bg-secondary/50 rounded-lg p-2 max-h-12 overflow-y-auto w-full">
              {transcript}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 w-full">
            {isListening ? (
              <Button
                variant="destructive"
                className="flex-1 h-10 gap-2"
                onClick={handleStop}
              >
                <Square className="h-4 w-4" />
                {language === "en" ? "Stop" : "रुकें"}
              </Button>
            ) : transcript ? (
              <>
                <Button
                  variant="outline"
                  className="flex-1 h-10"
                  onClick={handleStart}
                >
                  {language === "en" ? "Retry" : "पुनः प्रयास"}
                </Button>
                <Button
                  className="flex-1 h-10"
                  onClick={handleUseResult}
                >
                  {language === "en" ? "Use result" : "परिणाम उपयोग करें"}
                </Button>
              </>
            ) : (
              <Button
                className="flex-1 h-10 gap-2"
                onClick={handleStart}
              >
                <Mic className="h-4 w-4" />
                {language === "en" ? "Start listening" : "सुनना शुरू करें"}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
