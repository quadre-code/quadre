# Quadre

Windows, Mac, Linux: [![Build Status](https://github.com/quadre-code/quadre/actions/workflows/ci.yml/badge.svg)](https://github.com/quadre-code/quadre/actions)

## How does Brackets-Electron differ to regular Brackets?

Brackets-Electron `x.y.z` will follow `x.y` of Brackets releases, with `z` being reserved for patches and merges of latest features which are available in brackets master repository and planned to be released in the next version. This way you can preview the upcoming features without running brackets from source.

- CEF shell is gone, improves experience mainly to Linux users
- shell websocket server is gone, improves performance and stability for node domain code
- node domains run in their own processes, improves perfomance as they don't block each other

[Brackets](https://github.com/adobe/brackets)
[Brackets-Electron](https://github.com/brackets-userland/brackets-electron)

## How does Quadre differ?

Quadre will probably make many breaking changes along the road.

## How to hack

run `npm run dev` in one terminal, `npm start` in the other, be sure to do the usual updates (git pull, git submodule update, npm install, etc) before.

## How to build from master

```
git clone https://github.com/quadre-code/quadre
cd quadre
git submodule update --init
npm install
npm run dist
```

You'll find runnable Quadre in `dist-build` directory.


---

Please note that this project is released with a [Contributor Code of Conduct](https://github.com/adobe/brackets/blob/master/.github/CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.
