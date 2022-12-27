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

/*global jQuery */

// TODO: (issue #264) break out the definition of brackets into a separate module from the application controller logic

/**
 * brackets is the root of the Brackets codebase. This file pulls in all other modules as
 * dependencies (or dependencies thereof), initializes the UI, and binds global menus & keyboard
 * shortcuts to their Commands.
 *
 * Unlike other modules, this one can be accessed without an explicit require() because it exposes
 * a global object, window.brackets.
 */

// Load dependent non-module scripts
import "widgets/bootstrap-dropdown";
import "widgets/bootstrap-modal";
import "widgets/bootstrap-twipsy-mod";

// Load CodeMirror add-ons--these attach themselves to the CodeMirror module
import "thirdparty/CodeMirror/addon/edit/closebrackets";
import "thirdparty/CodeMirror/addon/edit/closetag";
import "thirdparty/CodeMirror/addon/edit/matchbrackets";
import "thirdparty/CodeMirror/addon/edit/matchtags";
import "thirdparty/CodeMirror/addon/fold/xml-fold";
import "thirdparty/CodeMirror/addon/mode/multiplex";
import "thirdparty/CodeMirror/addon/mode/overlay";
import "thirdparty/CodeMirror/addon/mode/simple";
import "thirdparty/CodeMirror/addon/scroll/scrollpastend";
import "thirdparty/CodeMirror/addon/search/match-highlighter";
import "thirdparty/CodeMirror/addon/search/matchesonscrollbar";
import "thirdparty/CodeMirror/addon/search/searchcursor";
import "thirdparty/CodeMirror/addon/selection/active-line";
import "thirdparty/CodeMirror/addon/selection/mark-selection";
import "thirdparty/CodeMirror/keymap/sublime";

// Load custom CodeMirror add-ons
import "thirdparty/codemirror-addon-toggle-comment/toggle-comment-simple";

// Load dependent modules
import * as AppInit from "utils/AppInit";
import * as LanguageManager from "language/LanguageManager";
import * as ProjectManager from "project/ProjectManager";
import * as FileViewController from "project/FileViewController";
import * as FileSyncManager from "project/FileSyncManager";
import * as Commands from "command/Commands";
import * as CommandManager from "command/CommandManager";
import * as PerfUtils from "utils/PerfUtils";
import * as FileSystem from "filesystem/FileSystem";
import * as Strings from "strings";
import * as Dialogs from "widgets/Dialogs";
import * as DefaultDialogs from "widgets/DefaultDialogs";
import * as ExtensionLoader from "utils/ExtensionLoader";
import * as Async from "utils/Async";
import * as UpdateNotification from "utils/UpdateNotification";
import { UrlParams } from "utils/UrlParams";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as DragAndDrop from "utils/DragAndDrop";
import * as NativeApp from "utils/NativeApp";
import * as DeprecationWarning from "utils/DeprecationWarning";
import * as ViewCommandHandlers from "view/ViewCommandHandlers";
import * as MainViewManager from "view/MainViewManager";

import * as MainViewHTML from "text!htmlContent/main-view.html";

// load modules specific for tests
import * as CodeHintManager from "editor/CodeHintManager";
import * as CodeInspection from "language/CodeInspection";
import * as CSSUtils from "language/CSSUtils";
import * as DocumentCommandHandlers from "document/DocumentCommandHandlers";
import * as DocumentManager from "document/DocumentManager";
import * as Document from "document/Document";
import * as DOMAgent from "LiveDevelopment/Agents/DOMAgent";
import * as EditorManager from "editor/EditorManager";
import * as ExtensionUtils from "utils/ExtensionUtils";
import File = require("filesystem/File");
import * as FileFilters from "search/FileFilters";
import * as FileUtils from "file/FileUtils";
import * as FindInFiles from "search/FindInFiles";
import * as FindInFilesUI from "search/FindInFilesUI";
import * as HTMLInstrumentation from "language/HTMLInstrumentation";
import * as Inspector from "LiveDevelopment/Inspector/Inspector";
import * as InstallExtensionDialog from "extensibility/InstallExtensionDialog";
import * as JSUtils from "language/JSUtils";
import * as KeyBindingManager from "command/KeyBindingManager";
import * as LiveDevelopment from "LiveDevelopment/LiveDevelopment";
import * as LiveDevMultiBrowser from "LiveDevelopment/LiveDevMultiBrowser";
import * as LiveDevServerManager from "LiveDevelopment/LiveDevServerManager";
import * as MainViewFactory from "view/MainViewFactory";
import * as Menus from "command/Menus";
import { MultiRangeInlineEditor } from "editor/MultiRangeInlineEditor";
import * as RemoteAgent from "LiveDevelopment/Agents/RemoteAgent";
import * as ScrollTrackMarkers from "search/ScrollTrackMarkers";
import * as WorkingSetView from "project/WorkingSetView";

