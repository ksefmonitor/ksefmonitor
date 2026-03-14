import Store from 'electron-store'
import { AppConfig, DEFAULT_CONFIG, extractNipFromToken } from '../shared/types'

const store = new Store<{ config: AppConfig; lastCheckDate: string }>({
  defaults: {
    config: DEFAULT_CONFIG,
    lastCheckDate: new Date().toISOString()
  }
})

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
    store.set('config', config)
  }
  // Ensure companies array exists
  if (!config.companies) {
    config.companies = []
    config.activeCompanyIndex = 0
  }
  return config
}

export function getConfig(): AppConfig {
  const config = store.get('config')
  return migrateConfig(config)
}

export function saveConfig(config: AppConfig): void {
  store.set('config', config)
}

export function getLastCheckDate(): string {
  return store.get('lastCheckDate')
}

export function setLastCheckDate(date: string): void {
  store.set('lastCheckDate', date)
}

export { store }
