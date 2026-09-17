/**
 * Runtime stand-in for the `obsidian` package.
 *
 * The published package is type definitions only (`"main": ""`), so Jest cannot
 * resolve it when the modules under test are loaded. Everything those modules
 * pull from it at runtime is `moment`; the rest (`DataAdapter` and friends) are
 * types and are erased at compile time.
 */

export const moment = require('moment');
