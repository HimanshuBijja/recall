export type CaptureKind = "mcq" | "flash" | "cloze" | "tf-sort" | "match" | "multi";
export type MarkerShape = "circle" | "square" | "triangle" | "diamond" | "star";

export interface KindConfig {
  shortcut: string;
  marker: { shape: MarkerShape; color: string };
  visible: boolean;
}

export interface Settings {
  baseUrl: string;
  kinds: Record<CaptureKind, KindConfig>;
}

export interface CardSource {
  videoId: string;
  url: string;
  timestamp: number;
  channel?: string;
  title?: string;
  screenshotUrl?: string;
  marker?: { shape: MarkerShape; color: string };
}

export interface CardDraft {
  kind: CaptureKind;
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
  kind: CaptureKind;
  videoId: string;
  url: string;
  title: string;
  channel: string;
  timestamp: number;
  frameDataUrl: string;
}

export interface CaptureResponse {
  ok: boolean;
  draft?: CardDraft;
  ocrText?: string;
  screenshotUrl?: string;
  marker?: { shape: MarkerShape; color: string };
  error?: string;
}

export interface MarkerRow {
  id: string;
  kind: CaptureKind;
  timestamp: number;
  marker?: { shape: MarkerShape; color: string };
}

export interface WebSourceMeta {
  type: "web";
  url: string;
  title?: string;
  siteName?: string;
  excerpt?: string;
  capturedAt: string;
}

export interface GenerateRequest {
  text: string;
  kind: CaptureKind;
  count: number;
  pageTitle?: string;
  pageUrl?: string;
}

export interface GenerateResponse {
  ok: boolean;
  drafts?: CardDraft[];
  groupName?: string;
  error?: string;
}

export interface SaveCardsResult {
  saved: number;
  queued: number;
  failed: number;
}
