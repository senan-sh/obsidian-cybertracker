import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { showConfirm } from "./confirm";
import { EditStartTimeModal } from "./EditStartTimeModal";
import { TimeTrackerManager } from "./TimeTrackerManager";
import { TimerSession } from "./types";

export const VIEW_TYPE_TIMER = "time-tracker-view";

interface TimerHost {
	openStartModal: () => void;
}

/**
 * Sidebar view that lists active and historical timers.
 */
export class TimeTrackerView extends ItemView {
	private refreshInterval?: number;

	constructor(
		leaf: WorkspaceLeaf,
		private host: TimerHost,
		private manager: TimeTrackerManager
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TIMER;
	}

	getDisplayText(): string {
		return "Time Tracker";
	}

	async onOpen(): Promise<void> {
		await this.render();
		this.refreshInterval = window.setInterval(() => this.updateElapsed(), 1000);
		this.registerInterval(this.refreshInterval);
	}

	async onClose(): Promise<void> {
		this.containerEl.empty();
	}

	/** Public so the plugin can force a UI refresh after mutations. */
	async refresh(): Promise<void> {
		await this.render();
	}

	private async render(): Promise<void> {
		const container = this.containerEl;
		container.empty();
		container.addClass("time-tracker-view");

		const header = container.createDiv({ cls: "timer-header" });
		header.createEl("h2", { text: "Time Tracker" });
		const startBtn = header.createEl("button", { text: "Start timer" });
		startBtn.onclick = () => this.host.openStartModal();

		this.renderSessionList(container.createDiv({ cls: "timer-session-list" }));
	}

	private renderSessionList(container: HTMLElement) {
		const sessions = this.manager.getActiveSessions();
		if (!sessions.length) {
			container.createDiv({ text: "No timers yet." });
			return;
		}

		sessions.forEach((session) => {
			const row = container.createDiv({ cls: "timer-session" });
			row.addClass(`timer-session--${session.status}`);
			const title = row.createDiv({ cls: "timer-session-title" });
			title.createSpan({ text: session.taskName });

			const elapsed = row.createDiv({ cls: "timer-session-elapsed", text: this.formatElapsed(session) });
			const logs = row.createDiv({ cls: "timer-session-logs", text: this.formatLogs(session) });

			const actions = row.createDiv({ cls: "timer-session-actions" });
			this.createActionButton(actions, "edit-3", "Edit timer", () => {
				const modal = new EditStartTimeModal(this.app, this.manager, {
					session,
					onSave: async () => this.render(),
				});
				modal.open();
			});
			if (session.status === "running") {
				this.createActionButton(actions, "pause-circle", "Pause", async () => {
					await this.manager.pause(session.id);
					await this.render();
				});
			} else if (session.status === "paused") {
				this.createActionButton(actions, "play-circle", "Continue", async () => {
					await this.manager.resume(session.id);
					await this.render();
				});
			}

			if (session.status !== "stopped") {
				this.createActionButton(actions, "square", "Stop", async () => {
					await this.manager.stop(session.id);
					await this.render();
				});
			}

			this.createActionButton(actions, "trash-2", "Delete", async () => {
				const confirmed = await showConfirm(this.app, {
					title: "Delete timer",
					message: `Remove "${session.taskName}" and its history?`,
				});
				if (!confirmed) return;
				await this.manager.delete(session.id);
				await this.render();
			});
		});
	}

	private updateElapsed() {
		const elapsedEls = this.containerEl.getElementsByClassName("timer-session-elapsed");
		const sessions = this.manager.getActiveSessions();
		for (let i = 0; i < elapsedEls.length; i++) {
			const session = sessions[i];
			if (!session) continue;
			elapsedEls.item(i)!.textContent = this.formatElapsed(session);
		}
	}

	private formatElapsed(session: TimerSession): string {
		const total = this.manager.getDisplayElapsed(session);
		const seconds = Math.floor(total / 1000) % 60;
		const minutes = Math.floor(total / (1000 * 60)) % 60;
		const hours = Math.floor(total / (1000 * 60 * 60));
		return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(seconds)}`;
	}

	private pad(num: number): string {
		return num.toString().padStart(2, "0");
	}

	private createActionButton(container: HTMLElement, iconId: string, label: string, onClick: () => void) {
		const btn = container.createEl("button", { cls: "timer-action-btn", attr: { "aria-label": label, title: label } });
		setIcon(btn, iconId);
		btn.onclick = onClick;
		return btn;
	}

	private formatLogs(session: TimerSession): string {
		if (!session.logs.length) return "";
		return session.logs
			.map((log) => `${this.formatTime(new Date(log.start))} - ${log.end ? this.formatTime(new Date(log.end)) : "…"}`)
			.join("  •  ");
	}

	private formatTime(date: Date): string {
		return `${this.pad(date.getHours())}:${this.pad(date.getMinutes())}`;
	}
}
