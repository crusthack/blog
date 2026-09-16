"use client";

import { useRef, useState, type PointerEvent } from "react";
import { clamp, type Point, type Stroke } from "@/lib/slides";

export function DrawingPaths({ strokes }: { strokes: Stroke[] }) {
  return <>{strokes.map(stroke => <polyline key={stroke.id} data-stroke={stroke.id}
    points={stroke.points.map(point => `${point.x},${point.y}`).join(" ")}
    fill="none" stroke={stroke.color} strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" />)}</>;
}

export function SlideDrawing({ strokes, enabled, eraser, color, size, onChange }: {
  strokes: Stroke[]; enabled: boolean; eraser: boolean; color: string; size: number; onChange: (strokes: Stroke[]) => void;
}) {
  const active = useRef<{ pointer: number; stroke: Stroke } | null>(null);
  const [preview, setPreview] = useState<Stroke | null>(null);
  function point(event: PointerEvent<SVGSVGElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width * 1200, 0, 1200), y: clamp((event.clientY - rect.top) / rect.height * 750, 0, 750) };
  }
  function erase(event: PointerEvent<SVGSVGElement>) {
    const p = point(event);
    const distance = (a: Point, b: Point) => {
      const length = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t = length ? clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length, 0, 1) : 0;
      return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
    };
    const hit = [...strokes].reverse().find(stroke => stroke.points.some((p, index) => distance(p, stroke.points[index + 1] ?? p) < Math.max(10, size + stroke.size / 2)));
    if (hit) onChange(strokes.filter(stroke => stroke.id !== hit.id));
  }
  function finish(event: PointerEvent<SVGSVGElement>, cancel = false) {
    if (active.current?.pointer !== event.pointerId) return;
    const stroke = active.current.stroke;
    active.current = null; setPreview(null);
    if (!cancel) onChange([...strokes, stroke]);
  }
  return <svg className="slide-drawing" viewBox="0 0 1200 750" aria-label="슬라이드 그림 영역" role="img"
    style={{ pointerEvents: enabled ? "auto" : "none", touchAction: enabled ? "none" : "auto" }}
    onPointerDown={event => {
      if (!enabled || event.button !== 0 || active.current) return;
      event.preventDefault();
      if (eraser) { erase(event); return; }
      if (strokes.length >= 500) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const p = point(event);
      const stroke = { id: crypto.randomUUID(), color, size, points: [p, { x: p.x + 0.01, y: p.y }] };
      active.current = { pointer: event.pointerId, stroke }; setPreview(stroke);
    }}
    onPointerMove={event => {
      if (!active.current || active.current.pointer !== event.pointerId) return;
      if (active.current.stroke.points.length >= 4000) return;
      const stroke = { ...active.current.stroke, points: [...active.current.stroke.points, point(event)] };
      active.current.stroke = stroke; setPreview(stroke);
    }}
    onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}>
    <DrawingPaths strokes={preview ? [...strokes, preview] : strokes} />
  </svg>;
}
