import { store } from '../store.js';
import { appState } from '../main.js';
import { metrics, profiles, push, content } from '../api.js';
import { isSupabaseConfigured } from '../supabase.js';
import { visualTiers } from '../config.js';

const fmt = (n) => Number(n || 0).toLocaleString('es');

// ── Estado de agencia seleccionada (persiste entre navegaciones) ──────────────
let selectedAgency = localStorage.getItem('ce_agency') || 'latam';
const AGENCY_OPTS = [
    { id: 'latam', label: '🌎 LATAM' },
    { id: 'usa',   label: '🇺🇸 USA'  },
];

function agencyToggleHtml() {
    return `<div style="display:flex;gap:0.3rem;background:rgba(0,0,0,0.25);border-radius:var(--radius-md);padding:0.2rem;">
        ${AGENCY_OPTS.map(a => `
            <button class="ag-btn ${selectedAgency === a.id ? 'ag-active' : ''}" data-ag="${a.id}"
                style="background:${selectedAgency === a.id ? 'var(--bg-elevated,#141720)' : 'transparent'};
                       border:none;color:${selectedAgency === a.id ? 'var(--text-primary)' : 'var(--text-muted)'};
                       font-size:0.82rem;font-weight:700;padding:0.38rem 0.9rem;border-radius:var(--radius-sm);
                       cursor:pointer;transition:all 0.2s;white-space:nowrap;
                       ${selectedAgency === a.id ? 'box-shadow:0 2px 6px rgba(0,0,0,0.3);' : ''}">
                ${a.label}
            </button>`).join('')}
    </div>`;
}

function wireAgencyToggle(container, onSwitch) {
    container.querySelectorAll('.ag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedAgency = btn.dataset.ag;
            localStorage.setItem('ce_agency', selectedAgency);
            onSwitch();
        });
    });
}

// ── Skeleton helpers ──────────────────────────────────────────────────────────
const skelAdmin = () => `
    <div style="padding:0;">
        <div class="skel" style="height:36px;width:260px;margin-bottom:2rem;"></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.5rem;margin-bottom:2rem;">
            <div class="skel-panel" style="height:88px;"></div>
            <div class="skel-panel" style="height:88px;"></div>
            <div class="skel-panel" style="height:88px;"></div>
            <div class="skel-panel" style="height:88px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.5rem;">
            <div class="skel-panel" style="height:72px;"></div>
            <div class="skel-panel" style="height:72px;"></div>
            <div class="skel-panel" style="height:72px;"></div>
        </div>
    </div>`;

const skelRows = (n = 4) => `
    <div style="display:flex;flex-direction:column;gap:0.8rem;">
        ${Array.from({length: n}, () => `
            <div class="skel-panel" style="height:72px;display:flex;align-items:center;gap:1rem;padding:1rem;">
                <div class="skel" style="width:40px;height:40px;border-radius:50%;flex-shrink:0;"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:0.5rem;">
                    <div class="skel" style="height:13px;width:140px;"></div>
                    <div class="skel" style="height:11px;width:90px;opacity:0.6;"></div>
                </div>
                <div class="skel" style="height:20px;width:80px;"></div>
            </div>`).join('')}
    </div>`;

const skelCreator = () => `
    <div>
        <div class="skel" style="height:22px;width:200px;border-radius:999px;margin-bottom:1rem;"></div>
        <div class="skel-panel" style="height:60px;margin-bottom:1rem;"></div>
        <div class="skel-panel" style="height:88px;margin-bottom:1.25rem;"></div>
        <div style="display:flex;gap:0.4rem;margin-bottom:1.25rem;">
            <div class="skel" style="height:36px;flex:1;border-radius:8px;"></div>
            <div class="skel" style="height:36px;flex:1;border-radius:8px;"></div>
            <div class="skel" style="height:36px;flex:1;border-radius:8px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <div class="skel-panel" style="height:110px;"></div>
            <div class="skel-panel" style="height:110px;"></div>
            <div class="skel-panel" style="height:110px;"></div>
            <div class="skel-panel" style="height:110px;"></div>
        </div>
    </div>`;

const skelHistory = () => `
    <div>
        <div class="skel" style="height:32px;width:240px;margin-bottom:1.5rem;"></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1.5rem;margin-bottom:1.5rem;">
            <div class="skel-panel" style="height:80px;"></div>
            <div class="skel-panel" style="height:80px;"></div>
            <div class="skel-panel" style="height:80px;"></div>
        </div>
        <div class="skel-panel" style="height:280px;margin-bottom:1.5rem;"></div>
        <div class="skel-panel" style="height:200px;"></div>
    </div>`;

// Columnas del archivo mensual simplificado (3 columnas)
const EXCEL_COLUMNS = {
    username:         'Usuario',
    daysSinceJoining: 'Días desde la incorporación',
    battles:          'Partidas',
};

