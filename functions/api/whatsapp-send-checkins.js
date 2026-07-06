/**
 * Cloudflare Pages Function — POST /api/whatsapp-send-checkins
 *
 * Dispara el envío de "progreso actual" por WhatsApp a todos los creadores
 * con WhatsApp vinculado, usando las métricas más recientes. La llama el
 * admin desde "Cargar Datos" justo después de publicar un Excel nuevo (ver
 * assets/js/views/adminDashboard.js) — así el check-in sale con los datos
 * frescos en vez de esperar al cron semanal de
 * .github/workflows/whatsapp-checkin.yml (que sigue corriendo aparte, como
 * recordatorio de respaldo si en una semana no se sube ningún Excel).
 *
 * Requiere en Cloudflare → Pages → Settings → Environment Variables:
 *   SUPABASE_URL, SUPABASE_ANON_KEY   (verificar la sesión del admin que llama)
 *   SUPABASE_SERVICE_ROLE_KEY         (Secret — leer candidatos sin pasar por RLS)
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER, TWILIO_CONTENT_SID
 *   WHATSAPP_CHECKIN_COOLDOWN_HOURS   (opcional, default 12 — no reenviar antes de N horas)
 */

const ALLOWED_ORIGINS = [
    "https://creatorelevate.pages.dev",
    "https://interactik.creatorelevate.pages.dev",
    "https://app.interactikagency.com",
];

function corsHeaders(requestOrigin, appOrigin) {
    const allowed = [...ALLOWED_ORIGINS, appOrigin].filter(Boolean);
    const origin  = allowed.includes(requestOrigin) ? requestOrigin : (appOrigin || ALLOWED_ORIGINS[0]);
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Vary": "Origin",
    };
}

export async function onRequestOptions(context) {
    const origin    = context.request.headers.get("Origin") || "";
    const appOrigin = context.env?.APP_ORIGIN || "https://creatorelevate.pages.dev";
    return new Response(null, { headers: corsHeaders(origin, appOrigin) });
}

// ── Cliente mínimo de Supabase REST con service_role (bypassea RLS) ────────
// Copia deliberada de la misma utilidad en functions/api/whatsapp-webhook.js
// — se mantiene separada a propósito para no arriesgar ese webhook (ya en
// producción recibiendo tráfico real de Twilio) al tocarlo por este feature.
function supabaseAdmin(url, serviceKey) {
    const base = `${url}/rest/v1`;
    const headers = {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
    };
    function qs(filters) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(filters || {})) params.set(k, v);
        return params.toString();
    }
    return {
        async select(table, filters) {
            const res = await fetch(`${base}/${table}?${qs(filters)}`, { headers });
            if (!res.ok) throw new Error(`Supabase select ${table} falló: ${res.status}`);
            return res.json();
        },
        async selectOne(table, filters) {
            const rows = await this.select(table, { ...filters, limit: '1' });
            return rows[0] || null;
        },
        async insert(table, row) {
            const res = await fetch(`${base}/${table}`, {
                method: 'POST',
                headers: { ...headers, Prefer: 'return=minimal' },
                body: JSON.stringify(row),
            });
            if (!res.ok) {
                const t = await res.text().catch(() => '');
                throw new Error(`Supabase insert ${table} falló: ${res.status} ${t}`);
            }
        },
    };
}

