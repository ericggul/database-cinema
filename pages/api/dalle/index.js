import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { prompt, quality } = req.body || {};

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ message: "Prompt is required" });
  }

  const allowedQuality = ["low", "medium", "high"];
  const selectedQuality = allowedQuality.includes(quality) ? quality : "low";

  try {
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: selectedQuality,
    });

    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ message: "No image generated" });
    }

    return res.status(200).json({ imageUrl: `data:image/png;base64,${b64}` });
  } catch (error) {
    console.error("Error generating image:", error);
    return res.status(500).json({ message: "Error generating image", error: error.message });
  }
}
