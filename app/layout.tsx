import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

//Calculadora de jabones y precios
export const metadata: Metadata = {
  title: "Gaia Puravida",
  description:
    "Calculadora de jabones y precios",
  generator: "Next.js",
  applicationName: "Gaia Puravida",
  keywords: ["jabones", "precios", "calculadora"],
  authors: [
    {
      name: "Federico Marquez",
      url: "https://new-portfolio-bynano.vercel.app",
    },
  ],
  creator: "Federico Marquez",
  publisher: "Federico Marquez",
  metadataBase: new URL("https://gaia-puravida.vercel.app"),
  openGraph: {
    title: "Gaia Puravida",
    description:
      "Calculadora de jabones y precios",
    url: "https://gaia-puravida.vercel.app",
    siteName: "Gaia Puravida",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gaia Puravida",
    description:
      "Calculadora de jabones y precios",
    images: ["https://gaia-puravida.vercel.app/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/icons/icon-192x192.png",
  },
  manifest: "/manifest.json",
  alternates: {
    canonical: "https://gaia-puravida.vercel.app",
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
        className={`${inter.className} ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
