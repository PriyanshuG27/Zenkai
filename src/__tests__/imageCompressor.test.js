import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compressGymImage } from '../utils/imageCompressor';

describe('imageCompressor', () => {
  const originalFileReader = global.FileReader;
  const originalImage = global.Image;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalFileReader) global.FileReader = originalFileReader;
    if (originalImage) global.Image = originalImage;
  });

  it('compresses gym images successfully', async () => {
    const mockFileReader = {
      readAsDataURL: vi.fn(function(file) {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/jpeg;base64,mockbase64' } });
          }
        }, 0);
      }),
      onerror: null,
      onload: null,
    };
    global.FileReader = vi.fn().mockImplementation(function() {
      return mockFileReader;
    });

    const mockImage = {
      onload: null,
      onerror: null,
      set src(value) {
        this.width = 1200;
        this.height = 800;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    };
    global.Image = vi.fn().mockImplementation(function() {
      return mockImage;
    });

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
      })),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,compressedbase64'),
    };
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') return mockCanvas;
      return {};
    });

    const file = new File([''], 'gym.jpg', { type: 'image/jpeg' });
    const result = await compressGymImage(file, 1024, 0.7);

    expect(result).toBe('compressedbase64');
    expect(mockCanvas.width).toBe(1024);
    expect(mockCanvas.height).toBe(683);
  });

  it('handles vertical image formatting and scaling correctly', async () => {
    const mockFileReader = {
      readAsDataURL: vi.fn(function(file) {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/jpeg;base64,mockbase64' } });
          }
        }, 0);
      }),
    };
    global.FileReader = vi.fn().mockImplementation(function() {
      return mockFileReader;
    });

    const mockImage = {
      set src(value) {
        this.width = 800;
        this.height = 1200;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    };
    global.Image = vi.fn().mockImplementation(function() {
      return mockImage;
    });

    const mockCanvas = {
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,compressedbase64'),
    };
    vi.spyOn(document, 'createElement').mockImplementation(() => mockCanvas);

    const file = new File([''], 'gym.jpg', { type: 'image/jpeg' });
    const result = await compressGymImage(file, 1024, 0.7);

    expect(result).toBe('compressedbase64');
    expect(mockCanvas.width).toBe(683);
    expect(mockCanvas.height).toBe(1024);
  });

  it('handles FileReader error correctly', async () => {
    const mockFileReader = {
      readAsDataURL: vi.fn(function(file) {
        setTimeout(() => {
          if (this.onerror) {
            this.onerror(new Error('Mock FileReader Error'));
          }
        }, 0);
      }),
    };
    global.FileReader = vi.fn().mockImplementation(function() {
      return mockFileReader;
    });

    const file = new File([''], 'gym.jpg', { type: 'image/jpeg' });
    await expect(compressGymImage(file)).rejects.toThrow('Failed to read image file stream: Mock FileReader Error');
  });

  it('handles Image onerror correctly', async () => {
    const mockFileReader = {
      readAsDataURL: vi.fn(function(file) {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/jpeg;base64,mockbase64' } });
          }
        }, 0);
      }),
    };
    global.FileReader = vi.fn().mockImplementation(function() {
      return mockFileReader;
    });

    const mockImage = {
      set src(value) {
        setTimeout(() => {
          if (this.onerror) {
            this.onerror(new Error('Mock Image Error'));
          }
        }, 0);
      }
    };
    global.Image = vi.fn().mockImplementation(function() {
      return mockImage;
    });

    const file = new File([''], 'gym.jpg', { type: 'image/jpeg' });
    await expect(compressGymImage(file)).rejects.toThrow('Failed to load image element into DOM: Mock Image Error');
  });
});
