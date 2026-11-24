/**
 * Box tree → pages of positioned display items.
 *
 * Two passes: `flatten` turns boxes into a vertical list of atomic lines and
 * discardable spaces (margins/padding), then `paginate` places them on pages,
 * honouring keep-with-next / keep-together. Every item keeps a stable id
 * derived from its box, so the screen painter can update in place.
 */
import { FontSet, LoadedFont } from "./fonts";
import type { Box, DisplayItem, LaidOutPage, PageSize, Run, TextStyle } from "./types";
import type { CompiledColumns } from "./compile";

type Draw = DisplayItem; // y is relative to the flow item's top

type Flow =
  | { kind: "space"; h: number }
  | { kind: "line"; h: number; keepWithNext: boolean; draws: Draw[] };

const ROW_GAP = 8;

export type LayoutInput = {
  boxes: Box[];
  page: PageSize;
  margin: [number, number, number, number];
  fonts: FontSet;
  /** Two columns below `boxes` (which then hold only the full-width header). */
  columns?: CompiledColumns;
};

export function layoutDocument({ boxes, page, margin, fonts, columns }: LayoutInput): {
  pages: LaidOutPage[];
  fontKeys: string[];
} {
  const [mt, mr, mb, ml] = margin;
  const contentWidth = Math.max(50, page.width - ml - mr);
  const usedFonts = new Set<string>();

  const fontFor = (s: TextStyle): LoadedFont => {
    const f = fonts.get(s.family, s.weight);
    usedFonts.add(f.key);
    return f;
  };

  const lineMetrics = (s: TextStyle, f: LoadedFont = fontFor(s)) => {
    usedFonts.add(f.key);
    const contentH = (f.ascent - f.descent) * s.size;
    const lh = s.lineHeight ? s.lineHeight * s.size : contentH + f.lineGap * s.size;
    return { lh, baseline: (lh - contentH) / 2 + f.ascent * s.size };
  };

  // ---- paragraphs ---------------------------------------------------------

  type Piece = { text: string; style: TextStyle; font: LoadedFont; href?: string; width: number };
  type Unit = { pieces: Piece[]; width: number }; // unbreakable word (may span styles)
  type Token = { kind: "unit"; unit: Unit } | { kind: "space"; piece: Piece } | { kind: "br"; style: TextStyle };

  const tokenize = (runs: Run[]): Token[] => {
    const tokens: Token[] = [];
    let unit: Unit | null = null;
    let lastFont: LoadedFont | null = null;
    const endUnit = () => {
      if (unit) tokens.push({ kind: "unit", unit });
      unit = null;
    };
    for (const r of runs) {
      if ("br" in r) {
        endUnit();
        tokens.push({ kind: "br", style: r.style });
        continue;
      }
      const f = fontFor(r.style);
      for (const part of r.text.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          endUnit();
          // A space takes the font of the word before it, so fallback text stays one run.
          const sf = lastFont && lastFont.weight === f.weight ? lastFont : f;
          tokens.push({ kind: "space", piece: { text: " ", style: r.style, font: sf, href: r.href, width: fonts.measure(sf, " ", r.style.size) } });
        } else {
          if (!unit) unit = { pieces: [], width: 0 };
          // Characters the font lacks (e.g. Cyrillic) switch to the fallback font.
          for (const seg of fonts.segment(f, part)) {
            usedFonts.add(seg.font.key);
            const piece = { text: seg.text, style: r.style, font: seg.font, href: r.href, width: fonts.measure(seg.font, seg.text, r.style.size) };
            unit.pieces.push(piece);
            unit.width += piece.width;
            lastFont = seg.font;
          }
        }
      }
    }
    endUnit();
    return tokens;
  };

  /** Splits a unit wider than the line into chunks that fit. */
  const splitUnit = (unit: Unit, maxW: number): Unit[] => {
    const out: Unit[] = [];
    let cur: Unit = { pieces: [], width: 0 };
    for (const p of unit.pieces) {
      const f = p.font;
      let buf = "";
      for (const ch of Array.from(p.text)) {
        const w = fonts.measure(f, buf + ch, p.style.size);
        if (cur.width + w > maxW && (cur.pieces.length || buf)) {
          if (buf) {
            const bw = fonts.measure(f, buf, p.style.size);
            cur.pieces.push({ ...p, text: buf, width: bw });
            cur.width += bw;
          }
          out.push(cur);
          cur = { pieces: [], width: 0 };
          buf = ch;
        } else {
          buf += ch;
        }
      }
      if (buf) {
        const bw = fonts.measure(f, buf, p.style.size);
        cur.pieces.push({ ...p, text: buf, width: bw });
        cur.width += bw;
      }
    }
    if (cur.pieces.length) out.push(cur);
    return out;
  };

  type Line = { pieces: Piece[]; width: number; style: TextStyle };

  const breakLines = (runs: Run[], base: TextStyle, maxW: number): Line[] => {
    const lines: Line[] = [];
    let cur: Line = { pieces: [], width: 0, style: base };
    let pendingSpace: Piece | null = null;
    const push = () => {
      lines.push(cur);
      cur = { pieces: [], width: 0, style: base };
      pendingSpace = null;
    };
    const addUnit = (u: Unit) => {
      const sp = cur.pieces.length && pendingSpace ? pendingSpace : null;
      const needed = (sp ? sp.width : 0) + u.width;
      if (cur.pieces.length && cur.width + needed > maxW + 0.001) push();
      if (cur.pieces.length && sp) {
        cur.pieces.push(sp);
        cur.width += sp.width;
      }
      cur.pieces.push(...u.pieces);
      cur.width += u.width;
      pendingSpace = null;
    };
    for (const tok of tokenize(runs)) {
      if (tok.kind === "br") {
        push();
        cur.style = tok.style;
      } else if (tok.kind === "space") {
        if (cur.pieces.length) pendingSpace = tok.piece;
      } else if (tok.unit.width > maxW) {
        for (const chunk of splitUnit(tok.unit, maxW)) addUnit(chunk);
      } else {
        addUnit(tok.unit);
      }
    }
    if (cur.pieces.length || lines.length === 0) lines.push(cur);
    return lines;
  };

  /** Natural single-line width of a paragraph (for row cells). */
  const naturalWidth = (runs: Run[]): number => {
    let w = 0;
    let line = 0;
    for (const r of runs) {
      if ("br" in r) {
        w = Math.max(w, line);
        line = 0;
      } else {
        for (const seg of fonts.segment(fontFor(r.style), r.text.replace(/\s+/g, " "))) {
          line += fonts.measure(seg.font, seg.text, r.style.size);
        }
      }
    }
    return Math.max(w, line);
  };

  const paraLines = (box: Extract<Box, { kind: "para" }>, x: number, width: number): Flow[] => {
    const flows: Flow[] = [];
    breakLines(box.runs, box.style, width).forEach((line, li) => {
      // Line height/baseline: tallest piece (or the paragraph style if empty).
      const metrics = line.pieces.length
        ? line.pieces.map((p) => lineMetrics(p.style, p.font))
        : [lineMetrics(line.style)];
      let lh = 0;
      let baseline = 0;
      for (const m of metrics) {
        lh = Math.max(lh, m.lh);
        baseline = Math.max(baseline, m.baseline);
      }
      const align = box.style.align;
      let cx = x + (align === "center" ? (width - line.width) / 2 : align === "right" ? width - line.width : 0);
      const draws: Draw[] = [];
      // Merge consecutive pieces with identical style/link into one text item.
      let ri = 0;
      let i = 0;
      while (i < line.pieces.length) {
        const p = line.pieces[i];
        let text = p.text;
        let w = p.width;
        let j = i + 1;
        while (j < line.pieces.length && line.pieces[j].style === p.style && line.pieces[j].font === p.font && line.pieces[j].href === p.href) {
          text += line.pieces[j].text;
          w += line.pieces[j].width;
          j++;
        }
        const id = `${box.id}/l${li}/r${ri++}`;
        draws.push({ type: "text", id, x: cx, y: baseline, text, fontKey: p.font.key, size: p.style.size, color: p.style.color, width: w });
        if (p.href) draws.push({ type: "link", id: id + "/a", x: cx, y: 0, w, h: lh, href: p.href });
        cx += w;
        i = j;
      }
      flows.push({ kind: "line", h: lh, keepWithNext: false, draws });
    });
    return flows;
  };

  // ---- boxes --------------------------------------------------------------

  const flatten = (box: Box, x: number, width: number): Flow[] => {
    const sp = box.spacing;
    // Horizontal padding insets the content; a bottom border still spans the box.
    const ix = x + (sp.paddingLeft ?? 0);
    const iw = Math.max(20, width - (sp.paddingLeft ?? 0) - (sp.paddingRight ?? 0));
    const inner: Flow[] =
      box.kind === "para"
        ? paraLines(box, ix, iw)
        : box.kind === "stack"
        ? box.children.flatMap((c) => flatten(c, ix, iw))
        : box.kind === "row"
        ? [rowLine(box, ix, iw)]
        : [];

    const flows: Flow[] = [];
    if (sp.marginTop) flows.push({ kind: "space", h: sp.marginTop });
    if (sp.paddingTop) flows.push({ kind: "space", h: sp.paddingTop });
    flows.push(...inner);
    if (sp.paddingBottom) flows.push({ kind: "space", h: sp.paddingBottom });
    if (sp.border && sp.border.width > 0) {
      flows.push({
        kind: "line",
        h: sp.border.width,
        keepWithNext: false,
        draws: [{ type: "rect", id: `${box.id}/border`, x, y: 0, w: width, h: sp.border.width, color: sp.border.color }],
      });
    }

    const lines = flows.filter((f): f is Extract<Flow, { kind: "line" }> => f.kind === "line");
    if (sp.keep === "with-next") lines.forEach((l) => (l.keepWithNext = true));
    if (sp.keep === "together") lines.slice(0, -1).forEach((l) => (l.keepWithNext = true));

    if (sp.marginBottom) flows.push({ kind: "space", h: sp.marginBottom });
    return flows;
  };

  /** Stacks flows without page breaks (used for row cells). */
  const stackFlows = (flows: Flow[]): { h: number; draws: Draw[] } => {
    let y = 0;
    const draws: Draw[] = [];
    for (const f of flows) {
      if (f.kind === "line") for (const d of f.draws) draws.push({ ...d, y: d.y + y });
      y += f.h;
    }
    return { h: y, draws };
  };

  const cellWidth = (cell: Box[]): number =>
    Math.max(
      0,
      ...cell.map((b) =>
        b.kind === "para" ? naturalWidth(b.runs) : b.kind === "stack" ? cellWidth(b.children) : 0
      )
    );

  const rowLine = (box: Extract<Box, { kind: "row" }>, x: number, width: number): Flow => {
    const wl = cellWidth(box.left);
    const wr = cellWidth(box.right);
    let leftW: number;
    let rightW: number;
    if (wl + wr + ROW_GAP <= width) {
      rightW = wr;
      leftW = width - wr - ROW_GAP;
    } else {
      const total = wl + wr || 1;
      leftW = Math.max(20, (width - ROW_GAP) * (wl / total));
      rightW = Math.max(20, width - ROW_GAP - leftW);
    }
    const left = stackFlows(box.left.flatMap((b) => flatten(b, x, leftW)));
    const right = stackFlows(box.right.flatMap((b) => flatten(b, x + width - rightW, rightW)));
    return { kind: "line", h: Math.max(left.h, right.h), keepWithNext: false, draws: [...left.draws, ...right.draws] };
  };

  // ---- pagination ---------------------------------------------------------

  const top = mt;
  const bottom = page.height - mb;
  const flows = boxes.flatMap((b) => flatten(b, ml, contentWidth));
  const main = paginate(flows, top, top, bottom);
  const pageItems = columns ? layoutColumns(columns, main) : main.pages;

  function layoutColumns(cols: CompiledColumns, header: Paginated): DisplayItem[][] {
    const avail = Math.max(40, contentWidth - cols.gap);
    const w0 = avail * cols.widths[0];
    const geometry = [
      { x: ml, w: w0 },
      { x: ml + w0 + cols.gap, w: avail - w0 },
    ];
    // Columns start below the full-width header, on the page where it ends.
    const offset = Math.max(0, header.pages.length - 1);
    const firstTop = header.pages.length ? header.endY : top;

    const columnPages = ([0, 1] as const).map((c) => {
      const { x, w } = geometry[c];
      const f = cols.frames[c];
      const ix = x + f.paddingLeft;
      const iw = Math.max(20, w - f.paddingLeft - f.paddingRight);
      return paginate(cols.boxes[c].flatMap((b) => flatten(b, ix, iw)), firstTop, top, bottom).pages;
    });

    const count = Math.max(1, header.pages.length, offset + columnPages[0].length, offset + columnPages[1].length);
    const out: DisplayItem[][] = [];
    for (let p = 0; p < count; p++) {
      const items: DisplayItem[] = [];
      // Backgrounds first so text paints on top; they run to the outer page
      // edge and the full page height (below the header on its page).
      if (p >= offset) {
        // With both columns filled, they meet in the middle of the gap
        // instead of leaving a white stripe between them.
        const both = Boolean(cols.frames[0].background && cols.frames[1].background);
        const middle = geometry[0].x + geometry[0].w + cols.gap / 2;
        ([0, 1] as const).forEach((c) => {
          const color = cols.frames[c].background;
          if (!color) return;
          const y = p === offset && header.pages.length ? header.endY : 0;
          const { x, w } = geometry[c];
          const left = c === 0 ? 0 : both ? middle : x;
          const right = c === 0 ? (both ? middle : x + w) : page.width;
          items.push({ type: "rect", id: `cols/bg${c}`, x: left, y, w: right - left, h: page.height - y, color });
        });
      }
      items.push(...(header.pages[p] ?? []));
      for (const c of [0, 1] as const) items.push(...(columnPages[c][p - offset] ?? []));
      out.push(items);
    }
    return out;
  }

  const pages: LaidOutPage[] = pageItems.map((items, index) => ({
    index,
    width: page.width,
    height: page.height,
    items,
  }));
  if (pages.length === 0) pages.push({ index: 0, width: page.width, height: page.height, items: [] });

  return { pages, fontKeys: [...usedFonts] };
}

