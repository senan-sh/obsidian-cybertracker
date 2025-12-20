import { App, Modal, Notice, Setting } from "obsidian";
import { SessionUpdateResult, TimeTrackerManager } from "./TimeTrackerManager";
import { TimerSession } from "./types";

interface EditStartTimeModalProps {
	session: TimerSession;
	onSave: () => void | Promise<void>;
}

export class EditStartTimeModal extends Modal {
	private taskNameValue = "";
	private descriptionValue = "";
	private timeValue = "";

	constructor(app: App, private manager: TimeTrackerManager, private props: EditStartTimeModalProps) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Edit timer" });

		const session = this.props.session;
		const firstLog = session.logs[0];
		if (!firstLog) {
			new Notice("No start time to edit.");
			this.close();
			return;
		}

		const baseDate = new Date(firstLog.start);
		this.taskNameValue = session.taskName;
		this.descriptionValue = session.description ?? "";
		this.timeValue = this.formatTime(baseDate);

		new Setting(contentEl)
			.setName("Task")
			.addText((text) =>
				text
					.setPlaceholder("Task name")
					.setValue(this.taskNameValue)
					.onChange((value) => (this.taskNameValue = value))
			);

		new Setting(contentEl)
			.setName("Description")
			.setDesc("Optional details")
			.addTextArea((text) =>
				text
					.setPlaceholder("Add context...")
					.setValue(this.descriptionValue)
					.onChange((value) => (this.descriptionValue = value))
			);

		new Setting(contentEl)
			.setName("Start time")
			.setDesc("Use HH:MM or HH:MM:SS.")
			.addText((text) =>
				text
					.setPlaceholder("HH:MM")
					.setValue(this.timeValue)
					.onChange((value) => (this.timeValue = value.trim()))
			);

		const footer = contentEl.createDiv({ cls: "start-timer-footer" });
		const saveBtn = footer.createEl("button", { text: "Save" });
		saveBtn.onclick = async () => {
			const taskName = this.taskNameValue.trim();
			if (!taskName) {
				new Notice("Task name is required.");
				return;
			}
			const parsed = this.parseTime(this.timeValue, baseDate);
			if (parsed === null) {
				new Notice("Invalid time. Use HH:MM or HH:MM:SS.");
				return;
			}
			const description = this.descriptionValue.trim();
			const result = await this.manager.updateSession(this.props.session.id, {
				taskName,
				description: description || undefined,
				startTime: parsed,
			});
			if (!result.ok) {
				new Notice(this.getErrorMessage(result));
				return;
			}
			await this.props.onSave();
			this.close();
		};

		const cancelBtn = footer.createEl("button", { text: "Cancel" });
		cancelBtn.onclick = () => this.close();
	}

	private parseTime(value: string, baseDate: Date): number | null {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parts = trimmed.split(":").map((part) => Number(part));
		if (parts.length < 2 || parts.length > 3 || parts.some((part) => Number.isNaN(part))) {
			return null;
		}
		const [hours, minutes, seconds = 0] = parts;
		if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
			return null;
		}
		const date = new Date(
			baseDate.getFullYear(),
			baseDate.getMonth(),
			baseDate.getDate(),
			hours,
			minutes,
			seconds,
			0
		);
		return date.getTime();
	}

	private formatTime(date: Date): string {
		return `${this.pad(date.getHours())}:${this.pad(date.getMinutes())}:${this.pad(date.getSeconds())}`;
	}

	private pad(value: number): string {
		return value.toString().padStart(2, "0");
	}

	private getErrorMessage(result: SessionUpdateResult): string {
		if (result.ok) return "";
		switch (result.reason) {
			case "after-end":
				return "Start time must be before the first log ends.";
			case "in-future":
				return "Start time cannot be in the future.";
			case "invalid-name":
				return "Task name is required.";
			default:
				return "Unable to update start time.";
		}
	}
}
