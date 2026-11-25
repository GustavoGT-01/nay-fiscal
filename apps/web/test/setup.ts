import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom nao tem ResizeObserver nem document.fonts, que o Seg usa para posicionar o marcador
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });

afterEach(() => cleanup());