// load modules for later use
import "utils/Global";
import "editor/CSSInlineEditor";
import "project/WorkingSetSort";
import "search/QuickOpen";
import "search/QuickOpenHelper";
import "project/SidebarView";
import "utils/Resizer";
import "LiveDevelopment/main";
import "utils/NodeConnection";
import "utils/NodeDomain";
import "utils/ColorUtils";
import "view/ThemeManager";
import "thirdparty/lodash";
import "language/XMLUtils";
import "language/JSONUtils";
import "widgets/InlineMenu";
import "electron";

// DEPRECATED: In future we want to remove the global CodeMirror, but for now we
// expose our required CodeMirror globally so as to avoid breaking extensions in the
// interim.
import * as CodeMirror from "codemirror";

Object.defineProperty(window, "CodeMirror", {
    get: function () {
        DeprecationWarning.deprecationWarning('Use brackets.getModule("thirdparty/CodeMirror/lib/codemirror") instead of global CodeMirror.', true);
        return CodeMirror;
    }
});

// DEPRECATED: In future we want to remove the global Mustache, but for now we
// expose our required Mustache globally so as to avoid breaking extensions in the
// interim.
import * as Mustache from "thirdparty/mustache/mustache";

Object.defineProperty(window, "Mustache", {
    get: function () {
        DeprecationWarning.deprecationWarning('Use brackets.getModule("thirdparty/mustache/mustache") instead of global Mustache.', true);
        return Mustache;
    }
});

// DEPRECATED: In future we want to remove the global PathUtils, but for now we
// expose our required PathUtils globally so as to avoid breaking extensions in the
// interim.
import * as PathUtils from "thirdparty/path-utils/path-utils";

Object.defineProperty(window, "PathUtils", {
    get: function () {
        DeprecationWarning.deprecationWarning('Use brackets.getModule("thirdparty/path-utils/path-utils") instead of global PathUtils.', true);
        return PathUtils;
    }
});

// load language features
import "features/ParameterHintsManager";
import "features/JumpToDefManager";

// Load modules that self-register and just need to get included in the main project
import "command/DefaultMenus";
import "document/ChangedDocumentTracker";
import "editor/EditorCommandHandlers";
import "editor/EditorOptionHandlers";
import "editor/EditorStatusBar";
import "editor/ImageViewer";
import "extensibility/ExtensionManagerDialog";
import "help/HelpCommandHandlers";
import "search/FindReplace";

// Load find References Feature Manager
import "features/FindReferencesManager";

// Load common JS module
import "JSUtils/Session";
import "JSUtils/ScopeManager";

// load Language Tools Module
import "languageTools/PathConverters";
import "languageTools/LanguageTools";
import "languageTools/ClientLoader";
import "languageTools/BracketsToNodeInterface";
import "languageTools/DefaultProviders";
import "languageTools/DefaultEventHandlers";

PerfUtils.addMeasurement("brackets module dependencies resolved");

// Local variables
const params = new UrlParams();

// read URL params
params.parse();


/**
 * Setup test object
 */
