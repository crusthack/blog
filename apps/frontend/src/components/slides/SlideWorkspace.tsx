"use client";

import { useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PostDetail } from "@/lib/contracts";
import { postPath } from "@/lib/postPaths";
import { clamp, colors, emptyAnnotation, emptyWorkspace, removeBlank, splitSlides, withBlankSlides, workspaceHistory, type Annotation, type History, type Workspace } from "@/lib/slides";
import { loadWorkspace, saveWorkspace, workspaceKey } from "@/lib/slideStorage";
import { slideCommand, slideShortcuts } from "@/lib/slideShortcuts";
import { MarkdownContent } from "@/components/posts/MarkdownContent";
import { DrawingPaths, SlideDrawing } from "./SlideDrawing";
import { SlideMemo } from "./SlideMemo";
import { ServerWorkspaceTools } from "./ServerWorkspaceTools";

export default function SlideWorkspace({ post, userId }: { post: PostDetail; userId: string | null }) {
  const [mode, setMode] = useState<"auto" | "manual">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("split") === "manual" ? "manual" : "auto");
  return <WorkspaceSession key={mode} post={post} userId={userId} mode={mode} onMode={next => {
    const url = new URL(window.location.href);
    if (next === "manual") url.searchParams.set("split", "manual"); else url.searchParams.delete("split");
    url.hash = "slide=1";
    window.history.replaceState(null, "", url);
    setMode(next);
  }} />;
}

