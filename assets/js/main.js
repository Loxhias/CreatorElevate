import { env, isSupabaseConfigured } from './env.js';
import { store } from './store.js';
import { auth, push } from './api.js';
import { renderLogin } from './views/login.js';
import { renderAdminDashboard, renderCreatorsList } from './views/adminDashboard.js';
import { renderManagerDashboard } from './views/managerDashboard.js';
import { renderCreatorDashboard } from './views/creatorDashboard.js';
import { renderProfile } from './views/profile.js';

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
        items.push({ view: 'inicio', icon: '📊', label: 'Admin Dashboard' });
        items.push({ view: 'creadores', icon: '👥', label: 'Creadores' });
        items.push({ view: 'notificaciones', icon: '🔔', label: 'Notificaciones' });
    } else if (role === 'creator') {
        items.push({ view: 'inicio', icon: '📊', label: 'Dashboard' });
        items.push({ view: 'normas', icon: '📋', label: 'Normas' });
        items.push({ view: 'canales', icon: '📢', label: 'Canales' });
    } else {
        items.push({ view: 'inicio', icon: '📊', label: 'Panel' });
    }
    items.push({ view: 'perfil', icon: '👤', label: 'Mi Perfil' });
    return items;
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

    container.innerHTML = `
        <div class="app-shell animate-fadeIn">
            <!-- Sidebar (Escritorio) -->
            <aside class="sidebar">
                <div style="margin-bottom:2.5rem; display:flex; align-items:center; gap:0.8rem;">
                    <div style="width:36px; height:36px; background:var(--primary); border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:900;">⚡</div>
                    <span style="font-weight:800; font-size:1.1rem;">Creator Elevate</span>
                </div>
                
                <nav style="display:flex; flex-direction:column; gap:0.4rem; flex:1;">
                    ${navHtml}
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
                <a href="#" class="nav-item btn-logout" style="color:var(--danger);">
                    <span>🚪</span><span>Salir</span>
                </a>
            </nav>
        </div>
    `;

    const contentArea = container.querySelector('#dashboard-content');
    renderContentFn(contentArea);

    // Eventos de Navegación
    container.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            
            container.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
            
            if (view === 'inicio') renderContentFn(contentArea);
            else if (view === 'normas') renderNormas(contentArea);
            else if (view === 'canales') renderCanales(contentArea);
            else if (view === 'creadores') renderCreatorsList(contentArea);
            else if (view === 'notificaciones') {
                import('./views/notifications.js').then(m => m.renderNotificationsView(contentArea));
            }
            else if (view === 'perfil') renderProfile(contentArea);
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

// Vistas simples (Normas/Canales) - Restauradas al diseño funcional
function renderNormas(container) {
    container.innerHTML = `<h2 style="margin-bottom:1.5rem;">📋 Normas de la Agencia</h2><div class="glass-panel">Contenido de normas cargando...</div>`;
}

function renderCanales(container) {
    container.innerHTML = `<h2 style="margin-bottom:1.5rem;">📢 Canales Oficiales</h2><div class="glass-panel">Contenido de canales cargando...</div>`;
}

async function boot() {
    const app = document.getElementById('app');
    app.innerHTML = '<div style="height:100vh; display:flex; align-items:center; justify-content:center;">Cargando...</div>';

    // Limpieza de Service Workers antiguos para evitar bucles de error y lentitud
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
            await registration.unregister();
            console.log('SW antiguo eliminado para mejorar velocidad');
        }
    }

    await store.init().catch(console.warn);

    // OneSignal se encarga de su propio Service Worker, eliminamos el manual para evitar conflictos

    auth.onAuthChange(async (session) => {
        if (!session) { await store.clear(); appState.navigate('login'); }
        else {
            await store.refreshProfile();
            const u = store.getCurrentUser();
            if (u) appState.navigate(u.role);
        }
    });

    const user = store.getCurrentUser();
    appState.navigate(user ? user.role : 'login');
}

boot();
