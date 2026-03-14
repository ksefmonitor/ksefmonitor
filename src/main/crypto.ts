import { safeStorage } from 'electron'

const ENCRYPTED_PREFIX = 'enc::' // marker for encrypted values

export function encryptString(value: string): string {
  if (!value || value.startsWith(ENCRYPTED_PREFIX)) return value
  if (!safeStorage.isEncryptionAvailable()) return value

  const encrypted = safeStorage.encryptString(value)
  return ENCRYPTED_PREFIX + encrypted.toString('base64')
}

export function decryptString(value: string): string {
  if (!value || !value.startsWith(ENCRYPTED_PREFIX)) return value
  if (!safeStorage.isEncryptionAvailable()) return value

  const base64 = value.slice(ENCRYPTED_PREFIX.length)
  const buffer = Buffer.from(base64, 'base64')
  return safeStorage.decryptString(buffer)
}

export function isEncrypted(value: string): boolean {
  return value?.startsWith(ENCRYPTED_PREFIX) || false
}
