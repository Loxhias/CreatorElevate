import { store } from '../store.js';
import { profiles, push, autoNotif } from '../api.js';
import { appState } from '../main.js';

export async function renderNotificationsView(container) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:220px;margin-bottom:2rem;"></div>
            <div style="display:grid;grid-template-columns:1fr 320px;gap:2rem;">
                <div class="skel-panel" style="height:420px;"></div>
                <div class="skel-panel" style="height:320px;"></div>
            </div>
        </div>`;

    try {
        const allProfiles = store.getProfiles().length ? store.getProfiles() : (await profiles.listAll() || []);
        const metricsData = store.getMetricsData() || [];
        const admins    = allProfiles.filter(p => p.role === 'admin');
        const managers  = allProfiles.filter(p => p.role === 'manager');
        const creators  = allProfiles.filter(p => p.role === 'creator');
        const segments  = calculateSegments(metricsData);

        renderContent(container, allProfiles, admins, managers, creators, segments);
    } catch (error) {
        console.error('Error al cargar notificaciones:', error);
        container.innerHTML = `
            <div style="padding:2rem; text-align:center;">
                <p style="color:var(--danger); margin-bottom:1rem;">Error al cargar los datos del centro de mensajes.</p>
                <button class="btn btn-primary" onclick="location.reload()">Reintentar</button>
            </div>
        `;
    }
}

// Mapea nombre de segmento (valor del select) → clave en el objeto segments
const SEG_KEY = {
    top:          'top',
    potential:    'potential',
    risk:         'risk',
    inactive:     'inactive',
    newinactive:  'newInactive',
    lowvalid:     'lowValid',
    effortlow:    'effortLow',
    novice:       'novice',
    new:          'newOnes',
};

function resolveSegmentToIds(segmentRows, allProfiles) {
    const byUsername = new Map(
        allProfiles
            .filter(p => p.tiktok_username)
            .map(p => [p.tiktok_username.toLowerCase(), p.id])
    );
    return segmentRows
        .map(c => byUsername.get((c.username || '').toLowerCase()))
        .filter(Boolean);
}

function renderContent(container, allProfiles, admins, managers, creators, segments) {
    const resolvedCounts = {};
    for (const [seg, key] of Object.entries(SEG_KEY)) {
        resolvedCounts[key] = resolveSegmentToIds(segments[key] || [], allProfiles).length;
    }

    const creatorsWithAccount = allProfiles.filter(p => p.role === 'creator').length;

    container.innerHTML = `
        <div class="animate-fadeIn">
            <h1 style="margin-bottom:1.5rem;">Centro de Mensajes</h1>

            <div class="two-panel">
                <!-- Formulario de Envío -->
                <div class="glass-panel" style="padding:1.5rem;">
                    <h3 style="margin-top:0;">Nuevo Mensaje</h3>

                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block; font-size:0.8rem; margin-bottom:0.6rem; color:var(--text-secondary);">DESTINATARIOS</label>
                        <div id="target-pills" style="display:flex;flex-wrap:wrap;gap:0.45rem;margin-bottom:0.75rem;">
                            <button class="tpill" data-t="all-creators">📢 Todos los Creadores</button>
                            <button class="tpill" data-t="individual">👤 Buscar Creador</button>
                            <button class="tpill" data-t="by-manager">👔 Por Manager</button>
                            <button class="tpill" data-t="segment">📊 Segmento</button>
                            <button class="tpill" data-t="all-managers">👔 Solo Managers</button>
                            <button class="tpill" data-t="all-admins">🔑 Solo Admins</button>
                        </div>
                        <div id="target-sub" style="margin-bottom:0.5rem;"></div>
                        <p id="target-count" style="font-size:0.75rem; color:var(--accent); margin-top:0.4rem;"></p>
                    </div>

                    <div style="margin-bottom:1.5rem;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                            <label style="font-size:0.8rem;color:var(--text-secondary);">TÍTULO</label>
                            <span id="title-counter" style="font-size:0.65rem;color:var(--text-muted);">0/100</span>
                        </div>
                        <input type="text" id="msg-title" class="input-control" maxlength="100" placeholder="Ej: ¡Hora de transmitir! Tu equipo te espera">
                    </div>

                    <div style="margin-bottom:1.5rem;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                            <label style="font-size:0.8rem;color:var(--text-secondary);">MENSAJE</label>
                            <span id="body-counter" style="font-size:0.65rem;color:var(--text-muted);">0/250</span>
                        </div>
                        <textarea id="msg-body" class="input-control" style="height:120px; resize:none;" maxlength="250" placeholder="Escribe aquí el contenido del mensaje..."></textarea>
                    </div>

                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block;font-size:0.8rem;margin-bottom:0.5rem;color:var(--text-secondary);">DESTINO AL HACER CLIC</label>
                        <select id="msg-dest" class="input-control" style="margin-bottom:0.6rem;">
                            <option value="">Sin acción al hacer clic</option>
                            <optgroup label="Secciones de la app">
                                <option value="goto:capacitaciones">🎓 Capacitaciones</option>
                                <option value="goto:eventos">📅 Eventos</option>
                                <option value="goto:canales">📢 Canales oficiales</option>
                                <option value="goto:normas">📋 Normas</option>
                                <option value="goto:mensajes">🔔 Mensajes / Bandeja</option>
                                <option value="goto:perfil">👤 Perfil</option>
                            </optgroup>
                            <optgroup label="Enlace externo">
                                <option value="external">🔗 URL personalizada...</option>
                            </optgroup>
                        </select>
                        <div id="url-wrap" style="display:none;">
                            <input type="url" id="msg-url" class="input-control" placeholder="https://...">
                            <p id="url-error" style="font-size:0.7rem;color:var(--danger);margin-top:0.3rem;display:none;">Debe comenzar con https://</p>
                        </div>
                    </div>

                    <button id="send-btn" class="btn" style="width:100%; padding:1rem; font-weight:700;">Enviar Notificación</button>
                </div>

                <!-- Panel de Segmentos -->
                <div style="display:flex; flex-direction:column; gap:1.5rem;">
                    <div class="glass-panel" style="padding:1.5rem;">
                        <h4 style="margin-top:0; font-size:0.8rem; color:var(--text-secondary); letter-spacing:0.05em;">SEGMENTOS CALCULADOS</h4>

                        <div style="margin:1rem 0 0.5rem; font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em;">Rendimiento</div>
                        <div style="display:flex; flex-direction:column; gap:0.75rem;">
                            ${renderSegmentStat('🏆 Top 10%',           segments.top.length,       resolvedCounts.top,       'var(--accent)')}
                            ${renderSegmentStat('⚠️ En Riesgo',         segments.risk.length,      resolvedCounts.risk,      'var(--danger)')}
                            ${renderSegmentStat('🔴 Inactivos',             segments.inactive.length,  resolvedCounts.inactive,  '#ef4444')}
                            ${renderSegmentStat('📉 Transmiten / sin días', segments.lowValid.length,  resolvedCounts.lowValid,  '#a78bfa')}
                            ${renderSegmentStat('💪 Alto esf. / bajo 💎',   segments.effortLow.length, resolvedCounts.effortLow, '#f59e0b')}
                            ${renderSegmentStat('⚡ Con Potencial',      segments.potential.length, resolvedCounts.potential, '#6366f1')}
                        </div>

                        <div style="margin:1.2rem 0 0.5rem; font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em;">Etapa</div>
                        <div style="display:flex; flex-direction:column; gap:0.75rem;">
                            ${renderSegmentStat('🆕 Nuevos',              segments.newOnes.length,    resolvedCounts.newOnes,    'var(--primary)')}
                            ${renderSegmentStat('🆕🔴 Nuevos sin transmitir', segments.newInactive.length, resolvedCounts.newInactive, '#f97316')}
                            ${renderSegmentStat('🔰 Novatos',             segments.novice.length,     resolvedCounts.novice,     'var(--text-secondary)')}
                        </div>

                        <p style="font-size:0.65rem; color:var(--text-muted); margin-top:1rem; line-height:1.4;">
                            ✓ = creadores con perfil registrado que pueden recibir push.
                        </p>
                    </div>

                    <div class="glass-panel" style="padding:1.25rem;">
                        <h4 style="margin-top:0; font-size:0.8rem; color:var(--text-secondary); letter-spacing:0.05em;">CRITERIOS</h4>
                        <div style="display:flex; flex-direction:column; gap:0.6rem; font-size:0.7rem; color:var(--text-muted); line-height:1.4;">
                            <div><strong style="color:var(--danger);">En Riesgo</strong> — Menos de 5 días válidos y diamantes &lt; 50% del promedio</div>
                            <div><strong style="color:#ef4444;">Inactivos</strong> — 0 días válidos de emisión este período</div>
                            <div><strong style="color:#f59e0b;">Alto esf. / bajo 💎</strong> — Por encima del promedio de horas, por debajo del 60% del promedio de diamantes</div>
                            <div><strong style="color:#6366f1;">Con Potencial</strong> — Top 25% en horas, pero por debajo del promedio de diamantes</div>
                            <div><strong style="color:#f97316;">Nuevos sin transmitir</strong> — Primer mes y 0 días válidos</div>
                            <div><strong style="color:#a78bfa;">Transmiten sin días válidos</strong> — Tienen horas de LIVE pero ≤ 3 días válidos</div>
                            <div><strong style="color:var(--primary);">Nuevos</strong> — Menos de 30 días en la agencia</div>
                        </div>
                    </div>

                    <!-- Recordatorios automáticos -->
                    <div class="glass-panel" style="padding:1.25rem;">
                        <h4 style="margin-top:0; font-size:0.8rem; color:var(--text-secondary); letter-spacing:0.05em;">⚡ RECORDATORIOS AUTOMÁTICOS</h4>
                        <div id="inactivity-panel">
                            <p style="font-size:0.78rem;color:var(--text-secondary);margin:0 0 0.75rem;line-height:1.5;">
                                Envía un recordatorio a los creadores con <strong>0 días válidos</strong> en el período actual.
                                Cooldown de <strong>7 días</strong> por creador para evitar spam.
                            </p>
                            <div id="inactivity-preview" style="display:none;margin-bottom:0.75rem;
                                padding:0.6rem 0.85rem;border-radius:var(--radius-sm);
                                background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);
                                font-size:0.75rem;color:var(--text-secondary);line-height:1.6;"></div>
                            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                                <button id="inactivity-check-btn" class="btn btn-ghost" style="font-size:0.78rem;flex:1;">
                                    🔍 Ver quiénes recibirán el mensaje
                                </button>
                                <button id="inactivity-send-btn" class="btn btn-primary" style="font-size:0.78rem;flex:1;display:none;">
                                    📣 Enviar recordatorios
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Historial de Enviados -->
            <div style="margin-top:2.5rem;">
                <h3 style="margin-bottom:1rem;font-size:0.9rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Historial de Enviados</h3>
                <div id="historial-wrap" style="display:flex;flex-direction:column;gap:0.6rem;"></div>
            </div>
        </div>
    `;

    const targetCount = container.querySelector('#target-count');
    const sendBtn     = container.querySelector('#send-btn');

    let tState = { type: 'all-creators', selectedIds: [], managerId: null, segment: null, agency: null };

    const pillContainer = container.querySelector('#target-pills');
    const subEl         = container.querySelector('#target-sub');

    // Helper: filtra perfiles por agencia según tState.agency (null = todas)
    const agencyProfiles = (list) => tState.agency
        ? list.filter(p => (p.agency || 'latam') === tState.agency)
        : list;

    // Render del toggle de agencia (se inserta encima de las pills)
    const agencyRow = document.createElement('div');
    agencyRow.style.cssText = 'display:flex;gap:0.3rem;margin-bottom:0.6rem;';
    const agencyOpts = [
        { val: null,    label: '🌐 Todas' },
        { val: 'latam', label: '🌎 LATAM' },
        { val: 'usa',   label: '🇺🇸 USA'  },
    ];
    const agPillStyle = (active) =>
        `font-size:0.72rem;padding:0.25rem 0.65rem;border-radius:999px;cursor:pointer;font-weight:600;` +
        `background:${active ? 'rgba(124,110,247,0.2)' : 'rgba(255,255,255,0.03)'};` +
        `border:1.5px solid ${active ? 'var(--primary)' : 'var(--glass-border)'};` +
        `color:${active ? 'var(--primary-light)' : 'var(--text-muted)'};`;
    const renderAgencyRow = () => {
        agencyRow.innerHTML = agencyOpts.map(o =>
            `<button class="ag-filter" data-ag="${o.val ?? ''}"
                style="${agPillStyle(tState.agency === o.val)}">${o.label}</button>`
        ).join('');
        agencyRow.querySelectorAll('.ag-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                tState.agency = btn.dataset.ag || null;
                renderAgencyRow();
                renderSub();
            });
        });
    };
    renderAgencyRow();
    pillContainer.insertAdjacentElement('beforebegin', agencyRow);

    const pillStyle = (active) =>
        `font-size:0.75rem;padding:0.35rem 0.75rem;border-radius:999px;cursor:pointer;font-weight:600;` +
        `background:${active ? 'rgba(124,110,247,0.2)' : 'rgba(255,255,255,0.04)'};` +
        `border:1.5px solid ${active ? 'var(--primary)' : 'var(--glass-border)'};` +
        `color:${active ? 'var(--primary-light)' : 'var(--text-secondary)'};`;

    const updatePillStyles = () => {
        pillContainer.querySelectorAll('.tpill').forEach(b => {
            b.style.cssText = pillStyle(b.dataset.t === tState.type);
        });
    };

    const updateCount = () => {
        const agLabel = tState.agency === 'usa' ? ' · USA' : tState.agency === 'latam' ? ' · LATAM' : '';
        let text = '';
        if (tState.type === 'all-creators') {
            const n = agencyProfiles(allProfiles.filter(p => p.role === 'creator')).length;
            text = `${n} creador${n !== 1 ? 'es' : ''} con cuenta${agLabel}`;
        } else if (tState.type === 'all-managers') {
            const n = agencyProfiles(managers).length;
            text = `${n} manager${n !== 1 ? 's' : ''}${agLabel}`;
        } else if (tState.type === 'all-admins') {
            text = `${admins.length} administrador${admins.length !== 1 ? 'es' : ''}`;
        } else if (tState.type === 'individual') {
            const n = tState.selectedIds.length;
            text = n ? `${n} creador${n !== 1 ? 'es' : ''} seleccionado${n !== 1 ? 's' : ''}` : 'Sin creadores seleccionados';
        } else if (tState.type === 'by-manager' && tState.managerId) {
            const mgr = agencyProfiles(managers).find(m => m.id === tState.managerId);
            const cnt = agencyProfiles(creators).filter(c => c.manager_id === tState.managerId).length;
            text = `${cnt} creador${cnt !== 1 ? 'es' : ''} de ${esc(mgr?.display_name || mgr?.tiktok_username || 'este manager')}`;
        } else if (tState.type === 'segment' && tState.segment) {
            const key = SEG_KEY[tState.segment] || tState.segment;
            const total = (segments[key] || []).length;
            const resolved = resolveSegmentToIds(segments[key] || [], agencyProfiles(allProfiles)).length;
            text = `${resolved} con cuenta (${total} en segmento total)${agLabel}`;
        }
        targetCount.textContent = text ? `→ ${text}` : '';
    };

    const renderSubIndividual = () => {
        const pool = tState.agency
            ? creators.filter(c => (c.agency || 'latam') === tState.agency)
            : creators;

        subEl.innerHTML = `
            <div>
                <input id="creator-filter" type="text" class="input-control"
                       placeholder="Filtrar por nombre o @usuario..."
                       autocomplete="off" style="margin-bottom:0.5rem;">
                <div id="creator-list" style="
                    max-height:230px;overflow-y:auto;
                    border:1px solid var(--glass-border);border-radius:var(--radius-md);
                    background:rgba(18,18,32,0.6);margin-bottom:0.5rem;"></div>
                <div id="selected-chips" style="display:flex;flex-wrap:wrap;gap:0.4rem;min-height:20px;"></div>
            </div>`;

        const filterInput = subEl.querySelector('#creator-filter');
        const listEl      = subEl.querySelector('#creator-list');
        const chipsEl     = subEl.querySelector('#selected-chips');

        const renderRows = () => {
            const q = filterInput.value.toLowerCase().trim();
            const visible = pool.filter(c =>
                !q ||
                (c.display_name || '').toLowerCase().includes(q) ||
                (c.tiktok_username || '').toLowerCase().includes(q)
            );
            if (!visible.length) {
                listEl.innerHTML = `<p style="font-size:0.75rem;color:var(--text-muted);padding:0.75rem;text-align:center;">Sin resultados</p>`;
                return;
            }
            listEl.innerHTML = visible.map(c => {
                const sel = tState.selectedIds.includes(c.id);
                return `<div data-pid="${c.id}" style="
                    display:flex;align-items:center;gap:0.7rem;
                    padding:0.45rem 0.8rem;cursor:pointer;
                    border-bottom:1px solid var(--glass-border);
                    background:${sel ? 'rgba(124,110,247,0.1)' : 'transparent'};">
                    <div style="width:16px;height:16px;border-radius:4px;flex-shrink:0;
                        background:${sel ? 'var(--primary)' : 'transparent'};
                        border:2px solid ${sel ? 'var(--primary)' : 'rgba(255,255,255,0.2)'};
                        display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;">
                        ${sel ? '✓' : ''}
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
                    if (tState.selectedIds.includes(id)) {
                        tState.selectedIds = tState.selectedIds.filter(x => x !== id);
                    } else {
                        tState.selectedIds.push(id);
                    }
                    renderRows();
                    renderChips();
                    updateCount();
                });
            });
        };

        const renderChips = () => {
            if (!tState.selectedIds.length) { chipsEl.innerHTML = ''; return; }
            chipsEl.innerHTML = tState.selectedIds.map(id => {
                const p    = creators.find(c => c.id === id);
                const name = esc(p?.display_name || p?.tiktok_username || id.slice(0, 8));
                return `<span style="display:inline-flex;align-items:center;gap:0.3rem;
                    font-size:0.72rem;padding:0.2rem 0.4rem 0.2rem 0.7rem;
                    background:rgba(124,110,247,0.18);border:1px solid var(--primary);
                    border-radius:999px;color:var(--primary-light);">
                    ${name}
                    <button data-rid="${id}" style="background:none;border:none;cursor:pointer;
                        color:var(--primary-light);font-size:0.9rem;padding:0 0.1rem;line-height:1;">✕</button>
                </span>`;
            }).join('');
            chipsEl.querySelectorAll('[data-rid]').forEach(btn => {
                btn.addEventListener('click', () => {
                    tState.selectedIds = tState.selectedIds.filter(id => id !== btn.dataset.rid);
                    renderRows();
                    renderChips();
                    updateCount();
                });
            });
        };

        filterInput.addEventListener('input', renderRows);
        renderRows();
        renderChips();
    };

    const renderSubManager = () => {
        const filteredMgrs = agencyProfiles(managers);
        if (!filteredMgrs.length) {
            subEl.innerHTML = `<p style="font-size:0.78rem;color:var(--text-muted);">No hay managers${tState.agency ? ' en esta agencia' : ''} registrados.</p>`;
            return;
        }
        subEl.innerHTML = filteredMgrs.map(m => {
            const cnt    = agencyProfiles(creators).filter(c => c.manager_id === m.id).length;
            const active = tState.managerId === m.id;
            return `<button class="mgr-pill" data-mid="${m.id}"
                style="${pillStyle(active)}margin:0 0.4rem 0.4rem 0;">
                👔 ${esc(m.display_name || m.tiktok_username || m.email)}
                <span style="opacity:0.65;">(${cnt})</span>
            </button>`;
        }).join('');
        subEl.querySelectorAll('.mgr-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                tState.managerId = btn.dataset.mid;
                renderSubManager();
                updateCount();
            });
        });
    };

    const renderSubSegment = () => {
        const SEGS = [
            { key:'top',         val:'top',         label:'🏆 Top 10%' },
            { key:'risk',        val:'risk',        label:'⚠️ En Riesgo' },
            { key:'inactive',    val:'inactive',    label:'🔴 Inactivos' },
            { key:'lowValid',    val:'lowvalid',    label:'📉 Sin días válidos' },
            { key:'effortLow',   val:'effortlow',   label:'💪 Alto esf. / bajo 💎' },
            { key:'potential',   val:'potential',   label:'⚡ Con Potencial' },
            { key:'newOnes',     val:'new',         label:'🆕 Nuevos' },
            { key:'newInactive', val:'newinactive', label:'🆕🔴 Sin transmitir aún' },
            { key:'novice',      val:'novice',      label:'🔰 Novatos' },
        ];
        subEl.innerHTML = SEGS.map(s => {
            const active   = tState.segment === s.val;
            const resolved = resolvedCounts[s.key] ?? 0;
            return `<button class="seg-pill" data-sval="${s.val}"
                style="${pillStyle(active)}margin:0 0.4rem 0.4rem 0;">
                ${s.label} <span style="opacity:0.65;">(${resolved}✓)</span>
            </button>`;
        }).join('');
        subEl.querySelectorAll('.seg-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                tState.segment = btn.dataset.sval;
                renderSubSegment();
                updateCount();
            });
        });
    };

    const renderSub = () => {
        subEl.innerHTML = '';
        if (tState.type === 'individual')       renderSubIndividual();
        else if (tState.type === 'by-manager')  renderSubManager();
        else if (tState.type === 'segment')     renderSubSegment();
        updatePillStyles();
        updateCount();
    };

    pillContainer.querySelectorAll('.tpill').forEach(btn => {
        btn.addEventListener('click', () => {
            tState = { type: btn.dataset.t, selectedIds: [], managerId: null, segment: null, agency: tState.agency };
            renderSub();
        });
    });

    renderSub();

    // Contadores de caracteres
    const titleInput   = container.querySelector('#msg-title');
    const bodyInput    = container.querySelector('#msg-body');
    const titleCounter = container.querySelector('#title-counter');
    const bodyCounter  = container.querySelector('#body-counter');

    titleInput.addEventListener('input', () => {
        const n = titleInput.value.length;
        titleCounter.textContent = `${n}/100`;
        titleCounter.style.color = n > 85 ? 'var(--danger)' : n > 70 ? '#f59e0b' : 'var(--text-muted)';
    });
    bodyInput.addEventListener('input', () => {
        const n = bodyInput.value.length;
        bodyCounter.textContent = `${n}/250`;
        bodyCounter.style.color = n > 220 ? 'var(--danger)' : n > 180 ? '#f59e0b' : 'var(--text-muted)';
    });

    // Selector de destino — mostrar/ocultar input de URL externa
    const destSelect = container.querySelector('#msg-dest');
    const urlWrap    = container.querySelector('#url-wrap');
    const urlInput   = container.querySelector('#msg-url');
    const urlError   = container.querySelector('#url-error');

    destSelect.addEventListener('change', () => {
        const isExt = destSelect.value === 'external';
        urlWrap.style.display = isExt ? 'block' : 'none';
        if (!isExt && urlInput) { urlInput.value = ''; }
    });

    if (urlInput) {
        urlInput.addEventListener('blur', () => {
            const v = urlInput.value.trim();
            urlError.style.display = v && !v.startsWith('https://') ? 'block' : 'none';
        });
        urlInput.addEventListener('input', () => {
            if (urlError.style.display !== 'none') urlError.style.display = 'none';
        });
    }

    sendBtn.addEventListener('click', async () => {
        const title  = titleInput.value.trim();
        const body   = bodyInput.value.trim();
        const dest = destSelect.value;

        if (!title) return appState.showToast('El título es obligatorio', 'warning');
        if (!body)  return appState.showToast('El mensaje es obligatorio', 'warning');

        // Construir URLs: dbUrl se guarda en BD (goto:X ó https://...), pushUrl va a OneSignal (siempre http o null)
        let dbUrl   = null;
        let pushUrl = undefined;

        if (dest.startsWith('goto:')) {
            const route = dest.slice(5);
            dbUrl   = dest;
            pushUrl = `${location.origin}${location.pathname}?goto=${route}`;
        } else if (dest === 'external') {
            const raw = urlInput?.value.trim() || '';
            if (raw && !raw.startsWith('https://')) {
                if (urlError) urlError.style.display = 'block';
                return appState.showToast('La URL debe comenzar con https://', 'warning');
            }
            dbUrl = raw || null;
            // Ruta el clic por nuestra app para evitar que Android intercepte el
            // dominio como App Link y envíe al Play Store (ej: meet.google.com).
            pushUrl = raw ? `${location.origin}/?openext=${encodeURIComponent(raw)}` : undefined;
        }

        let finalTarget;
        if (tState.type === 'all-creators') {
            if (tState.agency) {
                // Con agencia: resuelve a lista de IDs filtrada
                const ids = agencyProfiles(allProfiles.filter(p => p.role === 'creator')).map(p => p.id).filter(Boolean);
                if (!ids.length) return appState.showToast('No hay creadores en esta agencia con cuenta registrada', 'warning');
                finalTarget = { type: 'users', value: ids };
            } else {
                finalTarget = { type: 'role', value: 'creator' };
            }
        } else if (tState.type === 'all-managers') {
            if (tState.agency) {
                const ids = agencyProfiles(managers).map(m => m.id).filter(Boolean);
                if (!ids.length) return appState.showToast('No hay managers en esta agencia', 'warning');
                finalTarget = { type: 'users', value: ids };
            } else {
                finalTarget = { type: 'role', value: 'manager' };
            }
        } else if (tState.type === 'all-admins') {
            finalTarget = { type: 'role', value: 'admin' };
        } else if (tState.type === 'individual') {
            if (!tState.selectedIds.length) return appState.showToast('Seleccioná al menos un creador', 'warning');
            finalTarget = tState.selectedIds.length === 1
                ? { type: 'user',  value: tState.selectedIds[0] }
                : { type: 'users', value: tState.selectedIds };
        } else if (tState.type === 'by-manager') {
            if (!tState.managerId) return appState.showToast('Seleccioná un manager', 'warning');
            const ids = agencyProfiles(creators).filter(c => c.manager_id === tState.managerId).map(c => c.id).filter(Boolean);
            if (!ids.length) return appState.showToast('Este manager no tiene creadores registrados', 'warning');
            finalTarget = { type: 'users', value: ids };
        } else if (tState.type === 'segment') {
            if (!tState.segment) return appState.showToast('Seleccioná un segmento', 'warning');
            const key = SEG_KEY[tState.segment] || tState.segment;
            const ids = resolveSegmentToIds(segments[key] || [], agencyProfiles(allProfiles));
            if (!ids.length) return appState.showToast('Ningún creador de este segmento tiene cuenta registrada', 'warning');
            finalTarget = { type: 'users', value: ids };
        } else {
            finalTarget = { type: 'all', value: null };
        }

        sendBtn.disabled  = true;
        sendBtn.innerText = 'Enviando...';

        try {
            await push.send({ title, body, url: pushUrl, target: finalTarget });
            await push.saveToDb(title, body, dbUrl, finalTarget);
            appState.showToast('¡Notificación enviada!', 'success');
            titleInput.value = '';
            bodyInput.value  = '';
            destSelect.value = '';
            urlWrap.style.display = 'none';
            tState = { type: 'all-creators', selectedIds: [], managerId: null, segment: null, agency: tState.agency };
            renderAgencyRow();
            renderSub();
            loadHistorial(container);
        } catch (e) {
            console.error('[send-push] error:', e);
            appState.showToast('Error al enviar: ' + e.message, 'danger');
        } finally {
            sendBtn.disabled  = false;
            sendBtn.innerText = 'Enviar Notificación';
        }
    });

    // Cargar historial al abrir
    loadHistorial(container);

    // ── Panel de recordatorios de inactividad ────────────────────────────────
    wireInactivityPanel(container, allProfiles, segments);
}

