import { store } from './store.js';
import { auth } from './api.js';
import { isSupabaseConfigured } from './supabase.js';
import { renderLogin } from './views/login.js';
import { renderAdminDashboard } from './views/adminDashboard.js';
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
        toast.className = `toast${type === 'error' ? ' error' : ''}`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

function navItemsForRole(role) {
    if (role === 'creator') {
        return `
            <a href="#" class="nav-item active" data-view="inicio">
                <span class="nav-icon">📊</span><span>Inicio</span>
            </a>
            <a href="#" class="nav-item" data-view="normas">
                <span class="nav-icon">📋</span><span>Normas</span>
            </a>
            <a href="#" class="nav-item" data-view="canales">
                <span class="nav-icon">📢</span><span>Canales</span>
            </a>
            <a href="#" class="nav-item" data-view="perfil">
                <span class="nav-icon">👤</span><span>Perfil</span>
            </a>
        `;
    }
    if (role === 'admin') {
        return `
            <a href="#" class="nav-item active" data-view="inicio">
                <span class="nav-icon">📊</span><span>Panel</span>
            </a>
            <a href="#" class="nav-item" data-view="creadores">
                <span class="nav-icon">👥</span><span>Creadores</span>
            </a>
            <a href="#" class="nav-item" data-view="perfil">
                <span class="nav-icon">👤</span><span>Perfil</span>
            </a>
        `;
    }
    return `
        <a href="#" class="nav-item active" data-view="inicio">
            <span class="nav-icon">📊</span><span>Panel</span>
        </a>
        <a href="#" class="nav-item" data-view="perfil">
            <span class="nav-icon">👤</span><span>Perfil</span>
        </a>
    `;
}


function renderDashboardLayout(container, renderContentFn, role) {
    const user = store.getCurrentUser();
    const initial = user.username.charAt(0).toUpperCase();

    container.innerHTML = `
        <div class="app-container animate-fade-in">
            <header class="topbar">
                <div class="topbar-brand">
                    <div class="topbar-logo">⚡</div>
                    <span class="topbar-title">Interactik Agency <span style="opacity:0.4;font-weight:400;margin:0 0.2rem;">|</span> Creator Elevate</span>
                </div>
            </header>


            <main class="content-area" id="dashboard-content"></main>

            <nav class="bottom-nav">
                ${navItemsForRole(role)}
                <a href="#" class="nav-item nav-danger" id="logout-btn">
                    <span class="nav-icon">🚪</span><span>Salir</span>
                </a>
            </nav>
        </div>
    `;

    document.getElementById('logout-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            if (isSupabaseConfigured) {
                await auth.signOut();
                await store.clear();
            } else {
                store.logoutDemo();
            }
        } finally {
            appState.navigate('login');
        }
    });

    const contentArea = document.getElementById('dashboard-content');

    // Wire up bottom nav
    renderContentFn(contentArea);

    container.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            container.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            const view = item.dataset.view;
            if (view === 'inicio') {
                await renderContentFn(contentArea);
            } else if (view === 'normas') {
                await renderNormas(contentArea);
            } else if (view === 'canales') {
                await renderCanales(contentArea);
            } else if (view === 'creadores') {
                // For admin: show creators list (we could move this to a separate view if needed)
                // For now, let's keep it simple or implement a quick list.
                contentArea.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted);">Próximamente: Lista detallada de creadores</div>`;
            } else if (view === 'perfil') {
                await renderProfile(contentArea);
            }
        });
    });

}

