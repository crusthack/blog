'use client';

import { memo, useState } from 'react';

import { GameJumpLink } from '@/components/games/GameNavigation';
import { playGameSound } from '@/components/games/gameAudio';

type MineCell = {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacent: number;
};

const MINE_ROWS = 16;
const MINE_COLS = 30;
const MINE_COUNT = 99;

const createEmptyMineBoard = (): MineCell[][] =>
  Array.from({ length: MINE_ROWS }, () =>
    Array.from({ length: MINE_COLS }, () => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacent: 0,
    }))
  );

const getMineNeighbors = (row: number, col: number) => {
  const neighbors: Array<[number, number]> = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < MINE_ROWS && nc >= 0 && nc < MINE_COLS) {
        neighbors.push([nr, nc]);
      }
    }
  }
  return neighbors;
};

const createMineBoard = (safeRow: number, safeCol: number): MineCell[][] => {
  const board = createEmptyMineBoard();
  const blocked = new Set([`${safeRow},${safeCol}`, ...getMineNeighbors(safeRow, safeCol).map(([r, c]) => `${r},${c}`)]);
  const candidates: Array<[number, number]> = [];

  for (let row = 0; row < MINE_ROWS; row += 1) {
    for (let col = 0; col < MINE_COLS; col += 1) {
      if (!blocked.has(`${row},${col}`)) candidates.push([row, col]);
    }
  }

  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  candidates.slice(0, MINE_COUNT).forEach(([row, col]) => {
    board[row][col].isMine = true;
  });

  for (let row = 0; row < MINE_ROWS; row += 1) {
    for (let col = 0; col < MINE_COLS; col += 1) {
      if (board[row][col].isMine) continue;
      board[row][col].adjacent = getMineNeighbors(row, col)
        .filter(([nr, nc]) => board[nr][nc].isMine)
        .length;
    }
  }

  return board;
};

