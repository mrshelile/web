// Server-side client for the Python risk engine. Never call the engine from the browser.
export type Evidence = { source: string; record_ref: string; detail: string };
export type Flag = { rule_id: string; name: string; severity: number; exposure: number; summary: string; evidence: Evidence[] };
export type RiskResult = {
  tin: string; name: string; rule_version: string;
  risk_score: number; data_confidence: number; confidence_notes: string[];
  potential_exposure: number; priority: "High priority" | "Needs review" | "Informational";
  flags: Flag[]; advisory: string;
};

export async function scoreProfile(profile: unknown): Promise<RiskResult> {
  const base = process.env.RISK_ENGINE_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ENGINE_API_KEY ?? "" },
    body: JSON.stringify(profile),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Risk engine responded ${res.status}`);
  return res.json();
}
