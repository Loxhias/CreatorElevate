import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { title, body, url, target } = await req.json()

    // 1. Obtener los destinatarios (suscripciones)
    let query = supabase.from('push_subscriptions').select('*')

    if (target.type === 'role') {
      // Unir con profiles para filtrar por rol
      const { data: users } = await supabase.from('profiles').select('id').eq('role', target.value)
      const ids = (users || []).map(u => u.id)
      query = query.in('user_id', ids)
    } else if (target.type === 'user') {
      query = query.eq('user_id', target.value)
    } else if (target.type === 'users') {
      query = query.in('user_id', target.value)
    }

    const { data: subs, error: subError } = await query
    if (subError) throw subError

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No hay suscripciones activas para este destino.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Aquí iría la lógica real de envío a FCM/VAPID 
    // Por ahora simularemos el envío exitoso y guardaremos en la tabla de notifications
    const { error: logError } = await supabase.from('notifications').insert({
      title,
      body,
      url,
      target_type: target.type === 'role' ? 'manager_group' : 'user', // simplificado para el log
      target_value: JSON.stringify(target.value),
      delivered: subs.length
    })

    return new Response(JSON.stringify({ success: true, sent: subs.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
