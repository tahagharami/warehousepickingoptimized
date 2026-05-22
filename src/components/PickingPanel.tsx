import { useState, useCallback } from "react";
import { normalizeLocationId, getAllLocationIds, type WarehouseFloor } from "../data/warehouseDataExactFromDXF";
import type { OptimizedRoute } from "../engine/optimizer";
import "./PickingPanel.css";

type PickingPanelProps = {
  floor: WarehouseFloor;
  route: OptimizedRoute | null;
  onOptimize: (locationIds: string[]) => void;
  onClear: () => void;
  onHighlightChange: (ids: Set<string>) => void;
};

export function PickingPanel({ floor, route, onOptimize, onClear, onHighlightChange }: PickingPanelProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hoveredStop, setHoveredStop] = useState<string | null>(null);

  const handleOptimize = useCallback(() => {
    setError(null);
    const raw = input
      .split(/[\n,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (raw.length === 0) {
      setError("Enter at least one location ID.");
      return;
    }

    const validIds = getAllLocationIds(floor);
    const validSet = new Set(validIds);
    const normalized: string[] = [];
    const invalid: string[] = [];

    for (const r of raw) {
      const n = normalizeLocationId(r);
      if (validSet.has(n)) {
        if (!normalized.includes(n)) normalized.push(n);
      } else {
        invalid.push(r);
      }
    }

    if (invalid.length > 0) {
      setError(`Unknown location(s): ${invalid.join(", ")}`);
    }

    if (normalized.length === 0) {
      setError("No valid locations found for this floor.");
      return;
    }

    onOptimize(normalized);
  }, [input, floor, onOptimize]);

  const handleStopHover = useCallback(
    (locationId: string | null) => {
      setHoveredStop(locationId);
      onHighlightChange(locationId ? new Set([locationId]) : new Set());
    },
    [onHighlightChange],
  );

  const handleClear = useCallback(() => {
    setInput("");
    setError(null);
    onClear();
  }, [onClear]);

  return (
    <aside className="picking-panel">
      <h2 className="picking-panel__title">Picking List</h2>

      <div className="picking-panel__input-group">
        <textarea
          className="picking-panel__textarea"
          placeholder={"Enter location IDs (one per line or comma-separated):\n\n90307\n90601\nP9205\nIP901\n92204\n94501"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
        />
        {error && <p className="picking-panel__error">{error}</p>}
        <div className="picking-panel__buttons">
          <button className="picking-panel__btn picking-panel__btn--primary" onClick={handleOptimize}>
            Optimize Route
          </button>
          <button className="picking-panel__btn picking-panel__btn--secondary" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {route && route.stops.length > 0 && (
        <div className="picking-panel__route">
          <h3 className="picking-panel__route-title">
            Optimized Route
            <span className="picking-panel__route-distance">
              {Math.round(route.totalDistance).toLocaleString()} units
            </span>
          </h3>
          <ol className="picking-panel__stop-list">
            {route.stops.map((stop) => (
              <li
                key={stop.locationId}
                className={`picking-panel__stop ${hoveredStop === stop.locationId ? "picking-panel__stop--hover" : ""}`}
                onMouseEnter={() => handleStopHover(stop.locationId)}
                onMouseLeave={() => handleStopHover(null)}
              >
                <span className="picking-panel__stop-number">{stop.order}</span>
                <span className="picking-panel__stop-id">{stop.locationId}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}
