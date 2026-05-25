import { store } from '../store.js';
import { points as api, profiles } from '../api.js';
import { appState } from '../main.js';

const DIAMONDS_PER_POINT = 250;

export async function renderPointsAdmin(container) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:200px;margin-bottom:1.5rem;"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
                <div class="skel-panel" style="height:320px;"></div>
                <div class="skel-panel" style="height:320px;"></div>
            </div>
        </div>`;

    try {
        const [creatorPoints, redemptions, allProfiles] = await Promise.all([
            api.listCreatorPoints(),
            api.listRedemptions(),
            store.getProfiles().length ? Promise.resolve(store.getProfiles()) : profiles.listAll(),
        ]);
        renderContent(container, creatorPoints, redemptions, allProfiles);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">
            Error al cargar puntos: ${err.message}
        </div>`;
    }
}

function renderContent(container, creatorPoints, redemptions, allProfiles) {
    const creators = allProfiles.filter(p => p.role === 'creator');
    const pending  = redemptions.filter(r => r.status === 'pending');

    const timeAgo = (iso) => {
        const s = Math.floor((Date.now() - new Date(iso)) / 1000);
        if (s < 60)    return 'hace un momento';
        if (s < 3600)  return `hace ${Math.floor(s / 60)} min`;
        if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
        return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem;">
                <h1 style="margin:0;font-size:1.5rem;">Puntos & Canjes</h1>
                ${pending.length ? `
                <span style="background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.35);color:#fbbf24;
                    border-radius:999px;padding:0.3rem 0.9rem;font-size:0.75rem;font-weight:700;">
                    <i class="ph-bold ph-clock"></i> ${pending.length} canje${pending.length !== 1 ? 's' : ''} pendiente${pending.length !== 1 ? 's' : ''}
                </span>` : ''}
            </div>

            <div class="two-panel" style="gap:1.5rem;">

                <!-- Panel izquierdo: agregar puntos -->
                <div style="display:flex;flex-direction:column;gap:1.5rem;">

                    <!-- Formulario de carga -->
                    <div class="glass-panel" style="padding:1.5rem;">
                        <h3 style="margin-top:0;font-size:0.95rem;"><i class="ph-bold ph-plus"></i> Sumar puntos a un creador</h3>

                        <!-- Búsqueda de creador -->
                        <div style="position:relative;margin-bottom:0.75rem;">
                            <input id="pts-search" type="text" class="input-control"
                                placeholder="Buscar por @usuario o nombre..." autocomplete="off">
                            <div id="pts-results" style="
                                position:absolute;left:0;right:0;z-index:20;
                                max-height:200px;overflow-y:auto;
                                border:1px solid var(--glass-border);border-radius:var(--radius-md);
                                background:rgba(18,18,32,0.98);display:none;"></div>
                        </div>

                        <div id="pts-selected" style="display:none;margin-bottom:0.75rem;
                            padding:0.6rem 0.9rem;border-radius:var(--radius-sm);
                            background:rgba(124,110,247,0.08);border:1px solid rgba(124,110,247,0.25);">
                            <div style="font-size:0.7rem;color:var(--primary-light);font-weight:700;margin-bottom:0.15rem;">CREADOR SELECCIONADO</div>
                            <div id="pts-selected-name" style="font-size:0.88rem;font-weight:700;"></div>
                            <div id="pts-selected-balance" style="font-size:0.72rem;color:var(--text-muted);margin-top:0.1rem;"></div>
                        </div>

                        <div style="display:grid;grid-template-columns:1fr auto;gap:0.6rem;margin-bottom:0.75rem;">
                            <input id="pts-amount" type="number" min="1" max="999" placeholder="Cantidad de puntos"
                                class="input-control">
                            <button id="pts-add-btn" class="btn btn-primary" style="white-space:nowrap;padding:0.55rem 1rem;" disabled>
                                Sumar puntos
                            </button>
                        </div>
                        <p style="font-size:0.7rem;color:var(--text-muted);margin:0;">
                            1 punto = ${DIAMONDS_PER_POINT} <i class="ph-bold ph-diamond"></i> cuando el creador lo canjee.
                        </p>
                    </div>

                    <!-- Creadores con saldo -->
                    <div class="glass-panel" style="padding:1.25rem;">
                        <h3 style="margin-top:0;font-size:0.88rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Saldos actuales</h3>
                        ${!creatorPoints.length
                            ? `<p style="font-size:0.82rem;color:var(--text-muted);text-align:center;padding:1rem 0;">Ningún creador tiene puntos aún.</p>`
                            : `<div style="display:flex;flex-direction:column;gap:0.4rem;">
                                ${creatorPoints.map(c => `
                                    <div style="display:flex;align-items:center;justify-content:space-between;
                                        padding:0.5rem 0.75rem;border-radius:var(--radius-sm);
                                        background:rgba(255,255,255,0.02);border:1px solid var(--glass-border);">
                                        <div>
                                            <span style="font-size:0.82rem;font-weight:600;">@${c.tiktok_username || c.display_name}</span>
                                            ${c.agency ? `<span style="font-size:0.6rem;color:var(--text-muted);margin-left:0.4rem;">${c.agency === 'usa' ? '🇺🇸' : '🌎'}</span>` : ''}
                                        </div>
                                        <span style="font-size:0.85rem;font-weight:800;color:var(--primary-light);"><i class="ph-bold ph-star"></i> ${c.points}</span>
                                    </div>`).join('')}
                               </div>`}
                    </div>
                </div>

                <!-- Panel derecho: canjes -->
                <div class="glass-panel" style="padding:1.25rem;overflow:hidden;">
                    <h3 style="margin-top:0;font-size:0.88rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:1rem;">
                        Historial de canjes
                    </h3>

                    ${!redemptions.length
                        ? `<div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);font-size:0.85rem;">
                            Aún no hay canjes registrados.
                           </div>`
                        : `<div style="display:flex;flex-direction:column;gap:0.5rem;max-height:500px;overflow-y:auto;">
                            ${redemptions.map(r => `
                                <div class="redemption-card" data-id="${r.id}" style="padding:0.85rem 1rem;border:1px solid ${r.status === 'pending' ? 'rgba(251,191,36,0.3)' : 'var(--glass-border)'};border-radius:var(--radius-md);background:${r.status === 'pending' ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)'};">
                                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.35rem;flex-wrap:wrap;">
                                        <div>
                                            <span style="font-size:0.85rem;font-weight:700;">@${r.username}</span>
                                            <span style="font-size:0.7rem;color:var(--text-muted);margin-left:0.4rem;">${timeAgo(r.redeemed_at)}</span>
                                        </div>
                                        <span style="font-size:0.68rem;padding:0.18rem 0.6rem;border-radius:999px;font-weight:700;flex-shrink:0;
                                            background:${r.status === 'processed' ? 'rgba(0,217,166,0.12)' : 'rgba(251,191,36,0.15)'};
                                            color:${r.status === 'processed' ? 'var(--accent)' : '#fbbf24'};">
                                            ${r.status === 'processed' ? '<i class="ph-bold ph-check"></i> Procesado' : '<i class="ph-bold ph-clock"></i> Pendiente'}
                                        </span>
                                    </div>
                                    <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:${r.status === 'pending' ? '0.6rem' : '0'};">
                                        <i class="ph-bold ph-star"></i> <strong>${r.points_redeemed}</strong> puntos
                                        → <strong style="color:var(--accent);">${(r.diamonds_earned).toLocaleString('es')} <i class="ph-bold ph-diamond"></i></strong>
                                    </div>
                                    ${r.status === 'pending' ? `
                                    <button class="btn-process" data-id="${r.id}"
                                        style="font-size:0.72rem;padding:0.3rem 0.75rem;border-radius:var(--radius-sm);
                                               border:1px solid rgba(0,217,166,0.3);background:rgba(0,217,166,0.08);
                                               color:var(--accent);cursor:pointer;font-weight:700;">
                                        <i class="ph-bold ph-check"></i> Marcar como procesado
                                    </button>` : ''}
                                </div>`).join('')}
                           </div>`}
                </div>
            </div>
        </div>`;

    // ── Búsqueda de creador ───────────────────────────────────────────────────
    let selectedCreator = null;
    const searchEl    = container.querySelector('#pts-search');
    const resultsEl   = container.querySelector('#pts-results');
    const selectedEl  = container.querySelector('#pts-selected');
    const selectedName = container.querySelector('#pts-selected-name');
    const selectedBal  = container.querySelector('#pts-selected-balance');
    const amountEl    = container.querySelector('#pts-amount');
    const addBtn      = container.querySelector('#pts-add-btn');

    const selectCreator = (c) => {
        selectedCreator = c;
        selectedName.textContent = `@${c.tiktok_username || c.display_name}`;
        selectedBal.textContent  = `Saldo actual: ${c.points ?? 0} punto${(c.points ?? 0) !== 1 ? 's' : ''}`;
        selectedEl.style.display = 'block';
        addBtn.disabled = false;
        searchEl.value  = '';
        resultsEl.style.display = 'none';
    };

    searchEl.addEventListener('input', () => {
        const q = searchEl.value.toLowerCase().trim();
        if (!q) { resultsEl.style.display = 'none'; return; }
        const matches = creators
            .filter(c =>
                (c.tiktok_username || '').toLowerCase().includes(q) ||
                (c.display_name   || '').toLowerCase().includes(q)
            ).slice(0, 8);

        if (!matches.length) {
            resultsEl.innerHTML = `<p style="font-size:0.75rem;color:var(--text-muted);padding:0.5rem 0.8rem;">Sin resultados</p>`;
        } else {
            resultsEl.innerHTML = matches.map(c => `
                <div data-pid="${c.id}" style="padding:0.45rem 0.8rem;cursor:pointer;font-size:0.78rem;border-bottom:1px solid var(--glass-border);">
                    <span style="font-weight:600;">@${c.tiktok_username || c.display_name}</span>
                    <span style="font-size:0.65rem;color:var(--text-muted);margin-left:0.5rem;">${c.points ?? 0} pts</span>
                </div>`).join('');
            resultsEl.querySelectorAll('[data-pid]').forEach(row => {
                row.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const found = creators.find(c => c.id === row.dataset.pid);
                    if (found) selectCreator(found);
                });
            });
        }
        resultsEl.style.display = 'block';
    });
    searchEl.addEventListener('blur', () => { setTimeout(() => { resultsEl.style.display = 'none'; }, 150); });

    // ── Sumar puntos ─────────────────────────────────────────────────────────
    addBtn.addEventListener('click', async () => {
        if (!selectedCreator) return;
        const delta = parseInt(amountEl.value) || 0;
        if (delta <= 0) return appState.showToast('Ingresa una cantidad válida', 'warning');

        addBtn.disabled = true;
        addBtn.textContent = 'Sumando...';
        try {
            const newBalance = await api.addPoints(selectedCreator.id, delta);
            appState.showToast(`+${delta} punto${delta !== 1 ? 's' : ''} sumado${delta !== 1 ? 's' : ''} a @${selectedCreator.tiktok_username || selectedCreator.display_name}. Nuevo saldo: ${newBalance}`, 'success');
            amountEl.value = '';
            selectedCreator = null;
            selectedEl.style.display = 'none';
            addBtn.disabled = true;
            addBtn.textContent = 'Sumar puntos';
            // Refrescar vista
            const [cp, rd] = await Promise.all([api.listCreatorPoints(), api.listRedemptions()]);
            renderContent(container, cp, rd, allProfiles);
        } catch (err) {
            appState.showToast('Error: ' + err.message, 'danger');
            addBtn.disabled = false;
            addBtn.textContent = 'Sumar puntos';
        }
    });

    // ── Marcar canjes como procesados ─────────────────────────────────────────
    container.querySelectorAll('.btn-process').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Procesando...';
            try {
                await api.markProcessed(btn.dataset.id);
                appState.showToast('Canje marcado como procesado', 'success');
                const [cp, rd] = await Promise.all([api.listCreatorPoints(), api.listRedemptions()]);
                renderContent(container, cp, rd, allProfiles);
            } catch (err) {
                appState.showToast('Error: ' + err.message, 'danger');
                btn.disabled = false;
                btn.innerHTML = '<i class="ph-bold ph-check"></i> Marcar como procesado';
            }
        });
    });
}
