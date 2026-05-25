import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

export type PickingListItem = {
  itemCode: string;
  dna: string;
  qtyToPick: number;
  unit: string;
  locations: { locationId: string; qty: number }[];
  positionNumber: number;
};

export type ParsedPickingList = {
  mnbCode: string;
  date: string;
  department: string;
  workCenter: string;
  items: PickingListItem[];
};

/**
 * Normalize a PDF location code to match the app's location ID format.
 * PDF has codes like "90307D", "IP91001A", "P921905A".
 * App has IDs like "90307", "IP901", "P9205".
 *
 * Strategy: strip the trailing letter suffix from the location code,
 * then match against known location IDs in the app.
 */
export function normalizePdfLocation(raw: string): string {
  let s = raw.trim().toUpperCase();
  // Strip trailing letter (A-G are shelf levels)
  s = s.replace(/[A-G]$/, "");
  return s;
}

async function extractTextFromPdf(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("\n");
    pages.push(text);
  }

  return pages;
}

export async function parsePickingListPdf(
  file: File,
): Promise<ParsedPickingList> {
  const pages = await extractTextFromPdf(file);
  const allText = pages.join("\n---PAGE---\n");

  // Extract MNB code
  const mnbMatch = allText.match(/(MNB\d+)/);
  const mnbCode = mnbMatch ? mnbMatch[1] : "UNKNOWN";

  // Extract date
  const dateMatch = allText.match(/of the:\n(\d{4}\/\d{2}\/\d{2})/);
  const date = dateMatch ? dateMatch[1] : "";

  // Extract department
  const deptMatch = allText.match(/Department:\n(.+)/);
  const department = deptMatch ? deptMatch[1].trim() : "";

  // Extract work center
  const wcMatch = allText.match(/Work center:\n(.+)/);
  const workCenter = wcMatch ? wcMatch[1].trim() : "";

  // Parse items from pages (skip page 1 which is summary)
  const items = parseItems(allText);

  return { mnbCode, date, department, workCenter, items };
}

function parseItems(allText: string): PickingListItem[] {
  const items: PickingListItem[] = [];

  // Pattern to match WMS item entries
  // WMS <floor>+<code>
  // <item-code>
  // <qty> <unit>
  const wmsPattern =
    /WMS \d\+([A-Z]{3}\d{5}\.\d)\n([A-Z]{2,4}-[\w-]+)\n(\d+) ([A-Z]+)\n/g;

  let match;
  const entryPositions: {
    loc: string;
    itemCode: string;
    qty: number;
    unit: string;
    startIdx: number;
    endIdx: number;
  }[] = [];

  while ((match = wmsPattern.exec(allText)) !== null) {
    entryPositions.push({
      loc: match[1],
      itemCode: match[2],
      qty: parseInt(match[3], 10),
      unit: match[4],
      startIdx: match.index,
      endIdx: match.index + match[0].length,
    });
  }

  // For each entry, extract warehouse locations and DNA from the text after it
  for (let i = 0; i < entryPositions.length; i++) {
    const entry = entryPositions[i];
    const nextStart =
      i + 1 < entryPositions.length
        ? entryPositions[i + 1].startIdx
        : allText.length;
    const blockText = allText.slice(entry.endIdx, nextStart);

    // Extract warehouse locations (5-digit codes + optional letter, or IP/P prefixed)
    const locations: { locationId: string; qty: number }[] = [];
    const locPattern =
      /\n(\d{5}[A-G]?)\n([\d,]+)\n|\n(IP\d{5,}[A-Z]?)\n([\d,]+)\n|\n(P\d{5,}[A-Z]?)\n([\d,]+)\n/g;
    let locMatch;
    while ((locMatch = locPattern.exec(blockText)) !== null) {
      const locId = locMatch[1] || locMatch[3] || locMatch[5];
      const qtyStr = locMatch[2] || locMatch[4] || locMatch[6];
      if (locId && locId !== "OUTBOUND") {
        locations.push({
          locationId: normalizePdfLocation(locId),
          qty: parseInt(qtyStr.replace(/,/g, ""), 10),
        });
      }
    }

    // Extract DNA
    const dnaMatch = blockText.match(/(\d\+\d{10}\.\d{2}\.\d{4})/);
    const dna = dnaMatch ? dnaMatch[1] : "";

    // Extract position number (Pos. prl)
    const posMatch = blockText.match(/\n(\d{1,3})\n/);
    const positionNumber = posMatch ? parseInt(posMatch[1], 10) : i + 1;

    items.push({
      itemCode: entry.itemCode,
      dna,
      qtyToPick: entry.qty,
      unit: entry.unit,
      locations,
      positionNumber,
    });
  }

  return items;
}

export type MergedPickingItem = {
  itemCode: string;
  dna: string;
  qtyToPick: number;
  unit: string;
  pickLocation: string;
  pickLocationRaw: string;
  inventoryAtLocation: number;
  sourceMnb: string;
  positionNumber: number;
};

export type MergedPickingList = {
  mnbCodes: string[];
  items: MergedPickingItem[];
};

/**
 * Merge multiple parsed picking lists into a single consolidated list.
 * Each item gets its primary pick location (first storage location).
 */
export function mergePickingLists(
  lists: ParsedPickingList[],
): MergedPickingList {
  const mnbCodes = lists.map((l) => l.mnbCode);
  const items: MergedPickingItem[] = [];

  for (const list of lists) {
    for (const item of list.items) {
      const primaryLoc =
        item.locations.length > 0 ? item.locations[0] : null;

      items.push({
        itemCode: item.itemCode,
        dna: item.dna,
        qtyToPick: item.qtyToPick,
        unit: item.unit,
        pickLocation: primaryLoc ? primaryLoc.locationId : "",
        pickLocationRaw: primaryLoc ? primaryLoc.locationId : "",
        inventoryAtLocation: primaryLoc ? primaryLoc.qty : 0,
        sourceMnb: list.mnbCode,
        positionNumber: item.positionNumber,
      });
    }
  }

  return { mnbCodes, items };
}
