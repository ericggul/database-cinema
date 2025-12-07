import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb', // Increased limit for high-res images
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { image, timeOfDay, month, year, additionalPrompt, customPrompt } = req.body || {};

  if (!image || typeof image !== "string") {
    return res.status(400).json({ message: "Image is required" });
  }

  try {
    console.log("[/api/dalle/transform] request start", {
      hasImage: !!image,
      timeOfDay,
      month,
      year,
      additionalPromptLength: additionalPrompt?.length || 0,
    });

    const basePrompt = `Edit this image to show the scene at ${timeOfDay} in ${month}, ${year}.
Maintain high fidelity to the original structures and composition.`;
    const prompt = customPrompt
      ? `${customPrompt}`
      : `${basePrompt}${additionalPrompt ? `\nAdditional instructions: ${additionalPrompt}` : ""}`;

    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      console.error("[/api/dalle/transform] invalid image data");
      return res.status(400).json({ message: "Invalid image data" });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const ext = mimeType.split("/")[1] || "png";
    const buffer = Buffer.from(base64Data, "base64");

    console.log("[/api/dalle/transform] parsed image", {
      mimeType,
      bufferBytes: buffer.length,
      promptLength: prompt.length,
    });

    // Use Responses API with image_generation tool so we can pass the input image
    const response = await openai.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          input_fidelity: "high",
        },
      ],
    });

    const imageData = response.output
      ?.filter((output) => output.type === "image_generation_call")
      ?.map((output) => output.result);

    if (!imageData || imageData.length === 0) {
      console.error("[/api/dalle/transform] no image returned", response.output);
      return res.status(500).json({ message: "No image generated" });
    }

    console.log("[/api/dalle/transform] success");
    return res.status(200).json({ imageUrl: `data:image/png;base64,${imageData[0]}` });
  } catch (error) {
    console.error("[/api/dalle/transform] error", error?.message, error?.stack);
    return res.status(500).json({ message: "Error transforming scene", error: error.message });
  }
}
