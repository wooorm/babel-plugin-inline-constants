'use strict'

var fs = require('fs')
var path = require('path')
var test = require('tape')
var babel = require('@babel/core')
var plugin = require('..')

test('babel-plugin-inline-constants (core)', function (t) {
  t.throws(
    function () {
      babel.transformSync('', {
        configFile: false,
        filename: 'index.js',
        plugins: [plugin]
      })
    },
    /expected a `modules` array to be passed/,
    'should fail when not passing `options.modules`'
  )

  t.throws(
    function () {
      babel.transformSync('var d = require(".")', {
        configFile: false,
        plugins: [[plugin, {modules: ['.']}]]
      })
    },
    /expected a `filename` to be set for files/,
    'should fail when not passing `filename` to babel'
  )

  t.end()
})

test('babel-plugin-inline-constants (fixtures)', function (t) {
  var base = path.join(__dirname, 'fixtures')

  fs.readdirSync(base)
    .filter((d) => d.charAt(0) !== '.')
    .forEach(function (name) {
      var dir = path.join(base, name)
      var files = fs.readdirSync(dir)
      var main = files.find(
        (d) => path.basename(d, path.extname(d)) === 'index'
      )
      var input = String(fs.readFileSync(path.join(dir, main))).replace(
        /\r?\n$/,
        ''
      )
      var options = {}
      var actual = ''
      var expected = ''

      try {
        options = JSON.parse(fs.readFileSync(path.join(dir, 'opts.json')))
      } catch {}

      try {
        actual = babel.transformSync(input, {
          configFile: false,
          cwd: dir,
          filename: main,
          plugins: [[plugin, options]]
        }).code
      } catch (error) {
        if (options.throws) {
          t.throws(
            function () {
              throw error
            },
            new RegExp(options.throws),
            name
          )

          return
        }

        throw error
      }

      try {
        expected = String(
          fs.readFileSync(path.join(dir, 'expected-' + main))
        ).replace(/\r?\n$/, '')
      } catch {
        expected = actual
        fs.writeFileSync(path.join(dir, 'expected-' + main), actual)
      }

      t.equal(actual, expected, name)
    })

  t.end()
})