function _initTest() {
    // TODO: (issue #265) Make sure the "test" object is not included in final builds
    // All modules that need to be tested from the context of the application
    // must to be added to this object. The unit tests cannot just pull
    // in the modules since they would run in context of the unit test window,
    // and would not have access to the app html/css.
    brackets.test = {
        CodeHintManager         : CodeHintManager,
        CodeInspection          : CodeInspection,
        CommandManager          : CommandManager,
        Commands                : Commands,
        CSSUtils                : CSSUtils,
        DefaultDialogs          : DefaultDialogs,
        Dialogs                 : Dialogs,
        DocumentCommandHandlers : DocumentCommandHandlers,
        DocumentManager         : DocumentManager,
        DocumentModule          : Document,
        DOMAgent                : DOMAgent,
        DragAndDrop             : DragAndDrop,
        EditorManager           : EditorManager,
        ExtensionLoader         : ExtensionLoader,
        ExtensionUtils          : ExtensionUtils,
        File                    : File,
        FileFilters             : FileFilters,
        FileSyncManager         : FileSyncManager,
        FileSystem              : FileSystem,
        FileUtils               : FileUtils,
        FileViewController      : FileViewController,
        FindInFiles             : FindInFiles,
        FindInFilesUI           : FindInFilesUI,
        HTMLInstrumentation     : HTMLInstrumentation,
        Inspector               : Inspector,
        InstallExtensionDialog  : InstallExtensionDialog,
        JSUtils                 : JSUtils,
        KeyBindingManager       : KeyBindingManager,
        LanguageManager         : LanguageManager,
        LiveDevelopment         : LiveDevelopment,
        LiveDevMultiBrowser     : LiveDevMultiBrowser,
        LiveDevServerManager    : LiveDevServerManager,
        MainViewFactory         : MainViewFactory,
        MainViewManager         : MainViewManager,
        Menus                   : Menus,
        MultiRangeInlineEditor  : MultiRangeInlineEditor,
        NativeApp               : NativeApp,
        PerfUtils               : PerfUtils,
        PreferencesManager      : PreferencesManager,
        ProjectManager          : ProjectManager,
        RemoteAgent             : RemoteAgent,
        ScrollTrackMarkers      : ScrollTrackMarkers,
        UpdateNotification      : UpdateNotification,
        WorkingSetView          : WorkingSetView,
        doneLoading             : false
    };

    AppInit.appReady(function () {
        brackets.test.doneLoading = true;
    });
}

/**
 * Setup Brackets
 */
