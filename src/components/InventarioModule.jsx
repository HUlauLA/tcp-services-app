import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { comprimirImagen } from '../lib/imageCompressor'
import EtiquetaQRModal from './EtiquetaQRModal'
import {
  Plus,
  Search,
  QrCode,
  ArrowRightLeft,
  PackagePlus,
  AlertTriangle,
  Upload,
  Loader2,
  X,
  Edit3,
  Trash2,
  ClipboardCheck,
} from 'lucide-react'

export default function InventarioModule({ perfil }) {
  const [productos, setProductos] = useState([])
  const [bodegas, setBodegas] = useState([])
  const [inventario, setInventario] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState('catalogo') // 'catalogo' | 'reposicion'

  // Modales y selección múltiple QR
  const [modalProducto, setModalProducto] = useState(false)
  const [productoEditando, setProductoEditando] = useState(null)
  const [modalMovimiento, setModalMovimiento] = useState(false)
  const [itemsImpresionQR, setItemsImpresionQR] = useState(null)
  const [seleccionadosQR, setSeleccionadosQR] = useState([])

  // Formulario Producto
  const [guardando, setGuardando] = useState(false)
  const [fotoFile, setFotoFile] = useState(null)
  const [formProd, setFormProd] = useState({
    sku: '',
    nombre: '',
    categoria: 'Llave con Chip',
    compatibilidad_vehiculos: '',
    frecuencia: '',
    tipo_chip: '',
    perfil_espadin: '',
    costo_compra: '',
    precio_publico: '',
    precio_taller: '',
  })

  // Formulario Movimiento
  const [formMov, setFormMov] = useState({
    producto_id: '',
    tipo_movimiento: 'compra',
    bodega_origen_id: '1',
    bodega_destino_id: '1',
    cantidad: 1,
    notas: '',
  })

  const cargarDatos = async () => {
    setLoading(true)
    const [{ data: prods }, { data: bods }, { data: inv }] = await Promise.all([
      supabase.from('catalogo_productos').select('*').eq('activo', true).order('nombre'),
      supabase.from('bodegas').select('*').eq('activa', true).order('id'),
      supabase.from('inventario_bodega').select('*'),
    ])

    setProductos(prods || [])
    setBodegas(bods || [])
    setInventario(inv || [])
    setLoading(false)
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  const obtenerRegistroStock = (productoId, bodegaId) => {
    return inventario.find(
      (i) => i.producto_id === productoId && i.bodega_id === bodegaId
    )
  }

  const obtenerStock = (productoId, bodegaId) => {
    const reg = obtenerRegistroStock(productoId, bodegaId)
    return reg ? reg.cantidad_actual : 0
  }

  const obtenerMinimo = (productoId, bodegaId) => {
    const reg = obtenerRegistroStock(productoId, bodegaId)
    return reg ? reg.stock_minimo_ideal : 2
  }

  // Calcular alertas de reposición
  const alertasReposicion = []
  productos.forEach((prod) => {
    bodegas.forEach((bod) => {
      const actual = obtenerStock(prod.id, bod.id)
      const minimo = obtenerMinimo(prod.id, bod.id)
      if (actual < minimo) {
        alertasReposicion.push({
          producto: prod,
          bodega: bod,
          actual,
          minimo,
          faltante: minimo - actual,
          stockCentral: obtenerStock(prod.id, 1),
        })
      }
    })
  })

  const abrirModalNuevo = () => {
    setProductoEditando(null)
    setFotoFile(null)
    setFormProd({
      sku: '',
      nombre: '',
      categoria: 'Llave con Chip',
      compatibilidad_vehiculos: '',
      frecuencia: '',
      tipo_chip: '',
      perfil_espadin: '',
      costo_compra: '',
      precio_publico: '',
      precio_taller: '',
    })
    setModalProducto(true)
  }

  const abrirModalEditar = (prod) => {
    setProductoEditando(prod)
    setFotoFile(null)
    setFormProd({
      sku: prod.sku,
      nombre: prod.nombre,
      categoria: prod.categoria,
      compatibilidad_vehiculos: prod.compatibilidad_vehiculos || '',
      frecuencia: prod.frecuencia || '',
      tipo_chip: prod.tipo_chip || '',
      perfil_espadin: prod.perfil_espadin || '',
      costo_compra: prod.costo_compra,
      precio_publico: prod.precio_publico,
      precio_taller: prod.precio_taller,
    })
    setModalProducto(true)
  }

  const guardarProducto = async (e) => {
    e.preventDefault()
    setGuardando(true)

    let fotoUrl = productoEditando ? productoEditando.foto_url : null

    if (fotoFile) {
      try {
        const comprimida = await comprimirImagen(fotoFile, 800, 0.75)
        const fileName = `catalogo/${formProd.sku.trim().toUpperCase()}_${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('fotos-recepcion')
          .upload(fileName, comprimida)

        if (!uploadError) {
          const { data } = supabase.storage.from('fotos-recepcion').getPublicUrl(fileName)
          fotoUrl = data.publicUrl
        }
      } catch (err) {
        console.error('Error comprimiendo imagen:', err)
      }
    }

    const datosGuardar = {
      ...formProd,
      sku: formProd.sku.trim().toUpperCase(),
      costo_compra: Number(formProd.costo_compra) || 0,
      precio_publico: Number(formProd.precio_publico) || 0,
      precio_taller: Number(formProd.precio_taller) || 0,
      foto_url: fotoUrl,
    }

    const { error } = productoEditando
      ? await supabase.from('catalogo_productos').update(datosGuardar).eq('id', productoEditando.id)
      : await supabase.from('catalogo_productos').insert([datosGuardar])

    setGuardando(false)
    if (error) {
      alert('Error al guardar producto: ' + error.message)
      return
    }

    setModalProducto(false)
    cargarDatos()
  }

  const eliminarProducto = async (prod) => {
    if (!confirm(`¿Desactivar el SKU ${prod.sku} (${prod.nombre}) del catálogo?`)) return
    await supabase.from('catalogo_productos').update({ activo: false }).eq('id', prod.id)
    cargarDatos()
  }

  const registrarMovimiento = async (e) => {
    e.preventDefault()
    setGuardando(true)

    const payload = {
      producto_id: Number(formMov.producto_id),
      tipo_movimiento: formMov.tipo_movimiento,
      cantidad: Number(formMov.cantidad),
      bodega_origen_id:
        formMov.tipo_movimiento === 'compra' ? null : Number(formMov.bodega_origen_id),
      bodega_destino_id:
        formMov.tipo_movimiento === 'danado' ? null : Number(formMov.bodega_destino_id),
      usuario_id: perfil?.id || null,
      notas: formMov.notas,
    }

    const { error } = await supabase.from('movimientos_inventario').insert([payload])
    setGuardando(false)

    if (error) {
      alert('Error al registrar movimiento: ' + error.message)
      return
    }

    setModalMovimiento(false)
    setFormMov({
      producto_id: '',
      tipo_movimiento: 'compra',
      bodega_origen_id: '1',
      bodega_destino_id: '1',
      cantidad: 1,
      notas: '',
    })
    cargarDatos()
  }

  const prepararTransferenciaRapida = (alerta) => {
    setFormMov({
      producto_id: String(alerta.producto.id),
      tipo_movimiento: alerta.bodega.id === 1 ? 'compra' : 'transferencia',
      bodega_origen_id: '1',
      bodega_destino_id: String(alerta.bodega.id),
      cantidad: alerta.faltante,
      notas: `Reposición automática a ${alerta.bodega.nombre}`,
    })
    setModalMovimiento(true)
  }

  const productosFiltrados = productos.filter((p) => {
    const q = busqueda.toLowerCase()
    return (
      p.sku.toLowerCase().includes(q) ||
      p.nombre.toLowerCase().includes(q) ||
      (p.compatibilidad_vehiculos || '').toLowerCase().includes(q) ||
      (p.tipo_chip || '').toLowerCase().includes(q) ||
      (p.perfil_espadin || '').toLowerCase().includes(q)
    )
  })

  const toggleSeleccionTodos = (checked) => {
    if (checked) {
      setSeleccionadosQR(productosFiltrados.map((p) => p.id))
    } else {
      setSeleccionadosQR([])
    }
  }

  return (
    <div className="space-y-6">
      {/* Encabezado y Acciones */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1B2A]">
            Catálogo e Inventario Multi-Bodega
          </h2>
          <p className="text-sm text-slate-500">
            Control de llaves, chips, controles, etiquetas QR y stock por unidad
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              const iniciales =
                seleccionadosQR.length > 0
                  ? productos
                      .filter((p) => seleccionadosQR.includes(p.id))
                      .map((p) => ({ producto: p, cantidad: 1 }))
                  : []
              setItemsImpresionQR(iniciales)
            }}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-medium rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-[#007BFF]" />
            Imprimir QR {seleccionadosQR.length > 0 ? `(${seleccionadosQR.length})` : 'en Lote'}
          </button>

          <button
            onClick={() => setModalMovimiento(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Entrada / Transferencia
          </button>

          <button
            onClick={abrirModalNuevo}
            className="px-4 py-2 bg-[#007BFF] hover:bg-blue-600 text-white text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nuevo Ítem
          </button>
        </div>
      </div>

      {/* Pestañas: Stock Multi-Bodega vs Reporte de Reposición */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setVista('catalogo')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition cursor-pointer ${
            vista === 'catalogo'
              ? 'border-[#007BFF] text-[#007BFF]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Catálogo y Stock Multi-Bodega ({productos.length})
        </button>
        <button
          onClick={() => setVista('reposicion')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
            vista === 'reposicion'
              ? 'border-[#007BFF] text-[#007BFF]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Reporte de Reposición</span>
          {alertasReposicion.length > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 font-bold">
              {alertasReposicion.length}
            </span>
          )}
        </button>
      </div>

      {vista === 'reposicion' ? (
        /* VISTA DE REPORTE AUTOMÁTICO DE REPOSICIÓN */
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
            <strong>Reporte Automático de Reposición:</strong> Muestra los SKUs cuya existencia en Oficina Central o Unidades Móviles está por debajo de su stock mínimo ideal (2 unidades por defecto).
          </div>

          {alertasReposicion.length === 0 ? (
            <div className="py-12 text-center border border-slate-200 rounded-xl">
              <ClipboardCheck className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">¡Todas las bodegas y móviles tienen su stock mínimo cubierto!</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b text-slate-600 font-semibold">
                    <th className="p-3">Bodega / Unidad</th>
                    <th className="p-3">SKU / Producto</th>
                    <th className="p-3 text-center">Stock Actual</th>
                    <th className="p-3 text-center">Mínimo Ideal</th>
                    <th className="p-3 text-center">Faltante</th>
                    <th className="p-3 text-right">Acción Rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {alertasReposicion.map((alerta, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-medium text-[#0D1B2A]">{alerta.bodega.nombre}</td>
                      <td className="p-3">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-white mr-2">
                          {alerta.producto.sku}
                        </span>
                        {alerta.producto.nombre}
                      </td>
                      <td className="p-3 text-center font-bold text-red-600">{alerta.actual}</td>
                      <td className="p-3 text-center text-slate-600">{alerta.minimo}</td>
                      <td className="p-3 text-center font-bold text-amber-700">+{alerta.faltante} uds</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => prepararTransferenciaRapida(alerta)}
                          className="px-3 py-1.5 bg-[#007BFF] hover:bg-blue-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          {alerta.bodega.id === 1 ? 'Registrar Compra' : 'Transferir desde Central'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* VISTA PRINCIPAL DE CATÁLOGO Y STOCK MULTI-BODEGA */
        <>
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por SKU, modelo de vehículo, chip (ID46, 4D63), espadín (HU66, TOY43)..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#007BFF] outline-none text-sm"
            />
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500">Cargando catálogo...</div>
          ) : productosFiltrados.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <PackagePlus className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-600 font-medium">No hay productos registrados todavía</p>
              <p className="text-xs text-slate-400 mt-1">
                Haz clic en "+ Nuevo Ítem" para agregar tu primera llave, chip o control.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="p-3 w-8">
                      <input
                        type="checkbox"
                        checked={
                          productosFiltrados.length > 0 &&
                          seleccionadosQR.length === productosFiltrados.length
                        }
                        onChange={(e) => toggleSeleccionTodos(e.target.checked)}
                        title="Seleccionar todos para imprimir QR"
                        className="w-4 h-4 accent-[#007BFF] cursor-pointer"
                      />
                    </th>
                    <th className="p-3">Ítem / SKU</th>
                    <th className="p-3">Especificaciones</th>
                    {bodegas.map((b) => (
                      <th key={b.id} className="p-3 text-center">
                        {b.nombre.replace('Oficina Central / ', '')}
                      </th>
                    ))}
                    <th className="p-3 text-right">Precio Público / Taller</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {productosFiltrados.map((prod) => {
                    const stockTotal = bodegas.reduce(
                      (acc, b) => acc + obtenerStock(prod.id, b.id),
                      0
                    )
                    return (
                      <tr key={prod.id} className="hover:bg-slate-50/80">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={seleccionadosQR.includes(prod.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSeleccionadosQR([...seleccionadosQR, prod.id])
                              } else {
                                setSeleccionadosQR(seleccionadosQR.filter((id) => id !== prod.id))
                              }
                            }}
                            className="w-4 h-4 accent-[#007BFF] cursor-pointer"
                          />
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {prod.foto_url ? (
                              <img
                                src={prod.foto_url}
                                alt={prod.sku}
                                className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                                SIN FOTO
                              </div>
                            )}
                            <div>
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#0D1B2A] text-white">
                                {prod.sku}
                              </span>
                              <p className="font-semibold text-slate-800 mt-1">{prod.nombre}</p>
                              <p className="text-xs text-slate-500">{prod.compatibilidad_vehiculos}</p>
                            </div>
                          </div>
                        </td>

                        <td className="p-3 text-xs text-slate-600 space-y-0.5">
                          <p><span className="font-medium">Cat:</span> {prod.categoria}</p>
                          {prod.tipo_chip && <p><span className="font-medium">Chip:</span> {prod.tipo_chip}</p>}
                          {prod.frecuencia && <p><span className="font-medium">Frec:</span> {prod.frecuencia}</p>}
                          {prod.perfil_espadin && <p><span className="font-medium">Espadín:</span> {prod.perfil_espadin}</p>}
                        </td>

                        {bodegas.map((b) => {
                          const qty = obtenerStock(prod.id, b.id)
                          const min = obtenerMinimo(prod.id, b.id)
                          return (
                            <td key={b.id} className="p-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                  qty === 0
                                    ? 'bg-red-100 text-red-700'
                                    : qty < min
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {qty}
                                {qty < min && <AlertTriangle className="w-3 h-3" />}
                              </span>
                            </td>
                          )
                        })}

                        <td className="p-3 text-right">
                          <p className="font-bold text-slate-800">${Number(prod.precio_publico).toFixed(2)}</p>
                          <p className="text-xs text-slate-500">Taller: ${Number(prod.precio_taller).toFixed(2)}</p>
                          <p className="text-[11px] text-slate-400">Total: {stockTotal} uds</p>
                        </td>

                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setItemsImpresionQR([{ producto: prod, cantidad: 1 }])}
                              title="Etiqueta QR 4x4 cm"
                              className="p-2 rounded-lg bg-slate-100 hover:bg-[#007BFF] hover:text-white text-slate-700 transition cursor-pointer"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => abrirModalEditar(prod)}
                              title="Editar SKU"
                              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-700 transition cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => eliminarProducto(prod)}
                              title="Desactivar SKU"
                              className="p-2 rounded-lg bg-slate-100 hover:bg-red-600 hover:text-white text-slate-700 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* MODAL 1: CREAR / EDITAR PRODUCTO */}
      {modalProducto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-bold text-lg text-[#0D1B2A]">
                {productoEditando ? `Editar SKU: ${productoEditando.sku}` : 'Registrar Nuevo Ítem en Catálogo'}
              </h3>
              <button onClick={() => setModalProducto(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarProducto} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">SKU / Código Único *</label>
                <input
                  required
                  value={formProd.sku}
                  onChange={(e) => setFormProd({ ...formProd, sku: e.target.value })}
                  placeholder="Ej. LL-TOY-43"
                  className="w-full px-3 py-2 border rounded-lg uppercase"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Categoría *</label>
                <select
                  value={formProd.categoria}
                  onChange={(e) => setFormProd({ ...formProd, categoria: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option>Llave con Chip</option>
                  <option>Smart Key / Proximidad</option>
                  <option>Control Remoto</option>
                  <option>Chip Transponder</option>
                  <option>Carcasa / Espadín</option>
                  <option>Componente ECU / Memoria</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Nombre del Producto *</label>
                <input
                  required
                  value={formProd.nombre}
                  onChange={(e) => setFormProd({ ...formProd, nombre: e.target.value })}
                  placeholder="Ej. Llave Control Toyota Hilux 3 Botones"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Vehículos Compatibles</label>
                <input
                  value={formProd.compatibilidad_vehiculos}
                  onChange={(e) => setFormProd({ ...formProd, compatibilidad_vehiculos: e.target.value })}
                  placeholder="Ej. Toyota Hilux, Fortuner, Corolla 2016-2022"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Tipo de Chip</label>
                <input
                  value={formProd.tipo_chip}
                  onChange={(e) => setFormProd({ ...formProd, tipo_chip: e.target.value })}
                  placeholder="Ej. H-Chip / ID46 / 4D63"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Frecuencia</label>
                <input
                  value={formProd.frecuencia}
                  onChange={(e) => setFormProd({ ...formProd, frecuencia: e.target.value })}
                  placeholder="Ej. 315 MHz / 433 MHz"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Perfil de Espadín</label>
                <input
                  value={formProd.perfil_espadin}
                  onChange={(e) => setFormProd({ ...formProd, perfil_espadin: e.target.value })}
                  placeholder="Ej. TOY43 / HU66 / HY22"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Foto (Compresión auto)</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-slate-600">
                  <Upload className="w-4 h-4 text-[#007BFF]" />
                  <span className="truncate">{fotoFile ? fotoFile.name : 'Subir imagen...'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFotoFile(e.target.files[0])}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Costo Compra ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formProd.costo_compra}
                  onChange={(e) => setFormProd({ ...formProd, costo_compra: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Precio Público ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formProd.precio_publico}
                    onChange={(e) => setFormProd({ ...formProd, precio_publico: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Precio Taller ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formProd.precio_taller}
                    onChange={(e) => setFormProd({ ...formProd, precio_taller: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setModalProducto(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-6 py-2 bg-[#007BFF] text-white font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
                >
                  {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                  {productoEditando ? 'Actualizar Ítem' : 'Guardar Ítem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: COMPRA / TRANSFERENCIA ENTRE BODEGAS */}
      {modalMovimiento && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-bold text-lg text-[#0D1B2A]">Movimiento de Inventario</h3>
              <button onClick={() => setModalMovimiento(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={registrarMovimiento} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tipo de Movimiento</label>
                <select
                  value={formMov.tipo_movimiento}
                  onChange={(e) => setFormMov({ ...formMov, tipo_movimiento: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="compra">Entrada por Compra (Suma stock)</option>
                  <option value="transferencia">Transferencia entre Bodegas / Móviles</option>
                  <option value="danado">Baja por Daño / Garantía (Resta stock)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Producto *</label>
                <select
                  required
                  value={formMov.producto_id}
                  onChange={(e) => setFormMov({ ...formMov, producto_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Selecciona un ítem...</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.sku}] {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {formMov.tipo_movimiento !== 'compra' && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Bodega Origen *</label>
                  <select
                    required
                    value={formMov.bodega_origen_id}
                    onChange={(e) => setFormMov({ ...formMov, bodega_origen_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Selecciona origen...</option>
                    {bodegas.map((b) => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {formMov.tipo_movimiento !== 'danado' && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Bodega Destino *</label>
                  <select
                    required
                    value={formMov.bodega_destino_id}
                    onChange={(e) => setFormMov({ ...formMov, bodega_destino_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Selecciona destino...</option>
                    {bodegas.map((b) => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Cantidad *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formMov.cantidad}
                  onChange={(e) => setFormMov({ ...formMov, cantidad: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notas / Referencia</label>
                <input
                  value={formMov.notas}
                  onChange={(e) => setFormMov({ ...formMov, notas: e.target.value })}
                  placeholder="Ej. Compra proveedor / Carga inicial Unidad Móvil 1"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalMovimiento(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 bg-[#007BFF] text-white font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
                >
                  {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: GENERADOR DE ETIQUETAS QR 4x4 CM EN LOTE */}
      {itemsImpresionQR !== null && (
        <EtiquetaQRModal
          productos={productos}
          itemsIniciales={itemsImpresionQR}
          onClose={() => {
            setItemsImpresionQR(null)
            setSeleccionadosQR([])
          }}
        />
      )}
    </div>
  )
}