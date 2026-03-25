import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLogger, appLogger } from './logger'

describe('Logger', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createLogger', () => {
    it('should create a logger with context', () => {
      const logger = createLogger('TestContext')
      expect(logger).toBeDefined()
    })

    it('should log debug messages when enabled', () => {
      const logger = createLogger('TestContext', { level: 'debug', consoleOutput: true })
      logger.debug('Debug message', { key: 'value' })

      expect(consoleDebugSpy).toHaveBeenCalled()
      const call = consoleDebugSpy.mock.calls[0]
      expect(call[0]).toContain('DEBUG')
      expect(call[0]).toContain('TestContext')
      expect(call[1]).toBe('Debug message')
    })

    it('should log info messages', () => {
      const logger = createLogger('TestContext', { consoleOutput: true })
      logger.info('Info message')

      expect(consoleInfoSpy).toHaveBeenCalled()
    })

    it('should log warn messages', () => {
      const logger = createLogger('TestContext', { consoleOutput: true })
      logger.warn('Warning message')

      expect(consoleWarnSpy).toHaveBeenCalled()
    })

    it('should log error messages with Error object', () => {
      const logger = createLogger('TestContext', { consoleOutput: true })
      const error = new Error('Test error')
      logger.error('Error occurred', error)

      expect(consoleErrorSpy).toHaveBeenCalled()
      const call = consoleErrorSpy.mock.calls[0]
      expect(call[1]).toBe('Error occurred')
    })

    it('should log error messages with data object', () => {
      const logger = createLogger('TestContext', { consoleOutput: true })
      logger.error('Error occurred', { code: 500, details: 'server error' })

      expect(consoleErrorSpy).toHaveBeenCalled()
      const call = consoleErrorSpy.mock.calls[0]
      expect(call[1]).toBe('Error occurred')
    })

    it('should not log below configured level', () => {
      const logger = createLogger('TestContext', { level: 'warn', consoleOutput: true })
      logger.debug('Debug message')
      logger.info('Info message')

      expect(consoleDebugSpy).not.toHaveBeenCalled()
      expect(consoleInfoSpy).not.toHaveBeenCalled()
    })

    it('should not log when disabled', () => {
      const logger = createLogger('TestContext', { enabled: false, consoleOutput: true })
      logger.error('Error message')

      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('should not output to console when consoleOutput is false', () => {
      const logger = createLogger('TestContext', { consoleOutput: false })
      logger.info('Info message')

      expect(consoleInfoSpy).not.toHaveBeenCalled()
    })

    it('should update config with setConfig', () => {
      const logger = createLogger('TestContext', { consoleOutput: true })
      logger.setConfig({ enabled: false })
      logger.info('Should not appear')

      expect(consoleInfoSpy).not.toHaveBeenCalled()
    })
  })

  describe('appLogger', () => {
    it('should be a singleton logger instance', () => {
      expect(appLogger).toBeDefined()
      expect(typeof appLogger.debug).toBe('function')
      expect(typeof appLogger.info).toBe('function')
      expect(typeof appLogger.warn).toBe('function')
      expect(typeof appLogger.error).toBe('function')
    })
  })
})
