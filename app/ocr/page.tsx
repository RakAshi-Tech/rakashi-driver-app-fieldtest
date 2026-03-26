"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, FileText, Sparkles, Mic, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentScanView } from "@/components/ocr/document-scan-view";
import {
  OcrFieldRow,
  type ConfidenceLevel,
} from "@/components/ocr/ocr-field-row";
import { MasterSelectModal } from "@/components/ocr/master-select-modal";
import { HelpModal } from "@/components/ocr/help-modal";
import { VoiceInputModal } from "@/components/ocr/voice-input-modal";
import { DirectInputModal } from "@/components/ocr/direct-input-modal";

type Language = "en" | "hi";

interface OcrField {
  id: string;
  label: string;
  labelHi: string;
  value: string;
  confidence: ConfidenceLevel;
}

const initialFields: OcrField[] = [
  {
    id: "shipper",
    label: "Shipper name",
    labelHi: "शिपर का नाम",
    value: "",
    confidence: "high",
  },
  {
    id: "block",
    label: "Delivery block number",
    labelHi: "डिलीवरी ब्लॉक नंबर",
    value: "",
    confidence: "high",
  },
  {
    id: "quantity",
    label: "Quantity",
    labelHi: "मात्रा",
    value: "",
    confidence: "high",
  },
  {
    id: "fee",
    label: "Delivery fee",
    labelHi: "डिलीवरी शुल्क",
    value: "",
    confidence: "high",
  },
];

// Mock OCR results for demo
const mockOcrResults: OcrField[] = [
  {
    id: "shipper",
    label: "Shipper name",
    labelHi: "शिपर का नाम",
    value: "ABC Logistics Pvt Ltd",
    confidence: "high",
  },
  {
    id: "block",
    label: "Delivery block number",
    labelHi: "डिलीवरी ब्लॉक नंबर",
    value: "BLK-042",
    confidence: "medium",
  },
  {
    id: "quantity",
    label: "Quantity",
    labelHi: "मात्रा",
    value: "25",
    confidence: "high",
  },
  {
    id: "fee",
    label: "Delivery fee",
    labelHi: "डिलीवरी शुल्क",
    value: "₹350",
    confidence: "low",
  },
];

