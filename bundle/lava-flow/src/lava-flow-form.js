import LavaFlow from './lava-flow.js';
import { LavaFlowSettings } from './lava-flow-settings.js';
export class LavaFlowForm extends FormApplication {
	constructor() {
		super(LavaFlowForm.defaultOptions);
		this.vaultFiles = null;
	}
	static get defaultOptions() {
		const defaults = super.defaultOptions;
		const overrides = {
			height: 500,
			id: `${LavaFlow.ID}-form`,
			template: LavaFlow.TEMPLATES.IMPORTDIAG,
			title: 'Import Obsidian MD Vault',
			importSettings: game.user?.getFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTSETTINGS) ??
				new LavaFlowSettings(),
			classes: [],
			closeOnSubmit: true,
			submitOnChange: false,
			submitOnClose: false,
			editable: true,
			baseApplication: '',
			width: 500,
			top: null,
			left: null,
			popOut: true,
			minimizable: false,
			resizable: true,
			dragDrop: [],
			tabs: [],
			filters: [],
			scrollY: [],
			scale: null,
			sheetConfig: false,
		};
		const mergedOptions = mergeObject(defaults, overrides);
		return mergedOptions;
	}
	async _updateObject(event, formData) {
		formData.vaultFiles = this.vaultFiles;
		await LavaFlow.importVault(event, formData);
	}
	getData(options) {
		return options.importSettings;
	}
	activateListeners(html) {
		const prefix = LavaFlowForm.defaultOptions?.importSettings?.idPrefix ?? '';
		this.setInverseToggle(`#${prefix}overwrite`, `#${prefix}ignoreDuplicateDiv`);
		this.setToggle(`#${prefix}importNonMarkdown`, `#${prefix}nonMarkdownOptions`);
		this.setToggle(`#${prefix}useS3`, `#${prefix}s3Options`);
		const vaultFilesID = `#${prefix}vaultFiles`;
		$(vaultFilesID).on('change', (event) => {
			this.vaultFiles = event.target.files;
		});
	}
	setInverseToggle(checkBoxID, toggleDivID) {
		this.setToggle(checkBoxID, toggleDivID, true);
	}
	setToggle(checkBoxID, toggleDivID, inverse = false) {
		$(checkBoxID).change(function () {
			const checkbox = this;
			$(toggleDivID).toggle((!inverse && checkbox.checked) || (inverse && !checkbox.checked));
		});
	}
}
