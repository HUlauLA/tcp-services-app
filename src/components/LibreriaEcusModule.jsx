import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { importarCarpetaContentALibreria } from '../lib/importarLibreriaInicial'
import {
  Search,
  Cpu,
  FileText,
  Plus,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  X,
  Edit3,
  Trash2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Image as ImageIcon,
  Table as TableIcon,
  ZoomIn,
  Lock,
} from 'lucide-react'

// Componente que dibuja la imagen en Canvas con marca de agua sutil que NO tapa los números de pin
function ImagenProtegidaCanvas({ src, alt, lineaEmpresa, lineaUsuario, maxHeightClass = 'max-h-72' }) {
  const canvasRef = useRef(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let cancelado = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelado || !canvasRef.current) return
      const canvas = canvasRef.current
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')

      // Dibujar imagen original
      ctx.drawImage(img, 0, 0)

      // Quemar marca de agua sutil sin contorno blanco para no tapar los números del pinout
      ctx.save()
      ctx.globalCompositeOperation = 'multiply'
      const fontSize = Math.max(13, Math.round(img.width / 46))
      const subFontSize = Math.max(11, Math.round(fontSize * 0.85))
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      ctx.translate(img.width / 2, img.height / 2)
      ctx.rotate((-22 * Math.PI) / 180)

      const maxTextWidth = Math.max(
        lineaEmpresa.length * fontSize * 0.62,
        lineaUsuario.length * subFontSize * 0.62
      )
      const stepX = Math.max(380, Math.round(maxTextWidth + 160))
      const stepY = Math.max(190, fontSize * 11)

      for (let y = -img.height * 1.2; y <= img.height * 1.2; y += stepY) {
        for (let x = -img.width * 1.2; x <= img.width * 1.2; x += stepX) {
          // Línea 1: Nombre de la empresa (sutil)
          ctx.font = `700 ${fontSize}px sans-serif`
          ctx.fillStyle = 'rgba(13, 27, 42, 0.11)'
          ctx.fillText(lineaEmpresa, x, y - fontSize * 0.65)

          // Línea 2: Nombre y usuario que visualiza (sutil)
          ctx.font = `600 ${subFontSize}px sans-serif`
          ctx.fillStyle = 'rgba(10, 132, 255, 0.14)'
          ctx.fillText(lineaUsuario, x, y + fontSize * 0.65)
        }
      }
      ctx.restore()
      setCargando(false)
    }
    img.onerror = () => {
      if (!cancelado) setCargando(false)
    }
    img.src = src

    return () => {
      cancelado = true
    }
  }, [src, lineaEmpresa, lineaUsuario])

  return (
    <div className="relative w-full flex items-center justify-center bg-slate-100">
      {cargando && (
        <div className="py-12 text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando diagrama protegido...
        </div>
      )}
      <canvas
        ref={canvasRef}
        aria-label={alt}
        onContextMenu={(e) => e.preventDefault()}
        className={`${maxHeightClass} w-auto max-w-full object-contain pointer-events-none ${
          cargando ? 'hidden' : 'block'
        }`}
      />
    </div>
  )
}

