// api/_lib/schemas.js
// Output contracts — doctrine §8, ported verbatim. Injected as the second
// system message, scoped to the render type the requested chip resolves to.
// Also used as response_format / guided-decoding hints and for post-parse
// validation of the model's JSON.

export const RENDERS = ['bars', 'tension', 'checklist', 'delta', 'memo', 'prose'];

const BASE_CONTRACT = `You always return a single JSON object. Nothing before it, nothing after it — no prose
wrapper, no code fence.

{ "render": "<one of: bars | tension | checklist | delta | memo | prose>",
  "data":   { ... the contract for that render type ... },
  "prose":  "One to three sentences of advisory footnote. Plain text, no markup." }`;

const CONTRACT_BODY = {
  bars: `### \`bars\` — the framework read
{ "scores": {"build": <int>, "buy": <int>, "partner": <int>},   // copy from computed state
  "win": "build|buy|partner",                                    // copy from computed state
  "verdict": "<the verdict string from computed state>",
  "reasons": ["<3-4 items; light <b> allowed>"] }`,

  tension: `### \`tension\` — the steelman
{ "callIsYours": <bool>,
  "callName": "<verdict name being challenged>", "callScore": <int>,
  "altName":  "<strongest alternative>",          "altScore":  <int>,
  "steel": ["<3 best arguments FOR the alternative — argued honestly, not strawmanned>"],
  "closeness": <int 0-100; higher = closer call>,
  "gapLabel": "NARROW|MODERATE|WIDE",
  "gapRead": "<how seriously to take the steelman + which lever would flip it>" }`,

  checklist: `### \`checklist\` — the evidence audit
{ "rows": [ { "name": "<lever short name>", "value": <1-5>,
              "q": "<the question a consultant would ask to verify it>",
              "status": "verify|decide|noted",
              "statusLabel": "VERIFY|DECIDE|NOTED" } ] }
Rule: value 1 or 5 -> verify. Value 3 -> decide. Values 2 or 4 -> noted.`,

  delta: `### \`delta\` — the what-if
{ "rows": [ {"name":"build","before":<int>,"after":<int>,"winner":<bool>}, ... ],
  "flip": "<verdict holds / verdict flips, and what that means for the negotiation>" }
The "after" scores are supplied to you already computed by the proxy — copy them into
"rows", do not recompute them. You write only the "flip" narrative.`,

  memo: `### \`memo\` — the CEO memo
{ "to": "<role, client>", "from": "<advisory line>", "re": "<the capability>",
  "rec": "<verdict>", "recNote": "<concurring/diverging note, or empty>",
  "reasons": ["..."], "risks": ["..."], "asks": ["..."],
  "sig": "<one line on how this memo was derived>" }`,

  prose: `### \`prose\` — everything else
{ "html": "<2-4 sentences. Only <b> and <span class='hl'> permitted. No other tags.>" }`,
};

const SELECTION_TABLE = `Choose the render type by what the answer *is*, not by what was asked:

| The answer is... | render |
|---|---|
| where the scenario lands and why | bars |
| the case against the learner's call | tension |
| an audit of the learner's own assumptions | checklist |
| a document the learner will carry into a room | memo |
| anything else, including a what-if question | prose |

Do NOT use \`delta\`. It requires before/after scores computed by the proxy ahead of
time, which only happens for the dedicated what-if controls in the interface — not for
a free-text question. If asked a hypothetical ("what if urgency dropped?"), reason about
it in \`prose\` qualitatively: name the lever it maps to and which direction the verdict
would move, without stating a number you were not given.`;

// Natural-language contract per render type — the "Section 8 output contract
// for the requested render type" system message the architecture calls for.
export const RENDER_CONTRACT = {
  bars: `${BASE_CONTRACT}\n\n${CONTRACT_BODY.bars}`,
  tension: `${BASE_CONTRACT}\n\n${CONTRACT_BODY.tension}`,
  checklist: `${BASE_CONTRACT}\n\n${CONTRACT_BODY.checklist}`,
  delta: `${BASE_CONTRACT}\n\n${CONTRACT_BODY.delta}`,
  memo: `${BASE_CONTRACT}\n\n${CONTRACT_BODY.memo}`,
  prose: `${BASE_CONTRACT}\n\n${CONTRACT_BODY.prose}`,
  // 'free' chip: the model chooses the render type, so it gets the routing
  // table plus every contract body except delta — delta is only ever
  // proxy-initiated via the dedicated what-if controls, never model-chosen.
  free: `${BASE_CONTRACT}\n\n${SELECTION_TABLE}\n\n${['bars', 'tension', 'checklist', 'memo', 'prose']
    .map((k) => CONTRACT_BODY[k])
    .join('\n\n')}`,
};

