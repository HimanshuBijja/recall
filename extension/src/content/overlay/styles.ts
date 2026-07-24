export const overlayStyles = `
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(24, 24, 24, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .card {
    background: #181818;
    border: 1px solid #4A4441;
    color: #EBDCC4;
    width: min(960px, 96vw);
    max-height: 88vh;
    overflow-y: auto;
    border-radius: 4px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #4A4441;
    padding-bottom: 12px;
    margin-bottom: 8px;
  }
  .columns {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  @media (min-width: 640px) {
    .columns {
      flex-direction: row;
      gap: 24px;
    }
    .left-col {
      flex: 1.1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .right-col {
      flex: 1.2;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  }
  .badge {
    display: inline-block;
    padding: 5px 12px;
    border-radius: 4px;
    border: 1px solid #4A4441;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #181818;
    color: #EBDCC4;
    width: fit-content;
  }
  .tag-selector-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 12px;
    border: 1px solid #4A4441;
    border-radius: 4px;
    background: #181818;
    min-height: 42px;
    align-items: center;
    position: relative;
    cursor: text;
    box-sizing: border-box;
  }
  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #181818;
    border: 1px solid #4A4441;
    color: #EBDCC4;
  }
  .tag-chip.new {
    border: 1px dashed #B6A596;
    color: #B6A596;
  }
  .tag-chip-remove {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    font-weight: bold;
    line-height: 1;
  }
  .tag-input {
    background: transparent !important;
    border: none !important;
    color: #EBDCC4 !important;
    outline: none !important;
    flex: 1;
    min-width: 80px;
    padding: 4px 0 !important;
    font-size: 13px;
  }
  .tag-suggestions {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    margin-top: 4px;
    z-index: 20;
    background: #181818;
    border: 1px solid #4A4441;
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .tag-suggestion-item {
    padding: 8px 12px;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #EBDCC4;
    border-bottom: 1px solid #2e2927;
  }
  .tag-suggestion-item:last-child {
    border-bottom: none;
  }
  .tag-suggestion-item.highlighted {
    background: #2e2927;
    color: #ffffff;
  }
  .tag-suggestion-item .action-hint {
    font-size: 9px;
    opacity: 0.5;
    color: #B6A596;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  img.frame {
    width: 100%;
    border-radius: 4px;
    border: 1px solid #4A4441;
  }
  label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: #B6A596;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 8px 0 4px;
  }
  textarea, input {
    background: #181818;
    color: #EBDCC4;
    border: 1px solid #4A4441;
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 13px;
    font-family: inherit;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
  }
  textarea:focus, input:focus {
    outline: none;
    border-color: #DC9F85;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  button {
    cursor: pointer;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.15s ease;
  }
  .save {
    background: #DC9F85;
    color: #181818;
  }
  .save:hover {
    background: #EBDCC4;
  }
  .cancel, .undo {
    background: #181818;
    color: #EBDCC4;
    border: 1px solid #4A4441;
  }
  .cancel:hover, .undo:hover {
    background: #2e2927;
  }
  .toggle-correct-btn {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 2px solid #4A4441;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
    color: transparent;
    font-size: 11px;
    font-weight: bold;
  }
  .toggle-correct-btn.correct {
    border-color: #DC9F85;
    background: #DC9F85;
    color: #181818;
  }
  .option-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #181818;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #4A4441;
  }
  .add-btn {
    background: transparent;
    color: #B6A596;
    border: 1px dashed #4A4441;
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-top: 4px;
    margin-bottom: 8px;
    width: fit-content;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .add-btn:hover {
    border-color: #DC9F85;
    color: #DC9F85;
  }
  .global-ai-btn {
    background: transparent;
    color: #B6A596;
    border: 1px solid #4A4441;
    border-radius: 4px;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .global-ai-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: #DC9F85;
  }
  .global-ai-btn svg {
    width: 16px !important;
    height: 16px !important;
    display: block !important;
  }
  .global-ai-btn svg, .global-ai-btn svg path {
    stroke: #B6A596 !important;
    fill: none !important;
  }
  .global-ai-btn:hover svg, .global-ai-btn:hover svg path {
    stroke: #DC9F85 !important;
  }
  .options-table-head {
    display: grid;
    grid-template-columns: 28px 1fr 72px 32px;
    align-items: center;
    gap: 8px;
    padding: 0 4px 6px;
    border-bottom: 1px solid #4A4441;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #B6A596;
  }
  .option-row-table {
    display: grid;
    grid-template-columns: 28px 1fr 72px 32px;
    align-items: start;
    gap: 8px;
    padding: 6px 4px;
    border-bottom: 1px solid #2e2927;
  }
  .option-row-table .option-index {
    font-size: 11px;
    color: #B6A596;
    padding-top: 8px;
  }
  .option-row-table .toggle-correct-btn {
    justify-self: center;
    margin-top: 4px;
  }
`;
