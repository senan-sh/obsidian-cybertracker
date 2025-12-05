import { ItemView, WorkspaceLeaf } from "obsidian";
import { AddScheduleModal } from "./AddScheduleModal";
import { ScheduleManager } from "./ScheduleManager";
import { CalendarViewMode, PluginSettings, ScheduleEntry } from "./types";

export const VIEW_TYPE_CALENDAR = "schedule-calendar-view";

interface CalendarHost {
	getSettings: () => PluginSettings;
	openStartTimerModal: () => void;
}

/**
 * Renders the scheduling calendar inside a custom Obsidian view.
 */
export class CalendarView extends ItemView {
	private mode: CalendarViewMode;
	private referenceDate: Date = new Date();

	constructor(
		leaf: WorkspaceLeaf,
		private host: CalendarHost,
		private scheduleManager: ScheduleManager
	) {
		super(leaf);
		this.mode = host.getSettings().defaultView;
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return "Schedule Calendar";
	}

	async onOpen(): Promise<void> {
		const scheduleChangeRef = this.scheduleManager.onChange(() => {
			this.handleScheduleChange();
		});
		this.register(() => this.scheduleManager.offChange(scheduleChangeRef));
		await this.render();
	}

	async onClose(): Promise<void> {
		this.containerEl.empty();
	}

	private async render(): Promise<void> {
		const container = this.containerEl;
		container.empty();
		container.addClass("schedule-calendar-view");

		const header = container.createDiv({ cls: "calendar-header" });
		const title = header.createEl("h2", { text: this.getHeaderLabel() });

		const controls = header.createDiv({ cls: "calendar-header-controls" });
		const prevBtn = controls.createEl("button", { text: "◀" });
		prevBtn.onclick = () => {
			this.shift(-1);
		};
		const nextBtn = controls.createEl("button", { text: "▶" });
		nextBtn.onclick = () => {
			this.shift(1);
		};

		const modeToggle = controls.createEl("select");
		modeToggle.createEl("option", { value: "month", text: "Month" });
		modeToggle.createEl("option", { value: "week", text: "Week" });
		modeToggle.value = this.mode;
		modeToggle.onchange = () => {
			this.mode = modeToggle.value as CalendarViewMode;
			this.render();
		};

		const trackBtn = controls.createEl("button", { text: "Track time" });
		trackBtn.onclick = () => this.host.openStartTimerModal();

		if (this.mode === "month") {
			this.renderMonth(container.createDiv({ cls: "calendar-body" }));
		} else {
			this.renderWeek(container.createDiv({ cls: "calendar-body" }));
		}
	}

	private shift(delta: number) {
		if (this.mode === "month") {
			this.referenceDate = new Date(this.referenceDate.getFullYear(), this.referenceDate.getMonth() + delta, 1);
		} else {
			this.referenceDate = new Date(this.referenceDate.getFullYear(), this.referenceDate.getMonth(), this.referenceDate.getDate() + delta * 7);
		}
		void this.render();
	}

	private handleScheduleChange() {
		void this.render();
	}

