import { store } from '../store.js';
import { appState } from '../main.js';
import { metrics, profiles, push } from '../api.js';
import { isSupabaseConfigured } from '../supabase.js';

const fmt = (n) => Number(n || 0).toLocaleString('es');

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

// ── VISTA PRINCIPAL (ADMIN) ────────────────────────────────────────────────
export async function renderAdminDashboard(container) {
    // Si ya hay datos en el store, no los volvemos a pedir (evita lentitud)
    const currentProfs = store.getProfiles();
    const currentMetrics = store.getMetricsData();
    
    if (!currentProfs || !currentProfs.length || !currentMetrics || !currentMetrics.length) {
        container.innerHTML = `<div style="padding:2rem; text-align:center;">Cargando datos por primera vez...</div>`;
        if (isSupabaseConfigured) {
            await Promise.all([store.refreshAdminLists(), store.refreshMetrics()]).catch(console.warn);
        }
    }

    const data = store.getMetricsData() || [];
    const profs = store.getProfiles() || [];
    const managers = profs.filter(p => p.is_manager);
    const creators = profs.filter(p => p.is_creator);
    const period = store.getPeriod();

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="margin-bottom:2rem; display:flex; justify-content:space-between; align-items:center;">
                <h1 style="font-size:1.8rem; font-weight:800;">Panel de Administración</h1>
                ${period ? `<div class="badge" style="background:var(--primary); color:white;">${period.label}</div>` : ''}
            </div>

            <div class="metrics-grid" style="margin-bottom:2.5rem;">
                <div class="glass-panel action-card" id="nav-audit">
                    <div style="font-size:1.5rem; margin-bottom:0.5rem;">📊</div>
                    <h3 style="font-size:0.95rem;">Auditoría de Managers</h3>
                    <p style="font-size:0.75rem; color:var(--text-secondary);">Revisar dashboards y equipos.</p>
                </div>
                <div class="glass-panel action-card" id="nav-manage">
                    <div style="font-size:1.5rem; margin-bottom:0.5rem;">👥</div>
                    <h3 style="font-size:0.95rem;">Gestión de Managers</h3>
                    <p style="font-size:0.75rem; color:var(--text-secondary);">Altas, bajas y roles de staff.</p>
                </div>
                <div class="glass-panel action-card" id="nav-upload">
                    <div style="font-size:1.5rem; margin-bottom:0.5rem;">📥</div>
                    <h3 style="font-size:0.95rem;">Cargar Reporte TikTok</h3>
                    <p style="font-size:0.75rem; color:var(--text-secondary);">Subir Excel de métricas mensual.</p>
                </div>
            </div>

            <div id="admin-view-content">
                <div class="metrics-grid">
                    <div class="glass-panel metric-card">
                        <span class="metric-label">Diamantes Globales</span>
                        <span class="metric-value" style="color:var(--accent);">${fmt(data.reduce((s,c)=>s+Number(c.diamonds),0))}</span>
                    </div>
                    <div class="glass-panel metric-card">
                        <span class="metric-label">Managers Activos</span>
                        <span class="metric-value">${managers.length}</span>
                    </div>
                    <div class="glass-panel metric-card">
                        <span class="metric-label">Creadores Registrados</span>
                        <span class="metric-value">${creators.length}</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const viewContent = container.querySelector('#admin-view-content');

    container.querySelector('#nav-audit').onclick = () => renderAuditView(viewContent, managers, creators, data);
    container.querySelector('#nav-manage').onclick = () => renderManageView(viewContent);
    container.querySelector('#nav-upload').onclick = () => renderUploadView(viewContent, container);
}

// ── VISTA: AUDITORÍA ────────────────────────────────────────────────────────
function renderAuditView(container, managers, creators, metricsData) {
    container.innerHTML = `
        <div class="animate-fadeIn">
            <h2 style="margin-bottom:1.5rem;">Auditoría de Managers</h2>
            <div class="metrics-grid">
                ${managers.map(m => {
                    const myCreators = creators.filter(c => c.manager_id === m.id);
                    const usernames = myCreators.map(c => (c.tiktok_username || '').toLowerCase());
                    const groupMetrics = metricsData.filter(d => usernames.includes((d.username || '').toLowerCase()));
                    const groupDiamonds = groupMetrics.reduce((s, d) => s + Number(d.diamonds || 0), 0);

                    return `
                    <div class="glass-panel" style="display:flex; flex-direction:column; gap:1rem;">
                        <div style="font-weight:700;">${m.display_name || m.email}</div>
                        <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px;">
                            <div style="font-size:0.65rem; color:var(--text-secondary);">RENDIMIENTO GRUPO</div>
                            <div style="font-size:1.4rem; font-weight:800; color:var(--accent);">${fmt(groupDiamonds)} 💎</div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                            <button class="btn btn-ghost v-m-dash" data-id="${m.id}" style="font-size:0.7rem;">Dashboard</button>
                            <button class="btn btn-ghost v-m-group" data-id="${m.id}" style="font-size:0.7rem;">Gestionar Creadores</button>
                        </div>
                    </div>`;
                }).join('') || '<p>No hay managers asignados.</p>'}
            </div>
        </div>
    `;

    container.querySelectorAll('.v-m-dash').forEach(btn => {
        btn.onclick = () => {
            container.innerHTML = '<div style="padding:2rem;">Cargando Dashboard...</div>';
            import('./managerDashboard.js').then(mod => mod.renderManagerDashboard(container, btn.dataset.id));
        };
    });
    container.querySelectorAll('.v-m-group').forEach(btn => {
        btn.onclick = () => renderGroupEditor(container, btn.dataset.id);
    });
}

