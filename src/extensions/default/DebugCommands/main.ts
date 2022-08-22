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

const _ = brackets.getModule("thirdparty/lodash");

const Commands               = brackets.getModule("command/Commands");
const CommandManager         = brackets.getModule("command/CommandManager");
const Menus                  = brackets.getModule("command/Menus");
const FileSystem             = brackets.getModule("filesystem/FileSystem");
const FileUtils              = brackets.getModule("file/FileUtils");
const PerfUtils              = brackets.getModule("utils/PerfUtils");
const StringUtils            = brackets.getModule("utils/StringUtils");
const Dialogs                = brackets.getModule("widgets/Dialogs");
const Strings                = brackets.getModule("strings");
const PreferencesManager     = brackets.getModule("preferences/PreferencesManager");
const LocalizationUtils      = brackets.getModule("utils/LocalizationUtils");
const MainViewManager        = brackets.getModule("view/MainViewManager");
const WorkingSetView         = brackets.getModule("project/WorkingSetView");
const ExtensionManager       = brackets.getModule("extensibility/ExtensionManager");
const Mustache               = brackets.getModule("thirdparty/mustache/mustache");
import * as ErrorNotification from "ErrorNotification";
import * as PerfDialogTemplate from "text!htmlContent/perf-dialog.html";
import * as LanguageDialogTemplate from "text!htmlContent/language-dialog.html";

import * as keyboard from "text!keyboard.json";
const KeyboardPrefs = JSON.parse(keyboard);

interface PerfData {
    testName: string;
    value: string;
}

interface TemplateVars {
    delimitedPerfData: string;
    perfData: Array<PerfData>;
}

interface Language {
    label: string;
    language: any;
}

// default preferences file name
const DEFAULT_PREFERENCES_FILENAME = "defaultPreferences.json";
const SUPPORTED_PREFERENCE_TYPES   = ["number", "boolean", "string", "array", "object"];

let recomputeDefaultPrefs        = true;
const defaultPreferencesFullPath = brackets.app.getApplicationSupportDirectory() + "/" + DEFAULT_PREFERENCES_FILENAME;

/**
 * Brackets Application Menu Constant
 * @const {string}
 */
const DEBUG_MENU = "debug-menu";

/**
 * Debug commands IDs
 * @enum {string}
 */
const DEBUG_REFRESH_WINDOW                  = "debug.refreshWindow"; // string must MATCH string in native code (brackets_extensions)
const DEBUG_SHOW_DEVELOPER_TOOLS            = "debug.showDeveloperTools";
const DEBUG_RUN_UNIT_TESTS                  = "debug.runUnitTests";
const DEBUG_SHOW_PERF_DATA                  = "debug.showPerfData";
const DEBUG_RELOAD_WITHOUT_USER_EXTS        = "debug.reloadWithoutUserExts";
const DEBUG_NEW_BRACKETS_WINDOW             = "debug.newBracketsWindow";
const DEBUG_SWITCH_LANGUAGE                 = "debug.switchLanguage";
const DEBUG_SHOW_ERRORS_IN_STATUS_BAR       = "debug.showErrorsInStatusBar";
const DEBUG_OPEN_BRACKETS_SOURCE            = "debug.openBracketsSource";
const DEBUG_OPEN_PREFERENCES_IN_SPLIT_VIEW  = "debug.openPrefsInSplitView";

// define a preference to turn off opening preferences in split-view.
const prefs = PreferencesManager.getExtensionPrefs("preferencesView");
prefs.definePreference("openPrefsInSplitView",   "boolean", true, {
    description: Strings.DESCRIPTION_OPEN_PREFS_IN_SPLIT_VIEW
});

prefs.definePreference("openUserPrefsInSecondPane",   "boolean", true, {
    description: Strings.DESCRIPTION_OPEN_USER_PREFS_IN_SECOND_PANE
});

PreferencesManager.definePreference(DEBUG_SHOW_ERRORS_IN_STATUS_BAR, "boolean", false, {
    description: Strings.DESCRIPTION_SHOW_ERRORS_IN_STATUS_BAR
});

