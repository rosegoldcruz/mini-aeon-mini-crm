import type { Metadata } from 'next'
import AppShell from '@/components/shell/AppShell'
import AeonCursor from '@/components/shell/AeonCursor'
import './globals.css'
import './aeon-globals.css'

export const metadata: Metadata = {
  title: 'AEON CRM Minimal',
  description: 'Portable minimal AEON CRM shell',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AeonCursor />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}