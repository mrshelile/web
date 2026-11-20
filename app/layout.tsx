import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RiskLens | Tax Intelligence",
  description: "Evidence-based tax risk screening and officer review workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
