self.addEventListener('push', function(event) {
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/assets/img/logo.png', // Asegúrate de que esta ruta sea correcta
            badge: '/assets/img/badge.png',
            data: {
                url: data.url || '/'
            },
            vibrate: [100, 50, 100],
            actions: [
                { action: 'open', title: 'Ver ahora' }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    } catch (e) {
        console.error('Error al procesar notificación push:', e);
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    const urlToOpen = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
