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

    // === login / registration ===
    experienceYears: 'अनुभव (वर्ष)',

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

    // === driver-profile-card ===
    accepting: 'स्वीकार कर रहे हैं',
    offline: 'ऑफलाइन',
    deliveries: 'डिलीवरी',
    experience: 'अनुभव',
    onTime: 'समय पर',
    responseRateLabel: 'प्रतिक्रिया',
    avgDelivery: 'औसत डिलीवरी:',

    // === trust-score-card ===
    trustScore: 'ट्रस्ट स्कोर',
    improving: 'सुधार हो रहा है',
    stable: 'स्थिर',
    declining: 'घट रहा है',
    trustScoreDesc: 'पूर्ण डिलीवरी, समय पर दर और विवाद इतिहास के आधार पर',
    trustScoreBenefit: 'उच्च स्कोर = अधिक प्राथमिकता काम और तेज़ भुगतान',
    newRank: 'नया',
    standardRank: 'स्टैंडर्ड',
    subLeaderRank: 'सब-लीडर',
    leaderRank: 'लीडर',

    // === today-jobs-list ===
    todayJobs: 'आज के काम',
    noJobsToday: 'आज कोई डिलीवरी नहीं',
    viewAll: 'सब देखें',
    pending: 'लंबित',
    inProgress: 'चल रहा है',
    done: 'हो गया',
    items: 'आइटम',
    block: 'ब्लॉक',

    // === completed-jobs-list ===
    completedJobs: 'पूर्ण काम',

    // === delivery-screen ===
    destinationArrived: 'गंतव्य पर पहुंच गए!',

    // === confirm-arrival ===
    callReceiver: 'प्राप्तकर्ता को कॉल करें',
    confirmArrival: 'आगमन की पुष्टि करें',
    confirmedArrival: 'पुष्टि हो गई',

    // === entrance-photo ===
    matchEntrance: 'यह प्रवेश द्वार मिलाएं',
    streetViewUnavailable: 'Street View उपलब्ध नहीं',

    // === direction-arrow ===
    mAhead: 'मीटर आगे',
    doorLevelPrecision: 'दरवाज़े की सटीकता',

    // === local-instructions ===
    nextStep: 'अगला कदम',
    routeLoading: 'मार्ग प्राप्त हो रहा है...',
    routeError: 'मार्ग प्राप्त नहीं हो सका',

    // === confidence-bar ===
    routeConfidence: 'मार्ग विश्वसनीयता',
    highReliability: 'उच्च विश्वसनीयता',
    arrivedSuccessfully: 'सफलतापूर्वक पहुंचे',
    times: 'बार',

    // === unloading-status ===
    arrivalConfirmed: 'आगमन की पुष्टि',
    beginUnloading: 'सामान उतारना शुरू करें',
    arrivalStep: 'आगमन',
    unloadingStep: 'उतराई',
    completedStep: 'पूर्ण',
    readyToUnload: 'उतारने के लिए तैयार',
    tapToStart: 'उतारना शुरू करने के लिए नीचे बटन दबाएं',
    unloadingTime: 'उतराई का समय',
    unloadingComplete: 'उतराई पूर्ण',
    totalTime: 'कुल समय:',
    shipperNotifiedMsg: 'शिपर को सूचित किया गया है',
    deliveryLocationLabel: 'डिलीवरी स्थान',
    shipperLabel: 'शिपर',
    quantityDelivered: 'डिलीवर की गई मात्रा',
    trustScoreProgress: 'ट्रस्ट स्कोर प्रगति',
    onTimeDeliveriesBoost: 'समय पर डिलीवरी आपके ट्रस्ट स्कोर को बढ़ाती है और बेहतर काम अनलॉक करती है।',
    startUnloading: 'अनलोडिंग शुरू करें',
    completeUnloading: 'अनलोडिंग पूर्ण करें',
    notifyShipper: 'शिपर को सूचित करें',
    shipperNotifiedConfirm: 'शिपर को सूचित किया गया',
    deliveryReportSent: 'शिपर को रिपोर्ट भेजी गई! शाबाश! 🎉',

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

    // === login / registration ===
    experienceYears: 'Years of Experience',

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

    // === driver-profile-card ===
    accepting: 'Accepting',
    offline: 'Offline',
    deliveries: 'Deliveries',
    experience: 'Experience',
    onTime: 'On-time',
    responseRateLabel: 'Response',
    avgDelivery: 'Avg delivery:',

    // === trust-score-card ===
    trustScore: 'Trust Score',
    improving: 'improving',
    stable: 'stable',
    declining: 'declining',
    trustScoreDesc: 'Based on completed deliveries, on-time rate & dispute history',
    trustScoreBenefit: 'Higher score = more priority jobs & faster payouts',
    newRank: 'New',
    standardRank: 'Standard',
    subLeaderRank: 'Sub-Leader',
    leaderRank: 'Leader',

    // === today-jobs-list ===
    todayJobs: "Today's Jobs",
    noJobsToday: 'No deliveries today',
    viewAll: 'View all',
    pending: 'Pending',
    inProgress: 'In Progress',
    done: 'Done',
    items: 'items',
    block: 'Block',

    // === completed-jobs-list ===
    completedJobs: 'Completed Jobs',

    // === delivery-screen ===
    destinationArrived: 'Destination Arrived!',

    // === confirm-arrival ===
    callReceiver: 'Call Receiver',
    confirmArrival: 'CONFIRM ARRIVAL',
    confirmedArrival: 'CONFIRMED',

    // === entrance-photo ===
    matchEntrance: 'Match this entrance',
    streetViewUnavailable: 'Street View unavailable',

    // === direction-arrow ===
    mAhead: 'm ahead',
    doorLevelPrecision: 'Door-level precision',

    // === local-instructions ===
    nextStep: 'Next Step',
    routeLoading: 'Getting route...',
    routeError: 'Could not get route',

    // === confidence-bar ===
    routeConfidence: 'Route Confidence',
    highReliability: 'High Reliability',
    arrivedSuccessfully: 'Arrived Successfully',
    times: 'times',

    // === unloading-status ===
    arrivalConfirmed: 'Arrival confirmed',
    beginUnloading: 'Begin unloading the goods',
    arrivalStep: 'Arrival',
    unloadingStep: 'Unloading',
    completedStep: 'Completed',
    readyToUnload: 'Ready to Unload',
    tapToStart: 'Tap the button below to start unloading',
    unloadingTime: 'Unloading time',
    unloadingComplete: 'Unloading Complete',
    totalTime: 'Total time:',
    shipperNotifiedMsg: 'Shipper has been notified',
    deliveryLocationLabel: 'Delivery location',
    shipperLabel: 'Shipper',
    quantityDelivered: 'Quantity delivered',
    trustScoreProgress: 'Trust Score Progress',
    onTimeDeliveriesBoost: 'On-time deliveries increase your trust score and unlock better jobs.',
    startUnloading: 'Start Unloading',
    completeUnloading: 'Complete Unloading',
    notifyShipper: 'Notify shipper',
    shipperNotifiedConfirm: 'Shipper notified',
    deliveryReportSent: 'Delivery report sent to shipper! Great work! 🎉',

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
    if (saved === 'en') {
      setLangState('en')
    } else {
      setLangState('hi')
      localStorage.setItem('lang', 'hi')
    }
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
