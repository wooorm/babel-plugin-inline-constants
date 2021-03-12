module.exports = inlineConstants

var url = require('url')
var path = require('path')
var resolve = require('resolve')
var deasync = require('deasync')

function inlineConstants(_, options, cwd) {
  if (!Array.isArray(options.modules)) {
    throw new TypeError(
      'babel-plugin-inline-constants: expected a `modules` array to be passed'
    )
  }

  options._modules = options.modules.map((d) => {
    return resolve.sync(d, {basedir: cwd})
  })

  return {
    visitor: {
      ImportDeclaration: importDeclaration,
      VariableDeclarator: variableDeclarator,
      MemberExpression: memberExpression,
      Identifier: identifier
    }
  }
}

function variableDeclarator(p, state) {
  var localModules =
    state.inlineConstantsModules ||
    (state.inlineConstantsModules = Object.create(null))
  var absolute

  if (
    p.node.id.type === 'Identifier' &&
    p.node.init &&
    p.node.init.type === 'CallExpression' &&
    p.node.init.callee.name === 'require' &&
    p.node.init.arguments &&
    p.node.init.arguments.length === 1 &&
    p.node.init.arguments[0] &&
    p.node.init.arguments[0].type === 'StringLiteral'
  ) {
    absolute = find(p.node.init.arguments[0].value, state)

    if (absolute && state.opts._modules.includes(absolute)) {
      localModules[p.node.id.name] = require(absolute)
      p.remove()
    }
  }
}

function importDeclaration(p, state) {
  var localModules =
    state.inlineConstantsModules ||
    (state.inlineConstantsModules = Object.create(null))
  var absolute = find(p.node.source.value, state)
  var module
  var specifiers
  var specifier
  var index

  if (absolute && state.opts._modules.includes(absolute)) {
    // It’s not pretty, but hey, it seems to work.
    try {
      module = require(absolute)
    } catch (_) {
      module = deasync((fp, cb) => import(fp).then((m) => cb(null, m), cb))(
        url.pathToFileURL(absolute)
      )
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
        localModules[specifier.local.name] = module.default
      } else if (
        specifier.type === 'ImportSpecifier' &&
        specifier.imported &&
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

function memberExpression(p, state) {
  var object = p.node.object.name
  var prop = p.node.property.name

  if (state.inlineConstantsModules && object in state.inlineConstantsModules) {
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

function identifier(p, state) {
  if (
    state.inlineConstantsModules &&
    p.node.name in state.inlineConstantsModules
  ) {
    p.replaceWith(toLiteral(state.inlineConstantsModules[p.node.name]))
  }
}

function find(value, state) {
  var absolute

  if (!state.filename) {
    throw new TypeError(
      'babel-plugin-inline-constants: expected a `filename` to be set for files'
    )
  }

  try {
    absolute = resolve.sync(value, {basedir: path.dirname(state.filename)})
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && state.opts.ignoreModuleNotFound) {
      return
    }

    throw error
  }

  return absolute
}

function toLiteral(value) {
  var type =
    typeof value === 'string'
      ? 'String'
      : typeof value === 'number'
      ? 'Numeric'
      : typeof value === 'boolean'
      ? 'Boolean'
      : value === null
      ? 'Null'
      : undefined

  if (!type) {
    throw new Error(
      'babel-plugin-inline-constants: cannot handle non-literal `' + value + '`'
    )
  }

  return {type: type + 'Literal', value: value}
}
