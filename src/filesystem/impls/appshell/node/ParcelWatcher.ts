/*
 * Copyright (c) 2026 - present The quadre code authors. All rights reserved.
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

import * as fs from "fs";
import * as fspath from "path";
import * as watcher from "@parcel/watcher";
import * as FileWatcherManager from "./FileWatcherManager";

interface Watcher {
    close: () => void;
}

export function watchPath(path: string, ignored: Array<string>, _watcherMap: Record<string, Watcher>): void {

    const watcherOptions: watcher.Options = {
        ignore: ignored
    };

    function onError(err: unknown, detail: string): void {
        console.error("Error watching file (" + detail + ") " + path + ": ", err);
        FileWatcherManager.unwatchPath(path);
    }

    watcher.subscribe(path, (err, events) => {
        if (err) {
            onError(err, "subscribe callback");
            return;
        }

        try {
            for (const { type, path: parcelPath } of events) {
                let event = null;

                switch (type) {
                    case "update":
                        event = "changed";
                        break;
                    case "create":
                        event = "created";
                        break;
                    case "delete":
                        event = "deleted";
                        break;
                    default:
                        event = null;
                }

                if (!event || !path) {
                    return;
                }

                // make sure it's normalized
                const filename = parcelPath.replace(/\\/g, "/");
                const parentDirPath = fspath.dirname(filename) + "/";
                const entryName = fspath.basename(filename);

                // we need stats object for changed event
                if (event === "changed") {
                    fs.stat(filename, function (errFsStats, nodeFsStats) {
                        if (errFsStats) {
                            console.warn("Watcher err getting stats: " + errFsStats.toString());
                        }
                        FileWatcherManager.emitChange(event, parentDirPath, entryName, nodeFsStats);
                    });
                } else {
                    FileWatcherManager.emitChange(event, parentDirPath, entryName, null);
                }
            }
        } catch (e) {
            onError(e, "subscribe exception");
        }
    }, watcherOptions)
        .then((subscription) => {
            _watcherMap[path] = {
                close: function (): void {
                    subscription.unsubscribe();
                }
            }
        })
        .catch((err) => {
            onError(err, "subscribe");
        });
}
