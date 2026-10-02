import { vi } from 'vitest'

// Sustituto de next/navigation para las pruebas de componentes: el router
// registra las llamadas y los parámetros de URL se fijan desde cada prueba.
export const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }
export const navegacion = { pathname: '/', params: new URLSearchParams() }

export const useRouter = () => router
export const usePathname = () => navegacion.pathname
export const useSearchParams = () => navegacion.params
export const redirect = vi.fn()
