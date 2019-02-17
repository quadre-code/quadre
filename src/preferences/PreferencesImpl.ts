/*
 * Copyright (c) 2014 - 2017 Adobe Systems Incorporated. All rights reserved.
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
 * Generates the fully configured preferences systems used throughout Brackets. This is intended
 * to be essentially private implementation that can be overridden for tests.
 */

const isDev = electron.remote.require("./utils").isDev();

import * as PreferencesBase from "./PreferencesBase";
import * as Async from "utils/Async";

// The SETTINGS_FILENAME is used with a preceding "." within user projects
export const SETTINGS_FILENAME = "brackets.json";
export const STATE_FILENAME    = isDev ? "state-dev.json" : "state.json";

// User-level preferences
export const userPrefFile = brackets.app.getApplicationSupportDirectory() + "/" + SETTINGS_FILENAME;

/**
 * A deferred object which is used to indicate PreferenceManager readiness during the start-up.
 * @private
 * @type {$.Deferred}
 */
const _prefManagerReadyDeferred = $.Deferred();

/**
 * A boolean property indicating if the user scope configuration file is malformed.
 */
let userScopeCorrupt = false;

export function isUserScopeCorrupt() {
    return userScopeCorrupt;
}

/**
 * Promises to add scopes. Used at init time only.
 * @private
 * @type {Array.<$.Promise>}
 */
const _addScopePromises: Array<JQueryPromise<any>> = [];

export const manager = new PreferencesBase.PreferencesSystem();
manager.pauseChangeEvents();

// Create a Project scope
export const projectStorage          = new PreferencesBase.FileStorage(undefined, true);
const projectScope            = new PreferencesBase.Scope(projectStorage);
export const projectPathLayer        = new PreferencesBase.PathLayer();
const projectLanguageLayer    = new PreferencesBase.LanguageLayer();

projectScope.addLayer(projectPathLayer);
projectScope.addLayer(projectLanguageLayer);

// Create a User scope
const userStorage             = new PreferencesBase.FileStorage(userPrefFile, true);
const userScope               = new PreferencesBase.Scope(userStorage);
const userLanguageLayer       = new PreferencesBase.LanguageLayer();

userScope.addLayer(userLanguageLayer);

export const userScopeLoading = manager.addScope("user", userScope);

_addScopePromises.push(userScopeLoading);

// Set up the .brackets.json file handling
userScopeLoading
    .fail(function (err) {
        _addScopePromises.push(manager.addScope("user", new PreferencesBase.MemoryStorage(), {
            before: "default"
        }));

        if (err.name && err.name === "ParsingError") {
            userScopeCorrupt = true;
        }
    })
    .always(function () {
        _addScopePromises.push(manager.addScope("project", projectScope, {
            before: "user"
        }));

        // Session Scope is for storing prefs in memory only but with the highest precedence.
        _addScopePromises.push(manager.addScope("session", new PreferencesBase.MemoryStorage()));

        Async.waitForAll(_addScopePromises)
            .always(function () {
                _prefManagerReadyDeferred.resolve();
            });
    });


// "State" is stored like preferences but it is not generally intended to be user-editable.
// It's for more internal, implicit things like window size, working set, etc.
export const stateManager = new PreferencesBase.PreferencesSystem();
const userStateFile = brackets.app.getApplicationSupportDirectory() + "/" + STATE_FILENAME;
const smUserScope = new PreferencesBase.Scope(new PreferencesBase.FileStorage(userStateFile, true, true));
export const stateProjectLayer = new PreferencesBase.ProjectLayer();
smUserScope.addLayer(stateProjectLayer);
export const smUserScopeLoading = stateManager.addScope("user", smUserScope);


// Listen for times where we might be unwatching a root that contains one of the user-level prefs files,
// and force a re-read of the file in order to ensure we can write to it later (see #7300).
export function reloadUserPrefs(rootDir) {
    const prefsDir = brackets.app.getApplicationSupportDirectory() + "/";
    if (prefsDir.indexOf(rootDir.fullPath) === 0) {
        manager.fileChanged(userPrefFile);
        stateManager.fileChanged(userStateFile);
    }
}

export const managerReady = _prefManagerReadyDeferred.promise();
