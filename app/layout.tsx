import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

const yangoText = localFont({
  src: [
    { path: "../public/fonts/yango-text-rg.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/yango-text-md.ttf", weight: "500", style: "normal" },
    { path: "../public/fonts/yango-text-bd.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-yango-text",
  display: "swap",
});

const yangoHeadline = localFont({
  src: [{ path: "../public/fonts/yango-headline.ttf", weight: "700", style: "normal" }],
  variable: "--font-yango-headline",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Appli Taxi Oz",
  description: "Appli Taxi Oz internal CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${yangoText.variable} ${yangoHeadline.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
