export const VOICE_LANGUAGES = [
  ['en-IN', 'English (India)'],
  ['hi-IN', 'Hindi'],
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
];

const ERRORS = {
  'not-allowed': 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.',
  'service-not-allowed': 'Speech recognition is turned off on this device. You can type or use your keyboard’s dictation mic instead.',
  'audio-capture': 'No microphone was found on this device.',
  network: 'Speech recognition needs an internet connection right now. You can type the note instead.',
  'language-not-supported': 'That language is not available for dictation on this device. Pick another one in Settings.',
};

/** Returns a constructor-backed factory, or null when the browser has no speech recognition. */
export function speechFactory(win = globalThis) {
  const Ctor = win?.SpeechRecognition || win?.webkitSpeechRecognition;
  return Ctor ? () => new Ctor() : null;
}

function join(...parts) {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' ');
}

function sentenceCase(text) {
  const value = String(text ?? '').trim();
  return value ? value[0].toUpperCase() + value.slice(1) : '';
}

/**
 * Continuous dictation that survives the recogniser stopping on silence (mobile Chrome does this),
 * keeps finished sessions, and reports final and interim text separately.
 */
export function createDictation({ factory, lang = 'en-IN', onChange, onError, onState } = {}) {
  let recognition = null;
  let committed = '';
  let sessionFinal = '';
  let interim = '';
  let state = 'idle';
  let fatal = false;

  const snapshot = () => ({ final: sentenceCase(join(committed, sessionFinal)), interim: interim.trim() });
  const emit = () => onChange?.(snapshot());
  const setState = (next) => {
    state = next;
    onState?.(next);
  };

  function begin() {
    let instance;
    try {
      instance = factory();
      instance.lang = lang;
      instance.continuous = true;
      instance.interimResults = true;
      instance.maxAlternatives = 1;
    } catch {
      fatal = true;
      onError?.('Dictation could not start on this device. You can type the note instead.', 'start-failed');
      setState('stopped');
      return;
    }
    instance.onresult = (event) => {
      let finals = '';
      let pending = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finals = join(finals, result[0].transcript);
        else pending = join(pending, result[0].transcript);
      }
      sessionFinal = finals;
      interim = pending;
      emit();
    };
    instance.onerror = (event) => {
      const message = ERRORS[event?.error];
      if (!message) return;
      fatal = true;
      onError?.(message, event.error);
    };
    instance.onend = () => {
      if (recognition !== instance) return;
      committed = join(committed, sessionFinal, state === 'listening' && !fatal ? '' : interim);
      sessionFinal = '';
      interim = '';
      recognition = null;
      if (state === 'listening' && !fatal) {
        begin();
        return;
      }
      if (fatal) setState('stopped');
      emit();
    };
    recognition = instance;
    try {
      instance.start();
    } catch {
      /* already started: the running session carries on */
    }
  }

  return {
    get state() {
      return state;
    },
    get text() {
      return snapshot();
    },
    start() {
      if (state === 'listening') return;
      fatal = false;
      setState('listening');
      begin();
    },
    pause() {
      if (state !== 'listening') return;
      setState('paused');
      recognition?.stop();
    },
    stop() {
      const wasActive = Boolean(recognition);
      setState('stopped');
      if (wasActive) recognition.stop();
      else emit();
    },
    abort() {
      state = 'stopped';
      const current = recognition;
      recognition = null;
      try {
        current?.abort?.();
      } catch { /* ignore */ }
    },
  };
}

export function suggestTitle(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Voice note';
  const sentence = clean.split(/(?<=[.!?])\s/)[0];
  const words = sentence.split(' ');
  let title = words.slice(0, 8).join(' ');
  if (title.length > 60) title = `${title.slice(0, 57).trim()}…`;
  else if (words.length > 8) title = `${title}…`;
  return sentenceCase(title.replace(/[.!?]$/, ''));
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
