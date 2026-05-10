export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    const { title, body, url, target } = payload;

    // Aquí procesaremos el envío (en el futuro con OneSignal/FCM)
    // Por ahora, devolvemos éxito inmediato para desbloquear tu App.
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Recibido por Cloudflare Pages" 
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
