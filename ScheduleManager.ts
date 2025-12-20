import { App, EventRef, Events, normalizePath } from "obsidian";
import { ScheduleEntry, ScheduleEntryKind } from "./types";

/**
 * Handles reading and writing scheduled items to per-month JSON files in the vault config folder.
 */
export class ScheduleManager {
	private scheduleDir: string;
	private legacyScheduleFile: string;
	private schedulesByMonth = new Map<string, ScheduleEntry[]>();
	private idToMonth = new Map<string, string>();
	private events = new Events();

	constructor(private app: App) {
		this.scheduleDir = normalizePath(`${app.vault.configDir}/schedule`);
		this.legacyScheduleFile = normalizePath(`${app.vault.configDir}/schedule.json`);
	}

	async load(): Promise<void> {
		await this.ensureDirectory();
		await this.migrateLegacyFile();
		await this.loadAllMonths();
	}

	getAll(): ScheduleEntry[] {
		return Array.from(this.schedulesByMonth.values()).flat();
	}

	getByDate(date: string, kind?: ScheduleEntryKind): ScheduleEntry[] {
		const month = this.monthFromDate(date);
		const entries = (this.schedulesByMonth.get(month) ?? []).filter((item) => item.date === date);
		if (!kind) return entries;
		return entries.filter((item) => this.getEntryKind(item) === kind);
	}

	async add(entry: Omit<ScheduleEntry, "id"> & { id?: string }): Promise<ScheduleEntry> {
		const id = entry.id ?? this.createId();
		const month = this.monthFromDate(entry.date);
		await this.ensureMonthLoaded(month);

		const existingMonth = this.idToMonth.get(id);
		if (existingMonth && existingMonth !== month) {
			this.removeFromMonth(existingMonth, id);
			await this.persistMonth(existingMonth);
		}

		const monthEntries = this.schedulesByMonth.get(month) ?? [];
		const filtered = monthEntries.filter((item) => item.id !== id);
		const newEntry = this.normalizeEntry({ ...entry, id });
		const computedDuration = this.calculateDurationMs(newEntry);
		if (computedDuration !== undefined) {
			newEntry.durationMs = computedDuration;
		}
		filtered.push(newEntry);
		this.schedulesByMonth.set(month, filtered);
		this.idToMonth.set(id, month);

		await this.persistMonth(month);
		this.events.trigger("change");
		return newEntry;
	}

	async remove(id: string): Promise<void> {
		const month = this.idToMonth.get(id) ?? this.findMonthForId(id);
		if (!month) return;
		const removed = this.removeFromMonth(month, id);
		if (!removed) return;
		this.idToMonth.delete(id);
		await this.persistMonth(month);
		this.events.trigger("change");
	}

	onChange(callback: () => void): EventRef {
		return this.events.on("change", callback);
	}

	offChange(ref: EventRef) {
		this.events.offref(ref);
	}

	private async loadAllMonths(): Promise<void> {
		this.schedulesByMonth.clear();
		this.idToMonth.clear();
		const listing = await this.app.vault.adapter.list(this.scheduleDir).catch(() => ({ files: [] as string[], folders: [] as string[] }));
		const monthFiles = (listing.files ?? []).filter((file: string) => file.endsWith(".json"));
		for (const file of monthFiles) {
			await this.loadMonthFile(file);
		}
	}

	private async loadMonthFile(path: string): Promise<void> {
		const monthKey = this.getMonthKeyFromFile(path);
		if (!monthKey) return;
		try {
			const raw = await this.app.vault.adapter.read(path);
			const parsed = this.parseScheduleArray(raw);
			const normalized = parsed.map((entry) => {
				const normalizedEntry = this.normalizeEntry(entry);
				const durationMs = this.calculateDurationMs(normalizedEntry);
				return durationMs !== undefined ? { ...normalizedEntry, durationMs } : normalizedEntry;
			});
			this.schedulesByMonth.set(monthKey, normalized);
			normalized.forEach((entry) => this.idToMonth.set(entry.id, monthKey));
		} catch (err) {
			console.error(`Failed to parse schedule file ${path}`, err);
			this.schedulesByMonth.set(monthKey, []);
		}
	}

	private async ensureMonthLoaded(month: string): Promise<void> {
		if (this.schedulesByMonth.has(month)) return;
		const path = this.getMonthFilePath(month);
		if (await this.app.vault.adapter.exists(path)) {
			await this.loadMonthFile(path);
		} else {
			this.schedulesByMonth.set(month, []);
		}
	}

	private removeFromMonth(month: string, id: string): boolean {
		const entries = this.schedulesByMonth.get(month);
		if (!entries) return false;
		const next = entries.filter((item) => item.id !== id);
		if (next.length === entries.length) return false;
		this.schedulesByMonth.set(month, next);
		return true;
	}

