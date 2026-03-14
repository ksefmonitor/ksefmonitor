import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  TextField,
  Button,
  Chip,
  IconButton,
  Collapse,
  alpha,
  InputAdornment,
  Alert,
  Snackbar,
  Divider
} from '@mui/material'
import StorageRoundedIcon from '@mui/icons-material/StorageRounded'
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import WebhookRoundedIcon from '@mui/icons-material/WebhookRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded'
import type { AppConfig, IntegrationConfig, AVAILABLE_INTEGRATIONS } from '../../shared/types'

const ICON_MAP: Record<string, React.ReactNode> = {
  Storage: <StorageRoundedIcon />,
  AccountBalance: <AccountBalanceRoundedIcon />,
  Webhook: <WebhookRoundedIcon />
}

interface IntegrationSettingsField {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'url'
  placeholder?: string
}

const INTEGRATION_FIELDS: Record<string, IntegrationSettingsField[]> = {
  infover: [
    { key: 'host', label: 'Adres serwera', type: 'url', placeholder: 'https://192.168.1.100:8080' },
    { key: 'login', label: 'Login', type: 'text', placeholder: 'admin' },
    { key: 'password', label: 'Hasło', type: 'password' },
    { key: 'database', label: 'Baza danych', type: 'text', placeholder: 'infover_prod' },
    { key: 'syncInterval', label: 'Interwał synchronizacji (min)', type: 'number', placeholder: '30' }
  ],
  webhook: [
    { key: 'url', label: 'URL endpointu', type: 'url', placeholder: 'https://hooks.slack.com/services/...' },
    { key: 'secret', label: 'Secret (opcjonalny)', type: 'password' },
    { key: 'method', label: 'Metoda HTTP', type: 'text', placeholder: 'POST' }
  ]
}

// Available integrations definition (same as in types but with defaults)
const INTEGRATIONS_CATALOG = [
  {
    id: 'infover',
    name: 'Infover',
    description: 'Synchronizacja faktur z systemem Infover ERP. Automatyczne przesyłanie nowych faktur i aktualizacja statusów.',
    icon: 'Storage'
  },
  {
    id: 'webhook',
    name: 'Webhook',
    description: 'Wysyłaj powiadomienia o nowych fakturach na dowolny endpoint HTTP (Slack, Teams, własny serwer).',
    icon: 'Webhook'
  }
]

