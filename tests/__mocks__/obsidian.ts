/**
 * Runtime stand-in for the `obsidian` package.
 *
 * The published package is type definitions only (`"main": ""`), so Jest cannot
 * resolve it when the modules under test are loaded. The handlers only need `moment`
 * at runtime; the UI modules additionally extend and instantiate a few classes at module
 * load, so those get minimal stand-ins below. Pure type imports such as `DataAdapter`
 * are erased at compile time and need nothing here.
 */

export const moment = require('moment');

/**
 * Minimal stand-ins for the classes the UI modules extend or instantiate at module load.
 * They exist so those modules can be imported in tests at all; they model no behaviour.
 */
export class App {}
export class TFile {}
export class Modal {
    constructor(_app: App) {}
}
export class FuzzySuggestModal<T> {
    constructor(_app: App) {}
}
export class Notice {
    constructor(_message: string) {}
}
