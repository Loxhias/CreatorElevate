import { store } from '../store.js';
import { profiles, push } from '../api.js';
import { appState } from '../main.js';

export async function renderNotificationsView(container) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:32px;width:220px;margin-bottom:2rem;"></div>
            <div style="display:grid;grid-template-columns:1fr 320px;gap:2rem;">
                <div class="skel-panel" style="height:420px;"></div>
                <div class="skel-panel" style="height:260px;"></div>
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

/**
 * Cruza un array de filas de métricas con los perfiles de Supabase
 * para obtener los IDs reales (external_user_ids de OneSignal).
 * Solo los creadores con cuenta registrada son resolvibles.
 */
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
    // Pre-calcular IDs resolvibles por segmento para mostrar en el panel
    const resolvedCounts = {
        top:       resolveSegmentToIds(segments.top,       allProfiles).length,
        potential: resolveSegmentToIds(segments.potential, allProfiles).length,
        risk:      resolveSegmentToIds(segments.risk,      allProfiles).length,
        novice:    resolveSegmentToIds(segments.novice,    allProfiles).length,
        newOnes:   resolveSegmentToIds(segments.newOnes,   allProfiles).length,
    };

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
                            <optgroup label="Creadores">
                                <option value="all-creators">Todos los Creadores</option>
                                <option value="segment:top">🏆 Top (${resolvedCounts.top} con cuenta)</option>
                                <option value="segment:potential">⚡ Con Potencial (${resolvedCounts.potential} con cuenta)</option>
                                <option value="segment:risk">⚠️ En Riesgo (${resolvedCounts.risk} con cuenta)</option>
                                <option value="segment:novice">🔰 Novatos (${resolvedCounts.novice} con cuenta)</option>
                                <option value="segment:new">🆕 Nuevos (${resolvedCounts.newOnes} con cuenta)</option>
                            </optgroup>
                        </select>
                        <p id="target-count" style="font-size:0.75rem; color:var(--accent); margin-top:0.4rem;"></p>
                    </div>

                    <div style="margin-bottom:1.5rem;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                            <label style="font-size:0.8rem;color:var(--text-secondary);">TÍTULO</label>
                            <span id="title-counter" style="font-size:0.65rem;color:var(--text-muted);">0/100</span>
                        </div>
                        <input type="text" id="msg-title" class="input-control" maxlength="100" placeholder="Ej: Nueva actualización de normas">
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
                        <div style="display:flex; flex-direction:column; gap:0.75rem; margin-top:1rem;">
                            ${renderSegmentStat('🏆 Top 10%',     segments.top.length,       resolvedCounts.top,       'var(--accent)')}
                            ${renderSegmentStat('⚡ Potencial',   segments.potential.length,  resolvedCounts.potential,  '#6366f1')}
                            ${renderSegmentStat('⚠️ Riesgo',      segments.risk.length,       resolvedCounts.risk,       'var(--danger)')}
                            ${renderSegmentStat('🔰 Novatos',     segments.novice.length,     resolvedCounts.novice,     'var(--text-secondary)')}
                            ${renderSegmentStat('🆕 Nuevos',      segments.newOnes.length,    resolvedCounts.newOnes,    'var(--primary)')}
                        </div>
                        <p style="font-size:0.65rem; color:var(--text-muted); margin-top:1rem; line-height:1.4;">
                            "Con cuenta" = creadores que tienen perfil registrado en Supabase y pueden recibir push.
                        </p>
                    </div>
                </div>
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
        else if (val === 'all-creators') text = `${allProfiles.filter(p => p.role === 'creator').length} creadores con cuenta`;
        else if (val.startsWith('user:')) text = '1 persona';
        else if (val.startsWith('segment:')) {
            const seg = val.split(':')[1];
            const key = seg === 'new' ? 'newOnes' : seg;
            text = `${resolvedCounts[key]} creadores con cuenta (${segments[key].length} en el segmento)`;
        }
        targetCount.textContent = text ? `→ ${text}` : '';
    };

    targetSelect.addEventListener('change', updateCount);
    updateCount();

    // Char counters
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

    // URL validation on blur
    const urlInput  = container.querySelector('#msg-url');
    const urlError  = container.querySelector('#url-error');
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
            const key  = seg === 'new' ? 'newOnes' : seg;
            const ids  = resolveSegmentToIds(segments[key], allProfiles);
            if (!ids.length) {
                return appState.showToast('Ningún creador de este segmento tiene cuenta registrada', 'warning');
            }
            finalTarget = { type: 'users', value: ids };
        }

        sendBtn.disabled  = true;
        sendBtn.innerText = 'Enviando...';

        try {
            await push.send({ title, body, url: url || undefined, target: finalTarget });
            appState.showToast('¡Notificación enviada!', 'success');
            container.querySelector('#msg-title').value = '';
            container.querySelector('#msg-body').value  = '';
        } catch (e) {
            console.error('[send-push] error:', e);
            appState.showToast('Error al enviar: ' + e.message, 'danger');
        } finally {
            sendBtn.disabled  = false;
            sendBtn.innerText = 'Enviar Notificación';
        }
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
    if (!metrics || !metrics.length) return { top: [], potential: [], risk: [], novice: [], newOnes: [] };

    const sorted = [...metrics].sort((a, b) => b.diamonds - a.diamonds);
    const top    = sorted.slice(0, Math.max(1, Math.ceil(metrics.length * 0.1)));

    const avg         = metrics.reduce((s, c) => s + Number(c.diamonds), 0) / metrics.length;
    const byHours     = [...metrics].sort((a, b) => b.liveSeconds - a.liveSeconds);
    const highHours   = byHours.slice(0, Math.ceil(metrics.length * 0.25));
    const potential   = highHours.filter(c => c.diamonds < avg);

    const risk   = metrics.filter(c => c.validDays < 5 && c.diamonds < avg * 0.5);

    const novice = metrics.filter(c => {
        const r = (c.statusRank || '').toLowerCase();
        return r.includes('nivel 1') || r === '' || r.includes('sin nivel');
    });

    const newOnes = metrics.filter(c => c.is_new === true || c.is_new === 'true');

    return { top, potential, risk, novice, newOnes };
}
