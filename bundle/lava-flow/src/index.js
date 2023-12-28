import LavaFlow from './lava-flow.js';
Hooks.on('renderJournalDirectory', function (app, html) {
	try {
		LavaFlow.createUIElements(html);
	}
	catch (e) {
		LavaFlow.errorHandling(e);
	}
});
