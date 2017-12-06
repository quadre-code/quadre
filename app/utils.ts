/* eslint-env node */

import { app } from "electron";

export function isDev() {
    return /(\/|\\)electron(.exe)?$/i.test(app.getPath("exe"));
}

let mainWindow: Electron.BrowserWindow | null;

export function setLoggerWindow(win: Electron.BrowserWindow) {
    win.webContents.once("did-frame-finish-load", (event: any) => {
        mainWindow = win;
    });
}

export function unsetLoggerWindow(win: Electron.BrowserWindow) {
    if (mainWindow === win) {
        mainWindow = null;
    }
}

const _console: any = {};
function callMainWindowConsole(method: string, ...args: string[]) {
    if (mainWindow) {
        try {
            mainWindow.webContents.send("console-msg", method, ...args);
        } catch (e) {
            // Do nothing.
        }
        return;
    }
    _console[method].call(console, ...args);
}

// this is run only for shell, we hijack console.xxx methods so they can be passed onto main window
if (app) {
    const c: any = console;
    Object.keys(c).forEach((key: string) => {
        if (typeof c[key] !== "function") { return; }
        _console[key] = c[key];
        c[key] = (...args: any[]) => callMainWindowConsole(key, ...args);
    });
}

export function getLogger(name: string) {
    return {
        log: (...msgs: string[]) => console.log(`[${name}]`, ...msgs), // tslint:disable-line
        info: (...msgs: string[]) => console.info(`[${name}]`, ...msgs), // tslint:disable-line
        warn: (...msgs: string[]) => console.warn(`[${name}]`, ...msgs),
        error: (...msgs: string[]) => console.error(`[${name}]`, ...msgs)
    };
}

export function errToString(err: Error): string {
    if (err.stack) {
        return err.stack;
    }
    if (err.name && err.message) {
        return err.name + ": " + err.message;
    }
    return err.toString();
}

export function errToMessage(err: Error): string {
    let message = err.message;
    if (message && err.name) {
        message = err.name + ": " + message;
    }
    return message ? message : err.toString();
}

export function convertWindowsPathToUnixPath(path: string): string {
    return process.platform === "win32" ? path.replace(/\\/g, "/") : path;
}

export function convertBracketsPathToWindowsPath(path: string): string {
    return process.platform === "win32" ? path.replace(/\//g, "\\") : path;
}
