import type { Metadata, Viewport } from 'next'
import { Fragment_Mono } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'

const fragmentMono = Fragment_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-fragment-mono',
})

export const metadata: Metadata = {
  title: 'Costia',
  description: 'Gestión de gastos para proyectos de construcción',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={fragmentMono.variable}>
        <div className="app-container">
          <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  )
}
