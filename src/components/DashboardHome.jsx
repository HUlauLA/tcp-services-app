import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import CalendarioModule from './CalendarioModule'
import {
  Wrench,
  AlertTriangle,
  Users,
  UserPlus,
  X,
  Loader2,
  Edit3,
  Cpu,
  BellRing,
  ClipboardList,
  Eye,
  Clock,
} from 'lucide-react'

const SUB_ROLES_DISPONIBLES = [
  'Laboratorio de electrónica',
  'Cerrajería',
  'Heavy Dutty',
  'Programación',
]

const UNIDADES_DISPONIBLES = [
  'Sin unidad móvil fija',
  'Oficina Central / Laboratorio',
  'Unidad Móvil 1',
  'Unidad Móvil 2',
  'Unidad Móvil 3',
]

export default function DashboardHome({ perfil, setTabActiva, onAbrirOrden }) {
  const [ordenes, setOrdenes] = useState([])
  const [metricas, setMetricas] = useState({
    otsActivas: 0,
    stockBajo: 0,
    totalClientes: 0,
    ecusDocumentadas: 0,
  })

  // Gestión de equipo (solo Admin)
  const [usuarios, setUsuarios] = useState([])
  const [loadingUsuarios, setLoadingUsuarios] = useState(false)
  const [modalUsuario, setModalUsuario] = useState(false)
  const [editandoUsuarioId, setEditandoUsuarioId] = useState(null)
  const [guardandoUsuario, setGuardandoUsuario] = useState(false)

  const [formUsuario, setFormUsuario] = useState({
    username: '',
    password: '',
    nombre: '',
    rol: 'tecnico',
    sub_roles: [],
    unidad_movil: 'Sin unidad móvil fija',
  })

  const rol = perfil?.rol || 'tecnico'
  const esAdmin = rol === 'admin'
  const subRolesUsuario = Array.isArray(perfil?.sub_roles) ? perfil.sub_roles : []

  const cargarDatosDashboard = async () => {
    const [{ data: ots }, { data: prods }, { data: clientes }, { data: ecus }] =
      await Promise.all([
        supabase
          .from('ordenes_trabajo')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('catalogo_productos')
          .select('stock_actual, stock_minimo')
          .eq('activo', true),
        supabase.from('clientes').select('id'),
        supabase.from('libreria_ecus').select('estado'),
      ])

    const listaOts = ots || []
    const listaProds = prods || []

    setOrdenes(listaOts)
    setMetricas({
      otsActivas: listaOts.filter(
        (o) => !['entregado', 'finalizado', 'cancelado'].includes((o.estado || '').toLowerCase())
      ).length,
      stockBajo: listaProds.filter(
        (p) => Number(p.stock_actual || 0) <= Number(p.stock_minimo || 2)
      ).length,
      totalClientes: (clientes || []).length,
      ecusDocumentadas: (ecus || []).filter(
        (e) => !(e.estado || '').toUpperCase().includes('PENDIENTE')
      ).length,
    })
  }

  const cargarUsuarios = async () => {
    if (!esAdmin) return
    setLoadingUsuarios(true)
    const { data } = await supabase
      .from('perfiles_usuarios')
      .select('*')
      .order('nombre', { ascending: true })
    setUsuarios(data || [])
    setLoadingUsuarios(false)
  }

  useEffect(() => {
    cargarDatosDashboard()
    if (esAdmin) cargarUsuarios()
  }, [esAdmin])

  // Alertas de OTs de Laboratorio o Programación sin avance en 3-4 días
  const alertasSlaSinAvance = useMemo(() => {
    const ahora = Date.now()
    return ordenes.filter((ot) => {
      const estado = (ot.estado || 'Recibido').toLowerCase()
      if (['en proceso', 'finalizado', 'entregado', 'cancelado'].includes(estado)) {
        return false
      }

      const num = (ot.numero_orden || ot.codigo_ot || '').toUpperCase()
      const tipo = (ot.tipo_servicio || '').toLowerCase()
      const esLabOProg =
        ot.alarma_sla_activa ||
        ['laboratorio', 'programacion'].includes(tipo) ||
        num.includes('LAB') ||
        num.includes('PRG')

      if (!esLabOProg) return false

      const tieneAvance =
        Boolean((ot.diagnostico || '').trim()) ||
        Boolean((ot.notas_tecnicas || ot.apuntes || '').trim())
      if (tieneAvance) return false

      const creadaMs = new Date(ot.created_at).getTime()
      if (isNaN(creadaMs)) return false

      const diasTranscurridos = (ahora - creadaMs) / (1000 * 60 * 60 * 24)
      const diasLimite = Number(ot.dias_limite_sla || 3)

      // Alerta cuando ya alcanzó o está dentro del umbral de 3-4 días sin avance
      return diasTranscurridos >= diasLimite
    })
  }, [ordenes])

  // Lista de OTs activas que el usuario actual puede atender según su rol y sub-roles
  const otsQuePuedeAtender = useMemo(() => {
    return ordenes.filter((ot) => {
      const estado = (ot.estado || 'Recibido').toLowerCase()
      if (['finalizado', 'entregado', 'cancelado'].includes(estado)) return false

      if (['admin', 'supervisor', 'atencion'].includes(rol)) return true

      // Si es técnico, filtrar según sus sub-roles asignados
      if (subRolesUsuario.length === 0) return true

      const num = (ot.numero_orden || ot.codigo_ot || '').toUpperCase()
      const tipo = (ot.tipo_servicio || '').toLowerCase()

      const esCerrajeria = tipo.includes('cerrajer') || num.includes('CER')
      const esLaboratorio = tipo.includes('laboratorio') || num.includes('LAB')
      const esProgramacion = tipo.includes('programacion') || num.includes('PRG')
      const esHeavyDuty = tipo.includes('heavy') || num.includes('HD')

      return subRolesUsuario.some((sr) => {
        const s = sr.toLowerCase()
        if (s.includes('cerrajer') && esCerrajeria) return true
        if (s.includes('electr') && esLaboratorio) return true
        if (s.includes('program') && esProgramacion) return true
        if (s.includes('heavy') && esHeavyDuty) return true
        return false
      })
    })
  }, [ordenes, rol, subRolesUsuario])

  const abrirModalNuevoUsuario = () => {
    setEditandoUsuarioId(null)
    setFormUsuario({
      username: '',
      password: '',
      nombre: '',
      rol: 'tecnico',
      sub_roles: [],
      unidad_movil: 'Sin unidad móvil fija',
    })
    setModalUsuario(true)
  }

  const abrirModalEditarUsuario = (u) => {
    setEditandoUsuarioId(u.id)
    setFormUsuario({
      username: u.username || '',
      password: '',
      nombre: u.nombre || '',
      rol: u.rol || 'tecnico',
      sub_roles: Array.isArray(u.sub_roles) ? u.sub_roles : [],
      unidad_movil: u.unidad_movil || 'Sin unidad móvil fija',
    })
    setModalUsuario(true)
  }

  const toggleSubRol = (subRol) => {
    setFormUsuario((prev) => {
      const existe = prev.sub_roles.includes(subRol)
      return {
        ...prev,
        sub_roles: existe
          ? prev.sub_roles.filter((r) => r !== subRol)
          : [...prev.sub_roles, subRol],
      }
    })
  }

  const guardarUsuario = async (e) => {
    e.preventDefault()
    setGuardandoUsuario(true)

    try {
      const usernameLimpio = formUsuario.username
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')

      if (!usernameLimpio) {
        throw new Error('Ingresa un nombre de usuario válido (letras o números sin espacios).')
      }

      if (editandoUsuarioId) {
        const { error } = await supabase
          .from('perfiles_usuarios')
          .update({
            nombre: formUsuario.nombre.trim(),
            rol: formUsuario.rol,
            sub_roles: formUsuario.rol === 'tecnico' ? formUsuario.sub_roles : [],
            unidad_movil: formUsuario.unidad_movil,
          })
          .eq('id', editandoUsuarioId)

        if (error) throw error
        setModalUsuario(false)
        cargarUsuarios()
        return
      }

      if (formUsuario.password.trim().length < 6) {
        throw new Error('La contraseña inicial debe tener al menos 6 caracteres.')
      }

      const { error: rpcError } = await supabase.rpc('crear_usuario_interno', {
        p_username: usernameLimpio,
        p_password: formUsuario.password.trim(),
        p_nombre: formUsuario.nombre.trim(),
        p_rol: formUsuario.rol,
        p_sub_roles: formUsuario.rol === 'tecnico' ? formUsuario.sub_roles : [],
        p_unidad_movil: formUsuario.unidad_movil,
      })

      if (rpcError) throw rpcError

      alert(
        `Usuario "${usernameLimpio}" creado con éxito. Ya puede iniciar sesión con su usuario y contraseña.`
      )
      setModalUsuario(false)
      cargarUsuarios()
    } catch (err) {
      alert('Error al guardar usuario: ' + err.message)
    } finally {
      setGuardandoUsuario(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Saludo Corporativo */}
      <div className="bg-[#0D1B2A] text-white rounded-2xl p-6 flex items-center justify-between gap-4 border-b-4 border-[#0A84FF] shadow-md">
        <div>
          <p className="text-[11px] font-bold tracking-widest text-sky-400 uppercase">
            TCP AUTOMOTIVE SERVICES
          </p>
          <h2 className="text-2xl font-extrabold mt-1">
            Buenos días, {perfil?.nombre || 'Equipo TCP'}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Rol activo: <strong className="uppercase text-sky-300">{rol}</strong>
          </p>
        </div>
        <img
          src="/logo-tcp.png"
          alt="TCP Automotive Services"
          className="w-16 h-16 rounded-xl bg-white p-1.5 object-contain shrink-0 hidden sm:block"
        />
      </div>

      {/* Alerta Automática SLA: OTs de Laboratorio o Programación sin iniciar en 3-4 días */}
      {alertasSlaSinAvance.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-2xl p-4 shadow-sm space-y-2.5">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <BellRing className="w-5 h-5 text-amber-600 animate-bounce shrink-0" />
            <span>
              Atención: {alertasSlaSinAvance.length} Orden(es) de Laboratorio / Programación sin avances registrados (Alarma 3–4 días)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {alertasSlaSinAvance.map((ot) => {
              const num = ot.numero_orden || ot.codigo_ot || `OT-${ot.id}`
              return (
                <div
                  key={ot.id}
                  className="bg-white border border-amber-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-bold text-[#0D1B2A]">
                      {num} — {ot.cliente_nombre || 'Cliente'}
                    </p>
                    <p className="text-slate-500">
                      {ot.vehiculo || ot.modulo_ecu || 'Módulo'} • Creada el{' '}
                      {(ot.created_at || '').slice(0, 10)}
                    </p>
                  </div>
                  <button
                    onClick={() => onAbrirOrden && onAbrirOrden(ot)}
                    className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shrink-0 cursor-pointer"
                  >
                    Iniciar OT
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 2. Tarjetas de Resumen Operativo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setTabActiva('ordenes')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-[#0A84FF] cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>OTs EN LABORATORIO / TALLER</span>
            <Wrench className="w-4 h-4 text-[#0A84FF]" />
          </div>
          <p className="text-3xl font-extrabold text-[#0D1B2A] mt-2">{metricas.otsActivas}</p>
          <p className="text-xs text-slate-400 mt-1">Órdenes activas en proceso</p>
        </div>

        <div
          onClick={() => setTabActiva('libreria')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-[#0A84FF] cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>LIBRERÍA TÉCNICA ECUs</span>
            <Cpu className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-3xl font-extrabold text-emerald-700 mt-2">
            {metricas.ecusDocumentadas}
          </p>
          <p className="text-xs text-slate-400 mt-1">Pinouts y diagramas verificados</p>
        </div>

        <div
          onClick={() => setTabActiva('inventario')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-500 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>ALERTA DE REPOSICIÓN</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-3xl font-extrabold text-amber-600 mt-2">{metricas.stockBajo}</p>
          <p className="text-xs text-slate-400 mt-1">Productos bajo stock mínimo</p>
        </div>

        <div
          onClick={() => setTabActiva('clientes')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-[#0A84FF] cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>CLIENTES Y TALLERES</span>
            <Users className="w-4 h-4 text-[#0A84FF]" />
          </div>
          <p className="text-3xl font-extrabold text-[#0D1B2A] mt-2">{metricas.totalClientes}</p>
          <p className="text-xs text-slate-400 mt-1">Registros en directorio</p>
        </div>
      </div>

      {/* 3. Calendario Operativo Integrado en el Dashboard */}
      <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 sm:p-5">
        <CalendarioModule
          perfil={perfil}
          modoCompacto={true}
          onAbrirOrden={onAbrirOrden}
        />
      </div>

      {/* 4. Lista de Órdenes de Trabajo que el Usuario Puede Atender */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#0A84FF]" />
            <div>
              <h3 className="font-bold text-base text-[#0D1B2A]">
                Órdenes de Trabajo Disponibles para Atender ({otsQuePuedeAtender.length})
              </h3>
              <p className="text-xs text-slate-500">
                Filtradas automáticamente según tu rol y especialidades asignadas
              </p>
            </div>
          </div>

          <button
            onClick={() => setTabActiva('ordenes')}
            className="text-xs font-bold text-[#0A84FF] hover:underline cursor-pointer"
          >
            Ir a todas las carpetas de OT →
          </button>
        </div>

        {otsQuePuedeAtender.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No tienes órdenes pendientes asignables en este momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b">
                  <th className="py-2.5 px-3 font-bold">N° Orden</th>
                  <th className="py-2.5 px-3 font-bold">Cliente / Vehículo</th>
                  <th className="py-2.5 px-3 font-bold">Fecha / Programación</th>
                  <th className="py-2.5 px-3 font-bold">Estado</th>
                  <th className="py-2.5 px-3 font-bold text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {otsQuePuedeAtender.slice(0, 8).map((ot) => {
                  const num = ot.numero_orden || ot.codigo_ot || `OT-${ot.id}`
                  const estado = ot.estado || 'Recibido'
                  return (
                    <tr key={ot.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono font-bold text-[#0D1B2A]">
                        {num}
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="font-bold text-slate-800">
                          {ot.cliente_nombre || 'Cliente'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {ot.vehiculo || ot.modulo_ecu || '-'}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <p>Creada: {(ot.created_at || '').slice(0, 10)}</p>
                        {ot.fecha_programada && (
                          <p className="text-[11px] text-[#0A84FF] font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Cita: {ot.fecha_programada}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            estado.toLowerCase() === 'en proceso'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {estado}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => onAbrirOrden && onAbrirOrden(ot)}
                          className="px-3 py-1.5 rounded-lg bg-[#0D1B2A] hover:bg-[#0A84FF] text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Atender
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Gestión de Equipo, Roles y Unidades Móviles (Solo Administrador) */}
      {esAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <h3 className="font-bold text-base text-[#0D1B2A]">
                Equipo, Roles y Unidades Móviles
              </h3>
              <p className="text-xs text-slate-500">
                Administra accesos por usuario (Admin, Supervisor, Atención al Cliente, Técnico)
              </p>
            </div>

            <button
              onClick={abrirModalNuevoUsuario}
              className="px-3.5 py-2 bg-[#0A84FF] hover:bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Nuevo Usuario
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b">
                  <th className="py-2.5 px-3 font-bold">Usuario / Nombre</th>
                  <th className="py-2.5 px-3 font-bold">Rol</th>
                  <th className="py-2.5 px-3 font-bold">Sub-Roles / Unidad Asignada</th>
                  <th className="py-2.5 px-3 font-bold text-right">Configurar</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsuarios ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-slate-400">
                      Cargando equipo...
                    </td>
                  </tr>
                ) : usuarios.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-slate-400">
                      Aún no hay usuarios adicionales registrados.
                    </td>
                  </tr>
                ) : (
                  usuarios.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100">
                      <td className="py-2.5 px-3">
                        <p className="font-bold text-[#0D1B2A]">{u.nombre}</p>
                        <p className="text-[11px] font-mono text-slate-500">@{u.username}</p>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0A84FF] font-bold uppercase text-[10px]">
                          {u.rol}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 space-y-1">
                        <p className="text-slate-600">
                          Unidad:{' '}
                          <strong>{u.unidad_movil || 'Oficina Central / Laboratorio'}</strong>
                        </p>
                        {Array.isArray(u.sub_roles) && u.sub_roles.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {u.sub_roles.map((sr) => (
                              <span
                                key={sr}
                                className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]"
                              >
                                {sr}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => abrirModalEditarUsuario(u)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Usuario */}
      {modalUsuario && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-bold text-lg text-[#0D1B2A]">
                {editandoUsuarioId ? 'Editar Usuario del Equipo' : 'Crear Nuevo Usuario'}
              </h3>
              <button
                onClick={() => setModalUsuario(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarUsuario} className="space-y-3.5 text-sm">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nombre de Usuario (para iniciar sesión) *
                </label>
                <input
                  required
                  disabled={Boolean(editandoUsuarioId)}
                  value={formUsuario.username}
                  onChange={(e) => setFormUsuario({ ...formUsuario, username: e.target.value })}
                  placeholder="Ej. atencion1 o supervisor1"
                  className="w-full px-3 py-2 border rounded-lg font-mono disabled:bg-slate-100"
                />
              </div>

              {!editandoUsuarioId && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Contraseña Inicial *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={formUsuario.password}
                    onChange={(e) =>
                      setFormUsuario({ ...formUsuario, password: e.target.value })
                    }
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nombre Completo *
                </label>
                <input
                  required
                  value={formUsuario.nombre}
                  onChange={(e) => setFormUsuario({ ...formUsuario, nombre: e.target.value })}
                  placeholder="Ej. Andrea López"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Rol Principal *</label>
                <select
                  value={formUsuario.rol}
                  onChange={(e) => setFormUsuario({ ...formUsuario, rol: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="tecnico">Técnico (Con sub-roles)</option>
                  <option value="atencion">Atención al Cliente / Recepción</option>
                  <option value="supervisor">Supervisor de Taller / Inventario</option>
                  <option value="admin">Administrador General</option>
                </select>
              </div>

              {formUsuario.rol === 'tecnico' && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                  <p className="text-xs font-bold text-[#0D1B2A]">
                    Sub-Roles Asignados (puede tener varios):
                  </p>
                  <div className="space-y-1.5">
                    {SUB_ROLES_DISPONIBLES.map((sr) => (
                      <label key={sr} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formUsuario.sub_roles.includes(sr)}
                          onChange={() => toggleSubRol(sr)}
                          className="rounded text-[#0A84FF]"
                        />
                        <span>{sr}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Unidad Móvil / Bodega Asignada (para descargo QR):
                </label>
                <select
                  value={formUsuario.unidad_movil}
                  onChange={(e) =>
                    setFormUsuario({ ...formUsuario, unidad_movil: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {UNIDADES_DISPONIBLES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalUsuario(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoUsuario}
                  className="px-5 py-2 bg-[#0A84FF] hover:bg-blue-600 text-white font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
                >
                  {guardandoUsuario && <Loader2 className="w-4 h-4 animate-spin" />}
                  {guardandoUsuario ? 'Guardando...' : 'Guardar Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}