function handleShowDeveloperTools() {
    brackets.app.showDeveloperTools();
}

// Implements the 'Run Tests' menu to bring up the Jasmine unit test window
let _testWindow: any = null;
// exposed for convenience, but not official API
export function _runUnitTests(spec) {
    const queryString = spec ? "?spec=" + spec : "";
    if (_testWindow && !_testWindow.closed) {
        if (_testWindow.location.search !== queryString) {
            _testWindow.location.href = "../test/SpecRunner.html" + queryString;
        } else {
            _testWindow.location.reload(true);
        }
    } else {
        _testWindow = window.open("../test/SpecRunner.html" + queryString, "brackets-test", "width=" + $(window).width() + ",height=" + $(window).height());
        _testWindow.location.reload(true); // if it had been opened earlier, force a reload because it will be cached
    }
}

function handleReload() {
    CommandManager.execute(Commands.APP_RELOAD);
}

function handleReloadWithoutUserExts() {
    CommandManager.execute(Commands.APP_RELOAD_WITHOUT_EXTS);
}

function handleNewBracketsWindow() {
    window.open(window.location.href);
}

function handleShowPerfData() {
    const templateVars: TemplateVars = {
        delimitedPerfData: PerfUtils.getDelimitedPerfData(),
        perfData: []
    };

    const getValue = function (entry) {
        // entry is either an Array or a number
        if (Array.isArray(entry)) {
            // For Array of values, return: minimum/average(count)/maximum/last
            let sum = 0;
            let min = Number.MAX_VALUE;
            let max = 0;
            let e;

            for (e of entry) {
                min = Math.min(min, e);
                sum += e;
                max = Math.max(max, e);
            }
            const avg = Math.round(sum * 10 / entry.length) / 10; // tenth of a millisecond
            return String(min) + "/" + String(avg) + "(" + entry.length + ")/" + String(max) + "/" + String(e);
        }

        return entry;
    };

    const perfData = PerfUtils.getData();
    _.forEach(perfData, function (value, testName) {
        templateVars.perfData.push({
            testName: StringUtils.breakableUrl(testName),
            value:    getValue(value)
        });
    });

    const template = Mustache.render(PerfDialogTemplate, templateVars);
    Dialogs.showModalDialogUsingTemplate(template);

    // Select the raw perf data field on click since select all doesn't
    // work outside of the editor
    $("#brackets-perf-raw-data").click(function (this: any) {
        $(this).focus().select();
    });
}

function handleSwitchLanguage() {
    const stringsPath = FileUtils.getNativeBracketsDirectoryPath() + "/nls";

    FileSystem.getDirectoryForPath(stringsPath).getContents(function (err, entries) {
        if (!err) {
            let locale;
            const curLocale = (brackets.isLocaleDefault() ? null : brackets.getLocale());
            const languages: Array<Language> = [];

            const setLanguage = function (event) {
                locale = $select.val();
                $submit.prop("disabled", locale === (curLocale || ""));
            };

            // inspect all children of dirEntry
            entries.forEach(function (entry) {
                if (entry.isDirectory) {
                    const match = entry.name.match(/^([a-z]{2})(-[a-z]{2})?$/);

                    if (match) {
                        const language = entry.name;
                        let label = match[1];

                        if (match[2]) {
                            label += match[2].toUpperCase();
                        }

                        languages.push({label: LocalizationUtils.getLocalizedLabel(label), language: language});
                    }
                }
            });
            // add English (US), which is the root folder and should be sorted as well
            languages.push({label: LocalizationUtils.getLocalizedLabel("en"),  language: "en"});

            // sort the languages via their display name
            languages.sort(function (lang1, lang2) {
                return lang1.label.localeCompare(lang2.label);
            });

            // add system default (which is placed on the very top)
            languages.unshift({label: Strings.LANGUAGE_SYSTEM_DEFAULT, language: null});

            const template = Mustache.render(LanguageDialogTemplate, {languages: languages, Strings: Strings});
            Dialogs.showModalDialogUsingTemplate(template).done(function (id) {
                if (id === Dialogs.DIALOG_BTN_OK && locale !== curLocale) {
                    brackets.setLocale(locale);
                    CommandManager.execute(Commands.APP_RELOAD);
                }
            });

            const $dialog = $(".switch-language.instance");
            const $submit = $dialog.find(".dialog-button[data-button-id='" + Dialogs.DIALOG_BTN_OK + "']");
            const $select = $dialog.find("select");

            $select.on("change", setLanguage).val(curLocale!);
        }
    });
}

