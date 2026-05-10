import type { Metadata } from "next";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from '@/components/ui/sonner';
import { Nav } from '@/components/nav';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

const montserrat = Montserrat({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pump Track",
  description: "IoT irrigation dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(geistSans.variable, geistMono.variable, "font-sans", montserrat.variable)}>
      <body>
        <ThemeProvider>
          <Nav />
          {children}
          <ThemeToggle />
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
