import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Switch,
  FormControlLabel,
  Alert,
  Snackbar,
  MenuItem,
  Chip,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Radio,
  RadioGroup,
  FormControl,
  Collapse,
  alpha
} from '@mui/material'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import SystemUpdateRoundedIcon from '@mui/icons-material/SystemUpdateRounded'
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import AddBusinessRoundedIcon from '@mui/icons-material/AddBusinessRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded'
import type { AppConfig, CompanyConfig } from '../../shared/types'
import { extractNipFromToken } from '../../shared/types'

interface SettingsPageProps {
  onThemeChange: (theme: 'light' | 'dark') => void
}

export function SettingsPage({ onThemeChange }: SettingsPageProps) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState('')

  // Add company form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newToken, setNewToken] = useState('')
  const [newName, setNewName] = useState('')
  const [newNip, setNewNip] = useState('')

  // Per-company token visibility
  const [visibleTokens, setVisibleTokens] = useState<Record<number, boolean>>({})

  useEffect(() => {
    window.api.getConfig().then(setConfig)
    window.api.getAppVersion().then(setAppVersion)
  }, [])

  async function handleSave() {
    if (!config) return

    if (!config.apiUrl) {
      setError('Adres API jest wymagany')
      return
    }

    try {
      await window.api.saveConfig(config)
      setSaved(true)
      onThemeChange(config.theme)
    } catch (err) {
      setError('Błąd zapisu konfiguracji')
    }
  }

  function updateConfig(partial: Partial<AppConfig>) {
    if (!config) return
    setConfig({ ...config, ...partial })
  }

  function handleNewTokenChange(token: string) {
    setNewToken(token)
    const nip = extractNipFromToken(token)
    setNewNip(nip)
    if (!newName && nip) {
      setNewName(`Firma (${nip})`)
    }
  }

  function handleAddCompany() {
    if (!config || !newToken) return

    const nip = extractNipFromToken(newToken)
    const company: CompanyConfig = {
      name: newName || (nip ? `Firma (${nip})` : 'Nowa firma'),
      token: newToken,
      nip
    }

    const companies = [...config.companies, company]
    const activeCompanyIndex = config.companies.length === 0 ? 0 : config.activeCompanyIndex

    setConfig({ ...config, companies, activeCompanyIndex })
    setNewToken('')
    setNewName('')
    setNewNip('')
    setShowAddForm(false)
  }

  function handleRemoveCompany(index: number) {
    if (!config) return

    const companies = config.companies.filter((_, i) => i !== index)
    let activeCompanyIndex = config.activeCompanyIndex

    if (index === activeCompanyIndex) {
      activeCompanyIndex = Math.max(0, companies.length - 1)
    } else if (index < activeCompanyIndex) {
      activeCompanyIndex = activeCompanyIndex - 1
    }

    setConfig({ ...config, companies, activeCompanyIndex })
  }

  function handleSetActive(index: number) {
    if (!config) return
    setConfig({ ...config, activeCompanyIndex: index })
  }

  function handleCompanyNameChange(index: number, name: string) {
    if (!config) return
    const companies = [...config.companies]
    companies[index] = { ...companies[index], name }
    setConfig({ ...config, companies })
  }

  function toggleTokenVisibility(index: number) {
    setVisibleTokens((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  function maskToken(token: string): string {
    if (token.length <= 8) return '****'
    return token.substring(0, 4) + '****' + token.substring(token.length - 4)
  }

  const [updateStatus, setUpdateStatus] = useState<string | null>(null)

  async function handleCheckUpdates() {
    setUpdateStatus('Sprawdzanie...')
    try {
      const result = await window.api.checkForUpdates()
      if (result && typeof result === 'object' && 'message' in result) {
        setUpdateStatus(result.message as string)
      } else {
        setUpdateStatus('Masz najnowszą wersję')
      }
    } catch {
      setUpdateStatus('Nie udało się sprawdzić aktualizacji')
    }
    setTimeout(() => setUpdateStatus(null), 5000)
  }

  if (!config) return null

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ mb: 0.5 }}>
          Ustawienia
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Konfiguracja połączenia z KSeF i preferencje aplikacji
        </Typography>
      </Box>

      {/* API URL */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <SecurityRoundedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6">Połączenie z API KSeF</Typography>
          </Box>

          <TextField
            label="Adres API"
            value={config.apiUrl}
            onChange={(e) => updateConfig({ apiUrl: e.target.value })}
            fullWidth
            helperText="Domyślnie: https://api.ksef.mf.gov.pl/v2"
            placeholder="https://api.ksef.mf.gov.pl/v2"
          />
        </CardContent>
      </Card>

      {/* Companies (multi-token) */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <BusinessRoundedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6">Firmy</Typography>
            <Chip
              label={`${config.companies.length}`}
              size="small"
              sx={{ ml: 1 }}
            />
          </Box>

          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Zarządzaj tokenami autoryzacyjnymi KSeF dla wielu firm. Aktywna firma jest używana do zapytań API.
          </Typography>

          {config.companies.length === 0 && !showAddForm && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
              Brak skonfigurowanych firm. Dodaj firmę, aby rozpocząć korzystanie z API KSeF.
            </Alert>
          )}

          <FormControl component="fieldset" sx={{ width: '100%' }}>
            <RadioGroup
              value={config.activeCompanyIndex}
              onChange={(e) => handleSetActive(parseInt(e.target.value))}
            >
              <List disablePadding>
                {config.companies.map((company, index) => {
                  const isActive = index === config.activeCompanyIndex
                  const isTokenVisible = visibleTokens[index] || false

                  return (
                    <ListItem
                      key={index}
                      sx={{
                        borderRadius: 2,
                        mb: 1,
                        border: (t) =>
                          `1px solid ${isActive ? alpha(t.palette.primary.main, 0.5) : t.palette.divider}`,
                        backgroundColor: (t) =>
                          isActive ? alpha(t.palette.primary.main, 0.05) : 'transparent',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        px: 2,
                        py: 1.5
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <Radio
                          value={index}
                          checked={isActive}
                          size="small"
                          sx={{ mr: 1 }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <TextField
                            value={company.name}
                            onChange={(e) => handleCompanyNameChange(index, e.target.value)}
                            variant="standard"
                            size="small"
                            sx={{
                              '& .MuiInput-input': {
                                fontWeight: 600,
                                fontSize: '0.95rem'
                              }
                            }}
                            fullWidth
                          />
                        </Box>
                        {isActive && (
                          <Chip
                            label="Aktywna"
                            size="small"
                            color="primary"
                            sx={{ ml: 1, fontWeight: 600 }}
                          />
                        )}
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveCompany(index)}
                          sx={{ ml: 1 }}
                        >
                          <DeleteRoundedIcon fontSize="small" />
                        </IconButton>
                      </Box>

                      <Box sx={{ pl: 5.5, mt: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 50 }}>
                            NIP:
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {company.nip || '(nie wykryto)'}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 50 }}>
                            Token:
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.75rem',
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {isTokenVisible ? company.token : maskToken(company.token)}
                          </Typography>
                          <IconButton
                            onClick={() => toggleTokenVisibility(index)}
                            size="small"
                          >
                            {isTokenVisible ? (
                              <VisibilityOffRoundedIcon fontSize="small" />
                            ) : (
                              <VisibilityRoundedIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Box>
                      </Box>
                    </ListItem>
                  )
                })}
              </List>
            </RadioGroup>
          </FormControl>

          {/* Add company form */}
          <Collapse in={showAddForm}>
            <Card
              variant="outlined"
              sx={{
                mt: 2,
                p: 2,
                borderStyle: 'dashed'
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                Nowa firma
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Token autoryzacyjny KSeF"
                    value={newToken}
                    onChange={(e) => handleNewTokenChange(e.target.value)}
                    fullWidth
                    multiline
                    rows={2}
                    placeholder="Wklej token KSeF..."
                    helperText="NIP zostanie automatycznie wyodrębniony z tokenu"
                  />
                </Grid>
                {newNip && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="NIP (wykryty automatycznie)"
                      value={newNip}
                      fullWidth
                      InputProps={{ readOnly: true }}
                      sx={{
                        '& .MuiInputBase-input': {
                          fontFamily: 'monospace',
                          fontWeight: 600
                        }
                      }}
                    />
                  </Grid>
                )}
                <Grid size={{ xs: 12, sm: newNip ? 6 : 12 }}>
                  <TextField
                    label="Nazwa firmy"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    fullWidth
                    placeholder="np. Moja Firma Sp. z o.o."
                    helperText="Opcjonalna nazwa do wyświetlania"
                  />
                </Grid>
              </Grid>
              <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="text"
                  onClick={() => {
                    setShowAddForm(false)
                    setNewToken('')
                    setNewName('')
                    setNewNip('')
                  }}
                >
                  Anuluj
                </Button>
                <Button
                  variant="contained"
                  onClick={handleAddCompany}
                  disabled={!newToken}
                >
                  Dodaj
                </Button>
              </Box>
            </Card>
          </Collapse>

          {!showAddForm && (
            <Button
              variant="outlined"
              startIcon={<AddBusinessRoundedIcon />}
              onClick={() => setShowAddForm(true)}
              sx={{ mt: 2 }}
            >
              Dodaj firmę
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Auto-check settings */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <TuneRoundedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6">Automatyczne sprawdzanie</Typography>
          </Box>

          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.autoCheckEnabled}
                    onChange={(e) => updateConfig({ autoCheckEnabled: e.target.checked })}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1">
                      Włącz automatyczne sprawdzanie nowych faktur
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Aplikacja będzie cyklicznie odpytywać API KSeF
                    </Typography>
                  </Box>
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Interwał sprawdzania (minuty)"
                type="number"
                value={config.checkIntervalMinutes}
                onChange={(e) =>
                  updateConfig({ checkIntervalMinutes: Math.max(1, parseInt(e.target.value) || 15) })
                }
                fullWidth
                inputProps={{ min: 1, max: 1440 }}
                helperText="Zalecane: 15-60 minut (uwaga na limity API)"
                disabled={!config.autoCheckEnabled}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 3 }}>
            Wygląd
          </Typography>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Motyw"
                select
                value={config.theme}
                onChange={(e) => updateConfig({ theme: e.target.value as 'light' | 'dark' })}
                fullWidth
              >
                <MenuItem value="dark">Ciemny</MenuItem>
                <MenuItem value="light">Jasny</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Updates */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <SystemUpdateRoundedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6">Aktualizacje</Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<SystemUpdateRoundedIcon />}
              onClick={handleCheckUpdates}
            >
              Sprawdź aktualizacje
            </Button>
            <Chip label={`v${appVersion}`} size="small" variant="outlined" />
          </Box>
          {updateStatus && (
            <Typography variant="body2" sx={{ mt: 1, color: 'primary.main', fontWeight: 500 }}>
              {updateStatus}
            </Typography>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1, display: 'block' }}>
            Aktualizacje są pobierane automatycznie z serwera GitHub Releases
          </Typography>
        </CardContent>
      </Card>

      {/* Test notification */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Powiadomienia</Typography>
          <Button
            variant="outlined"
            onClick={async () => {
              const result = await window.api.testNotification()
              if (result && !(result as any).ok) {
                setError('Powiadomienia nie są obsługiwane: ' + (result as any).error)
              }
            }}
          >
            Test powiadomienia
          </Button>
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1, display: 'block' }}>
            Wyślij testowe powiadomienie systemowe z dźwiękiem
          </Typography>
        </CardContent>
      </Card>

      {/* Save button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<SaveRoundedIcon />}
          onClick={handleSave}
          sx={{ px: 4 }}
        >
          Zapisz ustawienia
        </Button>
      </Box>

      {/* Success snackbar */}
      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" variant="filled" sx={{ borderRadius: 2 }}>
          Ustawienia zapisane pomyślnie!
        </Alert>
      </Snackbar>

      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={4000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="error" variant="filled" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  )
}
