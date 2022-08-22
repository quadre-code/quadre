/*
 * Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2022 - present The quadre code authors. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

define(function (require, exports, module) {
    "use strict";

    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils"),
        CommandManager,
        Commands,
        Dialogs,
        MainViewManager;

    var REMOTE_FILE_PATH = "https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css",
        INVALID_REMOTE_FILE_PATH = "https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/invalid.min.css";

    // Verify if we are running in a CI.
    var UrlParams = brackets.getModule("utils/UrlParams").UrlParams,
        params    = new UrlParams();

    // parse URL parameters
    params.parse();

    var isCI = /true/i.test(params.get("isCI"));

    describe("RemoteFileAdapter", function () {
        var testWindow;

        function createRemoteFile(filePath, success) {
            var promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: filePath});
            if (success === false) {
                waitsForFail(promise, "createRemoteFile", 5000);
            } else {
                waitsForDone(promise, "createRemoteFile", 5000);
            }
            return promise;
        }

        function deleteCurrentRemoteFile() {
            CommandManager.execute(Commands.FILE_DELETE);
        }

        function saveRemoteFile() {
            CommandManager.execute(Commands.FILE_SAVE);
        }

        function renameRemoteFile(filePath) {
            CommandManager.execute(Commands.FILE_RENAME);
        }

        function closeRemoteFile(filePath) {
            var promise = CommandManager.execute(Commands.FILE_CLOSE, {fullPath: filePath});
            waitsForDone(promise, "closeRemoteFile", 5000);
            return promise;
        }

        beforeEach(function () {
            runs(function () {
                SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                    testWindow = w;
                    MainViewManager = testWindow.brackets.test.MainViewManager;
                    CommandManager  = testWindow.brackets.test.CommandManager;
                    Dialogs         = testWindow.brackets.test.Dialogs;
                    Commands        = testWindow.brackets.test.Commands;
                });
            });
        });

        afterEach(function () {
            testWindow    = null;
            SpecRunnerUtils.closeTestWindow();
        });


        it("Open/close remote https file", function () {
            runs(function () {
                createRemoteFile(REMOTE_FILE_PATH).done(function () {
                    expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
                    closeRemoteFile(REMOTE_FILE_PATH).done(function () {
                        expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
                    });
                });
            });
        });

        it("Open invalid remote file", function () {
            runs(function () {
                spyOn(Dialogs, "showModalDialog").andCallFake(function (dlgClass, title, message, buttons) {
                    console.warn(title, message);
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                });
                createRemoteFile(INVALID_REMOTE_FILE_PATH, false).always(function () {
                    expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
                    expect(Dialogs.showModalDialog).toHaveBeenCalled();
                    expect(Dialogs.showModalDialog.callCount).toBe(1);
                });
            });
        });

        (isCI ? xit : it)("Save remote file", function () {
            runs(function () {
                createRemoteFile(REMOTE_FILE_PATH).done(function () {
                    spyOn(Dialogs, "showModalDialog").andCallFake(function (dlgClass, title, message, buttons) {
                        console.warn(title, message);
                        return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                    });
                    saveRemoteFile();
                    expect(Dialogs.showModalDialog).toHaveBeenCalled();
                    expect(Dialogs.showModalDialog.callCount).toBe(1);
                    closeRemoteFile(REMOTE_FILE_PATH).done(function () {
                        expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
                    });
                });
            });
        });

        (isCI ? xit : it)("Delete remote file", function () {
            runs(function () {
                createRemoteFile(REMOTE_FILE_PATH).done(function () {
                    expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
                    spyOn(Dialogs, "showModalDialog").andCallFake(function (dlgClass, title, message, buttons) {
                        console.warn(title, message);
                        return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                    });
                    deleteCurrentRemoteFile();
                    expect(Dialogs.showModalDialog).toHaveBeenCalled();
                    expect(Dialogs.showModalDialog.callCount).toBe(1);
                    expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
                    closeRemoteFile(REMOTE_FILE_PATH).done(function () {
                        expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
                    });
                });
            });
        });

        (isCI ? xit : it)("Rename remote file", function () {
            runs(function () {
                createRemoteFile(REMOTE_FILE_PATH).done(function () {
                    expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
                    spyOn(Dialogs, "showModalDialog").andCallFake(function (dlgClass, title, message, buttons) {
                        console.warn(title, message);
                        return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                    });
                    renameRemoteFile();
                    expect(Dialogs.showModalDialog).toHaveBeenCalled();
                    expect(Dialogs.showModalDialog.callCount).toBe(1);
                    expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
                });
            });
        });
    });
});
