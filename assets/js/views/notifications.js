import { store } from '../store.js';
import { profiles, push } from '../api.js';
import { appState } from '../main.js';

export async function renderNotificationsView(container) {
    container.innerHTML = '<div style="padding:2rem; text-align:center;">Cargando Centro de Notificaciones...</div>';
    
    try {
        // Cargar datos necesarios
        const allProfiles = await profiles.listAll() || [];
        const metricsData = store.getMetricsData() || [];
        const admins = allProfiles.filter(p => p.role === 'admin');
        const managers = allProfiles.filter(p => p.role === 'manager');
        
        // Calcular Segmentos de Creadores
        const segments = calculateSegments(metricsData, allProfiles);

        // Renderizar contenido real
        renderContent(container, allProfiles, admins, managers, segments);
        
    } catch (error) {
        console.error("Error al cargar notificaciones:", error);
        container.innerHTML = `
            <div style="padding:2rem; text-align:center;">
                <p style="color:var(--danger); margin-bottom:1rem;">Error al cargar los datos del centro de mensajes.</p>
                <button class="btn btn-primary" onclick="location.reload()">Reintentar</button>
            </div>
        `;
    }
}

function renderContent(container, allProfiles, admins, managers, segments) {
    container.innerHTML = `
        <div class="animate-fadeIn">
            <h1 style="margin-bottom:1.5rem;">Centro de Mensajes</h1>
            
            <div style="display:grid; grid-template-columns: 1fr 350px; gap:2rem; align-items: start;">
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
                            <optgroup label="Segmentos de Creadores">
                                <option value="all-creators">Todos los Creadores</option>
                                <option value="segment:top">Creadores Top</option>
                                <option value="segment:potential">Con Potencial</option>
                                <option value="segment:risk">En Riesgo</option>
                                <option value="segment:novice">Novatos</option>
                                <option value="segment:new">Nuevos</option>
                            </optgroup>
                        </select>
                        <p id="target-count" style="font-size:0.75rem; color:var(--accent); margin-top:0.4rem;"></p>
                    </div>

                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block; font-size:0.8rem; margin-bottom:0.5rem; color:var(--text-secondary);">TÍTULO DEL MENSAJE</label>
                        <input type="text" id="msg-title" class="input-control" placeholder="Ej: Nueva actualización de normas">
                    </div>

                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block; font-size:0.8rem; margin-bottom:0.5rem; color:var(--text-secondary);">CUERPO DEL MENSAJE</label>
                        <textarea id="msg-body" class="input-control" style="height:120px; resize:none;" placeholder="Escribe aquí el contenido del mensaje..."></textarea>
                    </div>

                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block; font-size:0.8rem; margin-bottom:0.5rem; color:var(--text-secondary);">URL DE ACCIÓN (OPCIONAL)</label>
                        <input type="text" id="msg-url" class="input-control" placeholder="https://creatorelevate.pages.dev/normas">
                    </div>

                    <button id="send-btn" class="btn" style="width:100%; padding:1rem; font-weight:700;">Enviar Notificación</button>
                </div>

                <!-- Resumen de Segmentos -->
                <div style="display:flex; flex-direction:column; gap:1.5rem;">
                    <div class="glass-panel" style="padding:1.5rem;">
                        <h4 style="margin-top:0; font-size:0.85rem; color:var(--text-secondary);">ESTADÍSTICAS DE SEGMENTOS</h4>
                        <div style="display:flex; flex-direction:column; gap:0.8rem; margin-top:1rem;">
                            ${renderSegmentStat('TOP', segments.top.length, 'var(--accent)')}
                            ${renderSegmentStat('POTENCIAL', segments.potential.length, '#6366f1')}
                            ${renderSegmentStat('RIESGO', segments.risk.length, 'var(--danger)')}
                            ${renderSegmentStat('NOVATOS', segments.novice.length, 'var(--text-secondary)')}
                            ${renderSegmentStat('NUEVOS', segments.newOnes.length, 'var(--primary)')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Lógica de UI
    const targetSelect = container.querySelector('#msg-target');
    const targetCount = container.querySelector('#target-count');
    const sendBtn = container.querySelector('#send-btn');

    const updateCount = () => {
        const val = targetSelect.value;
        let count = 0;
        if (val === 'all-admins') count = admins.length;
        else if (val === 'all-managers') count = managers.length;
        else if (val === 'all-creators') count = allProfiles.filter(p => p.role === 'creator').length;
        else if (val.startsWith('user:')) count = 1;
        else if (val.startsWith('segment:')) {
            const seg = val.split(':')[1];
            count = segments[seg === 'new' ? 'newOnes' : seg].length;
        }
        targetCount.innerText = `Se enviará a aproximadamente ${count} personas.`;
    };

    targetSelect.onchange = updateCount;
    updateCount();

    sendBtn.onclick = async () => {
        const title = container.querySelector('#msg-title').value.trim();
        const body = container.querySelector('#msg-body').value.trim();
        const url = container.querySelector('#msg-url').value.trim();
        const target = targetSelect.value;

        if (!title || !body) return appState.showToast('El título y el mensaje son obligatorios', 'warning');

        sendBtn.disabled = true;
        sendBtn.innerText = 'Enviando...';

        try {
            let finalTarget = { type: 'all', value: null };
            
            if (target === 'all-admins') finalTarget = { type: 'role', value: 'admin' };
            else if (target === 'all-managers') finalTarget = { type: 'role', value: 'manager' };
            else if (target === 'all-creators') finalTarget = { type: 'role', value: 'creator' };
            else if (target.startsWith('user:')) finalTarget = { type: 'user', value: target.split(':')[1] };
            else if (target.startsWith('segment:')) {
                const segKey = target.split(':')[1];
                const list = segments[segKey === 'new' ? 'newOnes' : segKey];
                const targetIds = list.map(c => {
                    const p = allProfiles.find(ap => ap.tiktok_username?.toLowerCase() === c.username.toLowerCase());
                    return p ? p.id : null;
                }).filter(id => id !== null);
                
                finalTarget = { type: 'users', value: targetIds };
            }

            const res = await push.send({ title, body, url, target: finalTarget });
            
            // Mostramos los logs del servidor en tu consola F12
            if (res.server_logs) {
                console.group("🚀 REGISTROS DE ENVÍO (SERVIDOR)");
                res.server_logs.forEach(l => console.log(l));
                console.groupEnd();
            }

            if (res.result && res.result.errors) {
                appState.showToast('OneSignal: ' + res.result.errors[0], 'warning');
            } else {
                appState.showToast('¡Notificación enviada!', 'success');
                container.querySelector('#msg-title').value = '';
                container.querySelector('#msg-body').value = '';
            }
        } catch (e) {
            console.error(e);
            appState.showToast('Error al enviar: ' + e.message, 'danger');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerText = 'Enviar Notificación';
        }
    };
}

function renderSegmentStat(label, count, color) {
    return `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.7rem; font-weight:700; color:var(--text-secondary);">${label}</span>
            <span style="font-size:0.9rem; font-weight:800; color:${color};">${count}</span>
        </div>
    `;
}

function calculateSegments(metrics, profiles) {
    if (!metrics || !metrics.length) return { top: [], potential: [], risk: [], novice: [], newOnes: [] };

    const sortedByDiamonds = [...metrics].sort((a, b) => b.diamonds - a.diamonds);
    const topCount = Math.ceil(metrics.length * 0.1);
    const top = sortedByDiamonds.slice(0, topCount);

    const avgDiamonds = metrics.reduce((s, c) => s + Number(c.diamonds), 0) / metrics.length;
    const sortedByDuration = [...metrics].sort((a, b) => b.live_seconds - a.live_seconds);
    const highHours = sortedByDuration.slice(0, Math.ceil(metrics.length * 0.25));
    const potential = highHours.filter(c => c.diamonds < avgDiamonds);

    const risk = metrics.filter(c => c.valid_days < 5 && c.diamonds < (avgDiamonds * 0.5));

    const novice = metrics.filter(c => {
        const r = (c.status_rank || '').toLowerCase();
        return r.includes('nivel 1') || r === '' || r.includes('sin nivel');
    });

    const newOnes = metrics.filter(c => c.is_new === true || c.is_new === 'true');

    return { top, potential, risk, novice, newOnes };
}
