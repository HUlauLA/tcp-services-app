import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Lock, User, Loader2, AlertCircle } from 'lucide-react'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      const usuarioLimpio = username.trim().toLowerCase()
      const emailInterno = usuarioLimpio.includes('@')
        ? usuarioLimpio
        : `tcpautomotive.sv+${usuarioLimpio}@gmail.com`

      const { error } = await supabase.auth.signInWithPassword({
        email: emailInterno,
        password,
      })

      if (error) {
        throw new Error('Usuario o contraseña incorrectos.')
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error al iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl border-t-4 border-[#0A84FF] space-y-6">
        <div className="text-center space-y-2">
          <img
            src="/logo-tcp.png"
            alt="TCP Automotive Services"
            className="w-20 h-20 mx-auto object-contain rounded-xl bg-slate-50 p-1.5 border border-slate-200"
          />
          <h1 className="text-xl font-extrabold text-[#0D1B2A] tracking-tight">
            TCP AUTOMOTIVE SERVICES
          </h1>
          <p className="text-xs text-slate-500">
            Sistema Interno de Operaciones y Laboratorio
          </p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nombre de Usuario
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ej. laura o tecnico1"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#0A84FF]"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#0A84FF]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#0A84FF] hover:bg-blue-600 text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Ingresar al Sistema
          </button>
        </form>
      </div>
    </div>
  )
}