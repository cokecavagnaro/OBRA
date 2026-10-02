// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { dbPorDefecto, usuario, proyecto, gasto, item, router, navegacion } from './preparar'
import * as db from '@/lib/supabase/db'
import Bandeja from '@/app/bandeja/page'
import BottomNav from '@/components/BottomNav'

vi.mock('next/navigation', async () => await import('./navegacionMock'))
vi.mock('@/lib/supabase/db')

const notificacion = (id: string, leida: boolean, mensaje: string) => ({ id, usuario_id: 'u-admin', cuenta_id: 'c1', tipo: 'solicitud_aprobacion', gasto_id: null, mensaje, leida, created_at: '2026-09-29T17:40:00Z' })

function datos(rol: 'admin' | 'usuario') {
  dbPorDefecto(db as unknown as Record<string, unknown>)
  vi.mocked(db.getUsuarioActual).mockResolvedValue(usuario(rol) as never)
  vi.mocked(db.getProyectos).mockResolvedValue([proyecto('p1', 'Casa Los Aromos')] as never)
  vi.mocked(db.getAllGastos).mockResolvedValue([
    // 2 ítems sin etiquetar
    gasto({ id: 'g1', proyecto_id: 'p1', total: 2000, items: [item('i1', { estado: 'pendiente', etiquetas: [], descripcion: 'Rodillo' }), item('i2', { estado: 'pendiente', etiquetas: [], descripcion: 'Brocha' })] }),
    // 1 boleta por aprobar (de Vicente) y 1 rechazada (de Vicente)
    gasto({ id: 'g2', proyecto_id: 'p1', total: 1_250_000, estado: 'pendiente', solicitante_id: 'u-usuario', proveedor: 'Hormigón Premezclado' }),
    gasto({ id: 'g3', proyecto_id: 'p1', total: 32_500, estado: 'rechazado', solicitante_id: 'u-usuario', proveedor: 'Ferretería El Tornillo' }),
  ] as never)
  vi.mocked(db.getNotificaciones).mockResolvedValue([notificacion('a1', false, 'Vicente solicitó aprobar «Hormigón»'), notificacion('a2', true, 'Se aprobó «Corralón»')] as never)
}

describe('Bandeja', () => {
  beforeEach(() => {
    navegacion.pathname = '/bandeja'
    navegacion.params = new URLSearchParams()
  })

  it('por defecto abre Avisos > Por aprobar y muestra los contadores de cada pestaña', async () => {
    datos('admin')
    render(<Bandeja />)
    // Avisos = 1 boleta por aprobar (las rechazadas se listan pero no suman, igual que antes) + 1 notificación sin leer = 2; Pendientes = 2 ítems
    await waitFor(() => expect(screen.getByRole('button', { name: /^Avisos\s*2$/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^Pendientes\s*2$/ })).toBeInTheDocument()
    expect(await screen.findByText('Hormigón Premezclado')).toBeInTheDocument()
    expect(screen.getByText('Ferretería El Tornillo')).toBeInTheDocument()
  })

  it('las pestañas cambian la dirección (tab y sub) sin recargar la página', async () => {
    datos('admin')
    render(<Bandeja />)
    await screen.findByText('Hormigón Premezclado')
    fireEvent.click(screen.getByRole('button', { name: /^Pendientes/ }))
    expect(router.replace).toHaveBeenLastCalledWith('/bandeja?tab=pendientes')
    fireEvent.click(screen.getByRole('button', { name: /^Notificaciones/ }))
    expect(router.replace).toHaveBeenLastCalledWith('/bandeja?tab=avisos&sub=notificaciones')
  })

  it('pestaña Pendientes: lista los ítems por revisar', async () => {
    datos('admin')
    navegacion.params = new URLSearchParams('tab=pendientes')
    render(<Bandeja />)
    expect(await screen.findByText('Rodillo')).toBeInTheDocument()
    expect(screen.getByText('Brocha')).toBeInTheDocument()
    expect(screen.queryByText('Hormigón Premezclado')).not.toBeInTheDocument()
  })

  it('Avisos > Notificaciones: muestra las notificaciones y permite marcarlas como leídas', async () => {
    datos('admin')
    navegacion.params = new URLSearchParams('tab=avisos&sub=notificaciones')
    render(<Bandeja />)
    expect(await screen.findByText(/Vicente solicitó aprobar/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /marcar todas como leídas/i }))
    await waitFor(() => expect(db.marcarTodasNotificacionesLeidas).toHaveBeenCalledWith('u-admin'))
  })

  it('un usuario sin permiso de aprobar solo ve sus propias boletas en revisión', async () => {
    datos('usuario')
    vi.mocked(db.getAllGastos).mockResolvedValue([
      gasto({ id: 'g2', proyecto_id: 'p1', total: 1000, estado: 'pendiente', solicitante_id: 'u-usuario', proveedor: 'Mía' }),
      gasto({ id: 'g9', proyecto_id: 'p1', total: 5000, estado: 'pendiente', solicitante_id: 'otro', proveedor: 'Ajena' }),
    ] as never)
    render(<Bandeja />)
    expect(await screen.findByText('Mía')).toBeInTheDocument()
    expect(screen.queryByText('Ajena')).not.toBeInTheDocument()
  })
})

describe('Barra inferior', () => {
  beforeEach(() => { navegacion.pathname = '/' })

  it('tiene tres botones: Inicio, Escanear y Bandeja, con las rutas correctas', async () => {
    datos('admin')
    render(<BottomNav />)
    const enlaces = screen.getAllByRole('link')
    expect(enlaces.map((a) => a.getAttribute('href'))).toEqual(['/', '/scan', '/bandeja'])
    expect(screen.getByText('ESCANEAR')).toBeInTheDocument()
  })

  it('la insignia de la Bandeja suma ítems pendientes, boletas por aprobar y avisos sin leer', async () => {
    datos('admin')
    render(<BottomNav />)
    // 2 ítems + 1 boleta pendiente (el admin aprueba) + 1 aviso sin leer = 4
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument())
  })

  it('no se muestra en el login', () => {
    navegacion.pathname = '/login'
    datos('admin')
    const { container } = render(<BottomNav />)
    expect(container).toBeEmptyDOMElement()
  })
})
