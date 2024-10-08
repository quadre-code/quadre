/*
 * Copyright (c) 2012 - 2017 Adobe Systems Incorporated. All rights reserved.
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

/*global less */

/**
 * ExtensionUtils defines utility methods for implementing extensions.
 */

import * as Async from "utils/Async";
import * as FileSystem from "filesystem/FileSystem";
import * as FileUtils from "file/FileUtils";
import * as PathUtils from "thirdparty/path-utils/path-utils";
import * as PreferencesManager from "preferences/PreferencesManager";

/**
 * Appends a <style> tag to the document's head.
 *
 * @param {!string} css CSS code to use as the tag's content
 * @return {!HTMLStyleElement} The generated HTML node
 */
export function addEmbeddedStyleSheet(css: string): HTMLElement {
    return $("<style>").text(css).appendTo("head")[0];
}

/**
 * Appends a <link> tag to the document's head.
 *
 * @param {!string} url URL to a style sheet
 * @param {$.Deferred=} deferred Optionally check for load and error events
 * @return {!HTMLLinkElement} The generated HTML node
 */
export function addLinkedStyleSheet(url: string, deferred: JQueryDeferred<JQueryEventObject>): HTMLElement {
    const attributes = {
        type: "text/css",
        rel:  "stylesheet",
        href: url
    };

    const $link = $("<link/>").attr(attributes);

    if (deferred) {
        $link.on("load", deferred.resolve).on("error", deferred.reject);
    }

    $link.appendTo("head");

    return $link[0];
}

/**
 * getModuleUrl returns different urls for win platform
 * so that's why we need a different check here
 * @see #getModuleUrl
 * @param {!string} pathOrUrl that should be checked if it's absolute
 * @return {!boolean} returns true if pathOrUrl is absolute url on win platform
 *                    or when it's absolute path on other platforms
 */
function isAbsolutePathOrUrl(pathOrUrl: string): boolean {
    return brackets.platform === "win" ? PathUtils.isAbsoluteUrl(pathOrUrl) : FileSystem.isAbsolutePath(pathOrUrl);
}

/**
 * Parses LESS code and returns a promise that resolves with plain CSS code.
 *
 * Pass the {@link url} argument to resolve relative URLs contained in the code.
 * Make sure URLs in the code are wrapped in quotes, like so:
 *     background-image: url("image.png");
 *
 * @param {!string} code LESS code to parse
 * @param {?string} url URL to the file containing the code
 * @return {!$.Promise} A promise object that is resolved with CSS code if the LESS code can be parsed
 */
export function parseLessCode(code: string, url: string): JQueryPromise<string> {
    const result = $.Deferred<string>();
    const options: Less.Options = {
        math: "always"
    };

    if (url) {
        const dir = url.slice(0, url.lastIndexOf("/") + 1);

        options.filename = url;
        options.rootpath = dir;

        if (isAbsolutePathOrUrl(url)) {
            (options as any).currentFileInfo = {
                currentDirectory: dir,
                entryPath: dir,
                filename: url,
                rootFilename: url,
                rootpath: dir
            };
        }
    }

    less.render(code, options, function onParse(err, tree) {
        if (err) {
            result.reject(err);
        } else {
            result.resolve(tree!.css);
        }
    });

    return result.promise();
}

/**
 * Returns a path to an extension module.
 *
 * @param {!module} module Module provided by RequireJS
 * @param {?string} path Relative path from the extension folder to a file
 * @return {!string} The path to the module's folder
 */
export function getModulePath(module, path: string): string {
    let modulePath = module.uri.substr(0, module.uri.lastIndexOf("/") + 1);
    if (path) {
        modulePath += path;
    }

    return modulePath;
}

/**
 * Returns a URL to an extension module.
 *
 * @param {!module} module Module provided by RequireJS
 * @param {?string} path Relative path from the extension folder to a file
 * @return {!string} The URL to the module's folder
 */
export function getModuleUrl(module, path: string): string {
    let url = encodeURI(getModulePath(module, path));

    // On Windows, $.get() fails if the url is a full pathname. To work around this,
    // prepend "file:///". On the Mac, $.get() works fine if the url is a full pathname,
    // but *doesn't* work if it is prepended with "file://". Go figure.
    // However, the prefix "file://localhost" does work.
    if (brackets.platform === "win" && url.indexOf(":") !== -1) {
        url = "file:///" + url;
    }

    return url;
}

