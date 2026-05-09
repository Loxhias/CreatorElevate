import { store } from '../store.js';
import { appState } from '../main.js';
import { metrics, profiles, push } from '../api.js';
import { isSupabaseConfigured } from '../supabase.js';

/**
 * UTILS & FORMATTERS
 * Standardized following 'Impeccable' principles
 */
const fmt = (n) => Number(n || 0).toLocaleString('es');
const safeJson = (wb) => window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });

function parseLiveSeconds(str) {
    if (!str) return 0;
    if (typeof str === 'number') return Math.round(str * 3600);
    const s = String(str);
    const h = +(s.match(/(\d+)h/)   || [0,0])[1];
    const m = +(s.match(/(\d+)min/) || [0,0])[1];
    const sec = +(s.match(/(\d+)s/) || [0,0])[1];
    return h * 3600 + m * 60 + sec;
}

function normalizeRow(row) {
    const entries = Object.entries(row);
    const find = (kws) => {
        const found = entries.find(([k]) => kws.some(kw => k.toLowerCase().trim().includes(kw.toLowerCase())));
        return found ? found[1] : null;
    };
    const username = String(find(['Nombre de usuario del creador', 'username']) || '').trim().replace(/^@/, '').toLowerCase();
    if (!username) return null;
    return {
        username,
        diamonds: Number(find(['Diamonds', 'Diamantes']) || 0),
        liveDuration: String(find(['LIVE Duration', 'Duración de LIVE']) || '0s'),
        liveSeconds: parseLiveSeconds(find(['LIVE Duration', 'Duración de LIVE'])),
        validDays: Number(find(['Días válidos', 'Valid Days']) || 0),
        emisionesLive: Number(find(['Emisiones LIVE', 'Total LIVE Emissions']) || 0),
    };
}

/**
 * MAIN RENDERER (Sequential Entry Point)
 */
export async function renderAdminDashboard(container) {
    container.innerHTML = `<div style="padding:4rem; text-align:center;"><div class="loading-dots">Cargando Inteligencia de Datos</div></div>`;
    
    if (isSupabaseConfigured) {
        await Promise.all([store.refreshAdminLists(), store.refreshMetrics()]).catch(console.warn);
    }

    const data = store.getMetricsData() || [];
    const profs = store.getProfiles() || [];
    const managers = profs.filter(p => p.is_manager);
    const creators = profs.filter(p => p.is_creator);
    const period = store.getPeriod();

    const totalDiamonds = data.reduce((s,c) => s + Number(c.diamonds || 0), 0);

    container.innerHTML = `
        <div class="admin-shell" style="animation: fadeIn var(--duration-md) var(--ease-out);">
            <!-- Page Header -->
            <header style="margin-bottom:3rem; display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <h1 class="text-gradient" style="font-size:2.8rem; margin-bottom:0.5rem;">Agency Control</h1>
                    <p style="color:var(--text-secondary); font-size:1.1rem; font-weight:500;">Administración central de la Red de Managers.</p>
                </div>
                ${period ? `<div class="badge-premium" style="background:var(--primary); color:white; padding:0.6rem 1.2rem; border-radius:var(--radius-full); font-weight:800; font-size:0.8rem;">${period.label}</div>` : ''}
            </header>

            <!-- Navigation Grid -->
            <nav class="admin-nav-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:1.5rem; margin-bottom:4rem;">
                <div class="glass-panel nav-card" id="btn-audit-nav">
                    <div class="nav-card-icon">👑</div>
                    <div class="nav-card-body">
                        <h3>Oversight</h3>
                        <p>Auditoría de Managers y rendimientos de equipo.</p>
                    </div>
                </div>
                <div class="glass-panel nav-card" id="btn-manage-nav">
                    <div class="nav-card-icon">📂</div>
                    <div class="nav-card-body">
                        <h3>Nómina</h3>
                        <p>Gestión de roles y asignación de rangos.</p>
                    </div>
                </div>
                <div class="glass-panel nav-card" id="btn-upload-nav">
                    <div class="nav-card-icon">💎</div>
                    <div class="nav-card-body">
                        <h3>Métricas</h3>
                        <p>Importación de datos y actualización mensual.</p>
                    </div>
                </div>
            </nav>

            <!-- Active View Slot -->
            <section id="admin-view-slot">
                <div class="metrics-grid">
                    <div class="glass-panel metric-card" style="border-top:3px solid var(--primary);">
                        <span class="metric-title">Facturación Total</span>
                        <span class="metric-value text-gradient">${fmt(totalDiamonds)}</span>
                        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:1rem;">Diamantes procesados en el período.</p>
                    </div>
                    <div class="glass-panel metric-card">
                        <span class="metric-title">Staff Managers</span>
                        <span class="metric-value">${managers.length}</span>
                        <div style="margin-top:1rem; display:flex; gap:0.5rem;">
                            <span class="badge" style="background:rgba(124,110,247,0.1); color:var(--primary-light); font-size:0.6rem;">OPERATIVOS</span>
                        </div>
                    </div>
                    <div class="glass-panel metric-card">
                        <span class="metric-title">Creators Activos</span>
                        <span class="metric-value">${creators.length}</span>
                        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:1rem;">Usuarios con dashboard propio.</p>
                    </div>
                </div>
            </section>
        </div>
    `;

    const viewSlot = container.querySelector('#admin-view-slot');

    // Navigation Wiring
    container.querySelector('#btn-audit-nav').onclick  = () => renderAuditSection(viewSlot, managers, creators, data);
    container.querySelector('#btn-manage-nav').onclick = () => renderManageSection(viewSlot);
    container.querySelector('#btn-upload-nav').onclick = () => renderUploadSection(viewSlot, container);
}