function WorkspaceSession({ post, userId, mode, onMode }: { post: PostDetail; userId: string | null; mode: "auto" | "manual"; onMode: (mode: "auto" | "manual") => void }) {
  const router = useRouter();
  const sourceSlides = useMemo(() => splitSlides(post.content, post.title, mode), [post.content, post.title, mode]);
  const [history, dispatch] = useReducer(workspaceHistory, { past: [], present: emptyWorkspace(), future: [] } as History);
  const workspace = history.present;
  const slides = useMemo(() => withBlankSlides(sourceSlides, workspace), [sourceSlides, workspace]);
  const [index, setIndex] = useState(0);
  const currentIndex = clamp(index, 0, slides.length - 1);
  const slide = slides[currentIndex];
  const annotation = workspace.annotations[slide.id] ?? emptyAnnotation();
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(emptyWorkspace()));
  const [savedAt, setSavedAt] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [toc, setToc] = useState(false);
  const [help, setHelp] = useState(false);
  const [options, setOptions] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [eraser, setEraser] = useState(false);
  const [color, setColor] = useState(colors[2]);
  const [size, setSize] = useState(4);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const [theme, setTheme] = useState("system");
  const [fullscreen, setFullscreen] = useState(false);
  const [printNotes, setPrintNotes] = useState(true);
  const [pending, setPending] = useState<{ text: string; run: () => void } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const storage = useRef<{ key: string; revision: number } | null>(null);
  const saveLock = useRef(false);
  const leaving = useRef(false);
  const dirty = ready && JSON.stringify(workspace) !== savedSnapshot;
  const scale = fit * zoom;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const key = await workspaceKey(post.postNumber, userId, post.content, mode);
        const record = await loadWorkspace(key);
        if (cancelled) return;
        storage.current = { key, revision: record?.revision ?? 0 };
        const loaded = record?.workspace ?? emptyWorkspace();
        dispatch({ type: "reset", next: loaded }); setSavedSnapshot(JSON.stringify(loaded));
        setSavedAt(record?.savedAt ?? "");
        const requested = /^#slide=(\d+)$/.exec(window.location.hash);
        if (requested) setIndex(clamp(Number(requested[1]) - 1, 0, withBlankSlides(sourceSlides, loaded).length - 1));
      } catch {
        if (!cancelled) setError("브라우저 저장소를 열지 못했습니다. 이 화면에서는 작업할 수 있지만 영구 저장은 불가능합니다. 브라우저 저장소 설정을 확인하고 다시 열어 주세요.");
      } finally { if (!cancelled) setReady(true); }
    })();
    return () => { cancelled = true; };
  }, [post.postNumber, post.content, userId, mode, sourceSlides]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siblings: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement | null = root.current;
    while (branch?.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement && !["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName)) {
          siblings.push({ element: sibling, inert: sibling.inert }); sibling.inert = true;
        }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    root.current?.focus();
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setFit(Math.max(0.1, Math.min((width - 24) / 1200, (height - 24) / 750)));
    });
    if (viewport.current) observer.observe(viewport.current);
    function changed() { setFullscreen(document.fullscreenElement === root.current); }
    document.addEventListener("fullscreenchange", changed);
    return () => { observer.disconnect(); document.body.style.overflow = previous; siblings.forEach(({ element, inert }) => { element.inert = inert; }); document.removeEventListener("fullscreenchange", changed); };
  }, []);

  useEffect(() => {
    if (pending) dialog.current?.showModal(); else dialog.current?.close();
  }, [pending]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirty && !leaving.current) { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => {
    if (ready) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#slide=${currentIndex + 1}`);
  }, [currentIndex, ready]);

  function change(next: Workspace, group?: string) {
    if (!ready || saveLock.current) return;
    dispatch({ type: "change", next, group }); setMessage("");
  }
  function annotate(next: Annotation, group?: string) { change({ ...workspace, annotations: { ...workspace.annotations, [slide.id]: next } }, group); }
  function go(next: number) { setIndex(clamp(next, 0, slides.length - 1)); }
  function ask(text: string, run: () => void) { setPending({ text, run }); }
  function addMemo() {
    if (annotation.memos.length >= 20) { setError("슬라이드마다 메모를 20개까지 만들 수 있습니다."); return; }
    const offset = annotation.memos.length % 6 * 28;
    annotate({ ...annotation, memos: [...annotation.memos, { id: crypto.randomUUID(), text: "", x: 740 - offset, y: 80 + offset, width: 330, height: 220, collapsed: false }] });
  }
  function addBlank() {
    if (workspace.blanks.length >= 100) { setError("필기 슬라이드는 100개까지 만들 수 있습니다."); return; }
    const id = `note-${crypto.randomUUID()}`;
    change({ ...workspace, blanks: [{ id, after: slide.id }, ...workspace.blanks] });
    setIndex(currentIndex + 1); setDrawing(true);
  }
  async function save(): Promise<boolean> {
    if (saveLock.current || !ready) return false;
    if (!storage.current) { setError("저장소 연결이 없어 저장할 수 없습니다. 현재 메모를 별도로 복사해 주세요."); return false; }
    saveLock.current = true; setSaving(true); setError("");
    try {
      const saved = await saveWorkspace(storage.current.key, workspace, storage.current.revision);
      storage.current.revision = saved.revision;
      setSavedSnapshot(JSON.stringify(workspace)); setSavedAt(saved.savedAt); setMessage("이 브라우저에 저장했습니다.");
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장 공간이 부족하거나 저장이 차단되었습니다."); return false; }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen(); }
    catch { setError("이 브라우저에서 전체화면을 사용할 수 없습니다."); }
  }
  function leave() {
    const finish = () => {
      leaving.current = true;
      if (document.fullscreenElement) void document.exitFullscreen();
      router.push(postPath(post));
    };
    if (dirty) ask("저장하지 않은 메모·그림이 있습니다. 본문으로 돌아갈까요?", finish); else finish();
  }
  const keyboard = useEffectEvent((event: KeyboardEvent) => {
    if (!ready || saving || pending || root.current?.querySelector("dialog[open]") || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    const typing = !!target?.closest("input, textarea, select, [contenteditable='true']");
    if (target?.closest("button, a") && event.key === " ") return;
    const command = slideCommand({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey, isComposing: event.isComposing, typing }, drawing);
    if (!command) return;
    event.preventDefault();
    if (event.repeat && ["memo", "blank", "save", "print", "escape"].includes(command)) return;
    if (command.startsWith("color-")) {
      const selected = colors.indexOf(color);
      const n = command === "color-next" ? (selected + 1) % colors.length : command === "color-prev" ? (selected + colors.length - 1) % colors.length : Number(command.slice(6));
      setColor(colors[n]); setEraser(false); return;
    }
    switch (command) {
      case "prev": go(currentIndex - 1); break;
      case "next": go(currentIndex + 1); break;
      case "first": go(0); break;
      case "last": go(slides.length - 1); break;
      case "section-next": { const next = slides.findIndex((item, i) => i > currentIndex && item.section !== slide.section); if (next >= 0) go(next); break; }
      case "section-prev": { const prev = slides.map((item, i) => ({ item, i })).reverse().find(({ item, i }) => i < currentIndex && item.section !== slide.section); if (prev) go(slides.findIndex(item => item.section === prev.item.section)); break; }
      case "fullscreen": void toggleFullscreen(); break;
      case "toc": setToc(!toc); break;
      case "help": setHelp(!help); break;
      case "memo": addMemo(); break;
      case "blank": addBlank(); break;
      case "draw": setDrawing(!drawing); break;
      case "eraser": setEraser(!eraser); break;
      case "clear": annotate({ ...annotation, strokes: [] }); break;
      case "thicker": setSize(clamp(size + 2, 1, 30)); break;
      case "thinner": setSize(clamp(size - 2, 1, 30)); break;
      case "undo": dispatch({ type: "undo" }); break;
      case "redo": dispatch({ type: "redo" }); break;
      case "save": void save(); break;
      case "print": window.print(); break;
      case "escape": if (options) setOptions(false); else if (help) setHelp(false); else if (toc) setToc(false); else if (drawing) setDrawing(false); else if (document.fullscreenElement) void document.exitFullscreen(); else leave(); break;
    }
  });
  useEffect(() => { const handler = (event: KeyboardEvent) => keyboard(event); window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);

  return <div ref={root} tabIndex={-1} className="slide-workspace" data-theme={theme} onClickCapture={event => {
    const link = (event.target as Element).closest("a[href]") as HTMLAnchorElement | null;
    if (!dirty || !link || link.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.hash && link.pathname === location.pathname) return;
    event.preventDefault(); event.stopPropagation();
    ask("저장하지 않은 변경 사항이 있습니다. 링크로 이동할까요?", () => { leaving.current = true; location.assign(link.href); });
  }}>
    <header className="slide-topbar">
      <button type="button" title="목차 (T)" aria-label="목차" onClick={() => { setToc(!toc); setHelp(false); }} aria-expanded={toc}>☰</button>
      <strong title={slide.title}>{slide.title}</strong>
      <span className="slide-counter">{currentIndex + 1} / {slides.length}</span>
      <button type="button" title="메모 추가 (M)" disabled={!ready || saving} onClick={addMemo}>메모</button>
      <button type="button" title="그리기 (D)" disabled={!ready || saving} aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>그리기</button>
      <button type="button" className="slide-fullscreen" title="전체화면 (F)" onClick={() => void toggleFullscreen()}>{fullscreen ? "창 모드" : "전체화면"}</button>
      <button type="button" title="설정 및 작업 저장" aria-expanded={options} aria-controls="slide-options" onClick={() => setOptions(!options)}>더보기{dirty ? " ·" : ""}</button>
      <button type="button" title="본문으로 돌아가기 (Esc)" aria-label="본문으로 돌아가기" onClick={leave}>×</button>
    </header>
    <section id="slide-options" className="slide-options" aria-label="슬라이드 설정 및 저장" hidden={!options}>
      <div className="slide-options-heading"><h2>슬라이드 도구</h2><button type="button" onClick={() => setOptions(false)}>닫기</button></div>
    <div className="slide-toolbar">
      <button type="button" onClick={() => { setHelp(true); setToc(false); setOptions(false); }}>단축키 (?)</button>
      <button type="button" className="slide-save" disabled={!ready || saving} onClick={() => void save()}>{saving ? "저장 중…" : "작업 저장 (Ctrl+S)"}</button>
      <button type="button" disabled={!ready || saving} onClick={addBlank}>필기 슬라이드 (N)</button>
      {slide.blank && <button type="button" disabled={saving} onClick={() => { change(removeBlank(workspace, slide.id)); go(currentIndex - 1); }}>필기 슬라이드 삭제</button>}
      <button type="button" disabled={!history.past.length || saving} onClick={() => dispatch({ type: "undo" })}>실행 취소</button>
      <button type="button" disabled={!history.future.length || saving} onClick={() => dispatch({ type: "redo" })}>다시 실행</button>
      <label>분할 <select value={mode} disabled={!ready || saving} onChange={event => {
        const next = event.target.value as "auto" | "manual";
        const run = () => onMode(next);
        if (dirty) ask("분할 방식을 바꾸면 저장하지 않은 작업이 사라집니다. 전환할까요?", run); else run();
      }}><option value="auto">자동 (제목·분량)</option><option value="manual">수동 (---)</option></select></label>
      <label>테마 <select value={theme} onChange={event => setTheme(event.target.value)}><option value="system">사이트 설정</option><option value="light">밝게</option><option value="dark">어둡게</option></select></label>
      <label>확대 <select value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3].map(value => <option key={value} value={value}>{value === 1 ? "화면 맞춤" : `${value * 100}%`}</option>)}</select></label>
      <button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? "전체화면 종료" : "전체화면 (F)"}</button>
      <button type="button" onClick={() => window.print()}>인쇄 / PDF (P)</button>
      <label><input type="checkbox" checked={printNotes} onChange={event => setPrintNotes(event.target.checked)} />인쇄에 필기 포함</label>
    </div>
    <div className="slide-status" role="status">{!ready ? "작업 공간을 여는 중…" : dirty ? "저장하지 않은 변경 사항" : savedAt ? `마지막 저장 ${new Date(savedAt).toLocaleString("ko-KR")}` : "메모와 그림은 작업 저장을 눌러야 보관됩니다."} {message}</div>
    <ServerWorkspaceTools postNumber={post.postNumber} source={post.content} mode={mode} userId={userId} workspace={workspace}
      disabled={!ready || saving} onLoad={loaded => change(loaded)} />
    </section>
    {drawing && <div className="slide-toolbar slide-pens">
      <button type="button" aria-pressed={!eraser} onClick={() => setEraser(false)}>펜</button>
      <button type="button" aria-pressed={eraser} onClick={() => setEraser(true)}>지우개 (E)</button>
      {colors.map((preset, i) => <button key={preset} type="button" className="slide-color" style={{ background: preset }} aria-label={`펜 색상 ${i + 1}`} aria-pressed={color === preset} onClick={() => { setColor(preset); setEraser(false); }}>{i + 1}</button>)}
      <label>색상 <input type="color" value={color} onChange={event => { setColor(event.target.value); setEraser(false); }} /></label>
      <label>굵기 {size}<input type="range" min={1} max={30} value={size} onChange={event => setSize(Number(event.target.value))} /></label>
      <button type="button" disabled={saving} onClick={() => annotate({ ...annotation, strokes: [] })}>그림 지우기 (C)</button>
      <span>←/→ 색상 · ↑/↓ 굵기 · PageUp/Down 이동 · 지우개는 선을 클릭</span>
    </div>}
    {error && <div className="slide-error" role="alert">{error}<button type="button" onClick={() => setError("")}>닫기</button></div>}
    <div className="slide-main">
      {(toc || help) && <aside className="slide-panel">
        <button type="button" onClick={() => { setToc(false); setHelp(false); }}>패널 닫기</button>
        {help ? <><h2>단축키</h2><dl>{slideShortcuts.map(([key, description]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{description}</dd></div>)}</dl><p>입력 중에는 저장 단축키만 작동합니다. 원문은 변경하지 않습니다. 작업 저장은 현재 브라우저에 보관합니다. 로그인 후 서버에 저장하면 다른 기기에서도 불러올 수 있습니다.</p><p>본문이나 분할 방식이 바뀌면 작업 공간이 분리됩니다. 긴 코드·표는 본문 영역을 스크롤해서 확인하세요.</p></>
          : <nav aria-label="슬라이드 목차"><h2>슬라이드 {slides.length}장</h2><ol>{slides.map((item, i) => <li key={item.id}><button type="button" aria-current={i === currentIndex ? "page" : undefined} onClick={() => go(i)}>{i + 1}. {item.title}{(workspace.annotations[item.id]?.memos.length || workspace.annotations[item.id]?.strokes.length) ? " · 필기 있음" : ""}</button></li>)}</ol></nav>}
      </aside>}
      <div ref={viewport} className="slide-viewport">
        <div className="slide-scaled" style={{ width: 1200 * scale, height: 750 * scale }}>
          <article className="slide-stage" style={{ transform: `scale(${scale})` }} aria-label={`슬라이드 ${currentIndex + 1}`} inert={!ready || saving}>
            <div key={slide.id} className="slide-body">
              {slide.id === "title" ? <div className="slide-cover"><h1>{post.title}</h1><p>{post.description}</p><small>{post.categoryName}</small></div>
                : slide.blank ? <h2 className="slide-blank-title">필기 슬라이드</h2> : <MarkdownContent source={slide.source} />}
            </div>
            <SlideDrawing key={`${slide.id}:${drawing}:${eraser}`} strokes={annotation.strokes} enabled={drawing && ready && !saving} eraser={eraser} color={color} size={size} onChange={strokes => annotate({ ...annotation, strokes })} />
            {annotation.memos.map(memo => <SlideMemo key={memo.id} memo={memo} onChange={(next, group) => annotate({ ...annotation, memos: annotation.memos.map(item => item.id === memo.id ? next : item) }, group)} onDelete={() => annotate({ ...annotation, memos: annotation.memos.filter(item => item.id !== memo.id) })} />)}
          </article>
        </div>
      </div>
    </div>
    <footer className="slide-navigation">
      <span className="slide-footer-title" title={post.title}>{post.title}</span>
      <button type="button" disabled={currentIndex === 0} onClick={() => go(currentIndex - 1)}>이전</button>
      <label>슬라이드 <select aria-label="슬라이드 번호" value={currentIndex} onChange={event => go(Number(event.target.value))}>{slides.map((item, i) => <option key={item.id} value={i}>{i + 1} / {slides.length}</option>)}</select></label>
      <button type="button" disabled={currentIndex === slides.length - 1} onClick={() => go(currentIndex + 1)}>다음</button>
      <span className="slide-next-title" title={slides[currentIndex + 1]?.title}>{slides[currentIndex + 1] ? `다음 · ${slides[currentIndex + 1].title}` : "마지막 슬라이드"}</span>
    </footer>
    <dialog ref={dialog} className="slide-confirm" aria-labelledby="slide-confirm-title" onCancel={() => setPending(null)}>
      <h2 id="slide-confirm-title">{pending?.text}</h2>
      <button type="button" autoFocus disabled={saving} onClick={() => setPending(null)}>계속 작업</button>
      <button type="button" disabled={saving} onClick={() => { const run = pending?.run; setPending(null); run?.(); }}>저장하지 않고 이동</button>
      <button type="button" disabled={saving} onClick={() => { void (async () => { if (await save()) { const run = pending?.run; setPending(null); run?.(); } else setPending(null); })(); }}>저장하고 이동</button>
    </dialog>
    <div className="slide-print" aria-hidden="true">{slides.map((item, i) => <section className="slide-print-page" key={item.id}>
      <h1>{i + 1}. {item.title}</h1>
      {item.id === "title" ? <p>{post.description}</p> : <MarkdownContent source={item.source} />}
      {printNotes && <>{!!workspace.annotations[item.id]?.strokes.length && <svg viewBox="0 0 1200 750" className="slide-print-drawing"><DrawingPaths strokes={workspace.annotations[item.id]?.strokes ?? []} /></svg>}
        <div className="slide-print-memos">{workspace.annotations[item.id]?.memos.map(memo => <p key={memo.id}>{memo.text}</p>)}</div></>}
    </section>)}</div>
  </div>;
}
