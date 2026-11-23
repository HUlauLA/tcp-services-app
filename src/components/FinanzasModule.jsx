import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  X,
  Loader2,
  Wrench,
  KeyRound,
  Receipt,
} from 'lucide-react'

const CATEGORIAS_EGRESO = [
  'Componentes Electrónicos / Memorias',
  'Llaves, Chips y Controles',
  'Combustible y Viáticos Unidad Móvil',
  'Herramientas y Equipo de Laboratorio',
  'Software, Tokens y Suscripciones',
  'Insumos de Taller y Papelería',
  'Servicios Básicos / Local',
  'Planilla / Comisiones',
  'Otros Gastos Operativos',
]

const CATEGORIAS_INGRESO = [
  'Cobro / Liquidación de OT',
  'Venta Directa de Repuesto / Llave',
  'Diagnóstico / Consulta Técnica',
  'Servicio a Domicilio / Unidad Móvil',
  'Otro Ingreso',
]

const METODOS_PAGO = ['Efectivo', 'Transferencia Bancaria', 'Tarjeta / POS', 'Chivo / Bitcoin', 'Otro']

export default function FinanzasModule({ perfil }) {
  const [movimientosManuales, setMovimientosManuales] = useState([])
  const [ordenesTrabajo, setOrdenesTrabajo] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const hoyStr = new Date().toISOString().split('T')[0]
  const primerDiaMes = `${hoyStr.slice(0, 8)}01`
  const [fechaInicio, setFechaInicio] = useState(primerDiaMes)
  const [fechaFin, setFechaFin] = useState(hoyStr)
  const [filtroTipo, setFiltroTipo] = useState('todos') // todos | ingreso | egreso
  const [filtroLinea, setFiltroLinea] = useState('todas') // todas | Laboratorio ECU | Cerrajería Express | General
  const [busqueda, setBusqueda] = useState('')

  // Modal Nuevo Movimiento
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [formMov, setFormMov] = useState({
    fecha: hoyStr,
    tipo: 'egreso',
    categoria: CATEGORIAS_EGRESO[0],
    concepto: '',
    monto: '',
    metodo_pago: 'Efectivo',
    linea_servicio: 'General',
    comprobante_ref: '',
    notas: '',
  })

  const rol = perfil?.rol || 'tecnico'

  const cargarDatosFinancieros = async () => {
    setLoading(true)
    const [{ data: movs, error: errMov }, { data: ots, error: errOt }] = await Promise.all([
      supabase
        .from('movimientos_financieros')
        .select('*')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('ordenes_trabajo')
        .select('*')
        .order('created_at', { ascending: false }),
    ])

    if (!errMov) setMovimientosManuales(movs || [])
    if (!errOt) setOrdenesTrabajo(ots || [])
    setLoading(false)
  }

  useEffect(() => {
    cargarDatosFinancieros()
  }, [])

  // Unificar ingresos provenientes de Órdenes de Trabajo + movimientos manuales
  const libroContableUnificado = useMemo(() => {
    const lista = []

    // 1. Movimientos registrados manualmente en finanzas
    for (const m of movimientosManuales) {
      lista.push({
        uid: `mov-${m.id}`,
        dbId: m.id,
        origen: 'manual',
        fecha: m.fecha,
        tipo: m.tipo,
        categoria: m.categoria,
        concepto: m.concepto,
        monto: Number(m.monto || 0),
        metodo_pago: m.metodo_pago || 'Efectivo',
        linea_servicio: m.linea_servicio || 'General',
        referencia: m.comprobante_ref || '',
        notas: m.notas || '',
        usuario: m.registrado_por || '',
      })
    }

    // 2. Ingresos automáticos desde Órdenes de Trabajo (abonos o total pagado)
    for (const ot of ordenesTrabajo) {
      const totalOt = Number(ot.costo_total || ot.precio_total || ot.total || 0)
      const abonoOt = Number(ot.abono || ot.anticipo || 0)
      const estadoOt = (ot.estado || '').toLowerCase()
      const pagadaCompleta = ['entregado', 'finalizado', 'pagado'].includes(estadoOt)

      const montoIngresado = pagadaCompleta ? totalOt : abonoOt
      if (montoIngresado > 0) {
        const fechaOt = (ot.fecha_entrega || ot.updated_at || ot.created_at || hoyStr).slice(0, 10)
        const numeroOt = ot.numero_orden || ot.codigo_ot || `OT-${ot.id}`
        const linea =
          ot.tipo_servicio === 'cerrajeria' ||
          (ot.linea_servicio || '').toLowerCase().includes('cerrajer')
            ? 'Cerrajería Express'
            : 'Laboratorio ECU'

        lista.push({
          uid: `ot-${ot.id}`,
          dbId: ot.id,
          origen: 'ot',
          fecha: fechaOt,
          tipo: 'ingreso',
          categoria: pagadaCompleta ? 'Liquidación OT' : 'Anticipo / Abono OT',
          concepto: `${numeroOt} — ${ot.cliente_nombre || 'Cliente'} (${
            ot.vehiculo || ot.modulo_ecu || 'Servicio técnico'
          })`,
          monto: montoIngresado,
          metodo_pago: ot.metodo_pago || 'Caja Taller',
          linea_servicio: linea,
          referencia: numeroOt,
          notas: pagadaCompleta
            ? 'Orden liquidada'
            : `Saldo pendiente: $${Math.max(0, totalOt - abonoOt).toFixed(2)}`,
          usuario: ot.tecnico_asignado || 'Sistema OT',
        })
      }
    }

    return lista.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
  }, [movimientosManuales, ordenesTrabajo, hoyStr])

  // Aplicar filtros de fecha, tipo, línea y búsqueda
  const movimientosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return libroContableUnificado.filter((item) => {
      if (fechaInicio && item.fecha < fechaInicio) return false
      if (fechaFin && item.fecha > fechaFin) return false
      if (filtroTipo !== 'todos' && item.tipo !== filtroTipo) return false
      if (filtroLinea !== 'todas' && item.linea_servicio !== filtroLinea) return false
      if (q) {
        return (
          (item.concepto || '').toLowerCase().includes(q) ||
          (item.categoria || '').toLowerCase().includes(q) ||
          (item.referencia || '').toLowerCase().includes(q) ||
          (item.metodo_pago || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [libroContableUnificado, fechaInicio, fechaFin, filtroTipo, filtroLinea, busqueda])

  // Cálculos de KPIs
  const resumenKPI = useMemo(() => {
    let ingresos = 0
    let egresos = 0
    for (const m of movimientosFiltrados) {
      if (m.tipo === 'ingreso') ingresos += m.monto
      if (m.tipo === 'egreso') egresos += m.monto
    }

    // Cuentas por cobrar globales en OT abiertas
    let porCobrar = 0
    for (const ot of ordenesTrabajo) {
      const estadoOt = (ot.estado || '').toLowerCase()
      if (!['entregado', 'finalizado', 'pagado', 'cancelado'].includes(estadoOt)) {
        const totalOt = Number(ot.costo_total || ot.precio_total || ot.total || 0)
        const abonoOt = Number(ot.abono || ot.anticipo || 0)
        porCobrar += Math.max(0, totalOt - abonoOt)
      }
    }

    return {
      ingresos,
      egresos,
      balance: ingresos - egresos,
      porCobrar,
    }
  }, [movimientosFiltrados, ordenesTrabajo])

  const abrirModalConTipo = (tipoInicial) => {
    setFormMov({
      fecha: hoyStr,
      tipo: tipoInicial,
      categoria: tipoInicial === 'egreso' ? CATEGORIAS_EGRESO[0] : CATEGORIAS_INGRESO[0],
      concepto: '',
      monto: '',
      metodo_pago: 'Efectivo',
      linea_servicio: 'General',
      comprobante_ref: '',
      notas: '',
    })
    setModalAbierto(true)
  }

  const guardarMovimiento = async (e) => {
    e.preventDefault()
    const montoNum = parseFloat(formMov.monto)
    if (isNaN(montoNum) || montoNum <= 0) {
      alert('Ingresa un monto válido mayor a $0.00')
      return
    }

    setGuardando(true)
    try {
      const payload = {
        fecha: formMov.fecha,
        tipo: formMov.tipo,
        categoria: formMov.categoria,
        concepto: formMov.concepto.trim(),
        monto: montoNum,
        metodo_pago: formMov.metodo_pago,
        linea_servicio: formMov.linea_servicio,
        comprobante_ref: formMov.comprobante_ref.trim() || null,
        notas: formMov.notas.trim() || null,
        registrado_por: perfil?.nombre || 'Administrador TCP',
      }

      const { error } = await supabase.from('movimientos_financieros').insert([payload])
      if (error) throw error

      setModalAbierto(false)
      cargarDatosFinancieros()
    } catch (err) {
      alert('Error al registrar movimiento: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminarMovimientoManual = async (mov) => {
    if (mov.origen !== 'manual') return
    if (!confirm(`¿Eliminar el registro "${mov.concepto}" por $${mov.monto.toFixed(2)}?`)) return

    const { error } = await supabase
      .from('movimientos_financieros')
      .delete()
      .eq('id', mov.dbId)

    if (!error) cargarDatosFinancieros()
  }

  const exportarCSV = () => {
    const encabezados = [
      'Fecha',
      'Tipo',
      'Linea_Servicio',
      'Categoria',
      'Concepto',
      'Metodo_Pago',
      'Referencia',
      'Monto_USD',
    ]
    const filas = movimientosFiltrados.map((m) => [
      m.fecha,
      m.tipo.toUpperCase(),
      `"${m.linea_servicio}"`,
      `"${m.categoria}"`,
      `"${(m.concepto || '').replace(/"/g, '""')}"`,
      `"${m.metodo_pago}"`,
      `"${m.referencia}"`,
      m.tipo === 'egreso' ? (-m.monto).toFixed(2) : m.monto.toFixed(2),
    ])

    const csvContenido =
      '\uFEFF' + [encabezados.join(','), ...filas.map((f) => f.join(','))].join('\n')
    const blob = new Blob([csvContenido], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Finanzas_TCP_${fechaInicio}_a_${fechaFin}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (rol !== 'admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <p className="font-bold text-[#0D1B2A]">Acceso Restringido</p>
        <p className="text-sm text-slate-500 mt-1">
          Solo el perfil Administrador puede consultar y registrar movimientos financieros.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Encabezado y Acciones Rápidas */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1B2A]">
            Finanzas y Control de Caja — TCP Automotive Services
          </h2>
          <p className="text-sm text-slate-500">
            Ingresos sincronizados con Órdenes de Trabajo, egresos operativos y balance neto (USD)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportarCSV}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-[#0D1B2A] border border-slate-300 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#0A84FF]" />
            Exportar Excel (CSV)
          </button>

          <button
            onClick={() => abrirModalConTipo('egreso')}
            className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Registrar Gasto / Egreso
          </button>

          <button
            onClick={() => abrirModalConTipo('ingreso')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Registrar Ingreso Extra
          </button>
        </div>
      </div>

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>INGRESOS DEL PERÍODO</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-700 mt-2">
            ${resumenKPI.ingresos.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">OT cobradas + ingresos manuales</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>EGRESOS / GASTOS</span>
            <TrendingDown className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-extrabold text-red-600 mt-2">
            ${resumenKPI.egresos.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Insumos, repuestos y operación</p>
        </div>

        <div className="bg-[#0D1B2A] text-white p-5 rounded-2xl shadow-sm border-b-4 border-[#0A84FF]">
          <div className="flex items-center justify-between text-xs font-bold text-sky-300">
            <span>BALANCE NETO</span>
            <Wallet className="w-4 h-4 text-[#0A84FF]" />
          </div>
          <p
            className={`text-2xl font-extrabold mt-2 ${
              resumenKPI.balance >= 0 ? 'text-white' : 'text-red-400'
            }`}
          >
            ${resumenKPI.balance.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Utilidad neta en el rango filtrado</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>POR COBRAR EN OT</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold text-amber-600 mt-2">
            ${resumenKPI.porCobrar.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Saldos pendientes en taller</p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#0D1B2A]">
          <Filter className="w-3.5 h-3.5 text-[#0A84FF]" />
          <span>Filtros de Período y Clasificación</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Desde</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">Hasta</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">Tipo de Movimiento</label>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value="todos">Todos (Ingresos y Egresos)</option>
              <option value="ingreso">Solo Ingresos (+)</option>
              <option value="egreso">Solo Egresos (-)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">Línea de Servicio</label>
            <select
              value={filtroLinea}
              onChange={(e) => setFiltroLinea(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value="todas">Todas las líneas</option>
              <option value="Laboratorio ECU">Laboratorio ECU</option>
              <option value="Cerrajería Express">Cerrajería Express</option>
              <option value="General">General / Taller</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-500 font-semibold mb-1">Buscar</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="OT, cliente, gasto..."
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Movimientos Financieros */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#0D1B2A] text-white border-b-2 border-[#0A84FF]">
                <th className="py-3 px-4 font-bold">Fecha</th>
                <th className="py-3 px-4 font-bold">Tipo</th>
                <th className="py-3 px-4 font-bold">Línea</th>
                <th className="py-3 px-4 font-bold">Categoría / Concepto</th>
                <th className="py-3 px-4 font-bold">Método / Ref</th>
                <th className="py-3 px-4 font-bold text-right">Monto (USD)</th>
                <th className="py-3 px-4 font-bold text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-slate-500">
                    Cargando movimientos financieros...
                  </td>
                </tr>
              ) : movimientosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-slate-400">
                    No hay movimientos registrados en el rango seleccionado.
                  </td>
                </tr>
              ) : (
                movimientosFiltrados.map((m, idx) => {
                  const esIngreso = m.tipo === 'ingreso'
                  return (
                    <tr
                      key={m.uid}
                      className={`border-b border-slate-100 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {m.fecha}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            esIngreso
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {esIngreso ? 'INGRESO' : 'EGRESO'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                          {m.linea_servicio === 'Laboratorio ECU' && (
                            <Wrench className="w-3 h-3 text-[#0A84FF]" />
                          )}
                          {m.linea_servicio === 'Cerrajería Express' && (
                            <KeyRound className="w-3 h-3 text-amber-600" />
                          )}
                          {m.linea_servicio}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-[#0D1B2A]">{m.concepto}</p>
                        <p className="text-[11px] text-slate-500">
                          {m.categoria}
                          {m.notas ? ` • ${m.notas}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        <p>{m.metodo_pago}</p>
                        {m.referencia && (
                          <p className="text-[11px] font-mono text-[#0A84FF]">{m.referencia}</p>
                        )}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-extrabold whitespace-nowrap ${
                          esIngreso ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {esIngreso ? '+' : '-'}${m.monto.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {m.origen === 'manual' ? (
                          <button
                            onClick={() => eliminarMovimientoManual(m)}
                            title="Eliminar registro"
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span
                            title="Sincronizado automáticamente desde Órdenes de Trabajo"
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500"
                          >
                            <Receipt className="w-3 h-3" />
                            Auto OT
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Registrar Movimiento */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <DollarSign
                  className={`w-5 h-5 ${
                    formMov.tipo === 'ingreso' ? 'text-emerald-600' : 'text-red-600'
                  }`}
                />
                <h3 className="font-bold text-lg text-[#0D1B2A]">
                  {formMov.tipo === 'ingreso'
                    ? 'Registrar Ingreso Extra'
                    : 'Registrar Gasto / Egreso Operativo'}
                </h3>
              </div>
              <button
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarMovimiento} className="space-y-4 text-sm">
              {/* Selector rápido de tipo */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() =>
                    setFormMov({
                      ...formMov,
                      tipo: 'egreso',
                      categoria: CATEGORIAS_EGRESO[0],
                    })
                  }
                  className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    formMov.tipo === 'egreso'
                      ? 'bg-red-600 text-white shadow'
                      : 'text-slate-600'
                  }`}
                >
                  Egreso / Gasto (-)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormMov({
                      ...formMov,
                      tipo: 'ingreso',
                      categoria: CATEGORIAS_INGRESO[0],
                    })
                  }
                  className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    formMov.tipo === 'ingreso'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-600'
                  }`}
                >
                  Ingreso (+)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={formMov.fecha}
                    onChange={(e) => setFormMov({ ...formMov, fecha: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Monto (USD $) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formMov.monto}
                    onChange={(e) => setFormMov({ ...formMov, monto: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-lg font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoría *</label>
                  <select
                    value={formMov.categoria}
                    onChange={(e) => setFormMov({ ...formMov, categoria: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {(formMov.tipo === 'egreso' ? CATEGORIAS_EGRESO : CATEGORIAS_INGRESO).map(
                      (cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Línea de Servicio
                  </label>
                  <select
                    value={formMov.linea_servicio}
                    onChange={(e) =>
                      setFormMov({ ...formMov, linea_servicio: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="General">General / Taller</option>
                    <option value="Laboratorio ECU">Laboratorio ECU</option>
                    <option value="Cerrajería Express">Cerrajería Express</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Concepto / Descripción *
                </label>
                <input
                  required
                  value={formMov.concepto}
                  onChange={(e) => setFormMov({ ...formMov, concepto: e.target.value })}
                  placeholder={
                    formMov.tipo === 'egreso'
                      ? 'Ej. Compra de 5 transponders ID48 y drivers L9132'
                      : 'Ej. Venta directa de carcasa llave Toyota'
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={formMov.metodo_pago}
                    onChange={(e) => setFormMov({ ...formMov, metodo_pago: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {METODOS_PAGO.map((mp) => (
                      <option key={mp} value={mp}>
                        {mp}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    N° Factura / Comprobante
                  </label>
                  <input
                    value={formMov.comprobante_ref}
                    onChange={(e) =>
                      setFormMov({ ...formMov, comprobante_ref: e.target.value })
                    }
                    placeholder="Ej. CCF-00142 o Recibo"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Notas adicionales
                </label>
                <input
                  value={formMov.notas}
                  onChange={(e) => setFormMov({ ...formMov, notas: e.target.value })}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
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
                  className={`px-6 py-2 text-white font-semibold rounded-lg flex items-center gap-2 cursor-pointer ${
                    formMov.tipo === 'ingreso'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}