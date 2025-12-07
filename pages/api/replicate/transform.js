const REPLICATE_API = "https://api.replicate.com/v1/predictions";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

async function pollPrediction(id, headers, maxMs = 60000, intervalMs = 1500) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const res = await fetch(`${REPLICATE_API}/${id}`, { headers });
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { image, prompt } = req.body || {};
  if (!image || typeof image !== "string") {
    return res.status(400).json({ message: "Image is required" });
  }
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ message: "Prompt is required" });
  }

  const replicateKey = process.env.REPLICATE_API_TOKEN || process.env.NEXT_PUBLIC_REPLICATE_KEY;
  if (!replicateKey) {
    return res.status(500).json({ message: "Missing REPLICATE_API_TOKEN (or NEXT_PUBLIC_REPLICATE_KEY)" });
  }

  // Fixed SDXL version (from replicate.com/stability-ai/sdxl)
  const modelVersion = "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc";

  try {
    const headers = {
      Authorization: `Bearer ${replicateKey}`,
      "Content-Type": "application/json",
    };

    const requestBody = {
      version: modelVersion,
      input: {
        prompt,
        image, // optional img2img; if the version does not support it, it will error.
        negative_prompt: "blurry, distorted, deformed, extra limbs, artifacts",
        num_outputs: 1,
        width: 768,
        height: 768,
        output_format: "png",
        strength: 0.55,
        refine: "expert_ensemble_refiner",
        apply_watermark: false,
        num_inference_steps: 25,
      },
    };

    const createRes = await fetch(REPLICATE_API, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error("[/api/replicate/transform] create failed", text);
      return res.status(createRes.status).json({ message: "Replicate create failed", details: text });
    }

    const created = await createRes.json();
    const predictionId = created.id;

    const result = await pollPrediction(predictionId, headers);
    const url = result?.output?.[0];
    if (!url) {
      console.error("[/api/replicate/transform] no output", result);
      return res.status(500).json({ message: "No image generated" });
    }

    // Return as URL (Replicate outputs a URL); caller can display directly.
    return res.status(200).json({ imageUrl: url });
  } catch (error) {
    console.error("[/api/replicate/transform] error", error?.message, error?.stack);
    return res.status(500).json({ message: "Error generating image", error: error.message });
  }
}

