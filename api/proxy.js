const ALLOWED_HOSTS = new Set([
  "www.gdacs.org",
  "gdacs.org",
  "www.nhc.noaa.gov",
  "www.ncei.noaa.gov",
]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  let target;
  try {
    if (typeof req.query?.url !== "string") throw new Error("Missing URL");
    target = new URL(req.query.url);
    if (target.protocol !== "https:" || target.port || target.username || target.password ||
        !ALLOWED_HOSTS.has(target.hostname)) {
      throw new Error("Unsupported URL");
    }
  } catch {
    return res.status(400).send("Invalid or unsupported source URL");
  }

  try {
    const response = await fetch(target, {
      redirect: "error",
      signal: AbortSignal.timeout(7000),
    });
    res.setHeader("Content-Type", response.headers.get("content-type") || "text/plain");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    return res.status(response.status).send(await response.text());
  } catch {
    return res.status(502).send("Storm data source unavailable");
  }
}
