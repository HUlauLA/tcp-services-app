import Dexie from 'dexie'

export const colaOffline = new Dexie('TCPOfflineDB')

colaOffline.version(1).stores({
  operaciones: '++id, fecha',
})

export default colaOffline