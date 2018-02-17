define(function (require, exports, module) {
    "use strict";

    var CodeMirror = brackets.getModule("thirdparty/CodeMirror/lib/codemirror");

    CodeMirror.defineOption("showNoBreakSpace", false, function (cm, val, prev) {
        // eslint-disable-next-line eqeqeq
        if (prev == CodeMirror.Init) {
            prev = false;
        }
        if (prev && !val) {
            cm.removeOverlay("nobreakspace");
        } else if (!prev && val) {
            cm.addOverlay({
                token: function (stream) {
                    if (stream.eatWhile(/[^\xA0]/)) {
                        return null;
                    }
                    if (stream.eatWhile(/\xA0/)) {
                        return "nobreakspace";
                    }
                    return null;
                },
                name: "nobreakspace"
            });
        }
    });
});
