import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import InventarioModule from './components/InventarioModule'
import {
  ClipboardList,
  Package,
  QrCode,
  Cpu,
  DollarSign,
  Users,
  LogOut,
  Menu,
  X,
  KeyRound,
} from 'lucide-react'

export default function App() {
  const [session, setSession] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [moduloActivo, setModuloActivo] = useState('ordenes')
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else {
        setPerfil(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const cargarPerfil = async (userId) => {
    const { data } = await supabase
      .from('perfiles')
      .select('*, bodegas(nombre, tipo)')
      .eq('id', userId)
      .single()

    setPerfil(data)
    if (data?.rol === 'movil') setModuloActivo('escaner')
    setLoading(false)
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D1B2A] text-white">
        Cargando sistema TCP Services...
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  // Menú dinámico según el rol del empleado
  const menuItems = [
    { id: 'ordenes', label: 'Órdenes de Trabajo', icon: ClipboardList, roles: ['admin', 'laboratorio', 'atencion', 'movil'] },
    { id: 'escaner', label: 'Escáner QR Móvil', icon: QrCode, roles: ['admin', 'movil', 'laboratorio'] },
    { id: 'inventario', label: 'Catálogo e Inventario', icon: Package, roles: ['admin', 'laboratorio', 'atencion'] },
    { id: 'libreria', label: 'Librería Técnica ECUs', icon: Cpu, roles: ['admin', 'laboratorio'] },
    { id: 'clientes', label: 'Clientes y Talleres', icon: Users, roles: ['admin', 'atencion', 'laboratorio'] },
    { id: 'finanzas', label: 'Finanzas y Gastos', icon: DollarSign, roles: ['admin'] },
  ]

  const itemsPermitidos = menuItems.filter((item) =>
    perfil ? item.roles.includes(perfil.rol) : true
  )

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-100">
      {/* Barra superior móvil */}
      <header className="md:hidden bg-[#0D1B2A] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold">
          <KeyRound className="w-5 h-5 text-[#007BFF]" />
          <span>TCP SERVICES</span>
        </div>
        <button onClick={() => setMenuAbierto(!menuAbierto)}>
          {menuAbierto ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={`${
          menuAbierto ? 'block' : 'hidden'
        } md:flex md:w-64 md:flex-col bg-[#0D1B2A] text-white shrink-0`}
      >
        <div className="hidden md:flex items-center gap-3 px-6 py-5 border-b border-slate-800">
          <div className="p-2 bg-[#007BFF]/20 rounded-lg text-[#007BFF]">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold tracking-wide text-sm">TCP SERVICES</h1>
            <p className="text-[11px] text-[#C0C6CF]">Gestión Operativa</p>
          </div>
        </div>

        {/* Info del usuario logueado */}
        <div className="px-6 py-4 bg-slate-900/60 border-b border-slate-800">
          <p className="text-sm font-medium text-white truncate">
            {perfil?.nombre || session.user.email}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] uppercase px-2 py-0.5 rounded bg-[#007BFF]/20 text-[#007BFF] font-semibold">
              {perfil?.rol || 'Sin perfil'}
            </span>
            {perfil?.bodegas && (
              <span className="text-[11px] text-[#C0C6CF] truncate">
                • {perfil.bodegas.nombre}
              </span>
            )}
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {itemsPermitidos.map((item) => {
            const Icon = item.icon
            const activo = moduloActivo === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  setModuloActivo(item.id)
                  setMenuAbierto(false)
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                  activo
                    ? 'bg-[#007BFF] text-white'
                    : 'text-[#C0C6CF] hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Botón Salir */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={cerrarSesion}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Área Principal de Contenido */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
  <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6">
    {moduloActivo === 'inventario' ? (
      <InventarioModule perfil={perfil} />
    ) : (
      <>
        <h2 className="text-xl font-bold text-[#0D1B2A] capitalize">
          Módulo: {itemsPermitidos.find((i) => i.id === moduloActivo)?.label}
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Conexión exitosa con Supabase PostgreSQL. Listo para construir la interfaz de este módulo.
        </p>
      </>
    )}
  </div>
</main>
    </div>
  )
}