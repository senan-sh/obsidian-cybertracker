import { App, PluginSettingTab, Setting } from "obsidian";
import { PluginSettings } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
	defaultView: "month",
	startOfWeek: "monday",
	defaultEntryKind: "tracker",
};

interface SettingsHost {
	settings: PluginSettings;
	saveSettings: () => Promise<void>;
}

/**
 * Settings tab for configuring calendar defaults.
 */
export class TimeTrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private host: SettingsHost) {
		super(app, host as any);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Schedule & Time Tracker" });

		new Setting(containerEl)
			.setName("Default calendar view")
			.setDesc("Choose the view opened when the calendar loads.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("month", "Month")
					.addOption("week", "Week")
					.setValue(this.host.settings.defaultView)
					.onChange(async (value) => {
						this.host.settings.defaultView = value as PluginSettings["defaultView"];
						await this.host.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Start of week")
			.setDesc("Determines how weeks are rendered in the calendar.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("monday", "Monday")
					.addOption("sunday", "Sunday")
					.setValue(this.host.settings.startOfWeek)
					.onChange(async (value) => {
						this.host.settings.startOfWeek = value as PluginSettings["startOfWeek"];
						await this.host.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default calendar mode")
			.setDesc("Sets which entries are shown when the calendar opens.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("tracker", "Tracker")
					.addOption("planner", "Planner")
					.setValue(this.host.settings.defaultEntryKind)
					.onChange(async (value) => {
						this.host.settings.defaultEntryKind = value as PluginSettings["defaultEntryKind"];
						await this.host.saveSettings();
					})
			);
	}
}
