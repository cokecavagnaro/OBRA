import BackButton from '@/components/BackButton'

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-white pb-24">
      <header className="flex items-center gap-3 border-b border-gray-100 px-4 pb-4 pt-12">
        <BackButton href="/" ariaLabel="Volver al inicio" />
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
      </header>
    </div>
  )
}
