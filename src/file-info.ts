export abstract class FileInfo {
  originalFile: File;
  keys: string[] = [];
  directories: string[] = [];
  journal: JournalEntry | null = null;
  extension: string | null = null;

  abstract getLinkRegex(): RegExp[];

  constructor(file: File) {
    this.originalFile = file;
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
    this.directories.shift(); // Remove root folder name
    this.directories.pop(); // Remove file name
    for (let i = 0; i < this.directories.length; i++) {
      const prefixes = this.directories.slice(i);
      prefixes.push(fileName);
      this.keys.push(prefixes.join('/'));
    }
  }

  isHidden(): boolean {
    return this.originalFile.webkitRelativePath.split('/').filter((s) => s[0] === '.').length > 0;
  }

  isCanvas(): boolean {
    return this.extension === 'canvas';
  }
}

export class MDFileInfo extends FileInfo {
  fileNameNoExt: string;
  links: string[] = [];
  foundryTag: string;

  constructor(file: File) {
    super(file);
    const nameParts = file.name.split('.');
    this.fileNameNoExt = nameParts[0];
    this.createKeys(this.fileNameNoExt);
    this.foundryTag = `@JournalEntry[${this.fileNameNoExt}]`;
  }

  getLinkRegex(): RegExp[] {
    return this.keys.map((k) => new RegExp(`\\[\\[${k}(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
  }
}

export class OtherFileInfo extends FileInfo {
  uploadPath: string | null = null;
  imgElement: HTMLElement | null = null;

  constructor(file: File) {
    super(file);
    this.createKeys(file.name);
  }

  getLinkRegex(): RegExp[] {
    return this.keys.map((k) => new RegExp(`!\\[\\[${k}(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
  }
}
