import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};

export default function UnsubscribeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
