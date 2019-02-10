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
 * To ensure cache coherence, current and future asynchronous state-changing
 * operations of FileSystemEntry and its subclasses should implement the
 * following high-level sequence of steps:
 *
 * 1. Block external filesystem change events;
 * 2. Execute the low-level state-changing operation;
 * 3. Update the internal filesystem state, including caches;
 * 4. Apply the callback;
 * 5. Fire an appropriate internal change notification; and
 * 6. Unblock external change events.
 *
 * Note that because internal filesystem state is updated first, both the original
 * caller and the change notification listeners observe filesystem state that is
 * current w.r.t. the operation. Furthermore, because external change events are
 * blocked before the operation begins, listeners will only receive the internal
 * change event for the operation and not additional (or possibly inconsistent)
 * external change events.
 *
 * State-changing operations that block external filesystem change events must
 * take care to always subsequently unblock the external change events in all
 * control paths. It is safe to assume, however, that the underlying impl will
 * always apply the callback with some value.

 * Caches should be conservative. Consequently, the entry's cached data should
 * always be cleared if the underlying impl's operation fails. This is the case
 * event for read-only operations because an unexpected failure implies that the
 * system is in an unknown state. The entry should communicate this by failing
 * where appropriate, and should not use the cache to hide failure.
 *
 * Only watched entries should make use of cached data because change events are
 * only expected for such entries, and change events are used to granularly
 * invalidate out-of-date caches.
 *
 * By convention, callbacks are optional for asynchronous, state-changing
 * operations, but required for read-only operations. The first argument to the
 * callback should always be a nullable error string from FileSystemError.
 */

import FileSystemError = require("filesystem/FileSystemError");
import WatchedRoot     = require("filesystem/WatchedRoot");
import FileSystemStats = require("filesystem/FileSystemStats");
import { EntryKind } from "filesystem/EntryKind";

const VISIT_DEFAULT_MAX_DEPTH = 100;
const VISIT_DEFAULT_MAX_ENTRIES = 30000;

/* Counter to give every entry a unique id */
let nextId = 0;

/**
 * Model for a file system entry. This is the base class for File and Directory,
 * and is never used directly.
 *
 * See the File, Directory, and FileSystem classes for more details.
 *
 * @constructor
 * @param {string} path The path for this entry.
 * @param {FileSystem} fileSystem The file system associated with this entry.
 */
class FileSystemEntry {
    private _id;

    /**
     * Cached stat object for this file.
     * @type {?FileSystemStats}
     */
    protected _stat?: FileSystemStats;

    /**
     * Parent file system.
     * @type {!FileSystem}
     */
    protected _fileSystem;

    /**
     * The path of this entry.
     * @type {string}
     */
    protected _path = null;

    /**
     * The name of this entry.
     * @type {string}
     */
    private _name = null;

    /**
     * The parent of this entry.
     * @type {string}
     */
    private _parentPath;

    /**
     * Whether or not the entry is a file
     * @type {boolean}
     */
    protected _isFile = false;

    /**
     * Whether or not the entry is a directory
     * @type {boolean}
     */
    protected _isDirectory = false;

    /**
     * Cached copy of this entry's watched root
     * @type {entry: File|Directory, filter: function(FileSystemEntry):boolean, active: boolean}
     */
    private _watchedRoot;

    /**
     * Cached result of _watchedRoot.filter(this.name, this.parentPath).
     * @type {boolean}
     */
    private _watchedRootFilterResult;

    constructor(path, fileSystem, entryKind: EntryKind) {
        if (entryKind === EntryKind.Directory) {
            this._isDirectory = true;
        } else if (entryKind === EntryKind.File) {
            this._isFile = true;
        }
        this._setPath(path);
        this._fileSystem = fileSystem;
        this._id = nextId++;
    }

    // Add "fullPath", "name", "parent", "id", "isFile" and "isDirectory" getters

    public get fullPath() { return this._path; }
    public set fullPath(fullPath) { throw new Error("Cannot set fullPath"); }

    public get name() { return this._name; }
    public set name(name) { throw new Error("Cannot set name"); }

    public get parentPath() { return this._parentPath; }
    public set parentPath(parentPath) { throw new Error("Cannot set parentPath"); }

