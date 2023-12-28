export class FileInfo {
	constructor(file) {
		this.keys = [];
		this.directories = [];
		this.journal = null;
		this.extension = null;
		this.originalFile = file;
		const nameParts = file.name.split('.');
		this.fileNameNoExt = nameParts[0];
	}
	static get(file) {
		const nameParts = file.webkitRelativePath.split('.');
		const extension = nameParts[nameParts.length - 1];
		const fileInfo = extension === 'md' ? new MDFileInfo(file) : new OtherFileInfo(file);
		fileInfo.extension = extension;
		return fileInfo;
	}
	createKeys(fileName) {
		this.directories = this.originalFile.webkitRelativePath.split('/');
		this.directories.pop(); // Remove file name
		for (let i = 0; i < this.directories.length; i++) {
			const prefixes = this.directories.slice(i);
			prefixes.push(fileName);
			this.keys.push(prefixes.join('/'));
		}
		this.keys.push(fileName);
	}
	isHidden() {
		return this.originalFile.webkitRelativePath.split('/').filter((s) => s[0] === '.').length > 0;
	}
	isCanvas() {
		return this.extension === 'canvas';
	}
}
export class MDFileInfo extends FileInfo {
	constructor(file) {
		super(file);
		this.links = [];
		this.createKeys(this.fileNameNoExt);
	}
	getLinkRegex() {
		return this.keys.map((k) => new RegExp(`!?\\[\\[${k}(#[^\\]\\|]*)?(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
	}
	getLink(alias = null) {
		if (alias === null || alias.length < 1)
			return this.journal?.link ?? null;
		else
			return `@UUID[JournalEntry.${this.journal?.id ?? ''}]{${alias}}`;
	}
}
export class OtherFileInfo extends FileInfo {
	constructor(file) {
		super(file);
		this.uploadPath = null;
		this.createKeys(file.name);
	}
	getLinkRegex() {
		const obsidianPatterns = this.keys.map((k) => new RegExp(`!\\[\\[${k}(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
		const altTextPatterns = this.keys.map((k) => new RegExp(`!\\[[^\\]]+\\]\\(${k}\\)`, 'gi'));
		return obsidianPatterns.concat(altTextPatterns);
	}
	getLink() {
		return `![${this.originalFile.name}](${encodeURI(this.uploadPath ?? '')})`;
	}
}
