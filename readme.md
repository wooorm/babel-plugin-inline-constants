# babel-plugin-inline-constants

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]

Babel plugin to inline constants in code.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`inlineConstants`](#inlineconstants)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a [Babel][] plugin to inline constants in code.

## When should I use this?

This package is useful because gzip likes repeated patterns (such as using
magic numbers or strings multiple times), whereas looking things up in objects
is easier to develop with.
“Constants” here are specific files that are imported or required which contain
primitives (numbers, strings, booleans, null).

An example is `micromark`, which is a complex state machine that uses a lot of
constants.
Developing with those constants exported from a file, rather than inline, is
easier.
Shipping those inlines helps with bundle size.

## Install

This package is [ESM only][esm].
In Node.js (version 12.20+, 14.14+, 16.0+, 18.0+), install with [npm][]:

```sh
npm install babel-plugin-inline-constants
```

In Deno with [`esm.sh`][esmsh]:

```js
import inlineConstants from 'https://esm.sh/babel-plugin-inline-constants@3'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import inlineConstants from 'https://esm.sh/babel-plugin-inline-constants@3?bundle'
</script>
```

## Use

First, this plugin must be configured with a `modules`, so in a `.babelrc` or
so, do:

```json
{
  "plugins": [["babel-plugin-inline-constants", {"modules": "./math.js"}]]
}
```

…then, our module `math.js`:

```js
export const pi = 3.14
```

…and `example.js`:

```js
import {pi} from './math.js'

console.log('one pi:', pi)
console.log('two pi:', 2 * pi)
console.log('pi pi:', pi * pi)
```

…now running Babel:

```sh
babel example.js
```

Yields:

```js
console.log('one pi:', 3.14);
console.log('two pi:', 2 * 3.14);
console.log('pi pi:', 3.14 * 3.14);
```

## API

This package does not export identifiers.
The default export is `inlineConstants`

### `inlineConstants`

Babel plugin to inline constants in code.
See [Babel’s documentation][babel-plugins] on how to use Babel plugins.

This plugin must be configured with a `modules` array.
Values in this array are the same as the `x` in `import y from x`, and resolve
from the current working directory that babel is running in.
When these modules are then used in code, their values are inlined.
So, if you are going to inline a file from `node_modules` such as
[`charcodes`][charcodes], you can use `modules: ['charcodes']`.
ESM (`import`) and CJS (`require`) are supported.

> ⚠️ **Danger**: modules to be inlined are evaluated with Node, so only use
> this plugin if you completely trust your code.

> 👉 **Note**: PRs welcome to make this rather experimental project better

##### `options`

Configuration (required).

###### `options.modules`

List of modules to inline (`string|Array<string>`).

###### `options.ignoreModuleNotFound`

Ignore the error when modules cannot be found (`boolean`, default: `false`).

## Types

This package is fully typed with [TypeScript][].
It exports the additional type `Options`.

## Compatibility

This package is at least compatible with all maintained versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, 16.0+, and 18.0+.
It also works in Deno and modern browsers.

## Security

This package is safe assuming you trust the code you use.

## Related

*   [`babel-plugin-undebug`](https://github.com/wooorm/babel-plugin-undebug)
    — remove `debug`

## Contribute

Yes please!
See [How to Contribute to Open Source][contribute].

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/wooorm/babel-plugin-inline-constants/workflows/main/badge.svg

[build]: https://github.com/wooorm/babel-plugin-inline-constants/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/wooorm/babel-plugin-inline-constants.svg

[coverage]: https://codecov.io/github/wooorm/babel-plugin-inline-constants

[downloads-badge]: https://img.shields.io/npm/dm/babel-plugin-inline-constants.svg

[downloads]: https://www.npmjs.com/package/babel-plugin-inline-constants

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[license]: license

[author]: https://wooorm.com

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[typescript]: https://www.typescriptlang.org

[contribute]: https://opensource.guide/how-to-contribute/

[babel]: https://babeljs.io

[babel-plugins]: https://babeljs.io/docs/plugins

[charcodes]: https://github.com/xtuc/charcodes