function enableRunTestsMenuItem() {
    if (brackets.inBrowser) {
        return;
    }

    // Check for the SpecRunner.html file
    const file = FileSystem.getFileForPath(
        FileUtils.getNativeBracketsDirectoryPath() + "/../test/SpecRunner.html"
    );

    file.exists(function (err, exists) {
        if (!err && exists) {
            // If the SpecRunner.html file exists, enable the menu item.
            // (menu item is already disabled, so no need to disable if the
            // file doesn't exist).
            CommandManager.get(DEBUG_RUN_UNIT_TESTS).setEnabled(true);
        }
    });
}

function toggleErrorNotification(bool) {
    let val;
    const oldPref = !!PreferencesManager.get(DEBUG_SHOW_ERRORS_IN_STATUS_BAR);

    if (bool === undefined) {
        val = !oldPref;
    } else {
        val = !!bool;
    }

    ErrorNotification.toggle(val);

    // update menu
    CommandManager.get(DEBUG_SHOW_ERRORS_IN_STATUS_BAR).setChecked(val);
    if (val !== oldPref) {
        PreferencesManager.set(DEBUG_SHOW_ERRORS_IN_STATUS_BAR, val);
    }
}

function handleOpenBracketsSource() {
    // Brackets source dir w/o the trailing src/ folder
    const dir = FileUtils.getNativeBracketsDirectoryPath().replace(/\/[^/]+$/, "/");
    brackets.app.showOSFolder(dir);
}

function _openPrefFilesInSplitView(prefsPath, defaultPrefsPath, deferredPromise) {

    const currScheme         = MainViewManager.getLayoutScheme();
    const file               = FileSystem.getFileForPath(prefsPath);
    const defaultPrefsFile   = FileSystem.getFileForPath(defaultPrefsPath);
    let DEFAULT_PREFS_PANE = "first-pane";
    let USER_PREFS_PANE    = "second-pane";

    // Exchange the panes, if default preferences need to be opened
    // in the right pane.
    if (!prefs.get("openUserPrefsInSecondPane")) {
        DEFAULT_PREFS_PANE = "second-pane";
        USER_PREFS_PANE    = "first-pane";
    }

    function _openFiles() {

        if (currScheme.rows === 1 && currScheme.columns === 1) {
            // Split layout is not active yet. Initiate the
            // split view.
            MainViewManager.setLayoutScheme(1, 2);
        }

        // Open the default preferences in the left pane in the read only mode.
        CommandManager.execute(Commands.FILE_OPEN, { fullPath: defaultPrefsPath, paneId: DEFAULT_PREFS_PANE, options: { isReadOnly: true } })
            .done(function () {

                // Make sure the preference file is going to be opened in pane
                // specified in the preference.
                if (MainViewManager.findInWorkingSet(DEFAULT_PREFS_PANE, prefsPath) >= 0) {

                    MainViewManager._moveView(DEFAULT_PREFS_PANE, USER_PREFS_PANE, file, 0);

                    // Now refresh the project tree by asking
                    // it to rebuild the UI.
                    WorkingSetView.refresh(true);
                }

                CommandManager.execute(Commands.FILE_OPEN, { fullPath: prefsPath, paneId: USER_PREFS_PANE})
                    .done(function () {
                        deferredPromise.resolve();
                    }).fail(function () {
                        deferredPromise.reject();
                    });
            }).fail(function () {
                deferredPromise.reject();
            });
    }

    const resultObj = MainViewManager.findInAllWorkingSets(defaultPrefsPath);
    if (resultObj && resultObj.length > 0) {
        CommandManager.execute(Commands.FILE_CLOSE, {file: defaultPrefsFile, paneId: resultObj[0].paneId})
            .done(function () {
                _openFiles();
            }).fail(function () {
                deferredPromise.reject();
            });
    } else {
        _openFiles();
    }

}

