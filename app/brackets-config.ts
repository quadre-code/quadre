import * as _ from "lodash";
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

const DEFAULT_PREFERENCES_FILENAME = "defaultPreferences.json";
const CURRENT_PREFERENCES_FILENAME = "brackets.json";

function tryReadJson(fullPath: string): any {
    try {
        return JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (err) {
        return {};
    }
}

export function readBracketsPreferences(): any {
    const dirPath = app.getPath("userData");
    const defaultPreferences = tryReadJson(path.resolve(dirPath, DEFAULT_PREFERENCES_FILENAME));
    const currentPreferences = tryReadJson(path.resolve(dirPath, CURRENT_PREFERENCES_FILENAME));
    return _.defaultsDeep(currentPreferences, defaultPreferences);
}
