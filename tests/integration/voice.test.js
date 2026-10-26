import { beforeEach, describe, expect, it } from 'vitest';
import { click, field, mount, navigate, setValue } from '../helpers/mount.js';

function dialog() {
  return document.querySelector('.overlay-host [role="dialog"]');
}

class FakeRecognition {
  static instances = [];
  constructor() {
    this.started = false;
    this.aborted = false;
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.aborted = true;
    this.started = false;
  }
  say(...phrases) {
    const results = phrases.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }));
    this.onresult?.({ results });
  }
}

const factory = () => new FakeRecognition();

function pressV() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
}

describe('voice notes', () => {
  let app;
  let priya;

  beforeEach(() => {
    FakeRecognition.instances = [];
  });

  function setup(options = {}) {
    app = mount({ hash: '#/briefing', speechFactory: factory, ...options });
    priya = app.store.create('contacts', {
      name: 'Priya Shah', company: 'Northwind', title: 'CFO', status: 'active',
      email: '', phone: '', tags: [], notes: '', source: '',
    });
  }

  it('records with a live transcript that survives pauses in speech, then saves a timestamped note', () => {
    setup();
    app.store.updateSettings({ voiceLang: 'hi-IN' });
    pressV();
    expect(dialog().getAttribute('data-modal-type')).toBe('voice');
    const [first] = FakeRecognition.instances;
    expect(first.started).toBe(true);
    expect(first.lang).toBe('hi-IN');
    expect(first.continuous).toBe(true);

    first.say(['met priya at the cafe', true], ['she wants', false]);
    const transcript = dialog().querySelector('[data-voice-transcript]');
    expect(transcript.querySelector('.final').textContent).toBe('Met priya at the cafe');
    expect(transcript.querySelector('.interim').textContent).toBe('she wants');

    first.onend();
    expect(FakeRecognition.instances).toHaveLength(2);
    FakeRecognition.instances[1].say(['pricing by friday', true]);
    expect(dialog().querySelector('[data-voice-transcript] .final').textContent).toBe('Met priya at the cafe pricing by friday');

    click(dialog().querySelector('[data-action="voice-stop"]'));
    expect(FakeRecognition.instances[1].aborted).toBe(true);
    expect(field('description', dialog()).value).toBe('Met priya at the cafe pricing by friday');
    expect(field('title', dialog()).value).toBe('Met priya at the cafe pricing by friday');
    setValue(field('contact', dialog()), priya.id);
    click(dialog().querySelector('[data-action="save-modal"]'));

    const [note] = app.store.getAll('activities');
    expect(note).toMatchObject({ type: 'note', status: 'done', source: 'voice', contactId: priya.id, description: 'Met priya at the cafe pricing by friday' });
    expect(note.date).toBe(new Date(2026, 9, 21, 9, 0, 0, 0).toISOString());
    expect(dialog()).toBeNull();
  });

  it('pauses, resumes, and records more after reviewing', () => {
    setup();
    click('.voice-fab');
    const [first] = FakeRecognition.instances;
    click(dialog().querySelector('.voice-orb'));
    expect(dialog().querySelector('[data-voice-status]').textContent).toContain('Paused');
    click(dialog().querySelector('.voice-orb'));
    const second = FakeRecognition.instances.at(-1);
    second.say(['first thought', true]);
    click(dialog().querySelector('[data-action="voice-stop"]'));
    expect(first.started).toBe(false);

    setValue(field('description', dialog()), 'First thought, edited.');
    click(dialog().querySelector('[data-action="voice-resume"]'));
    FakeRecognition.instances.at(-1).say(['second thought', true]);
    click(dialog().querySelector('[data-action="voice-stop"]'));
    expect(field('description', dialog()).value).toBe('First thought, edited. Second thought');
  });

  it('starts from a contact and keeps the note linked to them', () => {
    setup();
    navigate(`#/roster?contact=${priya.id}`);
    click(document.querySelector('[data-panel] .action-row [data-action="voice-note"]'));
    FakeRecognition.instances[0].say(['quick update', true]);
    click(dialog().querySelector('[data-action="voice-stop"]'));
    expect(field('contact', dialog()).value).toBe(priya.id);
  });

  it('explains a blocked microphone and keeps what was heard', () => {
    setup();
    pressV();
    const [first] = FakeRecognition.instances;
    first.say(['hello there', true]);
    first.onerror({ error: 'not-allowed' });
    first.onend();
    expect(dialog().querySelector('#modal-title').textContent).toBe('Review voice note');
    expect(dialog().querySelector('.inline-warning').textContent).toContain('Microphone access is blocked');
    expect(field('description', dialog()).value).toBe('Hello there');
  });

  it('falls back to keyboard dictation when the browser has no speech recognition', () => {
    setup({ speechFactory: null });
    pressV();
    expect(dialog().querySelector('#modal-title').textContent).toBe('Quick note');
    expect(dialog().querySelector('.inline-tip').textContent).toContain('microphone on your keyboard');
    expect(dialog().querySelector('[data-action="voice-resume"]')).toBeNull();
    click(dialog().querySelector('[data-action="save-modal"]'));
    expect(dialog().querySelector('[data-error-for="description"]').textContent).toBe('Say or type something first');
  });

  it('stops listening when the sheet is closed', () => {
    setup();
    pressV();
    const [first] = FakeRecognition.instances;
    click(dialog().querySelector('[data-action="cancel-modal"]'));
    expect(first.aborted).toBe(true);
    first.onend?.();
    expect(FakeRecognition.instances).toHaveLength(1);
  });
});
