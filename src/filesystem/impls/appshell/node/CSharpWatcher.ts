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

/*
 * Code for working with CodeHelper.exe was inspired by:
 * https://github.com/Microsoft/vscode/blob/314e122b16c5c1ca0288c8006e9c9c3039a51cd7/src/vs/workbench/services/files/node/watcher/win32/csharpWatcherService.ts
 */

import * as fs from "fs";
import * as fspath from "path";
import * as cp from "child_process";
import * as anymatch from "anymatch";
import * as FileWatcherManager from "./FileWatcherManager";

interface Watcher {
    close: () => void;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildMatcher(ignored: Array<string>) {
    // in case of a glob like **/.git we want also to ignore its contents **/.git/**
    return anymatch(ignored.concat(ignored.map(function (glob) {
        return glob + "/**";
    })));
}

export function watchPath(path: string, ignored: Array<string>, _watcherMap: Record<string, Watcher>): void {
    const ignoreMatcher = buildMatcher(ignored);
    let closing = false;

    function processLine(line: string): void {
        if (line === "") {
            return;
        }

        const parts = line.split("|");
        if (parts.length !== 2) {
            console.warn("CSharpWatcher unexpected line: '" + line + "'");
            return;
        }

        const type = parseInt(parts[0], 10);
        // convert it back to unix path and clear trailing whitespace
        const absolutePath = parts[1].replace(/\\/g, "/").replace(/\s+$/g, "");

        // convert type to an event
        let event: string;
        switch (type) {
            case 0:
                event = "changed";
                break;
            case 1:
                event = "created";
                break;
            case 2:
                event = "deleted";
                break;
            default:
                console.warn("CSharpWatcher event type: " + type);
                return;
        }

        // make sure ignored events are not emitted
        if (ignoreMatcher(absolutePath)) {
            return;
        }

        const parentDirPath = fspath.dirname(absolutePath) + "/";
        const entryName = fspath.basename(absolutePath);

        // we need stats object for changed event
        if (event === "changed") {
            fs.stat(absolutePath, function (err, nodeFsStats) {
                if (err) {
                    console.warn("CSharpWatcher err getting stats: " + err.toString());
                }
                FileWatcherManager.emitChange(event, parentDirPath, entryName, nodeFsStats);
            });
        } else {
            FileWatcherManager.emitChange(event, parentDirPath, entryName, null);
        }
    }

    function onError(err: Error): void {
        console.warn("CSharpWatcher process error: " + err.toString());
        FileWatcherManager.unwatchPath(path);
    }

    function onExit(code: string, signal: string): void {
        if (!closing || signal !== "SIGTERM") {
            console.warn("CSharpWatcher terminated unexpectedly with code: " + code + ", signal: " + signal);
        }
        FileWatcherManager.unwatchPath(path);
    }

    try {

        const args = [
            // fspath.resolve will normalize slashes to windows format
            fspath.resolve(path)
        ];
        const handle = cp.spawn(fspath.resolve(__dirname, "win32", "CodeHelper.exe"), args);

        // Events over stdout
        handle.stdout.on("data", function (buffer) {
            const lines = buffer.toString("utf8").split("\n");
            while (lines.length > 0) {
                processLine(lines.shift()!);
            }
        });

        // Errors
        handle.on("error", onError);
        handle.stderr.on("data", onError);

        // Exit
        handle.on("exit", onExit);

        // Add handler for closing to the _watcherMap
        _watcherMap[path] = {
            close: function (): void {
                closing = true;
                handle.kill();
            }
        };

    } catch (err) {
        console.warn("Failed to watch file " + path + ": " + (err && err.message));
    }
}
