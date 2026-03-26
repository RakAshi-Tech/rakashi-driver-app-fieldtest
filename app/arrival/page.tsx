"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DeliveryScreen } from "@/components/delivery/delivery-screen";

export default function Page() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[390px] space-y-3">
        <DeliveryScreen />

        <Button
          className="w-full h-12 text-sm font-semibold"
          onClick={() => router.push("/completion")}
        >
          Go to Completion
        </Button>
      </div>
    </main>
  );
}