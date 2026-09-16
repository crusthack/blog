import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";

export type Slide = { id: string; title: string; source: string; section: string; depth: number; blank?: boolean };
export type Point = { x: number; y: number };
export type Stroke = { id: string; color: string; size: number; points: Point[] };
export type Memo = { id: string; text: string; x: number; y: number; width: number; height: number; collapsed: boolean };
export type Annotation = { strokes: Stroke[]; memos: Memo[] };
export type Workspace = { annotations: Record<string, Annotation>; blanks: { id: string; after: string }[] };
export const emptyWorkspace = (): Workspace => ({ annotations: {}, blanks: [] });
export const emptyAnnotation = (): Annotation => ({ strokes: [], memos: [] });
export const colors = ["#000000", "#ffffff", "#ef4444", "#2563eb", "#22c55e", "#eab308"];
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// AST positions preserve complete code fences, tables and reference definitions.
export function splitSlides(source: string, title: string, mode: "auto" | "manual" = "auto"): Slide[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source);
  const raw = (node: (typeof tree.children)[number]) => source.slice(node.position?.start.offset, node.position?.end.offset);
  const definitions = tree.children.filter(node => node.type === "definition").map(raw).join("\n\n");
  const slides: Slide[] = [{ id: "title", title, source: "", section: "title", depth: 0 }];
  let parts: string[] = [], weight = 0, heading = title, section = "body", depth = 1;
  function flush() {
    if (!parts.length) return;
    slides.push({ id: `body-${slides.length}`, title: heading, section, depth, source: parts.join("\n\n") + (definitions ? `\n\n${definitions}` : "") });
    parts = []; weight = 0;
  }
  for (const node of tree.children) {
    if (node.type === "definition") continue;
    if (node.type === "thematicBreak") { flush(); continue; }
    if (node.type === "heading" && mode === "auto") {
      flush(); heading = toString(node); depth = node.depth;
      if (node.depth <= 2) section = `section-${slides.length}`;
    } else if (node.type === "heading" && !parts.length) {
      heading = toString(node); depth = node.depth; section = `section-${slides.length}`;
    }
    const text = raw(node);
    const cost = node.type === "heading" ? 1 : node.type === "code" || node.type === "table" ? 5
      : Math.max(1, Math.ceil(text.length / 180));
    if (mode === "auto" && weight + cost > 10 && parts.length && weight > 1) flush();
    parts.push(text); weight += cost;
  }
  flush();
  return slides;
}

export function withBlankSlides(source: Slide[], workspace: Workspace): Slide[] {
  const result: Slide[] = [];
  const seen = new Set<string>();
  const append = (slide: Slide) => {
    if (seen.has(slide.id)) return;
    seen.add(slide.id); result.push(slide);
    for (const blank of workspace.blanks.filter(item => item.after === slide.id)) {
      append({ id: blank.id, title: "필기 슬라이드", source: "", section: slide.section, depth: slide.depth, blank: true });
    }
  };
  source.forEach(append);
  return result;
}

export function removeBlank(workspace: Workspace, id: string): Workspace {
  const removed = workspace.blanks.find(blank => blank.id === id);
  if (!removed) return workspace;
  const annotations = { ...workspace.annotations };
  delete annotations[id];
  return { annotations, blanks: workspace.blanks.filter(blank => blank.id !== id)
    .map(blank => blank.after === id ? { ...blank, after: removed.after } : blank) };
}

export type History = { past: Workspace[]; present: Workspace; future: Workspace[]; group?: string };
export type HistoryAction = { type: "change"; next: Workspace; group?: string } | { type: "undo" | "redo" } | { type: "reset"; next: Workspace };
export function workspaceHistory(state: History, action: HistoryAction): History {
  if (action.type === "reset") return { past: [], present: action.next, future: [] };
  if (action.type === "undo") return state.past.length ? { past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future] } : state;
  if (action.type === "redo") return state.future.length ? { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) } : state;
  if (action.type !== "change") return state;
  return { past: action.group && action.group === state.group ? state.past : [...state.past, state.present].slice(-60),
    present: action.next, future: [], group: action.group };
}
