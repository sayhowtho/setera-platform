// Shared parser for calls.transcript — ElevenLabs stores it as a JSON string
// (or occasionally a native array), with entries shaped like
// { role: 'agent' | 'user', message: string, ...lots of other metadata }.
export type TranscriptLine = { role: string; message?: string; text?: string };

export function parseTranscript(t: unknown): TranscriptLine[] {
  if (Array.isArray(t)) return t as TranscriptLine[];
  if (typeof t === 'string') {
    try {
      const parsed = JSON.parse(t);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
