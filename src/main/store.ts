import Store from 'electron-store'
import { AppConfig, DEFAULT_CONFIG } from '../shared/types'

const store = new Store<{ config: AppConfig; lastCheckDate: string }>({
  defaults: {
    config: DEFAULT_CONFIG,
    lastCheckDate: new Date().toISOString()
  }
})

export function getConfig(): AppConfig {
  return store.get('config')
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
