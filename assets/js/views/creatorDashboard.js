// v2
import { store } from '../store.js';
import { isSupabaseConfigured } from '../supabase.js';
import { visualTiers, cashBonuses, diamondRewards, requirements, getCashBonuses } from '../config.js';
import { auth, push, metrics, whatsapp } from '../api.js';
import { t, getLang } from '../i18n.js';
import { appState } from '../main.js';
import { env, isWhatsappConfigured } from '../env.js';


export function getIdx(d, tiers) {
    for (let i = tiers.length - 1; i >= 0; i--) if (d >= tiers[i].range) return i;
    return -1;
}
export function parseHours(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    str = String(str);
    const h = (str.match(/(\d+)h/)   || [0,0])[1];
    const m = (str.match(/(\d+)min/) || [0,0])[1];
    const s = (str.match(/(\d+)s/)   || [0,0])[1];
    return +h + +m/60 + +s/3600;
}
export function fmt(n) { return Number(n).toLocaleString('es'); }
function levelClass(n) { return `lv${Math.min(n, 10)}`; }
function daysLeft() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth()+1, 0).getDate() - now.getDate();
}
export function daysElapsed() {
    return new Date().getDate();
}
function renderTier(tier, size='1.1rem') {
    if (tier.icon) {
        return `<img src="${tier.icon}" alt="${tier.name}" style="width:${size};height:${size};vertical-align:middle;margin-right:0.3rem;object-fit:contain;">`;
    }
    return `<span style="margin-right:0.3rem;">${tier.emoji}</span>`;
}
export function daysInMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
}
// Tarjeta destacada de "objetivo/bono" — arriba del todo del dashboard, visible
// sin tener que entrar a la pestaña Objetivos. Reutiliza los mismos cálculos
// de tabGoals (cashAmt, meetsCash, currCashIdx, etc.), no duplica la lógica de
// negocio, solo decide CUÁL de los objetivos ya calculados destacar y cómo.
function renderIncentiveHero({ me, h, dy, dLeft, meetsCash, currCashIdx, lastMonthIdx, trend, agencyCashBonuses, nextTier, curTier }) {
    const { minHours: cashH, minDays: cashDy } = requirements.cashBonus;
    let kicker, big, sub, icon, accent, urgent;

    if (currCashIdx < 0) {
        // Todavía no llega al primer nivel de bono en efectivo
        const first = agencyCashBonuses[0];
        icon = '💵'; accent = '#00d9a6';
        kicker = '¡NO TE PIERDAS TU BONO!';
        big = `$${first.mantiene}`;
        sub = `Te faltan ${fmt(Math.max(0, first.range - me.diamonds))} 💎 para desbloquearlo`;
        urgent = dLeft <= 7;
    } else if (!meetsCash && trend !== 'baja') {
        // Ya tiene el nivel de diamantes, le faltan horas/días para activarlo
        const tierC = agencyCashBonuses[currCashIdx];
        const potential = trend === 'subio' ? tierC.subio : tierC.mantiene;
        const missingH = Math.max(0, cashH - h);
        const missingDy = Math.max(0, cashDy - dy);
        const parts = [];
        if (missingDy > 0) parts.push(`${missingDy} día${missingDy !== 1 ? 's' : ''}`);
        if (missingH > 0) parts.push(`${missingH.toFixed(1)}h de LIVE`);
        icon = '💵'; accent = '#00d9a6';
        kicker = '¡NO TE PIERDAS TU BONO!';
        big = `$${potential}`;
        sub = parts.length ? `Te faltan ${parts.join(' y ')} para activarlo` : '¡Ya casi lo tenés!';
        urgent = dLeft <= 7;
    } else if (meetsCash && nextTier) {
        // Bono asegurado este mes — empujar al próximo nivel
        icon = '🚀'; accent = '#7c6ef7';
        kicker = '¡BONO ASEGURADO! SEGUÍ ASÍ';
        big = `${fmt(nextTier.range - me.diamonds)} 💎`;
        sub = `para alcanzar ${nextTier.name}`;
        urgent = false;
    } else if (nextTier) {
        icon = '🎯'; accent = '#ffb547';
        kicker = 'TU PRÓXIMO OBJETIVO';
        big = `${fmt(nextTier.range - me.diamonds)} 💎`;
        sub = `para alcanzar ${nextTier.name}`;
        urgent = dLeft <= 7;
    } else {
        icon = '🏆'; accent = '#00d9a6';
        kicker = '¡NIVEL MÁXIMO!';
        big = curTier.name;
        sub = 'Sos de los mejores creadores de la agencia';
        urgent = false;
    }

    return `
        <div class="glass-panel incentive-hero animate-fadeIn${urgent ? ' incentive-hero--urgent' : ''}" style="position:relative;overflow:hidden;padding:1.2rem 1.35rem;margin-bottom:1rem;border-color:${accent}55;background:linear-gradient(135deg,${accent}17,transparent 65%);">
            <div class="incentive-hero__glow" style="--glow-color:${accent};"></div>
            <div style="position:relative;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
                <div style="font-size:2rem;line-height:1;filter:drop-shadow(0 0 8px ${accent}66);flex-shrink:0;">${icon}</div>
                <div style="flex:1;min-width:190px;">
                    <div style="font-size:0.66rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${accent};margin-bottom:0.2rem;display:flex;align-items:center;gap:0.4rem;">
                        ${urgent ? `<span class="incentive-hero__dot" style="--glow-color:${accent};"></span>` : ''}${kicker}
                    </div>
                    <div class="incentive-hero__number" style="font-size:clamp(1.5rem,6vw,2.1rem);font-weight:900;line-height:1.1;color:#fff;">${big}</div>
                    <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.15rem;">${sub}</div>
                </div>
                <button class="btn btn-sm incentive-hero__cta" data-goto-tab="goals" style="flex-shrink:0;background:${accent};color:#04150a;font-weight:800;white-space:nowrap;">Ver objetivos</button>
            </div>
        </div>`;
}

// Resuelve la fila de creator_metrics que corresponde al usuario actual (o a
// targetUsername en modo auditoría/vista previa): primero por tiktok_id
// estable, luego por username normalizado. Compartido con otras vistas que
// necesitan "mis métricas" sin reimplementar el matching (ej. creatorGoals.js).
export function resolveMe(data, targetUsername, isAuditing) {
    const myUsername = (targetUsername || store.getProfile?.()?.tiktok_username || store.getCurrentUser()?.username || '').toLowerCase();
    const cleanMatch = (u) => String(u || '').trim().toLowerCase().replace(/^@/, '');
    const searchName = cleanMatch(myUsername);
    const profileTiktokId = isAuditing ? null : (store.getProfile?.()?.tiktok_id || null);
    const me = data?.find(c =>
        (profileTiktokId && c.tiktokId && profileTiktokId === c.tiktokId) ||
        cleanMatch(c.username) === searchName
    );
    return { me, myUsername };
}

