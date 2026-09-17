"use client";
import { useEffect, type ReactNode } from "react";
const games = [["game-survivor", "네온 서바이버"], ["game-dino", "BLOCK RUN"], ["game-baseball", "숫자 야구"], ["game-mines", "지뢰찾기"]] as const;
function jump(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
  element.focus({ preventScroll: true });
}
export function GameJumpLink({ target, children }: { target: string; children: ReactNode }) {
  return <a href={`#${target}`} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); if (location.hash !== `#${target}`) history.pushState(null, "", `#${target}`); jump(target);
  }}>{children}</a>;
}
export function GameNavigation() {
  useEffect(() => {
    const navigate = () => { const id = location.hash.slice(1); if (games.some(([key]) => key === id)) jump(id); };
    const frame = requestAnimationFrame(navigate);
    window.addEventListener("hashchange", navigate); window.addEventListener("popstate", navigate);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", navigate); window.removeEventListener("popstate", navigate); };
  }, []);
  return <nav className="game-navigation" aria-label="게임 바로가기">{games.map(([id, label]) => <GameJumpLink key={id} target={id}>{label}</GameJumpLink>)}</nav>;
}
