/* eslint-disable no-redeclare, no-undef */

import * as CommandManager from "command/CommandManager";
import * as Commands from "command/Commands";
import * as Menus from "command/Menus";
import * as DocumentManager from "document/DocumentManager";
import * as CodeHintManager from "editor/CodeHintManager";
import * as EditorManager from "editor/EditorManager";
import * as MultiRangeInlineEditor from "editor/MultiRangeInlineEditor";
import * as ParameterHintsManager from "features/ParameterHintsManager";
import * as JumpToDefManager from "features/JumpToDefManager";
import * as HintUtils from "JSUtils/HintUtils";
import * as MessageIds from "JSUtils/MessageIds";
import * as ScopeManager from "JSUtils/ScopeManager";
import * as CodeInspection from "language/CodeInspection";
import * as CSSUtils from "language/CSSUtils";
import * as HTMLUtils from "language/HTMLUtils";
import * as JSONUtils from "language/JSONUtils";
import * as JSUtils from "language/JSUtils";
import * as LanguageManager from "language/LanguageManager";
import * as XMLUtils from "language/XMLUtils";
import * as FileUtils from "file/FileUtils";
import * as FileSystem from "filesystem/FileSystem";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as ProjectManager from "project/ProjectManager";
import * as QuickOpen from "search/QuickOpen";
import * as QuickOpenHelper from "search/QuickOpenHelper";
import * as MainViewManager from "view/MainViewManager";
import * as ThemeManager from "view/ThemeManager";
import * as AppInit from "utils/AppInit";
import * as ColorUtils from "utils/ColorUtils";
import * as EventDispatcher from "utils/EventDispatcher";
import * as ExtensionUtils from "utils/ExtensionUtils";
import * as HealthLogger from "utils/HealthLogger";
import * as PerfUtils from "utils/PerfUtils";
import * as StringMatch from "utils/StringMatch";
import * as StringUtils from "utils/StringUtils";
import * as TokenUtils from "utils/TokenUtils";
import * as DefaultDialogs from "widgets/DefaultDialogs";
import * as Dialogs from "widgets/Dialogs";
import * as InlineMenu from "widgets/InlineMenu";
import * as Strings from "strings";
import * as Acorn from "thirdparty/acorn/acorn";
import * as AcornLoose from "thirdparty/acorn/acorn_loose";
import * as ASTWalker from "thirdparty/acorn/walk";
import * as CodeMirror from "thirdparty/CodeMirror/lib/codemirror";
import * as _ from "lodash";
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

        /* eslint-disable @typescript-eslint/indent */
        getModule<T extends string>(modulePath: T)
            : T extends "command/CommandManager" ? typeof CommandManager
            : T extends "command/Commands" ? typeof Commands
            : T extends "command/Menus" ? typeof Menus
            : T extends "document/DocumentManager" ? typeof DocumentManager
            : T extends "editor/CodeHintManager" ? typeof CodeHintManager
            : T extends "editor/EditorManager" ? typeof EditorManager & EventDispatcher.DispatcherEvents
            : T extends "editor/MultiRangeInlineEditor" ? typeof MultiRangeInlineEditor
            : T extends "features/ParameterHintsManager" ? typeof ParameterHintsManager
            : T extends "features/JumpToDefManager" ? typeof JumpToDefManager
            : T extends "JSUtils/ScopeManager" ? typeof ScopeManager
            : T extends "JSUtils/HintUtils" ? typeof HintUtils
            : T extends "JSUtils/MessageIds" ? typeof MessageIds
            : T extends "JSUtils/ScopeManager" ? typeof ScopeManager
            : T extends "JSUtils/Session" ? any
            : T extends "language/CodeInspection" ? typeof CodeInspection
            : T extends "language/CSSUtils" ? typeof CSSUtils
            : T extends "language/HTMLUtils" ? typeof HTMLUtils
            : T extends "language/JSONUtils" ? typeof JSONUtils
            : T extends "language/JSUtils" ? typeof JSUtils
            : T extends "language/LanguageManager" ? typeof LanguageManager
            : T extends "language/XMLUtils" ? typeof XMLUtils
            : T extends "file/FileUtils" ? typeof FileUtils
            : T extends "filesystem/FileSystem" ? typeof FileSystem
            : T extends "preferences/PreferencesManager" ? typeof PreferencesManager
            : T extends "project/ProjectManager" ? typeof ProjectManager & EventDispatcher.DispatcherEvents
            : T extends "view/MainViewManager" ? typeof MainViewManager
            : T extends "view/ThemeManager" ? typeof ThemeManager
            : T extends "search/QuickOpen" ? typeof QuickOpen
            : T extends "search/QuickOpenHelper" ? typeof QuickOpenHelper
            : T extends "utils/AppInit" ? typeof AppInit
            : T extends "utils/ColorUtils" ? typeof ColorUtils
            : T extends "utils/EventDispatcher" ? typeof EventDispatcher
            : T extends "utils/ExtensionUtils" ? typeof ExtensionUtils
            : T extends "utils/HealthLogger" ? typeof HealthLogger
            : T extends "utils/PerfUtils" ? typeof PerfUtils
            : T extends "utils/StringMatch" ? typeof StringMatch
            : T extends "utils/StringUtils" ? typeof StringUtils
            : T extends "utils/TokenUtils" ? typeof TokenUtils
            : T extends "widgets/DefaultDialogs" ? typeof DefaultDialogs
            : T extends "widgets/Dialogs" ? typeof Dialogs
            : T extends "widgets/InlineMenu" ? typeof InlineMenu
            : T extends "strings" ? typeof Strings
            : T extends "thirdparty/acorn/acorn" ? typeof Acorn
            : T extends "thirdparty/acorn/acorn_loose" ? typeof AcornLoose
            : T extends "thirdparty/acorn/walk" ? typeof ASTWalker
            : T extends "thirdparty/CodeMirror/lib/codemirror" ? typeof CodeMirror
            : T extends "thirdparty/lodash" ? typeof _
            : T extends "thirdparty/path-utils/path-utils" ? typeof PathUtils
            : unknown;
        /* eslint-enable @typescript-eslint/indent */

        getModule(modulePaths: Array<string>): void;

        getLocale(): string;
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
