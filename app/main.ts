/* eslint-env node */

import { app, BrowserWindow, ipcMain } from "electron";
import AutoUpdater from "./auto-updater";
import * as _ from "lodash";
import { getLogger, setLoggerWindow, unsetLoggerWindow, convertWindowsPathToUnixPath, errToString } from "./utils";
import * as pathLib from "path";
import * as urlLib from "url";
import * as yargs from "yargs";
import * as shellConfig from "./shell-config";
import { readBracketsPreferences } from "./brackets-config";
import { wins, menuTemplates } from "./shared";
import * as shellState from "./shell-state";
import * as SocketServer from "./socket-server"; // Implementation of Brackets' shell server

const appInfo = require("./package.json");

const log = getLogger("main");
(process as NodeJS.EventEmitter).on("uncaughtException", (err: Error) => {
    log.error(`[uncaughtException] ${err.stack}`);
});

const ipclog = getLogger("ipc-log");
ipcMain.on("log", function (event: Event, ...args: any[]) {
    ipclog.info(...args);
});

// Report crashes to electron server
// TODO: doesn't work
// electron.crashReporter.start();

// fetch window position values from the window and save them to config file
function _saveWindowPosition(sync: boolean, win: Electron.BrowserWindow) {
    const size = win.getSize();
    const pos = win.getPosition();
    shellConfig.set("window.posX", pos[0]);
    shellConfig.set("window.posY", pos[1]);
    shellConfig.set("window.width", size[0]);
    shellConfig.set("window.height", size[1]);
    shellConfig.set("window.maximized", win.isMaximized());
    if (sync) {
        shellConfig.saveSync();
    } else {
        shellConfig.save();
    }
}
const saveWindowPositionSync = _.partial(_saveWindowPosition, true);
const saveWindowPosition = _.debounce(_.partial(_saveWindowPosition, false), 100);

// Quit when all windows are closed.
let windowAllClosed = false;

// Start the socket server used by Brackets'
const socketServerLog = getLogger("socket-server");
SocketServer.start(function (err: Error, port: number) {
    if (err) {
        shellState.set("socketServer.state", "ERR_NODE_FAILED");
        socketServerLog.error("failed to start: " + errToString(err));
    } else {
        shellState.set("socketServer.state", "NO_ERROR");
        shellState.set("socketServer.port", port);
        socketServerLog.info("started on port " + port);
    }
});

app.on("window-all-closed", function () {
    windowAllClosed = true;
    setTimeout(app.quit, 500);
});

app.on("before-quit", function (event) {
    if (!windowAllClosed) {
        event.preventDefault();
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => win.close());
    }
});

let fileToOpen: string | null = null;

app.on("open-file", (evt: any, path: string) => {
    const win = getMainBracketsWindow();
    if (win) {
        win.webContents.send("open-file", path);
    } else {
        // this was called before window was opened, we need to remember it
        fileToOpen = path;
    }
});

ipcMain.on("brackets-app-ready", () => {
    if (fileToOpen) {
        getMainBracketsWindow().webContents.send("open-file", fileToOpen);
        fileToOpen = null;
    }
});

app.on("ready", function () {
    const win = openMainBracketsWindow();
    try {
        // eslint-disable-next-line no-new
        new AutoUpdater(win);
    } catch (err) {
        log.error(err.stack);
    }
    setLoggerWindow(win);
});

app.on("gpu-process-crashed", function () {
    restart();
});

export function restart(query: {} | string = {}) {
    while (wins.length > 0) {
        const win = wins.shift(); // tslint:disable-line
        if (win) {
            unsetLoggerWindow(win);
            win.close();
        }
    }
    // this should mirror stuff done in "ready" handler except for auto-updater
    const win = openMainBracketsWindow(query);
    setLoggerWindow(win);
}

export function getMainBracketsWindow(): Electron.BrowserWindow {
    return wins[0];
}

interface FormatOptions {
    isEncoded?: boolean;
}

