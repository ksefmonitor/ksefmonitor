import { safeStorage } from 'electron'
import * as crypto from 'crypto'

const ENCRYPTED_PREFIX = 'enc::' // marker for encrypted values

// ─── String encryption (for config values) ─────────────────────────────────

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

// ─── Buffer encryption (for database file) ─────────────────────────────────
// Uses AES-256-GCM with a key derived from safeStorage-encrypted secret

const DB_MAGIC = Buffer.from('KSEFDB01') // 8-byte header to identify encrypted DB files
const ALGORITHM = 'aes-256-gcm'

/** Get or create a persistent encryption key using safeStorage */
function getDbEncryptionKey(): Buffer {
  // We encrypt a fixed string with safeStorage — the result is deterministic
  // per OS user account, so the key stays the same across restarts
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available')
  }
  const raw = safeStorage.encryptString('ksef-monitor-db-encryption-key-v1')
  // Derive a 32-byte key from the safeStorage output
  return crypto.createHash('sha256').update(raw).digest()
}

export function encryptBuffer(data: Buffer): Buffer {
  try {
    const key = getDbEncryptionKey()
    const iv = crypto.randomBytes(12) // 96-bit IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
    const authTag = cipher.getAuthTag() // 16 bytes

    // Format: MAGIC(8) + IV(12) + AUTH_TAG(16) + ENCRYPTED_DATA
    return Buffer.concat([DB_MAGIC, iv, authTag, encrypted])
  } catch {
    // If encryption fails, return raw data
    return data
  }
}

export function decryptBuffer(data: Buffer): Buffer {
  // Check if data starts with our magic header
  if (data.length < 36 || !data.subarray(0, 8).equals(DB_MAGIC)) {
    // Not encrypted (legacy file) — return as-is
    return data
  }

  try {
    const key = getDbEncryptionKey()
    const iv = data.subarray(8, 20)
    const authTag = data.subarray(20, 36)
    const encrypted = data.subarray(36)

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()])
  } catch {
    // Decryption failed — might be a legacy unencrypted file
    return data
  }
}

export function isEncryptedBuffer(data: Buffer): boolean {
  return data.length >= 8 && data.subarray(0, 8).equals(DB_MAGIC)
}