    public get id() { return this._id; }
    public set id(id) { throw new Error("Cannot set id"); }

    public get isFile() { return this._isFile; }
    public set isFile(isFile) { throw new Error("Cannot set isFile"); }

    public get isDirectory() { return this._isDirectory; }
    public set isDirectory(isDirectory) { throw new Error("Cannot set isDirectory"); }

    public get _impl() { return this._fileSystem._impl; }
    public set _impl(_impl) { throw new Error("Cannot set _impl"); }

    /**
     * Determines whether or not the entry is watched.
     * @param {boolean=} relaxed If falsey, the method will only return true if
     *      the watched root is fully active. If true, the method will return
     *      true if the watched root is either starting up or fully active.
     * @return {boolean}
     */
    protected _isWatched(relaxed = false) {
        let watchedRoot = this._watchedRoot;
        let filterResult = this._watchedRootFilterResult;

        if (!watchedRoot) {
            watchedRoot = this._fileSystem._findWatchedRootForPath(this._path);

            if (watchedRoot) {
                this._watchedRoot = watchedRoot;
                if (watchedRoot.entry !== this) { // avoid creating entries for root's parent
                    const parentEntry = this._fileSystem.getDirectoryForPath(this._parentPath);
                    if (parentEntry._isWatched() === false) {
                        filterResult = false;
                    } else {
                        filterResult = watchedRoot.filter(this._name, this._parentPath);
                    }
                } else { // root itself is watched
                    filterResult = true;
                }
                this._watchedRootFilterResult = filterResult;
            }
        }

        if (watchedRoot) {
            if (watchedRoot.status === WatchedRoot.ACTIVE ||
                    (relaxed && watchedRoot.status === WatchedRoot.STARTING)) {
                return filterResult;
            }

            // We had a watched root, but it's no longer active, so it must now be invalid.
            this._watchedRoot = undefined;
            this._watchedRootFilterResult = false;
            this._clearCachedData();
        }
        return false;
    }

    /**
     * Update the path for this entry
     * @private
     * @param {String} newPath
     */
    private _setPath(newPath) {
        const parts = newPath.split("/");
        if (this.isDirectory) {
            parts.pop(); // Remove the empty string after last trailing "/"
        }
        this._name = parts[parts.length - 1];
        parts.pop(); // Remove name

        if (parts.length > 0) {
            this._parentPath = parts.join("/") + "/";
        } else {
            // root directories have no parent path
            this._parentPath = null;
        }

        this._path = newPath;

        const watchedRoot = this._watchedRoot;
        if (watchedRoot) {
            if (newPath.indexOf(watchedRoot.entry.fullPath) === 0) {
                // Update watchedRootFilterResult
                this._watchedRootFilterResult = watchedRoot.filter(this._name, this._parentPath);
            } else {
                // The entry was moved outside of the watched root
                this._watchedRoot = null;
                this._watchedRootFilterResult = false;
            }
        }
    }

    /**
     * Clear any cached data for this entry
     * @private
     */
    protected _clearCachedData() {
        this._stat = undefined;
    }

    /**
     * Helpful toString for debugging purposes
     */
    public toString() {
        return "[" + (this.isDirectory ? "Directory " : "File ") + this._path + "]";
    }

    /**
     * Check to see if the entry exists on disk. Note that there will NOT be an
     * error returned if the file does not exist on the disk; in that case the
     * error parameter will be null and the boolean will be false. The error
     * parameter will only be truthy when an unexpected error was encountered
     * during the test, in which case the state of the entry should be considered
     * unknown.
     *
     * @param {function (?string, boolean)} callback Callback with a FileSystemError
     *      string or a boolean indicating whether or not the file exists.
     */
    public exists(callback) {
        if (this._stat) {
            callback(null, true);
            return;
        }

        this._impl.exists(this._path, function (this: FileSystemEntry, err, exists) {
            if (err) {
                this._clearCachedData();
                callback(err);
                return;
            }

            if (!exists) {
                this._clearCachedData();
            }

            callback(null, exists);
        }.bind(this));
    }

