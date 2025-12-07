const REPLICATE_API = "https://api.replicate.com/v1";

async function fetchLatestVersion(model, headers) {
  const res = await fetch(`${REPLICATE_API}/models/${model}/versions?per_page=1`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch version for ${model}: ${text}`);
  }
  const body = await res.json();
  const version = body?.results?.[0]?.id;
  if (!version) throw new Error(`No version found for ${model}`);
  return version;
}

async function pollPrediction(id, headers, maxMs = 60000, intervalMs = 1200) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const res = await fetch(`${REPLICATE_API}/predictions/${id}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Replicate poll failed: ${res.status} ${text}`);
    }
    const body = await res.json();
    if (body.status === "succeeded") return body;
    if (body.status === "failed" || body.status === "canceled") {
      throw new Error(`Replicate prediction ended: ${body.status}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Replicate poll timeout");
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { image, prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ message: "Prompt is required" });
  }

  const replicateKey = process.env.REPLICATE_API_TOKEN || process.env.NEXT_PUBLIC_REPLICATE_KEY;
  if (!replicateKey) {
    return res.status(500).json({ message: "Missing REPLICATE_API_TOKEN (or NEXT_PUBLIC_REPLICATE_KEY)" });
  }

  try {
    const headers = {
      Authorization: `Bearer ${replicateKey}`,
      "Content-Type": "application/json",
    };

    const model = "bytedance/sdxl-lightning-4step";
    const version = await fetchLatestVersion(model, headers);

    const requestBody = {
      version,
      input: {
        prompt,
        image,
        num_outputs: 1,
        width: 768,
        height: 768,
      },
    };

    const createRes = await fetch(`${REPLICATE_API}/predictions`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error("[/api/replicate/transform-lightning] create failed", text);
      return res.status(createRes.status).json({ message: "Replicate create failed", details: text });
    }

    const created = await createRes.json();
    const predictionId = created.id;
    const result = await pollPrediction(predictionId, headers, 60000, 1200);
    const url = result?.output?.[0];
    if (!url) {
      console.error("[/api/replicate/transform-lightning] no output", result);
      return res.status(500).json({ message: "No image generated" });
    }

    return res.status(200).json({ imageUrl: url });
  } catch (error) {
    console.error("[/api/replicate/transform-lightning] error", error?.message, error?.stack);
    return res.status(500).json({ message: "Error generating image", error: error.message });
  }
}

