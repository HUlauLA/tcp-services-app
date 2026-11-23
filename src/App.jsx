import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import DashboardHome from './components/DashboardHome'
import OrdenesModule from './components/OrdenesModule'
import CalendarioModule from './components/CalendarioModule'
import LibreriaEcusModule from './components/LibreriaEcusModule'
import InventarioModule from './components/InventarioModule'
import EscanerQRModule from './components/EscanerQRModule'
import ClientesModule from './components/ClientesModule'
import FinanzasModule from './components/FinanzasModule'
import {
  LayoutDashboard,
  ClipboardList,
  Calendar as CalendarIcon,
  Package,
  QrCode,
  Users,
  Cpu,
  DollarSign,
  UserCog,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  KeyRound,
  Save,
  Loader2,
} from 'lucide-react'

export default function App() {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [tabActiva, setTabActiva] = useState('dashboard')
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)
  const [sidebarColapsado, setSidebarColapsado] = useState(false)

  // OT seleccionada directamente desde Dashboard o Calendario
  const [otPreseleccionadaId, setOtPreseleccionadaId] = useState(null)

  // Modal "Mi Perfil de Usuario" accesible desde el menú lateral
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false)
  const [miNombre, setMiNombre] = useState('')
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        cargarPerfilUsuario(session.user)
      } else {
        setCargandoSesion(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        cargarPerfilUsuario(session.user)
      } else {
        setPerfil(null)
        setCargandoSesion(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const cargarPerfilUsuario = async (user) => {
    setCargandoSesion(true)
    const { data } = await supabase
      .from('perfiles_usuarios')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (data) {
      setPerfil(data)
      setMiNombre(data.nombre || '')
    } else {
      const correo = user.email || ''
      const parteLocal = correo.split('@')[0] || 'usuario'
      const usuarioCorto = parteLocal.includes('+') ? parteLocal.split('+')[1] : parteLocal
      const perfilFallback = {
        id: user.id,
        nombre: user.user_metadata?.nombre || usuarioCorto,
        username: user.user_metadata?.username || usuarioCorto,
        rol: user.user_metadata?.rol || 'admin',
        sub_roles: [],
      }
      setPerfil(perfilFallback)
      setMiNombre(perfilFallback.nombre)
    }
    setCargandoSesion(false)
  }

  const guardarMiPerfilLateral = async (e) => {
    e.preventDefault()
    setGuardandoPerfil(true)
    try {
      if (perfil?.id) {
        const { error } = await supabase.from('perfiles_usuarios').upsert([
          {
            id: perfil.id,
            username: perfil.username || miNombre.trim().toLowerCase(),
            nombre: miNombre.trim(),
            rol: perfil.rol || 'tecnico',
            sub_roles: perfil.sub_roles || [],
            unidad_movil: perfil.unidad_movil || 'Sin unidad móvil fija',
          },
        ])
        if (error) throw error
      }

      if (nuevaPassword.trim().length > 0) {
        if (nuevaPassword.trim().length < 6) {
          throw new Error('La nueva contraseña debe tener al menos 6 caracteres.')
        }
        const { error: passErr } = await supabase.auth.updateUser({
          password: nuevaPassword.trim(),
        })
        if (passErr) throw passErr
      }

      setPerfil((prev) => (prev ? { ...prev, nombre: miNombre.trim() } : prev))
      setNuevaPassword('')
      setModalPerfilAbierto(false)
      alert('Perfil actualizado correctamente.')
    } catch (err) {
      alert('Error al actualizar perfil: ' + err.message)
    } finally {
      setGuardandoPerfil(false)
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setPerfil(null)
  }

  const abrirOrdenDesdeExterno = (ot) => {
    setOtPreseleccionadaId(ot?.id || null)
    setTabActiva('ordenes')
  }

  if (cargandoSesion) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#0A84FF] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-300">
            Iniciando sistema TCP Automotive Services...
          </p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  const rol = perfil?.rol || 'tecnico'

  const menuItems = [
    {
      id: 'dashboard',
      label: 'Resumen General',
      icon: LayoutDashboard,
      roles: ['admin', 'supervisor', 'atencion', 'tecnico'],
    },
    {
      id: 'ordenes',
      label: 'Órdenes de Trabajo',
      icon: ClipboardList,
      roles: ['admin', 'supervisor', 'atencion', 'tecnico'],
    },
    {
      id: 'calendario',
      label: 'Calendario',
      icon: CalendarIcon,
      roles: ['admin', 'supervisor', 'atencion', 'tecnico'],
    },
    {
      id: 'libreria',
      label: 'Librería Técnica ECUs',
      icon: Cpu,
      roles: ['admin', 'supervisor', 'tecnico'],
    },
    {
      id: 'inventario',
      label: 'Inventario QR',
      icon: Package,
      roles: ['admin', 'supervisor', 'atencion', 'tecnico'],
    },
    {
      id: 'escaner',
      label: 'Escáner QR',
      icon: QrCode,
      roles: ['admin', 'supervisor', 'atencion', 'tecnico'],
    },
    {
      id: 'clientes',
      label: 'Clientes y Talleres',
      icon: Users,
      roles: ['admin', 'supervisor', 'atencion'],
    },
    {
      id: 'finanzas',
      label: 'Finanzas y Caja',
      icon: DollarSign,
      roles: ['admin'],
    },
  ].filter((item) => item.roles.includes(rol))

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row">
      {/* Barra Superior Móvil */}
      <header className="md:hidden bg-[#0D1B2A] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo-tcp.png"
            alt="TCP"
            className="w-8 h-8 rounded bg-white p-0.5 object-contain"
          />
          <div>
            <h1 className="font-bold text-sm leading-tight">TCP Automotive</h1>
            <p className="text-[10px] text-sky-300">Sistema de Gestión</p>
          </div>
        </div>
        <button
          onClick={() => setMenuMovilAbierto(!menuMovilAbierto)}
          className="p-2 rounded-lg bg-white/10 text-white cursor-pointer"
        >
          {menuMovilAbierto ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Sidebar Lateral (Colapsable en escritorio y desplegable en móvil) */}
      <aside
        className={`${
          menuMovilAbierto ? 'fixed inset-0 z-30 pt-16' : 'hidden'
        } md:flex md:flex-col md:fixed md:inset-y-0 bg-[#0D1B2A] text-white shadow-xl transition-all duration-200 ${
          sidebarColapsado ? 'md:w-20' : 'md:w-64'
        }`}
      >
        {/* Cabecera Logo + Botón Esconder/Mostrar Menú */}
        <div className="hidden md:flex items-center justify-between gap-2 px-4 py-4 border-b border-slate-800">
          {!sidebarColapsado && (
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/logo-tcp.png"
                alt="TCP Automotive Services"
                className="w-10 h-10 rounded-lg bg-white p-1 object-contain shrink-0"
              />
              <div className="min-w-0">
                <h1 className="font-bold text-sm tracking-wide truncate">TCP AUTOMOTIVE</h1>
                <p className="text-[11px] text-sky-400 truncate">Gestión de Laboratorio</p>
              </div>
            </div>
          )}

          <button
            onClick={() => setSidebarColapsado(!sidebarColapsado)}
            title={sidebarColapsado ? 'Mostrar menú completo' : 'Esconder menú lateral'}
            className={`p-2 rounded-lg bg-slate-800/80 hover:bg-[#0A84FF] text-slate-200 hover:text-white transition cursor-pointer ${
              sidebarColapsado ? 'mx-auto' : 'shrink-0'
            }`}
          >
            {sidebarColapsado ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Perfil activo (clic abre Mi Perfil de Usuario) */}
        <div
          onClick={() => {
            setMiNombre(perfil?.nombre || '')
            setNuevaPassword('')
            setModalPerfilAbierto(true)
            setMenuMovilAbierto(false)
          }}
          title="Editar Mi Perfil de Usuario"
          className="px-4 py-3.5 bg-slate-900/60 hover:bg-slate-800/90 border-b border-slate-800 cursor-pointer transition"
        >
          {sidebarColapsado ? (
            <div className="flex justify-center">
              <div className="w-9 h-9 rounded-full bg-[#0A84FF] flex items-center justify-center font-bold text-xs uppercase">
                {(perfil?.nombre || 'U').slice(0, 2)}
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold text-white truncate">
                {perfil?.nombre || 'Usuario TCP'}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0A84FF]/20 text-sky-300 border border-[#0A84FF]/40 uppercase">
                  {rol}
                </span>
                {perfil?.username && (
                  <span className="text-[11px] text-slate-400 truncate">@{perfil.username}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Navegación Principal */}
        <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon
            const activa = tabActiva === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  setTabActiva(item.id)
                  setMenuMovilAbierto(false)
                }}
                title={sidebarColapsado ? item.label : undefined}
                className={`w-full flex items-center ${
                  sidebarColapsado ? 'justify-center px-2' : 'gap-3 px-3.5'
                } py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
                  activa
                    ? 'bg-[#0A84FF] text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!sidebarColapsado && <span className="truncate">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Botones Inferiores: Mi Perfil de Usuario + Cerrar Sesión */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          <button
            onClick={() => {
              setMiNombre(perfil?.nombre || '')
              setNuevaPassword('')
              setModalPerfilAbierto(true)
              setMenuMovilAbierto(false)
            }}
            title={sidebarColapsado ? 'Mi Perfil de Usuario' : undefined}
            className={`w-full flex items-center ${
              sidebarColapsado ? 'justify-center px-2' : 'justify-center gap-2 px-3'
            } py-2 rounded-xl bg-slate-800/90 hover:bg-[#0A84FF] text-slate-200 hover:text-white text-xs font-semibold transition cursor-pointer`}
          >
            <UserCog className="w-4 h-4 shrink-0" />
            {!sidebarColapsado && <span>Mi Perfil de Usuario</span>}
          </button>

          <button
            onClick={cerrarSesion}
            title={sidebarColapsado ? 'Cerrar Sesión' : undefined}
            className={`w-full flex items-center ${
              sidebarColapsado ? 'justify-center px-2' : 'justify-center gap-2 px-3'
            } py-2 rounded-xl bg-slate-800 hover:bg-red-600 text-slate-200 hover:text-white text-xs font-bold transition cursor-pointer`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarColapsado && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* Área Principal de Contenido */}
      <main
        className={`flex-1 transition-all duration-200 ${
          sidebarColapsado ? 'md:pl-20' : 'md:pl-64'
        }`}
      >
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {tabActiva === 'dashboard' && (
            <DashboardHome
              perfil={perfil}
              setTabActiva={setTabActiva}
              onAbrirOrden={abrirOrdenDesdeExterno}
            />
          )}
          {tabActiva === 'ordenes' && (
            <OrdenesModule
              perfil={perfil}
              otPreseleccionadaId={otPreseleccionadaId}
              onLimpiarPreseleccion={() => setOtPreseleccionadaId(null)}
            />
          )}
          {tabActiva === 'calendario' && (
            <CalendarioModule perfil={perfil} onAbrirOrden={abrirOrdenDesdeExterno} />
          )}
          {tabActiva === 'libreria' && <LibreriaEcusModule perfil={perfil} />}
          {tabActiva === 'inventario' && <InventarioModule perfil={perfil} />}
          {tabActiva === 'escaner' && <EscanerQRModule perfil={perfil} />}
          {tabActiva === 'clientes' && <ClientesModule perfil={perfil} />}
          {tabActiva === 'finanzas' && <FinanzasModule perfil={perfil} />}
        </div>
      </main>

      {/* Modal Mi Perfil de Usuario (desde Menú Lateral) */}
      {modalPerfilAbierto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <UserCog className="w-5 h-5 text-[#0A84FF]" />
                <h3 className="font-bold text-lg text-[#0D1B2A]">Mi Perfil de Usuario</h3>
              </div>
              <button
                onClick={() => setModalPerfilAbierto(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarMiPerfilLateral} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Nombre de Usuario (No editable)
                </label>
                <input
                  disabled
                  value={perfil?.username || ''}
                  className="w-full px-3 py-2 border rounded-lg bg-slate-100 text-slate-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre Completo *
                </label>
                <input
                  required
                  value={miNombre}
                  onChange={(e) => setMiNombre(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nueva Contraseña (dejar vacío para no cambiar)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={nuevaPassword}
                    onChange={(e) => setNuevaPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-9 pr-3 py-2 border rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalPerfilAbierto(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoPerfil}
                  className="px-5 py-2 bg-[#0D1B2A] hover:bg-[#0A84FF] text-white font-bold rounded-xl text-xs flex items-center gap-2 transition cursor-pointer"
                >
                  {guardandoPerfil ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}