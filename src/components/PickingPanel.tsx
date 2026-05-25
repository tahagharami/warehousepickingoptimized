import { useState, useCallback, useRef } from "react";
import {
  normalizeLocationId,
  getAllLocationIds,
  type WarehouseFloor,
} from "../data/warehouseDataExactFromDXF";
import type { OptimizedRoute } from "../engine/optimizer";
import {
  parsePickingListPdf,
  mergePickingLists,
  type ParsedPickingList,
  type MergedPickingItem,
} from "../engine/pdfParser";
import {
  resolvePickingListLocations,
  type ResolvedItem,
} from "../engine/locationResolver";
import "./PickingPanel.css";

type PickingPanelProps = {
  floor: WarehouseFloor;
  route: OptimizedRoute | null;
  normalRoute: OptimizedRoute | null;
  onOptimize: (locationIds: string[]) => void;
  onClear: () => void;
  onHighlightChange: (ids: Set<string>) => void;
  onPdfParsed?: (items: ResolvedItem[], unresolvedItems: ResolvedItem[]) => void;
};

type TabMode = "manual" | "pdf";

export function PickingPanel({
  floor,
  route,
  normalRoute,
  onOptimize,
  onClear,
  onHighlightChange,
  onPdfParsed,
}: PickingPanelProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hoveredStop, setHoveredStop] = useState<string | null>(null);
  const [tab, setTab] = useState<TabMode>("pdf");
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [parsedLists, setParsedLists] = useState<ParsedPickingList[]>([]);
  const [mergedItems, setMergedItems] = useState<MergedPickingItem[]>([]);
  const [resolvedItems, setResolvedItems] = useState<ResolvedItem[]>([]);
  const [unresolvedItems, setUnresolvedItems] = useState<ResolvedItem[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleManualOptimize = useCallback(() => {
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

  const handlePdfUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setIsParsing(true);

      try {
        const newFiles = Array.from(files);
        setPdfFiles((prev) => [...prev, ...newFiles]);

        const newParsed: ParsedPickingList[] = [];
        for (const file of newFiles) {
          const parsed = await parsePickingListPdf(file);
          newParsed.push(parsed);
        }

        setParsedLists((prev) => {
          const all = [...prev, ...newParsed];
          const merged = mergePickingLists(all);
          setMergedItems(merged.items);

          const { resolved, unresolved } = resolvePickingListLocations(
            merged.items,
            floor,
          );
          setResolvedItems(resolved);
          setUnresolvedItems(unresolved);
          onPdfParsed?.(resolved, unresolved);

          return all;
        });
      } catch (err) {
        setError(
          `Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setIsParsing(false);
      }
    },
    [floor, onPdfParsed],
  );

  const handlePdfOptimize = useCallback(() => {
    if (resolvedItems.length === 0) {
      setError("No valid locations found. Upload a picking list PDF first.");
      return;
    }
    setError(null);

    // Deduplicate locations while preserving first occurrence order
    const seen = new Set<string>();
    const locationIds: string[] = [];
    for (const item of resolvedItems) {
      if (item.resolvedLocation && !seen.has(item.resolvedLocation)) {
        seen.add(item.resolvedLocation);
        locationIds.push(item.resolvedLocation);
      }
    }

    onOptimize(locationIds);
  }, [resolvedItems, onOptimize]);

  const handleRemovePdf = useCallback(
    (index: number) => {
      setPdfFiles((prev) => prev.filter((_, i) => i !== index));
      setParsedLists((prev) => {
        const next = prev.filter((_, i) => i !== index);
        if (next.length === 0) {
          setMergedItems([]);
          setResolvedItems([]);
          setUnresolvedItems([]);
          onPdfParsed?.([], []);
        } else {
          const merged = mergePickingLists(next);
          setMergedItems(merged.items);
          const { resolved, unresolved } = resolvePickingListLocations(
            merged.items,
            floor,
          );
          setResolvedItems(resolved);
          setUnresolvedItems(unresolved);
          onPdfParsed?.(resolved, unresolved);
        }
        return next;
      });
    },
    [floor, onPdfParsed],
  );

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
    setPdfFiles([]);
    setParsedLists([]);
    setMergedItems([]);
    setResolvedItems([]);
    setUnresolvedItems([]);
    onClear();
  }, [onClear]);

  const distanceSaved =
    normalRoute && route
      ? normalRoute.totalDistance - route.totalDistance
      : 0;
  const percentSaved =
    normalRoute && normalRoute.totalDistance > 0
      ? (distanceSaved / normalRoute.totalDistance) * 100
      : 0;

  return (
    <aside className="picking-panel">
      <h2 className="picking-panel__title">Picking List</h2>

      {/* Tab toggle */}
      <div className="picking-panel__tabs">
        <button
          type="button"
          className={`picking-panel__tab ${tab === "pdf" ? "picking-panel__tab--active" : ""}`}
          onClick={() => setTab("pdf")}
        >
          PDF Upload
        </button>
        <button
          type="button"
          className={`picking-panel__tab ${tab === "manual" ? "picking-panel__tab--active" : ""}`}
          onClick={() => setTab("manual")}
        >
          Manual
        </button>
      </div>

      {tab === "manual" && (
        <div className="picking-panel__input-group">
          <textarea
            className="picking-panel__textarea"
            placeholder={
              "Enter location IDs (one per line or comma-separated):\n\n90307\n90601\nP9205\nIP901\n92204\n94501"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
          />
          {error && <p className="picking-panel__error">{error}</p>}
          <div className="picking-panel__buttons">
            <button
              className="picking-panel__btn picking-panel__btn--primary"
              onClick={handleManualOptimize}
            >
              Optimize Route
            </button>
            <button
              className="picking-panel__btn picking-panel__btn--secondary"
              onClick={handleClear}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {tab === "pdf" && (
        <div className="picking-panel__input-group">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={(e) => handlePdfUpload(e.target.files)}
            className="picking-panel__file-input"
          />
          <button
            type="button"
            className="picking-panel__btn picking-panel__btn--upload"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing}
          >
            {isParsing ? "Parsing..." : "Upload Picking List PDF(s)"}
          </button>

          {pdfFiles.length > 0 && (
            <div className="picking-panel__pdf-list">
              {pdfFiles.map((file, i) => (
                <div key={`${file.name}-${i}`} className="picking-panel__pdf-item">
                  <span className="picking-panel__pdf-name" title={file.name}>
                    {parsedLists[i]?.mnbCode || file.name}
                  </span>
                  <span className="picking-panel__pdf-count">
                    {parsedLists[i]?.items.length ?? "..."} items
                  </span>
                  <button
                    type="button"
                    className="picking-panel__pdf-remove"
                    onClick={() => handleRemovePdf(i)}
                    title="Remove"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {mergedItems.length > 0 && (
            <div className="picking-panel__summary">
              <p>
                <strong>{mergedItems.length}</strong> items |{" "}
                <strong>{resolvedItems.length}</strong> mapped
                {unresolvedItems.length > 0 && (
                  <span className="picking-panel__warning">
                    {" "}
                    | {unresolvedItems.length} unmapped
                  </span>
                )}
              </p>
            </div>
          )}

          {error && <p className="picking-panel__error">{error}</p>}

          <div className="picking-panel__buttons">
            <button
              className="picking-panel__btn picking-panel__btn--primary"
              onClick={handlePdfOptimize}
              disabled={resolvedItems.length === 0}
            >
              Optimize Route
            </button>
            <button
              className="picking-panel__btn picking-panel__btn--secondary"
              onClick={handleClear}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Distance gain comparison */}
      {route && normalRoute && (
        <div className="picking-panel__gain">
          <h3 className="picking-panel__gain-title">Distance Comparison</h3>
          <div className="picking-panel__gain-row">
            <span className="picking-panel__gain-label">Original path</span>
            <span className="picking-panel__gain-value picking-panel__gain-value--normal">
              {Math.round(normalRoute.totalDistance).toLocaleString()} units
            </span>
          </div>
          <div className="picking-panel__gain-row">
            <span className="picking-panel__gain-label">Optimized path</span>
            <span className="picking-panel__gain-value picking-panel__gain-value--optimized">
              {Math.round(route.totalDistance).toLocaleString()} units
            </span>
          </div>
          <div className="picking-panel__gain-row picking-panel__gain-row--total">
            <span className="picking-panel__gain-label">Saved</span>
            <span className="picking-panel__gain-value picking-panel__gain-value--saved">
              {Math.round(distanceSaved).toLocaleString()} units (
              {percentSaved.toFixed(1)}%)
            </span>
          </div>
        </div>
      )}

      {/* Optimized route stops */}
      {route && route.stops.length > 0 && (
        <div className="picking-panel__route">
          <h3 className="picking-panel__route-title">
            Optimized Route
            <span className="picking-panel__route-distance">
              {route.stops.length} stops
            </span>
          </h3>
          <ol className="picking-panel__stop-list">
            {route.stops.map((stop) => {
              const itemInfo = resolvedItems.find(
                (r) => r.resolvedLocation === stop.locationId,
              );
              return (
                <li
                  key={stop.locationId}
                  className={`picking-panel__stop ${hoveredStop === stop.locationId ? "picking-panel__stop--hover" : ""}`}
                  onMouseEnter={() => handleStopHover(stop.locationId)}
                  onMouseLeave={() => handleStopHover(null)}
                >
                  <span className="picking-panel__stop-number">
                    {stop.order}
                  </span>
                  <span className="picking-panel__stop-id">
                    {stop.locationId}
                  </span>
                  {itemInfo && (
                    <span className="picking-panel__stop-item">
                      {itemInfo.itemCode} ({itemInfo.qtyToPick})
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Unresolved items */}
      {unresolvedItems.length > 0 && (
        <div className="picking-panel__unresolved">
          <h3 className="picking-panel__route-title">
            Unmapped Locations
            <span className="picking-panel__route-distance picking-panel__warning">
              {unresolvedItems.length} items
            </span>
          </h3>
          <ol className="picking-panel__stop-list">
            {unresolvedItems.map((item, i) => (
              <li key={`unresolved-${i}`} className="picking-panel__stop">
                <span className="picking-panel__stop-number picking-panel__stop-number--warn">
                  ?
                </span>
                <span className="picking-panel__stop-id">
                  {item.originalLocation || "N/A"}
                </span>
                <span className="picking-panel__stop-item">
                  {item.itemCode}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}
