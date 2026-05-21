import { store } from '../store.js';
import { push } from '../api.js';
import { appState } from '../main.js';
import { t, getLang } from '../i18n.js';

const LAST_SEEN_KEY = (id) => `inbox_last_seen_${id || 'anon'}`;

function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export async function renderInboxView(container) {
    const user   = store.getCurrentUser();
    const userId = user?.id;
    const role   = user?.role || 'creator';

    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:180px;margin-bottom:1.5rem;"></div>
            <div style="display:flex;flex-direction:column;gap:0.8rem;">
                ${Array(4).fill('<div class="skel-panel" style="height:72px;"></div>').join('')}
            </div>
        </div>`;

    try {
        const notifications = await push.getForUser(userId, role);
        const lastSeen = localStorage.getItem(LAST_SEEN_KEY(userId)) || '1970-01-01';
        localStorage.setItem(LAST_SEEN_KEY(userId), new Date().toISOString());
        renderContent(container, notifications, lastSeen);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            ${t('inbox.error')}: ${err.message}
        </div>`;
    }
}

function renderContent(container, notifications, lastSeen) {
    const unread = notifications.filter(n => n.sent_at > lastSeen).length;

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap;gap:0.8rem;">
                <h1 style="margin:0;font-size:1.5rem;">${t('inbox.title')}</h1>
                ${unread > 0
                    ? `<span style="background:var(--primary);color:#fff;border-radius:999px;font-size:0.72rem;font-weight:700;padding:0.2rem 0.7rem;">${getLang() === 'en' ? `${unread} new` : `${unread} nuevo${unread !== 1 ? 's' : ''}`}</span>`
                    : `<span style="font-size:0.75rem;color:var(--text-muted);">${getLang() === 'en' ? `${notifications.length} message${notifications.length !== 1 ? 's' : ''}` : `${notifications.length} mensaje${notifications.length !== 1 ? 's' : ''}`}</span>`}
            </div>
            ${renderList(notifications, lastSeen)}
        </div>`;

    // Wire goto: links — navegan dentro de la app en vez de abrir tab externa
    container.querySelectorAll('[data-goto]').forEach(btn => {
        btn.addEventListener('click', () => appState.navigateTo(btn.dataset.goto));
    });
}

const GOTO_LABELS = {
    capacitaciones: '🎓 Capacitaciones',
    eventos:        '📅 Eventos',
    canales:        '📢 Canales',
    normas:         '📋 Normas',
    mensajes:       '🔔 Mensajes',
    perfil:         '👤 Perfil',
};

function renderList(notifications, lastSeen) {
    if (!notifications.length) {
        return `
            <div class="glass-panel" style="padding:3rem 2rem;text-align:center;">
                <div style="font-size:2.5rem;margin-bottom:1rem;">🔔</div>
                <h3 style="margin-bottom:0.5rem;">${t('inbox.empty_title')}</h3>
                <p style="font-size:0.8rem;color:var(--text-muted);">${t('inbox.empty_sub')}</p>
            </div>`;
    }

    const timeAgo = (iso) => {
        const s = Math.floor((Date.now() - new Date(iso)) / 1000);
        if (s < 60)    return t('inbox.just_now');
        if (s < 3600)  return t('inbox.min_ago', { n: Math.floor(s / 60) });
        if (s < 86400) return t('inbox.h_ago', { n: Math.floor(s / 3600) });
        return new Date(iso).toLocaleDateString(getLang() === 'en' ? 'en' : 'es', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const actionHtml = (url) => {
        if (!url) return '';
        if (url.startsWith('goto:')) {
            const route = url.slice(5);
            const label = GOTO_LABELS[route] || t('inbox.go_section');
            return `<button data-goto="${route}"
                style="font-size:0.72rem;color:var(--primary);background:none;border:none;
                       padding:0;cursor:pointer;font-weight:600;text-align:left;">
                ${label} →
            </button>`;
        }
        return `<a href="${url}" target="_blank" rel="noopener noreferrer"
            style="font-size:0.72rem;color:var(--primary);text-decoration:none;font-weight:600;">
            ${t('inbox.view_more')}
        </a>`;
    };

    return notifications.map(n => {
        const isUnread = n.sent_at > lastSeen;
        return `
            <div style="
                display:flex;gap:0.9rem;padding:1rem 1.1rem;margin-bottom:0.6rem;
                background:${isUnread ? 'rgba(124,110,247,0.07)' : 'rgba(255,255,255,0.02)'};
                border:1px solid ${isUnread ? 'rgba(124,110,247,0.25)' : 'var(--glass-border)'};
                border-radius:var(--radius-md);">
                <div style="flex-shrink:0;padding-top:0.55rem;">
                    <div style="width:8px;height:8px;border-radius:50%;
                        background:${isUnread ? 'var(--primary)' : 'transparent'};
                        border:${isUnread ? 'none' : '1.5px solid rgba(255,255,255,0.15)'};"></div>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.3rem;flex-wrap:wrap;">
                        <span style="font-size:0.88rem;font-weight:${isUnread ? '700' : '600'};
                            color:${isUnread ? 'var(--text-primary)' : 'var(--text-secondary)'};">
                            ${esc(n.title)}
                        </span>
                        <span style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">${timeAgo(n.sent_at)}</span>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 ${n.url ? '0.6rem' : '0'};line-height:1.5;">${esc(n.body)}</p>
                    ${actionHtml(n.url)}
                </div>
            </div>`;
    }).join('');
}
