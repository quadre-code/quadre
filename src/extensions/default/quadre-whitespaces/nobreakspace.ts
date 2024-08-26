const CodeMirror = brackets.getModule("thirdparty/CodeMirror/lib/codemirror");

CodeMirror.defineOption("showNoBreakSpace", false, function (cm, val, prev) {
    // eslint-disable-next-line eqeqeq
    if (prev == (CodeMirror as any).Init) {
        prev = false;
    }
    if (prev && !val) {
        cm.removeOverlay("nobreakspace");
    } else if (!prev && val) {
        cm.addOverlay({
            token(stream) {
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

// See https://github.com/Microsoft/TypeScript/issues/20943
export {};
