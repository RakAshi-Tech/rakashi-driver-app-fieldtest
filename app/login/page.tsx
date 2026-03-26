"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Truck, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type OtpMethod = "whatsapp" | "sms"
type ScreenState = "phone" | "otp"
type Language = "en" | "hi"

const translations = {
  en: {
    title: "RakAshi Driver",
    subtitle: "Sign in with your phone number",
    phonePlaceholder: "Phone number",
    sendCode: "Send code",
    helperText: "We'll send a one-time code.",
    termsText: "By continuing, you agree to",
    terms: "Terms",
    privacy: "Privacy",
    enterCode: "Enter the 6-digit code sent to",
    resendIn: "Resend in",
    resendCode: "Resend code",
    useInstead: "Use {method} instead",
    continue: "Continue",
    changePhone: "Change phone number",
    demoLogin: "Demo login (skip OTP)",
    invalidCode: "Invalid code. Try again.",
    invalidPhone: "Please enter a valid phone number",
  },
  hi: {
    title: "RakAshi Driver",
    subtitle: "अपने फ़ोन नंबर से साइन इन करें",
    phonePlaceholder: "फ़ोन नंबर",
    sendCode: "कोड भेजें",
    helperText: "हम एक बार उपयोग होने वाला कोड भेजेंगे।",
    termsText: "जारी रखकर आप सहमत हैं",
    terms: "नियम",
    privacy: "गोपनीयता",
    enterCode: "6 अंकों का कोड दर्ज करें जो भेजा गया",
    resendIn: "पुनः भेजें",
    resendCode: "कोड पुनः भेजें",
    useInstead: "{method} का उपयोग करें",
    continue: "जारी रखें",
    changePhone: "फ़ोन नंबर बदलें",
    demoLogin: "डेमो लॉगिन (OTP छोड़ें)",
    invalidCode: "अमान्य कोड। पुनः प्रयास करें।",
    invalidPhone: "कृपया एक वैध फ़ोन नंबर दर्ज करें",
  },
}

