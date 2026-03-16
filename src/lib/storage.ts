import type { IStorage } from './storage/types.js'
import { localStorage } from './storage/local.js'
import { r2Storage } from './storage/r2.js'

const type = process.env.FILE_STORAGE_TYPE ?? 'local'

export const storage: IStorage = type === 'r2' ? r2Storage : localStorage