/**
 * SECTION: AUDIT OVERSIGHT
 */
function renderAuditSection(container, managers, creators, metrics) {
    container.innerHTML = `
        <div style="animation: slideInUp var(--duration-md) var(--ease-out);">
            <h2 style="margin-bottom:2rem; font-size:1.8rem;">Supervisión de Managers</h2>
            <div class="metrics-grid">
                ${managers.map(m => {
                    const group = creators.filter(c => c.manager_id === m.id);
                    const usernames = group.map(c => (c.tiktok_username || '').toLowerCase());
                    const groupMetrics = metrics.filter(d => usernames.includes((d.username || '').toLowerCase()));
                    const totalD = groupMetrics.reduce((s, d) => s + Number(d.diamonds || 0), 0);

                    return `
                    <div class="glass-panel" style="padding:2rem; display:flex; flex-direction:column; gap:1.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <h4 style="font-size:1.2rem; margin:0;">${m.display_name || m.email}</h4>
                                <span style="font-size:0.75rem; color:var(--text-muted);">${m.email}</span>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:0.7rem; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Grupo</div>
                                <div style="font-weight:700; color:var(--primary);">${group.length}</div>
                            </div>
                        </div>

                        <div style="background:rgba(255,255,255,0.02); padding:1.2rem; border-radius:14px; border:1px solid var(--glass-border);">
                            <div style="font-size:0.65rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.4rem;">Revenue de Equipo</div>
                            <div style="font-size:1.8rem; font-weight:800; color:var(--accent); font-family:'Space Grotesk';">${fmt(totalD)} 💎</div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                            <button class="btn btn-sm btn-ghost op-audit-dash" data-id="${m.id}">Dashboard</button>
                            <button class="btn btn-sm btn-ghost op-manage-grp" data-id="${m.id}">Equipo</button>
                        </div>
                    </div>`;
                }).join('') || '<p style="padding:3rem; text-align:center; color:var(--text-muted);">No hay managers activos para auditar.</p>'}
            </div>
        </div>
    `;

    container.querySelectorAll('.op-audit-dash').forEach(btn => {
        btn.onclick = () => {
            container.innerHTML = '<div style="padding:4rem; text-align:center;">Abriendo Panel de Manager...</div>';
            import('./managerDashboard.js').then(m => m.renderManagerDashboard(container, btn.dataset.id));
        };
    });
    container.querySelectorAll('.op-manage-grp').forEach(btn => {
        btn.onclick = () => renderGroupManager(container, btn.dataset.id);
    });
}

/**
 * SECTION: STAFF MANAGEMENT
 */
