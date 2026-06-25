import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Obra360',
  description: 'Gestión de gastos para obras de construcción',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <div className="app-container">
          <main className="pb-16">{children}</main>
          <BottomNav pendientes={2} />
        </div>
      </body>
    </html>
  )
}
