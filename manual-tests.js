// Create an object with all components
const testObject = new GameObject('testObject', {
	components: [ Stateful, Stringful, Perceptible, Tangible, Countable, Containing, Actionable, Agentive ]
})

// Stateful
testObject._states.define({ health: 100, awake: true })
testObject._states.set('health', 85)
testObject._states.create('mana', 50)

// Stringful
testObject._strings.define({
	'en.name': 'test object',
	'en.description': 'A fully loaded test object for RasPG.',
})

// Perceptible (requires Stringful already present)
testObject._perceptions.describe({
	name: 'orb',
	description: 'A softly glowing orb that hums with energy.',
	withArticle: 'an orb',
	plural: 'orbs'
})
testObject._perceptions.setPerception('sight', 'direct', 'It glows faintly.')
testObject._perceptions.definePerceptions({
	sight: {
		inRoom: 'A glowing orb rests on the pedestal.'
	},
	hearing: {
		inRoom: () => 'You hear a soft hum.'
	}
})

// Tangible & Containing (requires some other object to act as location/container)
const room = new GameObject('room', { components: [Containing] })
testObject._location.moveTo(room)
testObject._location.removeFromWorld()

// Countable (depends on Tangible)
testObject._count.add(5)
// hypothetically we’d use: testObject._count.set(3); testObject._count.subtract(2);
// but the methods are stubs right now

// Containing
const containedObj = new GameObject('rock', { components: [Tangible] })
testObject._container.add(containedObj)
testObject._container.remove(containedObj)
testObject._container.setFilter(obj => obj.id !== 'forbidden')

// Actionable
Actionable.registerAction('item.pickup', {
	callback: () => console.log('Item picked up!')
})
testObject._actions.agentsCan('item.pickup')
testObject._actions.agentsCannot('item.pickup')

// Agentive
Agentive.registerAct('move.north', {
	callback: () => console.log('Moving north...')
})
testObject._acts.can('move.north')
testObject._acts.cannot('move.north')
