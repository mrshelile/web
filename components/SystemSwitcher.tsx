// Links the two prototypes as one product. Drop into the header of BOTH apps.
const SYSTEMS = [
  { label: "Officer workspace", href: process.env.NEXT_PUBLIC_WORKSPACE_URL ?? "https://risklens-flame.vercel.app/", hint: "Cases, signals, reconciliation" },
  { label: "CSV risk triage", href: process.env.NEXT_PUBLIC_TRIAGE_URL ?? "https://maloticodex1.netlify.app/", hint: "Upload filings, audit priority list" },
];

export default function SystemSwitcher({ current }: { current: "workspace" | "triage" }) {
  return (
    <nav aria-label="RiskLens systems" style={{ display: "flex", gap: 8 }}>
      {SYSTEMS.map((s, i) => {
        const active = (i === 0) === (current === "workspace");
        return (
          <a key={s.href} href={s.href} title={s.hint} aria-current={active ? "page" : undefined}
             style={{ padding: "6px 12px", borderRadius: 8, fontSize: 14, textDecoration: "none",
                      background: active ? "#0f766e" : "transparent", color: active ? "#fff" : "inherit",
                      border: "1px solid #0f766e" }}>
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}
