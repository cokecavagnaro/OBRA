// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { dbPorDefecto, usuario, proyecto, router, navegacion } from './preparar'
import * as db from '@/lib/supabase/db'
import IngresoManual from '@/app/ingreso/page'

vi.mock('next/navigation', async () => await import('./navegacionMock'))
vi.mock('@/lib/supabase/db')

describe('Ingreso manual', () => {
  beforeEach(() => {
    navegacion.params = new URLSearchParams('proyecto=p1')
    dbPorDefecto(db as unknown as Record<string, unknown>)
    vi.mocked(db.getUsuarioActual).mockResolvedValue(usuario('admin') as never)
    vi.mocked(db.getProyectos).mockResolvedValue([proyecto('p1', 'Casa Los Aromos'), proyecto('p2', 'Bodega')] as never)
  })

  it('el botón Guardar queda deshabilitado hasta completar quién transfirió y el monto', async () => {
    const user = userEvent.setup()
    render(<IngresoManual />)
    const guardar = await screen.findByRole('button', { name: 'Guardar ingreso' })
    expect(guardar).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Nombre o razón social'), 'Inversiones Rojas SpA')
    expect(guardar).toBeDisabled()
    await user.type(screen.getByPlaceholderText('$ 0'), '6000000')
    expect(guardar).toBeEnabled()
  })

  it('guarda el ingreso con los datos escritos y vuelve al proyecto', async () => {
    const user = userEvent.setup()
    render(<IngresoManual />)
    await screen.findByRole('button', { name: 'Guardar ingreso' })
    await user.type(screen.getByPlaceholderText('Nombre o razón social'), '  Inversiones Rojas SpA ')
    await user.type(screen.getByPlaceholderText(/Cuenta Vista/), 'Cuenta Vista ···4821')
    await user.type(screen.getByPlaceholderText('$ 0'), '6000000')
    await user.type(screen.getByPlaceholderText('Ej: primer aporte'), 'Tercer aporte')
    await user.click(screen.getByRole('button', { name: 'Guardar ingreso' }))

    await waitFor(() => expect(db.saveIngreso).toHaveBeenCalledTimes(1))
    expect(db.saveIngreso).toHaveBeenCalledWith(expect.objectContaining({
      proyecto_id: 'p1', remitente: 'Inversiones Rojas SpA', cuenta_destino: 'Cuenta Vista ···4821', monto: 6_000_000,
      nota: 'Tercer aporte', imagen_url: null, origen: 'manual', creado_por_email: 'admin@prueba.cl',
    }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/proyecto/p1'))
  })

  it('sube el comprobante adjunto y guarda su dirección', async () => {
    const user = userEvent.setup()
    const { container } = render(<IngresoManual />)
    await screen.findByRole('button', { name: 'Guardar ingreso' })
    await user.type(screen.getByPlaceholderText('Nombre o razón social'), 'Cliente')
    await user.type(screen.getByPlaceholderText('$ 0'), '1000')
    const archivo = new File(['x'], 'transferencia.pdf', { type: 'application/pdf' })
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [archivo] } })
    await user.click(screen.getByRole('button', { name: 'Guardar ingreso' }))
    await waitFor(() => expect(db.subirComprobanteManoDeObra).toHaveBeenCalledWith('c1', 'p1', archivo))
    expect(db.saveIngreso).toHaveBeenCalledWith(expect.objectContaining({ imagen_url: 'https://almacen/comprobante.jpg' }))
  })

  it('si la base de datos falla, muestra el error y no navega', async () => {
    vi.mocked(db.saveIngreso).mockResolvedValue(null)
    const user = userEvent.setup()
    render(<IngresoManual />)
    await screen.findByRole('button', { name: 'Guardar ingreso' })
    await user.type(screen.getByPlaceholderText('Nombre o razón social'), 'Cliente')
    await user.type(screen.getByPlaceholderText('$ 0'), '1000')
    await user.click(screen.getByRole('button', { name: 'Guardar ingreso' }))
    expect(await screen.findByText(/No pudimos guardar el ingreso/)).toBeInTheDocument()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('un usuario sin el permiso "Registrar ingresos" ve el aviso y no el formulario', async () => {
    vi.mocked(db.getUsuarioActual).mockResolvedValue(usuario('usuario') as never)
    render(<IngresoManual />)
    expect(await screen.findByText(/No tienes permiso para registrar ingresos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar ingreso' })).not.toBeInTheDocument()
  })

  it('Cancelar vuelve atrás sin guardar nada', async () => {
    const user = userEvent.setup()
    render(<IngresoManual />)
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(router.back).toHaveBeenCalled()
    expect(db.saveIngreso).not.toHaveBeenCalled()
  })
})
