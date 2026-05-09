import { store } from '../store.js';
import { appState } from '../main.js';
import { metrics, profiles, push } from '../api.js';
import { isSupabaseConfigured } from '../supabase.js';

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

function normalizeRow(row) {
    const find = (keywords) => {
        const entries = Object.entries(row);
        for (const kw of keywords) {
            const found = entries.find(([k]) => k.toLowerCase().trim() === kw.toLowerCase());
            if (found) return found[1];
        }
        const entry = entries.find(([k]) => {
            const key = k.toLowerCase().trim();
            return keywords.some(kw => key.includes(kw.toLowerCase()));
        });
        return entry ? entry[1] : undefined;
    };

    const username = String(
        find(['Nombre de usuario del creador', 'creator username', "creator's username", 'tiktok username', 'username']) || ''
    ).trim().replace(/^@/, '').toLowerCase();

    if (!username) return null;

    return {
        username,
        diamonds: Number(find(['Diamonds', 'Diamantes']) || 0),
        liveDuration: String(find(['LIVE Duration', 'Duración de LIVE']) || '0s'),
        liveSeconds: parseLiveSeconds(find(['LIVE Duration', 'Duración de LIVE']) || 0),
        validDays: Number(find(['Días válidos', 'Valid Days']) || 0),
        emisionesLive: Number(find(['Emisiones LIVE', 'Total LIVE Emissions']) || 0),
    };
}

// ── RENDER PRINCIPAL ───────────────────────────────────────────────────────
export async function renderAdminDashboard(container) {
    container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted);">Cargando panel maestro…</div>`;

    if (isSupabaseConfigured) {
        await Promise.all([store.refreshAdminLists(), store.refreshMetrics()]).catch(e => console.warn(e));
    }

    const data     = store.getMetricsData() || [];
    const profs    = store.getProfiles() || [];
    const managers = profs.filter(p => p.is_manager);
    const creators = profs.filter(p => p.is_creator);
    const period   = store.getPeriod();

    const totalDiamonds = data.reduce((s, c) => s + Number(c.diamonds || 0), 0);
    const totalLives    = data.reduce((s, c) => s + Number(c.emisionesLive || 0), 0);

    container.innerHTML = `
        <div style="margin-bottom:2.5rem; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h1 style="font-size:2.2rem; font-weight:800; letter-spacing:-0.02em;">Centro de Control</h1>
                <p style="color:var(--text-secondary);">Agencia Interactik · Gestión de Red de Managers</p>
            </div>
            ${period ? `<div class="badge" style="background:var(--primary-gradient); color:white; padding:0.6rem 1.2rem;">${period.label}</div>` : ''}
        </div>

        <!-- Navegación por Tarjetas -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1.2rem; margin-bottom:2.5rem;">
            <div class="glass-panel action-card" id="nav-audit" style="padding:1.5rem; cursor:pointer;">
                <div style="font-size:1.8rem; margin-bottom:0.8rem;">📈</div>
                <h4 style="margin-bottom:0.3rem;">Auditar Managers</h4>
                <p style="font-size:0.75rem; color:var(--text-muted);">Ver grupos, dashboards y rendimiento.</p>
            </div>
            <div class="glass-panel action-card" id="nav-manage" style="padding:1.5rem; cursor:pointer;">
                <div style="font-size:1.8rem; margin-bottom:0.8rem;">👥</div>
                <h4 style="margin-bottom:0.3rem;">Gestionar Nómina</h4>
                <p style="font-size:0.75rem; color:var(--text-muted);">Altas, bajas y cambios de rol.</p>
            </div>
            <div class="glass-panel action-card" id="nav-upload" style="padding:1.5rem; cursor:pointer;">
                <div style="font-size:1.8rem; margin-bottom:0.8rem;">📥</div>
                <h4 style="margin-bottom:0.3rem;">Cargar Excel</h4>
                <p style="font-size:0.75rem; color:var(--text-muted);">Actualizar métricas mensuales.</p>
            </div>
        </div>

        <!-- Espacio para Vistas Dinámicas -->
        <div id="admin-view-content">
            <div class="metrics-grid">
                <div class="glass-panel metric-card">
                    <span class="metric-title">Diamantes Globales</span>
                    <span class="metric-value text-gradient" style="font-size:2.5rem;">${fmt(totalDiamonds)}</span>
                </div>
                <div class="glass-panel metric-card">
                    <span class="metric-title">Managers Activos</span>
                    <span class="metric-value">${managers.length}</span>
                </div>
                <div class="glass-panel metric-card">
                    <span class="metric-title">Sesiones LIVE</span>
                    <span class="metric-value">${fmt(totalLives)}</span>
                </div>
            </div>
        </div>
    `;

    const viewContent = container.querySelector('#admin-view-content');

    // Eventos de Navegación
    container.querySelector('#nav-audit').onclick  = () => renderAuditView(viewContent, managers, creators, data);
    container.querySelector('#nav-manage').onclick = () => renderManageView(viewContent);
    container.querySelector('#nav-upload').onclick = () => renderUploadView(viewContent, container);
}

