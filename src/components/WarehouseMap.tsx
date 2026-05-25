import { useMemo, useRef, useCallback, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import {
  getFloorData,
  type WarehouseFloor,
} from "../data/warehouseDataExactFromDXF";
import { warehouseSvgs } from "../data/warehouseSvg";
import { dxfToSvg, svgToDxf, getFloorSvgDimensions } from "../engine/coordTransform";
import type { OptimizedRoute } from "../engine/optimizer";
import type { EditTool, LocationEdit } from "./LocationEditorPanel";
import "./WarehouseMap.css";

export type LocationCorrection = { x: number; y: number };

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
  color?: string;
  isAdded?: boolean;
};

type RackGroup = {
  rackId: string;
  locations: { id: string; svgX: number; svgY: number; originalLabel: string; slot: string }[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function getRackColor(rackId: string, rackColors?: Record<string, string>): string {
  if (rackColors?.[rackId]) return rackColors[rackId];
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
  normalRoute?: OptimizedRoute | null;
  showNormalRoute?: boolean;
  highlightedLocations: Set<string>;
  onLocationClick?: (locationId: string) => void;
  editMode?: boolean;
  activeTool?: EditTool;
  locationCorrections?: Record<string, LocationCorrection>;
  onLocationMove?: (locationId: string, dxfX: number, dxfY: number) => void;
  deletedLocations?: string[];
  addedLocations?: LocationEdit[];
  modifiedLocations?: Record<string, Partial<LocationEdit>>;
  rackColors?: Record<string, string>;
  selectedLocationId?: string | null;
  onMapClick?: (dxfX: number, dxfY: number) => void;
};

export function WarehouseMap({
  floor,
  route,
  normalRoute,
  showNormalRoute,
  highlightedLocations,
  onLocationClick,
  editMode,
  activeTool,
  locationCorrections,
  onLocationMove,
  deletedLocations,
  addedLocations,
  modifiedLocations,
  rackColors,
  selectedLocationId,
  onMapClick,
}: WarehouseMapProps) {
  const { locations, graph } = getFloorData(floor);
  const svgDims = getFloorSvgDimensions(floor);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ svgX: number; svgY: number } | null>(null);

  const svgBackground = warehouseSvgs[floor];
  const deletedSet = useMemo(() => new Set(deletedLocations ?? []), [deletedLocations]);

  // Transform all locations to SVG coordinates, applying corrections and mods
  const transformedLocations = useMemo((): TransformedLocation[] => {
    const baseLocs = (locations as readonly { id: string; x: number; y: number; originalLabel: string; rack?: string; slot?: string; type: string }[])
      .filter((loc) => !deletedSet.has(loc.id))
      .map((loc) => {
        const correction = locationCorrections?.[loc.id];
        const mod = modifiedLocations?.[loc.id];
        const dxfX = correction ? correction.x : loc.x;
        const dxfY = correction ? correction.y : loc.y;
        const { x, y } = dxfToSvg(dxfX, dxfY, floor);
        return {
          id: loc.id,
          x: dxfX,
          y: dxfY,
          svgX: x,
          svgY: y,
          originalLabel: mod?.originalLabel ?? loc.originalLabel,
          rack: mod?.rack ?? loc.rack,
          slot: mod?.slot ?? loc.slot,
          type: mod?.type ?? loc.type,
          color: mod?.color,
          isAdded: false,
        };
      });

    const added = (addedLocations ?? []).map((loc) => {
      const correction = locationCorrections?.[loc.id];
      const dxfX = correction ? correction.x : loc.x;
      const dxfY = correction ? correction.y : loc.y;
      const { x, y } = dxfToSvg(dxfX, dxfY, floor);
      return {
        id: loc.id,
        x: dxfX,
        y: dxfY,
        svgX: x,
        svgY: y,
        originalLabel: loc.originalLabel,
        rack: loc.rack || undefined,
        slot: loc.slot || undefined,
        type: loc.type,
        color: loc.color,
        isAdded: true,
      };
    });

    return [...baseLocs, ...added];
  }, [locations, floor, locationCorrections, deletedSet, addedLocations, modifiedLocations]);

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
      (l) => l.id.startsWith("IP") || l.id.startsWith("P"),
    );
  }, [transformedLocations]);

  const regularLocations = useMemo(() => {
    return transformedLocations.filter(
      (l) => !l.id.startsWith("IP") && !l.id.startsWith("P"),
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

  // Build combined location map for route rendering
  const allLocMap = useMemo(() => {
    const map = new Map<string, { svgX: number; svgY: number }>();
    for (const loc of transformedLocations) {
      map.set(loc.id, { svgX: loc.svgX, svgY: loc.svgY });
    }
    for (const n of navNodes) {
      map.set(n.id, { svgX: n.svgX, svgY: n.svgY });
    }
    return map;
  }, [transformedLocations, navNodes]);

  // Route path points helper
  function buildRoutePoints(r: OptimizedRoute): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    for (const seg of r.segments) {
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
  }

  // Route path in SVG coordinates
  const routePathPoints = useMemo(() => {
    if (!route || route.segments.length === 0) return [];
    return buildRoutePoints(route);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, allLocMap]);

  // Normal route path for ghost overlay
  const normalRoutePathPoints = useMemo(() => {
    if (!normalRoute || normalRoute.segments.length === 0) return [];
    return buildRoutePoints(normalRoute);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalRoute, allLocMap]);

  // Stop markers for route
  const routeStops = useMemo(() => {
    if (!route) return [];
    return route.stops
      .map((s) => {
        const coords = allLocMap.get(s.locationId);
        if (!coords) return null;
        return { ...s, svgX: coords.svgX, svgY: coords.svgY };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [route, allLocMap]);

  const handleLocationClick = useCallback(
    (id: string) => {
      onLocationClick?.(id);
    },
    [onLocationClick],
  );

  const screenToSvg = useCallback(
    (clientX: number, clientY: number): { svgX: number; svgY: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const svgPt = pt.matrixTransform(ctm.inverse());
      return { svgX: svgPt.x, svgY: svgPt.y };
    },
    [],
  );

  const handleDragStart = useCallback(
    (e: React.MouseEvent, locId: string) => {
      if (!editMode || (activeTool !== "move" && activeTool !== "select")) return;
      e.stopPropagation();
      e.preventDefault();
      setDragId(locId);
      const pos = screenToSvg(e.clientX, e.clientY);
      if (pos) setDragPos(pos);
    },
    [editMode, activeTool, screenToSvg],
  );

  const handleDragMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragId) return;
      const pos = screenToSvg(e.clientX, e.clientY);
      if (pos) setDragPos(pos);
    },
    [dragId, screenToSvg],
  );

  const handleDragEnd = useCallback(() => {
    if (!dragId || !dragPos) {
      setDragId(null);
      setDragPos(null);
      return;
    }
    const dxf = svgToDxf(dragPos.svgX, dragPos.svgY, floor);
    onLocationMove?.(dragId, dxf.x, dxf.y);
    setDragId(null);
    setDragPos(null);
  }, [dragId, dragPos, floor, onLocationMove]);

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!editMode || activeTool !== "add") return;
      const pos = screenToSvg(e.clientX, e.clientY);
      if (!pos) return;
      const dxf = svgToDxf(pos.svgX, pos.svgY, floor);
      onMapClick?.(dxf.x, dxf.y);
    },
    [editMode, activeTool, screenToSvg, floor, onMapClick],
  );

  // Parse SVG string and extract just the inner content (skip the outer <svg> tag)
  const svgInnerContent = useMemo(() => {
    const match = svgBackground.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    return match ? match[1] : "";
  }, [svgBackground]);

  const rackPad = 6;

  const canDrag = editMode && (activeTool === "move" || activeTool === "select");
  const isDeleteTool = editMode && activeTool === "delete";
  const isAddTool = editMode && activeTool === "add";

  function getLocationCursor(isDragging: boolean): string {
    if (isDeleteTool) return "not-allowed";
    if (canDrag) return isDragging ? "grabbing" : "grab";
    if (editMode) return "pointer";
    return "pointer";
  }

  return (
    <div className="warehouse-map">
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={20}
        centerOnInit
        limitToBounds={false}
        wheel={{ step: 0.12 }}
        panning={{ excluded: ["loc-draggable"] }}
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
            onMouseMove={canDrag ? handleDragMove : undefined}
            onMouseUp={canDrag ? handleDragEnd : undefined}
            onMouseLeave={canDrag ? handleDragEnd : undefined}
            onClick={isAddTool ? handleSvgClick : undefined}
            style={{ cursor: isAddTool ? "crosshair" : undefined }}
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
                    fill={getRackColor(rack.rackId, rackColors)}
                    fillOpacity="0.08"
                    stroke={getRackColor(rack.rackId, rackColors)}
                    strokeWidth="0.8"
                    strokeOpacity="0.4"
                    rx="2"
                  />
                  <text
                    x={rack.minX - rackPad + 2}
                    y={rack.minY - rackPad - 2}
                    fontSize="7"
                    fill={getRackColor(rack.rackId, rackColors)}
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
                const isDragging = dragId === loc.id;
                const cx = isDragging && dragPos ? dragPos.svgX : loc.svgX;
                const cy = isDragging && dragPos ? dragPos.svgY : loc.svgY;
                const isCorrected = locationCorrections?.[loc.id] !== undefined;
                const isSelected = selectedLocationId === loc.id;
                const locColor = loc.color ?? getRackColor(loc.rack ?? "default", rackColors);
                return (
                  <g
                    key={loc.id}
                    className={(canDrag) ? "loc-draggable" : undefined}
                    onClick={(e) => { e.stopPropagation(); handleLocationClick(loc.id); }}
                    onMouseDown={canDrag ? (e) => handleDragStart(e, loc.id) : undefined}
                    style={{ cursor: getLocationCursor(isDragging) }}
                  >
                    {/* Selection ring */}
                    {isSelected && (
                      <circle cx={cx} cy={cy} r={LOCATION_RADIUS * 3} fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.9" />
                    )}
                    {editMode && isCorrected && !isSelected && (
                      <circle cx={cx} cy={cy} r={LOCATION_RADIUS * 2.5} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 2" opacity="0.8" />
                    )}
                    {/* Added indicator */}
                    {loc.isAdded && (
                      <circle cx={cx} cy={cy} r={LOCATION_RADIUS * 3} fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="3 2" opacity="0.7" />
                    )}
                    <circle
                      cx={cx} cy={cy}
                      r={isDragging ? LOCATION_RADIUS * 2 : isSelected ? LOCATION_RADIUS * 1.8 : isHighlighted || isOnRoute ? LOCATION_RADIUS * 1.5 : LOCATION_RADIUS}
                      fill={isDragging ? "#f59e0b" : isOnRoute ? "#ef4444" : isHighlighted ? "#f59e0b" : locColor}
                      stroke={isDragging ? "#ffffff" : isSelected ? "#3b82f6" : isHighlighted || isOnRoute ? "#ffffff" : "none"}
                      strokeWidth={isDragging || isSelected || isHighlighted || isOnRoute ? "1" : "0"}
                      opacity={isDragging ? 1 : isSelected || isHighlighted || isOnRoute ? 1 : 0.7}
                    />
                    {/* Show label when selected */}
                    {isSelected && (
                      <text
                        x={cx} y={cy - LOCATION_RADIUS * 3 - 3}
                        textAnchor="middle" fontSize="8" fill="#111827"
                        fontFamily="Arial, sans-serif" fontWeight="700"
                        pointerEvents="none"
                      >
                        {loc.originalLabel}
                      </text>
                    )}
                    <title>{loc.id} — {loc.originalLabel}{isCorrected ? " (corrected)" : ""}{loc.isAdded ? " (new)" : ""}</title>
                  </g>
                );
              })}
            </g>

            {/* Pallet locations (squares) */}
            <g id="pallet-locations">
              {palletLocations.map((loc) => {
                const isHighlighted = highlightedLocations.has(loc.id);
                const isOnRoute = route?.stops.some((s) => s.locationId === loc.id);
                const isDragging = dragId === loc.id;
                const cx = isDragging && dragPos ? dragPos.svgX : loc.svgX;
                const cy = isDragging && dragPos ? dragPos.svgY : loc.svgY;
                const isCorrected = locationCorrections?.[loc.id] !== undefined;
                const isSelected = selectedLocationId === loc.id;
                const size = isDragging ? PALLET_SIZE * 2 : isSelected ? PALLET_SIZE * 1.8 : isHighlighted || isOnRoute ? PALLET_SIZE * 1.5 : PALLET_SIZE;
                const locColor = loc.color ?? (loc.id.startsWith("IP") ? "#8b5cf6" : "#06b6d4");
                return (
                  <g
                    key={loc.id}
                    className={canDrag ? "loc-draggable" : undefined}
                    onClick={(e) => { e.stopPropagation(); handleLocationClick(loc.id); }}
                    onMouseDown={canDrag ? (e) => handleDragStart(e, loc.id) : undefined}
                    style={{ cursor: getLocationCursor(isDragging) }}
                  >
                    {isSelected && (
                      <rect x={cx - size * 1.5} y={cy - size * 1.5} width={size * 3} height={size * 3} fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.9" rx="2" />
                    )}
                    {editMode && isCorrected && !isSelected && (
                      <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 2" opacity="0.8" rx="2" />
                    )}
                    {loc.isAdded && (
                      <rect x={cx - size * 1.5} y={cy - size * 1.5} width={size * 3} height={size * 3} fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="3 2" opacity="0.7" rx="2" />
                    )}
                    <rect
                      x={cx - size / 2}
                      y={cy - size / 2}
                      width={size}
                      height={size}
                      fill={isDragging ? "#f59e0b" : isOnRoute ? "#ef4444" : isHighlighted ? "#f59e0b" : locColor}
                      stroke={isDragging ? "#ffffff" : isSelected ? "#3b82f6" : isHighlighted || isOnRoute ? "#ffffff" : "none"}
                      strokeWidth={isDragging || isSelected || isHighlighted || isOnRoute ? "1" : "0"}
                      opacity={isDragging ? 1 : isSelected || isHighlighted || isOnRoute ? 1 : 0.75}
                      rx="1"
                    />
                    {isSelected && (
                      <text
                        x={cx} y={cy - size * 1.5 - 3}
                        textAnchor="middle" fontSize="8" fill="#111827"
                        fontFamily="Arial, sans-serif" fontWeight="700"
                        pointerEvents="none"
                      >
                        {loc.originalLabel}
                      </text>
                    )}
                    <title>{loc.id} — {loc.originalLabel}{isCorrected ? " (corrected)" : ""}{loc.isAdded ? " (new)" : ""}</title>
                  </g>
                );
              })}
            </g>

            {/* Normal route ghost path (shown behind optimized) */}
            {showNormalRoute && normalRoutePathPoints.length > 1 && (
              <g id="normal-route-path">
                <polyline
                  points={normalRoutePathPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#9ca3af"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.4"
                  strokeDasharray="4 6"
                />
              </g>
            )}

            {/* Optimized route path */}
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
