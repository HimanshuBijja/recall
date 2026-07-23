"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FsrsSettings } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import {
  DEFAULT_FSRS_SETTINGS,
  parseSteps,
  formatSteps,
  toGeneratorParameters,
} from "@/lib/fsrs-config";
import {
  projectPath,
  branchFromNew,
  type PreviewRating,
} from "@/lib/fsrs-preview";

interface Props {
  initial: FsrsSettings;
}

interface FormState {
  request_retention: number;
  maximum_interval: number;
  learning_steps: string;
  relearning_steps: string;
  enable_fuzz: boolean;
  enable_short_term: boolean;
}

const PRESETS: { key: string; label: string; ratings: PreviewRating[] }[] = [
  { key: "good", label: "All Good", ratings: ["good"] },
  { key: "easy", label: "All Easy", ratings: ["easy"] },
  { key: "hard", label: "All Hard", ratings: ["hard"] },
  {
    key: "mixed",
    label: "Good w/ a lapse",
    ratings: ["good", "good", "again", "good", "good", "good", "good", "good"],
  },
];

const REPS = 8;

function fmtInterval(days: number): string {
  if (days < 1 / 24) return `${Math.round(days * 24 * 60)} min`;
  if (days < 1) return `${(days * 24).toFixed(1)} h`;
  if (days < 30) return `${days.toFixed(days < 10 ? 1 : 0)} d`;
  if (days < 365) return `${(days / 30).toFixed(1)} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}

function toSettings(form: FormState): FsrsSettings {
  return {
    request_retention: form.request_retention,
    maximum_interval: form.maximum_interval,
    learning_steps: parseSteps(form.learning_steps),
    relearning_steps: parseSteps(form.relearning_steps),
    enable_fuzz: form.enable_fuzz,
    enable_short_term: form.enable_short_term,
  };
}

export function SettingsView({ initial }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>({
    request_retention: initial.request_retention,
    maximum_interval: initial.maximum_interval,
    learning_steps: formatSteps(initial.learning_steps),
    relearning_steps: formatSteps(initial.relearning_steps),
    enable_fuzz: initial.enable_fuzz,
    enable_short_term: initial.enable_short_term,
  });
  const [preset, setPreset] = useState("good");
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  // The visualizer runs off the *unsaved* form values. If the steps text
  // doesn't parse, we surface the error instead of charting.
  const preview = useMemo(() => {
    try {
      const params = toGeneratorParameters(toSettings(form));
      const ratings = PRESETS.find((p) => p.key === preset)?.ratings ?? ["good"];
      return {
        path: projectPath(params, ratings, REPS),
        branch: branchFromNew(params),
        error: null as string | null,
      };
    } catch (e) {
      return { path: [], branch: [], error: e instanceof Error ? e.message : "Invalid input" };
    }
  }, [form, preset]);

  async function save() {
    let payload: FsrsSettings;
    try {
      payload = toSettings(form);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Invalid settings");
      return;
    }
    setSaving(true);
    try {
      await api.put("/settings", payload);
      toast("success", "Settings saved");
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Failed to save settings";
      toast("error", msg);
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setForm({
      request_retention: DEFAULT_FSRS_SETTINGS.request_retention,
      maximum_interval: DEFAULT_FSRS_SETTINGS.maximum_interval,
      learning_steps: formatSteps(DEFAULT_FSRS_SETTINGS.learning_steps),
      relearning_steps: formatSteps(DEFAULT_FSRS_SETTINGS.relearning_steps),
      enable_fuzz: DEFAULT_FSRS_SETTINGS.enable_fuzz,
      enable_short_term: DEFAULT_FSRS_SETTINGS.enable_short_term,
    });
  }

  const chartData = preview.path.map((s) => ({
    rep: `#${s.rep}`,
    days: Number(s.intervalDays.toFixed(3)),
    label: fmtInterval(s.intervalDays),
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Tune the FSRS scheduler and preview how review intervals grow. Changes apply to each
            card on its next review.
          </p>
        </div>
        <Link
          href="/analytics"
          className="text-sm whitespace-nowrap text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          View analytics →
        </Link>
      </div>

      <div className="grid lg:grid-cols-[22rem_1fr] gap-6">
        {/* ── Config form */}
        <section className="order-2 lg:order-1 space-y-4 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900 h-fit">
          <h2 className="font-semibold">FSRS parameters</h2>

          <Field
            label="Target retention"
            hint="Desired recall probability at review time (0.70–0.97). Higher = more frequent reviews."
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0.7}
                max={0.97}
                step={0.01}
                value={form.request_retention}
                onChange={(e) => set("request_retention", Number(e.target.value))}
                className="flex-1 accent-indigo-600"
              />
              <span className="tabular-nums text-sm w-12 text-right">
                {form.request_retention.toFixed(2)}
              </span>
            </div>
          </Field>

          <Field label="Maximum interval (days)" hint="Cap on how far out a card can be scheduled.">
            <input
              type="number"
              min={1}
              value={form.maximum_interval}
              onChange={(e) => set("maximum_interval", Number(e.target.value))}
              className={inputCls}
            />
          </Field>

          <Field label="Learning steps" hint="Short-term steps for new cards, e.g. 1m, 10m.">
            <input
              type="text"
              value={form.learning_steps}
              onChange={(e) => set("learning_steps", e.target.value)}
              className={inputCls}
              placeholder="1m, 10m"
            />
          </Field>

          <Field label="Relearning steps" hint="Steps applied after a lapse, e.g. 10m.">
            <input
              type="text"
              value={form.relearning_steps}
              onChange={(e) => set("relearning_steps", e.target.value)}
              className={inputCls}
              placeholder="10m"
            />
          </Field>

          <Toggle
            label="Enable fuzz"
            hint="Randomize intervals slightly so reviews don't clump on the same day."
            checked={form.enable_fuzz}
            onChange={(v) => set("enable_fuzz", v)}
          />
          <Toggle
            label="Enable short-term scheduling"
            hint="Use learning/relearning steps. Off = graduate immediately to long intervals."
            checked={form.enable_short_term}
            onChange={(v) => set("enable_short_term", v)}
          />

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={save}
              disabled={saving || !!preview.error}
              className="flex-1 px-4 py-2 rounded-md bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
            <button
              onClick={resetDefaults}
              className="px-4 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Defaults
            </button>
          </div>
          {preview.error && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{preview.error}</p>
          )}
        </section>

        {/* ── Visualizer */}
        <section className="order-1 lg:order-2 space-y-6">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
              <h2 className="font-semibold">Interval projection</h2>
              <div className="flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPreset(p.key)}
                    className={[
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                      preset === p.key
                        ? "bg-indigo-600 text-white"
                        : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    ].join(" ")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {preview.error ? (
              <div className="h-56 flex items-center justify-center text-sm text-zinc-500">
                Fix the input to preview intervals.
              </div>
            ) : (
              <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
                      <XAxis dataKey="rep" stroke="currentColor" fontSize={11} />
                      <YAxis
                        stroke="currentColor"
                        fontSize={11}
                        tickFormatter={(v) => fmtInterval(Number(v))}
                        width={54}
                      />
                      <Tooltip content={<IntervalTip />} />
                      <Line
                        type="monotone"
                        dataKey="days"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                        <th className="py-1.5 pr-3 font-medium">Review</th>
                        <th className="py-1.5 pr-3 font-medium">Interval</th>
                        <th className="py-1.5 font-medium">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.path.map((s) => (
                        <tr key={s.rep} className="border-b border-zinc-100 dark:border-zinc-800/60">
                          <td className="py-1.5 pr-3 tabular-nums">#{s.rep}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{fmtInterval(s.intervalDays)}</td>
                          <td className="py-1.5 text-zinc-500">{s.state}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h2 className="font-semibold">First-review branches</h2>
              <span className="text-xs text-zinc-500">Next interval each rating gives a new card</span>
            </div>
            {preview.error ? (
              <div className="text-sm text-zinc-500">Fix the input to preview branches.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {preview.branch.map((b) => (
                  <div
                    key={b.rating}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-center"
                  >
                    <div
                      className={[
                        "text-xs font-semibold uppercase tracking-wide",
                        RATING_COLOR[b.rating],
                      ].join(" ")}
                    >
                      {b.rating}
                    </div>
                    <div className="text-lg font-bold mt-1 tabular-nums">
                      {fmtInterval(b.intervalDays)}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{b.state}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const RATING_COLOR: Record<PreviewRating, string> = {
  again: "text-rose-600 dark:text-rose-400",
  hard: "text-amber-600 dark:text-amber-400",
  good: "text-indigo-600 dark:text-indigo-400",
  easy: "text-emerald-600 dark:text-emerald-400",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          "shrink-0 mt-0.5 w-10 h-6 rounded-full transition-colors relative",
          checked ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function IntervalTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: { label: string } }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md bg-background border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 shadow-md text-xs">
      <div className="text-zinc-500">Review {label}</div>
      <div className="font-medium text-indigo-600 dark:text-indigo-400">
        {payload[0].payload.label}
      </div>
    </div>
  );
}
