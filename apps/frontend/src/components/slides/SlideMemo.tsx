"use client";

import { useRef, useState, type PointerEvent } from "react";
import { clamp, type Memo } from "@/lib/slides";

export function SlideMemo({ memo, onChange, onDelete }: { memo: Memo; onChange: (memo: Memo, group?: string) => void; onDelete: () => void }) {
  const gesture = useRef<{ x: number; y: number; scale: number; memo: Memo; resize: boolean } | null>(null);
  const [draft, setDraft] = useState<Memo | null>(null);
  const visible = draft ?? memo;
  function start(event: PointerEvent<HTMLElement>, resize: boolean) {
    if (event.button !== 0 || (event.target as Element).closest("button") && !resize) return;
    const stage = event.currentTarget.closest(".slide-stage")!;
    gesture.current = { x: event.clientX, y: event.clientY, scale: stage.getBoundingClientRect().width / 1200, memo, resize };
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function move(event: PointerEvent<HTMLElement>) {
    const state = gesture.current;
    if (!state) return;
    const dx = (event.clientX - state.x) / state.scale, dy = (event.clientY - state.y) / state.scale;
    setDraft(state.resize ? { ...memo, width: clamp(state.memo.width + dx, 200, 1200 - memo.x), height: clamp(state.memo.height + dy, 120, 750 - memo.y) }
      : { ...memo, x: clamp(state.memo.x + dx, 0, 1200 - memo.width), y: clamp(state.memo.y + dy, 0, 750 - memo.height) });
  }
  function finish() { if (draft) onChange(draft); gesture.current = null; setDraft(null); }
  return <aside className="slide-memo" style={{ left: visible.x, top: visible.y, width: visible.width, height: visible.collapsed ? 38 : visible.height }} aria-label="메모">
    <div className="slide-memo-handle" tabIndex={0} role="button" aria-label="메모 이동 (방향키 또는 드래그)"
      onPointerDown={event => start(event, false)} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={() => { gesture.current = null; setDraft(null); }}
      onKeyDown={event => {
        const delta: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
        if (!delta[event.key]) return; event.preventDefault(); event.stopPropagation();
        onChange({ ...memo, x: clamp(memo.x + delta[event.key][0], 0, 1200 - memo.width), y: clamp(memo.y + delta[event.key][1], 0, 750 - memo.height) });
      }}><span>메모 · 드래그 이동</span>
      <button type="button" aria-label={memo.collapsed ? "메모 펼치기" : "메모 접기"} onClick={() => onChange({ ...memo, collapsed: !memo.collapsed })}>{memo.collapsed ? "+" : "−"}</button>
      <button type="button" aria-label="메모 삭제" onClick={onDelete}>×</button>
    </div>
    {!memo.collapsed && <>
      <textarea aria-label="슬라이드 메모" placeholder="이 슬라이드에 메모하세요" value={memo.text} maxLength={20000}
        onChange={event => onChange({ ...memo, text: event.target.value }, `memo-${memo.id}`)} />
      <button type="button" className="slide-memo-resize" aria-label="메모 크기 조절 (방향키 또는 드래그)"
        onPointerDown={event => start(event, true)} onPointerMove={move} onPointerUp={finish}
        onPointerCancel={() => { gesture.current = null; setDraft(null); }}
        onKeyDown={event => {
          if (!event.key.startsWith("Arrow")) return; event.preventDefault(); event.stopPropagation();
          onChange({ ...memo, width: clamp(memo.width + (event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0), 200, 1200 - memo.x),
            height: clamp(memo.height + (event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0), 120, 750 - memo.y) });
        }}>↘</button>
    </>}
  </aside>;
}
