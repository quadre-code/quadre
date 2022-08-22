/*
 * Copyright (c) 2018 - 2021 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2022 - present The quadre code authors. All rights reserved.
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

const FileSystemError = brackets.getModule("filesystem/FileSystemError");
const FileSystemStats = brackets.getModule("filesystem/FileSystemStats");

const SESSION_START_TIME = new Date();

/**
 * Create a new file stat. See the FileSystemStats class for more details.
 *
 * @param {!string} fullPath The full path for this File.
 * @return {FileSystemStats} stats.
 */
function _getStats(uri) {
    return new FileSystemStats({
        isFile: true,
        mtime: SESSION_START_TIME.toISOString(),
        size: 0,
        realPath: uri,
        hash: uri
    });
}

function _getFileName(filePath) {
    let fileName = filePath.split("/").pop();

    if (!fileName.trim()) {
        fileName = filePath.trim().slice(0, -1);
        fileName = fileName.split("/").pop();
    }

    return fileName;
}

/**
 * Model for a RemoteFile.
 *
 * This class should *not* be instantiated directly. Use FileSystem.getFileForPath
 *
 * See the FileSystem class for more details.
 */
class RemoteFile {
    /**
     * Cached contents of this file. This value is nullable but should NOT be undefined.
     * @private
     * @type {?string}
     */
    private _contents = null;

    /**
     * @private
     * @type {?string}
     */
    private _encoding = "utf8";

    /**
     * @private
     * @type {?bool}
     */
    // @ts-ignore
    private _preserveBOM = false;

    private _isFile: boolean;
    private _isDirectory: boolean;
    public readOnly: boolean;
    private _path: string;
    private _stat;
    private _id: string;
    private _name: string;
    private _fileSystem;
    public donotWatch: boolean;
    public protocol;
    public encodedPath: string;
    private _parentPath: string;

    /**
     * @constructor
     * @param {!string} fullPath The full path for this File.
     * @param {!FileSystem} fileSystem The file system associated with this File.
     */
    constructor(protocol, fullPath, fileSystem) {
        this._isFile = true;
        this._isDirectory = false;
        this.readOnly = true;
        this._path = fullPath;
        this._stat = _getStats(fullPath);
        this._id = fullPath;
        this._name = _getFileName(fullPath);
        this._fileSystem = fileSystem;
        this.donotWatch = true;
        this.protocol = protocol;
        this.encodedPath = fullPath;
    }

    // Add "fullPath", "name", "parent", "id", "isFile" and "isDirectory" getters
    get fullPath() { return this._path; }
    set fullPath(value: string) { throw new Error("Cannot set fullPath"); }

    get name() { return this._name; }
    set name(value: string) { throw new Error("Cannot set name"); }

    get parentPath() { return this._parentPath; }
    set parentPath(value: string) { throw new Error("Cannot set parentPath"); }

    get id() { return this._id; }
    set id(value: string) { throw new Error("Cannot set id"); }

    get isFile() { return this._isFile; }
    set isFile(value: boolean) { throw new Error("Cannot set isFile"); }

    get isDirectory() { return this._isDirectory; }
    set isDirectory(value: boolean) { throw new Error("Cannot set isDirectory"); }

    get _impl() { return this._fileSystem._impl; }
    set _impl(value: string) { throw new Error("Cannot set _impl"); }

    /**
     * Helpful toString for debugging and equality check purposes
     */
    public toString() {
        return "[RemoteFile " + this._path + "]";
    }

    /**
     * Returns the stats for the remote entry.
     *
     * @param {function (?string, FileSystemStats=)} callback Callback with a
     *      FileSystemError string or FileSystemStats object.
     */
    public stat(callback) {
        if (this._stat) {
            callback(null, this._stat);
        } else {
            callback(FileSystemError.NOT_FOUND);
        }
    }

    /**
     * Clear any cached data for this file. Note that this explicitly does NOT
     * clear the file's hash.
     * @private
     */
    // @ts-ignore
    private _clearCachedData() {
        // no-op
    }

    /**
     * Reads a remote file.
     *
     * @param {Object=} options Currently unused.
     * @param {function (?string, string=, FileSystemStats=)} callback Callback that is passed the
     *              FileSystemError string or the file's contents and its stats.
     */
    public read(options, callback) {
        if (typeof (options) === "function") {
            callback = options;
        }
        this._encoding = "utf8";

        if (this._contents !== null && this._stat) {
            callback(null, this._contents, this._encoding, this._stat);
            return;
        }

        const self = this;
        $.ajax({
            url: this.fullPath
        })
            .done(function (data) {
                self._contents = data;
                callback(null, data, self._encoding, self._stat);
            })
            .fail(function (e) {
                callback(FileSystemError.NOT_FOUND);
            });
    }

    /**
     * Write a file.
     *
     * @param {string} data Data to write.
     * @param {object=} options Currently unused.
     * @param {function (?string, FileSystemStats=)=} callback Callback that is passed the
     *              FileSystemError string or the file's new stats.
     */
    public write(data, encoding, callback) {
        if (typeof (encoding) === "function") {
            callback = encoding;
        }
        callback(FileSystemError.NOT_FOUND);
    }

    public exists(callback) {
        callback(null, true);
    }

    public unlink(callback) {
        callback(FileSystemError.NOT_FOUND);
    }

    public rename(newName, callback) {
        callback(FileSystemError.NOT_FOUND);
    }

    public moveToTrash(callback) {
        callback(FileSystemError.NOT_FOUND);
    }
}

// Export this class
export = RemoteFile;