function renderManageSection(container) {
    container.innerHTML = `
        <div class="glass-panel" style="padding:2.5rem; animation: slideInUp var(--duration-md) var(--ease-out);">
            <h2 style="margin-bottom:0.5rem;">Gestión de Staff</h2>
            <p style="color:var(--text-secondary); margin-bottom:2.5rem;">Busca perfiles para asignarles roles administrativos.</p>
            
            <div style="display:flex; gap:1rem; margin-bottom:2.5rem;">
                <input type="text" id="staff-search-input" class="input-control" placeholder="Email o nombre del usuario..." style="flex:1;">
                <button id="staff-search-btn" class="btn btn-primary" style="padding:0 2.5rem;">Buscar</button>
            </div>

            <div id="staff-results-area" style="display:flex; flex-direction:column; gap:1.2rem;"></div>
        </div>
    `;

    const input = container.querySelector('#staff-search-input');
    const results = container.querySelector('#staff-results-area');
    const btn = container.querySelector('#staff-search-btn');

    // Stop propagation for typing
    input.addEventListener('click', e => e.stopPropagation());

    const search = async () => {
        const q = input.value.trim();
        if (q.length < 2) return;
        results.innerHTML = '<div style="padding:2rem; text-align:center;">Buscando en la base de datos...</div>';
        try {
            const found = await profiles.searchProfiles(q);
            results.innerHTML = found.map(p => `
                <div class="glass-panel" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.01);">
                    <div>
                        <div style="font-weight:800; font-size:1.1rem;">${p.display_name || p.email}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${p.email}</div>
                        <div style="margin-top:0.8rem; display:flex; gap:0.5rem;">
                            ${p.is_manager ? '<span class="badge" style="background:var(--primary); color:white; font-size:0.6rem;">MANAGER</span>' : ''}
                            ${p.is_creator ? '<span class="badge" style="background:var(--accent); color:black; font-size:0.6rem;">CREADOR</span>' : ''}
                        </div>
                    </div>
                    <button class="btn btn-sm op-toggle-manager" data-id="${p.id}" data-active="${p.is_manager}" 
                            style="background:${p.is_manager ? 'rgba(239,68,68,0.1)' : 'var(--primary)'}; 
                                   color:${p.is_manager ? '#ef4444' : 'white'}; 
                                   border:1px solid ${p.is_manager ? 'rgba(239,68,68,0.2)' : 'transparent'};">
                        ${p.is_manager ? 'Degradar' : 'Promover'}
                    </button>
                </div>
            `).join('') || '<p style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron usuarios.</p>';
        } catch (e) { results.innerHTML = 'Error de conexión.'; }
    };

    btn.onclick = search;
    input.onkeypress = (e) => e.key === 'Enter' && search();

    results.onclick = async (e) => {
        const tBtn = e.target.closest('.op-toggle-manager');
        if (!tBtn) return;
        const uid = tBtn.dataset.id;
        const active = tBtn.dataset.active === 'true';

        if (active) {
            const ok = prompt('Acción Crítica: Escribe "CONFIRMAR" para retirar el rango de Manager:');
            if (ok !== 'CONFIRMAR') return;
        }

        try {
            const p = (await profiles.searchProfiles(uid))[0];
            await profiles.updateRoles(uid, { isAdmin: p.is_admin, isManager: !active, isCreator: p.is_creator });
            appState.showToast('Rol actualizado con éxito', 'success');
            search();
        } catch (err) { appState.showToast('Error: ' + err.message, 'error'); }
    };
}

/**
 * SECTION: METRICS CENTER
 */