async function wireInactivityPanel(container, allProfiles, segments) {
    const checkBtn   = container.querySelector('#inactivity-check-btn');
    const sendBtn    = container.querySelector('#inactivity-send-btn');
    const previewEl  = container.querySelector('#inactivity-preview');
    if (!checkBtn) return;

    // Creadores con 0 días válidos en el período actual, con al menos 5 días en la agencia
    const inactiveMetrics = (segments.inactive || []).concat(segments.newInactive || []);
    const byUsername = new Map(
        allProfiles.filter(p => p.tiktok_username).map(p => [p.tiktok_username.toLowerCase(), p])
    );
    const inactiveProfiles = [];
    const seen = new Set();
    for (const m of inactiveMetrics) {
        const p = byUsername.get((m.username || '').toLowerCase());
        if (p && !seen.has(p.id)) {
            seen.add(p.id);
            if ((p.days_since_joining ?? 999) >= 5) inactiveProfiles.push(p);
        }
    }

    let toNotifyIds = [];

    checkBtn.addEventListener('click', async () => {
        checkBtn.disabled = true;
        checkBtn.textContent = 'Verificando...';
        try {
            const allIds = inactiveProfiles.map(p => p.id);
            const cooldownSet = await autoNotif.getCooldownIds(allIds, 7);
            toNotifyIds = allIds.filter(id => !cooldownSet.has(id));
            const skipped = cooldownSet.size;

            if (!toNotifyIds.length) {
                previewEl.innerHTML = `✅ Todos los creadores inactivos ya recibieron un recordatorio en los últimos 7 días. Ninguno pendiente.`;
                previewEl.style.display = 'block';
                sendBtn.style.display = 'none';
            } else {
                const names = toNotifyIds.slice(0, 5).map(id => {
                    const p = allProfiles.find(x => x.id === id);
                    return `@${p?.tiktok_username || p?.display_name || id.slice(0,8)}`;
                }).join(', ');
                previewEl.innerHTML =
                    `<strong style="color:var(--danger);">🔴 ${toNotifyIds.length} creador${toNotifyIds.length !== 1 ? 'es' : ''}</strong> recibirán el recordatorio` +
                    (skipped ? ` · <span style="color:var(--text-muted);">${skipped} omitidos (cooldown activo)</span>` : '') +
                    `<br><span style="font-size:0.68rem;color:var(--text-muted);">${names}${toNotifyIds.length > 5 ? ` y ${toNotifyIds.length - 5} más...` : ''}</span>`;
                previewEl.style.display = 'block';
                sendBtn.style.display   = '';
            }
        } catch (err) {
            appState.showToast('Error al verificar: ' + err.message, 'danger');
        } finally {
            checkBtn.disabled = false;
            checkBtn.textContent = '🔍 Ver quiénes recibirán el mensaje';
        }
    });

    sendBtn.addEventListener('click', async () => {
        if (!toNotifyIds.length) return;
        sendBtn.disabled = true;
        sendBtn.textContent = 'Enviando...';
        try {
            const target = toNotifyIds.length === 1
                ? { type: 'user',  value: toNotifyIds[0] }
                : { type: 'users', value: toNotifyIds };
            await push.send({
                title: '¡Es hora de transmitir! 🔴',
                body:  'Tu equipo te extraña en LIVE. ¡Conectate hoy y sumá días válidos!',
                url:   undefined,
                target,
            });
            await push.saveToDb('¡Es hora de transmitir! 🔴', 'Tu equipo te extraña en LIVE. ¡Conectate hoy y sumá días válidos!', null, target);
            await autoNotif.logInactivity(toNotifyIds);
            appState.showToast(`✅ Recordatorios enviados a ${toNotifyIds.length} creador${toNotifyIds.length !== 1 ? 'es' : ''}`, 'success');
            toNotifyIds = [];
            sendBtn.style.display = 'none';
            previewEl.innerHTML = `✅ Recordatorios enviados. Próxima ventana disponible en 7 días.`;
            loadHistorial(container);
        } catch (err) {
            appState.showToast('Error al enviar: ' + err.message, 'danger');
            sendBtn.disabled = false;
            sendBtn.textContent = '📣 Enviar recordatorios';
        }
    });
}