function _isSupportedPrefType(prefType) {
    if (SUPPORTED_PREFERENCE_TYPES.indexOf(prefType) >= 0) {
        return true;
    }

    return false;
}

/*
* This method tries to deduce the preference type
* based on various parameters like objects initial
* value, object type, object's type property.
*/
function _getPrefType(prefItem) {

    let finalPrefType = "undefined";

    if (prefItem) {
        // check the type parameter.
        let _prefType = prefItem.type;
        if (_prefType !== undefined) {
            finalPrefType = prefItem.type.toLowerCase();
            // make sure the initial property's
            // object type matches to that of 'type' property.
            if (prefItem.initial !== undefined) {

                if (Array.isArray(prefItem.initial)) {
                    _prefType = "array";
                } else {
                    let _initialType: string = typeof (prefItem.initial);
                    _initialType = _initialType.toLowerCase();
                    if (_prefType !== _initialType) {
                        _prefType = _initialType;
                    }
                }
            }
        }

        if (_prefType) {
            // preference object's type
            // is defined. Check if that is valid or not.
            finalPrefType = _prefType;
            if (!_isSupportedPrefType(finalPrefType)) {
                finalPrefType = "undefined";
            }
        } else if (Array.isArray(prefItem)) {
            // Check if the object itself
            // is an array, in which case
            // we log the default.
            finalPrefType = "array";
        } else if (prefItem.initial !== undefined  ||
                    prefItem.keys !== undefined) {

            // OK looks like this preference has
            // no explicit type defined. instead
            // it needs to be deduced from initial/keys
            // variable.
            let _prefVar;
            if (prefItem.initial !== undefined) {
                _prefVar = prefItem.initial;
            } else {
                _prefVar = prefItem.keys;
            }

            if (Array.isArray(_prefVar)) {
                // In cases of array the
                // typeof is returning a function.
                finalPrefType = "array";
            }

        } else {
            finalPrefType = typeof (prefItem);
        }
    }

    // Now make sure we recognize this format.
    if (!_isSupportedPrefType(finalPrefType)) {
        finalPrefType = "undefined";
    }

    return finalPrefType;
}

function _isValidPref(pref) {

    // Make sure to generate pref description only for
    // user overrides and don't generate for properties
    // meant to be used for internal purposes. Also check
    // if the preference type is valid or not.
    if (pref && !pref.excludeFromHints && _getPrefType(pref) !== "undefined") {
        return true;
    }

    return false;
}

/*
* This method tries to match between initial objects
* and key objects and then aggregates objects from both
* the properties.
*/
function _getChildPrefs(prefItem) {

    const finalObj = {};
    let keysFound = false;

    if (!prefItem) {
        return {};
    }

    function _populateKeys(allKeys) {

        let prop;
        if (typeof (allKeys) === "object") {
            // iterate through the list.
            keysFound = true;
            for (prop in allKeys) {
                if (allKeys.hasOwnProperty(prop)) {
                    finalObj[prop] = allKeys[prop];
                }
            }
        }
    }

    _populateKeys(prefItem.initial);
    _populateKeys(prefItem.keys);

    // Last resort: Maybe plain objects, in which case
    // we blindly extract all the properties.
    if (!keysFound) {
        _populateKeys(prefItem);
    }

    return finalObj;
}

