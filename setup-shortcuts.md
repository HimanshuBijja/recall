# Recall Launch & Windows Shortcut Configuration Guide

Recall can be launched in the background automatically on PC boot, manually on demand, or in combination. Below are the options and details of the scripts.

## Start Options

### Option 1: Hybrid Mode (Startup + Start Menu) — *Recommended*
* **Automatic Server Boot:** `scripts/launcher.vbs` is run silently on Windows login (by placing a shortcut in the `Shell:Startup` directory). Next.js server starts silently in the background.
* **Instant Start Menu Launch:** Clicking **Recall** in the Start Menu runs `scripts/open-app.vbs`. Since the server is already active, it launches the borderless Chrome/Edge window instantly (within milliseconds).
* **Self-Healing:** If you closed the server manually or it isn't running, `open-app.vbs` will detect it and boot the server first, then open the window.

### Option 2: On-Demand Mode (No Automatic Startup)
* **Start on Demand:** Nothing runs at startup.
* **Click to Launch:** Clicking **Recall** in the Start Menu triggers `scripts/open-app.vbs`, which boots the Next.js server silently in the background and opens the app window after a 4-second delay.
* **Background Running:** The server will remain running silently in the background for that session.

---

## Automatic Installation

We have created a single-click installer script: [setup-shortcuts.ps1](file:///d:/code/personal_projects/recall/scripts/setup-shortcuts.ps1).

### What it does:
1. Validates that [recall.ico](file:///d:/code/personal_projects/recall/public/recall.ico) is generated from `recall-logo.jpg`.
2. Creates the **Recall** Start Menu shortcut pointing to `open-app.vbs` (with the new icon).
3. Creates the **RecallServer** auto-run shortcut pointing to `launcher.vbs` inside your Windows startup folder.

### How to Run:
1. Open PowerShell.
2. Run the script:
   ```powershell
   d:\code\personal_projects\recall\scripts\setup-shortcuts.ps1
   ```
