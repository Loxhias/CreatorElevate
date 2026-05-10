export async function onRequestPost(context) {
  const ONESIGNAL_APP_ID = "fd362054-cfe2-4b90-97cb-a2374f48c5c0";
  const ONESIGNAL_API_KEY = "os_v2_app_7u3cavgp4jfzbf6lui3u6sgfyaonoeqblv4e4pmaiznj7bcioncsvflfq7q55e6we7utsrmrnrns6r537jrcwvx2mz5qxjjj53b5o6q";

  const logs = [];
  logs.push("--- Inicio de intento con Base64 ---");

  try {
    const payload = await context.request.json();
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

    // Probamos el formato Basic con la Key (muchas APIs de OneSignal v2 lo requieren así)
    const authHeader = `Basic ${ONESIGNAL_API_KEY}`;
    
    logs.push(`Probando con Header: ${authHeader.substring(0, 20)}...`);

    const response = await fetch("https://api.onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": authHeader
      },
      body: JSON.stringify(notificationBody)
    });

    const result = await response.json();
    logs.push(`Respuesta OneSignal: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify({ 
      success: response.ok, 
      result: result,
      server_logs: logs
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, server_logs: logs }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
