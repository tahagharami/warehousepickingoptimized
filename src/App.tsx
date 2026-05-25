import { useState, useCallback } from "react";
import { WarehouseMap } from "./components/WarehouseMap";
import { PickingPanel } from "./components/PickingPanel";
import type { WarehouseFloor } from "./data/warehouseDataExactFromDXF";
import {
  locations8thFloor,
  locations9thFloor,
} from "./data/warehouseDataExactFromDXF";
import {
  optimizePickingRoute,
  computeSequentialRoute,
  type OptimizedRoute,
} from "./engine/optimizer";
import "./App.css";

function App() {
  const [floor, setFloor] = useState<WarehouseFloor>("9");
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [normalRoute, setNormalRoute] = useState<OptimizedRoute | null>(null);
  const [showNormalRoute, setShowNormalRoute] = useState(false);
  const [highlightedLocations, setHighlightedLocations] = useState<Set<string>>(
    new Set(),
  );

  const locationCount =
    floor === "9" ? locations9thFloor.length : locations8thFloor.length;

  const handleOptimize = useCallback(
    (locationIds: string[]) => {
      const optimized = optimizePickingRoute(locationIds, floor);
      setRoute(optimized);

      const sequential = computeSequentialRoute(locationIds, floor);
      setNormalRoute(sequential);
      setShowNormalRoute(false);
    },
    [floor],
  );

  const handleClear = useCallback(() => {
    setRoute(null);
    setNormalRoute(null);
    setShowNormalRoute(false);
    setHighlightedLocations(new Set());
  }, []);

  const handleFloorChange = useCallback((newFloor: WarehouseFloor) => {
    setFloor(newFloor);
    setRoute(null);
    setNormalRoute(null);
    setShowNormalRoute(false);
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

  const displayRoute = showNormalRoute ? normalRoute : route;
  const distanceSaved =
    normalRoute && route
      ? normalRoute.totalDistance - route.totalDistance
      : 0;

  return (
    <>
      <header className="app__header">
        <span className="app__title-group">
          <h1 className="app__title">Warehouse Route Optimizer</h1>
          <p className="app__subtitle">
            {floor === "9" ? "9th" : "8th"} floor — {locationCount} locations
            {route &&
              ` — Route: ${route.stops.length} stops, ${Math.round(route.totalDistance).toLocaleString()} units`}
          </p>
        </span>
        <span className="app__controls">
          {route && normalRoute && (
            <span
              className="app__route-toggle"
              role="group"
              aria-label="Route view"
            >
              <button
                type="button"
                className={`app__route-btn ${!showNormalRoute ? "app__route-btn--active app__route-btn--optimized" : ""}`}
                onClick={() => setShowNormalRoute(false)}
              >
                Optimized
              </button>
              <button
                type="button"
                className={`app__route-btn ${showNormalRoute ? "app__route-btn--active app__route-btn--normal" : ""}`}
                onClick={() => setShowNormalRoute(true)}
              >
                Original
              </button>
              {distanceSaved > 0 && (
                <span className="app__savings-badge">
                  -{Math.round(distanceSaved).toLocaleString()} units saved
                </span>
              )}
            </span>
          )}
          <span
            className="app__floor-toggle"
            role="group"
            aria-label="Floor"
          >
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
        </span>
      </header>
      <main className="app__main">
        <WarehouseMap
          key={floor}
          floor={floor}
          route={displayRoute}
          normalRoute={showNormalRoute ? null : normalRoute}
          showNormalRoute={!showNormalRoute && normalRoute !== null && route !== null}
          highlightedLocations={highlightedLocations}
          onLocationClick={handleLocationClick}
        />
        <PickingPanel
          floor={floor}
          route={route}
          normalRoute={normalRoute}
          onOptimize={handleOptimize}
          onClear={handleClear}
          onHighlightChange={setHighlightedLocations}
        />
      </main>
    </>
  );
}

export default App;
