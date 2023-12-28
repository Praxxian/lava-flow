import LavaFlow from './lava-flow.js';
export class LavaFlowSettings {
	constructor() {
		this.rootFolderName = null;
		this.vaultFiles = null;
		this.imageDirectory = null;
		this.overwrite = true;
		this.ignoreDuplicate = false;
		this.idPrefix = `${LavaFlow.ID}-`;
		this.playerObserve = false;
		this.createIndexFile = false;
		this.createBacklinks = true;
		this.importNonMarkdown = true;
		this.useS3 = false;
		this.s3Bucket = null;
		this.s3Region = null;
		this.mediaFolder = 'img';
	}
}