// ── Cálculo de "próximo objetivo" ────────────────────────────────────────
// Misma lógica que scripts/tier-config.mjs y functions/api/whatsapp-webhook.js
// (tres copias, mismo motivo: cada archivo corre — o se despliega — de forma
// independiente). Si cambian los niveles/bonos, replicar el cambio en los
// tres lugares.
const CASH_BONUS_MIN_HOURS = 15;
const CASH_BONUS_MIN_DAYS = 7;
const DIAMONDS_PER_USD = 200;
// range/subio/mantiene: mismos valores que assets/js/config.js. "mantiene" hace
// falta acá (a diferencia de la tabla vieja que solo tenía "subio") porque el
// nuevo cálculo compara contra el nivel del mes anterior.
const CASH_BONUSES = [
    { level: 'Nivel 1', range: 80000,   subio: 30,  mantiene: 15 },
    { level: 'Nivel 2', range: 150000,  subio: 60,  mantiene: 30 },
    { level: 'Nivel 3', range: 300000,  subio: 110, mantiene: 55 },
    { level: 'Nivel 4', range: 500000,  subio: 190, mantiene: 95 },
    { level: 'Nivel 5', range: 800000,  subio: 300, mantiene: 150 },
    { level: 'Nivel 6', range: 1200000, subio: 450, mantiene: 225 },
    { level: 'Nivel 7', range: 1600000, subio: 600, mantiene: 300 },
];
const CASH_BONUSES_USA = [
    { level: 'Nivel 1', range: 100000,  subio: 30,  mantiene: 15 },
    { level: 'Nivel 2', range: 200000,  subio: 60,  mantiene: 30 },
    { level: 'Nivel 3', range: 300000,  subio: 110, mantiene: 55 },
    { level: 'Nivel 4', range: 500000,  subio: 190, mantiene: 95 },
    { level: 'Nivel 5', range: 1000000, subio: 300, mantiene: 150 },
    { level: 'Nivel 6', range: 1600000, subio: 450, mantiene: 225 },
];

function fmt(n) { return Math.round(n).toLocaleString('es'); }

// Índice del tier más alto de bonusTable cuyo umbral ya cubre "diamonds"
// (-1 si todavía no llega ni al primero).
function tierIdx(diamonds, bonusTable) {
    for (let i = bonusTable.length - 1; i >= 0; i--) {
        if (diamonds >= bonusTable[i].range) return i;
    }
    return -1;
}

const ELITE_MIN_HOURS = 90;
const ELITE_MIN_DAYS = 22;

function daysElapsedInMonth() { return new Date().getDate(); }
function daysInCurrentMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

/**
 * Arma el mensaje de progreso detallado para la variable {{6}} del template
 * de WhatsApp (texto libre, no requiere re-aprobación de Meta). Incluye
 * tendencia vs. mes anterior, estado de días/horas, y el bono en efectivo
 * calculado según el NIVEL DEL MES ANTERIOR (retener o subir), no un umbral
 * genérico. Misma lógica que scripts/tier-config.mjs — ver comentario ahí
 * sobre por qué está duplicada en cada runtime.
 */
