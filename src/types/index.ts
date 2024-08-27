/* eslint-disable no-undef */

import * as CommandManager from "command/CommandManager";
import * as Commands from "command/Commands";
import * as KeyBindingManager from "command/KeyBindingManager";
import * as Menus from "command/Menus";
import * as Document from "document/Document";
import * as DocumentManager from "document/DocumentManager";
import * as CodeHintManager from "editor/CodeHintManager";
import * as Editor from "editor/Editor";
import * as EditorManager from "editor/EditorManager";
import * as InlineWidget from "editor/InlineWidget";
import * as MultiRangeInlineEditor from "editor/MultiRangeInlineEditor";
import * as ExtensionManager from "extensibility/ExtensionManager";
import * as FindReferencesManager from "features/FindReferencesManager";
import * as ParameterHintsManager from "features/ParameterHintsManager";
import * as JumpToDefManager from "features/JumpToDefManager";
import FileSystemError = require("filesystem/FileSystemError");
import FileSystemStats = require("filesystem/FileSystemStats");
import * as HintUtils from "JSUtils/HintUtils";
import * as MessageIds from "JSUtils/MessageIds";
import * as ScopeManager from "JSUtils/ScopeManager";
import Session = require("JSUtils/Session");
import * as CodeInspection from "language/CodeInspection";
import * as CSSUtils from "language/CSSUtils";
import * as HTMLUtils from "language/HTMLUtils";
import * as JSONUtils from "language/JSONUtils";
import * as JSUtils from "language/JSUtils";
import * as LanguageManager from "language/LanguageManager";
import * as XMLUtils from "language/XMLUtils";
import * as ClientLoader from "languageTools/ClientLoader";
import * as DefaultProviders from "languageTools/DefaultProviders";
import * as DefaultEventHandlers from "languageTools/DefaultEventHandlers";
import * as LanguageTools from "languageTools/LanguageTools";
import * as PathConverters from "languageTools/PathConverters";
import * as FileUtils from "file/FileUtils";
import * as FileSystem from "filesystem/FileSystem";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as ProjectManager from "project/ProjectManager";
import * as SidebarView from "project/SidebarView";
import * as WorkingSetView from "project/WorkingSetView";
import * as QuickOpen from "search/QuickOpen";
import * as QuickOpenHelper from "search/QuickOpenHelper";
import * as MainViewManager from "view/MainViewManager";
import * as ThemeManager from "view/ThemeManager";
import * as WorkspaceManager from "view/WorkspaceManager";
import * as AnimationUtils from "utils/AnimationUtils";
import * as AppInit from "utils/AppInit";
import * as Async from "utils/Async";
import * as ColorUtils from "utils/ColorUtils";
import * as EventDispatcher from "utils/EventDispatcher";
import * as ExtensionUtils from "utils/ExtensionUtils";
import * as HealthLogger from "utils/HealthLogger";
import * as KeyEvent from "utils/KeyEvent";
import * as LocalizationUtils from "utils/LocalizationUtils";
import * as PerfUtils from "utils/PerfUtils";
import * as StringMatch from "utils/StringMatch";
import * as StringUtils from "utils/StringUtils";
import * as TokenUtils from "utils/TokenUtils";
import * as ViewUtils from "utils/ViewUtils";
import * as ViewStateManager from "view/ViewStateManager";
import * as DefaultDialogs from "widgets/DefaultDialogs";
import * as Dialogs from "widgets/Dialogs";
import * as InlineMenu from "widgets/InlineMenu";
import * as PopUpManager from "widgets/PopUpManager";
import * as Strings from "strings";
import * as Acorn from "thirdparty/acorn/acorn";
import * as AcornLoose from "thirdparty/acorn/acorn_loose";
import * as ASTWalker from "thirdparty/acorn/walk";
import * as CodeMirror from "codemirror";
import * as _ from "lodash";
import * as Mustache from "thirdparty/mustache/mustache";
import * as PathUtils from "thirdparty/path-utils/path-utils";

