import * as _ from "lodash";
import * as electronRemote from "@electron/remote";
import type { BracketsApp } from "../types";

const app = require("./app");
const appMenu = electronRemote.require(__dirname + "/app-menu");
const bracketsApp: BracketsApp = {
    // app/appshell/app
    getNodeState: app.getNodeState,
    getApplicationSupportDirectory: app.getApplicationSupportDirectory,
    getExtensionsFolder: app.getExtensionsFolder,
    showExtensionsFolder: app.showExtensionsFolder,
    getElapsedMilliseconds: app.getElapsedMilliseconds,
    getUserHomeDirectory: app.getUserHomeDirectory,
    getUserDocumentsDirectory: app.getUserDocumentsDirectory,
    quit: app.quit,
    showDeveloperTools: app.showDeveloperTools,
    showOSFolder: app.showOSFolder,
    getMachineHash: app.getMachineHash,
    language: app.language,

    // TODO\CHECK
    openLiveBrowser: app.openLiveBrowser,
    closeLiveBrowser: app.closeLiveBrowser,
    dragWindow: app.dragWindow,
    openURLInDefaultBrowser: app.openURLInDefaultBrowser,
    getSystemDefaultApp: app.getSystemDefaultApp,
    getRemoteDebuggingPort: app.getRemoteDebuggingPort,
    getPendingFilesToOpen: app.getPendingFilesToOpen,
    getDroppedFiles: app.getDroppedFiles,
    installCommandLine: app.installCommandLine,

    // app/appshell/app-menu
    NO_ERROR: appMenu.NO_ERROR,
    ERR_NOT_FOUND: appMenu.ERR_NOT_FOUND,

    addMenu: appMenu.addMenu,
    addMenuItem: appMenu.addMenuItem,
    getMenuItemState: appMenu.getMenuItemState,
    getMenuPosition: appMenu.getMenuPosition,
    getMenuTitle: appMenu.getMenuTitle,
    removeMenu: appMenu.removeMenu,
    removeMenuItem: appMenu.removeMenuItem,
    setMenuItemShortcut: appMenu.setMenuItemShortcut,
    setMenuItemState: appMenu.setMenuItemState,
    setMenuTitle: appMenu.setMenuTitle,
};

const fs = _.extend({}, require("fs-extra"), require("./fs-additions"));
const shell = electronRemote.require(__dirname + "/shell");

// prevent using this alias, rather use .remove
delete fs.delete;

// make sure extensions folder exists
fs.ensureDir(bracketsApp.getExtensionsFolder());

// this needs to be node-require style export
module.exports = { app: bracketsApp, fs, shell, inElectron: true, windowGoingAway: false };
