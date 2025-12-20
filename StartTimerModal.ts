import { App, Modal, Setting } from "obsidian";
import { TimeTrackerManager } from "./TimeTrackerManager";
import { TimerSession } from "./types";

interface StartTimerModalProps {
	onStart: (session: TimerSession) => void;
}

/**
 * Asks the user what they are working on and starts a new timer.
 */
export class StartTimerModal extends Modal {
	private taskName = "";
	private description = "";

	constructor(app: App, private manager: TimeTrackerManager, private props: StartTimerModalProps) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "What are you working on?" });

		new Setting(contentEl)
			.setName("Task")
			.addText((text) =>
				text
					.setPlaceholder("Task name")
					.onChange((value) => (this.taskName = value.trim()))
			)
			.setDesc("Timers are saved to the vault and can be resumed.");

		new Setting(contentEl)
			.setName("Description")
			.setDesc("Optional details")
			.addTextArea((text) =>
				text
					.setPlaceholder("Add context...")
					.onChange((value) => (this.description = value.trim()))
			);

		const footer = contentEl.createDiv({ cls: "start-timer-footer" });
		const startBtn = footer.createEl("button", { text: "Start" });
		startBtn.onclick = async () => {
			if (!this.taskName) return;
			const session = await this.manager.start(this.taskName, this.description || undefined);
			this.props.onStart(session);
			this.close();
		};

		const cancelBtn = footer.createEl("button", { text: "Cancel" });
		cancelBtn.onclick = () => this.close();
	}
}
