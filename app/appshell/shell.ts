import { BrowserWindow } from "electron";
import _ = require("lodash");
import { readBracketsPreferences } from "../brackets-config";

const bracketsPreferences = readBracketsPreferences();
const shellType = _.get(bracketsPreferences, "shell.type");

export function getMainWindow(): BrowserWindow {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 1) {
        console.warn(`getMainWindow() -> ${wins.length} windows open`);
    }
    return wins[0];
}

export function getProcessArgv(): Array<string> {
    return process.argv;
}

export const type = shellType;
