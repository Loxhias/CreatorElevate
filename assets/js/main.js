import { env, isSupabaseConfigured } from './env.js';
import { store } from './store.js';
import { auth, push } from './api.js';
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
    const items = [];
    if (role === 'admin') {
        items.push({ view: 'inicio',          icon: '📊', label: 'Dashboard' });
        items.push({ view: 'creadores',       icon: '👥', label: 'Creadores' });
        items.push({ view: 'notificaciones',  icon: '🔔', label: 'Mensajes' });
    } else if (role === 'creator') {
        items.push({ view: 'inicio',  icon: '📊', label: 'Dashboard' });
        items.push({ view: 'normas',  icon: '📋', label: 'Normas' });
        items.push({ view: 'canales', icon: '📢', label: 'Canales' });
    } else if (role === 'manager') {
        items.push({ view: 'inicio',         icon: '📊', label: 'Panel' });
        items.push({ view: 'mensajes',        icon: '🔔', label: 'Mensajes' });
    } else {
        items.push({ view: 'inicio', icon: '📊', label: 'Panel' });
    }
    items.push({ view: 'capacitaciones', icon: '🎓', label: 'Capacitaciones' });
    items.push({ view: 'eventos',        icon: '📅', label: 'Eventos' });
    items.push({ view: 'perfil',         icon: '👤', label: 'Perfil' });
    return items;
}

async function safeRender(fn, container) {
    try {
        await fn(container);
    } catch (err) {
        console.error('[safeRender]', err);
        container.innerHTML = `
            <div style="padding:3rem; text-align:center; display:flex; flex-direction:column; align-items:center; gap:1.2rem;">
                <div style="font-size:2rem;">⚠️</div>
                <p style="color:var(--danger); font-weight:700;">No se pudo conectar</p>
                <p style="color:var(--text-secondary); font-size:0.85rem; max-width:300px;">
                    ${err?.message?.includes('abort') || err?.message?.includes('connect')
                        ? 'Sin conexión con el servidor. Verifica tu internet e inténtalo de nuevo.'
                        : 'Ocurrió un error inesperado al cargar este panel.'}
                </p>
                <button class="btn btn-primary" onclick="location.reload()">🔄 Reintentar</button>
            </div>`;
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
                        <span class="nav-icon">📲</span>
                        <span style="color:var(--primary-light);">Instalar App</span>
                    </a>
                </nav>

                <div style="margin-top:auto; padding-top:1.5rem; border-top:1px solid var(--glass-border);">
                    <div style="font-size:0.85rem; font-weight:700;">@${user.username}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase;">${role}</div>
                    <button class="btn-logout" style="margin-top:1rem; background:none; border:none; color:var(--danger); cursor:pointer; font-weight:700; font-size:0.8rem;">Cerrar Sesión</button>
                </div>
            </aside>

            <!-- Contenido Principal -->
            <main class="main-content" id="dashboard-content"></main>

            <!-- Bottom Nav (Móvil) -->
            <nav class="bottom-nav">
                ${navHtml}
                <a href="#" class="nav-item btn-pwa-install" style="${installBtnStyle} color:var(--primary-light); font-weight:700;">
                    <span>📲</span><span>Instalar</span>
                </a>
                <a href="#" class="nav-item btn-logout" style="color:var(--danger);">
                    <span>🚪</span><span>Salir</span>
                </a>
            </nav>
        </div>
    `;

    const contentArea = container.querySelector('#dashboard-content');
    safeRender(renderContentFn, contentArea);

    // Badge de mensajes no leídos (managers)
    if (role === 'manager') {
        const userId = store.getCurrentUser()?.id;
        const lastSeen = localStorage.getItem(`inbox_last_seen_${userId || 'anon'}`) || '1970-01-01';
        push.getForUser(userId, 'manager').then(notifications => {
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
                import('./views/notifications.js').then(m => safeRender(m.renderNotificationsView, contentArea));
            }
            else if (view === 'mensajes') {
                import('./views/inbox.js').then(m => safeRender(m.renderInboxView, contentArea));
                // Limpiar badge al abrir
                container.querySelectorAll('.nav-item[data-view="mensajes"] span:not(.nav-icon)').forEach(span => {
                    span.textContent = 'Mensajes';
                });
            }
            else if (view === 'capacitaciones') {
                import('./views/trainings.js').then(m => safeRender(m.renderTrainingsView, contentArea));
            }
            else if (view === 'eventos') {
                import('./views/events.js').then(m => safeRender(m.renderEventsView, contentArea));
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

    await store.init().catch(console.warn);

    auth.onAuthChange(async (session) => {
        const isRecovery = window.location.href.includes('type=recovery');

        if (!session) {
            await store.clear();
            await logoutOneSignalUser();
            if (!isRecovery) appState.navigate('login');
            return;
        }
        await store.refreshProfile();
        const profile = store.getProfile();
        const u = store.getCurrentUser();
        if (profile) identifyOneSignalUser(profile);
        
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
        appState.showToast('En iOS: pulsa el botón "Compartir" (abajo) y luego "Añadir a pantalla de inicio" 📲', 'info');
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

boot();
