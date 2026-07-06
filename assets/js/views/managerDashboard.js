import { store } from '../store.js';
import { isSupabaseConfigured } from '../supabase.js';
import { profiles, push } from '../api.js';

function fmt(n) { return Number(n).toLocaleString('es'); }

function liveHours(seconds) {
    const h = Math.floor(Number(seconds || 0) / 3600);
    return h > 0 ? `${h}h` : '—';
}

// Tarjeta destacada arriba del panel del manager — resalta lo más urgente de
// su equipo (mismo tratamiento visual que el "incentive hero" del creador,
// ver assets/css/style.css .incentive-hero*). No duplica lógica: usa los
// mismos conteos (atRiskCount/inactiveCount/activeCount) ya calculados.
function renderTeamIncentiveHero({ total, activeCount, inactiveCount, atRiskCount }) {
    if (!total) return '';
    let kicker, big, sub, icon, accent, urgent;

    if (atRiskCount > 0) {
        icon = '⚠️'; accent = '#f59e0b';
        kicker = 'EQUIPO EN RIESGO';
        big = `${atRiskCount}`;
        sub = `creador${atRiskCount !== 1 ? 'es' : ''} con bajo rendimiento — escribeles antes de que pierdan el bono`;
        urgent = true;
    } else if (inactiveCount > 0) {
        icon = '🔴'; accent = 'var(--danger)';
        kicker = '¡ACTIVÁ A TU EQUIPO!';
        big = `${inactiveCount}`;
        sub = `sin ningún día válido este mes — un mensaje a tiempo puede salvarlos`;
        urgent = true;
    } else {
        icon = '🏆'; accent = 'var(--accent)';
        kicker = '¡EQUIPO AL 100%!';
        big = `${activeCount}/${total}`;
        sub = 'creadores activos este mes — excelente supervisión';
        urgent = false;
    }

    return `
        <div class="glass-panel incentive-hero animate-fadeIn${urgent ? ' incentive-hero--urgent' : ''}" style="position:relative;overflow:hidden;padding:1.2rem 1.35rem;margin-bottom:1.5rem;border-color:${accent}55;background:linear-gradient(135deg,${accent}17,transparent 65%);">
            <div class="incentive-hero__glow" style="--glow-color:${accent};"></div>
            <div style="position:relative;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
                <div style="font-size:2rem;line-height:1;filter:drop-shadow(0 0 8px ${accent}66);flex-shrink:0;">${icon}</div>
                <div style="flex:1;min-width:190px;">
                    <div style="font-size:0.66rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${accent};margin-bottom:0.2rem;display:flex;align-items:center;gap:0.4rem;">
                        ${urgent ? `<span class="incentive-hero__dot" style="--glow-color:${accent};"></span>` : ''}${kicker}
                    </div>
                    <div class="incentive-hero__number" style="font-size:clamp(1.5rem,6vw,2.1rem);font-weight:900;line-height:1.1;color:#fff;">${big}</div>
                    <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.15rem;">${sub}</div>
                </div>
                <button class="btn btn-sm incentive-hero__cta" id="team-hero-cta" style="flex-shrink:0;background:${accent};color:#04150a;font-weight:800;white-space:nowrap;">Ver equipo</button>
            </div>
        </div>`;
}

