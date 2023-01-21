export interface FileSystemImpl {
    showOpenDialog(
        allowMultipleSelection: boolean,
        chooseDirectories: boolean,
        title: string,
        initialPath: string,
        fileTypes: Array<string> | null,
        callback: Function
    ): void;

    showSaveDialog(
        title: string,
        initialPath: string,
        proposedNewFilename: string,
        callback: Function
    ): void;

    stat(path: string, callback: Function): void;

    exists(path: string, callback: Function): void;

    readdir(path: string, callback: Function): void;

    mkdir(path: string, mode: number, callback: Function): void;

    rename(oldPath: string, newPath: string, callback: Function): void;

    readFile(path: string, options: { encoding: string, stat: any }, callback: Function): void;

    writeFile(
        path: string,
        data: string,
        options: { encoding: string, preserveBOM: boolean, mode: number, expectedHash: string, expectedContents: string },
        callback: Function
    ): void;

    unlink(path: string, callback: Function): void;

    moveToTrash(path: string, callback: Function): void;

    initWatchers(changeCallback: Function, offlineCallback: Function): void;

    watchPath(
        path: string,
        ignored: Array<string>,
        callback: (err: any, ...args) => void
    ): void;

    unwatchPath(
        path: string,
        ignored: Array<string>,
        callback: (err: any, ...args) => void
    ): void;

    unwatchAll(callback?: (err: any, ...args) => void): void;

    recursiveWatch: boolean;
    normalizeUNCPaths: boolean;
}
