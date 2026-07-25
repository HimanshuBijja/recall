"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Group } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

export function NewSubjectClient({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [exempted, setExempted] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggleGroup(gid: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev, gid]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast("error", "Subject name is required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/subjects", {
        name: name.trim(),
        groupIds: selectedGroupIds,
        exempted: exempted,
      });
      toast("success", "Subject created");
      router.push("/subjects");
      router.refresh();
    } catch {
      toast("error", "Failed to create subject");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 text-xs tracking-widest text-muted uppercase font-semibold mb-2">
          <span className="w-6 h-[2px] bg-accent" />
          Setup curriculum unit
        </div>
        <h1 className="cinematic-headline text-[10vw] sm:text-[8vw] md:text-[5vw] leading-[0.85] font-display font-bold tracking-tight mb-1" data-text="NEW SUBJECT">
          NEW SUBJECT
        </h1>
        <p className="text-sm text-muted mt-2 uppercase tracking-wider">
          Give this subject a name and choose which card groups are included.
        </p>
      </div>

      <hr className="border-t border-divider my-6" />

      <form onSubmit={handleSave} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="name" className="text-xs uppercase font-bold tracking-wider text-muted">
            Subject Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Computer Science, Medical Revision..."
            className="w-full px-3 py-2 border border-border rounded-[4px] bg-transparent text-foreground placeholder-zinc-600 focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="subject-exempted"
            type="checkbox"
            checked={exempted}
            onChange={(e) => setExempted(e.target.checked)}
            className="w-4 h-4 accent-indigo-600 rounded border-border bg-transparent cursor-pointer"
          />
          <label htmlFor="subject-exempted" className="text-xs uppercase tracking-wide text-muted mb-0 select-none cursor-pointer">
            Exempt from spaced repetition
          </label>
        </div>

        <div className="space-y-3">
          <div className="text-xs uppercase font-bold tracking-wider text-muted">
            Select Study Groups
          </div>
          {groups.length === 0 ? (
            <div className="text-sm text-muted italic">
              No groups exist yet. Create groups first under the{" "}
              <Link href="/groups" className="text-accent hover:underline font-bold">
                Groups manager
              </Link>
              .
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1 border border-border bg-zinc-950/10 rounded-[4px]">
              {groups.map((g) => {
                const isSelected = selectedGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className={[
                      "flex items-center justify-between p-3 border text-left rounded-[4px] transition-colors",
                      isSelected
                        ? "border-accent bg-zinc-900"
                        : "border-border hover:bg-zinc-900/40",
                    ].join(" ")}
                  >
                    <div>
                      <div className="text-sm font-semibold">{g.name}</div>
                      <div className="text-[10px] text-muted font-mono mt-0.5">
                        {g.videoId ? "YouTube Video Group" : g.webUrl ? "Web Page Group" : `${g.tagIds.length} tags`}
                      </div>
                    </div>
                    <div
                      className={[
                        "w-4 h-4 rounded-[4px] border flex items-center justify-center text-[10px]",
                        isSelected
                          ? "border-accent bg-accent text-background font-bold"
                          : "border-border",
                      ].join(" ")}
                    >
                      {isSelected && "✓"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t border-divider">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed rounded-[4px]"
          >
            {saving ? "Saving..." : "Save Subject"}
          </button>
          <Link
            href="/subjects"
            className="px-6 py-2.5 border border-border hover:bg-zinc-900 text-foreground font-bold text-xs uppercase tracking-widest transition-colors duration-150 rounded-[4px]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
