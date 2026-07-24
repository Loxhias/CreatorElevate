// Vista "Mis Objetivos" — trae a la app, con datos reales, el contenido que
// antes solo vivía en la guía estática para creadores: cómo se calcula el
// objetivo diario, las tablas de bonificación, qué mide TikTok como
// interacción real, la trampa del hobby y el proceso de reactivación.
// No inventa fórmulas nuevas: reutiliza los mismos cálculos que ya usa
// creatorDashboard.js (ver imports abajo) para que los números coincidan
// siempre con lo que el creador ve en su dashboard principal.
import { store } from '../store.js';
import { isSupabaseConfigured } from '../supabase.js';
import {
    visualTiers, diamondRewards,
    subscriptionRequirements, requirements, getCashBonuses
} from '../config.js';
import { getIdx, parseHours, fmt, daysInMonth, daysElapsed, getPaceData, resolveMe } from './creatorDashboard.js';

function emptyState(title, sub) {
    return `<div class="glass-panel" style="padding:3rem 2rem;text-align:center;margin-top:2rem;">
        <div style="font-size:2.5rem;margin-bottom:1rem;">🌑</div>
        <h3 style="margin-bottom:0.5rem;">${title}</h3>
        <p class="text-sm text-muted">${sub}</p>
    </div>`;
}

export async function renderCreatorGoalsView(container, targetUsername = null) {
    container.innerHTML = `
        <div>
            <div class="skel" style="height:20px;width:220px;border-radius:999px;margin-bottom:1rem;"></div>
            <div class="skel-panel" style="height:130px;margin-bottom:1.25rem;"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.25rem;">
                <div class="skel-panel" style="height:140px;"></div>
                <div class="skel-panel" style="height:140px;"></div>
            </div>
            <div class="skel-panel" style="height:240px;"></div>
        </div>`;

    try {
        if (isSupabaseConfigured) {
            await store.refreshMetrics().catch(() => {});
        }
        const isAuditing = !!targetUsername;
        const data = store.getMetricsData();
        const { me } = resolveMe(data, targetUsername, isAuditing);

        if (!me) {
            container.innerHTML = emptyState(
                isAuditing ? `No se encontraron métricas para @${targetUsername}` : 'Todavía no hay métricas tuyas',
                isAuditing
                    ? 'Este creador aún no tiene métricas cargadas para el período actual.'
                    : 'El administrador carga los datos mensualmente. Volvé a revisar cuando tu período sea procesado.'
            );
            return;
        }
        renderContent(container, me);
    } catch (err) {
        container.innerHTML = `<div class="glass-panel" style="padding:2rem;color:var(--danger);">Error: ${err.message}</div>`;
    }
}

function renderContent(container, me) {
    const h = parseHours(me.liveDuration);
    const dy = Number(me.validDays || 0);
    const dLast = Number(me.diamondsLastMonth || 0);
    const dLeft = Math.max(0, daysInMonth() - daysElapsed());
    const pace = getPaceData(me.diamonds, dLast);

    const curTierIdx = Math.max(0, getIdx(dLast, visualTiers));
    const curTier = visualTiers[curTierIdx];

    const agencyCashBonuses = getCashBonuses(me.agency);
    const lastMonthIdx = Math.max(-1, getIdx(dLast, agencyCashBonuses));
    const currCashIdx = getIdx(me.diamonds, agencyCashBonuses);

    // Próximo nivel de bono en efectivo que todavía no tiene asegurado este mes
    const nextCashIdx = Math.max(currCashIdx, lastMonthIdx) + 1;
    const nextCashTier = nextCashIdx < agencyCashBonuses.length ? agencyCashBonuses[nextCashIdx] : null;
    const targetDiamonds = nextCashTier ? nextCashTier.range : me.diamonds;
    const missing = Math.max(0, targetDiamonds - me.diamonds);
    const dailyGoal = dLeft > 0 ? Math.ceil(missing / dLeft) : 0;

    const reqDy = dy >= subscriptionRequirements.minDays;
    const reqDiam = me.diamonds >= subscriptionRequirements.minDiamonds;
    const hasSub = reqDy && reqDiam;

    // "En riesgo" acá refleja el umbral real del proceso de reactivación (5+
    // días sin actividad válida), no el criterio más amplio que usa el manager
    // para su tablero de equipo.
    const isNew = me.daysSinceJoining != null && me.daysSinceJoining < 30;
    const atRisk = !isNew && dy === 0;

    container.innerHTML = `
        <div class="animate-fadeIn">
            <div style="margin-bottom:1.25rem;">
                <h2 style="font-size:1.15rem;font-weight:800;">🎯 Mis Objetivos</h2>
                <p class="text-sm text-muted">Qué tenés que hacer este mes y por qué — con tus números reales.</p>
            </div>

            ${renderTodayGoal({ dailyGoal, dLeft, missing, nextCashTier, pace })}

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;margin-bottom:1.25rem;">
                ${renderCashGoalCard({ currCashIdx, lastMonthIdx, agencyCashBonuses, h, dy })}
                ${renderFanClubCard({ me, dy, reqDy, reqDiam, hasSub })}
            </div>

            ${renderTiersTable({ curTier, agencyCashBonuses })}

            ${renderInteractionSection()}

            ${renderHobbyTrapSection()}

            ${renderReactivationSection({ atRisk })}

            ${renderClosingSection()}
        </div>`;
}

