type Uv = { u: number; v: number };

type UvMap<TUv extends Uv = Uv> = Map<string, TUv>;

export type AtlasResult<TUv extends Uv = Uv> = {
  canvas: HTMLCanvasElement;
  uvMap: UvMap<TUv>;
  gridSize: number;
  cellSize: number;
  previewURL: string;
};
