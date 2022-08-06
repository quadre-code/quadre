/*
 * Copyright (c) 2019 - 2021 Adobe. All rights reserved.
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

import * as PathUtils from "thirdparty/path-utils/path-utils";
import * as FileUtils from "file/FileUtils";

export function uriToPath(uri): string {
    const url = PathUtils.parseUrl(uri);
    if (url.protocol !== "file:" || url.pathname === undefined) {
        return uri;
    }

    let filePath = decodeURIComponent(url.pathname);
    if (brackets.platform === "win") {
        if (filePath && filePath.includes(":/") && filePath[0] === "/") {
            filePath = filePath.substr(1);
        }
        return filePath;
    }
    return filePath;
}

export function pathToUri(filePath): string {
    let newPath = convertWinToPosixPath(filePath);
    if (newPath[0] !== "/") {
        newPath = "/" + newPath;
    }
    return encodeURI("file://" + newPath).replace(/[?#]/g, encodeURIComponent);
}

export function convertToWorkspaceFolders(paths) {
    const workspaceFolders = paths.map(function (folderPath) {
        const uri = pathToUri(folderPath);
        const name = FileUtils.getBaseName(folderPath);

        return {
            uri: uri,
            name: name
        };
    });

    return workspaceFolders;
}

export function convertPosixToWinPath(path): string {
    return path.replace(/\//g, "\\");
}

export function convertWinToPosixPath(path) {
    return path.replace(/\\/g, "/");
}
