import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "slither-neuron · CL1 Live Training",
  description: "Biological neural substrate playing slither.io via Cortical Labs CL1 Cloud",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
