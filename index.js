/**
 * @import {PluginObj, PluginPass, NodePath, default as Babel} from '@babel/core'
 * @import {BooleanLiteral, NullLiteral, NumericLiteral, StringLiteral} from '@babel/types'
 */

/**
 * @typedef Options
 *   Configuration (required).
 * @property {Array<string> | string} modules
 *   List of modules to inline
 * @property {boolean} [ignoreModuleNotFound=false]
 *   Ignore the error when modules cannot be found
 */

import {pathToFileURL} from 'node:url'
import path from 'node:path'
import {builtinModules} from 'node:module'
import resolve from 'resolve'
import {moduleResolve} from 'import-meta-resolve'

const conditions = new Set(['node', 'import'])
const own = {}.hasOwnProperty

/**
 * @param {Babel} babel
 * @param {Options} options
 * @param {string} cwd
 * @returns {Promise<PluginObj>}
 */
export default async function inlineConstants(babel, options, cwd) {
  const t = babel.types

  if (!Array.isArray(options.modules)) {
    throw new TypeError(
      'babel-plugin-inline-constants: expected a `modules` array to be passed'
    )
  }

  const ignoreModuleNotFound = options.ignoreModuleNotFound
  const base = pathToFileURL(cwd + path.sep)
  const ids = options.modules.map(
    (d) => moduleResolve(d, base, conditions).href
  )
  /** @type {Array<Record<string, unknown>>} */
  const values = await Promise.all(ids.map((fp) => import(fp)))
  /** @type {Record<string, Record<string, unknown>>} */
  // @ts-expect-error: prevent prototype injection.
  const modules = {__proto__: null}
  let index = -1

  while (++index < ids.length) {
    modules[ids[index]] = values[index]
  }

  // prettier-ignore
  /**
   * @type {{
   *   (value: string): StringLiteral
   *   (value: number): NumericLiteral
   *   (value: boolean): BooleanLiteral
   *   (value: null): NullLiteral
   * }}
   */
  // @ts-expect-error: fine!
  const toLiteral = (
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
  /* c8 ignore next 6 */

  /**
   * @param {NodePath} p
   * @param {PluginPass} state
   */
  function variableDeclarator(p, state) {
    /** @type {Record<string, unknown>} */
    const localModules =
      state.inlineConstantsModules ||
      (state.inlineConstantsModules = Object.create(null))

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
      const absolute = find(p.node.init.arguments[0].value, state, true)

      if (absolute && own.call(modules, absolute)) {
        localModules[p.node.id.name] = modules[absolute].default
        p.remove()
      }
    }
  }
  /* c8 ignore next 6 */

  /**
   * @param {NodePath} p
   * @param {PluginPass} state
   */
  function importDeclaration(p, state) {
    /** @type {Record<string, unknown>} */
    const localModules =
      state.inlineConstantsModules ||
      (state.inlineConstantsModules = Object.create(null))

    if (p.node.type === 'ImportDeclaration') {
      const absolute = find(p.node.source.value, state)

      if (absolute && own.call(modules, absolute)) {
        // Assume the exported thing is an object.
        const module = modules[absolute]
        const specifiers = p.node.specifiers
        let index = -1

        while (++index < specifiers.length) {
          const specifier = specifiers[index]

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
  /* c8 ignore next 6 */

  /**
   * @param {NodePath} p
   * @param {PluginPass} state
   */
  function memberExpression(p, state) {
    if (
      p.node.type === 'MemberExpression' &&
      p.node.object.type === 'Identifier' &&
      p.node.property.type === 'Identifier'
    ) {
      const object = p.node.object.name
      const property = p.node.property.name

      const constants = /** @type {Record<string, Record<String, string>>} */ (
        state.inlineConstantsModules
      )

      if (constants && typeof constants === 'object' && object in constants) {
        if (!(property in constants[object])) {
          throw new Error(
            'babel-plugin-inline-constants: cannot access `' +
              object +
              '.' +
              property +
              '`, it’s not defined'
          )
        }

        p.replaceWith(toLiteral(constants[object][property]))
      }
    }
  }
  /* c8 ignore next 6 */

  /**
   * @param {NodePath} p
   * @param {PluginPass} state
   */
  function identifier(p, state) {
    const constants = /** @type {Record<string, string>} */ (
      state.inlineConstantsModules
    )

    if (
      p.node.type === 'Identifier' &&
      constants &&
      typeof constants === 'object' &&
      p.node.name in constants
    ) {
      p.replaceWith(toLiteral(constants[p.node.name]))
    }
  }
  /* c8 ignore next 8 */

  /**
   * @param {string} value
   * @param {PluginPass} state
   * @param {boolean} [cjs=false]
   * @returns {string|undefined}
   *   Absolute path
   */
  function find(value, state, cjs) {
    if (!state.filename) {
      throw new TypeError(
        'babel-plugin-inline-constants: expected a `filename` to be set for files'
      )
    }

    if (builtinModules.includes(value)) {
      return 'node:' + value
    }

    /** @type {string} */
    let absolute

    try {
      absolute = cjs
        ? pathToFileURL(
            resolve.sync(value, {basedir: path.dirname(state.filename)})
          ).href
        : moduleResolve(value, pathToFileURL(state.filename), conditions).href
    } catch (error) {
      const exception = /** @type {NodeJS.ErrnoException} */ (error)
      if (exception.code === 'MODULE_NOT_FOUND' && ignoreModuleNotFound) {
        return
      }

      throw exception
    }

    return absolute
  }
}