function renderUploadSection(container, mainContainer) {
    container.innerHTML = `
        <div class="glass-panel" style="padding:3rem; animation: slideInUp var(--duration-md) var(--ease-out); max-width:650px; margin:0 auto;">
            <h2 style="margin-bottom:1rem;">Importación de Datos</h2>
            <p style="color:var(--text-secondary); margin-bottom:3rem;">Sincroniza los resultados mensuales desde el reporte oficial de TikTok.</p>
            
            <div class="input-group">
                <label class="label-caps">Período Fiscal</label>
                <input type="month" id="m-period" class="input-control" value="${new Date().toISOString().slice(0,7)}">
            </div>
            
            <div class="input-group" style="margin-top:2rem;">
                <label class="label-caps">Archivo de Reporte</label>
                <div style="position:relative; margin-top:0.8rem;">
                    <input type="file" id="m-file" class="input-control" accept=".xlsx,.xls,.csv" style="padding:3rem; border:2px dashed var(--glass-border); background:rgba(255,255,255,0.01); text-align:center; cursor:pointer;">
                </div>
            </div>

            <div id="m-preview-slot" style="margin:2rem 0; min-height:80px;"></div>
            
            <button id="m-publish-btn" class="btn btn-primary" disabled style="width:100%; padding:1.2rem; font-size:1.1rem; letter-spacing:0.05em;">PUBLICAR RESULTADOS</button>
        </div>
    `;

    const fileIn = container.querySelector('#m-file');
    const pubBtn = container.querySelector('#m-publish-btn');
    const preview = container.querySelector('#m-preview-slot');
    let finalRows = null;

    fileIn.onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        preview.innerHTML = '<div class="loading-dots">Validando integridad del archivo</div>';
        try {
            const buf = await f.arrayBuffer();
            const wb = window.XLSX.read(buf, { type: 'array' });
            const data = safeJson(wb);
            finalRows = data.map(normalizeRow).filter(Boolean);
            
            preview.innerHTML = `
                <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); padding:1.2rem; border-radius:14px; display:flex; align-items:center; gap:1rem;">
                    <span style="font-size:1.5rem;">✅</span>
                    <div>
                        <div style="font-weight:800; color:#10b981;">Archivo Validado</div>
                        <div style="font-size:0.8rem; color:rgba(16,185,129,0.8);">${finalRows.length} creadores listos para procesar.</div>
                    </div>
                </div>
            `;
            pubBtn.disabled = false;
        } catch (e) { preview.innerHTML = '<div style="color:var(--danger);">Error: El formato del archivo no es compatible.</div>'; }
    };

    pubBtn.onclick = async () => {
        const mStr = container.querySelector('#m-period').value;
        const [y, mm] = mStr.split('-');
        const periodKey = `${mStr}-01`;
        const dt = new Date(Date.UTC(y, mm - 1, 1));
        const label = dt.toLocaleString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^./, c => c.toUpperCase());

        pubBtn.disabled = true;
        pubBtn.textContent = 'Actualizando Base de Datos...';

        try {
            await metrics.upsertPeriod(periodKey, label, finalRows);
            appState.showToast('Base de datos actualizada con éxito', 'success');
            renderAdminDashboard(mainContainer);
        } catch (err) { 
            appState.showToast('Fallo crítico: ' + err.message, 'error'); 
            pubBtn.disabled = false;
            pubBtn.textContent = 'REINTENTAR PUBLICACIÓN';
        }
    };
}

/**
 * SECTION: GROUP EDITOR (Audit Drilldown)
 */
async function renderGroupManager(container, managerId) {
    container.innerHTML = '<div style="padding:4rem; text-align:center;">Sincronizando nómina de equipo...</div>';
    
    const [allP, metricsD] = await Promise.all([
        profiles.searchProfiles(''), 
        store.getMetricsData() || []
    ]);

    const manager = allP.find(p => p.id === managerId) || { display_name: 'Manager' };
    const myGroup = allP.filter(p => p.manager_id === managerId);
    const free = allP.filter(p => p.is_creator && !p.manager_id && p.id !== managerId);

    container.innerHTML = `
        <div style="animation: fadeIn var(--duration-sm) var(--ease-out);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2.5rem;">
                <div>
                    <h3 style="margin:0; font-size:1.6rem;">Gestión de Equipo</h3>
                    <p style="color:var(--text-secondary); margin:0.2rem 0 0 0;">Supervisor: ${manager.display_name || manager.email}</p>
                </div>
                <button id="close-grp-op" class="btn btn-sm btn-ghost">← Volver</button>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:2.5rem;">
                <!-- Current Members -->
                <div>
                    <h5 class="label-caps" style="margin-bottom:1.2rem;">MIEMBROS ACTIVOS (${myGroup.length})</h5>
                    <div style="display:flex; flex-direction:column; gap:0.8rem;">
                        ${myGroup.map(c => `
                            <div class="glass-panel" style="padding:1rem; display:flex; justify-content:space-between; align-items:center;">
                                <div style="font-weight:700;">@${c.tiktok_username || c.email}</div>
                                <button class="op-rem-c" data-cid="${c.id}" style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:800; font-size:0.75rem;">QUITAR</button>
                            </div>
                        `).join('') || '<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:2rem;">No hay creadores asignados.</p>'}
                    </div>
                </div>

                <!-- Unassigned Creators -->
                <div>
                    <h5 class="label-caps" style="margin-bottom:1.2rem;">CREADORES DISPONIBLES</h5>
                    <div style="display:flex; flex-direction:column; gap:0.8rem; max-height:450px; overflow-y:auto; padding-right:0.5rem;">
                        ${free.map(c => `
                            <div class="glass-panel" style="padding:1rem; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <div style="font-weight:700;">@${c.tiktok_username || c.email}</div>
                                    <div style="font-size:0.7rem; color:var(--text-muted);">${c.email}</div>
                                </div>
                                <button class="op-add-c" data-cid="${c.id}" style="background:none; border:none; color:var(--primary); cursor:pointer; font-weight:800; font-size:0.75rem;">AÑADIR</button>
                            </div>
                        `).join('') || '<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:2rem;">No hay creadores libres para asignar.</p>'}
                    </div>
                </div>
            </div>
        </div>
    `;

    container.querySelector('#close-grp-op').onclick = () => renderAdminDashboard(container.parentElement.parentElement);

    container.onclick = async (e) => {
        const add = e.target.closest('.op-add-c');
        const rem = e.target.closest('.op-rem-c');
        if (add) {
            await profiles.assignManager(add.dataset.cid, managerId);
            appState.showToast('Creador asignado al equipo', 'success');
            renderGroupManager(container, managerId);
        }
        if (rem) {
            await profiles.assignManager(rem.dataset.cid, null);
            appState.showToast('Creador desvinculado', 'info');
            renderGroupManager(container, managerId);
        }
    };
}

