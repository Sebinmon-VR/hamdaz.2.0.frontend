import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { ThemeProvider, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

/**
 * Self-hosted at build time rather than fetched from Google at runtime — the
 * stylesheet link this replaces was render-blocking and cost a DNS lookup plus
 * a TLS handshake to a third origin before the first paint.
 *
 * Weight 800 is the one screen titles and the accent slab are set in; without
 * it they fall back to 700 and the display type stops being distinct from the
 * figures, which is the whole hierarchy on a dense screen.
 */
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
  weight: ["400", "500", "600", "700", "800"],
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
  // The frame around the app, which is what a browser paints behind it.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#c9c9d2" },
    { media: "(prefers-color-scheme: dark)", color: "#040405" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={archivo.variable} suppressHydrationWarning>
      <head>
        {/* Applies the saved palette and mode before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Every screen's first act is an API call, and the shell fires five at
            once. Warming the connection means the first does not also pay for
            DNS and the TLS handshake. */}
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
