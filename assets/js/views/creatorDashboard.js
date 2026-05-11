import { store } from '../store.js';
import { isSupabaseConfigured } from '../supabase.js';
import { visualTiers, cashBonuses, diamondRewards, subscriptionRequirements, requirements } from '../config.js';


function getIdx(d, tiers) {
    for (let i = tiers.length - 1; i >= 0; i--) if (d >= tiers[i].range) return i;
    return -1;
}
function parseHours(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    str = String(str);
    const h = (str.match(/(\d+)h/)   || [0,0])[1];
    const m = (str.match(/(\d+)min/) || [0,0])[1];
    const s = (str.match(/(\d+)s/)   || [0,0])[1];
    return +h + +m/60 + +s/3600;
}
function fmt(n) { return Number(n).toLocaleString('es'); }
function levelClass(n) { return `lv${Math.min(n, 10)}`; }
function daysLeft() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth()+1, 0).getDate() - now.getDate();
}
function daysElapsed() {
    return new Date().getDate();
}
function renderTier(tier, size='1.1rem') {
    if (tier.icon) {
        return `<img src="${tier.icon}" alt="${tier.name}" style="width:${size};height:${size};vertical-align:middle;margin-right:0.3rem;object-fit:contain;">`;
    }
    return `<span style="margin-right:0.3rem;">${tier.emoji}</span>`;
}
function daysInMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
}
function getPaceData(currentDiamonds, lastMonthDiamonds) {
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
function getRanking(me, data) {
    const sorted = [...data].sort((a,b) => b.diamonds - a.diamonds);
    const pos = sorted.findIndex(c => c.username === me.username) + 1;
    return { pos, total: data.length, pct: Math.round((pos/data.length)*100) };
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
function tabMetrics(me, rank, lastMonthTier, pace, dLeft) {
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
            ${rank.pct<=20
                ? `<span style="margin-left:auto;font-size:0.73rem;background:rgba(0,217,166,0.12);color:var(--accent);border:1px solid rgba(0,217,166,0.25);padding:0.2rem 0.7rem;border-radius:999px;font-weight:700;">🏅 Top ${rank.pct}%</span>`
                : `<span style="margin-left:auto;font-size:0.73rem;color:var(--text-muted);">#${rank.pos} de ${rank.total}</span>`}
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
                    <div class="metric-subtitle">Mes anterior: ${fmt(dLast)} ${me.diamonds>=dLast?'📈':'📉'}</div>
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

function tabGoals(me, h, dy, pct, curTier, nextTier, currCashIdx, lastMonthIdx, dLeft, proj, projStatus, cashAmt) {
    const advanceTarget = nextTier ? nextTier.range : me.diamonds;
    const dMissing = Math.max(0, advanceTarget - me.diamonds);

    // ── 1. Nivel / progreso de diamantes ──────────────────────────────────
    const levelCard = `
        <div class="glass-panel section-card" style="margin-bottom:0.85rem;${pct>=70&&nextTier?'border-color:rgba(255,181,71,0.25);':''}">
            <div class="section-header">
                <div class="section-icon">💎</div>
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
    const assignedTier  = lastMonthIdx >= 0 ? cashBonuses[lastMonthIdx] : null;
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
    const vizMax = assignedTier ? assignedTier.range
                 : (currCashIdx+1 < cashBonuses.length ? cashBonuses[currCashIdx+1].range : cashBonuses[0].range);
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
                    <div style="font-size:0.63rem;color:var(--text-muted);">${reqMaintains ? '✓ Meta alcanzada' : 'Meta del nivel'}</div>
                </div>
            </div>
        </div>`;

    const cashCard = `
        <div class="glass-panel section-card" style="margin-bottom:0.85rem;background:${cashOk?'rgba(0,217,166,0.04)':'rgba(255,181,71,0.03)'};">
            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.15rem;">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <div class="section-icon" style="background:rgba(0,217,166,0.1);">💵</div>
                    <div>
                        <h3 style="font-size:0.92rem;">Bono en Efectivo (USD)</h3>
                        <p class="text-xs text-muted">Req: ${requirements.cashBonus.minHours}h · ${requirements.cashBonus.minDays} días · Mantener nivel asignado</p>
                    </div>
                </div>
                ${(() => {
                    // Bonus amounts based on ASSIGNED level (lastMonthIdx), not current month's tier
                    // bonusIfMaintains = what they earn if they reach/match their assigned level
                    const bonusIfMaintains = lastMonthIdx >= 0 ? cashBonuses[lastMonthIdx].mantiene : null;
                    // bonusIfSubio = what they'd earn reaching the tier ABOVE their assigned level
                    const nextAboveAssigned = lastMonthIdx + 1 < cashBonuses.length ? cashBonuses[lastMonthIdx + 1] : null;
                    const bonusIfNextTier   = nextAboveAssigned ? nextAboveAssigned.subio : null;


                    if (cashOk) {
                        // Already earning — show current + what they'd get if they go up
                        return `<div style="text-align:right;flex-shrink:0;">
                            <div style="font-size:1.15rem;font-weight:800;color:var(--accent);">$${cashAmt} <span style="font-size:0.65rem;font-weight:500;color:var(--text-muted);">USD</span></div>
                            <div style="font-size:0.62rem;color:var(--text-muted);">Bono activo este mes</div>
                            ${bonusIfNextTier ? `<div style="font-size:0.65rem;color:var(--gold);margin-top:0.2rem;">⬆ Si subes: $${bonusIfNextTier}</div>` : ''}
                        </div>`;
                    } else if (bonusIfMaintains !== null) {
                        // Not yet earning — show what they'd get if they maintain their assigned level
                        return `<div style="text-align:right;flex-shrink:0;">
                            <div style="font-size:0.65rem;color:var(--text-muted);margin-bottom:0.15rem;">Objetivo actual</div>
                            <div style="font-size:1.1rem;font-weight:800;color:var(--warning);">$${bonusIfMaintains}</div>
                            <div style="font-size:0.62rem;color:var(--text-muted);">si mantienes nivel</div>
                            ${bonusIfNextTier ? `<div style="font-size:0.65rem;color:var(--gold);margin-top:0.2rem;">⬆ Si subes: $${bonusIfNextTier}</div>` : ''}
                        </div>`;
                    } else {
                        // Below first tier — show first reachable bonus
                        return `<div style="text-align:right;flex-shrink:0;">
                            <div style="font-size:0.65rem;color:var(--text-muted);margin-bottom:0.15rem;">Primer bono</div>
                            <div style="font-size:1.1rem;font-weight:800;color:rgba(255,255,255,0.4);">$${cashBonuses[0].mantiene}</div>
                            <div style="font-size:0.62rem;color:var(--text-muted);">al llegar a ${fmt(cashBonuses[0].range)} 💎</div>
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

            <!-- Requirements checklist (compact) -->
            <div style="display:flex;flex-direction:column;gap:0.35rem;">
                <div style="display:flex;align-items:center;gap:0.45rem;font-size:0.78rem;">
                    <span>${reqH15?'✅':'🔲'}</span>
                    <span style="color:var(--text-secondary);">Horas LIVE: <strong style="color:var(--text-primary);">${h.toFixed(1)}h / 15h</strong> ${reqH15?'✓':`— ¡faltan solo ${(15-h).toFixed(1)}h!`}</span>
                </div>
                <div style="display:flex;align-items:center;gap:0.45rem;font-size:0.78rem;">
                    <span>${reqDy7?'✅':'🔲'}</span>
                    <span style="color:var(--text-secondary);">Días activos: <strong style="color:var(--text-primary);">${dy} / 7 días</strong> ${reqDy7?'✓':`— ¡${7-dy} día${7-dy===1?'':'s'} más y lo activas!`}</span>
                </div>
                ${assignedTier ? `
                <div style="display:flex;align-items:center;gap:0.45rem;font-size:0.78rem;">
                    <span>${reqMaintains?'✅':'🔲'}</span>
                    <span style="color:var(--text-secondary);">Nivel asignado: <strong style="color:var(--text-primary);">${fmt(me.diamonds)} / ${fmt(assignedTier.range)} 💎</strong> ${reqMaintains?'✓':`— ¡${fmt(diamMissing)} para activarlo!`}</span>
                </div>` : ''}
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
        <div class="glass-panel section-card" style="margin-bottom:0.85rem;background:rgba(124,110,247,0.03);">
            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <div class="section-icon" style="background:rgba(124,110,247,0.1);">💎</div>
                    <div>
                        <h3 style="font-size:0.92rem;">Premio en Diamantes</h3>
                        <p class="text-xs text-muted">Req: ${requirements.diamondPrize.minHours}h · ${requirements.diamondPrize.minDays} días activos</p>
                    </div>
                </div>
                ${estimatedTotal !== null ? `
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:0.62rem;color:var(--text-muted);margin-bottom:0.1rem;">${diamOk ? 'Premio estimado' : 'Objetivo'}</div>
                    <div style="font-size:1.1rem;font-weight:800;color:${diamOk ? 'var(--primary)' : 'rgba(124,110,247,0.6)'};">${fmt(estimatedTotal)} 💎</div>
                    ${battleBonus > 0 ? `<div style="font-size:0.62rem;color:var(--gold);">+${battleBonus}% por batallas</div>` : ''}
                </div>` : ''}
            </div>

            <!-- Horas de LIVE -->
            <div style="margin-bottom:0.6rem;">
                <div style="display:flex;align-items:center;gap:0.45rem;margin-bottom:0.2rem;">
                    <span>${reqH90 ? '✅' : '🔲'}</span>
                    <span style="font-size:0.78rem;color:var(--text-secondary);">Horas LIVE <strong style="color:var(--text-primary);">${h.toFixed(1)}h / ${requirements.diamondPrize.minHours}h</strong> ${reqH90 ? '✓' : `— faltan ${(requirements.diamondPrize.minHours - h).toFixed(1)}h`}</span>
                </div>
                ${pBar(Math.min(h, requirements.diamondPrize.minHours), requirements.diamondPrize.minHours,
                    reqH90 ? 'linear-gradient(90deg,var(--primary),var(--accent))' : 'linear-gradient(90deg,var(--primary),var(--secondary))',
                    `${h.toFixed(1)}h`, `${requirements.diamondPrize.minHours}h`)}
            </div>

            <!-- Días activos -->
            <div style="margin-bottom:0.6rem;">
                <div style="display:flex;align-items:center;gap:0.45rem;margin-bottom:0.2rem;">
                    <span>${reqDy22 ? '✅' : '🔲'}</span>
                    <span style="font-size:0.78rem;color:var(--text-secondary);">Días activos <strong style="color:var(--text-primary);">${dy} / ${requirements.diamondPrize.minDays}</strong> ${reqDy22 ? '✓' : `— faltan ${requirements.diamondPrize.minDays - dy}`}</span>
                </div>
                ${pBar(Math.min(dy, requirements.diamondPrize.minDays), requirements.diamondPrize.minDays,
                    reqDy22 ? 'linear-gradient(90deg,var(--secondary),var(--accent))' : 'linear-gradient(90deg,var(--secondary),#c026d3)',
                    `${dy} días`, `${requirements.diamondPrize.minDays} días`)}
            </div>

            <!-- Batallas (bonus extra) -->
            <div>
                <div style="display:flex;align-items:center;gap:0.45rem;margin-bottom:0.2rem;">
                    <span>⚔️</span>
                    <span style="font-size:0.78rem;color:var(--text-secondary);">Batallas <strong style="color:var(--text-primary);">${me.battles} / ${maxBattlesCfg}</strong>
                    ${battleBonus > 0
                        ? `→ <strong style="color:var(--gold);">+${battleBonus}%</strong> extra${me.battles < maxBattlesCfg ? ` · con ${nextBattleMilestone - me.battles} más sumas +10%` : ' · ¡máximo!'}`
                        : `— con ${nextBattleMilestone} batallas ganas +10% de premio`}
                    </span>
                </div>
                ${pBar(Math.min(me.battles, maxBattlesCfg), maxBattlesCfg,
                    'linear-gradient(90deg,var(--warning),#f97316)',
                    `${me.battles} batallas`, `${maxBattlesCfg} máx.`)}
            </div>

            <p class="text-sm" style="color:${diamOk ? 'var(--primary)' : 'var(--text-muted)'};margin-top:0.6rem;">
                ${diamOk
                    ? `✅ ¡Premio desbloqueado! ${battleBonus > 0 ? `Con el +${battleBonus}% de batallas recibes ${fmt(estimatedTotal)} 💎.` : `Recibes ${fmt(estimatedBase)} 💎.`}`
                    : `⚠ Completa las horas y días para desbloquear el Premio en Diamantes.`}
            </p>
        </div>`;

    // ── 4. Suscripción Interactik App ──────────────────────────────────────
    const reqDy15 = dy>=subscriptionRequirements.minDays, reqD80 = me.diamonds>=subscriptionRequirements.minDiamonds;
    const subOk = reqDy15 && reqD80;
    const subCard = `
        <div class="glass-panel section-card" style="margin-bottom:0.85rem;background:rgba(244,113,181,0.03);">
            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
                <div style="display:flex;align-items:center;gap:0.6rem;">
                    <div class="section-icon" style="background:rgba(244,113,181,0.1);">🎟️</div>
                    <div>
                        <h3 style="font-size:0.92rem;">Suscripción Interactik App</h3>
                        <p class="text-xs text-muted">Req: ${subscriptionRequirements.minDays} días activos · ${fmt(subscriptionRequirements.minDiamonds)} 💎</p>
                    </div>
                </div>
                ${subOk ? `<div style="background:rgba(244,113,181,0.15);border:1px solid rgba(244,113,181,0.35);border-radius:999px;padding:0.2rem 0.75rem;font-size:0.68rem;font-weight:700;color:#f471b5;">✓ Activa</div>` : ''}
            </div>

            <!-- Días activos -->
            <div style="margin-bottom:0.6rem;">
                <div style="display:flex;align-items:center;gap:0.45rem;margin-bottom:0.2rem;">
                    <span>${reqDy15 ? '✅' : '🔲'}</span>
                    <span style="font-size:0.78rem;color:var(--text-secondary);">Días activos <strong style="color:var(--text-primary);">${dy} / ${subscriptionRequirements.minDays}</strong> ${reqDy15 ? '✓' : `— faltan ${subscriptionRequirements.minDays - dy}`}</span>
                </div>
                ${pBar(Math.min(dy, subscriptionRequirements.minDays), subscriptionRequirements.minDays,
                    reqDy15 ? 'linear-gradient(90deg,#f471b5,#ec4899)' : 'linear-gradient(90deg,rgba(244,113,181,0.4),#f471b5)',
                    `${dy} días`, `${subscriptionRequirements.minDays} días`)}
            </div>

            <!-- Diamantes -->
            <div>
                <div style="display:flex;align-items:center;gap:0.45rem;margin-bottom:0.2rem;">
                    <span>${reqD80 ? '✅' : '🔲'}</span>
                    <span style="font-size:0.78rem;color:var(--text-secondary);">Diamantes <strong style="color:var(--text-primary);">${fmt(me.diamonds)} / ${fmt(subscriptionRequirements.minDiamonds)} 💎</strong> ${reqD80 ? '✓' : `— faltan ${fmt(subscriptionRequirements.minDiamonds - me.diamonds)}`}</span>
                </div>
                ${pBar(Math.min(me.diamonds, subscriptionRequirements.minDiamonds), subscriptionRequirements.minDiamonds,
                    reqD80 ? 'linear-gradient(90deg,#f471b5,#ec4899)' : 'linear-gradient(90deg,rgba(244,113,181,0.4),#f471b5)',
                    `${fmt(me.diamonds)} 💎`, `${fmt(subscriptionRequirements.minDiamonds)} 💎`)}
            </div>

            <p class="text-sm" style="color:${subOk ? '#f471b5' : 'var(--text-muted)'};margin-top:0.6rem;">
                ${subOk ? '✅ ¡Elegible para la Suscripción Interactik App gratuita!' : '⚠ Completa los requisitos para obtener la suscripción.'}
            </p>
        </div>`;


    const urgencyBanner = dLeft<=7?`
        <div style="background:linear-gradient(135deg,rgba(255,181,71,0.15),rgba(244,113,181,0.1));border:1px solid rgba(255,181,71,0.35);border-radius:var(--radius-md);padding:0.9rem 1.1rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.75rem;">
            <span style="font-size:1.4rem;">⏰</span>
            <div><div style="font-weight:700;font-size:0.88rem;color:var(--warning);">¡Solo quedan ${dLeft} días del mes!</div>
            <div class="text-sm" style="color:var(--text-secondary);">Revisa los requisitos pendientes y actúa ahora.</div></div>
        </div>`:'';

    return urgencyBanner + levelCard + cashCard + diamCard + subCard;
}


function tabBenefits(me, hLast, dyLast, cashAmtLast, diamAmtLast, hasSubLast, trendLast, meetsCashLast, meetsDiamLast, lastCashIdx) {
    // ── Data from LAST month ────────────────────────────────────────────────
    // We use diamondsLastMonth to determine the tier/bonus earned last month.
    // hLast / dyLast / cashAmtLast come from the previous month's calculation.
    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthName = lastMonthDate.toLocaleString('es', { month: 'long', year: 'numeric' });

    const noBenefits = cashAmtLast === 0 && diamAmtLast === 0 && !hasSubLast;

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
                <div>
                    <div class="text-xs text-muted">Suscripción App</div>
                    <div style="font-weight:800;color:${hasSubLast?'#f471b5':'var(--text-muted)'};">${hasSubLast?'✓ Gratis':'No activa'}</div>
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

        ${benefitRow('🎟️', 'Suscripción Interactik App',
            hasSubLast ? '✓ Gratis' : 'No activa',
            hasSubLast,
            hasSubLast
                ? 'Elegiste la suscripción gratuita este mes'
                : 'No se alcanzaron los 15 días activos o 80K 💎'
        )}

        <div style="margin-top:0.75rem;padding:0.65rem 0.9rem;background:rgba(255,255,255,0.03);border-radius:var(--radius-sm);border-left:3px solid rgba(124,110,247,0.4);">
            <p class="text-xs text-muted">Los beneficios se calculan al cierre del mes y se pagan en los primeros días del mes siguiente. Los valores mostrados corresponden al desempeño del mes anterior.</p>
        </div>`;
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
        </div>` : ''}`;
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
        </div>` : ''}`;
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

    if (isSupabaseConfigured && !targetUsername && !store.getMetricsData()?.length) {
        await store.refreshMetrics().catch(() => {});
    }

    const data = store.getMetricsData();
    const user = store.getCurrentUser();
    
    // Si hay targetUsername, estamos en "Modo Auditoría"
    const isAuditing = !!targetUsername;
    const myUsername = (targetUsername || store.getProfile?.()?.tiktok_username || user?.username || '').toLowerCase();

    if (!data?.length) { container.innerHTML = emptyState('Sin datos', 'Aún no se cargó el reporte del mes.'); return; }

    // Buscamos a la creadora (limpiando @ y espacios, e insensible a mayúsculas)
    const cleanMatch = (u) => String(u || '').trim().toLowerCase().replace(/^@/, '');
    const searchName = cleanMatch(myUsername);
    const me = data.find(c => cleanMatch(c.username) === searchName);

    if (!me) { 
        container.innerHTML = emptyState(
            `No se encontraron métricas para @${myUsername}`, 
            'Asegúrate de que el usuario de TikTok en el perfil coincida exactamente con el del reporte Excel.'
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

    // Cash bonus tier indexes (for subio / mantiene / baja logic)
    const lastMonthIdx  = Math.max(-1, getIdx(dLast, cashBonuses));
    const currCashIdx   = getIdx(me.diamonds, cashBonuses);
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
        const tierC = cashBonuses[currCashIdx];
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

    // Subscription: dy >= 15 AND current diamonds >= 80,000
    const hasSub = dy >= subscriptionRequirements.minDays && me.diamonds >= subscriptionRequirements.minDiamonds;

    const dLeft = daysLeft();
    const rank  = getRanking(me, data);

    // Determine which special tab to show (mutually exclusive)
    const daysJoined    = me.daysSinceJoining ?? null;
    const showMissions  = daysJoined !== null && daysJoined <= 30 + dLeft;
    const showChallenge = daysJoined !== null && !showMissions && daysJoined <= 90;

    // Estimated earnings: $1 per 200 diamonds
    const DIAMONDS_PER_USD = 200;
    const estimatedEarnings = (me.diamonds / DIAMONDS_PER_USD).toFixed(2);
    const now = new Date();
    const monthName = now.toLocaleString('es', { month: 'long' });
    const year = now.getFullYear();

    // Inject shell with tab nav
    container.innerHTML = `
        <!-- Brand line / Back Button -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
            <span style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;color:var(--text-muted);text-transform:uppercase;">Interactik Agency · Creator Elevate</span>
            ${isAuditing ? `<button id="back-to-list" class="btn btn-sm" style="padding:0.4rem 0.8rem;font-size:0.7rem;background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);">← Volver al Listado</button>` : ''}
        </div>

        <!-- Creator Profile -->
        <div style="display:flex;align-items:center;gap:0.85rem;margin-bottom:1rem;padding:0.75rem 1rem;background:rgba(255,255,255,0.03);border-radius:var(--radius-md);border:1px solid rgba(255,255,255,0.07);">
            <div id="creator-avatar" style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;font-size:1.15rem;font-weight:800;flex-shrink:0;border:2px solid rgba(0,217,166,0.3);overflow:hidden;position:relative;">
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
            <div>
                <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);">@${me.username}</div>
                <div style="display:flex;align-items:center;gap:0.3rem;font-size:0.67rem;color:var(--text-muted);">${renderTier(curTier, '0.9rem')} ${curTier.name} · Panel personal · ${monthName.charAt(0).toUpperCase()+monthName.slice(1)} ${year}</div>
            </div>
        </div>


        <!-- Estimated Earnings Hero -->
        <div class="glass-panel" style="padding:1.4rem 1.5rem;margin-bottom:1rem;background:linear-gradient(135deg,rgba(0,217,166,0.07),rgba(124,110,247,0.05));border-color:rgba(0,217,166,0.2);text-align:center;">
            <div style="font-size:0.7rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.35rem;">Ganancias Estimadas — ${monthName.charAt(0).toUpperCase()+monthName.slice(1)} ${year}</div>
            <div style="font-size:3rem;font-weight:900;line-height:1;background:linear-gradient(135deg,#00d9a6,#7c6ef7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:0.3rem;">
                $${Number(estimatedEarnings).toLocaleString('es',{minimumFractionDigits:2,maximumFractionDigits:2})}
            </div>
            <div style="font-size:0.62rem;color:var(--text-muted);">
                Estimación basada en ${fmt(me.diamonds)} 💎 × $1 / 200 diamantes · No incluye bonos
            </div>
        </div>

        <!-- Tab Nav -->
        <div id="creator-tabs" style="display:flex;gap:0.4rem;margin-bottom:1.25rem;background:rgba(0,0,0,0.25);border-radius:var(--radius-md);padding:0.3rem;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
            <button class="tab-btn active" data-tab="metrics"  style="flex:1;white-space:nowrap;">📊 Métricas</button>
            <button class="tab-btn"        data-tab="goals"    style="flex:1;white-space:nowrap;">🎯 Objetivos</button>
            <button class="tab-btn"        data-tab="benefits" style="flex:1;white-space:nowrap;">🎁 Beneficios</button>
            ${showMissions  ? `<button class="tab-btn" data-tab="missions"  style="flex:1;white-space:nowrap;">🚀 Misiones</button>` : ''}
            ${showChallenge ? `<button class="tab-btn" data-tab="challenge" style="flex:1;white-space:nowrap;">🏆 Reto 90d</button>` : ''}
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
            .tab-btn.active { background: var(--bg-elevated, #141720); color: var(--text-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
            #creator-tabs::-webkit-scrollbar { display: none; }
        `;
        document.head.appendChild(s);
    }

    const tabContent = container.querySelector('#tab-content');
    const tabs = { metrics: null, goals: null, benefits: null, missions: null, challenge: null };

    // ── Last month benefit calculation ────────────────────────────────────
    // We only have dLast from the data; hours/days from last month aren't in the file.
    // We calculate what tier they were in last month and what bonus they earned.
    // Note: hoursLastMonth and daysLastMonth are not available, so we use
    // me.hoursLastMonth / me.daysLastMonth if present, otherwise assume met.
    const hLast     = me.hoursLastMonth  != null ? parseHours(me.hoursLastMonth)  : null;
    const dyLast    = me.daysLastMonth   != null ? me.daysLastMonth                : null;
    const lastCashTierIdx = Math.max(-1, getIdx(dLast, cashBonuses));
    // Trend for last month: compare dLast vs the month before (not available → assume 'mantiene')
    const trendLast = trend; // re-use current trend as best approximation
    let cashAmtLast = 0;
    // Only calculate if we have enough data
    if (lastCashTierIdx >= 0) {
        const meetsHLast = hLast != null ? hLast >= cashH : true; // assume met if no data
        const meetsDyLast = dyLast != null ? dyLast >= cashDy : true;
        if (meetsHLast && meetsDyLast) {
            const tier = cashBonuses[lastCashTierIdx];
            cashAmtLast = trendLast === 'subio' ? tier.subio : trendLast === 'mantiene' ? tier.mantiene : 0;
        }
    }
    let diamAmtLast = 0;
    const lastDiamIdx = getIdx(dLast, diamondRewards);
    if (lastDiamIdx >= 0) {
        const meetsHLast = hLast != null ? hLast >= diamH : true;
        const meetsDyLast = dyLast != null ? dyLast >= diamDy : true;
        if (meetsHLast && meetsDyLast) {
            const base = diamondRewards[lastDiamIdx].reward;
            const battlesLast = Math.min(me.battles ?? 0, maxBattles);
            const extra = Math.round(base * (Math.floor(battlesLast / 100) * 0.1));
            diamAmtLast = base + extra;
        }
    }
    // If dyLast is unavailable, infer activity from diamond count:
    // 80K+ diamonds implies the creator was active enough (15+ days).
    const dyLastMetSub = dyLast != null
        ? dyLast >= subscriptionRequirements.minDays
        : dLast >= subscriptionRequirements.minDiamonds; // high diamonds → assume active days met
    const hasSubLast = dyLastMetSub && dLast >= subscriptionRequirements.minDiamonds;

    const meetsCashLast = cashAmtLast > 0;
    const meetsDiamLast = diamAmtLast > 0;

    function renderTab(name) {
        if (!tabs[name]) {
            if (name === 'metrics')   tabs[name] = tabMetrics(me, rank, curTier, pace, dLeft);
            if (name === 'goals')     tabs[name] = tabGoals(me, h, dy, pct, curTier, nextTier, currCashIdx, lastMonthIdx, dLeft, pace.proj, pace.status, cashAmt);
            if (name === 'benefits')  tabs[name] = tabBenefits(me, hLast, dyLast, cashAmtLast, diamAmtLast, hasSubLast, trendLast, meetsCashLast, meetsDiamLast, lastCashTierIdx);
            if (name === 'missions')  tabs[name] = tabMissions(me);
            if (name === 'challenge') tabs[name] = tabChallenge90(me, h, dy);
        }
        tabContent.innerHTML = `<div class="animate-fade-in">${tabs[name]}</div>`;
    }

    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTab(btn.dataset.tab);
        });
    });

    renderTab('metrics');

    // Manejar botón de volver
    container.querySelector('#back-to-list')?.addEventListener('click', () => {
        const role = store.getCurrentUser().role;
        if (role === 'manager') {
            import('./managerDashboard.js').then(m => m.renderManagerDashboard(container));
        } else {
            import('./adminDashboard.js').then(m => m.renderCreatorsList(container));
        }
    });
}

function emptyState(title, sub) {
    return `<div class="glass-panel" style="padding:3rem 2rem;text-align:center;margin-top:2rem;">
        <div style="font-size:2.5rem;margin-bottom:1rem;">🌑</div>
        <h3 style="margin-bottom:0.5rem;">${title}</h3>
        <p class="text-sm text-muted">${sub}</p>
    </div>`;
}
