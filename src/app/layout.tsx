import type { Metadata, Viewport } from "next";
import { Nunito, Fredoka } from "next/font/google";
import "./globals.css";

// Rounded, friendly type for the playful office theme.
const nunito = Nunito({
  variable: "--font-fira-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const fredoka = Fredoka({
  variable: "--font-fira-code",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "9Router Office · Fun & Colorful Blocky Office",
  description:
    "A playful isometric office diorama that visualises 9Router model routing, robot moods and token telemetry.",
  applicationName: "9Router Command Center",
};

export const viewport: Viewport = {
  themeColor: "#bfe6ff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-office-sky text-ink">{children}</body>
    </html>
  );
}
