/* tslint:disable:no-empty-interface */

export type BrowserWindows = Array<Electron.BrowserWindow>;
export interface MenuItemOptions extends Electron.MenuItemConstructorOptions {}
export interface MenuTemplates {
    [winId: number]: Array<MenuItemOptions>;
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
export const wins: BrowserWindows = [];
export const menuTemplates: MenuTemplates = {};