export default function WaybillOcrPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("en");
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lightCondition] = useState<"ok" | "dark">("ok");
  const [fields, setFields] = useState<OcrField[]>(initialFields);
  const [hasScanned, setHasScanned] = useState(false);

  // Modal states
  const [helpOpen, setHelpOpen] = useState(false);
  const [masterModalOpen, setMasterModalOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<string>("");
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [directModalOpen, setDirectModalOpen] = useState(false);

  const handleCapture = () => {
    setIsProcessing(true);
    // Simulate OCR processing
    setTimeout(() => {
      setFields(mockOcrResults);
      setHasScanned(true);
      setIsProcessing(false);
    }, 1500);
  };

  const handleDemoOcr = () => {
    setFields(mockOcrResults);
    setHasScanned(true);
  };

  const handleFieldChange = (id: string, value: string) => {
    setFields((prev) =>
      prev.map((field) => (field.id === id ? { ...field, value } : field))
    );
  };

  const handleSelectFromMaster = (fieldLabel: string) => {
    setSelectedField(fieldLabel);
    setMasterModalOpen(true);
  };

  const handleMasterSelect = (value: string) => {
    const field = fields.find(
      (f) => f.label === selectedField || f.labelHi === selectedField
    );
    if (field) {
      handleFieldChange(field.id, value);
      // Update confidence to high after manual selection
      setFields((prev) =>
        prev.map((f) =>
          f.id === field.id ? { ...f, value, confidence: "high" } : f
        )
      );
    }
  };

  const handleSaveAndContinue = () => {
    // Mock navigation
    router.push("/job/mock-123");
  };

  const handleManualEntry = () => {
    // Clear OCR and allow manual input
    setFields(initialFields.map((f) => ({ ...f, value: "" })));
    setHasScanned(true);
  };

  const handleVoiceResult = (result: {
    shipper: string;
    block: string;
    quantity: string;
    fee: string;
  }) => {
    setFields([
      { ...initialFields[0], value: result.shipper, confidence: "medium" },
      { ...initialFields[1], value: result.block, confidence: "medium" },
      { ...initialFields[2], value: result.quantity, confidence: "high" },
      { ...initialFields[3], value: result.fee, confidence: "medium" },
    ]);
    setHasScanned(true);
  };

  const handleDirectSave = (values: {
    shipper: string;
    block: string;
    quantity: string;
    fee: string;
  }) => {
    setFields([
      { ...initialFields[0], value: values.shipper, confidence: "high" },
      { ...initialFields[1], value: values.block, confidence: "high" },
      { ...initialFields[2], value: values.quantity, confidence: "high" },
      { ...initialFields[3], value: values.fee, confidence: "high" },
    ]);
    setHasScanned(true);
  };

  const getFieldLabel = (field: OcrField) => {
    return language === "en" ? field.label : field.labelHi;
  };

  return (
    <div className="dark min-h-screen bg-background flex items-center justify-center p-4">
      {/* Phone frame */}
      <div className="w-full max-w-[390px] h-[844px] bg-background rounded-[40px] border-[8px] border-secondary overflow-hidden shadow-2xl flex flex-col">
        {/* Status bar mock */}
        <div className="h-12 bg-background flex items-center justify-center">
          <div className="w-32 h-6 bg-foreground/10 rounded-full" />
        </div>

        {/* Header */}
        <header className="px-4 py-3 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">
              {language === "en" ? "Scan Waybill" : "वेबिल स्कैन करें"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <div className="flex rounded-lg overflow-hidden border border-border/50 text-xs">
              <button
                onClick={() => setLanguage("en")}
                className={`px-2.5 py-1.5 transition-colors ${
                  language === "en"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage("hi")}
                className={`px-2.5 py-1.5 transition-colors ${
                  language === "hi"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                हिंदी
              </button>
            </div>
            {/* Help button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setHelpOpen(true)}
              aria-label="Help"
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </header>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Camera capture area - top portion */}
          <div className="flex-[5] min-h-0 p-3">
            <DocumentScanView
              isFlashOn={isFlashOn}
              onFlashToggle={() => setIsFlashOn(!isFlashOn)}
              onCapture={handleCapture}
              onGallery={() => {
                /* Mock gallery */
              }}
              lightCondition={lightCondition}
              isProcessing={isProcessing}
            />
          </div>

          {/* Trouble capturing? section */}
          <div className="px-4 py-1.5 border-t border-border/50 bg-secondary/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {language === "en" ? "Trouble capturing?" : "कैप्चर में समस्या?"}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setVoiceModalOpen(true)}
                  className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80 transition-colors"
                >
                  <Mic className="h-3 w-3" />
                  {language === "en" ? "Voice" : "वॉइस"}
                </button>
                <button
                  onClick={() => setDirectModalOpen(true)}
                  className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80 transition-colors"
                >
                  <PenLine className="h-3 w-3" />
                  {language === "en" ? "Direct" : "डायरेक्ट"}
                </button>
              </div>
            </div>
          </div>

          {/* OCR Preview panel - bottom portion */}
          <div className="flex-[4] min-h-0 flex flex-col border-t border-border/30">
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium text-muted-foreground">
                  {language === "en" ? "Extracted fields" : "निकाले गए फील्ड"}
                </h2>
                {!hasScanned && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={handleDemoOcr}
                  >
                    <Sparkles className="h-3 w-3" />
                    Demo OCR
                  </Button>
                )}
              </div>

              {/* Field rows - compact layout */}
              <div className="space-y-2">
                {fields.map((field) => (
                  <OcrFieldRow
                    key={field.id}
                    label={getFieldLabel(field)}
                    value={field.value}
                    confidence={field.confidence}
                    onChange={(value) => handleFieldChange(field.id, value)}
                    onSelectFromMaster={
                      field.confidence === "low"
                        ? () => handleSelectFromMaster(field.label)
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>

            {/* Action buttons - sticky bottom */}
            <div className="px-4 py-2 border-t border-border/50 bg-background space-y-1.5">
              <Button
                className="w-full h-10 text-sm font-medium"
                onClick={handleSaveAndContinue}
                disabled={!hasScanned || fields.some((f) => !f.value)}
              >
                {language === "en" ? "Save & Continue" : "सेव करें और जारी रखें"}
              </Button>
              <Button
                variant="ghost"
                className="w-full h-8 text-xs text-muted-foreground"
                onClick={handleManualEntry}
              >
                {language === "en" ? "Manual entry" : "मैन्युअल एंट्री"}
              </Button>
            </div>
          </div>
        </div>

        {/* Home indicator mock */}
        <div className="h-8 flex items-center justify-center">
          <div className="w-32 h-1 bg-foreground/20 rounded-full" />
        </div>
      </div>

      {/* Modals */}
      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
      <MasterSelectModal
        open={masterModalOpen}
        onOpenChange={setMasterModalOpen}
        fieldName={selectedField}
        onSelect={handleMasterSelect}
      />
      <VoiceInputModal
        open={voiceModalOpen}
        onOpenChange={setVoiceModalOpen}
        onUseResult={handleVoiceResult}
        language={language}
      />
      <DirectInputModal
        open={directModalOpen}
        onOpenChange={setDirectModalOpen}
        onSave={handleDirectSave}
        language={language}
      />
    </div>
  );
}
