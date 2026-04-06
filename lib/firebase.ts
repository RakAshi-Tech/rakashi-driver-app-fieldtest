'use client'

// Web Push（VAPID）方式
// Firebase SDK 不要

export const requestNotificationPermission = async (): Promise<string | null> => {
  try {
    if (typeof window === 'undefined') return null
    if (!('Notification' in window)) return null
    if (!('serviceWorker' in navigator)) return null
    if (!('PushManager' in window)) return null

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const registration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      { scope: '/' }
    )

    await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!

      const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
        const base64 = (base64String + padding)
          .replace(/-/g, '+')
          .replace(/_/g, '/')
        const rawData = window.atob(base64)
        const outputArray = new Uint8Array(rawData.length)
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i)
        }
        return outputArray
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
    }

    return JSON.stringify(subscription.toJSON())
  } catch (err) {
    console.error('Web Push setup error:', err)
    return null
  }
}

export const onMessage = (callback: (payload: unknown) => void): void => {
  if (typeof window === 'undefined') return
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.type === 'PUSH_MESSAGE') {
      callback(event.data.payload)
    }
  })
}
