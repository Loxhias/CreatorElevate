/* ============================================================================
 *  Creator Elevate — Service Worker
 *  • Cachea el shell estático para uso offline básico.
 *  • Maneja eventos `push` y `notificationclick` para Web Push.
 * ========================================================================= */

const CACHE_NAME = 'ce-shell-v3';
const SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/assets/css/style.css',
    '/assets/js/env.js',
    '/assets/js/supabase.js',
    '/assets/js/api.js',
    '/assets/js/data.js',
    '/assets/js/store.js',
    '/assets/js/main.js',
    '/assets/js/config.js',
    '/assets/js/views/login.js',
    '/assets/js/views/adminDashboard.js',
    '/assets/js/views/managerDashboard.js',
    '/assets/js/views/creatorDashboard.js',
];

// ── Install: pre-cache del shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            // No falla la instalación si algún recurso opcional no se puede cachear.
            Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)))
        )
    );
});

// ── Activate: limpia caches viejos ───────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: stale-while-revalidate para mismo origen ──────────────────────
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(req).then((cached) => {
            const network = fetch(req).then((res) => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
                }
                return res;
            }).catch(() => cached);
            return cached || network;
        })
    );
});

// ── Push: notificación entrante ──────────────────────────────────────────
self.addEventListener('push', (event) => {
    let payload = { title: 'Creator Elevate', body: 'Tienes una novedad' };
    try {
        if (event.data) payload = { ...payload, ...event.data.json() };
    } catch { try { payload.body = event.data.text(); } catch {} }

    const opts = {
        body: payload.body,
        icon: payload.icon || '/assets/icons/icon-192.png',
        badge: payload.badge || '/assets/icons/icon-192.png',
        data: { url: payload.url || '/' },
        vibrate: [120, 60, 120],
        tag: payload.tag || 'creator-elevate',
        renotify: true,
    };
    event.waitUntil(self.registration.showNotification(payload.title, opts));
});

// ── Notification click: abrir/enfocar la app ─────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
            for (const w of wins) {
                if ('focus' in w) { w.focus(); try { w.navigate(targetUrl); } catch {} return; }
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});
