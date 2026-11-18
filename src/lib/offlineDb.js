import Dexie from 'dexie'

export const offlineDb = new Dexie('TCPServicesOfflineDB')

offlineDb.version(1).stores({
  catalogo_cache: 'id, sku, nombre',
  bodegas_cache: 'id, nombre',
  inventario_cache: '[producto_id+bodega_id], producto_id, bodega_id',
  movimientos_pendientes: '++local_id, timestamp, sincronizado',
})

// Guarda una copia actualizada del catálogo, bodegas y stock en el dispositivo
export async function actualizarCacheLocal(productos, bodegas, inventario) {
  await offlineDb.transaction(
    'rw',
    offlineDb.catalogo_cache,
    offlineDb.bodegas_cache,
    offlineDb.inventario_cache,
    async () => {
      await offlineDb.catalogo_cache.clear()
      await offlineDb.bodegas_cache.clear()
      await offlineDb.inventario_cache.clear()

      if (productos?.length) await offlineDb.catalogo_cache.bulkPut(productos)
      if (bodegas?.length) await offlineDb.bodegas_cache.bulkPut(bodegas)
      if (inventario?.length) await offlineDb.inventario_cache.bulkPut(inventario)
    }
  )
}

// Encola un movimiento cuando no hay internet
export async function encolarMovimientoOffline(movimiento) {
  return await offlineDb.movimientos_pendientes.add({
    ...movimiento,
    timestamp: new Date().toISOString(),
    sincronizado: 0,
  })
}