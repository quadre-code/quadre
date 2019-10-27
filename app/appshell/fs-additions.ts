import * as fs from "fs-extra";
import * as utils from "../utils";
import { remote } from "electron";
const { dialog } = remote;
const isbinaryfile = require("isbinaryfile");
const stripBom = require("strip-bom");
const trash = require("trash");

/*
    additions to native fs provided by node
    to support functionality required by brackets
*/

export function isBinaryFile(filename: string, callback: (err?: Error, res?: boolean) => void) {
    isbinaryfile(filename, callback);
}

export function isBinaryFileSync(filename: string): boolean {
    return isbinaryfile(filename);
}

export function isEncodingSupported(encoding: string): boolean {
    return ["ascii", "utf-8", "utf8"].indexOf(encoding.toLowerCase()) !== -1;
}

export function isNetworkDrive(path: string, callback: (err: Error | null, res: boolean) => void) {
    // TODO: implement
    process.nextTick(function () {
        callback(null, false);
    });
}

export function moveToTrash(path: string, callback: (err: Error | null, result?: any) => void) {
    fs.stat(path, function (err) {
        if (err) {
            return callback(err);
        }
        // trash expects an array of files which is inconsistent with fs-extra apis
        trash(Array.isArray(path) ? path : [path])
            .then((r: any) => callback(null, r))
            .catch((e: Error) => callback(e));
    });
}

export function readTextFile(filename: string, encoding: string, callback: (err: Error | null, res?: string) => void) {
    if (typeof encoding === "function") {
        callback = encoding;
        encoding = "utf-8";
    } else if (typeof encoding !== "string") {
        throw new TypeError("encoding must be a string");
    } else if (!isEncodingSupported(encoding)) {
        throw new TypeError("encoding is not supported: " + encoding);
    }
    // isbinaryfile check first because it checks first 1000 bytes of a file
    // so we don't load whole file if it's binary
    isbinaryfile(filename, function (err: Error, isBinary: boolean) {
        if (err) {
            return callback(err);
        }
        if (isBinary) {
            const err2: NodeJS.ErrnoException = new Error("ECHARSET: file is a binary file: " + filename);
            err2.code = "ECHARSET";
            return callback(err2);
        }
        fs.readFile(filename, encoding, function (err2, content) {
            if (err2) {
                return callback(err2);
            }

            content = stripBom(content);

            // \uFFFD is used to replace an incoming character
            // whose value is unknown or unrepresentable
            if (/\uFFFD/.test(content)) {
                const err3: NodeJS.ErrnoException = new Error("ECHARSET: unsupported encoding in file: " + filename);
                err3.code = "ECHARSET";
                return callback(err3);
            }

            callback(null, content);
        });
    });
}

export function remove(path: string, callback: (err?: Error) => void) {
    fs.stat(path, function (err, stats) {
        if (err) {
            return callback(err);
        }
        fs.remove(path, callback);
    });
}

export function rename(oldPath: string, newPath: string, callback: (err?: Error) => void) {
    fs.stat(newPath, function (err, stats) {
        if (err && err.code === "ENOENT") {
            return fs.rename(oldPath, newPath, callback);
        }
        if (err) {
            return callback(err);
        }
        err = new Error("EEXIST: file already exists: " + newPath);
        err.code = "EEXIST";
        callback(err);
    });
}

export function showOpenDialog(
    allowMultipleSelection: boolean,
    chooseDirectory: boolean,
    title: string,
    defaultPath: string,
    /**
     * Extensions without wildcards or dots (e.g. 'png' is good but '.png' and '*.png' are bad).
     * To show all files, use the '*' wildcard (no other wildcard is supported).
     */
    filters: Array<{ name: string, extensions: Array<string> }>,
    callback: (err: Error | null, fileNames: Array<string>) => void
) {
    const properties: Array<(
        "openFile" | "openDirectory" | "multiSelections" | "createDirectory" | "showHiddenFiles"
    )> = [];
    if (chooseDirectory) {
        properties.push("openDirectory");
    } else {
        properties.push("openFile");
    }
    if (allowMultipleSelection) {
        properties.push("multiSelections");
    }
    // TODO: I don't think defaultPath and filters work right now - we should test that
    // Also, it doesn't return an error code on failure any more (and doesn't pass one to the callback as well)
    return dialog.showOpenDialog({
        title,
        defaultPath,
        filters,
        properties
    }, function (fileNames: Array<string>) {
        callback(null, fileNames ? fileNames.map(utils.convertWindowsPathToUnixPath) : []);
    });
}

export function showSaveDialog(
    title: string,
    defaultPath: string,
    proposedNewFilename: string,
    callback: (err: Error | null, fileName?: string) => void
) {
    // TODO: Implement proposedNewFilename
    // TODO: I don't think defaultPath works right now - we should test that
    // Also, it doesn't return an error code on failure any more (and doesn't pass one to the callback as well)
    return dialog.showSaveDialog({
        title,
        defaultPath
    }, function (path: string) {
        callback(null, utils.convertWindowsPathToUnixPath(path));
    });
}
