import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

/**
 * Self-hosted at build time rather than fetched from Google at runtime. The
 * stylesheet link this replaces was render-blocking and cost a DNS lookup plus
 * a TLS handshake to a third origin before the first paint.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  // The app uses 300 for its hero figures and 600 for emphasis; shipping only
  // what is used keeps the font payload to a fraction of the full family.
  weight: ["300", "400", "500", "600"],
});

const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").origin;
  } catch {
    return null;
  }
})();

export const metadata: Metadata = {
  title: { default: "Hamdaz", template: "%s · Hamdaz" },
  description: "Teams, leave, proposals, quotes and supplier comparison for Hamdaz.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8e8ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before the first paint. Without it a
            dark-mode viewer gets a white flash on every hard load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Every screen's first action is an API call, and the shell fires five
            of them at once. Warming the connection here means the first of
            those does not also pay for DNS and the TLS handshake. */}
        {API_ORIGIN && (
          <>
            <link rel="preconnect" href={API_ORIGIN} crossOrigin="use-credentials" />
            <link rel="dns-prefetch" href={API_ORIGIN} />
          </>
        )}
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
