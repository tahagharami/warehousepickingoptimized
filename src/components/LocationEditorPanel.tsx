import { useState } from "react";
import "./LocationEditorPanel.css";

export type EditTool = "select" | "move" | "add" | "delete";

export type LocationEdit = {
  id: string;
  originalLabel: string;
  x: number;
  y: number;
  rack: string;
  slot: string;
  type: string;
  color?: string;
};

export type WarehouseEdits = {
  modified: Record<string, Partial<LocationEdit>>;
  added: LocationEdit[];
  deleted: string[];
  rackColors: Record<string, string>;
};

type LocationEditorPanelProps = {
  activeTool: EditTool;
  onToolChange: (tool: EditTool) => void;
  editCount: number;
  floorEdits: WarehouseEdits;
  selectedLocation: LocationEdit | null;
  onUpdateLocation: (id: string, updates: Partial<LocationEdit>) => void;
  onDeleteLocation: (id: string) => void;
  onUndeleteLocation: (id: string) => void;
  rackList: string[];
  rackColors: Record<string, string>;
  onSetRackColor: (rackId: string, color: string | null) => void;
  onResetAll: () => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const TOOL_ICONS: Record<EditTool, string> = {
  select: "⊙",
  move: "✥",
  add: "+",
  delete: "✕",
};

const TOOL_LABELS: Record<EditTool, string> = {
  select: "Select",
  move: "Move",
  add: "Add",
  delete: "Delete",
};

const PRESET_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48", "#0ea5e9", "#a855f7", "#65a30d",
  "#111827", "#6b7280", "#dc2626",
];

type PanelTab = "tools" | "racks" | "deleted";

