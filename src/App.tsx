import { useEffect, useState } from 'react'
import MainLayout from './presentation/layouts/MainLayout'
import { loadAllPlugins, unloadAllPlugins } from './infrastructure/plugins/plugin-loader'

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setTheme(mediaQuery.matches ? 'dark' : 'light')

    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light')
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Load plugins on app start
  useEffect(() => {
    const initPlugins = async () => {
      try {
        await loadAllPlugins()
      } catch (error) {
        console.error('Failed to load plugins:', error)
      }
    }

    initPlugins()

    // Cleanup plugins on unmount
    return () => {
      unloadAllPlugins().catch(console.error)
    }
  }, [])

  return <MainLayout />
}

export default App
