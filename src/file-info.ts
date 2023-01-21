export abstract class FileInfo {
  originalFile: File;
  keys: string[] = [];
  directories: string[] = [];
  journal: JournalEntry | null = null;
  extension: string | null = null;
  fileNameNoExt: string;

  abstract getLinkRegex(): RegExp[];
  abstract getLink(): string | null;

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
    return this.keys.map((k) => new RegExp(`\\[\\[${k}(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
  }

  getLink(): string | null {
    return this.journal?.link ?? null;
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
