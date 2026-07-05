// Copia deliberada de assets/js/config.js para uso en Node/CI (scripts/whatsapp-checkin.mjs).
// assets/js/config.js es un módulo ES pensado para el bundle del frontend; este
// script corre fuera de ese bundle (GitHub Actions), así que se duplica a mano.
// IMPORTANTE: si cambian los niveles/bonos en assets/js/config.js, replicar el
// cambio acá también.

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

export function getCashBonuses(agency) {
    return agency === 'usa' ? cashBonusesUSA : cashBonuses;
}

export const requirements = {
    cashBonus:   { minHours: 15, minDays: 7 },
    diamondPrize: { minHours: 90, minDays: 22, maxBattles: 500 },
};

/**
 * Calcula el objetivo más relevante para mostrar en el mensaje de progreso.
 * Devuelve un string corto en texto plano, listo para la variable {{6}} del template.
 */
export function computeNextObjective({ diamonds, validDays, liveHours, agency }) {
    const tiers = visualTiers;
    let curIdx = -1;
    for (let i = tiers.length - 1; i >= 0; i--) {
        if (diamonds >= tiers[i].range) { curIdx = i; break; }
    }
    const nextTier = curIdx + 1 < tiers.length ? tiers[curIdx + 1] : null;

    if (nextTier) {
        const missing = nextTier.range - diamonds;
        return `Te faltan ${missing.toLocaleString('es')} 💎 para llegar a ${nextTier.name}.`;
    }

    const bonuses = getCashBonuses(agency);
    const meetsHours = liveHours >= requirements.cashBonus.minHours;
    const meetsDays  = validDays >= requirements.cashBonus.minDays;
    if (meetsHours && meetsDays) {
        return '¡Ya cumplís los requisitos del bono en efectivo de este nivel! 🎉';
    }
    const missingHours = Math.max(0, requirements.cashBonus.minHours - liveHours);
    const missingDays  = Math.max(0, requirements.cashBonus.minDays - validDays);
    const parts = [];
    if (missingDays > 0)  parts.push(`${missingDays} día${missingDays !== 1 ? 's' : ''} válido${missingDays !== 1 ? 's' : ''}`);
    if (missingHours > 0) parts.push(`${missingHours.toFixed(1)}h de LIVE`);
    return parts.length
        ? `Te faltan ${parts.join(' y ')} para el bono en efectivo de este nivel.`
        : 'Seguí así para mantener tu nivel este período.';
}
