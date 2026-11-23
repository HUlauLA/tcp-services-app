import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { generarOrdenTrabajoPDF } from '../lib/ordenTrabajoPDF'
import {
  Folder,
  FolderOpen,
  Plus,
  Search,
  Eye,
  FileText,
  X,
  Loader2,
  MapPin,
  Bell,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  Wrench,
  Inbox,
  KeyRound,
  Package,
} from 'lucide-react'

function sumarDiasDesdeHoy(dias) {
  const dt = new Date()
  dt.setDate(dt.getDate() + dias)
  return dt.toISOString().split('T')[0]
}

const CHECKLIST_RECEPCION_LAB = [
  'Carcasa / Tapas completas',
  'Pines / Conectores sin doblar',
  'Sin humedad / sulfatación visible',
  'Sin intervención previa',
  'Incluye llave / inmovilizador / antena',
]

export default function OrdenesModule({
  perfil,
  otPreseleccionadaId,
  onLimpiarPreseleccion,
}) {
  const [ordenes, setOrdenes] = useState([])
  const [clientes, setClientes] = useState([])
  const [productosCatalogo, setProductosCatalogo] = useState([])
  const [loading, setLoading] = useState(true)

  // Carpetas por estado: 'Recibido' | 'En proceso' | 'Finalizado' | 'Todas'
  const [carpetaEstado, setCarpetaEstado] = useState('Todas')
  const [filtroServicio, setFiltroServicio] = useState('Todas')
  const [busqueda, setBusqueda] = useState('')

  // Modal Nueva OT (formato completo TCP)
  const [modalCrear, setModalCrear] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState('')

  const [formNuevaOt, setFormNuevaOt] = useState({
    tipo_servicio: 'Laboratorio', // Laboratorio | Cerrajería | Programación | Heavy Duty
    cliente_nombre: '',
    cliente_telefono: '',
    empresa_taller: '',
    // Datos vehículo / módulo
    marca: '',
    modelo: '',
    anio: '',
    vin: '',
    modulo_ecu: '',
    numero_parte_ecu: '',
    // Específico Cerrajería Express
    subtipo_cerrajeria: 'Duplicado',
    producto_id: '',
    cantidad_producto: 1,
    direccion_servicio: '',
    // Diagnóstico y recepción
    descripcion_falla: '',
    checklist_recepcion: [],
    // Costos
    costo_total: '',
    abono: '',
    // Programación Calendario & Alarma SLA
    fecha_programada: '',
    hora_programada: '',
    alarma_sla_activa: true,
    dias_limite_sla: 3,
  })

  // Modal Detalle / Seguimiento / Recordatorio de Entrega
  const [otDetalle, setOtDetalle] = useState(null)
  const [guardandoDetalle, setGuardandoDetalle] = useState(false)
  const [formDetalle, setFormDetalle] = useState({
    estado: 'Recibido',
    diagnostico: '',
    notas_tecnicas: '',
    fecha_programada: '',
    hora_programada: '',
    alarma_sla_activa: false,
    dias_limite_sla: 3,
    recordatorio_entrega: '',
    nota_recordatorio: '',
  })

  const rol = perfil?.rol || 'tecnico'
  const puedeCrearOt = ['admin', 'supervisor', 'atencion'].includes(rol)

  const cargarTodo = async () => {
    setLoading(true)
    const [{ data: ots }, { data: clis }, { data: prods }] = await Promise.all([
      supabase.from('ordenes_trabajo').select('*').order('id', { ascending: false }),
      supabase.from('clientes').select('*').order('nombre', { ascending: true }),
      supabase
        .from('catalogo_productos')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true }),
    ])

    const listaOts = ots || []
    setOrdenes(listaOts)
    setClientes(clis || [])
    setProductosCatalogo(prods || [])

    if (otPreseleccionadaId) {
      const encontrada = listaOts.find((o) => o.id === otPreseleccionadaId)
      if (encontrada) {
        abrirDetalleOt(encontrada)
      }
      if (onLimpiarPreseleccion) onLimpiarPreseleccion()
    }
    setLoading(false)
  }

  useEffect(() => {
    cargarTodo()
  }, [otPreseleccionadaId])

  const seleccionarClienteDirectorio = (id) => {
    setClienteSeleccionadoId(id)
    if (!id) return
    const cli = clientes.find((c) => String(c.id) === String(id))
    if (cli) {
      setFormNuevaOt((prev) => ({
        ...prev,
        cliente_nombre: cli.nombre || '',
        cliente_telefono: cli.telefono || '',
        empresa_taller: cli.empresa || cli.taller || '',
        direccion_servicio: cli.direccion || prev.direccion_servicio,
      }))
    }
  }

  const seleccionarProductoCerrajeria = (prodId) => {
    const prod = productosCatalogo.find((p) => String(p.id) === String(prodId))
    setFormNuevaOt((prev) => ({
      ...prev,
      producto_id: prodId,
      costo_total:
        prod && !prev.costo_total
          ? String(Number(prod.precio_publico || 0) * Number(prev.cantidad_producto || 1))
          : prev.costo_total,
    }))
  }

  const toggleChecklist = (item) => {
    setFormNuevaOt((prev) => {
      const existe = prev.checklist_recepcion.includes(item)
      return {
        ...prev,
        checklist_recepcion: existe
          ? prev.checklist_recepcion.filter((x) => x !== item)
          : [...prev.checklist_recepcion, item],
      }
    })
  }

  const abrirDetalleOt = (ot) => {
    setOtDetalle(ot)
    setFormDetalle({
      estado: ot.estado || 'Recibido',
      diagnostico: ot.diagnostico || '',
      notas_tecnicas: ot.notas_tecnicas || ot.apuntes || '',
      fecha_programada: ot.fecha_programada || '',
      hora_programada: ot.hora_programada || '',
      alarma_sla_activa: Boolean(ot.alarma_sla_activa),
      dias_limite_sla: Number(ot.dias_limite_sla || 3),
      recordatorio_entrega: ot.recordatorio_entrega || '',
      nota_recordatorio: ot.nota_recordatorio || '',
    })
  }

  const crearNuevaOrden = async (e) => {
    e.preventDefault()
    setGuardando(true)

    try {
      const prefijoMap = {
        Laboratorio: 'OT-LAB',
        Programación: 'OT-PRG',
        Cerrajería: 'OT-CER',
        'Heavy Duty': 'OT-HD',
      }
      const prefijo = prefijoMap[formNuevaOt.tipo_servicio] || 'OT-TCP'

      // Correlativo por prefijo de área
      const mismaArea = ordenes.filter((o) =>
        (o.numero_orden || o.codigo_ot || '').startsWith(prefijo)
      )
      const correlativo = String(mismaArea.length + 1).padStart(4, '0')
      const numeroOrden = `${prefijo}-${correlativo}`

      const vehiculoCompleto = [formNuevaOt.marca, formNuevaOt.modelo, formNuevaOt.anio]
        .filter(Boolean)
        .join(' ')

      const productoElegido = productosCatalogo.find(
        (p) => String(p.id) === String(formNuevaOt.producto_id)
      )

      const esLabOProg = ['Laboratorio', 'Programación'].includes(formNuevaOt.tipo_servicio)
      const esCerrajeria = formNuevaOt.tipo_servicio === 'Cerrajería'

      const detalleTrabajo = esCerrajeria
        ? [formNuevaOt.subtipo_cerrajeria, formNuevaOt.descripcion_falla]
            .filter(Boolean)
            .join(' — ')
        : formNuevaOt.descripcion_falla.trim()

      const payload = {
        numero_orden: numeroOrden,
        tipo_servicio: formNuevaOt.tipo_servicio,
        estado: 'Recibido',
        cliente_nombre: formNuevaOt.cliente_nombre.trim(),
        cliente_telefono: formNuevaOt.cliente_telefono.trim(),
        vehiculo: vehiculoCompleto,
        modulo_ecu: [
          formNuevaOt.modulo_ecu,
          formNuevaOt.numero_parte_ecu ? `P/N: ${formNuevaOt.numero_parte_ecu}` : '',
          formNuevaOt.vin ? `VIN: ${formNuevaOt.vin}` : '',
        ]
          .filter(Boolean)
          .join(' • '),
        descripcion_falla: detalleTrabajo,
        direccion_servicio: formNuevaOt.direccion_servicio.trim(),
        costo_total: parseFloat(formNuevaOt.costo_total) || 0,
        abono: parseFloat(formNuevaOt.abono) || 0,
        fecha_programada: formNuevaOt.fecha_programada || null,
        hora_programada: formNuevaOt.hora_programada || null,
        alarma_sla_activa: esLabOProg ? Boolean(formNuevaOt.alarma_sla_activa) : false,
        dias_limite_sla: esLabOProg ? Number(formNuevaOt.dias_limite_sla || 3) : 3,
        notas_tecnicas: [
          productoElegido
            ? `Ítem inventario: [${productoElegido.sku}] ${productoElegido.nombre} (${formNuevaOt.cantidad_producto} ud)`
            : '',
          formNuevaOt.checklist_recepcion.length > 0
            ? `Recepción física: ${formNuevaOt.checklist_recepcion.join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' | '),
        creado_por: perfil?.nombre || 'Atención al Cliente',
      }

      const { error } = await supabase.from('ordenes_trabajo').insert([payload])
      if (error) throw error

      setModalCrear(false)
      setClienteSeleccionadoId('')
      setFormNuevaOt({
        tipo_servicio: 'Laboratorio',
        cliente_nombre: '',
        cliente_telefono: '',
        empresa_taller: '',
        marca: '',
        modelo: '',
        anio: '',
        vin: '',
        modulo_ecu: '',
        numero_parte_ecu: '',
        subtipo_cerrajeria: 'Duplicado',
        producto_id: '',
        cantidad_producto: 1,
        direccion_servicio: '',
        descripcion_falla: '',
        checklist_recepcion: [],
        costo_total: '',
        abono: '',
        fecha_programada: '',
        hora_programada: '',
        alarma_sla_activa: true,
        dias_limite_sla: 3,
      })
      setCarpetaEstado('Recibido')
      cargarTodo()
    } catch (err) {
      alert('Error al crear OT: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const guardarCambiosDetalle = async (e) => {
    e.preventDefault()
    if (!otDetalle) return
    setGuardandoDetalle(true)

    try {
      const payload = {
        estado: formDetalle.estado,
        diagnostico: formDetalle.diagnostico.trim(),
        notas_tecnicas: formDetalle.notas_tecnicas.trim(),
        fecha_programada: formDetalle.fecha_programada || null,
        hora_programada: formDetalle.hora_programada || null,
        alarma_sla_activa: Boolean(formDetalle.alarma_sla_activa),
        dias_limite_sla: Number(formDetalle.dias_limite_sla || 3),
        recordatorio_entrega: formDetalle.recordatorio_entrega || null,
        nota_recordatorio: formDetalle.nota_recordatorio.trim() || null,
      }

      const { error } = await supabase
        .from('ordenes_trabajo')
        .update(payload)
        .eq('id', otDetalle.id)

      if (error) throw error

      setOtDetalle(null)
      cargarTodo()
    } catch (err) {
      alert('Error al actualizar OT: ' + err.message)
    } finally {
      setGuardandoDetalle(false)
    }
  }

  const cambiarEstadoRapido = async (ot, nuevoEstado) => {
    const { error } = await supabase
      .from('ordenes_trabajo')
      .update({ estado: nuevoEstado })
      .eq('id', ot.id)
    if (!error) cargarTodo()
  }

  const contadoresCarpetas = useMemo(() => {
    let recibidas = 0
    let enProceso = 0
    let finalizadas = 0

    for (const ot of ordenes) {
      const est = (ot.estado || 'Recibido').toLowerCase()
      if (est === 'recibido' || est === 'recibidas') recibidas++
      else if (est === 'en proceso') enProceso++
      else if (['finalizado', 'entregado', 'listo'].includes(est)) finalizadas++
    }

    return {
      Recibido: recibidas,
      'En proceso': enProceso,
      Finalizado: finalizadas,
      Todas: ordenes.length,
    }
  }, [ordenes])

  const ordenesFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return ordenes.filter((ot) => {
      const est = (ot.estado || 'Recibido').toLowerCase()
      if (carpetaEstado === 'Recibido' && !['recibido', 'recibidas'].includes(est)) return false
      if (carpetaEstado === 'En proceso' && est !== 'en proceso') return false
      if (
        carpetaEstado === 'Finalizado' &&
        !['finalizado', 'entregado', 'listo'].includes(est)
      ) {
        return false
      }

      if (filtroServicio !== 'Todas') {
        const tipo = (ot.tipo_servicio || '').toLowerCase()
        const num = (ot.numero_orden || ot.codigo_ot || '').toLowerCase()
        if (
          !tipo.includes(filtroServicio.toLowerCase()) &&
          !num.includes(filtroServicio.slice(0, 3).toLowerCase())
        ) {
          return false
        }
      }

      if (q) {
        const num = (ot.numero_orden || ot.codigo_ot || '').toLowerCase()
        return (
          num.includes(q) ||
          (ot.cliente_nombre || '').toLowerCase().includes(q) ||
          (ot.cliente_telefono || '').toLowerCase().includes(q) ||
          (ot.vehiculo || '').toLowerCase().includes(q) ||
          (ot.modulo_ecu || '').toLowerCase().includes(q) ||
          (ot.notas_tecnicas || '').toLowerCase().includes(q)
        )
      }

      return true
    })
  }, [ordenes, carpetaEstado, filtroServicio, busqueda])

  const carpetasConfig = [
    {
      id: 'Recibido',
      titulo: 'Recibidas',
      descripcion: 'Ingresos nuevos por iniciar',
      icon: Inbox,
      colorActivo: 'border-[#0A84FF] bg-blue-50/70 ring-2 ring-[#0A84FF]/25',
      badge: 'bg-amber-100 text-amber-800',
    },
    {
      id: 'En proceso',
      titulo: 'En proceso',
      descripcion: 'En diagnóstico o reparación',
      icon: Wrench,
      colorActivo: 'border-[#0A84FF] bg-blue-50/70 ring-2 ring-[#0A84FF]/25',
      badge: 'bg-blue-100 text-blue-800',
    },
    {
      id: 'Finalizado',
      titulo: 'Finalizado',
      descripcion: 'Listas o entregadas al cliente',
      icon: CheckCircle2,
      colorActivo: 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/25',
      badge: 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'Todas',
      titulo: 'Todas las OT',
      descripcion: 'Historial completo',
      icon: Folder,
      colorActivo: 'border-[#0D1B2A] bg-slate-100 ring-2 ring-slate-400/30',
      badge: 'bg-slate-200 text-slate-800',
    },
  ]

  const esCerrajeriaModal = formNuevaOt.tipo_servicio === 'Cerrajería'
  const esLabOProgModal = ['Laboratorio', 'Programación'].includes(formNuevaOt.tipo_servicio)

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1B2A]">Órdenes de Trabajo (OT)</h2>
          <p className="text-sm text-slate-500">
            Organizadas por carpetas de estado para seguimiento de laboratorio, programación y taller
          </p>
        </div>

        {puedeCrearOt && (
          <button
            onClick={() => setModalCrear(true)}
            className="px-4 py-2.5 bg-[#0A84FF] hover:bg-blue-600 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm cursor-pointer self-start"
          >
            <Plus className="w-4 h-4" />
            Nueva Orden de Trabajo
          </button>
        )}
      </div>

      {/* Carpetas Principales por Estado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {carpetasConfig.map((carp) => {
          const activa = carpetaEstado === carp.id
          const IconCarpeta = activa ? FolderOpen : Folder
          return (
            <button
              key={carp.id}
              type="button"
              onClick={() => setCarpetaEstado(carp.id)}
              className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
                activa
                  ? carp.colorActivo
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <IconCarpeta
                  className={`w-6 h-6 ${activa ? 'text-[#0A84FF]' : 'text-slate-500'}`}
                />
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${carp.badge}`}>
                  {contadoresCarpetas[carp.id] || 0}
                </span>
              </div>

              <div>
                <p className="font-bold text-base text-[#0D1B2A]">{carp.titulo}</p>
                <p className="text-xs text-slate-500">{carp.descripcion}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Filtro por área + Buscador */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="flex flex-wrap items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200">
          {['Todas', 'Laboratorio', 'Programación', 'Cerrajería', 'Heavy Duty'].map((srv) => (
            <button
              key={srv}
              onClick={() => setFiltroServicio(srv)}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${
                filtroServicio === srv
                  ? 'bg-[#0D1B2A] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {srv}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar dentro de carpeta "${carpetaEstado}" por N° OT, cliente, teléfono, vehículo o SKU...`}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#0A84FF]"
          />
        </div>
      </div>

      {/* Tarjetas de Órdenes de Trabajo */}
      {loading ? (
        <div className="py-12 text-center text-slate-500">Cargando órdenes de trabajo...</div>
      ) : ordenesFiltradas.length === 0 ? (
        <div className="py-12 text-center bg-white border-2 border-dashed border-slate-200 rounded-2xl">
          <p className="text-slate-600 font-semibold text-sm">
            No hay órdenes en la carpeta "{carpetaEstado}" con ese filtro.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ordenesFiltradas.map((ot) => {
            const num = ot.numero_orden || ot.codigo_ot || `OT-${ot.id}`
            const total = Number(ot.costo_total ?? ot.precio_total ?? ot.total ?? 0)
            const estadoActual = ot.estado || 'Recibido'
            const fechaTexto = ot.created_at || ot.fecha_creacion
            const fallaTexto = ot.descripcion_falla || ot.falla || ''
            const direccionTexto = ot.direccion_servicio || ot.direccion || ''

            return (
              <div
                key={ot.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-[#0A84FF] transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-[#0D1B2A] text-white font-mono text-xs font-bold">
                        {num}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#0A84FF] text-xs font-bold">
                        {ot.tipo_servicio || 'Laboratorio'}
                      </span>
                    </div>

                    <select
                      value={estadoActual}
                      onChange={(e) => cambiarEstadoRapido(ot, e.target.value)}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer ${
                        estadoActual.toLowerCase() === 'finalizado'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : estadoActual.toLowerCase() === 'en proceso'
                          ? 'bg-blue-100 text-blue-800 border-blue-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      <option value="Recibido">Recibido</option>
                      <option value="En proceso">En proceso</option>
                      <option value="Finalizado">Finalizado</option>
                    </select>
                  </div>

                  {fechaTexto && (
                    <p className="text-[11px] text-slate-400">
                      Generada: {new Date(fechaTexto).toLocaleString('es-SV')}
                    </p>
                  )}

                  <div>
                    <h3 className="font-extrabold text-base text-[#0D1B2A]">
                      {ot.cliente_nombre || 'Cliente'}{' '}
                      {(ot.cliente_telefono || ot.telefono) && (
                        <span className="font-normal text-xs text-slate-500">
                          ({ot.cliente_telefono || ot.telefono})
                        </span>
                      )}
                    </h3>
                    {ot.vehiculo && (
                      <p className="text-xs text-slate-600">
                        <strong>Vehículo:</strong> {ot.vehiculo}
                      </p>
                    )}
                    {ot.modulo_ecu && (
                      <p className="text-xs text-slate-600">
                        <strong>Módulo / Datos:</strong> {ot.modulo_ecu}
                      </p>
                    )}
                    {fallaTexto && <p className="text-xs text-slate-500 mt-1">{fallaTexto}</p>}
                  </div>

                  {ot.notas_tecnicas && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700">
                      {ot.notas_tecnicas}
                    </div>
                  )}

                  {/* Badges de Calendario */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ot.fecha_programada && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-semibold">
                        <CalendarIcon className="w-3 h-3" />
                        Programada: {ot.fecha_programada}
                        {ot.hora_programada ? ` ${ot.hora_programada}` : ''}
                      </span>
                    )}

                    {ot.alarma_sla_activa && estadoActual.toLowerCase() !== 'finalizado' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                        <Bell className="w-3 h-3" />
                        Alarma SLA: {ot.dias_limite_sla || 3} días
                      </span>
                    )}

                    {ot.recordatorio_entrega && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                        <Clock className="w-3 h-3" />
                        Recordar entrega: {ot.recordatorio_entrega}
                      </span>
                    )}
                  </div>

                  {direccionTexto && (
                    <div className="text-xs text-slate-500 pt-1">
                      <p>Dirección: {direccionTexto}</p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          direccionTexto
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[#0A84FF] font-semibold hover:underline mt-0.5"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        Abrir ubicación en Mapa
                      </a>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">
                      {ot.tipo_servicio === 'Cerrajería' ? 'Servicio Exprés' : ot.tipo_servicio}
                    </span>
                    <span className="font-extrabold text-sm text-[#0D1B2A]">
                      ${total.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => generarOrdenTrabajoPDF(ot)}
                      title="Vista previa PDF"
                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => abrirDetalleOt(ot)}
                      className="px-3.5 py-2 rounded-lg bg-[#0A84FF] hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Detalle
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL CREAR NUEVA OT — FORMATO COMPLETO POR ÁREA DE SERVICIO */}
      {modalCrear && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <h3 className="font-bold text-lg text-[#0D1B2A]">
                  Nueva Orden de Trabajo — TCP Automotive Services
                </h3>
                <p className="text-xs text-slate-500">
                  Selecciona la carpeta de servicio para desplegar los campos técnicos correspondientes
                </p>
              </div>
              <button
                onClick={() => setModalCrear(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={crearNuevaOrden} className="space-y-4 text-sm">
              {/* Selector de Carpeta / Área de Servicio */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'Laboratorio', label: 'Laboratorio ECU', pref: 'OT-LAB' },
                  { id: 'Cerrajería', label: 'Cerrajería Express', pref: 'OT-CER' },
                  { id: 'Programación', label: 'Programación', pref: 'OT-PRG' },
                  { id: 'Heavy Duty', label: 'Heavy Duty', pref: 'OT-HD' },
                ].map((area) => {
                  const activa = formNuevaOt.tipo_servicio === area.id
                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() =>
                        setFormNuevaOt({
                          ...formNuevaOt,
                          tipo_servicio: area.id,
                          alarma_sla_activa: ['Laboratorio', 'Programación'].includes(area.id),
                        })
                      }
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        activa
                          ? 'border-[#0A84FF] bg-blue-50 text-[#0D1B2A] ring-2 ring-[#0A84FF]/25'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span className="text-[10px] font-mono font-bold text-[#0A84FF] block">
                        {area.pref}
                      </span>
                      <span className="text-xs font-bold">{area.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Selección de Cliente del Directorio o Registro Rápido */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#0D1B2A]">
                    Datos del Cliente / Taller
                  </label>
                  <select
                    value={clienteSeleccionadoId}
                    onChange={(e) => seleccionarClienteDirectorio(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="">-- Autocompletar desde Directorio de Clientes --</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} {c.telefono ? `(${c.telefono})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre del Cliente *
                    </label>
                    <input
                      required
                      value={formNuevaOt.cliente_nombre}
                      onChange={(e) =>
                        setFormNuevaOt({ ...formNuevaOt, cliente_nombre: e.target.value })
                      }
                      placeholder="Nombre completo o taller"
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Teléfono de Contacto *
                    </label>
                    <input
                      required
                      value={formNuevaOt.cliente_telefono}
                      onChange={(e) =>
                        setFormNuevaOt({ ...formNuevaOt, cliente_telefono: e.target.value })
                      }
                      placeholder="Ej. 7308-1111"
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Datos del Vehículo (Marca, Modelo, Año, VIN) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Marca *
                  </label>
                  <input
                    required
                    value={formNuevaOt.marca}
                    onChange={(e) => setFormNuevaOt({ ...formNuevaOt, marca: e.target.value })}
                    placeholder="Ej. Hyundai"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Modelo *
                  </label>
                  <input
                    required
                    value={formNuevaOt.modelo}
                    onChange={(e) => setFormNuevaOt({ ...formNuevaOt, modelo: e.target.value })}
                    placeholder="Ej. Elantra"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Año *</label>
                  <input
                    required
                    value={formNuevaOt.anio}
                    onChange={(e) => setFormNuevaOt({ ...formNuevaOt, anio: e.target.value })}
                    placeholder="Ej. 2018"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    VIN / Chasis
                  </label>
                  <input
                    value={formNuevaOt.vin}
                    onChange={(e) => setFormNuevaOt({ ...formNuevaOt, vin: e.target.value })}
                    placeholder="17 dígitos (opcional)"
                    className="w-full px-3 py-2 border rounded-lg font-mono text-xs uppercase"
                  />
                </div>
              </div>

              {/* SECCIÓN ESPECÍFICA: CERRAJERÍA EXPRESS */}
              {esCerrajeriaModal ? (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-amber-700" />
                    Detalle de Servicio Exprés / Cerrajería
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Tipo de Trabajo
                      </label>
                      <select
                        value={formNuevaOt.subtipo_cerrajeria}
                        onChange={(e) =>
                          setFormNuevaOt({ ...formNuevaOt, subtipo_cerrajeria: e.target.value })
                        }
                        className="w-full px-3 py-2 border rounded-lg bg-white"
                      >
                        <option value="Duplicado">Duplicado de Llave</option>
                        <option value="Pérdida Total (AKL)">Pérdida Total (All Keys Lost)</option>
                        <option value="Programación Control / Smart Key">
                          Programación Control / Smart Key
                        </option>
                        <option value="Reparación de Chapa / Ignición">
                          Reparación de Chapa / Ignición
                        </option>
                        <option value="Apertura de Vehículo">Apertura de Vehículo</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Llave / Ítem de Inventario
                      </label>
                      <select
                        value={formNuevaOt.producto_id}
                        onChange={(e) => seleccionarProductoCerrajeria(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-white"
                      >
                        <option value="">-- Seleccionar del catálogo --</option>
                        {productosCatalogo.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.sku}] {p.nombre} (${Number(p.precio_publico || 0).toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Cantidad a Entregar
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formNuevaOt.cantidad_producto}
                        onChange={(e) =>
                          setFormNuevaOt({
                            ...formNuevaOt,
                            cantidad_producto: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg bg-white font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Dirección de Atención / Ubicación (para Google Maps)
                    </label>
                    <input
                      value={formNuevaOt.direccion_servicio}
                      onChange={(e) =>
                        setFormNuevaOt({ ...formNuevaOt, direccion_servicio: e.target.value })
                      }
                      placeholder="Ej. Bulevar Los Héroes, San Salvador / Punto de referencia"
                      className="w-full px-3 py-2 border rounded-lg bg-white text-xs"
                    />
                  </div>
                </div>
              ) : (
                /* SECCIÓN ESPECÍFICA: LABORATORIO / PROGRAMACIÓN / HEAVY DUTY */
                <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-[#0D1B2A] flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-[#0A84FF]" />
                    Identificación del Módulo Electrónico y Recepción Física
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Tipo de Módulo (ECU / BCM / TCM / Tablero)
                      </label>
                      <input
                        value={formNuevaOt.modulo_ecu}
                        onChange={(e) =>
                          setFormNuevaOt({ ...formNuevaOt, modulo_ecu: e.target.value })
                        }
                        placeholder="Ej. ECM Bosch ME17.5.6"
                        className="w-full px-3 py-2 border rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Número de Parte / Serie
                      </label>
                      <input
                        value={formNuevaOt.numero_parte_ecu}
                        onChange={(e) =>
                          setFormNuevaOt({ ...formNuevaOt, numero_parte_ecu: e.target.value })
                        }
                        placeholder="Ej. 0 261 S08 016"
                        className="w-full px-3 py-2 border rounded-lg bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">
                      Checklist de Recepción Física:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                      {CHECKLIST_RECEPCION_LAB.map((item) => (
                        <label key={item} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formNuevaOt.checklist_recepcion.includes(item)}
                            onChange={() => toggleChecklist(item)}
                            className="rounded text-[#0A84FF]"
                          />
                          <span>{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Observaciones / Falla Reportada */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observaciones / Falla Reportada *
                </label>
                <textarea
                  rows="2"
                  required
                  value={formNuevaOt.descripcion_falla}
                  onChange={(e) =>
                    setFormNuevaOt({ ...formNuevaOt, descripcion_falla: e.target.value })
                  }
                  placeholder="Describe los síntomas, códigos DTC o detalles del trabajo..."
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {/* Programación en Calendario y Alarma SLA */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-[#0D1B2A] flex items-center gap-1.5">
                  <CalendarIcon className="w-4 h-4 text-[#0A84FF]" />
                  Programación en Calendario y Alarma de Seguimiento
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Fecha Programada por el Cliente (Opcional)
                    </label>
                    <input
                      type="date"
                      value={formNuevaOt.fecha_programada}
                      onChange={(e) =>
                        setFormNuevaOt({ ...formNuevaOt, fecha_programada: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Hora Estimada (Opcional)
                    </label>
                    <input
                      type="time"
                      value={formNuevaOt.hora_programada}
                      onChange={(e) =>
                        setFormNuevaOt({ ...formNuevaOt, hora_programada: e.target.value })
                      }
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    />
                  </div>
                </div>

                {esLabOProgModal && (
                  <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-2 font-semibold text-amber-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formNuevaOt.alarma_sla_activa}
                        onChange={(e) =>
                          setFormNuevaOt({
                            ...formNuevaOt,
                            alarma_sla_activa: e.target.checked,
                          })
                        }
                        className="rounded text-amber-600"
                      />
                      <span>Activar alarma en Dashboard si no hay avances en:</span>
                    </label>

                    <select
                      disabled={!formNuevaOt.alarma_sla_activa}
                      value={formNuevaOt.dias_limite_sla}
                      onChange={(e) =>
                        setFormNuevaOt({
                          ...formNuevaOt,
                          dias_limite_sla: Number(e.target.value),
                        })
                      }
                      className="px-2.5 py-1.5 border rounded-lg bg-white font-bold text-[#0D1B2A]"
                    >
                      <option value={3}>3 días (Estándar)</option>
                      <option value={4}>4 días (Extendido)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Costos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Costo Total ($ USD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formNuevaOt.costo_total}
                    onChange={(e) =>
                      setFormNuevaOt({ ...formNuevaOt, costo_total: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Anticipo / Abono ($ USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formNuevaOt.abono}
                    onChange={(e) =>
                      setFormNuevaOt({ ...formNuevaOt, abono: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalCrear(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-6 py-2 bg-[#0A84FF] hover:bg-blue-600 text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Generar Orden de Trabajo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALLE, AVANCES TÉCNICOS Y RECORDATORIO DE ENTREGA AL CLIENTE */}
      {otDetalle && (
        <div className="fixed inset-0 bg-black/65 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <span className="text-xs font-mono font-bold text-[#0A84FF]">
                  {otDetalle.numero_orden || otDetalle.codigo_ot || `OT-${otDetalle.id}`}
                </span>
                <h3 className="font-bold text-lg text-[#0D1B2A]">
                  Seguimiento Técnico y Recordatorios — {otDetalle.cliente_nombre}
                </h3>
              </div>
              <button
                onClick={() => setOtDetalle(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarCambiosDetalle} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Estado de la Carpeta *
                  </label>
                  <select
                    value={formDetalle.estado}
                    onChange={(e) => setFormDetalle({ ...formDetalle, estado: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg font-bold"
                  >
                    <option value="Recibido">Recibido (Carpeta Recibidas)</option>
                    <option value="En proceso">En proceso (Carpeta En proceso)</option>
                    <option value="Finalizado">Finalizado (Carpeta Finalizado)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cita / Trabajo Programado
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={formDetalle.fecha_programada}
                      onChange={(e) =>
                        setFormDetalle({ ...formDetalle, fecha_programada: e.target.value })
                      }
                      className="w-full px-2.5 py-2 border rounded-lg text-xs"
                    />
                    <input
                      type="time"
                      value={formDetalle.hora_programada}
                      onChange={(e) =>
                        setFormDetalle({ ...formDetalle, hora_programada: e.target.value })
                      }
                      className="w-28 px-2 py-2 border rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Diagnóstico Técnico (al registrar avance se desactiva la alerta de inactividad)
                </label>
                <textarea
                  rows="2"
                  value={formDetalle.diagnostico}
                  onChange={(e) =>
                    setFormDetalle({ ...formDetalle, diagnostico: e.target.value })
                  }
                  placeholder="Hallazgos en banco, pruebas de comunicación, mediciones..."
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Apuntes / Bitácora de Trabajo
                </label>
                <textarea
                  rows="2"
                  value={formDetalle.notas_tecnicas}
                  onChange={(e) =>
                    setFormDetalle({ ...formDetalle, notas_tecnicas: e.target.value })
                  }
                  placeholder="Componentes reemplazados, archivos leídos, observaciones..."
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>

              {/* Recordatorio de Entrega al Cliente */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-emerald-700" />
                    Recordatorio de Entrega / Llamada al Cliente (Se agrega al Calendario)
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setFormDetalle({
                          ...formDetalle,
                          recordatorio_entrega: sumarDiasDesdeHoy(3),
                        })
                      }
                      className="px-2 py-1 rounded bg-white border border-emerald-300 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                    >
                      +3 días
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormDetalle({
                          ...formDetalle,
                          recordatorio_entrega: sumarDiasDesdeHoy(7),
                        })
                      }
                      className="px-2 py-1 rounded bg-white border border-emerald-300 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                    >
                      +1 semana
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-emerald-900 mb-1">
                      Fecha para recordar entrega
                    </label>
                    <input
                      type="date"
                      value={formDetalle.recordatorio_entrega}
                      onChange={(e) =>
                        setFormDetalle({
                          ...formDetalle,
                          recordatorio_entrega: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-emerald-900 mb-1">
                      Nota del cliente
                    </label>
                    <input
                      value={formDetalle.nota_recordatorio}
                      onChange={(e) =>
                        setFormDetalle({
                          ...formDetalle,
                          nota_recordatorio: e.target.value,
                        })
                      }
                      placeholder="Ej. Cliente pidió llamarle el próximo lunes para retirar ECU"
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setOtDetalle(null)}
                  className="px-4 py-2 border rounded-lg text-slate-600 cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={guardandoDetalle}
                  className="px-6 py-2 bg-[#0D1B2A] hover:bg-[#0A84FF] text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  {guardandoDetalle && <Loader2 className="w-4 h-4 animate-spin" />}
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