function normalizeRow(row) {
    const nc = (s) => String(s)
        .normalize('NFC').toLowerCase()
        .replace(/s+/g, ' ').trim();

    const get = (colName) => {
        if (Object.prototype.hasOwnProperty.call(row, colName)) return row[colName];
        const target = nc(colName);
        for (const [k, v] of Object.entries(row)) {
            if (nc(k) === target) return v;
        }
        return null;
    };

    const rawUser = get(EXCEL_COLUMNS.username)
        || get('Nombre de usuario del creador')
        || get('username');
    const username = String(rawUser || '').trim().replace(/^@/, '');
    if (!username) return null;

    const safeInt = (val, max = 10000) => {
        if (val == null || val === '') return 0;
        const parsed = parseInt(String(val).replace(/[^d]/g, ''));
        if (isNaN(parsed) || parsed < 0) return 0;
        return parsed < max ? parsed : 0;
    };

    return {
        username,
        daysSinceJoining: safeInt(get(EXCEL_COLUMNS.daysSinceJoining)),
        battles:          safeInt(get(EXCEL_COLUMNS.battles)),
    };
}

// ── VISTA PRINCIPAL (ADMIN) ────────────────────────────────────────────────
export async function renderAdminDashboard(container) {
    // Si ya hay datos en el store, no los volvemos a pedir (evita lentitud)
    const currentProfs = store.getProfiles();
    const currentMetrics = store.getMetricsData();

    if (!currentProfs || !currentProfs.length || !currentMetrics || !currentMetrics.length) {
        container.innerHTML = skelAdmin();
        if (isSupabaseConfigured) {
            await Promise.all([store.refreshAdminLists(), store.refreshMetrics()]).catch(console.warn);
        }
    }

    const allData  = store.getMetricsData() || [];
    const allProfs = store.getProfiles()    || [];

    // Filtrar por agencia seleccionada
    const data     = allData.filter(d => (d.agency  || 'latam') === selectedAgency);
    const managers = allProfs.filter(p => p.is_manager && (p.agency || 'latam') === selectedAgency);
    const creators = allProfs.filter(p => p.is_creator && (p.agency || 'latam') === selectedAgency);
    const period = store.getPeriod();

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
                <h1 style="font-weight:800;margin:0;">Panel de Administración</h1>
                <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
                    ${period ? `<div class="badge" style="background:var(--primary); color:white;">${period.label}</div>` : ''}
                    ${agencyToggleHtml()}
                </div>
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
                    <h3 style="font-size:0.95rem;">Cargar Datos Mensuales</h3>
                    <p style="font-size:0.75rem; color:var(--text-secondary);">Subir incorporación y partidas.</p>
                </div>
                <div class="glass-panel action-card" id="nav-history">
                    <div style="font-size:1.5rem; margin-bottom:0.5rem;">📈</div>
                    <h3 style="font-size:0.95rem;">Historial de Métricas</h3>
                    <p style="font-size:0.75rem; color:var(--text-secondary);">Evolución por período y creador.</p>
                </div>
                <div class="glass-panel action-card" id="nav-content">
                    <div style="font-size:1.5rem; margin-bottom:0.5rem;">📝</div>
                    <h3 style="font-size:0.95rem;">Normas &amp; Canales</h3>
                    <p style="font-size:0.75rem; color:var(--text-secondary);">Editar contenido de páginas.</p>
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

    wireAgencyToggle(container, () => renderAdminDashboard(container));

    container.querySelector('#nav-audit').onclick   = () => renderAuditView(viewContent, managers, creators, data);
    container.querySelector('#nav-manage').onclick  = () => renderManageView(viewContent);
    container.querySelector('#nav-upload').onclick  = () => renderUploadView(viewContent, container, selectedAgency);
    container.querySelector('#nav-history').onclick = () => renderHistoryView(viewContent);
    container.querySelector('#nav-content').onclick = () => renderContentEditor(viewContent);
}

