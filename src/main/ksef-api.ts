import { net } from 'electron'
import * as crypto from 'crypto'
import type {
  AppConfig,
  InvoiceQueryFilters,
  QueryInvoicesMetadataResponse
} from '../shared/types'

interface PublicKeyCertificate {
  certificate: string // base64 DER
  validFrom: string
  validTo: string
}

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

const log = {
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

  constructor(config: AppConfig) {
    this.config = config
  }

  updateConfig(config: AppConfig): void {
    this.config = config
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

    throw new Error(`KSeF API Error ${result.statusCode}: ${result.raw}`)
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
    if (!this.config.token || !this.config.nip) {
      throw new Error('KSeF token and NIP must be configured before making API calls')
    }

    this.authInProgress = this.performFullAuth()
      .finally(() => { this.authInProgress = null })
    await this.authInProgress
  }

  /** Step 9: Refresh access token using refresh token */
  private async refreshAccessToken(): Promise<void> {
    log.info('Refreshing access token...')
    const url = `${this.baseUrl}/auth/token/refresh`
    const result = await this.rawRequest<TokenRefreshResponse>(
      'POST',
      url,
      { refreshToken: this.refreshToken },
      { Authorization: `Bearer ${this.accessToken}` }
    )

    if (result.statusCode < 200 || result.statusCode >= 300) {
      log.warn('Token refresh failed, performing full re-auth:', result.raw)
      // Clear state and fall through to full auth
      this.accessToken = null
      this.refreshToken = null
      await this.performFullAuth()
      return
    }

    this.accessToken = result.data.accessToken.token
    this.accessTokenValidUntil = new Date(result.data.accessToken.validUntil)
    log.info('Access token refreshed, valid until', this.accessTokenValidUntil.toISOString())
  }

  /** Steps 1-8: Full authentication flow */
  private async performFullAuth(): Promise<void> {
    log.info('Starting full KSeF authentication flow...')

    // Step 1: Get MF public key certificate
    const publicKey = await this.fetchPublicKey()

    // Step 2: Get challenge
    const { challenge, timestampMs } = await this.fetchChallenge()

    // Step 3: Encrypt "{ksefToken}|{timestampMs}" with RSA-OAEP SHA-256
    const encryptedToken = this.encryptToken(this.config.token, timestampMs, publicKey)

    // Step 4: Authenticate with KSeF token
    const { referenceNumber, authenticationToken } = await this.authenticateWithToken(
      challenge,
      this.config.nip,
      encryptedToken
    )

    // Step 6: Poll until auth is processed
    await this.pollAuthStatus(referenceNumber, authenticationToken.token)

    // Step 7: Redeem token
    const tokens = await this.redeemToken(authenticationToken.token)

    // Step 8: Store tokens
    this.accessToken = tokens.accessToken.token
    this.accessTokenValidUntil = new Date(tokens.accessToken.validUntil)
    this.refreshToken = tokens.refreshToken.token
    this.refreshTokenValidUntil = new Date(tokens.refreshToken.validUntil)

    log.info(
      'Authentication complete. Access token valid until',
      this.accessTokenValidUntil.toISOString()
    )
  }

  /** Step 1: Fetch the MF public key certificate and extract the RSA public key */
  private async fetchPublicKey(): Promise<crypto.KeyObject> {
    log.info('Fetching MF public key certificate...')
    const url = `${this.baseUrl}/security/public-key-certificates`
    const result = await this.rawRequest<PublicKeyCertificate[]>('GET', url)

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Failed to fetch public key certificates: ${result.raw}`)
    }

    const certs = result.data
    if (!Array.isArray(certs) || certs.length === 0) {
      throw new Error('No public key certificates returned from KSeF')
    }

    // Pick the certificate that is currently valid
    const now = new Date()
    const validCert = certs.find((c) => {
      const from = new Date(c.validFrom)
      const to = new Date(c.validTo)
      return now >= from && now <= to
    })

    const cert = validCert ?? certs[0]
    log.info('Using certificate valid from', cert.validFrom, 'to', cert.validTo)

    // The certificate field is base64-encoded DER (X.509)
    const derBuffer = Buffer.from(cert.certificate, 'base64')

    // Convert DER to PEM so Node's crypto can parse it
    const pemCert =
      '-----BEGIN CERTIFICATE-----\n' +
      derBuffer.toString('base64').match(/.{1,64}/g)!.join('\n') +
      '\n-----END CERTIFICATE-----'

    // Create an X509Certificate and extract the public key
    const x509 = new crypto.X509Certificate(pemCert)
    const publicKey = x509.publicKey

    return publicKey
  }

  /** Step 2: Request a challenge from KSeF */
  private async fetchChallenge(): Promise<{ challenge: string; timestampMs: number }> {
    log.info('Requesting auth challenge...')
    const url = `${this.baseUrl}/auth/challenge`
    const result = await this.rawRequest<ChallengeResponse>('POST', url)

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Failed to get auth challenge: ${result.raw}`)
    }

    const { challenge, timestampMs } = result.data
    log.info('Challenge received:', challenge.substring(0, 16) + '...')

    return { challenge, timestampMs }
  }

  /** Step 3: Encrypt "{ksefToken}|{timestampMs}" using RSA-OAEP with SHA-256 */
  private encryptToken(
    ksefToken: string,
    timestampMs: number,
    publicKey: crypto.KeyObject
  ): string {
    const plaintext = `${ksefToken}|${timestampMs}`
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.from(plaintext, 'utf-8')
    )
    return encrypted.toString('base64')
  }

  /** Step 4-5: Send encrypted token to get referenceNumber + authenticationToken */
  private async authenticateWithToken(
    challenge: string,
    nip: string,
    encryptedToken: string
  ): Promise<KsefTokenAuthResponse> {
    log.info('Authenticating with KSeF token...')
    const url = `${this.baseUrl}/auth/ksef-token`
    const result = await this.rawRequest<KsefTokenAuthResponse>('POST', url, {
      challenge,
      contextIdentifier: {
        type: 'Nip',
        value: nip
      },
      encryptedToken
    })

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`KSeF token authentication failed: ${result.raw}`)
    }

    log.info('Auth submitted, reference:', result.data.referenceNumber)
    return result.data
  }

  /** Step 6: Poll auth status until processing is complete */
  private async pollAuthStatus(
    referenceNumber: string,
    authenticationToken: string
  ): Promise<void> {
    log.info('Polling auth status for reference:', referenceNumber)
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
          log.info('Auth processing complete after', attempt, 'poll(s)')
          return
        }
        if (statusCode === 100) {
          log.info(`Auth still processing (attempt ${attempt}/${maxAttempts})...`)
          await this.sleep(pollIntervalMs)
          continue
        }
        if (statusCode && statusCode >= 400) {
          throw new Error(
            `Auth failed with status ${statusCode}: ${result.data?.status?.description} ${result.data?.status?.details?.join(', ') || ''}`
          )
        }
        // Unknown status, keep polling
        log.info(`Auth status code ${statusCode} (attempt ${attempt}/${maxAttempts})...`)
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
    log.info('Redeeming authentication token...')
    const url = `${this.baseUrl}/auth/token/redeem`
    const result = await this.rawRequest<TokenRedeemResponse>('POST', url, undefined, {
      Authorization: `Bearer ${authenticationToken}`
    })

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Token redemption failed: ${result.raw}`)
    }

    log.info('Token redeemed successfully')
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
    const filters: InvoiceQueryFilters = {
      subjectType: 'Subject1',
      dateRange: {
        dateType: 'PermanentStorage',
        from: since,
        to: new Date().toISOString()
      },
      sortOrder: 'Desc',
      pageSize: 100,
      pageOffset: 0
    }
    return this.queryInvoices(filters)
  }
}
