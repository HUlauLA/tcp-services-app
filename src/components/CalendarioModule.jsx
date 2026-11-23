import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Bell,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Eye,
} from 'lucide-react'

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function formatearFechaISO(dateObj) {
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function sumarDiasISO(fechaISO, dias) {
  if (!fechaISO) return ''
  const [y, m, d] = fechaISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + dias)
  return formatearFechaISO(dt)
}

export default function CalendarioModule({
  perfil,
  modoCompacto = false,
  onAbrirOrden,
}) {
  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [fechaCursor, setFechaCursor] = useState(() => new Date())
  const [diaSeleccionado, setDiaSeleccionado] = useState(() =>
    formatearFechaISO(new Date())
  )
  const [filtroEvento, setFiltroEvento] = useState('todos') // todos | creacion | programado | alarma | entrega

  const cargarOrdenesCalendario = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('ordenes_trabajo')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setOrdenes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    cargarOrdenesCalendario()
  }, [])

  // Construir eventos automáticos a partir de todas las OTs
  const eventosPorFecha = useMemo(() => {
    const mapa = {}
    const agregarEvento = (fecha, evento) => {
      if (!fecha) return
      if (filtroEvento !== 'todos' && evento.tipo !== filtroEvento) return
      if (!mapa[fecha]) mapa[fecha] = []
      mapa[fecha].push(evento)
    }

    for (const ot of ordenes) {
      const numeroOt = ot.numero_orden || ot.codigo_ot || `OT-${ot.id}`
      const cliente = ot.cliente_nombre || 'Cliente'
      const vehiculo = ot.vehiculo || ot.modulo_ecu || ''
      const estado = (ot.estado || 'Recibido').toLowerCase()
      const fechaCreacion = (ot.created_at || '').slice(0, 10)

      // 1. Día en que se creó la OT
      if (fechaCreacion) {
        agregarEvento(fechaCreacion, {
          id: `crea-${ot.id}`,
          tipo: 'creacion',
          titulo: `Ingreso ${numeroOt}`,
          detalle: `${cliente} ${vehiculo ? `• ${vehiculo}` : ''}`,
          estado: ot.estado || 'Recibido',
          ot,
        })
      }

      // 2. Trabajo programado por el cliente / Atención al cliente
      if (ot.fecha_programada) {
        agregarEvento(ot.fecha_programada, {
          id: `prog-${ot.id}`,
          tipo: 'programado',
          titulo: `Cita Programada: ${numeroOt}${
            ot.hora_programada ? ` (${ot.hora_programada})` : ''
          }`,
          detalle: `${cliente} ${vehiculo ? `• ${vehiculo}` : ''}`,
          estado: ot.estado || 'Recibido',
          ot,
        })
      }

      // 3. Alarma SLA (3-4 días) para Laboratorio o Programación
      const esLabOProg =
        ['laboratorio', 'programacion'].includes((ot.tipo_servicio || '').toLowerCase()) ||
        numeroOt.includes('LAB') ||
        numeroOt.includes('PRG')

      if ((ot.alarma_sla_activa || esLabOProg) && fechaCreacion) {
        const diasLimite = Number(ot.dias_limite_sla || 3)
        const fechaLimite = sumarDiasISO(fechaCreacion, diasLimite)
        const sinAvance =
          estado === 'recibido' &&
          !(ot.diagnostico || '').trim() &&
          !(ot.notas_tecnicas || ot.apuntes || '').trim()

        if (!['finalizado', 'entregado', 'cancelado'].includes(estado)) {
          agregarEvento(fechaLimite, {
            id: `sla-${ot.id}`,
            tipo: 'alarma',
            titulo: `Alarma SLA (${diasLimite}d): ${numeroOt}`,
            detalle: sinAvance
              ? `¡Sin iniciar avance! ${cliente} • ${vehiculo}`
              : `Seguimiento Laboratorio/Prog • ${cliente}`,
            urgente: sinAvance,
            estado: ot.estado || 'Recibido',
            ot,
          })
        }
      }

      // 4. Recordatorio de entrega al cliente (ej. dentro de 1 semana o X días)
      if (ot.recordatorio_entrega) {
        agregarEvento(ot.recordatorio_entrega, {
          id: `ent-${ot.id}`,
          tipo: 'entrega',
          titulo: `Recordar Entrega: ${numeroOt}`,
          detalle: `${cliente}${ot.nota_recordatorio ? ` — ${ot.nota_recordatorio}` : ''}`,
          estado: ot.estado || 'Listo',
          ot,
        })
      }
    }

    return mapa
  }, [ordenes, filtroEvento])

  // Celdas del mes actual
  const celdasMes = useMemo(() => {
    const year = fechaCursor.getFullYear()
    const month = fechaCursor.getMonth()
    const primerDiaSemana = new Date(year, month, 1).getDay()
    const diasEnMes = new Date(year, month + 1, 0).getDate()

    const celdas = []
    for (let i = 0; i < primerDiaSemana; i++) {
      celdas.push(null)
    }
    for (let d = 1; d <= diasEnMes; d++) {
      const fechaISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(
        2,
        '0'
      )}`
      celdas.push({
        dia: d,
        fechaISO,
        eventos: eventosPorFecha[fechaISO] || [],
      })
    }
    return celdas
  }, [fechaCursor, eventosPorFecha])

  const cambiarMes = (delta) => {
    setFechaCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const hoyISO = formatearFechaISO(new Date())
  const eventosDiaSeleccionado = eventosPorFecha[diaSeleccionado] || []

  const badgeColorEvento = (tipo) => {
    if (tipo === 'programado') return 'bg-blue-100 text-blue-800 border-blue-200'
    if (tipo === 'alarma') return 'bg-amber-100 text-amber-900 border-amber-300'
    if (tipo === 'entrega') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    return 'bg-slate-100 text-slate-700 border-slate-200'
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3
            className={`${
              modoCompacto ? 'text-base' : 'text-xl'
            } font-bold text-[#0D1B2A] flex items-center gap-2`}
          >
            <CalendarIcon className="w-5 h-5 text-[#0A84FF]" />
            <span>
              {modoCompacto
                ? 'Calendario Operativo y Recordatorios de OT'
                : 'Calendario General de Órdenes de Trabajo'}
            </span>
          </h3>
          {!modoCompacto && (
            <p className="text-xs text-slate-500 mt-0.5">
              Sincronizado automáticamente con ingresos de OT, citas programadas, alarmas SLA (3–4 días) y entregas pendientes
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtroEvento}
            onChange={(e) => setFiltroEvento(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium"
          >
            <option value="todos">Todos los eventos</option>
            <option value="creacion">Creación de OT</option>
            <option value="programado">Trabajos Programados</option>
            <option value="alarma">Alarmas Lab / Prog (3–4 días)</option>
            <option value="entrega">Recordatorios de Entrega</option>
          </select>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            <button
              onClick={() => cambiarMes(-1)}
              className="p-1 hover:bg-slate-100 rounded cursor-pointer"
              title="Mes anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 text-xs font-bold text-[#0D1B2A] min-w-[125px] text-center">
              {MESES[fechaCursor.getMonth()]} {fechaCursor.getFullYear()}
            </span>
            <button
              onClick={() => cambiarMes(1)}
              className="p-1 hover:bg-slate-100 rounded cursor-pointer"
              title="Mes siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Leyenda rápida */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 text-slate-700">
          <span className="w-2 h-2 rounded-full bg-slate-500" /> OT Creada
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 text-blue-700">
          <span className="w-2 h-2 rounded-full bg-[#0A84FF]" /> Trabajo Programado
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 text-amber-800">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Alarma Lab/Prog (3–4d)
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-600" /> Recordatorio Entrega
        </span>
      </div>

      {/* Cuadrícula + Detalle del día */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendario Mensual */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-500 pb-2 border-b">
            {DIAS_SEMANA.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Cargando eventos del calendario...
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 pt-2">
              {celdasMes.map((celda, idx) => {
                if (!celda) {
                  return <div key={`empty-${idx}`} className="min-h-[68px] sm:min-h-[82px]" />
                }

                const esHoy = celda.fechaISO === hoyISO
                const esSeleccionado = celda.fechaISO === diaSeleccionado
                const tieneAlarma = celda.eventos.some((ev) => ev.tipo === 'alarma')

                return (
                  <button
                    key={celda.fechaISO}
                    type="button"
                    onClick={() => setDiaSeleccionado(celda.fechaISO)}
                    className={`min-h-[68px] sm:min-h-[82px] p-1.5 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      esSeleccionado
                        ? 'border-[#0A84FF] bg-blue-50/50 ring-2 ring-[#0A84FF]/30'
                        : esHoy
                        ? 'border-[#0D1B2A] bg-slate-50'
                        : 'border-slate-100 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                          esHoy
                            ? 'bg-[#0D1B2A] text-white'
                            : esSeleccionado
                            ? 'text-[#0A84FF]'
                            : 'text-slate-700'
                        }`}
                      >
                        {celda.dia}
                      </span>
                      {tieneAlarma && (
                        <Bell className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                      )}
                    </div>

                    <div className="space-y-0.5 w-full mt-1 overflow-hidden">
                      {celda.eventos.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          className={`text-[10px] font-semibold px-1 py-0.5 rounded truncate border ${badgeColorEvento(
                            ev.tipo
                          )}`}
                        >
                          {ev.titulo}
                        </div>
                      ))}
                      {celda.eventos.length > 2 && (
                        <p className="text-[10px] font-bold text-[#0A84FF] px-1">
                          +{celda.eventos.length - 2} más
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Agenda del Día Seleccionado */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            <div className="border-b pb-2.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase text-slate-400">
                  Agenda del Día
                </p>
                <p className="text-sm font-extrabold text-[#0D1B2A]">{diaSeleccionado}</p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {eventosDiaSeleccionado.length} evento(s)
              </span>
            </div>

            {eventosDiaSeleccionado.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                No hay OTs creadas, citas ni recordatorios para esta fecha.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {eventosDiaSeleccionado.map((ev) => (
                  <div
                    key={ev.id}
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${badgeColorEvento(
                      ev.tipo
                    )}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold">{ev.titulo}</p>
                      {ev.tipo === 'alarma' && (
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      )}
                      {ev.tipo === 'entrega' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      )}
                      {ev.tipo === 'programado' && (
                        <Clock className="w-4 h-4 text-blue-700 shrink-0" />
                      )}
                      {ev.tipo === 'creacion' && (
                        <Wrench className="w-4 h-4 text-slate-600 shrink-0" />
                      )}
                    </div>

                    <p className="text-[11px] opacity-90">{ev.detalle}</p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/70">
                        Estado: {ev.estado}
                      </span>

                      {onAbrirOrden && (
                        <button
                          type="button"
                          onClick={() => onAbrirOrden(ev.ot)}
                          className="text-[11px] font-bold underline flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          Ver OT
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}