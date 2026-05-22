import {
  getFloorData,
  type WarehouseFloor,
} from "../data/warehouseDataExactFromDXF";

export type GraphNode = {
  id: string;
  x: number;
  y: number;
  type: string;
};

export type GraphEdge = {
  from: string;
  to: string;
  distance: number;
};

export type AdjEntry = { to: string; distance: number };

export function buildAdjacencyList(
  floor: WarehouseFloor,
): Map<string, AdjEntry[]> {
  const { graph, locations } = getFloorData(floor);
  const adj = new Map<string, AdjEntry[]>();

  const ensure = (id: string) => {
    if (!adj.has(id)) adj.set(id, []);
  };

  // Nav graph nodes
  const nodeCoords = new Map<string, { x: number; y: number }>();
  for (const node of graph.nodes) {
    ensure(node.id);
    nodeCoords.set(node.id, { x: node.x, y: node.y });
  }

  // Nav graph edges
  for (const edge of graph.edges) {
    ensure(edge.from);
    ensure(edge.to);
    adj.get(edge.from)!.push({ to: edge.to, distance: edge.distance });
    adj.get(edge.to)!.push({ to: edge.from, distance: edge.distance });
  }

  // Connect each location to its nearestNavNode
  for (const loc of locations as readonly { id: string; x: number; y: number; nearestNavNode?: string }[]) {
    if (!loc.nearestNavNode) continue;
    const navCoords = nodeCoords.get(loc.nearestNavNode);
    if (!navCoords) continue;

    const dx = loc.x - navCoords.x;
    const dy = loc.y - navCoords.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    ensure(loc.id);
    adj.get(loc.id)!.push({ to: loc.nearestNavNode, distance: dist });
    adj.get(loc.nearestNavNode)!.push({ to: loc.id, distance: dist });
  }

  return adj;
}

export function dijkstra(
  adj: Map<string, AdjEntry[]>,
  start: string,
): { dist: Map<string, number>; prev: Map<string, string | null> } {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();

  for (const id of adj.keys()) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }
  dist.set(start, 0);

  while (true) {
    let u: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null) break;
    visited.add(u);

    for (const { to, distance } of adj.get(u) ?? []) {
      const alt = best + distance;
      if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt);
        prev.set(to, u);
      }
    }
  }

  return { dist, prev };
}

export function shortestPath(
  adj: Map<string, AdjEntry[]>,
  from: string,
  to: string,
): { path: string[]; distance: number } {
  const { dist, prev } = dijkstra(adj, from);
  const d = dist.get(to);
  if (d === undefined || d === Infinity) return { path: [], distance: Infinity };

  const path: string[] = [];
  let cur: string | null = to;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return { path, distance: d };
}

export function allPairsDistances(
  adj: Map<string, AdjEntry[]>,
  nodeIds: string[],
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const id of nodeIds) {
    const { dist } = dijkstra(adj, id);
    const row = new Map<string, number>();
    for (const target of nodeIds) {
      row.set(target, dist.get(target) ?? Infinity);
    }
    result.set(id, row);
  }
  return result;
}

export function getLocationNodeId(
  locationId: string,
  floor: WarehouseFloor,
): string | null {
  const { locations } = getFloorData(floor);
  const loc = locations.find(
    (l: { id: string }) => l.id === locationId,
  );
  return loc ? locationId : null;
}

export function getLocationCoords(
  locationId: string,
  floor: WarehouseFloor,
): { x: number; y: number } | null {
  const { locations } = getFloorData(floor);
  const loc = locations.find(
    (l: { id: string }) => l.id === locationId,
  );
  if (!loc) return null;
  return { x: loc.x, y: loc.y };
}