function computeNextObjective({ diamonds, diamondsLastMonth = 0, validDays, liveHours, agency }) {
    const cashBonuses = agency === 'usa' ? CASH_BONUSES_USA : CASH_BONUSES;
    const ownEarnings = Math.round(diamonds / DIAMONDS_PER_USD);

    const elapsed   = daysElapsedInMonth();
    const totalDays = daysInCurrentMonth();
    const rateThis  = elapsed > 0 ? diamonds / elapsed : 0;
    const rateLast  = diamondsLastMonth > 0 ? diamondsLastMonth / 31 : 0;
    let trendLine;
    if (rateLast <= 0) {
        trendLine = rateThis > 0
            ? `📈 Vas a ${fmt(rateThis)} 💎/día (el mes pasado no tuvo actividad registrada).`
            : `Todavía no registra actividad este mes.`;
    } else {
        const paceRatio = (rateThis / rateLast) * 100;
        if (paceRatio >= 105) trendLine = `📈 Va mejor que el mes pasado: ${fmt(rateThis)} 💎/día (mes pasado: ${fmt(rateLast)} 💎/día).`;
        else if (paceRatio >= 85) trendLine = `➡️ Va a un ritmo parecido al mes pasado: ${fmt(rateThis)} 💎/día (mes pasado: ${fmt(rateLast)} 💎/día).`;
        else trendLine = `📉 Va por debajo del mes pasado: ${fmt(rateThis)} 💎/día (mes pasado: ${fmt(rateLast)} 💎/día).`;
    }

    const daysLine = validDays >= ELITE_MIN_DAYS
        ? `✅ Días válidos: ya cumple el máximo (${ELITE_MIN_DAYS}+).`
        : validDays >= CASH_BONUS_MIN_DAYS
            ? `✓ Días válidos: activo — le faltan ${ELITE_MIN_DAYS - validDays} para el tope élite (${ELITE_MIN_DAYS}).`
            : `⚠️ Días válidos: le faltan ${CASH_BONUS_MIN_DAYS - validDays} para activar el bono en efectivo (mínimo ${CASH_BONUS_MIN_DAYS}).`;

    const hoursLine = liveHours >= ELITE_MIN_HOURS
        ? `✅ Horas de LIVE: ya cumple el máximo (${ELITE_MIN_HOURS}h+).`
        : liveHours >= CASH_BONUS_MIN_HOURS
            ? `✓ Horas de LIVE: activo — le faltan ${(ELITE_MIN_HOURS - liveHours).toFixed(1)}h para el tope élite (${ELITE_MIN_HOURS}h).`
            : `⚠️ Horas de LIVE: le faltan ${(CASH_BONUS_MIN_HOURS - liveHours).toFixed(1)}h para activar el bono en efectivo (mínimo ${CASH_BONUS_MIN_HOURS}h).`;

    const lastMonthIdx = tierIdx(diamondsLastMonth, cashBonuses);
    const meetsCash    = liveHours >= CASH_BONUS_MIN_HOURS && validDays >= CASH_BONUS_MIN_DAYS;
    let bonusLine;

    if (lastMonthIdx < 0) {
        const first = cashBonuses[0];
        const missing = Math.max(0, first.range - diamonds);
        bonusLine = missing > 0
            ? `💵 Bono en efectivo: le faltan ${fmt(missing)} 💎 para desbloquear su primer nivel (hasta $${first.mantiene}).`
            : `💵 Bono en efectivo: ¡ya alcanzó su primer nivel! Va a cobrar hasta $${first.mantiene}.`;
    } else {
        const retain = cashBonuses[lastMonthIdx];
        const up     = cashBonuses[lastMonthIdx + 1] || null;
        if (diamonds < retain.range) {
            const missing = retain.range - diamonds;
            bonusLine = `⚠️ Bono en efectivo: va a BAJAR de su nivel del mes pasado (${retain.level}) si no suma ${fmt(missing)} 💎 más. Que mantenga el nivel para asegurar $${retain.mantiene}.`;
        } else if (up && diamonds < up.range) {
            const missing = up.range - diamonds;
            bonusLine = `✅ Bono en efectivo: ya asegura mantener su nivel del mes pasado (${retain.level}, $${retain.mantiene}). Le faltan ${fmt(missing)} 💎 para subir a ${up.level} y cobrar $${up.subio}.`;
        } else {
            const topLevel = up ? up.level : retain.level;
            const topAmt   = up ? up.subio : retain.subio;
            bonusLine = `🚀 Bono en efectivo: ¡superó su nivel del mes pasado! Va camino a ${topLevel} y podría cobrar hasta $${topAmt}.`;
        }
        if (!meetsCash) {
            bonusLine += ` (Ojo: para cobrar necesita mínimo ${CASH_BONUS_MIN_DAYS} días válidos y ${CASH_BONUS_MIN_HOURS}h de LIVE — todavía no los cumple.)`;
        }
    }

    return [
        `Día ${elapsed} de ${totalDays} del mes.`,
        trendLine,
        daysLine,
        hoursLine,
        bonusLine,
        `Sus propias ganancias de TikTok este mes rondarían los $${ownEarnings} USD.`,
    ].join('\n');
}

