import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

// The Web Speech API isn't in TypeScript's DOM types yet, so describe the bits we use.
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function getRecognition(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const voiceSupported = () => getRecognition() !== null;

/**
 * Tap to talk: turns speech into text using the browser's own speech recognition
 * (free, nothing sent to a paid service by us). Each finished phrase is passed to onText.
 */
export function VoiceButton({ onText, onListeningChange }: { onText: (text: string) => void; onListeningChange?: (on: boolean) => void }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const supported = voiceSupported();

  useEffect(() => () => recognition.current?.stop(), []);
  useEffect(() => onListeningChange?.(listening), [listening, onListeningChange]);

  function start() {
    const Ctor = getRecognition();
    if (!Ctor) return;
    setError('');
    const r = new Ctor();
    r.lang = 'en-GB';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) onText(result[0].transcript.trim());
        else live += result[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone access was blocked. Allow it in your browser settings, or type instead.');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError('Voice didn’t work that time. Try again, or type instead.');
      }
    };
    r.onend = () => {
      setListening(false);
      setInterim('');
    };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError('Voice didn’t start. Try again, or type instead.');
    }
  }

  function stop() {
    recognition.current?.stop();
  }

  if (!supported) {
    return (
      <p className="small muted">
        <Icon name="alert" size={15} /> Voice notes need Chrome, Edge or Safari. You can type the description instead.
      </p>
    );
  }

  return (
    <div className="voice">
      <button
        type="button"
        className={`voice-button${listening ? ' listening' : ''}`}
        onClick={listening ? stop : start}
        aria-pressed={listening}
      >
        <span className="voice-dot" aria-hidden="true">
          <Icon name={listening ? 'check' : 'mic'} size={22} />
        </span>
        <span>
          <span className="strong" style={{ display: 'block' }}>
            {listening ? 'Listening… tap when done' : 'Record a voice note'}
          </span>
          <span className="small muted">{listening ? 'Speak naturally: room, sizes, what needs doing' : 'e.g. “Re-plaster the back bedroom, about 4 by 3”'}</span>
        </span>
      </button>
      {interim && (
        <p className="small muted" aria-live="polite" style={{ marginTop: 8, fontStyle: 'italic' }}>
          “{interim}”
        </p>
      )}
      {error && <p className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
    </div>
  );
}
