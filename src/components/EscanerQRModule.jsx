import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'
import {
  offlineDb,
  actualizarCacheLocal,
  encolarMovimientoOffline,
} from '../lib/offlineDb'
import {
  Camera,
  CameraOff,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  PackageMinus,
  ArrowRightLeft,
  Search,
  AlertCircle,
} from 'lucide-react'

export default function EscanerQRModule({ perfil }) {
  const [online, setOnline] = useState(navigator.onLine)
  const [escaneando, setEscaneando] = useState(false)
  const [errorCamara, setErrorCamara] = useState(null)

  // Datos (desde Supabase o caché Dexie si está offline)
  const [productos, setProductos] = useState([])
  const [bodegas, setBodegas] = useState([])
  const [inventario, setInventario] = useState([])
  const [pendientesOffline, setPendientesOffline] = useState([])
  const [sincronizando, setSincronizando] = useState(false)

  // Producto detectado y acción a realizar
  const [productoDetectado, setProductoDetectado] = useState(null)
  const [skuManual, setSkuManual] = useState('')
  const [accion, setAccion] = useState('consumo') // 'consumo' | 'transferencia' | 'consulta'
  const [bodegaOrigenId, setBodegaOrigenId] = useState('1')
  const [bodegaDestinoId, setBodegaDestinoId] = useState(
    perfil?.bodega_asignada_id ? String(perfil.bodega_asignada_id) : '2'
  )
  const [cantidad, setCantidad] = useState(1)
  const [notas, setNotas] = useState('')
  const [mensajeExito, setMensajeExito] = useState(null)
  const [procesando, setProcesando] = useState(false)

  const scannerRef = useRef(null)

  // Monitorear estado de conexión a internet
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      sincronizarPendientes()
    }
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Cargar datos y pendientes locales
  const cargarDatos = async () => {
    const pend = await offlineDb.movimientos_pendientes
      .where('sincronizado')
      .equals(0)
      .toArray()
    setPendientesOffline(pend)

    if (navigator.onLine) {
      const [{ data: prods }, { data: bods }, { data: inv }] = await Promise.all([
        supabase.from('catalogo_productos').select('*').eq('activo', true),
        supabase.from('bodegas').select('*').eq('activa', true).order('id'),
        supabase.from('inventario_bodega').select('*'),
      ])

      if (prods && bods && inv) {
        setProductos(prods)
        setBodegas(bods)
        setInventario(inv)
        await actualizarCacheLocal(prods, bods, inv)
      }
    } else {
      const [prodsLocal, bodsLocal, invLocal] = await Promise.all([
        offlineDb.catalogo_cache.toArray(),
        offlineDb.bodegas_cache.toArray(),
        offlineDb.inventario_cache.toArray(),
      ])
      setProductos(prodsLocal)
      setBodegas(bodsLocal)
      setInventario(invLocal)
    }
  }

  useEffect(() => {
    cargarDatos()
    return () => {
      detenerCamara()
    }
  }, [])

  // Sincronizar movimientos guardados sin internet
  const sincronizarPendientes = async () => {
    if (!navigator.onLine) return
    const pend = await offlineDb.movimientos_pendientes
      .where('sincronizado')
      .equals(0)
      .toArray()

    if (pend.length === 0) return
    setSincronizando(true)

    for (const item of pend) {
      const { local_id, timestamp, sincronizado, producto_nombre, ...payloadSupabase } = item
      const { error } = await supabase
        .from('movimientos_inventario')
        .insert([payloadSupabase])

      if (!error) {
        await offlineDb.movimientos_pendientes.delete(local_id)
      }
    }

    setSincronizando(false)
    await cargarDatos()
    setMensajeExito('Operaciones offline sincronizadas con la nube.')
  }

  const iniciarCamara = async () => {
    setErrorCamara(null)
    setMensajeExito(null)

    try {
      const html5QrCode = new Html5Qrcode('lector-qr-tcp')
      scannerRef.current = html5QrCode
      setEscaneando(true)

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decodedText) => {
          procesarLecturaQR(decodedText)
          detenerCamara()
        },
        () => {}
      )
    } catch (err) {
      setEscaneando(false)
      setErrorCamara(
        'No se pudo acceder a la cámara. Verifica los permisos del navegador o usa el buscador manual de SKU.'
      )
    }
  }

  const detenerCamara = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch (_) {}
      scannerRef.current = null
    }
    setEscaneando(false)
  }

  const procesarLecturaQR = (textoLeido) => {
    let skuBuscado = textoLeido.trim().toUpperCase()
    try {
      const parsed = JSON.parse(textoLeido)
      if (parsed.sku) skuBuscado = parsed.sku.toUpperCase()
    } catch (_) {}

    const encontrado = productos.find((p) => p.sku.toUpperCase() === skuBuscado)
    if (encontrado) {
      setProductoDetectado(encontrado)
      setCantidad(1)
      setNotas('')
    } else {
      setErrorCamara(`Código leído (${skuBuscado}), pero no existe en el catálogo local.`)
    }
  }

  const buscarManual = (e) => {
    e.preventDefault()
    if (!skuManual.trim()) return
    setErrorCamara(null)
    setMensajeExito(null)
    procesarLecturaQR(skuManual)
  }

  const obtenerStock = (productoId, bodegaId) => {
    const reg = inventario.find(
      (i) => i.producto_id === productoId && i.bodega_id === bodegaId
    )
    return reg ? reg.cantidad_actual : 0
  }

  const ejecutarAccionQR = async (e) => {
    e.preventDefault()
    if (!productoDetectado) return
    setProcesando(true)
    setMensajeExito(null)

    const payload =
      accion === 'consumo'
        ? {
            producto_id: productoDetectado.id,
            tipo_movimiento: 'consumo_orden',
            bodega_origen_id: Number(bodegaDestinoId),
            bodega_destino_id: null,
            cantidad: Number(cantidad),
            usuario_id: perfil?.id || null,
            notas: notas || 'Descuento rápido en ruta (Escáner QR)',
          }
        : {
            producto_id: productoDetectado.id,
            tipo_movimiento: 'transferencia',
            bodega_origen_id: Number(bodegaOrigenId),
            bodega_destino_id: Number(bodegaDestinoId),
            cantidad: Number(cantidad),
            usuario_id: perfil?.id || null,
            notas: notas || 'Transferencia escaneada por QR',
          }

    if (navigator.onLine) {
      const { error } = await supabase.from('movimientos_inventario').insert([payload])
      setProcesando(false)
      if (error) {
        alert('Error al registrar movimiento: ' + error.message)
        return
      }
      setMensajeExito(
        accion === 'consumo'
          ? `Se descontaron ${cantidad} ud(s) de ${productoDetectado.sku} correctamente.`
          : `Se transfirieron ${cantidad} ud(s) de ${productoDetectado.sku} correctamente.`
      )
      setProductoDetectado(null)
      cargarDatos()
    } else {
      // Guardar en cola offline Dexie.js
      await encolarMovimientoOffline({
        ...payload,
        producto_nombre: `${productoDetectado.sku} - ${productoDetectado.nombre}`,
      })
      setProcesando(false)
      setMensajeExito(
        `Guardado en modo OFFLINE (${cantidad} ud(s) de ${productoDetectado.sku}). Se sincronizará al volver la señal.`
      )
      setProductoDetectado(null)
      cargarDatos()
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Barra de Estado de Red y Sincronización Offline */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm ${
          online
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-amber-50 border-amber-300 text-amber-900'
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          {online ? (
            <>
              <Wifi className="w-4 h-4 text-emerald-600" />
              <span>Conectado en tiempo real con TCP Cloud</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-amber-600" />
              <span>Modo Sin Conexión (Operando con caché local)</span>
            </>
          )}
        </div>

        {pendientesOffline.length > 0 && (
          <button
            onClick={sincronizarPendientes}
            disabled={!online || sincronizando}
            className="px-3 py-1 bg-[#0D1B2A] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
            Sincronizar ({pendientesOffline.length})
          </button>
        )}
      </div>

      {/* Mensajes de feedback */}
      {mensajeExito && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{mensajeExito}</span>
        </div>
      )}

      {errorCamara && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorCamara}</span>
        </div>
      )}

      {/* Visor de Cámara QR */}
      <div className="bg-slate-900 rounded-2xl p-5 text-center text-white">
        <div
          id="lector-qr-tcp"
          className={`mx-auto max-w-xs overflow-hidden rounded-xl ${
            escaneando ? 'mb-4 border-2 border-[#007BFF]' : 'hidden'
          }`}
        />

        {!escaneando ? (
          <button
            onClick={iniciarCamara}
            className="w-full py-4 bg-[#007BFF] hover:bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2.5 text-base shadow-lg cursor-pointer"
          >
            <Camera className="w-6 h-6" />
            Escanear Etiqueta QR (4x4 cm)
          </button>
        ) : (
          <button
            onClick={detenerCamara}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl inline-flex items-center gap-2 text-sm cursor-pointer"
          >
            <CameraOff className="w-4 h-4" />
            Detener Cámara
          </button>
        )}

        {/* Entrada manual alternativa por SKU */}
        <form onSubmit={buscarManual} className="mt-4 flex gap-2">
          <input
            type="text"
            value={skuManual}
            onChange={(e) => setSkuManual(e.target.value)}
            placeholder="O escribe el SKU manual (Ej. PRUEBA-213)..."
            className="flex-1 px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 uppercase outline-none focus:border-[#007BFF]"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            Buscar
          </button>
        </form>
      </div>

      {/* Tarjeta del Producto Escaneado y Acciones Rápidas */}
      {productoDetectado && (
        <div className="border-2 border-[#007BFF] rounded-2xl p-5 bg-white shadow-md space-y-4">
          <div className="flex items-start justify-between gap-3 border-b pb-3">
            <div>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-[#0D1B2A] text-white">
                {productoDetectado.sku}
              </span>
              <h3 className="text-lg font-bold text-[#0D1B2A] mt-1">
                {productoDetectado.nombre}
              </h3>
              <p className="text-xs text-slate-500">
                {productoDetectado.compatibilidad_vehiculos}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-slate-800">
                Público: ${Number(productoDetectado.precio_publico).toFixed(2)}
              </p>
              <p className="text-xs text-slate-500">
                Taller: ${Number(productoDetectado.precio_taller).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Stock actual por bodega */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {bodegas.map((b) => (
              <div key={b.id} className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <p className="text-[11px] text-slate-500 truncate">
                  {b.nombre.replace('Oficina Central / ', '')}
                </p>
                <p className="text-base font-bold text-[#0D1B2A]">
                  {obtenerStock(productoDetectado.id, b.id)} uds
                </p>
              </div>
            ))}
          </div>

          {/* Selector de Acción */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAccion('consumo')}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                accion === 'consumo'
                  ? 'bg-[#007BFF] text-white border-[#007BFF]'
                  : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              <PackageMinus className="w-4 h-4" />
              Descontar por Trabajo
            </button>

            <button
              type="button"
              onClick={() => setAccion('transferencia')}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                accion === 'transferencia'
                  ? 'bg-[#0D1B2A] text-white border-[#0D1B2A]'
                  : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              Transferir a Móvil
            </button>
          </div>

          {/* Formulario de Ejecución */}
          <form onSubmit={ejecutarAccionQR} className="space-y-3 text-sm pt-2">
            {accion === 'transferencia' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Desde Bodega Origen:
                </label>
                <select
                  value={bodegaOrigenId}
                  onChange={(e) => setBodegaOrigenId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {accion === 'consumo' ? 'Descontar de Unidad / Bodega:' : 'Hacia Unidad Destino:'}
              </label>
              <select
                value={bodegaDestinoId}
                onChange={(e) => setBodegaDestinoId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                {bodegas.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Cantidad
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg font-bold text-center"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nota / Placa / Cliente
                </label>
                <input
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej. Duplicado Hilux P-123456"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={procesando}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer disabled:opacity-50"
            >
              {procesando
                ? 'Registrando...'
                : accion === 'consumo'
                ? 'Confirmar Descuento de Stock'
                : 'Confirmar Transferencia a Unidad'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}