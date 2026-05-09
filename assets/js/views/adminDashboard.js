import { store } from '../store.js';
import { appState } from '../main.js';
import { metrics, profiles, push } from '../api.js';
import { isSupabaseConfigured } from '../supabase.js';

window.CE_DEBUG = true;

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n) { return Number(n).toLocaleString('es'); }

function parseLiveSeconds(str) {
    if (!str) return 0;
    if (typeof str === 'number') return Math.round(str * 3600);
    const s = String(str);
    const h = +(s.match(/(\d+)h/)   || [0,0])[1];
    const m = +(s.match(/(\d+)min/) || [0,0])[1];
    const sec = +(s.match(/(\d+)s/)   || [0,0])[1];
    return h * 3600 + m * 60 + sec;
}

/**
 * Convierte una fila parseada del Excel a nuestro modelo.
 * El Excel de TikTok suele tener columnas como:
 *  Creator's username | Diamonds | Diamonds (last month) | LIVE Duration | Valid Days | Battles
 * Acepta varias variantes de nombres en español/inglés.
 */
function normalizeRow(row) {
    if (window.CE_DEBUG) console.log('Normalizing row headers:', Object.keys(row));
    const find = (keywords) => {

        const entries = Object.entries(row);
        // 1. Intento: Coincidencia exacta
        for (const kw of keywords) {
            const found = entries.find(([k]) => k.toLowerCase().trim() === kw.toLowerCase());
            if (found) return found[1];
        }
        // 2. Intento: Coincidencia parcial (más flexible)
        const entry = entries.find(([k]) => {
            const key = k.toLowerCase().trim();
            return keywords.some(kw => key.includes(kw.toLowerCase()));
        });
        return entry ? entry[1] : undefined;
    };


    const username = String(
        find(['Nombre de usuario del creador', 'creator username', "creator's username", 'nombre de usuario', 'usuario del creador', 'tiktok username', 'username']) || ''
    ).trim().replace(/^@/, '').toLowerCase();


    if (!username) return null;

    return {
        username,
        diamonds:           Number(find(['Diamonds', 'Diamantes']) || 0),
        diamondsLastMonth:  Number(find(['Diamonds (last month)', 'Diamantes en el último mes', 'Diamantes mes pasado']) || 0),
        liveDuration:       String(find(['LIVE Duration', 'Duración de LIVE', 'Duración LIVE']) || '0s'),
        liveSeconds:        parseLiveSeconds(find(['LIVE Duration', 'Duración de LIVE', 'Duración LIVE']) || 0),
        validDays:          Number(find(['Días válidos de emisiones LIVE', 'Valid Days', 'Días válidos']) || 0),
        newFollowers:       Number(find(['Nuevos seguidores', 'New Followers']) || 0),
        emisionesLive:      Number(find(['Emisiones LIVE', 'Total LIVE Emissions', 'Sesiones LIVE']) || 0),
        battles:            Number(find(['battles', 'partidas', 'pks']) || 0),
        battleDiamonds:     Number(find(['diamantes de partidas']) || 0),
        multiGuestDiamonds: Number(find(['varios invitados']) || 0),
        statusGraduation:   find(['estado de graduación', 'graduación']) || null,
        statusRank:         find(['estado del rango', 'rango']) || null,
        statusActive:       find(['estado', 'status']) || null,
        groupName:          find(['grupo', 'group']) || null,
        manager:            find(['manager', 'agente', 'manager asignado']) || null,
    };




}

