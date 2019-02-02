import * as _ from "lodash";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as utils from "./utils";
import { app } from "electron";
const log = utils.getLogger("shell-config");

const CONFIG_PATH = path.resolve(utils.convertWindowsPathToUnixPath(app.getPath("userData")), "shell-config.json");
let config: {};

if (!process.env.TMPDIR && !process.env.TMP && !process.env.TEMP) {
    process.env.TMPDIR = process.env.TMP = process.env.TEMP = os.tmpdir();
}

function readDefaultConfig() {
    config = fs.readJsonSync(path.resolve(__dirname, "default-shell-config.json"));
}

function writeDefaultConfig() {
    readDefaultConfig();
    fs.ensureDirSync(path.dirname(CONFIG_PATH));
    fs.writeJsonSync(CONFIG_PATH, config);
}

try {
    config = fs.readJsonSync(CONFIG_PATH);
} catch (err) {
    if (err.code === "ENOENT") {
        writeDefaultConfig();
    } else if (err.name === "SyntaxError") {
        log.error(`File is not a valid json: ${CONFIG_PATH} - ${err}`);
        readDefaultConfig();
    } else {
        log.error(`Can't read file: ${CONFIG_PATH} - ${err}`);
        readDefaultConfig();
    }
}

export function save() {
    fs.writeJson(CONFIG_PATH, config);
}

export function saveSync() {
    fs.writeJsonSync(CONFIG_PATH, config);
}

export function get(key: string): any {
    return _.get(config, key);
}

export function getNumber(key: string): number {
    const result = get(key);
    if (result !== null && result !== undefined && typeof result !== "number") {
        throw new Error(`getNumber -> not-a-number: ${key} = ${result}`);
    }
    return result;
}

export function set(key: string, value: any): any {
    return _.set(config, key, value);
}
