// define global object extensions
interface BracketsWindowGlobal extends NodeJS.Global {
    // TODO: better define appshell (brackets) global object
    appshell: any;
    brackets: any;
    electron: Electron.ElectronMainAndRenderer;
    node: {
        process: NodeJS.Process;
        require: NodeRequire;
        module: NodeModule;
        __filename: string;
        __dirname: string;
    };
}

import * as electron from "electron";
let t;

try {
    t = {
        electron: electron,
        process: process,
        require: require,
        module: module,
        __filename: __filename,
        __dirname: __dirname,
        appshell: require("./appshell/index")
    };
} catch (err) {
    electron.ipcRenderer.send("log", err.stack);
}

process.once("loaded", function () {
    const g = global as BracketsWindowGlobal;
    // expose electron renderer process modules
    g.electron = t.electron;
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
    g.process.versions["node-webkit"] = true;
    // inject appshell implementation into the browser window
    g.appshell = g.brackets = t.appshell;
});
