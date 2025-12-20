import { Plugin } from "obsidian";
import { CalendarView, VIEW_TYPE_CALENDAR } from "./CalendarView";
import { ScheduleManager } from "./ScheduleManager";
import { StartTimerModal } from "./StartTimerModal";
import { TimeTrackerManager } from "./TimeTrackerManager";
import { TimeTrackerView, VIEW_TYPE_TIMER } from "./TimeTrackerView";
import { DEFAULT_SETTINGS, TimeTrackerSettingTab } from "./settings";
import { PluginSettings } from "./types";

export default class TimeTrackerPlugin extends Plugin {
	scheduleManager: ScheduleManager;
	timeTrackerManager: TimeTrackerManager;
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();
		this.scheduleManager = new ScheduleManager(this.app);
		this.timeTrackerManager = new TimeTrackerManager(this.app, this.scheduleManager);
		await Promise.all([this.scheduleManager.load(), this.timeTrackerManager.load()]);

		this.registerView(
			VIEW_TYPE_CALENDAR,
			(leaf) =>
				new CalendarView(
					leaf,
					{
						getSettings: () => this.settings,
						saveSettings: () => this.saveSettings(),
						openStartTimerModal: () => this.openStartTimerModal(),
					},
					this.scheduleManager
				)
		);
		this.registerView(
			VIEW_TYPE_TIMER,
			(leaf) => new TimeTrackerView(leaf, { openStartModal: () => this.openStartTimerModal() }, this.timeTrackerManager)
		);

		this.addRibbonIcon("calendar-with-checkmark", "Open schedule", () => {
			void this.activateCalendarView();
		});

		this.addCommand({
			id: "open-schedule-calendar",
			name: "Open schedule calendar",
			callback: () => this.activateCalendarView(),
		});

		this.addCommand({
			id: "start-time-tracker",
			name: "Start timer",
			callback: () => this.openStartTimerModal(),
		});

		this.addCommand({
			id: "show-time-tracker",
			name: "Show time tracker sidebar",
			callback: () => this.activateTimeTrackerView(),
		});

		this.addSettingTab(new TimeTrackerSettingTab(this.app, this));

		// Keep the time tracker accessible by default.
		void this.activateTimeTrackerView(false);
	}

	onunload() {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).forEach((leaf) => leaf.detach());
		this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMER).forEach((leaf) => leaf.detach());
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async activateCalendarView() {
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0];
		if (!leaf) {
			leaf = this.app.workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_CALENDAR, active: true });
		} else {
			await this.app.workspace.revealLeaf(leaf);
		}
		return leaf.view as CalendarView;
	}

	private async activateTimeTrackerView(reveal = true) {
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMER)[0];
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_TIMER, active: reveal });
		} else if (reveal) {
			await this.app.workspace.revealLeaf(leaf);
		}
		return leaf.view as TimeTrackerView;
	}

	private openStartTimerModal() {
		const modal = new StartTimerModal(this.app, this.timeTrackerManager, {
			onStart: async () => {
				const view = await this.activateTimeTrackerView(true);
				await view.refresh();
			},
		});
		modal.open();
	}
}
