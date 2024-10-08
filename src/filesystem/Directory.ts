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

import FileSystemEntry = require("filesystem/FileSystemEntry");
import FileSystemStats = require("filesystem/FileSystemStats");
import { EntryKind } from "filesystem/EntryKind";

/**
 * Apply each callback in a list to the provided arguments. Callbacks
 * can throw without preventing other callbacks from being applied.
 *
 * @private
 * @param {Array.<function>} callbacks The callbacks to apply
 * @param {Array} args The arguments to which each callback is applied
 */
function _applyAllCallbacks(callbacks: Array<(...args: Array<any>) => void>, args: Array<any>): void {
    if (callbacks.length > 0) {
        const callback = callbacks.pop()!;
        try {
            callback.apply(undefined, args);
        } finally {
            _applyAllCallbacks(callbacks, args);
        }
    }
}

/*
 * Model for a file system Directory.
 *
 * This class should *not* be instantiated directly. Use FileSystem.getDirectoryForPath,
 * FileSystem.resolve, or Directory.getContents to create an instance of this class.
 *
 * Note: Directory.fullPath always has a trailing slash.
 *
 * See the FileSystem class for more details.
 *
 * @constructor
 * @param {!string} fullPath The full path for this Directory.
 * @param {!FileSystem} fileSystem The file system associated with this Directory.
 */
class Directory extends FileSystemEntry {
    public parentClass = FileSystemEntry.prototype;

    private _contentsCallbacks;

    /**
     * The contents of this directory. This "private" property is used by FileSystem.
     * @type {Array<FileSystemEntry>}
     */
    public _contents: Array<FileSystemEntry> | undefined;

    /**
     * The stats for the contents of this directory, such that this._contentsStats[i]
     * corresponds to this._contents[i].
     * @type {Array.<FileSystemStats>}
     */
    private _contentsStats: Array<FileSystemStats> | undefined;

    /**
     * The stats errors for the contents of this directory.
     * @type {object.<string: string>} fullPaths are mapped to FileSystemError strings
     */
    private _contentsStatsErrors: Record<string, string> | undefined;

    constructor(fullPath: string, fileSystem) {
        super(fullPath, fileSystem, EntryKind.Directory);
        this._isDirectory = true;
    }

    /**
     * Clear any cached data for this directory. By default, we clear the contents
     * of immediate children as well, because in some cases file watchers fail
     * provide precise change notifications. (Sometimes, like after a "git
     * checkout", they just report that some directory has changed when in fact
     * many of the file within the directory have changed.
     *
     * @private
     * @param {boolean=} preserveImmediateChildren
     */
    public _clearCachedData(preserveImmediateChildren = false): void {
        super._clearCachedData();

        if (!preserveImmediateChildren) {
            if (this._contents) {
                this._contents.forEach(function (child) {
                    child._clearCachedData(true);
                });
            } else {
                // No cached _contents, but child entries may still exist.
                // Scan the full index to catch all of them.
                const dirPath = this.fullPath;
                this._fileSystem._index.visitAll(function (entry) {
                    if (entry.parentPath === dirPath) {
                        entry._clearCachedData(true);
                    }
                });
            }
        }

        this._contents = undefined;
        this._contentsStats = undefined;
        this._contentsStatsErrors = undefined;
    }

