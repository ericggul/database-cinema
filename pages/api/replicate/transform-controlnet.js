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

async function pollPrediction(id, headers, maxMs = 90000, intervalMs = 1500) {
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
  if (!image || typeof image !== "string") {
    return res.status(400).json({ message: "Image is required" });
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

    const model = "fermatresearch/sdxl-controlnet-lora";
    const version = await fetchLatestVersion(model, headers);

    const requestBody = {
      version,
      input: {
        prompt,
        image,
        control_image: image, // reuse source as control; for stronger edges, a pre-processed canny map would be better
        num_outputs: 1,
        width: 768,
        height: 768,
        condition_scale: 0.7,
        guidance_scale: 7.5,
        output_format: "png",
      },
    };

    const createRes = await fetch(`${REPLICATE_API}/predictions`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error("[/api/replicate/transform-controlnet] create failed", text);
      return res.status(createRes.status).json({ message: "Replicate create failed", details: text });
    }

    const created = await createRes.json();
    const predictionId = created.id;
    const result = await pollPrediction(predictionId, headers, 90000, 1500);
    const url = result?.output?.[0];
    if (!url) {
      console.error("[/api/replicate/transform-controlnet] no output", result);
      return res.status(500).json({ message: "No image generated" });
    }

    return res.status(200).json({ imageUrl: url });
  } catch (error) {
    console.error("[/api/replicate/transform-controlnet] error", error?.message, error?.stack);
    return res.status(500).json({ message: "Error generating image", error: error.message });
  }
}

