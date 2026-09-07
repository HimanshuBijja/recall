"use client";

import React, { useState } from "react";
import type { CardKind } from "@/types";

export interface PdfPrintOptions {
  selectedKinds: CardKind[];
  slidesPerPage: 1 | 2 | 4;
}

interface NotesPdfPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPrint: (options: PdfPrintOptions) => void;
  availableKinds: CardKind[];
  matchingCount: number;
}

const ALL_KINDS: CardKind[] = ["mcq", "multi", "tf-sort", "flash", "cloze", "match"];

const KIND_LABELS: Record<CardKind, string> = {
  mcq: "Multiple Choice (MCQ)",
  multi: "Multiple Select",
  "tf-sort": "True / False",
  flash: "Flashcard",
  cloze: "Cloze Fill-in",
  match: "Pair Matching",
};

export default function NotesPdfPrintModal({
  isOpen,
  onClose,
  onPrint,
  availableKinds,
  matchingCount,
}: NotesPdfPrintModalProps) {
  const [selectedKinds, setSelectedKinds] = useState<CardKind[]>(
    availableKinds.length > 0 ? availableKinds : ALL_KINDS
  );
  const [slidesPerPage, setSlidesPerPage] = useState<1 | 2 | 4>(1);

  if (!isOpen) return null;

  const handleToggleKind = (kind: CardKind) => {
    if (selectedKinds.includes(kind)) {
      setSelectedKinds(selectedKinds.filter((k) => k !== kind));
    } else {
      setSelectedKinds([...selectedKinds, kind]);
    }
  };

  const handleSelectAll = () => {
    setSelectedKinds(ALL_KINDS);
  };

  const handleSelectFlash = () => {
    setSelectedKinds(["flash"]);
  };

  const handleClearAll = () => {
    setSelectedKinds([]);
  };

  const handleConfirm = () => {
    onPrint({
      selectedKinds,
      slidesPerPage,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1C1A19] border border-[#3D3735] rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-6 text-[#EBDCC4]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3D3735] pb-4">
          <div>
            <h3 className="text-xl font-bold text-[#EBDCC4] flex items-center gap-2">
              <span>🖨️</span> Print PDF (Screenshots Only)
            </h3>
            <p className="text-xs text-[#B6A596] mt-1">
              Exports pure visual slide screenshots with native PDF chapter bookmarks and invisible Ctrl+F search.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#B6A596] hover:text-[#EBDCC4] text-lg px-2 py-1 rounded-md transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Card Type Filters */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#DC9F85] uppercase tracking-wider">
              Filter Card Types to Include
            </label>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[#DC9F85] hover:underline"
              >
                Select All
              </button>
              <span className="text-[#3D3735]">|</span>
              <button
                type="button"
                onClick={handleSelectFlash}
                className="text-[#DC9F85] hover:underline"
              >
                Flashcards Only
              </button>
              <span className="text-[#3D3735]">|</span>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[#B6A596] hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#121111] p-3 rounded-lg border border-[#2A2524]">
            {ALL_KINDS.map((kind) => {
              const isChecked = selectedKinds.includes(kind);
              return (
                <label
                  key={kind}
                  className={`flex items-center gap-2.5 p-2 rounded cursor-pointer transition-colors text-xs ${
                    isChecked
                      ? "bg-[#2A2524] text-[#EBDCC4] font-medium"
                      : "text-[#B6A596] hover:bg-[#1C1A19]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleKind(kind)}
                    className="accent-[#DC9F85] rounded w-3.5 h-3.5"
                  />
                  <span>{KIND_LABELS[kind]}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Slides Per Page Preset */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-[#DC9F85] uppercase tracking-wider">
            Slides Per Page Layout
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { count: 1, label: "1 Slide / Page", sub: "Presentation View" },
              { count: 2, label: "2 Slides / Page", sub: "Vertical Stack" },
              { count: 4, label: "4 Slides / Page", sub: "2x2 Compact Grid" },
            ].map(({ count, label, sub }) => (
              <button
                key={count}
                type="button"
                onClick={() => setSlidesPerPage(count as 1 | 2 | 4)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  slidesPerPage === count
                    ? "border-[#DC9F85] bg-[#DC9F85]/10 text-[#EBDCC4]"
                    : "border-[#2A2524] bg-[#121111] text-[#B6A596] hover:border-[#3D3735]"
                }`}
              >
                <div className="font-semibold text-xs text-[#EBDCC4]">{label}</div>
                <div className="text-[10px] text-[#B6A596] mt-0.5">{sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Features Info Box */}
        <div className="bg-[#121111] border border-[#2A2524] rounded-lg p-3 space-y-1.5 text-[11px] text-[#B6A596]">
          <div className="flex items-center gap-1.5 text-[#EBDCC4] font-medium">
            <span>💡</span> Embedded Features:
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>Page 1 Table of Contents with hyperlinked chapter jump links.</li>
            <li>Native Chrome & Edge sidebar outline navigation.</li>
            <li>Invisible text layer for <code className="bg-[#2A2524] px-1 py-0.5 rounded text-[#DC9F85]">Ctrl + F</code> keyword & timestamp search.</li>
          </ul>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[#3D3735]">
          <div className="text-xs text-[#B6A596]">
            Ready: <span className="font-semibold text-[#DC9F85]">{matchingCount}</span> slides
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-[#B6A596] hover:text-[#EBDCC4] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedKinds.length === 0 || matchingCount === 0}
              onClick={handleConfirm}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#DC9F85] text-[#121111] hover:bg-[#EBDCC4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-lg"
            >
              <span>🖨️</span> Print / Save PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
