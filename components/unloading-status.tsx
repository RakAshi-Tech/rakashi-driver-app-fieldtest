"use client";

import { useState, useEffect, useCallback } from "react";
import { Truck, Package, CheckCircle2, Bell, MapPin, User, Box, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UnloadingState = "waiting" | "in-progress" | "completed";

interface DeliveryInfo {
  location: string;
  shipperName: string;
  quantity: number;
}

const deliveryInfo: DeliveryInfo = {
  location: "123 Industrial Ave, Dock B",
  shipperName: "Apex Logistics Co.",
  quantity: 24,
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

type Language = "en" | "hi";

export function UnloadingStatus() {
  const [state, setState] = useState<UnloadingState>("waiting");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [shipperNotified, setShipperNotified] = useState(false);
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state === "in-progress") {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state]);

  const handlePrimaryAction = useCallback(() => {
    if (state === "waiting") {
      setState("in-progress");
      setElapsedTime(0);
    } else if (state === "in-progress") {
      setState("completed");
      setShipperNotified(true);
    }
  }, [state]);

  const handleNotifyShipper = useCallback(() => {
    setShipperNotified(true);
  }, []);

  const getStepStatus = (step: number): "completed" | "active" | "pending" => {
    if (state === "completed") return "completed";
    if (state === "in-progress") {
      if (step === 1) return "completed";
      if (step === 2) return "active";
      return "pending";
    }
    // waiting
    if (step === 1) return "active";
    return "pending";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Phone Frame */}
      <div className="relative w-full max-w-[390px] overflow-hidden rounded-[40px] border-4 border-border bg-card shadow-2xl">
        {/* Notch */}
        <div className="absolute left-1/2 top-2 z-10 h-6 w-28 -translate-x-1/2 rounded-full bg-background" />

        {/* Screen Content */}
        <div className="flex h-[750px] flex-col px-6 pb-8 pt-12">
          {/* Header Section */}
          <div className="mb-6">
            {/* Language Switcher */}
            <div className="mb-3 flex justify-end">
              <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
                <button
                  onClick={() => setLanguage("en")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    language === "en"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  EN
                </button>
                <button
                  onClick={() => setLanguage("hi")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    language === "hi"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  हिंदी
                </button>
              </div>
            </div>
            <div className="text-center">
              <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-success/20 px-3 py-1 text-xs font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {language === "en" ? "Arrival confirmed" : "आगमन की पुष्टि"}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {language === "en" ? "Begin unloading the goods" : "सामान उतारना शुरू करें"}
              </p>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              {[
                { step: 1, label: "Arrival", icon: MapPin },
                { step: 2, label: "Unloading", icon: Package },
                { step: 3, label: "Completed", icon: CheckCircle2 },
              ].map((item, index) => {
                const status = getStepStatus(item.step);
                const Icon = item.icon;
                return (
                  <div key={item.step} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      {index > 0 && (
                        <div
                          className={cn(
                            "h-0.5 flex-1 transition-colors duration-300",
                            status === "completed" || getStepStatus(item.step - 1) === "completed"
                              ? "bg-primary"
                              : "bg-border"
                          )}
                        />
                      )}
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                          status === "completed" && "border-primary bg-primary text-primary-foreground",
                          status === "active" && "border-primary bg-primary/20 text-primary",
                          status === "pending" && "border-border bg-muted text-muted-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      {index < 2 && (
                        <div
                          className={cn(
                            "h-0.5 flex-1 transition-colors duration-300",
                            status === "completed" ? "bg-primary" : "bg-border"
                          )}
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        "mt-2 text-xs font-medium transition-colors",
                        status === "completed" && "text-primary",
                        status === "active" && "text-foreground",
                        status === "pending" && "text-muted-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main Status Card */}
          <div className="mb-4 rounded-2xl border border-border bg-muted/50 p-4">
            <div className="flex h-full flex-col items-center justify-center text-center">
              {state === "waiting" && (
                <>
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-secondary">
                    <Truck className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h2 className="mb-1 text-lg font-semibold text-foreground">
                    Ready to Unload
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Tap the button below to start unloading
                  </p>
                </>
              )}

              {state === "in-progress" && (
                <>
                  <div className="relative mb-4">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary bg-primary/10">
                      <Package className="h-10 w-10 animate-pulse text-primary" />
                    </div>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground">
                      ACTIVE
                    </div>
                  </div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    Unloading time
                  </p>
                  <p className="font-mono text-4xl font-bold tracking-tight text-foreground">
                    {formatTime(elapsedTime)}
                  </p>
                </>
              )}

              {state === "completed" && (
                <>
                  <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-success/20">
                    <CheckCircle2 className="h-12 w-12 text-success" />
                  </div>
                  <h2 className="mb-1 text-lg font-semibold text-foreground">
                    Unloading Complete
                  </h2>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Total time: {formatTime(elapsedTime)}
                  </p>
                  {shipperNotified && (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-success/20 px-3 py-1.5 text-xs font-medium text-success">
                      <Bell className="h-3.5 w-3.5" />
                      Shipper has been notified
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Delivery Info Panel */}
          <div className="mb-3 space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Delivery location</p>
                <p className="truncate text-sm font-medium text-foreground">
                  {deliveryInfo.location}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Shipper</p>
                <p className="truncate text-sm font-medium text-foreground">
                  {deliveryInfo.shipperName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Box className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Quantity delivered</p>
                <p className="text-sm font-medium text-foreground">
                  {deliveryInfo.quantity} items
                </p>
              </div>
            </div>
          </div>

          {/* Trust Score XP Panel */}
          <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">
                  {language === "en" ? "Trust Score Progress" : "ट्रस्ट स्कोर प्रगति"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-foreground">87</span>
                <span className="text-xs font-medium text-primary">+3 XP</span>
              </div>
            </div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">87</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div 
                  className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500"
                  style={{ width: "70%" }}
                />
                <div 
                  className="absolute inset-y-0 rounded-full bg-primary/50"
                  style={{ left: "70%", width: "10%" }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">90</span>
            </div>
            <p className="text-[10px] leading-tight text-muted-foreground">
              {language === "en" 
                ? "On-time deliveries increase your trust score and unlock better jobs."
                : "समय पर डिलीवरी आपके ट्रस्ट स्कोर को बढ़ाती है और बेहतर काम अनलॉक करती है।"}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {state !== "completed" && (
              <Button
                onClick={handlePrimaryAction}
                className="h-12 w-full text-base font-semibold"
                size="lg"
              >
                {state === "waiting" 
                  ? (language === "en" ? "Start Unloading" : "अनलोडिंग शुरू करें")
                  : (language === "en" ? "Complete Unloading" : "अनलोडिंग पूर्ण करें")}
              </Button>
            )}

            {state !== "completed" && !shipperNotified && (
              <Button
                onClick={handleNotifyShipper}
                variant="secondary"
                className="h-12 w-full text-sm font-medium"
              >
                <Bell className="mr-2 h-4 w-4" />
                {language === "en" ? "Notify shipper" : "शिपर को सूचित करें"}
              </Button>
            )}

            {state !== "completed" && shipperNotified && (
              <div className="flex h-10 items-center justify-center gap-2 rounded-lg bg-success/10 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" />
                {language === "en" ? "Shipper notified" : "शिपर को सूचित किया गया"}
              </div>
            )}

            {state === "completed" && (
              <Button
                onClick={() => {
                  setState("waiting");
                  setElapsedTime(0);
                  setShipperNotified(false);
                }}
                variant="secondary"
                className="h-12 w-full text-sm font-medium"
              >
                Reset Demo
              </Button>
            )}
          </div>
        </div>

        {/* Home Indicator */}
        <div className="absolute bottom-2 left-1/2 h-1 w-32 -translate-x-1/2 rounded-full bg-foreground/30" />
      </div>
    </div>
  );
}
