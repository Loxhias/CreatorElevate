import { store } from '../store.js';
import { channels as api } from '../api.js';
import { appState } from '../main.js';

function detectType(url) {
    if (!url) return 'link';
    const u = url.toLowerCase();
    if (u.includes('chat.whatsapp.com') || u.includes('wa.me'))        return 'whatsapp';
    if (u.includes('t.me') || u.includes('telegram'))                   return 'telegram';
    if (u.includes('discord.gg') || u.includes('discord.com'))         return 'discord';
    if (u.includes('youtube.com') || u.includes('youtu.be'))           return 'youtube';
    if (u.includes('instagram.com'))                                    return 'instagram';
    if (u.includes('tiktok.com') || u.includes('vm.tiktok') || u.includes('vt.tiktok')) return 'tiktok';
    if (u.includes('twitter.com') || u.includes('x.com'))              return 'x';
    if (u.includes('facebook.com') || u.includes('fb.com'))            return 'facebook';
    return 'link';
}

const TYPE_META = {
    whatsapp:  { label: 'WhatsApp',    color: '#25d366', bg: 'rgba(37,211,102,0.12)',  border: 'rgba(37,211,102,0.25)',  emoji: '<i class="ph-bold ph-chat-circle-dots"></i>', btn: 'Unirse al grupo'  },
    telegram:  { label: 'Telegram',    color: '#0088cc', bg: 'rgba(0,136,204,0.12)',   border: 'rgba(0,136,204,0.25)',   emoji: '<i class="ph-bold ph-paper-plane-tilt"></i>', btn: 'Abrir en Telegram' },
    discord:   { label: 'Discord',     color: '#5865f2', bg: 'rgba(88,101,242,0.12)',  border: 'rgba(88,101,242,0.25)',  emoji: '<i class="ph-bold ph-game-controller"></i>', btn: 'Unirse al servidor'},
    youtube:   { label: 'YouTube',     color: '#ff4444', bg: 'rgba(255,68,68,0.12)',   border: 'rgba(255,68,68,0.25)',   emoji: '<i class="ph-bold ph-youtube-logo"></i>', btn: 'Ver canal'         },
    instagram: { label: 'Instagram',   color: '#e1306c', bg: 'rgba(225,48,108,0.12)',  border: 'rgba(225,48,108,0.25)', emoji: '<i class="ph-bold ph-instagram-logo"></i>', btn: 'Seguir'            },
    tiktok:    { label: 'TikTok',      color: '#ff0050', bg: 'rgba(255,0,80,0.12)',    border: 'rgba(255,0,80,0.25)',    emoji: '<i class="ph-bold ph-tiktok-logo"></i>', btn: 'Abrir en TikTok'  },
    x:         { label: 'Twitter / X', color: '#1d9bf0', bg: 'rgba(29,155,240,0.12)', border: 'rgba(29,155,240,0.25)', emoji: '<i class="ph-bold ph-x-logo"></i>', btn: 'Seguir'            },
    facebook:  { label: 'Facebook',    color: '#1877f2', bg: 'rgba(24,119,242,0.12)', border: 'rgba(24,119,242,0.25)', emoji: '<i class="ph-bold ph-users"></i>', btn: 'Unirse'            },
    link:      { label: 'Enlace',      color: 'var(--primary)', bg: 'rgba(124,110,247,0.12)', border: 'rgba(124,110,247,0.25)', emoji: '<i class="ph-bold ph-link"></i>', btn: 'Abrir enlace' },
};

const AGENCY_OPTS = [
    { val: 'latam', label: '🌎 LATAM' },
    { val: 'usa',   label: '🇺🇸 USA'  },
];

function uid() { return Math.random().toString(36).slice(2, 10); }

function tabStyle(active) {
    return `font-size:0.78rem;padding:0.35rem 0.9rem;border-radius:999px;cursor:pointer;font-weight:700;
        background:${active ? 'rgba(124,110,247,0.2)' : 'rgba(255,255,255,0.04)'};
        border:1.5px solid ${active ? 'var(--primary)' : 'var(--glass-border)'};
        color:${active ? 'var(--primary-light)' : 'var(--text-secondary)'};`;
}

export async function renderCanales(container) {
    const isAdmin = store.getCurrentUser()?.role === 'admin';
    const agency  = isAdmin ? 'latam' : (store.getProfile()?.agency || 'latam');

    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:220px;margin-bottom:1.5rem;"></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
                ${Array(3).fill('<div class="skel-panel" style="height:120px;"></div>').join('')}
            </div>
        </div>`;

    try {
        const items = await api.list(agency);
        renderContent(container, items, isAdmin, agency);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            Error al cargar canales: ${err.message}
        </div>`;
    }
}

async function switchAgency(container, isAdmin, newAgency) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:220px;margin-bottom:1.5rem;"></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
                ${Array(3).fill('<div class="skel-panel" style="height:120px;"></div>').join('')}
            </div>
        </div>`;
    try {
        const items = await api.list(newAgency);
        renderContent(container, items, isAdmin, newAgency);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            Error al cargar canales: ${err.message}
        </div>`;
    }
}

