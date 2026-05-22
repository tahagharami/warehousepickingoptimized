import { useState, useCallback } from "react";
import { WarehouseMap } from "./components/WarehouseMap";
import { PickingPanel } from "./components/PickingPanel";
import type { WarehouseFloor } from "./data/warehouseDataExactFromDXF";
import {
  locations8thFloor,
  locations9thFloor,
} from "./data/warehouseDataExactFromDXF";
import { optimizePickingRoute, type OptimizedRoute } from "./engine/optimizer";
import "./App.css";

function App() {
  const [floor, setFloor] = useState<WarehouseFloor>("9");
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [highlightedLocations, setHighlightedLocations] = useState<Set<string>>(new Set());

  const locationCount =
    floor === "9" ? locations9thFloor.length : locations8thFloor.length;

  const handleOptimize = useCallback(
    (locationIds: string[]) => {
      const result = optimizePickingRoute(locationIds, floor);
      setRoute(result);
    },
    [floor],
  );

  const handleClear = useCallback(() => {
    setRoute(null);
    setHighlightedLocations(new Set());
  }, []);

  const handleFloorChange = useCallback((newFloor: WarehouseFloor) => {
    setFloor(newFloor);
    setRoute(null);
    setHighlightedLocations(new Set());
  }, []);

  const handleLocationClick = useCallback((locationId: string) => {
    setHighlightedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) {
        next.delete(locationId);
      } else {
        next.add(locationId);
      }
      return next;
    });
  }, []);

  return (
    <>
      <header className="app__header">
        <span className="app__title-group">
          <h1 className="app__title">Warehouse Route Optimizer</h1>
          <p className="app__subtitle">
            {floor === "9" ? "9th" : "8th"} floor — {locationCount} locations
            {route && ` — Route: ${route.stops.length} stops, ${Math.round(route.totalDistance).toLocaleString()} units`}
          </p>
        </span>
        <span className="app__floor-toggle" role="group" aria-label="Floor">
          <button
            type="button"
            className={
              floor === "8"
                ? "app__floor-btn app__floor-btn--active"
                : "app__floor-btn"
            }
            onClick={() => handleFloorChange("8")}
          >
            8th floor
          </button>
          <button
            type="button"
            className={
              floor === "9"
                ? "app__floor-btn app__floor-btn--active"
                : "app__floor-btn"
            }
            onClick={() => handleFloorChange("9")}
          >
            9th floor
          </button>
        </span>
      </header>
      <main className="app__main">
        <WarehouseMap
          key={floor}
          floor={floor}
          route={route}
          highlightedLocations={highlightedLocations}
          onLocationClick={handleLocationClick}
        />
        <PickingPanel
          floor={floor}
          route={route}
          onOptimize={handleOptimize}
          onClear={handleClear}
          onHighlightChange={setHighlightedLocations}
        />
      </main>
    </>
  );
}

export default App;