function _formatBasicPref(prefItem, prefName, tabIndentStr) {

    if (!prefItem || typeof (prefName) !== "string" || _getPrefType(prefItem) === "object") {
        // return empty string in case of
        // object or pref is not defined.
        return "";
    }

    let prefDescription   = prefItem.description || "";
    let prefDefault       = prefItem.initial;
    const prefFormatText  = tabIndentStr + "\t// {0}\n" + tabIndentStr + "\t\"{1}\": {2}";
    const prefItemType    = _getPrefType(prefItem);

    if (prefDefault === undefined && !prefItem.description) {
        // This could be the case when prefItem is a basic JS variable.
        if (prefItemType === "number" || prefItemType === "boolean" || prefItemType === "string") {
            prefDefault = prefItem;
        }
    }

    if (prefDefault === undefined) {
        if (prefItemType === "number") {
            prefDefault = 0;
        } else if (prefItemType === "boolean") {
            // Defaulting the preference to false,
            // in case this is missing.
            prefDefault = false;
        } else {
            // for all other types
            prefDefault = "";
        }
    }

    if ((prefDescription === undefined || prefDescription.length === 0)) {
        if (!Array.isArray(prefDefault)) {
            prefDescription = Strings.DEFAULT_PREFERENCES_JSON_DEFAULT + ": " + prefDefault;
        } else {
            prefDescription = "";
        }
    }

    if (prefItemType === "array") {
        prefDefault = "[]";
    } else if (prefDefault.length === 0 || (prefItemType !== "boolean" && prefItemType !== "number")) {
        prefDefault = "\"" + prefDefault + "\"";
    }

    return StringUtils.format(prefFormatText, prefDescription, prefName, prefDefault);
}

function _formatPref(prefName,  prefItem, indentLevel) {

    // check for validity of the parameters being passed
    if (!prefItem || indentLevel < 0 || !prefName || !prefName.length) {
        return "";
    }

    let iLevel;
    let prefItemKeys;
    let entireText     = "";
    const prefItemDesc = prefItem.description || "";
    const prefItemType = _getPrefType(prefItem);
    let hasKeys        = false;
    let tabIndents     = "";
    let numKeys        = 0;

    // Generate the indentLevel string
    for (iLevel = 0; iLevel < indentLevel; iLevel++) {
        tabIndents += "\t";
    }

    // Check if the preference is an object.
    if (_getPrefType(prefItem) === "object") {
        prefItemKeys = _getChildPrefs(prefItem);
        if (Object.keys(prefItemKeys).length > 0) {
            hasKeys = true;
        }
    }

    // There are some properties like "highlightMatches" that
    // are declared as boolean type but still can take object keys.
    // The below condition check can take care of cases like this.
    if (prefItemType !== "object" && hasKeys === false) {
        return _formatBasicPref(prefItem, prefName, tabIndents);
    }

    // Indent the beginning of the object.
    tabIndents += "\t";

    if (prefItemDesc && prefItemDesc.length > 0) {
        entireText = tabIndents + "// " + prefItemDesc + "\n";
    }

    entireText += tabIndents + "\"" + prefName + "\": " + "{";

    if (prefItemKeys) {
        numKeys = Object.keys(prefItemKeys).length;
    }

    // In case the object array is empty
    if (numKeys <= 0) {
        entireText += "}";
        return entireText;
    }

    entireText += "\n";

    // Now iterate through all the keys
    // and generate nested formatted objects.

    Object.keys(prefItemKeys).sort().forEach(function (property) {

        if (prefItemKeys.hasOwnProperty(property)) {

            const pref = prefItemKeys[property];

            if (_isValidPref(pref)) {

                let formattedText = "";

                if (_getPrefType(pref) === "object") {
                    formattedText = _formatPref(property, pref, indentLevel + 1);
                } else {
                    formattedText = _formatBasicPref(pref, property, tabIndents);
                }

                if (formattedText.length > 0) {
                    entireText += formattedText + ",\n\n";
                }
            }
        }
    });

    // Strip ",\n\n" that got added above, for the last property
    if (entireText.length > 0) {
        entireText = entireText.slice(0, -3) + "\n" + tabIndents + "}";
    } else {
        entireText = "{}";
    }

    return entireText;
}

