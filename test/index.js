import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
import babel from '@babel/core'
import plugin from '../index.js'

test('babel-plugin-inline-constants (core)', async function () {
  try {
    await babel.transformAsync('', {
      configFile: false,
      filename: 'index.js',
      plugins: [plugin]
    })
    assert.fail()
  } catch (error) {
    assert.match(
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
    assert.fail()
  } catch (error) {
    assert.match(
      String(error),
      /expected a `filename` to be set for files/,
      'should fail when not passing `filename` to babel'
    )
  }
})

test('babel-plugin-inline-constants (fixtures)', async function () {
  const base = new URL('fixtures/', import.meta.url)
  const files = await fs.readdir(base)
  const names = files.filter((d) => d.charAt(0) !== '.')
  let index = -1

  while (++index < names.length) {
    const name = names[index]
    const dir = new URL(name + '/', base)
    const files = await fs.readdir(dir)
    const main = files.find(
      (d) => path.basename(d, path.extname(d)) === 'index'
    )
    assert(main, 'expected `main`')
    const input = String(await fs.readFile(new URL(main, dir))).replace(
      /\r?\n$/,
      ''
    )
    /** @type {Record<string, unknown> & {throws?: string}} */
    let options = {}
    let actual = ''
    let expected = ''

    try {
      options = JSON.parse(String(await fs.readFile(new URL('opts.json', dir))))
    } catch {}

    try {
      const result = await babel.transformAsync(input, {
        configFile: false,
        cwd: fileURLToPath(dir),
        filename: main,
        plugins: [[plugin, options]]
      })
      assert(result, 'babel always sets `result`')
      assert(result.code, 'babel always sets `result.code`')
      actual = result.code
    } catch (error) {
      if (options.throws) {
        assert.throws(
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
      expected = String(await fs.readFile(new URL('expected-' + main, dir)))
        .replace(/\r\n/g, '\n')
        .replace(/\n$/, '')
    } catch {
      expected = actual
      await fs.writeFile(new URL('expected-' + main, dir), actual)
    }

    assert.equal(actual, expected, name)
  }
})
