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

import type FileSystemStats = require("filesystem/FileSystemStats");

import FileSystemEntry = require("filesystem/FileSystemEntry");
import { EntryKind } from "filesystem/EntryKind";

/*
 * Model for a File.
 *
 * This class should *not* be instantiated directly. Use FileSystem.getFileForPath,
 * FileSystem.resolve, or Directory.getContents to create an instance of this class.
 *
 * See the FileSystem class for more details.
 *
 * @constructor
 * @param {!string} fullPath The full path for this File.
 * @param {!FileSystem} fileSystem The file system associated with this File.
 */
class File extends FileSystemEntry {
    public parentClass = FileSystemEntry.prototype;

    /**
     * Cached contents of this file. This value is nullable but should NOT be undefined.
     * @private
     * @type {?string}
     */
    private _contents: string | null = null;

    /**
     * Encoding detected by brackets-shell
     * @private
     * @type {?string}
     */
    public _encoding: string | null = null;

    /**
     * BOM detected by brackets-shell
     * @private
     * @type {?bool}
     */
    private _preserveBOM = false;

    /**
     * Consistency hash for this file. Reads and writes update this value, and
     * writes confirm the hash before overwriting existing files. The type of
     * this object is dependent on the FileSystemImpl; the only constraint is
     * that === can be used as an equality relation on hashes.
     * @private
     * @type {?object}
     */
    public _hash: number | null = null;

    public subDirStr: string;

    constructor(fullPath: string, fileSystem) {
        super(fullPath, fileSystem, EntryKind.File);
        this._isFile = true;
    }

    /**
     * Clear any cached data for this file. Note that this explicitly does NOT
     * clear the file's hash.
     * @private
     */
    public _clearCachedData(): void {
        super._clearCachedData();
        this._contents = null;
    }

    /**
     * Read a file.
     *
     * @param {Object=} options Currently unused.
     * @param {function (?string, string=, FileSystemStats=)} callback Callback that is passed the
     *              FileSystemError string or the file's contents and its stats.
     */
    public read(callback: (err: string | null, contents?: string, encoding?: string | null, stats?: FileSystemStats) => void): void;
    public read(options, callback: (err: string | null, contents?: string, encoding?: string | null, stats?: FileSystemStats) => void): void;
    public read(
        options,
        callback?: (err: string | null, contents?: string, encoding?: string | null, stats?: FileSystemStats) => void
    ): void {
        if (typeof (options) === "function") {
            callback = options;
            options = {};
            options.encoding = this._encoding;
        }
        options.encoding = this._encoding || "utf8";

        // We don't need to check isWatched() here because contents are only saved
        // for watched files. Note that we need to explicitly test this._contents
        // for a default value; otherwise it could be the empty string, which is
        // falsey.
        if (this._contents !== null && this._stat) {
            callback!(null, this._contents, this._encoding, this._stat);
            return;
        }

        const watched = this._isWatched();
        if (watched) {
            options.stat = this._stat;
        }

        this._impl.readFile(this._path, options, function (this: File, err: string | null, data: string, encoding: string, preserveBOM: boolean, stat: FileSystemStats): void {
            if (err) {
                this._clearCachedData();
                callback!(err);
                return;
            }

            // Always store the hash
            this._hash = stat._hash;
            this._encoding = encoding;
            this._preserveBOM = preserveBOM;

            // Only cache data for watched files
            if (watched) {
                this._stat = stat;
                this._contents = data;
            }

            callback!(err, data, encoding, stat);
        }.bind(this));
    }

    /**
     * Write a file.
     *
     * @param {string} data Data to write.
     * @param {object=} options Currently unused.
     * @param {function (?string, FileSystemStats=)=} callback Callback that is passed the
     *              FileSystemError string or the file's new stats.
     */
    public write(data: string, options: Record<string, any> | ((err: string | null, stats?: FileSystemStats) => void), callback?: (err: string | null, stats?: FileSystemStats) => void): void {
        if (typeof options === "function") {
            callback = options as ((err: string | null, stats?: FileSystemStats) => void);
            options = {};
        } else {
            if (options === undefined) {
                options = {};
            }

            callback = callback || function (): void { /* Do nothing */ };
        }

        // Request a consistency check if the write is not blind
        if (!options.blind) {
            options.expectedHash = this._hash;
            options.expectedContents = this._contents;
        }
        if (!options.encoding) {
            options.encoding = this._encoding || "utf8";
        }
        options.preserveBOM = this._preserveBOM;

        // Block external change events until after the write has finished
        this._fileSystem._beginChange();

        this._impl.writeFile(this._path, data, options, function (this: File, err: string | null, stat: FileSystemStats, created: boolean): void {
            if (err) {
                this._clearCachedData();
                try {
                    callback!(err);
                    return;
                } finally {
                    // Always unblock external change events
                    this._fileSystem._endChange();
                }
            }

            // Always store the hash
            this._hash = stat._hash;

            // Only cache data for watched files
            if (this._isWatched()) {
                this._stat = stat;
                this._contents = data;
            }

            if (created) {
                const parent = this._fileSystem.getDirectoryForPath(this.parentPath);
                this._fileSystem._handleDirectoryChange(parent, function (this: File, added: Array<FileSystemEntry>, removed: Array<FileSystemEntry>): void {
                    try {
                        // Notify the caller
                        callback!(null, stat);
                    } finally {
                        if (parent._isWatched()) {
                            // If the write succeeded and the parent directory is watched,
                            // fire a synthetic change event
                            this._fileSystem._fireChangeEvent(parent, added, removed);

                        }
                        // Always unblock external change events
                        this._fileSystem._endChange();
                    }
                }.bind(this));
            } else {
                try {
                    // Notify the caller
                    callback!(null, stat);
                } finally {
                    // existing file modified
                    this._fileSystem._fireChangeEvent(this);

                    // Always unblock external change events
                    this._fileSystem._endChange();
                }
            }
        }.bind(this));
    }
}

export = File;