function creatorStatus(c, groupAvg) {
    if (c.validDays === 0)
        return { label: 'Inactivo', color: 'var(--danger)', bg: 'rgba(255,85,105,0.12)', icon: '🔴' };
    if (c.validDays < 5 && Number(c.diamonds) < groupAvg * 0.5)
        return { label: 'En riesgo', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⚠️' };
    if (c.daysSinceJoining != null && c.daysSinceJoining < 30)
        return { label: 'Nuevo', color: 'var(--primary-light)', bg: 'rgba(124,110,247,0.12)', icon: '🆕' };
    return { label: 'Activo', color: 'var(--accent)', bg: 'rgba(0,217,166,0.1)', icon: '✅' };
}

export async function renderManagerDashboard(container, targetManagerId = null) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:36px;width:260px;margin-bottom:1.5rem;"></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1.2rem;margin-bottom:2rem;">
                ${Array(4).fill('<div class="skel-panel" style="height:90px;"></div>').join('')}
            </div>
            <div class="skel" style="height:20px;width:180px;margin-bottom:1rem;"></div>
            <div class="skel-panel" style="height:260px;"></div>
        </div>`;

    if (isSupabaseConfigured && !targetManagerId && !store.getMetricsData()?.length) {
        await store.refreshMetrics().catch(() => {});
    }

    const data = store.getMetricsData() || [];
    const currentUser = store.getCurrentUser();

    const isAuditing    = !!targetManagerId;
    const activeManagerId   = targetManagerId || currentUser.id;
    const activeManagerName = targetManagerId ? 'Auditoría de Manager' : (currentUser.username || 'Mi Grupo');

    if (!data.length) {
        container.innerHTML = `
            <div class="glass-panel" style="padding:3rem;text-align:center;color:var(--text-muted);">
                <p>No hay datos disponibles en el sistema.</p>
                <p style="font-size:0.85rem;margin-top:0.5rem;">Pídele al Administrador que cargue el archivo de métricas más reciente.</p>
            </div>`;
        return;
    }

    let myCreatorUsernames = new Set();
    let labelManager = activeManagerName;

    if (isSupabaseConfigured && activeManagerId) {
        const cached = store.getManagerGroup(activeManagerId);
        if (cached) {
            cached.forEach(u => myCreatorUsernames.add(u));
        } else {
            try {
                const list = await profiles.listMyCreators(activeManagerId);
                list.forEach(c => c.username && myCreatorUsernames.add(c.username.toLowerCase()));
                store.setManagerGroup(activeManagerId, new Set(myCreatorUsernames));
            } catch (e) { console.warn('Error fetching group:', e); }
        }
    } else if (!isSupabaseConfigured) {
        const numMatch = (activeManagerName || '').match(/\d+/);
        const target = numMatch ? `Manager ${numMatch[0]}` : 'Manager 1';
        labelManager = target;
        data.filter(c => (c.manager || '').toLowerCase() === target.toLowerCase())
            .forEach(c => myCreatorUsernames.add(c.username.toLowerCase()));
    }

    const myCreators   = data.filter(c => myCreatorUsernames.has((c.username || '').toLowerCase()));
    const totalDiamonds = myCreators.reduce((s, c) => s + Number(c.diamonds || 0), 0);
    const groupAvg     = myCreators.length ? totalDiamonds / myCreators.length : 0;

    const activeCount   = myCreators.filter(c => c.validDays > 0).length;
    const inactiveCount = myCreators.filter(c => c.validDays === 0).length;
    const atRiskCount   = myCreators.filter(c => c.validDays < 5 && Number(c.diamonds) < groupAvg * 0.5).length;

    const maxValidDays = Math.max(...myCreators.map(c => Number(c.validDays || 0)), 1);

    const sorted = [...myCreators].sort((a, b) => Number(b.diamonds) - Number(a.diamonds));

    const tableRows = sorted.length
        ? sorted.map(c => {
            const status = creatorStatus(c, groupAvg);
            const pct    = Math.round((Number(c.validDays || 0) / maxValidDays) * 100);
            return `
            <tr>
                <td style="font-weight:500;color:var(--text-primary);min-width:140px;">
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                        <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;flex-shrink:0;border:1px solid rgba(255,255,255,0.1);">
                            <span style="font-size:0.65rem;position:absolute;">${c.username.charAt(0).toUpperCase()}</span>
                            <img src="https://unavatar.io/tiktok/${encodeURIComponent(c.username)}" alt="@${c.username}" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;opacity:0;transition:opacity 0.2s;" referrerpolicy="no-referrer" onload="this.style.opacity='1';">
                        </div>
                        <span style="font-size:0.85rem;">@${c.username}</span>
                    </div>
                </td>
                <td>
                    <span style="font-size:0.68rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:999px;
                                 color:${status.color};background:${status.bg};">
                        ${status.icon} ${status.label}
                    </span>
                </td>
                <td style="color:var(--accent);font-weight:700;font-size:0.9rem;">💎 ${fmt(c.diamonds)}</td>
                <td>
                    <div style="display:flex;flex-direction:column;gap:0.2rem;">
                        <span style="font-size:0.82rem;font-weight:600;">${c.validDays}</span>
                        <div style="height:4px;border-radius:999px;background:rgba(255,255,255,0.07);width:60px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:${status.color};border-radius:999px;transition:width 0.4s;"></div>
                        </div>
                    </div>
                </td>
                <td style="font-size:0.82rem;">${liveHours(c.liveSeconds)}</td>
                <td>
                    <button class="btn btn-sm view-creator" data-username="${c.username}"
                        style="padding:0.25rem 0.55rem;font-size:0.72rem;white-space:nowrap;">👁️ Ver</button>
                </td>
            </tr>`;
          }).join('')
        : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">
            No tienes creadores asignados todavía. Pídele al Admin que te asigne creadores.
           </td></tr>`;

    container.innerHTML = `
        <div>
            <div style="margin-bottom:1.8rem;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.8rem;">
                <div>
                    <h1 style="font-size:1.6rem;margin-bottom:0.3rem;">Panel de Supervisión</h1>
                    <p style="color:var(--text-secondary);font-size:0.85rem;">
                        Manager: <strong style="color:var(--text-primary);">${labelManager}</strong>
                    </p>
                </div>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                    ${!isAuditing ? `<button id="assign-toggle-btn" class="btn btn-ghost" style="font-size:0.8rem;white-space:nowrap;border:1px solid var(--glass-border);">➕ Solicitar creador</button>` : ''}
                    ${!isAuditing && myCreators.length ? `<button id="msg-toggle-btn" class="btn btn-primary" style="font-size:0.8rem;white-space:nowrap;">✉️ Redactar mensaje</button>` : ''}
                    ${isAuditing ? `<button id="back-to-admin" class="btn btn-sm" style="background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);">← Volver</button>` : ''}
                </div>
            </div>

            <!-- Formulario solicitar creador (auto-asignación) -->
            ${!isAuditing ? `
            <div id="assign-form" class="glass-panel" style="padding:1.25rem;margin-bottom:1.5rem;display:none;">
                <h3 style="margin-top:0;font-size:0.95rem;">Solicitar creador</h3>
                <p style="font-size:0.78rem;color:var(--text-secondary);margin-top:-0.5rem;margin-bottom:0.8rem;">
                    Escribí el usuario de TikTok del creador que querés seguir. Si está libre, queda asignado a vos al instante.
                </p>
                <div style="display:flex;flex-direction:column;gap:0.8rem;">
                    <div class="input-group" style="margin-bottom:0;">
                        <label>Usuario de TikTok</label>
                        <input type="text" id="assign-username-input" class="input-control" placeholder="Ej: loxhias" autocomplete="off">
                    </div>
                    <div id="assign-preview" style="font-size:0.82rem;"></div>
                    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
                        <button id="assign-submit-btn" class="btn btn-primary" style="flex:1;min-width:140px;" disabled>Confirmar</button>
                        <button id="assign-cancel-btn" class="btn btn-ghost">Cancelar</button>
                    </div>
                </div>
                <div id="assign-recent" style="margin-top:1.25rem;"></div>
            </div>` : ''}

            <!-- Formulario redactar mensaje -->
            ${!isAuditing && myCreators.length ? `
            <div id="msg-form" class="glass-panel" style="padding:1.25rem;margin-bottom:1.5rem;display:none;">
                <h3 style="margin-top:0;font-size:0.95rem;">Mensaje para mis creadores <span style="font-size:0.72rem;font-weight:400;color:var(--text-muted);">(${myCreators.length} destinatarios)</span></h3>
                <div style="display:flex;flex-direction:column;gap:0.8rem;">
                    <div class="input-group" style="margin-bottom:0;">
                        <label>Asunto</label>
                        <input type="text" id="msg-title" class="input-control" placeholder="Ej: Recordatorio de transmisión" maxlength="80">
                    </div>
                    <div class="input-group" style="margin-bottom:0;">
                        <label>Mensaje</label>
                        <textarea id="msg-body" class="input-control" rows="3" placeholder="Escribe tu mensaje aquí..." maxlength="300" style="resize:vertical;font-family:inherit;"></textarea>
                    </div>
                    <div class="input-group" style="margin-bottom:0;">
                        <label>Enlace (opcional)</label>
                        <input type="url" id="msg-url" class="input-control" placeholder="https://...">
                    </div>
                    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
                        <button id="msg-send-btn" class="btn btn-primary" style="flex:1;min-width:140px;">Enviar mensaje</button>
                        <button id="msg-cancel-btn" class="btn btn-ghost">Cancelar</button>
                    </div>
                </div>
            </div>` : ''}

            ${!isAuditing ? renderTeamIncentiveHero({ total: myCreators.length, activeCount, inactiveCount, atRiskCount }) : ''}

            <!-- Métricas resumen -->
            <div class="metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));">
                <div class="glass-panel metric-card" style="background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(236,72,153,0.1));border-color:rgba(124,110,247,0.3);">
                    <div class="metric-left">
                        <div class="metric-title">Diamantes</div>
                        <span class="metric-value text-gradient" style="font-size:1.6rem;">${fmt(totalDiamonds)}</span>
                        <div class="metric-subtitle" style="color:var(--text-muted);">del grupo</div>
                    </div>
                    <div class="metric-icon-box" style="background:rgba(124,110,247,0.1);">💎</div>
                </div>

                <div class="glass-panel metric-card">
                    <div class="metric-left">
                        <div class="metric-title">Creadores</div>
                        <span class="metric-value">${myCreators.length}</span>
                        <div class="metric-subtitle" style="color:var(--accent);">${activeCount} activos</div>
                    </div>
                    <div class="metric-icon-box" style="background:rgba(0,217,166,0.1);">👥</div>
                </div>

                <div class="glass-panel metric-card">
                    <div class="metric-left">
                        <div class="metric-title">Inactivos</div>
                        <span class="metric-value" style="color:${inactiveCount > 0 ? 'var(--danger)' : 'var(--accent)'};">${inactiveCount}</span>
                        <div class="metric-subtitle" style="color:var(--text-muted);">0 días válidos</div>
                    </div>
                    <div class="metric-icon-box" style="background:rgba(255,85,105,0.08);">🔴</div>
                </div>

                <div class="glass-panel metric-card">
                    <div class="metric-left">
                        <div class="metric-title">En Riesgo</div>
                        <span class="metric-value" style="color:${atRiskCount > 0 ? '#f59e0b' : 'var(--accent)'};">${atRiskCount}</span>
                        <div class="metric-subtitle" style="color:var(--text-muted);">bajo rendimiento</div>
                    </div>
                    <div class="metric-icon-box" style="background:rgba(245,158,11,0.08);">⚠️</div>
                </div>
            </div>

            <!-- Tabla de creadores -->
            <h3 id="team-table-section" style="margin:2rem 0 1rem;font-size:1rem;">Rendimiento Individual</h3>
            <div class="glass-panel table-container no-pad">
                <table class="data-table" style="min-width:520px;">
                    <thead>
                        <tr>
                            <th>Creador</th>
                            <th>Estado</th>
                            <th>Diamantes</th>
                            <th>Días válidos</th>
                            <th>Horas LIVE</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        </div>
    `;

    container.querySelector('#team-hero-cta')?.addEventListener('click', () => {
        container.querySelector('#team-table-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    container.addEventListener('click', (e) => {
        const btnCreator = e.target.closest('.view-creator');
        const btnAdmin   = e.target.closest('#back-to-admin');

        if (btnCreator) {
            const username = btnCreator.dataset.username;
            if (username) {
                import('./creatorDashboard.js').then(m => m.renderCreatorDashboard(container, username));
            }
        }
        if (btnAdmin) {
            import('../main.js').then(m => m.appState.navigate('admin'));
        }
    });

    if (isAuditing) return;

    const { appState } = await import('../main.js');

    // ── Solicitar creador (auto-asignación) wiring ───────────────────────────
    const assignToggleBtn = container.querySelector('#assign-toggle-btn');
    const assignForm       = container.querySelector('#assign-form');
    if (assignToggleBtn && assignForm) {
        const assignInput    = container.querySelector('#assign-username-input');
        const assignPreview  = container.querySelector('#assign-preview');
        const assignSubmit   = container.querySelector('#assign-submit-btn');
        const assignCancel   = container.querySelector('#assign-cancel-btn');
        const assignRecentEl = container.querySelector('#assign-recent');

        let lookupTimer  = null;
        let lastLookedUp = null; // último username validado como asignable

        const renderRecentActivity = async () => {
            assignRecentEl.innerHTML = '<p style="font-size:0.72rem;color:var(--text-muted);">Cargando actividad reciente...</p>';
            try {
                const events = await profiles.listAssignmentHistory({ managerId: activeManagerId, limit: 10 });
                if (!events.length) {
                    assignRecentEl.innerHTML = '';
                    return;
                }
                const EVENT_TEXT = {
                    assigned:   (e) => `Te asignaste a @${e.username}`,
                    reassigned: (e) => `@${e.username} fue reasignado a ${e.new_manager_name || 'otro manager'}`,
                    unassigned: (e) => `@${e.username} fue desvinculado de tu equipo`,
                };
                assignRecentEl.innerHTML = `
                    <h4 style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:0.5rem;">ACTIVIDAD RECIENTE</h4>
                    <div style="display:flex;flex-direction:column;gap:0.35rem;">
                        ${events.map(e => `
                            <div style="font-size:0.76rem;color:var(--text-secondary);">
                                ${(EVENT_TEXT[e.event_type] || (() => e.event_type))(e)}
                                <span style="color:var(--text-muted);"> · ${new Date(e.created_at).toLocaleDateString('es')}</span>
                            </div>`).join('')}
                    </div>`;
            } catch (e) {
                assignRecentEl.innerHTML = '';
                console.warn('Error cargando actividad reciente:', e);
            }
        };

        const resetAssignForm = () => {
            assignInput.value = '';
            assignPreview.innerHTML = '';
            assignSubmit.disabled = true;
            lastLookedUp = null;
        };

        assignToggleBtn.onclick = () => {
            const visible = assignForm.style.display !== 'none';
            assignForm.style.display = visible ? 'none' : 'block';
            if (!visible) {
                assignForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                assignInput.focus();
                renderRecentActivity();
            }
        };

        assignCancel.onclick = () => {
            assignForm.style.display = 'none';
            resetAssignForm();
        };

        assignInput.addEventListener('input', () => {
            clearTimeout(lookupTimer);
            assignSubmit.disabled = true;
            lastLookedUp = null;
            const username = assignInput.value.trim();
            if (!username) { assignPreview.innerHTML = ''; return; }

            assignPreview.innerHTML = '<span style="color:var(--text-muted);">Buscando...</span>';
            lookupTimer = setTimeout(async () => {
                try {
                    const info = await profiles.lookupCreator(username);
                    if (!info.exists_in_system) {
                        assignPreview.innerHTML = '<span style="color:var(--danger);">No encontramos ese creador en el sistema.</span>';
                        return;
                    }
                    if (info.already_assigned) {
                        assignPreview.innerHTML = `<span style="color:var(--danger);">Ya asignado a ${info.current_manager_name || 'otro manager'}. Contactá al admin si creés que es un error.</span>`;
                        return;
                    }
                    const diamonds  = info.latest_diamonds != null ? fmt(info.latest_diamonds) : '—';
                    const validDays = info.latest_valid_days != null ? info.latest_valid_days : '—';
                    assignPreview.innerHTML = `<span style="color:var(--accent);">@${info.username} · ${diamonds} 💎 · ${validDays} días válidos</span>`;
                    lastLookedUp = info.username;
                    assignSubmit.disabled = false;
                } catch (err) {
                    assignPreview.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
                }
            }, 400);
        });

        assignSubmit.onclick = async () => {
            const username = assignInput.value.trim();
            if (!username) return;
            assignSubmit.disabled = true;
            assignSubmit.textContent = 'Asignando...';
            try {
                await profiles.selfAssignCreator(username);
                store.invalidateManagerGroup(activeManagerId);
                appState.showToast(`@${username} asignado a tu equipo`, 'success');
                assignForm.style.display = 'none';
                resetAssignForm();
                renderManagerDashboard(container);
            } catch (err) {
                assignPreview.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
                appState.showToast(err.message, 'error');
            } finally {
                assignSubmit.disabled    = !lastLookedUp;
                assignSubmit.textContent = 'Confirmar';
            }
        };
    }

    // ── Compose form wiring ──────────────────────────────────────────────────
    const toggleBtn = container.querySelector('#msg-toggle-btn');
    const msgForm   = container.querySelector('#msg-form');
    if (!toggleBtn || !msgForm) return;

    const cancelBtn = container.querySelector('#msg-cancel-btn');
    const sendBtn   = container.querySelector('#msg-send-btn');
    const titleEl   = container.querySelector('#msg-title');
    const bodyEl    = container.querySelector('#msg-body');
    const urlEl     = container.querySelector('#msg-url');

    toggleBtn.onclick = () => {
        const visible = msgForm.style.display !== 'none';
        msgForm.style.display = visible ? 'none' : 'block';
        if (!visible) {
            msgForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            titleEl.focus();
        }
    };

    cancelBtn.onclick = () => {
        msgForm.style.display = 'none';
        titleEl.value = '';
        bodyEl.value  = '';
        urlEl.value   = '';
    };

    sendBtn.onclick = async () => {
        const title = titleEl.value.trim();
        const body  = bodyEl.value.trim();
        const url   = urlEl.value.trim() || null;

        if (!title) return appState.showToast('El asunto es obligatorio', 'warning');
        if (!body)  return appState.showToast('El mensaje no puede estar vacío', 'warning');

        sendBtn.disabled    = true;
        sendBtn.textContent = 'Enviando...';

        try {
            const list       = await profiles.listMyCreators(activeManagerId);
            const creatorIds = list.filter(c => c.profile_id).map(c => c.profile_id);

            if (!creatorIds.length) {
                appState.showToast('No hay creadores asignados a tu cuenta en la base de datos', 'warning');
                sendBtn.disabled    = false;
                sendBtn.textContent = 'Enviar mensaje';
                return;
            }

            const target = { type: 'users', value: creatorIds };
            await push.saveToDb(title, body, url, target);

            try { await push.send({ title, body, url, target }); } catch (pushErr) {
                console.warn('[manager send] push notification falló (mensaje guardado):', pushErr.message);
            }

            appState.showToast(`Mensaje enviado a ${creatorIds.length} creador${creatorIds.length !== 1 ? 'es' : ''}`, 'success');
            cancelBtn.onclick();
        } catch (err) {
            appState.showToast('Error: ' + err.message, 'danger');
        } finally {
            sendBtn.disabled    = false;
            sendBtn.textContent = 'Enviar mensaje';
        }
    };
}
