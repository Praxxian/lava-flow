var _a;
import { FileInfo, MDFileInfo, OtherFileInfo } from './file-info.js';
import { LavaFlowForm } from './lava-flow-form.js';
import { LavaFlowSettings } from './lava-flow-settings.js';
import { createOrGetFolder } from './util.js';
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export default class LavaFlow {
	static log(msg, notify = false) {
		console.log(LavaFlow.toLogMessage(msg));
		if (notify)
			ui?.notifications?.info(LavaFlow.toLogMessage(msg));
	}
	static errorHandling(e) {
		console.error(LavaFlow.toLogMessage(e.stack));
		ui?.notifications?.error(LavaFlow.toLogMessage('Unexpected error. Please see the console for more details.'));
	}
	static toLogMessage(msg) {
		return `Lava Flow | ${msg}`;
	}
	static isGM() {
		return game.user?.isGM ?? false;
	}
	static createUIElements(html) {
		if (!LavaFlow.isGM())
			return;
		LavaFlow.log('Creating UI elements...', false);
		const className = `${LavaFlow.ID}-btn`;
		const tooltip = game.i18n.localize('LAVA-FLOW.button-label');
		const button = $(`<div class="${LavaFlow.ID}-row action-buttons flexrow"><button class="${className}"><i class="fas fa-upload"></i> ${tooltip}</button></div>`);
		button.on('click', function () {
			LavaFlow.createForm();
		});
		html.find('.header-actions:first-child').after(button);
		LavaFlow.log('Creating UI elements complete.', false);
	}
	static createForm() {
		if (!LavaFlow.isGM())
			return;
		new LavaFlowForm().render(true);
	}
	static async importVault(event, settings) {
		if (!LavaFlow.isGM())
			return;
		LavaFlow.log('Begin import...', true);
		try {
			await this.saveSettings(settings);
			const rootFolder = await createOrGetFolder(settings.rootFolderName);
			const files = [];
			if (settings.vaultFiles == null)
				return;
			for (let i = 0; i < settings.vaultFiles.length; i++) {
				const file = FileInfo.get(settings.vaultFiles[i]);
				if (file.isHidden() || file.isCanvas())
					continue;
				await LavaFlow.importFile(file, settings, rootFolder);
				files.push(file);
			}
			const allJournals = files.filter((f) => f.journal !== null).map((f) => f.journal);
			for (let i = 0; i < files.length; i++)
				await LavaFlow.updateLinks(files[i], allJournals);
			if (settings.createIndexFile || settings.createBacklinks) {
				const mdFiles = files.filter((f) => f instanceof MDFileInfo);
				if (settings.createIndexFile)
					await LavaFlow.createIndexFile(settings, mdFiles, rootFolder);
				if (settings.createBacklinks)
					await LavaFlow.createBacklinks(mdFiles);
			}
			LavaFlow.log('Import complete.', true);
		}
		catch (e) {
			LavaFlow.errorHandling(e);
		}
	}
	static async saveSettings(settings) {
		const savedSettings = new LavaFlowSettings();
		Object.assign(savedSettings, settings);
		await game.user?.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTSETTINGS, savedSettings);
	}
	static async importFile(file, settings, rootFolder) {
		if (file instanceof MDFileInfo) {
			await this.importMarkdownFile(file, settings, rootFolder);
		}
		else if (settings.importNonMarkdown && file instanceof OtherFileInfo) {
			await this.importOtherFile(file, settings);
		}
	}
	static async importMarkdownFile(file, settings, rootFolder) {
		let parentFolder = rootFolder;
		for (let i = 0; i < file.directories.length; i++) {
			const newFolder = await createOrGetFolder(file.directories[i], parentFolder?.id);
			parentFolder = newFolder;
		}
		const journalName = file.fileNameNoExt;
		let journal = game.journal?.find((j) => j.name === journalName && j.folder === parentFolder) ??
			null;
		if (journal !== null && settings.overwrite)
			await LavaFlow.updateJournalFromFile(journal, file);
		else if (journal === null || (!settings.overwrite && !settings.ignoreDuplicate))
			journal = await LavaFlow.createJournalFromFile(journalName, parentFolder, file, settings.playerObserve);
		file.journal = journal;
	}
	static async importOtherFile(file, settings) {
		const source = settings.useS3 ? 's3' : 'data';
		const body = settings.useS3 ? { bucket: settings.s3Bucket } : {};
		const promise = FilePicker.upload(source, settings.mediaFolder, file.originalFile, body);
		let path = `${settings.mediaFolder}/${file.originalFile.name}`;
		path.replace('//', '/');
		if (settings.useS3) {
			if (settings.s3Bucket === null || settings.s3Region === null)
				throw new Error('S3 settings are invalid.');
			path = `https://${settings.s3Bucket}.s3.${settings.s3Region}.amazonaws.com/${path}`;
		}
		file.uploadPath = path;
		await promise;
	}
	static async createIndexFile(settings, files, rootFolder) {
		const indexJournalName = 'Index';
		const indexJournal = game.journal?.find((j) => j.name === indexJournalName && j.folder === rootFolder);
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
		if (indexJournal != null)
			await LavaFlow.updateJournal(indexJournal, content);
		else {
			await LavaFlow.createJournal(indexJournalName, rootFolder, content, settings.playerObserve);
		}
	}
	static getIndexTopDirectory(fileInfo) {
		return fileInfo.directories.length > 1 ? fileInfo.directories[1] : 'Uncatergorized';
	}
	static async createBacklinks(files) {
		for (let i = 0; i < files.length; i++) {
			const fileInfo = files[i];
			if (fileInfo.journal === null)
				continue;
			const backlinkFiles = [];
			for (let j = 0; j < files.length; j++) {
				if (j === i)
					continue;
				const otherFileInfo = files[j];
				// v10 not supported by foundry-vtt-types yet
				// @ts-expect-error
				const page = otherFileInfo.journal?.pages?.contents[0];
				const link = fileInfo.getLink();
				if (page !== undefined && page !== null && link !== null && page.text.markdown.includes(link))
					backlinkFiles.push(otherFileInfo);
			}
			if (backlinkFiles.length > 0) {
				backlinkFiles.sort((a, b) => a.fileNameNoExt.localeCompare(b.fileNameNoExt));
				const backLinkList = backlinkFiles.map((b) => `- ${b.getLink() ?? ''}`).join('\r\n');
				// v10 not supported by foundry-vtt-types yet
				// @ts-expect-error
				const page = fileInfo.journal.pages.contents[0];
				// TODO when v10 types are ready, this cast will be unecessary
				const newText = `${page.text.markdown}\r\n#References\r\n${backLinkList}`;
				page.update({ text: { markdown: newText } });
			}
		}
	}
	static linkMatch(fileInfo, matchFileInfo) {
		if (matchFileInfo !== fileInfo && matchFileInfo instanceof MDFileInfo) {
			const linkPatterns = fileInfo.getLinkRegex();
			for (let i = 0; i < linkPatterns.length; i++) {
				if (matchFileInfo.links.filter((l) => l.match(linkPatterns[i])).length > 0)
					return true;
			}
		}
		return false;
	}
	static decodeHtml(html) {
		const txt = document.createElement('textarea');
		txt.innerHTML = html;
		return txt.value;
	}
	static async createJournalFromFile(journalName, parentFolder, file, playerObserve) {
		const fileContent = await LavaFlow.getFileContent(file);
		return await LavaFlow.createJournal(journalName, parentFolder, fileContent, playerObserve);
	}
	static async createJournal(journalName, parentFolder, content, playerObserve) {
		const entryData = {
			name: journalName,
			folder: parentFolder?.id,
		};
		if (playerObserve && entryData.permission !== undefined && entryData.permission !== null)
			entryData.permission.default = CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER;
		const entry = (await JournalEntry.create(entryData)) ?? new JournalEntry();
		await entry.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.JOURNAL, true);
		// v10 not supported by foundry-vtt-types yet
		// @ts-expect-error
		await JournalEntryPage.create({
			name: journalName,
			text: { markdown: content, format: 2 }, // CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN in v10
		}, { parent: entry });
		const newJournal = (game.journal?.get(entry.id ?? '')) ?? entry;
		return newJournal; // ensuring the page content is returned as well as it's used for link generation
	}
	static async updateJournalFromFile(journal, file) {
		await LavaFlow.updateJournal(journal, await LavaFlow.getFileContent(file));
	}
	static async updateJournal(journal, content) {
		if (journal === undefined || journal === null)
			return;
		// v10 not supported by foundry-vtt-types yet
		// @ts-expect-error
		const page = journal.pages.contents[0];
		await page.update({ text: { markdown: content } });
	}
	static async getFileContent(file) {
		let originalText = await file.originalFile.text();
		if (originalText !== null && originalText.length > 6)
			originalText = originalText.replace(/^---\r?\n([^-].*\r?\n)+---(\r?\n)+/, '');
		return originalText;
	}
	static async updateLinks(fileInfo, allJournals) {
		const linkPatterns = fileInfo.getLinkRegex();
		// scan all created journal entries (via allJournals) for matching references to markdown file fileInfo
		for (let i = 0; i < allJournals.length; i++) {
			// v10 not supported by foundry-vtt-types yet
			// @ts-expect-error
			const comparePage = allJournals[i].pages.contents[0];
			for (let j = 0; j < linkPatterns.length; j++) {
				const linkMatches = comparePage.text.markdown.matchAll(linkPatterns[j]);
				// linkMatches (full link, page, header, alias)
				for (const linkMatch of linkMatches) {
					if (linkMatch[2] !== undefined && linkMatch[1] == undefined && fileInfo.journal?.id != allJournals[i].id) { // current page header
						// link is a current page header link and we're not matching that page
						continue;
						// since we'll match current page headers irrespective of what page we are looking at, skip it if it doesn't match the current page
					}
					let link = fileInfo.getLink(linkMatch);
					if (link === null)
						continue;
					if (fileInfo instanceof OtherFileInfo) {
						const resizeMatches = linkMatch[0].match(/\|\d+(x\d+)?\]/gi);
						if (resizeMatches !== null && resizeMatches.length > 0) {
							const dimensions = resizeMatches[0]
								.replace(/(\||\])/gi, '')
								.toLowerCase()
								.split('x');
							if (dimensions.length === 1)
								dimensions.push('*');
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
_a = LavaFlow;
LavaFlow.ID = 'lava-flow';
LavaFlow.FLAGS = {
	FOLDER: 'lavaFlowFolder',
	JOURNAL: 'lavaFlowJournalEntry',
	SCOPE: 'world',
	LASTSETTINGS: 'lava-flow-last-settings',
};
LavaFlow.TEMPLATES = {
	IMPORTDIAG: `modules/${_a.ID}/templates/lava-flow-import.hbs`,
};
