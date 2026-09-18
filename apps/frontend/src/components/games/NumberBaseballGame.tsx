'use client';

import { memo, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { GameJumpLink } from '@/components/games/GameNavigation';
import { playGameSound } from '@/components/games/gameAudio';
import {
  appendBaseballDigit,
  baseballKeyCommand,
  BASEBALL_LENGTH,
  createSecretDigits,
  evaluateBaseballGuess,
  MAX_BASEBALL_GUESSES,
  type BaseballResult,
} from '@/lib/numberBaseball';

type BaseballGuess = { digits: string; result: BaseballResult };

export const NumberBaseballGame = memo(function NumberBaseballGame() {
  const [secret, setSecret] = useState(() => createSecretDigits());
  const [current, setCurrent] = useState('');
  const [guesses, setGuesses] = useState<BaseballGuess[]>([]);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const latestGuess = guesses[guesses.length - 1];

  const reset = () => {
    playGameSound('reset');
    setSecret(createSecretDigits());
    setCurrent('');
    setGuesses([]);
    setStatus('playing');
  };

  const addDigit = (digit: string) => {
    if (status !== 'playing') return;
    const next = appendBaseballDigit(current, digit);
    if (next === current) return;
    playGameSound('input');
    setCurrent(next);
  };

  const removeLast = () => {
    if (status !== 'playing' || current.length === 0) return;
    playGameSound('back');
    setCurrent((prev) => prev.slice(0, -1));
  };

  const submitGuess = () => {
    if (status !== 'playing' || current.length !== BASEBALL_LENGTH) return;

    const result = evaluateBaseballGuess(current, secret);
    const nextGuesses = [...guesses, { digits: current, result }];
    setGuesses(nextGuesses);
    setCurrent('');

    if (result.strikes === BASEBALL_LENGTH) {
      playGameSound('win');
      setStatus('won');
    } else if (nextGuesses.length >= MAX_BASEBALL_GUESSES) {
      playGameSound('lose');
      setStatus('lost');
    } else {
      playGameSound('submit');
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.matches('input, textarea, select') || target.isContentEditable)
    ) return;

    const command = baseballKeyCommand(event);
    if (!command) return;

    // Preserve native activation for a focused button, including Enter on NEW NUMBER.
    if (command.type === 'submit' && target instanceof HTMLElement && target.closest('button')) return;

    event.preventDefault();
    if (command.type === 'digit') addDigit(command.digit);
    else if (command.type === 'remove-last') removeLast();
    else event.currentTarget.requestSubmit();
  };

  const focusGameAfterPointer = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.form?.focus({ preventScroll: true });
  };

  return (
    <section
      className="w-full max-w-6xl rounded-[2rem] border border-slate-800 bg-slate-950 p-4 shadow-2xl sm:p-6"
      aria-labelledby="number-baseball-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 id="number-baseball-title" className="text-3xl font-black tracking-tight text-slate-100"><GameJumpLink target="game-baseball">NUMBER BASEBALL</GameJumpLink></h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-400">
            Find the hidden 4-digit number. Strike means right digit and position. Ball means right digit in another position.
          </p>
        </div>
        <div className="text-right font-mono text-sm font-black text-emerald-400">
          {guesses.length} / {MAX_BASEBALL_GUESSES}
        </div>
      </div>

      <form
        id="game-baseball"
        tabIndex={0}
        data-game-keys="ignore"
        aria-describedby="number-baseball-keyboard-help"
        aria-keyshortcuts="0 1 2 3 4 5 6 7 8 9 Backspace Delete Enter"
        className="grid gap-6 rounded-xl pt-6 outline-none ring-emerald-400/70 focus-visible:ring-2 lg:grid-cols-[minmax(0,1fr)_320px]"
        onKeyDown={handleKeyDown}
        onSubmit={(event) => {
          event.preventDefault();
          submitGuess();
        }}
      >
        <div className="order-last min-w-0 lg:order-first">
          <ol className="m-0 list-none space-y-3 p-0" aria-label="Guess history">
            {Array.from({ length: MAX_BASEBALL_GUESSES }).map((_, index) => {
              const guess = guesses[index];
              const isCurrent = index === guesses.length && status === 'playing';
              const isFuture = !guess && !isCurrent;
              const rowDigits = guess?.digits ?? (isCurrent ? current : '');

              return (
                <li
                  key={index}
                  aria-hidden={isFuture || undefined}
                  className={`${isFuture ? 'hidden lg:grid' : 'grid'} grid-cols-1 items-start gap-3 rounded-lg border px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,150px)] sm:items-center sm:gap-4 sm:px-4 ${
                    isCurrent ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  {guess && (
                    <span className="sr-only">
                      Guess {index + 1}: {guess.digits.split('').join(' ')}, {guess.result.strikes} {guess.result.strikes === 1 ? 'strike' : 'strikes'} and {guess.result.balls} {guess.result.balls === 1 ? 'ball' : 'balls'}.
                    </span>
                  )}
                  {isCurrent && <span className="sr-only">Current guess row.</span>}
                  <div className="flex min-w-0 gap-1.5 sm:gap-2">
                    {Array.from({ length: BASEBALL_LENGTH }).map((__, slot) => {
                      const digit = rowDigits[slot];
                      return (
                        <div
                          key={slot}
                          aria-hidden="true"
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-lg font-black sm:h-10 sm:w-10 ${
                            digit ? 'border-emerald-400 bg-slate-950 text-emerald-300' : 'border-white/10 bg-slate-800 text-slate-600'
                          }`}
                        >
                          {digit ?? ''}
                        </div>
                      );
                    })}
                  </div>
                  <div aria-hidden="true" className="text-left font-mono text-xs font-black uppercase tracking-wider text-slate-400 sm:text-right">
                    {guess ? (
                      <>
                        <span className="text-emerald-400">{guess.result.strikes} strike</span>
                        <span className="mx-2 text-slate-600">/</span>
                        <span className="text-amber-300">{guess.result.balls} ball</span>
                      </>
                    ) : isCurrent ? (
                      'current'
                    ) : (
                      'locked'
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="sr-only" aria-live="polite">
            {current
              ? `Current guess: ${current.split('').join(' ')}. ${BASEBALL_LENGTH - current.length} digits remaining.`
              : latestGuess
                ? `Guess ${guesses.length}: ${latestGuess.digits.split('').join(' ')}, ${latestGuess.result.strikes} ${latestGuess.result.strikes === 1 ? 'strike' : 'strikes'} and ${latestGuess.result.balls} ${latestGuess.result.balls === 1 ? 'ball' : 'balls'}.`
                : `Current guess: empty. ${BASEBALL_LENGTH} digits remaining.`}
          </p>
        </div>

        <div className="order-first min-w-0 rounded-xl border border-slate-800 bg-black/30 p-4 lg:order-last">
          <p id="number-baseball-keyboard-help" className="mb-3 text-xs font-bold leading-relaxed text-slate-400">
            키보드: <kbd className="text-emerald-300">0–9</kbd> 입력 · <kbd>Backspace / Delete</kbd> 지우기 · <kbd>Enter</kbd> 확인
          </p>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }).map((_, digit) => (
              <button
                type="button"
                key={digit}
                aria-label={`Enter ${digit}`}
                onClick={() => addDigit(String(digit))}
                onPointerUp={focusGameAfterPointer}
                disabled={status !== 'playing' || current.length >= BASEBALL_LENGTH || current.includes(String(digit))}
                className="h-14 rounded-lg border border-slate-700 bg-slate-900 text-lg font-black text-slate-100 transition hover:scale-[1.03] hover:border-emerald-400 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {digit}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={removeLast}
              onPointerUp={focusGameAfterPointer}
              aria-keyshortcuts="Backspace Delete"
              className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-slate-800"
            >
              BACK
            </button>
            <button
              type="submit"
              onPointerUp={focusGameAfterPointer}
              disabled={current.length !== BASEBALL_LENGTH || status !== 'playing'}
              aria-keyshortcuts="Enter"
              className="rounded-lg bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              CHECK
            </button>
          </div>

          <div
            className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm font-bold text-slate-300"
            role="status"
            aria-live="polite"
          >
            {status === 'playing' && 'Enter 4 different digits, then check the strike/ball feedback.'}
            {status === 'won' && `Solved in ${guesses.length} tries.`}
            {status === 'lost' && (
              <div className="space-y-3">
                <p>Out of guesses. The answer was:</p>
                <div className="font-mono text-3xl font-black tracking-[0.4em] text-emerald-300">
                  {secret}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={reset}
            onPointerUp={focusGameAfterPointer}
            className="mt-4 w-full rounded-lg border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-slate-800"
          >
            NEW NUMBER
          </button>
        </div>
      </form>
    </section>
  );
});
