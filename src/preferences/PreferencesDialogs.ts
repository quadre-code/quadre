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

/**
 * PreferencesDialogs
 *
 */

import * as Dialogs from "widgets/Dialogs";
import * as ProjectManager from "project/ProjectManager";
import * as StringUtils from "utils/StringUtils";
import * as Strings from "strings";
import * as SettingsDialogTemplate from "text!htmlContent/project-settings-dialog.html";
import * as Mustache from "thirdparty/mustache/mustache";
import * as PathUtils from "thirdparty/path-utils/path-utils";

/**
 * Validate that text string is a valid base url which should map to a server folder
 * @param {string} url
 * @return {string} Empty string if valid, otherwise error string
 */
export function _validateBaseUrl(url) {
    let result = "";
    // Empty url means "no server mapping; use file directly"
    if (url === "") {
        return result;
    }

    const obj = PathUtils.parseUrl(url);
    if (!obj) {
        result = Strings.BASEURL_ERROR_UNKNOWN_ERROR;
    } else if (obj.href.search(/^(http|https):\/\//i) !== 0) {
        result = StringUtils.format(Strings.BASEURL_ERROR_INVALID_PROTOCOL, obj.href.substring(0, obj.href.indexOf("//")));
    } else if (obj.search !== "") {
        result = StringUtils.format(Strings.BASEURL_ERROR_SEARCH_DISALLOWED, obj.search);
    } else if (obj.hash !== "") {
        result = StringUtils.format(Strings.BASEURL_ERROR_HASH_DISALLOWED, obj.hash);
    } else {
        const index = url.search(/[ ^[\]{}<>\\"?]+/);
        if (index !== -1) {
            result = StringUtils.format(Strings.BASEURL_ERROR_INVALID_CHAR, url[index]);
        }
    }

    return result;
}

/**
 * Show a dialog that shows the project preferences
 * @param {string} baseUrl Initial value
 * @param {string} errorMessage Error to display
 * @return {Dialog} A Dialog object with an internal promise that will be resolved with the ID
 *      of the clicked button when the dialog is dismissed. Never rejected.
 */
export function showProjectPreferencesDialog(baseUrl, errorMessage) {
    // Title
    let projectName = "";
    const projectRoot = ProjectManager.getProjectRoot();
    if (projectRoot) {
        projectName = projectRoot.name;
    }
    const title = StringUtils.format(Strings.PROJECT_SETTINGS_TITLE, projectName);

    const templateVars = {
        title        : title,
        baseUrl      : baseUrl,
        errorMessage : errorMessage,
        Strings      : Strings
    };

    const dialog = Dialogs.showModalDialogUsingTemplate(Mustache.render(SettingsDialogTemplate, templateVars));

    dialog.done(function (id) {
        if (id === Dialogs.DIALOG_BTN_OK) {
            const baseUrlValue = $baseUrlControl.val();
            const result = _validateBaseUrl(baseUrlValue);
            if (result === "") {
                ProjectManager.setBaseUrl(baseUrlValue);
            } else {
                // Re-invoke dialog with result (error message)
                showProjectPreferencesDialog(baseUrlValue, result);
            }
        }
    });

    // Give focus to first control
    const $baseUrlControl = dialog.getElement().find(".url");
    $baseUrlControl.focus();

    return dialog;
}
