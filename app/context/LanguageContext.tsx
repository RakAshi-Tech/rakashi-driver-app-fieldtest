'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Lang = 'hi' | 'en'

interface LanguageContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string) => string
}

const translations: Record<Lang, Record<string, string>> = {
  hi: {
    // === 共通 ===
    appName: 'RakAshi',
    langHi: 'हिंदी',
    langEn: 'EN',

    // === ホーム / ダッシュボード ===
    home: 'होम',
    dashboard: 'डैशबोर्ड',
    startDelivery: 'डिलीवरी शुरू करें',
    history: 'इतिहास',
    settings: 'सेटिंग्स',
    logout: 'लॉग आउट',

    // === set-destination ===
    setDestination: 'गंतव्य सेट करें',
    searchPlaceholder: 'गंतव्य खोजें...',
    currentLocation: 'वर्तमान स्थान',
    tapMapInstruction: 'मानचित्र पर टैप करके गंतव्य चुनें',
    setAsDestination: 'गंतव्य के रूप में सेट करें',
    distance: 'दूरी',
    eta: 'पहुंचने का समय',
    calculating: 'गणना हो रही है...',
    gettingLocation: 'स्थान प्राप्त हो रहा है...',
    destinationSet: 'गंतव्य सेट हो गया',
    walkingTime: 'पैदल समय',
    noLocationSelected: 'कोई स्थान नहीं चुना गया',

    // === tracking ===
    liveTracking: 'लाइव ट्रैकिंग',
    mapTab: 'नक्शा',
    satelliteTab: 'सैटेलाइट',
    livePosition: 'लाइव स्थिति',
    moving: 'चल रहा है',
    stopped: 'रुका हुआ',
    speed: 'गति',
    gpsActive: 'GPS रिकॉर्डिंग सक्रिय',
    gpsPaused: 'GPS रिकॉर्डिंग रुकी हुई है',
    pause: 'रोकें',
    resume: 'फिर शुरू करें',
    deliveryStatus: 'डिलीवरी स्थिति',
    start: 'शुरू',
    near: 'नजदीक',
    arrived: 'पहुंच गए',
    autoDetecting: '● गंतव्य स्वतः पहचान (30m)...',
    atDestination: 'मैं गंतव्य पर हूँ',
    gpsNote: '※ केवल तब उपयोग करें जब GPS आगमन का पता न लगा सके',
    preparing: 'तैयारी हो रही है',
    enRoute: 'रास्ते में',
    approaching: 'पास आ रहे हैं',
    arrivedStatus: 'पहुंच गए',
    routeDeviation: '⚠️ मार्ग से भटक गए। पुनः गणना हो रही है...',
    arrivedOverlay: '🎉 गंतव्य पर पहुंच गए!',
    completeDelivery: 'डिलीवरी पूरी करें',
    loadingMap: 'नक्शा लोड हो रहा है...',

    // === ログイン ===
    login: 'लॉग इन',
    email: 'ईमेल',
    password: 'पासवर्ड',
    loginButton: 'लॉग इन करें',
    noAccount: 'खाता नहीं है?',
    signUp: 'साइन अप करें',

    // === dashboard ===
    setDestinationBtn: 'गंतव्य सेट करें',
    startNextJob: 'अगला काम शुरू करें',
    noPendingJobs: 'कोई काम नहीं है',

    // === job ===
    jobDetails: 'काम का विवरण',
    waybillSaved: 'वेबिल सहेजा गया!',
    jobSummary: 'काम का सारांश',
    startDeliveryBtn: 'डिलीवरी शुरू करें',
    scanAnotherWaybill: 'दूसरा वेबिल स्कैन करें',
    backToHome: 'होम पर वापस जाएं',
    deliveryLocation: 'डिलीवरी स्थान',

    // === completion ===
    backToDashboard: 'डैशबोर्ड पर वापस जाएं',

    // === エラー・共通メッセージ ===
    loading: 'लोड हो रहा है...',
    error: 'त्रुटि',
    retry: 'पुनः प्रयास करें',
    cancel: 'रद्द करें',
    confirm: 'पुष्टि करें',
    save: 'सहेजें',
    back: 'वापस',
  },
  en: {
    // === 共通 ===
    appName: 'RakAshi',
    langHi: 'हिंदी',
    langEn: 'EN',

    // === ホーム / ダッシュボード ===
    home: 'Home',
    dashboard: 'Dashboard',
    startDelivery: 'Start Delivery',
    history: 'History',
    settings: 'Settings',
    logout: 'Logout',

    // === set-destination ===
    setDestination: 'Set Destination',
    searchPlaceholder: 'Search destination...',
    currentLocation: 'Current Location',
    tapMapInstruction: 'Tap on the map to select destination',
    setAsDestination: 'Set as Destination',
    distance: 'Distance',
    eta: 'ETA',
    calculating: 'Calculating...',
    gettingLocation: 'Getting location...',
    destinationSet: 'Destination set',
    walkingTime: 'Walking time',
    noLocationSelected: 'No location selected',

    // === tracking ===
    liveTracking: 'Live Tracking',
    mapTab: 'Map',
    satelliteTab: 'Satellite',
    livePosition: 'Live Position',
    moving: 'MOVING',
    stopped: 'STOPPED',
    speed: 'SPEED',
    gpsActive: 'GPS RECORDING ACTIVE',
    gpsPaused: 'GPS RECORDING PAUSED',
    pause: 'Pause',
    resume: 'Resume',
    deliveryStatus: 'DELIVERY STATUS',
    start: 'Start',
    near: 'Near',
    arrived: 'Arrived',
    autoDetecting: '● Auto-detecting arrival (30m)...',
    atDestination: "I'm at the destination",
    gpsNote: '※ Use only when GPS cannot detect arrival',
    preparing: 'Preparing',
    enRoute: 'En Route',
    approaching: 'Approaching',
    arrivedStatus: 'Arrived',
    routeDeviation: '⚠️ Route Deviation Detected. Recalculating...',
    arrivedOverlay: '🎉 Arrived at Destination!',
    completeDelivery: 'Complete Delivery',
    loadingMap: 'Loading map…',

    // === ログイン ===
    login: 'Login',
    email: 'Email',
    password: 'Password',
    loginButton: 'Login',
    noAccount: "Don't have an account?",
    signUp: 'Sign Up',

    // === dashboard ===
    setDestinationBtn: 'Set Destination',
    startNextJob: 'Start next job',
    noPendingJobs: 'No pending jobs',

    // === job ===
    jobDetails: 'Job Details',
    waybillSaved: 'Waybill Saved!',
    jobSummary: 'Job Summary',
    startDeliveryBtn: 'Start Delivery',
    scanAnotherWaybill: 'Scan Another Waybill',
    backToHome: 'Back to Home',
    deliveryLocation: 'Delivery location',

    // === completion ===
    backToDashboard: 'Back to Dashboard',

    // === エラー・共通メッセージ ===
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    back: 'Back',
  }
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'hi',
  setLang: () => {},
  t: (key) => key,
})

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>('hi')

  useEffect(() => {
    const saved = localStorage.getItem('lang') as Lang
    if (saved === 'hi' || saved === 'en') setLangState(saved)
  }, [])

  const setLang = (newLang: Lang) => {
    setLangState(newLang)
    localStorage.setItem('lang', newLang)
  }

  const t = (key: string): string => {
    return translations[lang][key] ?? key
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLang = () => useContext(LanguageContext)
