"use client";

import { useRouter } from "next/navigation";
import { DeliveryTrackingScreen } from "@/components/delivery-tracking-screen";
import { Button } from "@/components/ui/button";

export default function Page() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[390px] space-y-3">
        <DeliveryTrackingScreen />

        <Button
          className="w-full h-12 text-sm font-semibold"
          onClick={() => router.push("/arrival")}
        >
          Go to Arrival
        </Button>
      </div>
    </main>
  );
}