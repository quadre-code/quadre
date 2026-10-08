/*
 * Copyright (c) 2013 - 2017 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeEach, afterEach, runs, waitsForDone */

define(function (require, exports, module) {
    "use strict";

    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils"),
        FileUtils = brackets.getModule("file/FileUtils"),
        Commands = brackets.getModule("command/Commands");

    const EXTENSION_NAME = "quadre-eslint";
    const AUTOFIX_COMMAND_ID = EXTENSION_NAME + ".autofix";

    describe("ESLint", function () {
        var testFolder = FileUtils.getNativeModuleDirectoryPath(module) + "/unittest-files/",
            testWindow,
            $,
            CodeInspection,
            CommandManager,
            EditorManager,
            myEditor,
            myDocument;

        var toggleESLintResults = function (visible) {
            $("#status-inspection").triggerHandler("click");
            expect($("#problems-panel").is(":visible")).toBe(visible);
        };

        beforeEach(function () {
            runs(function () {
                SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                    testWindow = w;
                    // Load module instances from brackets.test
                    $ = testWindow.$;
                    CodeInspection = testWindow.brackets.test.CodeInspection;
                    CodeInspection.toggleEnabled(true);
                    CommandManager = testWindow.brackets.test.CommandManager;
                    EditorManager = testWindow.brackets.test.EditorManager;
                });
            });

            runs(function () {
                SpecRunnerUtils.loadProjectInTestWindow(testFolder);
            });
        });

        afterEach(function () {
            EditorManager = null;
            CommandManager = null;
            CodeInspection = null;
            $ = null;
            testWindow = null;
            SpecRunnerUtils.closeTestWindow();
        });

        it("should run ESLint linter when a JavaScript document opens", function () {
            runs(function () {
                waitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");
            });

            runs(function () {
                var isEnabled = !$("status-inspection").hasClass("inspection-disabled");
                expect(isEnabled).toBe(true);
            });
        });

        it("status icon should toggle Errors panel when errors present", function () {
            runs(function () {
                waitsForDone(SpecRunnerUtils.openProjectFiles(["errors.js"]), "open test file");
            });
            runs(function () {
                toggleESLintResults(false);
                toggleESLintResults(true);
            });
        });

        it("status icon should not toggle Errors panel when no errors present", function () {
            runs(function () {
                waitsForDone(SpecRunnerUtils.openProjectFiles(["no-errors.js"]), "open test file");
            });

            runs(function () {
                toggleESLintResults(false);
                toggleESLintResults(false);
            });
        });

        it("should use inline configuration", function () {
            runs(function () {
                waitsForDone(
                    SpecRunnerUtils.openProjectFiles(["different-indent.js"]),
                    "open test file"
                );
            });

            runs(function () {
                toggleESLintResults(false);
                toggleESLintResults(false);
            });
        });

        describe("autofix command", function () {
            afterEach(function () {
                runs(function () {
                    waitsForDone(
                        CommandManager.execute(Commands.FILE_CLOSE, { _forceClose: true })
                    );
                });
            });

            it("should fix autofixable recommended errors", function () {
                runs(function () {
                    waitsForDone(
                        SpecRunnerUtils.openProjectFiles(["fix-before.js"]),
                        "open test file"
                    );
                });

                runs(function () {
                    myEditor = EditorManager.getCurrentFullEditor();
                    myDocument = myEditor.document;
                });

                runs(function () {
                    waitsForDone(CommandManager.execute(AUTOFIX_COMMAND_ID));
                });

                runs(function () {
                    expect(myDocument.getText()).toEqual("var x = 5;\n");
                    myEditor = null;
                    myDocument = null;
                });
            });
        });
    });
});
