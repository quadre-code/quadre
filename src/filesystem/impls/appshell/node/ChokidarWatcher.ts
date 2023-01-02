/*
 * Copyright (c) 2013 - 2017 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

import * as fspath from "path";
import * as chokidar from "chokidar";
import * as FileWatcherManager from "./FileWatcherManager";

export function watchPath(path: string, ignored: Array<string>, _watcherMap: any): void {
    try {
        const watcher = chokidar.watch(path, {
            persistent: true,
            ignoreInitial: true,
            ignorePermissionErrors: true,
            followSymlinks: true,
            ignored: ignored,
            interval: 1000, // while not used in normal cases, if any error causes chokidar to fallback to polling, increase its intervals
            binaryInterval: 1000
        });

        watcher.on("all", function (type, filename, nodeFsStats) {
            let event;
            switch (type) {
                case "change":
                    event = "changed";
                    break;
                case "add":
                case "addDir":
                    event = "created";
                    break;
                case "unlink":
                case "unlinkDir":
                    event = "deleted";
                    break;
                default:
                    event = null;
            }
            if (!event || !filename) {
                return;
            }
            // make sure it's normalized
            filename = filename.replace(/\\/g, "/");
            const parentDirPath = fspath.dirname(filename) + "/";
            const entryName = fspath.basename(filename);
            FileWatcherManager.emitChange(event, parentDirPath, entryName, nodeFsStats);
        });

        _watcherMap[path] = watcher;

        watcher.on("error", function (err) {
            console.error("Error watching file " + path + ": " + (err && err.message));
            FileWatcherManager.unwatchPath(path);
        });
    } catch (err) {
        console.warn("Failed to watch file " + path + ": " + (err && err.message));
    }
}
