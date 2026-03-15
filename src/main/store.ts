import Store from 'electron-store'
import { AppConfig, DEFAULT_CONFIG, extractNipFromToken } from '../shared/types'
import { encryptString, decryptString } from './crypto'

const store = new Store<{ config: AppConfig; lastCheckDate: string; appPin: string }>({
  name: 'config',
  defaults: {
    config: DEFAULT_CONFIG,
    lastCheckDate: new Date().toISOString(),
    appPin: ''
  }
})
function getStore() { return store }

// Migrate old config with single token/nip to new companies format
function migrateConfig(config: AppConfig): AppConfig {
  if (config.token && !config.companies?.length) {
    const nip = config.nip || extractNipFromToken(config.token)
    config.companies = [
      {
        name: nip ? `Firma (${nip})` : 'Firma domyślna',
        token: config.token,
        nip
      }
    ]
    config.activeCompanyIndex = 0
    delete config.token
    delete config.nip
    getStore().set('config', config)
  }
  if (!config.companies) {
    config.companies = []
    config.activeCompanyIndex = 0
  }
  if (!config.integrations) {
    config.integrations = []
  }
  return config
}

/** Decrypt all sensitive fields before returning config to renderer */
function decryptConfig(config: AppConfig): AppConfig {
  const decrypted = { ...config }

  // Decrypt company secrets
  decrypted.companies = config.companies.map(c => ({
    ...c,
    token: c.token ? decryptString(c.token) : '',
    keyPassword: c.keyPassword ? decryptString(c.keyPassword) : ''
  }))

  // Decrypt integration passwords
  decrypted.integrations = (config.integrations || []).map(i => {
    const settings = { ...i.settings }
    if (settings.password) settings.password = decryptString(settings.password)
    if (settings.secret) settings.secret = decryptString(settings.secret)
    return { ...i, settings }
  })

  return decrypted
}

/** Encrypt sensitive fields before saving config */
function encryptConfig(config: AppConfig): AppConfig {
  const encrypted = { ...config }

  // Encrypt company secrets
  encrypted.companies = config.companies.map(c => ({
    ...c,
    token: c.token ? encryptString(c.token) : '',
    keyPassword: c.keyPassword ? encryptString(c.keyPassword) : ''
  }))

  // Encrypt integration passwords
  encrypted.integrations = (config.integrations || []).map(i => {
    const settings = { ...i.settings }
    if (settings.password) settings.password = encryptString(settings.password)
    if (settings.secret) settings.secret = encryptString(settings.secret)
    return { ...i, settings }
  })

  return encrypted
}

export function getConfig(): AppConfig {
  const raw = getStore().get('config')
  const migrated = migrateConfig(raw)
  return decryptConfig(migrated)
}

/** Returns config with encrypted tokens for internal use (ksef-api needs decrypted token) */
export function getRawConfig(): AppConfig {
  const raw = getStore().get('config')
  return migrateConfig(raw)
}

export function saveConfig(config: AppConfig): void {
  store.set('config', encryptConfig(config))
}

export function getLastCheckDate(): string {
  return getStore().get('lastCheckDate')
}

export function setLastCheckDate(date: string): void {
  getStore().set('lastCheckDate', date)
}

// PIN management
export function getAppPin(): string {
  const pin = getStore().get('appPin')
  return pin ? decryptString(pin) : ''
}

export function setAppPin(pin: string): void {
  getStore().set('appPin', pin ? encryptString(pin) : '')
}

export function hasAppPin(): boolean {
  return !!getStore().get('appPin')
}

export function verifyAppPin(input: string): boolean {
  const stored = getAppPin()
  return stored === input
}

export { getStore as store }
