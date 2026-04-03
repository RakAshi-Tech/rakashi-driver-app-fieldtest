"use client";

import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, MapPin, Package, Truck } from "lucide-react";
import { useLang } from "@/app/context/LanguageContext";

export default function JobPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLang();

  return (
    <div className="dark min-h-screen bg-background flex flex-col">
        {/* Header */}
        <header className="px-4 py-3 flex items-center gap-3 border-b border-border/50">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/ocr")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">{t('jobDetails')}</h1>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 space-y-6">
          {/* Success message */}
          <div className="flex flex-col items-center text-center py-8 space-y-3">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-accent" />
            </div>
            <h2 className="text-xl font-semibold">{t('waybillSaved')}</h2>
            <p className="text-sm text-muted-foreground">
              Job ID: {String(params.id)}
            </p>
          </div>

          {/* Job summary */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t('jobSummary')}
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                <Package className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">ABC Logistics Pvt Ltd</p>
                  <p className="text-xs text-muted-foreground">Shipper</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Block BLK-042</p>
                  <p className="text-xs text-muted-foreground">{t('deliveryLocation')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                <Truck className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">25 items • ₹350</p>
                  <p className="text-xs text-muted-foreground">
                    Quantity & Fee
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-4 border-t border-border/50 space-y-2">
          <Button
            className="w-full h-12 text-sm font-semibold bg-primary text-primary-foreground"
            onClick={() => router.push("/tracking")}
          >
            {t('startDeliveryBtn')}
          </Button>

          <Button
            className="w-full h-11 text-sm font-medium"
            onClick={() => router.push("/ocr")}
          >
            {t('scanAnotherWaybill')}
          </Button>

          <Button
            variant="outline"
            className="w-full h-10 text-sm"
            onClick={() => router.push("/dashboard")}
          >
            {t('backToHome')}
          </Button>
        </div>

    </div>
  );
}