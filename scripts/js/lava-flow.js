Hooks.on("renderSidebarTab", function (app, html) {
    try {
        LavaFlow.createUIElements(app, html);
    }
    catch (e) {
        LavaFlow.errorHandling(e);
    }
});

class LavaFlow {
    static ID = 'lava-flow';

    static FLAGS = {
        FOLDER: 'lavaFlowFolder',
        JOURNAL: 'lavaFlowJournalEntry',
        SCOPE: 'world',
        LASTSETTINGS: 'lava-flow-last-settings'
    }

    static TEMPLATES = {
        IMPORTDIAG: `modules/${this.ID}/templates/lava-flow-import.hbs`
    }

    static log(msg, notify) {
        console.log(LavaFlow.toLogMessage(msg));
        if (notify)
            ui.notifications.info(LavaFlow.toLogMessage(msg));
    }

    static errorHandling(e) {
        console.error(LavaFlow.toLogMessage(e));
        ui.notifications.error(LavaFlow.toLogMessage(e));
    }

    static toLogMessage(obj) {
        return "Lava Flow | " + obj;
    }

    static createUIElements(app, html) {
        if (!game.user.isGM || app.options.id != "journal")
            return;

        LavaFlow.log("Creating UI elements...", false);
        const className = `${LavaFlow.ID}-btn`;
        const tooltip = game.i18n.localize('LAVA-FLOW.button-label');
        let button = $(`<div class="${LavaFlow.ID}-row action-buttons flexrow"><button class="${className}"><i class="fas fa-upload"></i> ${tooltip}</button></div>`);
        button.click(function () {
            LavaFlow.createForm();
        });
        html.find(".directory-header").prepend(button);
        LavaFlow.log("Creating UI elements complete.", false);
    }

    static createForm() {
        if (!game.user.isGM)
            return;
        new LavaFlowConfig().render(true);
    }

    static async importVault(event, settings) {
        if (!game.user.isGM)
            return;
        LavaFlow.log("Begin import...", true);
        this.saveSettings(settings);
        let rootFolder = await LavaFlow.createOrGetFolder(settings.rootFolderName, null);
        let linkDictionary = [];
        for (let i = 0; i < settings.vaultFiles.length; i++) {
            let fileJournalPair = await LavaFlow.importFile(settings.vaultFiles[i], settings, rootFolder);
            if (fileJournalPair)
                linkDictionary.push(fileJournalPair);
        }

        let allJournals = linkDictionary.map(d => d ? d.journal : null);
        for (let i = 0; i < linkDictionary.length; i++) {
            let replaceLink = linkDictionary[i]?.journal?.link;
            let fileInfo = linkDictionary[i].fileInfo;
            if (fileInfo instanceof OtherFileInfo)
                replaceLink = fileInfo.imgElement;
            if (replaceLink)
                await LavaFlow.updateLinks(fileInfo, replaceLink, allJournals);
        }

        if (settings.createIndexFile)
            await LavaFlow.createIndexFile(settings, linkDictionary, rootFolder);

        if (settings.createBacklinks)
            await LavaFlow.createBacklinks(linkDictionary.filter(d => d.fileInfo instanceof MDFileInfo));

        LavaFlow.log("Import complete.", true);
    }