// ── VISTA: AUDITORÍA ────────────────────────────────────────────────────────
function renderAuditView(container, managers, creators, metricsData) {
    container.innerHTML = `
        <div style="animation:fadeIn 0.3s ease;">
            <h3 style="margin-bottom:1.5rem;">📈 Auditoría de Managers</h3>
            <div class="metrics-grid">
                ${managers.map(m => {
                    const myCreators = creators.filter(c => c.manager_id === m.id);
                    const usernames  = myCreators.map(c => (c.tiktok_username || '').toLowerCase());
                    const groupMetrics = metricsData.filter(d => usernames.includes((d.username || '').toLowerCase()));
                    const groupDiamonds = groupMetrics.reduce((s, d) => s + Number(d.diamonds || 0), 0);

                    return `
                    <div class="glass-panel" style="padding:1.5rem; border-top:3px solid var(--primary);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                            <div>
                                <div style="font-weight:700;">${m.display_name || m.email}</div>
                                <div style="font-size:0.7rem; color:var(--text-muted);">${m.email}</div>
                            </div>
                            <span class="badge" style="background:rgba(99,102,241,0.1); color:var(--primary-light);">${myCreators.length} creadores</span>
                        </div>
                        <div style="background:rgba(255,255,255,0.02); padding:0.8rem; border-radius:8px; margin-bottom:1rem;">
                            <div style="font-size:0.6rem; color:var(--text-muted); text-transform:uppercase;">Diamantes Grupo</div>
                            <div style="font-size:1.3rem; font-weight:800; color:var(--accent);">${fmt(groupDiamonds)} 💎</div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                            <button class="btn btn-sm btn-audit-dash" data-id="${m.id}" style="font-size:0.7rem;">👁️ Dashboard</button>
                            <button class="btn btn-sm btn-audit-group" data-id="${m.id}" style="font-size:0.7rem;">👥 Creadores</button>
                        </div>
                    </div>`;
                }).join('') || '<p>No hay managers para auditar.</p>'}
            </div>
        </div>
    `;

    container.querySelectorAll('.btn-audit-dash').forEach(btn => {
        btn.onclick = () => import('./managerDashboard.js').then(mod => mod.renderManagerDashboard(container, btn.dataset.id));
    });
    container.querySelectorAll('.btn-audit-group').forEach(btn => {
        btn.onclick = () => renderGroupEditor(container, btn.dataset.id, creators);
    });
}

// ── VISTA: GESTIÓN DE ROLES ────────────────────────────────────────────────
function renderManageView(container) {
    container.innerHTML = `
        <div class="glass-panel" style="padding:1.5rem; animation:fadeIn 0.3s ease;">
            <h3 style="margin-bottom:1rem;">👥 Gestión de Nómina</h3>
            <p style="color:var(--text-secondary); font-size:0.8rem; margin-bottom:1.5rem;">Busca un usuario por email o nombre para cambiar su rango.</p>
            <div style="display:flex; gap:0.5rem; margin-bottom:1.5rem;">
                <input type="text" id="m-search-input" class="input-control" placeholder="Buscar usuario...">
                <button id="m-search-btn" class="btn btn-primary">🔍</button>
            </div>
            <div id="m-results" style="display:flex; flex-direction:column; gap:0.8rem;"></div>
        </div>
    `;

    const input = container.querySelector('#m-search-input');
    const results = container.querySelector('#m-results');

    const doSearch = async () => {
        const q = input.value.trim();
        if (q.length < 2) return;
        results.innerHTML = 'Buscando…';
        try {
            const found = await profiles.searchProfiles(q);
            results.innerHTML = found.map(p => `
                <div class="glass-panel" style="padding:1rem; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:700;">${p.display_name || p.email}</div>
                        <div style="font-size:0.7rem; color:var(--text-muted);">${p.email}</div>
                    </div>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn btn-sm t-manager" data-id="${p.id}" data-active="${p.is_manager}" 
                                style="background:${p.is_manager ? '#ef4444' : '#10b981'}; color:white; border:none;">
                            ${p.is_manager ? 'Baja Manager' : 'Alta Manager'}
                        </button>
                    </div>
                </div>
            `).join('') || 'No se encontraron resultados.';
        } catch (e) { results.innerHTML = 'Error en búsqueda.'; }
    };

    container.querySelector('#m-search-btn').onclick = doSearch;
    input.onkeypress = (e) => e.key === 'Enter' && doSearch();

    results.onclick = async (e) => {
        const btn = e.target.closest('.t-manager');
        if (!btn) return;
        const uid = btn.dataset.id;
        const isActive = btn.dataset.active === 'true';

        if (isActive) {
            const pass = prompt('CONFIRMACIÓN DE SEGURIDAD: Ingresa tu clave de Administrador para dar de baja a este Manager:');
            if (!pass) return;
        }

        try {
            const p = (await profiles.searchProfiles(uid))[0];
            await profiles.updateRoles(uid, { isAdmin: p.is_admin, isManager: !isActive, isCreator: p.is_creator });
            appState.showToast('Rol actualizado', 'success');
            doSearch();
        } catch (err) { appState.showToast('Error: ' + err.message, 'error'); }
    };
}