function renderContent(container, items, isAdmin, agency) {
    const agencyLabel = AGENCY_OPTS.find(a => a.val === agency)?.label || agency.toUpperCase();

    container.innerHTML = `
        <div class="animate-fadeIn">

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${isAdmin ? '1rem' : '1.5rem'};gap:1rem;flex-wrap:wrap;">
                <div>
                    <h1 style="margin:0 0 0.2rem;font-size:1.4rem;">Canales Oficiales</h1>
                    <p style="margin:0;font-size:0.78rem;color:var(--text-muted);">Canales y grupos de la agencia Interactik — ${agencyLabel}</p>
                </div>
                ${isAdmin ? `<button id="add-ch-btn" class="btn btn-primary" style="font-size:0.8rem;white-space:nowrap;"><i class="ph-bold ph-plus"></i> Agregar canal</button>` : ''}
            </div>

            ${isAdmin ? `
            <div style="display:flex;gap:0.4rem;margin-bottom:1.25rem;">
                ${AGENCY_OPTS.map(a => `
                    <button class="agency-tab" data-ag="${a.val}" style="${tabStyle(agency === a.val)}">${a.label}</button>
                `).join('')}
            </div>

            <div id="ch-form" class="glass-panel" style="padding:1.25rem;margin-bottom:1.5rem;display:none;">
                <h3 id="ch-form-title" style="margin-top:0;font-size:0.95rem;">Nuevo Canal — ${agencyLabel}</h3>
                <div style="display:flex;flex-direction:column;gap:0.8rem;">
                    <div class="input-group" style="margin-bottom:0;">
                        <label>Nombre del canal</label>
                        <input type="text" id="ch-name" class="input-control" placeholder="Ej: Grupo de WhatsApp · Creadores" maxlength="80">
                    </div>
                    <div class="input-group" style="margin-bottom:0;">
                        <label>URL o link de invitación</label>
                        <input type="url" id="ch-url" class="input-control" placeholder="https://chat.whatsapp.com/...">
                    </div>
                    <div class="input-group" style="margin-bottom:0;">
                        <label>Descripción (opcional)</label>
                        <input type="text" id="ch-desc" class="input-control" placeholder="Canal de avisos, novedades, soporte..." maxlength="120">
                    </div>
                    <div id="ch-preview-wrap" style="display:none;">
                        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:0.5rem;">Previsualización</div>
                        <div id="ch-preview-card"></div>
                    </div>
                    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
                        <button id="ch-save-btn" class="btn btn-primary" style="flex:1;min-width:120px;">Guardar canal</button>
                        <button id="ch-cancel-btn" class="btn btn-ghost">Cancelar</button>
                    </div>
                </div>
            </div>` : ''}

            <div id="ch-list">${renderList(items, isAdmin)}</div>
        </div>`;

    // Tabs de agencia (admin)
    container.querySelectorAll('.agency-tab').forEach(btn => {
        btn.addEventListener('click', () => switchAgency(container, isAdmin, btn.dataset.ag));
    });

    if (!isAdmin) return;
    wireAdmin(container, items, agency);
}

function renderList(items, isAdmin) {
    if (!items.length) {
        return `
            <div class="glass-panel" style="padding:3rem 2rem;text-align:center;">
                <div style="font-size:2.5rem;margin-bottom:1rem;"><i class="ph-bold ph-megaphone-simple"></i></div>
                <p style="color:var(--text-muted);font-size:0.9rem;">
                    ${isAdmin ? 'Aún no hay canales para esta región. Pulsa "+ Agregar canal" para añadir el primero.' : 'No hay canales publicados todavía.'}
                </p>
            </div>`;
    }

    return `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;">
            ${items.map(ch => renderCard(ch, isAdmin)).join('')}
        </div>`;
}

function renderCard(ch, isAdmin, preview = false) {
    const type = detectType(ch.url);
    const meta = TYPE_META[type];

    return `
        <div class="glass-panel" style="padding:1.2rem 1.3rem;border-color:${meta.border};background:${meta.bg};display:flex;flex-direction:column;gap:0.75rem;${preview ? 'pointer-events:none;' : ''}">
            <div style="display:flex;align-items:center;gap:0.75rem;">
                <div style="width:44px;height:44px;border-radius:var(--radius-sm);background:rgba(0,0,0,0.2);border:1px solid ${meta.border};display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">
                    ${meta.emoji}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:0.92rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ch.name}</div>
                    <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${meta.color};margin-top:0.1rem;">${meta.label}</div>
                </div>
                ${isAdmin && !preview ? `
                <div style="display:flex;gap:0.3rem;flex-shrink:0;">
                    <button class="ch-edit-btn" data-id="${ch.id}"
                        style="font-size:0.7rem;padding:0.2rem 0.45rem;border-radius:6px;
                               background:rgba(124,110,247,0.1);color:var(--primary-light);
                               border:none;cursor:pointer;"><i class="ph-bold ph-pencil-simple"></i></button>
                    <button class="ch-del-btn" data-id="${ch.id}"
                        style="font-size:0.7rem;padding:0.2rem 0.45rem;border-radius:6px;
                               background:rgba(255,85,105,0.1);color:var(--danger);
                               border:none;cursor:pointer;"><i class="ph-bold ph-trash"></i></button>
                </div>` : ''}
            </div>

            ${ch.description ? `
            <p style="margin:0;font-size:0.78rem;color:var(--text-secondary);line-height:1.5;">${ch.description}</p>` : ''}

            ${!preview ? `
            <a href="${ch.url}" target="_blank" rel="noopener noreferrer"
               style="display:block;text-align:center;padding:0.6rem 1rem;
                      border-radius:var(--radius-sm);font-size:0.8rem;font-weight:700;
                      background:${meta.color};color:#fff;text-decoration:none;transition:opacity 0.2s;"
               onmouseover="this.style.opacity='0.88'" onmouseout="this.style.opacity='1'">
                ${meta.btn} →
            </a>` : `
            <div style="text-align:center;padding:0.6rem 1rem;border-radius:var(--radius-sm);
                        font-size:0.8rem;font-weight:700;background:${meta.color};color:#fff;">
                ${meta.btn} →
            </div>`}
        </div>`;
}

