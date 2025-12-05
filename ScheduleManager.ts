import { App, EventRef, Events, normalizePath } from "obsidian";
import { ScheduleEntry } from "./types";

/**
 * Handles reading and writing scheduled items to a vault-local JSON file.
 */
export class ScheduleManager {
	private scheduleFile: string;
	private schedules: ScheduleEntry[] = [];
	private events = new Events();

	constructor(private app: App) {
		this.scheduleFile = normalizePath(`${app.vault.configDir}/schedule.json`);
	}

	async load(): Promise<void> {
		if (!(await this.app.vault.adapter.exists(this.scheduleFile))) {
			await this.app.vault.adapter.write(this.scheduleFile, "[]");
		}
		const raw = await this.app.vault.adapter.read(this.scheduleFile);
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				this.schedules = parsed as ScheduleEntry[];
			}
		} catch (err) {
			console.error("Failed to parse schedule file", err);
			this.schedules = [];
		}
	}

	getAll(): ScheduleEntry[] {
		return [...this.schedules];
	}

	getByDate(date: string): ScheduleEntry[] {
		return this.schedules.filter((item) => item.date === date);
	}

	async add(entry: Omit<ScheduleEntry, "id"> & { id?: string }): Promise<ScheduleEntry> {
		const id = entry.id ?? this.createId();
		const newEntry: ScheduleEntry = { ...entry, id };
		this.schedules = this.schedules.filter((item) => item.id !== id);
		this.schedules.push(newEntry);
		await this.persist();
		this.events.trigger("change");
		return newEntry;
	}

	async remove(id: string): Promise<void> {
		this.schedules = this.schedules.filter((item) => item.id !== id);
		await this.persist();
		this.events.trigger("change");
	}

	onChange(callback: () => void): EventRef {
		return this.events.on("change", callback);
	}

	offChange(ref: EventRef) {
		this.events.offref(ref);
	}

	private async persist(): Promise<void> {
		await this.app.vault.adapter.write(this.scheduleFile, JSON.stringify(this.schedules, null, 2));
	}

	private createId(): string {
		return `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}
}