function _onReady() {
    PerfUtils.addMeasurement("window.document Ready");

    // Let the user know Brackets doesn't run in a web browser yet
    if (brackets.inBrowser) {
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            Strings.ERROR_IN_BROWSER_TITLE,
            Strings.ERROR_IN_BROWSER
        );
    }

    brackets.app.getRemoteDebuggingPort(function (err, remoteDebuggingPort) {
        const InfoBar = (require as unknown as Require)("widgets/infobar");
        const StringUtils = (require as unknown as Require)("utils/StringUtils");
        if ((!err) && remoteDebuggingPort && remoteDebuggingPort > 0) {
            InfoBar.showInfoBar({
                type: "warning",
                title: `${Strings.REMOTE_DEBUGGING_ENABLED}${remoteDebuggingPort}`,
                description: ""
            });
        } else if (err) {
            InfoBar.showInfoBar({
                type: "error",
                title: StringUtils.format(Strings.REMOTE_DEBUGGING_PORT_INVALID, err, 1024, 65534),
                description: ""
            });
        }
    });

    // Use quiet scrollbars if we aren't on Lion. If we're on Lion, only
    // use native scroll bars when the mouse is not plugged in or when
    // using the "Always" scroll bar setting.
    const osxMatch = /Mac OS X 10\D([\d+])\D/.exec(window.navigator.userAgent);
    if (osxMatch && osxMatch[1] && Number(osxMatch[1]) >= 7) {
        // test a scrolling div for scrollbars
        const $testDiv = $("<div style='position:fixed;left:-50px;width:50px;height:50px;overflow:auto;'><div style='width:100px;height:100px;'/></div>").appendTo(window.document.body);

        if ($testDiv.outerWidth() === $testDiv.get(0).clientWidth) {
            $(".sidebar").removeClass("quiet-scrollbars");
        }

        $testDiv.remove();
    }

    // Load default languages and preferences
    Async.waitForAll([LanguageManager.ready, PreferencesManager.ready]).always(function () {
        // Load all extensions. This promise will complete even if one or more
        // extensions fail to load.
        const extensionPathOverride = params.get<string>("extensions");  // used by unit tests
        const extensionLoaderPromise = ExtensionLoader.init(extensionPathOverride ? extensionPathOverride.split(",") : null);

        // Load the initial project after extensions have loaded
        extensionLoaderPromise.always(function () {
            // Signal that extensions are loaded
            AppInit._dispatchReady(AppInit.EXTENSIONS_LOADED);

            // Finish UI initialization
            ViewCommandHandlers.restoreFontSize();
            const initialProjectPath = ProjectManager.getInitialProjectPath();
            ProjectManager.openProject(initialProjectPath).always(function () {
                _initTest();

                // If this is the first launch, and we have an index.html file in the project folder (which should be
                // the samples folder on first launch), open it automatically. (We explicitly check for the
                // samples folder in case this is the first time we're launching Brackets after upgrading from
                // an old version that might not have set the "afterFirstLaunch" pref.)
                const deferred = $.Deferred();

                if (!params.get("skipSampleProjectLoad") && !PreferencesManager.getViewState("afterFirstLaunch")) {
                    PreferencesManager.setViewState("afterFirstLaunch", "true");
                    if (ProjectManager.isWelcomeProjectPath(initialProjectPath)) {
                        FileSystem.resolve(initialProjectPath + "index.html", function (err, file) {
                            if (!err) {
                                const promise = CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, { fullPath: file.fullPath });
                                promise.then(deferred.resolve, deferred.reject);
                            } else {
                                deferred.reject();
                            }
                        });
                    } else {
                        deferred.resolve();
                    }
                } else {
                    deferred.resolve();
                }

                deferred.always(function () {
                    // Signal that Brackets is loaded
                    AppInit._dispatchReady(AppInit.APP_READY);

                    PerfUtils.addMeasurement("Application Startup");

                    if (PreferencesManager._isUserScopeCorrupt()) {
                        const userPrefFullPath = PreferencesManager.getUserPrefFile();
                        // user scope can get corrupt only if the file exists, is readable,
                        // but malformed. no need to check for its existance.
                        const info = MainViewManager.findInAllWorkingSets(userPrefFullPath);
                        let paneId;
                        if (info.length) {
                            paneId = info[0].paneId;
                        }
                        FileViewController.openFileAndAddToWorkingSet(userPrefFullPath, paneId)
                            .done(function () {
                                Dialogs.showModalDialog(
                                    DefaultDialogs.DIALOG_ID_ERROR,
                                    Strings.ERROR_PREFS_CORRUPT_TITLE,
                                    Strings.ERROR_PREFS_CORRUPT
                                ).done(function () {
                                    // give the focus back to the editor with the pref file
                                    MainViewManager.focusActivePane();
                                });
                            });
                    }

                });

                // See if any startup files were passed to the application
                if (brackets.app.getPendingFilesToOpen) {
                    brackets.app.getPendingFilesToOpen(function (err, paths) {
                        DragAndDrop.openDroppedFiles(paths);
                    });
                }
            });
        });
    });

    // Check for updates
    if (!brackets.inBrowser && !params.get("skipUpdateCheck")) {
        AppInit.appReady(function () {
            // launches periodic checks for updates cca every 24 hours
            // UpdateNotification.launchAutomaticUpdate();
        });
    }
}

/**
 * Setup event handlers prior to dispatching AppInit.HTML_READY
 */
