import { store } from '../store.js';
import { isSupabaseConfigured } from '../supabase.js';
import { profiles } from '../api.js';

function fmt(n) { return Number(n).toLocaleString('es'); }

export async function renderManagerDashboard(container, targetManagerId = null) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:36px;width:260px;margin-bottom:1.5rem;"></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.5rem;margin-bottom:2rem;">
                <div class="skel-panel" style="height:90px;"></div>
                <div class="skel-panel" style="height:90px;"></div>
            </div>
            <div class="skel" style="height:20px;width:180px;margin-bottom:1rem;"></div>
            <div class="skel-panel" style="height:220px;"></div>
        </div>`;

    if (isSupabaseConfigured && !targetManagerId && !store.getMetricsData()?.length) {
        await store.refreshMetrics().catch(() => {});
    }

    const data = store.getMetricsData() || [];
    const currentUser = store.getCurrentUser();
    
    // Si hay targetManagerId, estamos auditando
    const isAuditing = !!targetManagerId;
    const activeManagerId = targetManagerId || currentUser.id;
    const activeManagerName = targetManagerId ? 'Auditoría de Manager' : (currentUser.username || 'Mi Grupo');

    if (!data.length) {
        container.innerHTML = `
            <div class="glass-panel" style="padding:3rem;text-align:center;color:var(--text-muted);">
                <p>No hay datos disponibles en el sistema.</p>
                <p style="font-size:0.85rem;margin-top:0.5rem;">Pídele al Administrador que cargue el archivo de métricas más reciente.</p>
            </div>`;
        return;
    }

    // Determinar qué creators manejo:
    let myCreatorUsernames = new Set();
    let labelManager = activeManagerName;

    if (isSupabaseConfigured && activeManagerId) {
        try {
            const [usernames, list] = await Promise.all([
                profiles.getCreatorsByManager(activeManagerId),
                profiles.listCreatorsForManager(activeManagerId),
            ]);
            usernames.forEach(u => myCreatorUsernames.add(u.toLowerCase()));
            list.forEach(c => c.tiktok_username && myCreatorUsernames.add(c.tiktok_username.toLowerCase()));
        } catch (e) { console.warn('Error fetching group:', e); }
    } else if (!isSupabaseConfigured) {
        // Modo demo legacy
        const numMatch = (activeManagerName || '').match(/\d+/);
        const target = numMatch ? `Manager ${numMatch[0]}` : 'Manager 1';
        labelManager = target;
        data.filter(c => (c.manager || '').toLowerCase() === target.toLowerCase())
            .forEach(c => myCreatorUsernames.add(c.username.toLowerCase()));
    }

    const myCreators = data.filter(c => myCreatorUsernames.has((c.username || '').toLowerCase()));
    const totalDiamonds = myCreators.reduce((s, c) => s + Number(c.diamonds || 0), 0);

    const tableRows = myCreators.length
        ? myCreators.sort((a, b) => Number(b.diamonds) - Number(a.diamonds)).map(c => `
            <tr>
                <td style="font-weight:500;color:var(--text-primary);">
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                        <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;flex-shrink:0;border:1px solid rgba(255,255,255,0.1);">
                            <span style="font-size:0.65rem;position:absolute;">${c.username.charAt(0).toUpperCase()}</span>
                            <img src="https://unavatar.io/tiktok/${encodeURIComponent(c.username)}" alt="@${c.username}" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;opacity:0;transition:opacity 0.2s ease;" referrerpolicy="no-referrer" onload="this.style.opacity='1';">
                        </div>
                        <span>@${c.username}</span>
                    </div>
                </td>
                <td style="color:var(--accent);font-weight:600;">${fmt(c.diamonds)}</td>
                <td>${c.validDays}</td>
                <td>${c.battles}</td>
                <td>
                    <button class="btn btn-sm view-creator" data-username="${c.username}" style="padding:0.3rem 0.6rem; font-size:0.75rem;">👁️ Ver</button>
                </td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem;">
            No tienes creadores asignados todavía. Pídele al Admin que te asigne creadores.
           </td></tr>`;

    container.innerHTML = `
        <div style="margin-bottom:2rem; display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
                <h1 style="font-size:1.8rem;margin-bottom:0.5rem;">Panel de Supervisión</h1>
                <p style="color:var(--text-secondary);">Manager: <strong style="color:var(--text-primary);">${labelManager}</strong></p>
            </div>
            ${isAuditing ? `<button id="back-to-admin" class="btn btn-sm" style="background:rgba(255,255,255,0.05); border:1px solid var(--glass-border);">← Volver a Admin</button>` : ''}
        </div>

        <div class="metrics-grid">
            <div class="glass-panel metric-card" style="background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(236,72,153,0.1));border-color:var(--primary);">
                <span class="metric-title">Diamantes del Grupo</span>
                <span class="metric-value text-gradient" style="font-size:2.5rem;">${fmt(totalDiamonds)}</span>
            </div>
            <div class="glass-panel metric-card">
                <span class="metric-title">Creadores a Cargo</span>
                <span class="metric-value">${myCreators.length}</span>
            </div>
        </div>

        <h3 style="margin-bottom:1rem;margin-top:2rem;">Rendimiento Individual</h3>
        <div class="glass-panel table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Creador</th>
                        <th>Diamantes</th>
                        <th>Días</th>
                        <th>Partidas</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
    `;

    // Manejar botones de ver creador (Delegación)
    container.addEventListener('click', (e) => {
        const btnCreator = e.target.closest('.view-creator');
        const btnAdmin   = e.target.closest('#back-to-admin');

        if (btnCreator) {
            const username = btnCreator.dataset.username;
            if (username) {
                import('./creatorDashboard.js').then(m => m.renderCreatorDashboard(container, username));
            }
        }

        if (btnAdmin) {
            import('../main.js').then(m => m.appState.navigate('admin'));
        }
    });
}
