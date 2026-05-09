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
        emisionesLive:      Number(find(['Emisiones LIVE', 'Total LIVE Emissions', 'Sesiones LIVE', 'Días válidos de emisiones LIVE']) || 0),
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
    const managers = profs.filter(p => p.is_manager);
    const creators = profs.filter(p => p.is_creator);
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
        <div style="margin-bottom:2.5rem; display:flex; justify-content:space-between; align-items:flex-end;">
            <div>
                <h1 style="font-size:2.2rem; font-weight:800; margin-bottom:0.5rem; letter-spacing:-0.02em;">Centro de Control</h1>
                <p style="color:var(--text-secondary); font-size:1rem;">Administración global y supervisión de la red de managers.</p>
            </div>
            ${period ? `<div class="badge" style="background:rgba(99,102,241,0.1); color:var(--primary-light); padding:0.6rem 1rem; font-weight:700;">${period.label}</div>` : ''}
        </div>

        <!-- ── Navigation Cards ────────────────────────────────────────── -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1.5rem; margin-bottom:3rem;">
            <div class="glass-panel action-card" id="nav-manage-managers" style="padding:2rem; cursor:pointer; transition:all 0.3s ease; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:2rem; margin-bottom:1rem;">👥</div>
                <h3 style="margin-bottom:0.5rem;">Administrar Managers</h3>
                <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.4;">Alta de nuevos supervisores, gestión de roles y bajas del sistema.</p>
            </div>
            <div class="glass-panel action-card" id="nav-audit-center" style="padding:2rem; cursor:pointer; transition:all 0.3s ease; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:2rem; margin-bottom:1rem;">📈</div>
                <h3 style="margin-bottom:0.5rem;">Auditar Operaciones</h3>
                <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.4;">Revisar dashboards de managers, asignar creadores y monitorear grupos.</p>
            </div>
            <div class="glass-panel action-card" id="nav-metrics-upload" style="padding:2rem; cursor:pointer; transition:all 0.3s ease; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:2rem; margin-bottom:1rem;">📥</div>
                <h3 style="margin-bottom:0.5rem;">Cargar Métricas</h3>
                <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.4;">Importar reportes de TikTok y actualizar los datos del mes.</p>
            </div>
        </div>

        <div id="admin-active-view">
            <!-- Sección inicial: Métricas Rápidas -->
            <div class="metrics-grid">
                <div class="glass-panel metric-card" style="background:linear-gradient(135deg, rgba(99,102,241,0.05), transparent);">
                    <span class="metric-title">Diamantes Acumulados</span>
                    <span class="metric-value text-gradient" style="font-size:2.8rem;">${fmt(totalDiamonds)}</span>
                </div>
                <div class="glass-panel metric-card">
                    <span class="metric-title">Creadores Activos</span>
                    <span class="metric-value">${validCreators} <span style="font-size:1.2rem; color:var(--text-muted);">/ ${totalCreators}</span></span>
                </div>
                <div class="glass-panel metric-card">
                    <span class="metric-title">Emisiones LIVE</span>
                    <span class="metric-value">${fmt(data.reduce((s,c) => s + Number(c.emisionesLive || 0), 0))}</span>
                </div>
            </div>
        </div>

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

        <!-- ── Gestión de Managers y Roles ──────────────────────────────── -->
        <div style="margin-top:2rem;">
            <h3 style="margin-bottom:1rem;">💼 Gestión de Managers y Roles</h3>
            
            <!-- Buscador para añadir/cambiar roles -->
            <div class="glass-panel" style="padding:1.5rem; margin-bottom:1.5rem;">
                <label style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.5rem; display:block;">Promover usuario o buscar Manager:</label>
                <div style="display:flex; gap:0.5rem;">
                    <input type="text" id="role-user-search" class="input-control" placeholder="Email o nombre del usuario...">
                    <button id="role-search-btn" class="btn btn-primary" style="padding:0.7rem 1.2rem;">Buscar</button>
                </div>
                <div id="role-search-results" style="margin-top:1rem; display:flex; flex-direction:column; gap:0.5rem;"></div>
            </div>

            <div class="metrics-grid">
                ${managers.map(m => {
                    const group = creators.filter(c => c.manager_id === m.id);
                    const groupUsernames = group.map(c => (c.tiktok_username || '').toLowerCase());
                    const groupMetrics = data.filter(c => groupUsernames.includes((c.username || '').toLowerCase()));
                    const groupDiamonds = groupMetrics.reduce((s, c) => s + Number(c.diamonds || 0), 0);
                    return `
                    <div class="glass-panel metric-card" style="padding:1rem; border-left:4px solid var(--primary);">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                            <div style="min-width:0;flex:1;">
                                <div style="font-weight:700;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.display_name || m.tiktok_username || m.email}</div>
                                <div class="text-xs text-muted">${group.length} creadores asignados</div>
                            </div>
                            <div style="display:flex; gap:0.4rem; flex-shrink:0;">
                                <button class="btn btn-sm view-manager" data-id="${m.id}" style="padding:0.3rem 0.5rem;font-size:0.65rem;background:rgba(124,110,247,0.1);">👁️ Auditar</button>
                            </div>
                        </div>
                        <div style="margin-top:1rem; display:flex; justify-content:space-between; align-items:flex-end;">
                            <div>
                                <div class="text-xs text-muted">Total Grupo</div>
                                <div style="font-weight:800;color:var(--primary-light);font-size:1.1rem;">${fmt(groupDiamonds)} 💎</div>
                            </div>
                            ${m.is_creator ? '<span class="badge badge-pill" style="font-size:0.6rem; background:rgba(236,72,153,0.1); color:var(--accent);">Es Creador</span>' : ''}
                        </div>
                    </div>`;
                }).join('')}
                ${managers.length === 0 ? '<div class="glass-panel" style="grid-column:1/-1;padding:1.5rem;text-align:center;color:var(--text-muted);">No hay managers activos. Busca un usuario arriba para darle el rol.</div>' : ''}
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
                                    <td>${c.validDays || 0}</td>
                                    <td>
                                        <button class="btn btn-sm view-creator" data-username="${c.tiktok_username || c.id}" style="padding:0.3rem 0.6rem; font-size:0.75rem;">👁️ Ver</button>
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
        const [year, month] = monthStr.split('-');
        const periodDate = `${monthStr}-01`;
        // Usar UTC para evitar que el desfase horario cambie el mes
        const dt = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
        const label = dt.toLocaleString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' })
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

    // ── Wire up: Roles & Management ──────────────────────────────────────
    const roleSearchInput = container.querySelector('#role-user-search');
    const roleSearchBtn   = container.querySelector('#role-search-btn');
    const roleResults     = container.querySelector('#role-search-results');

    const doRoleSearch = async () => {
        const query = roleSearchInput.value.trim();
        if (query.length < 3) { appState.showToast('Mínimo 3 letras', 'info'); return; }
        roleSearchBtn.disabled = true;
        try {
            const found = await profiles.searchProfiles(query);
            roleResults.innerHTML = found.map(p => `
                <div class="glass-panel" style="padding:0.8rem; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:600; font-size:0.85rem;">${p.display_name || p.email}</div>
                        <div style="font-size:0.7rem; color:var(--text-muted);">${p.email}</div>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <label style="font-size:0.7rem; display:flex; align-items:center; gap:0.3rem;">
                            <input type="checkbox" class="role-toggle" data-uid="${p.id}" data-role="isManager" ${p.is_manager ? 'checked' : ''}> Manager
                        </label>
                        <label style="font-size:0.7rem; display:flex; align-items:center; gap:0.3rem;">
                            <input type="checkbox" class="role-toggle" data-uid="${p.id}" data-role="isCreator" ${p.is_creator ? 'checked' : ''}> Creador
                        </label>
                    </div>
                </div>
            `).join('') || '<div style="font-size:0.8rem; color:var(--text-muted);">No se encontraron usuarios.</div>';
        } catch (e) {
            appState.showToast('Error buscando usuarios', 'error');
        } finally {
            roleSearchBtn.disabled = false;
        }
    };

    roleSearchBtn?.addEventListener('click', doRoleSearch);
    roleSearchInput?.addEventListener('keypress', (e) => e.key === 'Enter' && doRoleSearch());

    // Delegación para toggles de roles
    roleResults?.addEventListener('change', async (e) => {
        if (e.target.classList.contains('role-toggle')) {
            const uid = e.target.dataset.uid;
            const roleKey = e.target.dataset.role;
            const status = e.target.checked;
            
            // Buscar el perfil actual para no sobreescribir otros roles
            const currentProfs = store.getProfiles();
            const p = currentProfs.find(x => x.id === uid);
            
            const newRoles = {
                isAdmin: p.is_admin,
                isManager: roleKey === 'isManager' ? status : p.is_manager,
                isCreator: roleKey === 'isCreator' ? status : p.is_creator
            };

            try {
                await profiles.updateRoles(uid, newRoles);
                appState.showToast('Rol actualizado correctamente');
                await store.refreshAdminLists();
                renderAdminDashboard(container); // Refrescar para ver cambios en la lista de managers
            } catch (err) {
                appState.showToast('Error actualizando rol', 'error');
                e.target.checked = !status; // Revertir UI
            }
        }
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

    // ── Navigation Logic ──────────────────────────────────────────────────
    const activeView = container.querySelector('#admin-active-view');
    
    container.querySelector('#nav-manage-managers')?.addEventListener('click', () => {
        renderManageRoles(activeView, profs);
    });
    container.querySelector('#nav-audit-center')?.addEventListener('click', () => {
        renderAuditCenter(activeView, managers, creators, data);
    });
    container.querySelector('#nav-metrics-upload')?.addEventListener('click', () => {
        renderMetricsUploadSection(activeView, container);
    });
}

// ── Vistas Secundarias (Administrar / Auditar) ──────────────────────────────

async function renderManageRoles(container, allProfiles) {
    container.innerHTML = `
        <div class="glass-panel" style="padding:2rem; animation:fadeIn 0.3s ease;">
            <div style="margin-bottom:2rem;">
                <h3 style="margin-bottom:0.5rem;">Gestión de Nómina</h3>
                <p style="color:var(--text-secondary); font-size:0.85rem;">Busca un usuario para promoverlo a Manager o quitarle permisos.</p>
            </div>
            
            <div style="display:flex; gap:1rem; margin-bottom:2rem;">
                <input type="text" id="user-search-input" class="input-control" placeholder="Nombre o email del usuario..." style="flex:1;">
                <button id="btn-search-users" class="btn btn-primary">🔍 Buscar</button>
            </div>

            <div id="manage-results-list" style="display:flex; flex-direction:column; gap:1rem;">
                <p style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:2rem;">Escribe arriba para buscar usuarios en la base de datos.</p>
            </div>
        </div>
    `;

    const input = container.querySelector('#user-search-input');
    const list = container.querySelector('#manage-results-list');

    const search = async () => {
        const q = input.value.trim();
        if (q.length < 3) return;
        list.innerHTML = `<div style="text-align:center; padding:2rem;">Buscando…</div>`;
        try {
            const found = await profiles.searchProfiles(q);
            list.innerHTML = found.map(p => `
                <div class="glass-panel" style="padding:1.2rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02);">
                    <div>
                        <div style="font-weight:700; font-size:0.95rem;">${p.display_name || p.email}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${p.email}</div>
                        <div style="margin-top:0.5rem; display:flex; gap:0.5rem;">
                            ${p.is_manager ? '<span class="badge" style="background:var(--primary); color:white; font-size:0.6rem;">MANAGER</span>' : ''}
                            ${p.is_creator ? '<span class="badge" style="background:var(--accent); color:white; font-size:0.6rem;">CREADOR</span>' : ''}
                        </div>
                    </div>
                    <div style="display:flex; gap:1rem;">
                        <button class="btn btn-sm toggle-manager-btn" data-uid="${p.id}" data-active="${p.is_manager}" 
                                style="background:${p.is_manager ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}; 
                                       color:${p.is_manager ? '#ef4444' : '#10b981'}; 
                                       border:1px solid ${p.is_manager ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'};">
                            ${p.is_manager ? 'Quitar Manager' : 'Hacer Manager'}
                        </button>
                    </div>
                </div>
            `).join('') || `<p style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron usuarios.</p>`;
        } catch (e) { list.innerHTML = 'Error en la búsqueda.'; }
    };

    container.querySelector('#btn-search-users').onclick = search;
    input.onkeypress = (e) => e.key === 'Enter' && search();

    list.onclick = async (e) => {
        const btn = e.target.closest('.toggle-manager-btn');
        if (!btn) return;
        const uid = btn.dataset.uid;
        const isActive = btn.dataset.active === 'true';

        if (isActive) {
            const pass = prompt('Esta es una acción crítica. Por seguridad, ingresa tu clave de Admin para confirmar la baja del Manager:');
            if (!pass) return;
            // Aquí se podría validar el pass con Supabase re-autenticando, 
            // pero para esta versión validamos que no sea nulo.
        }

        try {
            const p = (await profiles.searchProfiles(uid))[0]; // Recargar datos frescos
            await profiles.updateRoles(uid, {
                isAdmin: p.is_admin,
                isManager: !isActive,
                isCreator: p.is_creator
            });
            appState.showToast('Permisos actualizados correctamente', 'success');
            search(); // Refrescar lista
        } catch (err) { appState.showToast('Error: ' + err.message, 'error'); }
    };
}

async function renderAuditCenter(container, managers, creators, metricsData) {
    container.innerHTML = `
        <div style="animation:slideInUp 0.3s ease;">
            <div style="margin-bottom:2rem; display:flex; justify-content:space-between; align-items:center;">
                <h3>Centro de Auditoría</h3>
                <span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted);">${managers.length} Managers Activos</span>
            </div>
            
            <div class="metrics-grid">
                ${managers.map(m => {
                    const myGroup = creators.filter(c => c.manager_id === m.id);
                    const usernames = myGroup.map(c => (c.tiktok_username || '').toLowerCase());
                    const groupMetrics = metricsData.filter(d => usernames.includes((d.username || '').toLowerCase()));
                    const groupDiamonds = groupMetrics.reduce((s, d) => s + Number(d.diamonds || 0), 0);
                    
                    return `
                    <div class="glass-panel" style="padding:1.5rem; display:flex; flex-direction:column; gap:1.2rem; border-top:3px solid var(--primary);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <div style="font-weight:800; font-size:1.1rem; color:var(--text-primary);">${m.display_name || m.email}</div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${m.email}</div>
                            </div>
                            <div class="badge" style="background:rgba(99,102,241,0.1); color:var(--primary-light);">
                                ${myGroup.length} Creadores
                            </div>
                        </div>
                        
                        <div style="background:rgba(255,255,255,0.02); padding:0.8rem; border-radius:var(--radius-sm); border:1px solid rgba(255,255,255,0.05);">
                            <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Rendimiento del Grupo</div>
                            <div style="font-weight:800; font-size:1.4rem; color:var(--accent);">${fmt(groupDiamonds)} 💎</div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                            <button class="btn btn-sm audit-manager-dash" data-id="${m.id}" style="font-size:0.7rem; background:rgba(255,255,255,0.05);">👁️ Dashboard</button>
                            <button class="btn btn-sm manage-group-btn" data-id="${m.id}" style="font-size:0.7rem; background:rgba(255,255,255,0.05);">👥 Gestionar</button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    container.querySelectorAll('.audit-manager-dash').forEach(btn => {
        btn.onclick = () => import('./managerDashboard.js').then(m => m.renderManagerDashboard(container, btn.dataset.id));
    });

    container.querySelectorAll('.manage-group-btn').forEach(btn => {
        btn.onclick = () => renderGroupManager(container, btn.dataset.id, creators);
    });
}

async function renderGroupManager(container, managerId, allCreators) {
    const manager = allCreators.find(c => c.id === managerId) || { display_name: 'Manager' };
    const myGroup = allCreators.filter(c => c.manager_id === managerId);
    const unassigned = allCreators.filter(c => !c.manager_id);

    container.innerHTML = `
        <div class="glass-panel" style="padding:2rem; animation:fadeIn 0.3s ease;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                <h4>Gestionar Grupo: ${manager.display_name}</h4>
                <button id="back-to-audit" class="btn btn-sm" style="background:rgba(255,255,255,0.05);">← Volver</button>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:2rem;">
                <div>
                    <h5 style="margin-bottom:1rem; font-size:0.8rem; color:var(--text-muted);">MIEMBROS ACTUALES</h5>
                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        ${myGroup.map(c => `
                            <div style="padding:0.6rem; background:rgba(255,255,255,0.02); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-size:0.85rem;">@${c.tiktok_username || c.email}</span>
                                <button class="btn-remove-from-group" data-cid="${c.id}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.8rem;">Quitar</button>
                            </div>
                        `).join('') || '<p style="color:var(--text-muted); font-size:0.8rem;">Sin creadores asignados.</p>'}
                    </div>
                </div>
                <div>
                    <h5 style="margin-bottom:1rem; font-size:0.8rem; color:var(--text-muted);">AÑADIR CREADORES (SIN MANAGER)</h5>
                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        ${unassigned.map(c => `
                            <div style="padding:0.6rem; background:rgba(255,255,255,0.02); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-size:0.85rem;">@${c.tiktok_username || c.email}</span>
                                <button class="btn-add-to-group" data-cid="${c.id}" style="background:none; border:none; color:var(--primary); cursor:pointer; font-size:0.8rem;">Añadir</button>
                            </div>
                        `).join('') || '<p style="color:var(--text-muted); font-size:0.8rem;">No hay creadores libres.</p>'}
                    </div>
                </div>
            </div>
        </div>
    `;

    container.querySelector('#back-to-audit').onclick = () => {
        // Al volver, refrescamos las listas y el dashboard
        store.refreshAdminLists().then(() => renderAdminDashboard(container));
    };

    container.addEventListener('click', async (e) => {
        const btnAdd = e.target.closest('.btn-add-to-group');
        const btnRem = e.target.closest('.btn-remove-from-group');

        if (btnAdd) {
            try {
                await profiles.assignManager(btnAdd.dataset.cid, managerId);
                appState.showToast('Añadido al grupo', 'success');
                renderGroupManager(container, managerId, await profiles.searchProfiles('')); // Refrescar vista
            } catch (err) { appState.showToast('Error', 'error'); }
        }

        if (btnRem) {
            try {
                await profiles.assignManager(btnRem.dataset.cid, null);
                appState.showToast('Eliminado del grupo', 'info');
                renderGroupManager(container, managerId, await profiles.searchProfiles('')); // Refrescar vista
            } catch (err) { appState.showToast('Error', 'error'); }
        }
    });
}

function renderMetricsUploadSection(container, mainContainer) {
    container.innerHTML = `
        <div class="glass-panel" style="padding:2rem; animation:fadeIn 0.3s ease;">
            <div style="margin-bottom:2rem;">
                <h3 style="margin-bottom:0.5rem;">Carga de Métricas TikTok</h3>
                <p style="color:var(--text-secondary); font-size:0.85rem;">Sube el archivo Excel oficial para actualizar el dashboard del mes.</p>
            </div>
            
            <div class="input-group">
                <label>Mes del Reporte</label>
                <input type="month" id="up-period" class="input-control" value="${new Date().toISOString().slice(0,7)}">
            </div>
            <div class="input-group" style="margin-top:1.5rem;">
                <label>Archivo Excel (.xlsx)</label>
                <div style="position:relative; margin-top:0.5rem;">
                    <input type="file" id="up-file" class="input-control" accept=".xlsx,.xls,.csv" style="padding:2rem; border:2px dashed rgba(255,255,255,0.1); background:rgba(255,255,255,0.01); text-align:center;">
                </div>
            </div>
            <div id="up-preview" style="margin:1.5rem 0; font-size:0.9rem; color:var(--text-secondary); min-height:40px;"></div>
            <button id="up-btn-start" class="btn btn-primary" disabled style="width:100%; padding:1.2rem; font-weight:700; letter-spacing:0.05em;">🚀 PUBLICAR DATOS DEL MES</button>
            <p style="font-size:0.7rem; color:var(--text-muted); text-align:center; margin-top:1rem;">Al publicar, se sobrescribirán los datos existentes para el mes seleccionado.</p>
        </div>
    `;

    const fileInput = container.querySelector('#up-file');
    const periodInput = container.querySelector('#up-period');
    const uploadBtn = container.querySelector('#up-btn-start');
    const preview = container.querySelector('#up-preview');
    let parsedRows = null;

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        preview.innerHTML = '<span class="loading-dots">Analizando archivo</span>';
        try {
            const buf = await file.arrayBuffer();
            const wb  = window.XLSX.read(buf, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const jsonData = window.XLSX.utils.sheet_to_json(sheet, { defval: null });
            
            parsedRows = jsonData.map(normalizeRow).filter(Boolean);
            
            if (!parsedRows.length) {
                preview.innerHTML = `<span style="color:#ef4444;">⚠ No se detectaron filas de creadores válidas.</span>`;
                uploadBtn.disabled = true;
            } else {
                const totalD = parsedRows.reduce((s, r) => s + (r.diamonds || 0), 0);
                preview.innerHTML = `
                    <div style="background:rgba(16,185,129,0.05); padding:1rem; border-radius:var(--radius-sm); border:1px solid rgba(16,185,129,0.2);">
                        <strong style="color:#10b981;">✓ ${parsedRows.length} creadores detectados</strong><br>
                        Total diamantes: ${fmt(totalD)} 💎
                    </div>
                `;
                uploadBtn.disabled = !isSupabaseConfigured;
            }
        } catch (err) {
            preview.innerHTML = `<span style="color:#ef4444;">Error: ${err.message}</span>`;
        }
    };

    uploadBtn.onclick = async () => {
        const monthStr = periodInput.value;
        const [year, month] = monthStr.split('-');
        const periodDate = `${monthStr}-01`;
        const dt = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
        const label = dt.toLocaleString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' })
                        .replace(/^./, c => c.toUpperCase());

        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Publicando...';

        try {
            const res = await metrics.upsertPeriod(periodDate, label, parsedRows);
            appState.showToast(`Éxito: ${res.inserted} nuevos, ${res.updated} actualizados`, 'success');
            await store.refreshMetrics();
            import('../main.js').then(m => m.appState.navigate('admin')); // Volver al inicio
        } catch (err) {
            appState.showToast('Error al subir: ' + err.message, 'error');
            uploadBtn.disabled = false;
            uploadBtn.textContent = '🚀 PUBLICAR DATOS DEL MES';
        }
    };
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
                        <div style="text-align:right;flex-shrink:0; display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem;">
                            <div>
                                <div style="font-weight:800;color:var(--primary-light);font-size:0.9rem;">${fmt(c.diamonds)} 💎</div>
                                <div style="font-size:0.7rem;color:var(--text-muted);">${c.validDays} días · ${(c.liveSeconds/3600).toFixed(1)}h</div>
                            </div>
                            <button class="btn btn-sm view-creator" data-username="${c.username}" style="padding:0.3rem 0.6rem; font-size:0.7rem; background:rgba(255,255,255,0.05);">👁️ Dashboard</button>
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

