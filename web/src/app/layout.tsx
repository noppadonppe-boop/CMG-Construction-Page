import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { AuthProvider } from "@/lib/auth/context";
import "./globals.css";

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CMG Project Hub",
  description: "ระบบบริหารโครงการก่อสร้าง — ข้อมูล รายงาน และติดตามงานในที่เดียว",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${plexThai.variable} h-full antialiased`}>
      <body className="min-h-full text-sm leading-normal">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
