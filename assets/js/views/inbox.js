import { store } from '../store.js';
import { push, profiles } from '../api.js';
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
        const [notifications, myCreators] = await Promise.all([
            push.getForUser(userId, role),
            role === 'manager' ? profiles.listAll().then(all => all.filter(p => p.role === 'creator' && p.manager_id === userId)) : Promise.resolve([]),
        ]);
        const lastSeen = localStorage.getItem(LAST_SEEN_KEY(userId)) || '1970-01-01';
        localStorage.setItem(LAST_SEEN_KEY(userId), new Date().toISOString());
        renderContent(container, notifications, lastSeen, role, myCreators);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            ${t('inbox.error')}: ${err.message}
        </div>`;
    }
}

function renderContent(container, notifications, lastSeen, role = 'creator', myCreators = []) {
    const unread = notifications.filter(n => n.sent_at > lastSeen).length;

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap;gap:0.8rem;">
                <h1 style="margin:0;font-size:1.5rem;">${t('inbox.title')}</h1>
                ${unread > 0
                    ? `<span style="background:var(--primary);color:#fff;border-radius:999px;font-size:0.72rem;font-weight:700;padding:0.2rem 0.7rem;">${getLang() === 'en' ? `${unread} new` : `${unread} nuevo${unread !== 1 ? 's' : ''}`}</span>`
                    : `<span style="font-size:0.75rem;color:var(--text-muted);">${getLang() === 'en' ? `${notifications.length} message${notifications.length !== 1 ? 's' : ''}` : `${notifications.length} mensaje${notifications.length !== 1 ? 's' : ''}`}</span>`}
            </div>
            ${role === 'manager' ? renderManagerCompose(myCreators) : ''}
            ${renderList(notifications, lastSeen)}
        </div>`;

    // Wire goto: links
    container.querySelectorAll('[data-goto]').forEach(btn => {
        btn.addEventListener('click', () => appState.navigateTo(btn.dataset.goto));
    });

    if (role === 'manager') {
        wireManagerCompose(container, myCreators);
    }
}

function renderManagerCompose(myCreators) {
    if (!myCreators.length) return '';
    return `
        <div class="glass-panel" style="padding:1.25rem;margin-bottom:1.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;"
                 id="compose-toggle">
                <h3 style="margin:0;font-size:0.9rem;"><i class="ph-bold ph-envelope-simple"></i> Enviar mensaje a mis creadores</h3>
                <span id="compose-arrow" style="font-size:0.75rem;color:var(--text-muted);transition:transform 0.2s;">▼</span>
            </div>
            <div id="compose-body" style="display:none;margin-top:1rem;">

                <!-- Destinatarios -->
                <div style="margin-bottom:0.9rem;">
                    <label style="font-size:0.75rem;color:var(--text-secondary);font-weight:700;display:block;margin-bottom:0.5rem;">DESTINATARIOS</label>
                    <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.6rem;">
                        <button class="mgr-tpill" data-mt="all"
                            style="font-size:0.75rem;padding:0.3rem 0.75rem;border-radius:999px;cursor:pointer;font-weight:600;
                                border:1.5px solid var(--primary);background:rgba(124,110,247,0.2);color:var(--primary-light);">
                            <i class="ph-bold ph-megaphone-simple"></i> Todos mis creadores (${myCreators.length})
                        </button>
                        <button class="mgr-tpill" data-mt="individual"
                            style="font-size:0.75rem;padding:0.3rem 0.75rem;border-radius:999px;cursor:pointer;font-weight:600;
                                border:1.5px solid var(--glass-border);background:rgba(255,255,255,0.04);color:var(--text-secondary);">
                            <i class="ph-bold ph-user"></i> Creador individual
                        </button>
                    </div>
                    <div id="mgr-individual-wrap" style="display:none;">
                        <input id="mgr-creator-filter" type="text" class="input-control"
                               placeholder="Filtrar por nombre o @usuario..."
                               autocomplete="off" style="margin-bottom:0.4rem;">
                        <div id="mgr-creator-list" style="
                            max-height:200px;overflow-y:auto;
                            border:1px solid var(--glass-border);border-radius:var(--radius-md);
                            background:rgba(18,18,32,0.6);margin-bottom:0.4rem;"></div>
                        <div id="mgr-chips" style="display:flex;flex-wrap:wrap;gap:0.35rem;min-height:16px;"></div>
                    </div>
                </div>

                <!-- Título -->
                <div style="margin-bottom:0.75rem;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
                        <label style="font-size:0.75rem;color:var(--text-secondary);font-weight:700;">TÍTULO</label>
                        <span id="mgr-title-count" style="font-size:0.65rem;color:var(--text-muted);">0/100</span>
                    </div>
                    <input id="mgr-title" type="text" class="input-control" maxlength="100" placeholder="Título del mensaje">
                </div>

                <!-- Mensaje -->
                <div style="margin-bottom:0.9rem;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
                        <label style="font-size:0.75rem;color:var(--text-secondary);font-weight:700;">MENSAJE</label>
                        <span id="mgr-body-count" style="font-size:0.65rem;color:var(--text-muted);">0/250</span>
                    </div>
                    <textarea id="mgr-body" class="input-control" style="height:90px;resize:none;" maxlength="250"
                              placeholder="Escribe aquí el mensaje..."></textarea>
                </div>

                <button id="mgr-send-btn" class="btn btn-primary" style="width:100%;padding:0.7rem;font-weight:700;">
                    Enviar mensaje
                </button>
            </div>
        </div>`;
}

