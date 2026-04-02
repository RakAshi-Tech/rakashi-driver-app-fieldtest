"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Camera, CheckCircle2, User, ChevronLeft, Shield, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { BrowserQRCodeReader } from "@zxing/library"

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/

function OnboardingInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const phone = searchParams.get("phone") ?? ""

  const [step, setStep] = useState(1)

  // Step 1: Basic Info
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [city, setCity] = useState("")
  const [area, setArea] = useState("")
  const [pinCode, setPinCode] = useState("")

  // Step 2: Identity
  const [pan, setPan] = useState("")
  const [aadhaarLast4, setAadhaarLast4] = useState("")
  const [dob, setDob] = useState("")
  const panValid = PAN_REGEX.test(pan)

  // Step 3: Vehicle
  const [vehicleCode, setVehicleCode] = useState("")
  const [showManualInput, setShowManualInput] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const qrReaderRef = useRef<BrowserQRCodeReader | null>(null)

  // Step 4: Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Step 5: Save
  const [saving, setSaving] = useState(false)

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Stop scanner on unmount
  useEffect(() => {
    return () => {
      if (qrReaderRef.current) {
        qrReaderRef.current.reset()
        qrReaderRef.current = null
      }
    }
  }, [])

  // ── Validation ──
  const validateStep1 = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = "Full name is required"
    if (!city.trim()) e.city = "City is required"
    if (!area.trim()) e.area = "Area / Locality is required"
    if (pinCode.length !== 6) e.pinCode = "PIN Code must be 6 digits"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const validateStep2 = () => {
    const e: Record<string, string> = {}
    if (!pan.trim()) e.pan = "PAN Card number is required"
    else if (!panValid) e.pan = "Invalid PAN format (e.g. ABCDE1234F)"
    if (!dob) e.dob = "Date of birth is required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleNext = () => {
    setErrors({})
    if (step === 1 && !validateStep1()) return
    if (step === 2 && !validateStep2()) return
    setStep((s) => s + 1)
  }

  const handleBack = () => {
    setErrors({})
    setStep((s) => s - 1)
  }

  // ── QR Scanner ──
  const startQRScan = async () => {
    setShowScanner(true)
    try {
      const codeReader = new BrowserQRCodeReader()
      qrReaderRef.current = codeReader
      await codeReader.decodeFromVideoDevice(
        null,
        videoRef.current!,
        (result) => {
          if (result) {
            const text = result.getText()
            console.log("[QR] Scanned:", text)
            setVehicleCode(text)
            stopQRScan()
          }
        }
      )
    } catch (err) {
      console.error("[QR] Scan error:", err)
      stopQRScan()
    }
  }

  const stopQRScan = () => {
    if (qrReaderRef.current) {
      qrReaderRef.current.reset()
      qrReaderRef.current = null
    }
    setShowScanner(false)
  }

  // ── Photo ──
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  // ── Save to Supabase ──
  const handleSave = async () => {
    setSaving(true)
    try {
      // 認証チェックをスキップ（モック認証のため）
      // phone_numberをキーにしてdriver_profilesに保存（idは自動生成）
      const { error } = await supabase
        .from("driver_profiles")
        .upsert({
          phone_number: phone ? `+91${phone}` : `test-${Date.now()}`,
          name: name.trim(),
          email: email.trim() || null,
          city: city.trim(),
          area: area.trim(),
          pin_code: pinCode,
          pan_number: pan,
          aadhaar_last4: aadhaarLast4 || null,
          date_of_birth: dob || null,
          vehicle_type: "e-rickshaw",
          trust_score: 50,
          ...(vehicleCode ? { vehicle_code: vehicleCode } : {}),
        }, {
          onConflict: "phone_number",
          ignoreDuplicates: false,
        })

      if (error) {
        console.error("Save error details:", JSON.stringify(error))
        console.error("Save error message:", error.message)
        console.error("Save error code:", error.code)
      }
    } catch (error) {
      console.error("handleSave error:", error)
    } finally {
      // 認証Cookieをセットしてダッシュボードへ
      document.cookie = "rakashi-auth=1; path=/; max-age=86400"
      router.push("/dashboard")
    }
  }

  // ── Step Indicator ──
  const StepDot = ({ n }: { n: number }) => (
    <div
      className="rounded-full transition-all"
      style={{
        width: n === step ? 24 : 10,
        height: 10,
        backgroundColor: n <= step ? "#F97316" : "#3A3A3A",
      }}
    />
  )

  const maxDob = new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0]

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#1A1A1A", color: "#F5F0E8" }}>
      {/* Hidden photo input */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoChange} />

      {/* ── QR Scanner Overlay ── */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "#000" }}>
          {/* Camera feed */}
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />

            {/* Scan guide overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {/* Dark borders around the scan area */}
              <div className="relative w-64 h-64">
                <div
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
                    border: "2px solid #F97316",
                  }}
                />
                {/* Corner accents */}
                {[
                  "top-0 left-0 border-t-4 border-l-4 rounded-tl-xl",
                  "top-0 right-0 border-t-4 border-r-4 rounded-tr-xl",
                  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl",
                  "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl",
                ].map((cls, i) => (
                  <div
                    key={i}
                    className={`absolute w-8 h-8 ${cls}`}
                    style={{ borderColor: "#F97316" }}
                  />
                ))}
              </div>

              <p className="mt-4 text-sm font-medium" style={{ color: "#F97316" }}>
                スキャン中...
              </p>
            </div>
          </div>

          {/* Cancel button */}
          <div className="p-6 shrink-0">
            <Button
              onClick={stopQRScan}
              className="w-full h-14 text-base font-bold rounded-xl"
              style={{ backgroundColor: "#2A2A2A", color: "#F5F0E8" }}
            >
              <X className="w-5 h-5 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <div className="w-16">
          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm"
              style={{ color: "#F5F0E8" }}
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
          )}
        </div>
        <div className="flex gap-1.5 items-center">
          {[1, 2, 3, 4, 5].map((n) => <StepDot key={n} n={n} />)}
        </div>
        <span className="w-16 text-right text-xs" style={{ color: "#666" }}>{step} / 5</span>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 pb-6 overflow-y-auto">

        {/* ── Step 1: Basic Info ── */}
        {step === 1 && (
          <div className="mt-4 space-y-5">
            <div>
              <h1 className="text-2xl font-bold mb-1">Tell us about yourself</h1>
              <p className="text-sm" style={{ color: "#888" }}>
                This information will be used for your driver profile
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#888" }}>Full Name *</label>
                <Input
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })) }}
                  placeholder="Enter your full name"
                  className="h-14 rounded-xl text-base border placeholder:text-[#555]"
                  style={{ backgroundColor: "#2A2A2A", borderColor: errors.name ? "#ef4444" : "#3A3A3A", color: "#F5F0E8" }}
                />
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#888" }}>Phone Number</label>
                <div className="h-14 rounded-xl border flex items-center px-4 text-base" style={{ backgroundColor: "#222", borderColor: "#3A3A3A", color: "#666" }}>
                  🇮🇳 +91 {phone}
                </div>
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#888" }}>Email Address</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Optional - for receipts & updates"
                  className="h-14 rounded-xl text-base border placeholder:text-[#555]"
                  style={{ backgroundColor: "#2A2A2A", borderColor: "#3A3A3A", color: "#F5F0E8" }}
                />
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#888" }}>City *</label>
                <Input
                  value={city}
                  onChange={(e) => { setCity(e.target.value); setErrors((p) => ({ ...p, city: "" })) }}
                  placeholder="e.g. Delhi, Mumbai"
                  className="h-14 rounded-xl text-base border placeholder:text-[#555]"
                  style={{ backgroundColor: "#2A2A2A", borderColor: errors.city ? "#ef4444" : "#3A3A3A", color: "#F5F0E8" }}
                />
                {errors.city && <p className="text-red-400 text-xs mt-1">{errors.city}</p>}
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#888" }}>Area / Locality *</label>
                <Input
                  value={area}
                  onChange={(e) => { setArea(e.target.value); setErrors((p) => ({ ...p, area: "" })) }}
                  placeholder="e.g. Sadar Bazaar, Delhi"
                  className="h-14 rounded-xl text-base border placeholder:text-[#555]"
                  style={{ backgroundColor: "#2A2A2A", borderColor: errors.area ? "#ef4444" : "#3A3A3A", color: "#F5F0E8" }}
                />
                {errors.area && <p className="text-red-400 text-xs mt-1">{errors.area}</p>}
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#888" }}>PIN Code *</label>
                <Input
                  value={pinCode}
                  onChange={(e) => { setPinCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErrors((p) => ({ ...p, pinCode: "" })) }}
                  placeholder="6-digit PIN code"
                  inputMode="numeric"
                  className="h-14 rounded-xl text-base border placeholder:text-[#555]"
                  style={{ backgroundColor: "#2A2A2A", borderColor: errors.pinCode ? "#ef4444" : "#3A3A3A", color: "#F5F0E8" }}
                />
                {errors.pinCode && <p className="text-red-400 text-xs mt-1">{errors.pinCode}</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Identity ── */}
        {step === 2 && (
          <div className="mt-4 space-y-5">
            <div>
              <h1 className="text-2xl font-bold mb-1">Verify your identity</h1>
              <p className="text-sm" style={{ color: "#888" }}>Required for trust score & payments</p>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl" style={{ backgroundColor: "#0d2a0d", border: "1px solid #1f4d1f" }}>
              <Shield className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#4ade80" }} />
              <p className="text-xs leading-relaxed" style={{ color: "#4ade80" }}>
                🔒 Your information is encrypted and secure. We never share your personal data.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#888" }}>PAN Card Number *</label>
                <div className="relative">
                  <Input
                    value={pan}
                    onChange={(e) => { setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)); setErrors((p) => ({ ...p, pan: "" })) }}
                    placeholder="ABCDE1234F"
                    className="h-14 rounded-xl text-base border pr-12 uppercase placeholder:text-[#555]"
                    style={{ backgroundColor: "#2A2A2A", borderColor: errors.pan ? "#ef4444" : pan.length === 10 ? (panValid ? "#4ade80" : "#ef4444") : "#3A3A3A", color: "#F5F0E8" }}
                  />
                  {pan.length === 10 && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      {panValid ? <CheckCircle2 className="w-5 h-5" style={{ color: "#4ade80" }} /> : <span className="text-red-400 text-xl font-bold">✗</span>}
                    </div>
                  )}
                </div>
                {errors.pan && <p className="text-red-400 text-xs mt-1">{errors.pan}</p>}
                {pan.length === 10 && panValid && <p className="text-xs mt-1" style={{ color: "#4ade80" }}>Valid PAN format ✓</p>}
                {pan.length === 10 && !panValid && <p className="text-red-400 text-xs mt-1">Invalid format. Example: ABCDE1234F</p>}
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: "#888" }}>Aadhaar Number (optional)</label>
                <p className="text-xs mb-1.5" style={{ color: "#555" }}>Last 4 digits only for verification</p>
                <Input
                  value={aadhaarLast4}
                  onChange={(e) => setAadhaarLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Last 4 digits"
                  inputMode="numeric"
                  className="h-14 rounded-xl text-base border placeholder:text-[#555]"
                  style={{ backgroundColor: "#2A2A2A", borderColor: "#3A3A3A", color: "#F5F0E8" }}
                />
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#888" }}>Date of Birth *</label>
                <Input
                  type="date"
                  value={dob}
                  max={maxDob}
                  onChange={(e) => { setDob(e.target.value); setErrors((p) => ({ ...p, dob: "" })) }}
                  className="h-14 rounded-xl text-base border"
                  style={{ backgroundColor: "#2A2A2A", borderColor: errors.dob ? "#ef4444" : "#3A3A3A", color: dob ? "#F5F0E8" : "#555", colorScheme: "dark" }}
                />
                {errors.dob && <p className="text-red-400 text-xs mt-1">{errors.dob}</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Vehicle ── */}
        {step === 3 && (
          <div className="mt-4 space-y-5">
            <div>
              <h1 className="text-2xl font-bold mb-1">Link your vehicle</h1>
              <p className="text-sm" style={{ color: "#888" }}>Scan the QR code on your vehicle</p>
            </div>

            {vehicleCode ? (
              <div className="flex items-center gap-3 px-4 py-4 rounded-2xl" style={{ backgroundColor: "#0d2a0d", border: "1px solid #1f4d1f" }}>
                <CheckCircle2 className="w-6 h-6 shrink-0" style={{ color: "#4ade80" }} />
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: "#4ade80" }}>Vehicle linked ✅</p>
                  <p className="text-xs mt-0.5" style={{ color: "#888" }}>{vehicleCode}</p>
                </div>
                <button onClick={() => { setVehicleCode(""); setShowManualInput(false) }} className="text-xs underline" style={{ color: "#888" }}>
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* QR Scan button */}
                <button
                  onClick={startQRScan}
                  className="w-full h-36 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-colors"
                  style={{ borderColor: "#F97316", backgroundColor: "#2A2A2A" }}
                >
                  <Camera className="w-9 h-9" style={{ color: "#F97316" }} />
                  <span className="text-sm font-semibold" style={{ color: "#F97316" }}>Scan Vehicle QR Code</span>
                </button>

                {!showManualInput ? (
                  <button onClick={() => setShowManualInput(true)} className="w-full text-center text-sm py-1 underline" style={{ color: "#666" }}>
                    Enter code manually
                  </button>
                ) : (
                  <div>
                    <label className="text-xs block mb-1.5" style={{ color: "#888" }}>Vehicle Code</label>
                    <Input
                      value={vehicleCode}
                      onChange={(e) => setVehicleCode(e.target.value.toUpperCase())}
                      placeholder="e.g. VEH-ABC123"
                      className="h-14 rounded-xl text-base border uppercase placeholder:text-[#555]"
                      style={{ backgroundColor: "#2A2A2A", borderColor: "#3A3A3A", color: "#F5F0E8" }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Photo ── */}
        {step === 4 && (
          <div className="mt-4 space-y-5">
            <div>
              <h1 className="text-2xl font-bold mb-1">Add your photo</h1>
              <p className="text-sm" style={{ color: "#888" }}>Helps shippers identify you</p>
            </div>
            <div className="flex flex-col items-center gap-5 py-6">
              <button
                onClick={() => photoInputRef.current?.click()}
                className="w-36 h-36 rounded-full overflow-hidden flex items-center justify-center border-2 transition-all"
                style={{ borderColor: photoPreview ? "#F97316" : "#3A3A3A", backgroundColor: "#2A2A2A" }}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <User className="w-12 h-12" style={{ color: "#444" }} />
                    <span className="text-xs" style={{ color: "#555" }}>Add Photo</span>
                  </div>
                )}
              </button>
              <Button
                onClick={() => photoInputRef.current?.click()}
                variant="outline"
                className="rounded-xl h-12 px-6 font-semibold border"
                style={{ borderColor: "#F97316", color: "#F97316", backgroundColor: "transparent" }}
              >
                <Camera className="w-4 h-4 mr-2" />
                {photoPreview ? "Change Photo" : "Take or Upload Photo"}
              </Button>
            </div>
            {!photoPreview && (
              <button onClick={() => setStep(5)} className="w-full text-center text-sm py-1 underline" style={{ color: "#555" }}>
                Skip for now
              </button>
            )}
          </div>
        )}

        {/* ── Step 5: Complete ── */}
        {step === 5 && (
          <div className="mt-4 space-y-5">
            <div className="text-center py-2">
              <h1 className="text-2xl font-bold mb-1">You&apos;re all set! 🎉</h1>
              <p className="text-sm" style={{ color: "#888" }}>Welcome to RakAshi</p>
            </div>
            <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "#2A2A2A" }}>
              <div className="flex items-center gap-3 pb-3" style={{ borderBottom: "1px solid #3A3A3A" }}>
                {photoPreview ? (
                  <img src={photoPreview} alt="Profile" className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#3A3A3A" }}>
                    <User className="w-6 h-6" style={{ color: "#666" }} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-base truncate">{name}</p>
                  <p className="text-xs truncate" style={{ color: "#888" }}>{area}, {city} {pinCode && `- ${pinCode}`}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 py-1">
                <div>
                  <p className="text-xs" style={{ color: "#888" }}>VIN</p>
                  <div
                    className="inline-block px-3 py-1 rounded-lg border mt-0.5"
                    style={{ backgroundColor: "#2A2A2A", borderColor: "#3A3A3A" }}
                  >
                    <span className="text-sm font-bold" style={{ color: "#F97316" }}>
                      {vehicleCode || "NCG001A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: "#2A2A2A" }}>
              <p className="text-xs mb-2" style={{ color: "#888" }}>Your Trust Score</p>
              <p className="text-7xl font-black leading-none" style={{ color: "#F97316" }}>50</p>
              <p className="text-xs mt-3" style={{ color: "#888" }}>Higher score = better jobs & faster payouts</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-14 text-base font-bold rounded-xl text-white"
              style={{ backgroundColor: "#F97316" }}
            >
              {saving ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </div>
              ) : (
                "Start Delivering"
              )}
            </Button>
          </div>
        )}

        {/* ── Next button (steps 1–4) ── */}
        {step < 5 && (
          <div className="mt-6">
            <Button
              onClick={handleNext}
              className="w-full h-14 text-base font-bold rounded-xl text-white"
              style={{ backgroundColor: "#F97316" }}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div style={{ backgroundColor: "#1A1A1A", minHeight: "100vh" }} />}>
      <OnboardingInner />
    </Suspense>
  )
}
