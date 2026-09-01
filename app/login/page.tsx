"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle, Camera, CheckCircle2, Truck, Phone, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { useLang } from "@/app/context/LanguageContext"
import { LangToggle } from "@/app/components/LangToggle"
import { AUTH_MODE, hasSession, login, register } from "@/lib/auth"
import { withNoProfileAsNull, type DriverProfileSummary } from "@/lib/profile"

type Screen = "phone" | "otp" | "password" | "profile"
type VehicleType = "E-Rickshaw"
type LoginTab = "whatsapp" | "sms"

/**
 * Phase 1 signs in with a password; the OTP screen below is kept intact and
 * renders as soon as AUTH_MODE becomes "SMS_OTP", which is what Phase 2 flips
 * once SMS delivery to Indian numbers is cleared.
 */
const USE_OTP = AUTH_MODE === "SMS_OTP"

/**
 * The caller's own profile, or null when the API says they are authenticated but
 * have not registered one yet - a 403 carrying the guard's "No driver profile".
 * Every other failure (401, a bare 403, 500, a network error) still throws, so
 * only this one answer routes a driver to the profile screen.
 */
const loadProfileOrNull = (): Promise<DriverProfileSummary | null> =>
  withNoProfileAsNull(() =>
    supabase.from("driver_profiles").select("id, name").single()
  )

