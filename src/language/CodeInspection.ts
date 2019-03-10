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
 * Manages linters and other code inspections on a per-language basis. Provides a UI and status indicator for
 * the resulting errors/warnings.
 *
 * Currently, inspection providers are only invoked on the current file and only when it is opened, switched to,
 * or saved. But in the future, inspectors may be invoked as part of a global scan, at intervals while typing, etc.
 * Currently, results are only displayed in a bottom panel list and in a status bar icon. But in the future,
 * results may also be displayed inline in the editor (as gutter markers, squiggly underlines, etc.).
 * In the future, support may also be added for error/warning providers that cannot process a single file at a time
 * (e.g. a full-project compiler).
 */

import * as _ from "lodash";

// Load dependent modules
import * as Commands from "command/Commands";
import * as WorkspaceManager from "view/WorkspaceManager";
import * as CommandManager from "command/CommandManager";
import * as DocumentManager from "document/DocumentManager";
import * as EditorManager from "editor/EditorManager";
import * as MainViewManager from "view/MainViewManager";
import * as LanguageManager from "language/LanguageManager";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as PerfUtils from "utils/PerfUtils";
import * as Strings from "strings";
import * as StringUtils from "utils/StringUtils";
import * as AppInit from "utils/AppInit";
import * as Resizer from "utils/Resizer";
import * as StatusBar from "widgets/StatusBar";
import * as Async from "utils/Async";
import * as PanelTemplate from "text!htmlContent/problems-panel.html";
import * as ResultsTemplate from "text!htmlContent/problems-panel-table.html";
import * as Mustache from "thirdparty/mustache/mustache";
import { DispatcherEvents } from "utils/EventDispatcher";

interface Result {
    errors: Array<any>;
    aborted: boolean;
}

interface Provider {
    name: string;
    scanFileAsync?<T>(text: string, fullpath: string): JQueryPromise<T>;
    scanFile?(text: string, fullpath: string): Result;
}

interface ProviderResult {
    provider: Provider;
    result?: Result;
}

interface Report {
    isExpanded: boolean;
    providerName: string;
    results: Array<any>;
}

interface ProviderMap {
    [languageId: string]: Array<Provider>;
}

const INDICATOR_ID = "status-inspection";

/** Values for problem's 'type' property */
export const Type = {
    /** Unambiguous error, such as a syntax error */
    ERROR: "problem_type_error",
    /** Maintainability issue, probable error / bad smell, etc. */
    WARNING: "problem_type_warning",
    /** Inspector unable to continue, code too complex for static analysis, etc. Not counted in error/warning tally. */
    META: "problem_type_meta"
};

/**
 * Constants for the preferences defined in this file.
 */
const PREF_ENABLED            = "enabled";
const PREF_COLLAPSED          = "collapsed";
export const _PREF_ASYNC_TIMEOUT      = "asyncTimeout";
export const _PREF_PREFER_PROVIDERS   = "prefer";
export const _PREF_PREFERRED_ONLY     = "usePreferredOnly";

const prefs = PreferencesManager.getExtensionPrefs("linting");

/**
 * When disabled, the errors panel is closed and the status bar icon is grayed out.
 * Takes precedence over _collapsed.
 * @private
 * @type {boolean}
 */
let _enabled = false;

/**
 * When collapsed, the errors panel is closed but the status bar icon is kept up to date.
 * @private
 * @type {boolean}
 */
let _collapsed = false;

/**
 * @private
 * @type {$.Element}
 */
let $problemsPanel;

/**
 * @private
 * @type {$.Element}
 */
let $problemsPanelTable;

/**
 * @private
 * @type {boolean}
 */
let _gotoEnabled = false;

/**
 * @private
 * @type {{languageId:string, Array.<{name:string, scanFileAsync:?function(string, string):!{$.Promise}, scanFile:?function(string, string):Object}>}}
 */
let _providers: ProviderMap = {};

/**
 * @private
 * @type {boolean}
 */
let _hasErrors;

/**
 * Promise of the returned by the last call to inspectFile or null if linting is disabled. Used to prevent any stale promises
 * to cause updates of the UI.
 *
 * @private
 * @type {$.Promise}
 */
let _currentPromise: JQueryPromise<Array<ProviderResult> | null> | null;

