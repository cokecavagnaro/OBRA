import { redirect } from 'next/navigation'

// La pantalla de pendientes ahora vive dentro de la Bandeja. Se mantiene la
// ruta vieja para no romper links guardados.
export default function Pendientes({ searchParams }: { searchParams: { proyecto?: string } }) {
  const { proyecto } = searchParams
  redirect(`/bandeja?tab=pendientes${proyecto ? `&proyecto=${encodeURIComponent(proyecto)}` : ''}`)
}
