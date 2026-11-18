import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./eco-final.css";
import "./operator-compact.css";
import "./operator-v3.css";
import "./portrait-camera.css";
import "./operator-split.css";
export const metadata: Metadata = { title: "Waste Robot | Eco Command Center", description: "Điều khiển robot phân loại rác thông minh và theo dõi camera thời gian thực" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#102a26" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="vi"><body>{children}</body></html>;
}
