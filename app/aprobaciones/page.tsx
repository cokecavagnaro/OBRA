import { redirect } from 'next/navigation'

// Las aprobaciones ahora viven dentro de la Bandeja (pestaña Avisos).
export default function Aprobaciones({ searchParams }: { searchParams: { tab?: string } }) {
  const { tab } = searchParams
  redirect(`/bandeja?tab=avisos&sub=${tab === 'aprobadas' ? 'aprobadas' : 'aprobar'}`)
}
