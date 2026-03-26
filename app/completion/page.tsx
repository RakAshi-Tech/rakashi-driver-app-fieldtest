"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UnloadingStatus } from "@/components/unloading-status";

export default function CompletionPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[390px] space-y-3">
        <UnloadingStatus />

        <Button
          className="w-full h-12 text-sm font-semibold"
          onClick={() => router.push("/dashboard")}
        >
          Back to Dashboard
        </Button>
      </div>
    </main>
  );
}