// ── VISTA: CARGA DE MÉTRICAS ───────────────────────────────────────────────
function renderUploadView(container, mainContainer) {
    container.innerHTML = `
        <div class="glass-panel" style="padding:2rem; animation:fadeIn 0.3s ease;">
            <h3 style="margin-bottom:1.5rem;">📥 Cargar Reporte TikTok</h3>
            <div class="input-group">
                <label>Mes</label>
                <input type="month" id="u-month" class="input-control" value="${new Date().toISOString().slice(0,7)}">
            </div>
            <div class="input-group" style="margin-top:1rem;">
                <label>Excel (.xlsx)</label>
                <input type="file" id="u-file" class="input-control" accept=".xlsx,.xls,.csv" style="padding:1.5rem; border:2px dashed rgba(255,255,255,0.1);">
            </div>
            <div id="u-preview" style="margin:1rem 0; font-size:0.85rem;"></div>
            <button id="u-btn" class="btn btn-primary" disabled style="width:100%; padding:1rem;">PUBLICAR MÉTRICAS</button>
        </div>
    `;

    const fileIn = container.querySelector('#u-file');
    const uBtn = container.querySelector('#u-btn');
    const preview = container.querySelector('#u-preview');
    let rows = null;

    fileIn.onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
            const buf = await f.arrayBuffer();
            const wb = window.XLSX.read(buf, { type: 'array' });
            const data = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
            rows = data.map(normalizeRow).filter(Boolean);
            preview.innerHTML = `✓ Detectados <strong>${rows.length}</strong> creadores.`;
            uBtn.disabled = false;
        } catch (e) { preview.innerHTML = 'Error leyendo archivo.'; }
    };

    uBtn.onclick = async () => {
        const m = container.querySelector('#u-month').value;
        const [y, mm] = m.split('-');
        const dt = new Date(Date.UTC(y, mm - 1, 1));
        const lbl = dt.toLocaleString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^./, c => c.toUpperCase());
        uBtn.disabled = true;
        uBtn.textContent = 'Publicando…';
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
function renderGroupEditor(container, managerId, allCreators) {
    const manager = allCreators.find(c => c.id === managerId) || { display_name: 'Manager' };
    const myGroup = allCreators.filter(c => c.manager_id === managerId);
    const free = allCreators.filter(c => !c.manager_id);

    container.innerHTML = `
        <div style="animation:fadeIn 0.2s ease;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h4>Gestión de Grupo: ${manager.display_name || manager.email}</h4>
                <button id="close-ge" class="btn btn-sm">Cerrar</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">
                <div class="glass-panel" style="padding:1rem;">
                    <h5 style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.8rem;">MIEMBROS</h5>
                    <div style="display:flex; flex-direction:column; gap:0.4rem;">
                        ${myGroup.map(c => `
                            <div class="glass-panel" style="padding:0.5rem; font-size:0.8rem; display:flex; justify-content:space-between; align-items:center;">
                                <span>@${c.tiktok_username || c.email}</span>
                                <button class="rem-g" data-cid="${c.id}" style="background:none; border:none; color:#ef4444; cursor:pointer;">Quitar</button>
                            </div>
                        `).join('') || '<p style="font-size:0.7rem; color:var(--text-muted);">Sin miembros.</p>'}
                    </div>
                </div>
                <div class="glass-panel" style="padding:1rem;">
                    <h5 style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.8rem;">DISPONIBLES</h5>
                    <div style="display:flex; flex-direction:column; gap:0.4rem;">
                        ${free.map(c => `
                            <div class="glass-panel" style="padding:0.5rem; font-size:0.8rem; display:flex; justify-content:space-between; align-items:center;">
                                <span>@${c.tiktok_username || c.email}</span>
                                <button class="add-g" data-cid="${c.id}" style="background:none; border:none; color:var(--primary); cursor:pointer;">Añadir</button>
                            </div>
                        `).join('') || '<p style="font-size:0.7rem; color:var(--text-muted);">No hay libres.</p>'}
                    </div>
                </div>
            </div>
        </div>
    `;

    container.querySelector('#close-ge').onclick = () => store.refreshAdminLists().then(() => renderAdminDashboard(container.parentElement.parentElement));

    container.onclick = async (e) => {
        const add = e.target.closest('.add-g');
        const rem = e.target.closest('.rem-g');
        if (add) {
            await profiles.assignManager(add.dataset.cid, managerId);
            appState.showToast('Creador añadido', 'success');
            renderGroupEditor(container, managerId, await profiles.searchProfiles(''));
        }
        if (rem) {
            await profiles.assignManager(rem.dataset.cid, null);
            appState.showToast('Creador quitado', 'info');
            renderGroupEditor(container, managerId, await profiles.searchProfiles(''));
        }
    };
}