/**
 * Enable or disable the "Go to First Error" command
 * @param {boolean} gotoEnabled Whether it is enabled.
 */
function setGotoEnabled(gotoEnabled) {
    CommandManager.get(Commands.NAVIGATE_GOTO_FIRST_PROBLEM).setEnabled(gotoEnabled);
    _gotoEnabled = gotoEnabled;
}

export function _unregisterAll() {
    _providers = {};
}

/**
 * Returns a list of provider for given file path, if available.
 * Decision is made depending on the file extension.
 *
 * @param {!string} filePath
 * @return {Array.<{name:string, scanFileAsync:?function(string, string):!{$.Promise}, scanFile:?function(string, string):?{errors:!Array, aborted:boolean}}>}
 */
export function getProvidersForPath(filePath) {
    const language            = LanguageManager.getLanguageForPath(filePath).getId();
    const context             = PreferencesManager._buildContext(filePath, language);
    const installedProviders  = getProvidersForLanguageId(language);

    let prefPreferredProviderNames  = prefs.get(_PREF_PREFER_PROVIDERS, context);
    const prefPreferredOnly           = prefs.get(_PREF_PREFERRED_ONLY, context);

    let providers;

    if (prefPreferredProviderNames && prefPreferredProviderNames.length) {
        if (typeof prefPreferredProviderNames === "string") {
            prefPreferredProviderNames = [prefPreferredProviderNames];
        }
        const preferredProviders = prefPreferredProviderNames.reduce(function (result, key) {
            const provider = _.find(installedProviders, {name: key});
            if (provider) {
                result.push(provider);
            }
            return result;
        }, []);
        if (prefPreferredOnly) {
            providers = preferredProviders;
        } else {
            providers = _.union(preferredProviders, installedProviders);
        }
    } else {
        providers = installedProviders;
    }
    return providers;
}

/**
 * Returns an array of the IDs of providers registered for a specific language
 *
 * @param {!string} languageId
 * @return {Array.<string>} Names of registered providers.
 */
export function getProviderIDsForLanguage(languageId) {
    if (!_providers[languageId]) {
        return [];
    }
    return _providers[languageId].map(function (provider) {
        return provider.name;
    });
}

/**
 * Runs a file inspection over passed file. Uses the given list of providers if specified, otherwise uses
 * the set of providers that are registered for the file's language.
 * This method doesn't update the Brackets UI, just provides inspection results.
 * These results will reflect any unsaved changes present in the file if currently open.
 *
 * The Promise yields an array of provider-result pair objects (the result is the return value of the
 * provider's scanFile() - see register() for details). The result object may be null if there were no
 * errors from that provider.
 * If there are no providers registered for this file, the Promise yields null instead.
 *
 * @param {!File} file File that will be inspected for errors.
 * @param {?Array.<{name:string, scanFileAsync:?function(string, string):!{$.Promise}, scanFile:?function(string, string):?{errors:!Array, aborted:boolean}}>} providerList
 * @return {$.Promise} a jQuery promise that will be resolved with ?Array.<{provider:Object, result: ?{errors:!Array, aborted:boolean}}>
 */