declare global {
    // these are globals from /app/preload.ts
    const appshell: any;
    const brackets: {
        platform: "win" | "mac" | "linux";

        inBrowser: boolean;
        inElectron: boolean;
        nativeMenus: boolean;
        app: any;
        config: any;
        test: any;
        metadata: any;
        _configureJSCodeHints: any;
        fs: any;
        libRequire: any;
        _jsCodeHintsHelper: any;

        getModule<T extends string>(modulePath: T)
            : T extends "command/CommandManager" ? typeof CommandManager
            : T extends "command/Commands" ? typeof Commands
            : T extends "command/KeyBindingManager" ? typeof KeyBindingManager
            : T extends "command/Menus" ? typeof Menus
            : T extends "document/Document" ? typeof Document
            : T extends "document/DocumentManager" ? typeof DocumentManager & EventDispatcher.DispatcherEvents
            : T extends "editor/CodeHintManager" ? typeof CodeHintManager
            : T extends "editor/Editor" ? typeof Editor
            : T extends "editor/EditorManager" ? typeof EditorManager & EventDispatcher.DispatcherEvents
            : T extends "editor/InlineWidget" ? typeof InlineWidget
            : T extends "editor/MultiRangeInlineEditor" ? typeof MultiRangeInlineEditor
            : T extends "extensibility/ExtensionManager" ? typeof ExtensionManager & EventDispatcher.DispatcherEvents
            : T extends "features/FindReferencesManager" ? typeof FindReferencesManager
            : T extends "features/ParameterHintsManager" ? typeof ParameterHintsManager
            : T extends "features/JumpToDefManager" ? typeof JumpToDefManager
            : T extends "filesystem/FileSystemError" ? typeof FileSystemError
            : T extends "filesystem/FileSystemStats" ? typeof FileSystemStats
            : T extends "JSUtils/ScopeManager" ? typeof ScopeManager
            : T extends "JSUtils/HintUtils" ? typeof HintUtils
            : T extends "JSUtils/MessageIds" ? typeof MessageIds
            : T extends "JSUtils/ScopeManager" ? typeof ScopeManager
            : T extends "JSUtils/Session" ? typeof Session
            : T extends "language/CodeInspection" ? typeof CodeInspection
            : T extends "language/CSSUtils" ? typeof CSSUtils
            : T extends "language/HTMLUtils" ? typeof HTMLUtils
            : T extends "language/JSONUtils" ? typeof JSONUtils
            : T extends "language/JSUtils" ? typeof JSUtils
            : T extends "language/LanguageManager" ? typeof LanguageManager & EventDispatcher.DispatcherEvents
            : T extends "language/XMLUtils" ? typeof XMLUtils
            : T extends "languageTools/ClientLoader" ? typeof ClientLoader & EventDispatcher.DispatcherEvents
            : T extends "languageTools/DefaultProviders" ? typeof DefaultProviders
            : T extends "languageTools/DefaultEventHandlers" ? typeof DefaultEventHandlers
            : T extends "languageTools/LanguageTools" ? typeof LanguageTools
            : T extends "languageTools/PathConverters" ? typeof PathConverters
            : T extends "file/FileUtils" ? typeof FileUtils
            : T extends "filesystem/FileSystem" ? typeof FileSystem
            : T extends "preferences/PreferencesManager" ? typeof PreferencesManager
            : T extends "project/ProjectManager" ? typeof ProjectManager & EventDispatcher.DispatcherEvents
            : T extends "project/SidebarView" ? typeof SidebarView
            : T extends "project/WorkingSetView" ? typeof WorkingSetView
            : T extends "view/MainViewManager" ? typeof MainViewManager & EventDispatcher.DispatcherEvents
            : T extends "view/ThemeManager" ? typeof ThemeManager
            : T extends "view/WorkspaceManager" ? typeof WorkspaceManager & EventDispatcher.DispatcherEvents
            : T extends "search/QuickOpen" ? typeof QuickOpen
            : T extends "search/QuickOpenHelper" ? typeof QuickOpenHelper
            : T extends "utils/AnimationUtils" ? typeof AnimationUtils
            : T extends "utils/AppInit" ? typeof AppInit
            : T extends "utils/Async" ? typeof Async
            : T extends "utils/ColorUtils" ? typeof ColorUtils
            : T extends "utils/EventDispatcher" ? typeof EventDispatcher
            : T extends "utils/ExtensionUtils" ? typeof ExtensionUtils
            : T extends "utils/HealthLogger" ? typeof HealthLogger
            : T extends "utils/KeyEvent" ? typeof KeyEvent
            : T extends "utils/LocalizationUtils" ? typeof LocalizationUtils
            : T extends "utils/PerfUtils" ? typeof PerfUtils
            : T extends "utils/StringMatch" ? typeof StringMatch
            : T extends "utils/StringUtils" ? typeof StringUtils
            : T extends "utils/TokenUtils" ? typeof TokenUtils
            : T extends "utils/ViewUtils" ? typeof ViewUtils
            : T extends "view/ViewStateManager" ? typeof ViewStateManager
            : T extends "widgets/DefaultDialogs" ? typeof DefaultDialogs
            : T extends "widgets/Dialogs" ? typeof Dialogs
            : T extends "widgets/InlineMenu" ? typeof InlineMenu
            : T extends "widgets/PopUpManager" ? typeof PopUpManager
            : T extends "strings" ? typeof Strings
            : T extends "thirdparty/acorn/acorn" ? typeof Acorn
            : T extends "thirdparty/acorn/acorn_loose" ? typeof AcornLoose
            : T extends "thirdparty/acorn/walk" ? typeof ASTWalker
            : T extends "thirdparty/CodeMirror/lib/codemirror" ? typeof CodeMirror
            : T extends "thirdparty/lodash" ? typeof _
            : T extends "thirdparty/mustache/mustache" ? typeof Mustache
            : T extends "thirdparty/path-utils/path-utils" ? typeof PathUtils
            : unknown;

        getModule(modulePaths: Array<string>, callback?: () => void): void;

        getLocale(): string;
        setLocale(locale: string): void;
        isLocaleDefault(): boolean;
        _getGlobalRequireJSConfig(): any;
    };
    // eslint-disable-next-line no-undef
    const electron: typeof Electron;
    const electronRemote: any;
    const node: {
        process: NodeJS.Process;
        require: NodeRequire;
        module: NodeModule;
        __filename: string;
        __dirname: string;
    };
}
