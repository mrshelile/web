import { NextRequest, NextResponse } from "next/server";
import { scoreProfile } from "@/lib/riskClient";

// Allow the Netlify CSV triage tool to call this API. Set ALLOWED_ORIGINS in env.
const allowed = (process.env.ALLOWED_ORIGINS ?? "https://maloticodex1.netlify.app").split(",");
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : allowed[0],
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get("origin"));
  // TODO (production): verify the officer session and role here (gateway) and write the audit log entry.
  try {
    const profile = await req.json();
    if (!profile || typeof profile !== "object") return NextResponse.json({ error: "Invalid profile" }, { status: 400, headers });
    const result = await scoreProfile(profile);
    return NextResponse.json(result, { headers });
  } catch (e) {
    return NextResponse.json({ error: "Scoring unavailable" }, { status: 502, headers });
  }
}
