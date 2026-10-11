import test from 'node:test'
import assert from 'node:assert/strict'

import { updateWords } from '../dist/src/shared/updates.js'

test('a failed check never reads as up to date', () => {
	const words = updateWords({ state: 'failed', detail: 'no internet, or GitHub did not answer.', at: 0 }, '1.0.1')
	assert.match(words, /^Could not check/)
	assert.doesNotMatch(words, /newest/)
})

test('a new version names both versions', () => {
	assert.equal(updateWords({ state: 'available', version: '1.0.2', at: 0 }, '1.0.1'), 'Pāua 1.0.2 is out (this is 1.0.1).')
})

test('a download says how far it has got, rounded', () => {
	assert.equal(updateWords({ state: 'downloading', version: '1.0.2', percent: 41.6 }, '1.0.1'), 'Downloading Pāua 1.0.2: 42%')
})

test('never checked is said, not taken as current', () => {
	assert.match(updateWords({ state: 'idle' }, '1.0.1'), /Not checked yet/)
})
