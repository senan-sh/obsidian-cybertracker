import { App, Modal, Notice, Setting } from "obsidian";
import { ScheduleEntry, ScheduleEntryKind, TimerLog } from "./types";
import { ScheduleManager } from "./ScheduleManager";

interface AddScheduleModalProps {
	date: string;
	initial?: ScheduleEntry;
	kind: ScheduleEntryKind;
	onSubmit: (entry: ScheduleEntry) => void;
	onDelete?: (id: string) => void;
}

interface LogInput {
	start: string;
	end: string;
}

/**
 * Modal for capturing schedule item details.
 */
export class AddScheduleModal extends Modal {
	private titleValue = "";
	private startValue = "";
	private endValue = "";
	private descriptionValue = "";
	private entryKind: ScheduleEntryKind;
	private logInputs: LogInput[] = [];
	private logListEl?: HTMLElement;

	constructor(app: App, private manager: ScheduleManager, private props: AddScheduleModalProps) {
		super(app);
		this.entryKind = props.initial?.kind ?? props.kind;
		if (props.initial) {
			this.titleValue = props.initial.title;
			this.startValue = props.initial.startTime ?? "";
			this.endValue = props.initial.endTime ?? "";
			this.descriptionValue = props.initial.description ?? "";
			this.logInputs = (props.initial.logs ?? []).map((log) => ({
				start: this.formatLogTime(log.start),
				end: log.end ? this.formatLogTime(log.end) : "",
			}));
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `Schedule for ${this.props.date}` });

		new Setting(contentEl)
			.setName("Task")
			.addText((text) =>
				text
					.setPlaceholder("Task title")
					.setValue(this.titleValue)
					.onChange((value) => (this.titleValue = value.trim()))
			);

		new Setting(contentEl)
			.setName("Description")
			.setDesc("Optional details")
			.addTextArea((text) =>
				text
					.setPlaceholder("Add context...")
					.setValue(this.descriptionValue)
					.onChange((value) => (this.descriptionValue = value.trim()))
			);

		new Setting(contentEl)
			.setName("Start time")
			.setDesc("Optional (HH:MM)")
			.addText((text) =>
				text
					.setPlaceholder("09:00")
					.setValue(this.startValue)
					.onChange((value) => (this.startValue = value.trim()))
			);

		new Setting(contentEl)
			.setName("End time")
			.setDesc("Optional (HH:MM)")
			.addText((text) =>
				text
					.setPlaceholder("10:30")
					.setValue(this.endValue)
					.onChange((value) => (this.endValue = value.trim()))
			);

		this.renderLogEditor(contentEl);

		const footer = contentEl.createDiv({ cls: "add-schedule-modal-footer" });
		const submitBtn = footer.createEl("button", { text: "Save" });
		submitBtn.onclick = async () => {
			await this.save();
		};

		const cancelBtn = footer.createEl("button", { text: "Cancel" });
		cancelBtn.onclick = () => this.close();

		if (this.props.initial) {
			const deleteBtn = footer.createEl("button", { text: "Delete", cls: "button-danger" });
			deleteBtn.onclick = async () => {
				await this.manager.remove(this.props.initial!.id);
				this.props.onDelete?.(this.props.initial!.id);
				this.close();
			};
		}
	}

	private async save() {
		if (!this.titleValue) {
			return;
		}
		const parsedLogs = this.parseLogInputs();
		if (parsedLogs === null) return;

		const entry: Omit<ScheduleEntry, "id"> = {
			kind: this.entryKind,
			title: this.titleValue,
			date: this.props.date,
			startTime: this.startValue || undefined,
			endTime: this.endValue || undefined,
			description: this.descriptionValue || undefined,
			durationMs: this.props.initial?.durationMs,
			logs: parsedLogs.length ? parsedLogs : undefined,
		};
		const saved = await this.manager.add({ ...entry, id: this.props.initial?.id });
		this.props.onSubmit(saved);
		this.close();
	}

	private renderLogEditor(contentEl: HTMLElement) {
		const section = contentEl.createDiv({ cls: "schedule-log-editor" });
		section.createEl("h3", { text: "Time logs" });
		section.createDiv({
			cls: "schedule-log-editor-description",
			text: "Add or adjust tracked segments to correct the total duration.",
		});

		this.logListEl = section.createDiv({ cls: "schedule-log-editor-list" });
		this.renderLogList();

		const addBtn = section.createEl("button", { text: "Add log", cls: "schedule-log-add-btn" });
		addBtn.onclick = () => this.addLogRow();
	}

	private renderLogList() {
		if (!this.logListEl) return;
		this.logListEl.empty();
		if (!this.logInputs.length) {
			this.logListEl.createDiv({ cls: "schedule-log-empty", text: "No logs yet. Add one to track duration manually." });
			return;
		}

		this.logInputs.forEach((log, idx) => {
			const setting = new Setting(this.logListEl!);
			setting.setName(`Log ${idx + 1}`);
			setting.addText((text) =>
				text
					.setPlaceholder("Start (HH:MM or HH:MM:SS)")
					.setValue(log.start)
					.onChange((value) => (log.start = value.trim()))
			);
			setting.addText((text) =>
				text
					.setPlaceholder("End (HH:MM or HH:MM:SS)")
					.setValue(log.end)
					.onChange((value) => (log.end = value.trim()))
			);
			setting.addExtraButton((btn) =>
				btn
					.setIcon("trash-2")
					.setTooltip("Remove log")
					.onClick(() => {
						this.logInputs.splice(idx, 1);
						this.renderLogList();
					})
			);
		});
	}

	private addLogRow() {
		this.logInputs.push({
			start: "",
			end: "",
		});
		this.renderLogList();
	}

	private parseLogInputs(): TimerLog[] | null {
		const logs: TimerLog[] = [];
		for (let i = 0; i < this.logInputs.length; i++) {
			const log = this.logInputs[i];
			if (!log.start && !log.end) continue;
			if (!log.start || !log.end) {
				new Notice(`Log ${i + 1} needs both a start and end time.`);
				return null;
			}
			const start = this.toTimestamp(log.start);
			const end = this.toTimestamp(log.end);
			if (start === null || end === null) {
				new Notice(`Log ${i + 1} has an invalid time. Use HH:MM or HH:MM:SS.`);
				return null;
			}
			if (end <= start) {
				new Notice(`Log ${i + 1} must end after it starts.`);
				return null;
			}
			logs.push({ start, end });
		}
		return logs;
	}

	private toTimestamp(time: string): number | null {
		const parts = time.split(":").map((v) => Number(v));
		if (parts.length < 2 || parts.length > 3 || parts.some((v) => Number.isNaN(v))) {
			return null;
		}
		const [hours, minutes, seconds = 0] = parts;
		if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
			return null;
		}
		const [year, month, day] = this.props.date.split("-").map((v) => Number(v));
		if (!year || !month || !day) return null;
		const date = new Date(year, month - 1, day, hours, minutes, seconds, 0);
		return date.getTime();
	}

	private formatLogTime(ms: number): string {
		const date = new Date(ms);
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");
		return `${hours}:${minutes}:${seconds}`;
	}
}