// ── VISTA: GESTIÓN DE MANAGERS (FIX TECLADO) ────────────────────────────────
function renderManageView(container) {
    container.innerHTML = `
        <div class="glass-panel animate-fadeIn">
            <h2 style="margin-bottom:1rem;">Gestión de Managers</h2>
            <p style="color:var(--text-secondary); margin-bottom:1.5rem; font-size:0.9rem;">Busca un usuario registrado por su email o nombre para asignarle el rol de Manager.</p>
            
            <div style="display:flex; gap:0.8rem; margin-bottom:2rem;">
                <input type="text" id="m-search-input" class="input-control" placeholder="Email o nombre del usuario..." style="flex:1;">
                <button id="m-search-btn" class="btn btn-primary">Buscar</button>
            </div>

            <div id="m-search-results" style="display:flex; flex-direction:column; gap:0.8rem;"></div>
        </div>
    `;

    const input = container.querySelector('#m-search-input');
    const results = container.querySelector('#m-search-results');
    const btn = container.querySelector('#m-search-btn');

    // FIX DEFINITIVO: Solo escuchar el botón o el Enter, sin delegación de clics global
    const doSearch = async () => {
        const q = input.value.trim();
        if (q.length < 2) return;
        results.innerHTML = 'Buscando...';
        try {
            const found = await profiles.searchProfiles(q);
            results.innerHTML = found.map(p => `
                <div class="glass-panel" style="padding:1rem; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:700;">${p.display_name || p.email}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">${p.email}</div>
                    </div>
                    <button class="btn btn-sm btn-role-toggle" data-id="${p.id}" data-active="${p.is_manager}" 
                            style="background:${p.is_manager ? 'rgba(255,85,105,0.1)' : 'var(--primary)'}; color:${p.is_manager ? 'var(--danger)' : 'white'};">
                        ${p.is_manager ? 'Quitar Manager' : 'Hacer Manager'}
                    </button>
                </div>
            `).join('') || '<p style="text-align:center; padding:1rem;">No se encontraron usuarios.</p>';

            // Re-vincular botones de resultado
            results.querySelectorAll('.btn-role-toggle').forEach(rBtn => {
                rBtn.onclick = async () => {
                    const uid = rBtn.dataset.id;
                    const isActive = rBtn.dataset.active === 'true';
                    if (isActive && !confirm('¿Estás seguro de quitar el rol de Manager a este usuario?')) return;
                    
                    try {
                        const p = (await profiles.searchProfiles(uid))[0];
                        await profiles.updateRoles(uid, { isAdmin: p.is_admin, isManager: !isActive, isCreator: p.is_creator });
                        appState.showToast('Rol actualizado correctamente', 'success');
                        doSearch();
                    } catch (err) { appState.showToast('Error: ' + err.message, 'error'); }
                };
            });
        } catch (e) { results.innerHTML = 'Error en la búsqueda.'; }
    };

    btn.onclick = doSearch;
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') doSearch(); });
}