function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function loadHistorial(container) {
    const wrap = container.querySelector('#historial-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:0.6rem;">
        ${Array(3).fill('<div class="skel-panel" style="height:60px;"></div>').join('')}
    </div>`;

    push.listSent().then(items => {
        if (!items.length) {
            wrap.innerHTML = `<p style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:1.5rem 0;">Aún no se enviaron notificaciones.</p>`;
            return;
        }

        const targetLabel = (type, value) => {
            if (type === 'all')  return '📢 Todos';
            if (type === 'role') return value === 'admin' ? '🔑 Admins' : value === 'manager' ? '👔 Managers' : '🎭 Creadores';
            if (type === 'user') return '👤 1 persona';
            if (type === 'users') {
                try { return `👥 ${JSON.parse(value).length} creadores`; } catch { return '👥 Segmento'; }
            }
            return type;
        };

        const timeAgo = (iso) => {
            const s = Math.floor((Date.now() - new Date(iso)) / 1000);
            if (s < 60)    return 'hace un momento';
            if (s < 3600)  return `hace ${Math.floor(s / 60)} min`;
            if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
            return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
        };

        const GOTO_NAMES = {
            capacitaciones: '🎓 Capacitaciones', eventos: '📅 Eventos', canales: '📢 Canales',
            normas: '📋 Normas', mensajes: '🔔 Mensajes', perfil: '👤 Perfil',
        };
        const destLabel = (url) => {
            if (!url) return null;
            if (url.startsWith('goto:')) return GOTO_NAMES[url.slice(5)] || url.slice(5);
            return '🔗 Enlace externo';
        };

        wrap.innerHTML = items.map(n => `
            <div style="padding:0.75rem 1rem;border:1px solid var(--glass-border);border-radius:var(--radius-md);
                        background:rgba(255,255,255,0.02);">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.25rem;">
                    <span style="font-size:0.82rem;font-weight:700;color:var(--text-primary);">${esc(n.title)}</span>
                    <span style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">${timeAgo(n.sent_at)}</span>
                </div>
                <p style="font-size:0.73rem;color:var(--text-muted);margin:0 0 0.35rem;line-height:1.4;
                           overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">
                    ${esc(n.body)}
                </p>
                <div style="display:flex;gap:0.8rem;align-items:center;flex-wrap:wrap;">
                    <span style="font-size:0.65rem;background:rgba(255,255,255,0.06);border-radius:999px;
                                 padding:0.1rem 0.5rem;color:var(--text-secondary);">
                        ${targetLabel(n.target_type, n.target_value)}
                    </span>
                    ${destLabel(n.url) ? `<span style="font-size:0.65rem;background:rgba(124,110,247,0.1);border-radius:999px;padding:0.1rem 0.5rem;color:var(--primary-light);">${destLabel(n.url)}</span>` : ''}
                    ${n.delivered != null ? `<span style="font-size:0.62rem;color:var(--accent);">✓ ${n.delivered} entregadas</span>` : ''}
                    ${n.failed    != null && n.failed > 0 ? `<span style="font-size:0.62rem;color:var(--danger);">✗ ${n.failed} fallidas</span>` : ''}
                </div>
            </div>`).join('');
    }).catch(() => {
        wrap.innerHTML = `<p style="font-size:0.8rem;color:var(--danger);padding:1rem 0;">Error al cargar el historial.</p>`;
    });
}