    /**
     * Read the contents of a Directory. If this Directory is under a watch root,
     * the listing will exclude any items filtered out by the watch root's filter
     * function.
     *
     * @param {Directory} directory Directory whose contents you want to get
     * @param {function (?string, Array.<FileSystemEntry>=, Array.<FileSystemStats>=, Object.<string, string>=)} callback
     *          Callback that is passed an error code or the stat-able contents
     *          of the directory along with the stats for these entries and a
     *          fullPath-to-FileSystemError string map of unstat-able entries
     *          and their stat errors. If there are no stat errors then the last
     *          parameter shall remain undefined.
     */
    public override getContents(callback: (err: string | null, contents: Array<FileSystemEntry>, contentsStats: Array<FileSystemStats> | undefined, contentsStatsErrors: Record<string, string> | undefined) => void): void {
        if (this._contentsCallbacks) {
            // There is already a pending call for this directory's contents.
            // Push the new callback onto the stack and return.
            this._contentsCallbacks.push(callback);
            return;
        }

        // Return cached contents if the directory is watched
        if (this._contents) {
            callback(null, this._contents, this._contentsStats, this._contentsStatsErrors);
            return;
        }

        this._contentsCallbacks = [callback];

        this._impl.readdir(this.fullPath, function (this: Directory, err: string | null, names: Array<string>, stats: FileSystemStats): void {
            const contents: Array<FileSystemEntry> = [];
            const contentsStats: Array<FileSystemStats> = [];
            let contentsStatsErrors;

            if (err) {
                this._clearCachedData();
            } else {
                // Use the "relaxed" parameter to _isWatched because it's OK to
                // cache data even while watchers are still starting up
                const watched = this._isWatched(true);

                names.forEach(function (this: Directory, name, index) {
                    const entryPath = this.fullPath + name;

                    const entryStats = stats[index];
                    if (this._fileSystem._indexFilter(entryPath, name/*, entryStats*/)) {
                        let entry;

                        // Note: not all entries necessarily have associated stats.
                        if (typeof entryStats === "string") {
                            // entryStats is an error string
                            if (contentsStatsErrors === undefined) {
                                contentsStatsErrors = {};
                            }
                            contentsStatsErrors[entryPath] = entryStats;
                        } else {
                            // entryStats is a FileSystemStats object
                            if (entryStats.isFile) {
                                entry = this._fileSystem.getFileForPath(entryPath);
                            } else {
                                entry = this._fileSystem.getDirectoryForPath(entryPath);
                            }

                            if (watched) {
                                entry._stat = entryStats;
                            }

                            contents.push(entry);
                            contentsStats.push(entryStats);
                        }
                    }
                }, this);

                if (watched) {
                    this._contents = contents;
                    this._contentsStats = contentsStats;
                    this._contentsStatsErrors = contentsStatsErrors;
                }
            }

            // Reset the callback list before we begin calling back so that
            // synchronous reentrant calls are handled correctly.
            const currentCallbacks = this._contentsCallbacks;

            this._contentsCallbacks = null;

            // Invoke all saved callbacks
            const callbackArgs = [err, contents, contentsStats, contentsStatsErrors];
            _applyAllCallbacks(currentCallbacks, callbackArgs);
        }.bind(this));
    }

    /**
     * Create a directory
     *
     * @param {function (?string, FileSystemStats=)=} callback Callback resolved with a
     *      FileSystemError string or the stat object for the created directory.
     */
    public create(callback?: (err: string | null, stats?: FileSystemStats) => void): void {
        callback = callback || function (): void { /* Do nothing */ };

        // Block external change events until after the write has finished
        this._fileSystem._beginChange();

        this._impl.mkdir(this._path, function (this: Directory, err: string, stat: FileSystemStats): void {
            if (err) {
                this._clearCachedData();
                try {
                    callback!(err);
                    return;
                } finally {
                    // Unblock external change events
                    this._fileSystem._endChange();
                }
            }

            const parent = this._fileSystem.getDirectoryForPath(this.parentPath);

            // Update internal filesystem state
            if (this._isWatched()) {
                this._stat = stat;
            }

            this._fileSystem._handleDirectoryChange(parent, function (this: Directory, added: Array<FileSystemEntry>, removed: Array<FileSystemEntry>): void {
                try {
                    callback!(null, stat);
                } finally {
                    if (parent._isWatched()) {
                        this._fileSystem._fireChangeEvent(parent, added, removed);
                    }
                    // Unblock external change events
                    this._fileSystem._endChange();
                }
            }.bind(this));
        }.bind(this));
    }
}

export = Directory;
