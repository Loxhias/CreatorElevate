/**
 * Cliente Web Push — pide permiso, registra suscripción y la guarda en Supabase.
 * Llamar `ensurePushSubscription()` después del login.
 */
import { env, isPushConfigured } from './env.js';
import { push } from './api.js';

function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
}

export async function ensurePushSubscription() {
    if (!isPushConfigured)                    return { ok: false, reason: 'no_vapid' };
    if (!('serviceWorker' in navigator))      return { ok: false, reason: 'no_sw' };
    if (!('PushManager' in window))           return { ok: false, reason: 'no_push' };
    if (!('Notification' in window))          return { ok: false, reason: 'no_notif' };

    if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
    if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return { ok: false, reason: 'not_granted' };
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(env.VAPID_PUBLIC_KEY),
        });
    }
    try {
        await push.saveSubscription(sub);
        return { ok: true, subscription: sub };
    } catch (err) {
        console.warn('No se pudo guardar la suscripción push:', err);
        return { ok: false, reason: 'save_failed', error: err };
    }
}

export async function unsubscribePush() {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
        try { await push.deleteSubscription(sub.endpoint); } catch {}
        await sub.unsubscribe();
    }
}
