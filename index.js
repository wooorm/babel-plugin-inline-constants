import url from 'url'
import path from 'path'
import {createRequire} from 'module'
import resolve from 'resolve'
import deasync from 'deasync'

var require = createRequire(import.meta.url)

/**
 * @typedef {Object} Options
 * @property {string|string[]} modules List of modules to inline
 * @property {boolean} [ignoreModuleNotFound=false] Ignore the error when modules cannot be found
 *
 * @typedef {import('@babel/core').PluginPass} PluginPass
 * @typedef {import('@babel/core').NodePath} NodePath
 * @typedef {import('@babel/types').StringLiteral} StringLiteral
 * @typedef {import('@babel/types').NumericLiteral} NumericLiteral
 * @typedef {import('@babel/types').BooleanLiteral} BooleanLiteral
 * @typedef {import('@babel/types').NullLiteral} NullLiteral
 * @typedef {import('@babel/types').ImportSpecifier} ImportSpecifier
 * @typedef {import('@babel/types').ImportDefaultSpecifier} ImportDefaultSpecifier
 * @typedef {import('@babel/types').ImportNamespaceSpecifier} ImportNamespaceSpecifier
 */

/**
 * @param {import('@babel/core')} babel
 * @param {Options} options
 * @param {string} cwd
 */
