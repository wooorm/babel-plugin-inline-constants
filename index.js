/**
 * @typedef Options
 *   Configuration (required).
 * @property {string|Array<string>} modules
 *   List of modules to inline
 * @property {boolean} [ignoreModuleNotFound=false]
 *   Ignore the error when modules cannot be found
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

import url from 'node:url'
import path from 'node:path'
import resolve from 'resolve'
import builtins from 'builtins'
import {moduleResolve} from 'import-meta-resolve'

const listOfBuiltins = builtins()
const conditions = new Set(['node', 'import'])
const own = {}.hasOwnProperty

/**
 * @param {import('@babel/core')} babel
 * @param {Options} options
 * @param {string} cwd
 */
export default async function inlineConstants(babel, options, cwd) {
  const t = babel.types

  if (!Array.isArray(options.modules)) {
    throw new TypeError(
      'babel-plugin-inline-constants: expected a `modules` array to be passed'
    )
  }

  const ignoreModuleNotFound = options.ignoreModuleNotFound
  const base = url.pathToFileURL(cwd + path.sep)
  const ids = options.modules.map(
    (d) => moduleResolve(d, base, conditions).href
  )
  /** @type {Array<Record<string, unknown>>} */
  const values = await Promise.all(ids.map((fp) => import(fp)))
  /** @type {Record<string, Record<string, unknown>>} */
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
    /** @type {string?} */
    let absolute

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
      absolute = find(p.node.init.arguments[0].value, state, true)

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
    /** @type {string} */
    let absolute
    // Assume the exported thing is an object.
    /** @type {Record<string, unknown>} */
    let module
    /** @type {Array<ImportSpecifier|ImportDefaultSpecifier|ImportNamespaceSpecifier>} */
    let specifiers
    /** @type {ImportSpecifier|ImportDefaultSpecifier|ImportNamespaceSpecifier} */
    let specifier
    /** @type {number} */
    let index

    if (p.node.type === 'ImportDeclaration') {
      absolute = find(p.node.source.value, state)

      if (absolute && own.call(modules, absolute)) {
        module = modules[absolute]
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
      const prop = p.node.property.name

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
  /* c8 ignore next 6 */

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
  /* c8 ignore next 8 */

  /**
   * @param {string} value
   * @param {PluginPass} state
   * @param {boolean} [cjs=false]
   * @returns {string} Absolute path
   */
  function find(value, state, cjs) {
    /** @type {string} */
    let absolute

    if (!state.filename) {
      throw new TypeError(
        'babel-plugin-inline-constants: expected a `filename` to be set for files'
      )
    }

    if (listOfBuiltins.includes(value)) {
      return 'node:' + value
    }

    try {
      absolute = cjs
        ? url.pathToFileURL(
            resolve.sync(value, {basedir: path.dirname(state.filename)})
          ).href
        : moduleResolve(value, url.pathToFileURL(state.filename), conditions)
            .href
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND' && ignoreModuleNotFound) {
        return
      }

      throw error
    }

    return absolute
  }
}
