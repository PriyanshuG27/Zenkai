import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callZenkaiAPI } from '../lib/apiClient';
import { auth } from '../lib/firebase';

vi.mock('../lib/firebase', () => ({
  auth: { currentUser: null },
  db: {}
}));

describe('apiClient', () => {
  let fetchSpy;
  let consoleLogSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    auth.currentUser = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('callZenkaiAPI', () => {
    it('throws error if currentUser is missing', async () => {
      auth.currentUser = null;

      await expect(callZenkaiAPI('testEndpoint', { foo: 'bar' }))
        .rejects.toThrow('Operation blocked: Missing authenticated profile context.');
    });

    it('successfully calls API and returns wrapped result', async () => {
      const mockGetIdToken = vi.fn().mockResolvedValue('mock-jwt-token');
      auth.currentUser = {
        getIdToken: mockGetIdToken
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success', data: 'hello' })
      });

      const response = await callZenkaiAPI('testEndpoint', { foo: 'bar' });

      expect(mockGetIdToken).toHaveBeenCalledWith(); // no forced refresh — uses cached token
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/testEndpoint'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock-jwt-token'
          },
          body: JSON.stringify({ foo: 'bar' })
        })
      );
      expect(response).toEqual({ data: { status: 'success', data: 'hello' } });
    });

    it('throws custom error message on bad response', async () => {
      auth.currentUser = {
        getIdToken: vi.fn().mockResolvedValue('token')
      };

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad parameter payload' })
      });

      await expect(callZenkaiAPI('testEndpoint', {}))
        .rejects.toThrow('Bad parameter payload');
    });

    it('throws default error message on bad response with no error field', async () => {
      auth.currentUser = {
        getIdToken: vi.fn().mockResolvedValue('token')
      };

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('No JSON'); }
      });

      await expect(callZenkaiAPI('testEndpoint', {}))
        .rejects.toThrow('Server network exception: 500');
    });

    it('throws AbortError on timeout', async () => {
      auth.currentUser = {
        getIdToken: vi.fn().mockResolvedValue('token')
      };

      const abortError = new Error('The user aborted a request.');
      abortError.name = 'AbortError';
      fetchSpy.mockRejectedValueOnce(abortError);

      await expect(callZenkaiAPI('testEndpoint', {}, 50))
        .rejects.toThrow('Request timed out. Please try again.');
    });

    it('rethrows other errors', async () => {
      auth.currentUser = {
        getIdToken: vi.fn().mockResolvedValue('token')
      };

      fetchSpy.mockRejectedValueOnce(new Error('DNS Failure'));

      await expect(callZenkaiAPI('testEndpoint', {}))
        .rejects.toThrow('DNS Failure');
    });
  });


});
