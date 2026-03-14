import { net } from 'electron'
import type {
  AppConfig,
  InvoiceQueryFilters,
  QueryInvoicesMetadataResponse
} from '../shared/types'

export class KsefApiClient {
  private config: AppConfig
  private accessToken: string | null = null

  constructor(config: AppConfig) {
    this.config = config
    this.accessToken = config.token || null
  }

  updateConfig(config: AppConfig): void {
    this.config = config
    this.accessToken = config.token || null
  }

  private get baseUrl(): string {
    return this.config.apiUrl.replace(/\/$/, '')
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers
    }

    if (this.accessToken) {
      requestHeaders['Authorization'] = `Bearer ${this.accessToken}`
    }

    return new Promise((resolve, reject) => {
      const request = net.request({
        method,
        url
      })

      for (const [key, value] of Object.entries(requestHeaders)) {
        request.setHeader(key, value)
      }

      let responseData = ''

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            try {
              resolve(JSON.parse(responseData) as T)
            } catch {
              resolve(responseData as unknown as T)
            }
          } else {
            reject(
              new Error(
                `KSeF API Error ${response.statusCode}: ${responseData}`
              )
            )
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
    const url = `${this.baseUrl}/invoices/ksef/${encodeURIComponent(ksefNumber)}`

    return new Promise((resolve, reject) => {
      const request = net.request({ method: 'GET', url })

      if (this.accessToken) {
        request.setHeader('Authorization', `Bearer ${this.accessToken}`)
      }
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
