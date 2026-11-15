import NodeConnection = require("utils/NodeConnection");
import * as Commands from "command/Commands"
import * as CommandManager from "command/CommandManager"
import * as DefaultDialogs from "widgets/DefaultDialogs";
import * as Dialogs from "widgets/Dialogs";
import * as DocumentManager from "document/DocumentManager";
import * as EditorManager from "editor/EditorManager";
import * as FileSystem from "filesystem/FileSystem";
import * as FileViewController from "project/FileViewController"
import * as ProjectManager from "project/ProjectManager";

/* eslint-disable no-var */
// Use "var" to make all properties available globally.

declare global {
    // these are globals from /app/preload.ts
    var appshell: any;
    var brackets: {
        platform: "win" | "mac"
        app: {
            getApplicationSupportDirectory(): string
            getUserHomeDirectory(): string
        },
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
            DefaultDialogs: typeof DefaultDialogs
            Dialogs: typeof Dialogs
            DocumentManager: typeof DocumentManager
            EditorManager: typeof EditorManager
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
}
