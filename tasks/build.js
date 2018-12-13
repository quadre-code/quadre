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

const childProcess = require("child_process");
const util         = require("util");
const build        = {};
const pexec        = util.promisify(childProcess.exec);

function getGitInfo(cwd) {
    var opts = { cwd: cwd, maxBuffer: 1024 * 1024 },
        json = {};

    // count the number of commits for our version number
    //     <major>.<minor>.<patch>-<number of commits>
    return pexec("git log --format=%h", opts).then(function ({ stdout }) {
        json.commits = stdout.toString().match(/[0-9a-f]\n/g).length;

        // get the hash for the current commit (HEAD)
        return pexec("git rev-parse HEAD", opts);
    }).then(function ({ stdout }) {
        json.sha = /([a-f0-9]+)/.exec(stdout.toString())[1];

        // compare HEAD to the HEADs on the remote
        return pexec("git ls-remote --heads origin", opts);
    }).then(function ({ stdout }) {
        var log = stdout.toString(),
            re = new RegExp(json.sha + "\\srefs/heads/(\\S+)\\s"),
            match = re.exec(log),
            reflog;

        // if HEAD matches to a remote branch HEAD, grab the branch name
        if (match) {
            json.branch = match[1];
            return json;
        }

        // else, try match HEAD using reflog
        reflog = pexec("git reflog show --no-abbrev-commit --all", opts);

        return reflog.then(function (result) {
            var logReflog = result.stdout,
                reReflog = new RegExp(json.sha + "\\srefs/(remotes/origin|heads)/(\\S+)@"),
                matchReflog = reReflog.exec(logReflog);

            json.branch = (matchReflog && matchReflog[2]) || "(no branch)";

            return json;
        });
    });
}

build.getGitInfo = getGitInfo;

module.exports = build;
