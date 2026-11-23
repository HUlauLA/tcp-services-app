import { supabase } from './supabase'

export async function importarCarpetaContentALibreria(archivosFileList, onProgreso) {
  const archivos = Array.from(archivosFileList || [])
  if (archivos.length === 0) {
    throw new Error('No se seleccionaron archivos.')
  }

  // Buscar datos-tecnicos.json dentro de la carpeta seleccionada
  const jsonFile = archivos.find((f) => f.name.toLowerCase() === 'datos-tecnicos.json')
  if (!jsonFile) {
    throw new Error(
      'No se encontró el archivo datos-tecnicos.json dentro de la carpeta seleccionada. Asegúrate de seleccionar la carpeta "content".'
    )
  }

  const textoJson = await jsonFile.text()
  const datos = JSON.parse(textoJson)

  // Mapa por nombre de archivo en minúsculas para encontrar rápido imágenes y PDFs
  const mapaArchivos = new Map()
  for (const f of archivos) {
    mapaArchivos.set(f.name.toLowerCase(), f)
  }

  const subirArchivoSiExiste = async (rutaRelativa, carpetaDestino) => {
    if (!rutaRelativa) return null
    const nombreBase = rutaRelativa.split('/').pop().toLowerCase()
    const archivoLocal = mapaArchivos.get(nombreBase)
    if (!archivoLocal) return null

    const pathStorage = `${carpetaDestino}/${archivoLocal.name}`
    const { error } = await supabase.storage
      .from('libreria-ecus')
      .upload(pathStorage, archivoLocal, { upsert: true })

    if (error) {
      console.warn('No se pudo subir:', archivoLocal.name, error.message)
      return null
    }

    const { data } = supabase.storage.from('libreria-ecus').getPublicUrl(pathStorage)
    return data.publicUrl
  }

  const catalog = Array.isArray(datos.catalog) ? datos.catalog : []
  const pending = Array.isArray(datos.pending) ? datos.pending : []
  const totalItems = catalog.length + pending.length
  let procesados = 0

  // 1. Importar las 6 ECUs documentadas con sus imágenes, PDFs y tablas de pines
  for (const item of catalog) {
    procesados++
    onProgreso?.(`Importando (${procesados}/${totalItems}): ${item.name}...`)

    const pdfUrl = await subirArchivoSiExiste(item.pdf, 'diagramas')

    const imagenesSubidas = []
    for (const pic of item.pictures || []) {
      const urlPrincipal = await subirArchivoSiExiste(pic.asset, 'imagenes')
      const urlTerminal = await subirArchivoSiExiste(pic.terminal_asset, 'imagenes')
      const urlHarness = await subirArchivoSiExiste(pic.harness_asset, 'imagenes')

      if (urlPrincipal || urlTerminal || urlHarness) {
        imagenesSubidas.push({
          caption: pic.caption || '',
          url: urlPrincipal || urlTerminal || urlHarness,
          terminal_url: urlTerminal || null,
          harness_url: urlHarness || null,
        })
      }
    }

    const registro = {
      slug: item.id,
      nombre: item.name,
      subtitulo: item.subtitle || '',
      estado: item.status || 'DOCUMENTADO',
      referencia_parte: item.ref || '',
      intro: item.intro || '',
      fuente: item.source || '',
      pdf_url: pdfUrl,
      imagenes: imagenesSubidas,
      tablas: item.tables || [],
      notas: item.notes || [],
      creado_por: 'Importación Magic Key → TCP',
    }

    const { error } = await supabase
      .from('libreria_ecus')
      .upsert(registro, { onConflict: 'slug' })

    if (error) throw error
  }

  // 2. Importar las 9 referencias pendientes para irlas completando en el laboratorio
  for (let i = 0; i < pending.length; i++) {
    const [nombreVehiculo, refModulo, observacion] = pending[i]
    procesados++
    onProgreso?.(`Importando (${procesados}/${totalItems}): ${nombreVehiculo}...`)

    const slug = `pendiente-${i + 1}-${nombreVehiculo
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')}`

    const registroPendiente = {
      slug,
      nombre: nombreVehiculo,
      subtitulo: refModulo || 'Referencia en estudio',
      estado: 'PINOUT PENDIENTE',
      referencia_parte: refModulo || '',
      intro: observacion || 'Pinout, conectores y diagrama exacto pendientes de cotejo.',
      fuente: 'Registro inicial de laboratorio',
      pdf_url: null,
      imagenes: [],
      tablas: [],
      notas: observacion ? [observacion] : [],
      creado_por: 'Importación Magic Key → TCP',
    }

    const { error } = await supabase
      .from('libreria_ecus')
      .upsert(registroPendiente, { onConflict: 'slug' })

    if (error) throw error
  }

  return totalItems
}