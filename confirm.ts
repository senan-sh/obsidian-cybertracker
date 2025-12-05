import { App, Modal } from "obsidian";

interface ConfirmOptions {
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
}

/**
 * Lightweight confirmation modal returning a boolean.
 */
export function showConfirm(app: App, options: ConfirmOptions): Promise<boolean> {
	const { title, message, confirmText = "Delete", cancelText = "Cancel" } = options;
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText(title ?? "Confirm");
		modal.contentEl.createEl("p", { text: message });

		const buttons = modal.contentEl.createDiv({ cls: "confirm-buttons" });
		const confirmBtn = buttons.createEl("button", { text: confirmText });
		confirmBtn.onclick = () => {
			resolve(true);
			modal.close();
		};

		const cancelBtn = buttons.createEl("button", { text: cancelText });
		cancelBtn.onclick = () => {
			resolve(false);
			modal.close();
		};

		modal.onClose = () => {
			// If closed without explicit choice, treat as cancel.
			resolve(false);
		};

		modal.open();
	});
}
