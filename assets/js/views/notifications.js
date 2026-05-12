import { store } from '../store.js';
import { profiles, push } from '../api.js';
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
        const admins   = allProfiles.filter(p => p.role === 'admin');
        const managers = allProfiles.filter(p => p.role === 'manager');
        const segments = calculateSegments(metricsData);

        renderContent(container, allProfiles, admins, managers, segments);
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

function renderContent(container, allProfiles, admins, managers, segments) {
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
                <div class="glass-panel" style="padding:2rem;">
                    <h3 style="margin-top:0;">Nuevo Mensaje</h3>

                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block; font-size:0.8rem; margin-bottom:0.5rem; color:var(--text-secondary);">DESTINATARIOS</label>
                        <select id="msg-target" class="input-control">
                            <optgroup label="Administradores">
                                <option value="all-admins">Todos los Administradores</option>
                                ${admins.map(a => `<option value="user:${a.id}">${a.display_name || a.email}</option>`).join('')}
                            </optgroup>
                            <optgroup label="Managers">
                                <option value="all-managers">Todos los Managers</option>
                                ${managers.map(m => `<option value="user:${m.id}">${m.display_name || m.email}</option>`).join('')}
                            </optgroup>
                            <optgroup label="Todos los Creadores">
                                <option value="all-creators">📢 Todos los Creadores (${creatorsWithAccount} con cuenta)</option>
                            </optgroup>
                            <optgroup label="Segmentos de Rendimiento">
                                <option value="segment:top">🏆 Top 10% — Los más rentables (${resolvedCounts.top} con cuenta)</option>
                                <option value="segment:risk">⚠️ En Riesgo — Pocos días y bajos diamantes (${resolvedCounts.risk} con cuenta)</option>
                                <option value="segment:inactive">🔴 Inactivos — Sin transmisiones este mes (${resolvedCounts.inactive} con cuenta)</option>
                                <option value="segment:lowvalid">📉 Transmiten pero sin días válidos — ≤ 3 días válidos (${resolvedCounts.lowValid} con cuenta)</option>
                                <option value="segment:effortlow">💪 Alto esfuerzo, bajo rendimiento (${resolvedCounts.effortLow} con cuenta)</option>
                                <option value="segment:potential">⚡ Con Potencial — Muchas horas, pocos 💎 (${resolvedCounts.potential} con cuenta)</option>
                            </optgroup>
                            <optgroup label="Segmentos de Etapa">
                                <option value="segment:new">🆕 Nuevos — Primer mes en la agencia (${resolvedCounts.newOnes} con cuenta)</option>
                                <option value="segment:newinactive">🆕🔴 Nuevos sin transmitir aún (${resolvedCounts.newInactive} con cuenta)</option>
                                <option value="segment:novice">🔰 Novatos — Nivel 1 o sin nivel (${resolvedCounts.novice} con cuenta)</option>
                            </optgroup>
                        </select>
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
                        <label style="display:block;font-size:0.8rem;margin-bottom:0.5rem;color:var(--text-secondary);">URL DE ACCIÓN (OPCIONAL)</label>
                        <input type="url" id="msg-url" class="input-control" placeholder="https://...">
                        <p id="url-error" style="font-size:0.7rem;color:var(--danger);margin-top:0.3rem;display:none;">Debe comenzar con https://</p>
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
                </div>
            </div>

            <!-- Historial de Enviados -->
            <div style="margin-top:2.5rem;">
                <h3 style="margin-bottom:1rem;font-size:0.9rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Historial de Enviados</h3>
                <div id="historial-wrap" style="display:flex;flex-direction:column;gap:0.6rem;"></div>
            </div>
        </div>
    `;

    const targetSelect = container.querySelector('#msg-target');
    const targetCount  = container.querySelector('#target-count');
    const sendBtn      = container.querySelector('#send-btn');

    const updateCount = () => {
        const val = targetSelect.value;
        let text = '';
        if (val === 'all-admins')        text = `${admins.length} administrador${admins.length !== 1 ? 'es' : ''}`;
        else if (val === 'all-managers') text = `${managers.length} manager${managers.length !== 1 ? 's' : ''}`;
        else if (val === 'all-creators') text = `${creatorsWithAccount} creadores con cuenta`;
        else if (val.startsWith('user:')) text = '1 persona';
        else if (val.startsWith('segment:')) {
            const seg = val.split(':')[1];
            const key = SEG_KEY[seg] || seg;
            const total = (segments[key] || []).length;
            const resolved = resolvedCounts[key] ?? 0;
            text = `${resolved} con cuenta (${total} en el segmento total)`;
        }
        targetCount.textContent = text ? `→ ${text}` : '';
    };

    targetSelect.addEventListener('change', updateCount);
    updateCount();

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

    // Validación URL
    const urlInput = container.querySelector('#msg-url');
    const urlError = container.querySelector('#url-error');
    urlInput.addEventListener('blur', () => {
        const v = urlInput.value.trim();
        urlError.style.display = v && !v.startsWith('https://') ? 'block' : 'none';
    });
    urlInput.addEventListener('input', () => {
        if (urlError.style.display !== 'none') urlError.style.display = 'none';
    });

    sendBtn.addEventListener('click', async () => {
        const title  = titleInput.value.trim();
        const body   = bodyInput.value.trim();
        const url    = urlInput.value.trim();
        const target = targetSelect.value;

        if (!title) return appState.showToast('El título es obligatorio', 'warning');
        if (!body)  return appState.showToast('El mensaje es obligatorio', 'warning');
        if (url && !url.startsWith('https://')) {
            urlError.style.display = 'block';
            return appState.showToast('La URL debe comenzar con https://', 'warning');
        }

        let finalTarget = { type: 'all', value: null };

        if (target === 'all-admins')        finalTarget = { type: 'role', value: 'admin' };
        else if (target === 'all-managers') finalTarget = { type: 'role', value: 'manager' };
        else if (target === 'all-creators') finalTarget = { type: 'role', value: 'creator' };
        else if (target.startsWith('user:')) finalTarget = { type: 'user', value: target.split(':')[1] };
        else if (target.startsWith('segment:')) {
            const seg  = target.split(':')[1];
            const key  = SEG_KEY[seg] || seg;
            const ids  = resolveSegmentToIds(segments[key] || [], allProfiles);
            if (!ids.length) {
                return appState.showToast('Ningún creador de este segmento tiene cuenta registrada', 'warning');
            }
            finalTarget = { type: 'users', value: ids };
        }

        sendBtn.disabled  = true;
        sendBtn.innerText = 'Enviando...';

        try {
            await push.send({ title, body, url: url || undefined, target: finalTarget });
            await push.saveToDb(title, body, url || null, finalTarget);
            appState.showToast('¡Notificación enviada!', 'success');
            titleInput.value = '';
            bodyInput.value  = '';
            updateCount();
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

        wrap.innerHTML = items.map(n => `
            <div style="padding:0.75rem 1rem;border:1px solid var(--glass-border);border-radius:var(--radius-md);
                        background:rgba(255,255,255,0.02);">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.25rem;">
                    <span style="font-size:0.82rem;font-weight:700;color:var(--text-primary);">${n.title}</span>
                    <span style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">${timeAgo(n.sent_at)}</span>
                </div>
                <p style="font-size:0.73rem;color:var(--text-muted);margin:0 0 0.35rem;line-height:1.4;
                           overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">
                    ${n.body}
                </p>
                <div style="display:flex;gap:0.8rem;align-items:center;flex-wrap:wrap;">
                    <span style="font-size:0.65rem;background:rgba(255,255,255,0.06);border-radius:999px;
                                 padding:0.1rem 0.5rem;color:var(--text-secondary);">
                        ${targetLabel(n.target_type, n.target_value)}
                    </span>
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

    // Novatos: nivel 1 o sin nivel asignado
    const novice = metrics.filter(c => {
        const r = (c.statusRank || '').toLowerCase();
        return r.includes('nivel 1') || r === '' || r.includes('sin nivel');
    });

    // Nuevos: menos de 30 días en la agencia
    const newOnes = metrics.filter(c => c.daysSinceJoining != null && c.daysSinceJoining < 30);

    return { top, potential, risk, inactive, newInactive, lowValid, effortLow, novice, newOnes };
}
