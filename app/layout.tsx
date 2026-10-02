import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Waste Robot Control", description: "Realtime robot dashboard" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="vi"><body>{children}</body></html>;
}
