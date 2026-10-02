import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_LAYOUT, layoutFrom, offered, pick, slotOf } from '../dist/src/shared/layout.js'

test('the default is the screen before slots: run order beside the MA', () => {
	assert.deepEqual(DEFAULT_LAYOUT, { left: 'cue', right: 'ma' })
})

test('picking a view the other slot holds swaps them', () => {
	assert.deepEqual(pick(DEFAULT_LAYOUT, 'right', 'arena'), { left: 'cue', right: 'arena' })
	assert.deepEqual(pick(DEFAULT_LAYOUT, 'left', 'ma'), { left: 'ma', right: 'cue' })
	assert.deepEqual(pick(DEFAULT_LAYOUT, 'right', 'cue'), { left: 'ma', right: 'cue' })
	assert.equal(pick(DEFAULT_LAYOUT, 'left', 'cue'), DEFAULT_LAYOUT)
})

test('the picker offers what answers, and never drops what is on screen', () => {
	const none = { cue: false, ma: false, arena: false }
	// A console gone quiet stays offered while a slot holds the MA.
	assert.deepEqual(offered(DEFAULT_LAYOUT, none), ['cue', 'ma'])
	assert.deepEqual(offered(DEFAULT_LAYOUT, { ...none, cue: true, arena: true }), ['cue', 'ma', 'arena'])
	// Arena not answering is not offered for a slot that does not hold it.
	assert.deepEqual(offered({ left: 'cue', right: 'arena' }, { cue: true, ma: false, arena: false }), ['cue', 'arena'])
})

test('which slot holds a view', () => {
	assert.equal(slotOf(DEFAULT_LAYOUT, 'cue'), 'left')
	assert.equal(slotOf(DEFAULT_LAYOUT, 'ma'), 'right')
	assert.equal(slotOf(DEFAULT_LAYOUT, 'arena'), null)
})

test('a stored layout is two different known views, or the default', () => {
	assert.deepEqual(layoutFrom('{"left":"arena","right":"ma"}'), { left: 'arena', right: 'ma' })
	for (const bad of [null, undefined, '', 'not json', '[]', '{"left":"ma","right":"ma"}', '{"left":"brief","right":"ma"}', '{"left":"cue"}']) {
		assert.deepEqual(layoutFrom(bad), DEFAULT_LAYOUT, String(bad))
	}
})
