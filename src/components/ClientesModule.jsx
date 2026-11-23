import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  Plus,
  Search,
  Users,
  Phone,
  Mail,
  Building2,
  IdCard,
  UserCheck,
  Edit3,
  X,
  Loader2,
} from 'lucide-react'

export default function ClientesModule({ perfil }) {
  const [clientes, setClientes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('Todos')
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [guardando, setGuardando] = useState(false)

  // Solo Admin, Atención al cliente y Supervisor pueden crear/modificar clientes
  const puedeEditar = ['admin', 'atencion', 'supervisor'].includes(perfil?.rol)

  const [form, setForm] = useState({
    tipo_cliente: 'Particular',
    nombre: '',
    telefono: '',
    correo: '',
    dui: '',
    nit_nrc: '',
    nit: '',
    actividad_economica: '',
    encargado: '',
  })

  const cargarClientes = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .order('id', { ascending: false })
    setClientes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargarClientes()
  }, [])

  const abrirNuevo = () => {
    if (!puedeEditar) return
    setEditando(null)
    setForm({
      tipo_cliente: 'Particular',
      nombre: '',
      telefono: '',
      correo: '',
      dui: '',
      nit_nrc: '',
      nit: '',
      actividad_economica: '',
      encargado: '',
    })
    setModalAbierto(true)
  }

  const abrirEditar = (c) => {
    if (!puedeEditar) return
    setEditando(c)
    setForm({
      tipo_cliente: c.tipo_cliente === 'Taller' ? 'Taller' : 'Particular',
      nombre: c.nombre || '',
      telefono: c.telefono || '',
      correo: c.correo || '',
      dui: c.dui || '',
      nit_nrc: c.nit_nrc || '',
      nit: c.nit || '',
      actividad_economica: c.actividad_economica || '',
      encargado: c.encargado || '',
    })
    setModalAbierto(true)
  }

  const guardarCliente = async (e) => {
    e.preventDefault()
    if (!puedeEditar) return
    setGuardando(true)

    const payload =
      form.tipo_cliente === 'Particular'
        ? {
            tipo_cliente: 'Particular',
            nombre: form.nombre.trim(),
            telefono: form.telefono.trim(),
            correo: form.correo.trim() || null,
            dui: form.dui.trim() || null,
            nit_nrc: null,
            nit: null,
            actividad_economica: null,
            encargado: null,
          }
        : {
            tipo_cliente: 'Taller',
            nombre: form.nombre.trim(),
            telefono: form.telefono.trim(),
            correo: form.correo.trim() || null,
            dui: null,
            nit_nrc: form.nit_nrc.trim() || null,
            nit: form.nit.trim() || null,
            actividad_economica: form.actividad_economica.trim() || null,
            encargado: form.encargado.trim() || null,
          }

    const { error } = editando
      ? await supabase.from('clientes').update(payload).eq('id', editando.id)
      : await supabase.from('clientes').insert([payload])

    setGuardando(false)
    if (error) {
      alert('Error al guardar cliente: ' + error.message)
      return
    }
    setModalAbierto(false)
    cargarClientes()
  }

  const filtrados = clientes.filter((c) => {
    const tipoNorm = c.tipo_cliente === 'Taller' ? 'Taller' : 'Particular'
    const coincideTipo = filtroTipo === 'Todos' || tipoNorm === filtroTipo
    const q = busqueda.toLowerCase()
    const coincideTexto =
      (c.nombre || '').toLowerCase().includes(q) ||
      (c.telefono || '').toLowerCase().includes(q) ||
      (c.dui || '').toLowerCase().includes(q) ||
      (c.nit || '').toLowerCase().includes(q) ||
      (c.nit_nrc || '').toLowerCase().includes(q) ||
      (c.encargado || '').toLowerCase().includes(q)
    return coincideTipo && coincideTexto
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1B2A]">Directorio de Clientes y Talleres</h2>
          <p className="text-sm text-slate-500">
            Registro comercial diferenciado para clientes particulares y talleres/empresas
          </p>
        </div>

        {puedeEditar && (
          <button
            onClick={abrirNuevo}
            className="px-4 py-2 bg-[#0A84FF] hover:bg-blue-600 text-white text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer self-start"
          >
            <Plus className="w-4 h-4" />
            Nuevo Cliente
          </button>
        )}
      </div>

      {/* Buscador y Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, empresa, WhatsApp, DUI, NIT, NRC o encargado..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0A84FF]"
          />
        </div>

        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg">
          {['Todos', 'Particular', 'Taller'].map((tipo) => (
            <button
              key={tipo}
              onClick={() => setFiltroTipo(tipo)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                filtroTipo === tipo
                  ? 'bg-white text-[#0D1B2A] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tipo}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-500">Cargando directorio...</div>
      ) : filtrados.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-600 font-medium">No hay registros con este filtro</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((c) => {
            const esTaller = c.tipo_cliente === 'Taller'
            return (
              <div
                key={c.id}
                className="border border-slate-200 rounded-xl p-4 hover:border-[#0A84FF] transition bg-white flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        esTaller ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {esTaller ? 'Taller / Empresa' : 'Particular'}
                    </span>
                    {puedeEditar && (
                      <button
                        onClick={() => abrirEditar(c)}
                        className="p-1.5 text-slate-400 hover:text-[#0D1B2A] cursor-pointer"
                        title="Editar datos"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-800 mt-2 text-base">{c.nombre}</h3>

                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    {c.telefono && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>WhatsApp: {c.telefono}</span>
                      </p>
                    )}
                    {c.correo && (
                      <p className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-[#0A84FF] shrink-0" />
                        <span className="truncate">{c.correo}</span>
                      </p>
                    )}

                    {!esTaller && c.dui && (
                      <p className="flex items-center gap-1.5">
                        <IdCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>DUI: {c.dui}</span>
                      </p>
                    )}

                    {esTaller && (
                      <>
                        {c.encargado && (
                          <p className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>Encargado: {c.encargado}</span>
                          </p>
                        )}
                        {(c.nit_nrc || c.nit) && (
                          <p className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>
                              {c.nit_nrc ? `NRC: ${c.nit_nrc}` : ''}{' '}
                              {c.nit ? `• NIT: ${c.nit}` : ''}
                            </span>
                          </p>
                        )}
                        {c.actividad_economica && (
                          <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded mt-1.5">
                            Giro: {c.actividad_economica}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Crear / Editar Cliente */}
      {modalAbierto && puedeEditar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-bold text-lg text-[#0D1B2A]">
                {editando ? 'Editar Registro' : 'Nuevo Cliente / Taller'}
              </h3>
              <button
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarCliente} className="space-y-4 text-sm">
              {/* Selector Particular vs Taller */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                {['Particular', 'Taller'].map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setForm({ ...form, tipo_cliente: tipo })}
                    className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                      form.tipo_cliente === tipo
                        ? 'bg-[#0D1B2A] text-white shadow'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tipo === 'Particular' ? 'Cliente Particular' : 'Taller o Empresa'}
                  </button>
                ))}
              </div>

              {form.tipo_cliente === 'Particular' ? (
                /* FORMULARIO PARTICULAR */
                <div className="space-y-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Nombre Completo del Cliente *
                    </label>
                    <input
                      required
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      placeholder="Ej. Carlos Alberto Gómez"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Número de WhatsApp *
                      </label>
                      <input
                        required
                        value={form.telefono}
                        onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                        placeholder="Ej. 7890-1234"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">DUI</label>
                      <input
                        value={form.dui}
                        onChange={(e) => setForm({ ...form, dui: e.target.value })}
                        placeholder="00000000-0"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={form.correo}
                      onChange={(e) => setForm({ ...form, correo: e.target.value })}
                      placeholder="cliente@correo.com"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
              ) : (
                /* FORMULARIO TALLER O EMPRESA */
                <div className="space-y-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Nombre de la Empresa / Taller *
                    </label>
                    <input
                      required
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      placeholder="Ej. Automotriz San Salvador S.A. de C.V."
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Número de WhatsApp *
                      </label>
                      <input
                        required
                        value={form.telefono}
                        onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                        placeholder="Ej. 7890-1234"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Encargado o Contacto *
                      </label>
                      <input
                        required
                        value={form.encargado}
                        onChange={(e) => setForm({ ...form, encargado: e.target.value })}
                        placeholder="Nombre del jefe de taller"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={form.correo}
                      onChange={(e) => setForm({ ...form, correo: e.target.value })}
                      placeholder="taller@empresa.com"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Registro (NRC)
                      </label>
                      <input
                        value={form.nit_nrc}
                        onChange={(e) => setForm({ ...form, nit_nrc: e.target.value })}
                        placeholder="Ej. 123456-7"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">NIT</label>
                      <input
                        value={form.nit}
                        onChange={(e) => setForm({ ...form, nit: e.target.value })}
                        placeholder="0614-000000-000-0"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Actividad Económica / Giro
                    </label>
                    <input
                      value={form.actividad_economica}
                      onChange={(e) =>
                        setForm({ ...form, actividad_economica: e.target.value })
                      }
                      placeholder="Ej. Mantenimiento y reparación de vehículos automotores"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 bg-[#0A84FF] text-white font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
                >
                  {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}