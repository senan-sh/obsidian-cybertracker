import { App, normalizePath } from "obsidian";
import { ScheduleManager } from "./ScheduleManager";
import { TimerSession } from "./types";

/**
 * Stores timer sessions, handles start/pause/resume/stop, and persists to disk.
 */
export class TimeTrackerManager {
	private trackerFile: string;
	private sessions: TimerSession[] = [];

	constructor(private app: App, private scheduleManager: ScheduleManager) {
		this.trackerFile = normalizePath(`${app.vault.configDir}/time-tracker.json`);
	}

	async load(): Promise<void> {
		if (!(await this.app.vault.adapter.exists(this.trackerFile))) {
			await this.app.vault.adapter.write(this.trackerFile, "[]");
		}
		const raw = await this.app.vault.adapter.read(this.trackerFile);
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				this.sessions = (parsed as TimerSession[]).map((session) => ({
					...session,
					elapsedMs: session.elapsedMs ?? 0,
				}));
			}
		} catch (err) {
			console.error("Failed to parse time tracker file", err);
			this.sessions = [];
		}
	}

	getSessions(): TimerSession[] {
		return [...this.sessions];
	}

	getActiveSessions(): TimerSession[] {
		return this.sessions.filter((s) => s.status !== "stopped");
	}

	async start(taskName: string): Promise<TimerSession> {
		const now = Date.now();
		const session: TimerSession = {
			id: this.createId(),
			taskName,
			startedAt: now,
			elapsedMs: 0,
			status: "running",
		};
		this.sessions.push(session);
		await this.persist();
		return session;
	}

	async pause(id: string): Promise<void> {
		const session = this.sessions.find((s) => s.id === id);
		if (!session || session.status !== "running") return;
		session.elapsedMs += Date.now() - session.startedAt;
		session.status = "paused";
		await this.persist();
	}

	async resume(id: string): Promise<void> {
		const session = this.sessions.find((s) => s.id === id);
		if (!session || session.status !== "paused") return;
		session.startedAt = Date.now();
		session.status = "running";
		await this.persist();
	}

	async stop(id: string): Promise<void> {
		const session = this.sessions.find((s) => s.id === id);
		if (!session || session.status === "stopped") return;
		if (session.status === "running") {
			session.elapsedMs += Date.now() - session.startedAt;
		}
		session.status = "stopped";
		session.stoppedAt = Date.now();
		await this.logToSchedule(session);
		await this.persist();
	}

	async delete(id: string): Promise<void> {
		this.sessions = this.sessions.filter((s) => s.id !== id);
		// Remove corresponding schedule entry if it exists (only created when stopped).
		await this.scheduleManager.remove(`timer-${id}`);
		await this.persist();
	}

	getDisplayElapsed(session: TimerSession): number {
		if (session.status === "running") {
			return session.elapsedMs + (Date.now() - session.startedAt);
		}
		return session.elapsedMs;
	}

	private async persist(): Promise<void> {
		await this.app.vault.adapter.write(this.trackerFile, JSON.stringify(this.sessions, null, 2));
	}

	private async logToSchedule(session: TimerSession): Promise<void> {
		// Calculate start and end times based on total elapsed.
		const endMs = session.stoppedAt ?? Date.now();
		const startMs = endMs - session.elapsedMs;
		const endDate = new Date(endMs);
		const startDate = new Date(startMs);

		await this.scheduleManager.add({
			id: `timer-${session.id}`,
			date: this.toISO(endDate),
			title: session.taskName,
			startTime: this.formatTime(startDate),
			endTime: this.formatTime(endDate),
			description: "Logged from timer",
		});
	}

	private formatTime(date: Date): string {
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		return `${hours}:${minutes}`;
	}

	private toISO(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	private createId(): string {
		return `timer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}
}
