/**
 * The JD Studio conversation, built from what Vara actually knows.
 *
 * Replaces `jdScriptFor` in mock-data.ts, which returned ONE hardcoded script
 * for every role. Its own comment admitted it: "For the preview, one script
 * covers all three families sensibly." It did not. A Customer Success role was
 * offered "PostgreSQL row-level security" at 40% weight, and somebody
 * published it.
 *
 * Two scripts now, and which one you get is honest:
 *
 *   fromStarter  — Vara matched the title to a role family, so the chips are
 *                  that family's real must-haves, weights and knockouts.
 *   unknownRole  — nothing matched. The structural questions still get asked,
 *                  but NOTHING is suggested, because suggesting anything here
 *                  means inventing it (rule 9d).
 *
 * The difference is the point. A tenant must be able to tell "Vara knows this
 * role" from "Vara is guessing", and the old script made them look identical.
 */

export interface JdStudioStep {
  ask: string;
  /** Empty means the tenant types instead — never a fabricated suggestion. */
  chips: { label: string; contributes: Record<string, unknown> }[];
  /** Prompt for the free-text box when this step accepts typing. */
  typed?: { placeholder: string; kind: 'one_liner' | 'musthave' };
}

interface Starter {
  role_summary_hint?: string;
  musthaves?: { name: string; weight: number; years?: number; why?: string }[];
  knockouts?: { label: string; rule: string }[];
  threshold?: number;
  band_hint?: string;
}

/** Thresholds offered everywhere. 30 is the platform default. */
const THRESHOLDS: JdStudioStep = {
  ask: 'Handover threshold — how sure should Vara be before passing someone to your team?',
  chips: [
    { label: 'Strict (35%)', contributes: { threshold: 35 } },
    { label: 'Standard (30%) — my default', contributes: { threshold: 30 } },
    { label: 'Wider (25%)', contributes: { threshold: 25 } },
  ],
};

/**
 * Built from a matched family's starter shape.
 *
 * Weights come from the pack rather than being invented per chip, so what the
 * tenant picks is what the family actually scores on. The top must-have leads
 * because it carries the most weight, and saying so is the difference between
 * a suggestion and a decision they can check.
 */
export function fromStarter(
  starter: Starter,
  familyName: string,
  title: string,
): JdStudioStep[] {
  const musthaves = [...(starter.musthaves ?? [])].sort((a, b) => b.weight - a.weight);
  const [top, ...rest] = musthaves;
  const steps: JdStudioStep[] = [];

  steps.push({
    ask: `Let's shape ${title}. In one line, what does this role do?`,
    chips: starter.role_summary_hint
      ? [{ label: starter.role_summary_hint, contributes: { one_liner: starter.role_summary_hint } }]
      : [],
    typed: { placeholder: 'One line about the role…', kind: 'one_liner' },
  });

  if (top) {
    steps.push({
      ask: `In ${familyName}, the strongest signal is usually "${top.name}"`
        + `${top.why ? ` — ${top.why}` : ''}. Keep it as the heaviest must-have?`,
      chips: [
        {
          label: `Yes — ${top.name} (${top.weight}%)`,
          contributes: { top_musthave: { name: top.name, weight: top.weight } },
        },
      ],
      typed: { placeholder: 'Or type the signal that matters most here…', kind: 'musthave' },
    });
  }

  if (rest.length) {
    steps.push({
      // All of them at once: a tenant who agrees with the family's shape should
      // not have to click through five chips to say so.
      ask: `Add the rest of ${familyName}'s must-haves, or pick the ones that apply.`,
      chips: [
        {
          label: `All of them (${rest.map((m) => `${m.name} ${m.weight}%`).join(', ')})`,
          contributes: { addl_musthaves: rest.map((m) => ({ name: m.name, weight: m.weight })) },
        },
        ...rest.map((m) => ({
          label: `${m.name} (${m.weight}%)`,
          contributes: { addl_musthave: { name: m.name, weight: m.weight } },
        })),
      ],
      typed: { placeholder: 'Or type one of your own…', kind: 'musthave' },
    });
  }

  const knockouts = starter.knockouts ?? [];
  steps.push({
    ask: knockouts.length
      ? 'Knockouts — hard gates, checked before any scoring. These are standard for this family.'
      : 'Any hard gates? These reject a candidate outright, so most roles have none.',
    chips: [
      ...knockouts.map((k) => ({
        label: `${k.label}: ${k.rule}`,
        contributes: { knockout: { label: k.label, rule: k.rule } },
      })),
      { label: 'None', contributes: {} },
    ],
  });

  steps.push({
    ...THRESHOLDS,
    ask: starter.threshold
      ? `Handover threshold — ${familyName} usually sits at ${starter.threshold}%.`
      : THRESHOLDS.ask,
  });

  return steps;
}

/**
 * Nothing matched, so nothing is suggested.
 *
 * The structural questions are still worth asking — every JD needs a summary,
 * must-haves and a threshold — but there are no capability chips, because any
 * chip here would be invented. A tenant hiring a Falconer should get a blank
 * box and an honest sentence, not an engineering playbook.
 */
export function unknownRole(title: string): JdStudioStep[] {
  return [
    {
      ask: `I don't have a playbook for "${title}" yet, so you'll shape this one. `
        + 'In one line, what does the role do?',
      chips: [],
      typed: { placeholder: 'One line about the role…', kind: 'one_liner' },
    },
    {
      ask: 'What must be true for someone to succeed? Give me the strongest signal first — '
        + "I'll weight it heaviest.",
      chips: [],
      typed: { placeholder: 'e.g. Has run a depot through a driver shortage', kind: 'musthave' },
    },
    {
      ask: 'Add another must-have, or move on.',
      chips: [{ label: "That's enough", contributes: {} }],
      typed: { placeholder: 'Another must-have…', kind: 'musthave' },
    },
    {
      ask: 'Any hard gates? These reject a candidate outright before scoring, '
        + 'so most roles have none.',
      chips: [
        { label: 'Work authorization', contributes: { knockout: { label: 'Work authorization', rule: 'Authorised to work in the country of the role' } } },
        { label: 'Notice period ≤ 60 days', contributes: { knockout: { label: 'Notice period', rule: '<= 60 days' } } },
        { label: 'None', contributes: {} },
      ],
    },
    THRESHOLDS,
  ];
}
