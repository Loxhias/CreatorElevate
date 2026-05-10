export async function onRequestPost(context) {
  const ONESIGNAL_APP_ID = "fd362054-cfe2-4b90-97cb-a2374f48c5c0";
  const ONESIGNAL_API_KEY = "ji2nmapmwewhfzvd3jhlbzpe6";

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

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${ONESIGNAL_API_KEY}`
      },
      body: JSON.stringify(notificationBody)
    });

    const result = await response.json();

    // Devolvemos el resultado real de OneSignal a la App para ver el error
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
      status: response.ok ? 200 : 400
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
