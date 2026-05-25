import { useState, useCallback, useEffect, useMemo } from "react";
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
import { LocationEditorPanel, type WarehouseEdits, type EditTool, type LocationEdit } from "./components/LocationEditorPanel";
import "./App.css";

const EDITS_KEY = "warehouse-location-edits";

function loadEdits(): Record<string, WarehouseEdits> {
  try {
    const raw = localStorage.getItem(EDITS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveEdits(data: Record<string, WarehouseEdits>) {
  localStorage.setItem(EDITS_KEY, JSON.stringify(data));
}

function emptyFloorEdits(): WarehouseEdits {
  return { modified: {}, added: [], deleted: [], rackColors: {} };
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
  const [allEdits, setAllEdits] = useState<Record<string, WarehouseEdits>>(loadEdits);
  const [activeTool, setActiveTool] = useState<EditTool>("select");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const floorKey = `floor-${floor}`;
  const floorEdits = allEdits[floorKey] ?? emptyFloorEdits();

  useEffect(() => {
    saveEdits(allEdits);
  }, [allEdits]);

  const updateFloorEdits = useCallback(
    (updater: (prev: WarehouseEdits) => WarehouseEdits) => {
      setAllEdits((prev) => {
        const key = `floor-${floor}`;
        const current = prev[key] ?? emptyFloorEdits();
        return { ...prev, [key]: updater(current) };
      });
    },
    [floor],
  );

  const handleLocationMove = useCallback(
    (locationId: string, dxfX: number, dxfY: number) => {
      updateFloorEdits((prev) => {
        const existing = prev.modified[locationId] ?? {};
        return {
          ...prev,
          modified: {
            ...prev.modified,
            [locationId]: { ...existing, x: dxfX, y: dxfY },
          },
        };
      });
      // Also update added locations if it was one
      updateFloorEdits((prev) => {
        const addedIdx = prev.added.findIndex((a) => a.id === locationId);
        if (addedIdx >= 0) {
          const updated = [...prev.added];
          updated[addedIdx] = { ...updated[addedIdx], x: dxfX, y: dxfY };
          return { ...prev, added: updated };
        }
        return prev;
      });
    },
    [updateFloorEdits],
  );

  const handleDeleteLocation = useCallback(
    (locationId: string) => {
      updateFloorEdits((prev) => {
        // If it was added in this session, just remove it from added
        const addedIdx = prev.added.findIndex((a) => a.id === locationId);
        if (addedIdx >= 0) {
          const updated = [...prev.added];
          updated.splice(addedIdx, 1);
          const newMod = { ...prev.modified };
          delete newMod[locationId];
          return { ...prev, added: updated, modified: newMod };
        }
        // Otherwise mark as deleted
        const newDeleted = prev.deleted.includes(locationId) ? prev.deleted : [...prev.deleted, locationId];
        const newMod = { ...prev.modified };
        delete newMod[locationId];
        return { ...prev, deleted: newDeleted, modified: newMod };
      });
      if (selectedLocationId === locationId) setSelectedLocationId(null);
    },
    [updateFloorEdits, selectedLocationId],
  );

  const handleAddLocation = useCallback(
    (loc: LocationEdit) => {
      updateFloorEdits((prev) => ({
        ...prev,
        added: [...prev.added, loc],
      }));
      setSelectedLocationId(loc.id);
    },
    [updateFloorEdits],
  );

  const handleUpdateLocationProps = useCallback(
    (locationId: string, updates: Partial<LocationEdit>) => {
      updateFloorEdits((prev) => {
        // Check if it's an added location
        const addedIdx = prev.added.findIndex((a) => a.id === locationId);
        if (addedIdx >= 0) {
          const updated = [...prev.added];
          const oldLoc = updated[addedIdx];
          const newLoc = { ...oldLoc, ...updates };
          // If ID changed, update the ID
          if (updates.id && updates.id !== locationId) {
            newLoc.id = updates.id;
          }
          updated[addedIdx] = newLoc;
          return { ...prev, added: updated };
        }
        // It's a base location — store modification
        const existing = prev.modified[locationId] ?? {};
        const newMod = { ...prev.modified, [locationId]: { ...existing, ...updates } };
        // If ID changed, we need to move the key
        if (updates.id && updates.id !== locationId) {
          newMod[updates.id] = newMod[locationId];
          delete newMod[locationId];
        }
        return { ...prev, modified: newMod };
      });
      // If ID changed, update selected
      if (updates.id && updates.id !== locationId) {
        setSelectedLocationId(updates.id);
      }
    },
    [updateFloorEdits],
  );

  const handleUndeleteLocation = useCallback(
    (locationId: string) => {
      updateFloorEdits((prev) => ({
        ...prev,
        deleted: prev.deleted.filter((id) => id !== locationId),
      }));
    },
    [updateFloorEdits],
  );

  const handleSetRackColor = useCallback(
    (rackId: string, color: string | null) => {
      updateFloorEdits((prev) => {
        const rc = { ...prev.rackColors };
        if (color === null) {
          delete rc[rackId];
        } else {
          rc[rackId] = color;
        }
        return { ...prev, rackColors: rc };
      });
    },
    [updateFloorEdits],
  );

  const handleResetAllEdits = useCallback(() => {
    setAllEdits((prev) => {
      const next = { ...prev };
      delete next[`floor-${floor}`];
      return next;
    });
    setSelectedLocationId(null);
  }, [floor]);

  const handleExportEdits = useCallback(() => {
    const data = JSON.stringify(allEdits, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "warehouse-edits.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [allEdits]);

  const handleImportEdits = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        setAllEdits(data);
      } catch { /* ignore invalid file */ }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const handleMapClick = useCallback(
    (dxfX: number, dxfY: number) => {
      if (!editMode || activeTool !== "add") return;
      const floorPrefix = floor === "9" ? "9" : "8";
      const timestamp = Date.now().toString(36);
      const newId = `NEW${floorPrefix}${timestamp}`;
      handleAddLocation({
        id: newId,
        originalLabel: newId,
        x: dxfX,
        y: dxfY,
        rack: "",
        slot: "",
        type: "user_added",
        color: undefined,
      });
    },
    [editMode, activeTool, floor, handleAddLocation],
  );

  const handleLocationSelect = useCallback(
    (locationId: string) => {
      if (editMode && activeTool === "delete") {
        handleDeleteLocation(locationId);
        return;
      }
      if (editMode && (activeTool === "select" || activeTool === "move")) {
        setSelectedLocationId((prev) => (prev === locationId ? null : locationId));
        return;
      }
      // Normal mode: highlight toggle
      setHighlightedLocations((prev) => {
        const next = new Set(prev);
        if (next.has(locationId)) {
          next.delete(locationId);
        } else {
          next.add(locationId);
        }
        return next;
      });
    },
    [editMode, activeTool, handleDeleteLocation],
  );

  // Build effective locations for this floor with edits applied
  const baseLocations = floor === "9" ? locations9thFloor : locations8thFloor;
  const editCount = useMemo(() => {
    const e = floorEdits;
    return Object.keys(e.modified).length + e.added.length + e.deleted.length + Object.keys(e.rackColors).length;
  }, [floorEdits]);

  // Compute location corrections map from edits (for WarehouseMap compatibility)
  const locationCorrections = useMemo(() => {
    const result: Record<string, { x: number; y: number }> = {};
    for (const [id, mod] of Object.entries(floorEdits.modified)) {
      if (mod.x !== undefined && mod.y !== undefined) {
        result[id] = { x: mod.x, y: mod.y };
      }
    }
    return result;
  }, [floorEdits.modified]);

  const locationCount = useMemo(() => {
    return baseLocations.length - floorEdits.deleted.length + floorEdits.added.length;
  }, [baseLocations.length, floorEdits.deleted.length, floorEdits.added.length]);

  // Selected location info
  const selectedLocationInfo = useMemo(() => {
    if (!selectedLocationId) return null;
    // Check added first
    const added = floorEdits.added.find((a) => a.id === selectedLocationId);
    if (added) return added;
    // Check base
    const base = baseLocations.find((l) => l.id === selectedLocationId);
    if (!base) return null;
    const mod = floorEdits.modified[selectedLocationId];
    return {
      id: selectedLocationId,
      originalLabel: mod?.originalLabel ?? base.originalLabel,
      x: mod?.x ?? base.x,
      y: mod?.y ?? base.y,
      rack: mod?.rack ?? base.rack ?? "",
      slot: mod?.slot ?? base.slot ?? "",
      type: mod?.type ?? base.type,
      color: mod?.color,
    };
  }, [selectedLocationId, floorEdits, baseLocations]);

  // Collect rack list for rack colors editor
  const rackList = useMemo(() => {
    const racks = new Set<string>();
    for (const loc of baseLocations) {
      if (loc.rack && !floorEdits.deleted.includes(loc.id)) racks.add(loc.rack);
    }
    for (const loc of floorEdits.added) {
      if (loc.rack) racks.add(loc.rack);
    }
    for (const [id, mod] of Object.entries(floorEdits.modified)) {
      if (mod.rack && !floorEdits.deleted.includes(id)) racks.add(mod.rack);
    }
    return [...racks].sort();
  }, [baseLocations, floorEdits]);

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
    setSelectedLocationId(null);
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
            onClick={() => {
              setEditMode((v) => !v);
              if (editMode) {
                setSelectedLocationId(null);
                setActiveTool("select");
              }
            }}
            title="Toggle edit mode"
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
          onLocationClick={handleLocationSelect}
          editMode={editMode}
          activeTool={activeTool}
          locationCorrections={locationCorrections}
          onLocationMove={handleLocationMove}
          deletedLocations={floorEdits.deleted}
          addedLocations={floorEdits.added}
          modifiedLocations={floorEdits.modified}
          rackColors={floorEdits.rackColors}
          selectedLocationId={selectedLocationId}
          onMapClick={handleMapClick}
        />
        {editMode && (
          <LocationEditorPanel
            activeTool={activeTool}
            onToolChange={setActiveTool}
            editCount={editCount}
            floorEdits={floorEdits}
            selectedLocation={selectedLocationInfo}
            onUpdateLocation={handleUpdateLocationProps}
            onDeleteLocation={handleDeleteLocation}
            onUndeleteLocation={handleUndeleteLocation}
            rackList={rackList}
            rackColors={floorEdits.rackColors}
            onSetRackColor={handleSetRackColor}
            onResetAll={handleResetAllEdits}
            onExport={handleExportEdits}
            onImport={handleImportEdits}
          />
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
