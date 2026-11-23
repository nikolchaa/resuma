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

const Item = memo(function Item({ item }: { item: DisplayItem }) {
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
      return <rect x={item.x} y={item.y} width={item.w} height={item.h} fill={item.color} />;
    case "link":
      return null; // links are only meaningful in the PDF
  }
}, sameItem);

function sameItem(a: { item: DisplayItem }, b: { item: DisplayItem }) {
  const x = a.item as Record<string, unknown>;
  const y = b.item as Record<string, unknown>;
  for (const k in x) if (x[k] !== y[k]) return false;
  return true;
}

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
        <Item key={item.id} item={item} />
      ))}
    </svg>
  );
});
