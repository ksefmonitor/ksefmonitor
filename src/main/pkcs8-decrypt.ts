/**
 * Pure Node.js PKCS#8 encrypted private key decryptor.
 * Handles PBES2 (PBKDF2 + AES-CBC) without requiring OpenSSL CLI.
 * Electron's BoringSSL doesn't support all PBE algorithms,
 * so we do it manually using Node.js crypto primitives.
 */
import * as crypto from 'crypto'

// OID constants
const OID_PBES2 = '1.2.840.113549.1.5.13'
const OID_PBKDF2 = '1.2.840.113549.1.5.12'

const OID_AES_CBC: Record<string, { keyLen: number; name: string }> = {
  '2.16.840.1.101.3.4.1.2': { keyLen: 16, name: 'aes-128-cbc' },
  '2.16.840.1.101.3.4.1.22': { keyLen: 24, name: 'aes-192-cbc' },
  '2.16.840.1.101.3.4.1.42': { keyLen: 32, name: 'aes-256-cbc' }
}

const OID_HMAC: Record<string, string> = {
  '1.2.840.113549.2.7': 'sha1',
  '1.2.840.113549.2.9': 'sha256',
  '1.2.840.113549.2.10': 'sha384',
  '1.2.840.113549.2.11': 'sha512'
}

// ─── Minimal ASN.1 DER parser ─────────────────────────────────────────────

interface Asn1Node {
  tag: number
  data: Buffer
  children?: Asn1Node[]
}

function parseAsn1(buf: Buffer, offset = 0): { node: Asn1Node; nextOffset: number } {
  const tag = buf[offset]
  let len = buf[offset + 1]
  let dataStart = offset + 2

  if (len & 0x80) {
    const lenBytes = len & 0x7f
    len = 0
    for (let i = 0; i < lenBytes; i++) {
      len = (len << 8) | buf[offset + 2 + i]
    }
    dataStart = offset + 2 + lenBytes
  }

  const data = buf.subarray(dataStart, dataStart + len)
  const node: Asn1Node = { tag, data }

  // Parse children for SEQUENCE and context-specific constructed tags
  if (tag === 0x30 || tag === 0x31 || (tag & 0xa0) === 0xa0) {
    node.children = []
    let childOffset = 0
    while (childOffset < data.length) {
      const { node: child, nextOffset } = parseAsn1(data, childOffset)
      node.children.push(child)
      childOffset = nextOffset
    }
  }

  return { node, nextOffset: dataStart + len }
}

function parseOid(data: Buffer): string {
  const parts: number[] = []
  parts.push(Math.floor(data[0] / 40))
  parts.push(data[0] % 40)

  let value = 0
  for (let i = 1; i < data.length; i++) {
    value = (value << 7) | (data[i] & 0x7f)
    if (!(data[i] & 0x80)) {
      parts.push(value)
      value = 0
    }
  }
  return parts.join('.')
}

function parseInt32(data: Buffer): number {
  let val = 0
  for (let i = 0; i < data.length; i++) {
    val = (val << 8) | data[i]
  }
  return val
}

// ─── PKCS#8 Decryption ────────────────────────────────────────────────────

export function decryptPkcs8(pemContent: string, password: string): string {
  // Extract base64 content
  const lines = pemContent.split('\n')
    .filter(l => !l.startsWith('-----') && l.trim())
  const der = Buffer.from(lines.join(''), 'base64')

  // Parse top-level SEQUENCE
  const { node: root } = parseAsn1(der)
  if (!root.children || root.children.length < 2) {
    throw new Error('Invalid PKCS#8 structure')
  }

  // root.children[0] = EncryptionAlgorithm SEQUENCE
  // root.children[1] = EncryptedData OCTET STRING
  const algoSeq = root.children[0]
  const encryptedData = root.children[1].data

  if (!algoSeq.children || algoSeq.children.length < 2) {
    throw new Error('Invalid encryption algorithm structure')
  }

  const algoOid = parseOid(algoSeq.children[0].data)

  if (algoOid !== OID_PBES2) {
    throw new Error(`Unsupported encryption algorithm: ${algoOid} (only PBES2 supported)`)
  }

  // Parse PBES2 parameters
  const pbes2Params = algoSeq.children[1]
  if (!pbes2Params.children || pbes2Params.children.length < 2) {
    throw new Error('Invalid PBES2 parameters')
  }

  // KDF parameters (PBKDF2)
  const kdfSeq = pbes2Params.children[0]
  if (!kdfSeq.children) throw new Error('Invalid KDF sequence')

  const kdfOid = parseOid(kdfSeq.children[0].data)
  if (kdfOid !== OID_PBKDF2) {
    throw new Error(`Unsupported KDF: ${kdfOid} (only PBKDF2 supported)`)
  }

  const kdfParams = kdfSeq.children[1]
  if (!kdfParams.children) throw new Error('Invalid PBKDF2 params')

  const salt = kdfParams.children[0].data
  const iterations = parseInt32(kdfParams.children[1].data)

  // Determine HMAC hash (default sha1, or explicit)
  let hmacHash = 'sha1'
  if (kdfParams.children.length > 2) {
    // Check if there's a key length field (INTEGER) before the PRF
    for (const child of kdfParams.children.slice(2)) {
      if (child.tag === 0x30 && child.children) {
        // This is the PRF AlgorithmIdentifier
        const prfOid = parseOid(child.children[0].data)
        hmacHash = OID_HMAC[prfOid] || 'sha256'
      }
    }
  }

  // Encryption algorithm (AES-CBC)
  const encSeq = pbes2Params.children[1]
  if (!encSeq.children) throw new Error('Invalid encryption algorithm params')

  const encOid = parseOid(encSeq.children[0].data)
  const aesInfo = OID_AES_CBC[encOid]
  if (!aesInfo) {
    throw new Error(`Unsupported encryption cipher: ${encOid}`)
  }

  const iv = encSeq.children[1].data

  // Derive key using PBKDF2
  const key = crypto.pbkdf2Sync(password, salt, iterations, aesInfo.keyLen, hmacHash)

  // Decrypt
  const decipher = crypto.createDecipheriv(aesInfo.name, key, iv)
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()])

  // Wrap in PEM
  const b64 = decrypted.toString('base64')
  const pemLines = b64.match(/.{1,64}/g)!.join('\n')
  return `-----BEGIN PRIVATE KEY-----\n${pemLines}\n-----END PRIVATE KEY-----`
}

export function isEncryptedPem(content: string): boolean {
  return content.includes('ENCRYPTED')
}