	private renderMonth(body: HTMLElement) {
		const startOfWeek = this.getStartOfWeekIndex();
		const month = this.referenceDate.getMonth();
		const year = this.referenceDate.getFullYear();
		const monthStart = new Date(year, month, 1);
		const monthEnd = new Date(year, month + 1, 0);
		const gridStart = this.startOfWeekDate(monthStart, startOfWeek);
		const gridEnd = this.endOfWeekDate(monthEnd, startOfWeek);

		const weekdayRow = body.createDiv({ cls: "calendar-weekday-row" });
		this.getWeekdayLabels().forEach((label) => {
			weekdayRow.createDiv({ cls: "calendar-weekday", text: label });
		});

		const grid = body.createDiv({ cls: "calendar-month-grid" });
		for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
			const cellDate = new Date(cursor);
			const iso = this.toISO(cellDate);
			const isCurrentMonth = cellDate.getMonth() === month;
			const cell = grid.createDiv({ cls: "calendar-cell" });
			if (!isCurrentMonth) cell.addClass("calendar-cell-muted");

			const header = cell.createDiv({ cls: "calendar-cell-header" });
			header.createSpan({ text: String(cellDate.getDate()) });

			const addBtn = header.createEl("button", { text: "+" });
			addBtn.onclick = () => this.openScheduleModal(iso);

			const items = this.scheduleManager.getByDate(iso);
			const list = cell.createDiv({ cls: "calendar-cell-list" });
			items.forEach((item) => {
				const el = list.createDiv({
					cls: "calendar-cell-item",
				});
				el.style.backgroundColor = this.getColorForText(item.title);
				el.onclick = () => this.openScheduleModal(iso, item);
				const tooltip = el.createDiv({ cls: "calendar-tooltip", text: this.getTooltipText(item) });
			});
		}
	}

	private renderWeek(body: HTMLElement) {
		const startOfWeek = this.startOfWeekDate(this.referenceDate, this.getStartOfWeekIndex());
		const grid = body.createDiv({ cls: "calendar-week-grid" });

		for (let i = 0; i < 7; i++) {
			const day = new Date(startOfWeek);
			day.setDate(day.getDate() + i);
			const iso = this.toISO(day);
			const column = grid.createDiv({ cls: "calendar-week-day" });
			const header = column.createDiv({ cls: "calendar-week-day-header" });
			header.createSpan({ text: `${this.getWeekdayLabels()[i]} ${day.getDate()}` });

			const addBtn = header.createEl("button", { text: "+" });
			addBtn.onclick = () => this.openScheduleModal(iso);

			const items = this.scheduleManager.getByDate(iso).sort((a, b) => (a.startTime ?? "") > (b.startTime ?? "") ? 1 : -1);
			const timeline = column.createDiv({ cls: "calendar-week-timeline" });
			items.forEach((item) => {
				const block = timeline.createDiv({ cls: "calendar-week-item" });
				const timeLabel = item.startTime || item.endTime ? `${item.startTime ?? ""}${item.endTime ? ` - ${item.endTime}` : ""}` : "All day";
				block.style.backgroundColor = this.getColorForText(item.title);
				block.createDiv({ cls: "calendar-tooltip", text: this.getTooltipText(item) });
				block.createDiv({ cls: "calendar-week-item-time", text: timeLabel });
				block.createDiv({ cls: "calendar-week-item-title", text: item.title });
				block.onclick = () => this.openScheduleModal(iso, item);
			});
		}
	}

	private getHeaderLabel(): string {
		if (this.mode === "month") {
			return this.referenceDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
		}
		const start = this.startOfWeekDate(this.referenceDate, this.getStartOfWeekIndex());
		const end = new Date(start);
		end.setDate(end.getDate() + 6);
		return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
	}

	private getWeekdayLabels(): string[] {
		const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		if (this.host.getSettings().startOfWeek === "monday") {
			return labels.slice(1).concat(labels[0]);
		}
		return labels;
	}

	private getStartOfWeekIndex(): number {
		return this.host.getSettings().startOfWeek === "monday" ? 1 : 0;
	}

	private startOfWeekDate(date: Date, startIndex: number): Date {
		const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const diff = (d.getDay() + 7 - startIndex) % 7;
		d.setDate(d.getDate() - diff);
		return d;
	}

	private endOfWeekDate(date: Date, startIndex: number): Date {
		const start = this.startOfWeekDate(date, startIndex);
		const end = new Date(start);
		end.setDate(end.getDate() + 6);
		return end;
	}

	private toISO(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	private getItemLabel(item: ScheduleEntry): string {
		const timeLabel = item.startTime || item.endTime ? `${item.startTime ?? ""}${item.endTime ? ` - ${item.endTime}` : ""}` : "All day";
		return timeLabel ? `${timeLabel} • ${item.title}` : item.title;
	}

	private getTooltipText(item: ScheduleEntry): string {
		const parts: string[] = [];
		parts.push(item.title);
		const timeLabel = item.startTime || item.endTime ? `${item.startTime ?? ""}${item.endTime ? ` - ${item.endTime}` : ""}` : "All day";
		if (timeLabel) parts.push(timeLabel);
		const duration = this.getDurationLabel(item);
		if (duration) parts.push(`Time tracked: ${duration}`);
		return parts.join("\n");
	}

	private getColorForText(text: string): string {
		const palette = ["#3b5bdb", "#e03131", "#c2255c", "#1971c2", "#2b8a3e", "#5f3dc4", "#c36200", "#0b7285"];
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			hash = (hash << 5) - hash + text.charCodeAt(i);
			hash |= 0;
		}
		const idx = Math.abs(hash) % palette.length;
		return palette[idx];
	}

	private getDurationLabel(item: ScheduleEntry): string | null {
		if (!item.startTime || !item.endTime) return null;
		const start = this.toMinutes(item.startTime);
		const end = this.toMinutes(item.endTime);
		if (end <= start) return null;
		const minutes = end - start;
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		if (hours && mins) return `${hours}h ${mins}m`;
		if (hours) return `${hours}h`;
		return `${mins}m`;
	}

	private toMinutes(hhmm: string): number {
		const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
		if (Number.isNaN(h) || Number.isNaN(m)) return 0;
		return h * 60 + m;
	}

	private openScheduleModal(date: string, existing?: ScheduleEntry) {
		const modal = new AddScheduleModal(this.app, this.scheduleManager, {
			date,
			initial: existing,
			onSubmit: () => this.render(),
			onDelete: () => this.render(),
		});
		modal.open();
	}
}
