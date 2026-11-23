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
};

export function layoutDocument({ boxes, page, margin, fonts }: LayoutInput): {
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

  const lineMetrics = (s: TextStyle) => {
    const f = fontFor(s);
    const contentH = (f.ascent - f.descent) * s.size;
    const lh = s.lineHeight ? s.lineHeight * s.size : contentH + f.lineGap * s.size;
    return { lh, baseline: (lh - contentH) / 2 + f.ascent * s.size };
  };

  // ---- paragraphs ---------------------------------------------------------

  type Piece = { text: string; style: TextStyle; href?: string; width: number };
  type Unit = { pieces: Piece[]; width: number }; // unbreakable word (may span styles)
  type Token = { kind: "unit"; unit: Unit } | { kind: "space"; piece: Piece } | { kind: "br"; style: TextStyle };

  const tokenize = (runs: Run[]): Token[] => {
    const tokens: Token[] = [];
    let unit: Unit | null = null;
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
          tokens.push({ kind: "space", piece: { text: " ", style: r.style, href: r.href, width: fonts.measure(f, " ", r.style.size) } });
        } else {
          const piece = { text: part, style: r.style, href: r.href, width: fonts.measure(f, part, r.style.size) };
          if (!unit) unit = { pieces: [], width: 0 };
          unit.pieces.push(piece);
          unit.width += piece.width;
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
      const f = fontFor(p.style);
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
        line += fonts.measure(fontFor(r.style), r.text.replace(/\s+/g, " "), r.style.size);
      }
    }
    return Math.max(w, line);
  };

  const paraLines = (box: Extract<Box, { kind: "para" }>, x: number, width: number): Flow[] => {
    const flows: Flow[] = [];
    breakLines(box.runs, box.style, width).forEach((line, li) => {
      // Line height/baseline: tallest piece (or the paragraph style if empty).
      const styles = line.pieces.length ? line.pieces.map((p) => p.style) : [line.style];
      let lh = 0;
      let baseline = 0;
      for (const s of styles) {
        const m = lineMetrics(s);
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
        while (j < line.pieces.length && line.pieces[j].style === p.style && line.pieces[j].href === p.href) {
          text += line.pieces[j].text;
          w += line.pieces[j].width;
          j++;
        }
        const id = `${box.id}/l${li}/r${ri++}`;
        const f = fontFor(p.style);
        draws.push({ type: "text", id, x: cx, y: baseline, text, fontKey: f.key, size: p.style.size, color: p.style.color, width: w });
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
    const inner: Flow[] =
      box.kind === "para"
        ? paraLines(box, x, width)
        : box.kind === "stack"
        ? box.children.flatMap((c) => flatten(c, x, width))
        : box.kind === "row"
        ? [rowLine(box, x, width)]
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

  const flows = boxes.flatMap((b) => flatten(b, ml, contentWidth));
  const top = mt;
  const bottom = page.height - mb;
  const bodyHeight = bottom - top;

  const pages: LaidOutPage[] = [];
  let items: DisplayItem[] = [];
  let y = top;
  let atTop = true;
  const newPage = () => {
    pages.push({ index: pages.length, width: page.width, height: page.height, items });
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
  if (items.length || pages.length === 0) newPage();

  return { pages, fontKeys: [...usedFonts] };
}