export function IntegrationsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({})

  useEffect(() => {
    window.api.getConfig().then(setConfig)
  }, [])

  function getIntegration(id: string): IntegrationConfig {
    const existing = config?.integrations?.find(i => i.id === id)
    if (existing) return existing
    return {
      id,
      name: INTEGRATIONS_CATALOG.find(c => c.id === id)?.name || id,
      description: INTEGRATIONS_CATALOG.find(c => c.id === id)?.description || '',
      icon: INTEGRATIONS_CATALOG.find(c => c.id === id)?.icon || 'Storage',
      enabled: false,
      syncEnabled: false,
      settings: {}
    }
  }

  function updateIntegration(id: string, partial: Partial<IntegrationConfig>) {
    if (!config) return
    const integrations = [...(config.integrations || [])]
    const idx = integrations.findIndex(i => i.id === id)
    const current = getIntegration(id)
    const updated = { ...current, ...partial }

    if (idx >= 0) {
      integrations[idx] = updated
    } else {
      integrations.push(updated)
    }
    setConfig({ ...config, integrations })
  }

  function updateSetting(integrationId: string, key: string, value: string) {
    const integration = getIntegration(integrationId)
    updateIntegration(integrationId, {
      settings: { ...integration.settings, [key]: value }
    })
  }

  async function handleSave() {
    if (!config) return
    await window.api.saveConfig(config)
    setSaved(true)
  }

  function togglePasswordVisibility(fieldKey: string) {
    setVisiblePasswords(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))
  }

  if (!config) return null

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <ExtensionRoundedIcon sx={{ color: 'primary.main', fontSize: 28 }} />
          <Typography variant="h4">Integracje</Typography>
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Podłącz zewnętrzne systemy ERP i usługi. Każda integracja może być niezależnie włączona i skonfigurowana.
        </Typography>
      </Box>

      {INTEGRATIONS_CATALOG.map(catalog => {
        const integration = getIntegration(catalog.id)
        const isExpanded = expanded === catalog.id
        const fields = INTEGRATION_FIELDS[catalog.id] || []

        return (
          <Card key={catalog.id} sx={{ mb: 2 }}>
            <CardContent sx={{ p: 0 }}>
              {/* Header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  p: 2.5,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  '&:hover': { background: (t) => alpha(t.palette.primary.main, 0.03) }
                }}
                onClick={() => setExpanded(isExpanded ? null : catalog.id)}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2.5,
                    background: integration.enabled
                      ? 'linear-gradient(135deg, #6C63FF 0%, #918AFF 100%)'
                      : (t) => alpha(t.palette.text.disabled, 0.1),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mr: 2,
                    color: integration.enabled ? '#fff' : 'text.disabled',
                    transition: 'all 0.3s'
                  }}
                >
                  {ICON_MAP[catalog.icon] || <StorageRoundedIcon />}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {catalog.name}
                    </Typography>
                    <Chip
                      label={integration.enabled ? 'Włączona' : 'Wyłączona'}
                      size="small"
                      color={integration.enabled ? 'success' : 'default'}
                      variant={integration.enabled ? 'filled' : 'outlined'}
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />
                    {integration.enabled && integration.syncEnabled && (
                      <Chip
                        label="Auto-sync"
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ fontSize: '0.7rem', height: 22 }}
                      />
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {catalog.description}
                  </Typography>
                </Box>
                <Switch
                  checked={integration.enabled}
                  onChange={(e) => {
                    e.stopPropagation()
                    updateIntegration(catalog.id, { enabled: e.target.checked })
                  }}
                  onClick={(e) => e.stopPropagation()}
                  color="primary"
                />
                <IconButton size="small" sx={{ ml: 0.5 }}>
                  {isExpanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                </IconButton>
              </Box>

              {/* Settings */}
              <Collapse in={isExpanded}>
                <Divider />
                <Box sx={{ p: 2.5, pt: 2 }}>
                  {!integration.enabled && (
                    <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                      Włącz integrację przełącznikiem powyżej, aby skonfigurować połączenie.
                    </Alert>
                  )}

                  <Box sx={{ opacity: integration.enabled ? 1 : 0.5, pointerEvents: integration.enabled ? 'auto' : 'none' }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={integration.syncEnabled}
                          onChange={(e) => updateIntegration(catalog.id, { syncEnabled: e.target.checked })}
                          color="primary"
                          size="small"
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            Automatyczna synchronizacja
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Nowe faktury będą automatycznie przesyłane do {catalog.name}
                          </Typography>
                        </Box>
                      }
                      sx={{ mb: 2, ml: 0 }}
                    />

                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: 0.5 }}>
                      Konfiguracja połączenia
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {fields.map(field => {
                        const isPassword = field.type === 'password'
                        const fieldVisKey = `${catalog.id}_${field.key}`
                        const isVisible = visiblePasswords[fieldVisKey]

                        return (
                          <TextField
                            key={field.key}
                            label={field.label}
                            type={isPassword && !isVisible ? 'password' : field.type === 'number' ? 'number' : 'text'}
                            value={integration.settings[field.key] || ''}
                            onChange={(e) => updateSetting(catalog.id, field.key, e.target.value)}
                            placeholder={field.placeholder}
                            fullWidth
                            size="small"
                            InputProps={isPassword ? {
                              endAdornment: (
                                <InputAdornment position="end">
                                  <IconButton size="small" onClick={() => togglePasswordVisibility(fieldVisKey)}>
                                    {isVisible ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                                  </IconButton>
                                </InputAdornment>
                              )
                            } : undefined}
                          />
                        )
                      })}
                    </Box>

                    <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button
                        variant="outlined"
                        size="small"
                        disabled
                      >
                        Test połączenia
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Collapse>
            </CardContent>
          </Card>
        )
      })}

      {/* Save */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<SaveRoundedIcon />}
          onClick={handleSave}
          sx={{ px: 4 }}
        >
          Zapisz integracje
        </Button>
      </Box>

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" variant="filled" sx={{ borderRadius: 2 }}>
          Konfiguracja integracji zapisana!
        </Alert>
      </Snackbar>
    </Box>
  )
}