    static async saveSettings(settings) {
        let savedSettings = new LavaFlowSettings();
        Object.assign(savedSettings, settings);
        savedSettings.vaultFiles = [];
        game.user.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTSETTINGS, savedSettings);
    }

    static async createIndexFile(settings, linkDictionary, rootFolder) {
        const indexJournalName = "Index";
        let indexJournal = game.journal.find(j => j.name == indexJournalName && j.data.folder == rootFolder?.id);
        let mdDictionary = linkDictionary.filter(d => d.fileInfo instanceof MDFileInfo);
        let directories = [...new Set(mdDictionary.map(d => LavaFlow.getIndexTopDirectory(d)))];
        directories.sort();
        let content = "";
        for (let j = 0; j < directories.length; j++) {
            content += `<h1>${directories[j]}</h1>`;
            let journals = mdDictionary.filter(d => LavaFlow.getIndexTopDirectory(d) == directories[j]).map(d => d.journal);
            content += "<ul>" + journals.map(j => `<li>${j.link}</li>`).join('\n') + "</ul>";
        }
        if (indexJournal)
            await LavaFlow.updateJournal(indexJournal, content);
        else
            await LavaFlow.createJournal(indexJournalName, rootFolder, content, settings.playerObserve);
    }

    static getIndexTopDirectory(linkDictionaryEntry) {
        return linkDictionaryEntry.fileInfo.directories.length > 0 ? linkDictionaryEntry.fileInfo.directories[0] : "Uncatergorized"
    }

    static async createBacklinks(linkDictionary) {
        for (let i = 0; i < linkDictionary.length; i++) {
            let fileInfo = linkDictionary[i].fileInfo;
            let journal = linkDictionary[i].journal;

            let linkedJournals = linkDictionary.filter(d => d != linkDictionary[i]
                && d.fileInfo.links.filter(l => l.match(fileInfo.getLinkRegex())).length > 0)
                .map(d => d.journal);

            if (linkedJournals.length > 0) {
                let newContent = journal.data.content + `\r\n<h1>References</h1>\r\n<ul>${linkedJournals.map(j => '<li>' + j.link + '</li>').join('\r\n')}<ul>`;
                await LavaFlow.updateJournal(journal, newContent);
            }
        }
    }

    static async createOrGetFolder(folderName, parentFolderID) {
        let folder = await LavaFlow.getFolder(folderName, parentFolderID);
        if (!folder && folderName && folderName != "")
            folder = await LavaFlow.createFolder(folderName, parentFolderID);
        return folder;
    }

    static getFolder(folderName, parentFolderID) {
        return new Promise(resolve => {
            let folder = game.folders.find(f => f.data.name == folderName && f.data.type == "JournalEntry" && f.data.parent == parentFolderID);
            resolve(folder);
        });
    }

    static async createFolder(folderName, parentFolderID) {
        let folder = await Folder.create({ name: folderName, type: "JournalEntry", parent: parentFolderID });
        folder.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.FOLDER, true);
        return folder;
    }

    static async importFile(file, settings, rootFolder) {
        if (!file || file.webkitRelativePath.includes(".obsidian") || file.webkitRelativePath.includes(".trash"))
            return;
        let fileNameParts = file.name.split('.');
        let fileExtension = fileNameParts[fileNameParts.length - 1].toLowerCase();
        if (fileExtension == "md")
            return await this.importMarkdownFile(file, settings, rootFolder);
        else if (settings.importNonMarkdown)
            return this.importOtherFile(file, settings);
        return;
    }

    static async importMarkdownFile(file, settings, rootFolder) {
        let fileInfo = new MDFileInfo(file?.webkitRelativePath);
        let parentFolder = rootFolder;
        for (let i = 0; i < fileInfo.directories.length; i++) {
            let newFolder = await LavaFlow.createOrGetFolder(fileInfo.directories[i], parentFolder?.id);
            parentFolder = newFolder;
        }
        let journalName = fileInfo.fileNameNoExt;
        let journal = game.journal.find(j => j.name == journalName && j.data.folder == parentFolder?.id);
        if (!journal)
            journal = await LavaFlow.createJournalFromFile(journalName, parentFolder, file, settings.playerObserve);
        else if (settings.overwrite)
            await LavaFlow.updateJournalFromFile(journal, file);
        else if (!settings.ignoreDuplicate)
            await LavaFlow.updateJournalFromFile(journal, file);

        if (settings.createBacklinks) {
            const linkRegex = new RegExp('(\\[\\[[^\\]]+\\]\\])', 'g');
            let regexMatches = [...journal.data.content.matchAll(linkRegex)];
            let matches = [...new Set(regexMatches.map(m => LavaFlow.decodeHtml(m[0])))];
            fileInfo.links = matches;
        }

        return { fileInfo: fileInfo, journal: journal };
    }

    static async importOtherFile(file, settings) {
        let source = settings.useS3 ? "s3" : "data";
        let body = settings.useS3 ? { bucket: settings.s3Bucket } : {};
        FilePicker.upload(source, settings.mediaFolder, file, body);
        let path = `${settings.mediaFolder}/${file.name}`;
        path.replace('//', '/');
        if (settings.useS3)
            path = "https://" + settings.s3Bucket + ".s3." + settings.s3Region + ".amazonaws.com/" + path;
        let fileInfo = new OtherFileInfo(file.webkitRelativePath, path);
        return { fileInfo: fileInfo };
    }

    static decodeHtml(html) {
        let txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    static async createJournalFromFile(journalName, parentFolder, file, playerObserve) {
        let fileContent = await LavaFlow.getFileContent(file);
        return LavaFlow.createJournal(journalName, parentFolder, fileContent, playerObserve);
    }

    static async createJournal(journalName, parentFolder, content, playerObserve) {
        let entryData = { name: journalName, folder: parentFolder?.id, content: content, permission: {} };
        if (playerObserve)
            entryData.permission["default"] = CONST.ENTITY_PERMISSIONS.OBSERVER
        let entry = await JournalEntry.create(entryData);
        entry.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.JOURNAL, true);
        return entry;
    }

    static async updateJournalFromFile(journal, file) {
        await LavaFlow.updateJournal(journal, await LavaFlow.getFileContent(file));
    }

    static async updateJournal(journal, content) {
        await journal.update({ content: content });
    }

    static async getFileContent(file) {
        let markdown = await file.text();
        let converter = new showdown.Converter({
            tables: true,
            tablesHeaderId: true,
            strikethrough: true,
            tasklists: true
        });
        return converter.makeHtml(markdown);
    }
    
    static async updateLinks(fileInfo, replacementLink, allJournals) {
        let linkRegex = fileInfo.getLinkRegex();

        for (let i = 0; i < allJournals.length; i++) {
            let compareJournal = allJournals[i];
            if (!compareJournal)
                continue;

            let newContent = compareJournal.data.content.replace(linkRegex, replacementLink);
            if (newContent != compareJournal.data.content)
                await LavaFlow.updateJournal(compareJournal, newContent);
        }
    }
}

