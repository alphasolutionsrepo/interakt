import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Header from "@/components/header";
import { SettingsProvider } from "@/contexts/settings-context";
import { ThemeProvider } from "@/components/theme-provider";

// Montserrat (Latin, weights 300-700) ships with the site, so the build never downloads it.
// From Google Fonts; SIL Open Font License, see fonts/OFL.txt
const montserrat = localFont({
  src: "./fonts/montserrat-latin.woff2",
  variable: "--font-montserrat",
  display: "swap",
  weight: "300 700",
});

export const metadata: Metadata = {
  title: "Interakt Demos",
  description: "Demo site for Interakt search and chat experiences.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${montserrat.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SettingsProvider>
            <Header />
            <main className="min-h-screen">
              {children}
            </main>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
