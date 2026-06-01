import type { Metadata } from "next";
import { Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./theme.css";
import { Toaster } from "@/components/ui/sonner";
import { NextAuthProvider } from "@/shared/providers/session-provider";
import { I18nProvider } from "@/shared/providers/i18n-provider";
import { QueryProvider } from "@/shared/providers/QueryProvider";
import { AppShell } from "@/shared/ui/custom/AppShell";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Interakt",
  description: "Oh, the places you'll go with Interakt!",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Interakt",
    description: "Oh, the places you'll go with Interakt!",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${montserrat.variable} ${geistMono.variable} antialiased`}
      >
        <I18nProvider>
          <NextAuthProvider>
            <QueryProvider>
              <AppShell>
                {children}
              </AppShell>
              <Toaster />
            </QueryProvider>
          </NextAuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
