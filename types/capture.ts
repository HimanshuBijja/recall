import type { CardKind, MarkerShape } from "@/types";

export interface CardDraft {
  kind: CardKind;
  question: string;
  answer: string;
  distractors: string[];
  answers?: string[];
  statements?: { text: string; isTrue: boolean }[];
  pairs?: { left: string; right: string }[];
  clozeText?: string;
  explanation: string;
  hint: string;
  tags: string[];
}

export interface CaptureRequest {
  kind: CardKind;
  videoId: string;
  url: string;
  title: string;
  channel: string;
  timestamp: number;
  frameDataUrl: string; // "data:image/png;base64,..."
}

export interface CaptureResponse {
  ok: boolean;
  draft?: CardDraft;
  ocrText?: string;
  screenshotUrl?: string;
  marker?: { shape: MarkerShape; color: string };
  error?: string;
}
