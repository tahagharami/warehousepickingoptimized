import { useState, useCallback, useEffect } from "react";
import { WarehouseMap, type LocationCorrection } from "./components/WarehouseMap";
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

const CORRECTIONS_KEY = "warehouse-location-corrections";

function loadCorrections(): Record<string, Record<string, LocationCorrection>> {
  try {
    const raw = localStorage.getItem(CORRECTIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveCorrections(data: Record<string, Record<string, LocationCorrection>>) {
  localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(data));
}

function App() {
  const [floor, setFloor] = useState<WarehouseFloor>("9");
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [normalRoute, setNormalRoute] = useState<OptimizedRoute | null>(null);
  const [showNormalRoute, setShowNormalRoute] = useState(false);
  const [highlightedLocations, setHighlightedLocations] = useState<Set<string>>(
    new Set(),
  );
  const [editMode, setEditMode] = useState(false);
  const [allCorrections, setAllCorrections] = useState<Record<string, Record<string, LocationCorrection>>>(loadCorrections);

  const floorKey = `floor-${floor}`;
  const floorCorrections = allCorrections[floorKey] ?? {};
  const correctionCount = Object.keys(floorCorrections).length;

  useEffect(() => {
    saveCorrections(allCorrections);
  }, [allCorrections]);

  const handleLocationMove = useCallback(
    (locationId: string, dxfX: number, dxfY: number) => {
      setAllCorrections((prev) => {
        const key = `floor-${floor}`;
        const floorData = { ...(prev[key] ?? {}) };
        floorData[locationId] = { x: dxfX, y: dxfY };
        return { ...prev, [key]: floorData };
      });
    },
    [floor],
  );

  const handleResetCorrections = useCallback(() => {
    setAllCorrections((prev) => {
      const key = `floor-${floor}`;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [floor]);

  const handleResetSingle = useCallback(
    (locationId: string) => {
      setAllCorrections((prev) => {
        const key = `floor-${floor}`;
        const floorData = { ...(prev[key] ?? {}) };
        delete floorData[locationId];
        if (Object.keys(floorData).length === 0) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: floorData };
      });
    },
    [floor],
  );

  const handleExportCorrections = useCallback(() => {
    const data = JSON.stringify(allCorrections, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "location-corrections.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [allCorrections]);

  const handleImportCorrections = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        setAllCorrections(data);
      } catch { /* ignore invalid file */ }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

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
          <button
            type="button"
            className={`app__edit-btn ${editMode ? "app__edit-btn--active" : ""}`}
            onClick={() => setEditMode((v) => !v)}
            title="Toggle edit mode to drag locations"
          >
            {editMode ? "Exit Edit" : "Edit Locations"}
          </button>
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
          editMode={editMode}
          locationCorrections={floorCorrections}
          onLocationMove={handleLocationMove}
        />
        {editMode && (
          <div className="app__edit-panel">
            <h3 className="app__edit-panel-title">Location Editor</h3>
            <p className="app__edit-panel-hint">
              Drag any location dot to reposition it. Changes are saved automatically.
            </p>
            <p className="app__edit-panel-count">
              {correctionCount} correction{correctionCount !== 1 ? "s" : ""} on this floor
            </p>
            {correctionCount > 0 && (
              <div className="app__edit-panel-list">
                {Object.entries(floorCorrections).map(([id]) => (
                  <div key={id} className="app__edit-panel-item">
                    <span>{id}</span>
                    <button type="button" onClick={() => handleResetSingle(id)} className="app__edit-panel-reset-one" title="Reset this location">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="app__edit-panel-actions">
              {correctionCount > 0 && (
                <button type="button" className="app__edit-panel-btn app__edit-panel-btn--danger" onClick={handleResetCorrections}>
                  Reset All
                </button>
              )}
              <button type="button" className="app__edit-panel-btn" onClick={handleExportCorrections}>
                Export
              </button>
              <label className="app__edit-panel-btn app__edit-panel-btn--import">
                Import
                <input type="file" accept=".json" onChange={handleImportCorrections} hidden />
              </label>
            </div>
          </div>
        )}
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