    /**
     * Returns the stats for the entry.
     *
     * @param {function (?string, FileSystemStats=)} callback Callback with a
     *      FileSystemError string or FileSystemStats object.
     */
    public stat(callback) {
        if (this._stat) {
            callback(null, this._stat);
            return;
        }

        this._impl.stat(this._path, function (this: FileSystemEntry, err, stat) {
            if (err) {
                this._clearCachedData();
                callback(err);
                return;
            }

            if (this._isWatched()) {
                this._stat = stat;
            }

            callback(null, stat);
        }.bind(this));
    }

    /**
     * Rename this entry.
     *
     * @param {string} newFullPath New path & name for this entry.
     * @param {function (?string)=} callback Callback with a single FileSystemError
     *      string parameter.
     */
    public rename(newFullPath, callback) {
        callback = callback || function () { /* Do nothing */ };

        // Block external change events until after the write has finished
        this._fileSystem._beginChange();

        this._impl.rename(this._path, newFullPath, function (this: FileSystemEntry, err) {
            const oldFullPath = this._path;

            try {
                if (err) {
                    this._clearCachedData();
                    callback(err);
                    return;
                }

                // Update internal filesystem state
                this._fileSystem._handleRename(this._path, newFullPath, this.isDirectory);

                try {
                    // Notify the caller
                    callback(null);
                } finally {
                    // Notify rename listeners
                    this._fileSystem._fireRenameEvent(oldFullPath, newFullPath);
                }
            } finally {
                // Unblock external change events
                this._fileSystem._endChange();
            }
        }.bind(this));
    }

    /**
     * Permanently delete this entry. For Directories, this will delete the directory
     * and all of its contents. For reversible delete, see moveToTrash().
     *
     * @param {function (?string)=} callback Callback with a single FileSystemError
     *      string parameter.
     */
    public unlink(callback) {
        callback = callback || function () { /* Do nothing */ };

        // Block external change events until after the write has finished
        this._fileSystem._beginChange();

        this._clearCachedData();
        this._impl.unlink(this._path, function (this: FileSystemEntry, err) {
            const parent = this._fileSystem.getDirectoryForPath(this.parentPath);

            // Update internal filesystem state
            this._fileSystem._handleDirectoryChange(parent, function (this: FileSystemEntry, added, removed) {
                try {
                    // Notify the caller
                    callback(err);
                } finally {
                    if (parent._isWatched()) {
                        // Notify change listeners
                        this._fileSystem._fireChangeEvent(parent, added, removed);
                    }

                    // Unblock external change events
                    this._fileSystem._endChange();
                }
            }.bind(this));
        }.bind(this));
    }

    /**
     * Move this entry to the trash. If the underlying file system doesn't support move
     * to trash, the item is permanently deleted.
     *
     * @param {function (?string)=} callback Callback with a single FileSystemError
     *      string parameter.
     */
    public moveToTrash(callback) {
        if (!this._impl.moveToTrash) {
            this.unlink(callback);
            return;
        }

        callback = callback || function () { /* Do nothing */ };

        // Block external change events until after the write has finished
        this._fileSystem._beginChange();

        this._clearCachedData();
        this._impl.moveToTrash(this._path, function (this: FileSystemEntry, err) {
            const parent = this._fileSystem.getDirectoryForPath(this.parentPath);

            // Update internal filesystem state
            this._fileSystem._handleDirectoryChange(parent, function (this: FileSystemEntry, added, removed) {
                try {
                    // Notify the caller
                    callback(err);
                } finally {
                    if (parent._isWatched()) {
                        // Notify change listeners
                        this._fileSystem._fireChangeEvent(parent, added, removed);
                    }

                    // Unblock external change events
                    this._fileSystem._endChange();
                }
            }.bind(this));
        }.bind(this));
    }

    public getContents(callback: (err, entries, entriesStats) => void) {
        throw new Error("FileSystemEntry: should never reach here!");
    }

