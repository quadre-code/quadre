## v2.0.0-alpha.6 (2022-11-13)

Merge all Brackets commits. Some shell api not implemented yet like file encoding\decoding

Update CodeMirror to 5.65.9

Update electron to 17.4.11

More conversion of the code base to TypeScript

Replace PhpTooling default extension with TypeScriptTooling extension

Switch to Github Actions on CI

Update some dependencies across the tree

Use the extension url of Brackets-Cont project


## v2.0.0-alpha.5 (2019-05-04)

Update CodeMirror to 5.46.0

Remove https://github.com/yaddran/brackets-occurrences-marker and instead rely on CodeMirror addon

More conversion of the code base to TypeScript

Convert all build scripts to gulp


## v2.0.0-alpha.4 (2019-02-25)

Update CodeMirror to 5.44.0

Add highlighting for cm-type token

Integrate https://github.com/quadre-code/quadre-git as default extension

Integrate https://github.com/yaddran/brackets-occurrences-marker as default extension

Don't show the Extension Manager by default (for now)

Backport some patches from Brackets (Context sub menu)

Added new line and tab as replacement in case of regex search

Add "Find Whole Word" functionality

Start converting the code base to TypeScript


## v2.0.0-alpha.3 (2019-01-06)

Add a paddingComment option

Add a commentBlankLines option

Start to switch from grunt to gulp

Start consolidating the coding style

Backport some patches from Brackets (Keep the search bar open)


## v2.0.0-alpha.2 (2018-11-25)

Update electron to 1.8.8

Update CodeMirror to 5.42.0

Add Typescript and TSX languages

Integrate https://github.com/ficristo/codemirror-addon-toggle-comment addon

Integrate https://github.com/brackets-userland/brackets-file-tree-exclude as default extension

Reword license to add 'The quadre code authors'

Backport some patches from Brackets


## v2.0.0-alpha.1 (2018-01-12)

Revert node processes: unfortunately they leaked on window close

Reenable LiveDevelopment (for now)

Disable health data (for now)

Show tabs and trailing whitespaces by default

Make .gitmodules visible in the file tree

Update electron to 1.7.10

Update CodeMirror to 5.33.0

Make the test suite run on CI

Backport some patches from Brackets


## Forked from brackets-electron master (2017-10-20)
