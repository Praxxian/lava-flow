import LavaFlow from './lava-flow.js';
import { LavaFlowSettings } from './lava-flow-settings.js';

export class LavaFlowForm extends FormApplication {
  constructor() {
    super(LavaFlowForm.defaultOptions);
  }

  static get defaultOptions(): LavaFlowFormOptions {
    const defaults = super.defaultOptions;

    const overrides: LavaFlowFormOptions = {
      height: 600,
      id: `${LavaFlow.ID}-form`,
      template: LavaFlow.TEMPLATES.IMPORTDIAG,
      title: 'Import Obsidian MD Vault',
      importSettings:
        ((game as Game).user?.getFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTSETTINGS) as LavaFlowSettings) ??
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

  vaultFiles: FileList | null = null;

  async _updateObject(event: Event, formData: any): Promise<void> {
    formData.vaultFiles = this.vaultFiles;
    await LavaFlow.importVault(event, formData);
  }

  getData(options: any): any {
    return options.importSettings;
  }

  activateListeners(html: JQuery): void {
    const prefix = LavaFlowForm.defaultOptions?.importSettings?.idPrefix ?? '';

    this.setInverseToggle(`#${prefix}overwrite`, `#${prefix}ignoreDuplicateDiv`);
    this.setToggle(`#${prefix}importNonMarkdown`, `#${prefix}nonMarkdownOptions`);
    this.setToggle(`#${prefix}useS3`, `#${prefix}s3Options`);
    this.setToggle(`#${prefix}combineNotes`, `#${prefix}combineNotesOptions`);

    const vaultFilesID = `#${prefix}vaultFiles`;
    $(vaultFilesID).on('change', (event: any) => {
      this.vaultFiles = event.target.files;
    });
  }

  setInverseToggle(checkBoxID: string, toggleDivID: string): void {
    this.setToggle(checkBoxID, toggleDivID, true);
  }

  setToggle(checkBoxID: string, toggleDivID: string, inverse: boolean = false): void {
    $(checkBoxID).change(function () {
      const checkbox = this as HTMLInputElement;
      $(toggleDivID).toggle((!inverse && checkbox.checked) || (inverse && !checkbox.checked));
    });
  }
}

interface LavaFlowFormOptions extends FormApplicationOptions {
  importSettings?: LavaFlowSettings;
}