function renderTodayGoal({ dailyGoal, dLeft, missing, nextCashTier, pace }) {
    const accent = pace.status === 'behind' ? 'var(--warning)' : 'var(--accent)';
    const hasTarget = !!nextCashTier;
    return `
        <div class="glass-panel incentive-hero animate-fadeIn" style="position:relative;overflow:hidden;padding:1.2rem 1.35rem;margin-bottom:1.25rem;border-color:${accent}55;background:linear-gradient(135deg,${accent}17,transparent 65%);">
            <div class="incentive-hero__glow" style="--glow-color:${accent};"></div>
            <div style="position:relative;">
                <div style="font-size:0.66rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${accent};margin-bottom:0.3rem;">🎯 Tu objetivo de hoy</div>
                ${hasTarget ? `
                    <div class="incentive-hero__number" style="font-size:clamp(1.5rem,6vw,2.1rem);font-weight:900;line-height:1.1;color:#fff;">${fmt(dailyGoal)} 💎<span style="font-size:0.9rem;font-weight:700;color:var(--text-secondary);"> /día</span></div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.35rem;">
                        Te faltan <strong style="color:${accent};">${fmt(missing)} 💎</strong> para el bono de <strong style="color:#fff;">$${nextCashTier.subio}</strong> — repartilo entre los ${dLeft} días que te quedan del mes.
                    </div>
                ` : `
                    <div class="incentive-hero__number" style="font-size:clamp(1.2rem,5vw,1.6rem);font-weight:900;color:#fff;">🏆 Ya tenés el nivel más alto de bono</div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.35rem;">Enfocate en mantener el ritmo — eso es lo que asegura el bono al cierre del mes.</div>
                `}
                <div style="margin-top:0.7rem;font-size:0.7rem;color:var(--text-muted);">
                    Cómo se calcula: (meta del nivel − lo que ya generaste) ÷ días que quedan en el mes. Ejemplo: 80.000 💎 ÷ 22 días ≈ 3.636 💎/día.
                </div>
            </div>
        </div>`;
}

function renderCashGoalCard({ currCashIdx, lastMonthIdx, agencyCashBonuses, h, dy }) {
    const reqH = requirements.cashBonus.minHours, reqD = requirements.cashBonus.minDays;
    const meetsReq = h >= reqH && dy >= reqD;
    const trend = currCashIdx > lastMonthIdx ? 'subio' : currCashIdx === lastMonthIdx ? 'mantiene' : 'baja';
    const tier = currCashIdx >= 0 ? agencyCashBonuses[currCashIdx] : null;
    const amount = tier ? (trend === 'subio' ? tier.subio : trend === 'mantiene' ? tier.mantiene : 0) : 0;
    return `
        <div class="glass-panel section-card">
            <div class="section-header">
                <div class="section-icon" style="background:rgba(0,217,166,0.1);">💵</div>
                <div><h3 style="font-size:0.92rem;">Bono en efectivo</h3><p class="text-xs text-muted">Requiere ≥${reqH}h de LIVE y ≥${reqD} días activos</p></div>
            </div>
            <p class="text-sm" style="color:var(--text-secondary);margin-top:0.6rem;">
                ${tier && meetsReq && amount > 0
                    ? `Con tu nivel actual, cobrarías <strong style="color:var(--accent);">$${amount}</strong> este mes.`
                    : tier
                        ? `Ya llegaste al nivel de diamantes, pero todavía te faltan horas o días activos para activarlo.`
                        : `Todavía no llegaste al primer nivel de diamantes para el bono.`}
            </p>
        </div>`;
}

