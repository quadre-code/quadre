import { BrowserWindow, MenuItemConstructorOptions } from "electron";

export type BrowserWindows = Array<BrowserWindow>;
// tslint:disable-next-line:no-empty-interface
export interface MenuItemOptions extends MenuItemConstructorOptions {}
export interface MenuTemplates {
    [winId: number]: Array<MenuItemOptions>;
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
export const wins: BrowserWindows = [];
export const menuTemplates: MenuTemplates = {};