class LavaFlowSettings {
    rootFolderName = null
    vaultFiles = []
    imageDirectory = null
    overwrite = true
    ignoreDuplicate = false
    idPrefix = LavaFlow.ID + "-"
    playerObserve = false
    createIndexFile = false
    createBacklinks = true
    importNonMarkdown = true
    useS3 = false
    s3Bucket = null
    s3Region = null
    mediaFolder = null
}

class LavaFlowConfig extends FormApplication {
    static get defaultOptions() {
        const defaults = super.defaultOptions;

        const overrides = {
            height: '500px',
            id: `${LavaFlow.ID}-form`,
            template: LavaFlow.TEMPLATES.IMPORTDIAG,
            title: 'Import Obsidian MD Vault',
            importSettings: game.user.getFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTSETTINGS) ?? new LavaFlowSettings()
        };

        const mergedOptions = foundry.utils.mergeObject(defaults, overrides);

        return mergedOptions;
    }

    vaultFiles = [];

    async _updateObject(event, formData) {
        formData.vaultFiles = this.vaultFiles;
        LavaFlow.importVault(event, formData);
    }

    getData(options) {
        return options.importSettings;
    }

    activateListeners(html) {
        let prefix = LavaFlowConfig.defaultOptions.importSettings.idPrefix;

        this.setInverseToggle(`#${prefix}overwrite`, `#${prefix}ignoreDuplicateDiv`);
        this.setToggle(`#${prefix}importNonMarkdown`, `#${prefix}nonMarkdownOptions`);
        this.setToggle(`#${prefix}useS3`, `#${prefix}s3Options`);

        let vaultFilesID = `#${prefix}vaultFiles`;
        let config = this;
        $(vaultFilesID).change(function (event) {
            config.vaultFiles = event.target.files;
        });
    }

    setInverseToggle(checkBoxID, toggleDivID) {
        $(checkBoxID).change(function () {
            $(toggleDivID).toggle(!this.checked);
        });
    }

    setToggle(checkBoxID, toggleDivID) {
        $(checkBoxID).change(function () {
            $(toggleDivID).toggle(this.checked);
        });
    }
}

class MDFileInfo {
    filePath = null
    directories = []
    fileNameNoExt = null
    fileExtension = null
    fullKey = null
    links = []

    constructor(filePath) {
        if (!filePath)
            return;

        this.filePath = filePath;

        let pathParts = filePath.split("/");
        pathParts.shift(); // Remove vault folder name
        let fileNameWithExt = pathParts[pathParts.length - 1];
        pathParts.pop(); // Remove fileName;
        this.directories = pathParts;

        const separator = '.';
        let parts = fileNameWithExt.split(separator);
        this.fileExtension = parts[parts.length - 1];
        parts.pop();
        this.fileNameNoExt = parts.join(separator);

        this.fullKey = `${this.directories.join('/')}/${this.fileNameNoExt}`;
    }

    getLinkRegex() {
        return new RegExp(`\\[\\[([^\\/\\]]+\\/)*${this.fileNameNoExt}(\\s*\\|[^\\]]*)?\\]\\]`, 'gi');
    }
}

class OtherFileInfo {
    originalFilePath = null
    uploadPath = null
    imgElement = null

    constructor(originalFilePath, uploadPath) {
        this.originalFilePath = originalFilePath;
        this.uploadPath = uploadPath;
        this.imgElement = `<img src="${this.uploadPath}">`;
    }

    getLinkRegex() {
        return new RegExp(`!\\[\\[${this.originalFilePath}(\\s*\\|[^\\]]*)?\\]\\]`, 'gi');
    }
}
