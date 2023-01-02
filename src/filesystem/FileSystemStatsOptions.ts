export interface FileSystemStatsOptions {
    isFile: boolean;
    mtime: Date | string;
    size: number;
    realPath?: string;
    hash: number;
}
