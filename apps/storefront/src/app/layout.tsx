import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { AuroraBackdrop } from "@/components/site/AuroraBackdrop";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CloudOps Shop",
  description: "Storefront demo for the CloudOps platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="relative flex min-h-screen flex-col bg-bg-base">
        <AuroraBackdrop />
        <Navbar />
        <div className="relative flex-1">{children}</div>
        <Footer />
        <Toaster />
      </body>
    </html>
  );
}
