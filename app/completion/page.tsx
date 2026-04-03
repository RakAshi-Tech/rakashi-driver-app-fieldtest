"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UnloadingStatus } from "@/components/unloading-status";
import { useLang } from "@/app/context/LanguageContext";

export default function CompletionPage() {
  const router = useRouter();
  const { t } = useLang();

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[390px] space-y-3">
        <UnloadingStatus />
        <Button
          className="w-full h-14 text-base font-bold rounded-xl"
          onClick={() => router.push("/dashboard")}
        >
          {t('backToDashboard')}
        </Button>
      </div>
    </main>
  );
}
