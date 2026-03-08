import { useEffect } from 'react'
import MainLayout from './presentation/layouts/MainLayout'
import { loadAllPlugins, unloadAllPlugins } from './infrastructure/plugins/plugin-loader'
import { useThemeStore } from './application/store/theme-store'

function App() {
  const { theme, toggleTheme } = useThemeStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Expose theme toggle to window for Tauri
  useEffect(() => {
    ;(window as any).toggleTheme = toggleTheme
  }, [toggleTheme])

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
