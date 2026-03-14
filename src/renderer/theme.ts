import { createTheme, alpha } from '@mui/material/styles'

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6C63FF',
      light: '#918AFF',
      dark: '#4B45B2'
    },
    secondary: {
      main: '#00D4AA',
      light: '#33DDBB',
      dark: '#009477'
    },
    background: {
      default: '#0F0F1A',
      paper: '#1A1A2E'
    },
    error: {
      main: '#FF6B6B'
    },
    warning: {
      main: '#FFB347'
    },
    success: {
      main: '#4ECB71'
    },
    text: {
      primary: '#E8E8F0',
      secondary: '#9999B0'
    },
    divider: alpha('#ffffff', 0.08)
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 500 },
    body1: { fontSize: '0.935rem' },
    body2: { fontSize: '0.85rem' }
  },
  shape: {
    borderRadius: 12
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
          scrollbarColor: '#2A2A4A #0F0F1A',
          '&::-webkit-scrollbar': { width: 8 },
          '&::-webkit-scrollbar-track': { background: '#0F0F1A' },
          '&::-webkit-scrollbar-thumb': {
            background: '#2A2A4A',
            borderRadius: 4
          }
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
          padding: '8px 20px'
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #6C63FF 0%, #918AFF 100%)',
          boxShadow: '0 4px 15px rgba(108, 99, 255, 0.3)',
          '&:hover': {
            background: 'linear-gradient(135deg, #5B54E6 0%, #7F79FF 100%)',
            boxShadow: '0 6px 20px rgba(108, 99, 255, 0.4)'
          }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.1)'
            },
            '&:hover fieldset': {
              borderColor: 'rgba(108, 99, 255, 0.5)'
            }
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500
        }
      }
    }
  }
})

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6C63FF',
      light: '#918AFF',
      dark: '#4B45B2'
    },
    secondary: {
      main: '#00D4AA',
      light: '#33DDBB',
      dark: '#009477'
    },
    background: {
      default: '#F5F5FA',
      paper: '#FFFFFF'
    },
    error: {
      main: '#E53935'
    },
    warning: {
      main: '#FF9800'
    },
    success: {
      main: '#43A047'
    },
    text: {
      primary: '#1A1A2E',
      secondary: '#666680'
    }
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 500 },
    body1: { fontSize: '0.935rem' },
    body2: { fontSize: '0.85rem' }
  },
  shape: {
    borderRadius: 12
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
          padding: '8px 20px'
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #6C63FF 0%, #918AFF 100%)',
          boxShadow: '0 4px 15px rgba(108, 99, 255, 0.2)',
          '&:hover': {
            background: 'linear-gradient(135deg, #5B54E6 0%, #7F79FF 100%)',
            boxShadow: '0 6px 20px rgba(108, 99, 255, 0.3)'
          }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)'
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500
        }
      }
    }
  }
})
