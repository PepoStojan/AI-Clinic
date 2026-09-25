import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AI-Clinic",
  description: "AI Visibility Audit",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={poppins.variable}>
      <body style={{ fontFamily: "var(--font-poppins), Poppins, -apple-system, sans-serif" }}>{children}</body>
    </html>
  );
}
