/* tslint:disable:no-empty-interface */
/* globals Electron */

export type BrowserWindows = Electron.BrowserWindow[];
export interface MenuItemOptions extends Electron.MenuItemConstructorOptions {}
export interface MenuTemplates {
    [winId: number]: MenuItemOptions[];
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
export const wins: BrowserWindows = [];
export const menuTemplates: MenuTemplates = {};