export default function LoginPage() {
  const router = useRouter()
  const [phoneNumber, setPhoneNumber] = useState("")
  const [countryCode] = useState("+91")
  const [otpMethod, setOtpMethod] = useState<OtpMethod>("whatsapp")
  const [screenState, setScreenState] = useState<ScreenState>("phone")
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [timer, setTimer] = useState(45)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [language, setLanguage] = useState<Language>("en")
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  const t = translations[language]

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (screenState === "otp" && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [screenState, timer])

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("loggedIn")
    if (isLoggedIn === "true") {
      router.push("/dashboard")
    }
  }, [router])

  const handleSendCode = () => {
    if (phoneNumber.length < 10) {
      setError(t.invalidPhone)
      return
    }

    setIsLoading(true)
    setError("")

    setTimeout(() => {
      setIsLoading(false)
      setScreenState("otp")
      setTimer(45)
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    }, 800)
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)
    setError("")

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  const handleVerifyOtp = () => {
    const otpValue = otp.join("")
    if (otpValue.length !== 6) return

    setIsLoading(true)
    setError("")

    setTimeout(() => {
      setIsLoading(false)
      if (otpValue === "123456") {
        localStorage.setItem("loggedIn", "true")
        router.push("/dashboard")
      } else {
        setError(t.invalidCode)
        setOtp(["", "", "", "", "", ""])
        otpRefs.current[0]?.focus()
      }
    }, 800)
  }

  const handleResendCode = () => {
    if (timer > 0) return
    setTimer(45)
    setOtp(["", "", "", "", "", ""])
    setError("")
  }

  const handleDemoLogin = () => {
    localStorage.setItem("loggedIn", "true")
    router.push("/dashboard")
  }

  const isOtpComplete = otp.every((digit) => digit !== "")
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[390px] min-h-[700px] bg-card rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 text-xs text-muted-foreground">
          <span>9:41</span>
          <div className="flex items-center gap-3">
            <div className="flex bg-secondary rounded-md overflow-hidden text-[10px] font-medium">
              <button
                onClick={() => setLanguage("en")}
                className={`px-2 py-1 transition-colors ${
                  language === "en"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage("hi")}
                className={`px-2 py-1 transition-colors ${
                  language === "hi"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                हिंदी
              </button>
            </div>
            <div className="w-4 h-2 border border-muted-foreground rounded-sm">
              <div className="w-3/4 h-full bg-accent rounded-sm" />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col px-6 py-4">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <Truck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">{t.title}</h1>
            <p className="text-sm text-muted-foreground">{t.subtitle}</p>
          </div>

          {screenState === "phone" ? (
            <>
              <div className="space-y-4 mb-6">
                <div className="flex gap-2">
                  <div className="flex items-center justify-center w-20 h-12 bg-input border border-border rounded-lg text-foreground font-medium">
                    {countryCode}
                  </div>
                  <Input
                    type="tel"
                    placeholder={t.phonePlaceholder}
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
                      setError("")
                    }}
                    className="flex-1 h-12 bg-input border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t.helperText}</p>
              </div>

              <div className="mb-6">
                <div className="flex bg-secondary rounded-lg p-1">
                  <button
                    onClick={() => setOtpMethod("whatsapp")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium transition-all ${
                      otpMethod === "whatsapp"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </button>
                  <button
                    onClick={() => setOtpMethod("sms")}
                    className={`flex-1 py-3 rounded-md text-sm font-medium transition-all ${
                      otpMethod === "sms"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    SMS
                  </button>
                </div>
              </div>

              {error && <p className="text-destructive text-sm text-center mb-4">{error}</p>}

              <Button
                onClick={handleSendCode}
                disabled={isLoading || phoneNumber.length < 10}
                className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  t.sendCode
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-4 mb-6">
                <p className="text-sm text-muted-foreground text-center">
                  {t.enterCode} {countryCode} {phoneNumber}
                </p>

                <div className="flex justify-center gap-2">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        otpRefs.current[index] = el
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className={`w-11 h-14 text-center text-xl font-bold bg-input border-2 rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors ${
                        error ? "border-destructive" : "border-border"
                      }`}
                    />
                  ))}
                </div>

                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t.resendIn} <span className="font-mono text-foreground">{formatTimer(timer)}</span>
                  </p>
                  <button
                    onClick={handleResendCode}
                    disabled={timer > 0}
                    className={`text-sm font-medium ${
                      timer > 0 ? "text-muted-foreground cursor-not-allowed" : "text-primary hover:underline"
                    }`}
                  >
                    {t.resendCode}
                  </button>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <button
                    onClick={() => setOtpMethod(otpMethod === "whatsapp" ? "sms" : "whatsapp")}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {t.useInstead.replace("{method}", otpMethod === "whatsapp" ? "SMS" : "WhatsApp")}
                  </button>
                </div>
              </div>

              {error && <p className="text-destructive text-sm text-center mb-4">{error}</p>}

              <Button
                onClick={handleVerifyOtp}
                disabled={isLoading || !isOtpComplete}
                className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  t.continue
                )}
              </Button>

              <button
                onClick={() => {
                  setScreenState("phone")
                  setOtp(["", "", "", "", "", ""])
                  setError("")
                }}
                className="mt-4 text-sm text-muted-foreground hover:text-foreground text-center"
              >
                ← {t.changePhone}
              </button>
            </>
          )}

          <div className="flex-1" />

          <div className="space-y-4 pb-4">
            <p className="text-xs text-muted-foreground text-center">
              {t.termsText}{" "}
              <span className="text-foreground hover:underline cursor-pointer">{t.terms}</span>
              {" & "}
              <span className="text-foreground hover:underline cursor-pointer">{t.privacy}</span>.
            </p>

            <button
              onClick={handleDemoLogin}
              className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.demoLogin}
            </button>
          </div>
        </div>

        <div className="flex justify-center pb-2">
          <div className="w-32 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
      </div>
    </div>
  )
}