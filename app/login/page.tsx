"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle, Camera, CheckCircle2, Truck, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { useLang } from "@/app/context/LanguageContext"
import { LangToggle } from "@/app/components/LangToggle"

type Screen = "phone" | "otp" | "profile"
type VehicleType = "E-Rickshaw" | "Cargo Bike" | "Other"
type LoginTab = "whatsapp" | "sms"

// TODO: Replace with real WhatsApp Business API
async function sendWhatsAppOTP(phoneNumber: string): Promise<{ success: boolean; messageId: string }> {
  await new Promise((resolve) => setTimeout(resolve, 800))
  console.log("[WhatsApp OTP] Sending to:", phoneNumber)
  return { success: true, messageId: "mock-" + Date.now() }
}

// TODO: Replace with real SMS API (Twilio/MSG91)
async function sendSmsOTP(phoneNumber: string) {
  await new Promise(resolve => setTimeout(resolve, 800))
  console.log("[SMS OTP] Sending to:", phoneNumber)
  return { success: true, messageId: 'sms-mock-' + Date.now() }
}

export default function LoginPage() {
  const router = useRouter()
  const { lang } = useLang()
  const [screen, setScreen] = useState<Screen>("phone")
  const [loginTab, setLoginTab] = useState<LoginTab>("whatsapp")

  // Phone screen
  const [phone, setPhone] = useState("")
  const [sending, setSending] = useState(false)
  const [sentMsg, setSentMsg] = useState(false)
  const [phoneError, setPhoneError] = useState("")

  // OTP screen
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [verifying, setVerifying] = useState(false)
  const [otpError, setOtpError] = useState("")
  const [resendTimer, setResendTimer] = useState(30)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Profile screen
  const [name, setName] = useState("")
  const [vehicleType, setVehicleType] = useState<VehicleType>("E-Rickshaw")
  const [vehicleCode, setVehicleCode] = useState("")
  const [experienceYears, setExperienceYears] = useState<number>(0)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState("")
  const qrInputRef = useRef<HTMLInputElement>(null)

  // 古いCookieとlocalStorageを全てクリア
  useEffect(() => {
    localStorage.removeItem('loggedIn')
    document.cookie = 'rakashi-auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
  }, [])

  // Auto-login: if already have phone+profile, skip to dashboard
  useEffect(() => {
    const savedPhone = localStorage.getItem("rakashi_phone")
    if (!savedPhone) return
    supabase
      .from("driver_profiles")
      .select("id, name")
      .eq("phone_number", savedPhone)
      .single()
      .then(({ data }) => {
        if (data?.name) {
          document.cookie = 'rakashi-auth=1; path=/; max-age=86400'
          router.push("/dashboard")
        }
      })
  }, [])

  // Resend timer
  useEffect(() => {
    if (screen !== "otp" || resendTimer <= 0) return
    const t = setInterval(() => setResendTimer((p) => p - 1), 1000)
    return () => clearInterval(t)
  }, [screen, resendTimer])

  // --- Screen 1: Send OTP ---
  const handleSendOTP = async () => {
    if (phone.length < 10) {
      setPhoneError(lang === "en" ? "Please enter a valid 10-digit number" : "कृपया 10 अंकों का नंबर दर्ज करें")
      return
    }
    setSending(true)
    setPhoneError("")
    if (loginTab === "whatsapp") {
      await sendWhatsAppOTP(`+91${phone}`)
    } else {
      await sendSmsOTP(`+91${phone}`)
    }
    setSending(false)
    setSentMsg(true)
    setTimeout(() => {
      setSentMsg(false)
      setScreen("otp")
      setResendTimer(30)
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }, 1200)
  }

  // --- Screen 2: Verify OTP ---
  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...otp]
    next[i] = val.slice(-1)
    setOtp(next)
    setOtpError("")
    if (val && i < 5) otpRefs.current[i + 1]?.focus()
  }

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus()
  }

  const handleVerifyOTP = async () => {
    const code = otp.join("")
    if (code.length !== 6) return

    setVerifying(true)
    setOtpError("")

    // モックチェックを最優先
    if (code === "123456") {
      console.log("[OTP] Mock OTP verified")

      // phone_numberをlocalStorageに保存（dashboard等で使用）
      localStorage.setItem("rakashi_phone", `+91${phone}`)
      // Cookieを設定（proxy.tsの認証チェック用）
      document.cookie = 'rakashi-auth=1; path=/; max-age=86400'

      try {
        const { data: profile } = await supabase
          .from("driver_profiles")
          .select("name")
          .eq("phone_number", `+91${phone}`)
          .single()

        if (profile?.name) {
          // 既存ユーザー → ダッシュボードへ
          router.push("/dashboard")
        } else {
          // 新規ユーザー → プロフィール登録へ
          setVerifying(false)
          setScreen("profile")
        }
      } catch {
        // プロフィールがない場合はプロフィール登録へ
        setVerifying(false)
        setScreen("profile")
      }
      return
    }

    // 本物のOTP検証（将来用）
    setOtpError(lang === "en" ? "Invalid OTP. Please try again." : "अमान्य OTP। पुनः प्रयास करें।")
    setOtp(["", "", "", "", "", ""])
    otpRefs.current[0]?.focus()
    setVerifying(false)
  }

  const handleResendOTP = async () => {
    if (resendTimer > 0) return
    setOtp(["", "", "", "", "", ""])
    setOtpError("")
    setResendTimer(30)
    if (loginTab === "whatsapp") {
      await sendWhatsAppOTP(`+91${phone}`)
    } else {
      await sendSmsOTP(`+91${phone}`)
    }
    setTimeout(() => otpRefs.current[0]?.focus(), 100)
  }

  // --- Screen 3: Profile ---
  const handleQRScan = () => {
    qrInputRef.current?.click()
  }

  const handleQRFile = () => {
    // Mock: simulate QR scan result from camera capture
    setScanning(true)
    setTimeout(() => {
      const mockCode = "VEH-" + Math.random().toString(36).substring(2, 8).toUpperCase()
      setVehicleCode(mockCode)
      setScanning(false)
      if (qrInputRef.current) qrInputRef.current.value = ""
    }, 1500)
  }

  const handleCompleteRegistration = async () => {
    if (!name.trim()) {
      setNameError(lang === "en" ? "Please enter your name" : "कृपया अपना नाम दर्ज करें")
      return
    }
    setSaving(true)

    const phoneNumber = `+91${phone}`
    const { data: upserted } = await supabase.from("driver_profiles").upsert({
      phone_number: phoneNumber,
      name: name.trim(),
      vehicle_type: vehicleType,
      experience_years: experienceYears,
      trust_score: 10,
      total_deliveries: 0,
      total_earnings_inr: 0,
    }, { onConflict: "phone_number" }).select("id").single()

    if (upserted?.id) {
      localStorage.setItem("driverId", upserted.id)
    }
    localStorage.setItem("rakashi_phone", phoneNumber)
    document.cookie = 'rakashi-auth=1; path=/; max-age=86400'

    setSaving(false)
    router.push("/dashboard")
  }

  const isOtpComplete = otp.every((d) => d !== "")
  const vehicleOptions: VehicleType[] = ["E-Rickshaw", "Cargo Bike", "Other"]

  // OTP screen colors based on active tab
  const otpBubbleColor = loginTab === "whatsapp" ? "#25D366" : "#F97316"
  const otpCheckMessage = loginTab === "whatsapp"
    ? (lang === "en" ? "Check your WhatsApp" : "अपना WhatsApp चेक करें")
    : (lang === "en" ? "Check your SMS messages" : "अपने SMS संदेश चेक करें")

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hidden QR camera input */}
      <input
        ref={qrInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleQRFile}
      />

      {/* Language toggle */}
      <div className="flex justify-end px-4 pt-3">
        <LangToggle />
      </div>

      <div className="flex-1 flex flex-col px-6 py-4 max-w-md mx-auto w-full">

        {/* ── Screen 1: Phone ── */}
        {screen === "phone" && (
          <>
            {/* Tab switcher */}
            <div className="flex gap-2 mb-6 mt-2">
              <button
                onClick={() => { setLoginTab("whatsapp"); setPhoneError(""); setSentMsg(false) }}
                className={`flex-1 h-10 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  loginTab === "whatsapp"
                    ? "text-white"
                    : "bg-muted text-muted-foreground"
                }`}
                style={loginTab === "whatsapp" ? { backgroundColor: "#25D366" } : {}}
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
              <button
                onClick={() => { setLoginTab("sms"); setPhoneError(""); setSentMsg(false) }}
                className={`flex-1 h-10 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  loginTab === "sms"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Phone className="w-4 h-4" />
                Phone / SMS
              </button>
            </div>

            {/* WhatsApp tab content */}
            {loginTab === "whatsapp" && (
              <>
                <div className="text-center mb-8 mt-4">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4" style={{ backgroundColor: "#25D366" }}>
                    <MessageCircle className="w-10 h-10 text-white" fill="white" />
                  </div>
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    {lang === "en" ? "Login with WhatsApp" : "WhatsApp से लॉगिन करें"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {lang === "en" ? "Enter your WhatsApp number to continue" : "जारी रखने के लिए WhatsApp नंबर दर्ज करें"}
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex gap-2">
                    <div className="flex items-center justify-center w-20 h-14 bg-input border border-border rounded-xl text-foreground font-semibold text-sm">
                      🇮🇳 +91
                    </div>
                    <Input
                      type="tel"
                      placeholder={lang === "en" ? "10-digit number" : "10 अंकों का नंबर"}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                        setPhoneError("")
                      }}
                      className="flex-1 h-14 bg-input border-border text-foreground placeholder:text-muted-foreground text-base rounded-xl"
                    />
                  </div>
                  {phoneError && <p className="text-destructive text-sm">{phoneError}</p>}
                  {sentMsg && (
                    <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: "#25D366" }}>
                      <CheckCircle2 className="w-4 h-4" />
                      {lang === "en" ? "OTP sent to WhatsApp ✅" : "WhatsApp पर OTP भेजा गया ✅"}
                    </p>
                  )}
                </div>

                <Button
                  onClick={handleSendOTP}
                  disabled={sending || phone.length < 10}
                  className="w-full h-14 text-base font-bold rounded-xl text-white"
                  style={{ backgroundColor: "#25D366" }}
                >
                  {sending ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {lang === "en" ? "Sending..." : "भेजा जा रहा है..."}
                    </div>
                  ) : (
                    <>
                      <MessageCircle className="w-5 h-5 mr-2" />
                      {lang === "en" ? "Send OTP via WhatsApp" : "WhatsApp पर OTP भेजें"}
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  {lang === "en"
                    ? "We'll send a one-time code via WhatsApp"
                    : "हम WhatsApp के माध्यम से एक बार उपयोग होने वाला कोड भेजेंगे"}
                </p>
              </>
            )}

            {/* SMS tab content */}
            {loginTab === "sms" && (
              <>
                <div className="text-center mb-8 mt-4">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 bg-primary">
                    <Phone className="w-10 h-10 text-white" />
                  </div>
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    {lang === "en" ? "Login with Phone" : "फोन से लॉगिन करें"}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {lang === "en" ? "We'll send a verification code via SMS" : "हम SMS के माध्यम से सत्यापन कोड भेजेंगे"}
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex gap-2">
                    <div className="flex items-center justify-center w-20 h-14 bg-input border border-border rounded-xl text-foreground font-semibold text-sm">
                      🇮🇳 +91
                    </div>
                    <Input
                      type="tel"
                      placeholder={lang === "en" ? "10-digit number" : "10 अंकों का नंबर"}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                        setPhoneError("")
                      }}
                      className="flex-1 h-14 bg-input border-border text-foreground placeholder:text-muted-foreground text-base rounded-xl"
                    />
                  </div>
                  {phoneError && <p className="text-destructive text-sm">{phoneError}</p>}
                  {sentMsg && (
                    <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: "#F97316" }}>
                      <CheckCircle2 className="w-4 h-4" />
                      {lang === "en" ? "OTP sent via SMS ✅" : "SMS पर OTP भेजा गया ✅"}
                    </p>
                  )}
                </div>

                <Button
                  onClick={handleSendOTP}
                  disabled={sending || phone.length < 10}
                  className="w-full h-14 text-base font-bold rounded-xl text-white"
                  style={{ backgroundColor: "#F97316" }}
                >
                  {sending ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {lang === "en" ? "Sending..." : "भेजा जा रहा है..."}
                    </div>
                  ) : (
                    <>
                      <Phone className="w-5 h-5 mr-2" />
                      {lang === "en" ? "Send OTP via SMS" : "SMS पर OTP भेजें"}
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  {lang === "en"
                    ? "We'll send a one-time code via SMS"
                    : "हम SMS के माध्यम से एक बार उपयोग होने वाला कोड भेजेंगे"}
                </p>
              </>
            )}
          </>
        )}

        {/* ── Screen 2: OTP ── */}
        {screen === "otp" && (
          <>
            <div className="text-center mb-6 mt-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3" style={{ backgroundColor: otpBubbleColor }}>
                {loginTab === "whatsapp"
                  ? <MessageCircle className="w-8 h-8 text-white" fill="white" />
                  : <Phone className="w-8 h-8 text-white" />
                }
              </div>
              <h1 className="text-xl font-bold text-foreground mb-1">
                {lang === "en" ? "Enter OTP" : "OTP दर्ज करें"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {lang === "en" ? `Sent to +91 ${phone}` : `+91 ${phone} पर भेजा गया`}
              </p>
            </div>

            {/* Message bubble */}
            <div className="mb-6 flex justify-start">
              <div className="rounded-2xl rounded-tl-none px-4 py-3 max-w-[85%]" style={{ backgroundColor: otpBubbleColor }}>
                <p className="text-white text-xs font-medium mb-1">RakAshi Driver</p>
                <p className="text-white text-sm">
                  {lang === "en"
                    ? "Your RakAshi verification code: "
                    : "आपका RakAshi सत्यापन कोड: "}
                  <span className="font-black tracking-widest">██████</span>
                </p>
                <p className="text-white/80 text-xs mt-1">
                  {otpCheckMessage}
                </p>
                <p className="text-white/60 text-[10px] mt-1 text-right">
                  {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>

            {/* OTP boxes */}
            <div className="flex justify-center gap-2 mb-4">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-2xl font-bold bg-input border-2 rounded-xl text-foreground focus:outline-none focus:border-primary transition-colors ${
                    otpError ? "border-destructive" : "border-border"
                  }`}
                />
              ))}
            </div>

            {otpError && <p className="text-destructive text-sm text-center mb-3">{otpError}</p>}

            <Button
              onClick={handleVerifyOTP}
              disabled={verifying || !isOtpComplete}
              className="w-full h-14 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 text-white mb-4"
            >
              {verifying ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {lang === "en" ? "Verifying..." : "सत्यापित हो रहा है..."}
                </div>
              ) : (
                lang === "en" ? "Verify OTP" : "OTP सत्यापित करें"
              )}
            </Button>

            {/* Resend */}
            <div className="flex items-center justify-center gap-3 text-sm">
              <button
                onClick={handleResendOTP}
                disabled={resendTimer > 0}
                className={resendTimer > 0 ? "text-muted-foreground" : "text-primary hover:underline"}
              >
                {resendTimer > 0
                  ? `${lang === "en" ? "Resend in" : "पुनः भेजें"} 0:${resendTimer.toString().padStart(2, "0")}`
                  : (lang === "en" ? "Resend OTP" : "OTP पुनः भेजें")}
              </button>
              <span className="text-border">·</span>
              <button
                onClick={() => { setScreen("phone"); setOtp(["", "", "", "", "", ""]); setOtpError("") }}
                className="text-muted-foreground hover:text-foreground"
              >
                {lang === "en" ? "Change number" : "नंबर बदलें"}
              </button>
            </div>
          </>
        )}

        {/* ── Screen 3: Profile Registration ── */}
        {screen === "profile" && (
          <>
            <div className="text-center mb-6 mt-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-3">
                <Truck className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground mb-1">
                {lang === "en" ? "Complete Registration" : "पंजीकरण पूरा करें"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {lang === "en" ? "Tell us about yourself" : "अपने बारे में बताएं"}
              </p>
            </div>

            <div className="space-y-4 mb-6">
              {/* Name */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  {lang === "en" ? "Your name" : "आपका नाम"}
                </label>
                <Input
                  type="text"
                  placeholder={lang === "en" ? "Enter your full name" : "अपना पूरा नाम दर्ज करें"}
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameError("") }}
                  className="h-14 bg-input border-border text-foreground placeholder:text-muted-foreground rounded-xl text-base"
                />
                {nameError && <p className="text-destructive text-xs mt-1">{nameError}</p>}
              </div>

              {/* Vehicle type */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  {lang === "en" ? "Vehicle type" : "वाहन का प्रकार"}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {vehicleOptions.map((v) => (
                    <button
                      key={v}
                      onClick={() => setVehicleType(v)}
                      className={`h-12 rounded-xl text-sm font-medium border transition-colors ${
                        vehicleType === v
                          ? "bg-primary text-white border-primary"
                          : "bg-input border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v === "E-Rickshaw" ? "🛺 " + v : v === "Cargo Bike" ? "🚲 " + v : "🚐 " + v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Experience years */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  {lang === "en" ? "Years of Experience" : "अनुभव (वर्ष)"}
                </label>
                <select
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(Number(e.target.value))}
                  className="w-full h-14 px-4 rounded-xl bg-input border border-border text-foreground text-base appearance-none"
                >
                  <option value={0}>{lang === "en" ? "< 1 year" : "< 1 वर्ष"}</option>
                  {[1,2,3,4,5,6,7,8,9,10].map(y => (
                    <option key={y} value={y}>{y} {lang === "en" ? "year(s)" : "वर्ष"}</option>
                  ))}
                  <option value={11}>{lang === "en" ? "10+ years" : "10+ वर्ष"}</option>
                </select>
              </div>

              {/* QR scan */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  {lang === "en" ? "Vehicle QR Code (optional)" : "वाहन QR कोड (वैकल्पिक)"}
                </label>
                {vehicleCode ? (
                  <div className="h-14 flex items-center gap-2 px-4 rounded-xl bg-green-500/10 border border-green-500/30">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <span className="text-sm text-green-500 font-medium">
                      {lang === "en" ? "Vehicle linked ✅" : "वाहन लिंक किया गया ✅"} {vehicleCode}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={handleQRScan}
                    disabled={scanning}
                    className="w-full h-14 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors text-sm font-medium"
                  >
                    {scanning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                        {lang === "en" ? "Scanning..." : "स्कैन हो रहा है..."}
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5" />
                        {lang === "en" ? "Scan Vehicle QR Code" : "वाहन QR कोड स्कैन करें"}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <Button
              onClick={handleCompleteRegistration}
              disabled={saving || !name.trim()}
              className="w-full h-14 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 text-white"
            >
              {saving ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {lang === "en" ? "Saving..." : "सहेजा जा रहा है..."}
                </div>
              ) : (
                lang === "en" ? "Complete Registration" : "पंजीकरण पूरा करें"
              )}
            </Button>
          </>
        )}

        {/* Demo shortcut */}
        {screen === "phone" && (
          <button
            onClick={() => {
              document.cookie = "rakashi-auth=1; path=/; max-age=86400"
              router.push("/dashboard")
            }}
            className="mt-6 w-full py-3 text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            {lang === "en" ? "Demo login (skip OTP)" : "डेमो लॉगिन (OTP छोड़ें)"}
          </button>
        )}
      </div>
    </div>
  )
}
