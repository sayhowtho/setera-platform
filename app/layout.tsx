import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { DemoModeProvider } from '@/lib/demo-mode-context';

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Fallback metadata for non-marketing routes (auth, dashboards). Every public
// marketing page sets its own title/description/canonical/OG via lib/seo.ts.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.heysetera.com"),
  title: "Setera | AI Reception",
  description: "AI receptionist for contractors and home-service businesses across Canada. Nothing Slips.",
  openGraph: {
    title: "Setera | AI Reception",
    description: "AI receptionist for contractors and home-service businesses across Canada. Nothing Slips.",
    url: "https://www.heysetera.com",
    siteName: "Setera",
    type: "website",
    images: [
      {
        url: "https://www.heysetera.com/opengraph-image",
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Setera | AI Reception",
    description: "AI receptionist for contractors and home-service businesses across Canada. Nothing Slips.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-CA">
      <head>
        {/* No maximum-scale: restores pinch-zoom, better for accessibility.
            viewport-fit=cover: without it, iOS confines page content to
            the "safe area" rectangle that excludes the notch/Dynamic
            Island and rounded corners, and fills the excluded margins
            with blank space — invisible in portrait (the notch sits at
            the top, a thin strip most layouts don't need to think about)
            but very visible in landscape, where the notch rotates to one
            of the *side* edges and the excluded margins become two
            symmetric bars — exactly the "white bars on both sides"
            symptom. cover tells iOS to render edge to edge instead;
            see the safe-area-inset padding on .heroSection in
            home.module.css, which keeps actual content (text, buttons)
            clear of the notch/rounded corners once the page extends
            under them, while the background photo still fills the full
            screen behind it. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className={inter.className}>
        <DemoModeProvider>
          {children}
        </DemoModeProvider>
        <Analytics />
      </body>
    </html>
  );
}