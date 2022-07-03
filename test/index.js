import fs from 'node:fs'
import path from 'node:path'
import test from 'tape'
import babel from '@babel/core'
import plugin from '../index.js'

test('babel-plugin-inline-constants (core)', async function (t) {
  try {
    await babel.transformAsync('', {
      configFile: false,
      filename: 'index.js',
      plugins: [plugin]
    })
    t.fail()
  } catch (error) {
    t.match(
      String(error),
      /expected a `modules` array to be passed/,
      'should fail when not passing `options.modules`'
    )
  }

  try {
    await babel.transformAsync('var d = require(".")', {
      configFile: false,
      plugins: [[plugin, {modules: ['./index.js']}]]
    })
    t.fail()
  } catch (error) {
    t.match(
      String(error),
      /expected a `filename` to be set for files/,
      'should fail when not passing `filename` to babel'
    )
  }

  t.end()
})

test('babel-plugin-inline-constants (fixtures)', async function (t) {
  var base = path.join('test', 'fixtures')
  var names = fs.readdirSync(base).filter((d) => d.charAt(0) !== '.')
  var index = -1
  var name
  var dir
  var files
  var main
  var input
  var options
  var actual
  var expected

  while (++index < names.length) {
    name = names[index]
    dir = path.join(base, name)
    files = fs.readdirSync(dir)
    main = files.find((d) => path.basename(d, path.extname(d)) === 'index')
    input = String(fs.readFileSync(path.join(dir, main))).replace(/\r?\n$/, '')
    options = {}
    actual = ''
    expected = ''

    try {
      options = JSON.parse(fs.readFileSync(path.join(dir, 'opts.json')))
    } catch {}

    try {
      actual = (
        await babel.transformAsync(input, {
          configFile: false,
          cwd: dir,
          filename: main,
          plugins: [[plugin, options]]
        })
      ).code
    } catch (error) {
      if (options.throws) {
        t.throws(
          function () {
            throw error
          },
          new RegExp(options.throws),
          name
        )

        continue
      }

      throw error
    }

    try {
      expected = String(fs.readFileSync(path.join(dir, 'expected-' + main)))
        .replace(/\r\n/g, '\n')
        .replace(/\n$/, '')
    } catch {
      expected = actual
      fs.writeFileSync(path.join(dir, 'expected-' + main), actual)
    }

    t.equal(actual, expected, name)
  }

  t.end()
})
