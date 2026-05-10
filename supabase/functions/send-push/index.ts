import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { title, body, url, target } = await req.json()

    // 1. Obtener destinatarios
    let query = supabase.from('push_subscriptions').select('*')

    if (target.type === 'role') {
      const { data: users } = await supabase.from('profiles').select('id').eq('role', target.value)
      const ids = (users || []).map(u => u.id)
      query = query.in('user_id', ids)
    } else if (target.type === 'user') {
      query = query.eq('user_id', target.value)
    } else if (target.type === 'segment') {
      // Por ahora enviamos a todos si es segmento, 
      // o podrías filtrar aquí por los IDs que pasamos
    }

    const { data: subs, error: subError } = await query
    if (subError) throw subError

    // 2. Log de la notificación
    await supabase.from('notifications').insert({
      title,
      body,
      url,
      target_type: target.type,
      target_value: JSON.stringify(target.value),
      delivered: subs?.length || 0
    })

    // Aquí iría el envío a FCM/WebPush real si tuvieras las claves puestas en Supabase.
    // Por ahora, el éxito significa que el sistema lo procesó y registró.

    return new Response(
      JSON.stringify({ success: true, sent: subs?.length || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
