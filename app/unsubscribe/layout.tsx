import type { Metadata } from "next";
import localFont from "next/font/local";

const yangoHeadline = localFont({
  src: "../../public/fonts/yango-headline.ttf",
  display: "swap",
  variable: "--font-yango-headline",
});

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};

export default function UnsubscribeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className={yangoHeadline.variable}>{children}</div>;
}
