# CyberTracker (Obsidian Plugin)

Calendar scheduling with a live time-tracking sidebar. Plan days in a calendar, start timers, and automatically log finished sessions into your schedule.

## Install
- Copy `manifest.json`, `main.js`, and (optionally) `styles.css` into your vault: `<vault>/.obsidian/plugins/cyber-tracker/`.
- Reload Obsidian and enable **CyberTracker** in **Settings → Community plugins**.

## Use
- Ribbon icon: opens the calendar.
- Commands:
  - `Open schedule calendar`
  - `Start timer`
  - `Show time tracker sidebar`
- Calendar (Month/Week)
  - Click `+` on a day to add a task with optional start/end time and description.
  - Click an item to edit or delete it.
  - Tooltips show task name and tracked duration (from logs or start–end time).
- Time Tracker sidebar
  - Start a timer from the ribbon/command or the **Start timer** button.
  - Pause/continue/stop from the sidebar. Stopping writes a schedule entry with logs and duration.
  - Delete removes the timer history and the linked schedule entry.

## Settings
Found under **Settings → CyberTracker**:
- Default calendar view: Month or Week.
- Start of week: Monday or Sunday.

## Data Storage
- Schedules are stored in per-month JSON files under your vault config folder: `.obsidian/schedule/YYYY-MM.json`.
- Timer sessions live in `.obsidian/time-tracker.json`.
- A legacy `schedule.json` (if present) is migrated once and backed up as `schedule.legacy.json`.

## Development
- `npm install`
- `npm run dev` for watch mode, or `npm run build` for a production bundle.

## Notes
- Plugin is marked desktop-only (`isDesktopOnly: true`).
