import { useMemo, useRef, useCallback } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import {
  getFloorData,
  type WarehouseFloor,
} from "../data/warehouseDataExactFromDXF";
import { warehouseSvgs } from "../data/warehouseSvg";
import { dxfToSvg, getFloorSvgDimensions } from "../engine/coordTransform";
import type { OptimizedRoute } from "../engine/optimizer";
import "./WarehouseMap.css";

const LOCATION_RADIUS = 4;
const PALLET_SIZE = 8;
const NAV_NODE_RADIUS = 3;

type TransformedLocation = {
  id: string;
  x: number;
  y: number;
  svgX: number;
  svgY: number;
  originalLabel: string;
  rack?: string;
  slot?: string;
  type: string;
};

type RackGroup = {
  rackId: string;
  locations: { id: string; svgX: number; svgY: number; originalLabel: string; slot: string }[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function getRackColor(rackId: string): string {
  const colors = [
    "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
    "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
    "#14b8a6", "#e11d48", "#0ea5e9", "#a855f7", "#65a30d",
  ];
  let hash = 0;
  for (let i = 0; i < rackId.length; i++) {
    hash = rackId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

type WarehouseMapProps = {
  floor: WarehouseFloor;
  route: OptimizedRoute | null;
  highlightedLocations: Set<string>;
  onLocationClick?: (locationId: string) => void;
};

export function WarehouseMap({ floor, route, highlightedLocations, onLocationClick }: WarehouseMapProps) {
  const { locations, graph } = getFloorData(floor);
  const svgDims = getFloorSvgDimensions(floor);
  const svgRef = useRef<SVGSVGElement>(null);

  const svgBackground = warehouseSvgs[floor];

  // Transform all locations to SVG coordinates
  const transformedLocations = useMemo((): TransformedLocation[] => {
    return (locations as readonly { id: string; x: number; y: number; originalLabel: string; rack?: string; slot?: string; type: string }[]).map((loc) => {
      const { x, y } = dxfToSvg(loc.x, loc.y, floor);
      return {
        id: loc.id,
        x: loc.x,
        y: loc.y,
        svgX: x,
        svgY: y,
        originalLabel: loc.originalLabel,
        rack: loc.rack,
        slot: loc.slot,
        type: loc.type,
      };
    });
  }, [locations, floor]);

  // Group by rack
  const rackGroups = useMemo((): RackGroup[] => {
    const map = new Map<string, RackGroup>();
    for (const loc of transformedLocations) {
      if (!loc.rack) continue;
      if (!map.has(loc.rack)) {
        map.set(loc.rack, {
          rackId: loc.rack,
          locations: [],
          minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
        });
      }
      const group = map.get(loc.rack)!;
      group.locations.push({
        id: loc.id,
        svgX: loc.svgX,
        svgY: loc.svgY,
        originalLabel: loc.originalLabel,
        slot: loc.slot ?? "",
      });
      group.minX = Math.min(group.minX, loc.svgX);
      group.minY = Math.min(group.minY, loc.svgY);
      group.maxX = Math.max(group.maxX, loc.svgX);
      group.maxY = Math.max(group.maxY, loc.svgY);
    }
    return [...map.values()];
  }, [transformedLocations]);

  // Separate pallet/special locations
  const palletLocations = useMemo(() => {
    return transformedLocations.filter(
      (l: { id: string }) => l.id.startsWith("IP") || l.id.startsWith("P"),
    );
  }, [transformedLocations]);

  const regularLocations = useMemo(() => {
    return transformedLocations.filter(
      (l: { id: string }) => !l.id.startsWith("IP") && !l.id.startsWith("P"),
    );
  }, [transformedLocations]);

  // Navigation graph in SVG coords
  const navNodes = useMemo(() => {
    return (graph.nodes as readonly { id: string; x: number; y: number; type: string }[]).map((n) => {
      const { x, y } = dxfToSvg(n.x, n.y, floor);
      return { id: n.id, type: n.type, svgX: x, svgY: y };
    });
  }, [graph.nodes, floor]);

  const navEdges = useMemo(() => {
    const nodeMap = new Map<string, { svgX: number; svgY: number }>();
    for (const n of navNodes) {
      nodeMap.set(n.id, { svgX: n.svgX, svgY: n.svgY });
    }
    return (graph.edges as readonly { from: string; to: string; distance: number }[])
      .map((e) => {
        const fromNode = nodeMap.get(e.from);
        const toNode = nodeMap.get(e.to);
        if (!fromNode || !toNode) return null;
        return { from: e.from, to: e.to, x1: fromNode.svgX, y1: fromNode.svgY, x2: toNode.svgX, y2: toNode.svgY };
      })
      .filter((e): e is { from: string; to: string; x1: number; y1: number; x2: number; y2: number } => e !== null);
  }, [graph.edges, navNodes]);

  // Route path in SVG coordinates
  const routePathPoints = useMemo(() => {
    if (!route || route.segments.length === 0) return [];

    const allLocMap = new Map<string, { svgX: number; svgY: number }>();
    for (const loc of transformedLocations) {
      allLocMap.set(loc.id, { svgX: loc.svgX, svgY: loc.svgY });
    }
    for (const n of navNodes) {
      allLocMap.set(n.id, { svgX: n.svgX, svgY: n.svgY });
    }

    const points: { x: number; y: number }[] = [];
    for (const seg of route.segments) {
      for (let i = 0; i < seg.path.length; i++) {
        const node = allLocMap.get(seg.path[i]);
        if (node) {
          if (points.length === 0 || points[points.length - 1].x !== node.svgX || points[points.length - 1].y !== node.svgY) {
            points.push({ x: node.svgX, y: node.svgY });
          }
        }
      }
    }
    return points;
  }, [route, transformedLocations, navNodes]);

  // Stop markers for route
  const routeStops = useMemo(() => {
    if (!route) return [];
    const allLocMap = new Map<string, { svgX: number; svgY: number }>();
    for (const loc of transformedLocations) {
      allLocMap.set(loc.id, { svgX: loc.svgX, svgY: loc.svgY });
    }
    return route.stops
      .map((s) => {
        const coords = allLocMap.get(s.locationId);
        if (!coords) return null;
        return { ...s, svgX: coords.svgX, svgY: coords.svgY };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [route, transformedLocations]);

  const handleLocationClick = useCallback(
    (id: string) => {
      onLocationClick?.(id);
    },
    [onLocationClick],
  );

  // Parse SVG string and extract just the inner content (skip the outer <svg> tag)
  const svgInnerContent = useMemo(() => {
    const match = svgBackground.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    return match ? match[1] : "";
  }, [svgBackground]);

  const rackPad = 6;

  return (
    <div className="warehouse-map">
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={20}
        centerOnInit
        limitToBounds={false}
        wheel={{ step: 0.12 }}
      >
        <TransformComponent
          wrapperClass="warehouse-map__transform-wrapper"
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: "100%", height: "100%" }}
        >
          <svg
            ref={svgRef}
            className="warehouse-map__svg"
            viewBox={`0 0 ${svgDims.width} ${svgDims.height}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* White background */}
            <rect x="0" y="0" width={svgDims.width} height={svgDims.height} fill="#ffffff" />

            {/* DXF geometry background layer */}
            <g id="dxf-background" opacity="0.35" dangerouslySetInnerHTML={{ __html: svgInnerContent }} />

            {/* Navigation graph edges */}
            <g id="nav-edges" opacity="0.15">
              {navEdges.map((e, i) => (
                <line
                  key={`nav-edge-${i}`}
                  x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6 3"
                />
              ))}
            </g>

            {/* Navigation graph nodes */}
            <g id="nav-nodes" opacity="0.2">
              {navNodes.map((n) => (
                <circle
                  key={n.id} cx={n.svgX} cy={n.svgY} r={NAV_NODE_RADIUS}
                  fill="#94a3b8" stroke="#64748b" strokeWidth="0.5"
                />
              ))}
            </g>

            {/* Rack bounding boxes */}
            <g id="rack-boxes">
              {rackGroups.map((rack) => (
                <g key={rack.rackId}>
                  <rect
                    x={rack.minX - rackPad}
                    y={rack.minY - rackPad}
                    width={Math.max(rack.maxX - rack.minX + rackPad * 2, rackPad * 3)}
                    height={Math.max(rack.maxY - rack.minY + rackPad * 2, rackPad * 3)}
                    fill={getRackColor(rack.rackId)}
                    fillOpacity="0.08"
                    stroke={getRackColor(rack.rackId)}
                    strokeWidth="0.8"
                    strokeOpacity="0.4"
                    rx="2"
                  />
                  <text
                    x={rack.minX - rackPad + 2}
                    y={rack.minY - rackPad - 2}
                    fontSize="7"
                    fill={getRackColor(rack.rackId)}
                    fontFamily="Arial, sans-serif"
                    fontWeight="600"
                    opacity="0.7"
                  >
                    {rack.rackId}
                  </text>
                </g>
              ))}
            </g>

            {/* Regular location dots */}
            <g id="regular-locations">
              {regularLocations.map((loc) => {
                const isHighlighted = highlightedLocations.has(loc.id);
                const isOnRoute = route?.stops.some((s) => s.locationId === loc.id);
                return (
                  <g key={loc.id} onClick={() => handleLocationClick(loc.id)} style={{ cursor: "pointer" }}>
                    <circle
                      cx={loc.svgX} cy={loc.svgY}
                      r={isHighlighted || isOnRoute ? LOCATION_RADIUS * 1.5 : LOCATION_RADIUS}
                      fill={isOnRoute ? "#ef4444" : isHighlighted ? "#f59e0b" : getRackColor(loc.rack ?? "default")}
                      stroke={isHighlighted || isOnRoute ? "#ffffff" : "none"}
                      strokeWidth={isHighlighted || isOnRoute ? "1" : "0"}
                      opacity={isHighlighted || isOnRoute ? 1 : 0.7}
                    />
                    <title>{loc.id} — {loc.originalLabel}</title>
                  </g>
                );
              })}
            </g>

            {/* Pallet locations (squares) */}
            <g id="pallet-locations">
              {palletLocations.map((loc) => {
                const isHighlighted = highlightedLocations.has(loc.id);
                const isOnRoute = route?.stops.some((s) => s.locationId === loc.id);
                const size = isHighlighted || isOnRoute ? PALLET_SIZE * 1.5 : PALLET_SIZE;
                return (
                  <g key={loc.id} onClick={() => handleLocationClick(loc.id)} style={{ cursor: "pointer" }}>
                    <rect
                      x={loc.svgX - size / 2}
                      y={loc.svgY - size / 2}
                      width={size}
                      height={size}
                      fill={isOnRoute ? "#ef4444" : isHighlighted ? "#f59e0b" : loc.id.startsWith("IP") ? "#8b5cf6" : "#06b6d4"}
                      stroke={isHighlighted || isOnRoute ? "#ffffff" : "none"}
                      strokeWidth={isHighlighted || isOnRoute ? "1" : "0"}
                      opacity={isHighlighted || isOnRoute ? 1 : 0.75}
                      rx="1"
                    />
                    <title>{loc.id} — {loc.originalLabel}</title>
                  </g>
                );
              })}
            </g>

            {/* Route path */}
            {routePathPoints.length > 1 && (
              <g id="route-path">
                <polyline
                  points={routePathPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.8"
                  strokeDasharray="8 4"
                />
                {/* Direction arrows along route */}
                {routePathPoints.filter((_p, i) => i > 0 && i % 4 === 0).map((p, i) => {
                  const prev = routePathPoints[Math.max(0, (i + 1) * 4 - 1)];
                  const angle = Math.atan2(p.y - prev.y, p.x - prev.x) * (180 / Math.PI);
                  return (
                    <polygon
                      key={`arrow-${i}`}
                      points="-3,-2 3,0 -3,2"
                      fill="#ef4444"
                      transform={`translate(${p.x},${p.y}) rotate(${angle})`}
                      opacity="0.8"
                    />
                  );
                })}
              </g>
            )}

            {/* Route stop markers */}
            {routeStops.length > 0 && (
              <g id="route-stops">
                {routeStops.map((stop) => (
                  <g key={`stop-${stop.locationId}`}>
                    <circle
                      cx={stop.svgX} cy={stop.svgY} r="8"
                      fill="#ef4444" stroke="#ffffff" strokeWidth="1.5"
                    />
                    <text
                      x={stop.svgX} y={stop.svgY + 3}
                      textAnchor="middle" fontSize="7" fill="#ffffff"
                      fontFamily="Arial, sans-serif" fontWeight="700"
                      pointerEvents="none"
                    >
                      {stop.order}
                    </text>
                  </g>
                ))}
              </g>
            )}
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