export function LocationEditorPanel({
  activeTool,
  onToolChange,
  editCount,
  floorEdits,
  selectedLocation,
  onUpdateLocation,
  onDeleteLocation,
  onUndeleteLocation,
  rackList,
  rackColors,
  onSetRackColor,
  onResetAll,
  onExport,
  onImport,
}: LocationEditorPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("tools");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState("");

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setFieldValue(currentValue);
  };

  const commitEdit = (locationId: string, field: string) => {
    if (fieldValue.trim()) {
      onUpdateLocation(locationId, { [field]: fieldValue.trim() });
    }
    setEditingField(null);
  };

  const deletedCount = floorEdits.deleted.length;
  const addedCount = floorEdits.added.length;
  const modifiedCount = Object.keys(floorEdits.modified).length;

  return (
    <div className="editor-panel">
      <h3 className="editor-panel__title">Location Editor</h3>

      {/* Tool bar */}
      <div className="editor-panel__toolbar">
        {(Object.keys(TOOL_ICONS) as EditTool[]).map((tool) => (
          <button
            key={tool}
            type="button"
            className={`editor-panel__tool-btn ${activeTool === tool ? "editor-panel__tool-btn--active" : ""}`}
            onClick={() => onToolChange(tool)}
            title={TOOL_LABELS[tool]}
          >
            <span className="editor-panel__tool-icon">{TOOL_ICONS[tool]}</span>
            <span className="editor-panel__tool-label">{TOOL_LABELS[tool]}</span>
          </button>
        ))}
      </div>

      {/* Tool hint */}
      <p className="editor-panel__hint">
        {activeTool === "select" && "Click a location to view/edit its properties."}
        {activeTool === "move" && "Drag any location dot to reposition it."}
        {activeTool === "add" && "Click on the map to add a new location."}
        {activeTool === "delete" && "Click a location to delete it."}
      </p>

      {/* Tabs */}
      <div className="editor-panel__tabs">
        <button
          type="button"
          className={`editor-panel__tab ${activeTab === "tools" ? "editor-panel__tab--active" : ""}`}
          onClick={() => setActiveTab("tools")}
        >
          Properties
        </button>
        <button
          type="button"
          className={`editor-panel__tab ${activeTab === "racks" ? "editor-panel__tab--active" : ""}`}
          onClick={() => setActiveTab("racks")}
        >
          Racks
        </button>
        {deletedCount > 0 && (
          <button
            type="button"
            className={`editor-panel__tab ${activeTab === "deleted" ? "editor-panel__tab--active" : ""}`}
            onClick={() => setActiveTab("deleted")}
          >
            Deleted ({deletedCount})
          </button>
        )}
      </div>

      {/* Properties tab */}
      {activeTab === "tools" && (
        <div className="editor-panel__section">
          {selectedLocation ? (
            <div className="editor-panel__props">
              <div className="editor-panel__prop-row">
                <span className="editor-panel__prop-label">ID</span>
                {editingField === "id" ? (
                  <input
                    className="editor-panel__prop-input"
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                    onBlur={() => commitEdit(selectedLocation.id, "id")}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(selectedLocation.id, "id"); if (e.key === "Escape") setEditingField(null); }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="editor-panel__prop-value editor-panel__prop-value--editable"
                    onClick={() => startEdit("id", selectedLocation.id)}
                    title="Click to edit"
                  >
                    {selectedLocation.id}
                  </span>
                )}
              </div>
              <div className="editor-panel__prop-row">
                <span className="editor-panel__prop-label">Label</span>
                {editingField === "originalLabel" ? (
                  <input
                    className="editor-panel__prop-input"
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                    onBlur={() => commitEdit(selectedLocation.id, "originalLabel")}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(selectedLocation.id, "originalLabel"); if (e.key === "Escape") setEditingField(null); }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="editor-panel__prop-value editor-panel__prop-value--editable"
                    onClick={() => startEdit("originalLabel", selectedLocation.originalLabel)}
                    title="Click to edit"
                  >
                    {selectedLocation.originalLabel}
                  </span>
                )}
              </div>
              <div className="editor-panel__prop-row">
                <span className="editor-panel__prop-label">Rack</span>
                {editingField === "rack" ? (
                  <input
                    className="editor-panel__prop-input"
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                    onBlur={() => commitEdit(selectedLocation.id, "rack")}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(selectedLocation.id, "rack"); if (e.key === "Escape") setEditingField(null); }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="editor-panel__prop-value editor-panel__prop-value--editable"
                    onClick={() => startEdit("rack", selectedLocation.rack)}
                    title="Click to edit"
                  >
                    {selectedLocation.rack || "—"}
                  </span>
                )}
              </div>
              <div className="editor-panel__prop-row">
                <span className="editor-panel__prop-label">Slot</span>
                {editingField === "slot" ? (
                  <input
                    className="editor-panel__prop-input"
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                    onBlur={() => commitEdit(selectedLocation.id, "slot")}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(selectedLocation.id, "slot"); if (e.key === "Escape") setEditingField(null); }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="editor-panel__prop-value editor-panel__prop-value--editable"
                    onClick={() => startEdit("slot", selectedLocation.slot)}
                    title="Click to edit"
                  >
                    {selectedLocation.slot || "—"}
                  </span>
                )}
              </div>
              <div className="editor-panel__prop-row">
                <span className="editor-panel__prop-label">Color</span>
                <div className="editor-panel__color-grid editor-panel__color-grid--small">
                  {PRESET_COLORS.slice(0, 9).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`editor-panel__color-swatch ${selectedLocation.color === c ? "editor-panel__color-swatch--selected" : ""}`}
                      style={{ background: c }}
                      onClick={() => onUpdateLocation(selectedLocation.id, { color: c })}
                      title={c}
                    />
                  ))}
                  {selectedLocation.color && (
                    <button
                      type="button"
                      className="editor-panel__color-reset"
                      onClick={() => onUpdateLocation(selectedLocation.id, { color: undefined })}
                      title="Reset to rack color"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
              <div className="editor-panel__prop-row">
                <span className="editor-panel__prop-label">Position</span>
                <span className="editor-panel__prop-value">
                  {Math.round(selectedLocation.x)}, {Math.round(selectedLocation.y)}
                </span>
              </div>
              <button
                type="button"
                className="editor-panel__delete-btn"
                onClick={() => onDeleteLocation(selectedLocation.id)}
              >
                Delete Location
              </button>
            </div>
          ) : (
            <p className="editor-panel__no-selection">
              {activeTool === "add"
                ? "Click on the map to place a new location."
                : "Click a location to edit its properties."}
            </p>
          )}

          {/* Edit summary */}
          <div className="editor-panel__summary">
            <span className="editor-panel__summary-label">Edits:</span>
            {modifiedCount > 0 && <span className="editor-panel__badge editor-panel__badge--modified">{modifiedCount} modified</span>}
            {addedCount > 0 && <span className="editor-panel__badge editor-panel__badge--added">{addedCount} added</span>}
            {deletedCount > 0 && <span className="editor-panel__badge editor-panel__badge--deleted">{deletedCount} deleted</span>}
            {editCount === 0 && <span className="editor-panel__badge">none</span>}
          </div>
        </div>
      )}

      {/* Racks tab */}
      {activeTab === "racks" && (
        <div className="editor-panel__section">
          <div className="editor-panel__rack-list">
            {rackList.map((rackId) => (
              <div key={rackId} className="editor-panel__rack-row">
                <span className="editor-panel__rack-name">{rackId}</span>
                <div className="editor-panel__color-grid editor-panel__color-grid--tiny">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`editor-panel__color-swatch editor-panel__color-swatch--tiny ${rackColors[rackId] === c ? "editor-panel__color-swatch--selected" : ""}`}
                      style={{ background: c }}
                      onClick={() => onSetRackColor(rackId, rackColors[rackId] === c ? null : c)}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deleted tab */}
      {activeTab === "deleted" && (
        <div className="editor-panel__section">
          <div className="editor-panel__deleted-list">
            {floorEdits.deleted.map((id) => (
              <div key={id} className="editor-panel__deleted-item">
                <span>{id}</span>
                <button
                  type="button"
                  className="editor-panel__restore-btn"
                  onClick={() => onUndeleteLocation(id)}
                  title="Restore"
                >
                  ↺
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className="editor-panel__actions">
        {editCount > 0 && (
          <button type="button" className="editor-panel__action-btn editor-panel__action-btn--danger" onClick={onResetAll}>
            Reset All
          </button>
        )}
        <button type="button" className="editor-panel__action-btn" onClick={onExport}>
          Export
        </button>
        <label className="editor-panel__action-btn editor-panel__action-btn--import">
          Import
          <input type="file" accept=".json" onChange={onImport} hidden />
        </label>
      </div>
    </div>
  );
}
