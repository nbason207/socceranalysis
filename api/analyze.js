

import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { clipTitle, notes, frames } = req.body || {};

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ error: "No frames provided" });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const input = [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You are a soccer analyst. Analyze short youth soccer clips from sequential frames. Be concrete, tactical, and concise. Identify the phase of play, the highlighted player's best decision, whether a better option was available, whether a secondary defender affects the decision, and whether the player should attack inside or outside."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Clip title: ${clipTitle || ""}\nUser notes: ${notes || ""}\nAnalyze these frames in sequence and return structured JSON only.`
          },
          ...frames.map((frame) => ({
            type: "input_image",
            image_url: frame
          }))
        ]
      }
    ];

    const response = await client.responses.create({
      model: "gpt-5.4",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "soccer_clip_analysis",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              phase: { type: "string" },
              primary_decision: { type: "string" },
              better_option_available: { type: "boolean" },
              best_alternative: { type: "string" },
              secondary_defender_present: { type: "boolean" },
              inside_vs_outside: { type: "string" },
              summary: { type: "string" },
              coaching_points: {
                type: "array",
                items: { type: "string" }
              },
              recommended_frame_index: { type: "integer" }
            },
            required: [
              "phase",
              "primary_decision",
              "better_option_available",
              "best_alternative",
              "secondary_defender_present",
              "inside_vs_outside",
              "summary",
              "coaching_points",
              "recommended_frame_index"
            ]
          }
        }
      }
    });

    const outputText =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "{}";

    return res.status(200).json(JSON.parse(outputText));
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error?.message || "Analysis failed"
    });
  }
}