export default function LibreriaEcusModule({ perfil }) {
  const [ecus, setEcus] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [ecuSeleccionada, setEcuSeleccionada] = useState(null)
  const [filtroTablaInterna, setFiltroTablaInterna] = useState('')

  // Visor de imagen ampliada o PDF
  const [imagenAmpliada, setImagenAmpliada] = useState(null)
  const [pdfVisorUrl, setPdfVisorUrl] = useState(null)

  // Escudo anti-captura / pérdida de foco cuando se consulta información confidencial
  const [pantallaBloqueada, setPantallaBloqueada] = useState(false)

  // Importación masiva desde carpeta content/
  const [importando, setImportando] = useState(false)
  const [progresoImport, setProgresoImport] = useState('')
  const inputCarpetaRef = useRef(null)

  // Modal Crear / Editar Ficha de ECU
  const [modalForm, setModalForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [formEcu, setFormEcu] = useState({
    nombre: '',
    subtitulo: '',
    estado: 'DOCUMENTADO',
    referencia_parte: '',
    intro: '',
    fuente: '',
    notasTexto: '',
    conectorNombre: 'Conector / Pin',
    pinesTexto: '',
  })
  const [nuevasImagenesFiles, setNuevasImagenesFiles] = useState([])
  const [nuevoPdfFile, setNuevoPdfFile] = useState(null)

  const rol = perfil?.rol || 'tecnico'
  const puedeGestionarLibreria = rol === 'admin'

  // Datos exactos para la marca de agua
  const lineaEmpresa = 'TCP AUTOMOTIVE SERVICES'
  const nombreVisualizador = perfil?.nombre || 'Usuario Autorizado'
  const usuarioVisualizador = perfil?.username ? ` (${perfil.username})` : ''
  const lineaUsuario = `Usuario: ${nombreVisualizador}${usuarioVisualizador}`
  const marcaAguaCompleta = `${lineaEmpresa} • ${lineaUsuario}`

  const visorActivo = Boolean(ecuSeleccionada || imagenAmpliada || pdfVisorUrl)

  // Bloqueo de atajos de teclado (Imprimir, Guardar, Copiar, DevTools, PrintScreen) y detección de pérdida de foco
  useEffect(() => {
    if (!visorActivo) {
      setPantallaBloqueada(false)
      return
    }

    const handleKeyDown = (e) => {
      const key = (e.key || '').toLowerCase()
      const ctrlOrCmd = e.ctrlKey || e.metaKey

      if (e.key === 'PrintScreen') {
        setPantallaBloqueada(true)
        if (navigator.clipboard?.writeText) {
          navigator.clipboard
            .writeText('Contenido confidencial protegido por TCP Automotive Services.')
            .catch(() => {})
        }
        e.preventDefault()
        return
      }

      if (ctrlOrCmd && ['p', 's', 'u', 'c', 'a'].includes(key)) {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      if (
        e.key === 'F12' ||
        (ctrlOrCmd && e.shiftKey && ['i', 'j', 'c'].includes(key))
      ) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const handleBlur = () => {
      setPantallaBloqueada(true)
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setPantallaBloqueada(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [visorActivo])

  const cargarEcus = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('libreria_ecus')
      .select('*')
      .order('id', { ascending: true })

    if (!error) {
      setEcus(data || [])
      if (ecuSeleccionada) {
        const actualizada = (data || []).find((e) => e.id === ecuSeleccionada.id)
        if (actualizada) setEcuSeleccionada(actualizada)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    cargarEcus()
  }, [])

  const handleImportarCarpeta = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setImportando(true)
    setProgresoImport('Iniciando lectura de carpeta...')

    try {
      const total = await importarCarpetaContentALibreria(files, (msg) =>
        setProgresoImport(msg)
      )
      alert(`¡Importación completada! Se cargaron ${total} fichas técnicas de ECU en Supabase.`)
      cargarEcus()
    } catch (err) {
      alert('Error en importación: ' + err.message)
    } finally {
      setImportando(false)
      setProgresoImport('')
      e.target.value = ''
    }
  }

  const abrirModalCrear = () => {
    setEditandoId(null)
    setFormEcu({
      nombre: '',
      subtitulo: '',
      estado: 'DOCUMENTADO',
      referencia_parte: '',
      intro: '',
      fuente: '',
      notasTexto: '',
      conectorNombre: 'Conector / Pin',
      pinesTexto: '',
    })
    setNuevasImagenesFiles([])
    setNuevoPdfFile(null)
    setModalForm(true)
  }

  const abrirModalEditar = (ecu) => {
    setEditandoId(ecu.id)
    const primeraTabla = Array.isArray(ecu.tablas) && ecu.tablas[0] ? ecu.tablas[0] : null
    const pinesFormateados = primeraTabla
      ? (primeraTabla.rows || []).map((r) => r.join(' | ')).join('\n')
      : ''

    setFormEcu({
      nombre: ecu.nombre || '',
      subtitulo: ecu.subtitulo || '',
      estado: ecu.estado || 'DOCUMENTADO',
      referencia_parte: ecu.referencia_parte || '',
      intro: ecu.intro || '',
      fuente: ecu.fuente || '',
      notasTexto: Array.isArray(ecu.notas) ? ecu.notas.join('\n') : '',
      conectorNombre: primeraTabla?.headers?.[0] || 'Conector / Pin',
      pinesTexto: pinesFormateados,
    })
    setNuevasImagenesFiles([])
    setNuevoPdfFile(null)
    setModalForm(true)
  }

  const guardarFichaEcu = async (e) => {
    e.preventDefault()
    setGuardando(true)

    try {
      const slugBase = formEcu.nombre
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      let pdfUrlFinal = editandoId
        ? ecus.find((x) => x.id === editandoId)?.pdf_url || null
        : null

      if (nuevoPdfFile) {
        const pdfPath = `diagramas/${slugBase}_${Date.now()}.pdf`
        const { error: upPdfErr } = await supabase.storage
          .from('libreria-ecus')
          .upload(pdfPath, nuevoPdfFile)
        if (!upPdfErr) {
          const { data } = supabase.storage.from('libreria-ecus').getPublicUrl(pdfPath)
          pdfUrlFinal = data.publicUrl
        }
      }

      const imagenesExistentes = editandoId
        ? ecus.find((x) => x.id === editandoId)?.imagenes || []
        : []
      const imagenesFinales = [...imagenesExistentes]

      for (const file of nuevasImagenesFiles) {
        const imgPath = `imagenes/${slugBase}_${Date.now()}_${file.name}`
        const { error: upImgErr } = await supabase.storage
          .from('libreria-ecus')
          .upload(imgPath, file)
        if (!upImgErr) {
          const { data } = supabase.storage.from('libreria-ecus').getPublicUrl(imgPath)
          imagenesFinales.push({
            caption: file.name,
            url: data.publicUrl,
          })
        }
      }

      const lineasPines = formEcu.pinesTexto
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)

      let tablasFinales = editandoId
        ? ecus.find((x) => x.id === editandoId)?.tablas || []
        : []

      if (lineasPines.length > 0) {
        const filas = lineasPines.map((linea) => {
          const cols = linea.split('|').map((c) => c.trim())
          return [cols[0] || '-', cols[1] || '-', ...(cols[2] ? [cols[2]] : [])]
        })
        const tieneColor = filas.some((f) => f.length > 2)
        const headers = tieneColor
          ? [formEcu.conectorNombre || 'Conector / Pin', 'Función / Señal', 'Color']
          : [formEcu.conectorNombre || 'Conector / Pin', 'Función / Señal']

        const filasNormalizadas = filas.map((f) =>
          tieneColor ? [f[0], f[1], f[2] || '-'] : [f[0], f[1]]
        )

        const nuevaTabla = { headers, rows: filasNormalizadas }
        if (tablasFinales.length > 1) {
          tablasFinales = [nuevaTabla, ...tablasFinales.slice(1)]
        } else {
          tablasFinales = [nuevaTabla]
        }
      }

      const notasArray = formEcu.notasTexto
        .split('\n')
        .map((n) => n.trim())
        .filter(Boolean)

      const payload = {
        nombre: formEcu.nombre.trim(),
        subtitulo: formEcu.subtitulo.trim(),
        estado: formEcu.estado,
        referencia_parte: formEcu.referencia_parte.trim(),
        intro: formEcu.intro.trim(),
        fuente: formEcu.fuente.trim(),
        pdf_url: pdfUrlFinal,
        imagenes: imagenesFinales,
        tablas: tablasFinales,
        notas: notasArray,
        actualizado_en: new Date().toISOString(),
      }

      if (editandoId) {
        const { error } = await supabase
          .from('libreria_ecus')
          .update(payload)
          .eq('id', editandoId)
        if (error) throw error
      } else {
        payload.slug = `${slugBase}-${Date.now()}`
        payload.creado_por = perfil?.nombre || 'Equipo TCP'
        const { error } = await supabase.from('libreria_ecus').insert([payload])
        if (error) throw error
      }

      setModalForm(false)
      cargarEcus()
    } catch (err) {
      alert('Error al guardar ficha de ECU: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminarFichaEcu = async (ecu) => {
    if (rol !== 'admin') return
    if (!confirm(`¿Seguro que deseas eliminar la ficha "${ecu.nombre}"?`)) return
    await supabase.from('libreria_ecus').delete().eq('id', ecu.id)
    if (ecuSeleccionada?.id === ecu.id) setEcuSeleccionada(null)
    cargarEcus()
  }

  const getBadgeEstado = (estado) => {
    const est = (estado || '').toUpperCase()
    if (est === 'DOCUMENTADO') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          DOCUMENTADO
        </span>
      )
    }
    if (est.includes('PENDIENTE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700">
          <Clock className="w-3 h-3" />
          {est}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
        <AlertTriangle className="w-3 h-3" />
        {est}
      </span>
    )
  }

  const ecusFiltradas = ecus.filter((e) => {
    const estUpper = (e.estado || '').toUpperCase()
    if (filtroEstado === 'documentados' && estUpper.includes('PENDIENTE')) return false
    if (filtroEstado === 'pendientes' && !estUpper.includes('PENDIENTE')) return false

    const q = busqueda.trim().toLowerCase()
    if (!q) return true

    const textoTablas = JSON.stringify(e.tablas || []).toLowerCase()
    const textoNotas = JSON.stringify(e.notas || []).toLowerCase()

    return (
      (e.nombre || '').toLowerCase().includes(q) ||
      (e.subtitulo || '').toLowerCase().includes(q) ||
      (e.referencia_parte || '').toLowerCase().includes(q) ||
      (e.intro || '').toLowerCase().includes(q) ||
      textoTablas.includes(q) ||
      textoNotas.includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Regla global anti-impresión */}
      <style>{`
        @media print {
          body * {
            display: none !important;
            visibility: hidden !important;
          }
          body::before {
            content: "CONTENIDO CONFIDENCIAL DE TCP AUTOMOTIVE SERVICES — IMPRESIÓN Y EXPORTACIÓN PDF DESHABILITADAS";
            display: block !important;
            visibility: visible !important;
            font-family: sans-serif;
            font-size: 18px;
            font-weight: bold;
            padding: 40px;
            text-align: center;
          }
        }
      `}</style>

      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1B2A]">
            Librería Técnica de ECUs y Pinouts
          </h2>
          <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-[#0A84FF]" />
            <span>
              Consulta exclusiva dentro del sistema • Marca de agua activa: <strong>{marcaAguaCompleta}</strong>
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {puedeGestionarLibreria && (
            <>
              <input
                ref={inputCarpetaRef}
                type="file"
                webkitdirectory="true"
                directory="true"
                multiple
                onChange={handleImportarCarpeta}
                className="hidden"
              />
              <button
                onClick={() => inputCarpetaRef.current?.click()}
                disabled={importando}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-[#0D1B2A] border border-slate-300 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
              >
                {importando ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#0A84FF]" />
                ) : (
                  <Upload className="w-4 h-4 text-[#0A84FF]" />
                )}
                {importando ? progresoImport : 'Importar carpeta "content"'}
              </button>

              <button
                onClick={abrirModalCrear}
                className="px-4 py-2 bg-[#0A84FF] hover:bg-blue-600 text-white text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nueva Ficha ECU
              </button>
            </>
          )}
        </div>
      </div>

      {/* Buscador global y filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por vehículo, N° de parte, microcontrolador, conector o señal (Ej: Frontier, CAN-H, ME17.5.6, 37820, GPT0)..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0A84FF]"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg self-start">
          <button
            onClick={() => setFiltroEstado('todas')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
              filtroEstado === 'todas' ? 'bg-white text-[#0D1B2A] shadow-sm' : 'text-slate-600'
            }`}
          >
            Todas ({ecus.length})
          </button>
          <button
            onClick={() => setFiltroEstado('documentados')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
              filtroEstado === 'documentados'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            Documentadas (
            {ecus.filter((e) => !(e.estado || '').toUpperCase().includes('PENDIENTE')).length})
          </button>
          <button
            onClick={() => setFiltroEstado('pendientes')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
              filtroEstado === 'pendientes'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            Pendientes (
            {ecus.filter((e) => (e.estado || '').toUpperCase().includes('PENDIENTE')).length})
          </button>
        </div>
      </div>

      {/* Catálogo de Tarjetas */}
      {loading ? (
        <div className="py-12 text-center text-slate-500">Cargando librería técnica...</div>
      ) : ecusFiltradas.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl space-y-2">
          <p className="text-slate-600 font-semibold">
            No se encontraron módulos con ese criterio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ecusFiltradas.map((ecu) => {
            const totalTablas = Array.isArray(ecu.tablas) ? ecu.tablas.length : 0
            const totalImagenes = Array.isArray(ecu.imagenes) ? ecu.imagenes.length : 0

            return (
              <div
                key={ecu.id}
                className="border border-slate-200 rounded-xl p-4 bg-white hover:border-[#0A84FF] hover:shadow-md transition flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    {getBadgeEstado(ecu.estado)}
                    <Cpu className="w-4 h-4 text-[#0A84FF] shrink-0" />
                  </div>

                  <div>
                    <h3 className="font-bold text-base text-[#0D1B2A]">{ecu.nombre}</h3>
                    {ecu.subtitulo && (
                      <p className="text-xs font-medium text-[#0A84FF]">{ecu.subtitulo}</p>
                    )}
                  </div>

                  {ecu.referencia_parte && (
                    <p className="text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <strong>Ref:</strong> {ecu.referencia_parte}
                    </p>
                  )}

                  {ecu.intro && (
                    <p className="text-xs text-slate-500 line-clamp-3">{ecu.intro}</p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
                    <span className="flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                      {totalImagenes}
                    </span>
                    <span className="flex items-center gap-1">
                      <TableIcon className="w-3.5 h-3.5 text-slate-400" />
                      {totalTablas}
                    </span>
                    {ecu.pdf_url && (
                      <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-bold">
                        PDF
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {puedeGestionarLibreria && (
                      <button
                        onClick={() => abrirModalEditar(ecu)}
                        title="Editar ficha"
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-800 hover:text-white text-slate-600 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {rol === 'admin' && (
                      <button
                        onClick={() => eliminarFichaEcu(ecu)}
                        title="Eliminar ficha"
                        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-600 hover:text-white text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setFiltroTablaInterna('')
                        setPantallaBloqueada(false)
                        setEcuSeleccionada(ecu)
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#0D1B2A] hover:bg-[#0A84FF] text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Consultar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL DETALLE COMPLETO DE ECU (SOLO VISUALIZACIÓN PROTEGIDA) */}
      {ecuSeleccionada && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          className="fixed inset-0 bg-black/75 flex items-center justify-center p-3 sm:p-5 z-50 overflow-y-auto select-none"
        >
          <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl my-6 max-h-[92vh] flex flex-col overflow-hidden relative">
            {/* ESCUDO NEGRO ANTI-CAPTURA CUANDO SE PIERDE EL FOCO O SE USA RECORTES */}
            {pantallaBloqueada && (
              <div
                onClick={() => setPantallaBloqueada(false)}
                className="absolute inset-0 bg-[#0D1B2A] z-50 flex flex-col items-center justify-center p-6 text-center text-white cursor-pointer"
              >
                <Lock className="w-12 h-12 text-[#0A84FF] mb-3" />
                <h4 className="text-lg font-bold">
                  Visualización Protegida — TCP Automotive Services
                </h4>
                <p className="text-xs text-slate-300 max-w-md mt-1">
                  El contenido técnico se ocultó automáticamente al detectar pérdida de foco o intento de captura de pantalla. Haz clic aquí para continuar consultando.
                </p>
              </div>
            )}

            {/* Header oscuro corporativo */}
            <div className="bg-[#0D1B2A] text-white px-6 py-4 flex items-start justify-between gap-4 border-b-4 border-[#0A84FF]">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {getBadgeEstado(ecuSeleccionada.estado)}
                  <span className="text-[11px] font-mono text-sky-300 bg-white/10 px-2 py-0.5 rounded">
                    {marcaAguaCompleta}
                  </span>
                </div>
                <h3 className="text-xl font-bold">{ecuSeleccionada.nombre}</h3>
                {ecuSeleccionada.subtitulo && (
                  <p className="text-sm text-sky-300">{ecuSeleccionada.subtitulo}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {ecuSeleccionada.pdf_url && (
                  <button
                    onClick={() => setPdfVisorUrl(ecuSeleccionada.pdf_url)}
                    className="px-3 py-1.5 bg-[#0A84FF] hover:bg-blue-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    Ver Diagrama PDF (Solo lectura)
                  </button>
                )}
                <button
                  onClick={() => setEcuSeleccionada(null)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Cuerpo Scrolleable */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm relative">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                {ecuSeleccionada.referencia_parte && (
                  <p className="text-xs font-bold text-[#0D1B2A]">
                    Referencia / N° de Parte:{' '}
                    <span className="font-normal text-slate-700">
                      {ecuSeleccionada.referencia_parte}
                    </span>
                  </p>
                )}
                {ecuSeleccionada.intro && (
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {ecuSeleccionada.intro}
                  </p>
                )}
                {ecuSeleccionada.fuente && (
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                    <strong>Fuente documental:</strong> {ecuSeleccionada.fuente}
                  </p>
                )}
              </div>

              {Array.isArray(ecuSeleccionada.notas) && ecuSeleccionada.notas.length > 0 && (
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    <span>Precauciones Técnicas y Cotejo Físico:</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-amber-900 space-y-1">
                    {ecuSeleccionada.notas.map((nota, idx) => (
                      <li key={idx}>{nota}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Galería de Conectores Renderizada en Canvas con Marca de Agua Legible y Sutil */}
              {Array.isArray(ecuSeleccionada.imagenes) &&
                ecuSeleccionada.imagenes.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-sm text-[#0D1B2A]">
                      Vistas de Conectores y Diagramas de Conexión (Visualización Protegida):
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {ecuSeleccionada.imagenes.map((img, i) => (
                        <div
                          key={i}
                          className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm"
                        >
                          <div
                            onClick={() => setImagenAmpliada(img)}
                            className="relative cursor-zoom-in group overflow-hidden"
                          >
                            <ImagenProtegidaCanvas
                              src={img.url}
                              alt={img.caption}
                              lineaEmpresa={lineaEmpresa}
                              lineaUsuario={lineaUsuario}
                              maxHeightClass="max-h-72"
                            />
                            <span className="absolute bottom-2 right-2 bg-[#0D1B2A]/85 text-white text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                              <ZoomIn className="w-3.5 h-3.5" />
                              Ampliar
                            </span>
                          </div>
                          {img.caption && (
                            <p className="p-2.5 text-xs text-slate-600 bg-slate-50 border-t">
                              {img.caption}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Tablas de Pines / Cavidades con marca de agua sutil sobre la tabla */}
              {Array.isArray(ecuSeleccionada.tablas) && ecuSeleccionada.tablas.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="font-bold text-sm text-[#0D1B2A]">
                      Asignación de Cavidades y Señales:
                    </h4>
                    <div className="relative w-full sm:w-72">
                      <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        value={filtroTablaInterna}
                        onChange={(e) => setFiltroTablaInterna(e.target.value)}
                        placeholder="Filtrar pin, señal o color..."
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs select-text"
                      />
                    </div>
                  </div>

                  {ecuSeleccionada.tablas.map((tabla, tIdx) => {
                    const qPin = filtroTablaInterna.trim().toLowerCase()
                    const filasFiltradas = (tabla.rows || []).filter((fila) =>
                      !qPin
                        ? true
                        : fila.some((celda) => String(celda).toLowerCase().includes(qPin))
                    )

                    return (
                      <div
                        key={tIdx}
                        className="relative overflow-x-auto border border-slate-200 rounded-xl"
                      >
                        {/* Marca de agua sutil superpuesta sobre la tabla de pines */}
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-around overflow-hidden opacity-10 -rotate-12 z-10">
                          <div className="text-center">
                            <p className="text-xs font-black tracking-widest text-[#0D1B2A]">
                              {lineaEmpresa}
                            </p>
                            <p className="text-[11px] font-bold text-[#0A84FF]">{lineaUsuario}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-black tracking-widest text-[#0D1B2A]">
                              {lineaEmpresa}
                            </p>
                            <p className="text-[11px] font-bold text-[#0A84FF]">{lineaUsuario}</p>
                          </div>
                        </div>

                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#0D1B2A] text-white border-b-2 border-[#0A84FF]">
                              {(tabla.headers || []).map((h, hIdx) => (
                                <th key={hIdx} className="py-2.5 px-3 font-bold">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filasFiltradas.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={(tabla.headers || []).length || 2}
                                  className="py-4 px-3 text-center text-slate-400"
                                >
                                  Sin coincidencias en esta tabla.
                                </td>
                              </tr>
                            ) : (
                              filasFiltradas.map((fila, rIdx) => (
                                <tr
                                  key={rIdx}
                                  className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                                >
                                  {fila.map((celda, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className={`py-2 px-3 border-b border-slate-100 ${
                                        cIdx === 0
                                          ? 'font-mono font-bold text-[#0D1B2A]'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      {celda}
                                    </td>
                                  ))}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL ZOOM DE IMAGEN EN CANVAS PROTEGIDO */}
      {imagenAmpliada && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => setImagenAmpliada(null)}
          className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[60] select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-4xl w-full p-4 space-y-3 relative overflow-hidden"
          >
            {pantallaBloqueada && (
              <div
                onClick={() => setPantallaBloqueada(false)}
                className="absolute inset-0 bg-[#0D1B2A] z-50 flex flex-col items-center justify-center p-6 text-center text-white cursor-pointer"
              >
                <Lock className="w-10 h-10 text-[#0A84FF] mb-2" />
                <p className="font-bold text-sm">Contenido protegido. Haz clic para volver.</p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[#0D1B2A]">{imagenAmpliada.caption}</p>
              <button
                onClick={() => setImagenAmpliada(null)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ImagenProtegidaCanvas
              src={imagenAmpliada.url}
              alt={imagenAmpliada.caption}
              lineaEmpresa={lineaEmpresa}
              lineaUsuario={lineaUsuario}
              maxHeightClass="max-h-[75vh]"
            />
          </div>
        </div>
      )}

      {/* MODAL VISOR DE DIAGRAMA PDF (SOLO LECTURA SIN BARRA NI DESCARGA) */}
      {pdfVisorUrl && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[60] select-none"
        >
          <div className="bg-white rounded-2xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden relative">
            {pantallaBloqueada && (
              <div
                onClick={() => setPantallaBloqueada(false)}
                className="absolute inset-0 bg-[#0D1B2A] z-50 flex flex-col items-center justify-center p-6 text-center text-white cursor-pointer"
              >
                <Lock className="w-10 h-10 text-[#0A84FF] mb-2" />
                <p className="font-bold text-sm">
                  Diagrama PDF protegido. Haz clic para continuar visualizando.
                </p>
              </div>
            )}

            <div className="bg-[#0D1B2A] text-white px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#0A84FF]" />
                <span className="text-xs sm:text-sm font-bold">
                  Visor Solo Lectura — {marcaAguaCompleta}
                </span>
              </div>
              <button
                onClick={() => setPdfVisorUrl(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative flex-1 bg-slate-800 overflow-hidden">
              <iframe
                src={`${pdfVisorUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                title="Diagrama ECU Solo Lectura"
                className="w-full h-full border-0"
              />
              {/* Malla de marcas de agua sutiles sobre todo el visor PDF */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-2 gap-12 place-items-center p-10 opacity-15 -rotate-12">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className="bg-white/60 px-3 py-1.5 rounded-lg text-center"
                  >
                    <p className="text-xs font-black tracking-wider text-[#0D1B2A]">
                      {lineaEmpresa}
                    </p>
                    <p className="text-[11px] font-bold text-[#0A84FF]">{lineaUsuario}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR FICHA DE ECU */}
      {modalForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-bold text-lg text-[#0D1B2A]">
                {editandoId ? 'Actualizar Ficha Técnica de ECU' : 'Registrar Nueva ECU en Librería'}
              </h3>
              <button
                onClick={() => setModalForm(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarFichaEcu} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Vehículo / Familia ECU *
                  </label>
                  <input
                    required
                    value={formEcu.nombre}
                    onChange={(e) => setFormEcu({ ...formEcu, nombre: e.target.value })}
                    placeholder="Ej. Toyota Corolla 2020"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Estado de Documentación *
                  </label>
                  <select
                    value={formEcu.estado}
                    onChange={(e) => setFormEcu({ ...formEcu, estado: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="DOCUMENTADO">DOCUMENTADO</option>
                    <option value="DOCUMENTADO / APLICACIÓN POR COTEJAR">
                      DOCUMENTADO / APLICACIÓN POR COTEJAR
                    </option>
                    <option value="PINOUT PENDIENTE">PINOUT PENDIENTE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Motor / Microcontrolador / Conectores
                  </label>
                  <input
                    value={formEcu.subtitulo}
                    onChange={(e) => setFormEcu({ ...formEcu, subtitulo: e.target.value })}
                    placeholder="Ej. 2ZR-FE 1.8 L · Denso · TC1797"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    N° de Parte / Referencia
                  </label>
                  <input
                    value={formEcu.referencia_parte}
                    onChange={(e) =>
                      setFormEcu({ ...formEcu, referencia_parte: e.target.value })
                    }
                    placeholder="Ej. 89661-12Y80"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Descripción Técnica y Procedimiento
                </label>
                <textarea
                  rows="2"
                  value={formEcu.intro}
                  onChange={(e) => setFormEcu({ ...formEcu, intro: e.target.value })}
                  placeholder="Detalles sobre lectura en banco, modo Boot/Bench, orientación del conector..."
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tabla Rápida de Pines (1 por línea: <code className="text-xs">Conector/Pin | Función | Color</code>)
                </label>
                <textarea
                  rows="4"
                  value={formEcu.pinesTexto}
                  onChange={(e) => setFormEcu({ ...formEcu, pinesTexto: e.target.value })}
                  placeholder={`A / 1 | +12V Batería (B+) | Rojo\nA / 2 | GND Masa | Negro\nB / 14 | CAN-H | Blanco`}
                  className="w-full px-3 py-2 border rounded-lg font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Notas y Advertencias Técnicas (1 por línea)
                </label>
                <textarea
                  rows="2"
                  value={formEcu.notasTexto}
                  onChange={(e) => setFormEcu({ ...formEcu, notasTexto: e.target.value })}
                  placeholder="Ej. Verificar alimentación +12V antes de energizar en banco."
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex flex-col justify-between gap-2">
                  <span className="text-xs font-bold text-[#0D1B2A]">
                    Imágenes de Pinout / Conectores
                  </span>
                  <label className="w-full px-3.5 py-2.5 bg-white hover:bg-blue-50 text-[#0A84FF] border-2 border-dashed border-[#0A84FF] rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition">
                    <ImageIcon className="w-4 h-4 shrink-0" />
                    <span>
                      {nuevasImagenesFiles.length > 0
                        ? `${nuevasImagenesFiles.length} imagen(es) seleccionada(s)`
                        : '+ Agregar Imágenes Pinout'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => setNuevasImagenesFiles(Array.from(e.target.files || []))}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex flex-col justify-between gap-2">
                  <span className="text-xs font-bold text-[#0D1B2A]">
                    Diagrama / Esquemático PDF
                  </span>
                  <label className="w-full px-3.5 py-2.5 bg-white hover:bg-slate-100 text-[#0D1B2A] border-2 border-dashed border-slate-400 hover:border-[#0D1B2A] rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition">
                    <FileText className="w-4 h-4 text-red-600 shrink-0" />
                    <span className="truncate">
                      {nuevoPdfFile ? nuevoPdfFile.name : '+ Adjuntar Diagrama PDF'}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setNuevoPdfFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalForm(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-6 py-2 bg-[#0A84FF] text-white font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
                >
                  {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar Ficha ECU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}