// ── Normas ──────────────────────────────────────────────────────────────────
function renderNormas(container) {
    const rules = [
        {
            cat: 'Comunidad y Respeto',
            icon: '🤝',
            color: 'rgba(0,217,166,0.12)',
            border: 'rgba(0,217,166,0.25)',
            items: [
                'Tratar a todos los espectadores con respeto y amabilidad en todo momento.',
                'No permitir ni fomentar el acoso, bullying o discriminación por ningún motivo.',
                'Mantener un ambiente inclusivo: prohibido el odio por raza, género, religión u orientación sexual.',
                'No revelar información personal de otros usuarios sin su consentimiento.'
            ]
        },
        {
            cat: 'Contenido Permitido',
            icon: '✅',
            color: 'rgba(124,110,247,0.10)',
            border: 'rgba(124,110,247,0.25)',
            items: [
                'Entretenimiento en vivo: música, arte, cocina, deportes, humor y charlas.',
                'Contenido educativo o informativo apto para todo público.',
                'Colaboraciones y partidas (PKs) con otros creadores siempre dentro de las normas.',
                'Promoción de productos o servicios legales, siempre identificando claramente la publicidad.'
            ]
        },
        {
            cat: 'Contenido Prohibido',
            icon: '🚫',
            color: 'rgba(255,85,105,0.08)',
            border: 'rgba(255,85,105,0.25)',
            items: [
                'Desnudez, contenido sexual explícito o sugerente de cualquier tipo.',
                'Violencia real, automutilación o contenido que glorifique el daño a personas o animales.',
                'Actividades ilegales: venta de drogas, armas, fraudes o cualquier actividad criminal.',
                'Discurso de odio, contenido extremista o propaganda de organizaciones peligrosas.',
                'Spam, estafas o engaños a la audiencia para obtener beneficios económicos.'
            ]
        },
        {
            cat: 'Menores de Edad',
            icon: '👶',
            color: 'rgba(255,181,71,0.10)',
            border: 'rgba(255,181,71,0.25)',
            items: [
                'Ningún menor de 18 años puede aparecer en los streams sin supervisión de un adulto responsable.',
                'Nunca solicitar información personal a menores de edad.',
                'Está prohibido cualquier contenido que pueda ser inapropiado para audiencias jóvenes.',
                'Los creadores deben reportar cualquier comportamiento sospechoso hacia menores.'
            ]
        },
        {
            cat: 'Propiedad Intelectual',
            icon: '©️',
            color: 'rgba(244,113,181,0.08)',
            border: 'rgba(244,113,181,0.25)',
            items: [
                'No usar música con derechos de autor sin licencia durante los streams.',
                'No reproducir películas, series, deportes u otro contenido protegido por copyright.',
                'Respetar las marcas registradas y no usar logos de terceros sin autorización.',
                'Acreditar siempre el trabajo original de otros creadores.'
            ]
        },
        {
            cat: 'Normas de la Agencia',
            icon: '🏢',
            color: 'rgba(255,209,102,0.10)',
            border: 'rgba(255,209,102,0.3)',
            items: [
                'Mantener una frecuencia mínima de LIVE consistente con los objetivos acordados.',
                'Comunicar con anticipación cualquier ausencia o baja de actividad a tu Manager.',
                'No firmar contratos con otras agencias sin notificarlo previamente a Interactik.',
                'Respetar los acuerdos de confidencialidad sobre comisiones, bonos y datos internos.',
                'Reportar cualquier problema técnico o situación de acoso dentro de la plataforma.'
            ]
        }
    ];

    container.innerHTML = `
        <div class="page-header animate-fade-in">
            <h1>📋 Normas y Conducta</h1>
            <p>Directrices para una comunidad sana y segura</p>
        </div>

        <div class="glass-panel" style="padding:1rem 1.2rem;margin-bottom:1.25rem;background:linear-gradient(135deg,rgba(124,110,247,0.1),rgba(244,113,181,0.06));border-color:rgba(124,110,247,0.25);">
            <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.4rem;">
                <span style="font-size:1rem;">⚠️</span>
                <span style="font-weight:700;font-size:0.88rem;color:var(--primary-light);">Importante</span>
            </div>
            <p class="text-sm" style="color:var(--text-secondary);line-height:1.6;">
                El incumplimiento de estas normas puede resultar en suspensión temporal, eliminación de beneficios o baja de la agencia. Ante cualquier duda, consulta a tu Manager.
            </p>
        </div>

        <div class="stagger">
            ${rules.map(r => `
                <div class="glass-panel" style="padding:1.2rem 1.3rem;margin-bottom:0.85rem;background:${r.color};border-color:${r.border};">
                    <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.9rem;">
                        <span style="font-size:1.2rem;">${r.icon}</span>
                        <h3 style="font-size:0.92rem;">${r.cat}</h3>
                    </div>
                    <ul style="list-style:none;display:flex;flex-direction:column;gap:0.55rem;">
                        ${r.items.map(item => `
                            <li style="display:flex;align-items:flex-start;gap:0.6rem;font-size:0.82rem;color:var(--text-secondary);line-height:1.55;">
                                <span style="color:${r.border.replace('0.25','0.9')};flex-shrink:0;margin-top:2px;">•</span>
                                ${item}
                            </li>`).join('')}
                    </ul>
                </div>`).join('')}
        </div>

        <div style="text-align:center;padding:1.5rem 0 0.5rem;">
            <p class="text-xs text-muted">Última actualización: Mayo 2026 · Interactik Agency</p>
        </div>
    `;
}

