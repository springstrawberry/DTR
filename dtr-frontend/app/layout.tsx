import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Daily Time Record",
  description: "Login and account creation for the DTR platform",
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='%23667eea' width='100' height='100'/><text x='50' y='70' font-size='80' fill='white' text-anchor='middle' font-weight='bold'>D</text></svg>",
        type: "image/svg+xml",
      },
    ],
  },
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
