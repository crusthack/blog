"use client";
import { memo, useEffect, useRef, useState } from "react";
import { ARENA, chooseUpgrade, createSurvivor, dash, nextLevelXp, tickSurvivor, upgrades, type Upgrade } from "@/lib/survivor";
import { GameJumpLink } from "./GameNavigation";
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
type RecordScore = { time: number; kills: number; level: number };
const recordKey = "blog-survivor-record-v1";

export const SurvivorGame = memo(function SurvivorGame() {
  const game = useRef(createSurvivor()); const canvas = useRef<HTMLCanvasElement>(null); const arena = useRef<HTMLDivElement>(null);
  const keys = useRef(new Set<string>()); const stick = useRef({ x: 0, y: 0 }); const saved = useRef(false);
  const [view, setView] = useState(createSurvivor);
  const [record, setRecord] = useState<RecordScore>({ time: 0, kills: 0, level: 1 }); const [storageNote, setStorageNote] = useState("");
  const recordRef = useRef(record);
  function sync() { setView({ ...game.current, ranks: { ...game.current.ranks } }); }
  function pause() { if (game.current.phase === "playing") { game.current.phase = "paused"; sync(); } keys.current.clear(); stick.current = { x: 0, y: 0 }; }
  function start() { game.current = createSurvivor(); game.current.phase = "playing"; saved.current = false; keys.current.clear(); stick.current = { x: 0, y: 0 }; sync(); arena.current?.focus({ preventScroll: true }); }
  function resume() { game.current.phase = "playing"; keys.current.clear(); stick.current = { x: 0, y: 0 }; sync(); arena.current?.focus({ preventScroll: true }); }
  function upgrade(key: Upgrade) { chooseUpgrade(game.current, key); keys.current.clear(); stick.current = { x: 0, y: 0 }; sync(); arena.current?.focus({ preventScroll: true }); }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(localStorage.getItem(recordKey) ?? "null") as RecordScore | null;
        if (parsed && Number.isFinite(parsed.time) && parsed.time >= 0 && parsed.time <= 300 && Number.isInteger(parsed.kills) && parsed.kills >= 0 && Number.isInteger(parsed.level) && parsed.level >= 1) { recordRef.current = parsed; setRecord(parsed); }
      } catch { setStorageNote("브라우저 기록 저장을 사용할 수 없습니다. 플레이는 가능합니다."); }
    }, 0);
    let frame = 0; let previous = 0; let rendered = 0;
    const render = (time: number) => {
      const g = game.current; const dt = previous ? (time - previous) / 1000 : 0; previous = time;
      const x = Number(keys.current.has("d") || keys.current.has("ArrowRight")) - Number(keys.current.has("a") || keys.current.has("ArrowLeft"));
      const y = Number(keys.current.has("s") || keys.current.has("ArrowDown")) - Number(keys.current.has("w") || keys.current.has("ArrowUp"));
      const before = g.phase; tickSurvivor(g, dt, x || y ? { x, y } : stick.current);
      if ((g.phase === "dead" || g.phase === "won") && !saved.current) {
        saved.current = true; const best = { time: Math.max(recordRef.current.time, g.time), kills: Math.max(recordRef.current.kills, g.kills), level: Math.max(recordRef.current.level, g.level) };
        recordRef.current = best; setRecord(best);
        try { localStorage.setItem(recordKey, JSON.stringify(best)); } catch { setStorageNote("기록을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요."); }
      }
      if (time - rendered > 100 || before !== g.phase) { rendered = time; setView({ ...g, ranks: { ...g.ranks } }); }
      const ctx = canvas.current?.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#101a22"; ctx.fillRect(0, 0, 960, 600);
        ctx.strokeStyle = "#1c3038"; ctx.lineWidth = 1;
        for (let n = 0; n <= 960; n += 40) { ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, 600); ctx.stroke(); }
        for (let n = 0; n <= 600; n += 40) { ctx.beginPath(); ctx.moveTo(0, n); ctx.lineTo(960, n); ctx.stroke(); }
        for (const gem of g.gems) { ctx.fillStyle = gem.value > 1 ? "#a78bfa" : "#34d399"; ctx.beginPath(); ctx.moveTo(gem.x, gem.y - 5); ctx.lineTo(gem.x + 5, gem.y); ctx.lineTo(gem.x, gem.y + 5); ctx.lineTo(gem.x - 5, gem.y); ctx.closePath(); ctx.fill(); }
        for (const enemy of g.enemies) {
          ctx.fillStyle = enemy.hit ? "#fff" : enemy.boss ? "#a78bfa" : enemy.radius === 9 ? "#fbbf24" : "#f87171";
          ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2); ctx.fill();
          if (enemy.boss) { ctx.fillStyle = "#312e81"; ctx.fillRect(enemy.x - 28, enemy.y - 36, 56, 5); ctx.fillStyle = "#c4b5fd"; ctx.fillRect(enemy.x - 28, enemy.y - 36, 56 * Math.max(0, enemy.hp / enemy.maxHp), 5); }
        }
        ctx.fillStyle = "#fef08a"; for (const bullet of g.bullets) { ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2); ctx.fill(); }
        if (g.pulseFlash > 0) { ctx.strokeStyle = "#67e8f9"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.player.x, g.player.y, (100 + g.ranks.pulse * 25) * (1 - g.pulseFlash / .3), 0, Math.PI * 2); ctx.stroke(); }
        for (let i = 0; i < g.ranks.orbit; i++) { const angle = g.time * 2.5 + i * Math.PI * 2 / g.ranks.orbit; ctx.fillStyle = "#67e8f9"; ctx.beginPath(); ctx.arc(g.player.x + Math.cos(angle) * 65, g.player.y + Math.sin(angle) * 65, 9, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = g.invulnerable > 0 ? "#fff" : "#34d399"; ctx.beginPath(); ctx.arc(g.player.x, g.player.y, 12, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#d1fae5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.player.x, g.player.y, g.dashTime > 0 ? 23 : 16, 0, Math.PI * 2); ctx.stroke();
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const onBlur = () => { if (game.current.phase === "playing") { game.current.phase = "paused"; setView({ ...game.current }); } keys.current.clear(); stick.current = { x: 0, y: 0 }; };
    const onVisibility = () => { if (document.hidden) onBlur(); };
    const observer = new IntersectionObserver(entries => { if (!entries[0].isIntersecting) onBlur(); }, { threshold: 0 });
    if (arena.current) observer.observe(arena.current);
    window.addEventListener("blur", onBlur); document.addEventListener("visibilitychange", onVisibility);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("blur", onBlur); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
  return <section className="survivor-game" data-game-keys="ignore">
    <header className="survivor-heading"><div><h2><GameJumpLink target="game-survivor">NEON SURVIVOR</GameJumpLink></h2><p>5분간 생존하세요. 자동 공격 · 경험치 수집 · 레벨마다 능력 선택</p></div><span>최고 {clock(record.time)} · {record.kills} 처치 · Lv.{record.level}</span></header>
    <div className="survivor-hud"><span>{clock(view.time)} / 5:00 · 웨이브 {1 + Math.floor(view.time / 30)}</span><span>Lv.{view.level} · {view.kills} 처치</span><label>체력 {Math.ceil(view.hp)} / {view.maxHp}<progress value={view.hp} max={view.maxHp} /></label><label>경험치 {view.xp} / {nextLevelXp(view.level)}<progress value={view.xp} max={nextLevelXp(view.level)} /></label></div>
    <div ref={arena} id="game-survivor" className="survivor-arena" tabIndex={0} aria-label="네온 서바이버 플레이 화면. WASD 또는 방향키로 이동, Space로 돌진, P로 일시정지."
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) pause(); }}
      onKeyDown={event => {
        if ((event.target as HTMLElement).closest("button, input, select") || event.ctrlKey || event.metaKey || event.altKey) return;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "p"].includes(key)) event.preventDefault();
        if (key === "p" && !event.repeat) { if (game.current.phase === "paused") resume(); else pause(); }
        else if (key === " ") dash(game.current); else keys.current.add(key);
      }} onKeyUp={event => keys.current.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key)}>
      <canvas ref={canvas} width={ARENA.width} height={ARENA.height} aria-label="녹색 플레이어, 빨간 적, 보라색 보스, 초록색 경험치" />
      {view.phase !== "playing" && <div className="survivor-overlay"><div>
        {view.phase === "upgrade" ? <><h3>LEVEL {view.level} · 능력 선택</h3><p>선택하는 동안 시간은 멈춥니다.</p><div className="survivor-choices">{view.choices.map(key => <button key={key} onClick={() => upgrade(key)}><strong>{upgrades[key].name} {view.ranks[key] + 1}</strong><span>{upgrades[key].description}</span></button>)}</div></>
          : view.phase === "paused" ? <><h3>일시정지</h3><p>준비되면 이어서 플레이하세요.</p><button onClick={resume}>계속하기</button></>
          : <><h3>{view.phase === "won" ? "생존 성공!" : view.phase === "dead" ? "이번 도전 종료" : "NEON SURVIVOR"}</h3><p>{view.phase === "ready" ? "적을 피하며 초록 경험치를 모으세요. 1분마다 보스가 등장합니다." : `${clock(view.time)} 생존 · ${view.kills} 처치 · 레벨 ${view.level}`}</p><button onClick={start}>{view.phase === "ready" ? "생존 시작" : "다시 도전"}</button></>}
      </div></div>}
    </div>
    <div className="survivor-controls">
      <div className="survivor-stick" role="group" aria-label="터치 이동 패드" style={{ touchAction: "none" }}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); arena.current?.focus({ preventScroll: true }); const r = event.currentTarget.getBoundingClientRect(); stick.current = { x: (event.clientX - r.left - r.width / 2) / (r.width / 2), y: (event.clientY - r.top - r.height / 2) / (r.height / 2) }; }}
        onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const r = event.currentTarget.getBoundingClientRect(); stick.current = { x: (event.clientX - r.left - r.width / 2) / (r.width / 2), y: (event.clientY - r.top - r.height / 2) / (r.height / 2) }; }}
        onPointerUp={() => { stick.current = { x: 0, y: 0 }; }} onPointerCancel={() => { stick.current = { x: 0, y: 0 }; }} onLostPointerCapture={() => { stick.current = { x: 0, y: 0 }; }}>↕<br />← 이동 →</div>
      <div><button disabled={view.phase !== "playing" || view.dash > 0} onPointerDown={event => event.preventDefault()} onClick={() => dash(game.current)}>돌진 {view.dash > 0 ? `${view.dash.toFixed(1)}초` : "Space"}</button><button disabled={view.phase !== "playing" && view.phase !== "paused"} onPointerDown={event => event.preventDefault()} onClick={() => view.phase === "paused" ? resume() : pause()}>{view.phase === "paused" ? "계속하기" : "일시정지 (P)"}</button></div>
      <p>WASD / 방향키 이동 · Space 돌진<br />화면 밖으로 이동하거나 탭을 전환하면 자동 일시정지</p>
    </div>
    <div className="survivor-build" aria-label="현재 능력">{(Object.keys(upgrades) as Upgrade[]).filter(key => view.ranks[key]).map(key => <span key={key}>{upgrades[key].name} {view.ranks[key]}{view.ranks[key] === upgrades[key].max ? " MAX" : ""}</span>)}</div>
    <p className="survivor-local-note">서버 저장 없음 · 최고 기록만 이 브라우저에 저장 · 진행 중인 도전은 페이지를 나가면 종료됩니다.</p>{storageNote && <p role="status">{storageNote}</p>}
  </section>;
});