function wireAdmin(container, items, agency) {
    let editingId = null;

    const addBtn    = container.querySelector('#add-ch-btn');
    const form      = container.querySelector('#ch-form');
    const formTitle = container.querySelector('#ch-form-title');
    const saveBtn   = container.querySelector('#ch-save-btn');
    const cancelBtn = container.querySelector('#ch-cancel-btn');
    const nameEl    = container.querySelector('#ch-name');
    const urlEl     = container.querySelector('#ch-url');
    const descEl    = container.querySelector('#ch-desc');
    const prevWrap  = container.querySelector('#ch-preview-wrap');
    const prevCard  = container.querySelector('#ch-preview-card');
    const agencyLabel = AGENCY_OPTS.find(a => a.val === agency)?.label || agency.toUpperCase();

    const updatePreview = () => {
        const name = nameEl.value.trim() || 'Nombre del canal';
        const url  = urlEl.value.trim();
        const desc = descEl.value.trim();
        if (url || name !== 'Nombre del canal') {
            prevCard.innerHTML = renderCard({ id: 'prev', name, url, description: desc }, false, true);
            prevWrap.style.display = 'block';
        } else {
            prevWrap.style.display = 'none';
        }
    };

    nameEl.addEventListener('input', updatePreview);
    urlEl.addEventListener('input', updatePreview);
    descEl.addEventListener('input', updatePreview);

    const closeForm = () => {
        form.style.display = 'none';
        editingId = null;
        formTitle.textContent = `Nuevo Canal — ${agencyLabel}`;
        saveBtn.textContent   = 'Guardar canal';
        nameEl.value = '';
        urlEl.value  = '';
        descEl.value = '';
        prevWrap.style.display = 'none';
    };

    addBtn.onclick = () => {
        if (form.style.display !== 'none' && !editingId) { closeForm(); return; }
        closeForm();
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        nameEl.focus();
    };
    cancelBtn.onclick = closeForm;

    saveBtn.onclick = async () => {
        const name = nameEl.value.trim();
        const url  = urlEl.value.trim();
        const desc = descEl.value.trim();

        if (!name) return appState.showToast('El nombre del canal es obligatorio', 'warning');
        if (!url)  return appState.showToast('La URL es obligatoria', 'warning');

        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
        try {
            if (editingId) {
                const idx = items.findIndex(c => c.id === editingId);
                if (idx !== -1) items[idx] = { ...items[idx], name, url, description: desc };
            } else {
                items.push({ id: uid(), name, url, description: desc });
            }
            await api.save(items, agency);
            appState.showToast(editingId ? 'Canal actualizado' : 'Canal agregado', 'success');
            renderContent(container, items, true, agency);
        } catch (err) {
            appState.showToast('Error: ' + err.message, 'danger');
            saveBtn.disabled = false;
            saveBtn.textContent = editingId ? 'Actualizar' : 'Guardar canal';
        }
    };

    container.querySelectorAll('.ch-edit-btn').forEach(btn => {
        btn.onclick = () => {
            const ch = items.find(c => c.id === btn.dataset.id);
            if (!ch) return;
            editingId = ch.id;
            formTitle.textContent = `Editar Canal — ${agencyLabel}`;
            saveBtn.textContent   = 'Actualizar';
            nameEl.value = ch.name || '';
            urlEl.value  = ch.url  || '';
            descEl.value = ch.description || '';
            updatePreview();
            form.style.display = 'block';
            form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };
    });

    container.querySelectorAll('.ch-del-btn').forEach(btn => {
        btn.onclick = async () => {
            if (!confirm('¿Eliminar este canal?')) return;
            try {
                const newItems = items.filter(c => c.id !== btn.dataset.id);
                await api.save(newItems, agency);
                appState.showToast('Canal eliminado', 'info');
                renderContent(container, newItems, true, agency);
            } catch (err) {
                appState.showToast('Error: ' + err.message, 'danger');
            }
        };
    });
}