// See also https://github.com/electron/electron/issues/11560
function formatUrl(filePath: string, options: FormatOptions = {}) {
    let url = "";
    if (options.isEncoded) {
        url = "file:///" + convertWindowsPathToUnixPath(pathLib.resolve(__dirname, filePath));
    } else {
        url = urlLib.format({
            protocol: "file",
            slashes: true,
            pathname: pathLib.resolve(__dirname, filePath)
        });
    }
    console.log(url);
    return url;
}

export function openMainBracketsWindow(query: {} | string = {}): Electron.BrowserWindow {
    const argv = yargs.argv;

    // compose path to brackets' index file
    let indexPath = "www/index.html";
    const formatOptions: FormatOptions = {};
    if (argv["startup-path"]) {
        indexPath = argv["startup-path"] as string;
        formatOptions.isEncoded = true;
    }

    // build a query for brackets' window
    let queryString = "";
    if (_.isObject(query) && !_.isEmpty(query)) {
        const queryObj = query as _.Dictionary<string>;
        queryString = "?" + _.map(queryObj, function (value, key) {
            return key + "=" + encodeURIComponent(value);
        }).join("&");
    } else if (_.isString(query)) {
        const queryStr = query as string;
        const io1 = queryStr.indexOf("?");
        const io2 = queryStr.indexOf("#");
        if (io1 !== -1) {
            queryString = queryStr.substring(io1);
        } else if (io2 !== -1) {
            queryString = queryStr.substring(io2);
        } else {
            queryString = "";
        }
    }

    const indexUrl = formatUrl(indexPath, formatOptions) + queryString;

    const winOptions = {
        title: appInfo.productName,
        x: shellConfig.getNumber("window.posX"),
        y: shellConfig.getNumber("window.posY"),
        width: shellConfig.getNumber("window.width"),
        height: shellConfig.getNumber("window.height"),
        webPreferences: {
            nodeIntegration: false,
            preload: pathLib.resolve(__dirname, "preload.js"),
            nativeWindowOpen: true
        }
    };

    const bracketsPreferences = readBracketsPreferences();

    const blinkFeatures = _.get(bracketsPreferences, "shell.blinkFeatures");
    if (typeof blinkFeatures === "string" && blinkFeatures.length > 0) {
        _.set(winOptions, "webPreferences.blinkFeatures", blinkFeatures);
    }

    const disableBlinkFeatures = _.get(bracketsPreferences, "shell.disableBlinkFeatures");
    if (typeof disableBlinkFeatures === "string" && disableBlinkFeatures.length > 0) {
        _.set(winOptions, "webPreferences.disableBlinkFeatures", disableBlinkFeatures);
    }

    const smoothScrolling = _.get(bracketsPreferences, "shell.smoothScrolling", true);
    if (!smoothScrolling) {
        app.commandLine.appendSwitch("disable-smooth-scrolling");
    }

    // create the browser window
    const win = new BrowserWindow(winOptions);
    if (process.argv.indexOf("--devtools") !== -1) {
        win.webContents.openDevTools({ mode: "detach" });
    }
    wins.push(win);

    // load the index.html of the app
    log.info(`loading brackets window at ${indexUrl}`);
    win.loadURL(indexUrl);
    if (shellConfig.get("window.maximized")) {
        win.maximize();
    }

    // emitted when the window is closed
    win.on("closed", function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        const io = wins.indexOf(win);
        if (io !== -1) {
            const oldWin = wins.splice(io, 1) as BrowserWindow[];

            delete menuTemplates[oldWin[0].id];
        }
    });

    // this is used to remember the size from the last time
    // emitted before the window is closed
    win.on("close", function () {
        saveWindowPositionSync(win);
    });
    win.on("maximize", function () {
        saveWindowPosition(win);
    });
    win.on("unmaximize", function () {
        saveWindowPosition(win);
    });
    win.on("resize", function () {
        saveWindowPosition(win);
    });
    win.on("move", function () {
        saveWindowPosition(win);
    });

    return win;
}