function _getDefaultPreferencesString() {

    const allPrefs       = PreferencesManager.getAllPreferences();
    const headerComment  = Strings.DEFAULT_PREFERENCES_JSON_HEADER_COMMENT + "\n\n{\n";
    let entireText       = "";

    Object.keys(allPrefs).sort().forEach(function (property) {
        if (allPrefs.hasOwnProperty(property)) {

            const pref = allPrefs[property];

            if (_isValidPref(pref)) {
                entireText += _formatPref(property, pref, 0) + ",\n\n";
            }
        }
    });

    // Strip ",\n\n" that got added above, for the last property
    if (entireText.length > 0) {
        entireText = headerComment + entireText.slice(0, -3) + "\n}\n";
    } else {
        entireText = headerComment + "}\n";
    }

    return entireText;
}

function _loadDefaultPrefs(prefsPath, deferredPromise) {

    const defaultPrefsPath = defaultPreferencesFullPath;
    const file             = FileSystem.getFileForPath(defaultPrefsPath);

    function _executeDefaultOpenPrefsCommand() {

        CommandManager.execute(Commands.FILE_OPEN_PREFERENCES)
            .done(function () {
                deferredPromise.resolve();
            }).fail(function () {
                deferredPromise.reject();
            });
    }

    file.exists(function (err, doesExist) {

        if (doesExist) {

            // Go about recreating the default preferences file.
            if (recomputeDefaultPrefs) {

                const prefsString       = _getDefaultPreferencesString();
                recomputeDefaultPrefs = false;

                // We need to delete this first
                file.unlink(function (err) {
                    if (!err) {
                        // Go about recreating this
                        // file and write the default
                        // preferences string to this file.
                        FileUtils.writeText(file, prefsString, true)
                            .done(function () {
                                recomputeDefaultPrefs = false;
                                _openPrefFilesInSplitView(prefsPath, defaultPrefsPath, deferredPromise);
                            }).fail(function (error) {
                                // Give a chance for default preferences command.
                                console.error("Unable to write to default preferences file! error code:" + error);
                                _executeDefaultOpenPrefsCommand();
                            });
                    } else {
                        // Some error occured while trying to delete
                        // the file. In this case open the user
                        // preferences alone.
                        console.error("Unable to delete the existing default preferences file! error code:" + err);
                        _executeDefaultOpenPrefsCommand();
                    }
                });

            } else {
                // Default preferences already generated.
                // Just go about opening both the files.
                _openPrefFilesInSplitView(prefsPath, defaultPrefsPath, deferredPromise);
            }
        } else {

            // The default prefs file does not exist at all.
            // So go about recreating the default preferences
            // file.
            const _prefsString = _getDefaultPreferencesString();
            FileUtils.writeText(file, _prefsString, true)
                .done(function () {
                    recomputeDefaultPrefs = false;
                    _openPrefFilesInSplitView(prefsPath, defaultPrefsPath, deferredPromise);
                }).fail(function (error) {
                    // Give a chance for default preferences command.
                    console.error("Unable to write to default preferences file! error code:" + error);
                    _executeDefaultOpenPrefsCommand();
                });
        }
    });
}

function handleOpenPrefsInSplitView() {

    const fullPath        = PreferencesManager.getUserPrefFile();
    const file            = FileSystem.getFileForPath(fullPath);
    const splitViewPrefOn = prefs.get("openPrefsInSplitView");
    const result          = $.Deferred();

    if (!splitViewPrefOn) {
        return CommandManager.execute(Commands.FILE_OPEN_PREFERENCES);
    }

    file.exists(function (err, doesExist) {
        if (doesExist) {
            _loadDefaultPrefs(fullPath, result);
        } else {
            FileUtils.writeText(file, "", true)
                .done(function () {
                    _loadDefaultPrefs(fullPath, result);
                }).fail(function () {
                    result.reject();
                });
        }
    });

    return result.promise();
}

ExtensionManager.on("statusChange", function (id) {
    // Seems like an extension(s) got installed.
    // Need to recompute the default prefs.
    recomputeDefaultPrefs = true;
});

/* Register all the command handlers */

