import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrueYacht Office",
  description: "Staff review queue for crew expense submissions",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
