const { test } = require('uvu')
const assert = require('uvu/assert')
const {
	GameObject,
	ContextModule, SubTextModule,
	Stateful, Stringful, Perceptible, Tangible, Countable, Containing, Actionable, Agentive
} = require('../raspg3.js')

//? Helper for setup
function createTestObject(id) {
	return new GameObject(id, {
		components: [Stateful, Stringful, Perceptible, Tangible, Countable, Containing, Actionable, Agentive]
	})
}

//# MARK: Module tests
test('ContextModule push, get, and pop', () => {
	ContextModule.push({ agent: 'alice', target: 'book' })
	assert.is(ContextModule.get('agent'), 'alice')
	assert.is(ContextModule.get('target'), 'book')

	ContextModule.push({ agent: 'bob' })
	assert.is(ContextModule.get('agent'), 'bob')

	ContextModule.pop(['agent'])
	assert.is(ContextModule.get('agent'), 'alice')

	ContextModule.pop(['agent', 'target'])
	assert.is(ContextModule.get('agent'), undefined)
	assert.is(ContextModule.get('target'), undefined)
})
test('ContextModule gatherers and gatherFrom', () => {
	ContextModule.registerGatherer('dummy', {
		appliesTo: obj => obj && obj.kind === 'dummy',
		callback: obj => ({ agent: obj.name })
	})
	const labels = ContextModule.gatherFrom({ kind: 'dummy', name: 'gizmo' })
	assert.ok(labels.includes('agent'))
	assert.is(ContextModule.get('agent'), 'gizmo')
	ContextModule.pop(labels)
})
test('SubTextModule substitution and conditional parsing', () => {
	SubTextModule.registerSubstitution('greeting', () => 'Hello')
	let result = SubTextModule.parse('Say: %greeting%!')
	assert.is(result, 'Say: Hello!')

	SubTextModule.registerConditional('alwaysTrue', () => true)
	result = SubTextModule.parse('{alwaysTrue?Yes|No}')
	assert.is(result, 'Yes')

	SubTextModule.registerConditional('alwaysFalse', () => false)
	result = SubTextModule.parse('{alwaysFalse?Yes|No}')
	assert.is(result, 'No')
})
test('SubTextModule fallback to context object strings', () => {
	const obj = new GameObject('targetTest', { components: [Stringful] })
	obj._strings.set('name', 'Mystery Box')
	ContextModule.push({ target: obj })

	const result = SubTextModule.parse('Look at the %target.name%.')
	assert.is(result, 'Look at the Mystery Box.')

	ContextModule.pop(['target'])
})

//# MARK: Component tests
test('Stateful defines and mutates state', () => {
	const obj = createTestObject('test_Stateful')
	obj._states.define({ health: 100, awake: true })
	assert.is(obj._states.get('health'), 100)

	obj._states.set('health', 85)
	assert.is(obj._states.get('health'), 85)

	obj._states.create('mana', 50)
	assert.is(obj._states.get('mana'), 50)
})
test('Stringful stores and retrieves strings', () => {
	const obj = createTestObject('test_Stringful')
	obj._strings.define({
		'en.name': 'orb',
		'en.description': 'A glowing orb.'
	})

	assert.is(obj._strings.get('en.name'), 'orb')
	assert.is(obj._strings.get('en.description'), 'A glowing orb.')
})
test('Perceptible defines and sets perceptions', () => {
	const obj = createTestObject('test_Perceptible')
	obj._perceptions.describe({
		name: 'orb',
		description: 'A softly glowing orb.',
		withArticle: 'an orb',
		plural: 'orbs'
	})

	obj._perceptions.setPerception('sight', 'direct', 'It glows faintly.')

	assert.is(obj._perceptions.perceive('sight', 'direct', obj), 'It glows faintly.')
	assert.is(obj._perceptions.perceive('sight', 'inRoom', obj), null)

	obj._perceptions.definePerceptions({
		sight: {
			inRoom: 'A glowing orb rests.'
		}
	})

	assert.is(obj._perceptions.perceive('sight', 'inRoom', obj), 'A glowing orb rests.')
})
test('Tangible sets and removes location', () => {
	const room = new GameObject('room', { components: [Containing] })
	const obj = createTestObject('test_Tangible')

	obj._location.moveTo(room)
	assert.is(obj._location.location, room)

	obj._location.removeFromWorld()
	assert.is(obj._location.location, undefined)
})
test('Countable sets, adds, and subtracts to count', () => {
	const obj = createTestObject('test_Countable')
	obj._count.set(5)
	assert.is(obj._count.count, 5)
	obj._count.add(5)
	assert.is(obj._count.count, 10)
	obj._count.subtract(2)
	assert.is(obj._count.count, 8)
})
test('Containing adds, removes, and filters', () => {
	const container = createTestObject('test_Containing')
	const item = new GameObject('rock', { components: [Tangible] })

	container._container.add(item)
	assert.ok(container._container.has(item))

	container._container.remove(item)
	assert.not.ok(container._container.has(item))

	container._container.setFilter(obj => obj.id !== 'forbidden')
	assert.ok(typeof container._container.filter === 'function')
})
test('Actionable enables and disables actions', () => {
	const obj = createTestObject('test_Actionable')
	Actionable.registerAction('item.pickup', { callback: () => true })

	obj._actions.agentsCan('item.pickup')
	assert.ok(obj._actions.actions.has('item.pickup'))

	obj._actions.agentsCannot('item.pickup')
	assert.not.ok(obj._actions.actions.has('item.pickup'))
})
test('Agentive enables and disables acts', () => {
	const obj = createTestObject('test_Agentive')
	Agentive.registerAct('move.north', { callback: () => true })

	obj._acts.can('move.north')
	assert.ok(obj._acts.acts.has('move.north'))

	obj._acts.cannot('move.north')
	assert.not.ok(obj._acts.acts.has('move.north'))
})

test.run()