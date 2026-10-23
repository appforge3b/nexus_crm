import { describe, expect, it } from 'vitest';
import { createDictation, formatClock, speechFactory, suggestTitle } from '../../js/voice.js';

function fakeFactory(instances) {
  return () => {
    const instance = {
      start() { this.running = true; },
      stop() { this.running = false; this.onend?.(); },
      abort() { this.running = false; },
      say(text, isFinal = true) {
        this.onresult({ results: [Object.assign([{ transcript: text }], { isFinal })] });
      },
    };
    instances.push(instance);
    return instance;
  };
}

describe('voice dictation', () => {
  it('detects speech recognition support', () => {
    expect(speechFactory({})).toBeNull();
    function Recognition() {}
    expect(typeof speechFactory({ webkitSpeechRecognition: Recognition })).toBe('function');
  });

  it('keeps text across the automatic restarts mobile browsers force on silence', () => {
    const instances = [];
    const changes = [];
    const dictation = createDictation({ factory: fakeFactory(instances), onChange: (text) => changes.push(text) });
    dictation.start();
    instances[0].say('called the cfo');
    instances[0].onend();
    expect(instances).toHaveLength(2);
    instances[1].say('budget approved');
    expect(dictation.text.final).toBe('Called the cfo budget approved');
    dictation.pause();
    expect(dictation.state).toBe('paused');
    expect(instances).toHaveLength(2);
    expect(changes.at(-1).final).toBe('Called the cfo budget approved');
  });

  it('stops for good on permission errors and explains why', () => {
    const instances = [];
    const errors = [];
    const states = [];
    const dictation = createDictation({
      factory: fakeFactory(instances),
      onError: (message) => errors.push(message),
      onState: (state) => states.push(state),
    });
    dictation.start();
    instances[0].onerror({ error: 'not-allowed' });
    instances[0].onend();
    expect(instances).toHaveLength(1);
    expect(states).toEqual(['listening', 'stopped']);
    expect(errors[0]).toMatch(/Microphone access is blocked/);
  });

  it('ignores the harmless no-speech error and keeps listening', () => {
    const instances = [];
    const dictation = createDictation({ factory: fakeFactory(instances) });
    dictation.start();
    instances[0].onerror({ error: 'no-speech' });
    instances[0].onend();
    expect(instances).toHaveLength(2);
    expect(dictation.state).toBe('listening');
  });

  it('suggests a short title and formats the timer', () => {
    expect(suggestTitle('')).toBe('Voice note');
    expect(suggestTitle('met the team. they liked it')).toBe('Met the team');
    expect(suggestTitle('one two three four five six seven eight nine ten')).toBe('One two three four five six seven eight…');
    expect(formatClock(75)).toBe('1:15');
  });
});
