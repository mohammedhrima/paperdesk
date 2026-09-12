import { OPS, Util, type PageViewport, type PDFPageProxy } from 'pdfjs-dist';

/** A rectangle in viewport (CSS pixel) coordinates. */
export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type Matrix = [number, number, number, number, number, number];

/** The transform an image was painted under, mapping its unit square into page space. */
export type ImagePlacement = Matrix;

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Operators that paint a raster image into the unit square of the current transform. */
const IMAGE_OPS = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject]);

export interface RegionFilter {
  /** Smallest area worth protecting, in square CSS pixels at scale 1. */
  readonly minArea: number;
  /** Largest share of the page an image may cover and still be protected. */
  readonly maxCoverage: number;
}

/**
 * Finds where raster images are painted on a page.
 *
 * The operator list is the page's drawing program. Walking it while tracking the
 * transformation matrix — through `save`/`restore`, form XObjects and
 * transparency groups — tells us exactly which rectangle each image lands in,
 * without having to guess from pixels.
 *
 * Image masks are deliberately skipped: they are single-colour stencils (logos,
 * glyph-like icons) that belong with the text and should invert along with it.
 */
export async function findImagePlacements(page: PDFPageProxy): Promise<ImagePlacement[]> {
  const { fnArray, argsArray } = await page.getOperatorList();
  const placements: Matrix[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [...IDENTITY];

  const push = (matrix?: unknown) => {
    stack.push(ctm);
    if (isMatrix(matrix)) ctm = Util.transform(ctm, matrix) as Matrix;
  };
  const pop = () => {
    ctm = stack.pop() ?? [...IDENTITY];
  };

  for (let i = 0; i < fnArray.length; i += 1) {
    const op = fnArray[i];
    const args = argsArray[i] as unknown[] | null;

    switch (op) {
      case OPS.save:
        push();
        break;
      case OPS.restore:
        pop();
        break;
      case OPS.transform:
        if (isMatrix(args)) ctm = Util.transform(ctm, args) as Matrix;
        break;
      case OPS.paintFormXObjectBegin:
        push(args?.[0]);
        break;
      case OPS.paintFormXObjectEnd:
        pop();
        break;
      case OPS.beginGroup:
        push((args?.[0] as { matrix?: unknown } | undefined)?.matrix);
        break;
      case OPS.endGroup:
        pop();
        break;
      default:
        if (op !== undefined && IMAGE_OPS.has(op)) placements.push(ctm);
    }
  }

  return placements;
}

/**
 * Projects image placements onto a viewport and discards those not worth
 * protecting. Kept separate from {@link findImagePlacements} so the expensive
 * operator-list walk runs once per page, not once per zoom level.
 */
export function projectRegions(
  placements: readonly ImagePlacement[],
  viewport: PageViewport,
  filter: RegionFilter,
): Region[] {
  const pageArea = viewport.width * viewport.height;
  // Area thresholds are expressed at scale 1 so zooming does not change which
  // images count as "small".
  const minArea = filter.minArea * viewport.scale * viewport.scale;

  return placements
    .map((ctm) => unitSquareBounds(Util.transform(viewport.transform, ctm) as Matrix))
    .map((region) => clip(region, viewport.width, viewport.height))
    .filter((region) => {
      const area = region.width * region.height;
      return area >= minArea && area / pageArea <= filter.maxCoverage;
    });
}

/** Bounding box of the unit square [0,1]² under `matrix`. */
function unitSquareBounds(matrix: Matrix): Region {
  const corners = [
    Util.applyTransform([0, 0], matrix),
    Util.applyTransform([1, 0], matrix),
    Util.applyTransform([0, 1], matrix),
    Util.applyTransform([1, 1], matrix),
  ];
  const xs = corners.map((point) => point[0] ?? 0);
  const ys = corners.map((point) => point[1] ?? 0);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function clip(region: Region, width: number, height: number): Region {
  const x = Math.max(0, region.x);
  const y = Math.max(0, region.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(width, region.x + region.width) - x),
    height: Math.max(0, Math.min(height, region.y + region.height) - y),
  };
}

function isMatrix(value: unknown): value is Matrix {
  return Array.isArray(value) && value.length === 6 && value.every((n) => typeof n === 'number');
}
