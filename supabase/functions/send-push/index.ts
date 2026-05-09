// ============================================================================
//  Edge Function: send-push
//  Envía notificaciones Web Push a usuarios suscritos.
//
//  Despliegue:
//   1) Instala Supabase CLI:  npm i -g supabase
//   2) Login + link al proyecto:
//        supabase login
//        supabase link --project-ref <TU_PROJECT_REF>
//   3) Configura los secrets:
//        supabase secrets set VAPID_PUBLIC_KEY=...
//        supabase secrets set VAPID_PRIVATE_KEY=...
//        supabase secrets set VAPID_SUBJECT=mailto:tu@correo.com
//   4) Deploy:
//        supabase functions deploy send-push --no-verify-jwt=false
//
//  La función verifica que el caller sea admin antes de enviar.
//
//  Body esperado (JSON):
//   { title, body, url?, target: { type: 'all'|'manager_group'|'user', value?: string } }
// ============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY      = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY     = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT         = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@creatorelevate.app';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: cors });

    try {
        const auth = req.headers.get('Authorization') || '';
        const jwt  = auth.replace(/^Bearer\s+/i, '');
        if (!jwt) return json({ error: 'No JWT' }, 401);

        // Cliente con el JWT del usuario para validar quién es.
        const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
            global: { headers: { Authorization: `Bearer ${jwt}` } },
        });
        const { data: { user }, error: userErr } = await userClient.auth.getUser();
        if (userErr || !user) return json({ error: 'Invalid JWT' }, 401);

        // Cliente con service role para el resto (saltea RLS).
        const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        const { data: callerProfile, error: profErr } = await admin
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        if (profErr) return json({ error: profErr.message }, 500);
        if (!callerProfile || callerProfile.role !== 'admin') {
            return json({ error: 'Forbidden — admin only' }, 403);
        }

        const { title, body, url, target } = await req.json();
        if (!title || !body) return json({ error: 'title y body requeridos' }, 400);

        // Resolver destinatarios → user_ids
        let userIds: string[] = [];
        if (!target || target.type === 'all') {
            const { data } = await admin.from('profiles').select('id').eq('role', 'creator');
            userIds = (data || []).map(r => r.id);
        } else if (target.type === 'manager_group') {
            const { data } = await admin.from('profiles').select('id').eq('manager_id', target.value);
            userIds = (data || []).map(r => r.id);
        } else if (target.type === 'user') {
            userIds = [target.value];
        }
        if (userIds.length === 0) return json({ delivered: 0, failed: 0, note: 'sin destinatarios' });

        // Cargar suscripciones
        const { data: subs, error: subErr } = await admin
            .from('push_subscriptions')
            .select('*')
            .in('user_id', userIds);
        if (subErr) return json({ error: subErr.message }, 500);

        const payload = JSON.stringify({ title, body, url });
        let delivered = 0, failed = 0;
        const stale: string[] = [];

        await Promise.all((subs || []).map(async (s) => {
            try {
                await webpush.sendNotification(
                    { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                    payload,
                );
                delivered++;
            } catch (err: any) {
                failed++;
                if (err?.statusCode === 404 || err?.statusCode === 410) stale.push(s.endpoint);
            }
        }));

        if (stale.length) {
            await admin.from('push_subscriptions').delete().in('endpoint', stale);
        }

        // Log
        await admin.from('notifications').insert({
            sent_by: user.id,
            title, body, url: url || null,
            target_type: target?.type || 'all',
            target_value: target?.value || null,
            delivered, failed,
        });

        return json({ delivered, failed });
    } catch (e: any) {
        return json({ error: e?.message || String(e) }, 500);
    }
});

function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
    });
}