function _beforeHTMLReady() {
    // Add the platform (mac, win or linux) to the body tag so we can have platform-specific CSS rules
    $("body").addClass("platform-" + brackets.platform);

    // Browser-hosted version may also have different CSS (e.g. since '#titlebar' is shown)
    if (brackets.inBrowser) {
        $("body").addClass("in-browser");
    } else {
        $("body").addClass("in-appshell");
    }

    // Enable/Disable HTML Menus
    if (brackets.nativeMenus) {
        $("body").addClass("has-appshell-menus");
    } else {
        // (issue #5310) workaround for bootstrap dropdown: prevent the menu item to grab
        // the focus -- override jquery focus implementation for top-level menu items
        (function () {
            const defaultFocus = $.fn.focus;
            $.fn.focus = function () {
                if (!this.hasClass("dropdown-toggle")) {
                    return defaultFocus.apply(this, arguments);
                }
            };
        }());
    }

    // Localize MainViewHTML and inject into <BODY> tag
    $("body").html(Mustache.render(MainViewHTML, { shouldAddAA: (brackets.platform === "mac"), Strings: Strings }));

    // Update title
    $("title").text(brackets.config.app_title);

    // Respond to dragging & dropping files/folders onto the window by opening them. If we don't respond
    // to these events, the file would load in place of the Brackets UI
    DragAndDrop.attachHandlers();

    // TODO: (issue 269) to support IE, need to listen to document instead (and even then it may not work when focus is in an input field?)
    $(window).focus(function () {
        // This call to syncOpenDocuments() *should* be a no-op now that we have
        // file watchers, but is still here as a safety net.
        FileSyncManager.syncOpenDocuments();
    });

    // Prevent unhandled middle button clicks from triggering native behavior
    // Example: activating AutoScroll (see #510)
    $("html").on("mousedown", ".inline-widget", function (e) {
        if (e.button === 1) {
            e.preventDefault();
        }
    });

    // The .no-focus style is added to clickable elements that should
    // not steal focus. Calling preventDefault() on mousedown prevents
    // focus from going to the click target.
    $("html").on("mousedown", ".no-focus", function (e) {
        // Text fields should always be focusable.
        const $target = $(e.target);
        const isFormElement =
                $target.is("input") ||
                $target.is("textarea") ||
                $target.is("select");

        if (!isFormElement) {
            e.preventDefault();
        }
    });

    // Prevent clicks on any link from navigating to a different page (which could lose unsaved
    // changes). We can't use a simple .on("click", "a") because of http://bugs.jquery.com/ticket/3861:
    // jQuery hides non-left clicks from such event handlers, yet middle-clicks still cause CEF to
    // navigate. Also, a capture handler is more reliable than bubble.
    window.document.body.addEventListener("click", function (e) {
        // Check parents too, in case link has inline formatting tags
        let node = e.target as HTMLElement | null;
        let url;
        while (node) {
            if (node.tagName === "A") {
                url = node.getAttribute("href");
                if (url && !url.match(/^#/)) {
                    NativeApp.openURLInDefaultBrowser(url);
                }
                e.preventDefault();
                break;
            }
            node = node.parentElement;
        }
    }, true);

    // Prevent extensions from using window.open() to insecurely load untrusted web content
    const realWindowOpen = window.open;
    window.open = function (url: string) {
        // Allow file:// URLs, relative URLs (implicitly file: also), and about:blank
        if (!url.match(/^file:\/\//) && !url.match(/^about:blank/) && url.indexOf(":") !== -1) {
            throw new Error("Brackets-shell is not a secure general purpose web browser. Use NativeApp.openURLInDefaultBrowser() to open URLs in the user's main browser");
        }
        return realWindowOpen.apply(window, arguments);
    };

    // jQuery patch to shim deprecated usage of $() on EventDispatchers
    const DefaultCtor = jQuery.fn.init;
    jQuery.fn.init = function (firstArg, secondArg) {
        const jQObject = new DefaultCtor(firstArg, secondArg);

        // Is this a Brackets EventDispatcher object? (not a DOM node or other object)
        if (firstArg && firstArg._EventDispatcher) {
            // Patch the jQ wrapper object so it calls EventDispatcher's APIs instead of jQuery's
            jQObject.on  = firstArg.on.bind(firstArg);
            jQObject.one = firstArg.one.bind(firstArg);
            jQObject.off = firstArg.off.bind(firstArg);
            // Don't offer legacy support for trigger()/triggerHandler() on core model objects; extensions
            // shouldn't be doing that anyway since it's basically poking at private API

            // Console warning, since $() is deprecated for EventDispatcher objects
            // (pass true to only print once per caller, and index 4 since the extension caller is deeper in the stack than usual)
            DeprecationWarning.deprecationWarning("Deprecated: Do not use $().on/off() on Brackets modules and model objects. Call on()/off() directly on the object without a $() wrapper.", true, 4);
        }
        return jQObject;
    };
}

// Wait for view state to load.
const viewStateTimer = PerfUtils.markStart("User viewstate loading");
PreferencesManager._smUserScopeLoading.always(function () {
    PerfUtils.addMeasurement(viewStateTimer);
    // Dispatch htmlReady event
    _beforeHTMLReady();
    AppInit._dispatchReady(AppInit.HTML_READY);
    $(window.document).ready(_onReady);
});