/**
 * SECTION: CREATOR DIRECTORY
 */
export async function renderCreatorsList(container) {
    container.innerHTML = `<div style="padding:4rem; text-align:center;"><div class="loading-dots">Escaneando Red de Creadores</div></div>`;
    
    if (isSupabaseConfigured) await store.refreshMetrics().catch(console.warn);
    const data = store.getMetricsData() || [];

    const renderList = (list) => {
        if (!list.length) return `<div style="padding:4rem; text-align:center; color:var(--text-muted);">No se encontraron creadores en este período.</div>`;
        return list.map(c => `
            <div class="glass-panel" style="padding:1.5rem; display:flex; align-items:center; gap:2rem; margin-bottom:1rem; animation: fadeIn var(--duration-sm) var(--ease-out);">
                <div style="width:56px; height:56px; border-radius:18px; background:var(--primary-gradient); display:flex; align-items:center; justify-content:center; color:white; font-weight:900; font-size:1.4rem; flex-shrink:0;">
                    ${c.username.charAt(0).toUpperCase()}
                </div>
                <div style="flex:1; min-width:0;">
                    <h4 style="margin:0; font-size:1.2rem;">@${c.username}</h4>
                    <p style="margin:0.2rem 0 0 0; font-size:0.85rem; color:var(--text-secondary);">Actividad: <b>${c.validDays}</b> días válidos registrados.</p>
                </div>
                <div style="text-align:right;">
                    <div class="text-gradient" style="font-weight:900; font-size:1.6rem; font-family:'Space Grotesk';">${fmt(c.diamonds)} 💎</div>
                    <button class="btn btn-sm btn-ghost drill-creator" data-username="${c.username}" style="margin-top:0.8rem;">Ver Perfil</button>
                </div>
            </div>
        `).join('');
    };

    container.innerHTML = `
        <div style="animation: fadeIn var(--duration-md) var(--ease-out);">
            <header style="margin-bottom:3rem;">
                <h1 style="font-size:2.8rem; font-weight:900; margin-bottom:0.5rem;">Directorio</h1>
                <p style="color:var(--text-secondary); font-size:1.1rem;">Visión individual de todos los creadores de la agencia.</p>
            </header>

            <div class="glass-panel" style="padding:1.2rem; margin-bottom:2.5rem; display:flex; align-items:center; gap:1.2rem; border-radius:var(--radius-full);">
                <span style="font-size:1.5rem; opacity:0.5;">🔍</span>
                <input type="text" id="dir-search" placeholder="Filtrar por nombre de usuario..." style="background:transparent; border:none; color:white; width:100%; outline:none; font-size:1.1rem; font-weight:500;">
            </div>

            <div id="dir-list-slot">
                ${renderList(data)}
            </div>
        </div>
    `;

    const input = container.querySelector('#dir-search');
    const slot = container.querySelector('#dir-list-slot');

    input.addEventListener('click', e => e.stopPropagation());
    input.oninput = (e) => {
        const val = e.target.value.toLowerCase().trim();
        slot.innerHTML = renderList(data.filter(c => c.username.toLowerCase().includes(val)));
    };

    container.onclick = (e) => {
        const btn = e.target.closest('.drill-creator');
        if (btn) {
            const username = btn.dataset.username;
            container.innerHTML = '<div style="padding:4rem; text-align:center;">Abriendo Dashboard del Creador...</div>';
            import('./creatorDashboard.js').then(m => m.renderCreatorDashboard(container, username));
        }
    };
}
