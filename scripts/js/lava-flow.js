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
        LASTFOLDER: 'lava-flow-last-folder'
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
        game.user.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTFOLDER, settings.rootFolderName);
        let rootFolder = await LavaFlow.createOrGetFolder(settings.rootFolderName, null);
        let linkDictionary = [];
        for (let i = 0; i < settings.vaultFiles.length; i++) {
            var fileJournalPair = await LavaFlow.importFile(settings.vaultFiles[i], settings, rootFolder);
            if (fileJournalPair)
                linkDictionary.push(fileJournalPair);
        }

        let allJournals = linkDictionary.map(d => d ? d.journal : null);
        for (let i = 0; i < linkDictionary.length; i++) {
            if (!linkDictionary[i])
                continue;
            await LavaFlow.updateLinks(linkDictionary[i].fileInfo, linkDictionary[i].journal, allJournals);
        }

        if (settings.createIndexFile)
            await LavaFlow.createIndexFile(settings, linkDictionary, rootFolder);

        if (settings.createBacklinks)
            await LavaFlow.createBacklinks(linkDictionary);

        LavaFlow.log("Import complete.", true);
    }

    static async createIndexFile(settings, linkDictionary, rootFolder) {
        const indexJournalName = "Index";
        let indexJournal = game.journal.find(j => j.name == indexJournalName && j.data.folder == rootFolder?.id);
        let directories = [...new Set(linkDictionary.map(d => LavaFlow.getIndexTopDirectory(d)))];
        directories.sort();
        let content = "";
        for (let j = 0; j < directories.length; j++) {
            content += `<h1>${directories[j]}</h1>`;
            let journals = linkDictionary.filter(d => LavaFlow.getIndexTopDirectory(d) == directories[j]).map(d => d.journal);
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
                && (d.fileInfo.links.indexOf(`[[${fileInfo.fileNameNoExt}]]`) >= 0
                    || d.fileInfo.links.indexOf(`[[${fileInfo.fullKey}]]`) >= 0))
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
        let fileInfo = new MDFileInfo(file?.webkitRelativePath);
        if (!file || fileInfo.directories[0] == ".obsidian" || fileInfo.fileExtension != "md")
            return;
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

    static decodeHtml(html) {
        var txt = document.createElement("textarea");
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
        let converter = new showdown.Converter();
        return converter.makeHtml(markdown);
    }

    static async updateLinks(fileInfo, journal, allJournals) {
        let mdKeyRegex = fileInfo.getKeyRegex();
        for (let i = 0; i < allJournals.length; i++) {
            let compareJournal = allJournals[i];
            if (!compareJournal)
                continue;
            let newContent = compareJournal.data.content.replace(mdKeyRegex, journal.link);
            if (newContent != compareJournal.data.content)
                await LavaFlow.updateJournal(compareJournal, newContent);
        }
    }
}

class LavaFlowSettings {
    rootFolderName = null
    useS3 = false
    vaultFiles = []
    imageDirectory = null
    overwrite = true
    ignoreDuplicate = false
    idPrefix = LavaFlow.ID + "-"
    playerObserve = false
    createIndexFile = false
    createBacklinks = true

    constructor() {
        this.rootFolderName = game.user.getFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.LASTFOLDER);
    }
}

class LavaFlowConfig extends FormApplication {
    static get defaultOptions() {
        const defaults = super.defaultOptions;

        const overrides = {
            height: '400px',
            id: `${LavaFlow.ID}-form`,
            template: LavaFlow.TEMPLATES.IMPORTDIAG,
            title: 'Import Obsidian MD Vault',
            importSettings: new LavaFlowSettings()
        };

        const mergedOptions = foundry.utils.mergeObject(defaults, overrides);

        return mergedOptions;
    }

    vaultFiles = [];

    async _updateObject(event, formData) {
        formData.vaultFiles = this.vaultFiles;
        await LavaFlow.importVault(event, formData);
    }

    getData(options) {
        return options.importSettings;
    }

    activateListeners(html) {
        let prefix = LavaFlowConfig.defaultOptions.importSettings.idPrefix;
        let overwriteID = `#${prefix}overwrite`;
        $(overwriteID).change(function () {
            let divID = `#${prefix}ignoreDuplicateDiv`;
            $(divID).toggle(!this.checked)
        });

        let vaultFilesID = `#${prefix}vaultFiles`;
        let config = this;
        $(vaultFilesID).change(function (event) {
            config.vaultFiles = event.target.files;
        });
    }
}

class MDFileInfo {
    filePath
    directories = []
    fileNameNoExt
    fileExtension
    fullKey
    links = []

    constructor(filePath) {
        if (!filePath)
            return;

        this.filePath = filePath;

        let pathParts = filePath.split("/");
        pathParts.shift(); // Remove fault folder name
        let fileNameWithExt = pathParts[pathParts.length - 1];
        pathParts.pop(); // Remove fileName;
        this.directories = pathParts;

        const separator = '.';
        let parts = fileNameWithExt.split(separator);
        this.fileExtension = parts[parts.length - 1];
        parts.pop();
        this.fileNameNoExt = parts.join(separator);

        this.fullKey = this.filePath.split(separator)[0];
    }

    getKeyRegex() {
        return new RegExp(`\\[\\[(${this.fileNameNoExt}|${this.fullKey})\\]\\]`, 'g');
    }
}