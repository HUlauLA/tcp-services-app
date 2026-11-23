import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'
import { colaOffline } from '../lib/offlineDb'
import {
  Camera,
  CameraOff,
  Search,
  CheckCircle2,
  Wifi,
  WifiOff,
  RefreshCw,
  ClipboardList,
  Truck,
} from 'lucide-react'

export default function EscanerQRModule({ perfil }) {
  const [escaneando, setEscaneando] = useState(false)
  const [skuManual, setSkuManual] = useState('')
  const [productoEncontrado, setProductoEncontrado] = useState(null)
  const [stocksProducto, setStocksProducto] = useState([])
  const [bodegas, setBodegas] = useState([])
  const [ordenesCerrajeria, setOrdenesCerrajeria] = useState([])
  const [otSeleccionadaId, setOtSeleccionadaId] = useState('')

  const [bodegaSeleccionada, setBodegaSeleccionada] = useState(
    perfil?.bodega_asignada_id ? String(perfil.bodega_asignada_id) : '2'
  )
  const [cantidad, setCantidad] = useState(1)
  const [mensaje, setMensaje] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [pendientesOffline, setPendientesOffline] = useState(0)

  const html5QrRef = useRef(null)

  useEffect(() => {
    const actualizarEstadoRed = () => setOnline(navigator.onLine)
    window.addEventListener('online', actualizarEstadoRed)
    window.addEventListener('offline', actualizarEstadoRed)
    cargarInicial()

    return () => {
      window.removeEventListener('online', actualizarEstadoRed)
      window.removeEventListener('offline', actualizarEstadoRed)
      detenerCamara()
    }
  }, [])

  const cargarInicial = async () => {
    const [{ data: bods }, { data: ots }] = await Promise.all([
      supabase.from('bodegas').select('*').eq('activa', true).order('id'),
      supabase
        .from('ordenes_trabajo')
        .select('*, clientes(nombre)')
        .eq('tipo_servicio', 'Cerrajería')
        .neq('estado', 'finalizado')
        .neq('estado', 'entregado')
        .order('id', { ascending: false }),
    ])

    setBodegas(bods || [])
    setOrdenesCerrajeria(ots || [])
    if (ots && ots.length > 0 && !otSeleccionadaId) {
      setOtSeleccionadaId(String(ots[0].id))
    }

    const count = await colaOffline.operaciones.count()
    setPendientesOffline(count)
  }

  const sincronizarColaOffline = async () => {
    if (!navigator.onLine) return
    const operaciones = await colaOffline.operaciones.toArray()
    if (operaciones.length === 0) return

    for (const op of operaciones) {
      await supabase.from('movimientos_inventario').insert([op.payload])
      await colaOffline.operaciones.delete(op.id)
    }

    const restantes = await colaOffline.operaciones.count()
    setPendientesOffline(restantes)
    setMensaje({
      tipo: 'exito',
      texto: `¡${operaciones.length} descarga(s) offline sincronizadas con la nube!`,
    })
  }

  const iniciarCamara = async () => {
    setMensaje(null)
    setEscaneando(true)
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('lector-qr-tcp')
        html5QrRef.current = html5QrCode
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (decodedText) => {
            await detenerCamara()
            buscarPorSKU(decodedText.trim())
          },
          () => {}
        )
      } catch {
        setEscaneando(false)
        setMensaje({
          tipo: 'error',
          texto: 'No se pudo acceder a la cámara. Ingresa el código SKU manualmente.',
        })
      }
    }, 150)
  }

  const detenerCamara = async () => {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop()
        html5QrRef.current.clear()
      } catch {
        // Ignorar si ya estaba detenido
      }
      html5QrRef.current = null
    }
    setEscaneando(false)
  }

  const buscarPorSKU = async (codigo) => {
    if (!codigo) return
    setMensaje(null)
    const skuLimpio = codigo.toUpperCase()

    const { data: prod } = await supabase
      .from('catalogo_productos')
      .select('*')
      .eq('sku', skuLimpio)
      .eq('activo', true)
      .single()

    if (!prod) {
      setProductoEncontrado(null)
      setMensaje({ tipo: 'error', texto: `No se encontró ningún producto con SKU: ${skuLimpio}` })
      return
    }

    const { data: inv } = await supabase
      .from('inventario_bodega')
      .select('*')
      .eq('producto_id', prod.id)

    setProductoEncontrado(prod)
    setStocksProducto(inv || [])
    setCantidad(1)
  }

  const descargarProductoEnOT = async () => {
    if (!productoEncontrado) return
    const otElegida = ordenesCerrajeria.find((o) => String(o.id) === String(otSeleccionadaId))
    const bodegaNombre =
      bodegas.find((b) => String(b.id) === String(bodegaSeleccionada))?.nombre || 'Unidad Móvil'
    const nombreClienteOT =
      otElegida?.clientes?.nombre || otElegida?.cliente_nombre_rapido || ''

    const payload = {
      producto_id: productoEncontrado.id,
      tipo_movimiento: 'consumo_orden',
      bodega_origen_id: Number(bodegaSeleccionada),
      bodega_destino_id: null,
      cantidad: Number(cantidad),
      usuario_id: perfil?.id || null,
      orden_trabajo_id: otElegida ? otElegida.id : null,
      fecha_movimiento: new Date().toISOString(),
      notas: otElegida
        ? `Salida Cerrajería • ${otElegida.codigo_ot} (${nombreClienteOT})`
        : `Descargo QR rápido en ruta (${bodegaNombre})`,
    }

    if (!navigator.onLine) {
      await colaOffline.operaciones.add({ payload, fecha: new Date().toISOString() })
      const count = await colaOffline.operaciones.count()
      setPendientesOffline(count)
      setMensaje({
        tipo: 'exito',
        texto: `Sin internet: Salida de ${cantidad}x ${productoEncontrado.sku} guardada en cola offline.`,
      })
      setProductoEncontrado(null)
      return
    }

    const { error } = await supabase.from('movimientos_inventario').insert([payload])
    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al descontar inventario: ' + error.message })
      return
    }

    // Vincular el SKU escaneado a la OT seleccionada
    if (otElegida) {
      await supabase
        .from('ordenes_trabajo')
        .update({ sku_vinculado: `${productoEncontrado.sku} (${cantidad} ud)` })
        .eq('id', otElegida.id)
    }

    setMensaje({
      tipo: 'exito',
      texto: `✓ Descontado ${cantidad}x [${productoEncontrado.sku}] de ${bodegaNombre}${
        otElegida ? ` y vinculado a ${otElegida.codigo_ot}` : ''
      }.`,
    })
    setProductoEncontrado(null)
    cargarInicial()
  }

  const bodegaAsignadaObj = bodegas.find((b) => String(b.id) === String(bodegaSeleccionada))

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Estado de Conexión y Unidad Móvil Asignada */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold ${
            online
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span>{online ? 'TCP Cloud Activo' : 'Modo Offline'}</span>
          </div>

          {pendientesOffline > 0 && online && (
            <button
              onClick={sincronizarColaOffline}
              className="flex items-center gap-1 bg-amber-600 text-white px-2 py-0.5 rounded-lg cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Sincronizar ({pendientesOffline})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 text-[#0D1B2A] border border-slate-200">
          <Truck className="w-4 h-4 text-[#0A84FF] shrink-0" />
          <span className="truncate">
            Unidad activa: <strong>{bodegaAsignadaObj?.nombre || 'Móvil 1'}</strong>
          </span>
        </div>
      </div>

      {/* Selector de OT Activa de Cerrajería */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
        <label className="flex items-center gap-1.5 text-xs font-bold text-[#0D1B2A]">
          <ClipboardList className="w-4 h-4 text-[#0A84FF]" />
          Orden de Trabajo de Cerrajería a Atender:
        </label>
        <select
          value={otSeleccionadaId}
          onChange={(e) => setOtSeleccionadaId(e.target.value)}
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium"
        >
          <option value="">-- Descargo general sin OT específica --</option>
          {ordenesCerrajeria.map((ot) => (
            <option key={ot.id} value={ot.id}>
              {ot.codigo_ot} • {ot.clientes?.nombre || ot.cliente_nombre_rapido || 'Cliente'} (
              {ot.vehiculo_info})
            </option>
          ))}
        </select>

        {perfil?.rol === 'admin' && (
          <div className="pt-1">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Unidad móvil de descargo (Admin puede cambiar):
            </label>
            <select
              value={bodegaSeleccionada}
              onChange={(e) => setBodegaSeleccionada(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border rounded-lg text-xs"
            >
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Escáner de Cámara / Manual */}
      <div className="bg-[#0D1B2A] text-white p-5 rounded-2xl shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">Escáner de Producto en Ruta</h2>
            <p className="text-xs text-[#AEB4BD]">
              Escanea la etiqueta QR 4×4 cm del control o llave entregada
            </p>
          </div>
        </div>

        {!escaneando ? (
          <button
            onClick={iniciarCamara}
            className="w-full py-3.5 bg-[#0A84FF] hover:bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow cursor-pointer"
          >
            <Camera className="w-5 h-5" />
            Escanear Etiqueta QR (4×4 cm)
          </button>
        ) : (
          <div className="space-y-3">
            <div id="lector-qr-tcp" className="rounded-xl overflow-hidden bg-black"></div>
            <button
              onClick={detenerCamara}
              className="w-full py-2 bg-red-600 text-white font-semibold rounded-lg flex items-center justify-center gap-2 text-xs cursor-pointer"
            >
              <CameraOff className="w-4 h-4" />
              Detener Cámara
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={skuManual}
            onChange={(e) => setSkuManual(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscarPorSKU(skuManual)}
            placeholder="O escribe el SKU manual (Ej. PRUEBA-213)..."
            className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs uppercase outline-none focus:border-[#0A84FF]"
          />
          <button
            onClick={() => buscarPorSKU(skuManual)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            Buscar
          </button>
        </div>
      </div>

      {mensaje && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium ${
            mensaje.tipo === 'exito'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Ficha del Producto Escaneado para Confirmar Salida */}
      {productoEncontrado && (
        <div className="border-2 border-[#0A84FF] rounded-2xl p-5 bg-white shadow-md space-y-4">
          <div className="flex items-center gap-4">
            {productoEncontrado.foto_url && (
              <img
                src={productoEncontrado.foto_url}
                alt={productoEncontrado.sku}
                className="w-16 h-16 rounded-xl object-cover border"
              />
            )}
            <div>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#0D1B2A] text-white">
                {productoEncontrado.sku}
              </span>
              <h3 className="font-bold text-base text-slate-800 mt-1">
                {productoEncontrado.nombre}
              </h3>
              <p className="text-xs text-slate-500">
                {productoEncontrado.compatibilidad_vehiculos}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {bodegas.map((b) => {
              const reg = stocksProducto.find((s) => s.bodega_id === b.id)
              const qty = reg ? reg.cantidad_actual : 0
              return (
                <div key={b.id} className="bg-slate-50 p-2 rounded-lg border">
                  <p className="text-[11px] text-slate-500 truncate">
                    {b.nombre.replace('Oficina Central / ', '')}
                  </p>
                  <p className="font-bold text-sm text-[#0D1B2A]">{qty} uds</p>
                </div>
              )
            })}
          </div>

          <div className="flex items-end gap-3 pt-2 border-t">
            <div className="w-28">
              <label className="block text-xs font-bold text-slate-700 mb-1">Cantidad</label>
              <input
                type="number"
                min="1"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm text-center font-bold"
              />
            </div>

            <button
              onClick={descargarProductoEnOT}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Salida de Unidad Móvil
            </button>
          </div>
        </div>
      )}
    </div>
  )
}