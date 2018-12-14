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

"use strict";

const common       = require("./lib/common");
const file         = require("./lib/file");
const childProcess = require("child_process");
const path         = require("path");
const fs           = require("fs-extra");
const XmlDocument  = require("xmldoc").XmlDocument;
const gulp         = require("gulp");
const log          = require("fancy-log");
const PluginError  = require("plugin-error");
const { argv }     = require("yargs");

const taskName = "test-integration";

/**
 * Check the unit test results for failures
 */
function checkForTestFailures(pathToResult) {
    var resultXml = file.read(pathToResult),
        xmlDocument = new XmlDocument(resultXml),
        testSuites = xmlDocument.childrenNamed("testsuite"),
        failures = 0;

    testSuites.forEach(function (testSuite) {
        const num = Number(testSuite.attr.failures);
        failures += num;
        if (num > 0) {
            testSuite.children.forEach(function (testCases) {
                testCases.children.forEach(function (testCase) {
                    log.error(testSuite.attr.name, testCase.val);
                });
            });
        }
    });

    return failures;
}

function testIntegration(cb) {
    var opts            = { cwd: process.cwd() },
        spec            = argv["spec"] || "all",
        suite           = argv["suite"] || "all",
        resultsDir      = process.env.TEST_JUNIT_XML_ROOT || path.join(process.cwd(), "dist", "test", "results"),
        results         = resultsDir + "/" + (argv["results"] || "TEST-results") + ".xml",
        resultsPath     = common.resolve(results).replace(/\\/g, "/"),
        specRunnerPath  = common.resolve("dist/test/SpecRunner.html"),
        isCI            = /true/i.test(process.env.CI),
        args            = " --startup-path=\"" + specRunnerPath + "?suite=" + encodeURIComponent(suite) + "&spec=" + encodeURIComponent(spec) + "&resultsPath=" + encodeURIComponent(resultsPath) + "&isCI=" + isCI + "\"",
        cmd = path.join("node_modules", ".bin", "electron") + " . " + args;

    log.info(cmd);

    fs.ensureDir(resultsDir)
        .then(() => {
            var cp = childProcess.exec(cmd, opts, function (err, stdout, stderr) {
                if (err) {
                    log.error(err);
                    const errPlugin = new PluginError(taskName, err, { showStack: true });
                    return cb(errPlugin);
                }

                log.info(`stdout: ${stdout}`);
                log.info(`stderr: ${stderr}`);
            });
            cp.on("error", function (error) {
                log.error(error);
                const errPlugin = new PluginError(taskName, error, { showStack: true });
                cb(errPlugin);
            });
            cp.on("exit", function (code, signal) {
                if (code !== 0) {
                    const errPlugin = new PluginError(taskName, "Process exited with code " + code);
                    return cb(errPlugin);
                }

                var failures = checkForTestFailures(resultsPath);
                if (failures) {
                    const errPlugin = new PluginError(taskName, failures + " test failure(s). Results are available from " + resultsPath);
                    cb(errPlugin);
                } else {
                    cb();
                }
            });
        })
        .catch((err) => {
            log.error(err);
            const errPlugin = new PluginError(taskName, err, { showStack: true });
            cb(errPlugin);
        });
}
testIntegration.description = "Run the tests";

gulp.task(taskName, testIntegration);
