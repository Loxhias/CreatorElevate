export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const payload = await request.json();
      const { title, body, url, target } = payload;

      // Aquí podrías integrar con OneSignal o Firebase directamente
      // Por ahora, simulamos el éxito para desbloquear tu App
      
      return new Response(
        JSON.stringify({ success: true, message: "Mensaje procesado por Cloudflare" }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  },
};
