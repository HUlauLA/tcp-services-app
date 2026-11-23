import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'

export function exportarMovimientosPDF(filas, resumenFiltros) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'letter',
  })

  // Encabezado
  doc.setFillColor(13, 27, 42)
  doc.rect(14, 12, 251, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('TCP AUTOMOTIVE SERVICES — REPORTE DE MOVIMIENTOS DE INVENTARIO', 18, 22)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generado: ${new Date().toLocaleString('es-SV')}`, 260, 22, { align: 'right' })

  doc.setTextColor(60, 60, 60)
  doc.setFontSize(9)
  doc.text(`Filtros aplicados: ${resumenFiltros}`, 14, 36)

  // Cabecera de tabla
  let y = 43
  doc.setFillColor(241, 245, 249)
  doc.rect(14, y - 5, 251, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(13, 27, 42)

  doc.text('Fecha/Hora', 16, y)
  doc.text('Tipo', 46, y)
  doc.text('SKU / Producto', 68, y)
  doc.text('Origen -> Destino', 128, y)
  doc.text('Cant.', 176, y, { align: 'center' })
  doc.text('Factura / Proveedor', 188, y)
  doc.text('Detalle / Motivo', 230, y)

  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)

  filas.forEach((f) => {
    if (y > 195) {
      doc.addPage()
      y = 20
    }

    doc.text(f.fechaFormateada, 16, y)
    doc.text(f.tipoEtiqueta, 46, y)
    doc.text(`${f.sku} - ${f.productoNombre}`.slice(0, 32), 68, y)
    doc.text(f.rutaBodegas.slice(0, 26), 128, y)
    doc.text(String(f.cantidad), 176, y, { align: 'center' })
    doc.text((f.facturaProveedor || '-').slice(0, 22), 188, y)
    doc.text((f.notas || '-').slice(0, 24), 230, y)

    doc.setDrawColor(235, 235, 235)
    doc.line(14, y + 2, 265, y + 2)
    y += 6.5
  })

  doc.save(`Reporte_Inventario_TCP_${Date.now()}.pdf`)
}

export function exportarMovimientosExcel(filas) {
  const datosPlanos = filas.map((f) => ({
    'Fecha y Hora': f.fechaFormateada,
    'Tipo Movimiento': f.tipoEtiqueta,
    SKU: f.sku,
    Producto: f.productoNombre,
    'Bodega Origen': f.origenNombre,
    'Bodega Destino': f.destinoNombre,
    Cantidad: f.cantidad,
    'Costo Unitario ($)': f.costoUnitario || 0,
    'N° Factura': f.numeroFactura || '',
    Proveedor: f.proveedor || '',
    'Notas / Razón': f.notas || '',
  }))

  const hoja = XLSX.utils.json_to_sheet(datosPlanos)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Movimientos Inventario')
  XLSX.writeFile(libro, `Reporte_Inventario_TCP_${Date.now()}.xlsx`)
}