function wireManagerCompose(container, myCreators) {
    const toggle     = container.querySelector('#compose-toggle');
    const body       = container.querySelector('#compose-body');
    const arrow      = container.querySelector('#compose-arrow');
    if (!toggle) return;

    let composeOpen = false;
    toggle.addEventListener('click', () => {
        composeOpen = !composeOpen;
        body.style.display  = composeOpen ? 'block' : 'none';
        arrow.style.transform = composeOpen ? 'rotate(180deg)' : '';
    });

    let mgrTarget = 'all';
    let mgrSelectedIds = [];

    const pillStyle = (active) =>
        `font-size:0.75rem;padding:0.3rem 0.75rem;border-radius:999px;cursor:pointer;font-weight:600;` +
        `border:1.5px solid ${active ? 'var(--primary)' : 'var(--glass-border)'};` +
        `background:${active ? 'rgba(124,110,247,0.2)' : 'rgba(255,255,255,0.04)'};` +
        `color:${active ? 'var(--primary-light)' : 'var(--text-secondary)'};`;

    const updatePills = () => {
        container.querySelectorAll('.mgr-tpill').forEach(b => {
            b.style.cssText = pillStyle(b.dataset.mt === mgrTarget);
        });
    };

    const indWrap     = container.querySelector('#mgr-individual-wrap');
    const filterInput = container.querySelector('#mgr-creator-filter');
    const listEl      = container.querySelector('#mgr-creator-list');
    const chipsEl     = container.querySelector('#mgr-chips');

    const renderRows = () => {
        const q = (filterInput?.value || '').toLowerCase().trim();
        const visible = myCreators.filter(c =>
            !q ||
            (c.display_name || '').toLowerCase().includes(q) ||
            (c.tiktok_username || '').toLowerCase().includes(q)
        );
        if (!listEl) return;
        if (!visible.length) {
            listEl.innerHTML = `<p style="font-size:0.75rem;color:var(--text-muted);padding:0.6rem;text-align:center;">Sin resultados</p>`;
            return;
        }
        listEl.innerHTML = visible.map(c => {
            const sel = mgrSelectedIds.includes(c.id);
            return `<div data-pid="${c.id}" style="
                display:flex;align-items:center;gap:0.7rem;
                padding:0.4rem 0.75rem;cursor:pointer;
                border-bottom:1px solid var(--glass-border);
                background:${sel ? 'rgba(124,110,247,0.1)' : 'transparent'};">
                <div style="width:16px;height:16px;border-radius:4px;flex-shrink:0;
                    background:${sel ? 'var(--primary)' : 'transparent'};
                    border:2px solid ${sel ? 'var(--primary)' : 'rgba(255,255,255,0.2)'};
                    display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;">
                    ${sel ? '<i class="ph-bold ph-check"></i>' : ''}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.78rem;font-weight:600;color:var(--text-primary);
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${esc(c.display_name || c.tiktok_username || 'Sin nombre')}
                    </div>
                    ${c.tiktok_username ? `<div style="font-size:0.65rem;color:var(--text-muted);">@${esc(c.tiktok_username)}</div>` : ''}
                </div>
            </div>`;
        }).join('');
        listEl.querySelectorAll('[data-pid]').forEach(row => {
            row.addEventListener('click', () => {
                const id = row.dataset.pid;
                if (mgrSelectedIds.includes(id)) {
                    mgrSelectedIds = mgrSelectedIds.filter(x => x !== id);
                } else {
                    mgrSelectedIds.push(id);
                }
                renderRows();
                renderChips();
            });
        });
    };

    const renderChips = () => {
        if (!chipsEl) return;
        if (!mgrSelectedIds.length) { chipsEl.innerHTML = ''; return; }
        chipsEl.innerHTML = mgrSelectedIds.map(id => {
            const p = myCreators.find(c => c.id === id);
            const name = esc(p?.display_name || p?.tiktok_username || id.slice(0, 8));
            return `<span style="display:inline-flex;align-items:center;gap:0.3rem;
                font-size:0.72rem;padding:0.2rem 0.4rem 0.2rem 0.7rem;
                background:rgba(124,110,247,0.18);border:1px solid var(--primary);
                border-radius:999px;color:var(--primary-light);">
                ${name}
                <button data-rid="${id}" style="background:none;border:none;cursor:pointer;
                    color:var(--primary-light);font-size:0.9rem;padding:0 0.1rem;line-height:1;"><i class="ph-bold ph-x"></i></button>
            </span>`;
        }).join('');
        chipsEl.querySelectorAll('[data-rid]').forEach(btn => {
            btn.addEventListener('click', () => {
                mgrSelectedIds = mgrSelectedIds.filter(id => id !== btn.dataset.rid);
                renderRows();
                renderChips();
            });
        });
    };

    container.querySelectorAll('.mgr-tpill').forEach(btn => {
        btn.addEventListener('click', () => {
            mgrTarget = btn.dataset.mt;
            mgrSelectedIds = [];
            updatePills();
            if (indWrap) indWrap.style.display = mgrTarget === 'individual' ? 'block' : 'none';
            if (mgrTarget === 'individual') renderRows();
        });
    });

    if (filterInput) filterInput.addEventListener('input', renderRows);

    const sendBtn    = container.querySelector('#mgr-send-btn');
    const titleInput = container.querySelector('#mgr-title');
    const bodyInput  = container.querySelector('#mgr-body');

    container.querySelector('#mgr-title-count') && titleInput?.addEventListener('input', () => {
        const el = container.querySelector('#mgr-title-count');
        if (el) el.textContent = `${titleInput.value.length}/100`;
    });
    container.querySelector('#mgr-body-count') && bodyInput?.addEventListener('input', () => {
        const el = container.querySelector('#mgr-body-count');
        if (el) el.textContent = `${bodyInput.value.length}/250`;
    });

    sendBtn?.addEventListener('click', async () => {
        const title = titleInput?.value.trim() || '';
        const body  = bodyInput?.value.trim() || '';
        if (!title) return appState.showToast('El título es obligatorio', 'warning');
        if (!body)  return appState.showToast('El mensaje es obligatorio', 'warning');

        let finalTarget;
        if (mgrTarget === 'all') {
            const ids = myCreators.map(c => c.id).filter(Boolean);
            if (!ids.length) return appState.showToast('No tenés creadores asignados', 'warning');
            finalTarget = { type: 'users', value: ids };
        } else {
            if (!mgrSelectedIds.length) return appState.showToast('Seleccioná al menos un creador', 'warning');
            finalTarget = mgrSelectedIds.length === 1
                ? { type: 'user',  value: mgrSelectedIds[0] }
                : { type: 'users', value: mgrSelectedIds };
        }

        sendBtn.disabled  = true;
        sendBtn.textContent = 'Enviando...';
        try {
            await push.send({ title, body, url: undefined, target: finalTarget });
            await push.saveToDb(title, body, null, finalTarget);
            appState.showToast('¡Mensaje enviado!', 'success');
            if (titleInput) titleInput.value = '';
            if (bodyInput)  bodyInput.value  = '';
            mgrSelectedIds = [];
            mgrTarget = 'all';
            updatePills();
            if (indWrap) indWrap.style.display = 'none';
            renderChips();
        } catch (err) {
            appState.showToast('Error al enviar: ' + err.message, 'danger');
        } finally {
            sendBtn.disabled  = false;
            sendBtn.textContent = 'Enviar mensaje';
        }
    });
}

const GOTO_LABELS = {
    capacitaciones: 'Capacitaciones',
    eventos:        'Eventos',
    canales:        'Canales',
    normas:         'Normas',
    mensajes:       'Mensajes',
    perfil:         'Perfil',
};

function renderList(notifications, lastSeen) {
    if (!notifications.length) {
        return `
            <div class="glass-panel" style="padding:3rem 2rem;text-align:center;">
                <div style="font-size:2.5rem;margin-bottom:1rem;"><i class="ph-bold ph-bell"></i></div>
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
