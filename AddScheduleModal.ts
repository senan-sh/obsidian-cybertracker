import { App, Modal, Setting } from "obsidian";
import { ScheduleEntry } from "./types";
import { ScheduleManager } from "./ScheduleManager";

interface AddScheduleModalProps {
	date: string;
	initial?: ScheduleEntry;
	onSubmit: (entry: ScheduleEntry) => void;
	onDelete?: (id: string) => void;
}

/**
 * Modal for capturing schedule item details.
 */
export class AddScheduleModal extends Modal {
	private titleValue = "";
	private startValue = "";
	private endValue = "";
	private descriptionValue = "";

	constructor(app: App, private manager: ScheduleManager, private props: AddScheduleModalProps) {
		super(app);
		if (props.initial) {
			this.titleValue = props.initial.title;
			this.startValue = props.initial.startTime ?? "";
			this.endValue = props.initial.endTime ?? "";
			this.descriptionValue = props.initial.description ?? "";
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

		if (this.props.initial?.logs?.length) {
			const logsSection = contentEl.createDiv({ cls: "schedule-log-list" });
			logsSection.createEl("h3", { text: "Time logs" });
			const list = logsSection.createEl("ul");
			this.props.initial.logs.forEach((log, idx) => {
				const start = this.formatLogTime(log.start);
				const end = log.end ? this.formatLogTime(log.end) : "…";
				list.createEl("li", { text: `Log ${idx + 1}: ${start} - ${end}` });
			});
		}

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
		const entry: Omit<ScheduleEntry, "id"> = {
			title: this.titleValue,
			date: this.props.date,
			startTime: this.startValue || undefined,
			endTime: this.endValue || undefined,
			description: this.descriptionValue || undefined,
			durationMs: this.props.initial?.durationMs,
			logs: this.props.initial?.logs,
		};
		const saved = await this.manager.add({ ...entry, id: this.props.initial?.id });
		this.props.onSubmit(saved);
		this.close();
	}

	private formatLogTime(ms: number): string {
		const date = new Date(ms);
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");
		return `${hours}:${minutes}:${seconds}`;
	}
}
