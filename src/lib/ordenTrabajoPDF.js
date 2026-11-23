import { jsPDF } from 'jspdf'

async function cargarImagenBase64(url) {
  if (!url) return null
  try {
    const resp = await fetch(url, { mode: 'cors' })
    if (!resp.ok) return null
    const blob = await resp.blob()
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })

    return await new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: img.width,
          height: img.height,
        })
      }
      img.onerror = () => resolve({ dataUrl, width: 1, height: 1 })
      img.src = dataUrl
    })
  } catch {
    return null
  }
}

export async function generarOrdenTrabajoPDF(orden, cliente, soloPrevisualizar = false) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  })

  const azulOscuro = [13, 27, 42] // #0D1B2A
  const azulTecnico = [10, 132, 255] // #0A84FF
  const grisTexto = [71, 85, 105]
  const fechaTexto = new Date(orden.fecha_ingreso || orden.creado_en || Date.now()).toLocaleString('es-SV')
  const esLaboratorio = orden.tipo_servicio === 'Laboratorio de electrónica'
  const esProgramacion = orden.tipo_servicio === 'Programación'
  const llevaStickersModulo = esLaboratorio || esProgramacion
  const esCerrajeria = orden.tipo_servicio === 'Cerrajería'

  const nombreCliente = cliente?.nombre || orden.cliente_nombre_rapido || 'Cliente General'
  const telefonoCliente = cliente?.telefono || orden.cliente_telefono_rapido || 'N/A'

  const [logoImg, productoImg, stickerGarantiaImg, identificacionEcuImg] = await Promise.all([
    cargarImagenBase64('/logo-tcp.png'),
    esCerrajeria && orden.catalogo_productos?.foto_url
      ? cargarImagenBase64(orden.catalogo_productos.foto_url)
      : Promise.resolve(null),
    llevaStickersModulo ? cargarImagenBase64('/sticker-garantia.png') : Promise.resolve(null),
    llevaStickersModulo ? cargarImagenBase64('/identificacion-ecu.png') : Promise.resolve(null),
  ])

  // --- ENCABEZADO CORPORATIVO ---
  doc.setFillColor(...azulOscuro)
  doc.rect(14, 12, 188, 24, 'F')

  if (logoImg?.dataUrl) {
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(17, 14.5, 24, 19, 2, 2, 'F')
    doc.addImage(logoImg.dataUrl, 'PNG', 18, 15.5, 22, 17)
  }

  const xTextoHeader = logoImg?.dataUrl ? 45 : 18
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('TCP AUTOMOTIVE SERVICES', xTextoHeader, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Diagnóstico • Electrónica • Programación • Cerrajería Automotriz', xTextoHeader, 28)
  doc.text('San Salvador, El Salvador • Tel: +503 7922-1201', xTextoHeader, 33)

  // Recuadro Número de OT y Fecha Automática
  doc.setFillColor(...azulTecnico)
  doc.roundedRect(142, 15, 56, 18, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.text(orden.codigo_ot, 170, 22, { align: 'center' })
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.text(fechaTexto, 170, 28, { align: 'center' })

  // --- LÍNEA DE SERVICIO ---
  let y = 43
  doc.setTextColor(...azulOscuro)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(
    esCerrajeria
      ? 'ORDEN INTERNA DE SERVICIO EXPRÉS — CERRAJERÍA'
      : `ORDEN DE TRABAJO — ${orden.tipo_servicio.toUpperCase()}`,
    14,
    y
  )

  // --- DATOS DEL CLIENTE Y VEHÍCULO ---
  y += 4
  doc.setDrawColor(210, 215, 220)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, y, 91, 34, 2, 2, 'FD')
  doc.roundedRect(111, y, 91, 34, 2, 2, 'FD')

  // Columna Izquierda: Cliente
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...azulTecnico)
  doc.text('DATOS DEL CLIENTE', 18, y + 6)
  doc.setTextColor(20, 20, 20)
  doc.text(nombreCliente, 18, y + 12)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grisTexto)
  doc.text(`WhatsApp: ${telefonoCliente}`, 18, y + 17.5)
  if (cliente?.encargado) {
    doc.text(`Encargado: ${cliente.encargado}`, 18, y + 23)
  } else if (cliente?.dui) {
    doc.text(`DUI: ${cliente.dui}`, 18, y + 23)
  }
  if (cliente?.nit_nrc) {
    doc.text(`NRC: ${cliente.nit_nrc}`, 18, y + 28.5)
  }

  // Columna Derecha: Vehículo / Módulo / Dirección
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...azulTecnico)
  doc.text('DATOS DEL VEHÍCULO / MÓDULO', 115, y + 6)
  doc.setTextColor(20, 20, 20)
  doc.text(orden.vehiculo_info || 'No especificado', 115, y + 12)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...grisTexto)

  let yDerecha = y + 17.5
  if (orden.motor_vin) {
    doc.text(`Motor / VIN: ${orden.motor_vin}`, 115, yDerecha)
    yDerecha += 5
  }
  if (llevaStickersModulo) {
    doc.text(
      `Módulo: ${orden.tipo_modulo || 'ECU'} • Serie: ${orden.numero_parte_ecu || 'N/A'}`,
      115,
      yDerecha
    )
    yDerecha += 5
  }
  if (orden.direccion_servicio) {
    const dirLines = doc.splitTextToSize(`Lugar: ${orden.direccion_servicio}`, 82)
    doc.text(dirLines.slice(0, 2), 115, yDerecha)
  }

  // --- PRODUCTO ASIGNADO DE INVENTARIO CON FOTO PROPORCIONAL (SI ES CERRAJERÍA) ---
  const tieneProductoCerrajeria =
    esCerrajeria && (orden.catalogo_productos || orden.sku_vinculado)

  if (tieneProductoCerrajeria) {
    y += 39
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...azulTecnico)
    doc.text('PRODUCTO ASIGNADO DESDE INVENTARIO:', 14, y)
    y += 2.5

    const altoCajaProd = productoImg?.dataUrl ? 26 : 14
    doc.setFillColor(240, 249, 255)
    doc.setDrawColor(186, 230, 253)
    doc.roundedRect(14, y, 188, altoCajaProd, 2, 2, 'FD')

    let xTextoProd = 18
    if (productoImg?.dataUrl) {
      const boxX = 17
      const boxY = y + 2
      const boxW = 28
      const boxH = 22

      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(203, 213, 225)
      doc.roundedRect(boxX, boxY, boxW, boxH, 1.5, 1.5, 'FD')

      const maxW = boxW - 2
      const maxH = boxH - 2
      const ratio = Math.min(maxW / productoImg.width, maxH / productoImg.height)
      const drawW = productoImg.width * ratio
      const drawH = productoImg.height * ratio
      const offsetX = boxX + (boxW - drawW) / 2
      const offsetY = boxY + (boxH - drawH) / 2

      doc.addImage(productoImg.dataUrl, 'PNG', offsetX, offsetY, drawW, drawH)
      xTextoProd = boxX + boxW + 5
    }

    if (orden.catalogo_productos) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...azulOscuro)
      doc.text(`SKU: ${orden.catalogo_productos.sku}`, xTextoProd, y + 9)

      doc.setFontSize(9.5)
      doc.setTextColor(20, 20, 20)
      doc.text(orden.catalogo_productos.nombre, xTextoProd, y + 15)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...grisTexto)
      doc.text(
        `Cantidad a entregar: ${orden.cantidad_producto || 1} unidad(es)`,
        xTextoProd,
        y + 20.5
      )
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(20, 20, 20)
      doc.text(orden.sku_vinculado, xTextoProd, y + 9)
    }

    y += altoCajaProd + 5
  } else {
    y += 39
  }

  // --- FALLA REPORTADA / PROCEDIMIENTO DE PROGRAMACIÓN ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...azulOscuro)
  doc.text(
    esLaboratorio
      ? 'FALLA REPORTADA POR EL CLIENTE:'
      : esProgramacion
      ? 'PROCEDIMIENTO DE PROGRAMACIÓN SOLICITADO:'
      : 'SERVICIO A REALIZAR:',
    14,
    y
  )

  y += 2.5
  doc.setDrawColor(210, 215, 220)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(14, y, 188, 18, 2, 2, 'D')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(30, 30, 30)
  const lineasFalla = doc.splitTextToSize(orden.falla_reportada || 'Sin observaciones.', 180)
  doc.text(lineasFalla.slice(0, 3), 18, y + 6)

  // --- REPORTE TÉCNICO (SOLO SI NO ES CERRAJERÍA) ---
  if (!esCerrajeria && orden.reporte_final_tecnico) {
    y += 22
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...azulTecnico)
    doc.text('REPORTE TÉCNICO DE DIAGNÓSTICO Y SOLUCIÓN:', 14, y)
    y += 2.5
    doc.setFillColor(240, 249, 255)
    doc.roundedRect(14, y, 188, 18, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    const lineasRep = doc.splitTextToSize(orden.reporte_final_tecnico, 180)
    doc.text(lineasRep.slice(0, 3), 18, y + 6)
  }

  // --- RESUMEN ECONÓMICO ---
  y += 22
  const total = Number(orden.costo_total || 0)
  const abono = esCerrajeria ? 0 : Number(orden.abono_recibido || 0)
  const saldo = Math.max(0, total - abono)

  doc.setFillColor(241, 245, 249)
  doc.roundedRect(14, y, 188, 11, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...azulOscuro)

  if (esCerrajeria) {
    doc.text(`Total del Servicio: $${total.toFixed(2)}`, 20, y + 7)
    doc.setTextColor(...azulTecnico)
    doc.text('Modalidad: Pago contra entrega al finalizar el trabajo', 105, y + 7)
  } else {
    doc.text(`Total Cotizado: $${total.toFixed(2)}`, 20, y + 7)
    doc.text(`Anticipo / Abono: $${abono.toFixed(2)}`, 85, y + 7)
    doc.setTextColor(...azulTecnico)
    doc.text(`Saldo Pendiente: $${saldo.toFixed(2)}`, 150, y + 7)
  }

  // --- BLOQUES EXCLUSIVOS PARA SERVICIOS NO EXPRÉS ---
  if (!esCerrajeria) {
    y += 15
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...grisTexto)
    const terminos =
      'TÉRMINOS DE SERVICIO: 1) Todo diagnóstico o lectura electrónica genera honorarios técnicos incluso si el módulo presenta daño físico severo o manipulación previa. 2) Garantía de 1 mes (30 días) aplica únicamente sobre la reparación o programación efectuada, siempre que los sellos de seguridad de TCP Automotive Services permanezcan intactos y no existan fallas eléctricas externas en el vehículo. 3) Pasados 30 días de notificación sin retiro, se aplicará cargo por bodegaje.'
    const lineasTerminos = doc.splitTextToSize(terminos, 188)
    doc.text(lineasTerminos, 14, y)

    y += 19
    doc.setDrawColor(120, 120, 120)
    doc.line(22, y, 88, y)
    doc.line(126, y, 192, y)
    doc.setFontSize(7.5)
    doc.setTextColor(40, 40, 40)
    doc.text('Recibido por TCP Automotive Services', 55, y + 4.5, { align: 'center' })
    doc.text('Autorizado por el Cliente (Nombre y Firma)', 159, y + 4.5, { align: 'center' })

    // VIÑETA DE IDENTIFICACIÓN + STICKER OFICIAL DE GARANTÍA (LABORATORIO Y PROGRAMACIÓN)
    if (llevaStickersModulo) {
      y += 9
      doc.setDrawColor(180, 180, 180)
      doc.setLineDashPattern([2, 2], 0)
      doc.line(14, y, 202, y)
      doc.setLineDashPattern([], 0)

      y += 3.5

      // Izquierda: Viñeta oficial de Identificación de ECU
      const idX = 14
      const idY = y
      const idW = 94
      const idH = 36

      if (identificacionEcuImg?.dataUrl) {
        doc.setDrawColor(180, 190, 200)
        doc.rect(idX, idY, idW, idH)
        doc.addImage(identificacionEcuImg.dataUrl, 'PNG', idX, idY, idW, idH)

        // Estampar número de OT bien separado a la derecha de "OT:"
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9.5)
        doc.setTextColor(...azulTecnico)
        doc.text(orden.codigo_ot, idX + 49, idY + 9.8)

        // Estampar tipo de módulo y serie bien separado a la derecha de "ECU:"
        doc.setFontSize(8)
        doc.setTextColor(...azulOscuro)
        const infoEcu = `${orden.tipo_modulo || 'ECU'}${
          orden.numero_parte_ecu ? ` • ${orden.numero_parte_ecu}` : ''
        }`
        doc.text(infoEcu.slice(0, 24), idX + 51.5, idY + 23.6)

        // Vehículo debajo de ECU
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.8)
        doc.setTextColor(...grisTexto)
        doc.text((orden.vehiculo_info || '').slice(0, 34), idX + 39, idY + 29.5)
      } else {
        doc.setFillColor(...azulOscuro)
        doc.roundedRect(idX, idY, idW, idH, 2, 2, 'F')
        doc.setFillColor(255, 255, 255)
        doc.roundedRect(idX + 2, idY + 2, idW - 4, idH - 4, 1.5, 1.5, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(...azulOscuro)
        doc.text('VIÑETA DE IDENTIFICACIÓN DE ECU', idX + 6, idY + 8)
        doc.setTextColor(...azulTecnico)
        doc.setFontSize(10.5)
        doc.text(`OT: ${orden.codigo_ot}`, idX + 6, idY + 15)
        doc.setTextColor(30, 30, 30)
        doc.setFontSize(8)
        doc.text(
          `ECU: ${orden.tipo_modulo || 'ECU'} • ${orden.numero_parte_ecu || 'N/A'}`,
          idX + 6,
          idY + 21
        )
        doc.text(`Vehículo: ${(orden.vehiculo_info || '').slice(0, 38)}`, idX + 6, idY + 27)
      }

      // Derecha: Sticker oficial de Garantía de ECU
      const stickerX = 114
      const stickerY = y
      const stickerW = 54
      const stickerH = 36

      if (stickerGarantiaImg?.dataUrl) {
        doc.setDrawColor(180, 190, 200)
        doc.rect(stickerX, stickerY, stickerW, stickerH)
        doc.addImage(stickerGarantiaImg.dataUrl, 'PNG', stickerX, stickerY, stickerW, stickerH)

        // Estampar automáticamente el código de OT justo sobre la línea "OT N°: ________"
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.8)
        doc.setTextColor(...azulOscuro)
        doc.text(orden.codigo_ot, stickerX + 11.2, stickerY + 19.6)
      } else {
        doc.setFillColor(...azulOscuro)
        doc.roundedRect(114, y, 88, 36, 2, 2, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.text('TCP AUTOMOTIVE SERVICES • GARANTÍA DE ECU', 118, y + 8)
        doc.setFontSize(7.5)
        doc.text(`OT N°: ${orden.codigo_ot}`, 118, y + 16)
        doc.text(`FECHA: ____/____/202__ • VALIDEZ: 1 MES`, 118, y + 24)
      }
    }

    // COMPROBANTE DESPRENDIBLE (CONTRASEÑA DE RETIRO PARA EL CLIENTE)
    const yDesprendible = llevaStickersModulo ? 242 : 225
    doc.setDrawColor(140, 140, 140)
    doc.setLineDashPattern([3, 2], 0)
    doc.line(14, yDesprendible, 202, yDesprendible)
    doc.setLineDashPattern([], 0)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...grisTexto)
    doc.text(
      'CONTRASEÑA DE RETIRO PARA EL CLIENTE (PRESENTAR ESTE COMPROBANTE AL RETIRAR)',
      14,
      yDesprendible + 4.5
    )

    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(...azulOscuro)
    doc.roundedRect(14, yDesprendible + 6.5, 188, 24, 2, 2, 'FD')

    doc.setFontSize(11)
    doc.setTextColor(...azulOscuro)
    doc.text(`OT: ${orden.codigo_ot}`, 20, yDesprendible + 14)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.text(`Fecha de ingreso: ${fechaTexto}`, 20, yDesprendible + 20)
    doc.text(`Cliente: ${nombreCliente}`, 20, yDesprendible + 26)

    doc.text(`Vehículo: ${(orden.vehiculo_info || '').slice(0, 35)}`, 112, yDesprendible + 14)
    doc.text(`Total cotizado: $${total.toFixed(2)} • Abono: $${abono.toFixed(2)}`, 112, yDesprendible + 20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...azulTecnico)
    doc.text(`Saldo pendiente al retirar: $${saldo.toFixed(2)}`, 112, yDesprendible + 26)
  }

  if (soloPrevisualizar) {
    return doc.output('bloburl')
  }

  doc.save(`${orden.codigo_ot}_TCP_Automotive.pdf`)
}