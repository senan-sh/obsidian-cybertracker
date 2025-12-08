export type CalendarViewMode = "month" | "week";
export type StartOfWeek = "sunday" | "monday";

export interface PluginSettings {
	defaultView: CalendarViewMode;
	startOfWeek: StartOfWeek;
}

export interface ScheduleEntry {
	id: string;
	date: string; // ISO date string YYYY-MM-DD
	title: string;
	description?: string;
	startTime?: string; // HH:MM
	endTime?: string; // HH:MM
	durationMs?: number;
	logs?: TimerLog[];
}

export type TimerStatus = "running" | "paused" | "stopped";

export interface TimerSession {
	id: string;
	taskName: string;
	logs: TimerLog[];
	status: TimerStatus;
	startedAt?: number;
	stoppedAt?: number;
	/** Legacy support for older saved sessions that stored elapsed instead of logs. */
	elapsedMs?: number;
}

export interface TimerLog {
	start: number;
	end?: number;
}
