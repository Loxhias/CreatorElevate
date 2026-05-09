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
    const sec = +(s.match(/(\d+)s/)   || [0,0])[1];
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

// ── RENDER PRINCIPAL ───────────────────────────────────────────────────────
export async function renderAdminDashboard(container) {
    container.innerHTML = `<div style="padding:4rem; text-align:center;"><div class="loading-dots">Iniciando Panel Maestro</div></div>`;
    
    if (isSupabaseConfigured) {
        await Promise.all([store.refreshAdminLists(), store.refreshMetrics()]).catch(console.warn);
    }

    const data = store.getMetricsData() || [];
    const profs = store.getProfiles() || [];
    const managers = profs.filter(p => p.is_manager);
    const creators = profs.filter(p => p.is_creator);
    const period = store.getPeriod();

    container.innerHTML = `
        <div class="admin-container" style="animation: fadeIn 0.4s ease;">
            <div style="margin-bottom:2.5rem; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h1 style="font-size:2.4rem; font-weight:900; letter-spacing:-0.03em; margin:0;">Centro de Control</h1>
                    <p style="color:var(--text-secondary); margin:0.3rem 0 0 0;">Gestión estratégica de la red de managers y creadores.</p>
                </div>
                ${period ? `<div class="badge-premium">${period.label}</div>` : ''}
            </div>

            <div class="admin-nav-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1.5rem; margin-bottom:3rem;">
                <div class="glass-panel nav-card" id="btn-nav-audit">
                    <div class="nav-card-icon">📈</div>
                    <div class="nav-card-body">
                        <h3>Auditar Managers</h3>
                        <p>Supervisión de grupos y métricas de rendimiento.</p>
                    </div>
                </div>
                <div class="glass-panel nav-card" id="btn-nav-manage">
                    <div class="nav-card-icon">👥</div>
                    <div class="nav-card-body">
                        <h3>Gestión de Nómina</h3>
                        <p>Altas de managers y configuración de roles.</p>
                    </div>
                </div>
                <div class="glass-panel nav-card" id="btn-nav-upload">
                    <div class="nav-card-icon">📥</div>
                    <div class="nav-card-body">
                        <h3>Cargar Reporte</h3>
                        <p>Importar datos mensuales de TikTok.</p>
                    </div>
                </div>
            </div>

            <div id="admin-main-view">
                <div class="metrics-grid">
                    <div class="glass-panel metric-card" style="background:var(--primary-gradient); color:white;">
                        <span style="opacity:0.8; font-size:0.8rem; text-transform:uppercase; font-weight:700;">Diamantes Globales</span>
                        <span style="font-size:2.8rem; font-weight:900; display:block; margin-top:0.5rem;">${fmt(data.reduce((s,c)=>s+Number(c.diamonds),0))}</span>
                    </div>
                    <div class="glass-panel metric-card">
                        <span class="metric-title">Managers Activos</span>
                        <span class="metric-value">${managers.length}</span>
                    </div>
                    <div class="glass-panel metric-card">
                        <span class="metric-title">Creadores Registrados</span>
                        <span class="metric-value">${creators.length}</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const mainView = container.querySelector('#admin-main-view');

    container.querySelector('#btn-nav-audit').onclick = () => renderAuditView(mainView, managers, creators, data);
    container.querySelector('#btn-nav-manage').onclick = () => renderManageView(mainView);
    container.querySelector('#btn-nav-upload').onclick = () => renderUploadView(mainView, container);
}

// ── VISTA: AUDITORÍA ────────────────────────────────────────────────────────
function renderAuditView(container, managers, creators, metricsData) {
    container.innerHTML = `
        <div style="animation: slideInUp 0.3s ease;">
            <h2 style="margin-bottom:1.5rem; font-weight:800;">📈 Auditoría de Operaciones</h2>
            <div class="metrics-grid">
                ${managers.map(m => {
                    const myCreators = creators.filter(c => c.manager_id === m.id);
                    const usernames = myCreators.map(c => (c.tiktok_username || '').toLowerCase());
                    const groupMetrics = metricsData.filter(d => usernames.includes((d.username || '').toLowerCase()));
                    const groupDiamonds = groupMetrics.reduce((s, d) => s + Number(d.diamonds || 0), 0);

                    return `
                    <div class="glass-panel" style="padding:1.5rem; display:flex; flex-direction:column; gap:1rem;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <div style="font-weight:800; font-size:1.1rem;">${m.display_name || m.email}</div>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${m.email}</div>
                            </div>
                            <span class="badge" style="background:rgba(99,102,241,0.1); color:var(--primary-light);">${myCreators.length} creadores</span>
                        </div>
                        <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                            <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">Rendimiento del Mes</div>
                            <div style="font-size:1.6rem; font-weight:900; color:var(--accent);">${fmt(groupDiamonds)} 💎</div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                            <button class="btn btn-sm btn-view-m-dash" data-id="${m.id}" style="font-size:0.7rem; background:rgba(255,255,255,0.05);">👁️ Dashboard</button>
                            <button class="btn btn-sm btn-manage-m-group" data-id="${m.id}" style="font-size:0.7rem; background:rgba(255,255,255,0.05);">👥 Creadores</button>
                        </div>
                    </div>`;
                }).join('') || '<div class="glass-panel" style="grid-column:1/-1; padding:3rem; text-align:center;">No hay managers asignados.</div>'}
            </div>
        </div>
    `;

    container.querySelectorAll('.btn-view-m-dash').forEach(btn => {
        btn.onclick = () => {
            container.innerHTML = '<div style="padding:4rem; text-align:center;">Cargando Dashboard del Manager...</div>';
            import('./managerDashboard.js').then(mod => mod.renderManagerDashboard(container, btn.dataset.id));
        };
    });
    container.querySelectorAll('.btn-manage-m-group').forEach(btn => {
        btn.onclick = () => renderGroupEditor(container, btn.dataset.id);
    });
}

// ── VISTA: GESTIÓN DE ROLES ────────────────────────────────────────────────
function renderManageView(container) {
    container.innerHTML = `
        <div class="glass-panel" style="padding:2rem; animation: slideInUp 0.3s ease;">
            <h2 style="margin-bottom:1rem; font-weight:800;">👥 Gestión de Nómina</h2>
            <p style="color:var(--text-secondary); margin-bottom:2rem;">Busca cualquier usuario registrado para promoverlo a Manager.</p>
            
            <div style="display:flex; gap:1rem; margin-bottom:2rem;">
                <input type="text" id="role-search-input" class="input-control" placeholder="Nombre o email..." style="flex:1;">
                <button id="role-search-btn" class="btn btn-primary" style="padding:0 2rem;">Buscar</button>
            </div>

            <div id="role-results-list" style="display:flex; flex-direction:column; gap:1rem;"></div>
        </div>
    `;

    const input = container.querySelector('#role-search-input');
    const results = container.querySelector('#role-results-list');
    const btn = container.querySelector('#role-search-btn');

    // IMPORTANTE: Prevenir que otros eventos bloqueen el input
    input.addEventListener('click', (e) => e.stopPropagation());

    const search = async () => {
        const q = input.value.trim();
        if (q.length < 2) return;
        results.innerHTML = '<div style="padding:2rem; text-align:center;">Buscando...</div>';
        try {
            const found = await profiles.searchProfiles(q);
            results.innerHTML = found.map(p => `
                <div class="glass-panel" style="padding:1.2rem; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:700;">${p.display_name || p.email}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${p.email}</div>
                    </div>
                    <button class="btn btn-sm btn-toggle-role" data-id="${p.id}" data-active="${p.is_manager}" 
                            style="background:${p.is_manager ? '#ef4444' : 'var(--primary)'}; color:white; border:none; padding:0.5rem 1rem;">
                        ${p.is_manager ? 'Baja Manager' : 'Hacer Manager'}
                    </button>
                </div>
            `).join('') || '<p style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron usuarios.</p>';
        } catch (e) { results.innerHTML = 'Error en la búsqueda.'; }
    };

    btn.onclick = search;
    input.onkeypress = (e) => e.key === 'Enter' && search();

    results.onclick = async (e) => {
        const tBtn = e.target.closest('.btn-toggle-role');
        if (!tBtn) return;
        const uid = tBtn.dataset.id;
        const isActive = tBtn.dataset.active === 'true';

        if (isActive) {
            const pass = prompt('Por seguridad, ingresa tu clave de Admin para confirmar:');
            if (!pass) return;
        }

        try {
            const p = (await profiles.searchProfiles(uid))[0];
            await profiles.updateRoles(uid, { isAdmin: p.is_admin, isManager: !isActive, isCreator: p.is_creator });
            appState.showToast('Rol actualizado correctamente', 'success');
            search();
        } catch (err) { appState.showToast('Error: ' + err.message, 'error'); }
    };
}

// ── VISTA: EDITOR DE GRUPO ────────────────────────────────────────────────
async function renderGroupEditor(container, managerId) {
    container.innerHTML = '<div style="padding:4rem; text-align:center;">Cargando creadores disponibles...</div>';
    
    // Obtener todos los perfiles y todas las métricas para encontrar creadores sin perfil
    const [allProfs, allMetrics] = await Promise.all([
        profiles.searchProfiles(''), 
        store.getMetricsData() || []
    ]);

    const manager = allProfs.find(p => p.id === managerId) || { display_name: 'Manager' };
    const myGroup = allProfs.filter(p => p.manager_id === managerId);
    
    // Creadores registrados sin manager
    const freeProfs = allProfs.filter(p => p.is_creator && !p.manager_id && p.id !== managerId);

    container.innerHTML = `
        <div style="animation: fadeIn 0.3s ease;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                <div>
                    <h3 style="margin:0;">Gestionar Equipo</h3>
                    <p style="color:var(--text-secondary); font-size:0.85rem; margin:0;">Manager: ${manager.display_name || manager.email}</p>
                </div>
                <button id="btn-close-group-editor" class="btn btn-sm" style="background:rgba(255,255,255,0.05);">Cerrar</button>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:2rem;">
                <div class="glass-panel" style="padding:1.5rem;">
                    <h5 style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:1rem; letter-spacing:0.05em;">MIEMBROS ACTUALES (${myGroup.length})</h5>
                    <div style="display:flex; flex-direction:column; gap:0.6rem;">
                        ${myGroup.map(c => `
                            <div style="padding:0.8rem; background:rgba(255,255,255,0.02); border-radius:10px; display:flex; justify-content:space-between; align-items:center; border:1px solid rgba(255,255,255,0.05);">
                                <span style="font-size:0.9rem; font-weight:600;">@${c.tiktok_username || c.email}</span>
                                <button class="btn-group-rem" data-cid="${c.id}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:700;">Quitar</button>
                            </div>
                        `).join('') || '<p style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding:1rem;">Este manager no tiene creadores.</p>'}
                    </div>
                </div>

                <div class="glass-panel" style="padding:1.5rem;">
                    <h5 style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:1rem; letter-spacing:0.05em;">DISPONIBLES PARA ASIGNAR</h5>
                    <div style="display:flex; flex-direction:column; gap:0.6rem; max-height:400px; overflow-y:auto;">
                        ${freeProfs.map(c => `
                            <div style="padding:0.8rem; background:rgba(255,255,255,0.02); border-radius:10px; display:flex; justify-content:space-between; align-items:center; border:1px solid rgba(255,255,255,0.05);">
                                <span style="font-size:0.9rem;">@${c.tiktok_username || c.email}</span>
                                <button class="btn-group-add" data-cid="${c.id}" style="background:none; border:none; color:var(--primary); cursor:pointer; font-weight:700;">Añadir</button>
                            </div>
                        `).join('') || '<p style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding:1rem;">No hay creadores registrados disponibles.</p>'}
                    </div>
                </div>
            </div>
            
            <p style="margin-top:2rem; font-size:0.75rem; color:var(--text-muted); text-align:center; background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px;">
                💡 <b>Nota:</b> Solo puedes asignar creadores que ya hayan creado su cuenta en la App. <br>
                Si ves a alguien en el Excel pero no aquí, es porque aún no se ha registrado.
            </p>
        </div>
    `;

    container.querySelector('#btn-close-group-editor').onclick = () => renderAdminDashboard(container.parentElement.parentElement);

    container.onclick = async (e) => {
        const add = e.target.closest('.btn-group-add');
        const rem = e.target.closest('.btn-group-rem');
        if (add) {
            await profiles.assignManager(add.dataset.cid, managerId);
            appState.showToast('Creador asignado', 'success');
            renderGroupEditor(container, managerId);
        }
        if (rem) {
            await profiles.assignManager(rem.dataset.cid, null);
            appState.showToast('Creador liberado', 'info');
            renderGroupEditor(container, managerId);
        }
    };
}

// ── VISTA: CARGA DE MÉTRICAS ───────────────────────────────────────────────
function renderUploadView(container, mainContainer) {
    container.innerHTML = `
        <div class="glass-panel" style="padding:2.5rem; animation: slideInUp 0.3s ease; max-width:600px; margin:0 auto;">
            <h2 style="margin-bottom:1rem; font-weight:800;">📥 Cargar Reporte TikTok</h2>
            <p style="color:var(--text-secondary); margin-bottom:2rem;">Sube el archivo Excel para actualizar las métricas de toda la agencia.</p>
            
            <div class="input-group">
                <label style="font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:0.5rem; display:block;">MES DEL REPORTE</label>
                <input type="month" id="up-month" class="input-control" value="${new Date().toISOString().slice(0,7)}">
            </div>
            <div class="input-group" style="margin-top:1.5rem;">
                <label style="font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:0.5rem; display:block;">ARCHIVO EXCEL</label>
                <input type="file" id="up-file" class="input-control" accept=".xlsx,.xls,.csv" style="padding:2rem; border:2px dashed rgba(255,255,255,0.1); background:rgba(255,255,255,0.01); text-align:center;">
            </div>
            <div id="up-preview-box" style="margin:1.5rem 0; min-height:60px;"></div>
            <button id="up-btn-publish" class="btn btn-primary" disabled style="width:100%; padding:1.2rem; font-weight:800;">🚀 PUBLICAR DATOS</button>
        </div>
    `;

    const fileIn = container.querySelector('#up-file');
    const btn = container.querySelector('#up-btn-publish');
    const preview = container.querySelector('#up-preview-box');
    let rows = null;

    fileIn.onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        preview.innerHTML = '<div class="loading-dots">Analizando archivo</div>';
        try {
            const buf = await f.arrayBuffer();
            const wb = window.XLSX.read(buf, { type: 'array' });
            const data = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
            rows = data.map(normalizeRow).filter(Boolean);
            preview.innerHTML = `
                <div style="background:rgba(16,185,129,0.1); color:#10b981; padding:1rem; border-radius:10px; border:1px solid rgba(16,185,129,0.2); font-weight:600;">
                    ✓ Se detectaron ${rows.length} creadores válidos.
                </div>
            `;
            btn.disabled = false;
        } catch (e) { preview.innerHTML = '<div style="color:#ef4444;">Error leyendo el archivo Excel.</div>'; }
    };

    btn.onclick = async () => {
        const m = container.querySelector('#up-month').value;
        const [y, mm] = m.split('-');
        const dt = new Date(Date.UTC(y, mm - 1, 1));
        const lbl = dt.toLocaleString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^./, c => c.toUpperCase());
        btn.disabled = true;
        btn.textContent = 'Publicando...';
        try {
            await metrics.upsertPeriod(`${m}-01`, lbl, rows);
            appState.showToast('Métricas publicadas con éxito', 'success');
            renderAdminDashboard(mainContainer);
        } catch (err) { 
            appState.showToast('Error: ' + err.message, 'error'); 
            btn.disabled = false;
            btn.textContent = '🚀 PUBLICAR DATOS';
        }
    };
}

// ── VISTA: LISTA DE CREADORES ───────────────────────────────────────────────
export async function renderCreatorsList(container) {
    container.innerHTML = `<div style="padding:4rem; text-align:center;"><div class="loading-dots">Cargando Directorio</div></div>`;
    
    if (isSupabaseConfigured) await store.refreshMetrics().catch(console.warn);
    const data = store.getMetricsData() || [];

    const renderItems = (filtered) => {
        if (!filtered.length) return `<p style="padding:3rem; text-align:center; color:var(--text-muted);">No se encontraron creadores en este período.</p>`;
        return filtered.map(c => `
            <div class="glass-panel" style="padding:1.2rem; display:flex; align-items:center; gap:1.5rem; margin-bottom:1rem; animation: fadeIn 0.3s ease;">
                <div style="width:50px; height:50px; border-radius:50%; background:var(--primary-gradient); display:flex; align-items:center; justify-content:center; color:white; font-weight:900; font-size:1.2rem; flex-shrink:0;">
                    ${c.username.charAt(0).toUpperCase()}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:800; font-size:1.1rem;">@${c.username}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Participación: ${c.validDays} días válidos</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:900; color:var(--accent); font-size:1.2rem;">${fmt(c.diamonds)} 💎</div>
                    <button class="btn btn-sm btn-drilldown-creator" data-username="${c.username}" style="margin-top:0.6rem; font-size:0.7rem;">👁️ Ver Dashboard</button>
                </div>
            </div>
        `).join('');
    };

    container.innerHTML = `
        <div style="animation: fadeIn 0.4s ease;">
            <div style="margin-bottom:2rem;">
                <h1 style="font-size:2.2rem; font-weight:900; margin:0;">Directorio de Creadores</h1>
                <p style="color:var(--text-secondary); margin-top:0.3rem;">Explora el rendimiento individual de toda la agencia.</p>
            </div>

            <div class="glass-panel" style="padding:1rem; margin-bottom:2rem; display:flex; align-items:center; gap:1rem;">
                <span style="font-size:1.4rem; opacity:0.5;">🔍</span>
                <input type="text" id="dir-search-input" placeholder="Buscar por username..." style="background:transparent; border:none; color:white; width:100%; outline:none; font-size:1.1rem;">
            </div>

            <div id="dir-results-container">
                ${renderItems(data)}
            </div>
        </div>
    `;

    const input = container.querySelector('#dir-search-input');
    const results = container.querySelector('#dir-results-container');

    // IMPORTANTE: Prevenir bloqueo de escritura
    input.addEventListener('click', (e) => e.stopPropagation());

    input.oninput = (e) => {
        const val = e.target.value.toLowerCase().trim();
        const filtered = data.filter(c => c.username.toLowerCase().includes(val));
        results.innerHTML = renderItems(filtered);
    };

    container.onclick = (e) => {
        const btn = e.target.closest('.btn-drilldown-creator');
        if (btn) {
            const username = btn.dataset.username;
            container.innerHTML = '<div style="padding:4rem; text-align:center;">Cargando Dashboard del Creador...</div>';
            import('./creatorDashboard.js').then(m => m.renderCreatorDashboard(container, username));
        }
    };
}
