'use client';

import { memo, useState } from 'react';

import { GameJumpLink } from '@/components/games/GameNavigation';
import { playGameSound } from '@/components/games/gameAudio';

type BaseballResult = { strikes: number; balls: number };
type BaseballGuess = { digits: string; result: BaseballResult };

const BASEBALL_LENGTH = 4;
const MAX_BASEBALL_GUESSES = 10;

const createSecretDigits = () => {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  for (let i = digits.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, BASEBALL_LENGTH).join('');
};

const evaluateBaseballGuess = (guess: string, secret: string): BaseballResult => {
  let strikes = 0;
  let balls = 0;

  for (let i = 0; i < BASEBALL_LENGTH; i += 1) {
    if (guess[i] === secret[i]) {
      strikes += 1;
    } else if (secret.includes(guess[i])) {
      balls += 1;
    }
  }

  return { strikes, balls };
};

export const NumberBaseballGame = memo(function NumberBaseballGame() {
  const [secret, setSecret] = useState(() => createSecretDigits());
  const [current, setCurrent] = useState('');
  const [guesses, setGuesses] = useState<BaseballGuess[]>([]);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');

  const reset = () => {
    playGameSound('reset');
    setSecret(createSecretDigits());
    setCurrent('');
    setGuesses([]);
    setStatus('playing');
  };

  const addDigit = (digit: string) => {
    if (status !== 'playing' || current.length >= BASEBALL_LENGTH || current.includes(digit)) return;
    playGameSound('input');
    setCurrent((prev) => `${prev}${digit}`);
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

  return (
    <section className="w-full max-w-6xl rounded-[2rem] border border-slate-800 bg-slate-950 p-6 shadow-2xl">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-100"><GameJumpLink target="game-baseball">NUMBER BASEBALL</GameJumpLink></h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-400">
            Find the hidden 4-digit number. Strike means right digit and position. Ball means right digit in another position.
          </p>
        </div>
        <div className="text-right font-mono text-sm font-black text-emerald-400">
          {guesses.length} / {MAX_BASEBALL_GUESSES}
        </div>
      </div>

      <div id="game-baseball" tabIndex={-1} data-game-keys="ignore" className="grid gap-6 pt-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {Array.from({ length: MAX_BASEBALL_GUESSES }).map((_, index) => {
            const guess = guesses[index];
            const isCurrent = index === guesses.length && status === 'playing';
            const rowDigits = guess?.digits ?? (isCurrent ? current : '');

            return (
              <div
                key={index}
                className={`grid grid-cols-[1fr_150px] items-center gap-4 rounded-lg border px-4 py-3 ${
                  isCurrent ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900'
                }`}
              >
                <div className="flex gap-2">
                  {Array.from({ length: BASEBALL_LENGTH }).map((__, slot) => {
                    const digit = rowDigits[slot];
                    return (
                      <div
                        key={slot}
                        className={`flex h-10 w-10 items-center justify-center rounded-md border text-lg font-black ${
                          digit ? 'border-emerald-400 bg-slate-950 text-emerald-300' : 'border-white/10 bg-slate-800 text-slate-600'
                        }`}
                      >
                        {digit ?? ''}
                      </div>
                    );
                  })}
                </div>
                <div className="text-right font-mono text-xs font-black uppercase tracking-wider text-slate-400">
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
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-800 bg-black/30 p-4">
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }).map((_, digit) => (
              <button
                type="button"
                key={digit}
                aria-label={`Enter ${digit}`}
                onClick={() => addDigit(String(digit))}
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
              className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-slate-800"
            >
              BACK
            </button>
            <button
              type="button"
              onClick={submitGuess}
              disabled={current.length !== BASEBALL_LENGTH || status !== 'playing'}
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
            className="mt-4 w-full rounded-lg border border-slate-700 px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-slate-800"
          >
            NEW NUMBER
          </button>
        </div>
      </div>
    </section>
  );
});
