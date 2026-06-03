import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { AuthIndicator } from "@/components/auth-indicator";
import { ServiceWorkerRegister } from "@/components/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Anchorpoint",
  description: "The open climbing database, reimagined.",
  manifest: "/manifest.webmanifest",
  applicationName: "Anchorpoint",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Anchorpoint",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1917" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        {/* Real-user Core Web Vitals — only emits in prod on Vercel,
            no-op locally. Lets us see actual mobile load times instead
            of guessing from synthetic curl measurements. */}
        <SpeedInsights />
        <header className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950">
          <div className="max-w-4xl mx-auto px-4 sm:px-8 py-3 flex items-center gap-3">
            <AuthIndicator />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
