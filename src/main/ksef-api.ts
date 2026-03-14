import { net } from 'electron'
import * as crypto from 'crypto'
import * as fs from 'fs'
import { decryptPkcs8 } from './pkcs8-decrypt'
import type {
  AppConfig,
  InvoiceQueryFilters,
  QueryInvoicesMetadataResponse
} from '../shared/types'

interface ChallengeResponse {
  challenge: string
  timestamp: string
  timestampMs: number
}

interface KsefTokenAuthResponse {
  referenceNumber: string
  authenticationToken: {
    token: string
    validUntil: string
  }
}

interface AuthStatusResponse {
  startDate: string
  authenticationMethod: string
  status: {
    code: number
    description: string
    details?: string[]
  }
}

interface TokenRedeemResponse {
  accessToken: {
    token: string
    validUntil: string
  }
  refreshToken: {
    token: string
    validUntil: string
  }
}

interface TokenRefreshResponse {
  accessToken: {
    token: string
    validUntil: string
  }
}

interface Logger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const defaultLog: Logger = {
  info: (...args: unknown[]) => console.log('[KSeF]', ...args),
  warn: (...args: unknown[]) => console.warn('[KSeF]', ...args),
  error: (...args: unknown[]) => console.error('[KSeF]', ...args)
}

export class KsefApiClient {
  private config: AppConfig
  private accessToken: string | null = null
  private accessTokenValidUntil: Date | null = null
  private refreshToken: string | null = null
  private refreshTokenValidUntil: Date | null = null
  private authInProgress: Promise<void> | null = null
  private log: Logger

  // Derived from active company
  private nip: string = ''
  private certPath: string = ''
  private keyPath: string = ''
  private keyPassword: string = ''

  constructor(config: AppConfig, log?: Logger) {
    this.config = config
    this.log = log || defaultLog
    this.extractActiveCompany()
  }

  private extractActiveCompany(): void {
    const company = this.config.companies?.[this.config.activeCompanyIndex]
    this.nip = company?.nip || ''
    this.certPath = company?.certPath || ''
    this.keyPath = company?.keyPath || ''
    this.keyPassword = company?.keyPassword || ''
  }

  updateConfig(config: AppConfig): void {
    this.config = config
    this.extractActiveCompany()
    // Reset auth state when config changes — forces re-authentication
    this.accessToken = null
    this.accessTokenValidUntil = null
    this.refreshToken = null
    this.refreshTokenValidUntil = null
    this.authInProgress = null
  }

  private get baseUrl(): string {
    return this.config.apiUrl.replace(/\/$/, '')
  }

  // ─── Low-level HTTP helper (no auth header injection) ──────────────────────

