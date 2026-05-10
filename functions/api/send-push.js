export async function onRequestPost(context) {
  const ONESIGNAL_APP_ID = "fd362054-cfe2-4b90-97cb-a2374f48c5c0";
  const ONESIGNAL_API_KEY = "os_v2_app_7u3cavgp4jfzbf6lui3u6sgfyaonoeqblv4e4pmaiznj7bcioncsvflfq7q55e6we7utsrmrnrns6r537jrcwvx2mz5qxjjj53b5o6q";

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

    // Siguiendo documentación: URL nueva y prefijo 'key'
    const response = await fetch("https://api.onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `key ${ONESIGNAL_API_KEY}`
      },
      body: JSON.stringify(notificationBody)
    });

    const result = await response.json();

    return new Response(JSON.stringify({ 
      success: response.ok, 
      result: result 
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
