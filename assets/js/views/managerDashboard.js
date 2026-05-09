import { store } from '../store.js';
import { isSupabaseConfigured } from '../supabase.js';
import { profiles } from '../api.js';

function fmt(n) { return Number(n).toLocaleString('es'); }

export async function renderManagerDashboard(container) {
    container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted);">Cargando…</div>`;

    if (isSupabaseConfigured) {
        await store.refreshMetrics().catch(() => {});
    }

    const data = store.getMetricsData() || [];
    const me   = store.getCurrentUser();

    if (!data.length) {
        container.innerHTML = `
            <div class="glass-panel" style="padding:3rem;text-align:center;color:var(--text-muted);">
                <p>No hay datos disponibles en el sistema.</p>
                <p style="font-size:0.85rem;margin-top:0.5rem;">Pídele al Administrador que cargue el archivo de métricas más reciente.</p>
            </div>`;
        return;
    }

    // Determinar qué creators manejo:
    //  • En modo Supabase: leemos de profiles los creators con manager_id = mi id.
    //  • En modo demo: filtramos por la columna manager_legacy = "Manager N" tal como antes.
    let myCreatorUsernames = new Set();
    let labelManager = 'Mi Grupo';

    if (isSupabaseConfigured && me?.id) {
        try {
            const list = await profiles.listCreatorsForManager(me.id);
            list.forEach(c => c.tiktok_username && myCreatorUsernames.add(c.tiktok_username.toLowerCase()));
            labelManager = me.username || 'Mi Grupo';
        } catch (e) { console.warn(e); }
    } else {
        // Modo demo legacy
        const numMatch = (me?.username || '').match(/\d+/);
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
                <td style="font-weight:500;color:var(--text-primary);">@${c.username}</td>
                <td style="color:var(--accent);font-weight:600;">${fmt(c.diamonds)}</td>
                <td>${c.validDays}</td>
                <td>${c.battles}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem;">
            No tienes creadores asignados todavía. Pídele al Admin que te asigne creadores.
           </td></tr>`;

    container.innerHTML = `
        <div style="margin-bottom:2rem;">
            <h1 style="font-size:1.8rem;margin-bottom:0.5rem;">Panel de Supervisión</h1>
            <p style="color:var(--text-secondary);">Manager: <strong style="color:var(--text-primary);">${labelManager}</strong></p>
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
}