export default function inlineConstants(babel, options, cwd) {
  var t = babel.types

  if (!Array.isArray(options.modules)) {
    throw new TypeError(
      'babel-plugin-inline-constants: expected a `modules` array to be passed'
    )
  }

  var ignoreModuleNotFound = options.ignoreModuleNotFound
  var modules = new Set(
    options.modules.map((d) => resolve.sync(d, {basedir: cwd}))
  )

  // prettier-ignore
  /** @type {{
   *   (value: string): StringLiteral
   *   (value: number): NumericLiteral
   *   (value: boolean): BooleanLiteral
   *   (value: null): NullLiteral
   * }} */
  var toLiteral = (
      /**
       * @param {string|number|boolean|null} value
       * @returns {StringLiteral|NumericLiteral|BooleanLiteral|NullLiteral}
       */
      function (value) {
        if (typeof value === 'string') {
          return t.stringLiteral(value)
        }

        if (typeof value === 'number') {
          return t.numericLiteral(value)
        }

        if (typeof value === 'boolean') {
          return t.booleanLiteral(value)
        }

        if (value === null) {
          return t.nullLiteral()
        }

        throw new Error(
          'babel-plugin-inline-constants: cannot handle non-literal `' + value + '`'
        )
      }
    )

  return {
    visitor: {
      ImportDeclaration: importDeclaration,
      VariableDeclarator: variableDeclarator,
      MemberExpression: memberExpression,
      Identifier: identifier
    }
  }

  /**
   * @param {NodePath} p
   * @param {PluginPass} state
   */
  function variableDeclarator(p, state) {
    /** @type {Record.<string, Object>} */
    var localModules =
      state.inlineConstantsModules ||
      (state.inlineConstantsModules = Object.create(null))
    /** @type {string?} */
    var absolute

    if (
      p.node.type === 'VariableDeclarator' &&
      p.node.id.type === 'Identifier' &&
      p.node.init &&
      p.node.init.type === 'CallExpression' &&
      p.node.init.callee.type === 'Identifier' &&
      p.node.init.callee.name === 'require' &&
      p.node.init.arguments &&
      p.node.init.arguments.length === 1 &&
      p.node.init.arguments[0] &&
      p.node.init.arguments[0].type === 'StringLiteral'
    ) {
      absolute = find(p.node.init.arguments[0].value, state)

      if (absolute && modules.has(absolute)) {
        localModules[p.node.id.name] = require(absolute)
        p.remove()
      }
    }
  }

  /**
   * @param {NodePath} p
   * @param {PluginPass} state
   */
  function importDeclaration(p, state) {
    /** @type {Record.<string, Object>} */
    var localModules =
      state.inlineConstantsModules ||
      (state.inlineConstantsModules = Object.create(null))
    /** @type {string} */
    var absolute
    // Assume the exported thing is an object.
    /** @type {Record.<string, unknown>} */
    var module
    /** @type {Array<ImportSpecifier|ImportDefaultSpecifier|ImportNamespaceSpecifier>} */
    var specifiers
    /** @type {ImportSpecifier|ImportDefaultSpecifier|ImportNamespaceSpecifier} */
    var specifier
    /** @type {number} */
    var index

    if (p.node.type === 'ImportDeclaration') {
      absolute = find(p.node.source.value, state)

      if (absolute && modules.has(absolute)) {
        // It’s not pretty, but hey, it seems to work.
        try {
          module = require(absolute)
        } catch {
          module = deasync(syncAsyncImport)(url.pathToFileURL(absolute))
        }

        specifiers = p.node.specifiers
        index = -1

        while (++index < specifiers.length) {
          specifier = specifiers[index]

          if (
            specifier.type === 'ImportDefaultSpecifier' &&
            specifier.local &&
            specifier.local.type === 'Identifier'
          ) {
            if (!('default' in module)) {
              throw new Error(
                'babel-plugin-inline-constants: cannot access default export from `' +
                  p.node.source.value +
                  '`'
              )
            }

            localModules[specifier.local.name] = module.default
          } else if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported &&
            specifier.imported.type === 'Identifier' &&
            specifier.local &&
            specifier.local.type === 'Identifier'
          ) {
            if (!(specifier.imported.name in module)) {
              throw new Error(
                'babel-plugin-inline-constants: cannot access `' +
                  specifier.imported.name +
                  '` from `' +
                  p.node.source.value +
                  '`'
              )
            }

            localModules[specifier.local.name] = module[specifier.imported.name]
            /* c8 ignore next 3 */
          } else {
            throw new Error('Cannot handle specifier `' + specifier.type + '`')
          }
        }

        p.remove()
      }
    }
  }

  /**
   * @param {NodePath} p
   * @param {PluginPass} state
   */
  function memberExpression(p, state) {
    /** @type {string} */
    var object
    /** @type {string} */
    var prop

    if (
      p.node.type === 'MemberExpression' &&
      p.node.object.type === 'Identifier' &&
      p.node.property.type === 'Identifier'
    ) {
      object = p.node.object.name
      prop = p.node.property.name

      if (
        state.inlineConstantsModules &&
        typeof state.inlineConstantsModules === 'object' &&
        object in state.inlineConstantsModules
      ) {
        if (!(prop in state.inlineConstantsModules[object])) {
          throw new Error(
            'babel-plugin-inline-constants: cannot access `' +
              object +
              '.' +
              prop +
              '`, it’s not defined'
          )
        }

        p.replaceWith(toLiteral(state.inlineConstantsModules[object][prop]))
      }
    }
  }

  /**
   * @param {NodePath} p
   * @param {PluginPass} state
   */
  function identifier(p, state) {
    if (
      p.node.type === 'Identifier' &&
      state.inlineConstantsModules &&
      typeof state.inlineConstantsModules === 'object' &&
      p.node.name in state.inlineConstantsModules
    ) {
      p.replaceWith(toLiteral(state.inlineConstantsModules[p.node.name]))
    }
  }

  /**
   * @param {string} value
   * @param {PluginPass} state
   * @returns {string} Absolute path
   */
  function find(value, state) {
    /** @type {string} */
    var absolute

    if (!state.filename) {
      throw new TypeError(
        'babel-plugin-inline-constants: expected a `filename` to be set for files'
      )
    }

    try {
      absolute = resolve.sync(value, {basedir: path.dirname(state.filename)})
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND' && ignoreModuleNotFound) {
        return
      }

      throw error
    }

    return absolute
  }
}

/**
 * @param {string} fp
 * @param {(err?: Error, res?: Object) => void} cb
 */
function syncAsyncImport(fp, cb) {
  import(fp).then(then, cb)

  /**
   * @param {Record.<string, unknown>} m
   */
  function then(m) {
    cb(null, m)
  }
}