type Paginated = {
  /** Items per page; no trailing empty page. */
  pages: DisplayItem[][];
  /** Where the content ends on its last page (`firstTop` when there is none). */
  endY: number;
};

/**
 * Places flows on pages, honouring keep-with-next. The first page starts at
 * `firstTop` (below a full-width header, say), later pages at `top`.
 */
function paginate(flows: Flow[], firstTop: number, top: number, bottom: number): Paginated {
  const bodyHeight = bottom - top;
  const pages: DisplayItem[][] = [];
  let items: DisplayItem[] = [];
  let y = firstTop;
  let atTop = true;
  const newPage = () => {
    pages.push(items);
    items = [];
    y = top;
    atTop = true;
  };

  for (let i = 0; i < flows.length; i++) {
    const f = flows[i];
    if (f.kind === "space") {
      if (atTop) continue;
      if (y + f.h > bottom) {
        newPage();
        continue;
      }
      y += f.h;
      continue;
    }
    // Height this line needs together with lines it must stay with.
    let need = f.h;
    if (f.keepWithNext) {
      for (let j = i + 1; j < flows.length; j++) {
        const g = flows[j];
        need += g.h;
        if (g.kind === "line" && !g.keepWithNext) break;
      }
    }
    if (!atTop && (y + f.h > bottom + 0.001 || (need <= bodyHeight && y + need > bottom + 0.001))) {
      newPage();
    }
    for (const d of f.draws) items.push({ ...d, y: d.y + y });
    y += f.h;
    atTop = false;
  }
  const endY = y;
  if (items.length) newPage();
  return { pages, endY };
}
