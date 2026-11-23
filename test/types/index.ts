import type NodeConnection = require("utils/NodeConnection");
import type * as Commands from "command/Commands"
import type * as CommandManager from "command/CommandManager"
import type * as KeyBindingManager from "command/KeyBindingManager"
import type * as Menus from "command/Menus"
import type * as DefaultDialogs from "widgets/DefaultDialogs";
import type * as Dialogs from "widgets/Dialogs";
import type * as DocumentManager from "document/DocumentManager";
import type * as EditorManager from "editor/EditorManager";
import type * as CodeHintManager from "editor/CodeHintManager";
import type * as FileSystem from "filesystem/FileSystem";
import type * as FileViewController from "project/FileViewController"
import type * as ProjectManager from "project/ProjectManager";

/* eslint-disable no-var */
// Use "var" to make all properties available globally.

declare global {

    const BEFORE           = "before";
    const AFTER            = "after";
    const FIRST            = "first";
    const LAST             = "last";
    const FIRST_IN_SECTION = "firstInSection";
    const LAST_IN_SECTION  = "lastInSection";
    const EMPTY_TEST       = "";

    type Position =
        | typeof BEFORE
        | typeof AFTER
        | typeof FIRST
        | typeof LAST
        | typeof FIRST_IN_SECTION
        | typeof LAST_IN_SECTION
        | typeof EMPTY_TEST;

    export interface BracketsApp {
        // app/appshell/app
        getNodeState(callback: (errCode: string, port: number) => void): void;
        getApplicationSupportDirectory(): string;
        getExtensionsFolder(): string;
        showExtensionsFolder(appURL: any, callback: (err?: Error) => void): void;
        getElapsedMilliseconds(): number;
        getUserHomeDirectory(): string;
        getUserDocumentsDirectory(): string;
        quit(): void;
        showDeveloperTools(): void;
        showOSFolder(path: string, callback?: (err?: any) => void): void;
        getMachineHash(callback: (err: Error | null, macHash?: string) => void): void;
        language: string;

        // TODO\CHECK
        openLiveBrowser(
            url: string,
            enableRemoteDebugging: boolean,
            callback: (err?: Error, pid?: number) => void
        ): void;
        closeLiveBrowser(callback: (err?: string) => void, pid: number): void;
        dragWindow(): void;
        openURLInDefaultBrowser(url: string, callback?: (err?: Error) => void): void;
        getSystemDefaultApp(
            graphicsFileTypes: string,
            callback: (err: Error, out: string) => void
        ): void;
        getRemoteDebuggingPort(callback: (err?: string, port?: number) => void): number;
        getPendingFilesToOpen(callback: (err?: Error, filePaths?: Array<string>) => void): void;
        getDroppedFiles(callback: (err?: Error, paths?: Array<string>) => void): void;
        installCommandLine(callback: (err?: Error) => void): void;

        // app/appshell/app-menu
        NO_ERROR: null;
        ERR_NOT_FOUND: 3;

        addMenu(
            winId: number,
            title: string,
            id: string,
            position: string,
            relativeId: string,
            callback: (err: number | null) => void
        ): void;

        addMenuItem(
            winId: number,
            parentId: string,
            title: string,
            id: string,
            key: string | null,
            displayStr: string | null,
            position: string | null,
            relativeId: string | null,
            callback: (err?: number | null) => void
        ): void;

        getMenuItemState(
            winId: number,
            commandId: string,
            callback: (err?: number | null, enabled?: boolean, checked?: boolean) => void
        ): void;

        getMenuPosition(
            winId: number,
            commandId: string,
            callback: (err?: string | null, parentId?: string, position?: number) => void
        ): void;

        getMenuTitle(
            winId: number,
            commandId: string,
            callback: (err?: number | null, title?: string) => void
        ): void;

        removeMenu(
            winId: number,
            commandId: string,
            callback: (err?: string | null, deleted?: boolean) => void
        ): void;

        removeMenuItem(
            winId: number,
            commandId: string,
            callback: (err?: string | null, deleted?: boolean) => void
        ): void;

        setMenuItemShortcut(
            winId: number,
            commandId: string,
            shortcut: string,
            displayStr: string,
            callback: (err?: number | null) => void
        ): void;

        setMenuItemState(
            winId: number,
            commandId: string,
            enabled: boolean,
            checked: boolean,
            callback: (err?: number | null) => void
        ): void;

        setMenuTitle(
            winId: number,
            commandId: string,
            title: string,
            callback: (err?: number | null) => void
        ): void;
    }

    // these are globals from /app/preload.ts
    var appshell: any;
    var brackets: {
        inBrowser: boolean
        platform: "win" | "mac"
        app: BracketsApp,
        fs: {
            readdir(path: string, callback: (err, content) => void): void
            readTextFile(path: string, encoding: string, callback: (err, content) => void): void
            writeFile(path: string, content: string, encoding: string, callback: (err) => void): void
            remove(path: string, callback: (err) => void): void
            mkdir(path: string, mode: number, callback: (err) => void): void
            rename(path: string, newPath: string, callback: (err) => void): void
            copy(path: string, newPath: string, callback: (err) => void): void
            stat(path: string, callback: (err, content) => void): void
            chmod(path: string, mode: number, callback: (err) => void): void
            moveToTrash(path: string, callback: (err) => void): void
        }
        testing: {
            nodeConnection: NodeConnection
        },
        test: {
            doneLoading: boolean
            Commands: typeof Commands
            CommandManager: typeof CommandManager
            KeyBindingManager: typeof KeyBindingManager
            Menus: typeof Menus
            DefaultDialogs: typeof DefaultDialogs
            Dialogs: typeof Dialogs
            DocumentManager: typeof DocumentManager
            EditorManager: typeof EditorManager
            CodeHintManager: typeof CodeHintManager
            FileSystem: typeof FileSystem
            FileViewController: typeof FileViewController
            ProjectManager: typeof ProjectManager
        }
    };

    var executeCommand: <T>(cmd: string, args?) => JQueryPromise<T>
    var closeAllFiles: () => void

    var beforeFirst: (func) => void;
    var afterLast: (func) => void;
    var waitsForDone: (promise: JQueryPromise<any>, operationName: string, timeout?: number) => void
    var waitsForFail: (promise: JQueryPromise<any>, operationName: string, timeout: number) => void

    // @electron/remote
    var electronRemote: any;
}