async function sendTwilioTemplate({ accountSid, authToken, from, to, contentSid, variables }) {
    const auth = btoa(`${accountSid}:${authToken}`);
    const body = new URLSearchParams({
        To: `whatsapp:${to}`,
        From: `whatsapp:${from}`,
        ContentSid: contentSid,
        ContentVariables: JSON.stringify(variables),
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twilio error ${res.status}: ${JSON.stringify(data)}`);
    return data;
}

export async function onRequestPost(context) {
    const origin     = context.request.headers.get("Origin") || "";
    const APP_ORIGIN = context.env?.APP_ORIGIN || "https://creatorelevate.pages.dev";
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), {
        status, headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin, APP_ORIGIN) },
    });

    const SUPABASE_URL              = context.env?.SUPABASE_URL || '';
    const SUPABASE_ANON_KEY         = context.env?.SUPABASE_ANON_KEY || '';
    const SUPABASE_SERVICE_ROLE_KEY = context.env?.SUPABASE_SERVICE_ROLE_KEY || '';
    const TWILIO_ACCOUNT_SID        = context.env?.TWILIO_ACCOUNT_SID || '';
    const TWILIO_AUTH_TOKEN         = context.env?.TWILIO_AUTH_TOKEN || '';
    const TWILIO_WHATSAPP_NUMBER    = context.env?.TWILIO_WHATSAPP_NUMBER || '';
    const TWILIO_CONTENT_SID        = context.env?.TWILIO_CONTENT_SID || '';
    const cooldownHours             = Number(context.env?.WHATSAPP_CHECKIN_COOLDOWN_HOURS) || 12;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY
        || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER || !TWILIO_CONTENT_SID) {
        return reply({ success: false, error: 'Servidor mal configurado — faltan variables de WhatsApp/Twilio en Cloudflare Pages.' }, 500);
    }

    try {
        // ── 1. Solo un admin autenticado puede disparar el envío ───────────
        const authHeader = context.request.headers.get("Authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return reply({ success: false, error: 'No autorizado.' }, 401);

        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
        });
        if (!userRes.ok) return reply({ success: false, error: 'Sesión inválida o expirada.' }, 401);
        const userData = await userRes.json().catch(() => null);
        if (!userData?.id) return reply({ success: false, error: 'Sesión inválida.' }, 401);

        const sb = supabaseAdmin(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const callerProfile = await sb.selectOne('profiles', { select: 'role', id: `eq.${userData.id}` });
        if (callerProfile?.role !== 'admin') {
            return reply({ success: false, error: 'Solo un admin puede disparar este envío.' }, 403);
        }

        // ── 2. Candidatos con WhatsApp vinculado ────────────────────────────
        const candidates = await sb.select('whatsapp_checkin_candidates', { select: '*' });

        const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
        let sent = 0, skipped = 0, failed = 0;
        const errors = [];

        for (const c of candidates) {
            try {
                const recent = await sb.select('whatsapp_messages_log', {
                    select: 'id',
                    profile_id: `eq.${c.profile_id}`,
                    message_type: 'eq.progress_checkin',
                    direction: 'eq.outbound',
                    created_at: `gte.${since}`,
                    limit: '1',
                });
                if (recent.length) { skipped++; continue; }

                const liveHours = Number(c.live_seconds || 0) / 3600;
                const objective = computeNextObjective({
                    diamonds: Number(c.diamonds || 0),
                    diamondsLastMonth: Number(c.diamonds_last_month || 0),
                    validDays: Number(c.valid_days || 0),
                    liveHours,
                    agency: c.agency,
                });

                const variables = {
                    1: c.display_name || c.username,
                    2: Number(c.diamonds || 0).toLocaleString('es'),
                    3: String(c.valid_days || 0),
                    4: liveHours.toFixed(1),
                    5: String(c.battles || 0),
                    6: objective,
                };

                await sendTwilioTemplate({
                    accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN,
                    from: TWILIO_WHATSAPP_NUMBER, to: c.whatsapp_number,
                    contentSid: TWILIO_CONTENT_SID, variables,
                });
                await sb.insert('whatsapp_messages_log', {
                    profile_id: c.profile_id, direction: 'outbound',
                    message_type: 'progress_checkin', body: `[template] ${JSON.stringify(variables)}`,
                });
                sent++;
            } catch (err) {
                failed++;
                errors.push(`@${c.username}: ${err?.message || String(err)}`);
            }
        }

        return reply({ success: true, candidates: candidates.length, sent, skipped, failed, errors });
    } catch (err) {
        return reply({ success: false, error: err?.message || String(err) }, 500);
    }
}
