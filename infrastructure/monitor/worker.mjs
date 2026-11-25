async function notify(env, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text
      }),
      signal: AbortSignal.timeout(15000)
    }
  );

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error("Telegram bildirimi gönderilemedi.");
  }
}

async function check(env) {
  let healthy = false;

  try {
    const response = await fetch(
      "https://halic-mind-source.onrender.com/health?monitor=" + Date.now(),
      {
        cache: "no-store",
        signal: AbortSignal.timeout(60000)
      }
    );

    const data = await response.json();
    healthy = response.ok && data.status === "ok";
    console.log("Render health status:", response.status);
  } catch {
    console.error("Render health request failed");
    healthy = false;
  }

  const current = healthy ? "up" : "down";
  const previous = await env.MONITOR_STATE.get("status");

  if (current === previous) return;

  const time = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul"
  });

  const text = previous === null
    ? `🔎 Haliç Mind izleme başladı.\nSunucu: ${
        healthy ? "çalışıyor ✅" : "yanıt vermiyor ❌"
      }\n${time}`
    : healthy
      ? `✅ Haliç Mind yeniden çalışıyor.\n${time}`
      : `❌ Haliç Mind sağlık kontrolüne yanıt vermiyor.\n${time}`;

  await notify(env, text);

  // Bildirim başarısızsa sonraki kontrolde yeniden denenir.
  await env.MONITOR_STATE.put("status", current);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      check(env).catch(() => {
        console.error("İzleme veya bildirim işlemi tamamlanamadı.");
        throw new Error("Monitor kontrolü başarısız.");
      })
    );
  },

  async fetch() {
    return new Response("Haliç Mind monitor aktif.");
  }
};