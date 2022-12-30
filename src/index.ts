import LavaFlow from './lava-flow.js';

Hooks.on('renderSidebarTab', function (app: Application, html: JQuery) {
  try {
    LavaFlow.createUIElements(app, html);
  } catch (e) {
    LavaFlow.errorHandling(e);
  }
});