export function inspectFile(file, providerList: Array<Provider>): JQueryPromise<Array<ProviderResult> | null> {
    const response = $.Deferred<Array<ProviderResult> | null>();
    const results: Array<ProviderResult> = [];

    providerList = providerList || getProvidersForPath(file.fullPath);

    if (!providerList.length) {
        response.resolve(null);
        return response.promise();
    }

    DocumentManager.getDocumentText(file)
        .done(function (fileText) {
            const perfTimerInspector = PerfUtils.markStart("CodeInspection:\t" + file.fullPath);

            const masterPromise = Async.doInParallel(providerList, function (provider) {
                const perfTimerProvider = PerfUtils.markStart("CodeInspection '" + provider.name + "':\t" + file.fullPath);
                const runPromise = $.Deferred();

                runPromise.done(function (scanResult) {
                    results.push({provider: provider, result: scanResult as Result});
                });

                if (provider.scanFileAsync) {
                    window.setTimeout(function () {
                        // timeout error
                        const errTimeout = {
                            pos: { line: -1, col: 0},
                            message: StringUtils.format(Strings.LINTER_TIMED_OUT, provider.name, prefs.get(_PREF_ASYNC_TIMEOUT)),
                            type: Type.ERROR
                        };
                        runPromise.resolve({errors: [errTimeout]});
                    }, prefs.get(_PREF_ASYNC_TIMEOUT));
                    provider.scanFileAsync(fileText, file.fullPath)
                        .done(function (scanResult) {
                            PerfUtils.addMeasurement(perfTimerProvider);
                            runPromise.resolve(scanResult);
                        })
                        .fail(function (err) {
                            PerfUtils.finalizeMeasurement(perfTimerProvider);
                            const errError = {
                                pos: {line: -1, col: 0},
                                message: StringUtils.format(Strings.LINTER_FAILED, provider.name, err),
                                type: Type.ERROR
                            };
                            console.error("[CodeInspection] Provider " + provider.name + " (async) failed: " + err);
                            runPromise.resolve({errors: [errError]});
                        });
                } else {
                    try {
                        const scanResult = provider.scanFile(fileText, file.fullPath);
                        PerfUtils.addMeasurement(perfTimerProvider);
                        runPromise.resolve(scanResult);
                    } catch (err) {
                        PerfUtils.finalizeMeasurement(perfTimerProvider);
                        const errError = {
                            pos: {line: -1, col: 0},
                            message: StringUtils.format(Strings.LINTER_FAILED, provider.name, err),
                            type: Type.ERROR
                        };
                        console.error("[CodeInspection] Provider " + provider.name + " (sync) threw an error: " + err);
                        runPromise.resolve({errors: [errError]});
                    }
                }
                return runPromise.promise();

            }, false);

            masterPromise.then(function () {
                // sync async may have pushed results in different order, restore the original order
                results.sort(function (a, b) {
                    return providerList.indexOf(a.provider) - providerList.indexOf(b.provider);
                });
                PerfUtils.addMeasurement(perfTimerInspector);
                response.resolve(results);
            });

        })
        .fail(function (err) {
            console.error("[CodeInspection] Could not read file for inspection: " + file.fullPath);
            response.reject(err);
        });

    return response.promise();
}

/**
 * Update the title of the problem panel and the tooltip of the status bar icon. The title and the tooltip will
 * change based on the number of problems reported and how many provider reported problems.
 *
 * @param {Number} numProblems - total number of problems across all providers
 * @param {Array.<{name:string, scanFileAsync:?function(string, string):!{$.Promise}, scanFile:?function(string, string):Object}>} providersReportingProblems - providers that reported problems
 * @param {boolean} aborted - true if any provider returned a result with the 'aborted' flag set
 */
function updatePanelTitleAndStatusBar(numProblems, providersReportingProblems, aborted) {
    let message;

    if (providersReportingProblems.length === 1) {
        // don't show a header if there is only one provider available for this file type
        $problemsPanelTable.find(".inspector-section").hide();
        $problemsPanelTable.find("tr").removeClass("forced-hidden");

        if (numProblems === 1 && !aborted) {
            message = StringUtils.format(Strings.SINGLE_ERROR, providersReportingProblems[0].name);
        } else {
            if (aborted) {
                numProblems += "+";
            }

            message = StringUtils.format(Strings.MULTIPLE_ERRORS, providersReportingProblems[0].name, numProblems);
        }
    } else if (providersReportingProblems.length > 1) {
        $problemsPanelTable.find(".inspector-section").show();

        if (aborted) {
            numProblems += "+";
        }

        message = StringUtils.format(Strings.ERRORS_PANEL_TITLE_MULTIPLE, numProblems);
    } else {
        return;
    }

    $problemsPanel.find(".title").text(message);
    const tooltip = StringUtils.format(Strings.STATUSBAR_CODE_INSPECTION_TOOLTIP, message);
    StatusBar.updateIndicator(INDICATOR_ID, true, "inspection-errors", tooltip);
}

/**
 * Run inspector applicable to current document. Updates status bar indicator and refreshes error list in
 * bottom panel. Does not run if inspection is disabled or if a providerName is given and does not
 * match the current doc's provider name.
 *
 * @param {?string} providerName name of the provider that is requesting a run
 */
