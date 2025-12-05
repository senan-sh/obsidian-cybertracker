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
}

export type TimerStatus = "running" | "paused" | "stopped";

export interface TimerSession {
	id: string;
	taskName: string;
	startedAt: number;
	elapsedMs: number;
	status: TimerStatus;
	stoppedAt?: number;
}
