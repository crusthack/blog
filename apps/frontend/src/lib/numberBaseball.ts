export const BASEBALL_LENGTH = 4;
export const MAX_BASEBALL_GUESSES = 10;

export type BaseballResult = { strikes: number; balls: number };
export type BaseballKeyCommand =
  | { type: 'digit'; digit: string }
  | { type: 'remove-last' }
  | { type: 'submit' };

type BaseballKeyInput = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
};

export const createSecretDigits = () => {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  for (let i = digits.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, BASEBALL_LENGTH).join('');
};

export const evaluateBaseballGuess = (guess: string, secret: string): BaseballResult => {
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

export const appendBaseballDigit = (current: string, digit: string) => {
  if (!/^\d$/u.test(digit) || current.length >= BASEBALL_LENGTH || current.includes(digit)) return current;
  return `${current}${digit}`;
};

export const baseballKeyCommand = (event: BaseballKeyInput): BaseballKeyCommand | null => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return null;
  if (/^\d$/u.test(event.key)) return { type: 'digit', digit: event.key };
  if (event.key === 'Backspace' || event.key === 'Delete') return { type: 'remove-last' };
  if (event.key === 'Enter' || event.key === 'NumpadEnter') return { type: 'submit' };
  return null;
};
