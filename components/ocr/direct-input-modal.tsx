"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface DirectInputModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: {
    shipper: string;
    block: string;
    quantity: string;
    fee: string;
  }) => void;
  language: "en" | "hi";
}

const fieldLabels = {
  shipper: { en: "Shipper name", hi: "शिपर का नाम" },
  block: { en: "Block No.", hi: "ब्लॉक नंबर" },
  quantity: { en: "Quantity", hi: "मात्रा" },
  fee: { en: "Delivery fee", hi: "डिलीवरी शुल्क" },
};

export function DirectInputModal({
  open,
  onOpenChange,
  onSave,
  language,
}: DirectInputModalProps) {
  const [values, setValues] = useState({
    shipper: "",
    block: "",
    quantity: "",
    fee: "",
  });

  const handleSave = () => {
    onSave(values);
    setValues({ shipper: "", block: "", quantity: "", fee: "" });
    onOpenChange(false);
  };

  const handleClose = () => {
    setValues({ shipper: "", block: "", quantity: "", fee: "" });
    onOpenChange(false);
  };

  const getLabel = (key: keyof typeof fieldLabels) =>
    fieldLabels[key][language];

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="dark h-[340px] rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">
            {language === "en" ? "Direct entry" : "डायरेक्ट एंट्री"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          {/* Shipper */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {getLabel("shipper")}
            </Label>
            <Input
              value={values.shipper}
              onChange={(e) =>
                setValues((v) => ({ ...v, shipper: e.target.value }))
              }
              className="h-8 text-xs bg-secondary/50"
              placeholder={language === "en" ? "Enter shipper name" : "शिपर का नाम दर्ज करें"}
            />
          </div>

          {/* Block No. */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {getLabel("block")}
            </Label>
            <Input
              value={values.block}
              onChange={(e) =>
                setValues((v) => ({ ...v, block: e.target.value }))
              }
              className="h-8 text-xs bg-secondary/50"
              placeholder={language === "en" ? "e.g. BLK-001" : "जैसे BLK-001"}
            />
          </div>

          {/* Quantity and Fee in one row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {getLabel("quantity")}
              </Label>
              <Input
                value={values.quantity}
                onChange={(e) =>
                  setValues((v) => ({ ...v, quantity: e.target.value }))
                }
                className="h-8 text-xs bg-secondary/50"
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {getLabel("fee")}
              </Label>
              <Input
                value={values.fee}
                onChange={(e) =>
                  setValues((v) => ({ ...v, fee: e.target.value }))
                }
                className="h-8 text-xs bg-secondary/50"
                placeholder="₹0"
              />
            </div>
          </div>

          {/* Save button */}
          <Button
            className="w-full h-10 text-sm font-medium mt-2"
            onClick={handleSave}
            disabled={!values.shipper && !values.block && !values.quantity && !values.fee}
          >
            {language === "en" ? "Save" : "सेव करें"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
