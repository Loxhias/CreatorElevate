export async function onRequestPost(context) {
  const ONESIGNAL_APP_ID = "fd362054-cfe2-4b90-97cb-a2374f48c5c0";
  const ONESIGNAL_API_KEY = "os_v2_app_7u3cavgp4jfzbf6lui3u6sgfyaonoeqblv4e4pmaiznj7bcioncsvflfq7q55e6we7utsrmrnrns6r537jrcwvx2mz5qxjjj53b5o6q";

  const logs = [];
  logs.push("--- Inicio de petición en Cloudflare ---");

  try {
    const payload = await context.request.json();
    logs.push("Payload recibido en Cloudflare: " + JSON.stringify(payload));

    const { title, body, url, target } = payload;

    let notificationBody = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: body },
      url: url || undefined,
    };

    if (target.type === 'role') {
      notificationBody.filters = [{ field: "tag", key: "role", relation: "=", value: target.value }];
    } else if (target.type === 'user') {
      notificationBody.include_external_user_ids = [target.value];
    } else if (target.type === 'users') {
      notificationBody.include_external_user_ids = target.value;
    } else {
      notificationBody.included_segments = ["Subscribed Users"];
    }

    const apiUrl = "https://api.onesignal.com/api/v1/notifications";
    const authHeader = `key ${ONESIGNAL_API_KEY}`;
    
    logs.push(`Llamando a OneSignal URL: ${apiUrl}`);
    logs.push(`Usando Header Authorization: ${authHeader.substring(0, 15)}... (oculto por seguridad)`);
    logs.push(`Cuerpo enviado a OneSignal: ${JSON.stringify(notificationBody)}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader
      },
      body: JSON.stringify(notificationBody)
    });

    const result = await response.json();
    logs.push(`Respuesta de OneSignal (Status ${response.status}): ${JSON.stringify(result)}`);

    return new Response(JSON.stringify({ 
      success: response.ok, 
      result: result,
      server_logs: logs
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    logs.push("Error fatal en Cloudflare: " + err.message);
    return new Response(JSON.stringify({ error: err.message, server_logs: logs }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
