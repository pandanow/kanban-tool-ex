// happy-dom does not implement ResizeObserver, which the table uses to measure its
// scroll viewport. A stub that never fires is correct here: the component falls back to
// the initial viewport height, which is all the virtualizer needs in a test.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
}
