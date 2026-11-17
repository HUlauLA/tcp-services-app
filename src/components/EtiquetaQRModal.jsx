import { useState } from 'react'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { X, Download, Plus, Trash2, Layers } from 'lucide-react'

export default function EtiquetaQRModal({ productos = [], itemsIniciales = [], onClose }) {
  // Cola de impresión: [{ producto, cantidad }]
  const [cola, setCola] = useState(itemsIniciales)
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState(
    productos.length > 0 ? String(productos[0].id) : ''
  )
  const [cantidadAgregar, setCantidadAgregar] = useState(1)
  const [generando, setGenerando] = useState(false)

  const totalEtiquetas = cola.reduce((acc, item) => acc + item.cantidad, 0)
  const hojasNecesarias = Math.max(1, Math.ceil(totalEtiquetas / 24))
  const espaciosLibresEnHoja = totalEtiquetas === 0 ? 24 : (24 - (totalEtiquetas % 24)) % 24

  const agregarALaCola = () => {
    const prod = productos.find((p) => String(p.id) === String(productoSeleccionadoId))
    if (!prod || cantidadAgregar < 1) return

    setCola((prev) => {
      const existe = prev.find((i) => i.producto.id === prod.id)
      if (existe) {
        return prev.map((i) =>
          i.producto.id === prod.id
            ? { ...i, cantidad: i.cantidad + Number(cantidadAgregar) }
            : i
        )
      }
      return [...prev, { producto: prod, cantidad: Number(cantidadAgregar) }]
    })
    setCantidadAgregar(1)
  }

  const actualizarCantidad = (productoId, nuevaCantidad) => {
    const qty = Math.max(1, Number(nuevaCantidad) || 1)
    setCola((prev) =>
      prev.map((i) => (i.producto.id === productoId ? { ...i, cantidad: qty } : i))
    )
  }

  const quitarDeCola = (productoId) => {
    setCola((prev) => prev.filter((i) => i.producto.id !== productoId))
  }

  const generarPDFCombinado = async () => {
    if (cola.length === 0) return
    setGenerando(true)

    try {
      // Pre-generar los DataURLs de QR únicos de la cola
      const qrMap = {}
      for (const item of cola) {
        const payload = JSON.stringify({
          app: 'TCP',
          sku: item.producto.sku,
          id: item.producto.id,
        })
        qrMap[item.producto.id] = await QRCode.toDataURL(payload, {
          width: 300,
          margin: 1,
          color: { dark: '#0D1B2A', light: '#FFFFFF' },
        })
      }

      // Expandir la cola en un arreglo plano de etiquetas individuales
      const etiquetasPlanas = []
      cola.forEach((item) => {
        for (let c = 0; c < item.cantidad; c++) {
          etiquetasPlanas.push(item.producto)
        }
      })

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter',
      })

      const size = 40 // 4x4 cm = 40x40 mm
      const marginX = 12
      const marginY = 12
      const gap = 4
      const cols = 4
      const rows = 6
      const porPagina = cols * rows

      etiquetasPlanas.forEach((prod, i) => {
        if (i > 0 && i % porPagina === 0) {
          doc.addPage()
        }

        const indexEnPagina = i % porPagina
        const col = indexEnPagina % cols
        const row = Math.floor(indexEnPagina / cols)

        const x = marginX + col * (size + gap)
        const y = marginY + row * (size + gap)

        // Borde guía de corte
        doc.setDrawColor(180, 180, 180)
        doc.setLineWidth(0.2)
        doc.rect(x, y, size, size)

        // Encabezado TCP
        doc.setFontSize(6.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(13, 27, 42)
        doc.text('TCP SERVICES', x + size / 2, y + 3.5, { align: 'center' })

        // Código QR
        const qrImg = qrMap[prod.id]
        if (qrImg) {
          doc.addImage(qrImg, 'PNG', x + 8.5, y + 5, 23, 23)
        }

        // SKU
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.text(prod.sku, x + size / 2, y + 31.5, { align: 'center' })

        // Nombre y specs
        doc.setFontSize(5.5)
        doc.setFont('helvetica', 'normal')
        doc.text(`${prod.nombre}`.slice(0, 28), x + size / 2, y + 35, { align: 'center' })

        const specs = [prod.frecuencia, prod.tipo_chip, prod.perfil_espadin]
          .filter(Boolean)
          .join(' | ')
          .slice(0, 28)
        if (specs) {
          doc.text(specs, x + size / 2, y + 38, { align: 'center' })
        }
      })

      const nombreArchivo =
        cola.length === 1
          ? `QR_${cola[0].producto.sku}_4x4cm.pdf`
          : `QR_Lote_${cola.length}SKUs_${totalEtiquetas}etiquetas.pdf`

      doc.save(nombreArchivo)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#007BFF]" />
            <h3 className="font-bold text-lg text-[#0D1B2A]">
              Impresión Múltiple de Etiquetas QR (4x4 cm)
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector para agregar más productos a la misma hoja */}
        <div className="mt-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
            Agregar producto al lote de impresión
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={productoSeleccionadoId}
              onChange={(e) => setProductoSeleccionadoId(e.target.value)}
              className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#007BFF]"
            >
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.sku}] {p.nombre}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                max="96"
                value={cantidadAgregar}
                onChange={(e) => setCantidadAgregar(Number(e.target.value) || 1)}
                className="w-20 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-center font-semibold"
                title="Cantidad de etiquetas"
              />
              <button
                type="button"
                onClick={agregarALaCola}
                className="px-4 py-2 bg-[#0D1B2A] hover:bg-slate-800 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                Agregar
              </button>
            </div>
          </div>
        </div>

        {/* Lista de productos seleccionados en esta impresión */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Productos incluidos en el PDF ({cola.length} SKUs):</span>
            <span>
              Total: <strong className="text-[#0D1B2A]">{totalEtiquetas} etiquetas</strong> ({hojasNecesarias}{' '}
              {hojasNecesarias === 1 ? 'hoja Carta' : 'hojas Carta'})
            </span>
          </div>

          {cola.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400">
              Selecciona un producto arriba y haz clic en "Agregar" para armar tu hoja.
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200">
              {cola.map((item) => (
                <div
                  key={item.producto.id}
                  className="flex items-center justify-between p-3 hover:bg-slate-50 text-sm"
                >
                  <div className="min-w-0 pr-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#0D1B2A] text-white mr-2">
                      {item.producto.sku}
                    </span>
                    <span className="font-medium text-slate-800">{item.producto.nombre}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400">Cant:</span>
                    <input
                      type="number"
                      min="1"
                      max="96"
                      value={item.cantidad}
                      onChange={(e) => actualizarCantidad(item.producto.id, e.target.value)}
                      className="w-16 px-2 py-1 border border-slate-300 rounded text-center font-semibold text-slate-800"
                    />
                    <button
                      onClick={() => quitarDeCola(item.producto.id)}
                      title="Quitar de la lista"
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalEtiquetas > 0 && espaciosLibresEnHoja > 0 && (
            <p className="text-xs text-[#007BFF] mt-2">
              Tip: Aún te caben <strong>{espaciosLibresEnHoja} etiquetas más</strong> en esta misma hoja Carta sin gastar papel extra.
            </p>
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={generarPDFCombinado}
            disabled={cola.length === 0 || generando}
            className="px-5 py-2.5 bg-[#007BFF] hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {generando ? 'Generando PDF...' : `Descargar PDF (${totalEtiquetas} etiquetas)`}
          </button>
        </div>
      </div>
    </div>
  )
}