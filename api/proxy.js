export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send("Missing url parameter");
  }

  try {
    const targetUrl = decodeURIComponent(url);
    const response = await fetch(targetUrl);

    // Set CORS headers for our Vercel client
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json");

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (error) {
    res.status(500).send(error.message);
  }
}
