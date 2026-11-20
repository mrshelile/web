import { NextResponse } from "next/server";
export async function GET() {
  const base = process.env.RISK_ENGINE_URL ?? "http://localhost:8000";
  try {
    const r = await fetch(`${base}/health`, { cache: "no-store" });
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
