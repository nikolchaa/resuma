/**
 * Screen painter: one SVG per page, one <text>/<rect> per display item,
 * keyed by the item's stable id. Typing re-renders only the items whose
 * props changed, so the preview never blanks or flashes.
 */
import { memo } from "react";
import type { DisplayItem, LaidOutPage } from "../engine/types";
import { cssFamily } from "../engine/fonts";

const TEXT_STYLE: React.CSSProperties = {
  whiteSpace: "pre",
  fontKerning: "none",
  fontVariantLigatures: "none",
  fontFeatureSettings: '"kern" 0, "liga" 0, "calt" 0',
};

const Item = memo(function Item({ item, crisp }: { item: DisplayItem; crisp?: boolean }) {
  switch (item.type) {
    case "text":
      return (
        <text
          x={item.x}
          y={item.y}
          fontFamily={cssFamily(item.fontKey)}
          fontSize={item.size}
          fill={item.color}
          style={TEXT_STYLE}
        >
          {item.text}
        </text>
      );
    case "rect":
      return (
        <rect
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
          fill={item.color}
          shapeRendering={crisp ? "crispEdges" : undefined}
        />
      );
    case "link":
      return null; // links are only meaningful in the PDF
  }
}, sameItem);

function sameItem(a: { item: DisplayItem; crisp?: boolean }, b: { item: DisplayItem; crisp?: boolean }) {
  if (a.crisp !== b.crisp) return false;
  const x = a.item as Record<string, unknown>;
  const y = b.item as Record<string, unknown>;
  for (const k in x) if (x[k] !== y[k]) return false;
  return true;
}

/**
 * Areas that reach the page edge (a column background) are drawn with crisp
 * edges: the preview is scaled, and smoothing them against the white page
 * leaves a light seam along the edge. Thin rules stay smooth so equal rules
 * keep equal thickness.
 */
const touchesEdge = (item: DisplayItem, page: LaidOutPage) =>
  item.type === "rect" &&
  (item.x <= 0.01 || item.y <= 0.01 || item.x + item.w >= page.width - 0.01 || item.y + item.h >= page.height - 0.01);

export const SvgPage = memo(function SvgPage({
  page,
  width,
  className,
}: {
  page: LaidOutPage;
  /** Rendered width in CSS pixels. */
  width: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={width}
      height={(width * page.height) / page.width}
      viewBox={`0 0 ${page.width} ${page.height}`}
      textRendering='geometricPrecision'
      style={{ display: "block", background: "#ffffff", userSelect: "text" }}
    >
      <rect x={0} y={0} width={page.width} height={page.height} fill='#ffffff' />
      {page.items.map((item) => (
        <Item key={item.id} item={item} crisp={touchesEdge(item, page)} />
      ))}
    </svg>
  );
});
