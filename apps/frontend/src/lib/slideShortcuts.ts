export const slideShortcuts = [
  ["← / → · Space", "이전 / 다음 (그리기 중 ←/→는 색상 변경)"],
  ["PageUp / PageDown", "그리기 중에도 이전 / 다음"], ["Home / End", "처음 / 마지막"],
  ["J / K", "이전 / 다음 큰 제목"], ["F", "전체화면"], ["T", "목차"], ["?", "단축키 도움말"],
  ["M", "메모 추가"], ["N", "필기 슬라이드 추가"], ["D", "그리기 켜기 / 끄기"],
  ["E", "펜 / 지우개 전환"], ["1–6", "펜 색상"], ["↑ / ↓", "펜 굵기"],
  ["C", "현재 그림 지우기 (실행 취소 가능)"], ["Ctrl/⌘+Z", "실행 취소"],
  ["Ctrl/⌘+Shift+Z · Ctrl+Y", "다시 실행"], ["Ctrl/⌘+S", "작업 공간 저장"],
  ["P", "인쇄 / PDF"], ["Esc", "도움말·목차 닫기 → 그리기 해제 → 전체화면 종료 → 본문"],
] as const;

export function slideCommand(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; isComposing?: boolean; typing?: boolean }, drawing: boolean): string | null {
  if (event.isComposing || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === "s") return "save";
    if (event.typing) return null;
    if (key === "z") return event.shiftKey ? "redo" : "undo";
    return key === "y" ? "redo" : null;
  }
  if (event.typing) return null;
  if (drawing) {
    if (/^[1-6]$/.test(key)) return `color-${Number(key) - 1}`;
    const commands: Record<string, string> = { arrowleft: "color-prev", arrowright: "color-next", arrowup: "thicker", arrowdown: "thinner", e: "eraser", c: "clear" };
    if (commands[key]) return commands[key];
    if (key === " ") return null;
  }
  const commands: Record<string, string> = { arrowleft: "prev", arrowright: "next", " ": "next", pageup: "prev", pagedown: "next", home: "first", end: "last", j: "section-prev", k: "section-next", f: "fullscreen", t: "toc", "?": "help", m: "memo", n: "blank", d: "draw", p: "print", escape: "escape" };
  return commands[key] ?? null;
}
