// Copia deliberada de assets/js/config.js para uso en Node/CI (scripts/whatsapp-checkin.mjs).
// assets/js/config.js es un módulo ES pensado para el bundle del frontend; este
// script corre fuera de ese bundle (GitHub Actions), así que se duplica a mano.
// IMPORTANTE: si cambian los niveles/bonos en assets/js/config.js, replicar el
// cambio acá también.

// Misma tasa que usa assets/js/views/creatorDashboard.js para "ganancias estimadas".
const DIAMONDS_PER_USD = 200;

export const visualTiers = [
    { level: 1, range: 0, name: 'Nivel 1' },
    { level: 2, range: 40000, name: 'Nivel 2' },
    { level: 3, range: 80000, name: 'Nivel 3' },
    { level: 4, range: 150000, name: 'Nivel 4' },
    { level: 5, range: 300000, name: 'Nivel 5' },
    { level: 6, range: 500000, name: 'Nivel 6' },
    { level: 7, range: 800000, name: 'Nivel 7' },
    { level: 8, range: 1200000, name: 'Nivel 8' },
    { level: 9, range: 1600000, name: 'Nivel 9' },
    { level: 10, range: 3000000, name: 'Nivel 10' },
];

export const cashBonuses = [
    { level: 'Nivel 1', range: 80000,   subio: 30,  mantiene: 15,  baja: 0 },
    { level: 'Nivel 2', range: 150000,  subio: 60,  mantiene: 30,  baja: 0 },
    { level: 'Nivel 3', range: 300000,  subio: 110, mantiene: 55,  baja: 0 },
    { level: 'Nivel 4', range: 500000,  subio: 190, mantiene: 95,  baja: 0 },
    { level: 'Nivel 5', range: 800000,  subio: 300, mantiene: 150, baja: 0 },
    { level: 'Nivel 6', range: 1200000, subio: 450, mantiene: 225, baja: 0 },
    { level: 'Nivel 7', range: 1600000, subio: 600, mantiene: 300, baja: 0 },
];

export const cashBonusesUSA = [
    { level: 'Nivel 1', range: 100000,  subio: 30,  mantiene: 15,  baja: 0 },
    { level: 'Nivel 2', range: 200000,  subio: 60,  mantiene: 30,  baja: 0 },
    { level: 'Nivel 3', range: 300000,  subio: 110, mantiene: 55,  baja: 0 },
    { level: 'Nivel 4', range: 500000,  subio: 190, mantiene: 95,  baja: 0 },
    { level: 'Nivel 5', range: 1000000, subio: 300, mantiene: 150, baja: 0 },
    { level: 'Nivel 6', range: 1600000, subio: 450, mantiene: 225, baja: 0 },
];

export const diamondRewards = [
    { level: 'Nivel 1', range: 80000, reward: 1000 },
    { level: 'Nivel 2', range: 150000, reward: 1800 },
    { level: 'Nivel 3', range: 300000, reward: 3600 },
    { level: 'Nivel 4', range: 500000, reward: 6000 },
    { level: 'Nivel 5', range: 800000, reward: 10000 },
    { level: 'Nivel 6', range: 1200000, reward: 15000 },
    { level: 'Nivel 7', range: 1600000, reward: 20000 },
    { level: 'Nivel 8', range: 3000000, reward: 37500 },
];

export function getCashBonuses(agency) {
    return agency === 'usa' ? cashBonusesUSA : cashBonuses;
}

export const requirements = {
    cashBonus:   { minHours: 15, minDays: 7 },
    diamondPrize: { minHours: 90, minDays: 22, maxBattles: 500 },
};

function fmt(n) { return Math.round(n).toLocaleString('es'); }

// Índice del tier más alto de bonusTable cuyo umbral ya cubre "diamonds"
// (-1 si todavía no llega ni al primero). Misma lógica que getIdx() en
// creatorDashboard.js, aplicada acá a las tablas de bono en efectivo.
function tierIdx(diamonds, bonusTable) {
    for (let i = bonusTable.length - 1; i >= 0; i--) {
        if (diamonds >= bonusTable[i].range) return i;
    }
    return -1;
}

function daysElapsedInMonth() { return new Date().getDate(); }
function daysInCurrentMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

/**
 * Arma el mensaje de progreso detallado para la variable {{6}} del template
 * de WhatsApp (texto libre, no requiere re-aprobación de Meta). Incluye:
 *   - Tendencia de ritmo diario vs. el mes anterior.
 *   - Estado de días válidos y horas de LIVE (mínimo del bono / tope élite).
 *   - Bono en efectivo objetivo calculado según el NIVEL DEL MES ANTERIOR
 *     (retener ese nivel o subir al siguiente), no un umbral genérico.
 * Devuelve un string con saltos de línea, listo para mandar tal cual.
 */
