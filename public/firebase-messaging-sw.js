importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: "AIzaSyCOJ6J5VguFaKjFie07ZddDNPP9lENm1EM",
  authDomain: "rakashi-notifications.firebaseapp.com",
  projectId: "rakashi-notifications",
  storageBucket: "rakashi-notifications.firebasestorage.app",
  messagingSenderId: "334549345938",
  appId: "1:334549345938:web:3db734ed9175a710c7e84b",
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  console.log('Background message:', payload)

  const { title, body } = payload.notification ?? {}

  self.registration.showNotification(title ?? '新しい配送依頼', {
    body: body ?? '依頼が届きました',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data,
    actions: [
      { action: 'accept', title: '承諾' },
      { action: 'reject', title: '拒否' },
    ],
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  clients.openWindow('/dashboard')
})