export const MinesweeperGame = memo(function MinesweeperGame() {
  const [board, setBoard] = useState<MineCell[][]>(() => createEmptyMineBoard());
  const [isStarted, setIsStarted] = useState(false);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const flags = board.flat().filter(cell => cell.isFlagged).length;
  const [flagMode, setFlagMode] = useState(false);
  const [pressedCell, setPressedCell] = useState<[number, number] | null>(null);

  const reset = () => {
    playGameSound('reset');
    setBoard(createEmptyMineBoard());
    setIsStarted(false);
    setStatus('playing');
    setPressedCell(null);
  };

  const revealBoard = (source: MineCell[][], startRow: number, startCol: number) => {
    const next = source.map((row) => row.map((cell) => ({ ...cell })));
    const queue: Array<[number, number]> = [[startRow, startCol]];

    while (queue.length > 0) {
      const [row, col] = queue.shift()!;
      const cell = next[row][col];
      if (cell.isRevealed || cell.isFlagged) continue;

      cell.isRevealed = true;
      if (cell.adjacent !== 0 || cell.isMine) continue;

      getMineNeighbors(row, col).forEach(([nr, nc]) => {
        if (!next[nr][nc].isRevealed && !next[nr][nc].isFlagged) {
          queue.push([nr, nc]);
        }
      });
    }

    return next;
  };

  const revealManyCells = (source: MineCell[][], cells: Array<[number, number]>) => {
    let next = source;
    for (const [row, col] of cells) {
      const cell = next[row][col];
      if (!cell.isRevealed && !cell.isFlagged && !cell.isMine) {
        next = revealBoard(next, row, col);
      }
    }
    return next;
  };

  const revealAllMines = (source: MineCell[][]) =>
    source.map((row) => row.map((cell) => ({ ...cell, isRevealed: cell.isRevealed || cell.isMine })));

  const hasWon = (source: MineCell[][]) =>
    source.every((row) => row.every((cell) => cell.isMine || cell.isRevealed));

  const revealCell = (row: number, col: number) => {
    if (status !== 'playing') return;
    setPressedCell(null);

    if (board[row][col].isFlagged) return;
    const activeBoard = isStarted ? board : createMineBoard(row, col).map((cells, r) => cells.map((cell, c) => ({ ...cell, isFlagged: board[r][c].isFlagged })));
    const cell = activeBoard[row][col];
    if (cell.isFlagged) return;

    if (cell.isRevealed) {
      if (cell.adjacent === 0) return;

      const neighbors = getMineNeighbors(row, col);
      const flaggedCount = neighbors.filter(([nr, nc]) => activeBoard[nr][nc].isFlagged).length;
      if (flaggedCount !== cell.adjacent) return;

      const hiddenUnflagged = neighbors.filter(([nr, nc]) => {
        const neighbor = activeBoard[nr][nc];
        return !neighbor.isRevealed && !neighbor.isFlagged;
      });
      const hitMine = hiddenUnflagged.some(([nr, nc]) => activeBoard[nr][nc].isMine);
      if (hitMine) {
        playGameSound('lose');
        setBoard(revealAllMines(activeBoard));
        setStatus('lost');
        return;
      }

      const next = revealManyCells(activeBoard, hiddenUnflagged);
      setBoard(next);
      if (hasWon(next)) {
        playGameSound('win');
        setStatus('won');
      } else {
        playGameSound('chord');
      }
      return;
    }

    if (cell.isMine) {
      playGameSound('lose');
      setBoard(revealAllMines(activeBoard));
      setStatus('lost');
      setIsStarted(true);
      return;
    }

    const next = revealBoard(activeBoard, row, col);
    setBoard(next);
    setIsStarted(true);
    if (hasWon(next)) {
      playGameSound('win');
      setStatus('won');
    } else {
      playGameSound('open');
    }
  };

  const toggleFlag = (row: number, col: number) => {
    if (status !== 'playing') return;

    const cell = board[row][col];
    if (cell.isRevealed || (!cell.isFlagged && flags >= MINE_COUNT)) return;
    const next = board.map(cells => cells.map(item => ({ ...item })));
    next[row][col].isFlagged = !next[row][col].isFlagged;
    setPressedCell(null); setBoard(next); playGameSound('flag');
  };

  const isPressedPreviewCell = (row: number, col: number) => {
    if (!pressedCell) return false;

    const [pressedRow, pressedCol] = pressedCell;
    const sourceCell = board[pressedRow]?.[pressedCol];
    if (!sourceCell?.isRevealed || sourceCell.adjacent === 0) return false;

    const targetCell = board[row][col];
    if (targetCell.isRevealed || targetCell.isFlagged) return false;

    return getMineNeighbors(pressedRow, pressedCol).some(([nr, nc]) => nr === row && nc === col);
  };

  const numberColor = (value: number) => {
    if (value === 1) return 'text-blue-400';
    if (value === 2) return 'text-emerald-400';
    if (value === 3) return 'text-red-400';
    if (value === 4) return 'text-violet-400';
    return 'text-amber-300';
  };

  return (
    <section className="w-full max-w-6xl rounded-[2rem] border border-slate-800 bg-slate-950 p-6 shadow-2xl">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-100"><GameJumpLink target="game-mines">MINESWEEPER</GameJumpLink></h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-400">
            Reveal every safe cell. Left click opens a cell, right click places a flag. The first click is safe.
          </p>
        </div>
        <div className="text-right font-mono text-sm font-black text-emerald-400">
          {MINE_COUNT - flags} mines left
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-5">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-black/30 p-4">
          <div
            className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-bold text-slate-300"
            role="status"
            aria-live="polite"
          >
            {status === 'playing' && (isStarted ? 'Use the numbers to locate the mines.' : 'Pick any cell to start.')}
            {status === 'won' && 'Clear. Every safe cell is open.'}
            {status === 'lost' && 'Mine triggered. Try another field.'}
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400"
          >
            NEW FIELD
          </button>
          <button type="button" aria-pressed={flagMode} className="border border-slate-500 px-4 py-3 text-slate-100" onClick={() => setFlagMode(!flagMode)}>{flagMode ? "⚑ 깃발 모드" : "칸 열기 모드"}</button>
        </div>

        <div
          className="w-full overflow-x-auto rounded-xl border border-slate-800 bg-black/40 p-2"
          tabIndex={0}
          id="game-mines"
          data-game-keys="ignore"
          aria-label="Minesweeper board. Scroll horizontally on a small screen."
        >
          <div
            className="grid min-w-[48rem] grid-cols-[repeat(30,minmax(0,1fr))] gap-0.5"
            onMouseLeave={() => setPressedCell(null)}
          >
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => {
                const content = cell.isFlagged && !cell.isRevealed
                  ? '⚑'
                  : cell.isMine && cell.isRevealed
                    ? '✹'
                    : cell.isRevealed && cell.adjacent > 0
                      ? cell.adjacent
                      : '';
                const isPressedPreview = isPressedPreviewCell(rowIndex, colIndex);

                return (
                  <button
                    type="button"
                    key={`${rowIndex}-${colIndex}`}
                    onClick={() => flagMode ? toggleFlag(rowIndex, colIndex) : revealCell(rowIndex, colIndex)}
                    onMouseDown={(event) => {
                      if (event.button === 2) {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleFlag(rowIndex, colIndex);
                      }
                      if (event.button === 0 && cell.isRevealed && cell.adjacent > 0) {
                        setPressedCell([rowIndex, colIndex]);
                      }
                    }}
                    onMouseUp={() => setPressedCell(null)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    className={`flex aspect-square w-full min-w-0 select-none items-center justify-center rounded border text-[clamp(0.45rem,0.9vw,0.75rem)] font-black transition ${
                      cell.isRevealed
                        ? cell.isMine
                          ? 'border-red-500 bg-red-950 text-red-300'
                          : 'border-slate-700 bg-slate-900 text-slate-200'
                        : isPressedPreview
                          ? 'translate-y-px border-slate-700 bg-slate-900 text-slate-500 shadow-none'
                          : 'border-slate-600 bg-slate-700 text-amber-300 shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)] hover:border-emerald-400 hover:bg-slate-600'
                    } ${cell.isRevealed && !cell.isMine ? numberColor(cell.adjacent) : ''}`}
                    aria-label={`row ${rowIndex + 1}, column ${colIndex + 1}, ${
                      cell.isFlagged
                        ? 'flagged'
                        : cell.isRevealed
                          ? cell.isMine
                            ? 'mine'
                            : cell.adjacent > 0
                              ? `${cell.adjacent} adjacent mines`
                              : 'empty'
                          : 'hidden'
                    }`}
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
});
