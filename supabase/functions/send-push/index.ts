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

  console.log("📥 Petición recibida");

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    console.log("📦 Payload:", JSON.stringify(payload));

    const { title, body, url, target } = payload

    // 1. Buscar suscripciones
    console.log("🔍 Buscando suscripciones para:", target.type);
    let query = supabase.from('push_subscriptions').select('user_id')

    if (target.type === 'role') {
      const { data: users } = await supabase.from('profiles').select('id').eq('role', target.value)
      query = query.in('user_id', (users || []).map(u => u.id))
    } else if (target.type === 'user') {
      query = query.eq('user_id', target.value)
    } else if (target.type === 'users') {
      query = query.in('user_id', target.value)
    }

    const { data: subs, error: subError } = await query
    if (subError) throw new Error("Error en suscripciones: " + subError.message)

    console.log(`✅ Suscripciones encontradas: ${subs?.length || 0}`);

    // 2. Registrar la notificación
    const { error: logError } = await supabase.from('notifications').insert({
      title,
      body,
      url,
      target_type: target.type,
      target_value: JSON.stringify(target.value),
      delivered: subs?.length || 0
    })

    if (logError) console.error("❌ Error al loguear:", logError.message);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Procesado. Destinatarios: ${subs?.length || 0}`,
        subs_found: subs?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("💥 Error fatal:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