export function getPaceData(currentDiamonds, lastMonthDiamonds) {
    const elapsed  = daysElapsed();
    const totalDays = daysInMonth();
    // Approximate last month as same number of days
    const lastDays  = 31;
    const rateThis  = elapsed > 0 ? currentDiamonds / elapsed : 0;
    const rateLast  = lastMonthDiamonds > 0 ? lastMonthDiamonds / lastDays : 0;
    const proj      = Math.round(rateThis * totalDays);
    const paceRatio = rateLast > 0 ? (rateThis / rateLast) * 100 : 0;
    const status    = paceRatio >= 105 ? 'ahead' : paceRatio >= 85 ? 'on-track' : 'behind';
    return { rateThis: Math.round(rateThis), rateLast: Math.round(rateLast), proj, paceRatio: Math.round(paceRatio), status };
}
function pBar(val, max, color='linear-gradient(90deg,var(--primary),var(--secondary))', leftLabel=null, rightLabel=null) {
    const p     = Math.min(100, max > 0 ? (val / max) * 100 : 0);
    const pFill = Math.min(98, p);
    const dotColorMatch = color.match(/,(#[0-9a-f]{3,8}|rgba?\([^)]+\)|var\([^)]+\))\s*\)$/i);
    const dotColor = dotColorMatch ? dotColorMatch[1].trim() : 'var(--primary)';
    const lLabel = leftLabel ?? fmt(val);
    const rLabel = rightLabel ?? fmt(max);

    return `
        <div style="margin:0.5rem 0 0.25rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                <span style="font-size:0.68rem;color:var(--text-muted);">${lLabel}</span>
                <span style="font-size:0.68rem;font-weight:700;color:var(--primary-light);">${p.toFixed(0)}%</span>
            </div>
            <!-- Track: padding lateral da espacio al dot sin clipear -->
            <div style="position:relative;padding:4px 6px;">
                <div style="height:6px;border-radius:999px;background:rgba(255,255,255,0.08);position:relative;">
                    <!-- Fill con shimmer contenido -->
                    <div style="height:100%;width:${pFill}%;background:${color};border-radius:999px;overflow:hidden;position:relative;transition:width 0.6s cubic-bezier(0.4,0,0.2,1);">
                        <div style="position:absolute;top:0;left:0;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.28),transparent);animation:pbar-shine 2.4s ease-in-out infinite;border-radius:999px;"></div>
                    </div>
                    <!-- Dot fuera del fill para evitar clipping -->
                    ${p > 0 ? `<div style="position:absolute;top:50%;left:calc(${pFill}% - 5px);width:11px;height:11px;border-radius:50%;background:${dotColor};border:2px solid #0a0b0f;box-shadow:0 0 8px ${dotColor};animation:dot-glow 2s ease-in-out infinite;transform:translateY(-50%);"></div>` : ''}
                </div>
            </div>
            <div style="text-align:right;margin-top:0.1rem;">
                <span style="font-size:0.65rem;color:var(--text-muted);">${rLabel}</span>
            </div>
        </div>`;
}

// ── Tab rendering ──────────────────────────────────────────────────────────
function tabMetrics(me, lastMonthTier, pace, dLeft) {
    const statusColor = pace.status==='ahead'?'var(--accent)':pace.status==='on-track'?'var(--warning)':'var(--danger)';
    const statusIcon  = pace.status==='ahead'?'🔥':pace.status==='on-track'?'✓':'⚠';
    const statusText  = pace.status==='ahead'?'Vas mejor que el mes pasado':pace.status==='on-track'?'Vas al ritmo del mes pasado':'Vas por debajo del mes pasado';
    const h = parseHours(me.liveDuration);
    const dLast = me.diamondsLastMonth || 0;
    return `
        <!-- Nivel (basado en mes anterior) -->
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;flex-wrap:wrap;">
            <span class="level-badge ${levelClass(lastMonthTier.level)}">${renderTier(lastMonthTier, '1.2rem')} ${lastMonthTier.name}</span>
            <span class="text-xs text-muted">Rango del mes anterior</span>
        </div>

        <!-- Ritmo diario: comparativa honesta vs mes anterior -->
        <div class="glass-panel" style="padding:1rem 1.2rem;margin-bottom:1.25rem;background:${statusColor === 'var(--accent)' ? 'rgba(0,217,166,0.06)' : statusColor === 'var(--warning)' ? 'rgba(255,181,71,0.06)' : 'rgba(255,85,105,0.06)'};border-color:${statusColor}33;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem;">
                <div>
                    <div style="font-weight:700;font-size:0.88rem;color:${statusColor};">${statusIcon} ${statusText}</div>
                    <div class="text-xs text-muted" style="margin-top:0.2rem;">Día ${daysElapsed()} de ${daysInMonth()} · ${Math.round(daysElapsed()/daysInMonth()*100)}% del mes transcurrido</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-family:var(--font-display);font-size:1.2rem;font-weight:800;color:${statusColor};">${pace.paceRatio > 0 ? (pace.paceRatio >= 100 ? '+' : '') + (pace.paceRatio - 100) : 0}%</div>
                    <div class="text-xs text-muted">de ritmo</div>
                </div>
            </div>
            <!-- Daily rates -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:0.75rem;">
                <div style="background:rgba(255,255,255,0.04);border-radius:var(--radius-sm);padding:0.5rem 0.75rem;">
                    <div class="text-xs text-muted">Ritmo este mes</div>
                    <div style="font-weight:700;font-size:0.95rem;color:${statusColor};">${fmt(pace.rateThis)} 💎/día</div>
                </div>
                <div style="background:rgba(255,255,255,0.04);border-radius:var(--radius-sm);padding:0.5rem 0.75rem;">
                    <div class="text-xs text-muted">Ritmo mes anterior</div>
                    <div style="font-weight:700;font-size:0.95rem;color:var(--text-secondary);">${fmt(pace.rateLast)} 💎/día</div>
                </div>
            </div>
            <!-- Projection bar -->
            <div style="display:flex;justify-content:space-between;margin-bottom:0.3rem;">
                <span class="text-xs text-muted">Progreso del mes</span>
                <span class="text-xs fw-700" style="color:var(--text-secondary);">${Math.round(daysElapsed()/daysInMonth()*100)}%</span>
            </div>
            <div class="progress-track" style="margin-bottom:0.5rem;">
                <div style="height:100%;width:${Math.round(daysElapsed()/daysInMonth()*100)}%;background:rgba(255,255,255,0.15);border-radius:999px;"></div>
            </div>
            <div class="text-xs text-muted" style="text-align:right;">📈 Estimación al cierre: ~${fmt(pace.proj)} 💎 (si mantiene el ritmo)</div>
        </div>

        <div class="metrics-grid stagger">
            <div class="glass-panel metric-card">
                <div class="metric-left">
                    <div class="metric-title">Diamantes este mes</div>
                    <div class="metric-value text-gradient">${fmt(me.diamonds)}</div>
                    <div class="metric-subtitle" style="color:var(--text-muted);">⏮ Mes anterior: <strong style="color:var(--text-secondary);">${fmt(dLast)}</strong> ${me.diamonds>=dLast?'📈':'📉'}</div>
                </div>
                <div class="metric-icon-box" style="background:rgba(124,110,247,0.12);">💎</div>
            </div>
            <div class="glass-panel metric-card">
                <div class="metric-left">
                    <div class="metric-title">Días activos válidos</div>
                    <div class="metric-value">${me.validDays}</div>
                    <div class="metric-subtitle" style="color:${me.validDays>=22?'var(--accent)':me.validDays>=7?'var(--warning)':'var(--danger)'};">
                        ${me.validDays>=22?'✅ Desafío élite cumplido':me.validDays>=7?`✓ Activo · ${22-me.validDays} días para el máximo`:`Necesitas ${7-me.validDays} días más`}
                    </div>
                </div>
                <div class="metric-icon-box" style="background:rgba(244,113,181,0.12);">📅</div>
            </div>
            <div class="glass-panel metric-card">
                <div class="metric-left">
                    <div class="metric-title">Horas de LIVE</div>
                    <div class="metric-value sm">${me.liveDuration}</div>
                    <div class="metric-subtitle" style="color:${h>=90?'var(--accent)':h>=15?'var(--warning)':'var(--danger)'};">
                        ${h>=90?'✅ Desafío élite cumplido':h>=15?`✓ Activo · ${(90-h).toFixed(1)}h para el máximo`:`Faltan ${(15-h).toFixed(1)}h para activar bonos`}
                    </div>
                </div>
                <div class="metric-icon-box" style="background:rgba(0,217,166,0.12);">⏱️</div>
            </div>
            <div class="glass-panel metric-card">
                <div class="metric-left">
                    <div class="metric-title">Partidas / PKs</div>
                    <div class="metric-value">${me.battles}</div>
                    <div class="metric-subtitle" style="color:${me.battles>=100?'var(--gold)':'var(--text-muted)'};">
                        ${me.battles>=100?`🎉 +${Math.floor(me.battles/100)*10}% bono por batallas`:`Con ${100-me.battles} partidas más: +10% extra`}
                    </div>
                </div>
                <div class="metric-icon-box" style="background:rgba(255,181,71,0.12);">⚔️</div>
            </div>
        </div>`;
}

// Notación compacta (69.958 -> "69.9k") para chips angostos donde el número
// completo no entra o distrae del punto (cuánto falta), no del valor exacto.
function fmtCompact(n) {
    if (n >= 1000000) { const v = Math.floor(n / 100000) / 10; return (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + 'M'; }
    if (n >= 1000)    { const v = Math.floor(n / 100) / 10;    return (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + 'k'; }
    return String(n);
}
// Barra de progreso fina sin labels (van en la fila statRow de arriba) — para
// listas compactas de requisitos (Premio en Diamantes, Suscripción).
function miniBar(value, max, color) {
    const p = Math.min(100, max > 0 ? (value / max) * 100 : 0);
    return `<div style="height:4px;border-radius:999px;background:rgba(255,255,255,0.07);overflow:hidden;margin-bottom:0.65rem;">
        <div style="height:100%;width:${p}%;background:${color};border-radius:999px;transition:width 0.5s ease;"></div>
    </div>`;
}
// Fila label+valor de una línea (icono + texto a la izquierda, valor +
// estado a la derecha) — reemplaza los checklists verbosos de 2 líneas.
function statRow(icon, label, valueText, deltaText, deltaColor) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;margin-bottom:0.3rem;">
        <div style="display:flex;align-items:center;gap:0.4rem;font-size:0.78rem;color:var(--text-secondary);"><span>${icon}</span>${label}</div>
        <div style="font-size:0.78rem;text-align:right;white-space:nowrap;">
            <strong style="color:var(--text-primary);">${valueText}</strong>
            ${deltaText ? ` <span style="color:${deltaColor};font-weight:700;">${deltaText}</span>` : ''}
        </div>
    </div>`;
}
// Chip/pill de requisito — para la fila de "Horas / Días / Nivel" del bono en
// efectivo. statusColor es un hex literal (no var()) porque se usa para
// derivar el fondo/borde translúcidos vía alpha hex.
function reqPill(icon, label, valueText, statusColor) {
    return `<div style="display:flex;align-items:center;gap:0.55rem;padding:0.6rem 0.9rem;border-radius:999px;background:${statusColor}1a;border:1px solid ${statusColor}55;flex:1;min-width:150px;">
        <span style="font-size:1rem;">${icon}</span>
        <div style="display:flex;flex-direction:column;line-height:1.25;min-width:0;">
            <span style="font-size:0.6rem;color:var(--text-muted);white-space:nowrap;">${label}</span>
            <span style="font-size:0.78rem;font-weight:800;color:${statusColor};white-space:nowrap;">${valueText}</span>
        </div>
    </div>`;
}

function tabGoals(me, h, dy, pct, curTier, nextTier, currCashIdx, lastMonthIdx, dLeft, proj, projStatus, cashAmt) {
    const agencyCashBonuses = getCashBonuses(me.agency);
    const advanceTarget = nextTier ? nextTier.range : me.diamonds;
    const dMissing = Math.max(0, advanceTarget - me.diamonds);

    // ── 1. Nivel / progreso de diamantes ──────────────────────────────────
    const levelCard = `
        <div class="glass-panel section-card" style="margin-bottom:0.85rem;border-left:3px solid var(--primary);${pct>=70&&nextTier?'border-color:rgba(255,181,71,0.25);border-left-color:var(--warning);':''}">
            <div class="section-header">
                <div class="section-icon" style="background:rgba(124,110,247,0.12);color:var(--primary);">💎</div>
                <div>
                    <h3 style="font-size:0.92rem;">${nextTier?`Subir a ${renderTier(nextTier, '1rem')} ${nextTier.name}`:'¡Nivel máximo!'}</h3>
                    <p class="text-xs text-muted">Nivel actual: ${renderTier(curTier, '0.85rem')} ${curTier.name} · Meta: ${fmt(advanceTarget)} 💎</p>
                </div>
            </div>
            ${pBar(me.diamonds, advanceTarget)}
            <p class="text-sm mt-1" style="color:${pct>=70?'var(--warning)':'var(--text-secondary)'};">
                ${nextTier?(pct>=95?`🔥 ¡Solo ${fmt(dMissing)} 💎 para subir a ${nextTier.name}!`:pct>=70?`¡Casi! Faltan ${fmt(dMissing)} 💎.`:projStatus==='ahead'?`🔥 Buen ritmo. Faltan ${fmt(dMissing)} 💎.`:projStatus==='on-track'?`Al ritmo actual puedes llegar. Faltan ${fmt(dMissing)} 💎.`:`⚠ Necesitas ${fmt(dMissing)} 💎 más. ¡Más LIVEs!`):'🏆 Eres de los mejores creadores.'}
            </p>
        </div>`;

    // ── 2. Bono en Efectivo USD ────────────────────────────────────────────
    const assignedTier  = lastMonthIdx >= 0 ? agencyCashBonuses[lastMonthIdx] : null;
    const reqMaintains  = assignedTier ? me.diamonds >= assignedTier.range : true;
    const reqH15 = h>=requirements.cashBonus.minHours, reqDy7 = dy>=requirements.cashBonus.minDays, reqTier = currCashIdx>=0;
    const cashOk = reqH15 && reqDy7 && reqTier && reqMaintains;

    // Inspiring contextual message based on pace + progress
    const diamMissing = assignedTier ? Math.max(0, assignedTier.range - me.diamonds) : 0;
    const rateThis    = dLeft > 0 && me.diamonds > 0 ? me.diamonds / (dLeft + (31 - dLeft)) : 0;
    const daysToReach = rateThis > 0 && diamMissing > 0 ? Math.ceil(diamMissing / rateThis) : 0;
    let inspireMsg;
    if (cashOk) {
        inspireMsg = projStatus==='ahead'
            ? `🔥 ¡Imparable! Llevas un ritmo increíble este mes. ¡El bono es tuyo si mantienes el nivel!`
            : projStatus==='on-track'
            ? `✨ ¡Vas perfecto! Mantén el ritmo y el bono está asegurado al cierre del mes.`
            : `💪 Ya tienes el bono activo. ¡Con unos LIVEs más esta semana lo consolidas!`;
    } else if (!reqMaintains) {
        inspireMsg = projStatus==='ahead'
            ? `⚡ ¡Tu ritmo diario es excelente! Faltan solo ${fmt(diamMissing)} 💎 para activar el bono.${daysToReach>0&&daysToReach<=dLeft?` Al paso actual, lo logras en ~${daysToReach} días.`:' ¡Puedes lograrlo!'}`
            : projStatus==='on-track'
            ? `🌟 Vas bien encaminado. Faltan ${fmt(diamMissing)} 💎. Unos LIVEs más y activas el bono.`
            : dLeft > 15
            ? `🎯 El mes aún tiene ${dLeft} días. Incrementa tus transmisiones y el bono es alcanzable.`
            : `⚡ ¡Cada LIVE cuenta! Faltan ${fmt(diamMissing)} 💎. ¡Da todo esta semana!`;
    } else {
        inspireMsg = `💡 Completa las horas y días de transmisión para desbloquear tu bono en efectivo.`;
    }
    const nextTierIdx = currCashIdx >= lastMonthIdx ? currCashIdx + 1 : lastMonthIdx;
    const nextTargetTier = nextTierIdx >= 0 && nextTierIdx < agencyCashBonuses.length ? agencyCashBonuses[nextTierIdx] : agencyCashBonuses[0];
    const vizMax = nextTargetTier.range;
    const curPct = Math.min(98, (me.diamonds / vizMax) * 100);
    const dotColor = reqMaintains ? 'var(--accent)' : 'var(--warning)';
    const progressChart = `
        <div style="margin:1rem 0 0.25rem;">
            <!-- Track -->
            <div style="height:6px;border-radius:999px;background:rgba(255,255,255,0.08);position:relative;overflow:visible;">
                <div style="height:100%;width:${curPct}%;background:linear-gradient(90deg,var(--primary),${dotColor});border-radius:999px;position:relative;">
                    <div style="position:absolute;right:-5px;top:50%;transform:translateY(-50%);width:12px;height:12px;border-radius:50%;background:${dotColor};border:2px solid #0e0e14;box-shadow:0 0 8px ${dotColor};"></div>
                </div>
            </div>
            <!-- Two-label row: no overlap possible -->
            <div style="display:flex;justify-content:space-between;margin-top:0.55rem;">
                <div>
                    <div style="font-size:0.75rem;font-weight:700;color:${dotColor};">${fmt(me.diamonds)} 💎</div>
                    <div style="font-size:0.63rem;color:var(--text-muted);">Hoy</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.75rem;font-weight:700;color:${reqMaintains?'var(--accent)':'rgba(255,255,255,0.55)'};">${fmt(vizMax)} 💎</div>
                    <div style="font-size:0.63rem;color:var(--text-muted);">${reqMaintains ? 'Meta alcanzada' : 'Meta del nivel'}</div>
                </div>
            </div>
        </div>`;

    const cashCard = `
        <div class="glass-panel section-card" style="margin-bottom:0.85rem;background:${cashOk?'rgba(0,217,166,0.04)':'rgba(255,181,71,0.03)'};border-left:3px solid ${cashOk?'var(--accent)':'var(--warning)'};">
            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.15rem;">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <div class="section-icon" style="background:rgba(0,217,166,0.1);">💵</div>
                    <div>
                        <h3 style="font-size:0.92rem;">Bono en Efectivo (USD)</h3>
                        <p class="text-xs text-muted">Req: ${requirements.cashBonus.minHours}h · ${requirements.cashBonus.minDays} días · Mantener nivel asignado</p>
                    </div>
                </div>
                ${(() => {
                    // Bonus amounts based on currently reached level (currCashIdx) or assigned level
                    const bonusIfMaintains = lastMonthIdx >= 0 ? agencyCashBonuses[lastMonthIdx].mantiene : null;

                    // bonusIfNextTier is calculated dynamically based on the NEXT tier above their currently reached tier
                    const nextTierIdxForBonus = currCashIdx >= lastMonthIdx ? currCashIdx + 1 : lastMonthIdx + 1;
                    const nextAboveAssigned = nextTierIdxForBonus < agencyCashBonuses.length ? agencyCashBonuses[nextTierIdxForBonus] : null;
                    const bonusIfNextTier   = nextAboveAssigned ? nextAboveAssigned.subio : null;

                    // Tile helper: el destacado ("si subís") se ve más grande e
                    // iluminado a propósito — es el número que más motiva, no el
                    // que ya está asegurado.
                    const tile = (label, amount, highlight) => `
                        <div style="text-align:center;padding:0.4rem 0.7rem;border-radius:var(--radius-sm);flex-shrink:0;${highlight
                            ? 'background:linear-gradient(135deg,rgba(255,181,71,0.22),rgba(255,181,71,0.05));border:1px solid rgba(255,181,71,0.45);box-shadow:0 0 16px rgba(255,181,71,0.18);'
                            : 'background:rgba(255,255,255,0.03);border:1px solid transparent;'}">
                            <div style="font-size:0.58rem;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;color:${highlight ? 'var(--gold)' : 'var(--text-muted)'};margin-bottom:0.2rem;white-space:nowrap;">${label}</div>
                            <div style="font-size:${highlight ? '1.4rem' : '0.95rem'};font-weight:${highlight ? 900 : 700};line-height:1;color:${highlight ? 'var(--gold)' : 'var(--text-secondary)'};">$${amount}</div>
                        </div>`;

                    if (cashOk) {
                        // Already earning — show current (small) + what they'd get if they go up (big)
                        return `<div style="display:flex;align-items:stretch;gap:0.45rem;flex-shrink:0;">
                            ${tile('Asegurado', cashAmt, false)}
                            ${bonusIfNextTier ? tile('🚀 Si subís', bonusIfNextTier, true) : ''}
                        </div>`;
                    } else if (bonusIfMaintains !== null) {
                        // Not yet earning — retention target (small) vs. level-up upside (big)
                        return `<div style="display:flex;align-items:stretch;gap:0.45rem;flex-shrink:0;">
                            ${tile('Mantenés', bonusIfMaintains, false)}
                            ${bonusIfNextTier ? tile('🚀 Si subís', bonusIfNextTier, true) : ''}
                        </div>`;
                    } else {
                        // Below first tier — nunca estuvo en ese nivel (ni este mes ni
                        // el pasado), así que alcanzarlo siempre es una SUBIDA, nunca
                        // un "mantener" (no se puede mantener un nivel que no se tenía).
                        return `<div style="flex-shrink:0;">
                            ${tile(`Al llegar a ${fmt(agencyCashBonuses[0].range)} 💎`, agencyCashBonuses[0].subio, true)}
                        </div>`;
                    }
                })()}
            </div>


            <!-- Progress chart -->
            ${progressChart}

            <!-- Inspiring message -->
            <div style="background:rgba(255,255,255,0.04);border-radius:var(--radius-sm);padding:0.6rem 0.8rem;margin-bottom:0.75rem;">
                <p class="text-sm" style="color:${cashOk?'var(--accent)':projStatus==='ahead'||projStatus==='on-track'?'var(--warning)':'var(--text-secondary)'};">${inspireMsg}</p>
            </div>

            <!-- Requisitos (chips compactos) -->
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem;">
                ${reqPill(reqH15?'✅':'⏱️', 'Horas LIVE', `${h.toFixed(1)}h / ${requirements.cashBonus.minHours}h`, reqH15?'#00d9a6':'#ffb547')}
                ${reqPill(reqDy7?'✅':'📅', 'Días activos', `${dy} / ${requirements.cashBonus.minDays} días`, reqDy7?'#00d9a6':'#ffb547')}
                ${assignedTier ? reqPill('📈', 'Nivel Mínimo', `${fmtCompact(me.diamonds)} / ${fmtCompact(assignedTier.range)}`, '#7c6ef7') : ''}
            </div>
        </div>`;


    // ── 3. Premio en Diamantes ─────────────────────────────────────────────
    const reqH90 = h>=requirements.diamondPrize.minHours, reqDy22 = dy>=requirements.diamondPrize.minDays;
    const diamOk = reqH90 && reqDy22;
    const maxBattlesCfg = requirements.diamondPrize.maxBattles;
    const battleBonus = Math.floor(Math.min(me.battles, maxBattlesCfg) / 100) * 10;
    const nextBattleMilestone = me.battles < maxBattlesCfg
        ? (Math.floor(me.battles / 100) + 1) * 100
        : maxBattlesCfg;

    // Estimated diamond prize at current level
    const diamIdx = getIdx(me.diamonds, diamondRewards);
    const estimatedBase = diamIdx >= 0 ? diamondRewards[diamIdx].reward : null;
    const estimatedTotal = estimatedBase ? Math.round(estimatedBase * (1 + battleBonus / 100)) : null;

    const diamCard = `
        <div class="glass-panel section-card" style="margin-bottom:0.85rem;background:rgba(0,217,166,0.03);border-left:3px solid var(--accent);">
            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.85rem;">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <div class="section-icon" style="background:rgba(0,217,166,0.12);color:var(--accent);">💎</div>
                    <div>
                        <h3 style="font-size:0.92rem;">Premio en Diamantes</h3>
                        <p class="text-xs text-muted">Requisitos: <strong style="color:var(--accent);">${requirements.diamondPrize.minHours}h</strong> · <strong style="color:var(--accent);">${requirements.diamondPrize.minDays} días activos</strong></p>
                    </div>
                </div>
                ${estimatedTotal !== null ? `
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:0.62rem;color:var(--text-muted);margin-bottom:0.1rem;">${diamOk ? 'Premio estimado' : 'Objetivo'}</div>
                    <div style="font-size:1.1rem;font-weight:800;color:${diamOk ? 'var(--accent)' : 'rgba(0,217,166,0.55)'};">${fmt(estimatedTotal)} 💎</div>
                    ${battleBonus > 0 ? `<div style="font-size:0.62rem;color:var(--gold);">+${battleBonus}% por batallas</div>` : ''}
                </div>` : ''}
            </div>

            ${statRow('🕐', 'Horas LIVE', `${h.toFixed(1)}h / ${requirements.diamondPrize.minHours}h`, reqH90 ? '✓' : `(Faltan ${(requirements.diamondPrize.minHours - h).toFixed(1)}h)`, reqH90 ? 'var(--accent)' : 'var(--text-muted)')}
            ${miniBar(h, requirements.diamondPrize.minHours, reqH90 ? 'linear-gradient(90deg,var(--accent),#00b891)' : 'linear-gradient(90deg,var(--primary),var(--secondary))')}

            ${statRow('📅', 'Días Activos', `${dy} / ${requirements.diamondPrize.minDays}`, reqDy22 ? '✓' : `(Faltan ${requirements.diamondPrize.minDays - dy})`, reqDy22 ? 'var(--accent)' : 'var(--text-muted)')}
            ${miniBar(dy, requirements.diamondPrize.minDays, reqDy22 ? 'linear-gradient(90deg,var(--accent),#00b891)' : 'linear-gradient(90deg,var(--secondary),#c026d3)')}

            ${statRow('⚔️', 'Batallas', `${me.battles} / ${maxBattlesCfg}`, battleBonus > 0 ? `+${battleBonus}% Premio` : `(A las ${nextBattleMilestone} bonificás)`, battleBonus > 0 ? 'var(--gold)' : 'var(--text-muted)')}
            ${miniBar(me.battles, maxBattlesCfg, 'linear-gradient(90deg,var(--warning),#f97316)')}

            <div style="display:flex;align-items:center;gap:0.5rem;background:rgba(255,255,255,0.03);border-radius:var(--radius-sm);padding:0.55rem 0.75rem;margin-top:0.5rem;font-size:0.76rem;color:${diamOk ? 'var(--accent)' : 'var(--text-muted)'};">
                <span>${diamOk ? '✅' : '🔒'}</span>
                <span>${diamOk
                    ? `¡Premio desbloqueado! ${battleBonus > 0 ? `Con el +${battleBonus}% de batallas recibís ${fmt(estimatedTotal)} 💎.` : `Recibís ${fmt(estimatedBase)} 💎.`}`
                    : 'Completa las horas y días solicitados para desbloquear tu Premio en Diamantes.'}</span>
            </div>
        </div>`;

    // La tarjeta "Suscripción Interactik App" (umbral fijo 15 días+80K 💎,
    // sin conexión real a ningún backend) se retiró — reemplazada por la
    // integración real con Magic By Loxhias (ver app/dashboard/perfiles de
    // Magic y creatorGoals.js#renderMagicSection acá), que sí otorga/revoca
    // una suscripción de verdad según nivel de diamantes mes a mes.

    const urgencyBanner = dLeft<=7?`
        <div style="background:linear-gradient(135deg,rgba(255,181,71,0.15),rgba(244,113,181,0.1));border:1px solid rgba(255,181,71,0.35);border-radius:var(--radius-md);padding:0.9rem 1.1rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.75rem;">
            <span style="font-size:1.4rem;">⏰</span>
            <div><div style="font-weight:700;font-size:0.88rem;color:var(--warning);">¡Solo quedan ${dLeft} días del mes!</div>
            <div class="text-sm" style="color:var(--text-secondary);">Revisa los requisitos pendientes y actúa ahora.</div></div>
        </div>`:'';

    return urgencyBanner + levelCard + cashCard + diamCard;
}


function tabBenefits(me, _hLast, _dyLast, cashAmtLast, diamAmtLast, trendLast, meetsCashLast, meetsDiamLast, lastCashIdx) {
    // hLast y dyLast no existen en la BD — se ignoran y se infiere desde diamondsLastMonth
    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthName = lastMonthDate.toLocaleString('es', { month: 'long', year: 'numeric' });

    const noBenefits = cashAmtLast === 0 && diamAmtLast === 0;

    function benefitRow(icon, label, value, earned, note = '') {
        return `
            <div class="glass-panel section-card" style="margin-bottom:0.75rem;background:${earned ? 'rgba(0,217,166,0.04)' : 'rgba(255,255,255,0.02)'};${!earned ? 'opacity:0.65;' : ''}">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <div class="section-icon" style="background:${earned ? 'rgba(0,217,166,0.12)' : 'rgba(255,255,255,0.05)'};">${icon}</div>
                        <div>
                            <div style="font-weight:700;font-size:0.9rem;">${label}</div>
                            ${note ? `<div class="text-xs text-muted" style="margin-top:0.15rem;">${note}</div>` : ''}
                        </div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:1.15rem;font-weight:800;color:${earned ? 'var(--accent)' : 'var(--text-muted)'};">${value}</div>
                        <div style="font-size:0.62rem;margin-top:0.1rem;">
                            ${earned
                                ? `<span style="background:rgba(0,217,166,0.15);color:var(--accent);border-radius:999px;padding:0.1rem 0.5rem;font-weight:700;">✓ Recibido</span>`
                                : `<span style="background:rgba(255,255,255,0.06);color:var(--text-muted);border-radius:999px;padding:0.1rem 0.5rem;">No cobrado</span>`}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    return `
        <!-- Header: closed month -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
            <div>
                <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);">Beneficios del mes vencido</div>
                <div style="font-size:1rem;font-weight:800;color:var(--text-primary);margin-top:0.15rem;">${lastMonthName.charAt(0).toUpperCase() + lastMonthName.slice(1)}</div>
            </div>
            ${!noBenefits ? `
            <div style="background:linear-gradient(135deg,rgba(0,217,166,0.15),rgba(124,110,247,0.1));border:1px solid rgba(0,217,166,0.25);border-radius:999px;padding:0.3rem 0.9rem;font-size:0.72rem;font-weight:700;color:var(--accent);">
                ✓ Con beneficios
            </div>` : `
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:999px;padding:0.3rem 0.9rem;font-size:0.72rem;font-weight:700;color:var(--text-muted);">
                Sin beneficios
            </div>`}
        </div>

        <!-- Summary strip -->
        <div class="glass-panel" style="padding:1rem 1.2rem;margin-bottom:1rem;background:linear-gradient(135deg,rgba(124,110,247,0.08),rgba(244,113,181,0.05));border-color:rgba(124,110,247,0.2);">
            <div class="text-xs fw-700" style="color:var(--primary-light);margin-bottom:0.5rem;">💰 RESUMEN DEL MES ANTERIOR</div>
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
                <div>
                    <div class="text-xs text-muted">Bono Efectivo</div>
                    <div style="font-weight:800;color:${cashAmtLast>0?'var(--accent)':'var(--text-muted)'};">$${cashAmtLast} USD</div>
                </div>
                <div>
                    <div class="text-xs text-muted">Premio Diamantes</div>
                    <div style="font-weight:800;color:${diamAmtLast>0?'var(--primary-light)':'var(--text-muted)'};">${diamAmtLast>0?'+'+fmt(diamAmtLast):'0'} 💎</div>
                </div>
            </div>
        </div>

        <!-- Individual benefit cards -->
        ${benefitRow('💵', 'Bono en Efectivo (USD)',
            `$${cashAmtLast} USD`,
            cashAmtLast > 0,
            cashAmtLast > 0
                ? `${trendLast === 'subio' ? '🎉 Subiste de nivel — bono potenciado' : 'Mantuviste tu nivel del mes anterior'}`
                : meetsCashLast === false
                    ? 'No cumpliste las horas o días requeridos'
                    : 'Bajaste de nivel — bono no aplicó'
        )}

        ${benefitRow('💎', 'Premio en Diamantes',
            diamAmtLast > 0 ? `+${fmt(diamAmtLast)} 💎` : '0 💎',
            diamAmtLast > 0,
            diamAmtLast > 0
                ? `Base + bonus por batallas incluido`
                : 'No se alcanzaron 90h de LIVE y 22 días activos'
        )}

        <div style="margin-top:0.75rem;padding:0.65rem 0.9rem;background:rgba(255,255,255,0.03);border-radius:var(--radius-sm);border-left:3px solid rgba(124,110,247,0.4);">
            <p class="text-xs text-muted">Los beneficios se calculan al cierre del mes y se pagan en los primeros días del mes siguiente. Los valores mostrados corresponden al desempeño del mes anterior.</p>
        </div>`;
}

// ── Daily tracker helpers ──────────────────────────────────────────────────
function dtKey(uid, ym) { return `dt_${uid || 'anon'}_${ym}`; }
function currentYM() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

function loadDt(uid) {
    const key = dtKey(uid, currentYM());
    try { return { entries: JSON.parse(localStorage.getItem(key) || '{}'), key }; }
    catch { return { entries: {}, key }; }
}

function dtTotals(entries) {
    const vals = Object.values(entries);
    return {
        validDays: vals.filter(e => e.streamed).length,
        diamonds:  vals.reduce((s, e) => s + (Number(e.diamonds) || 0), 0),
        minutes:   vals.reduce((s, e) => s + (Number(e.minutes)  || 0), 0),
    };
}

function minsToHM(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${h}:${String(m).padStart(2,'0')}`;
}

function renderDailyTracker(placeholder, uid, mode) {
    if (!placeholder) return;

    const diamGoal = mode === 'missions'
        ? Math.ceil(20000 / daysInMonth())
        : Math.ceil(80000 / daysInMonth());
    const minsGoal = mode === 'missions' ? 60 : 180;

    const today = todayISO();
    const { entries, key } = loadDt(uid);
    const todayE = entries[today] || null;
    const totals = dtTotals(entries);

    const dayFmt = (iso) => new Date(iso + 'T12:00:00')
        .toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });

    const logDays = Object.entries(entries)
        .filter(([d]) => d !== today)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 7);

    const hitDiam  = (todayE?.diamonds || 0) >= diamGoal;
    const hitTime  = (todayE?.minutes  || 0) >= minsGoal;

    placeholder.innerHTML = `
        <div style="margin-top:1.25rem;padding-top:1.1rem;border-top:1px solid var(--glass-border);">
            <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:0.85rem;text-transform:uppercase;letter-spacing:0.07em;">📅 ${t('daily.section')}</div>

            <!-- Today card -->
            <div class="glass-panel" style="padding:1rem 1.1rem;margin-bottom:0.75rem;${todayE?.streamed ? 'border-color:rgba(0,217,166,0.3);background:rgba(0,217,166,0.04);' : ''}">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
                    <span style="font-size:0.82rem;font-weight:700;">${t('daily.today')} — ${dayFmt(today)}</span>
                    ${todayE ? `<span style="font-size:0.63rem;background:rgba(0,217,166,0.15);color:var(--accent);border-radius:999px;padding:0.15rem 0.55rem;font-weight:700;">✓ ${t('daily.saved')}</span>` : ''}
                </div>

                <label style="display:flex;align-items:center;gap:0.55rem;margin-bottom:0.75rem;cursor:pointer;">
                    <input type="checkbox" id="dt-streamed" ${todayE?.streamed ? 'checked' : ''}
                        style="width:17px;height:17px;accent-color:var(--accent);flex-shrink:0;cursor:pointer;">
                    <span style="font-size:0.82rem;">${t('daily.streamed')} <span style="color:var(--text-muted);font-size:0.72rem;">${t('daily.valid_note')}</span></span>
                </label>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:0.75rem;">
                    <div>
                        <label style="display:block;font-size:0.7rem;color:var(--text-muted);margin-bottom:0.3rem;">💎 ${t('daily.diamonds')}</label>
                        <input id="dt-diamonds" type="number" min="0" placeholder="ej: 1200"
                            value="${todayE?.diamonds || ''}"
                            class="input-control" style="padding:0.45rem 0.6rem;font-size:0.82rem;">
                        <div style="font-size:0.62rem;margin-top:0.25rem;color:${hitDiam ? 'var(--accent)' : 'var(--text-muted)'};">
                            ${t('daily.goal')}: ${fmt(diamGoal)} 💎${hitDiam ? ' ✅' : ''}
                        </div>
                    </div>
                    <div>
                        <label style="display:block;font-size:0.7rem;color:var(--text-muted);margin-bottom:0.3rem;">⏱ ${t('daily.time')}</label>
                        <div style="display:flex;align-items:center;gap:0.3rem;">
                            <input id="dt-time-h" type="number" min="0" max="99" placeholder="0"
                                value="${todayE?.minutes ? Math.floor(todayE.minutes / 60) : ''}"
                                class="input-control" inputmode="numeric" style="width:2.9rem;text-align:center;padding:0.45rem 0.3rem;font-size:0.82rem;">
                            <span style="font-size:1rem;font-weight:800;color:var(--text-secondary);flex-shrink:0;">:</span>
                            <input id="dt-time-m" type="number" min="0" max="59" placeholder="00"
                                value="${todayE?.minutes ? (todayE.minutes % 60) : ''}"
                                class="input-control" inputmode="numeric" style="width:2.9rem;text-align:center;padding:0.45rem 0.3rem;font-size:0.82rem;">
                        </div>
                        <div style="font-size:0.62rem;margin-top:0.25rem;color:${hitTime ? 'var(--accent)' : 'var(--text-muted)'};">
                            ${t('daily.goal')}: ${minsToHM(minsGoal)}${hitTime ? ' ✅' : ''}
                        </div>
                    </div>
                </div>

                <div id="dt-error" style="margin-bottom:0.5rem;color:var(--danger);font-size:0.72rem;display:none;"></div>

                <div style="display:flex;gap:0.5rem;">
                    <button id="dt-save" class="btn btn-primary" style="flex:1;padding:0.5rem 0.6rem;font-size:0.78rem;">
                        ${todayE ? t('daily.update_day') : t('daily.save_day')}
                    </button>
                </div>
            </div>

            <!-- Accumulated totals (only if there are entries) -->
            ${totals.validDays > 0 ? `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-bottom:0.75rem;">
                <div class="glass-panel" style="padding:0.6rem 0.5rem;text-align:center;">
                    <div style="font-size:1.1rem;font-weight:800;">${totals.validDays}</div>
                    <div style="font-size:0.6rem;color:var(--text-muted);">${t('daily.valid_days')}</div>
                </div>
                <div class="glass-panel" style="padding:0.6rem 0.5rem;text-align:center;">
                    <div style="font-size:1rem;font-weight:800;color:var(--primary-light);">${fmt(totals.diamonds)}</div>
                    <div style="font-size:0.6rem;color:var(--text-muted);">💎 total</div>
                </div>
                <div class="glass-panel" style="padding:0.6rem 0.5rem;text-align:center;">
                    <div style="font-size:1.1rem;font-weight:800;color:var(--accent);">${minsToHM(totals.minutes)}</div>
                    <div style="font-size:0.6rem;color:var(--text-muted);">${t('daily.live')}</div>
                </div>
            </div>` : ''}

            <!-- Log of past days -->
            ${logDays.length > 0 ? `
            <div style="font-size:0.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;">${t('daily.past')}</div>
            <div style="display:flex;flex-direction:column;gap:0.3rem;">
                ${logDays.map(([d, e]) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0.75rem;background:rgba(255,255,255,0.02);border:1px solid var(--glass-border);border-radius:var(--radius-sm);">
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <span>${e.streamed ? '✅' : '⬜'}</span>
                            <span style="font-size:0.72rem;color:var(--text-secondary);">${dayFmt(d)}</span>
                        </div>
                        <div style="display:flex;gap:0.75rem;font-size:0.68rem;color:var(--text-muted);">
                            ${e.diamonds ? `<span>${fmt(e.diamonds)} 💎</span>` : ''}
                            ${e.minutes  ? `<span>${minsToHM(e.minutes)}</span>` : ''}
                        </div>
                    </div>`).join('')}
            </div>` : ''}
        </div>
    `;

    const errDiv = placeholder.querySelector('#dt-error');

    placeholder.querySelector('#dt-save')?.addEventListener('click', () => {
        const streamed = placeholder.querySelector('#dt-streamed').checked;
        const diamonds = Number(placeholder.querySelector('#dt-diamonds').value) || 0;
        const dtH      = Number(placeholder.querySelector('#dt-time-h').value) || 0;
        const dtM      = Number(placeholder.querySelector('#dt-time-m').value) || 0;

        if (dtM > 59) {
            errDiv.textContent = t('daily.time_err');
            errDiv.style.display = 'block';
            return;
        }
        const minutes = dtH * 60 + dtM;
        errDiv.style.display = 'none';
        entries[today] = { streamed, diamonds, minutes };
        localStorage.setItem(key, JSON.stringify(entries));
        renderDailyTracker(placeholder, uid, mode);
    });

}

// ── Missions tab (new creators ≤ 30 days, with grace period) ──────────────
function tabMissions(me) {
    const m1 = me.validDays >= 5;
    const m2 = me.battles   >= 10;
    const m3 = me.diamonds  >= 20000;
    const allDone = m1 && m2 && m3;

    function mRow(icon, label, barVal, barMax, done, lLabel, rLabel) {
        return `
            <div class="glass-panel" style="margin-bottom:0.75rem;padding:1rem 1.1rem;${done ? 'border-color:rgba(0,217,166,0.35);background:rgba(0,217,166,0.04);' : ''}">
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
                    <div style="width:34px;height:34px;border-radius:50%;background:${done ? 'rgba(0,217,166,0.15)' : 'rgba(255,255,255,0.05)'};display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">${done ? '✅' : icon}</div>
                    <div style="flex:1;font-weight:700;font-size:0.88rem;">${label}</div>
                    ${done ? `<span style="font-size:0.68rem;background:rgba(0,217,166,0.15);color:var(--accent);border-radius:999px;padding:0.2rem 0.65rem;font-weight:700;flex-shrink:0;">✓ Lista</span>` : ''}
                </div>
                ${pBar(barVal, barMax,
                    done ? 'linear-gradient(90deg,var(--primary),var(--accent))' : 'linear-gradient(90deg,var(--primary),var(--secondary))',
                    lLabel, rLabel)}
            </div>`;
    }

    return `
        <div style="margin-bottom:1rem;">
            <div style="font-size:1rem;font-weight:800;margin-bottom:0.2rem;">🚀 Misiones del Mes</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">Completa los 3 retos para ganar la Insignia Galaxy. Se restablecen con cada reporte mensual.</div>
        </div>

        ${allDone ? `
        <div style="display:flex;align-items:center;gap:0.75rem;padding:1rem 1.2rem;background:linear-gradient(135deg,rgba(124,110,247,0.15),rgba(0,217,166,0.1));border:1px solid rgba(124,110,247,0.3);border-radius:var(--radius-md);margin-bottom:1rem;">
            <div style="font-size:2.2rem;">🌌</div>
            <div>
                <div style="font-weight:800;font-size:1.05rem;background:linear-gradient(135deg,var(--primary-light),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">¡Insignia Galaxy desbloqueada!</div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem;">Completaste las 3 misiones del mes. ¡Eres una estrella del equipo!</div>
            </div>
        </div>` : ''}

        ${mRow('📅', 'Días de transmisión activos', Math.min(me.validDays, 5), 5, m1, `${me.validDays} días`, '5 días')}
        ${mRow('⚔️', 'Partidas / PKs este mes',    Math.min(me.battles, 10),   10, m2, `${me.battles}`,       '10')}
        ${mRow('💎', 'Diamantes acumulados',         Math.min(me.diamonds, 20000), 20000, m3, fmt(me.diamonds), fmt(20000))}

        ${!allDone ? `
        <div style="padding:0.75rem 1rem;background:rgba(255,255,255,0.03);border-radius:var(--radius-sm);border-left:3px solid rgba(124,110,247,0.4);margin-top:0.25rem;">
            <p style="font-size:0.73rem;color:var(--text-muted);">Las misiones se renuevan con cada reporte mensual. ¡Completa las 3 para desbloquear la Insignia Galaxy 🌌!</p>
        </div>` : ''}

        <div id="dt-missions"></div>`;
}

// ── Reto 90 días (growing creators 30-90 days) ─────────────────────────────
function tabChallenge90(me, h, dy) {
    const c1 = me.diamonds >= 80000;
    const c2 = me.battles  >= 100;
    const c3 = dy          >= 22;
    const c4 = h           >= 90;
    const allDone = c1 && c2 && c3 && c4;
    const completedCount = [c1, c2, c3, c4].filter(Boolean).length;

    function cRow(icon, label, barVal, barMax, done, lLabel, rLabel) {
        return `
            <div class="glass-panel" style="margin-bottom:0.75rem;padding:1rem 1.1rem;${done ? 'border-color:rgba(255,181,71,0.35);background:rgba(255,181,71,0.04);' : ''}">
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
                    <div style="width:34px;height:34px;border-radius:50%;background:${done ? 'rgba(255,181,71,0.15)' : 'rgba(255,255,255,0.05)'};display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">${done ? '✅' : icon}</div>
                    <div style="flex:1;font-weight:700;font-size:0.88rem;">${label}</div>
                    ${done ? `<span style="font-size:0.68rem;background:rgba(255,181,71,0.15);color:var(--warning);border-radius:999px;padding:0.2rem 0.65rem;font-weight:700;flex-shrink:0;">✓ Logrado</span>` : ''}
                </div>
                ${pBar(barVal, barMax,
                    done ? 'linear-gradient(90deg,var(--warning),#f97316)' : 'linear-gradient(90deg,rgba(255,181,71,0.55),var(--warning))',
                    lLabel, rLabel)}
            </div>`;
    }

    return `
        <div style="margin-bottom:1rem;">
            <div style="font-size:1rem;font-weight:800;margin-bottom:0.2rem;">🏆 Reto de 90 Días</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">Alcanza los 4 objetivos para convertirte en Creador Maduro del equipo.</div>
        </div>

        <!-- Progress overview -->
        <div class="glass-panel" style="padding:0.85rem 1.1rem;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;">
            <div>
                <div style="font-size:0.68rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Progreso general</div>
                <div style="font-size:1.3rem;font-weight:800;color:${allDone ? 'var(--warning)' : 'var(--text-primary)'};">${completedCount} / 4 objetivos</div>
            </div>
            <div style="font-size:1.8rem;">${allDone ? '🏆' : completedCount >= 3 ? '🔥' : completedCount >= 2 ? '💪' : '⚡'}</div>
        </div>

        ${allDone ? `
        <div style="display:flex;align-items:center;gap:0.75rem;padding:1rem 1.2rem;background:linear-gradient(135deg,rgba(255,181,71,0.12),rgba(244,113,181,0.06));border:1px solid rgba(255,181,71,0.4);border-radius:var(--radius-md);margin-bottom:1rem;">
            <div style="font-size:2.2rem;">🏆</div>
            <div>
                <div style="font-weight:800;font-size:1.05rem;color:var(--warning);">¡Creador Maduro!</div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem;">Superaste el reto de 90 días y eres parte del equipo consolidado de la agencia.</div>
            </div>
        </div>` : ''}

        ${cRow('💎', 'Diamantes acumulados',          Math.min(me.diamonds, 80000), 80000, c1, fmt(me.diamonds)+' 💎', fmt(80000)+' 💎')}
        ${cRow('⚔️', 'Partidas / PKs mensuales',       Math.min(me.battles, 100),   100,   c2, me.battles+' partidas', '100 partidas')}
        ${cRow('📅', 'Días válidos de transmisión',    Math.min(dy, 22),             22,    c3, dy+' días',             '22 días')}
        ${cRow('⏱️', 'Horas de LIVE',                  Math.min(h, 90),              90,    c4, h.toFixed(1)+'h',       '90h')}

        ${!allDone ? `
        <div style="padding:0.75rem 1rem;background:rgba(255,255,255,0.03);border-radius:var(--radius-sm);border-left:3px solid rgba(255,181,71,0.4);margin-top:0.25rem;">
            <p style="font-size:0.73rem;color:var(--text-muted);">Supera los 4 objetivos en un mismo mes para obtener el estatus de <strong style="color:var(--warning);">Creador Maduro</strong> 🏆</p>
        </div>` : ''}

        <div id="dt-challenge"></div>`;
}

// ── Main render ────────────────────────────────────────────────────────────

export async function renderCreatorDashboard(container, targetUsername = null) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:20px;width:200px;border-radius:999px;margin-bottom:1rem;"></div>
            <div class="skel-panel" style="height:62px;margin-bottom:1rem;"></div>
            <div class="skel-panel" style="height:90px;margin-bottom:1.25rem;"></div>
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

    if (isSupabaseConfigured) {
        await store.refreshMetrics().catch(() => {});
    }

    const data = store.getMetricsData();
    const user = store.getCurrentUser();

    // Si hay targetUsername, estamos en "Modo Auditoría"
    const isAuditing = !!targetUsername;
    const { me, myUsername } = resolveMe(data, targetUsername, isAuditing);

    if (!me) {
        container.innerHTML = emptyState(
            !isAuditing ? 'Tus métricas aún no están disponibles' : `No se encontraron métricas para @${myUsername}`,
            !isAuditing
                ? 'El administrador carga los datos mensualmente. Si ya empezaste a hacer lives, volvé a revisar cuando tu período sea procesado.'
                : 'Este creador aún no tiene métricas cargadas para el período actual.'
        );
        return;
    }

    // Calculations
    const h  = parseHours(me.liveDuration);
    const dy = me.validDays;
    const dLast = me.diamondsLastMonth || 0;

    // ── Tier logic ────────────────────────────────────────────────────────
    // Assigned level = based on LAST month's diamonds (this is the official rank)
    const curTierIdx  = Math.max(0, getIdx(dLast, visualTiers));
    const curTier     = visualTiers[curTierIdx];
    // Next tier = what they must reach THIS month to go up a rank
    const nextTier    = curTierIdx + 1 < visualTiers.length ? visualTiers[curTierIdx + 1] : null;

    // Tabla de bonos según agencia del creador
    const agencyCashBonuses = getCashBonuses(me.agency);

    // Cash bonus tier indexes (for subio / mantiene / baja logic)
    const lastMonthIdx  = Math.max(-1, getIdx(dLast, agencyCashBonuses));
    const currCashIdx   = getIdx(me.diamonds, agencyCashBonuses);
    const trend = currCashIdx > lastMonthIdx ? 'subio'
                : currCashIdx < lastMonthIdx ? 'baja'
                : 'mantiene';

    // Progress toward next visual tier (from assigned level upward)
    // Target = the threshold of the next tier above their assigned level
    const advanceTarget = nextTier ? nextTier.range : curTier.range;
    const pct = advanceTarget > 0
        ? Math.min(100, (me.diamonds / advanceTarget) * 100)
        : 100;


    // Projection: pace-based comparison vs last month
    const pace = getPaceData(me.diamonds, dLast);

    // ── Bonus calculation (exact match to reference) ──────────────────────
    const { minHours: cashH, minDays: cashDy } = requirements.cashBonus;
    const { minHours: diamH, minDays: diamDy, maxBattles } = requirements.diamondPrize;

    // Cash bonus: requires h >= cashH, dy >= cashDy, currCashIdx >= 0
    let cashAmt = 0;
    if (h >= cashH && dy >= cashDy && currCashIdx >= 0) {
        const tierC = agencyCashBonuses[currCashIdx];
        cashAmt = trend === 'subio' ? tierC.subio
                : trend === 'mantiene' ? tierC.mantiene
                : 0; // baja → no bonus
    }
    const meetsCash = cashAmt > 0;

    // Diamond award: requires h >= diamH, dy >= diamDy
    let diamAmt = 0;
    const meetsDiam = h >= diamH && dy >= diamDy;
    if (meetsDiam) {
        const i = getIdx(me.diamonds, diamondRewards);
        if (i >= 0) {
            const base = diamondRewards[i].reward;
            const battles = Math.min(me.battles, maxBattles);
            const extra = Math.round(base * (Math.floor(battles / 100) * 0.1));
            diamAmt = base + extra;
        }
    }

    const dLeft = daysLeft();

    const profile = store.getProfile?.();
    let dsj = null;
    if (profile?.joining_date) {
        const jDate = new Date(profile.joining_date);
        const today = new Date();
        const diffTime = today - jDate;
        dsj = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    } else {
        dsj = me.daysSinceJoining != null ? Number(me.daysSinceJoining) : null;
    }

    const isAdmin       = store.getCurrentUser()?.role === 'admin';
    // Misiones y Reto 90d habilitados para creadores nuevos (<90 días o sin fecha de ingreso cargada)
    const showMissions  = dsj == null || dsj < 90;
    const showChallenge = dsj == null || dsj < 90;

    // Estimated earnings: $1 per 200 diamonds
    const DIAMONDS_PER_USD = 200;
    const estimatedEarnings = (me.diamonds / DIAMONDS_PER_USD).toFixed(2);
    const now = new Date();
    const monthName = now.toLocaleString(getLang() === 'en' ? 'en' : 'es', { month: 'long' });
    const year = now.getFullYear();

    // ── "Potencial" del header: si este mes llega al próximo nivel, sus
    // propias ganancias de TikTok a ESE nivel + el bono en efectivo que
    // desbloquearía (mismo cash-bonus-por-nivel-anterior que cashCard más
    // abajo, en tabGoals). Es el número que más motiva — por eso va grande y
    // destacado en el header, mientras que lo ya ganado hoy queda chico
    // (dashboard de incentivos: importa lo que falta, no lo ya hecho).
    const potentialTarget      = nextTier ? nextTier.range : curTier.range;
    const potentialOwnEarnings = potentialTarget / DIAMONDS_PER_USD;
    const nextTierIdxForBonus  = currCashIdx >= lastMonthIdx ? currCashIdx + 1 : lastMonthIdx + 1;
    const potentialCashBonus   = nextTierIdxForBonus < agencyCashBonuses.length ? agencyCashBonuses[nextTierIdxForBonus].subio : null;
    const potentialTotal       = potentialOwnEarnings + (potentialCashBonus || 0);
    const potentialDiamIdx     = getIdx(potentialTarget, diamondRewards);
    const potentialDiamPrize   = potentialDiamIdx >= 0 ? diamondRewards[potentialDiamIdx].reward : null;
    const hasUpside            = potentialTarget > me.diamonds || (potentialCashBonus || 0) > cashAmt;
    // Si ya no hay upside (tope real superado), mostrar el total REAL de este
    // mes (ganancias + bono ya asegurado), no el del umbral del tier — que
    // podría quedar más bajo que lo ya ganado.
    const realTotal = Number(estimatedEarnings) + cashAmt;

    // Inject shell with tab nav
    container.innerHTML = `
        <!-- Brand line / Back Button -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
            <span style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;color:var(--text-muted);text-transform:uppercase;">Interactik Agency · Creator Elevate</span>
            ${isAuditing ? `<button id="back-to-list" class="btn btn-sm" style="padding:0.4rem 0.8rem;font-size:0.7rem;background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);">← Volver al Listado</button>` : ''}
        </div>

        <!-- Header: perfil + ganancias potenciales (fusionados — dashboard de incentivos, el número grande es el que motiva) -->
        <div class="glass-panel animate-fadeIn" style="position:relative;overflow:hidden;padding:1.1rem 1.3rem;margin-bottom:1rem;border-color:${hasUpside ? 'rgba(255,181,71,0.35)' : 'rgba(0,217,166,0.3)'};background:${hasUpside ? 'linear-gradient(135deg,rgba(255,181,71,0.07),rgba(255,85,105,0.03))' : 'linear-gradient(135deg,rgba(0,217,166,0.07),rgba(124,110,247,0.04))'};">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:0.85rem;min-width:0;">
                    <div style="position:relative;flex-shrink:0;">
                        <div id="creator-avatar" style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:800;overflow:hidden;position:relative;border:2px solid rgba(0,217,166,0.3);">
                            <span id="creator-avatar-initial" style="position:absolute;">${me.username ? me.username.charAt(0).toUpperCase() : '?'}</span>
                            <img
                                id="creator-avatar-img"
                                src="https://unavatar.io/tiktok/${encodeURIComponent(me.username)}"
                                alt="@${me.username}"
                                style="width:100%;height:100%;object-fit:cover;border-radius:50%;position:absolute;top:0;left:0;opacity:0;transition:opacity 0.3s ease;"
                                referrerpolicy="no-referrer"
                                onload="this.style.opacity='1';document.getElementById('creator-avatar-initial').style.opacity='0';"
                                onerror="this.style.display='none';"
                            />
                        </div>
                        <div style="position:absolute;bottom:-3px;right:-6px;background:var(--primary);color:#fff;font-size:0.58rem;font-weight:800;padding:0.1rem 0.4rem;border-radius:999px;border:2px solid var(--bg-surface);white-space:nowrap;line-height:1.3;">LVL ${curTier.level}</div>
                    </div>
                    <div style="min-width:0;">
                        <div style="display:flex;align-items:center;gap:0.3rem;font-weight:700;font-size:0.9rem;color:var(--text-primary);">
                            <span style="overflow:hidden;text-overflow:ellipsis;">@${me.username}</span>
                            ${profile?.whatsapp_number ? `<span title="WhatsApp verificado" style="color:#25d366;font-size:0.75rem;flex-shrink:0;">✓</span>` : ''}
                        </div>
                        <div style="font-size:0.67rem;color:var(--text-muted);white-space:nowrap;">Ganancias actuales: <strong style="color:var(--text-secondary);">$${Number(estimatedEarnings).toLocaleString('es',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> · ${monthName.charAt(0).toUpperCase()+monthName.slice(1)} ${year}</div>
                    </div>
                </div>

                <div style="text-align:right;flex-shrink:0;">
                    ${hasUpside ? `
                    <div style="font-size:0.66rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:var(--gold);margin-bottom:0.1rem;">📣 Tu potencial ${nextTier ? `si llegás a ${nextTier.name}` : 'este mes'}</div>
                    <div style="font-size:clamp(1.7rem,6vw,2.3rem);font-weight:900;line-height:1;background:linear-gradient(135deg,#ffb547,#ff5569);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 14px rgba(255,181,71,0.3));">$${fmt(potentialTotal)}</div>
                    <div style="font-size:0.65rem;color:var(--text-secondary);margin-top:0.2rem;">${fmt(potentialTarget)} 💎 (~$${fmt(potentialOwnEarnings)})${potentialCashBonus ? ` + $${potentialCashBonus} bono en efectivo` : ''}</div>
                    ${potentialDiamPrize ? `<div style="font-size:0.6rem;color:var(--text-muted);margin-top:0.1rem;">Y hasta ${fmt(potentialDiamPrize)} 💎 de premio cumpliendo objetivos de nivel</div>` : ''}
                    ` : `
                    <div style="font-size:0.66rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:var(--accent);margin-bottom:0.1rem;">🏆 ¡Ya estás en tu tope de este mes!</div>
                    <div style="font-size:clamp(1.7rem,6vw,2.3rem);font-weight:900;line-height:1;background:linear-gradient(135deg,#00d9a6,#7c6ef7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">$${fmt(realTotal)}</div>
                    <div style="font-size:0.65rem;color:var(--text-secondary);margin-top:0.2rem;">Sos de los mejores creadores de la agencia.</div>
                    `}
                </div>
            </div>
        </div>

        ${(!isAuditing && dsj != null && dsj > 90 && dLast < 50000 && (me.agency || 'latam') === 'latam') ? `
        <div class="glass-panel animate-fadeIn" style="padding:1.1rem 1.2rem;margin-bottom:1rem;background:linear-gradient(135deg,rgba(255,85,105,0.08),rgba(255,181,71,0.04));border-color:rgba(255,85,105,0.35);">
            <div style="display:flex;align-items:start;gap:0.85rem;">
                <div style="font-size:1.5rem;line-height:1;">⚠️</div>
                <div>
                    <div style="font-weight:700;font-size:0.87rem;color:var(--danger);margin-bottom:0.3rem;">Rendimiento bajo</div>
                    <div style="font-size:0.73rem;color:var(--text-muted);line-height:1.5;">
                        Tu rendimiento del mes anterior fue de <strong style="color:var(--text-secondary);">${fmt(dLast)} 💎</strong>, por debajo del mínimo de <strong style="color:var(--text-secondary);">50.000 💎</strong> requerido. Si no mejorás tu rendimiento en el próximo período podés ser removido de la agencia.
                    </div>
                </div>
            </div>
        </div>
        ` : ''}

        ${(!isAuditing && user?.role === 'creator' && !profile?.joining_date) ? `
        <div id="joining-date-banner" class="glass-panel animate-fadeIn" style="padding:1.2rem;margin-bottom:1rem;background:linear-gradient(135deg,rgba(255,181,71,0.08),rgba(124,110,247,0.05));border-color:rgba(255,181,71,0.3);position:relative;">
            <div style="display:flex;align-items:start;gap:0.85rem;flex-wrap:wrap;">
                <div style="font-size:1.8rem;line-height:1;">📅</div>
                <div style="flex:1;min-width:240px;">
                    <div style="font-weight:700;font-size:0.88rem;color:var(--warning);margin-bottom:0.25rem;">Completa tu Fecha de Ingreso</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);line-height:1.4;margin-bottom:0.85rem;">
                        Para poder habilitar tus **Misiones de Inicio** y el **Reto de 90 Días**, necesitamos saber cuándo te uniste a la agencia.
                    </div>
                    <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
                        <input type="date" id="banner-date-input" class="input-control" style="padding:0.4rem 0.6rem;font-size:0.75rem;width:auto;min-width:140px;background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);color:#fff;border-radius:var(--radius-sm);">
                        <button id="banner-save-btn" class="btn btn-sm btn-primary" style="padding:0.45rem 1rem;font-size:0.72rem;font-weight:700;">Activar Retos</button>
                    </div>
                </div>
            </div>
        </div>
        ` : ''}

        ${(!isAuditing && user?.role === 'creator' && isWhatsappConfigured) ? `
        <div class="glass-panel section-card animate-fadeIn" style="margin-bottom:0.85rem;background:rgba(37,211,102,0.04);border-color:rgba(37,211,102,0.25);">
            <div style="display:flex;align-items:center;gap:0.85rem;flex-wrap:wrap;">
                <div style="font-size:1.6rem;line-height:1;">💬</div>
                <div style="flex:1;min-width:220px;">
                    ${profile?.whatsapp_number ? `
                        <div style="font-weight:700;font-size:0.87rem;color:#25d366;margin-bottom:0.2rem;">✓ WhatsApp conectado</div>
                        <div style="font-size:0.72rem;color:var(--text-muted);">Te vamos a mandar tu progreso y objetivos por acá.</div>
                    ` : `
                        <div style="font-weight:700;font-size:0.87rem;margin-bottom:0.2rem;">Seguimiento por WhatsApp</div>
                        <div style="font-size:0.72rem;color:var(--text-muted);line-height:1.5;">Conectá tu WhatsApp para recibir tu progreso, días válidos, horas, batallas y tus próximos objetivos. También podés preguntarle cosas de la agencia.</div>
                    `}
                </div>
                ${!profile?.whatsapp_number ? `<button id="wa-connect-btn" class="btn btn-sm" style="background:#25d366;color:#04150a;font-weight:700;flex-shrink:0;">Conectar WhatsApp</button>` : ''}
            </div>
        </div>
        ` : ''}


        ${!isAuditing ? renderIncentiveHero({ me, h, dy, dLeft, meetsCash, currCashIdx, lastMonthIdx, trend, agencyCashBonuses, nextTier, curTier }) : ''}

        <!-- Tab Nav -->
        <div id="creator-tabs" style="display:flex;gap:0.35rem;margin-bottom:1.25rem;background:rgba(0,0,0,0.25);border-radius:var(--radius-md);padding:0.3rem;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
            <button class="tab-btn active" data-tab="metrics"  style="flex-shrink:0;white-space:nowrap;">${t('tab.metrics')}</button>
            <button class="tab-btn"        data-tab="goals"    style="flex-shrink:0;white-space:nowrap;">${t('tab.goals')}</button>
            <button class="tab-btn"        data-tab="benefits" style="flex-shrink:0;white-space:nowrap;">${t('tab.benefits')}</button>
            ${showMissions  ? `<button class="tab-btn" data-tab="missions"  style="flex-shrink:0;white-space:nowrap;">${t('tab.missions')}</button>` : ''}
            ${showChallenge ? `<button class="tab-btn" data-tab="challenge" style="flex-shrink:0;white-space:nowrap;">${t('tab.challenge')}</button>` : ''}
            <button class="tab-btn" data-tab="inbox" style="flex-shrink:0;white-space:nowrap;">${t('tab.inbox')}</button>
        </div>

        <!-- Tab Content -->
        <div id="tab-content"></div>
    `;



    // Tab button styling (injected once)
    if (!document.getElementById('tab-styles')) {
        const s = document.createElement('style');
        s.id = 'tab-styles';
        s.textContent = `
            .tab-btn {
                background: transparent; border: none; color: var(--text-muted);
                font-family: var(--font-sans); font-size: 0.78rem; font-weight: 600;
                padding: 0.55rem 0.5rem; border-radius: var(--radius-sm);
                cursor: pointer; transition: all 0.22s ease; letter-spacing: 0.02em;
            }
            .tab-btn:hover { color: var(--text-secondary); background: rgba(255,255,255,0.04); }
            .tab-btn.active { background: linear-gradient(135deg, rgba(0,217,166,0.16), rgba(124,110,247,0.1)); color: var(--text-primary); box-shadow: 0 2px 10px rgba(0,217,166,0.12), inset 0 0 0 1px rgba(0,217,166,0.25); }
            #creator-tabs::-webkit-scrollbar { display: none; }
        `;
        document.head.appendChild(s);
    }

    const tabContent = container.querySelector('#tab-content');
    const tabs = { metrics: null, goals: null, benefits: null, missions: null, challenge: null, inbox: null };
    const inboxLastSeenKey = `inbox_last_seen_${user?.id || 'anon'}`;

    // ── Last month benefit calculation ────────────────────────────────────
    // Solo tenemos diamonds_last_month de la BD; horas y días del mes anterior
    // no están almacenados. Se asume que se cumplieron si los diamantes lo indican.
    const lastCashTierIdx = Math.max(-1, getIdx(dLast, agencyCashBonuses));
    const trendLast = trend;
    let cashAmtLast = 0;
    if (lastCashTierIdx >= 0) {
        const tier = agencyCashBonuses[lastCashTierIdx];
        cashAmtLast = trendLast === 'subio' ? tier.subio : trendLast === 'mantiene' ? tier.mantiene : 0;
    }
    let diamAmtLast = 0;
    const lastDiamIdx = getIdx(dLast, diamondRewards);
    if (lastDiamIdx >= 0) {
        const base = diamondRewards[lastDiamIdx].reward;
        const battlesLast = Math.min(me.battles ?? 0, maxBattles);
        const extra = Math.round(base * (Math.floor(battlesLast / 100) * 0.1));
        diamAmtLast = base + extra;
    }
    const meetsCashLast = cashAmtLast > 0;
    const meetsDiamLast = diamAmtLast > 0;

    function renderTab(name) {
        if (name === 'inbox') {
            tabContent.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">Cargando mensajes...</div>';
            const userId   = user?.id;
            const userRole = user?.role || 'creator';
            push.getForUser(userId, userRole).then(notifications => {
                const lastSeen = localStorage.getItem(inboxLastSeenKey) || '1970-01-01';
                localStorage.setItem(inboxLastSeenKey, new Date().toISOString());
                // Quitar badge del botón
                const inboxBtn = container.querySelector('[data-tab="inbox"]');
                if (inboxBtn) inboxBtn.innerHTML = t('tab.inbox');
                tabContent.innerHTML = `<div class="animate-fade-in">${renderInbox(notifications, lastSeen)}</div>`;
            }).catch(() => {
                tabContent.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger);font-size:0.85rem;">Error al cargar los mensajes.</div>';
            });
            return;
        }

        if (!tabs[name]) {
            if (name === 'metrics')   tabs[name] = tabMetrics(me, curTier, pace, dLeft);
            if (name === 'goals')     tabs[name] = tabGoals(me, h, dy, pct, curTier, nextTier, currCashIdx, lastMonthIdx, dLeft, pace.proj, pace.status, cashAmt);
            if (name === 'benefits')  tabs[name] = tabBenefits(me, null, null, cashAmtLast, diamAmtLast, trendLast, meetsCashLast, meetsDiamLast, lastCashTierIdx);
            if (name === 'missions')  tabs[name] = tabMissions(me);
            if (name === 'challenge') tabs[name] = tabChallenge90(me, h, dy);
        }
        tabContent.innerHTML = `<div class="animate-fade-in">${tabs[name]}</div>`;

        if (name === 'missions')  renderDailyTracker(tabContent.querySelector('#dt-missions'),  user?.id, 'missions');
        if (name === 'challenge') renderDailyTracker(tabContent.querySelector('#dt-challenge'), user?.id, 'challenge');

        push.getForUser(user.id, user.role || 'creator').then(notifications => {
            const lastSeen = localStorage.getItem(inboxLastSeenKey) || '1970-01-01';
            const unread = notifications.filter(n => n.sent_at > lastSeen).length;
            if (unread > 0) {
                const inboxBtn = container.querySelector('[data-tab="inbox"]');
                if (inboxBtn) inboxBtn.innerHTML = `${t('tab.inbox')} <span style="background:var(--danger);color:#fff;border-radius:999px;font-size:0.6rem;font-weight:800;padding:0.1rem 0.4rem;margin-left:0.2rem;vertical-align:middle;">${unread}</span>`;
            }
        }).catch(() => {});
    }

    // Manejar botón de volver
    container.querySelector('#back-to-list')?.addEventListener('click', () => {
        const role = store.getCurrentUser().role;
        if (role === 'manager') {
            import('./managerDashboard.js').then(m => m.renderManagerDashboard(container));
        } else {
            import('./adminDashboard.js').then(m => m.renderCreatorsList(container));
        }
    });

    // Reinsertar los escuchadores de clics de las pestañas
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTab(btn.dataset.tab);
        });
    });

    // Botón "Ver objetivos" del hero de incentivo → salta directo a la pestaña Objetivos
    container.querySelector('.incentive-hero__cta')?.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.dataset.gotoTab;
        const tabBtn = container.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
        if (!tabBtn) return;
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        renderTab(targetTab);
        tabBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });

    // Invocar la carga por defecto de la pestaña
    renderTab('metrics');

    // Manejar botón de guardar fecha del banner
    const bannerSaveBtn = container.querySelector('#banner-save-btn');
    const bannerDateInput = container.querySelector('#banner-date-input');
    if (bannerSaveBtn && bannerDateInput) {
        bannerSaveBtn.onclick = async () => {
            const dateVal = bannerDateInput.value;
            if (!dateVal) {
                appState.showToast('Por favor, selecciona una fecha válida.', 'warning');
                return;
            }
            bannerSaveBtn.disabled = true;
            bannerSaveBtn.textContent = 'Guardando...';
            try {
                await auth.updateOwnProfile({ joining_date: dateVal });
                await store.refreshProfile();
                appState.showToast('Fecha de ingreso guardada. ¡Retos activados!', 'success');
                // Recargar el dashboard
                renderCreatorDashboard(container, targetUsername);
            } catch (err) {
                console.error(err);
                appState.showToast('Error al guardar la fecha: ' + err.message, 'danger');
                bannerSaveBtn.disabled = false;
                bannerSaveBtn.textContent = 'Activar Retos';
            }
        };
    }

    // Conectar WhatsApp: pide un código y abre el chat de WhatsApp con ese código
    const waConnectBtn = container.querySelector('#wa-connect-btn');
    if (waConnectBtn) {
        waConnectBtn.onclick = async () => {
            waConnectBtn.disabled = true;
            waConnectBtn.textContent = 'Generando...';
            try {
                const { code } = await whatsapp.generateLinkCode();
                const text = encodeURIComponent(`Quiero conectar mi cuenta. Código: ${code}`);
                window.open(`https://wa.me/${env.WHATSAPP_BUSINESS_NUMBER}?text=${text}`, '_blank', 'noopener');
                appState.showToast('Mandá el mensaje que se abrió en WhatsApp para confirmar la conexión.', 'success');
            } catch (err) {
                appState.showToast('Error: ' + err.message, 'danger');
            } finally {
                waConnectBtn.disabled = false;
                waConnectBtn.textContent = 'Conectar WhatsApp';
            }
        };
    }
}


