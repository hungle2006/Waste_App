import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Waste Robot Control", description: "Realtime robot dashboard" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#102a26" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="vi"><body>{children}</body></html>;
}
