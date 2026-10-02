import { redirect } from 'next/navigation'

// Las notificaciones ahora viven dentro de la Bandeja (pestaña Avisos).
export default function Notificaciones() {
  redirect('/bandeja?tab=avisos&sub=notificaciones')
}
