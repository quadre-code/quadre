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

import * as ClientLoader from "languageTools/ClientLoader";
import * as EditorManager from "editor/EditorManager";
import * as ProjectManager from "project/ProjectManager";
import * as DocumentManager from "document/DocumentManager";
import * as DocumentModule from "document/Document";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as Strings from "strings";
import { LanguageClientWrapper } from "languageTools/LanguageClientWrapper";
import { DispatcherEvents } from "utils/EventDispatcher";

const languageClients = new Map();
let languageToolsPrefs = {
    showServerLogsInConsole: false
};
const BRACKETS_EVENTS_NAMES = {
    EDITOR_CHANGE_EVENT: "activeEditorChange",
    PROJECT_OPEN_EVENT: "projectOpen",
    PROJECT_CLOSE_EVENT: "beforeProjectClose",
    DOCUMENT_DIRTY_EVENT: "dirtyFlagChange",
    DOCUMENT_CHANGE_EVENT: "documentChange",
    FILE_RENAME_EVENT: "fileNameChange",
    BEFORE_APP_CLOSE: "beforeAppClose"
};

PreferencesManager.definePreference("languageTools", "object", languageToolsPrefs, {
    description: Strings.LANGUAGE_TOOLS_PREFERENCES
});

PreferencesManager.on("change", "languageTools", function () {
    languageToolsPrefs = PreferencesManager.get("languageTools");

    ClientLoader.syncPrefsWithDomain(languageToolsPrefs);
});

function registerLanguageClient(clientName, languageClient) {
    languageClients.set(clientName, languageClient);
}

function _withNamespace(event) {
    return event.split(" ")
        .filter(function (value) {
            return !!value;
        })
        .map(function (value) {
            return value + ".language-tools";
        })
        .join(" ");
}

function _eventHandler() {
    const eventArgs = arguments;
    // Broadcast event to all clients
    languageClients.forEach(function (client) {
        client.triggerEvent.apply(client, eventArgs);
    });
}

function _attachEventHandlers() {
    // Attach standard listeners
    (EditorManager as unknown as DispatcherEvents).on(_withNamespace(BRACKETS_EVENTS_NAMES.EDITOR_CHANGE_EVENT), _eventHandler); // (event, current, previous)
    (ProjectManager as unknown as DispatcherEvents).on(_withNamespace(BRACKETS_EVENTS_NAMES.PROJECT_OPEN_EVENT), _eventHandler); // (event, directory)
    (ProjectManager as unknown as DispatcherEvents).on(_withNamespace(BRACKETS_EVENTS_NAMES.PROJECT_CLOSE_EVENT), _eventHandler); // (event, directory)
    (DocumentManager as unknown as DispatcherEvents).on(_withNamespace(BRACKETS_EVENTS_NAMES.DOCUMENT_DIRTY_EVENT), _eventHandler); // (event, document)
    (DocumentModule as unknown as DispatcherEvents).on(_withNamespace(BRACKETS_EVENTS_NAMES.DOCUMENT_CHANGE_EVENT), _eventHandler); // (event, document, changeList)
    (DocumentManager as unknown as DispatcherEvents).on(_withNamespace(BRACKETS_EVENTS_NAMES.FILE_RENAME_EVENT), _eventHandler); // (event, oldName, newName)
    (ProjectManager as unknown as DispatcherEvents).on(_withNamespace(BRACKETS_EVENTS_NAMES.BEFORE_APP_CLOSE), _eventHandler); // (event, oldName, newName)
}

_attachEventHandlers();

export function listenToCustomEvent(eventModule, eventName) {
    eventModule.on(_withNamespace(eventName), _eventHandler);
}

export function initiateToolingService(clientName, clientFilePath, languages) {
    const result = $.Deferred();

    ClientLoader.initiateLanguageClient(clientName, clientFilePath)
        .done(function (languageClientInfo) {
            const languageClientName = languageClientInfo!.name;
            const languageClientInterface = languageClientInfo!.interface;
            const languageClient = new LanguageClientWrapper(languageClientName, clientFilePath, languageClientInterface, languages);

            registerLanguageClient(languageClientName, languageClient);

            result.resolve(languageClient);
        })
        .fail(result.reject);

    return result;
}
