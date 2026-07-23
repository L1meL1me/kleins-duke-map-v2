import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "Klein's Duke Map · Duke + Triangle V3",
    description:
      "Duke、Durham 与 Triangle 的生活、交通和游览地图。",
    openGraph: {
      title: "Klein's Duke Map",
      description: "Duke + Triangle · V3 · 生活地点与多交通路线",
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1792,
          height: 933,
          alt: "Klein's Duke Map — Duke + Triangle V3",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Klein's Duke Map",
      description: "Duke + Triangle · V3 · 生活地点与多交通路线",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
