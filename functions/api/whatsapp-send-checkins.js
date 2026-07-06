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
// Misma lógica que assets/js/config.js / scripts/tier-config.mjs /
// functions/api/whatsapp-webhook.js (cuarta copia, mismo motivo: cada
// archivo corre — o se despliega — de forma independiente). Si cambian los
// niveles/bonos, replicar el cambio en los cuatro lugares.
const VISUAL_TIERS = [
    { range: 0, name: 'Nivel 1' }, { range: 40000, name: 'Nivel 2' },
    { range: 80000, name: 'Nivel 3' }, { range: 150000, name: 'Nivel 4' },
    { range: 300000, name: 'Nivel 5' }, { range: 500000, name: 'Nivel 6' },
    { range: 800000, name: 'Nivel 7' }, { range: 1200000, name: 'Nivel 8' },
    { range: 1600000, name: 'Nivel 9' }, { range: 3000000, name: 'Nivel 10' },
];
const CASH_BONUS_MIN_HOURS = 15;
const CASH_BONUS_MIN_DAYS = 7;
const DIAMONDS_PER_USD = 200;
const CASH_BONUSES = [
    { range: 80000, subio: 30 }, { range: 150000, subio: 60 }, { range: 300000, subio: 110 },
    { range: 500000, subio: 190 }, { range: 800000, subio: 300 }, { range: 1200000, subio: 450 },
    { range: 1600000, subio: 600 },
];
const CASH_BONUSES_USA = [
    { range: 100000, subio: 30 }, { range: 200000, subio: 60 }, { range: 300000, subio: 110 },
    { range: 500000, subio: 190 }, { range: 1000000, subio: 300 }, { range: 1600000, subio: 450 },
];
const DIAMOND_REWARDS = [
    { range: 80000, reward: 1000 }, { range: 150000, reward: 1800 }, { range: 300000, reward: 3600 },
    { range: 500000, reward: 6000 }, { range: 800000, reward: 10000 }, { range: 1200000, reward: 15000 },
    { range: 1600000, reward: 20000 }, { range: 3000000, reward: 37500 },
];

function findBonusTier(diamonds, bonusTable) {
    let match = null;
    for (const tier of bonusTable) {
        if (diamonds >= tier.range) match = tier;
    }
    return match;
}

function computeNextObjective({ diamonds, validDays, liveHours, agency }) {
    let curIdx = -1;
    for (let i = VISUAL_TIERS.length - 1; i >= 0; i--) {
        if (diamonds >= VISUAL_TIERS[i].range) { curIdx = i; break; }
    }
    const nextTier = curIdx + 1 < VISUAL_TIERS.length ? VISUAL_TIERS[curIdx + 1] : null;
    if (nextTier) {
        const cashTier = findBonusTier(nextTier.range, agency === 'usa' ? CASH_BONUSES_USA : CASH_BONUSES);
        const diamondTier = findBonusTier(nextTier.range, DIAMOND_REWARDS);
        const ownEarnings = Math.round(nextTier.range / DIAMONDS_PER_USD);
        const perks = [];
        if (cashTier) perks.push(`hasta $${cashTier.subio} de bono en efectivo`);
        if (diamondTier) perks.push(`${diamondTier.reward.toLocaleString('es')} 💎 de premio`);
        const agencyPerksText = perks.length ? ` Si lo alcanzás, podrías ganar ${perks.join(' + ')} de la agencia (cumpliendo el mínimo de días y horas de ese nivel).` : '';
        return `Te faltan ${(nextTier.range - diamonds).toLocaleString('es')} 💎 para llegar a ${nextTier.name}.${agencyPerksText} `
            + `Además, con ${nextTier.range.toLocaleString('es')} 💎 acumulados tus propias ganancias de TikTok rondarían los $${ownEarnings} USD.`;
    }
    const cashTier = findBonusTier(diamonds, agency === 'usa' ? CASH_BONUSES_USA : CASH_BONUSES);
    const diamondTier = findBonusTier(diamonds, DIAMOND_REWARDS);
    const ownEarnings = Math.round(diamonds / DIAMONDS_PER_USD);
    if (liveHours >= CASH_BONUS_MIN_HOURS && validDays >= CASH_BONUS_MIN_DAYS) {
        const perks = [];
        if (cashTier) perks.push(`hasta $${cashTier.subio} de bono en efectivo`);
        if (diamondTier) perks.push(`${diamondTier.reward.toLocaleString('es')} 💎 de premio`);
        const perksText = perks.length
            ? ` ¡Ya cumplís los requisitos y podrías ganar ${perks.join(' + ')} de la agencia este período! 🎉`
            : ' ¡Ya cumplís los requisitos del bono en efectivo de este nivel! 🎉';
        return `Estás en el nivel máximo (${VISUAL_TIERS[VISUAL_TIERS.length - 1].name}).${perksText} `
            + `Tus propias ganancias de TikTok este período rondarían los $${ownEarnings} USD.`;
    }
    const missingHours = Math.max(0, CASH_BONUS_MIN_HOURS - liveHours);
    const missingDays  = Math.max(0, CASH_BONUS_MIN_DAYS - validDays);
    const parts = [];
    if (missingDays > 0)  parts.push(`${missingDays} día${missingDays !== 1 ? 's' : ''} válido${missingDays !== 1 ? 's' : ''}`);
    if (missingHours > 0) parts.push(`${missingHours.toFixed(1)}h de LIVE`);
    return (parts.length
        ? `Te faltan ${parts.join(' y ')} para el bono en efectivo de este nivel.`
        : 'Seguí así para mantener tu nivel este período.')
        + ` Tus propias ganancias de TikTok este período rondarían los $${ownEarnings} USD.`;
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
