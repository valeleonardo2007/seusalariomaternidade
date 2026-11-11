// API de Conversões da Meta — espelha no servidor os eventos do pixel.
// O token de cada advogado fica numa variável de ambiente do Vercel:
//   META_CAPI_TOKEN_<SLUG EM MAIÚSCULAS>   ex.: META_CAPI_TOKEN_EDVALDOAQUINO
// Sem a variável, a função não faz nada (o pixel do navegador continua valendo).

const GRAPH_VERSION = "v25.0";
const EVENTOS_PERMITIDOS = new Set(["Contact", "LeadCLT"]);

function readCookie(header, name) {
  const m = (header || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : undefined;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).end(); }
  }
  const { slug, pixel_id, event_name, event_id, event_source_url, content_name } = body || {};

  if (!/^[a-z0-9]{1,40}$/.test(slug || "") ||
      !/^\d{5,20}$/.test(pixel_id || "") ||
      !EVENTOS_PERMITIDOS.has(event_name) ||
      typeof event_id !== "string" || event_id.length > 64) {
    return res.status(400).end();
  }

  const token = process.env["META_CAPI_TOKEN_" + slug.toUpperCase()];
  if (!token) return res.status(204).end(); // advogado sem CAPI configurada

  const cookies = req.headers.cookie;
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || undefined;

  // Sem nome nem telefone: o contexto (gravidez) é dado sensível — só sinais técnicos.
  const user_data = {
    client_ip_address: ip,
    client_user_agent: req.headers["user-agent"],
    fbp: readCookie(cookies, "_fbp"),
    fbc: readCookie(cookies, "_fbc"),
  };

  const payload = {
    data: [{
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,                       // mesmo ID do pixel → a Meta deduplica
      action_source: "website",
      event_source_url: typeof event_source_url === "string" ? event_source_url.slice(0, 500) : undefined,
      user_data,
      custom_data: { content_name: String(content_name || "").slice(0, 100), content_category: slug },
    }],
  };

  try {
    const r = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixel_id}/events?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    if (!r.ok) {
      console.error("CAPI erro", r.status, (await r.text()).slice(0, 500)); // sem token no log
      return res.status(502).end();
    }
    return res.status(204).end();
  } catch (e) {
    console.error("CAPI falhou", e && e.message);
    return res.status(502).end();
  }
}
