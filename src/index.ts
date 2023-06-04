import LavaFlow from './lava-flow.js';

Hooks.on('renderJournalDirectory', function (app: Application, html: JQuery) {
  try {
    LavaFlow.createUIElements(html);
  } catch (e) {
    LavaFlow.errorHandling(e);
  }
});
