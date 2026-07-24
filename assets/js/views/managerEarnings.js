// Vista "Mis Ganancias" — cuánto va a cobrar el manager este mes, calculado
// en vivo con la misma fórmula validada del Panel de Creadores (pago base +
// 3 comisiones). Ver assets/js/managerComp.js para las fórmulas puras y
// MANAGER_COMP_SQL.sql para de dónde salen los umbrales/tasas (editables por
// el admin, por agencia).
import { store } from '../store.js';
import { isSupabaseConfigured } from '../supabase.js';
import { profiles, managerComp, metrics } from '../api.js';
import { estimateManagerPayout } from '../managerComp.js';

function fmtUsd(n) { return '$' + Number(n || 0).toLocaleString('es', { maximumFractionDigits: 0 }); }

function emptyState(title, sub) {
    return `<div class="glass-panel" style="padding:3rem 2rem;text-align:center;margin-top:2rem;">
        <div style="font-size:2.5rem;margin-bottom:1rem;">🌑</div>
        <h3 style="margin-bottom:0.5rem;">${title}</h3>
        <p class="text-sm text-muted">${sub}</p>
    </div>`;
}

export async function renderManagerEarningsView(container, targetManagerId = null) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:20px;width:220px;border-radius:999px;margin-bottom:1rem;"></div>
            <div class="skel-panel" style="height:120px;margin-bottom:1.25rem;"></div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.25rem;">
                <div class="skel-panel" style="height:120px;"></div>
                <div class="skel-panel" style="height:120px;"></div>
                <div class="skel-panel" style="height:120px;"></div>
            </div>
        </div>`;

    try {
        if (isSupabaseConfigured && !store.getMetricsData()?.length) {
            await store.refreshMetrics().catch(() => {});
        }

        const data = store.getMetricsData() || [];
        const currentUser = store.getCurrentUser();
        const isAuditing = !!targetManagerId;
        const activeManagerId = targetManagerId || currentUser.id;

        if (!data.length) {
            container.innerHTML = emptyState(
                'No hay datos disponibles',
                'Pídele al administrador que cargue el archivo de métricas más reciente.'
            );
            return;
        }

        // Roster del manager — mismo patrón (con cache) que managerDashboard.js
        let myUsernames = new Set();
        if (isSupabaseConfigured && activeManagerId) {
            const cached = store.getManagerGroup(activeManagerId);
            if (cached) {
                cached.forEach(u => myUsernames.add(u));
            } else {
                try {
                    const list = await profiles.listMyCreators(activeManagerId);
                    list.forEach(c => c.username && myUsernames.add(c.username.toLowerCase()));
                    store.setManagerGroup(activeManagerId, new Set(myUsernames));
                } catch (e) { console.warn('Error trayendo el grupo:', e); }
            }
        } else if (!isSupabaseConfigured) {
            const numMatch = (currentUser?.username || '').match(/\d+/);
            const target = numMatch ? `Manager ${numMatch[0]}` : 'Manager 1';
            data.filter(c => (c.manager || '').toLowerCase() === target.toLowerCase())
                .forEach(c => myUsernames.add(c.username.toLowerCase()));
        }

        const myCreators = data.filter(c => myUsernames.has((c.username || '').toLowerCase()));

        // Agencia del manager — la config de comisión y el objetivo mensual
        // son por agencia, y el total de la agencia no debe mezclar latam/usa.
        const managerAgency = (isAuditing
            ? myCreators[0]?.agency
            : store.getProfile?.()?.agency) || 'latam';

        const settings = await managerComp.getSettings(managerAgency);

        // Total real de la agencia — vía RPC porque, con la restricción de
        // RLS de creator_metrics, un manager ya no puede leer filas de
        // creadores que no son suyos (necesario para que la comisión de
        // incremento de ingresos no termine comparando su equipo contra sí
        // mismo). Si el RPC no está disponible todavía (SQL no corrido, o
        // modo demo), cae a sumar lo que el propio caller puede ver.
        const period = store.getPeriod();
        let totalDiamantesAgencia = null;
        if (isSupabaseConfigured && period?.id) {
            try {
                totalDiamantesAgencia = await metrics.agencyTotal(period.id, managerAgency);
            } catch (e) {
                console.warn('No se pudo obtener el total real de la agencia, usando fallback local:', e);
            }
        }
        if (totalDiamantesAgencia == null) {
            totalDiamantesAgencia = data
                .filter(c => (c.agency || 'latam') === managerAgency)
                .reduce((s, c) => s + Number(c.diamonds || 0), 0);
        }

        renderContent(container, { myCreators, settings, totalDiamantesAgencia, isAuditing });
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">Error: ${err.message}</div>`;
    }
}

