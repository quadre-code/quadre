import * as electron from "electron";
import * as electronRemote from "@electron/remote";
import appshell = require("./appshell/index");

let t: any;

// define global object extensions
interface BracketsWindowGlobal {
    // TODO: better define appshell (brackets) global object
    appshell: any;
    brackets: any;
    electron: typeof electron;
    electronRemote: typeof electronRemote;
    node: {
        process: NodeJS.Process;
        require: NodeRequire;
        module: NodeModule;
        __filename: string;
        __dirname: string;
    };
}

function nodeRequire(name: string): NodeRequire {
    return require(/* webpackIgnore: true */ name);
}

process.once("loaded", function () {
    try {
        t = {
            electron,
            electronRemote,
            process,
            require: nodeRequire,
            module,
            __filename,
            __dirname,
            appshell
        };
        electron.ipcRenderer.send("log", "preload-fine");
    } catch (err) {
        electron.ipcRenderer.send("log", err.stack);
        return;
    }

    const g = global as BracketsWindowGlobal & typeof global;
    // expose electron renderer process modules
    g.electron = t.electron;
    g.electronRemote = t.electronRemote;
    // expose node stuff under node global wrapper because of requirejs
    g.node = {
        process: t.process,
        require: t.require,
        module: t.module,
        __filename: t.__filename,
        __dirname: t.__dirname
    };
    // this is to fix requirejs text plugin
    g.process = t.process;
    (g.process.versions as any)["node-webkit"] = true;
    // inject appshell implementation into the browser window
    g.appshell = g.brackets = t.appshell;
});
