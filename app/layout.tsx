import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./eco-command-center.css";
export const metadata: Metadata = { title: "Waste Robot | Eco Command Center", description: "Trung tâm giám sát, nhận diện và điều khiển robot phân loại rác" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#102a26" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="vi"><body>{children}</body></html>;
}