function renderFanClubCard({ me, dy, reqDy, reqDiam, hasSub }) {
    const faltaDias = Math.max(0, subscriptionRequirements.minDays - dy);
    const faltaDiam = Math.max(0, subscriptionRequirements.minDiamonds - me.diamonds);
    return `
        <div class="glass-panel section-card">
            <div class="section-header">
                <div class="section-icon" style="background:rgba(244,113,181,0.12);">🎗️</div>
                <div><h3 style="font-size:0.92rem;">Club de fans / Suscripción</h3><p class="text-xs text-muted">Requiere ≥${subscriptionRequirements.minDays} días activos y ≥${fmt(subscriptionRequirements.minDiamonds)} 💎</p></div>
            </div>
            <p class="text-sm" style="color:var(--text-secondary);margin-top:0.6rem;">
                ${hasSub
                    ? '✅ Ya cumplís los dos requisitos este mes.'
                    : `Te falta${!reqDy ? ` ${faltaDias} día(s) activo(s)` : ''}${!reqDy && !reqDiam ? ' y' : ''}${!reqDiam ? ` ${fmt(faltaDiam)} 💎` : ''} para cumplirlos.`}
            </p>
            <p class="text-xs text-muted" style="margin-top:0.5rem;">Es clave para fidelizar a tu audiencia: le permite a la gente que te sigue unirse a tu comunidad y apoyarte de forma más directa.</p>
        </div>`;
}

