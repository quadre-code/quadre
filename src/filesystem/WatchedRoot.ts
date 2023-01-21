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

import type FileSystemEntry = require("filesystem/FileSystemEntry");

/*
 * Represents file or directory structure watched by the FileSystem. If the
 * entry is a directory, all children (that pass the supplied filter function)
 * are also watched. A WatchedRoot object begins and ends its life in the
 * INACTIVE state. While in the process of starting up watchers, the WatchedRoot
 * is in the STARTING state. When watchers are ready, the WatchedRoot enters
 * the ACTIVE state.
 *
 * See the FileSystem class for more details.
 *
 * @constructor
 * @param {File|Directory} entry
 * @param {function(string, string):boolean} filter
 * @param {Array<string>} filterGlobs
 */
class WatchedRoot {
    // Status constants
    public static INACTIVE = 0;
    public static STARTING = 1;
    public static ACTIVE = 2;

    /**
     * @type {File|Directory}
     */
    public entry;

    /**
     * @type {function(string, string):boolean}
     */
    public filter;

    /**
     * @type {Array<string>}
     */
    public filterGlobs;

    /**
     * @type {number}
     */
    public status = WatchedRoot.INACTIVE;

    constructor(entry: FileSystemEntry, filter: (name: string, parentPath: string | null) => boolean, filterGlobs: Array<string>) {
        this.entry = entry;
        this.filter = filter;
        this.filterGlobs = filterGlobs;
    }
}

export = WatchedRoot;
