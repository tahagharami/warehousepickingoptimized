/**
 * Transforms raw DXF coordinates to SVG viewport coordinates.
 *
 * The SVG maps in warehouseSvg.ts use a clipBBox to transform DXF space:
 *   9th floor clipBBox: [3450, -6500, 6800, -3600]  → viewBox 0 0 1800 1575.67
 *   8th floor clipBBox: [3350, -3350, 6850, -850]   → viewBox 0 0 1800 1322.86
 *
 * Transform: svgX = (dxfX - clipMinX) / (clipMaxX - clipMinX) * svgWidth
 *            svgY = (dxfY - clipMinY) / (clipMaxY - clipMinY) * svgHeight
 *
 * Note: DXF Y is negative (increases downward in CAD), so clipMinY < clipMaxY
 * but in the SVG, Y=0 is top. The transform maps clipMinY (most negative = top)
 * to svgY=0.
 */

import type { WarehouseFloor } from "../data/warehouseDataExactFromDXF";

type FloorConfig = {
  clipBBox: [number, number, number, number]; // [minX, minY, maxX, maxY] in DXF space
  svgWidth: number;
  svgHeight: number;
};

const FLOOR_CONFIGS: Record<WarehouseFloor, FloorConfig> = {
  "9": {
    clipBBox: [3450, -6500, 6800, -3600],
    svgWidth: 1800,
    svgHeight: 1575.67,
  },
  "8": {
    clipBBox: [3350, -3350, 6850, -850],
    svgWidth: 1800,
    svgHeight: 1322.86,
  },
};

export function dxfToSvg(
  dxfX: number,
  dxfY: number,
  floor: WarehouseFloor,
): { x: number; y: number } {
  const cfg = FLOOR_CONFIGS[floor];
  const [minX, minY, maxX, maxY] = cfg.clipBBox;
  const x = ((dxfX - minX) / (maxX - minX)) * cfg.svgWidth;
  const y = ((dxfY - minY) / (maxY - minY)) * cfg.svgHeight;
  return { x, y };
}

export function getFloorSvgDimensions(floor: WarehouseFloor) {
  const cfg = FLOOR_CONFIGS[floor];
  return { width: cfg.svgWidth, height: cfg.svgHeight };
}