	private findMonthForId(id: string): string | null {
		for (const [month, entries] of this.schedulesByMonth.entries()) {
			if (entries.some((entry) => entry.id === id)) {
				return month;
			}
		}
		return null;
	}

	private async persistMonth(month: string): Promise<void> {
		await this.ensureDirectory();
		const path = this.getMonthFilePath(month);
		const entries = this.schedulesByMonth.get(month) ?? [];
		await this.app.vault.adapter.write(path, JSON.stringify(entries, null, 2));
	}

	private async ensureDirectory(): Promise<void> {
		if (!(await this.app.vault.adapter.exists(this.scheduleDir))) {
			await this.app.vault.adapter.mkdir(this.scheduleDir);
		}
	}

	private async migrateLegacyFile(): Promise<void> {
		const legacyExists = await this.app.vault.adapter.exists(this.legacyScheduleFile);
		if (!legacyExists) return;

		const listing = await this.app.vault.adapter.list(this.scheduleDir).catch(() => ({ files: [], folders: [] }));
		if ((listing.files?.length ?? 0) > 0) return;

		try {
			const raw = await this.app.vault.adapter.read(this.legacyScheduleFile);
			const parsed = this.parseScheduleArray(raw);
			if (!parsed.length) return;
			const grouped = new Map<string, ScheduleEntry[]>();
			parsed.forEach((entry) => {
				const normalizedEntry = this.normalizeEntry(entry);
				const month = this.monthFromDate(normalizedEntry.date);
				const current = grouped.get(month) ?? [];
				const existingIdx = current.findIndex((e) => e.id === normalizedEntry.id);
				if (existingIdx >= 0) {
					current[existingIdx] = normalizedEntry;
				} else {
					current.push(normalizedEntry);
				}
				grouped.set(month, current);
			});

			for (const [month, entries] of grouped) {
				this.schedulesByMonth.set(month, entries);
				entries.forEach((e) => this.idToMonth.set(e.id, month));
				await this.persistMonth(month);
			}

			const legacyBackup = normalizePath(`${this.scheduleDir}/schedule.legacy.json`);
			await this.app.vault.adapter.rename(this.legacyScheduleFile, legacyBackup).catch(() => {});
		} catch (err) {
			console.error("Failed to migrate legacy schedule file", err);
		}
	}

	private parseScheduleArray(raw: string): ScheduleEntry[] {
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return parsed as ScheduleEntry[];
			}
		} catch (err) {
			console.error("Failed to parse schedule data", err);
		}
		return [];
	}

	private calculateDurationMs(entry: ScheduleEntry): number | undefined {
		const logs = entry.logs ?? [];
		if (logs.length) {
			const fromLogs = logs.reduce((acc, log) => {
				if (log.end === undefined || log.end <= log.start) return acc;
				return acc + (log.end - log.start);
			}, 0);
			if (fromLogs > 0) return fromLogs;
		}
		const fromTimes = this.durationFromTimes(entry.startTime, entry.endTime);
		if (fromTimes !== null && fromTimes > 0) return fromTimes;
		return typeof entry.durationMs === "number" && entry.durationMs > 0 ? entry.durationMs : undefined;
	}

	private getEntryKind(entry: ScheduleEntry): ScheduleEntryKind {
		return entry.kind === "planner" ? "planner" : "tracker";
	}

	private normalizeEntry(entry: ScheduleEntry): ScheduleEntry {
		const kind = this.getEntryKind(entry);
		if (entry.kind === kind) return entry;
		return { ...entry, kind };
	}

	private durationFromTimes(start?: string, end?: string): number | null {
		if (!start || !end) return null;
		const startSeconds = this.toSeconds(start);
		const endSeconds = this.toSeconds(end);
		if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) return null;
		return (endSeconds - startSeconds) * 1000;
	}

	private toSeconds(hhmmss: string): number | null {
		const [h, m, s] = hhmmss.split(":").map((v) => Number(v));
		if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
		const sec = Number.isFinite(s) ? s : 0;
		return h * 3600 + m * 60 + sec;
	}

	private getMonthKeyFromFile(path: string): string | null {
		const filename = path.split("/").pop() ?? "";
		const match = filename.match(/^(\d{4}-\d{2})\.json$/);
		return match ? match[1] : null;
	}

	private getMonthFilePath(month: string): string {
		return normalizePath(`${this.scheduleDir}/${month}.json`);
	}

	private monthFromDate(date: string): string {
		return date.slice(0, 7);
	}

	private createId(): string {
		return `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}
}
