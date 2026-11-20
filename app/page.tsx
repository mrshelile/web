import SystemSwitcher from "@/components/SystemSwitcher";

export default function Home() {
  return (
    <main>
      <SystemSwitcher current="workspace" />
      <h1>RiskLens</h1>
    </main>
  );
}
