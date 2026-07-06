// Check-in programado por WhatsApp — corre desde
// .github/workflows/whatsapp-checkin.yml (cron semanal + workflow_dispatch manual).
//
// Para cada creador con WhatsApp vinculado (profiles.whatsapp_number), manda
// un mensaje de progreso (diamantes, días válidos, horas, batallas + próximo
// objetivo) usando un Message Template ya aprobado por Meta vía Twilio.
// Respeta un cooldown para no reenviar el mismo check-in dentro del período.
//
// Variables de entorno requeridas (GitHub Actions Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER
//   TWILIO_CONTENT_SID       (el Content SID del template aprobado, ej. "HXxxxx")
//   CHECKIN_COOLDOWN_DAYS    (opcional, default 6 — no reenviar antes de N días)

import { computeNextObjective } from './tier-config.mjs';

const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_NUMBER,
    TWILIO_CONTENT_SID,
    CHECKIN_COOLDOWN_DAYS = '6',
} = process.env;

function requireEnv() {
    const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER', 'TWILIO_CONTENT_SID']
        .filter(k => !process.env[k]);
    if (missing.length) {
        console.error('Faltan variables de entorno:', missing.join(', '));
        process.exit(1);
    }
}

function supabaseHeaders() {
    return {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
    };
}

async function fetchCandidates() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_checkin_candidates?select=*`, {
        headers: supabaseHeaders(),
    });
    if (!res.ok) throw new Error(`Error consultando whatsapp_checkin_candidates: ${res.status} ${await res.text()}`);
    return res.json();
}

async function wasRecentlyMessaged(profileId, cooldownDays) {
    const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
        select: 'id',
        profile_id: `eq.${profileId}`,
        message_type: 'eq.progress_checkin',
        direction: 'eq.outbound',
        created_at: `gte.${since}`,
        limit: '1',
    });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages_log?${params}`, {
        headers: supabaseHeaders(),
    });
    if (!res.ok) throw new Error(`Error chequeando cooldown: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    return rows.length > 0;
}

async function logMessage(row) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages_log`, {
        method: 'POST',
        headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(`Error logueando mensaje: ${res.status} ${await res.text()}`);
}

async function sendTwilioTemplate({ to, variables }) {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const body = new URLSearchParams({
        To: `whatsapp:${to}`,
        From: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
        ContentSid: TWILIO_CONTENT_SID,
        ContentVariables: JSON.stringify(variables),
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
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

async function main() {
    requireEnv();
    const cooldownDays = Number(CHECKIN_COOLDOWN_DAYS) || 6;

    const candidates = await fetchCandidates();
    console.log(`Candidatos con WhatsApp vinculado: ${candidates.length}`);

    let sent = 0, skipped = 0, failed = 0;

    for (const c of candidates) {
        try {
            if (await wasRecentlyMessaged(c.profile_id, cooldownDays)) {
                skipped++;
                continue;
            }

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

            await sendTwilioTemplate({ to: c.whatsapp_number, variables });
            await logMessage({
                profile_id: c.profile_id,
                direction: 'outbound',
                message_type: 'progress_checkin',
                body: `[template] ${JSON.stringify(variables)}`,
            });
            sent++;
            console.log(`✓ Enviado a @${c.username}`);
        } catch (err) {
            failed++;
            console.error(`✗ Falló @${c.username}:`, err.message);
        }
    }

    console.log(`\nResumen: ${sent} enviados, ${skipped} en cooldown, ${failed} fallidos.`);
    if (failed > 0) process.exitCode = 1;
}

main().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