export default function LoginPage() {
  const router = useRouter()
  const { lang } = useLang()
  const [screen, setScreen] = useState<Screen>("phone")
  // Without OTP there is no channel to choose between, so the tab switcher is
  // hidden and the phone form renders in its primary-colour form.
  const [loginTab, setLoginTab] = useState<LoginTab>(USE_OTP ? "whatsapp" : "sms")

  // Phone screen
  const [phone, setPhone] = useState("")
  const [sending, setSending] = useState(false)
  const [sentMsg, setSentMsg] = useState(false)
  const [phoneError, setPhoneError] = useState("")

  // OTP screen (Phase 2)
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [verifying, setVerifying] = useState(false)
  const [otpError, setOtpError] = useState("")
  const [resendTimer, setResendTimer] = useState(30)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Password screen (Phase 1)
  const [password, setPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")

  // Blocks the login form until the silent session check has finished, so a
  // returning driver never sees the form flash before being sent onward.
  const [checkingSession, setCheckingSession] = useState(true)

  // Profile screen
  const [name, setName] = useState("")
  const [vehicleType, setVehicleType] = useState<VehicleType>("E-Rickshaw")
  const [vehicleCode, setVehicleCode] = useState("")
  const [experienceYears, setExperienceYears] = useState<number>(0)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState("")
  const qrInputRef = useRef<HTMLInputElement>(null)

  // Clear identifiers this app used to keep in local storage. The phone number
  // and name were personal data sitting in a store any script could read; both
  // now come from the token and the API instead.
  useEffect(() => {
    localStorage.removeItem("loggedIn")
    localStorage.removeItem("rakashi_phone")
    localStorage.removeItem("driverName")
    document.cookie = "rakashi-auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
  }, [])

  // Silent sign-in: the HttpOnly refresh cookie is exchanged for a token, and a
  // driver who already has a profile goes straight to the dashboard. This is the
  // whole of the "second visit needs nothing" behaviour.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!(await hasSession())) return
        const profile = await loadProfileOrNull()
        if (cancelled) return
        if (profile?.name) {
          localStorage.setItem("driverId", profile.id)
          router.replace("/dashboard")
          return
        }
        // Authenticated but no profile yet - resume where registration stopped.
        setScreen("profile")
      } catch {
        // No usable session; fall through to the login form.
      } finally {
        if (!cancelled) setCheckingSession(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  // Resend timer
  useEffect(() => {
    if (screen !== "otp" || resendTimer <= 0) return
    const t = setInterval(() => setResendTimer((p) => p - 1), 1000)
    return () => clearInterval(t)
  }, [screen, resendTimer])

  // --- Screen 1: Continue with phone number ---
  const handleSendOTP = async () => {
    if (phone.length < 10) {
      setPhoneError(lang === "en" ? "Please enter a valid 10-digit number" : "कृपया 10 अंकों का नंबर दर्ज करें")
      return
    }
    setPhoneError("")

    if (!USE_OTP) {
      setPassword("")
      setPasswordError("")
      setScreen("password")
      return
    }

    // Phase 2: request an SMS code, then show the OTP screen.
    setSending(true)
    setSending(false)
    setSentMsg(true)
    setTimeout(() => {
      setSentMsg(false)
      setScreen("otp")
      setResendTimer(30)
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }, 1200)
  }

  /**
   * Sign in, or create the account when the number is new.
   *
   * The pool reports nothing about whether a number exists (deliberately - it
   * would otherwise be a way to test which drivers are registered), so the flow
   * tries to sign in first and only falls back to registration. A "this number
   * already exists" answer to that fallback means the password was simply wrong.
   */
  const handleAuthenticate = async () => {
    if (password.length < 8) {
      setPasswordError(
        lang === "en" ? "Password must be at least 8 characters" : "पासवर्ड कम से कम 8 अक्षर का होना चाहिए"
      )
      return
    }
    setVerifying(true)
    setPasswordError("")

    try {
      let isNewAccount = false
      try {
        await login(phone, password)
      } catch {
        try {
          await register(phone, password)
          isNewAccount = true
        } catch (registerError) {
          const message = (registerError as Error).message
          setPasswordError(
            message.includes("already registered")
              ? lang === "en"
                ? "Incorrect password"
                : "गलत पासवर्ड"
              : message
          )
          return
        }
      }

      if (isNewAccount) {
        setScreen("profile")
        return
      }

      // Existing account: the profile row is already there unless registration
      // was abandoned before the profile step, in which case resume it.
      let profile: DriverProfileSummary | null
      try {
        profile = await loadProfileOrNull()
      } catch {
        // Signed in, but the profile could not be read - an expired token, a
        // policy refusal or an API fault. None of those mean "not registered",
        // so the driver stays on this screen with something to act on.
        setPasswordError(
          lang === "en"
            ? "Signed in, but your profile could not be loaded. Please try again."
            : "साइन-इन हो गया, लेकिन प्रोफ़ाइल लोड नहीं हो सकी। कृपया फिर से प्रयास करें।"
        )
        return
      }

      if (profile?.name) {
        localStorage.setItem("driverId", profile.id)
        router.push("/dashboard")
      } else {
        setScreen("profile")
      }
    } finally {
      setVerifying(false)
    }
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

  // Phase 2: exchange the SMS code for a Cognito session. The mock that accepted
  // a hardcoded 123456 - and the demo button that skipped sign-in entirely - are
  // gone; there is no longer any path to the dashboard that does not go through
  // Cognito.
  const handleVerifyOTP = async () => {
    const code = otp.join("")
    if (code.length !== 6) return
    setOtpError(
      lang === "en"
        ? "SMS sign-in is not enabled yet."
        : "SMS साइन-इन अभी उपलब्ध नहीं है।"
    )
  }

  const handleResendOTP = async () => {
    if (resendTimer > 0) return
    setOtp(["", "", "", "", "", ""])
    setOtpError("")
    setResendTimer(30)
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

    try {
      // Upserting on cognito_sub, and no longer sending phone_number, trust_score
      // or earnings: the server stamps identity from the token and refuses those
      // columns from a client. Conflicting on phone_number previously let any
      // caller overwrite whichever profile held that number.
      const { data: upserted } = await supabase
        .from("driver_profiles")
        .upsert(
          {
            name: name.trim(),
            vehicle_type: vehicleType,
            experience_years: experienceYears,
          },
          { onConflict: "cognito_sub" }
        )
        .select("id")
        .single()

      if (upserted?.id) {
        localStorage.setItem("driverId", upserted.id)
      }
      router.push("/dashboard")
    } finally {
      setSaving(false)
    }
  }

  const isOtpComplete = otp.every((d) => d !== "")
  const vehicleOptions: { value: VehicleType; label: string }[] = [
    { value: "E-Rickshaw", label: "N-CarGo" },
  ]

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
        {screen === "phone" && !checkingSession && (
          <>
            {/* Tab switcher (channel choice only matters for OTP delivery) */}
            <div className={`flex gap-2 mb-6 mt-2 ${USE_OTP ? "" : "hidden"}`}>
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
                    {USE_OTP
                      ? (lang === "en" ? "We'll send a verification code via SMS" : "हम SMS के माध्यम से सत्यापन कोड भेजेंगे")
                      : (lang === "en" ? "Enter your mobile number to continue" : "जारी रखने के लिए अपना मोबाइल नंबर दर्ज करें")}
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
                      {USE_OTP
                        ? (lang === "en" ? "Send OTP via SMS" : "SMS पर OTP भेजें")
                        : (lang === "en" ? "Continue" : "जारी रखें")}
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  {USE_OTP
                    ? (lang === "en"
                        ? "We'll send a one-time code via SMS"
                        : "हम SMS के माध्यम से एक बार उपयोग होने वाला कोड भेजेंगे")
                    : (lang === "en"
                        ? "New here? Your account is created on the next step"
                        : "नए हैं? अगले चरण में आपका खाता बन जाएगा")}
                </p>
              </>
            )}
          </>
        )}

        {/* ── Screen 2a: Password (Phase 1) ── */}
        {screen === "password" && (
          <>
            <div className="text-center mb-6 mt-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3 bg-primary">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-xl font-bold text-foreground mb-1">
                {lang === "en" ? "Enter your password" : "अपना पासवर्ड दर्ज करें"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {lang === "en" ? `+91 ${phone}` : `+91 ${phone}`}
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <Input
                type="password"
                autoComplete="current-password"
                placeholder={lang === "en" ? "At least 8 characters" : "कम से कम 8 अक्षर"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setPasswordError("")
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password.length >= 8 && !verifying) handleAuthenticate()
                }}
                className="w-full h-14 bg-input border-border text-foreground placeholder:text-muted-foreground text-base rounded-xl"
              />
              {passwordError && <p className="text-destructive text-sm">{passwordError}</p>}
            </div>

            <Button
              onClick={handleAuthenticate}
              disabled={verifying || password.length < 8}
              className="w-full h-14 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 text-white mb-4"
            >
              {verifying ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {lang === "en" ? "Signing in..." : "साइन इन हो रहा है..."}
                </div>
              ) : (
                lang === "en" ? "Continue" : "जारी रखें"
              )}
            </Button>

            <div className="flex items-center justify-center text-sm">
              <button
                onClick={() => { setScreen("phone"); setPassword(""); setPasswordError("") }}
                className="text-muted-foreground hover:text-foreground"
              >
                {lang === "en" ? "Change number" : "नंबर बदलें"}
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-4">
              {lang === "en"
                ? "Signing in keeps you logged in on this device"
                : "साइन इन करने पर आप इस डिवाइस पर लॉग इन रहेंगे"}
            </p>
          </>
        )}

        {/* ── Screen 2b: OTP (Phase 2 - enabled by AUTH_MODE) ── */}
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
                <div className="grid grid-cols-1 gap-2">
                  {vehicleOptions.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setVehicleType(value)}
                      className="h-12 rounded-xl text-sm font-medium border transition-colors bg-primary text-white border-primary"
                    >
                      🛺 {label}
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

        {/* The demo shortcut that set the auth cookie and jumped to the dashboard
            has been removed: it bypassed sign-in entirely. */}
      </div>
    </div>
  )
}