// ── VISTA: AUDITORÍA ────────────────────────────────────────────────────────
function renderAuditView(container, managers, creators, metricsData) {
    container.innerHTML = `
        <div class="animate-fadeIn">
            <h2 style="margin-bottom:1.5rem;">Auditoría de Managers</h2>
            <div class="metrics-grid">
                ${managers.map(m => {
                    // Creadores asignados por cuenta (profiles)
                    const assignedProfs = creators.filter(c => c.manager_id === m.id);
                    const usernamesFromProfs = assignedProfs.map(c => (c.tiktok_username || '').toLowerCase());

                    // Creadores asignados por métricas (Excel/Username)
                    const groupMetrics = metricsData.filter(d => {
                        const isAssignedByMetric = d.manager_id === m.id;
                        const isAssignedByProf = usernamesFromProfs.includes((d.username || '').toLowerCase());
                        return isAssignedByMetric || isAssignedByProf;
                    });

                    const groupDiamonds = groupMetrics.reduce((s, d) => s + Number(d.diamonds || 0), 0);

                    return `
                    <div class="glass-panel" style="display:flex; flex-direction:column; gap:1rem;">
                        <div style="font-weight:700;">${m.display_name || m.email}</div>
                        <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px;">
                            <div style="font-size:0.65rem; color:var(--text-secondary);">RENDIMIENTO GRUPO</div>
                            <div style="font-size:1.4rem; font-weight:800; color:var(--accent);">${fmt(groupDiamonds)} 💎</div>
                            <div style="font-size:0.65rem; color:var(--text-secondary); margin-top:0.4rem;">${groupMetrics.length} CREADORES</div>
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
            container.innerHTML = skelRows(3);
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

            <div style="display:flex; gap:0.8rem; margin-bottom:2rem; flex-wrap:wrap;">
                <input type="text" id="m-search-input" class="input-control" placeholder="Email o nombre del usuario..." style="flex:1;min-width:200px;">
                <button id="m-search-btn" class="btn btn-primary" style="white-space:nowrap;">Buscar</button>
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
            results.innerHTML = found.map(p => {
                const ag = p.agency || 'latam';
                return `
                <div class="glass-panel" style="padding:0.85rem 1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.6rem;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.display_name || p.email}</div>
                        <div style="font-size:0.72rem; color:var(--text-secondary);display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-top:0.15rem;">
                            <span style="overflow:hidden;text-overflow:ellipsis;">${p.email}</span>
                            <span style="background:rgba(124,110,247,0.12);border-radius:999px;padding:0.05rem 0.55rem;font-weight:700;color:var(--primary-light);flex-shrink:0;">${ag === 'usa' ? '🇺🇸 USA' : '🌎 LATAM'}</span>
                        </div>
                    </div>
                    <div style="display:flex;gap:0.4rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                        <select class="input-control btn-agency-select" data-id="${p.id}"
                            style="padding:0.3rem 0.5rem;font-size:0.72rem;border-radius:var(--radius-sm);width:auto;">
                            <option value="latam" ${ag==='latam'?'selected':''}>🌎 LATAM</option>
                            <option value="usa"   ${ag==='usa'  ?'selected':''}>🇺🇸 USA</option>
                        </select>
                        <button class="btn btn-sm btn-role-toggle" data-id="${p.id}" data-active="${p.is_manager}"
                            style="background:${p.is_manager ? 'rgba(255,85,105,0.1)' : 'var(--primary)'}; color:${p.is_manager ? 'var(--danger)' : 'white'};">
                            ${p.is_manager ? 'Quitar Manager' : 'Hacer Manager'}
                        </button>
                    </div>
                </div>`; }).join('') || '<p style="text-align:center; padding:1rem;">No se encontraron usuarios.</p>';

            // Selector de agencia
            results.querySelectorAll('.btn-agency-select').forEach(sel => {
                sel.onchange = async () => {
                    try {
                        await profiles.setAgency(sel.dataset.id, sel.value);
                        appState.showToast('Agencia actualizada', 'success');
                    } catch (err) { appState.showToast('Error: ' + err.message, 'error'); }
                };
            });

            // Botón de rol
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

// ── VISTA: CARGA DE DATOS MENSUALES ─────────────────────────────────────────
function renderUploadView(container, mainContainer, agency = 'latam') {
    const agencyLabel = agency === 'usa' ? '🇺🇸 USA' : '🌎 LATAM';
    container.innerHTML = `
        <div class="glass-panel animate-fadeIn" style="max-width:600px; margin:0 auto;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;">
                <h2 style="margin:0;">Cargar Datos Mensuales</h2>
                <span style="background:rgba(124,110,247,0.15);border:1px solid rgba(124,110,247,0.3);border-radius:999px;padding:0.2rem 0.8rem;font-size:0.75rem;font-weight:700;color:var(--primary-light);">${agencyLabel}</span>
            </div>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1.5rem;">
                Sube un Excel con tres columnas: <strong>Usuario</strong>, <strong>Días desde la incorporación</strong> y <strong>Partidas</strong>.
                Los diamantes, horas y días válidos los cargan los propios creadores.
            </p>
            <div class="input-group" style="margin-bottom:1.5rem;">
                <label style="display:block; font-size:0.8rem; margin-bottom:0.5rem; color:var(--text-secondary);">MES</label>
                <input type="month" id="up-month" class="input-control" value="${new Date().toISOString().slice(0,7)}">
            </div>
            <div class="input-group" style="margin-bottom:1.5rem;">
                <label style="display:block; font-size:0.8rem; margin-bottom:0.5rem; color:var(--text-secondary);">ARCHIVO EXCEL (.xlsx)</label>
                <input type="file" id="up-file" class="input-control" accept=".xlsx,.xls,.csv" style="padding:2rem; border:2px dashed var(--glass-border); text-align:center;">
            </div>
            <div id="up-preview" style="margin-bottom:1.5rem; font-size:0.9rem;"></div>
            <button id="up-btn" class="btn btn-primary" disabled style="width:100%;">PUBLICAR DATOS</button>
        </div>
    `;

    const fileIn = container.querySelector('#up-file');
    const uBtn = container.querySelector('#up-btn');
    const preview = container.querySelector('#up-preview');
    let rows = null;

    fileIn.onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        normalizeRow._diagDone = false;
        try {
            const buf = await f.arrayBuffer();
            const wb = window.XLSX.read(buf, { type: 'array' });
            const rawData = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });

            if (!rawData.length) {
                preview.innerHTML = '<span style="color:var(--danger);">El archivo está vacío.</span>';
                return;
            }

            rows = rawData.map(normalizeRow).filter(Boolean);

            const withDays     = rows.filter(r => r.daysSinceJoining > 0).length;
            const withBattles  = rows.filter(r => r.battles > 0).length;

            preview.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:0.35rem;">
                    <span style="color:var(--accent);">✓ ${rows.length} usuario${rows.length !== 1 ? 's' : ''} detectados</span>
                    <span style="color:${withDays > 0 ? 'var(--accent)' : 'var(--text-muted)'};">
                        · ${withDays} con días desde incorporación
                    </span>
                    <span style="color:${withBattles > 0 ? 'var(--accent)' : 'var(--text-muted)'};">
                        · ${withBattles} con partidas
                    </span>
                </div>`;

            uBtn.disabled = false;
        } catch (err) {
            preview.innerHTML = '<span style="color:var(--danger);">Error leyendo el archivo: ' + err.message + '</span>';
        }
    };

    uBtn.onclick = async () => {
        const m = container.querySelector('#up-month').value;
        const [y, mm] = m.split('-');
        const dt = new Date(Date.UTC(y, mm - 1, 1));
        const lbl = dt.toLocaleString('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^./, c => c.toUpperCase());
        uBtn.disabled = true;
        uBtn.textContent = 'Publicando...';

        try {
            await metrics.upsertJoiningData(`${m}-01`, lbl, rows, agency);
            appState.showToast('Datos publicados con éxito', 'success');
            await store.refreshMetrics();
            renderAdminDashboard(mainContainer);
        } catch (err) {
            appState.showToast('Error al publicar: ' + (err.message || 'Desconocido'), 'error');
            uBtn.disabled = false;
            uBtn.textContent = 'PUBLICAR DATOS';
        }
    };
}

// ── VISTA: EDITOR DE GRUPO ────────────────────────────────────────────────
// Asignación por USERNAME directo en creator_metrics. No requiere cuenta.
async function renderGroupEditor(container, managerId) {
    container.innerHTML = '<div style="padding:2rem;">Sincronizando equipo...</div>';

    const allProfs = store.getProfiles();
    const manager = allProfs.find(p => p.id === managerId) || { display_name: 'Manager' };

    const metricsData = store.getMetricsData() || [];

    const [assignedUsernames, allTakenUsernames] = await Promise.all([
        profiles.getCreatorsByManager(managerId),
        profiles.getAllAssignedUsernames(),
    ]);

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
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1.5rem;">
                <div class="glass-panel">
                    <h5 style="font-size:0.7rem; color:var(--text-secondary); margin-bottom:1rem;">MIEMBROS ACTUALES (${myGroup.length})</h5>
                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        ${myGroup.map(c => `
                            <div class="glass-panel" style="padding:0.6rem; display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; align-items:center; gap:0.6rem;">
                                    <div style="width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; flex-shrink:0;">
                                        <span style="font-size:0.7rem; position:absolute;">${c.username.charAt(0).toUpperCase()}</span>
                                        <img src="https://unavatar.io/tiktok/${encodeURIComponent(c.username)}" alt="@${c.username}" style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0; opacity:0; transition:opacity 0.2s ease;" referrerpolicy="no-referrer" onload="this.style.opacity='1';">
                                    </div>
                                    <div>
                                        <div style="font-size:0.85rem; font-weight:600;">@${c.username}</div>
                                        <div style="font-size:0.65rem; color:var(--text-secondary);">${fmt(c.diamonds)} 💎</div>
                                    </div>
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
            <div style="display:flex; align-items:center; gap:0.6rem;">
                <div style="width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; flex-shrink:0;">
                    <span style="font-size:0.7rem; position:absolute;">${c.username.charAt(0).toUpperCase()}</span>
                    <img src="https://unavatar.io/tiktok/${encodeURIComponent(c.username)}" alt="@${c.username}" style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0; opacity:0; transition:opacity 0.2s ease;" referrerpolicy="no-referrer" onload="this.style.opacity='1';">
                </div>
                <div>
                    <div style="font-size:0.85rem; font-weight:600;">@${c.username}</div>
                    <div style="font-size:0.65rem; color:var(--text-secondary);">${fmt(c.diamonds)} 💎 · ${c.validDays}d</div>
                </div>
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
function getTier(diamonds) {
    for (let i = visualTiers.length - 1; i >= 0; i--) {
        if (diamonds >= visualTiers[i].range) return visualTiers[i];
    }
    return visualTiers[0];
}

export async function renderCreatorsList(container) {
    container.innerHTML = skelRows(5);
    if (isSupabaseConfigured) {
        await Promise.all([
            store.refreshMetrics(),
            store.refreshAdminLists(),
        ]).catch(console.warn);
    }
    const allData = store.getMetricsData() || [];
    const data = allData.filter(d => (d.agency || 'latam') === selectedAgency);

    // Construir lista de managers únicos presentes en las métricas
    const managersInData = [];
    const seenManagerIds = new Set();
    data.forEach(c => {
        if (c.managerId && !seenManagerIds.has(c.managerId)) {
            seenManagerIds.add(c.managerId);
            const prof = store.getProfiles().find(p => p.id === c.managerId);
            managersInData.push({ id: c.managerId, name: prof?.display_name || prof?.email || c.manager || c.managerId });
        }
    });

    const managerOptions = managersInData.map(m =>
        `<option value="${m.id}">${m.name}</option>`
    ).join('');

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1.5rem;">
                <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
                    <h2 style="margin:0;">Creadores</h2>
                    ${agencyToggleHtml()}
                </div>
                <span id="cr-count" style="font-size:0.8rem; color:var(--text-secondary);"></span>
            </div>

            <!-- Barra de búsqueda -->
            <div class="glass-panel" style="padding:0.8rem; margin-bottom:1rem; display:flex; align-items:center; gap:0.8rem;">
                <span>🔍</span>
                <input type="text" id="cr-search" placeholder="Buscar por username..." class="input-control" style="background:none; border:none; padding:0; flex:1;">
            </div>

            <!-- Filtros -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:0.8rem; margin-bottom:1.5rem;">
                <div>
                    <label style="display:block; font-size:0.7rem; color:var(--text-secondary); margin-bottom:0.3rem;">MANAGER</label>
                    <select id="cr-filter-manager" class="input-control" style="padding:0.5rem 0.7rem; font-size:0.8rem;">
                        <option value="all">Todos</option>
                        ${managerOptions}
                        <option value="none">Sin asignar</option>
                    </select>
                </div>
                <div>
                    <label style="display:block; font-size:0.7rem; color:var(--text-secondary); margin-bottom:0.3rem;">NIVEL</label>
                    <select id="cr-filter-level" class="input-control" style="padding:0.5rem 0.7rem; font-size:0.8rem;">
                        <option value="all">Todos los niveles</option>
                        ${visualTiers.map(t => `<option value="${t.level}">${t.emoji} ${t.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display:block; font-size:0.7rem; color:var(--text-secondary); margin-bottom:0.3rem;">DÍAS VÁLIDOS</label>
                    <select id="cr-filter-days" class="input-control" style="padding:0.5rem 0.7rem; font-size:0.8rem;">
                        <option value="all">Todos</option>
                        <option value="22">≥ 22 días (élite)</option>
                        <option value="15">≥ 15 días</option>
                        <option value="7">≥ 7 días</option>
                        <option value="0">Sin días válidos</option>
                    </select>
                </div>
                <div>
                    <label style="display:block; font-size:0.7rem; color:var(--text-secondary); margin-bottom:0.3rem;">ORDENAR POR</label>
                    <select id="cr-sort" class="input-control" style="padding:0.5rem 0.7rem; font-size:0.8rem;">
                        <option value="diamonds">Diamantes ↓</option>
                        <option value="validDays">Días válidos ↓</option>
                        <option value="username">Username A-Z</option>
                    </select>
                </div>
            </div>

            <div id="cr-results"></div>
        </div>
    `;

    const renderItems = (list) => {
        if (!list.length) return '<p style="padding:2rem; text-align:center; color:var(--text-secondary);">Ningún creador coincide con los filtros.</p>';
        return list.map(c => {
            const tier = getTier(c.diamonds);
            const managerProf = c.managerId ? store.getProfiles().find(p => p.id === c.managerId) : null;
            const managerName = managerProf?.display_name || managerProf?.email || c.manager || null;
            const vDays = c.validDays ?? 0;
            const daysColor = vDays >= 22 ? 'var(--accent)' : vDays >= 7 ? 'var(--warning)' : 'var(--danger)';
            const cachedAvatar = localStorage.getItem(`avatar_${c.username}`);

            return `
            <div class="glass-panel" style="padding:1rem; display:flex; align-items:center; gap:1rem; margin-bottom:0.6rem;">
                <div style="width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg,var(--primary),var(--secondary)); display:flex; align-items:center; justify-content:center; color:white; font-weight:800; flex-shrink:0; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,0.1);">
                    <span style="position:absolute;">${c.username.charAt(0).toUpperCase()}</span>
                    <img src="${cachedAvatar || `https://unavatar.io/tiktok/${encodeURIComponent(c.username)}`}"
                         alt="@${c.username}" loading="lazy"
                         style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0; opacity:${cachedAvatar ? '1' : '0'}; transition:opacity 0.3s ease;"
                         referrerpolicy="no-referrer" onload="this.style.opacity='1';" onerror="this.style.display='none';">
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${c.username}</div>
                    <div style="font-size:0.72rem; color:var(--text-secondary); margin-top:0.15rem;">
                        <span style="color:${daysColor};">${vDays}d</span>
                        ${managerName ? `· <span style="color:var(--text-muted);">${managerName}</span>` : '<span style="color:rgba(255,255,255,0.2);">· sin manager</span>'}
                    </div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                    <div style="font-size:0.68rem; margin-bottom:0.2rem; display:flex; align-items:center; justify-content:flex-end; gap:0.3rem;">
                        ${tier.icon ? `<img src="${tier.icon}" style="width:14px; height:14px; object-fit:contain;">` : `<span>${tier.emoji}</span>`}
                        <span>${tier.name}</span>
                    </div>
                    <div style="font-weight:800; color:var(--accent); font-size:0.95rem;">${fmt(c.diamonds)} 💎</div>
                    <button class="btn btn-sm btn-ghost v-c-dash" data-username="${c.username}" style="margin-top:0.35rem; font-size:0.65rem; padding:0.2rem 0.6rem;">Ver →</button>
                </div>
            </div>`;
        }).join('');
    };

    const applyFilters = () => {
        const q       = container.querySelector('#cr-search').value.toLowerCase().trim();
        const manager = container.querySelector('#cr-filter-manager').value;
        const level   = container.querySelector('#cr-filter-level').value;
        const days    = container.querySelector('#cr-filter-days').value;
        const sort    = container.querySelector('#cr-sort').value;

        let list = data.filter(c => {
            const vDays = c.validDays ?? 0;
            if (q && !c.username.toLowerCase().includes(q)) return false;
            if (manager === 'none' && c.managerId) return false;
            if (manager !== 'all' && manager !== 'none' && c.managerId !== manager) return false;
            if (level !== 'all' && getTier(c.diamonds).level !== Number(level)) return false;
            if (days === '0' && vDays > 0) return false;
            if (days !== 'all' && days !== '0' && vDays < Number(days)) return false;
            return true;
        });

        if (sort === 'diamonds')  list = [...list].sort((a, b) => b.diamonds - a.diamonds);
        if (sort === 'validDays') list = [...list].sort((a, b) => (b.validDays ?? 0) - (a.validDays ?? 0));
        if (sort === 'username')  list = [...list].sort((a, b) => a.username.localeCompare(b.username));

        container.querySelector('#cr-count').textContent = `${list.length} de ${data.length} creadores`;
        container.querySelector('#cr-results').innerHTML = renderItems(list);
    };

    ['#cr-search', '#cr-filter-manager', '#cr-filter-level', '#cr-filter-days', '#cr-sort'].forEach(sel => {
        const el = container.querySelector(sel);
        el.addEventListener(sel === '#cr-search' ? 'input' : 'change', applyFilters);
    });

    wireAgencyToggle(container, () => renderCreatorsList(container));

    applyFilters();

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.v-c-dash');
        if (btn) {
            const username = btn.dataset.username;
            container.innerHTML = skelCreator();
            import('./creatorDashboard.js').then(m => m.renderCreatorDashboard(container, username));
        }
    });
}

// ── VISTA: HISTORIAL DE MÉTRICAS ─────────────────────────────────────────────
const CHART_DEFAULTS = {
    scales: {
        x: {
            grid:  { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 11 } },
        },
        y: {
            grid:  { color: 'rgba(255,255,255,0.05)' },
            ticks: {
                color: 'rgba(255,255,255,0.45)',
                font: { size: 11 },
                callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v,
            },
        },
    },
    plugins: { legend: { display: false } },
    responsive: true,
    maintainAspectRatio: false,
};

async function renderHistoryView(container) {
    container.innerHTML = skelHistory();

    if (!isSupabaseConfigured) {
        container.innerHTML = '<div class="glass-panel" style="padding:2rem; text-align:center; color:var(--text-muted);">El historial requiere Supabase configurado.</div>';
        return;
    }

    const periods = await metrics.listPeriods().catch(() => []);
    if (!periods.length) {
        container.innerHTML = '<div class="glass-panel" style="padding:2rem; text-align:center; color:var(--text-muted);">Aún no hay períodos históricos cargados.</div>';
        return;
    }

    // Últimos 6 períodos, del más antiguo al más reciente (orden correcto para el eje X)
    const recent = periods.slice(0, 6).reverse();
    const periodData = await Promise.all(
        recent.map(p => metrics.getByPeriod(p.id).then(rows => ({ period: p, rows })))
    );

    const labels        = periodData.map(d => d.period.label);
    const totalDiamonds = periodData.map(d => d.rows.reduce((s, r) => s + r.diamonds, 0));
    const totalCreators = periodData.map(d => d.rows.length);

    container.innerHTML = `
        <div class="animate-fadeIn">
            <h2 style="margin-bottom:1.5rem;">Historial de Métricas</h2>

            <!-- KPIs rápidos -->
            <div class="metrics-grid" style="margin-bottom:1.5rem;">
                <div class="glass-panel metric-card">
                    <span class="metric-label">Períodos cargados</span>
                    <span class="metric-value">${periods.length}</span>
                </div>
                <div class="glass-panel metric-card">
                    <span class="metric-label">Mejor mes (💎)</span>
                    <span class="metric-value" style="color:var(--accent);">${fmt(Math.max(...totalDiamonds))}</span>
                </div>
                <div class="glass-panel metric-card">
                    <span class="metric-label">Máx. creadores activos</span>
                    <span class="metric-value">${Math.max(...totalCreators)}</span>
                </div>
            </div>

            <!-- Gráfico global -->
            <div class="glass-panel" style="padding:1.5rem; margin-bottom:1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h4 style="margin:0; font-size:0.8rem; color:var(--text-secondary); letter-spacing:0.05em;">DIAMANTES TOTALES POR PERÍODO</h4>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn btn-sm chart-type-btn active" data-type="bar"  style="font-size:0.7rem; padding:0.25rem 0.6rem;">Barras</button>
                        <button class="btn btn-sm chart-type-btn"        data-type="line" style="font-size:0.7rem; padding:0.25rem 0.6rem;">Línea</button>
                    </div>
                </div>
                <div style="position:relative; height:220px;">
                    <canvas id="chart-global"></canvas>
                </div>
            </div>

            <!-- Búsqueda por creador -->
            <div class="glass-panel" style="padding:1.5rem;">
                <h4 style="margin-top:0; font-size:0.8rem; color:var(--text-secondary); letter-spacing:0.05em;">EVOLUCIÓN POR CREADOR</h4>
                <div style="display:flex; gap:0.8rem; margin-bottom:1.25rem;">
                    <input type="text" id="hist-username" class="input-control" placeholder="@username..." style="flex:1;">
                    <button id="hist-search-btn" class="btn btn-primary" style="white-space:nowrap;">Ver evolución</button>
                </div>
                <div id="hist-creator-wrap" style="position:relative; height:220px; display:none;">
                    <canvas id="chart-creator"></canvas>
                </div>
                <p id="hist-creator-msg" style="text-align:center; color:var(--text-muted); font-size:0.85rem; margin:0;">
                    Ingresa un username para ver su evolución de diamantes período a período.
                </p>
            </div>
        </div>
    `;

    // ── Gráfico global ────────────────────────────────────────────────────────
    let globalChart = new Chart(
        container.querySelector('#chart-global').getContext('2d'),
        {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: totalDiamonds,
                    backgroundColor: 'rgba(124,110,247,0.55)',
                    borderColor:     'rgba(124,110,247,1)',
                    borderWidth: 1,
                    borderRadius: 5,
                    // line props (inactivos en modo bar)
                    tension: 0.35,
                    fill: true,
                    pointBackgroundColor: 'rgba(124,110,247,1)',
                    pointRadius: 4,
                }],
            },
            options: { ...CHART_DEFAULTS },
        }
    );

    // Alternar tipo de gráfico
    container.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            globalChart.destroy();
            globalChart = new Chart(
                container.querySelector('#chart-global').getContext('2d'),
                {
                    type: btn.dataset.type,
                    data: {
                        labels,
                        datasets: [{
                            data: totalDiamonds,
                            backgroundColor: btn.dataset.type === 'line' ? 'rgba(124,110,247,0.15)' : 'rgba(124,110,247,0.55)',
                            borderColor:     'rgba(124,110,247,1)',
                            borderWidth: btn.dataset.type === 'line' ? 2 : 1,
                            borderRadius: 5,
                            tension: 0.35,
                            fill: true,
                            pointBackgroundColor: 'rgba(124,110,247,1)',
                            pointRadius: 4,
                        }],
                    },
                    options: { ...CHART_DEFAULTS },
                }
            );
        });
    });

    // ── Gráfico por creador ───────────────────────────────────────────────────
    let creatorChart = null;

    const searchCreator = () => {
        const q    = container.querySelector('#hist-username').value.trim().toLowerCase().replace(/^@/, '');
        const wrap = container.querySelector('#hist-creator-wrap');
        const msg  = container.querySelector('#hist-creator-msg');

        if (!q) return;

        const creatorDiamonds = periodData.map(d => {
            const row = d.rows.find(r => r.username === q);
            return row ? row.diamonds : null;
        });

        if (creatorDiamonds.every(v => v === null)) {
            wrap.style.display = 'none';
            msg.style.display  = 'block';
            msg.textContent    = `No se encontró "@${q}" en ninguno de los últimos ${periodData.length} períodos.`;
            return;
        }

        wrap.style.display = 'block';
        msg.style.display  = 'none';

        if (creatorChart) creatorChart.destroy();

        creatorChart = new Chart(
            container.querySelector('#chart-creator').getContext('2d'),
            {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: `@${q}`,
                        data: creatorDiamonds,
                        borderColor:          '#00d9a6',
                        backgroundColor:      'rgba(0,217,166,0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: '#00d9a6',
                        pointRadius: 4,
                        tension: 0.35,
                        fill: true,
                        spanGaps: true,
                    }],
                },
                options: { ...CHART_DEFAULTS },
            }
        );
    };

    container.querySelector('#hist-search-btn').addEventListener('click', searchCreator);
    container.querySelector('#hist-username').addEventListener('keypress', e => {
        if (e.key === 'Enter') searchCreator();
    });
}

// ── VISTA: EDITOR DE NORMAS / CANALES ─────────────────────────────────────────
async function renderContentEditor(container) {
    container.innerHTML = `
        <div class="animate-fadeIn">
            <h2 style="margin-bottom:1.5rem;">📝 Normas &amp; Canales</h2>
            <div id="ce-normas" class="glass-panel skel-panel" style="min-height:120px; margin-bottom:1.5rem;"></div>
            <div id="ce-canales" class="glass-panel skel-panel" style="min-height:120px;"></div>
        </div>`;

    const [normas, canales] = await Promise.allSettled([
        content.getPage('normas'),
        content.getPage('canales'),
    ]);

    const makeEditor = (slug, icon, page) => `
        <div style="margin-bottom:0.75rem; display:flex; align-items:center; gap:0.5rem;">
            <span style="font-size:1.2rem;">${icon}</span>
            <h3 style="font-size:1rem; font-weight:700;">${page?.title || slug}</h3>
        </div>
        <div class="input-group">
            <label>Título</label>
            <input id="ce-title-${slug}" class="input-control" value="${(page?.title || '').replace(/"/g,'&quot;')}" placeholder="Título de la página">
        </div>
        <div class="input-group">
            <label>Contenido (una línea = un párrafo)</label>
            <textarea id="ce-body-${slug}" class="input-control" rows="8" style="resize:vertical;">${page?.body || ''}</textarea>
        </div>
        <button id="ce-save-${slug}" class="btn btn-primary" style="min-width:120px;">Guardar</button>
        <span id="ce-status-${slug}" style="margin-left:0.75rem; font-size:0.8rem; color:var(--text-secondary);"></span>`;

    container.querySelector('#ce-normas').innerHTML = makeEditor('normas', '📋', normas.value);
    container.querySelector('#ce-canales').innerHTML = makeEditor('canales', '📢', canales.value);

    ['normas', 'canales'].forEach(slug => {
        container.querySelector(`#ce-save-${slug}`).onclick = async () => {
            const title  = container.querySelector(`#ce-title-${slug}`).value.trim();
            const body   = container.querySelector(`#ce-body-${slug}`).value;
            const status = container.querySelector(`#ce-status-${slug}`);
            const btn    = container.querySelector(`#ce-save-${slug}`);
            btn.disabled = true;
            status.textContent = 'Guardando…';
            try {
                await content.upsertPage(slug, title, body);
                status.style.color = 'var(--accent)';
                status.textContent = '✓ Guardado';
            } catch (err) {
                status.style.color = 'var(--danger)';
                status.textContent = err.message;
            } finally {
                btn.disabled = false;
            }
        };
    });
}
