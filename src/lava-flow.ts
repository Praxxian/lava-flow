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

      if (settings.vaultFiles == null) return;

      if (settings.importNonMarkdown) {
        await LavaFlow.validateUploadLocation(settings);
      }

      const rootFolder = await createOrGetFolder(settings.rootFolderName);

      const importedFiles: FileInfo[] = [];
      const folderFiles = LavaFlow.groupByFolder(settings.vaultFiles);
      for (const folder in folderFiles) {
        const files = folderFiles[folder];
        await LavaFlow.importFolder(files, settings, rootFolder);
        files.forEach((f) => importedFiles.push(f));
      }

      const allJournals = importedFiles
        .filter((f) => f.journalPage !== null)
        // @ts-expect-error
        .map((f) => f.journalPage) as JournalEntryPage[];
      for (let i = 0; i < importedFiles.length; i++) await LavaFlow.updateLinks(importedFiles[i], allJournals);

      if (settings.createIndexFile || settings.createBacklinks) {
        const mdFiles = importedFiles.filter((f) => f instanceof MDFileInfo) as MDFileInfo[];
        if (settings.createIndexFile) await LavaFlow.createIndexFile(settings, mdFiles, rootFolder);

        if (settings.createBacklinks) await LavaFlow.createBacklinks(mdFiles);
      }

      LavaFlow.log('Import complete.', true);
    } catch (e: any) {
      LavaFlow.errorHandling(e);
    }
  }

  static groupByFolder(fileList: FileList): { [key: string]: FileInfo[] } {
    const folderGroups: { [key: string]: FileInfo[] } = {};
    for (let i = 0; i < fileList.length; i++) {
      const file = FileInfo.get(fileList[i]);
      if (file.isHidden() || file.isCanvas()) continue;
      const folder = file.directories.join('/');
      let fileArr: FileInfo[] = [];
      if (folder in folderGroups) fileArr = folderGroups[folder];
      fileArr.push(file);
      folderGroups[folder] = fileArr;
    }
    return folderGroups;
  }

  static async saveSettings(settings: LavaFlowSettings): Promise<void> {
    const savedSettings = new LavaFlowSettings();
    Object.assign(savedSettings, settings);
    savedSettings.vaultFiles = null;
    await (game as Game).user?.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTSETTINGS, savedSettings);
  }

  static async importFolder(files: FileInfo[], settings: LavaFlowSettings, rootFolder: Folder | null): Promise<void> {
    const hasMDFiles = files.filter((f) => f instanceof MDFileInfo).length > 0;
    const combineFiles = settings.combineNotes && hasMDFiles;

    let parentFolder = rootFolder;
    const directories = files[0].directories;

    if (combineFiles) directories.shift();

    // Only create folders if there's markdown
    let directoryDepth = directories.length;
    if (combineFiles) directoryDepth--;
    if (hasMDFiles) {
      for (let i = 0; i < directoryDepth; i++) {
        const newFolder = await createOrGetFolder(directories[i], parentFolder?.id);
        parentFolder = newFolder;
      }
    }

    let parentJournal: JournalEntry | null = null;

    if (combineFiles && directories.length > 0) {
      const journalName = directories[directories.length - 1];
      parentJournal = await LavaFlow.createJournal(journalName, parentFolder, settings.playerObserve);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.isHidden() || file.isCanvas()) continue;
      await this.importFile(files[i], settings, parentFolder, parentJournal);
    }
  }

  static async importFile(
    file: FileInfo,
    settings: LavaFlowSettings,
    rootFolder: Folder | null,
    parentJournal: JournalEntry | null,
  ): Promise<void> {
    if (file instanceof MDFileInfo) {
      await this.importMarkdownFile(file, settings, rootFolder, parentJournal);
    } else if (settings.importNonMarkdown && file instanceof OtherFileInfo) {
      await this.importOtherFile(file, settings);
    }
  }

  static async importMarkdownFile(
    file: MDFileInfo,
    settings: LavaFlowSettings,
    parentFolder: Folder | null,
    parentJournal: JournalEntry | null,
  ): Promise<void> {
    const pageName = file.fileNameNoExt;
    const journalName = parentJournal?.name ?? pageName;
    const journal: JournalEntry =
      parentJournal ??
      ((game as Game).journal?.find(
        (j: JournalEntry) => j.name === journalName && j.folder === parentFolder,
      ) as JournalEntry) ??
      (await LavaFlow.createJournal(journalName, parentFolder, settings.playerObserve));

    const fileContent = await LavaFlow.getFileContent(file);

    // @ts-expect-error
    let journalPage: JournalEntryPage = journal.pages.find((p: JournalEntryPage) => p.name === pageName) ?? null;

    if (journalPage !== null && settings.overwrite) await LavaFlow.updateJournalPage(journalPage, fileContent);
    else if (journalPage === null || (!settings.overwrite && !settings.ignoreDuplicate))
      journalPage = await LavaFlow.createJournalPage(pageName, fileContent, journal);

    file.journalPage = journalPage;
  }

  static async importOtherFile(file: OtherFileInfo, settings: LavaFlowSettings): Promise<void> {
    const source = settings.useS3 ? 's3' : 'data';
    const body = settings.useS3 ? { bucket: settings.s3Bucket } : {};
    const uploadResponse: any = await FilePicker.upload(source, settings.mediaFolder, file.originalFile, body);
    if (uploadResponse?.path) file.uploadPath = decodeURI(uploadResponse.path);
  }

  static async validateUploadLocation(settings: LavaFlowSettings): Promise<void> {
    if (settings.useS3) {
      if (settings.s3Bucket === null || settings.s3Region === null) throw new Error('S3 settings are invalid.');
    } else {
      try {
        await FilePicker.browse('data', settings.mediaFolder);
        return;
      } catch (error: any) {
        LavaFlow.log(`Error accessing filepath ${settings.mediaFolder}: ${error.message}`, false);
      }

      await FilePicker.createDirectory('data', settings.mediaFolder);
    }
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
        .map((d) => d.journalPage);
      content += `<ul>${journals.map((journal) => `<li>${journal?.link ?? ''}</li>`).join('\n')}</ul>`;
    }
    if (indexJournal != null) await LavaFlow.updateJournalPage(indexJournal, content);
    else {
      const journal = await LavaFlow.createJournal(indexJournalName, rootFolder, settings.playerObserve);
      await LavaFlow.createJournalPage(indexJournalName, content, journal);
    }
  }

  static getIndexTopDirectory(fileInfo: FileInfo): string {
    return fileInfo.directories.length > 1 ? fileInfo.directories[1] : 'Uncatergorized';
  }

  static async createBacklinks(files: MDFileInfo[]): Promise<void> {
    for (let i = 0; i < files.length; i++) {
      const fileInfo = files[i];
      if (fileInfo.journalPage === null) continue;
      const backlinkFiles: MDFileInfo[] = [];
      for (let j = 0; j < files.length; j++) {
        if (j === i) continue;
        const otherFileInfo = files[j];
        const page = otherFileInfo.journalPage?.pages?.contents[0];
        const link = fileInfo.getLink();
        if (page !== undefined && page !== null && link !== null && (page.text.markdown as string).includes(link))
          backlinkFiles.push(otherFileInfo);
      }
      if (backlinkFiles.length > 0) {
        backlinkFiles.sort((a, b) => a.fileNameNoExt.localeCompare(b.fileNameNoExt));
        const backLinkList = backlinkFiles.map((b) => `- ${b.getLink() ?? ''}`).join('\r\n');
        const page = fileInfo.journalPage.pages.contents[0];
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

  static async createJournal(
    journalName: string,
    parentFolder: Folder | null,
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
    return entry;
  }

  private static async createJournalPage(
    pageName: string,
    content: string,
    journalEntry: JournalEntry,
  ): Promise<JournalEntry> {
    // @ts-expect-error
    return JournalEntryPage.create(
      {
        name: pageName,
        text: { markdown: content, format: 2 }, // CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN in v10+
      },
      { parent: journalEntry },
    );
  }

  // @ts-expect-error
  static async updateJournalPage(page: JournalEntryPage, content: string): Promise<void> {
    if (page === undefined || page === null) return;
    await page.update({ text: { markdown: content } });
  }

  static async getFileContent(file: FileInfo): Promise<string> {
    let originalText = await file.originalFile.text();
    if (originalText !== null && originalText.length > 6)
      originalText = originalText.replace(/^---\r?\n([^-].*\r?\n)+---(\r?\n)+/, '');
    originalText = originalText.replace(/^#[0-9A-Za-z]+\b/gm, ' $&');
    return originalText;
  }

  // @ts-expect-error
  static async updateLinks(fileInfo: FileInfo, allPages: JournalEntryPage[]): Promise<void> {
    const linkPatterns = fileInfo.getLinkRegex();
    for (let i = 0; i < allPages.length; i++) {
      const comparePage = allPages[i];

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
          await LavaFlow.updateJournalPage(allPages[i], newContent);
        }
      }
    }
  }
}
