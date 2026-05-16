// Shim canvas globals that jsdom doesn't ship but Univer drawing plugins reference
// at module load time. createEditor unit tests use _editorFactory and never run the
// real canvas path, so empty stubs are enough to let module imports complete.

class FakePath2D {
  addPath(): void {}
  arc(): void {}
  arcTo(): void {}
  bezierCurveTo(): void {}
  closePath(): void {}
  ellipse(): void {}
  lineTo(): void {}
  moveTo(): void {}
  quadraticCurveTo(): void {}
  rect(): void {}
  roundRect(): void {}
}

if (typeof globalThis.Path2D === 'undefined') {
  ;(globalThis as unknown as { Path2D: typeof FakePath2D }).Path2D = FakePath2D
}

class FakeOffscreenCanvas {
  width: number
  height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
  getContext(): null {
    return null
  }
}

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  ;(globalThis as unknown as { OffscreenCanvas: typeof FakeOffscreenCanvas }).OffscreenCanvas =
    FakeOffscreenCanvas
}
