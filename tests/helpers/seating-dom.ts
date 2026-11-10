// 座位安排的元件測試（jsdom）用：補上 jsdom 沒有、Radix 的 Popover／Dialog 會用到的瀏覽器 API。
// 只在缺少時才補，不覆蓋既有的實作。

export function installDomPolyfills(): void {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  }

  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }

  const proto = Element.prototype as unknown as Record<string, unknown>;
  if (typeof proto.scrollIntoView !== 'function') proto.scrollIntoView = () => {};
  if (typeof proto.hasPointerCapture !== 'function') proto.hasPointerCapture = () => false;
  if (typeof proto.setPointerCapture !== 'function') proto.setPointerCapture = () => {};
  if (typeof proto.releasePointerCapture !== 'function') proto.releasePointerCapture = () => {};

  const css = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS;
  if (!css || typeof css.escape !== 'function') {
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: { ...(css ?? {}), escape: (s: string) => s.replace(/([^\w-])/g, '\\$1') },
    });
  }
}
