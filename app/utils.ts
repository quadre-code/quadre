import { app, BrowserWindow } from "electron";

interface Logger {
    log: (...msgs: Array<string>) => void;
    info: (...msgs: Array<string>) => void;
    warn: (...msgs: Array<string>) => void;
    error: (...msgs: Array<string>) => void;
}

export function isDev(): boolean {
    return /(\/|\\)electron(.exe)?$/i.test(app.getPath("exe"));
}

let mainWindow: BrowserWindow | null;

export function setLoggerWindow(win: BrowserWindow): void {
    win.webContents.once("did-frame-finish-load", (event: any) => {
        mainWindow = win;
    });
}

export function unsetLoggerWindow(win: BrowserWindow): void {
    if (mainWindow === win) {
        mainWindow = null;
    }
}

const _console: any = {};
function callMainWindowConsole(method: string, ...args: Array<string>): void {
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
        if (typeof c[key] !== "function") {
            return;
        }
        _console[key] = c[key];
        c[key] = (...args: Array<any>): void => callMainWindowConsole(key, ...args);
    });
}

export function getLogger(name: string): Logger {
    return {
        log: (...msgs: Array<string>) => console.log(`[${name}]`, ...msgs),
        info: (...msgs: Array<string>) => console.info(`[${name}]`, ...msgs),
        warn: (...msgs: Array<string>) => console.warn(`[${name}]`, ...msgs),
        error: (...msgs: Array<string>) => console.error(`[${name}]`, ...msgs),
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
