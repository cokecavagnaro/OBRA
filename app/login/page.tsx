'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AntLogo from '@/components/AntLogo'

type Pantalla = 'login' | 'signup'
type ModoLogin = 'password' | 'magic'

export default function Login() {
  const router = useRouter()
  const [pantalla, setPantalla] = useState<Pantalla>('login')
  const [modoLogin, setModoLogin] = useState<ModoLogin>('password')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [nombreEmpresa, setNombreEmpresa] = useState('')

  const [enviado, setEnviado] = useState(false)
  const [cuentaCreada, setCuentaCreada] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) setError(error.message)
    else setEnviado(true)
    setLoading(false)
  }

  async function handleLoginPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) setError(error.message)
    else router.push('/')
    setLoading(false)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmarPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre, nombre_empresa: nombreEmpresa } },
    })

    if (error) {
      setError(error.message)
    } else if (data.session) {
      router.push('/')
    } else {
      setCuentaCreada(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <AntLogo size={32} className="text-gray-900" />
            <h1 className="text-2xl font-bold text-gray-900">Hormigasto</h1>
          </div>
          <p className="text-sm text-gray-400 mt-1">Gestión de gastos de construcción</p>
        </div>

        <div className="flex gap-2 mb-6 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => { setPantalla('login'); setError('') }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${pantalla === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => { setPantalla('signup'); setError('') }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${pantalla === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
          >
            Crear cuenta
          </button>
        </div>

        {pantalla === 'login' ? (
          modoLogin === 'magic' ? (
            enviado ? (
              <div className="text-center space-y-3">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-900">Revisa tu correo</p>
                <p className="text-xs text-gray-400">Te enviamos un link de acceso a <span className="font-medium text-gray-600">{email}</span></p>
                <button
                  onClick={() => { setEnviado(false); setEmail('') }}
                  className="text-xs text-blue-600 font-medium mt-2"
                >
                  Usar otro correo
                </button>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    required
                    className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                  />
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full bg-gray-900 text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-40"
                >
                  {loading ? 'Enviando...' : 'Entrar con link por email'}
                </button>

                <button
                  type="button"
                  onClick={() => setModoLogin('password')}
                  className="w-full text-center text-xs text-blue-600 font-medium"
                >
                  Usar contraseña
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handleLoginPassword} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                  className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full bg-gray-900 text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-40"
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <button
                type="button"
                onClick={() => setModoLogin('magic')}
                className="w-full text-center text-xs text-blue-600 font-medium"
              >
                ¿Prefieres un link por correo?
              </button>
            </form>
          )
        ) : cuentaCreada ? (
          <div className="text-center space-y-3">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-900">Confirma tu correo</p>
            <p className="text-xs text-gray-400">Te enviamos un correo de confirmación a <span className="font-medium text-gray-600">{email}</span>. Una vez confirmado, ya puedes iniciar sesión con tu contraseña.</p>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                required
                className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Nombre de la empresa</label>
              <input
                type="text"
                value={nombreEmpresa}
                onChange={(e) => setNombreEmpresa(e.target.value)}
                placeholder="Ej: Constructora Los Alpes"
                required
                className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Confirmar contraseña</label>
              <input
                type="password"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="mt-1.5 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email || !password || !confirmarPassword || !nombre || !nombreEmpresa}
              className="w-full bg-gray-900 text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-40"
            >
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
