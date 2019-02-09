// these are globals from /app/preload.ts
declare const appshell: any;
declare const brackets: any;
declare const electron: Electron.AllElectron;
declare const node: {
    process: NodeJS.Process;
    require: NodeRequire;
    module: NodeModule;
    __filename: string;
    __dirname: string;
};
