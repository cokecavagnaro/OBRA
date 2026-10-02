// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { dbPorDefecto, usuario, proyecto, gasto, item } from './preparar'
import { formatCLP } from '@/lib/mock'
import * as db from '@/lib/supabase/db'
import Inicio from '@/app/page'

vi.mock('next/navigation', async () => await import('./navegacionMock'))
vi.mock('@/lib/supabase/db')

const ingreso = (id: string, proyecto_id: string, monto: number) => ({
  id, proyecto_id, remitente: 'Cliente', cuenta_destino: '···4821', monto, fecha: '2026-09-01', nota: null, imagen_url: null, origen: 'manual' as const, creado_por_email: 'a@a.cl', created_at: '2026-09-01',
})

describe('Inicio', () => {
  beforeEach(() => {
    dbPorDefecto(db as unknown as Record<string, unknown>)
    vi.mocked(db.getUsuarioActual).mockResolvedValue(usuario('admin') as never)
    vi.mocked(db.getProyectos).mockResolvedValue([proyecto('p1', 'Casa Los Aromos'), proyecto('p2', 'Bodega Quilicura')] as never)
    vi.mocked(db.getAllGastos).mockResolvedValue([
      gasto({ id: 'g1', proyecto_id: 'p1', total: 8_340_000 }),
      // Una boleta aún por aprobar NO cuenta como gastado.
      gasto({ id: 'g2', proyecto_id: 'p1', total: 1_250_000, estado: 'pendiente' }),
      gasto({ id: 'g3', proyecto_id: 'p2', total: 6_400_000, items: [item('i1', { estado: 'pendiente', etiquetas: [] })] }),
    ] as never)
    vi.mocked(db.getAllIngresos).mockResolvedValue([ingreso('n1', 'p1', 6_000_000), ingreso('n2', 'p1', 6_500_000), ingreso('n3', 'p2', 6_000_000)] as never)
  })

  it('ya no muestra el total general ni el contador global de boletas', async () => {
    render(<Inicio />)
    await screen.findByText('Casa Los Aromos')
    expect(screen.queryByText(/total general/i)).not.toBeInTheDocument()
  })

  it('cada proyecto muestra ingresado, gastado y diferencia', async () => {
    render(<Inicio />)
    const tarjeta = (await screen.findByText('Casa Los Aromos')).closest('div.border-2') as HTMLElement
    // 12,5 M ingresados − 8,34 M gastados (la boleta pendiente no cuenta)
    expect(within(tarjeta).getByText(formatCLP(12_500_000))).toBeInTheDocument()
    expect(within(tarjeta).getByText(formatCLP(8_340_000))).toBeInTheDocument()
    expect(within(tarjeta).getByText(formatCLP(4_160_000))).toBeInTheDocument()
    expect(within(tarjeta).getByText('67% gastado')).toBeInTheDocument()
  })

  it('una diferencia negativa se muestra en rojo', async () => {
    render(<Inicio />)
    const tarjeta = (await screen.findByText('Bodega Quilicura')).closest('div.border-2') as HTMLElement
    const dif = within(tarjeta).getByText(formatCLP(-400_000))
    expect(dif).toHaveClass('text-error')
    expect(within(tarjeta).getByText('107% gastado')).toBeInTheDocument()
  })

  it('el aviso de pendientes lleva a la Bandeja, pestaña Pendientes', async () => {
    render(<Inicio />)
    const enlace = (await screen.findByText(/1 pendientes/)).closest('a')
    expect(enlace).toHaveAttribute('href', '/bandeja?tab=pendientes')
  })

  it('un proyecto sin ingresos no rompe los cálculos', async () => {
    vi.mocked(db.getAllIngresos).mockResolvedValue([])
    render(<Inicio />)
    const tarjeta = (await screen.findByText('Casa Los Aromos')).closest('div.border-2') as HTMLElement
    expect(within(tarjeta).getByText('0% gastado')).toBeInTheDocument()
    expect(within(tarjeta).getByText(formatCLP(-8_340_000))).toBeInTheDocument()
  })
})
