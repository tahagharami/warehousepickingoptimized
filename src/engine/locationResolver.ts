import {
  getAllLocationIds,
  type WarehouseFloor,
} from "../data/warehouseDataExactFromDXF";

/**
 * Resolve a PDF location code to the closest matching app location ID.
 *
 * PDF locations like "90307" (from "90307D") need to match app IDs like "90307".
 * For IP/P locations, PDF has longer codes (e.g. "IP91001" from "IP91001A")
 * while app has shorter ones (e.g. "IP901"). We try exact match first,
 * then progressively shorter prefixes.
 */
export function resolvePdfLocationToAppId(
  pdfLocationNormalized: string,
  floor: WarehouseFloor,
): string | null {
  const allIds = getAllLocationIds(floor);
  const idSet = new Set(allIds);

  // Exact match
  if (idSet.has(pdfLocationNormalized)) {
    return pdfLocationNormalized;
  }

  // For IP/P prefixed locations, try shorter versions
  if (
    pdfLocationNormalized.startsWith("IP") ||
    pdfLocationNormalized.startsWith("P")
  ) {
    // Try progressively shorter until we find a match
    for (let len = pdfLocationNormalized.length - 1; len >= 3; len--) {
      const prefix = pdfLocationNormalized.slice(0, len);
      if (idSet.has(prefix)) {
        return prefix;
      }
    }

    // Try matching by prefix — find app IDs that start with the same prefix
    const prefixLen = pdfLocationNormalized.startsWith("IP") ? 3 : 2;
    const prefix = pdfLocationNormalized.slice(0, prefixLen);
    const candidates = allIds.filter((id) => id.startsWith(prefix));
    if (candidates.length > 0) {
      // Find the closest match by common prefix length
      let bestMatch = candidates[0];
      let bestLen = 0;
      for (const candidate of candidates) {
        let common = 0;
        for (
          let i = 0;
          i < Math.min(candidate.length, pdfLocationNormalized.length);
          i++
        ) {
          if (candidate[i] === pdfLocationNormalized[i]) common++;
          else break;
        }
        if (common > bestLen) {
          bestLen = common;
          bestMatch = candidate;
        }
      }
      return bestMatch;
    }
  }

  // For numeric locations, try shorter prefixes
  for (let len = pdfLocationNormalized.length - 1; len >= 4; len--) {
    const prefix = pdfLocationNormalized.slice(0, len);
    if (idSet.has(prefix)) {
      return prefix;
    }
  }

  return null;
}

export type ResolvedItem = {
  itemCode: string;
  dna: string;
  qtyToPick: number;
  unit: string;
  originalLocation: string;
  resolvedLocation: string | null;
  inventoryAtLocation: number;
  sourceMnb: string;
};

/**
 * Resolve all picking list items to app location IDs.
 * Returns items with resolved locations and a list of unresolved ones.
 */
export function resolvePickingListLocations(
  items: {
    itemCode: string;
    dna: string;
    qtyToPick: number;
    unit: string;
    pickLocation: string;
    inventoryAtLocation: number;
    sourceMnb: string;
  }[],
  floor: WarehouseFloor,
): { resolved: ResolvedItem[]; unresolved: ResolvedItem[] } {
  const resolved: ResolvedItem[] = [];
  const unresolved: ResolvedItem[] = [];

  for (const item of items) {
    const resolvedLoc = item.pickLocation
      ? resolvePdfLocationToAppId(item.pickLocation, floor)
      : null;

    const resolvedItem: ResolvedItem = {
      itemCode: item.itemCode,
      dna: item.dna,
      qtyToPick: item.qtyToPick,
      unit: item.unit,
      originalLocation: item.pickLocation,
      resolvedLocation: resolvedLoc,
      inventoryAtLocation: item.inventoryAtLocation,
      sourceMnb: item.sourceMnb,
    };

    if (resolvedLoc) {
      resolved.push(resolvedItem);
    } else {
      unresolved.push(resolvedItem);
    }
  }

  return { resolved, unresolved };
}