function renderSubmitMetricsView(container, prefill = null) {
    // Si no hay prefill (primera carga) y el creador no tiene username configurado → prompt
    if (!prefill) {
        const profile = store.getProfile?.();
        if (profile && !profile.tiktok_username?.trim()) {
            container.innerHTML = `
                <div class="glass-panel animate-fadeIn" style="max-width:480px;margin:2rem auto;text-align:center;padding:2.5rem 1.5rem;">
                    <div style="font-size:2.5rem;margin-bottom:1rem;">📋</div>
                    <h3 style="margin-bottom:0.6rem;">${t('metrics.no_username_title')}</h3>
                    <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:1.75rem;line-height:1.6;">
                        ${t('metrics.no_username_desc')}
                    </p>
                    <button id="go-profile-btn" class="btn btn-primary">${t('metrics.go_profile')}</button>
                </div>`;
            container.querySelector('#go-profile-btn')?.addEventListener('click', () => {
                document.querySelector('.nav-item[data-view="perfil"]')?.click();
            });
            return;
        }
    }

    const liveSecs        = Number(prefill?.liveSeconds ?? prefill?.live_seconds ?? 0);
    const prefillH        = prefill && liveSecs > 0 ? Math.floor(liveSecs / 3600) : '';
    const prefillM        = prefill && liveSecs > 0 ? Math.floor((liveSecs % 3600) / 60) : '';
    const prefillDays     = prefill ? (prefill.validDays ?? '') : '';
    const prefillDiamonds = prefill ? (prefill.diamonds ?? '') : '';

    // Calcular períodos de forma dinámica (mes actual y anterior)
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const curPeriodStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-01`;

    const prevDate = new Date(curYear, curMonth - 1, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth();
    const prevPeriodStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;

    const curLabel = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const prevLabel = prevDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    const curLabelCap = curLabel.charAt(0).toUpperCase() + curLabel.slice(1);
    const prevLabelCap = prevLabel.charAt(0).toUpperCase() + prevLabel.slice(1);
    container.innerHTML = `
        <div class="glass-panel animate-fadeIn" style="max-width:480px;margin:0 auto;">
            <h2 style="margin-bottom:0.4rem;">📊 ${t('metrics.title')}</h2>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1.5rem;">
                ${t('metrics.desc')}
            </p>
            <div style="display:flex;flex-direction:column;gap:1rem;margin-bottom:1.5rem;">
                <div class="input-group">
                    <label style="display:block;font-size:0.78rem;margin-bottom:0.4rem;color:var(--text-secondary);">Seleccionar Período</label>
                    <select id="sm-period" class="input-control" style="background-color:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:#fff; border-radius:var(--radius-sm); padding:0.6rem; font-size:0.85rem; width:100%;">
                        <option value="${curPeriodStr}" selected>Mes actual (${curLabelCap})</option>
                        <option value="${prevPeriodStr}">Mes anterior (${prevLabelCap})</option>
                    </select>
                </div>
                <div class="input-group">
                    <label style="display:block;font-size:0.78rem;margin-bottom:0.4rem;color:var(--text-secondary);">${t('metrics.valid_days')}</label>
                    <input id="sm-days" type="number" class="input-control" min="0" max="31" placeholder="${t('metrics.ph_days')}" value="${prefillDays}">
                </div>
                <div class="input-group">
                    <label style="display:block;font-size:0.78rem;margin-bottom:0.4rem;color:var(--text-secondary);">${t('metrics.live_hours')}</label>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <input id="sm-hours-h" type="number" class="input-control" min="0" max="999" placeholder="0" value="${prefillH}"
                            inputmode="numeric" style="width:5.5rem;text-align:center;padding:0.5rem 0.4rem;">
                        <span style="font-size:1.2rem;font-weight:800;color:var(--text-secondary);flex-shrink:0;line-height:1;">:</span>
                        <input id="sm-hours-m" type="number" class="input-control" min="0" max="59" placeholder="00" value="${prefillM}"
                            inputmode="numeric" style="width:5rem;text-align:center;padding:0.5rem 0.4rem;">
                        <span style="font-size:0.72rem;color:var(--text-muted);flex-shrink:0;">h &nbsp;:&nbsp; min</span>
                    </div>
                </div>
                <div class="input-group">
                    <label style="display:block;font-size:0.78rem;margin-bottom:0.4rem;color:var(--text-secondary);">${t('metrics.diamonds')}</label>
                    <input id="sm-diamonds" type="number" class="input-control" min="0" placeholder="${t('metrics.ph_diamonds')}" value="${prefillDiamonds}">
                </div>
            </div>
            <div id="sm-error" style="margin-bottom:0.75rem;color:var(--danger);font-size:0.8rem;display:none;"></div>
            <button id="sm-submit" class="btn btn-primary" style="width:100%;">${t('metrics.save')}</button>
        </div>
    `;

    const btn           = container.querySelector('#sm-submit');
    const errDiv        = container.querySelector('#sm-error');
    const periodSelect  = container.querySelector('#sm-period');
    const inputDays     = container.querySelector('#sm-days');
    const inputHoursH   = container.querySelector('#sm-hours-h');
    const inputHoursM   = container.querySelector('#sm-hours-m');
    const inputDiamonds = container.querySelector('#sm-diamonds');

    if (periodSelect) {
        periodSelect.onchange = async () => {
            const selectedPeriod = periodSelect.value;
            inputDays.disabled = true;
            inputHoursH.disabled = true;
            inputHoursM.disabled = true;
            inputDiamonds.disabled = true;
            btn.disabled = true;
            btn.textContent = 'Cargando métricas...';
            try {
                const metricData = await metrics.getMyMetrics(selectedPeriod);
                if (metricData) {
                    const secs = Number(metricData.live_seconds || metricData.liveSeconds || 0);
                    inputDays.value = metricData.valid_days ?? metricData.validDays ?? '';
                    inputHoursH.value = secs > 0 ? Math.floor(secs / 3600) : '';
                    inputHoursM.value = secs > 0 ? Math.floor((secs % 3600) / 60) : '';
                    inputDiamonds.value = metricData.diamonds ?? '';
                } else {
                    inputDays.value = '';
                    inputHoursH.value = '';
                    inputHoursM.value = '';
                    inputDiamonds.value = '';
                }
            } catch (err) {
                console.error(err);
                appState.showToast('No se pudieron cargar las métricas anteriores.', 'danger');
            } finally {
                inputDays.disabled = false;
                inputHoursH.disabled = false;
                inputHoursM.disabled = false;
                inputDiamonds.disabled = false;
                btn.disabled = false;
                btn.textContent = t('metrics.save');
            }
        };
    }

    btn.onclick = async () => {
        const periodDate = periodSelect ? periodSelect.value : null;
        const days     = Number(container.querySelector('#sm-days').value);
        const hoursH   = Number(container.querySelector('#sm-hours-h').value) || 0;
        const hoursM   = Number(container.querySelector('#sm-hours-m').value) || 0;
        const hours    = hoursH + hoursM / 60;
        const diamonds = Number(container.querySelector('#sm-diamonds').value);

        errDiv.style.display = 'none';
        if (isNaN(days) || days < 0 || days > 31) {
            errDiv.textContent = t('metrics.err_days');
            errDiv.style.display = 'block';
            return;
        }
        if (hoursM > 59) {
            errDiv.textContent = t('metrics.err_hours');
            errDiv.style.display = 'block';
            return;
        }
        if (isNaN(diamonds) || diamonds < 0) {
            errDiv.textContent = t('metrics.err_diamonds');
            errDiv.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.textContent = t('metrics.saving');

        try {
            await metrics.submitSelf(days, hours, diamonds, periodDate);
            await store.refreshMetrics(true);
            const mainContainer = container.closest('#dashboard-content') || container;
            renderCreatorDashboard(mainContainer);
        } catch (err) {
            errDiv.textContent = err.message || t('metrics.err_generic');
            errDiv.style.display = 'block';
            btn.disabled = false;
            btn.textContent = t('metrics.save');
        }
    };
}

function emptyState(title, sub) {
    return `<div class="glass-panel" style="padding:3rem 2rem;text-align:center;margin-top:2rem;">
        <div style="font-size:2.5rem;margin-bottom:1rem;">🌑</div>
        <h3 style="margin-bottom:0.5rem;">${title}</h3>
        <p class="text-sm text-muted">${sub}</p>
    </div>`;
}

function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function renderInbox(notifications, lastSeen) {
    if (!notifications.length) {
        return `
            <div class="glass-panel" style="padding:3rem 2rem;text-align:center;">
                <div style="font-size:2.5rem;margin-bottom:1rem;">🔔</div>
                <h3 style="margin-bottom:0.5rem;">${t('inbox.empty_title')}</h3>
                <p style="font-size:0.8rem;color:var(--text-muted);">${t('inbox.empty_sub')}</p>
            </div>`;
    }

    const timeAgo = (isoStr) => {
        const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
        if (diff < 60)    return t('inbox.just_now');
        if (diff < 3600)  return t('inbox.min_ago', { n: Math.floor(diff/60) });
        if (diff < 86400) return t('inbox.h_ago', { n: Math.floor(diff/3600) });
        const d = new Date(isoStr);
        return d.toLocaleDateString(getLang() === 'en' ? 'en' : 'es', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const items = notifications.map(n => {
        const isUnread = n.sent_at > lastSeen;
        return `
            <div style="
                display:flex;gap:0.9rem;padding:1rem 1.1rem;
                background:${isUnread ? 'rgba(124,110,247,0.07)' : 'rgba(255,255,255,0.02)'};
                border:1px solid ${isUnread ? 'rgba(124,110,247,0.25)' : 'var(--glass-border)'};
                border-radius:var(--radius-md);
                margin-bottom:0.6rem;
            ">
                <div style="flex-shrink:0;margin-top:0.2rem;">
                    <div style="
                        width:8px;height:8px;border-radius:50%;margin-top:0.35rem;
                        background:${isUnread ? 'var(--primary)' : 'transparent'};
                        border:${isUnread ? 'none' : '1.5px solid rgba(255,255,255,0.15)'};
                    "></div>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.3rem;">
                        <span style="font-size:0.88rem;font-weight:${isUnread ? '700' : '600'};color:${isUnread ? 'var(--text-primary)' : 'var(--text-secondary)'};">
                            ${escHtml(n.title)}
                        </span>
                        <span style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;flex-shrink:0;">${timeAgo(n.sent_at)}</span>
                    </div>
                    <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 ${n.url ? '0.6rem' : '0'};line-height:1.5;">${escHtml(n.body)}</p>
                    ${n.url ? `<a href="${n.url}" target="_blank" rel="noopener noreferrer" style="font-size:0.72rem;color:var(--primary);text-decoration:none;font-weight:600;">${t('inbox.view_more')}</a>` : ''}
                </div>
            </div>`;
    }).join('');

    return `
        <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <h3 style="margin:0;font-size:0.95rem;">${t('inbox.section')}</h3>
                <span style="font-size:0.72rem;color:var(--text-muted);">${notifications.length} ${getLang() === 'en' ? `message${notifications.length !== 1 ? 's' : ''}` : `mensaje${notifications.length !== 1 ? 's' : ''}`}</span>
            </div>
            ${items}
        </div>`;
}
