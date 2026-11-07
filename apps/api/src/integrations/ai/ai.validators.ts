import { z } from 'zod';

/** Every model output is parsed against one of these schemas before use. */
export const explanationOutput = z.object({
  explanation: z.string().min(1).max(1500),
  keyPoints: z.array(z.string().min(1).max(300)).max(5).default([]),
});
export type ExplanationOutput = z.infer<typeof explanationOutput>;

export const classificationOutput = z.object({
  category: z.enum(['SYMPTOM', 'MEDICATION', 'APPOINTMENT', 'WOUND', 'REHABILITATION', 'ADMINISTRATIVE', 'GENERAL']),
  reportedSymptoms: z.array(z.string().max(120)).max(10),
  reportedDuration: z.string().max(120).nullable(),
  expressedSeverity: z.enum(['NONE', 'MILD', 'MODERATE', 'SEVERE', 'UNCLEAR']),
  missingInformation: z.array(z.string().max(200)).max(8),
  suggestedRouting: z.enum(['GENERAL_ENQUIRY', 'MEDICATION_TEAM', 'NURSING_REVIEW', 'CLINICIAN_REVIEW', 'ADMINISTRATIVE']),
});
export type ClassificationOutput = z.infer<typeof classificationOutput>;

export const summaryOutput = z.object({
  overview: z.string().min(1).max(1200),
  reportedSymptoms: z.array(z.string().max(300)).max(20),
  missedActivities: z.array(z.string().max(300)).max(20),
  medicationConcerns: z.array(z.string().max(300)).max(20),
  outstandingAppointments: z.array(z.string().max(300)).max(20),
  openAlerts: z.array(z.string().max(300)).max(20),
  itemsRequiringReview: z.array(z.string().max(300)).max(20),
});
export type SummaryOutput = z.infer<typeof summaryOutput>;

export const transcriptionOutput = z.object({
  transcript: z.string().max(10000),
  languageGuess: z.enum(['en', 'ha', 'pcm', 'other']),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});
export type TranscriptionOutput = z.infer<typeof transcriptionOutput>;

/** Parse model text as JSON (tolerating code fences) then validate. */
export function parseModelJson<T>(schema: z.ZodType<T>, text: string): T | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  try {
    const result = schema.safeParse(JSON.parse(trimmed));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;

/**
 * Meaning-preservation guard for patient-facing explanations:
 *  - every number in the output must appear in the source (no new doses/times/durations);
 *  - no medication-change language unless the source itself contains it.
 */
export function explanationIsFaithful(source: string, output: ExplanationOutput): { ok: boolean; reason?: string } {
  const srcNumbers = new Set((source.match(NUMBER_RE) ?? []).map((n) => n.replace(',', '.')));
  const all = [output.explanation, ...output.keyPoints].join(' ');
  for (const n of all.match(NUMBER_RE) ?? []) {
    if (!srcNumbers.has(n.replace(',', '.'))) return { ok: false, reason: `introduced number ${n}` };
  }
  const risky = /\b(double|extra dose|increase (?:the |your )?dose|reduce (?:the |your )?dose|stop taking|skip (?:a |the )?dose|take more|take less)\b/i;
  if (risky.test(all) && !risky.test(source)) return { ok: false, reason: 'introduced medication-change language' };
  return { ok: true };
}

/** For staff summaries: numbers in the AI text must exist in the facts payload. */
export function summaryIsGrounded(factsJson: string, output: SummaryOutput): { ok: boolean; reason?: string } {
  const factNumbers = new Set(factsJson.match(NUMBER_RE) ?? []);
  const text = Object.values(output).flat().join(' ');
  for (const n of text.match(NUMBER_RE) ?? []) if (!factNumbers.has(n)) return { ok: false, reason: `ungrounded number ${n}` };
  return { ok: true };
}