// ── Render principal ──────────────────────────────────────────────────────
export async function renderAdminDashboard(container) {
    container.innerHTML = `<div class="loading-shell" style="padding:2rem;text-align:center;color:var(--text-muted);">Cargando panel…</div>`;

    if (isSupabaseConfigured) {
        try {
            await store.refreshAdminLists();
            await store.refreshMetrics();
        } catch (e) {
            console.warn('Admin lists load failed:', e);
        }
    }

    const data    = store.getMetricsData() || [];
    const period  = store.getPeriod();
    const profs   = store.getProfiles() || [];
    const managers = store.getManagers() || [];
    const creators = profs.filter(p => p.role === 'creator');
    const hasData  = data.length > 0;

    // Agregados globales
    const totalDiamonds  = data.reduce((s, c) => s + Number(c.diamonds || 0), 0);
    const totalCreators  = data.length;
    const validCreators  = data.filter(c => c.validDays > 0).length;
    const totalLives     = data.reduce((s, c) => s + Number(c.battles || 0), 0); // O sesiones si las tuviéramos
    const goLiveRate     = totalCreators ? ((validCreators / totalCreators) * 100).toFixed(1) : 0;
    const totalSecs      = data.reduce((s, c) => s + (c.liveSeconds || parseLiveSeconds(c.liveDuration)), 0);
    const avgHours       = totalCreators ? (totalSecs / totalCreators / 3600).toFixed(1) : 0;

    container.innerHTML = `
        <div style="margin-bottom:2rem;">
            <h1 style="font-size:1.8rem;margin-bottom:0.5rem;">Panel del Administrador</h1>
            <p style="color:var(--text-secondary);">Métricas globales · Carga del reporte mensual · Asignación de managers · Notificaciones push</p>
            ${period ? `<p style="margin-top:0.5rem;font-size:0.78rem;color:var(--text-muted);">Período activo: <strong style="color:var(--primary-light);">${period.label || period.period}</strong></p>` : ''}
        </div>

        <!-- ── Métricas globales ─────────────────────────────────────────── -->
        ${hasData ? `
        <div class="metrics-grid">
            <div class="glass-panel metric-card">
                <span class="metric-title">Total Diamantes</span>
                <span class="metric-value text-gradient">${fmt(totalDiamonds)}</span>
            </div>
            <div class="glass-panel metric-card">
                <span class="metric-title">Creadores Activos Válidos</span>
                <span class="metric-value">${validCreators} / ${totalCreators}</span>
                <span class="metric-trend" style="color:var(--primary);">
                    ${totalCreators ? ((validCreators/totalCreators)*100).toFixed(1) : 0}% del total
                </span>
            </div>
            <div class="glass-panel metric-card">
                <span class="metric-title">Emisiones LIVE (Total)</span>
                <span class="metric-value">${fmt(data.reduce((s,c) => s + Number(c.emisionesLive || 0), 0))}</span>
            </div>

            <div class="glass-panel metric-card">
                <span class="metric-title">Avg Horas / Creador</span>
                <span class="metric-value">${avgHours} <span style="font-size:1rem;font-weight:400">hs</span></span>
            </div>
        </div>` : `

        <div class="glass-panel" style="padding:3rem;text-align:center;color:var(--text-muted);">
            <p>No hay datos cargados todavía.</p>
            <p style="font-size:0.82rem;margin-top:0.5rem;">Sube el reporte mensual de TikTok para empezar.</p>
        </div>`}

        <!-- ── Carga de Excel ────────────────────────────────────────────── -->
        <div style="margin-top:2rem;">
            <h3 style="margin-bottom:1rem;">📥 Cargar reporte mensual (.xlsx)</h3>
            <div class="glass-panel" style="padding:1.5rem;">
                ${!isSupabaseConfigured ? `
                    <div style="background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.25);border-radius:var(--radius-sm);padding:0.7rem 0.9rem;margin-bottom:1rem;color:var(--warning);font-size:0.8rem;">
                        ⚠ Modo DEMO: el upload requiere Supabase configurado en <code>assets/js/env.js</code>.
                    </div>
                ` : ''}
                <div class="input-group">
                    <label for="upload-period">Mes que estás cargando</label>
                    <input type="month" id="upload-period" class="input-control" value="${new Date().toISOString().slice(0,7)}">
                </div>
                <div class="input-group">
                    <label for="upload-file">Archivo Excel del reporte de TikTok</label>
                    <input type="file" id="upload-file" class="input-control" accept=".xlsx,.xls,.csv">
                </div>
                <div id="upload-preview" style="margin:1rem 0;font-size:0.82rem;color:var(--text-secondary);"></div>
                <button id="upload-btn" class="btn btn-primary" disabled>Subir y reemplazar datos del mes</button>
                <p style="font-size:0.7rem;color:var(--text-muted);margin-top:0.7rem;">
                    Si subes el mismo mes dos veces se sobrescriben los datos. Los meses anteriores quedan en el histórico.
                </p>
            </div>
        </div>

        <!-- ── Asignación Manager ↔ Creador ────────────────────────────── -->
        <div style="margin-top:2rem;">
            <h3 style="margin-bottom:1rem;">👥 Asignación de Managers</h3>
            <div class="glass-panel" style="padding:1.5rem;">
                ${!isSupabaseConfigured ? `<p style="color:var(--text-muted);font-size:0.82rem;">Disponible cuando Supabase esté configurado.</p>` :
                  creators.length === 0 ? `<p style="color:var(--text-muted);font-size:0.82rem;">No hay creadores registrados aún. Cuando se registren aparecerán aquí.</p>` : `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:0.75rem;font-size:0.78rem;color:var(--text-muted);">
                    <span>${creators.length} creador${creators.length===1?'':'es'} · ${managers.length} manager${managers.length===1?'':'s'}</span>
                </div>
                <div class="table-container" style="max-height:400px;overflow-y:auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Creador (TikTok)</th>
                                <th>Email</th>
                                <th>Manager asignado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${creators.map(c => `
                                <tr>
                                    <td style="font-weight:500;">@${c.tiktok_username || c.display_name || '—'}</td>
                                    <td style="color:var(--text-muted);font-size:0.78rem;">${c.email || '—'}</td>
                                    <td>
                                        <select class="input-control assign-manager" data-creator="${c.id}" style="padding:0.4rem 0.7rem;font-size:0.82rem;">
                                            <option value="">— Sin asignar —</option>
                                            ${managers.map(m => `
                                                <option value="${m.id}" ${m.id === c.manager_id ? 'selected' : ''}>${m.display_name || m.tiktok_username || m.email}</option>
                                            `).join('')}
                                        </select>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`}
            </div>
        </div>

        <!-- ── Notificaciones push ──────────────────────────────────────── -->
        <div style="margin-top:2rem;margin-bottom:2rem;">
            <h3 style="margin-bottom:1rem;">🔔 Enviar notificación push</h3>
            <div class="glass-panel" style="padding:1.5rem;">
                ${!isSupabaseConfigured ? `<p style="color:var(--text-muted);font-size:0.82rem;">Disponible cuando Supabase + Edge Function send-push estén configuradas.</p>` : `
                <div class="input-group">
                    <label for="push-target">Destino</label>
                    <select id="push-target" class="input-control">
                        <option value="all">Todos los creadores</option>
                        ${managers.map(m => `<option value="manager:${m.id}">Solo creadores de ${m.display_name || m.tiktok_username || 'manager'}</option>`).join('')}
                        ${creators.filter(c => c.tiktok_username).map(c => `<option value="user:${c.id}">@${c.tiktok_username}</option>`).join('')}
                    </select>
                </div>
                <div class="input-group">
                    <label for="push-title">Título</label>
                    <input type="text" id="push-title" class="input-control" placeholder="Ej: ¡Última semana del mes!">
                </div>
                <div class="input-group">
                    <label for="push-body">Mensaje</label>
                    <input type="text" id="push-body" class="input-control" placeholder="Ej: Te quedan 5 días para alcanzar tu meta">
                </div>
                <div class="input-group">
                    <label for="push-url">URL al hacer clic (opcional)</label>
                    <input type="text" id="push-url" class="input-control" placeholder="/  (deja en blanco para abrir la app)">
                </div>
                <button id="send-push-btn" class="btn btn-accent">Enviar notificación</button>
                <p style="font-size:0.7rem;color:var(--text-muted);margin-top:0.7rem;">
                    Los usuarios deben haber aceptado las notificaciones en su navegador / instalado la PWA.
                </p>`}
            </div>
        </div>
    `;

    // ── Wire up: Excel upload ──────────────────────────────────────────────
    const fileInput   = container.querySelector('#upload-file');
    const periodInput = container.querySelector('#upload-period');
    const uploadBtn   = container.querySelector('#upload-btn');
    const preview     = container.querySelector('#upload-preview');
    let parsedRows = null;

    fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) { uploadBtn.disabled = true; preview.innerHTML = ''; return; }
        try {
            preview.innerHTML = 'Leyendo archivo…';
            const buf = await file.arrayBuffer();
            const wb  = window.XLSX.read(buf, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const jsonData = window.XLSX.utils.sheet_to_json(sheet, { defval: null });
            
            // Log de depuración
            console.group('📊 Excel Parsing Results');
            console.log('Fila 0 (cruda):', jsonData[0]);
            
            parsedRows = jsonData.map(normalizeRow).filter(Boolean);
            
            console.log('Fila 0 (normalizada):', parsedRows[0]);
            console.log('Total valid rows:', parsedRows.length);
            console.groupEnd();

            if (!parsedRows.length) {
                preview.innerHTML = `<span style="color:var(--danger);">⚠ No se encontraron filas válidas en el Excel.</span>`;
                uploadBtn.disabled = true;
                return;
            }
            const totalD = parsedRows.reduce((s, r) => s + (r.diamonds || 0), 0);
            preview.innerHTML = `
                ✓ <strong>${parsedRows.length}</strong> creadores listos.
                Total diamantes detectados: <strong style="color:var(--primary-light);">${fmt(totalD)}</strong>.
            `;
            uploadBtn.disabled = !isSupabaseConfigured;
        } catch (err) {
            console.error(err);
            preview.innerHTML = `<span style="color:var(--danger);">⚠ Error leyendo el archivo: ${err.message}</span>`;
            uploadBtn.disabled = true;
        }
    });

    uploadBtn?.addEventListener('click', async () => {
        if (!parsedRows) return;
        const monthStr = periodInput.value || new Date().toISOString().slice(0,7);
        const periodDate = `${monthStr}-01`;
        const dt = new Date(periodDate);
        const label = dt.toLocaleString('es', { month: 'long', year: 'numeric' })
                        .replace(/^./, c => c.toUpperCase());

        uploadBtn.disabled = true;
        const original = uploadBtn.textContent;
        uploadBtn.textContent = 'Subiendo…';

        try {
            const res = await metrics.upsertPeriod(periodDate, label, parsedRows);
            appState.showToast(`✓ ${res.inserted} insertados, ${res.updated} actualizados`);
            await store.refreshMetrics();
            renderAdminDashboard(container);
        } catch (err) {
            console.error(err);
            appState.showToast(`Error: ${err.message}`, 'error');
            uploadBtn.disabled = false;
            uploadBtn.textContent = original;
        }
    });

    // ── Wire up: asignación manager ────────────────────────────────────────
    container.querySelectorAll('.assign-manager').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const creatorId = e.target.dataset.creator;
            const managerId = e.target.value || null;
            try {
                await profiles.assignManager(creatorId, managerId);
                appState.showToast('Asignación actualizada');
                await store.refreshAdminLists();
            } catch (err) {
                console.error(err);
                appState.showToast(`Error: ${err.message}`, 'error');
            }
        });
    });

    // ── Wire up: push ──────────────────────────────────────────────────────
    container.querySelector('#send-push-btn')?.addEventListener('click', async () => {
        const target = container.querySelector('#push-target').value;
        const title  = container.querySelector('#push-title').value.trim();
        const body   = container.querySelector('#push-body').value.trim();
        const url    = container.querySelector('#push-url').value.trim() || '/';
        if (!title || !body) { appState.showToast('Falta título o mensaje', 'error'); return; }

        let targetObj;
        if (target === 'all')                  targetObj = { type: 'all',           value: null };
        else if (target.startsWith('manager:')) targetObj = { type: 'manager_group', value: target.split(':')[1] };
        else if (target.startsWith('user:'))    targetObj = { type: 'user',          value: target.split(':')[1] };

        try {
            const res = await push.send({ title, body, url, target: targetObj });
            appState.showToast(`✓ Enviado · ${res?.delivered ?? '?'} entregadas, ${res?.failed ?? '?'} fallidas`);
            container.querySelector('#push-title').value = '';
            container.querySelector('#push-body').value = '';
        } catch (err) {
            console.error(err);
            appState.showToast(`Error: ${err.message}`, 'error');
        }
    });
}

// ── Lista de Creadores ──────────────────────────────────────────────────────
export function renderCreatorsList(container) {
    const data = store.getMetricsData() || [];
    
    const renderList = (filtered) => {
        if (filtered.length === 0) {
            return `<div style="padding:3rem;text-align:center;color:var(--text-muted);">No se encontraron creadores.</div>`;
        }
        return `
            <div style="display:flex;flex-direction:column;gap:0.8rem;">
                ${filtered.map(c => `
                    <div class="glass-panel" style="padding:1rem;display:flex;align-items:center;gap:1rem;transition:transform 0.2s ease;">
                        <div style="width:40px;height:40px;border-radius:50%;background:var(--primary-gradient);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.9rem;color:white;flex-shrink:0;">
                            ${c.username.charAt(0).toUpperCase()}
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.9rem;margin-bottom:0.15rem;">@${c.username}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted);">Manager: ${c.manager || 'No asignado'}</div>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="font-weight:800;color:var(--primary-light);font-size:0.9rem;">${fmt(c.diamonds)} 💎</div>
                            <div style="font-size:0.7rem;color:var(--text-muted);">${c.validDays} días · ${(c.liveSeconds/3600).toFixed(1)}h</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    container.innerHTML = `
        <div style="margin-bottom:1.5rem;">
            <h2 style="font-size:1.5rem;margin-bottom:0.4rem;">Creadores (${data.length})</h2>
            <p style="color:var(--text-secondary);font-size:0.88rem;">Listado detallado del período actual</p>
        </div>

        <div class="glass-panel" style="padding:0.8rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:0.8rem;">
            <span style="font-size:1.2rem;">🔍</span>
            <input type="text" id="creator-search" placeholder="Buscar por username..." 
                   style="background:transparent;border:none;color:var(--text-primary);width:100%;outline:none;font-size:0.95rem;">
        </div>

        <div id="creators-items-container">
            ${renderList(data)}
        </div>
    `;

    const searchInput = container.querySelector('#creator-search');
    const itemsContainer = container.querySelector('#creators-items-container');

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        const filtered = data.filter(c => c.username.toLowerCase().includes(val));
        itemsContainer.innerHTML = renderList(filtered);
    });
}

