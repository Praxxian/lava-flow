import { FileInfo, MDFileInfo, OtherFileInfo } from './file-info.js';
import { LavaFlowForm } from './lava-flow-form.js';
import { LavaFlowSettings } from './lava-flow-settings.js';
import { createOrGetFolder } from './util.js';
import { JournalEntryDataConstructorData } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/journalEntryData';

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class LavaFlow {
  static ID = 'lava-flow';

  static FLAGS = {
    FOLDER: 'lavaFlowFolder',
    JOURNAL: 'lavaFlowJournalEntry',
    SCOPE: 'world',
    LASTSETTINGS: 'lava-flow-last-settings',
  };

  static TEMPLATES = {
    IMPORTDIAG: `modules/${this.ID}/templates/lava-flow-import.hbs`,
  };

  static log(msg: string, notify: boolean = false): void {
    console.log(LavaFlow.toLogMessage(msg));
    if (notify) ui?.notifications?.info(LavaFlow.toLogMessage(msg));
  }

  static errorHandling(e: any): void {
    console.error(LavaFlow.toLogMessage(e.stack));
    ui?.notifications?.error(LavaFlow.toLogMessage('Unexpected error. Please see the console for more details.'));
  }

  static toLogMessage(msg: string): string {
    return `Lava Flow | ${msg}`;
  }

  static isGM(): boolean {
    return (game as Game).user?.isGM ?? false;
  }

  static createUIElements(html: JQuery): void {
    if (!LavaFlow.isGM()) return;

    LavaFlow.log('Creating UI elements...', false);
    const className = `${LavaFlow.ID}-btn`;
    const tooltip = (game as Game).i18n.localize('LAVA-FLOW.button-label');
    const button = $(
      `<div class="${LavaFlow.ID}-row action-buttons flexrow"><button class="${className}"><i class="fas fa-upload"></i> ${tooltip}</button></div>`,
    );
    button.on('click', function () {
      LavaFlow.createForm();
    });
    html.find('.header-actions:first-child').after(button);
    LavaFlow.log('Creating UI elements complete.', false);
  }

  static createForm(): void {
    if (!LavaFlow.isGM()) return;
    new LavaFlowForm().render(true);
  }

  static async importVault(event: Event, settings: LavaFlowSettings): Promise<void> {
    if (!LavaFlow.isGM()) return;
    LavaFlow.log('Begin import...', true);

    try {
      await this.saveSettings(settings);
      const rootFolder = await createOrGetFolder(settings.rootFolderName);
      const files: FileInfo[] = [];
      if (settings.vaultFiles == null) return;
      for (let i = 0; i < settings.vaultFiles.length; i++) {
        const file = FileInfo.get(settings.vaultFiles[i]);
        if (file.isHidden() || file.isCanvas()) continue;
        await LavaFlow.importFile(file, settings, rootFolder);
        files.push(file);
      }

      const allJournals = files.filter((f) => f.journal !== null).map((f) => f.journal) as JournalEntry[];
      for (let i = 0; i < files.length; i++) await LavaFlow.updateLinks(files[i], allJournals);

      if (settings.createIndexFile || settings.createBacklinks) {
        const mdFiles = files.filter((f) => f instanceof MDFileInfo) as MDFileInfo[];
        if (settings.createIndexFile) await LavaFlow.createIndexFile(settings, mdFiles, rootFolder);

        if (settings.createBacklinks) await LavaFlow.createBacklinks(mdFiles);
      }

      LavaFlow.log('Import complete.', true);
    } catch (e: any) {
      LavaFlow.errorHandling(e);
    }
  }

  static async saveSettings(settings: LavaFlowSettings): Promise<void> {
    const savedSettings = new LavaFlowSettings();
    Object.assign(savedSettings, settings);
    await (game as Game).user?.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTSETTINGS, savedSettings);
  }

  static async importFile(file: FileInfo, settings: LavaFlowSettings, rootFolder: Folder | null): Promise<void> {
    if (file instanceof MDFileInfo) {
      await this.importMarkdownFile(file, settings, rootFolder);
    } else if (settings.importNonMarkdown && file instanceof OtherFileInfo) {
      await this.importOtherFile(file, settings);
    }
  }

  static async importMarkdownFile(
    file: MDFileInfo,
    settings: LavaFlowSettings,
    rootFolder: Folder | null,
  ): Promise<void> {
    let parentFolder = rootFolder;
    let initIndex = (settings.createRootFolder) ? 0 : 1
    for (let i = initIndex; i < file.directories.length; i++) {
      const newFolder = await createOrGetFolder(file.directories[i], parentFolder?.id);
      parentFolder = newFolder;
    }
    const journalName = file.fileNameNoExt;
    let journal =
      ((game as Game).journal?.find((j) => j.name === journalName && j.folder === parentFolder) as JournalEntry) ??
      null;

    if (journal !== null && settings.overwrite) await LavaFlow.updateJournalFromFile(journal, file);
    else if (journal === null || (!settings.overwrite && !settings.ignoreDuplicate))
      journal = await LavaFlow.createJournalFromFile(journalName, parentFolder, file, settings.playerObserve);

    file.journal = journal;
  }

  static async importOtherFile(file: OtherFileInfo, settings: LavaFlowSettings): Promise<void> {
    const source = settings.useS3 ? 's3' : 'data';
    const body = settings.useS3 ? { bucket: settings.s3Bucket } : {};
    const promise = FilePicker.upload(source, settings.mediaFolder, file.originalFile, body);
    let path = `${settings.mediaFolder}/${file.originalFile.name}`;
    path.replace('//', '/');
    if (settings.useS3) {
      if (settings.s3Bucket === null || settings.s3Region === null) throw new Error('S3 settings are invalid.');
      path = `https://${settings.s3Bucket}.s3.${settings.s3Region}.amazonaws.com/${path}`;
    }
    file.uploadPath = path;
    await promise;
  }

  static async createIndexFile(
    settings: LavaFlowSettings,
    files: FileInfo[],
    rootFolder: Folder | null,
  ): Promise<void> {
    const indexJournalName = 'Index';
    const indexJournal = (game as Game).journal?.find((j) => j.name === indexJournalName && j.folder === rootFolder);
    const mdDictionary = files.filter((d) => d instanceof MDFileInfo);
    const directories = [...new Set(mdDictionary.map((d) => LavaFlow.getIndexTopDirectory(d)))];
    directories.sort();
    let content = '';
    for (let j = 0; j < directories.length; j++) {
      content += `<h1>${directories[j]}</h1>`;
      const journals = mdDictionary
        .filter((d) => LavaFlow.getIndexTopDirectory(d) === directories[j])
        .map((d) => d.journal);
      content += `<ul>${journals.map((journal) => `<li>${journal?.link ?? ''}</li>`).join('\n')}</ul>`;
    }
    if (indexJournal != null) await LavaFlow.updateJournal(indexJournal, content);
    else {
      await LavaFlow.createJournal(indexJournalName, rootFolder, content, settings.playerObserve);
    }
  }

  static getIndexTopDirectory(fileInfo: FileInfo): string {
    return fileInfo.directories.length > 1 ? fileInfo.directories[1] : 'Uncatergorized';
  }

  static async createBacklinks(files: MDFileInfo[]): Promise<void> {
    for (let i = 0; i < files.length; i++) {
      const fileInfo = files[i];
      if (fileInfo.journal === null) continue;
      const backlinkFiles: MDFileInfo[] = [];
      for (let j = 0; j < files.length; j++) {
        if (j === i) continue;
        const otherFileInfo = files[j];
        // v10 not supported by foundry-vtt-types yet
        // @ts-expect-error
        const page = otherFileInfo.journal?.pages?.contents[0];
        const link = fileInfo.getLink();
        if (page !== undefined && page !== null && link !== null && (page.text.markdown as string).includes(link))
          backlinkFiles.push(otherFileInfo);
      }
      if (backlinkFiles.length > 0) {
        backlinkFiles.sort((a, b) => a.fileNameNoExt.localeCompare(b.fileNameNoExt));
        const backLinkList = backlinkFiles.map((b) => `- ${b.getLink() ?? ''}`).join('\r\n');
        // v10 not supported by foundry-vtt-types yet
        // @ts-expect-error
        const page = fileInfo.journal.pages.contents[0];
        // TODO when v10 types are ready, this cast will be unecessary
        const newText = `${page.text.markdown as string}\r\n#References\r\n${backLinkList}`;
        page.update({ text: { markdown: newText } });
      }
    }
  }

  static linkMatch(fileInfo: FileInfo, matchFileInfo: FileInfo): boolean {
    if (matchFileInfo !== fileInfo && matchFileInfo instanceof MDFileInfo) {
      const linkPatterns = fileInfo.getLinkRegex();
      for (let i = 0; i < linkPatterns.length; i++) {
        if (matchFileInfo.links.filter((l) => l.match(linkPatterns[i])).length > 0) return true;
      }
    }
    return false;
  }

  static decodeHtml(html: string): string {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
  }

  static async createJournalFromFile(
    journalName: string,
    parentFolder: Folder | null,
    file: FileInfo,
    playerObserve: boolean,
  ): Promise<JournalEntry> {
    const fileContent = await LavaFlow.getFileContent(file);
    return await LavaFlow.createJournal(journalName, parentFolder, fileContent, playerObserve);
  }

  static async createJournal(
    journalName: string,
    parentFolder: Folder | null,
    content: string,
    playerObserve: boolean,
  ): Promise<JournalEntry> {
    const entryData: JournalEntryDataConstructorData = {
      name: journalName,
      folder: parentFolder?.id,
    };
    if (playerObserve && entryData.permission !== undefined && entryData.permission !== null)
      entryData.permission.default = CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER;

    const entry = (await JournalEntry.create(entryData)) ?? new JournalEntry();
    await entry.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.JOURNAL, true);

    // v10 not supported by foundry-vtt-types yet
    // @ts-expect-error
    await JournalEntryPage.create(
      {
        name: journalName,
        text: { markdown: content, format: 2 }, // CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN in v10
      },
      { parent: entry },
    );
    return entry;
  }

  static async updateJournalFromFile(journal: JournalEntry, file: FileInfo): Promise<void> {
    await LavaFlow.updateJournal(journal, await LavaFlow.getFileContent(file));
  }

  static async updateJournal(journal: JournalEntry, content: string): Promise<void> {
    if (journal === undefined || journal === null) return;
    // v10 not supported by foundry-vtt-types yet
    // @ts-expect-error
    const page = journal.pages.contents[0];
    await page.update({ text: { markdown: content } });
  }

  static async getFileContent(file: FileInfo): Promise<string> {
    let originalText = await file.originalFile.text();
    if (originalText !== null && originalText.length > 6)
      originalText = originalText.replace(/^---\r?\n([^-].*\r?\n)+---(\r?\n)+/, '');
    return originalText;
  }

  static async updateLinks(fileInfo: FileInfo, allJournals: JournalEntry[]): Promise<void> {
    const linkPatterns = fileInfo.getLinkRegex();
    for (let i = 0; i < allJournals.length; i++) {
      // v10 not supported by foundry-vtt-types yet
      // @ts-expect-error
      const comparePage = allJournals[i].pages.contents[0];

      for (let j = 0; j < linkPatterns.length; j++) {
        const pattern = linkPatterns[j];
        const linkMatches = (comparePage.text.markdown as string).matchAll(pattern);
        if (linkMatches === null) continue;
        for (const linkMatch of linkMatches) {
          const alias = (linkMatch[2] ?? '|').split('|')[1].trim();
          let link = fileInfo.getLink(alias);
          if (link === null) continue;
          if (fileInfo instanceof OtherFileInfo) {
            const resizeMatches = linkMatch[0].match(/\|\d+(x\d+)?\]/gi);
            if (resizeMatches !== null && resizeMatches.length > 0) {
              const dimensions = resizeMatches[0]
                .replace(/(\||\])/gi, '')
                .toLowerCase()
                .split('x');
              if (dimensions.length === 1) dimensions.push('*');
              const dimensionsString = dimensions.join('x');
              link = link.replace(/\)$/gi, ` =${dimensionsString})`);
            }
          }
          const newContent = comparePage.text.markdown.replace(linkMatch[0], link);
          await LavaFlow.updateJournal(allJournals[i], newContent);
        }
      }
    }
  }
}
