import {useState} from 'react'
import {supabase} from '../lib/supabase'
import {KeyRound, Lock, User, AlertCircle, Loader2} from 'lucide-react'

export default function Login() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // Convierte el nombre de usuario en el formato interno ("laura@tcp.local")
        const usuarioLimpio = username.trim().toLowerCase()
        const emailInterno = usuarioLimpio.includes('@') ? usuarioLimpio : `${usuarioLimpio}@tcp.local`

        const { error } = await supabase.auth.signInWithPassword({
         email: emailInterno,
         password,
        })

        if (error) {
            setError('Usuario o contraseña incorrectos')
        }
        setLoading(false)
    }

    return (
    <div className="min-h-screen flex items-center justify-center bg-[#0D1B2A] px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Encabezado Marca */}
        <div className="bg-[#0D1B2A] border-b border-slate-700 px-8 py-7 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[#007BFF]/20 text-[#007BFF] mb-3">
            <KeyRound className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">
            TCP SERVICES
          </h1>
          <p className="text-xs uppercase tracking-widest text-[#C0C6CF] mt-1">
            Truck & Car Professionals
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleLogin} className="p-8 space-y-5">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Usuario
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ej. laura"
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#007BFF] focus:border-[#007BFF] outline-none text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#007BFF] focus:border-[#007BFF] outline-none text-slate-800"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#007BFF] hover:bg-blue-600 text-white font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Verificando...
              </>
            ) : (
              'Ingresar al Sistema'
            )}
          </button>
        </form>
      </div>
    </div>
  )

}