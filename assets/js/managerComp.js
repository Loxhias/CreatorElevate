// Fórmulas de compensación de managers — portadas 1:1 desde el Panel de
// Creadores (DEFAULT_COMP / shell.html), ya validadas ahí. Puras: no tocan
// store/DOM, reciben `settings` (fila de manager_comp_settings, o el default
// de demo con la misma forma) como parámetro en vez de leer un cfg global.
import { visualTiers } from './config.js';
import { getIdx } from './views/creatorDashboard.js';

// Días/horas mínimos por tier de actividad — estructural, igual que
// visualTiers; solo las tasas asociadas (settings.tasas_actividad) son
// editables por el admin.
export const ACTIVIDAD_TIERS = [
    { dias: 8, horas: 20 }, { dias: 12, horas: 35 }, { dias: 15, horas: 50 },
    { dias: 18, horas: 70 }, { dias: 22, horas: 90 },
];

export function comisionDolares(diamantes, tasaPct, settings) {
    if (diamantes == null || tasaPct == null) return 0;
    return diamantes * tasaPct / 10000 * (settings.pct_reparto_comisiones / 100);
}

export function pesoMonetiza(diamantesUltimoMes, settings) {
    if (diamantesUltimoMes == null) return 0;
    if (diamantesUltimoMes >= settings.umbral_monetizan_completo) return 1;
    if (diamantesUltimoMes >= settings.umbral_monetizan_parcial) return settings.peso_monetizan_parcial;
    return 0;
}

export function computeBaseTier(nuevosEsteMes, monetizanScore, graduados, settings) {
    if (nuevosEsteMes >= settings.tier1_nuevos && monetizanScore >= settings.tier1_monetizan && graduados >= settings.tier1_graduados) {
        return { tier: 1, pago: settings.tier1_pago, riesgoBaja: false };
    }
    if (nuevosEsteMes >= settings.tier2_nuevos && monetizanScore >= settings.tier2_monetizan && graduados >= settings.tier2_graduados) {
        return { tier: 2, pago: settings.tier2_pago, riesgoBaja: false };
    }
    return { tier: 3, pago: 0, riesgoBaja: true };
}

export function tasaIncrementoIngresos(totalDiamantesAgencia, settings) {
    if (!settings.objetivo_mensual || settings.objetivo_mensual <= 0) return { pct: 0, tasa: 0 };
    const pct = totalDiamantesAgencia / settings.objetivo_mensual * 100;
    let tasa = 0;
    const mins = settings.incremento_tiers_min || [];
    const tasas = settings.tasas_incremento || [];
    for (let i = 0; i < mins.length; i++) {
        if (pct >= mins[i]) tasa = tasas[i];
    }
    return { pct, tasa };
}

// Nivel de rango 1-10, mismos umbrales que visualTiers de config.js (son los
// mismos 10 rangos que ya se muestran a los creadores).
export function rangoNivel(diamantes) {
    return Math.max(0, getIdx(diamantes, visualTiers)) + 1;
}

export function tasaSubidaCreator(diamantesUltimoMes, diamantesPeriodo, settings) {
    if (diamantesUltimoMes == null || diamantesPeriodo == null) return 0;
    const nivelPasado = rangoNivel(diamantesUltimoMes);
    const nivelActual = rangoNivel(diamantesPeriodo);
    if (nivelActual > nivelPasado) return settings.tasa_subir;
    if (nivelActual === nivelPasado) return nivelActual <= 2 ? 0 : settings.tasa_mantener;
    return 0;
}

export function tasaActividadCreator(diamantesPeriodo, diasValidosLive, duracionLiveHoras, settings) {
    if (diamantesPeriodo == null || diamantesPeriodo < 100) return 0;
    if (diasValidosLive == null || duracionLiveHoras == null) return 0;
    let tasa = 0;
    const tasas = settings.tasas_actividad || [];
    for (let i = 0; i < ACTIVIDAD_TIERS.length; i++) {
        const t = ACTIVIDAD_TIERS[i];
        if (diasValidosLive >= t.dias && duracionLiveHoras >= t.horas) tasa = tasas[i];
    }
    return tasa;
}

// Corre la fórmula completa (pago base + las 3 comisiones) sobre el roster
// de un manager. Único lugar donde vive este cálculo — tanto la vista del
// manager (managerEarnings.js) como la auditoría del admin (adminDashboard.js)
// llaman a esto, para no repetir el loop de acumulación en dos archivos.
// `roster`: filas normalizadas de creator_metrics (mismo shape que
// store.getMetricsData()). `totalDiamantesAgencia`: suma de diamantes de
// TODA la agencia del manager en el período (no solo su roster).
export function estimateManagerPayout(roster, settings, totalDiamantesAgencia) {
    const incremento = tasaIncrementoIngresos(totalDiamantesAgencia, settings);

    let nuevosEsteMes = 0, graduados = 0, monetizanScore = 0;
    let subidaCount = 0, retencionCount = 0, actividadCount = 0;
    let comisionSubida = 0, comisionActividad = 0, comisionIncremento = 0;

    roster.forEach(c => {
        const dp = Number(c.diamonds || 0);
        const dLast = c.diamondsLastMonth != null ? Number(c.diamondsLastMonth) : null;
        const horas = Number(c.liveSeconds || 0) / 3600;
        const dy = Number(c.validDays || 0);

        if (c.daysSinceJoining != null && c.daysSinceJoining <= 31) nuevosEsteMes++;
        if ((c.statusGraduation || '') === 'Graduado') graduados++;
        monetizanScore += pesoMonetiza(dLast, settings);

        const tasaSub = tasaSubidaCreator(dLast, dp, settings);
        if (tasaSub > 0) {
            if (tasaSub === settings.tasa_subir) subidaCount++; else retencionCount++;
        }
        comisionSubida += comisionDolares(dp, tasaSub, settings);

        const tasaAct = tasaActividadCreator(dp, dy, horas, settings);
        if (tasaAct > 0) actividadCount++;
        comisionActividad += comisionDolares(dp, tasaAct, settings);

        comisionIncremento += comisionDolares(dp, incremento.tasa, settings);
    });

    const baseTier = computeBaseTier(nuevosEsteMes, monetizanScore, graduados, settings);
    const totalComisiones = comisionSubida + comisionActividad + comisionIncremento;
    const totalMes = baseTier.pago + totalComisiones;

    return {
        baseTier, nuevosEsteMes, graduados, monetizanScore,
        subidaCount, retencionCount, actividadCount,
        comisionSubida, comisionActividad, comisionIncremento,
        totalComisiones, totalMes, incremento,
    };
}
