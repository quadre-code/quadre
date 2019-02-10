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
 * Represents a file that will never exist on disk - a placeholder backing file for untitled Documents. NO ONE
 * other than DocumentManager should create instances of InMemoryFile. It is valid to test for one (`instanceof
 * InMemoryFile`), but it's better to check `doc.isUntitled` where possible.
 *
 * Attempts to read/write an InMemoryFile will always fail, and exists() always yields false. InMemoryFile.fullPath
 * is just a placeholder, and should not be displayed anywhere in the UI; fullPath IS guaranteed to be unique, however.
 *
 * An InMemoryFile is not added to the filesystem index, so if you ask the the filesystem anything about this
 * object, it won't know what you're talking about (`filesystem.getFileForPath(someInMemFile.fullPath)` will not
 * return someInMemFile).
 */

import File = require("filesystem/File");
import FileSystemError = require("filesystem/FileSystemError");

class InMemoryFile extends File {
    public parentClass = File.prototype;

    constructor(fullPath, fileSystem) {
        super(fullPath, fileSystem);
    }

    // Stub out invalid calls inherited from File

    /**
     * Reject any attempts to read the file.
     *
     * Read a file as text.
     *
     * @param {Object=} options Currently unused.
     * @param {function (number, string, object)} callback
     */
    public read(options, callback) {
        if (typeof (options) === "function") {
            callback = options;
        }
        callback(FileSystemError.NOT_FOUND);
    }

    /**
     * Rejects any attempts to write the file.
     *
     * @param {string} data Data to write.
     * @param {string=} encoding Encoding for data. Defaults to UTF-8.
     * @param {!function (err, object)} callback Callback that is passed the
     *              error code and the file's new stats if the write is sucessful.
     */
    public write(data, encoding, callback) {
        if (typeof (encoding) === "function") {
            callback = encoding;
        }
        callback(FileSystemError.NOT_FOUND);
    }


    // Stub out invalid calls inherited from FileSystemEntry

    public exists(callback) {
        callback(null, false);
    }

    public static(callback) {
        callback(FileSystemError.NOT_FOUND);
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

export = InMemoryFile;
