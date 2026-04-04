"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Truck, Package, CheckCircle2, Bell, MapPin, User, Box, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLang } from "@/app/context/LanguageContext";
import { LangToggle } from "@/app/components/LangToggle";
import { supabase } from "@/lib/supabase";

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

export function UnloadingStatus() {
  const router = useRouter();
  const { t } = useLang();
  const [state, setState] = useState<UnloadingState>("waiting");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [shipperNotified, setShipperNotified] = useState(false);
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [earnings, setEarnings] = useState<number>(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state === "in-progress") {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    if (state === "completed") {
      setShowCompletionBanner(true);
      setShowCompleteModal(true);
    }
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

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.error('ファイルが選択されていません');
      return;
    }

    console.log('アップロード開始:', file.name, file.size);
    setUploading(true);

    try {
      const deliveryId = localStorage.getItem('currentDeliveryId');
      console.log('deliveryId:', deliveryId);

      if (!deliveryId) {
        console.error('currentDeliveryIdがlocalStorageにありません');
        return;
      }

      const fileName = `${deliveryId}_${Date.now()}.jpg`;
      console.log('アップロード先:', fileName);

      const { data, error } = await supabase.storage
        .from('delivery-photos')
        .upload(fileName, file, { contentType: 'image/jpeg', upsert: true });

      console.log('アップロード結果:', data, error);

      if (error) {
        console.error('Storageエラー:', error.message, error);
        throw error;
      }

      const { data: urlData } = supabase.storage
        .from('delivery-photos')
        .getPublicUrl(fileName);

      console.log('公開URL:', urlData.publicUrl);

      setPhotoUrl(urlData.publicUrl);
      localStorage.setItem('deliveryPhotoUrl', urlData.publicUrl);
    } catch (err) {
      console.error('写真アップロード失敗:', err);
    } finally {
      setUploading(false);
    }
  };

  const dbCompleteDelivery = async (
    deliveryId: string,
    startedAt: string,
    totalMeters: number,
    earningsInr: number
  ) => {
    try {
      const now = new Date();
      const durationMin = Math.round(
        (now.getTime() - new Date(startedAt).getTime()) / 60000
      );
      const driverId = localStorage.getItem('driverId') || 'demo';
      const today = now.toISOString().split('T')[0];

      await supabase
        .from('gps_delivery_summary')
        .update({
          completed_at: now.toISOString(),
          total_distance_km: parseFloat((totalMeters / 1000).toFixed(2)),
          total_duration_min: durationMin,
          on_time: durationMin <= 60,
          earnings_inr: earningsInr,
          photo_url: localStorage.getItem('deliveryPhotoUrl') || null,
        })
        .eq('id', deliveryId);

      const { data: existingShift } = await supabase
        .from('driver_shifts')
        .select('*')
        .eq('driver_id', driverId)
        .eq('shift_date', today)
        .single();

      if (existingShift) {
        await supabase
          .from('driver_shifts')
          .update({
            total_deliveries: existingShift.total_deliveries + 1,
            total_earnings_inr: existingShift.total_earnings_inr + earningsInr,
            total_distance_km: existingShift.total_distance_km + totalMeters / 1000,
            end_time: now.toISOString(),
          })
          .eq('id', existingShift.id);
      } else {
        await supabase.from('driver_shifts').insert({
          driver_id: driverId,
          shift_date: today,
          start_time: new Date(startedAt).toISOString(),
          end_time: now.toISOString(),
          total_deliveries: 1,
          total_earnings_inr: earningsInr,
          total_distance_km: totalMeters / 1000,
        });
      }

      const { data: profile } = await supabase
        .from('driver_profiles')
        .select('total_deliveries, trust_score, total_earnings_inr')
        .eq('id', driverId)
        .single();

      if (profile) {
        await supabase
          .from('driver_profiles')
          .update({
            total_deliveries: (profile.total_deliveries || 0) + 1,
            total_earnings_inr: (profile.total_earnings_inr || 0) + earningsInr,
          })
          .eq('id', driverId);
      }

      localStorage.removeItem('currentDeliveryId');
      localStorage.removeItem('deliveryStartedAt');
      localStorage.removeItem('destination');
      localStorage.removeItem('route');
      localStorage.removeItem('deliveryPhotoUrl');
      localStorage.removeItem('totalTraveledMeters');
    } catch (err) {
      console.error('dbCompleteDelivery error:', err);
    }
  };

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

  const steps = [
    { step: 1, label: t('arrivalStep'), icon: MapPin },
    { step: 2, label: t('unloadingStep'), icon: Package },
    { step: 3, label: t('completedStep'), icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen bg-background relative">
        {/* Completion Banner */}
        {showCompletionBanner && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-green-500 text-white text-center py-4 px-4 font-bold text-sm animate-slide-down">
            {t('deliveryReportSent')}
          </div>
        )}

        {/* Screen Content */}
        <div className="flex flex-col min-h-screen px-6 pb-4 pt-4">
          {/* Header Section */}
          <div className="mb-2">
            {/* Language Switcher */}
            <div className="mb-3 flex justify-end">
              <LangToggle />
            </div>
            <div className="text-center">
              <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-success/20 px-3 py-1 text-xs font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t('arrivalConfirmed')}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('beginUnloading')}
              </p>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="mb-2">
            <div className="flex items-center justify-between">
              {steps.map((item, index) => {
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
          <div className="mb-2 rounded-2xl border border-border bg-muted/50 p-3">
            <div className="flex h-full flex-col items-center justify-center text-center">
              {state === "waiting" && (
                <>
                  <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                    <Truck className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <h2 className="mb-1 text-lg font-semibold text-foreground">
                    {t('readyToUnload')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t('tapToStart')}
                  </p>
                </>
              )}

              {state === "in-progress" && (
                <>
                  <div className="relative mb-2">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary bg-primary/10">
                      <Package className="h-7 w-7 animate-pulse text-primary" />
                    </div>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground">
                      ACTIVE
                    </div>
                  </div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {t('unloadingTime')}
                  </p>
                  <p className="font-mono text-3xl font-bold tracking-tight text-foreground">
                    {formatTime(elapsedTime)}
                  </p>
                </>
              )}

              {state === "completed" && (
                <>
                  <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-success/20">
                    <CheckCircle2 className="h-9 w-9 text-success" />
                  </div>
                  <h2 className="mb-1 text-lg font-semibold text-foreground">
                    {t('unloadingComplete')}
                  </h2>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {t('totalTime')} {formatTime(elapsedTime)}
                  </p>
                  {shipperNotified && (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-success/20 px-3 py-1.5 text-xs font-medium text-success">
                      <Bell className="h-3.5 w-3.5" />
                      {t('shipperNotifiedMsg')}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Delivery Info Panel */}
          <div className="mb-2 space-y-2 rounded-xl border border-border bg-muted/30 p-2">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t('deliveryLocationLabel')}</p>
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
                <p className="text-xs text-muted-foreground">{t('shipperLabel')}</p>
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
                <p className="text-xs text-muted-foreground">{t('quantityDelivered')}</p>
                <p className="text-sm font-medium text-foreground">
                  {deliveryInfo.quantity} {t('items')}
                </p>
              </div>
            </div>
          </div>

          {/* Trust Score XP Panel */}
          <div className="mb-2 rounded-xl border border-primary/30 bg-primary/5 p-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">
                  {t('trustScoreProgress')}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-foreground">87</span>
                <span className={cn("text-xs font-medium", state === "completed" ? "animate-pulse text-green-500 font-bold text-base" : "text-primary")}>+3 XP</span>
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
                  className={cn("absolute inset-y-0 rounded-full bg-primary/50", state === "completed" && "animate-pulse")}
                  style={{ left: "70%", width: "10%" }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">90</span>
            </div>
            <p className="text-[10px] leading-tight text-muted-foreground">
              {t('onTimeDeliveriesBoost')}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 space-y-2">
            {state !== "completed" && (
              <Button
                onClick={handlePrimaryAction}
                className="h-14 w-full text-base font-bold rounded-xl"
                size="lg"
              >
                {state === "waiting" ? t('startUnloading') : t('completeUnloading')}
              </Button>
            )}

            {state !== "completed" && !shipperNotified && (
              <Button
                onClick={handleNotifyShipper}
                variant="secondary"
                className="h-12 w-full text-sm font-medium"
              >
                <Bell className="mr-2 h-4 w-4" />
                {t('notifyShipper')}
              </Button>
            )}

            {state !== "completed" && shipperNotified && (
              <div className="flex h-10 items-center justify-center gap-2 rounded-lg bg-success/10 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" />
                {t('shipperNotifiedConfirm')}
              </div>
            )}

          </div>
        </div>

      {/* ── 配送完了モーダル ─────────────────────────────────────────────── */}
      {showCompleteModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            background: '#1a1a2e',
            borderRadius: '16px',
            padding: '24px',
            width: '90%',
            maxWidth: '400px',
          }}>
            <h2 style={{
              color: '#ffffff',
              fontSize: '18px',
              marginBottom: '20px',
              textAlign: 'center',
              margin: '0 0 20px 0',
            }}>
              🎉 {t('deliveryComplete')}
            </h2>

            {/* 写真撮影エリア */}
            <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>
              📷 {t('deliveryPhoto')}
            </p>

            {photoUrl ? (
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <img
                  src={photoUrl}
                  alt="delivery"
                  style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }}
                />
                <button
                  onClick={() => { setPhotoUrl(null); localStorage.removeItem('deliveryPhotoUrl'); }}
                  style={{
                    position: 'absolute', top: '8px', right: '8px',
                    background: '#dc2626', color: '#fff', border: 'none',
                    borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  {t('retake')}
                </button>
              </div>
            ) : (
              <label style={{
                display: 'block', width: '100%', padding: '16px',
                background: '#0f0f1a', border: '1px dashed #4b5563', borderRadius: '8px',
                color: uploading ? '#6b7280' : '#9ca3af', fontSize: '14px',
                textAlign: 'center', cursor: 'pointer', marginBottom: '16px',
                boxSizing: 'border-box',
              }}>
                {uploading ? t('uploading') : `📷 ${t('takePhoto')}`}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  style={{ display: 'none' }}
                />
              </label>
            )}

            {/* 収益入力 */}
            <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>
              💰 {t('earningsLabel')} (₹)
            </p>
            <input
              type="number"
              value={earnings}
              onChange={(e) => setEarnings(Number(e.target.value))}
              placeholder="0"
              style={{
                width: '100%', padding: '12px', background: '#0f0f1a',
                border: '1px solid #374151', borderRadius: '8px',
                color: '#ffffff', fontSize: '16px', marginBottom: '20px',
                boxSizing: 'border-box',
              }}
            />

            {/* 完了ボタン */}
            <button
              onClick={async () => {
                const deliveryId = localStorage.getItem('currentDeliveryId') || '';
                const startedAt = localStorage.getItem('deliveryStartedAt') || '';
                const totalMeters = parseFloat(localStorage.getItem('totalTraveledMeters') || '0');
                await dbCompleteDelivery(deliveryId, startedAt, totalMeters, earnings);
                router.push('/dashboard');
              }}
              style={{
                width: '100%', padding: '16px', background: '#f97316',
                border: 'none', borderRadius: '12px', color: '#ffffff',
                fontSize: '16px', fontWeight: 'bold', cursor: 'pointer',
              }}
            >
              ✓ {t('completeDelivery')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
