import {
  buildAdjacencyList,
  shortestPath,
} from "./graph";
import {
  type WarehouseFloor,
} from "../data/warehouseDataExactFromDXF";

export type PickStop = {
  locationId: string;
  order: number;
};

export type OptimizedRoute = {
  stops: PickStop[];
  segments: { from: string; to: string; path: string[]; distance: number }[];
  totalDistance: number;
};

/**
 * Nearest-neighbor TSP heuristic followed by 2-opt improvement.
 * Returns an ordered list of stops and the full path segments.
 */
export function optimizePickingRoute(
  locationIds: string[],
  floor: WarehouseFloor,
  startNodeId?: string,
): OptimizedRoute {
  if (locationIds.length === 0) {
    return { stops: [], segments: [], totalDistance: 0 };
  }

  const adj = buildAdjacencyList(floor);

  const nodeIds = [...locationIds];
  if (startNodeId && !nodeIds.includes(startNodeId)) {
    nodeIds.unshift(startNodeId);
  }

  const distCache = new Map<string, Map<string, number>>();
  const pathCache = new Map<string, Map<string, string[]>>();

  function getCachedPath(from: string, to: string) {
    if (pathCache.get(from)?.has(to)) {
      return {
        path: pathCache.get(from)!.get(to)!,
        distance: distCache.get(from)!.get(to)!,
      };
    }

    const result = shortestPath(adj, from, to);

    if (!distCache.has(from)) distCache.set(from, new Map());
    distCache.get(from)!.set(to, result.distance);
    if (!pathCache.has(from)) pathCache.set(from, new Map());
    pathCache.get(from)!.set(to, result.path);

    if (!distCache.has(to)) distCache.set(to, new Map());
    distCache.get(to)!.set(from, result.distance);
    if (!pathCache.has(to)) pathCache.set(to, new Map());
    pathCache.get(to)!.set(from, [...result.path].reverse());

    return result;
  }

  // Nearest-neighbor ordering
  const remaining = new Set(locationIds);
  const ordered: string[] = [];

  let current = startNodeId ?? locationIds[0];
  if (!startNodeId) {
    remaining.delete(current);
  }
  ordered.push(current);

  while (remaining.size > 0) {
    let bestNext = "";
    let bestDist = Infinity;

    for (const candidate of remaining) {
      const { distance } = getCachedPath(current, candidate);
      if (distance < bestDist) {
        bestDist = distance;
        bestNext = candidate;
      }
    }

    if (bestNext === "" || bestDist === Infinity) {
      for (const r of remaining) ordered.push(r);
      break;
    }

    ordered.push(bestNext);
    remaining.delete(bestNext);
    current = bestNext;
  }

  // 2-opt improvement
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < ordered.length - 1; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const segBefore =
          getCachedPath(ordered[i - 1], ordered[i]).distance +
          (j + 1 < ordered.length
            ? getCachedPath(ordered[j], ordered[j + 1]).distance
            : 0);
        const segAfter =
          getCachedPath(ordered[i - 1], ordered[j]).distance +
          (j + 1 < ordered.length
            ? getCachedPath(ordered[i], ordered[j + 1]).distance
            : 0);

        if (segAfter < segBefore) {
          const reversed = ordered.slice(i, j + 1).reverse();
          ordered.splice(i, j - i + 1, ...reversed);
          improved = true;
        }
      }
    }
  }

  // Build final segments
  const segments: OptimizedRoute["segments"] = [];
  let totalDistance = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    const { path, distance } = getCachedPath(ordered[i], ordered[i + 1]);
    segments.push({ from: ordered[i], to: ordered[i + 1], path, distance });
    totalDistance += distance;
  }

  const startOffset = startNodeId && !locationIds.includes(startNodeId) ? 1 : 0;
  const stops = ordered.slice(startOffset).map((id, idx) => ({
    locationId: id,
    order: idx + 1,
  }));

  return { stops, segments, totalDistance };
}