// ── Canales ─────────────────────────────────────────────────────────────────
async function renderCanales(container) {
    const user = store.getCurrentUser();
    let managerPhone = null;

    if (isSupabaseConfigured && user?.managerId) {
        try {
            const mProfile = await auth.getProfile(user.managerId);
            managerPhone = mProfile?.phone || null;
        } catch (e) { console.warn('Error fetching manager profile:', e); }
    }

    const channels = [
        {
            section: 'Grupos de WhatsApp',
            icon: '💬',
            links: [
                { name: 'Grupo Principal de Creadores', desc: 'Canal oficial para todos los creadores activos', emoji: '👥', url: 'https://wa.me/', color: '#25D366' },
                { name: 'Novedades y Anuncios', desc: 'Comunicados oficiales de la agencia', emoji: '📣', url: 'https://wa.me/', color: '#25D366' },
                { name: 'Soporte y Ayuda', desc: 'Consultas técnicas y administrativas', emoji: '🆘', url: 'https://wa.me/', color: '#25D366' },
            ]
        },
        {
            section: 'Canales de TikTok',
            icon: '🎵',
            links: [
                { name: 'Interactik Agency Oficial', desc: 'Cuenta principal de la agencia en TikTok', emoji: '⚡', url: 'https://www.tiktok.com/@interactik', color: '#fe2c55' },
                { name: 'Creadores Destacados', desc: 'Contenido de los mejores creadores del mes', emoji: '🏆', url: 'https://www.tiktok.com/', color: '#fe2c55' },
            ]
        },
        {
            section: 'Recursos y Documentos',
            icon: '📁',
            links: [
                { name: 'Manual del Creador', desc: 'Guía completa de inicio y mejores prácticas', emoji: '📖', url: '#', color: 'var(--primary-light)' },
                { name: 'Calendario de Eventos', desc: 'Fechas de PKs, torneos y eventos especiales', emoji: '📅', url: '#', color: 'var(--primary-light)' },
                { name: 'Formulario de Soporte', desc: 'Reportar problemas o enviar sugerencias', emoji: '📝', url: '#', color: 'var(--primary-light)' },
            ]
        },
        {
            section: 'Contacto Directo',
            icon: '📞',
            links: [
                { 
                    name: 'Mi Manager', 
                    desc: managerPhone ? 'Chat directo por WhatsApp' : 'Contacta directamente a tu manager asignado', 
                    emoji: '👤', 
                    url: managerPhone ? `https://wa.me/${managerPhone.replace(/\D/g, '')}` : 'https://wa.me/', 
                    color: 'var(--accent)' 
                },
                { name: 'Administración Interactik', desc: 'Para consultas sobre pagos y contratos', emoji: '🏢', url: 'https://wa.me/', color: 'var(--accent)' },
            ]
        }
    ];

    container.innerHTML = `
        <div class="page-header animate-fade-in">
            <h1>📢 Canales Oficiales</h1>
            <p>Todos los grupos y recursos de Interactik</p>
        </div>

        <div class="stagger">
            ${channels.map(section => `
                <div style="margin-bottom:1.5rem;">
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;padding:0 0.2rem;">
                        <span style="font-size:1rem;">${section.icon}</span>
                        <span class="label-caps" style="color:var(--text-secondary);">${section.section}</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:0.6rem;">
                        ${section.links.map(link => `
                            <a href="${link.url}" target="_blank" rel="noopener noreferrer"
                               style="text-decoration:none;display:flex;align-items:center;gap:0.9rem;padding:1rem 1.1rem;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:var(--radius-md);transition:all 0.22s ease;cursor:pointer;"
                               onmouseover="this.style.borderColor='${link.color}33';this.style.background='rgba(255,255,255,0.06)'"
                               onmouseout="this.style.borderColor='var(--glass-border)';this.style.background='var(--glass-bg)'">
                                <div style="width:42px;height:42px;border-radius:var(--radius-sm);background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">${link.emoji}</div>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-weight:700;font-size:0.88rem;color:var(--text-primary);margin-bottom:0.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${link.name}</div>
                                    <div style="font-size:0.75rem;color:var(--text-muted);">${link.desc}</div>
                                </div>
                                <div style="font-size:0.75rem;color:${link.color};font-weight:700;flex-shrink:0;">→</div>
                            </a>`).join('')}
                    </div>
                </div>`).join('')}
        </div>

        <div style="text-align:center;padding:1rem 0 0.5rem;">
            <p class="text-xs text-muted">¿Falta un canal? Notifica a tu Manager.</p>
        </div>
    `;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function boot() {
    const app = document.getElementById('app');

    // Splash mientras carga
    app.innerHTML = `
        <div class="login-page animate-fade-in" style="min-height:100vh;display:flex;align-items:center;justify-content:center;">
            <div style="text-align:center;">
                <div style="font-size:3rem;margin-bottom:1rem;animation:pulse 1.5s ease-in-out infinite;">⚡</div>
                <p style="color:var(--text-muted);font-size:0.85rem;">Cargando…</p>
            </div>
        </div>`;

    await store.init();

    // Reactividad: si la sesión cambia (logout en otra pestaña, etc.)
    auth.onAuthChange(async (session) => {
        if (!session) {
            await store.clear();
            appState.navigate('login');
        } else {
            await store.refreshProfile();
            const u = store.getCurrentUser();
            if (u) {
                appState.navigate(u.role);
                tryEnablePush();
            }
        }
    });

    const user = store.getCurrentUser();
    appState.navigate(user ? user.role : 'login');
    if (user) tryEnablePush();
}

async function tryEnablePush() {
    try {
        const { ensurePushSubscription } = await import('./push.js');
        const res = await ensurePushSubscription();
        if (!res.ok && res.reason && res.reason !== 'no_vapid' && res.reason !== 'denied') {
            console.info('Push no habilitado:', res.reason);
        }
    } catch (e) {
        console.warn('Push setup error:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => { boot(); });

// ── Service Worker (PWA + Push) ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.warn('SW registration failed:', err);
        });
    });
}
