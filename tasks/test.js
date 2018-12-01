/*
 * Copyright (c) 2013 - 2017 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
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

/*eslint-env node */
/*jslint node: true */
"use strict";

module.exports = function (grunt) {
    var common          = require("./lib/common")(grunt),
        childProcess    = require("child_process"),
        path            = require("path"),
        fs              = require("fs-extra"),
        XmlDocument     = require("xmldoc").XmlDocument;

    /**
     * Check the unit test results for failures
     */
    function checkForTestFailures(pathToResult) {
        var resultXml = grunt.file.read(pathToResult),
            xmlDocument = new XmlDocument(resultXml),
            testSuites = xmlDocument.childrenNamed("testsuite"),
            failures = 0;

        testSuites.forEach(function (testSuite) {
            const num = Number(testSuite.attr.failures);
            failures += num;
            if (num > 0) {
                testSuite.children.forEach(function (testCases) {
                    testCases.children.forEach(function (testCase) {
                        grunt.log.writeln(testSuite.attr.name, testCase.val);
                    });
                });
            }
        });

        return failures;
    }

    // task: test-integration
    grunt.registerTask("test-integration", "Run tests in brackets-shell. Requires 'grunt full-build' in shell.", function () {
        var done            = this.async(),
            platform        = common.platform(),
            opts            = { cwd: process.cwd() },
            cmd             = common.resolve(grunt.option("shell") || grunt.config("shell." + platform)),
            spec            = grunt.option("spec") || "all",
            suite           = grunt.option("suite") || "all",
            resultsDir      = process.env.TEST_JUNIT_XML_ROOT || path.join(process.cwd(), "dist", "test", "results"),
            results         = resultsDir + "/" + (grunt.option("results") || "TEST-results") + ".xml",
            resultsPath     = common.resolve(results).replace(/\\/g, "/"),
            specRunnerPath  = common.resolve("dist/test/SpecRunner.html"),
            isCI            = /true/i.test(process.env.CI),
            args            = " --startup-path=\"" + specRunnerPath + "?suite=" + encodeURIComponent(suite) + "&spec=" + encodeURIComponent(spec) + "&resultsPath=" + encodeURIComponent(resultsPath) + "&isCI=" + isCI + "\"";

        cmd = path.join("node_modules", ".bin", "electron") + " . " + args;
        grunt.log.writeln(cmd);

        fs.ensureDir(resultsDir)
        .then(() => {
            var cp = childProcess.exec(cmd, opts, function (err, stdout, stderr) {
                if (err) {
                    grunt.log.writeln(err);
                    return done(err);
                }
                grunt.log.writeln(`stdout: ${stdout}`);
                grunt.log.writeln(`stderr: ${stderr}`);
            });
            cp.on("error", function (error) {
                grunt.log.writeln(error);
                done(error);
            });
            cp.on("exit", function (code, signal) {
                if (code !== 0) {
                    var e = new Error("Process exited with code " + code);
                    return done(e);
                }

                var failures = checkForTestFailures(resultsPath);
                if (failures) {
                    var e = new Error(failures + " test failure(s). Results are available from " + resultsPath);
                    done(e);
                } else {
                    done();
                }
            });
        })
        .catch((err) => {
            grunt.log.writeln(err);
            done(err);
        });
    });
};
