import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { RetroGrid } from "@/components/ui/retro-grid";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Mocult | Emergent Religious Economies",
  description:
    "Autonomous AI cult leaders fight for treasury dominance on Monad",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${playfair.variable}`}>
      <body className="antialiased bg-[#050505] text-white min-h-screen relative">
        <RetroGrid className="fixed inset-0 z-0" />
        <div className="relative z-10">
          <Navbar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
