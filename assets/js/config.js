/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║             INTERACTIK CREATOR ELEVATE · CONFIGURACIÓN           ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Este es el ÚNICO archivo donde se definen los niveles y bonos.  ║
 * ║  Modifica aquí para que los cambios se reflejen en toda la app.  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ─────────────────────────────────────────────────────────────────────
// 1. RANGOS VISUALES (Nombre y emoji de cada nivel — solo decorativo)
//    range = diamantes mínimos necesarios para ESTAR en ese rango
// ─────────────────────────────────────────────────────────────────────
export const visualTiers = [
    { level: 1, range: 0, emoji: '🔰', name: 'Novato' },
    { level: 2, range: 40000, emoji: '🟤', name: 'Bronce' },
    { level: 3, range: 80000, emoji: '⚪', name: 'Plata' },
    { level: 4, range: 150000, emoji: '🟡', name: 'Oro' },
    { level: 5, range: 300000, emoji: '🩵', name: 'Diamante' },
    { level: 6, range: 500000, emoji: '💎', name: 'Platino' },
    { level: 7, range: 800000, emoji: '🔼', name: 'Ascendente' },
    { level: 8, range: 1200000, emoji: '👑', name: 'Élite' },
    { level: 9, range: 1600000, emoji: '🌟', name: 'Referente' },
    { level: 10, range: 3000000, emoji: '⚡', name: 'Interactik' },
];

// ─────────────────────────────────────────────────────────────────────
// 2. BONO EN EFECTIVO (USD)
//    Requisitos para cobrarlo: h ≥ 15  AND  días ≥ 7
//    range   = diamantes mínimos del mes ACTUAL para estar en este nivel
//    subio   = bono si el creador SUPERÓ su nivel del mes anterior
//    mantiene = bono si MANTIENE el mismo nivel que el mes anterior
//    baja    = bono si BAJÓ de nivel (siempre 0 — no cobra)
// ─────────────────────────────────────────────────────────────────────
export const cashBonuses = [
    { level: 'Nivel 1', range: 80000, subio: 30, mantiene: 15, baja: 0 },
    { level: 'Nivel 2', range: 150000, subio: 60, mantiene: 30, baja: 0 },
    { level: 'Nivel 3', range: 300000, subio: 110, mantiene: 55, baja: 0 },
    { level: 'Nivel 4', range: 500000, subio: 190, mantiene: 95, baja: 0 },
    { level: 'Nivel 5', range: 800000, subio: 300, mantiene: 150, baja: 0 },
    { level: 'Nivel 6', range: 1200000, subio: 450, mantiene: 225, baja: 0 },
    { level: 'Nivel 7', range: 1600000, subio: 600, mantiene: 300, baja: 0 },
];

// ─────────────────────────────────────────────────────────────────────
// 3. PREMIO EN DIAMANTES
//    Requisitos para cobrarlo: h ≥ 90  AND  días ≥ 22
//    range   = diamantes mínimos del mes ACTUAL para este nivel
//    reward  = diamantes base del premio
//    Extra por partidas: +10% por cada 100 partidas (máx. 500 partidas → +50%)
// ─────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────
// 4. SUSCRIPCIÓN INTERACTIK (gratis)
//    El creador la recibe si cumple AMBAS condiciones este mes:
// ─────────────────────────────────────────────────────────────────────
export const subscriptionRequirements = {
    minDays: 15,      // días activos mínimos
    minDiamonds: 80000,   // diamantes mínimos del mes
};

// ─────────────────────────────────────────────────────────────────────
// 5. REQUISITOS GENERALES (no cambiar salvo instrucción explícita)
// ─────────────────────────────────────────────────────────────────────
export const requirements = {
    cashBonus: {
        minHours: 15,   // horas mínimas de LIVE
        minDays: 7,    // días activos mínimos
    },
    diamondPrize: {
        minHours: 90,   // horas mínimas de LIVE
        minDays: 22,   // días activos mínimos
        maxBattles: 500, // partidas máximas contadas para el bonus
    },
};