/**
 * Performs a GET request using a path relative to an extension module.
 *
 * The resulting URL can be retrieved in the resolve callback by accessing
 *
 * @param {!module} module Module provided by RequireJS
 * @param {!string} path Relative path from the extension folder to a file
 * @return {!$.Promise} A promise object that is resolved with the contents of the requested file
 */
export function loadFile(module, path: string): JQueryXHR {
    const url     = PathUtils.isAbsoluteUrl(path) ? path : getModuleUrl(module, path);
    const promise = $.get(url);

    return promise;
}

/**
 * Loads a style sheet (CSS or LESS) relative to the extension module.
 *
 * @param {!module} module Module provided by RequireJS
 * @param {!string} path Relative path from the extension folder to a CSS or LESS file
 * @return {!$.Promise} A promise object that is resolved with an HTML node if the file can be loaded.
 */
export function loadStyleSheet(module, path: string): JQueryPromise<HTMLElement> {
    const result = $.Deferred<HTMLElement>();

    loadFile(module, path)
        .done(function (this: any, content) {
            const url = this.url;

            if (url.slice(-5) === ".less") {
                parseLessCode(content, url)
                    .done(function (css) {
                        result.resolve(addEmbeddedStyleSheet(css!));
                    })
                    .fail(result.reject);
            } else {
                const deferred = $.Deferred<JQueryEventObject>();
                const link = addLinkedStyleSheet(url, deferred);

                deferred
                    .done(function () {
                        result.resolve(link);
                    })
                    .fail(result.reject);
            }
        })
        .fail(result.reject);

    // Summarize error info to console for easier debugging
    result.fail(function (error, textStatus, httpError) {
        if (error.readyState !== undefined) {
            // If first arg is a jQXHR object, the real error info is in the next two args
            console.error("[Extension] Unable to read stylesheet " + path + ":", textStatus, httpError);
        } else {
            console.error("[Extension] Unable to process stylesheet " + path, error);
        }
    });

    return result.promise();
}

/**
 * Loads the package.json file in the given extension folder as well as any additional
 * metadata.
 *
 * If there's a .disabled file in the extension directory, then the content of package.json
 * will be augmented with disabled property set to true. It will override whatever value of
 * disabled might be set.
 *
 * @param {string} folder The extension folder.
 * @return {$.Promise} A promise object that is resolved with the parsed contents of the package.json file,
 *     or rejected if there is no package.json with the boolean indicating whether .disabled file exists.
 */
export function loadMetadata(folder: string): JQueryPromise<any> {
    const packageJSONFile = FileSystem.getFileForPath(folder + "/package.json");
    const disabledFile = FileSystem.getFileForPath(folder + "/.disabled");
    const baseName = FileUtils.getBaseName(folder);
    const result = $.Deferred<any>();
    const jsonPromise = $.Deferred();
    const disabledPromise = $.Deferred();
    let json;
    let disabled;
    FileUtils.readAsText(packageJSONFile)
        .then(function (text) {
            try {
                json = JSON.parse(text!);
                jsonPromise.resolve();
            } catch (e) {
                jsonPromise.reject();
            }
        })
        .fail(jsonPromise.reject);
    disabledFile.exists(function (err, exists) {
        if (err) {
            disabled = false;
        } else {
            disabled = exists;
        }

        const defaultDisabled = PreferencesManager.get("extensions.default.disabled");
        if (Array.isArray(defaultDisabled) && defaultDisabled.indexOf(folder) !== -1) {
            console.warn("Default extension has been disabled on startup: " + baseName);
            disabled = true;
        }

        disabledPromise.resolve();
    });
    Async.waitForAll([jsonPromise, disabledPromise])
        .always(function () {
            if (!json) {
                // if we don't have any metadata for the extension
                // we should still create an empty one, so we can attach
                // disabled property on it in case it's disabled
                json = {
                    name: baseName,
                    title: baseName
                };
            }
            json.disabled = disabled;
            result.resolve(json);
        });
    return result.promise();
}