function renderTiersTable({ curTier, agencyCashBonuses }) {
    const rows = visualTiers.map(t => {
        const cashMatch = agencyCashBonuses.find(c => c.range === t.range);
        const diamMatch = diamondRewards.find(d => d.range === t.range);
        const isCurrent = t.level === curTier.level;
        return `<tr style="${isCurrent ? 'background:rgba(124,110,247,0.08);' : ''}">
            <td>${t.emoji} ${t.name}${isCurrent ? ' <span class="text-xs" style="color:var(--primary-light);font-weight:700;">(vos)</span>' : ''}</td>
            <td class="num">${fmt(t.range)} 💎</td>
            <td class="num">${cashMatch ? '$' + cashMatch.subio : '—'}</td>
            <td class="num">${cashMatch ? '$' + cashMatch.mantiene : '—'}</td>
            <td class="num">${diamMatch ? fmt(diamMatch.reward) + ' 💎' : '—'}</td>
        </tr>`;
    }).join('');
    return `
        <div class="glass-panel section-card" style="margin-bottom:1.25rem;">
            <div class="section-header">
                <div class="section-icon" style="background:rgba(124,110,247,0.12);">📊</div>
                <div><h3 style="font-size:0.92rem;">Todos los niveles</h3><p class="text-xs text-muted">Bonos calculados en base a la tabla de tu agencia — tu nivel actual está resaltado</p></div>
            </div>
            <div class="table-container" style="margin-top:0.6rem;">
                <table class="data-table">
                    <thead><tr><th>Nivel</th><th class="num">Diamantes/mes</th><th class="num">Bono si subís</th><th class="num">Bono si mantenés</th><th class="num">Premio en 💎</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
}

function renderInteractionSection() {
    const chips = ['💬 Comentar', '🔁 Compartir', '👋 Taptap', '➕ Seguirte', '🎗️ Unirse al Club de fans', '🎁 Enviar regalos'];
    return `
        <div class="glass-panel section-card" style="margin-bottom:1.25rem;">
            <div class="section-header">
                <div class="section-icon" style="background:rgba(124,110,247,0.12);">🔍</div>
                <div><h3 style="font-size:0.92rem;">Qué es realmente la "interacción" para TikTok</h3></div>
            </div>
            <p class="text-sm" style="color:var(--text-secondary);margin-top:0.6rem;">
                Muchos creadores piensan que interacción es simplemente hablarle a la gente que entra o comenta en el
                chat. No es así. Mantener una conversación fluida es importante, pero
                <strong style="color:var(--text-primary);">no es lo que TikTok mide</strong> para saber si tu
                audiencia está realmente activa. Lo que TikTok mide es que tus espectadores hagan esto:
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.9rem 0;">
                ${chips.map(x => `<span style="background:rgba(124,110,247,0.1);border:1px solid rgba(124,110,247,0.25);color:var(--primary-light);font-size:0.75rem;font-weight:700;padding:0.35rem 0.75rem;border-radius:999px;">${x}</span>`).join('')}
            </div>
            <p class="text-xs text-muted">Ese conjunto completo de interacciones es lo que determina si TikTok prioriza compartir tu transmisión con más gente, o si mantiene tu exposición de forma pasiva.</p>
        </div>`;
}

function renderHobbyTrapSection() {
    return `
        <div class="glass-panel animate-fadeIn" style="padding:1.1rem 1.2rem;margin-bottom:1.25rem;background:linear-gradient(135deg,rgba(255,85,105,0.08),rgba(255,181,71,0.04));border-color:rgba(255,85,105,0.35);">
            <div style="display:flex;align-items:start;gap:0.85rem;">
                <div style="font-size:1.5rem;line-height:1;">⚠️</div>
                <div>
                    <div style="font-weight:700;font-size:0.87rem;color:var(--danger);margin-bottom:0.35rem;">El error que termina carreras</div>
                    <p style="font-size:0.78rem;color:var(--text-secondary);line-height:1.55;">
                        <strong style="color:var(--text-primary);">"Para mí esto es solo un hobby."</strong> Al decir
                        esta frase, sin darte cuenta, te estás poniendo tu propio techo de crecimiento — te estancás
                        en la mediocridad del contenido que te mantiene en tu zona de confort. Tu carrera empieza
                        acá, pero dónde termina y qué tan alto llegás depende exclusivamente del empeño que le
                        pongas.
                    </p>
                </div>
            </div>
        </div>`;
}

function renderReactivationSection({ atRisk }) {
    return `
        <div class="glass-panel section-card" style="margin-bottom:1.25rem;${atRisk ? 'border-left:3px solid var(--danger);' : ''}">
            <div class="section-header">
                <div class="section-icon" style="background:${atRisk ? 'rgba(255,85,105,0.12)' : 'rgba(0,217,166,0.1)'};">${atRisk ? '🔴' : '🔁'}</div>
                <div>
                    <h3 style="font-size:0.92rem;">No estás llegando a los objetivos — reactivación</h3>
                    ${atRisk
                        ? `<p class="text-xs" style="color:var(--danger);font-weight:700;">Sin días válidos este mes — estás en riesgo</p>`
                        : `<p class="text-xs text-muted">Qué pasa si bajás la actividad</p>`}
                </div>
            </div>
            <div style="display:grid;gap:0.75rem;margin-top:0.75rem;">
                <div>
                    <div class="text-xs" style="color:var(--primary-light);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Qué pasa</div>
                    <p class="text-sm" style="color:var(--text-secondary);">Un creador inactivo sufre una degradación algorítmica: cuanto más tiempo pasás sin transmitir, TikTok le muestra tu contenido a menos gente cuando volvés. No es una decisión de la agencia, es cómo funciona la plataforma.</p>
                </div>
                <div>
                    <div class="text-xs" style="color:var(--warning);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Cuándo se activa</div>
                    <p class="text-sm" style="color:var(--text-secondary);">5 días o más sin actividad — ahí entrás en la categoría de creador inactivo y empieza el proceso de reactivación.</p>
                </div>
                <div>
                    <div class="text-xs" style="color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Qué tenés que hacer</div>
                    <p class="text-sm" style="color:var(--text-secondary);">Retomar la actividad con constancia, respetando el mínimo de más de 1 hora por transmisión. Tu manager te va a acompañar en este proceso.</p>
                </div>
            </div>
        </div>`;
}

function renderClosingSection() {
    return `
        <div class="glass-panel" style="padding:1.3rem 1.4rem;text-align:center;">
            <p class="text-sm" style="color:var(--text-secondary);line-height:1.6;">
                Recordá que la agencia está para apoyarte en tu crecimiento — no somos una billetera andante ni somos
                un espectador más, y siempre van a tener mayor prioridad los creadores que más esfuerzo le pongan.
            </p>
            <p class="text-sm" style="color:var(--text-secondary);line-height:1.6;margin-top:0.6rem;">
                Todo el servicio que ofrece la agencia es gratis: no te cobramos comisión por tus ingresos. Nosotros
                ganamos si vos ganás.
            </p>
            <p style="font-weight:800;color:var(--primary-light);margin-top:0.8rem;">Gracias por formar parte de Interactik Agency 💜</p>
        </div>`;
}
