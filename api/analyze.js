export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    phase: "API TEST PHASE",
    primary_decision: "API TEST PRIMARY DECISION",
    best_alternative: "API TEST ALTERNATIVE",
    summary: "THIS CAME FROM THE API",
    coaching_points: ["API point 1", "API point 2"]
  });
}
