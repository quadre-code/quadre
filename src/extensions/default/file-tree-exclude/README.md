# Brackets File Tree Exclude

Brackets extension for excluding folders and files from the file tree, find in files, and quick open.

This means that the files will be completely invisible to Brackets what will greatly improve overall performance of the editor.

This is great for cache folders, distribution/build folders and files, and package manager folders like `node_modules` and `bower_components`.

## Based on works of:

[JonathanWolfe/file-tree-exclude](https://github.com/JonathanWolfe/file-tree-exclude)
[gruehle/exclude-folders](https://github.com/gruehle/exclude-folders)

## How to install

Use [brackets-npm-registry](https://github.com/zaggino/brackets-npm-registry)

## Configure

Exclusions are defined globally by default inside the Brackets preferences file (_Debug > Open preferences file_).

Append or edit your configuration options there. (See below for example of defaults)

**Or on a per project basis:**

Create a `.brackets.json` in project root (it may already exist) and add your settings there.

## Note

**Project config completely redefine exclusion rules from global config.**

## Configuration defaults

```JSON
{
    "brackets-file-tree-exclude.excludeList": [
        "/.git/",
        "/dist/",
        "/bower_components/",
        "/node_modules/"
    ]
}
```

## How it Matches

Strings are escaped to regexp's and matched against relative path of the file in the tree.
To exclude a directory called `node_modules` use `/node_modules/`.
Using `/dist` will exclude all directories and files starting with `dist`.
Using `.min.js/` will exclude all files (and directories) ending with `.min.js`.