// ── VISTA: CARGA DE REPORTE TIKTOK ──────────────────────────────────────────
function renderUploadView(container, mainContainer) {
    container.innerHTML = `
        <div class="glass-panel animate-fadeIn" style="max-width:600px; margin:0 auto;">
            <h2 style="margin-bottom:1rem;">Cargar Reporte TikTok</h2>
            <div class="input-group" style="margin-bottom:1.5rem;">
                <label style="display:block; font-size:0.8rem; margin-bottom:0.5rem; color:var(--text-secondary);">MES DEL REPORTE</label>
                <input type="month" id="up-month" class="input-control" value="${new Date().toISOString().slice(0,7)}">
            </div>
            <div class="input-group" style="margin-bottom:1.5rem;">
                <label style="display:block; font-size:0.8rem; margin-bottom:0.5rem; color:var(--text-secondary);">ARCHIVO EXCEL (.xlsx)</label>
                <input type="file" id="up-file" class="input-control" accept=".xlsx,.xls,.csv" style="padding:2rem; border:2px dashed var(--glass-border); text-align:center;">
            </div>
            <div id="up-preview" style="margin-bottom:1.5rem; font-size:0.9rem;"></div>
            <button id="up-btn" class="btn btn-primary" disabled style="width:100%;">PUBLICAR MÉTRICAS</button>
        </div>
    `;

    const fileIn = container.querySelector('#up-file');
    const uBtn = container.querySelector('#up-btn');
    const preview = container.querySelector('#up-preview');
    let rows = null;

    fileIn.onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
            const buf = await f.arrayBuffer();
            const wb = window.XLSX.read(buf, { type: 'array' });
            const data = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
            rows = data.map(normalizeRow).filter(Boolean);
            preview.innerHTML = `<span style="color:var(--accent);">✓ Detectados ${rows.length} creadores.</span>`;
            uBtn.disabled = false;
        } catch (e) { preview.innerHTML = '<span style="color:var(--danger);">Error leyendo el archivo.</span>'; }
    };

    uBtn.onclick = async () => {
        const m = container.querySelector('#up-month').value;
        const [y, mm] = m.split('-');
        const dt = new Date(Date.UTC(y, mm - 1, 1));
        const lbl = dt.toLocaleString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^./, c => c.toUpperCase());
        uBtn.disabled = true;
        uBtn.textContent = 'Publicando...';
        try {
            await metrics.upsertPeriod(`${m}-01`, lbl, rows);
            appState.showToast('Datos publicados con éxito', 'success');
            renderAdminDashboard(mainContainer);
        } catch (err) { 
            appState.showToast('Error: ' + err.message, 'error'); 
            uBtn.disabled = false;
            uBtn.textContent = 'PUBLICAR MÉTRICAS';
        }
    };
}

// ── VISTA: EDITOR DE GRUPO ────────────────────────────────────────────────
// Asignación por USERNAME directo en creator_metrics. No requiere cuenta.
async function renderGroupEditor(container, managerId) {
    container.innerHTML = '<div style="padding:2rem;">Sincronizando equipo...</div>';
    
    const allProfs = await profiles.searchProfiles('');
    const manager = allProfs.find(p => p.id === managerId) || { display_name: 'Manager' };
    
    // Obtener creadores asignados a este manager desde creator_metrics
    const assignedUsernames = await profiles.getCreatorsByManager(managerId);
    
    // Todos los creadores del Excel
    const metricsData = store.getMetricsData() || [];
    
    // Obtener TODOS los usernames asignados a CUALQUIER manager
    const allManagerIds = allProfs.filter(p => p.is_manager).map(p => p.id);
    let allTakenUsernames = [];
    for (const mid of allManagerIds) {
        const unames = await profiles.getCreatorsByManager(mid);
        allTakenUsernames = allTakenUsernames.concat(unames);
    }
    
    // Miembros de este manager
    const myGroup = metricsData.filter(c => assignedUsernames.includes(c.username.toLowerCase()));
    
    // Disponibles: no asignados a ningún manager
    const freeCreators = metricsData.filter(c => {
        return c.username && !allTakenUsernames.includes(c.username.toLowerCase());
    });

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                <h3 style="margin:0;">Equipo de ${manager.display_name || manager.email}</h3>
                <button id="close-grp" class="btn btn-ghost btn-sm">← Volver</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">
                <div class="glass-panel">
                    <h5 style="font-size:0.7rem; color:var(--text-secondary); margin-bottom:1rem;">MIEMBROS ACTUALES (${myGroup.length})</h5>
                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        ${myGroup.map(c => `
                            <div class="glass-panel" style="padding:0.6rem; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <div style="font-size:0.85rem; font-weight:600;">@${c.username}</div>
                                    <div style="font-size:0.65rem; color:var(--text-secondary);">${fmt(c.diamonds)} 💎</div>
                                </div>
                                <button class="rem-c" data-username="${c.username}" style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:700; font-size:0.8rem;">Quitar</button>
                            </div>
                        `).join('') || '<p style="font-size:0.8rem; color:var(--text-muted);">Sin miembros asignados.</p>'}
                    </div>
                </div>
                <div class="glass-panel">
                    <h5 style="font-size:0.7rem; color:var(--text-secondary); margin-bottom:1rem;">CREADORES DISPONIBLES (${freeCreators.length})</h5>
                    <div style="margin-bottom:0.8rem;">
                        <input type="text" id="grp-filter" class="input-control" placeholder="Filtrar creadores..." style="padding:0.5rem 0.8rem; font-size:0.8rem;">
                    </div>
                    <div id="grp-available-list" style="display:flex; flex-direction:column; gap:0.5rem; max-height:400px; overflow-y:auto;">
                        ${renderAvailableCreators(freeCreators)}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Filtro
    const filterInput = container.querySelector('#grp-filter');
    const listEl = container.querySelector('#grp-available-list');
    filterInput.addEventListener('input', () => {
        const q = filterInput.value.toLowerCase().trim();
        const filtered = freeCreators.filter(c => c.username.toLowerCase().includes(q));
        listEl.innerHTML = renderAvailableCreators(filtered);
        bindAddBtns(listEl, managerId, container);
    });

    container.querySelector('#close-grp').onclick = () => renderAdminDashboard(container.parentElement.parentElement);

    // Quitar: por username
    container.querySelectorAll('.rem-c').forEach(b => b.onclick = async () => {
        await profiles.unassignManagerByUsername(b.dataset.username);
        appState.showToast('Creador desvinculado', 'info');
        renderGroupEditor(container, managerId);
    });
    
    // Añadir: por username
    bindAddBtns(container, managerId, container);
}

