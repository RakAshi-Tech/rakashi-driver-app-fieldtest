// Web Push Service Worker (VAPID方式)
// Firebase SDK 不要

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: '🚚 RakAshi', body: event.data.text() }
  }

  const { title, body, type, requestId } = data

  const options = {
    body: body || '配送依頼が届きました',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    data: { type, requestId, url: '/dashboard' },
    actions:
      type === 'new_request'
        ? [
            { action: 'open', title: '確認する' },
            { action: 'dismiss', title: '後で' },
          ]
        : [{ action: 'open', title: '確認する' }],
  }

  event.waitUntil(
    self.registration.showNotification(title || '🚚 RakAshi', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (
            client.url.includes(self.location.origin) &&
            'focus' in client
          ) {
            client.focus()
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              data: event.notification.data,
            })
            return
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      })
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PUSH_RECEIVED') {
    clients.matchAll({ type: 'window' }).then((clientList) => {
      clientList.forEach((client) => {
        client.postMessage({
          type: 'PUSH_MESSAGE',
          payload: event.data.payload,
        })
      })
    })
  }
})
