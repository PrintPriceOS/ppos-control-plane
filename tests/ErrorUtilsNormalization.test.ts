import { describe, it, expect } from 'vitest';
import { normalizeUiError } from '../src/ui/utils/errorUtils';

describe('normalizeUiError - Safe UI error formatting', () => {
  it('handles standard string errors', () => {
    expect(normalizeUiError('Error de conexión')).toBe('Error de conexión');
    expect(normalizeUiError('   Mensaje con espacios   ')).toBe('Mensaje con espacios');
  });

  it('handles JSON string containing {code, message}', () => {
    const jsonStr = JSON.stringify({ code: 'UNAUTHORIZED', message: 'Sesión caducada' });
    expect(normalizeUiError(jsonStr)).toBe('Sesión caducada');
  });

  it('handles object with {code, message}', () => {
    const errObj = { code: 'UNAUTHORIZED', message: 'Sesión ausente o expirada' };
    expect(normalizeUiError(errObj)).toBe('Sesión ausente o expirada');
  });

  it('handles object with only {code}', () => {
    const errObj = { code: 'ACCESS_DENIED' };
    expect(normalizeUiError(errObj)).toBe('ACCESS_DENIED');
  });

  it('handles message at the top level', () => {
    const errObj = { message: 'El recurso solicitado no existe' };
    expect(normalizeUiError(errObj)).toBe('El recurso solicitado no existe');
  });

  it('handles deeply nested error {error: {code, message}}', () => {
    const errObj = {
      error: {
        code: 'TOKEN_INVALID',
        message: 'Firma de token no coincide con el emisor'
      }
    };
    expect(normalizeUiError(errObj)).toBe('Firma de token no coincide con el emisor');
  });

  it('handles Error instances', () => {
    const err = new Error('Fallo crítico de red');
    expect(normalizeUiError(err)).toBe('Fallo crítico de red');
  });

  it('handles null, undefined, empty bodies, and non-JSON objects safely with localized fallback', () => {
    expect(normalizeUiError(null)).toBe('Ha ocurrido un error inesperado');
    expect(normalizeUiError(undefined)).toBe('Ha ocurrido un error inesperado');
    expect(normalizeUiError('')).toBe('Ha ocurrido un error inesperado');
    expect(normalizeUiError('   ')).toBe('Ha ocurrido un error inesperado');
    expect(normalizeUiError({}, 'Mensaje personalizado')).toBe('Mensaje personalizado');
    expect(normalizeUiError({ unhandledField: 123 }, 'Error seguro')).toBe('Error seguro');
  });

  it('never returns an object or exposes raw objects to React children', () => {
    const maliciousPayload = {
      stack: 'Error: boom\n    at ...',
      internal_trace: 'db_secret_key',
      raw_buffer: Buffer.from('abc')
    };
    const result = normalizeUiError(maliciousPayload);
    expect(typeof result).toBe('string');
    expect(result).not.toContain('db_secret_key');
    expect(result).toBe('Ha ocurrido un error inesperado');
  });
});
