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

const PreferencesManager   = brackets.getModule("preferences/PreferencesManager");
const Strings              = brackets.getModule("strings");
const StringsUtils         = brackets.getModule("utils/StringUtils");
const ProjectManager       = brackets.getModule("project/ProjectManager");
const Dialogs              = brackets.getModule("widgets/Dialogs");
const DefaultDialogs       = brackets.getModule("widgets/DefaultDialogs");
const HealthLogger         = brackets.getModule("utils/HealthLogger");


let _requestID = 0;
let _initialized = false;

const _graphicsFileTypes = ["jpg", "jpeg", "png", "svg", "xd", "psd", "ai"];

let _nodeDomain;

export function init(nodeDomain) {

    if (_initialized) {
        return;
    }
    _initialized = true;

    _nodeDomain = nodeDomain;

    _nodeDomain.on("checkFileTypesInFolderResponse", function (event, response) {
        if (response.id !== _requestID) {
            return;
        }
        _graphicsFilePresentInProject(response.present);
    });

    ProjectManager.on("projectOpen", function () {
        _checkForGraphicsFileInPrjct();
    });

    _checkForGraphicsFileInPrjct();

}


function _checkForGraphicsFileInPrjct() {

    if (PreferencesManager.getViewState("AssociateGraphicsFileDialogShown")) {
        return;
    }

    const userUuid = PreferencesManager.getViewState("UUID");
    const olderUuid = PreferencesManager.getViewState("OlderUUID");

    if (!(userUuid || olderUuid)) {
        return;
    }

    _nodeDomain.exec("checkFileTypesInFolder", {
        extensions: _graphicsFileTypes.join(),
        folder: ProjectManager.getProjectRoot()!.fullPath,
        reqId: ++_requestID
    });

}

function _graphicsFilePresentInProject(isPresent) {

    if (!isPresent) {
        return;
    }

    Dialogs.showModalDialog(
        DefaultDialogs.DIALOG_ID_INFO,
        Strings.ASSOCIATE_GRAPHICS_FILE_TO_DEFAULT_APP_TITLE,
        Strings.ASSOCIATE_GRAPHICS_FILE_TO_DEFAULT_APP_MSG,
        [
            { className: Dialogs.DIALOG_BTN_CLASS_NORMAL, id: Dialogs.DIALOG_BTN_CANCEL,
                text: Strings.CANCEL
            },
            { className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: Dialogs.DIALOG_BTN_OK,
                text: Strings.OK
            }
        ]
    ).done(function (id) {

        if (id !== Dialogs.DIALOG_BTN_OK) {
            HealthLogger.sendAnalyticsData(
                "externalEditorsCancelled",
                "usage",
                "externalEditors",
                "Cancelled",
                ""
            );
            return;
        }
        HealthLogger.sendAnalyticsData(
            "LinkExternalEditors",
            "usage",
            "externalEditors",
            "LinkExternalEditors",
            ""
        );

        brackets.app.getSystemDefaultApp(_graphicsFileTypes.join(), function (err, out) {

            if (err) {
                return;
            }
            const associateApp = out.split(",");
            const fileTypeToAppMap = {};
            const AppToFileTypeMap = {};

            associateApp.forEach(function (item) {

                const filetype = item.split("##")[0];
                let app = item.split("##")[1];

                if (!filetype) {
                    return;
                }

                if (filetype === "xd") {
                    if (app.toLowerCase() !== "adobe xd" && app.toLowerCase() !== "adobe.cc.xd") {
                        return;
                    }

                    app = "Adobe XD";
                }
                fileTypeToAppMap[filetype] = app;

                if (brackets.platform === "win" && app.toLowerCase().endsWith(".exe")) {
                    app = app.substring(app.lastIndexOf("\\") + 1, app.length - 4);
                }
                if (AppToFileTypeMap[app]) {
                    AppToFileTypeMap[app].push(filetype);
                } else {
                    AppToFileTypeMap[app] = [filetype];
                }
            });

            const prefs = PreferencesManager.get("externalApplications");

            for (const key in fileTypeToAppMap) {
                if (fileTypeToAppMap.hasOwnProperty(key)) {
                    if (key && !prefs[key]) {
                        prefs[key] = fileTypeToAppMap[key];
                        if (brackets.platform === "win" && !fileTypeToAppMap[key].toLowerCase().endsWith(".exe")) {
                            prefs[key] = "default";
                        }
                        HealthLogger.sendAnalyticsData(
                            "AddExternalEditorForFileType_" + key.toUpperCase(),
                            "usage",
                            "externalEditors",
                            "AddExternalEditorForFileType_" + key.toUpperCase(),
                            ""
                        );
                    }
                }
            }

            PreferencesManager.set("externalApplications", prefs);

            let str = "";
            for (const app in AppToFileTypeMap) {
                str += AppToFileTypeMap[app].join() + "->" + app + "<br/>";
            }

            if (!str) {
                return;
            }

            str += "<br/>";

            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_INFO,
                Strings.ASSOCIATE_GRAPHICS_FILE_TO_DEFAULT_APP_TITLE,
                StringsUtils.format(Strings.ASSOCIATE_GRAPHICS_FILE_TO_DEFAULT_APP_CNF_MSG, str),
                [
                    { className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: Dialogs.DIALOG_BTN_OK,
                        text: Strings.OK
                    }
                ]
            );
        });
    });
    PreferencesManager.setViewState("AssociateGraphicsFileDialogShown", true);

}