export function computeNextObjective({ diamonds, diamondsLastMonth = 0, validDays, liveHours, agency }) {
    const agencyCashBonuses = getCashBonuses(agency);
    const { minHours: cashH, minDays: cashDy } = requirements.cashBonus;
    const { minHours: eliteH, minDays: eliteDy } = requirements.diamondPrize;
    const ownEarnings = Math.round(diamonds / DIAMONDS_PER_USD);

    // ── Tendencia: ritmo diario de este mes vs. el mes anterior ─────────────
    const elapsed   = daysElapsedInMonth();
    const totalDays = daysInCurrentMonth();
    const rateThis  = elapsed > 0 ? diamonds / elapsed : 0;
    const rateLast  = diamondsLastMonth > 0 ? diamondsLastMonth / 31 : 0;
    let trendLine;
    if (rateLast <= 0) {
        trendLine = rateThis > 0
            ? `📈 Vas a ${fmt(rateThis)} 💎/día (el mes pasado no tuviste actividad registrada).`
            : `Todavía no registrás actividad este mes.`;
    } else {
        const paceRatio = (rateThis / rateLast) * 100;
        if (paceRatio >= 105) trendLine = `📈 Vas mejor que el mes pasado: ${fmt(rateThis)} 💎/día (mes pasado: ${fmt(rateLast)} 💎/día).`;
        else if (paceRatio >= 85) trendLine = `➡️ Vas a un ritmo parecido al mes pasado: ${fmt(rateThis)} 💎/día (mes pasado: ${fmt(rateLast)} 💎/día).`;
        else trendLine = `📉 Vas por debajo del mes pasado: ${fmt(rateThis)} 💎/día (mes pasado: ${fmt(rateLast)} 💎/día).`;
    }

    // ── Días válidos y horas de LIVE: mínimo del bono vs. tope élite ────────
    const daysLine = validDays >= eliteDy
        ? `✅ Días válidos: ya cumplís el máximo (${eliteDy}+).`
        : validDays >= cashDy
            ? `✓ Días válidos: activo — te faltan ${eliteDy - validDays} para el tope élite (${eliteDy}).`
            : `⚠️ Días válidos: te faltan ${cashDy - validDays} para activar el bono en efectivo (mínimo ${cashDy}).`;

    const hoursLine = liveHours >= eliteH
        ? `✅ Horas de LIVE: ya cumplís el máximo (${eliteH}h+).`
        : liveHours >= cashH
            ? `✓ Horas de LIVE: activo — te faltan ${(eliteH - liveHours).toFixed(1)}h para el tope élite (${eliteH}h).`
            : `⚠️ Horas de LIVE: te faltan ${(cashH - liveHours).toFixed(1)}h para activar el bono en efectivo (mínimo ${cashH}h).`;

    // ── Bono en efectivo: objetivo según el nivel del MES ANTERIOR ──────────
    const lastMonthIdx = tierIdx(diamondsLastMonth, agencyCashBonuses);
    const currIdx      = tierIdx(diamonds, agencyCashBonuses);
    const meetsCash     = liveHours >= cashH && validDays >= cashDy;
    let bonusLine;

    if (lastMonthIdx < 0) {
        const first = agencyCashBonuses[0];
        const missing = Math.max(0, first.range - diamonds);
        bonusLine = missing > 0
            ? `💵 Bono en efectivo: te faltan ${fmt(missing)} 💎 para desbloquear tu primer nivel (hasta $${first.mantiene}).`
            : `💵 Bono en efectivo: ¡ya alcanzaste tu primer nivel! Vas a cobrar hasta $${first.mantiene}.`;
    } else {
        const retain = agencyCashBonuses[lastMonthIdx];
        const up     = agencyCashBonuses[lastMonthIdx + 1] || null;
        if (diamonds < retain.range) {
            const missing = retain.range - diamonds;
            bonusLine = `⚠️ Bono en efectivo: vas a BAJAR de tu nivel del mes pasado (${retain.level}) si no sumás ${fmt(missing)} 💎 más. Mantené el nivel para asegurar $${retain.mantiene}.`;
        } else if (up && diamonds < up.range) {
            const missing = up.range - diamonds;
            bonusLine = `✅ Bono en efectivo: ya asegurás mantener tu nivel del mes pasado (${retain.level}, $${retain.mantiene}). Te faltan ${fmt(missing)} 💎 para subir a ${up.level} y cobrar $${up.subio}.`;
        } else {
            const topLevel = up ? up.level : retain.level;
            const topAmt   = up ? up.subio : retain.subio;
            bonusLine = `🚀 Bono en efectivo: ¡superaste tu nivel del mes pasado! Vas camino a ${topLevel} y podrías cobrar hasta $${topAmt}.`;
        }
        if (!meetsCash) {
            bonusLine += ` (Ojo: para cobrar necesitás mínimo ${cashDy} días válidos y ${cashH}h de LIVE — todavía no los cumplís.)`;
        }
    }

    return [
        `Día ${elapsed} de ${totalDays} del mes.`,
        trendLine,
        daysLine,
        hoursLine,
        bonusLine,
        `Tus propias ganancias de TikTok este mes rondarían los $${ownEarnings} USD.`,
    ].join('\n');
}