function renderAvailableCreators(list) {
    if (!list.length) return '<p style="font-size:0.8rem; color:var(--text-muted);">No hay creadores disponibles.</p>';
    return list.map(c => `
        <div class="glass-panel" style="padding:0.6rem; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-size:0.85rem; font-weight:600;">@${c.username}</div>
                <div style="font-size:0.65rem; color:var(--text-secondary);">${fmt(c.diamonds)} 💎 · ${c.validDays}d</div>
            </div>
            <button class="add-c" data-username="${c.username}" style="background:none; border:none; color:var(--primary); cursor:pointer; font-weight:700; font-size:0.8rem;">Añadir</button>
        </div>
    `).join('');
}

function bindAddBtns(el, managerId, rootContainer) {
    el.querySelectorAll('.add-c').forEach(b => b.onclick = async () => {
        await profiles.assignManagerByUsername(b.dataset.username, managerId);
        appState.showToast('Creador asignado', 'success');
        renderGroupEditor(rootContainer, managerId);
    });
}

// ── VISTA: CREADORES ────────────────────────────────────────────────────────
export async function renderCreatorsList(container) {
    const currentMetrics = store.getMetricsData();
    if (!currentMetrics || !currentMetrics.length) {
        container.innerHTML = '<div style="padding:2rem; text-align:center;">Cargando listado...</div>';
        if (isSupabaseConfigured) await store.refreshMetrics().catch(console.warn);
    }
    const data = store.getMetricsData() || [];

    const renderItems = (list) => {
        if (!list.length) return '<p style="padding:2rem; text-align:center;">No hay creadores cargados en este período.</p>';
        return list.map(c => `
            <div class="glass-panel" style="padding:1rem; display:flex; align-items:center; gap:1rem; margin-bottom:0.8rem;">
                <div style="width:40px; height:40px; border-radius:50%; background:var(--primary); display:flex; align-items:center; justify-content:center; color:white; font-weight:800;">${c.username.charAt(0).toUpperCase()}</div>
                <div style="flex:1;">
                    <div style="font-weight:700;">@${c.username}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">${c.validDays} días válidos</div>
                </div>
                <div style="font-weight:800; color:var(--accent);">${fmt(c.diamonds)} 💎</div>
            </div>
        `).join('');
    };

    container.innerHTML = `
        <div class="animate-fadeIn">
            <h2 style="margin-bottom:1.5rem;">Creadores</h2>
            <p style="color:var(--text-secondary); margin-bottom:1.5rem; font-size:0.9rem;">Todos los creadores cargados en el último reporte de métricas.</p>
            <div class="glass-panel" style="padding:0.8rem; margin-bottom:1.5rem; display:flex; align-items:center; gap:0.8rem;">
                <span>🔍</span>
                <input type="text" id="cr-search" placeholder="Buscar creador..." class="input-control" style="background:none; border:none; padding:0;">
            </div>
            <div id="cr-results">${renderItems(data)}</div>
        </div>
    `;

    const input = container.querySelector('#cr-search');
    const results = container.querySelector('#cr-results');
    input.oninput = () => {
        const q = input.value.toLowerCase().trim();
        results.innerHTML = renderItems(data.filter(c => c.username.toLowerCase().includes(q)));
    };
}

