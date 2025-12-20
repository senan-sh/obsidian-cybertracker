import { App, normalizePath } from "obsidian";
import { ScheduleManager } from "./ScheduleManager";
import { TimerLog, TimerSession } from "./types";

export type SessionUpdateResult =
	| { ok: true }
	| { ok: false; reason: "not-found" | "no-logs" | "after-end" | "in-future" | "invalid-name" };

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
				this.sessions = (parsed as TimerSession[]).map((session) => this.hydrateSession(session));
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

	async start(taskName: string, description?: string): Promise<TimerSession> {
		const now = Date.now();
		const trimmedName = taskName.trim();
		const trimmedDescription = description?.trim() || undefined;
		const session: TimerSession = {
			id: this.createId(),
			taskName: trimmedName,
			description: trimmedDescription,
			status: "running",
			logs: [{ start: now }],
			startedAt: now,
		};
		this.sessions.push(session);
		await this.persist();
		return session;
	}

	async pause(id: string): Promise<void> {
		const session = this.sessions.find((s) => s.id === id);
		if (!session || session.status !== "running") return;
		this.closeOpenLog(session);
		session.status = "paused";
		await this.persist();
	}

	async resume(id: string): Promise<void> {
		const session = this.sessions.find((s) => s.id === id);
		if (!session || session.status !== "paused") return;
		session.logs.push({ start: Date.now() });
		session.status = "running";
		await this.persist();
	}

	async stop(id: string): Promise<void> {
		const session = this.sessions.find((s) => s.id === id);
		if (!session || session.status === "stopped") return;
		this.closeOpenLog(session);
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
		return this.getTotalElapsed(session);
	}

	async updateSession(
		id: string,
		updates: { taskName?: string; description?: string; startTime?: number }
	): Promise<SessionUpdateResult> {
		const session = this.sessions.find((s) => s.id === id);
		if (!session) return { ok: false, reason: "not-found" };

		if (updates.taskName !== undefined) {
			const name = updates.taskName.trim();
			if (!name) return { ok: false, reason: "invalid-name" };
			session.taskName = name;
		}

		if (updates.description !== undefined) {
			session.description = updates.description.trim() || undefined;
		}

		if (updates.startTime !== undefined) {
			if (!session.logs.length) return { ok: false, reason: "no-logs" };
			const firstLog = session.logs[0];
			if (firstLog.end !== undefined && updates.startTime >= firstLog.end) {
				return { ok: false, reason: "after-end" };
			}
			if (session.status === "running" && updates.startTime > Date.now()) {
				return { ok: false, reason: "in-future" };
			}
			firstLog.start = updates.startTime;
			session.startedAt = updates.startTime;
		}

		await this.persist();
		return { ok: true };
	}

	private async persist(): Promise<void> {
		await this.app.vault.adapter.write(this.trackerFile, JSON.stringify(this.sessions, null, 2));
	}

	private async logToSchedule(session: TimerSession): Promise<void> {
		if (!session.logs.length) return;
		const startMs = Math.min(...session.logs.map((log) => log.start));
		const endMs = Math.max(...session.logs.map((log) => log.end ?? session.stoppedAt ?? Date.now()));
		const endDate = new Date(endMs);
		const startDate = new Date(startMs);
		const durationMs = this.getTotalElapsed(session);

		await this.scheduleManager.add({
			id: `timer-${session.id}`,
			kind: "tracker",
			date: this.toISO(endDate),
			title: session.taskName,
			startTime: this.formatTime(startDate),
			endTime: this.formatTime(endDate),
			durationMs,
			logs: session.logs.map((log) => ({ start: log.start, end: log.end })),
			description: session.description ?? "Logged from timer",
		});
	}

	private formatTime(date: Date): string {
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");
		return `${hours}:${minutes}:${seconds}`;
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

	private closeOpenLog(session: TimerSession) {
		const current = session.logs[session.logs.length - 1];
		if (current && current.end === undefined) {
			current.end = Date.now();
		}
	}

	private getTotalElapsed(session: TimerSession): number {
		return session.logs.reduce((acc, log) => acc + ((log.end ?? Date.now()) - log.start), 0);
	}

	private hydrateSession(session: TimerSession): TimerSession {
		const logs: TimerLog[] = Array.isArray(session.logs) ? session.logs.map((log) => ({ start: log.start, end: log.end })) : [];
		if (!logs.length) {
			if (session.elapsedMs && session.stoppedAt) {
				logs.push({ start: session.stoppedAt - session.elapsedMs, end: session.stoppedAt });
			} else if (session.startedAt) {
				const start = session.status === "running" ? session.startedAt : session.startedAt - (session.elapsedMs ?? 0);
				logs.push({ start });
				if (session.status !== "running") {
					logs[0].end = session.startedAt;
				}
			}
		}
		return {
			...session,
			logs,
		};
	}
}
