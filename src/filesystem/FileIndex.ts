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

/**
 * FileIndex is an internal module used by FileSystem to maintain an index of all files and directories.
 *
 * This module is *only* used by FileSystem, and should not be called directly.
 */

/**
 * @constructor
 */
class FileIndex {
    /**
     * Master index
     *
     * @type {Object.<string, File|Directory>} Maps a fullPath to a File or Directory object
     */
    private _index;

    constructor() {
        this._index = {};
    }

    /**
     * Clear the file index cache.
     */
    public clear() {
        this._index = {};
    }

    /**
     * Visits every entry in the entire index; no stopping condition.
     * @param {!function(FileSystemEntry, string):void} Called with an entry and its fullPath
     */
    public visitAll(visitor) {
        for (const path in this._index) {
            if (this._index.hasOwnProperty(path)) {
                visitor(this._index[path], path);
            }
        }
    }

    /**
     * Add an entry.
     *
     * @param {FileSystemEntry} entry The entry to add.
     */
    public addEntry(entry) {
        this._index[entry.fullPath] = entry;
    }

    /**
     * Remove an entry.
     *
     * @param {FileSystemEntry} entry The entry to remove.
     */
    public removeEntry(entry) {
        const path = entry.fullPath;

        function replaceMember(property) {
            const member = entry[property];
            if (typeof member === "function") {
                entry[property] = function () {
                    console.warn("FileSystemEntry used after being removed from index: ", path);
                    return member.apply(entry, arguments);
                };
            }
        }

        delete this._index[path];

        for (const property in entry) {
            if (entry.hasOwnProperty(property)) {
                replaceMember(property);
            }
        }
    }

    /**
     * Notify the index that an entry has been renamed. This updates
     * all affected entries in the index.
     *
     * @param {string} oldPath
     * @param {string} newPath
     * @param {boolean} isDirectory
     */
    public entryRenamed(oldPath, newPath, isDirectory) {
        const renameMap = {};

        // Find all entries affected by the rename and put into a separate map.
        for (const path in this._index) {
            if (this._index.hasOwnProperty(path)) {
                // See if we have a match. For directories, see if the path
                // starts with the old name. This is safe since paths always end
                // with '/'. For files, see if there is an exact match between
                // the path and the old name.
                if (isDirectory ? path.indexOf(oldPath) === 0 : path === oldPath) {
                    renameMap[path] = newPath + path.substr(oldPath.length);
                }
            }
        }

        // Do the rename.
        for (const path in renameMap) {
            if (renameMap.hasOwnProperty(path)) {
                const item = this._index[path];

                // Sanity check to make sure the item and path still match
                console.assert(item.fullPath === path);

                delete this._index[path];
                this._index[renameMap[path]] = item;
                item._setPath(renameMap[path]);
            }
        }
    }

    /**
     * Returns the cached entry for the specified path, or undefined
     * if the path has not been cached.
     *
     * @param {string} path The path of the entry to return.
     * @return {File|Directory} The entry for the path, or undefined if it hasn't
     *              been cached yet.
     */
    public getEntry(path) {
        return this._index[path];
    }
}

export = FileIndex;
