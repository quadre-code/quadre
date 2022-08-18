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

import * as AppInit from "utils/AppInit";
import * as CommandManager from "command/CommandManager";
import * as MainViewManager from "view/MainViewManager";
import * as LanguageManager from "language/LanguageManager";
import * as DocumentManager from "document/DocumentManager";
import * as Commands from "command/Commands";
import * as EditorManager from "editor/EditorManager";
import * as ProjectManager from "project/ProjectManager";
import { RegistrationHandler as ProviderRegistrationHandler } from "features/PriorityBasedRegistration";
import { SearchResultsView } from "search/SearchResultsView";
import { SearchModel } from "search/SearchModel";
import * as Strings from "strings";
import { DispatcherEvents } from "utils/EventDispatcher";
import { Document } from "document/Document";

const _providerRegistrationHandler = new ProviderRegistrationHandler();
export const registerFindReferencesProvider = _providerRegistrationHandler.registerProvider.bind(
    _providerRegistrationHandler
);
export const removeFindReferencesProvider = _providerRegistrationHandler.removeProvider.bind(_providerRegistrationHandler);

const searchModel = new SearchModel();
let _resultsView;

function _getReferences(provider, hostEditor, pos) {
    const result = $.Deferred();

    if (!provider) {
        return result.reject();
    }

    provider.getReferences(hostEditor, pos)
        .done(function (rcvdObj) {

            searchModel.results = rcvdObj.results;
            searchModel.numFiles = rcvdObj.numFiles;
            searchModel.numMatches = rcvdObj.numMatches;
            searchModel.allResultsAvailable = true;
            searchModel.setQueryInfo({query: rcvdObj.queryInfo, caseSensitive: true, isRegExp: false});
            result.resolve();
        }).fail(function () {
            result.reject();
        });
    return result.promise();

}

function _openReferencesPanel() {
    const editor = EditorManager.getActiveEditor()!;
    const pos = editor ? editor.getCursorPos() : null;
    const result = $.Deferred();
    const errorMsg = Strings.REFERENCES_NO_RESULTS;
    let referencesProvider;

    const language = editor.getLanguageForSelection();
    const enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(language.getId());

    enabledProviders.some(function (item, index) {
        if (item.provider.hasReferences(editor)) {
            referencesProvider = item.provider;
            return true;
        }

        return false;
    });

    const referencesPromise = _getReferences(referencesProvider, editor, pos);

    // If one of them will provide a widget, show it inline once ready
    if (referencesPromise) {
        referencesPromise.done(function () {
            if (_resultsView) {
                _resultsView.open();
            }
        }).fail(function () {
            if (_resultsView) {
                _resultsView.close();
            }
            editor.displayErrorMessageAtCursor(errorMsg);
            result.reject();
        });
    } else {
        if (_resultsView) {
            _resultsView.close();
        }
        editor.displayErrorMessageAtCursor(errorMsg);
        result.reject();
    }

    return result.promise();
}

/**
 * @private
 * Clears any previous search information, removing update listeners and clearing the model.
 */
function _clearSearch() {
    searchModel.clear();
}

/**
 * @public
 * Closes the references panel
 */
export function closeReferencesPanel() {
    if (_resultsView) {
        _resultsView.close();
    }
}

export function setMenuItemStateForLanguage(languageId) {
    CommandManager.get(Commands.CMD_FIND_ALL_REFERENCES).setEnabled(false);
    if (!languageId) {
        const editor = EditorManager.getActiveEditor();
        if (editor) {
            languageId = LanguageManager.getLanguageForPath(editor.document.file._path).getId();
        }
    }
    const enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(languageId);
    let referencesProvider;

    enabledProviders.some(function (item, index) {
        if (item.provider.hasReferences()) {
            referencesProvider = item.provider;
            return true;
        }

        return false;
    });
    if (referencesProvider) {
        CommandManager.get(Commands.CMD_FIND_ALL_REFERENCES).setEnabled(true);
    }

}

(MainViewManager as unknown as DispatcherEvents).on("currentFileChange", function (event, newFile, newPaneId, oldFile, oldPaneId) {
    if (!newFile) {
        CommandManager.get(Commands.CMD_FIND_ALL_REFERENCES).setEnabled(false);
        return;
    }

    const newFilePath = newFile.fullPath;
    const newLanguageId = LanguageManager.getLanguageForPath(newFilePath).getId();
    setMenuItemStateForLanguage(newLanguageId);

    DocumentManager.getDocumentForPath(newFilePath)
        .done(function (newDoc: Document) {
            (newDoc as unknown as DispatcherEvents).on("languageChanged.reference-in-files", function () {
                const changedLanguageId = LanguageManager.getLanguageForPath(newDoc.file.fullPath).getId();
                setMenuItemStateForLanguage(changedLanguageId);
            });
        });

    if (!oldFile) {
        return;
    }

    const oldFilePath = oldFile.fullPath;
    DocumentManager.getDocumentForPath(oldFilePath)
        .done(function (oldDoc) {
            (oldDoc as unknown as DispatcherEvents).off("languageChanged.reference-in-files");
        });
});

AppInit.htmlReady(function () {
    _resultsView = new SearchResultsView(
        searchModel,
        "reference-in-files-results",
        "reference-in-files.results",
        "reference"
    );
    if (_resultsView) {
        _resultsView
            .on("close", function () {
                _clearSearch();
            })
            .on("getNextPage", function () {
                if (searchModel.hasResults()) {
                    _resultsView.showNextPage();
                }
            })
            .on("getLastPage", function () {
                if (searchModel.hasResults()) {
                    _resultsView.showLastPage();
                }
            });
    }
});

// Initialize: register listeners
(ProjectManager as unknown as DispatcherEvents).on("beforeProjectClose", function () { if (_resultsView) { _resultsView.close(); } });

CommandManager.register(Strings.FIND_ALL_REFERENCES, Commands.CMD_FIND_ALL_REFERENCES, _openReferencesPanel);
CommandManager.get(Commands.CMD_FIND_ALL_REFERENCES).setEnabled(false);