// ── VISTA: LISTA DE CREADORES (PÚBLICA PARA ADMIN) ──────────────────────────
export async function renderCreatorsList(container) {
    container.innerHTML = `<div style="padding:2rem;text-align:center;">Cargando lista de creadores…</div>`;
    
    if (isSupabaseConfigured) await store.refreshMetrics().catch(e => console.warn(e));
    const data = store.getMetricsData() || [];

    const renderItems = (filtered) => {
        if (!filtered.length) return `<p style="padding:2rem; text-align:center; color:var(--text-muted);">No se encontraron creadores.</p>`;
        return filtered.map(c => `
            <div class="glass-panel" style="padding:1.2rem; display:flex; align-items:center; gap:1.2rem; margin-bottom:0.8rem; transition:transform 0.2s ease;">
                <div style="width:45px; height:45px; border-radius:50%; background:var(--primary-gradient); display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:1.1rem; flex-shrink:0;">
                    ${c.username.charAt(0).toUpperCase()}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:1rem; color:var(--text-primary);">@${c.username}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">Actividad: ${c.validDays} días</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:800; color:var(--accent); font-size:1.1rem;">${fmt(c.diamonds)} 💎</div>
                    <button class="btn btn-sm view-c-dash" data-username="${c.username}" style="margin-top:0.5rem; font-size:0.65rem; background:rgba(255,255,255,0.05);">👁️ Dashboard</button>
                </div>
            </div>
        `).join('');
    };

    container.innerHTML = `
        <div style="animation:fadeIn 0.3s ease;">
            <div style="margin-bottom:2rem;">
                <h2 style="font-size:1.8rem; font-weight:800; margin-bottom:0.3rem;">Directorio de Creadores</h2>
                <p style="color:var(--text-secondary); font-size:0.9rem;">Explora el rendimiento individual de toda la red.</p>
            </div>

            <div class="glass-panel" style="padding:0.8rem; margin-bottom:1.5rem; display:flex; align-items:center; gap:0.8rem;">
                <span style="font-size:1.2rem;">🔍</span>
                <input type="text" id="c-search-input" placeholder="Buscar por username..." 
                       style="background:transparent; border:none; color:var(--text-primary); width:100%; outline:none; font-size:0.95rem;">
            </div>

            <div id="c-list-results">
                ${renderItems(data)}
            </div>
        </div>
    `;

    const input = container.querySelector('#c-search-input');
    const results = container.querySelector('#c-list-results');

    if (input) {
        input.oninput = (e) => {
            const val = e.target.value.toLowerCase().trim();
            const filtered = data.filter(c => c.username.toLowerCase().includes(val));
            results.innerHTML = renderItems(filtered);
        };
    }

    container.onclick = (e) => {
        const btn = e.target.closest('.view-c-dash');
        if (btn) {
            const username = btn.dataset.username;
            import('./creatorDashboard.js').then(m => m.renderCreatorDashboard(container, username));
        }
    };
}
