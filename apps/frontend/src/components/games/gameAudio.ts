export type GameSound =
  | 'open'
  | 'flag'
  | 'chord'
  | 'win'
  | 'lose'
  | 'input'
  | 'back'
  | 'submit'
  | 'reset'
  | 'start';

export function createAudioContext() {
  const AudioContextConstructor = window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('Web Audio API is not supported.');
  return new AudioContextConstructor();
}

let sharedAudioContext: AudioContext | null = null;

export const playGameSound = (type: GameSound) => {
  try {
    if (!sharedAudioContext) {
      sharedAudioContext = createAudioContext();
    }

    const ctx = sharedAudioContext;
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    const playTone = (
      frequency: number,
      duration: number,
      oscillatorType: OscillatorType = 'sine',
      delay = 0,
    ) => {
      const osc = ctx.createOscillator();
      osc.type = oscillatorType;
      osc.frequency.setValueAtTime(frequency, now + delay);
      osc.connect(gain);
      osc.start(now + delay);
      osc.stop(now + delay + duration);
    };

    gain.gain.setValueAtTime(0.0001, now);

    switch (type) {
      case 'open':
        gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        playTone(520, 0.08, 'triangle');
        break;
      case 'flag':
        gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
        playTone(320, 0.07, 'square');
        break;
      case 'chord':
        gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        playTone(440, 0.07, 'triangle');
        playTone(660, 0.07, 'triangle', 0.07);
        break;
      case 'win':
        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        playTone(523, 0.08, 'triangle');
        playTone(659, 0.08, 'triangle', 0.08);
        playTone(784, 0.11, 'triangle', 0.17);
        break;
      case 'lose':
        gain.gain.exponentialRampToValueAtTime(0.13, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        playTone(180, 0.28, 'sawtooth');
        break;
      case 'input':
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        playTone(760, 0.05, 'sine');
        break;
      case 'back':
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        playTone(360, 0.06, 'triangle');
        break;
      case 'submit':
        gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
        playTone(620, 0.05, 'triangle');
        playTone(820, 0.05, 'triangle', 0.05);
        break;
      case 'reset':
      case 'start':
        gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        playTone(type === 'start' ? 700 : 420, 0.12, 'triangle');
        break;
    }
  } catch {
    // Audio can be unavailable in some browser privacy modes.
  }
};