export function requestRun() {
    if (!_enabled) {
        _hasErrors = false;
        _currentPromise = null;
        Resizer.hide($problemsPanel);
        StatusBar.updateIndicator(INDICATOR_ID, true, "inspection-disabled", Strings.LINT_DISABLED);
        setGotoEnabled(false);
        return;
    }

    const currentDoc = DocumentManager.getCurrentDocument()!;
    const providerList = currentDoc && getProvidersForPath(currentDoc.file.fullPath);

    if (providerList && providerList.length) {
        let numProblems = 0;
        let aborted = false;
        const allErrors: Array<Report> = [];
        let html;
        const providersReportingProblems: Array<Provider> = [];

        // run all the providers registered for this file type
        (_currentPromise = inspectFile(currentDoc.file, providerList)).then(function (this: any, results) {
            // check if promise has not changed while inspectFile was running
            if (this !== _currentPromise) {
                return;
            }

            // how many errors in total?
            const errors = results!.reduce(function (a, item) { return a + (item.result ? item.result.errors.length : 0); }, 0);

            _hasErrors = Boolean(errors);

            if (!errors) {
                Resizer.hide($problemsPanel);

                let message = Strings.NO_ERRORS_MULTIPLE_PROVIDER;
                if (providerList.length === 1) {
                    message = StringUtils.format(Strings.NO_ERRORS, providerList[0].name);
                }

                StatusBar.updateIndicator(INDICATOR_ID, true, "inspection-valid", message);

                setGotoEnabled(false);
                return;
            }

            const perfTimerDOM = PerfUtils.markStart("ProblemsPanel render:\t" + currentDoc.file.fullPath);

            // Augment error objects with additional fields needed by Mustache template
            results!.forEach(function (inspectionResult) {
                const provider = inspectionResult.provider;
                const isExpanded = prefs.get(provider.name + ".collapsed") !== false;

                if (inspectionResult.result) {
                    inspectionResult.result.errors.forEach(function (error) {
                        // some inspectors don't always provide a line number or report a negative line number
                        if (!isNaN(error.pos.line) &&
                                (error.pos.line + 1) > 0 &&
                                // tslint:disable-next-line:no-conditional-assignment
                                (error.codeSnippet = currentDoc.getLine(error.pos.line)) !== undefined) {
                            error.friendlyLine = error.pos.line + 1;
                            error.codeSnippet = error.codeSnippet.substr(0, 175);  // limit snippet width
                        }

                        if (error.type !== Type.META) {
                            numProblems++;
                        }

                        // Hide the errors when the provider is collapsed.
                        error.display = isExpanded ? "" : "forced-hidden";
                    });

                    // if the code inspector was unable to process the whole file, we keep track to show a different status
                    if (inspectionResult.result.aborted) {
                        aborted = true;
                    }

                    if (inspectionResult.result.errors.length) {
                        allErrors.push({
                            isExpanded:   isExpanded,
                            providerName: provider.name,
                            results:      inspectionResult.result.errors
                        });

                        providersReportingProblems.push(provider);
                    }
                }
            });

            // Update results table
            html = Mustache.render(ResultsTemplate, {reportList: allErrors});

            $problemsPanelTable
                .empty()
                .append(html)
                .scrollTop(0);  // otherwise scroll pos from previous contents is remembered

            if (!_collapsed) {
                Resizer.show($problemsPanel);
            }

            updatePanelTitleAndStatusBar(numProblems, providersReportingProblems, aborted);
            setGotoEnabled(true);

            PerfUtils.addMeasurement(perfTimerDOM);
        });

    } else {
        // No provider for current file
        _hasErrors = false;
        _currentPromise = null;
        Resizer.hide($problemsPanel);
        const language = currentDoc && LanguageManager.getLanguageForPath(currentDoc.file.fullPath);
        if (language) {
            StatusBar.updateIndicator(INDICATOR_ID, true, "inspection-disabled", StringUtils.format(Strings.NO_LINT_AVAILABLE, language.getName()));
        } else {
            StatusBar.updateIndicator(INDICATOR_ID, true, "inspection-disabled", Strings.NOTHING_TO_LINT);
        }
        setGotoEnabled(false);
    }
}

