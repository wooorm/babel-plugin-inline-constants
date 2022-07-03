import assert from 'node:assert'
import {numberSign} from 'charcodes'

assert.equal(numberSign, '#'.codePointAt(0))
