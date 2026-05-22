# Warehouse Picking Route Optimizer

Interactive warehouse picking route optimization app with DXF-derived floor plan visualization.

## Features

- **DXF Floor Plan Rendering** — Full CAD geometry (walls, racks, aisles) as SVG background
- **Route Optimization** — Dijkstra shortest path + nearest-neighbor TSP with 2-opt improvement
- **Picking List Input** — Enter location IDs, validates against floor data
- **Route Visualization** — Red dashed polyline with direction arrows and numbered stop markers
- **Color-coded Locations** — Racks with bounding boxes, pallet locations as squares
- **Interactive Map** — Pan/zoom with react-zoom-pan-pinch
- **Floor Toggle** — Switch between 9th floor (166 locations) and 8th floor (41 locations)

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Build

```bash
npm run build
```

## Deploy to GitHub Pages

The app is configured to deploy to GitHub Pages at `/warehousepickingopt/`.

## Location ID Format

All location IDs are normalized without hyphens:
- `IP9-01` → `IP901`
- `P92-05` → `P9205`
- `919-01` → `91901`

## AI Studio Files

For Google AI Studio, upload these TypeScript data modules:
- `warehouseData.ts` — locations and graph data
- `warehouseSvg.ts` — SVG floor plan strings
