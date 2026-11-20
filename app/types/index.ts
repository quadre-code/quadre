export const BEFORE = "before";
export const AFTER = "after";
export const FIRST = "first";
export const LAST = "last";
export const FIRST_IN_SECTION = "firstInSection";
export const LAST_IN_SECTION = "lastInSection";
export const EMPTY_TEST = "";

export type Position =
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
