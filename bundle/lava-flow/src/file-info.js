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
		// return this.keys.map((k) => new RegExp(`!?\\[\\[${k}(#[^\\]\\|]*)?(\\s*\\|[^\\]]*)?\\]\\]`, 'gi'));
		return this.keys.map((k) => new RegExp(`!?\\[\\[(${k})?(#[^\\|\\]]*)?(\\|[^\\]]*)?\\]\\]`, 'gi'));
		// !?\[\[(${k})?(#[^\|\]]*)?(\|[^\]]*)?\]\]
		// matches all obsidian links, including current page header links.
	}
	getLink(linkMatch = null) {
		if (linkMatch === null)
			return null; // if we didn't find a match, but somehow we're here, we don't want to accidently override the link
		let link = '@UUID[';
		if (linkMatch[1] !== undefined) { // we have a link to a page
			link = `${link}JournalEntry.${this.journal?.id ?? ''}`;
		}
		if (linkMatch[2] !== undefined && linkMatch[1] == undefined) { // we have a link to a current page header
			console.log(`Lava Flow | Found current page header ${linkMatch[2]}`);
			// @ts-expect-error
			console.log(`Lava Flow | current page has page ${this.journal?.pages?.contents[0]?.id}`);
			// no support for pages in foundry vtt types
			// @ts-expect-error
			link = `${link}.${this.journal?.pages?.contents[0]?.id ?? ''}${linkMatch[2].toLowerCase().replace(' ', '-')}]`;
		}
		else if (linkMatch[2] !== undefined) { // we have a header
			console.log(`Lava Flow | Found page header ${linkMatch[2]} for page ${linkMatch[1]}`);
			// no support for pages in foundry vtt types
			// @ts-expect-error
			link = `${link}.JournalEntryPage.${this.journal?.pages?.contents[0]?.id ?? ''}${linkMatch[2].toLowerCase().replace(' ', '-')}]`;
		}
		else { // we don't have a header, but need to close the page link
			link = `${link}]`;
		}
		if (linkMatch[3] !== undefined) { // we have an alias
			link = `${link}{${linkMatch[3].slice(1)}}`;
		}
		else if (linkMatch[2] !== undefined) { // we don't have an alias, but we have a header (use header as alias)
			link = `${link}{${linkMatch[2].slice(1)}}`;
		}
		return link;
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