/**
 * The provider is passed the text of the file and its fullPath. Providers should not assume
 * that the file is open (i.e. DocumentManager.getOpenDocumentForPath() may return null) or
 * that the file on disk matches the text given (file may have unsaved changes).
 *
 * Registering any provider for the "javascript" language automatically unregisters the built-in
 * Brackets JSLint provider. This is a temporary convenience until UI exists for disabling
 * registered providers.
 *
 * Providers implement scanFile() if results are available synchronously, or scanFileAsync() if results
 * may require an async wait (if both are implemented, scanFile() is ignored). scanFileAsync() returns
 * a {$.Promise} object resolved with the same type of value as scanFile() is expected to return.
 * Rejecting the promise is treated as an internal error in the provider.
 *
 * @param {string} languageId
 * @param {{name:string, scanFileAsync:?function(string, string):!{$.Promise},
 *         scanFile:?function(string, string):?{errors:!Array, aborted:boolean}}} provider
 *
 * Each error is: { pos:{line,ch}, endPos:?{line,ch}, message:string, type:?Type }
 * If type is unspecified, Type.WARNING is assumed.
 * If no errors found, return either null or an object with a zero-length `errors` array.
 */
export function register(languageId, provider) {
    if (!_providers[languageId]) {
        _providers[languageId] = [];
    } else {
        // Check if provider with same name exists for the given language
        // If yes, remove the provider before inserting the most recently loaded one
        const indexOfProvider = _.findIndex(_providers[languageId], function (entry) { return entry.name === provider.name; });
        if (indexOfProvider !== -1) {
            _providers[languageId].splice(indexOfProvider, 1);
        }
    }

    _providers[languageId].push(provider);

    requestRun();  // in case a file of this type is open currently
}

/**
 * Returns a list of providers registered for given languageId through register function
 */
function getProvidersForLanguageId(languageId) {
    let result: Array<Provider> = [];
    if (_providers[languageId]) {
        result = result.concat(_providers[languageId]);
    }
    if (_providers["*"]) {
        result = result.concat(_providers["*"]);
    }
    return result;
}

/**
 * Update DocumentManager listeners.
 */
function updateListeners() {
    if (_enabled) {
        // register our event listeners
        (MainViewManager as unknown as DispatcherEvents)
            .on("currentFileChange.codeInspection", function () {
                requestRun();
            });
        (DocumentManager as unknown as DispatcherEvents)
            .on("currentDocumentLanguageChanged.codeInspection", function () {
                requestRun();
            })
            .on("documentSaved.codeInspection documentRefreshed.codeInspection", function (event, document) {
                if (document === DocumentManager.getCurrentDocument()) {
                    requestRun();
                }
            });
    } else {
        (DocumentManager as unknown as DispatcherEvents).off(".codeInspection");
        (MainViewManager as unknown as DispatcherEvents).off(".codeInspection");
    }
}

/**
 * Enable or disable all inspection.
 * @param {?boolean} enabled Enabled state. If omitted, the state is toggled.
 * @param {?boolean} doNotSave true if the preference should not be saved to user settings. This is generally for events triggered by project-level settings.
 */
export function toggleEnabled(enabled, doNotSave) {
    if (enabled === undefined) {
        enabled = !_enabled;
    }

    // Take no action when there is no change.
    if (enabled === _enabled) {
        return;
    }

    _enabled = enabled;

    CommandManager.get(Commands.VIEW_TOGGLE_INSPECTION).setChecked(_enabled);
    updateListeners();
    if (!doNotSave) {
        prefs.set(PREF_ENABLED, _enabled);
        prefs.save();
    }

    // run immediately
    requestRun();
}

/**
 * Toggle the collapsed state for the panel. This explicitly collapses the panel (as opposed to
 * the auto collapse due to files with no errors & filetypes with no provider). When explicitly
 * collapsed, the panel will not reopen automatically on switch files or save.
 *
 * @param {?boolean} collapsed Collapsed state. If omitted, the state is toggled.
 * @param {?boolean} doNotSave true if the preference should not be saved to user settings. This is generally for events triggered by project-level settings.
 */
function toggleCollapsed(collapsed?, doNotSave?) {
    if (collapsed === undefined) {
        collapsed = !_collapsed;
    }

    if (collapsed === _collapsed) {
        return;
    }

    _collapsed = collapsed;
    if (!doNotSave) {
        prefs.set(PREF_COLLAPSED, _collapsed);
        prefs.save();
    }

    if (_collapsed) {
        Resizer.hide($problemsPanel);
    } else {
        if (_hasErrors) {
            Resizer.show($problemsPanel);
        }
    }
}

