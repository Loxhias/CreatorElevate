import { env, isSupabaseConfigured } from './env.js';
import { store } from './store.js';
import { auth, push, profiles } from './api.js';
import { setupLocale, detectAgency, t } from './i18n.js';
import { renderLogin } from './views/login.js';
import { renderAdminDashboard, renderCreatorsList } from './views/adminDashboard.js';
import { renderManagerDashboard } from './views/managerDashboard.js';
import { renderCreatorDashboard } from './views/creatorDashboard.js';
import { renderProfile } from './views/profile.js';
import { renderNormas } from './views/normas.js';
import { renderCanales } from './views/canales.js';

export const appState = {
    navigate: (route) => {
        const app = document.getElementById('app');
        app.innerHTML = '';
        switch (route) {
            case 'login':   renderLogin(app); break;
            case 'admin':   renderDashboardLayout(app, renderAdminDashboard, 'admin'); break;
            case 'manager': renderDashboardLayout(app, renderManagerDashboard, 'manager'); break;
            case 'creator': renderDashboardLayout(app, renderCreatorDashboard, 'creator'); break;
            case 'notifications': renderDashboardLayout(app, renderNotificationsView, 'admin'); break;
            default:        renderLogin(app);
        }
    },

    // Navega a una sub-vista dentro del dashboard ya montado (para deep links desde inbox/push).
    navigateTo: (view) => {
        const navLink = document.querySelector(`.nav-item[data-view="${view}"]`);
        if (navLink) navLink.click();
    },

    showToast: (message, type = 'success') => {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `glass-panel toast-msg ${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

function getNavItems(role) {
    const pi = (name) => `<i class="ph-bold ph-${name}"></i>`;
    const items = [];
    if (role === 'admin') {
        items.push({ view: 'inicio',         icon: pi('chart-bar'),        label: 'Dashboard' });
        items.push({ view: 'creadores',      icon: pi('users'),            label: 'Creadores' });
        items.push({ view: 'canales',        icon: pi('megaphone-simple'), label: 'Canales' });
        items.push({ view: 'notificaciones', icon: pi('bell'),             label: 'Mensajes' });
        items.push({ view: 'puntos',         icon: pi('star'),             label: 'Puntos' });
    } else if (role === 'creator') {
        items.push({ view: 'inicio',      icon: pi('chart-bar'),        label: t('nav.dashboard') });
        items.push({ view: 'mensajes',    icon: pi('bell'),             label: t('nav.messages') });
        items.push({ view: 'misiones',    icon: pi('target'),           label: 'Misiones' });
        items.push({ view: 'mis-puntos',  icon: pi('star'),             label: 'Mis Puntos' });
        items.push({ view: 'normas',      icon: pi('clipboard-text'),   label: t('nav.rules') });
        items.push({ view: 'canales',     icon: pi('megaphone-simple'), label: t('nav.channels') });
    } else if (role === 'manager') {
        items.push({ view: 'inicio',   icon: pi('chart-bar'), label: 'Panel' });
        items.push({ view: 'mensajes', icon: pi('bell'),      label: 'Mensajes' });
        const managerProfile = store.getProfile?.();
        if (managerProfile?.tiktok_username?.trim()) {
            items.push({ view: 'mis-metricas', icon: pi('video-camera'), label: 'Mis métricas' });
        }
    } else {
        items.push({ view: 'inicio', icon: pi('chart-bar'), label: 'Panel' });
    }
    const isCreator = role === 'creator';
    items.push({ view: 'capacitaciones', icon: pi('graduation-cap'),  label: isCreator ? t('nav.trainings') : 'Capacitaciones' });
    items.push({ view: 'eventos',        icon: pi('calendar-blank'),  label: isCreator ? t('nav.events')    : 'Eventos' });
    items.push({ view: 'perfil',         icon: pi('user'),            label: isCreator ? t('nav.profile')   : 'Perfil' });
    return items;
}

async function safeRender(fn, container) {
    try {
        await fn(container);
    } catch (err) {
        console.error('[safeRender] error en', fn?.name || '?', err);
        container.innerHTML = `
            <div style="padding:3rem; text-align:center; display:flex; flex-direction:column; align-items:center; gap:1.2rem;">
                <div style="font-size:2rem;">⚠️</div>
                <p style="color:var(--danger); font-weight:700;">No se pudo cargar este panel</p>
                <p style="color:var(--text-secondary); font-size:0.85rem; max-width:300px;">
                    ${err?.message?.includes('abort') || err?.message?.includes('connect')
                        ? 'Sin conexión con el servidor. Verifica tu internet e inténtalo de nuevo.'
                        : 'Ocurrió un error inesperado al cargar este panel.'}
                </p>
                <code style="font-size:0.7rem;color:var(--text-muted);word-break:break-all;max-width:340px;">${err?.message || ''}</code>
                <button class="btn btn-primary" onclick="location.reload()">🔄 Reintentar</button>
            </div>`;
    }
}

// Carga dinámica de módulo con log claro si falla (500, red, etc.)
async function safeImport(path, container) {
    try {
        console.log('[import] cargando', path);
        const mod = await import(path);
        console.log('[import] OK', path);
        return mod;
    } catch (err) {
        console.error('[import] FALLÓ', path, err);
        if (container) {
            container.innerHTML = `
                <div style="padding:3rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.2rem;">
                    <div style="font-size:2rem;">⚠️</div>
                    <p style="color:var(--danger);font-weight:700;">No se pudo cargar el módulo</p>
                    <code style="font-size:0.7rem;color:var(--text-muted);word-break:break-all;max-width:340px;">${path}<br>${err?.message || ''}</code>
                    <button class="btn btn-primary" onclick="location.reload()">🔄 Reintentar</button>
                </div>`;
        }
        return null;
    }
}

function renderDashboardLayout(container, renderContentFn, role) {
    const user = store.getCurrentUser();
    const navItems = getNavItems(role);

    const navHtml = navItems.map(item => `
        <a href="#" class="nav-item ${item.view === 'inicio' ? 'active' : ''}" data-view="${item.view}">
            <span class="nav-icon">${item.icon}</span>
            <span>${item.label}</span>
        </a>
    `).join('');

    const installBtnStyle = deferredPrompt ? 'display:flex;' : 'display:none;';

    container.innerHTML = `
        <div class="app-shell animate-fadeIn">
            <!-- Sidebar (Escritorio) -->
            <aside class="sidebar">
                <div style="margin-bottom:2.5rem; display:flex; align-items:center; gap:0.8rem;">
                    <img src="/iconos/logo_morado.png" alt="Logo" style="width:32px; height:32px; object-fit:contain;">
                    <span style="font-weight:800; font-size:1.1rem;">Creator Elevate</span>
                </div>
                
                <nav style="display:flex; flex-direction:column; gap:0.4rem; flex:1;">
                    ${navHtml}
                    <!-- Botón de Instalación (Sidebar) -->
                    <a href="#" class="nav-item btn-pwa-install" style="${installBtnStyle} margin-top:1rem; border:1px dashed var(--primary); border-radius:var(--radius-md); background:rgba(124,110,247,0.05);">
                        <span class="nav-icon"><i class="ph-bold ph-device-mobile"></i></span>
                        <span style="color:var(--primary-light);">${t('nav.install')}</span>
                    </a>
                </nav>

                <div style="margin-top:auto; padding-top:1.5rem; border-top:1px solid var(--glass-border);">
                    <div style="font-size:0.85rem; font-weight:700;">@${user.username}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">${role}</div>
                    <button class="btn-logout" style="margin-top:1rem; background:none; border:none; color:var(--danger); cursor:pointer; font-weight:700; font-size:0.8rem;">${t('nav.logout')}</button>
                </div>
            </aside>

            <!-- Contenido Principal -->
            <main class="main-content" id="dashboard-content"></main>

            <!-- Bottom Nav (Móvil) -->
            <nav class="bottom-nav">
                ${navHtml}
                <a href="#" class="nav-item btn-pwa-install" style="${installBtnStyle} color:var(--primary-light); font-weight:700;">
                    <span><i class="ph-bold ph-device-mobile"></i></span><span>${t('nav.install_mob')}</span>
                </a>
                <a href="#" class="nav-item btn-logout" style="color:var(--danger);">
                    <span>🚪</span><span>${t('nav.logout_mob')}</span>
                </a>
            </nav>
        </div>
    `;

    const contentArea = container.querySelector('#dashboard-content');
    safeRender(renderContentFn, contentArea);

    // Badge de mensajes no leídos (managers y creadores)
    if (role === 'manager' || role === 'creator') {
        const userId = store.getCurrentUser()?.id;
        const lastSeen = localStorage.getItem(`inbox_last_seen_${userId || 'anon'}`) || '1970-01-01';
        push.getForUser(userId, role).then(notifications => {
            const unread = notifications.filter(n => n.sent_at > lastSeen).length;
            if (!unread) return;
            const badgeHtml = `<span style="background:var(--danger);color:#fff;border-radius:999px;font-size:0.58rem;font-weight:800;padding:0.05rem 0.35rem;margin-left:0.3rem;vertical-align:middle;display:inline-block;">${unread > 9 ? '9+' : unread}</span>`;
            container.querySelectorAll('.nav-item[data-view="mensajes"]').forEach(el => {
                const label = el.querySelector('span:not(.nav-icon)');
                if (label) label.innerHTML = `Mensajes ${badgeHtml}`;
            });
        }).catch(() => {});
    }

    // Eventos de Instalación
    container.querySelectorAll('.btn-pwa-install').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            window.installPWA();
        };
    });

    // Eventos de Navegación
    container.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            
            container.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
            
            if (view === 'inicio') safeRender(renderContentFn, contentArea);
            else if (view === 'normas') safeRender(renderNormas, contentArea);
            else if (view === 'canales') safeRender(renderCanales, contentArea);
            else if (view === 'creadores') safeRender(renderCreatorsList, contentArea);
            else if (view === 'notificaciones') {
                safeImport('./views/notifications.js', contentArea).then(m => m && safeRender(m.renderNotificationsView, contentArea));
            }
            else if (view === 'mensajes') {
                safeImport('./views/inbox.js', contentArea).then(m => m && safeRender(m.renderInboxView, contentArea));
                container.querySelectorAll('.nav-item[data-view="mensajes"] span:not(.nav-icon)').forEach(span => {
                    span.textContent = t('nav.messages');
                });
            }
            else if (view === 'mis-metricas') {
                safeImport('./views/creatorDashboard.js', contentArea).then(m => m && safeRender(m.renderCreatorDashboard, contentArea));
            }
            else if (view === 'misiones') {
                safeImport('./views/missions.js', contentArea).then(m => m && safeRender(m.renderMissionsView, contentArea));
            }
            else if (view === 'misiones-admin') {
                safeImport('./views/missionsAdmin.js', contentArea).then(m => m && safeRender(m.renderMissionsAdmin, contentArea));
            }
            else if (view === 'mis-puntos') {
                safeImport('./views/points.js', contentArea).then(m => m && safeRender(m.renderPointsView, contentArea));
            }
            else if (view === 'puntos') {
                safeImport('./views/pointsAdmin.js', contentArea).then(m => m && safeRender(m.renderPointsAdmin, contentArea));
            }
            else if (view === 'capacitaciones') {
                safeImport('./views/trainings.js', contentArea).then(m => m && safeRender(m.renderTrainingsView, contentArea));
            }
            else if (view === 'eventos') {
                safeImport('./views/events.js', contentArea).then(m => m && safeRender(m.renderEventsView, contentArea));
            }
            else if (view === 'perfil') safeRender(renderProfile, contentArea);
        };
    });

    container.querySelectorAll('.btn-logout').forEach(btn => {
        btn.onclick = async () => {
            if (isSupabaseConfigured) { await auth.signOut(); await store.clear(); }
            else { store.logoutDemo(); }
            appState.navigate('login');
        };
    });

    // Deep link desde push notification: ?goto=X en la URL
    const gotoView = new URLSearchParams(location.search).get('goto');
    if (gotoView) {
        history.replaceState(null, '', location.pathname);
        const navLink = container.querySelector(`.nav-item[data-view="${gotoView}"]`);
        if (navLink) setTimeout(() => navLink.click(), 0);
    }
}


/**
 * Identifica al usuario en OneSignal para que los envíos por external_id
 * y los filtros por tag (role) lleguen al dispositivo correcto.
 */
async function identifyOneSignalUser(profile) {
    if (!profile || !window.OneSignalReady) return;
    try {
        const OneSignal = await window.OneSignalReady;
        if (!OneSignal) return;

        await OneSignal.login(String(profile.id));

        if (profile.role)             OneSignal.User.addTag('role', String(profile.role));
        if (profile.tiktok_username)  OneSignal.User.addTag('tiktok_username', String(profile.tiktok_username));
        if (profile.manager_id)       OneSignal.User.addTag('manager_id', String(profile.manager_id));

        // Pedimos permiso solo si aún no se ha decidido (evita prompt repetido al usuario).
        if (OneSignal.Notifications && OneSignal.Notifications.permission === false) {
            try { await OneSignal.Notifications.requestPermission(); } catch {}
        }
    } catch (err) {
        console.warn('[OneSignal] identify falló:', err);
    }
}

async function logoutOneSignalUser() {
    if (!window.OneSignalReady) return;
    try {
        const OneSignal = await window.OneSignalReady;
        if (OneSignal && typeof OneSignal.logout === 'function') await OneSignal.logout();
    } catch (err) {
        console.warn('[OneSignal] logout falló:', err);
    }
}

// ── PWA Install Logic ──────────────────────────────────────────────────────
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Disparamos un evento custom para que la UI sepa que puede mostrar el botón
    window.dispatchEvent(new CustomEvent('pwa-installable'));
});

async function boot() {
    // Cuando la notificación tiene URL externa, la abrimos aquí en lugar de
    // dejar que el service worker la abra directamente (lo cual en Android
    // dispara App Links y manda al Play Store si la app no está instalada).
    const openextParam = new URLSearchParams(location.search).get('openext');
    if (openextParam) {
        try {
            const decoded = decodeURIComponent(openextParam);
            if (decoded.startsWith('https://')) {
                history.replaceState(null, '', location.pathname);
                window.open(decoded, '_blank', 'noopener,noreferrer');
            }
        } catch {}
    }

    const app = document.getElementById('app');
    app.innerHTML = `<div style="height:100vh;display:flex;align-items:center;justify-content:center;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:1.2rem;">
            <div class="skel" style="width:44px;height:44px;border-radius:10px;"></div>
            <div class="skel" style="width:160px;height:14px;"></div>
            <div class="skel" style="width:100px;height:10px;opacity:0.5;"></div>
        </div>
    </div>`;

    // Escuchar el evento de instalabilidad para refrescar la UI si es necesario
    window.addEventListener('pwa-installable', () => {
        const installBtn = document.querySelectorAll('.btn-pwa-install');
        installBtn.forEach(btn => btn.style.display = 'flex');
    });

    // Limpiamos Service Workers antiguos PERO conservamos el de OneSignal:
    // desregistrarlo en cada arranque rompe la suscripción push y deja errores en bucle.
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                const scriptURL =
                    registration.active?.scriptURL    ||
                    registration.installing?.scriptURL ||
                    registration.waiting?.scriptURL    || '';
                if (scriptURL.includes('OneSignalSDKWorker')) continue;
                await registration.unregister();
                console.log('SW antiguo eliminado:', scriptURL);
            }
        } catch (e) { console.warn('Limpieza de SW falló:', e); }
    }

    document.title = 'Creator Elevate';

    await store.init().catch(console.warn);

    auth.onAuthChange(async (session) => {
        const isRecovery = window.location.href.includes('type=recovery');

        if (!session) {
            await store.clear();
            await logoutOneSignalUser();
            if (!isRecovery) appState.navigate('login');
            return;
        }

        // Skip re-fetching + re-rendering if store.init() already booted this user.
        // onAuthChange fires immediately on registration (INITIAL_SESSION), which would
        // cause a second full dashboard render right after init(). Guard against that.
        const alreadyBooted = store.getProfile()?.id === session.user.id;
        if (alreadyBooted) return; // Token refresh silencioso — no re-renderizar ni re-identificar

        await store.refreshProfile();
        const profile = store.getProfile();
        const u = store.getCurrentUser();
        if (profile) identifyOneSignalUser(profile);

        // Auto-assign agency from browser locale on first login per device
        if (profile?.id && profile.role === 'creator') {
            const agencyFlag = `ce_agency_set_${profile.id}`;
            if (!localStorage.getItem(agencyFlag)) {
                try {
                    await profiles.setAgency(profile.id, detectAgency());
                    localStorage.setItem(agencyFlag, '1');
                } catch {}
            }
        }

        // Si estamos en flujo de recuperación de contraseña, NO navegamos al dashboard
        // para permitir que el usuario vea el formulario de "Nueva Contraseña".
        if (u && !isRecovery) appState.navigate(u.role);
    });

    // Si ya había sesión cargada en store.init(), identificamos también al boot.
    const profile = store.getProfile();
    if (profile) identifyOneSignalUser(profile);

    const user = store.getCurrentUser();
    const isRecovery = window.location.href.includes('type=recovery');
    appState.navigate(user && !isRecovery ? user.role : 'login');
}

// Función global para disparar el prompt (llamada desde los botones)
window.installPWA = async () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (isIOS && !isStandalone) {
        appState.showToast(t('nav.install_ios'), 'info');
        return;
    }

    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        deferredPrompt = null;
        document.querySelectorAll('.btn-pwa-install').forEach(btn => btn.style.display = 'none');
    }
};

// Al arrancar, si es iOS y no está instalada, mostramos el botón
window.addEventListener('load', () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isIOS && !isStandalone) {
        const installBtn = document.querySelectorAll('.btn-pwa-install');
        installBtn.forEach(btn => btn.style.display = 'flex');
    }
});

setupLocale();
boot();
