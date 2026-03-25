import { describe, it, expect } from 'vitest'
import {
  AppError,
  AIProviderError,
  NetworkError,
  ValidationError,
  FileOperationError,
  PluginError,
  getErrorMessage,
  toErrorInfo,
} from './errors'

describe('Error Types', () => {
  describe('AppError', () => {
    it('should create an AppError with correct properties', () => {
      const error = new AppError('Test message', 'TEST_CODE', { key: 'value' })

      expect(error.message).toBe('Test message')
      expect(error.code).toBe('TEST_CODE')
      expect(error.context).toEqual({ key: 'value' })
      expect(error.name).toBe('AppError')
      expect(error.timestamp).toBeGreaterThan(0)
      expect(error.stack).toBeDefined()
    })
  })

  describe('AIProviderError', () => {
    it('should create an AIProviderError with provider name', () => {
      const error = new AIProviderError('Connection failed', 'openai', { endpoint: 'localhost' })

      expect(error.message).toBe('Connection failed')
      expect(error.code).toBe('AI_PROVIDER_OPENAI_ERROR')
      expect(error.provider).toBe('openai')
      expect(error.context).toEqual({ endpoint: 'localhost' })
    })
  })

  describe('NetworkError', () => {
    it('should create a NetworkError', () => {
      const error = new NetworkError('Network unavailable')

      expect(error.message).toBe('Network unavailable')
      expect(error.code).toBe('NETWORK_ERROR')
    })
  })

  describe('ValidationError', () => {
    it('should create a ValidationError', () => {
      const error = new ValidationError('Invalid input', { field: 'email' })

      expect(error.message).toBe('Invalid input')
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.context).toEqual({ field: 'email' })
    })
  })

  describe('FileOperationError', () => {
    it('should create a FileOperationError', () => {
      const error = new FileOperationError('File not found')

      expect(error.message).toBe('File not found')
      expect(error.code).toBe('FILE_OPERATION_ERROR')
    })
  })

  describe('PluginError', () => {
    it('should create a PluginError with plugin ID', () => {
      const error = new PluginError('Plugin failed', 'pdf-viewer')

      expect(error.message).toBe('Plugin failed')
      expect(error.code).toBe('PLUGIN_pdf-viewer_ERROR')
      expect(error.pluginId).toBe('pdf-viewer')
    })
  })
})

describe('getErrorMessage', () => {
  it('should extract message from Error instance', () => {
    const error = new Error('Test error')
    expect(getErrorMessage(error)).toBe('Test error')
  })

  it('should return string as-is', () => {
    expect(getErrorMessage('string error')).toBe('string error')
  })

  it('should extract message from object with message property', () => {
    const error = { message: 'object error' }
    expect(getErrorMessage(error)).toBe('object error')
  })

  it('should return default message for unknown types', () => {
    expect(getErrorMessage(null)).toBe('An unknown error occurred')
    expect(getErrorMessage(undefined)).toBe('An unknown error occurred')
    expect(getErrorMessage(123)).toBe('An unknown error occurred')
  })
})

describe('toErrorInfo', () => {
  it('should convert AppError to ErrorInfo', () => {
    const error = new AppError('App error', 'APP_CODE', { data: true })
    const info = toErrorInfo(error)

    expect(info.message).toBe('App error')
    expect(info.code).toBe('APP_CODE')
    expect(info.context).toEqual({ data: true })
    expect(info.timestamp).toBe(error.timestamp)
    expect(info.stack).toBe(error.stack)
  })

  it('should convert Error to ErrorInfo', () => {
    const error = new Error('Standard error')
    const info = toErrorInfo(error)

    expect(info.message).toBe('Standard error')
    expect(info.code).toBe('UNKNOWN_ERROR')
    expect(info.stack).toBe(error.stack)
    expect(info.timestamp).toBeGreaterThan(0)
  })

  it('should handle string errors', () => {
    const info = toErrorInfo('string error')

    expect(info.message).toBe('string error')
    expect(info.code).toBe('UNKNOWN_ERROR')
  })

  it('should handle objects with message property', () => {
    const error = { message: 'object message', code: 'OBJ_CODE' }
    const info = toErrorInfo(error)

    expect(info.message).toBe('object message')
    expect(info.code).toBe('UNKNOWN_ERROR')
    expect(info.context).toEqual({ message: 'object message', code: 'OBJ_CODE' })
  })

  it('should handle unknown types with default values', () => {
    const info = toErrorInfo(null)

    expect(info.message).toBe('An unknown error occurred')
    expect(info.code).toBe('UNKNOWN_ERROR')
    expect(info.timestamp).toBeGreaterThan(0)
  })
})
