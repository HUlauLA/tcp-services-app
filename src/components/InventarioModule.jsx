import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { comprimirImagen } from '../lib/imageCompressor'
import EtiquetaQRModal from './EtiquetaQRModal'
import {
  Search,
  Plus,
  QrCode,
  Edit3,
  AlertTriangle,
  Package,
  ArrowDownToLine,
  X,
  Loader2,
  Image as ImageIcon,
  CheckSquare,
  Square,
} from 'lucide-react'

const CATEGORIAS_INVENTARIO = [
  'Llave con Chip',
  'Smart Key / Proximidad',
  'Chip Transponder',
  'Control Remoto',
  'Carcasa / Espada',
  'ECU / Módulo Electrónico',
  'Componentes / Memorias / Drivers',
  'Insumos de Laboratorio',
]

export default function InventarioModule({ perfil }) {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [vistaActiva, setVistaActiva] = useState('catalogo') // catalogo | reposicion
  const [busqueda, setBusqueda] = useState('')

  // Selección para impresión QR en lote (solo admin y supervisor)
  const [seleccionadosQR, setSeleccionadosQR] = useState([])
  const [productosParaQR, setProductosParaQR] = useState([])
  const [modalQRAbierto, setModalQRAbierto] = useState(false)

  // Modal Crear / Editar Producto
  const [modalProducto, setModalProducto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [guardandoProducto, setGuardandoProducto] = useState(false)
  const [fotoFile, setFotoFile] = useState(null)
  const [formProducto, setFormProducto] = useState({
    sku: '',
    nombre: '',
    compatibilidad: '',
    categoria: CATEGORIAS_INVENTARIO[0],
    chip: '',
    frecuencia: '',
    espadin: '',
    stock_laboratorio: 0,
    stock_movil_1: 0,
    stock_movil_2: 0,
    stock_minimo: 2,
    precio_publico: '',
    precio_taller: '',
  })

  // Modal Ingreso Formal de Stock
  const [modalIngreso, setModalIngreso] = useState(false)
  const [guardandoIngreso, setGuardandoIngreso] = useState(false)
  const [formIngreso, setFormIngreso] = useState({
    producto_id: '',
    bodega: 'Laboratorio',
    cantidad: 1,
    proveedor: '',
    factura_ref: '',
  })

  const rol = perfil?.rol || 'tecnico'
  const puedeImprimirQR = ['admin', 'supervisor'].includes(rol)
  const puedeGestionarCatalogo = ['admin', 'supervisor', 'atencion'].includes(rol)

  const cargarProductos = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('catalogo_productos')
      .select('*')
      .eq('activo', true)
      .order('created_at', { ascending: false })

    if (!error) {
      setProductos(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    cargarProductos()
  }, [])

  const productosNormalizados = useMemo(() => {
    return productos.map((p) => {
      const lab = Number(p.stock_laboratorio ?? p.stock_actual ?? 0)
      const m1 = Number(p.stock_movil_1 ?? 0)
      const m2 = Number(p.stock_movil_2 ?? 0)
      const total = lab + m1 + m2
      const minimo = Number(p.stock_minimo ?? 2)
      return {
        ...p,
        lab,
        m1,
        m2,
        total,
        minimo,
        bajoStock: total <= minimo,
      }
    })
  }, [productos])

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return productosNormalizados.filter((p) => {
      if (vistaActiva === 'reposicion' && !p.bajoStock) return false
      if (!q) return true
      return (
        (p.sku || '').toLowerCase().includes(q) ||
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.compatibilidad || '').toLowerCase().includes(q) ||
        (p.categoria || '').toLowerCase().includes(q) ||
        (p.chip || '').toLowerCase().includes(q) ||
        (p.frecuencia || '').toLowerCase().includes(q) ||
        (p.espadin || '').toLowerCase().includes(q)
      )
    })
  }, [productosNormalizados, vistaActiva, busqueda])

  const totalBajoStock = useMemo(
    () => productosNormalizados.filter((p) => p.bajoStock).length,
    [productosNormalizados]
  )

  const toggleSeleccionQR = (id) => {
    if (!puedeImprimirQR) return
    setSeleccionadosQR((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const toggleSeleccionarTodos = () => {
    if (!puedeImprimirQR) return
    if (seleccionadosQR.length === productosFiltrados.length) {
      setSeleccionadosQR([])
    } else {
      setSeleccionadosQR(productosFiltrados.map((p) => p.id))
    }
  }

  const abrirImpresionLote = () => {
    if (!puedeImprimirQR) return
    const lista =
      seleccionadosQR.length > 0
        ? productosNormalizados.filter((p) => seleccionadosQR.includes(p.id))
        : productosFiltrados

    if (lista.length === 0) {
      alert('No hay productos seleccionados para imprimir etiquetas QR.')
      return
    }
    setProductosParaQR(lista)
    setModalQRAbierto(true)
  }

  const abrirImpresionIndividual = (producto) => {
    if (!puedeImprimirQR) return
    setProductosParaQR([producto])
    setModalQRAbierto(true)
  }

  const abrirModalCrear = () => {
    setEditandoId(null)
    setFotoFile(null)
    setFormProducto({
      sku: '',
      nombre: '',
      compatibilidad: '',
      categoria: CATEGORIAS_INVENTARIO[0],
      chip: '',
      frecuencia: '',
      espadin: '',
      stock_laboratorio: 0,
      stock_movil_1: 0,
      stock_movil_2: 0,
      stock_minimo: 2,
      precio_publico: '',
      precio_taller: '',
    })
    setModalProducto(true)
  }

  const abrirModalEditar = (p) => {
    setEditandoId(p.id)
    setFotoFile(null)
    setFormProducto({
      sku: p.sku || '',
      nombre: p.nombre || '',
      compatibilidad: p.compatibilidad || '',
      categoria: p.categoria || CATEGORIAS_INVENTARIO[0],
      chip: p.chip || '',
      frecuencia: p.frecuencia || '',
      espadin: p.espadin || '',
      stock_laboratorio: p.lab,
      stock_movil_1: p.m1,
      stock_movil_2: p.m2,
      stock_minimo: p.minimo,
      precio_publico: p.precio_publico ?? '',
      precio_taller: p.precio_taller ?? '',
    })
    setModalProducto(true)
  }

  const guardarProducto = async (e) => {
    e.preventDefault()
    setGuardandoProducto(true)

    try {
      let fotoUrlFinal = editandoId
        ? productos.find((x) => x.id === editandoId)?.imagen_url || null
        : null

      if (fotoFile) {
        const comprimida = await comprimirImagen(fotoFile)
        const fileName = `productos/${formProducto.sku.trim()}_${Date.now()}.jpg`
        const { error: upErr } = await supabase.storage
          .from('inventario-imagenes')
          .upload(fileName, comprimida, { contentType: 'image/jpeg' })

        if (!upErr) {
          const { data } = supabase.storage
            .from('inventario-imagenes')
            .getPublicUrl(fileName)
          fotoUrlFinal = data.publicUrl
        }
      }

      const lab = Number(formProducto.stock_laboratorio || 0)
      const m1 = Number(formProducto.stock_movil_1 || 0)
      const m2 = Number(formProducto.stock_movil_2 || 0)

      const payload = {
        sku: formProducto.sku.trim().toUpperCase(),
        nombre: formProducto.nombre.trim(),
        compatibilidad: formProducto.compatibilidad.trim(),
        categoria: formProducto.categoria,
        chip: formProducto.chip.trim(),
        frecuencia: formProducto.frecuencia.trim(),
        espadin: formProducto.espadin.trim(),
        stock_laboratorio: lab,
        stock_movil_1: m1,
        stock_movil_2: m2,
        stock_actual: lab + m1 + m2,
        stock_minimo: Number(formProducto.stock_minimo || 2),
        precio_publico: parseFloat(formProducto.precio_publico) || 0,
        precio_taller: parseFloat(formProducto.precio_taller) || 0,
        imagen_url: fotoUrlFinal,
        activo: true,
      }

      if (editandoId) {
        const { error } = await supabase
          .from('catalogo_productos')
          .update(payload)
          .eq('id', editandoId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('catalogo_productos').insert([payload])
        if (error) throw error
      }

      setModalProducto(false)
      cargarProductos()
    } catch (err) {
      alert('Error al guardar producto: ' + err.message)
    } finally {
      setGuardandoProducto(false)
    }
  }

  const registrarIngresoStock = async (e) => {
    e.preventDefault()
    if (!formIngreso.producto_id) return
    setGuardandoIngreso(true)

    try {
      const prod = productosNormalizados.find(
        (p) => String(p.id) === String(formIngreso.producto_id)
      )
      if (!prod) throw new Error('Producto no encontrado.')

      const cant = Math.max(1, Number(formIngreso.cantidad || 1))
      let nuevoLab = prod.lab
      let nuevoM1 = prod.m1
      let nuevoM2 = prod.m2

      if (formIngreso.bodega === 'Laboratorio') nuevoLab += cant
      if (formIngreso.bodega === 'Unidad Móvil 1') nuevoM1 += cant
      if (formIngreso.bodega === 'Unidad Móvil 2') nuevoM2 += cant

      const { error } = await supabase
        .from('catalogo_productos')
        .update({
          stock_laboratorio: nuevoLab,
          stock_movil_1: nuevoM1,
          stock_movil_2: nuevoM2,
          stock_actual: nuevoLab + nuevoM1 + nuevoM2,
        })
        .eq('id', prod.id)

      if (error) throw error

      await supabase.from('movimientos_inventario').insert([
        {
          producto_id: prod.id,
          tipo: 'ingreso',
          cantidad: cant,
          bodega: formIngreso.bodega,
          motivo: `Ingreso compra${
            formIngreso.proveedor ? ` • Prov: ${formIngreso.proveedor}` : ''
          }${formIngreso.factura_ref ? ` • Ref: ${formIngreso.factura_ref}` : ''}`,
          usuario: perfil?.nombre || 'Sistema',
        },
      ])

      setModalIngreso(false)
      cargarProductos()
    } catch (err) {
      alert('Error al registrar ingreso: ' + err.message)
    } finally {
      setGuardandoIngreso(false)
    }
  }

  const renderBadgeStock = (cantidad) => {
    const num = Number(cantidad || 0)
    const estilo =
      num === 0
        ? 'bg-red-100 text-red-700'
        : num <= 2
        ? 'bg-amber-100 text-amber-800'
        : 'bg-emerald-100 text-emerald-700'

    return (
      <span
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-extrabold ${estilo}`}
      >
        {num}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1B2A]">
            Catálogo e Inventario Multi-Bodega
          </h2>
          <p className="text-sm text-slate-500">
            Control de llaves, chips, controles, etiquetas QR, ingresos formales y auditoría
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* SOLO ADMIN Y SUPERVISOR PUEDEN IMPRIMIR QR */}
          {puedeImprimirQR && (
            <button
              onClick={abrirImpresionLote}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-[#0D1B2A] border border-slate-300 text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <QrCode className="w-4 h-4 text-[#0A84FF]" />
              {seleccionadosQR.length > 0
                ? `Imprimir QR (${seleccionadosQR.length})`
                : 'Imprimir QR en Lote'}
            </button>
          )}

          {puedeGestionarCatalogo && (
            <>
              <button
                onClick={() => {
                  setFormIngreso({
                    producto_id: productos[0]?.id || '',
                    bodega: 'Laboratorio',
                    cantidad: 1,
                    proveedor: '',
                    factura_ref: '',
                  })
                  setModalIngreso(true)
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowDownToLine className="w-4 h-4 text-sky-400" />
                Ingreso Stock
              </button>

              <button
                onClick={abrirModalCrear}
                className="px-4 py-2 bg-[#0A84FF] hover:bg-blue-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nuevo Ítem
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pestañas Catálogo vs Reporte de Reposición */}
      <div className="flex items-center gap-6 border-b border-slate-200 text-sm">
        <button
          onClick={() => setVistaActiva('catalogo')}
          className={`pb-2.5 font-bold border-b-2 transition cursor-pointer ${
            vistaActiva === 'catalogo'
              ? 'border-[#0A84FF] text-[#0A84FF]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Catálogo y Stock ({productosNormalizados.length})
        </button>

        <button
          onClick={() => setVistaActiva('reposicion')}
          className={`pb-2.5 font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
            vistaActiva === 'reposicion'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Reporte de Reposición</span>
          {totalBajoStock > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-800">
              {totalBajoStock}
            </span>
          )}
        </button>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-2.5" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por SKU, modelo de vehículo, chip (ID46, 4D63), espadín (HU66, TOY43)..."
          className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#0A84FF]"
        />
      </div>

      {/* Tabla Multi-Bodega */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                {puedeImprimirQR && (
                  <th className="py-3 px-3 text-center w-10">
                    <button
                      type="button"
                      onClick={toggleSeleccionarTodos}
                      title="Seleccionar todos para QR"
                      className="text-slate-500 hover:text-[#0A84FF] cursor-pointer"
                    >
                      {seleccionadosQR.length > 0 &&
                      seleccionadosQR.length === productosFiltrados.length ? (
                        <CheckSquare className="w-4 h-4 text-[#0A84FF]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                )}
                <th className="py-3 px-4 font-bold">Ítem / SKU</th>
                <th className="py-3 px-4 font-bold">Especificaciones</th>
                <th className="py-3 px-3 font-bold text-center">Laboratorio</th>
                <th className="py-3 px-3 font-bold text-center">Unidad Móvil 1</th>
                <th className="py-3 px-3 font-bold text-center">Unidad Móvil 2</th>
                <th className="py-3 px-4 font-bold text-right">Precio Público / Taller</th>
                <th className="py-3 px-4 font-bold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={puedeImprimirQR ? 8 : 7} className="py-12 text-center text-slate-500">
                    Cargando inventario...
                  </td>
                </tr>
              ) : productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={puedeImprimirQR ? 8 : 7} className="py-12 text-center text-slate-400">
                    No se encontraron ítems en el inventario.
                  </td>
                </tr>
              ) : (
                productosFiltrados.map((p) => {
                  const marcado = seleccionadosQR.includes(p.id)
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-slate-100 hover:bg-slate-50/70 ${
                        p.bajoStock ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {puedeImprimirQR && (
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => toggleSeleccionQR(p.id)}
                            className="rounded text-[#0A84FF] cursor-pointer"
                          />
                        </td>
                      )}

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {p.imagen_url ? (
                            <img
                              src={p.imagen_url}
                              alt={p.nombre}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-400 text-center leading-tight shrink-0">
                              SIN FOTO
                            </div>
                          )}

                          <div>
                            <span className="inline-block px-2 py-0.5 rounded bg-[#0D1B2A] text-white font-mono text-[11px] font-bold">
                              {p.sku}
                            </span>
                            <p className="font-bold text-sm text-[#0D1B2A] mt-0.5">
                              {p.nombre}
                            </p>
                            {p.compatibilidad && (
                              <p className="text-[11px] text-slate-500">{p.compatibilidad}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-600 space-y-0.5">
                        <p>
                          <strong>Cat:</strong> {p.categoria || '-'}
                        </p>
                        {p.chip && (
                          <p>
                            <strong>Chip:</strong> {p.chip}
                          </p>
                        )}
                        {p.frecuencia && (
                          <p>
                            <strong>Frec:</strong> {p.frecuencia}
                          </p>
                        )}
                        {p.espadin && (
                          <p>
                            <strong>Espadín:</strong> {p.espadin}
                          </p>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">{renderBadgeStock(p.lab)}</td>
                      <td className="py-3 px-3 text-center">{renderBadgeStock(p.m1)}</td>
                      <td className="py-3 px-3 text-center">{renderBadgeStock(p.m2)}</td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <p className="font-extrabold text-sm text-[#0D1B2A]">
                          ${Number(p.precio_publico || 0).toFixed(2)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Taller: ${Number(p.precio_taller || 0).toFixed(2)}
                        </p>
                        <p className="text-[11px] font-bold text-slate-400">
                          Total: {p.total} uds
                        </p>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center justify-center gap-1">
                          {/* Botón QR visible SOLO para Admin y Supervisor */}
                          {puedeImprimirQR && (
                            <button
                              onClick={() => abrirImpresionIndividual(p)}
                              title="Imprimir etiqueta QR"
                              className="p-2 rounded-lg hover:bg-slate-200 text-[#0D1B2A] cursor-pointer"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                          )}

                          {puedeGestionarCatalogo && (
                            <button
                              onClick={() => abrirModalEditar(p)}
                              title="Editar producto"
                              className="p-2 rounded-lg hover:bg-blue-50 text-[#0A84FF] cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {!puedeImprimirQR && !puedeGestionarCatalogo && (
                            <span className="text-[11px] text-slate-400">Consulta</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL ETIQUETAS QR (Solo Admin y Supervisor) */}
      {puedeImprimirQR && modalQRAbierto && (
        <EtiquetaQRModal
          productos={productosParaQR}
          onClose={() => setModalQRAbierto(false)}
        />
      )}

      {/* MODAL CREAR / EDITAR PRODUCTO */}
      {modalProducto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-[#0A84FF]" />
                <h3 className="font-bold text-lg text-[#0D1B2A]">
                  {editandoId ? 'Editar Ítem de Inventario' : 'Nuevo Ítem en Catálogo'}
                </h3>
              </div>
              <button
                onClick={() => setModalProducto(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarProducto} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">SKU / Código *</label>
                  <input
                    required
                    value={formProducto.sku}
                    onChange={(e) => setFormProducto({ ...formProducto, sku: e.target.value })}
                    placeholder="Ej. LLAVE-HY22"
                    className="w-full px-3 py-2 border rounded-lg font-mono uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nombre del Producto *
                  </label>
                  <input
                    required
                    value={formProducto.nombre}
                    onChange={(e) => setFormProducto({ ...formProducto, nombre: e.target.value })}
                    placeholder="Ej. Llave Smart Key 3 Botones Hyundai"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoría *</label>
                  <select
                    value={formProducto.categoria}
                    onChange={(e) =>
                      setFormProducto({ ...formProducto, categoria: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {CATEGORIAS_INVENTARIO.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Vehículos Compatibles
                  </label>
                  <input
                    value={formProducto.compatibilidad}
                    onChange={(e) =>
                      setFormProducto({ ...formProducto, compatibilidad: e.target.value })
                    }
                    placeholder="Ej. Elantra 2016-2020, Tucson"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chip</label>
                  <input
                    value={formProducto.chip}
                    onChange={(e) => setFormProducto({ ...formProducto, chip: e.target.value })}
                    placeholder="ID46 / 4D63 / AES"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Frecuencia</label>
                  <input
                    value={formProducto.frecuencia}
                    onChange={(e) =>
                      setFormProducto({ ...formProducto, frecuencia: e.target.value })
                    }
                    placeholder="315 MHz / 433 MHz"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Espadín</label>
                  <input
                    value={formProducto.espadin}
                    onChange={(e) =>
                      setFormProducto({ ...formProducto, espadin: e.target.value })
                    }
                    placeholder="HY22 / TOY43 / HU66"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              {/* Existencias iniciales / actuales por bodega */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <p className="text-xs font-bold text-[#0D1B2A]">
                  Existencias por Bodega / Unidad Móvil
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Laboratorio</label>
                    <input
                      type="number"
                      min="0"
                      value={formProducto.stock_laboratorio}
                      onChange={(e) =>
                        setFormProducto({ ...formProducto, stock_laboratorio: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border rounded-lg bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      Unidad Móvil 1
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formProducto.stock_movil_1}
                      onChange={(e) =>
                        setFormProducto({ ...formProducto, stock_movil_1: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border rounded-lg bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      Unidad Móvil 2
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formProducto.stock_movil_2}
                      onChange={(e) =>
                        setFormProducto({ ...formProducto, stock_movil_2: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border rounded-lg bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-amber-800 mb-1">Stock Mínimo</label>
                    <input
                      type="number"
                      min="0"
                      value={formProducto.stock_minimo}
                      onChange={(e) =>
                        setFormProducto({ ...formProducto, stock_minimo: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 border border-amber-300 rounded-lg bg-white font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Precio Público ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formProducto.precio_publico}
                    onChange={(e) =>
                      setFormProducto({ ...formProducto, precio_publico: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Precio Taller ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formProducto.precio_taller}
                    onChange={(e) =>
                      setFormProducto({ ...formProducto, precio_taller: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Foto del Producto
                  </label>
                  <label className="w-full px-3 py-2 bg-slate-50 hover:bg-blue-50 text-[#0A84FF] border border-dashed border-[#0A84FF] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {fotoFile ? fotoFile.name : 'Subir Imagen'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFotoFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalProducto(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoProducto}
                  className="px-6 py-2 bg-[#0A84FF] hover:bg-blue-600 text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  {guardandoProducto && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INGRESO FORMAL DE STOCK */}
      {modalIngreso && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5 text-[#0A84FF]" />
                <h3 className="font-bold text-lg text-[#0D1B2A]">Ingreso Formal de Stock</h3>
              </div>
              <button
                onClick={() => setModalIngreso(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={registrarIngresoStock} className="space-y-3.5 text-sm">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Producto *</label>
                <select
                  required
                  value={formIngreso.producto_id}
                  onChange={(e) =>
                    setFormIngreso({ ...formIngreso, producto_id: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {productosNormalizados.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.sku}] {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Bodega Destino *
                  </label>
                  <select
                    value={formIngreso.bodega}
                    onChange={(e) => setFormIngreso({ ...formIngreso, bodega: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="Laboratorio">Laboratorio</option>
                    <option value="Unidad Móvil 1">Unidad Móvil 1</option>
                    <option value="Unidad Móvil 2">Unidad Móvil 2</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cantidad *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formIngreso.cantidad}
                    onChange={(e) =>
                      setFormIngreso({ ...formIngreso, cantidad: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Proveedor</label>
                  <input
                    value={formIngreso.proveedor}
                    onChange={(e) =>
                      setFormIngreso({ ...formIngreso, proveedor: e.target.value })
                    }
                    placeholder="Opcional"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">N° Factura</label>
                  <input
                    value={formIngreso.factura_ref}
                    onChange={(e) =>
                      setFormIngreso({ ...formIngreso, factura_ref: e.target.value })
                    }
                    placeholder="Opcional"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalIngreso(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoIngreso}
                  className="px-5 py-2 bg-[#0D1B2A] hover:bg-[#0A84FF] text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  {guardandoIngreso && <Loader2 className="w-4 h-4 animate-spin" />}
                  Registrar Ingreso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}