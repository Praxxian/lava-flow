export abstract class FileInfo {
  originalFile: File;
  keys: string[] = [];
  directories: string[] = [];
  journal: JournalEntry | null = null;
  extension: string | null = null;
  fileNameNoExt: string;

  abstract getLinkRegex(): RegExp[];
  abstract getLink(alias?: string | null): string | null;

  constructor(file: File) {
    this.originalFile = file;
    const nameParts = file.name.split('.');
    this.fileNameNoExt = nameParts[0];
  }

  static get(file: File): FileInfo {
    const nameParts = file.webkitRelativePath.split('.');
    const extension = nameParts[nameParts.length - 1];
    const fileInfo = extension === 'md' ? new MDFileInfo(file) : new OtherFileInfo(file);
    fileInfo.extension = extension;
    return fileInfo;
  }

  createKeys(fileName: string): void {
    this.directories = this.originalFile.webkitRelativePath.split('/');
    this.directories.pop(); // Remove file name
    for (let i = 0; i < this.directories.length; i++) {
      const prefixes = this.directories.slice(i);
      prefixes.push(fileName);
      this.keys.push(prefixes.join('/'));
    }
    this.keys.push(fileName);
  }

  isHidden(): boolean {
    return this.originalFile.webkitRelativePath.split('/').filter((s) => s[0] === '.').length > 0;
  }

  isCanvas(): boolean {
    return this.extension === 'canvas';
  }
}

export class MDFileInfo extends FileInfo {
  links: string[] = [];

  constructor(file: File) {
    super(file);
    this.createKeys(this.fileNameNoExt);
  }

  getLinkRegex(): RegExp[] {
    // return this.keys.map((k) => new RegExp(`!?\\[\\[${k}(#[^\\]\\|]*)?(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
    return this.keys.map((k) => new RegExp(`!?\\[\\[(${k})?(#[^\\]\\|]*)?(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
    // matches all obsidian links, including current page header links.
  }

  getLink(linkString: string | null = null): string | null {
    if (linkString === null || linkString.length < 1) return this.journal?.link ?? null;
    const linkParts = linkString.split(/[#\|]+/);

    switch (linkParts.length) {
      case 1: // having one part means a link to a page or a link to a header in the current page
        if (linkString.includes('#')) {
          // no support for pages in foundry vtt types
          // @ts-expect-error
          return `@UUID[.${this.journal?.pages?.contents[0]?.id ?? ''}]{${linkParts[0]}}`;
        } else {
          return this.journal?.link ?? null;
        }
      case 2: // having two means a link to a header in a page or a link to a page with an alias
        if (linkString.includes('#')) {
          // no support for pages in foundry vtt types
          // @ts-expect-error
          return `@UUID[JournalEntry.${this.journal?.id ?? ''}.JournalEntryPage.${this.journal?.pages?.contents[0]?.id ?? ''}#${linkParts[1]}]{${linkParts[1]}}`;
        } else if (linkString.includes('|')) {
          return `@UUID[JournalEntry.${this.journal?.id ?? ''}]{${linkParts[1]}}`;
        } else {
          return null;
        }
      case 3: // link to a header in a page with an alias
        // no support for pages in foundry vtt types
        // @ts-expect-error
        return `@UUID[JournalEntry.${this.journal?.id ?? ''}.JournalEntryPage.${this.journal?.pages?.contents[0]?.id ?? ''}#${linkParts[1]}]{${linkParts[2]}}`;
      default:
        return null;
    }
  }
}

export class OtherFileInfo extends FileInfo {
  uploadPath: string | null = null;

  constructor(file: File) {
    super(file);
    this.createKeys(file.name);
  }

  getLinkRegex(): RegExp[] {
    const obsidianPatterns = this.keys.map((k) => new RegExp(`!\\[\\[${k}(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
    const altTextPatterns = this.keys.map((k) => new RegExp(`!\\[[^\\]]+\\]\\(${k}\\)`, 'gi'));
    return obsidianPatterns.concat(altTextPatterns);
  }

  getLink(): string | null {
    return `![${this.originalFile.name}](${encodeURI(this.uploadPath ?? '')})`;
  }
}
