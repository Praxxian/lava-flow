import { FileInfo } from './file-info';

export class FolderInfo {
  name: string;
  files: FileInfo[] = [];
  childFolders: FolderInfo[] = [];

  constructor(name: string) {
    this.name = name;
  }

  getFilesRecursive(): FileInfo[] {
    const allFiles: FileInfo[] = [];
    this.files.forEach((f) => allFiles.push(f));
    this.childFolders.forEach((folder) => folder.getFilesRecursive().forEach((f) => allFiles.push(f)));
    return allFiles;
  }
}