function renderSegmentStat(label, total, resolved, color) {
    return `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.78rem; font-weight:600; color:var(--text-secondary);">${label}</span>
            <div style="text-align:right;">
                <span style="font-size:0.9rem; font-weight:800; color:${color};">${total}</span>
                <span style="font-size:0.65rem; color:var(--text-muted); margin-left:0.3rem;">(${resolved} ✓)</span>
            </div>
        </div>
    `;
}

function calculateSegments(metrics) {
    const empty = { top: [], potential: [], risk: [], inactive: [], newInactive: [], lowValid: [], effortLow: [], novice: [], newOnes: [] };
    if (!metrics || !metrics.length) return empty;

    const avg        = metrics.reduce((s, c) => s + Number(c.diamonds), 0)    / metrics.length;
    const avgSeconds = metrics.reduce((s, c) => s + Number(c.liveSeconds), 0) / metrics.length;

    // Top 10% por diamantes
    const sorted = [...metrics].sort((a, b) => b.diamonds - a.diamonds);
    const top = sorted.slice(0, Math.max(1, Math.ceil(metrics.length * 0.1)));

    // En Riesgo: pocos días válidos Y diamantes por debajo del 50% del promedio
    const risk = metrics.filter(c => c.validDays < 5 && Number(c.diamonds) < avg * 0.5);

    // Inactivos: 0 días válidos de emisión en el período
    const inactive = metrics.filter(c => c.validDays === 0);

    // Nuevos sin transmitir: primer mes en la agencia y sin ningún día válido
    const newInactive = metrics.filter(c =>
        c.daysSinceJoining != null && c.daysSinceJoining < 30 && c.validDays === 0
    );

    // Transmiten pero sin días válidos: tienen horas de LIVE pero ≤ 3 días válidos
    // (están transmitiendo pero sin cumplir requisitos mínimos de validez)
    const lowValid = metrics.filter(c =>
        Number(c.liveSeconds) > 0 && c.validDays <= 3
    );

    // Alto esfuerzo, bajo rendimiento: más horas que el promedio pero <60% del promedio de diamantes
    const effortLow = metrics.filter(c =>
        Number(c.liveSeconds) > avgSeconds &&
        Number(c.diamonds) < avg * 0.6
    );

    // Con Potencial: top 25% en horas pero por debajo del promedio de diamantes
    const byHours  = [...metrics].sort((a, b) => b.liveSeconds - a.liveSeconds);
    const topHours = byHours.slice(0, Math.ceil(metrics.length * 0.25));
    const potential = topHours.filter(c => Number(c.diamonds) < avg);

    // Novatos: menos de 60 días en la agencia
    const novice = metrics.filter(c => c.daysSinceJoining != null && c.daysSinceJoining < 60);

    // Nuevos: menos de 30 días en la agencia
    const newOnes = metrics.filter(c => c.daysSinceJoining != null && c.daysSinceJoining < 30);

    return { top, potential, risk, inactive, newInactive, lowValid, effortLow, novice, newOnes };
}
