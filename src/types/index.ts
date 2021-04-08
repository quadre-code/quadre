// these are globals from /app/preload.ts
declare const appshell: any;
declare const brackets: any;
// eslint-disable-next-line no-undef
declare const electron: typeof Electron;
declare const node: {
    process: NodeJS.Process;
    require: NodeRequire;
    module: NodeModule;
    __filename: string;
    __dirname: string;
};
