/**
 * R-S1 and R-S2, on their own.
 *
 * The claim-tracer's whole reason for existing: an unsupported claim in a
 * first touch is the mistake that cannot be walked back. These tests are
 * cheap so the rule can be exercised exhaustively before it decides
 * whether a real message is allowed out.
 */

import {
  traceStory, traceSentence, sentences, terms, isClaim,
  similarity, tooSimilar, REPEAT_THRESHOLD,
  type EvidenceLine,
} from '../trace';

const EV: EvidenceLine[] = [
  { claim: 'Unit-3 commissioned this month, capacity up 40%', url: 'sriveda.example/news' },
  { claim: 'Hiring a QA documentation lead in Jeedimetla',    url: 'sriveda.example/careers' },
  { claim: 'WHO-GMP and EU-GMP certified',                    url: 'sriveda.example/quality' },
];

describe('splitting', () => {
  it('breaks on . ! ? and newlines', () => {
    expect(sentences('Hello world. This is a test!\nAnother line?')).toHaveLength(3);
  });
  it('drops short fragments', () => {
    expect(sentences('Hi. Ok.')).toHaveLength(0);
  });
});

describe('what counts as a claim', () => {
  it('names a number as a claim regardless of length', () => {
    // "40%" is the whole reason for the exception. A tracer that ignored
    // short tokens would miss the most specific and most inventable
    // thing a sentence can carry — that failure is documented on trace.ts.
    expect(isClaim('Capacity up 40% this quarter')).toBe(true);
  });
  it('does not call a greeting a claim', () => {
    expect(isClaim('Hi Menon,')).toBe(false);
    expect(isClaim('Worth fifteen minutes?')).toBe(false);
  });
  it('needs several content words for a plain-text claim', () => {
    // "This is fine" carries no facts at all — three stop-words and one
    // filler. Flagging it would train reviewers to ignore the flag.
    expect(isClaim('This is fine')).toBe(false);
  });
});

describe('tracing one sentence to evidence', () => {
  it('matches when two content terms overlap', () => {
    const hit = traceSentence('QA documentation lead hired in Jeedimetla', EV);
    expect(hit?.url).toBe('sriveda.example/careers');
  });
  it('matches on a shared number even when the words differ', () => {
    // 'Capacity is 40% higher' would share only '40' with the source line;
    // one shared number is weighted double, so it clears the threshold.
    const hit = traceSentence('Capacity is 40% higher than last year', EV);
    expect(hit?.url).toBe('sriveda.example/news');
  });
  it('does not match unrelated text', () => {
    expect(traceSentence('You export to 14 countries in Africa', EV)).toBeNull();
  });
  it('picks the line with more overlap when several are candidates', () => {
    // Both lines share "documentation" and "lead"; only the second also
    // shares "Jeedimetla". That extra term should tip the pick.
    const evs: EvidenceLine[] = [
      { claim: 'QA documentation lead post live',                    url: 'sriveda.example/jobs' },
      { claim: 'QA documentation lead in Jeedimetla, hiring now',    url: 'sriveda.example/careers' },
    ];
    const hit = traceSentence('QA documentation lead in Jeedimetla is a good sign', evs);
    expect(hit?.url).toBe('sriveda.example/careers');
  });
});

