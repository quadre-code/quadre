# Quadre ESLint

[![Build Status](https://github.com/quadre-code/quadre-eslint/actions/workflows/ci.yml/badge.svg)](https://github.com/quadre-code/quadre-eslint/actions)

Quadre extension which provides file linting with ESLint.

Uses CLIEngine from [https://www.npmjs.com/package/eslint](https://www.npmjs.com/package/eslint)
which should provide same results as linting in the command line (respecting all .eslintrc files)

Includes support for [custom parsers and plugins](#custom-parsers-and-plugins).

## How to configure

Use standard `.eslintrc` file like [this one](https://github.com/adobe/brackets/blob/master/.eslintrc.js)

[Configuring ESLint](http://eslint.org/docs/user-guide/configuring)

[More information here](https://github.com/brackets-userland/brackets-eslint/issues/46)

## How to use custom rules

Move them to `.eslintrules` folder in your project root like you can see in this repo.

## Custom parsers and plugins

Extension uses eslint plugins installed in the current project. If you're missing a plugin, then in your project directory do:

```
npm install eslint-plugin-react
```

## Configuration defaults

To disable the both warning and error icons in the gutter you can configure the `brackets.json` as followed:

```JSON
{
  "quadre-eslint.gutterMarks": false
}
```

or only disable warnings icons:

```JSON
{
  "quadre-eslint.gutterMarks": { "error": true, "warning" : false }
}
```

To force the extension to use its own version of ESLint:

```JSON
{
  "quadre-eslint.useEmbeddedESLint": true
}
```

## Publishing new version of the extension

clone:
```
https://github.com/quadre-code/quadre-eslint
cd quadre-eslint
```

get latest version from origin (discarding local changes):
```
git fetch origin
git reset --hard origin/master
git status (should say 'nothing to commit, working tree clean')
```

make sure the extension is built locally:
```
npm install
```

raise the version & publish:
```
npm version [major | minor | patch]
git push
git push --tags
npm publish
```
