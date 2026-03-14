import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  alpha
} from '@mui/material'
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded'
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded'
import type { LogEntry } from '../../shared/types'

const levelColors: Record<string, string> = {
  info: '#00D4AA',
  warn: '#FFB74D',
  error: '#EF5350'
}

const levelLabels: Record<string, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR'
}

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load existing logs
    window.api.getAppLogs().then(setLogs)

    // Subscribe to new logs
    const unsub = window.api.onNewLog((entry: LogEntry) => {
      setLogs((prev) => [...prev, entry])
    })

    return unsub
  }, [])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  function handleClear() {
    setLogs([])
  }

  return (
    <Box>
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Logi aplikacji
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Historia operacji KSeF: autoryzacja, zapytania API, błędy
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteSweepRoundedIcon />}
          onClick={handleClear}
          disabled={logs.length === 0}
        >
          Wyczyść logi
        </Button>
      </Box>

      <Card>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, pb: 1 }}>
            <ArticleRoundedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6">
              Logi ({logs.length})
            </Typography>
          </Box>

          <Box
            ref={scrollRef}
            sx={{
              maxHeight: 'calc(100vh - 260px)',
              overflow: 'auto',
              px: 2,
              pb: 2,
              fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
              fontSize: '0.8rem'
            }}
          >
            {logs.length === 0 && (
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}
              >
                Brak logów. Logi pojawią się po wykonaniu operacji API.
              </Typography>
            )}

            {logs.map((entry, index) => {
              const color = levelColors[entry.level] || '#fff'
              const ts = new Date(entry.timestamp)
              const timeStr = ts.toLocaleTimeString('pl-PL', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
              const dateStr = ts.toLocaleDateString('pl-PL', {
                day: '2-digit',
                month: '2-digit'
              })

              return (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.5,
                    py: 0.5,
                    borderBottom: (t) => `1px solid ${alpha(t.palette.divider, 0.3)}`,
                    '&:last-child': { borderBottom: 'none' }
                  }}
                >
                  <Typography
                    sx={{
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap',
                      mt: 0.2,
                      minWidth: 100
                    }}
                  >
                    {dateStr} {timeStr}
                  </Typography>
                  <Chip
                    label={levelLabels[entry.level]}
                    size="small"
                    sx={{
                      backgroundColor: alpha(color, 0.15),
                      color,
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      height: 20,
                      minWidth: 52
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: '0.8rem',
                      color: entry.level === 'error' ? color : 'text.primary',
                      wordBreak: 'break-all',
                      flex: 1
                    }}
                  >
                    {entry.message}
                  </Typography>
                </Box>
              )
            })}
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