function renderContent(container, { myCreators, settings, totalDiamantesAgencia, isAuditing }) {
    if (!myCreators.length) {
        container.innerHTML = emptyState(
            'Todavía no tenés creadores asignados',
            'Pídele al admin que te asigne creadores para empezar a ver tu proyección de ganancias.'
        );
        return;
    }

    const {
        baseTier, nuevosEsteMes, graduados, monetizanScore,
        subidaCount, retencionCount, actividadCount,
        comisionSubida, comisionActividad, comisionIncremento,
        totalMes, incremento,
    } = estimateManagerPayout(myCreators, settings, totalDiamantesAgencia);

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="margin-bottom:1.25rem;">
                <h2 style="font-size:1.15rem;font-weight:800;">💰 Mis Ganancias</h2>
                <p class="text-sm text-muted">Proyección del mes en base a tu equipo — se recalcula con cada carga de datos.</p>
            </div>

            ${renderTotalHero(totalMes)}

            ${renderBaseTierCard({ baseTier, nuevosEsteMes, monetizanScore, graduados, settings })}

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-bottom:1.25rem;">
                ${renderCommissionCard({
                    icon: '📈', title: 'Subida y retención de rango',
                    detail: `${subidaCount} subieron de rango · ${retencionCount} mantuvieron un rango alto`,
                    amount: comisionSubida,
                })}
                ${renderCommissionCard({
                    icon: '🔥', title: 'Actividad',
                    detail: `${actividadCount} de ${myCreators.length} creadores cumplen el umbral de actividad`,
                    amount: comisionActividad,
                })}
                ${renderCommissionCard({
                    icon: '🚀', title: 'Incremento de ingresos',
                    detail: `La agencia lleva ${incremento.pct.toFixed(0)}% del objetivo mensual`,
                    amount: comisionIncremento,
                })}
            </div>

            <p class="text-xs text-muted" style="text-align:center;">
                Esta es una proyección con los datos cargados hasta el momento — no es un pago confirmado.
                ${isAuditing ? ' (Estás viendo esto en modo auditoría.)' : ''}
            </p>
        </div>`;
}

function renderTotalHero(totalMes) {
    return `
        <div class="glass-panel incentive-hero animate-fadeIn" style="position:relative;overflow:hidden;padding:1.2rem 1.35rem;margin-bottom:1.25rem;border-color:var(--accent)55;background:linear-gradient(135deg,var(--accent)17,transparent 65%);">
            <div class="incentive-hero__glow" style="--glow-color:var(--accent);"></div>
            <div style="position:relative;">
                <div style="font-size:0.66rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent);margin-bottom:0.3rem;">💰 Total estimado este mes</div>
                <div class="incentive-hero__number" style="font-size:clamp(1.7rem,7vw,2.4rem);font-weight:900;line-height:1.1;color:#fff;">${fmtUsd(totalMes)}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.35rem;">Pago base + las 3 comisiones, sumados.</div>
            </div>
        </div>`;
}

function renderBaseTierCard({ baseTier, nuevosEsteMes, monetizanScore, graduados, settings }) {
    const req = (label, val, min) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;margin-bottom:0.3rem;">
            <span class="text-xs" style="color:var(--text-secondary);">${label}</span>
            <span class="text-xs" style="font-weight:700;color:${val >= min ? 'var(--accent)' : 'var(--text-muted)'};">${val} / ${min}</span>
        </div>`;
    return `
        <div class="glass-panel section-card" style="margin-bottom:1.25rem;${baseTier.riesgoBaja ? 'border-left:3px solid var(--danger);' : 'border-left:3px solid var(--accent);'}">
            <div class="section-header">
                <div class="section-icon" style="background:${baseTier.riesgoBaja ? 'rgba(255,85,105,0.12)' : 'rgba(0,217,166,0.1)'};">${baseTier.riesgoBaja ? '⚠️' : '💵'}</div>
                <div>
                    <h3 style="font-size:0.92rem;">Pago base — ${baseTier.riesgoBaja ? 'no alcanzado' : `Tier ${baseTier.tier}`}</h3>
                    <p class="text-xs text-muted">${baseTier.riesgoBaja ? 'Pago a discreción del admin' : fmtUsd(baseTier.pago)}</p>
                </div>
            </div>
            <div style="margin-top:0.7rem;">
                ${req('Nuevos este mes', nuevosEsteMes, settings.tier2_nuevos)}
                ${req('Puntaje de monetización', monetizanScore.toFixed(1), settings.tier2_monetizan)}
                ${req('Graduados', graduados, settings.tier2_graduados)}
            </div>
        </div>`;
}

function renderCommissionCard({ icon, title, detail, amount }) {
    return `
        <div class="glass-panel section-card">
            <div class="section-header">
                <div class="section-icon" style="background:rgba(124,110,247,0.12);">${icon}</div>
                <div><h3 style="font-size:0.88rem;">${title}</h3></div>
            </div>
            <div style="font-size:1.4rem;font-weight:800;color:var(--accent);margin-top:0.5rem;">${fmtUsd(amount)}</div>
            <p class="text-xs text-muted" style="margin-top:0.3rem;">${detail}</p>
        </div>`;
}