    /**
     * Private helper function for FileSystemEntry.visit that requires sanitized options.
     *
     * @private
     * @param {FileSystemStats} stats - the stats for this entry
     * @param {{string: boolean}} visitedPaths - the set of fullPaths that have already been visited
     * @param {function(FileSystemEntry): boolean} visitor - A visitor function, which is
     *      applied to descendent FileSystemEntry objects. If the function returns false for
     *      a particular Directory entry, that directory's descendents will not be visited.
     * @param {{maxDepth: number, maxEntriesCounter: {value: number}, sortList: boolean}} options
     * @param {function(?string)=} callback Callback with single FileSystemError string parameter.
     */
    private _visitHelper(stats, visitedPaths, visitor, options, callback) {
        let maxDepth = options.maxDepth;
        const maxEntriesCounter = options.maxEntriesCounter;
        const sortList = options.sortList;

        if (maxEntriesCounter.value-- <= 0 || maxDepth-- < 0) {
            // The outer FileSystemEntry.visit call is responsible for applying
            // the main callback to FileSystemError.TOO_MANY_FILES in this case
            callback(null);
            return;
        }

        if (this.isDirectory) {
            const visitedPath = stats.realPath || this.fullPath;

            if (visitedPaths.hasOwnProperty(visitedPath)) {
                // Link cycle detected
                callback(null);
                return;
            }

            visitedPaths[visitedPath] = true;
        }

        if (!visitor(this) || this.isFile) {
            callback(null);
            return;
        }

        this.getContents(function (err, entries, entriesStats) {
            if (err) {
                callback(err);
                return;
            }

            let counter = entries.length;
            if (counter === 0) {
                callback(null);
                return;
            }

            function helperCallback(err) {
                if (--counter === 0) {
                    callback(null);
                }
            }

            const nextOptions = {
                maxDepth: maxDepth,
                maxEntriesCounter: maxEntriesCounter,
                sortList : sortList
            };

            // sort entries if required
            function compareFilesWithIndices(index1, index2) {
                return entries[index1]._name.toLocaleLowerCase().localeCompare(entries[index2]._name.toLocaleLowerCase());
            }
            if (sortList) {
                const fileIndexes: Array<number> = [];
                for (let i = 0; i < entries.length; i++) {
                    fileIndexes[i] = i;
                }
                fileIndexes.sort(compareFilesWithIndices);
                fileIndexes.forEach(function (fileIndex) {
                    const stats = entriesStats[fileIndexes[fileIndex]];
                    entries[fileIndexes[fileIndex]]._visitHelper(stats, visitedPaths, visitor, nextOptions, helperCallback);
                });
            } else {
                entries.forEach(function (entry, index) {
                    const stats = entriesStats[index];
                    entry._visitHelper(stats, visitedPaths, visitor, nextOptions, helperCallback);
                });
            }
        }.bind(this));
    }

    /**
     * Visit this entry and its descendents with the supplied visitor function.
     * Correctly handles symbolic link cycles and options can be provided to limit
     * search depth and total number of entries visited. No particular traversal
     * order is guaranteed; instead of relying on such an order, it is preferable
     * to use the visit function to build a list of visited entries, sort those
     * entries as desired, and then process them. Whenever possible, deep
     * filesystem traversals should use this method.
     *
     * @param {function(FileSystemEntry): boolean} visitor - A visitor function, which is
     *      applied to this entry and all descendent FileSystemEntry objects. If the function returns
     *      false for a particular Directory entry, that directory's descendents will not be visited.
     * @param {{maxDepth: number=, maxEntries: number=}=} options
     * @param {function(?string)=} callback Callback with single FileSystemError string parameter.
     */
    public visit(visitor, options, callback) {
        if (typeof options === "function") {
            callback = options;
            options = {};
        } else {
            if (options === undefined) {
                options = {};
            }

            callback = callback || function () { /* Do nothing */ };
        }

        if (options.maxDepth === undefined) {
            options.maxDepth = VISIT_DEFAULT_MAX_DEPTH;
        }

        if (options.maxEntries === undefined) {
            options.maxEntries = VISIT_DEFAULT_MAX_ENTRIES;
        }

        options.maxEntriesCounter = { value: options.maxEntries };

        this.stat(function (this: FileSystemEntry, err, stats) {
            if (err) {
                callback(err);
                return;
            }

            this._visitHelper(stats, {}, visitor, options, function (err) {
                if (callback) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    if (options.maxEntriesCounter.value < 0) {
                        callback(FileSystemError.TOO_MANY_ENTRIES);
                        return;
                    }

                    callback(null);
                }
            }.bind(this));
        }.bind(this));
    }
}

export = FileSystemEntry;