// Show Developer Tools (optionally enabled)
CommandManager.register(Strings.CMD_SHOW_DEV_TOOLS,             DEBUG_SHOW_DEVELOPER_TOOLS,     handleShowDeveloperTools)!
    .setEnabled(!!brackets.app.showDeveloperTools);
CommandManager.register(Strings.CMD_REFRESH_WINDOW,             DEBUG_REFRESH_WINDOW,           handleReload);
CommandManager.register(Strings.CMD_RELOAD_WITHOUT_USER_EXTS,   DEBUG_RELOAD_WITHOUT_USER_EXTS, handleReloadWithoutUserExts);
CommandManager.register(Strings.CMD_NEW_BRACKETS_WINDOW,        DEBUG_NEW_BRACKETS_WINDOW,      handleNewBracketsWindow);

// Start with the "Run Tests" item disabled. It will be enabled later if the test file can be found.
CommandManager.register(Strings.CMD_RUN_UNIT_TESTS,       DEBUG_RUN_UNIT_TESTS,         _runUnitTests)!
    .setEnabled(false);

CommandManager.register(Strings.CMD_SHOW_PERF_DATA,            DEBUG_SHOW_PERF_DATA,            handleShowPerfData);

// Open Brackets Source (optionally enabled)
CommandManager.register(Strings.CMD_OPEN_BRACKETS_SOURCE,      DEBUG_OPEN_BRACKETS_SOURCE,      handleOpenBracketsSource)!
    .setEnabled(!StringUtils.endsWith(decodeURI(window.location.pathname), "/www/index.html"));

CommandManager.register(Strings.CMD_SWITCH_LANGUAGE,           DEBUG_SWITCH_LANGUAGE,           handleSwitchLanguage);
CommandManager.register(Strings.CMD_SHOW_ERRORS_IN_STATUS_BAR, DEBUG_SHOW_ERRORS_IN_STATUS_BAR, toggleErrorNotification);

CommandManager.register(Strings.CMD_OPEN_PREFERENCES, DEBUG_OPEN_PREFERENCES_IN_SPLIT_VIEW, handleOpenPrefsInSplitView);

enableRunTestsMenuItem();
toggleErrorNotification(PreferencesManager.get(DEBUG_SHOW_ERRORS_IN_STATUS_BAR));

PreferencesManager.on("change", DEBUG_SHOW_ERRORS_IN_STATUS_BAR, function () {
    toggleErrorNotification(PreferencesManager.get(DEBUG_SHOW_ERRORS_IN_STATUS_BAR));
});

/*
 * Debug menu
 */
const menu = Menus.addMenu(Strings.DEBUG_MENU, DEBUG_MENU, Menus.BEFORE, Menus.AppMenuBar.HELP_MENU)!;
menu.addMenuItem(DEBUG_SHOW_DEVELOPER_TOOLS, KeyboardPrefs.showDeveloperTools);
menu.addMenuItem(DEBUG_REFRESH_WINDOW, KeyboardPrefs.refreshWindow);
menu.addMenuItem(DEBUG_RELOAD_WITHOUT_USER_EXTS, KeyboardPrefs.reloadWithoutUserExts);
menu.addMenuItem(DEBUG_NEW_BRACKETS_WINDOW);
menu.addMenuDivider();
menu.addMenuItem(DEBUG_SWITCH_LANGUAGE);
menu.addMenuDivider();
menu.addMenuItem(DEBUG_RUN_UNIT_TESTS);
menu.addMenuItem(DEBUG_SHOW_PERF_DATA);
menu.addMenuItem(DEBUG_OPEN_BRACKETS_SOURCE);
menu.addMenuDivider();
menu.addMenuItem(DEBUG_SHOW_ERRORS_IN_STATUS_BAR);
menu.addMenuItem(DEBUG_OPEN_PREFERENCES_IN_SPLIT_VIEW); // this command will enable defaultPreferences and brackets preferences to be open side by side in split view.
menu.addMenuItem(Commands.FILE_OPEN_KEYMAP);      // this command is defined in core, but exposed only in Debug menu for now
