import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "DTR Access",
  description: "Login and account creation for the DTR platform",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