  private rawRequest<T>(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<{ statusCode: number; data: T; raw: string }> {
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers
    }

    return new Promise((resolve, reject) => {
      const request = net.request({ method, url })

      for (const [key, value] of Object.entries(requestHeaders)) {
        request.setHeader(key, value)
      }

      let responseData = ''

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          const statusCode = response.statusCode ?? 0
          try {
            const parsed = JSON.parse(responseData) as T
            resolve({ statusCode, data: parsed, raw: responseData })
          } catch {
            resolve({ statusCode, data: responseData as unknown as T, raw: responseData })
          }
        })

        response.on('error', (error) => {
          reject(error)
        })
      })

      request.on('error', (error) => {
        reject(error)
      })

      if (body) {
        request.write(JSON.stringify(body))
      }

      request.end()
    })
  }

  // ─── Authenticated request (ensures auth, injects Bearer token) ────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    await this.ensureAuthenticated()

    const url = `${this.baseUrl}${path}`
    const authHeaders: Record<string, string> = {
      ...headers,
      Authorization: `Bearer ${this.accessToken}`
    }

    const result = await this.rawRequest<T>(method, url, body, authHeaders)

    if (result.statusCode >= 200 && result.statusCode < 300) {
      return result.data
    }

    // Extract human-readable message from KSeF error response
    let message = `Błąd API KSeF (${result.statusCode})`
    try {
      const parsed = typeof result.data === 'object' ? result.data : JSON.parse(result.raw)
      const status = (parsed as any)?.status
      if (status?.description) message = status.description
      if (status?.details?.length) message += ': ' + status.details.join('; ')
    } catch { /* use default message */ }
    throw new Error(message)
  }

  // ─── Authentication flow ───────────────────────────────────────────────────

  private async ensureAuthenticated(): Promise<void> {
    // If there is already an auth flow in progress, wait for it
    if (this.authInProgress) {
      await this.authInProgress
      return
    }

    // If access token is still valid, nothing to do
    if (this.accessToken && this.accessTokenValidUntil) {
      const now = new Date()
      // Refresh 60 seconds before actual expiry to avoid race conditions
      if (now.getTime() < this.accessTokenValidUntil.getTime() - 60_000) {
        return
      }

      // Access token expired or about to expire — try refresh
      if (this.refreshToken && this.refreshTokenValidUntil) {
        if (now.getTime() < this.refreshTokenValidUntil.getTime() - 30_000) {
          this.authInProgress = this.refreshAccessToken()
            .finally(() => { this.authInProgress = null })
          await this.authInProgress
          return
        }
      }
    }

    // No valid tokens — do full auth
    if (!this.certPath || !this.keyPath || !this.nip) {
      throw new Error('Certyfikat, klucz prywatny i NIP muszą być skonfigurowane')
    }

    this.authInProgress = this.performFullAuth()
      .finally(() => { this.authInProgress = null })
    await this.authInProgress
  }

  /** Step 9: Refresh access token using refresh token */
  private async refreshAccessToken(): Promise<void> {
    this.log.info('Refreshing access token...')
    const url = `${this.baseUrl}/auth/token/refresh`
    const result = await this.rawRequest<TokenRefreshResponse>(
      'POST',
      url,
      { refreshToken: this.refreshToken },
      { Authorization: `Bearer ${this.accessToken}` }
    )

    if (result.statusCode < 200 || result.statusCode >= 300) {
      this.log.warn('Token refresh failed, performing full re-auth:', result.raw)
      // Clear state and fall through to full auth
      this.accessToken = null
      this.refreshToken = null
      await this.performFullAuth()
      return
    }

    this.accessToken = result.data.accessToken.token
    this.accessTokenValidUntil = new Date(result.data.accessToken.validUntil)
    this.log.info('Access token refreshed, valid until', this.accessTokenValidUntil.toISOString())
  }

  /** Full authentication flow using certificate (XAdES) */
  private async performFullAuth(): Promise<void> {
    this.log.info('Starting KSeF certificate authentication...')

    // Step 1: Get challenge
    const { challenge } = await this.fetchChallenge()

    // Step 2: Sign and submit with certificate
    const result = await this.authenticateWithCertificate(challenge, this.nip)
    const referenceNumber = result.referenceNumber
    const authToken = result.authenticationToken.token

    // Step 3: Poll until auth is processed
    await this.pollAuthStatus(referenceNumber, authToken)

    // Step 4: Redeem token
    const tokens = await this.redeemToken(authToken)

    // Step 5: Store tokens
    this.accessToken = tokens.accessToken.token
    this.accessTokenValidUntil = new Date(tokens.accessToken.validUntil)
    this.refreshToken = tokens.refreshToken.token
    this.refreshTokenValidUntil = new Date(tokens.refreshToken.validUntil)

    this.log.info(
      'Authentication complete. Access token valid until',
      this.accessTokenValidUntil.toISOString()
    )
  }

  /** Authenticate using XAdES-signed certificate */
  private async authenticateWithCertificate(
    challenge: string,
    nip: string
  ): Promise<KsefTokenAuthResponse> {
    this.log.info('Authenticating with certificate (XAdES)...')

    // Read certificate and key files
    if (!fs.existsSync(this.certPath)) {
      throw new Error(`Plik certyfikatu nie istnieje: ${this.certPath}`)
    }
    if (!fs.existsSync(this.keyPath)) {
      throw new Error(`Plik klucza prywatnego nie istnieje: ${this.keyPath}`)
    }
    // Read cert — handle both PEM and DER formats
    const certRaw = fs.readFileSync(this.certPath)
    let certPem: string
    if (certRaw.toString('utf-8').trim().startsWith('-----')) {
      certPem = certRaw.toString('utf-8')
    } else {
      // DER format — convert to PEM
      const b64 = certRaw.toString('base64')
      certPem = '-----BEGIN CERTIFICATE-----\n' +
        b64.match(/.{1,64}/g)!.join('\n') +
        '\n-----END CERTIFICATE-----'
    }

    // Build AuthTokenRequest XML
    const authTokenXml = `<?xml version="1.0" encoding="utf-8"?>
<AuthTokenRequest xmlns="http://ksef.mf.gov.pl/auth/token/2.0">
    <Challenge>${challenge}</Challenge>
    <ContextIdentifier>
        <Nip>${nip}</Nip>
    </ContextIdentifier>
    <SubjectIdentifierType>certificateSubject</SubjectIdentifierType>
</AuthTokenRequest>`

    // Sign with XAdES using the certificate and private key
    const signedXml = this.signXmlWithCertificate(authTokenXml, certPem, this.keyPassword)

    // Send signed XML to KSeF
    const url = `${this.baseUrl}/auth/xades-signature`
    const response = await new Promise<{ statusCode: number; data: KsefTokenAuthResponse; raw: string }>((resolve, reject) => {
      const request = net.request({ method: 'POST', url })
      request.setHeader('Content-Type', 'application/xml')
      request.setHeader('Accept', 'application/json')

      let responseData = ''
      request.on('response', (resp) => {
        resp.on('data', (chunk) => { responseData += chunk.toString() })
        resp.on('end', () => {
          const statusCode = resp.statusCode ?? 0
          try {
            resolve({ statusCode, data: JSON.parse(responseData), raw: responseData })
          } catch {
            resolve({ statusCode, data: responseData as any, raw: responseData })
          }
        })
        resp.on('error', reject)
      })
      request.on('error', reject)
      request.write(signedXml)
      request.end()
    })

    if (response.statusCode < 200 || response.statusCode >= 300) {
      let message = `Błąd autoryzacji certyfikatem (${response.statusCode})`
      try {
        const parsed = typeof response.data === 'object' ? response.data : JSON.parse(response.raw)
        const status = (parsed as any)?.status
        if (status?.description) message = status.description
        if (status?.details?.length) message += ': ' + status.details.join('; ')
      } catch { /* use default */ }
      throw new Error(message)
    }

    this.log.info('Certificate auth submitted, reference:', response.data.referenceNumber)
    return response.data
  }

  /** Sign XML document with XAdES-BES using separate cert and key files */
  private signXmlWithCertificate(xml: string, certPem: string, keyPassword: string): string {
    try {
      // Try multiple key formats: PEM (PKCS8, PKCS1, EC), DER
      let privateKey: crypto.KeyObject
      // Read key file as binary buffer for DER support
      const keyFilePath = this.keyPath
      const keyBuf = fs.readFileSync(keyFilePath)
      const isPem = keyBuf.toString('utf-8').trim().startsWith('-----')

      const keyHeader = keyBuf.toString('utf-8').split('\n')[0]
      this.log.info(`Key format: ${isPem ? 'PEM' : 'DER'}, size: ${keyBuf.length} bytes, header: ${keyHeader}`)
      this.log.info(`Key password provided: ${keyPassword ? 'yes (' + keyPassword.length + ' chars)' : 'no'}`)

      // For encrypted PEM keys, passphrase is required
      const pass = keyPassword || undefined

      let lastError: Error | null = null
      privateKey = null as any

      // Try Node.js crypto first
      const attempts: any[] = [
        { key: keyBuf, passphrase: pass },
        { key: keyBuf, format: 'pem', passphrase: pass },
        { key: keyBuf },
        { key: keyBuf, format: 'der', type: 'pkcs8' },
        { key: keyBuf, format: 'der', type: 'pkcs1' }
      ]

      for (const opts of attempts) {
        try {
          privateKey = crypto.createPrivateKey(opts)
          this.log.info('Key loaded successfully via crypto API')
          break
        } catch (e: any) {
          lastError = e
        }
      }

      // Fallback: manually decrypt PKCS#8 encrypted key (BoringSSL in Electron doesn't support all PBE algorithms)
      if (!privateKey && isPem && keyBuf.toString('utf-8').includes('ENCRYPTED') && pass) {
        this.log.warn('crypto API failed, trying manual PKCS#8 decryption...')
        try {
          const decryptedPem = decryptPkcs8(keyBuf.toString('utf-8'), pass)
          privateKey = crypto.createPrivateKey(decryptedPem)
          this.log.info('Key loaded successfully via manual PKCS#8 decryption')
        } catch (e: any) {
          this.log.error('Manual PKCS#8 decryption failed: ' + e.message)
        }
      }

      if (!privateKey) {
        this.log.error('All key loading attempts failed. Last error: ' + lastError?.message)
        throw lastError || new Error('Nie udało się odczytać klucza prywatnego. Sprawdź hasło i format klucza.')
      }

      const decryptedKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

      // Sign with xml-crypto (enveloped XAdES-BES signature)
      const { SignedXml } = require('xml-crypto')

      const sig = new SignedXml({
        privateKey: decryptedKeyPem,
        publicCert: certPem,
        signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
        canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#'
      })

      sig.addReference({
        uri: '',
        transforms: [
          'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
          'http://www.w3.org/2001/10/xml-exc-c14n#'
        ],
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256'
      })

      sig.computeSignature(xml, {
        location: { reference: '//*[local-name()="AuthTokenRequest"]', action: 'append' }
      })

      return sig.getSignedXml()
    } catch (err: any) {
      this.log.error('Certificate signing failed:', err.message)
      throw new Error('Nie udało się podpisać dokumentu certyfikatem: ' + err.message)
    }
  }

  /** Request a challenge from KSeF */
  private async fetchChallenge(): Promise<{ challenge: string; timestampMs: number }> {
    this.log.info('Requesting auth challenge...')
    const url = `${this.baseUrl}/auth/challenge`
    const result = await this.rawRequest<ChallengeResponse>('POST', url)

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Failed to get auth challenge: ${result.raw}`)
    }

    const { challenge, timestampMs } = result.data
    this.log.info('Challenge received:', challenge.substring(0, 16) + '...')

    return { challenge, timestampMs }
  }

  /** Poll auth status until processing is complete */
  private async pollAuthStatus(
    referenceNumber: string,
    authenticationToken: string
  ): Promise<void> {
    this.log.info('Polling auth status for reference:', referenceNumber)
    const url = `${this.baseUrl}/auth/${encodeURIComponent(referenceNumber)}`
    const maxAttempts = 30
    const pollIntervalMs = 2000

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.rawRequest<AuthStatusResponse>('GET', url, undefined, {
        Authorization: `Bearer ${authenticationToken}`
      })

      if (result.statusCode >= 200 && result.statusCode < 300) {
        const statusCode = result.data?.status?.code
        if (statusCode === 200) {
          this.log.info('Auth processing complete after', attempt, 'poll(s)')
          return
        }
        if (statusCode === 100) {
          this.log.info(`Auth still processing (attempt ${attempt}/${maxAttempts})...`)
          await this.sleep(pollIntervalMs)
          continue
        }
        if (statusCode && statusCode >= 400) {
          throw new Error(
            `Auth failed with status ${statusCode}: ${result.data?.status?.description} ${result.data?.status?.details?.join(', ') || ''}`
          )
        }
        // Unknown status, keep polling
        this.log.info(`Auth status code ${statusCode} (attempt ${attempt}/${maxAttempts})...`)
        await this.sleep(pollIntervalMs)
        continue
      }

      throw new Error(
        `Unexpected HTTP status ${result.statusCode} while polling auth status: ${result.raw}`
      )
    }

    throw new Error(
      `Auth status polling timed out after ${maxAttempts} attempts for reference ${referenceNumber}`
    )
  }

  /** Step 7: Redeem authentication token for access + refresh tokens */
  private async redeemToken(authenticationToken: string): Promise<TokenRedeemResponse> {
    this.log.info('Redeeming authentication token...')
    const url = `${this.baseUrl}/auth/token/redeem`
    const result = await this.rawRequest<TokenRedeemResponse>('POST', url, undefined, {
      Authorization: `Bearer ${authenticationToken}`
    })

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Token redemption failed: ${result.raw}`)
    }

    this.log.info('Token redeemed successfully')
    return result.data
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // ─── Public API methods ────────────────────────────────────────────────────

  async queryInvoices(
    filters: InvoiceQueryFilters
  ): Promise<QueryInvoicesMetadataResponse> {
    return this.request<QueryInvoicesMetadataResponse>(
      'POST',
      '/invoices/query/metadata',
      filters
    )
  }

  async downloadInvoice(ksefNumber: string): Promise<string> {
    await this.ensureAuthenticated()

    const url = `${this.baseUrl}/invoices/ksef/${encodeURIComponent(ksefNumber)}`

    return new Promise((resolve, reject) => {
      const request = net.request({ method: 'GET', url })

      request.setHeader('Authorization', `Bearer ${this.accessToken}`)
      request.setHeader('Accept', 'application/xml')

      let data = ''

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          data += chunk.toString()
        })
        response.on('end', () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            resolve(data)
          } else {
            reject(new Error(`Download error ${response.statusCode}: ${data}`))
          }
        })
        response.on('error', reject)
      })

      request.on('error', reject)
      request.end()
    })
  }

  async checkNewInvoices(since: string): Promise<QueryInvoicesMetadataResponse> {
    const dateRange = {
      dateType: 'PermanentStorage' as const,
      from: since,
      to: new Date().toISOString()
    }

    // Query both as seller (Subject1) and buyer (Subject2)
    const [sellerRes, buyerRes] = await Promise.all([
      this.queryInvoices({
        subjectType: 'Subject1',
        dateRange,
        sortOrder: 'Desc',
        pageSize: 100,
        pageOffset: 0
      }),
      this.queryInvoices({
        subjectType: 'Subject2',
        dateRange,
        sortOrder: 'Desc',
        pageSize: 100,
        pageOffset: 0
      })
    ])

    // Merge and deduplicate
    const allInvoices = [...(sellerRes.invoices || []), ...(buyerRes.invoices || [])]
    const seen = new Set<string>()
    const unique = allInvoices.filter((inv) => {
      if (seen.has(inv.ksefNumber)) return false
      seen.add(inv.ksefNumber)
      return true
    })

    return {
      invoices: unique,
      hasMore: sellerRes.hasMore || buyerRes.hasMore,
      isTruncated: sellerRes.isTruncated || buyerRes.isTruncated,
      permanentStorageHwmDate: sellerRes.permanentStorageHwmDate || buyerRes.permanentStorageHwmDate
    }
  }
}
