import { ipcMain } from "electron";
import { autoUpdater /* , UpdateInfo */ } from "electron-updater";
import { getLogger, isDev } from "./utils";

const log = getLogger("auto-updater");

// function notify(window: Electron.BrowserWindow, title: string, message: string) {
//     window.webContents.send("notify", title, message);
// }

export default class AppUpdater {
    constructor(window: Electron.BrowserWindow) {
        if (isDev()) {
            log.info("isDev() true, auto-updater disabled");
            return;
        }

        // autoUpdater.addListener("update-available", (info: UpdateInfo) => {
        //     log.info("A new update is available");
        // });
        // autoUpdater.addListener("download-progress", (progress) => {
        //     log.info("download-progress");
        // });
        // autoUpdater.addListener(
        //     "update-downloaded",
        //     (info: UpdateInfo) => {
        //         notify(
        //             window,
        //             "A new update is ready to install",
        //             `Version ${info.releaseName} is downloaded and will be automatically installed on Quit`
        //         );
        //     }
        // );
        // autoUpdater.addListener("error", (error: any) => {
        //     // auto-updater fails a lot because builds are not being signed yet, just ignore
        //     //
        //     // if (error.message === "Can not find Squirrel") {
        //     //     return;
        //     // }
        //     // log.error(error.stack ? error.stack : error.toString());
        // });
        // autoUpdater.addListener("checking-for-update", () => {
        //     log.info("checking-for-update");
        // });
        // autoUpdater.addListener("update-not-available", (info: UpdateInfo) => {
        //     log.info("update-not-available");
        // });
        ipcMain.on("brackets-app-ready", () => {
            autoUpdater.checkForUpdatesAndNotify();
        });
    }
}
