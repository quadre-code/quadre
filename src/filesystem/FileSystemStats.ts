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

import type { FileSystemStatsOptions } from "filesystem/FileSystemStatsOptions";

/**
 * The FileSystemStats represents a particular FileSystemEntry's stats.
 */

class FileSystemStats {

    /**
     * Whether or not this is a stats object for a file
     * @type {boolean}
     */
    private _isFile = false;

    /**
     * Whether or not this is a stats object for a directory
     * @type {boolean}
     */
    private _isDirectory = false;

    /**
     * Modification time for a file
     * @type {Date}
     */
    private _mtime: Date;

    /**
     * Size in bytes of a file
     * @type {Number}
     */
    private _size: number;

    /**
     * Consistency hash for a file
     * @type {object}
     */
    public _hash: number | null = null;

    /**
     * The canonical path of this file or directory ONLY if it is a symbolic link,
     * and null otherwise.
     *
     * @type {?string}
     */
    private _realPath: string | null = null;

    /**
     * @constructor
     * @param {{isFile: boolean, mtime: Date, size: Number, realPath: ?string, hash: object}} options
     */
    constructor(options: FileSystemStatsOptions) {
        const isFile = options.isFile;

        this._isFile = isFile;
        this._isDirectory = !isFile;
        // in case of stats transferred over a node-domain,
        // mtime will have JSON-ified value which needs to be restored
        this._mtime = options.mtime instanceof Date ? options.mtime : new Date(options.mtime);
        this._size = options.size;
        // hash is a property introduced by brackets and it's calculated
        // as a valueOf modification time -> calculate here if it's not present
        this._hash = options.hash || this._mtime.valueOf();

        let realPath = options.realPath;
        if (realPath) {
            if (!isFile && realPath[realPath.length - 1] !== "/") {
                realPath += "/";
            }

            this._realPath = realPath;
        }
    }

    // Add "isFile", "isDirectory", "mtime" and "size" getters

    public get isFile(): boolean { return this._isFile; }
    public set isFile(isFile: boolean) { throw new Error("Cannot set isFile"); }

    public get isDirectory(): boolean { return this._isDirectory; }
    public set isDirectory(isDirectory: boolean) { throw new Error("Cannot set isDirectory"); }

    public get mtime(): Date { return this._mtime; }
    public set mtime(mtime: Date) { throw new Error("Cannot set mtime"); }

    public get size(): number { return this._size; }
    public set size(size: number) { throw new Error("Cannot set size"); }

    public get realPath(): string | null { return this._realPath; }
    public set realPath(realPath: string | null) { throw new Error("Cannot set realPath"); }
}

export = FileSystemStats;