/** Command to go to the first Problem */
function handleGotoFirstProblem() {
    requestRun();
    if (_gotoEnabled) {
        $problemsPanel.find("tr:not(.inspector-section)").first().trigger("click");
    }
}

// Register command handlers
CommandManager.register(Strings.CMD_VIEW_TOGGLE_INSPECTION, Commands.VIEW_TOGGLE_INSPECTION,        toggleEnabled);
CommandManager.register(Strings.CMD_GOTO_FIRST_PROBLEM,     Commands.NAVIGATE_GOTO_FIRST_PROBLEM,   handleGotoFirstProblem);

// Register preferences
(prefs.definePreference(PREF_ENABLED, "boolean", brackets.config["linting.enabled_by_default"], {
    description: Strings.DESCRIPTION_LINTING_ENABLED
}) as unknown as DispatcherEvents)
    .on("change", function (e, data) {
        toggleEnabled(prefs.get(PREF_ENABLED), true);
    });

(prefs.definePreference(PREF_COLLAPSED, "boolean", false, {
    description: Strings.DESCRIPTION_LINTING_COLLAPSED
}) as unknown as DispatcherEvents)
    .on("change", function (e, data) {
        toggleCollapsed(prefs.get(PREF_COLLAPSED), true);
    });

prefs.definePreference(_PREF_ASYNC_TIMEOUT, "number", 10000, {
    description: Strings.DESCRIPTION_ASYNC_TIMEOUT
});

prefs.definePreference(_PREF_PREFER_PROVIDERS, "array", [], {
    description: Strings.DESCRIPTION_LINTING_PREFER,
    valueType: "string"
});

prefs.definePreference(_PREF_PREFERRED_ONLY, "boolean", false, {
    description: Strings.DESCRIPTION_USE_PREFERED_ONLY
});

// Initialize items dependent on HTML DOM
AppInit.htmlReady(function () {
    // Create bottom panel to list error details
    const panelHtml = Mustache.render(PanelTemplate, Strings);
    WorkspaceManager.createBottomPanel("errors", $(panelHtml), 100);
    $problemsPanel = $("#problems-panel");

    let $selectedRow;
    $problemsPanelTable = $problemsPanel.find(".table-container")
        .on("click", "tr", function (e) {
            if ($selectedRow) {
                $selectedRow.removeClass("selected");
            }

            $selectedRow  = $(e.currentTarget);
            $selectedRow.addClass("selected");

            // This is a inspector title row, expand/collapse on click
            if ($selectedRow.hasClass("inspector-section")) {
                const $triangle = $(".disclosure-triangle", $selectedRow);
                const isExpanded = $triangle.hasClass("expanded");

                // Clicking the inspector title section header collapses/expands result rows
                if (isExpanded) {
                    $selectedRow.nextUntil(".inspector-section").addClass("forced-hidden");
                } else {
                    $selectedRow.nextUntil(".inspector-section").removeClass("forced-hidden");
                }
                $triangle.toggleClass("expanded");

                const providerName = $selectedRow.find("input[type='hidden']").val();
                prefs.set(providerName + ".collapsed", !isExpanded);
                prefs.save();
            } else {
                // This is a problem marker row, show the result on click
                // Grab the required position data
                const lineTd    = $selectedRow.find(".line-number");
                const line      = parseInt(lineTd.text(), 10) - 1;  // convert friendlyLine back to pos.line
                // if there is no line number available, don't do anything
                if (!isNaN(line)) {
                    const character = lineTd.data("character");

                    const editor = EditorManager.getCurrentFullEditor();
                    editor.setCursorPos(line, character, true);
                    MainViewManager.focusActivePane();
                }
            }
        });

    $("#problems-panel .close").click(function () {
        toggleCollapsed(true);
    });

    // Status bar indicator - icon & tooltip updated by run()
    const statusIconHtml = Mustache.render("<div id=\"status-inspection\">&nbsp;</div>", Strings);
    StatusBar.addIndicator(INDICATOR_ID, $(statusIconHtml), true, "", "", "status-indent");

    $("#status-inspection").click(function () {
        // Clicking indicator toggles error panel, if any errors in current file
        if (_hasErrors) {
            toggleCollapsed();
        }
    });

    // Set initial UI state
    toggleEnabled(prefs.get(PREF_ENABLED), true);
    toggleCollapsed(prefs.get(PREF_COLLAPSED), true);
});