describe('R-S1 — the whole story', () => {
  it('approves a story where every claim traces to the brief', async () => {
    const r = traceStory(
      'Unit-3 and what comes after it',
      'Unit-3 commissioned this month, capacity up 40%. '
      + 'We put a fractional CAIO alongside teams in exactly that position. '
      + 'Worth fifteen minutes?',
      EV,
    );
    expect(r.ok).toBe(true);
    expect(r.unsupported).toBe(0);
    expect(r.traced).toBeGreaterThanOrEqual(1);
    // The URL of every traced line makes it into evidence_refs — this is
    // what gets written onto the row and what the reviewer can click back.
    expect(r.evidence_refs).toContain('sriveda.example/news');
  });

  it('refuses a story that asserts an invented fact about them', async () => {
    // The exact failure mode this stops: a plausible-sounding detail the
    // brief never contained, sitting alongside true ones so reviewers
    // skim past it. Six plants in Gujarat is invented; the tracer catches
    // it even though the sentence LOOKS like the others.
    const r = traceStory(
      'A note on your plants',
      'You run six plants across Gujarat and export mostly to Brazil. '
      + 'We help teams like yours.',
      EV,
    );
    expect(r.ok).toBe(false);
    expect(r.unsupported).toBeGreaterThanOrEqual(1);
    expect(r.reason).toMatch(/brief cannot support/i);
  });

  it('refuses a template with a name at the top', async () => {
    // The qualitative gate pilot_result names as the second failure mode:
    // nothing unsupported, but also nothing traced — a first-person pitch
    // that would read the same for any recipient.
    const r = traceStory(
      null,
      'We help scale-ups move faster. Worth fifteen minutes?',
      EV,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/template with a name/i);
  });

  it('accepts a subject line that carries no claim of its own', async () => {
    // The prototype's original bug: judging a subject fragment as an
    // assertion and refusing approval. Subjects often carry no claim; they
    // must not fail R-S1 on their own.
    const r = traceStory(
      'A question',
      'Unit-3 commissioned this month, capacity up 40%. Worth fifteen minutes?',
      EV,
    );
    expect(r.ok).toBe(true);
  });

  it('accepts a story asking a question that references the brief', async () => {
    // "How is capacity holding after Unit-3 came online?" shares terms
    // AND a proper noun — it traces, and it is a first-person question,
    // not a claim. Both readings should end at "ok".
    const r = traceStory(null,
      'How is capacity holding after Unit-3 came online? '
      + 'Happy to compare notes.', EV);
    expect(r.ok).toBe(true);
  });

  it('never flags a sentence about us as unsupported', async () => {
    const r = traceStory(null, 'I put together a short note. Worth fifteen minutes?', EV);
    expect(r.sentences.every((s) => s.verdict !== 'unsupported')).toBe(true);
  });
});

/* ── R-S2 ─────────────────────────────────────────────────────────────── */

describe('R-S2 — not the same story twice', () => {
  const s1 = 'Unit-3 commissioned this month, capacity up 40%. '
    + 'We put a fractional CAIO alongside teams in that position. Worth fifteen minutes?';

  it('flags a near-duplicate', async () => {
    // Same body, one word swapped. Above the threshold — the writer is
    // asked to actually change the argument.
    const near = s1.replace('capacity', 'output');
    expect(similarity(s1, near)).toBeGreaterThan(REPEAT_THRESHOLD);
    expect(tooSimilar(near, [s1])).not.toBeNull();
  });

  it('lets a fresh angle through', async () => {
    // Different pain, different evidence — nothing about capacity,
    // everything about hiring.
    const different = 'Your QA documentation lead post is a good sign. '
      + 'I put together a short pack on how three teams staged that hire. Worth a read?';
    expect(similarity(s1, different)).toBeLessThan(REPEAT_THRESHOLD);
    expect(tooSimilar(different, [s1])).toBeNull();
  });

  it('finds the worst match across ALL earlier stories, not just the last', async () => {
    // A story that repeats story 1 but is fresh vs story 2 must still
    // fail — the loop is about not repeating ANY earlier argument.
    const bland = 'We had a nice call. Nothing to add.';
    const worst = tooSimilar(s1.replace('capacity', 'output'), [bland, s1]);
    expect(worst).not.toBeNull();
    expect(worst!.against).toBe(1);
  });
});

/* ── Regression corner ───────────────────────────────────────────────── */

describe('terms', () => {
  it('keeps a proper noun / product code intact', () => {
    // "Unit-3" survives as two tokens — 'unit' and '3' — because splitting
    // on non-alphanumerics is what makes '40%' countable in isClaim. But
    // BOTH tokens should be searchable, and 3 is a digit token so it is
    // kept whatever its length. That is what makes shared-number tracing
    // work.
    expect(terms('Unit-3 commissioned')).toContain('unit');
    expect(terms('Unit-3 commissioned')).toContain('3');
  });

  it('discards stop-words and one-char tokens', () => {
    expect(terms('This is a test')).toEqual(['test']);
  });
});
