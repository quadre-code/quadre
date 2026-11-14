import NodeConnection = require("utils/NodeConnection");
import * as Commands from "command/Commands"
import * as CommandManager from "command/CommandManager"
import * as DefaultDialogs from "widgets/DefaultDialogs";
import * as Dialogs from "widgets/Dialogs";
import * as DocumentManager from "document/DocumentManager";
import * as FileSystem from "filesystem/FileSystem";
import * as FileViewController from "project/FileViewController"
import * as ProjectManager from "project/ProjectManager";

/* eslint-disable no-var */
// Use "var" to make all properties available globally.

declare global {
    // these are globals from /app/preload.ts
    var appshell: any;
    var brackets: {
        platform: "win"
        fs: {
            chmod(path: string, mode: number, callback: (err) => void)
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

export {}