// chip -> render type. whatif-* always resolves to delta; free lets the
// model choose, so there is no fixed render — validated post-hoc instead.
export function renderFor(chip) {
  switch (chip) {
    case 'read':
      return 'bars';
    case 'challenge':
      return 'tension';
    case 'interrogate':
      return 'checklist';
    case 'whatif-exit':
    case 'whatif-speed':
      return 'delta';
    case 'memo':
      return 'memo';
    default:
      return 'free';
  }
}

// JSON Schemas — passed as response_format when the model server supports
// schema-constrained decoding, and used for our own post-parse shape check
// regardless of what the server enforced at decode time.
const scoresSchema = {
  type: 'object',
  properties: {
    build: { type: 'integer' },
    buy: { type: 'integer' },
    partner: { type: 'integer' },
  },
  required: ['build', 'buy', 'partner'],
};

export const JSON_SCHEMAS = {
  bars: {
    type: 'object',
    properties: {
      render: { const: 'bars' },
      data: {
        type: 'object',
        properties: {
          scores: scoresSchema,
          win: { enum: ['build', 'buy', 'partner'] },
          verdict: { type: 'string' },
          reasons: { type: 'array', items: { type: 'string' } },
        },
        required: ['scores', 'win', 'verdict', 'reasons'],
      },
      prose: { type: 'string' },
    },
    required: ['render', 'data', 'prose'],
  },
  tension: {
    type: 'object',
    properties: {
      render: { const: 'tension' },
      data: {
        type: 'object',
        properties: {
          callIsYours: { type: 'boolean' },
          callName: { type: 'string' },
          callScore: { type: 'integer' },
          altName: { type: 'string' },
          altScore: { type: 'integer' },
          steel: { type: 'array', items: { type: 'string' } },
          closeness: { type: 'integer' },
          gapLabel: { enum: ['NARROW', 'MODERATE', 'WIDE'] },
          gapRead: { type: 'string' },
        },
        required: ['callIsYours', 'callName', 'callScore', 'altName', 'altScore', 'steel', 'closeness', 'gapLabel', 'gapRead'],
      },
      prose: { type: 'string' },
    },
    required: ['render', 'data', 'prose'],
  },
  checklist: {
    type: 'object',
    properties: {
      render: { const: 'checklist' },
      data: {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                value: { type: 'integer' },
                q: { type: 'string' },
                status: { enum: ['verify', 'decide', 'noted'] },
                statusLabel: { enum: ['VERIFY', 'DECIDE', 'NOTED'] },
              },
              required: ['name', 'value', 'q', 'status', 'statusLabel'],
            },
          },
        },
        required: ['rows'],
      },
      prose: { type: 'string' },
    },
    required: ['render', 'data', 'prose'],
  },
  delta: {
    type: 'object',
    properties: {
      render: { const: 'delta' },
      data: {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                before: { type: 'integer' },
                after: { type: 'integer' },
                winner: { type: 'boolean' },
              },
              required: ['name', 'before', 'after', 'winner'],
            },
          },
          flip: { type: 'string' },
        },
        required: ['rows', 'flip'],
      },
      prose: { type: 'string' },
    },
    required: ['render', 'data', 'prose'],
  },
  memo: {
    type: 'object',
    properties: {
      render: { const: 'memo' },
      data: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          from: { type: 'string' },
          re: { type: 'string' },
          rec: { type: 'string' },
          recNote: { type: 'string' },
          reasons: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          asks: { type: 'array', items: { type: 'string' } },
          sig: { type: 'string' },
        },
        required: ['to', 'from', 're', 'rec', 'reasons', 'risks', 'asks', 'sig'],
      },
      prose: { type: 'string' },
    },
    required: ['render', 'data', 'prose'],
  },
  prose: {
    type: 'object',
    properties: {
      render: { const: 'prose' },
      data: {
        type: 'object',
        properties: { html: { type: 'string' } },
        required: ['html'],
      },
      prose: { type: 'string' },
    },
    required: ['render', 'data', 'prose'],
  },
};
