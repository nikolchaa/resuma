import type { Weight } from "../template/styles";

/** Inherited text properties, fully resolved. */
export type TextStyle = {
  family: string;
  weight: Weight;
  size: number;
  color: string;
  uppercase: boolean;
  align: "left" | "center" | "right";
  /** Line-height multiplier; undefined = the font's own ascent/descent/gap. */
  lineHeight?: number;
};

/** Non-inherited box properties. */
export type Spacing = {
  marginTop: number;
  marginBottom: number;
  paddingTop: number;
  paddingBottom: number;
  /** Horizontal insets; optional so existing boxes stay unchanged. */
  paddingLeft?: number;
  paddingRight?: number;
  border: { width: number; color: string } | null;
  keep?: "together" | "with-next";
};

export type Run =
  | { text: string; style: TextStyle; href?: string }
  | { br: true; style: TextStyle };

export type Box =
  | { kind: "para"; id: string; style: TextStyle; spacing: Spacing; runs: Run[] }
  | { kind: "stack"; id: string; spacing: Spacing; children: Box[] }
  | { kind: "row"; id: string; spacing: Spacing; left: Box[]; right: Box[] }
  | { kind: "rule"; id: string; spacing: Spacing };

export type DisplayItem =
  | {
      type: "text";
      id: string;
      x: number;
      /** Baseline. */
      y: number;
      text: string;
      fontKey: string;
      size: number;
      color: string;
      width: number;
    }
  | { type: "rect"; id: string; x: number; y: number; w: number; h: number; color: string }
  | { type: "link"; id: string; x: number; y: number; w: number; h: number; href: string };

export type PageSize = { width: number; height: number };

export const PAPER: Record<"A4" | "LETTER", PageSize> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

export type LaidOutPage = { index: number; width: number; height: number; items: DisplayItem[] };

export type DocumentMeta = {
  title: string;
  author: string;
  subject: string;
  language: string;
};

export type RenderedDocument = {
  pages: LaidOutPage[];
  meta: DocumentMeta;
  /** Font keys actually used, for PDF embedding. */
  fontKeys: string[];
};
