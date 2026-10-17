/*
 * Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/// <amd-dependency path="module" name="module"/>

const AppInit              = brackets.getModule("utils/AppInit");
const PreferencesManager   = brackets.getModule("preferences/PreferencesManager");
const Strings              = brackets.getModule("strings");
const FileViewController   = brackets.getModule("project/FileViewController");
const ExtensionUtils       = brackets.getModule("utils/ExtensionUtils");
const NodeDomain           = brackets.getModule("utils/NodeDomain");
const FileUtils            = brackets.getModule("file/FileUtils");
const FileSystem           = brackets.getModule("filesystem/FileSystem");
import * as GraphicsFile from "./GraphicsFile";

/**
 * @private
 * @type {string} fullPath of the OpenWithExternalEditor Domain implementation
 */
const _domainPath = ExtensionUtils.getModulePath(module, "node/OpenWithExternalApplicationDomain");

/**
 * @private
 * @type {NodeDomain}
 */
const _nodeDomain = new NodeDomain("OpenWithExternalApplication", _domainPath);

let extensionToExtApplicationMap = {};

function convertUnixPathToWindowsPath(path) {
    if (brackets.platform === "win" && path && FileSystem.isAbsolutePath(path)) {
        path = path.replace(RegExp("/", "g"), "\\");
    }
    return path;
}

function _openWithExternalApplication(event, path) {
    _nodeDomain.exec("open", {
        path: convertUnixPathToWindowsPath(path),
        app: extensionToExtApplicationMap[FileUtils.getFileExtension(path).toLowerCase()]
    });
}

PreferencesManager.definePreference("externalApplications", "object", {}, {
    description: Strings.DESCRIPTION_EXTERNAL_APPLICATION_ASSOCIATE
});

PreferencesManager.on("change", "externalApplications", function () {
    extensionToExtApplicationMap = PreferencesManager.get("externalApplications");
    FileUtils.addExtensionToExternalAppList(Object.keys(extensionToExtApplicationMap));
});

FileViewController.on("openWithExternalApplication", _openWithExternalApplication);

AppInit.appReady(function () {
    GraphicsFile.init(_nodeDomain);
    extensionToExtApplicationMap = PreferencesManager.get("externalApplications");
    FileUtils.addExtensionToExternalAppList(Object.keys(extensionToExtApplicationMap));
});
