import { store } from './store.js';
import { auth } from './api.js';
import { isSupabaseConfigured } from './supabase.js';
import { renderLogin } from './views/login.js';
import { renderAdminDashboard, renderCreatorsList } from './views/adminDashboard.js';
import { renderManagerDashboard } from './views/managerDashboard.js';
import { renderCreatorDashboard } from './views/creatorDashboard.js';
import { renderProfile } from './views/profile.js';

/**
 * APP STATE & NAVIGATION
 * Centralized logic with Sequential Thinking
 */
export const appState = {
    navigate: (route) => {
        const app = document.getElementById('app');
        app.style.opacity = '0';
        app.style.transform = 'scale(0.98)';
        
        setTimeout(() => {
            app.innerHTML = '';
            switch (route) {
                case 'login':   renderLogin(app); break;
                case 'admin':   renderDashboardLayout(app, renderAdminDashboard, 'admin'); break;
                case 'manager': renderDashboardLayout(app, renderManagerDashboard, 'manager'); break;
                case 'creator': renderDashboardLayout(app, renderCreatorDashboard, 'creator'); break;
                default:        renderLogin(app);
            }
            app.style.transition = 'all var(--duration-md) var(--ease-out)';
            app.style.opacity = '1';
            app.style.transform = 'scale(1)';
        }, 150);
    },

    showToast: (message, type = 'success') => {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `glass-panel toast-premium ${type}`;
        toast.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.8rem;">
                <span class="toast-icon">${type === 'success' ? '✨' : '⚠️'}</span>
                <span style="font-weight:600; font-size:0.9rem;">${message}</span>
            </div>
        `;
        container.appendChild(toast);
        
        // Auto-remove with animation
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 400);
        }, 3500);
    }
};

/**
 * DYNAMIC NAVIGATION GENERATOR
 */
function getNavItems(role) {
    const items = [];
    if (role === 'admin') {
        items.push({ view: 'inicio', icon: '📊', label: 'Dashboard' });
        items.push({ view: 'creadores', icon: '👥', label: 'Directorio' });
    } else if (role === 'creator') {
        items.push({ view: 'inicio', icon: '📊', label: 'Premios' });
        items.push({ view: 'normas', icon: '📜', label: 'Reglas' });
        items.push({ view: 'canales', icon: '📢', label: 'Links' });
    } else {
        items.push({ view: 'inicio', icon: '📊', label: 'Panel' });
    }
    items.push({ view: 'perfil', icon: '👤', label: 'Perfil' });
    return items;
}

/**
 * MASTER LAYOUT (System 3.0)
 */
function renderDashboardLayout(container, renderContentFn, role) {
    const user = store.getCurrentUser();
    const navData = getNavItems(role);

    const navHtml = navData.map(item => `
        <a href="#" class="nav-item ${item.view === 'inicio' ? 'active' : ''}" data-view="${item.view}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
        </a>
    `).join('');

    container.innerHTML = `
        <div class="app-shell" style="display:flex; min-height:100vh;">
            <!-- Sidebar (Desktop) -->
            <aside class="sidebar glass-panel" style="width:280px; margin:1rem; border-radius:var(--radius-lg); position:fixed; height:calc(100vh - 2rem); display:none; flex-direction:column; padding:2rem; z-index:1000;">
                <div style="display:flex; align-items:center; gap:1rem; margin-bottom:3rem;">
                    <div style="width:40px; height:40px; background:var(--primary-gradient); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.2rem; color:white; font-weight:900;">E</div>
                    <h2 style="font-size:1.4rem; letter-spacing:-0.04em;">Elevate</h2>
                </div>
                
                <nav style="display:flex; flex-direction:column; gap:0.5rem; flex:1;">
                    ${navHtml}
                </nav>

                <div style="padding-top:2rem; border-top:1px solid var(--glass-border);">
                    <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1.5rem;">
                        <div style="width:36px; height:36px; border-radius:50%; background:var(--glass-bg); display:flex; align-items:center; justify-content:center; font-weight:800;">${user.username.charAt(0).toUpperCase()}</div>
                        <div style="min-width:0;">
                            <div style="font-weight:700; font-size:0.9rem; overflow:hidden; text-overflow:ellipsis;">@${user.username}</div>
                            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">${role}</div>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-ghost logout-btn" style="width:100%;">Cerrar Sesión</button>
                </div>
            </aside>

            <!-- Main Content Container -->
            <main id="dashboard-content" style="flex:1; padding:2rem; transition: padding 0.3s ease;">
                <!-- Content will be injected here -->
            </main>

            <!-- Floating Bottom Nav (Mobile) -->
            <nav class="bottom-nav">
                ${navHtml}
            </nav>
        </div>
    `;

    // Handle Responsive Sidebar
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const main = container.querySelector('#dashboard-content');
    const sidebar = container.querySelector('.sidebar');
    
    const handleDesktop = (e) => {
        if (e.matches) {
            sidebar.style.display = 'flex';
            main.style.paddingLeft = '320px';
        } else {
            sidebar.style.display = 'none';
            main.style.paddingLeft = '2rem';
        }
    };
    mediaQuery.addListener(handleDesktop);
    handleDesktop(mediaQuery);

    // Wire up events
    const contentArea = container.querySelector('#dashboard-content');
    renderContentFn(contentArea);

    container.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = async (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            
            container.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
            
            contentArea.style.opacity = '0';
            setTimeout(async () => {
                if (view === 'inicio') await renderContentFn(contentArea);
                else if (view === 'normas') renderNormas(contentArea);
                else if (view === 'canales') renderCanales(contentArea);
                else if (view === 'creadores') renderCreatorsList(contentArea);
                else if (view === 'perfil') renderProfile(contentArea);
                
                contentArea.style.transition = 'opacity 0.3s var(--ease-out)';
                contentArea.style.opacity = '1';
            }, 200);
        };
    });

    container.querySelectorAll('.logout-btn').forEach(btn => {
        btn.onclick = async () => {
            if (isSupabaseConfigured) { await auth.signOut(); await store.clear(); }
            else { store.logoutDemo(); }
            appState.navigate('login');
        };
    });
}

/**
 * VIEW: RULES & CONDUCT
 */
function renderNormas(container) {
    const rules = [
        { cat: 'Comunidad', icon: '🤝', items: ['Respeto absoluto a la audiencia.', 'Cero tolerancia al acoso.', 'Inclusión y diversidad.'] },
        { cat: 'Contenido', icon: '🎥', items: ['Entretenimiento apto para todo público.', 'Prohibido contenido sexual o violento.', 'No actividades ilegales.'] },
        { cat: 'Agencia', icon: '🏢', items: ['Cumplir con las horas acordadas.', 'Comunicación constante con tu Manager.', 'Exclusividad durante el contrato.'] }
    ];

    container.innerHTML = `
        <div style="animation: fadeIn var(--duration-md) var(--ease-out);">
            <h1 style="font-size:3rem; margin-bottom:1rem;">Normas</h1>
            <p style="color:var(--text-secondary); margin-bottom:3rem;">Manual de conducta oficial de Interactik Agency.</p>
            
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:1.5rem;">
                ${rules.map(r => `
                    <div class="glass-panel" style="padding:2rem;">
                        <div style="font-size:2rem; margin-bottom:1rem;">${r.icon}</div>
                        <h3 style="margin-bottom:1.5rem;">${r.cat}</h3>
                        <ul style="list-style:none; display:flex; flex-direction:column; gap:1rem;">
                            ${r.items.map(i => `<li style="font-size:0.9rem; color:var(--text-secondary); display:flex; gap:0.8rem;"><span style="color:var(--primary);">•</span> ${i}</li>`).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * VIEW: CHANNELS & LINKS
 */
function renderCanales(container) {
    const channels = [
        { name: 'WhatsApp VIP', emoji: '💬', color: '#25D366', url: '#' },
        { name: 'TikTok Oficial', emoji: '🎵', color: '#fe2c55', url: '#' },
        { name: 'Soporte 24/7', emoji: '🆘', color: 'var(--primary)', url: '#' }
    ];

    container.innerHTML = `
        <div style="animation: fadeIn var(--duration-md) var(--ease-out);">
            <h1 style="font-size:3rem; margin-bottom:1rem;">Canales</h1>
            <p style="color:var(--text-secondary); margin-bottom:3rem;">Enlaces oficiales y grupos de comunicación.</p>
            
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:1.5rem;">
                ${channels.map(c => `
                    <a href="${c.url}" class="glass-panel nav-card" style="text-decoration:none; padding:1.5rem;">
                        <div style="font-size:2rem;">${c.emoji}</div>
                        <div>
                            <h4 style="margin:0;">${c.name}</h4>
                            <p style="font-size:0.75rem; color:var(--text-muted); margin:0.2rem 0 0 0;">Acceso directo</p>
                        </div>
                    </a>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * BOOTSTRAP
 */
async function boot() {
    const app = document.getElementById('app');
    app.innerHTML = `<div style="height:100vh; display:flex; align-items:center; justify-content:center;"><div class="loading-dots">Elevating…</div></div>`;

    await store.init().catch(console.warn);

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
