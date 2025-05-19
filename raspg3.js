// RasPG I-3
/** @typedef {{event: string, callback: EventCallback, owner: GameObject, once: boolean}} EventListener */
/** @typedef {(owner: GameObject, data: EventData) => void} EventCallback */
/** @typedef {{object: GameObject, property: string, previous: any, current: any}} EventData */
/** @typedef {{tags: Array<string>, components: Array<Component>, watchProperties: boolean}} GameObjectOptions */
/** @typedef {{proto: Function, component: Component, components: Iterable<Component>, operation: string, silent: boolean}} GameObjectResolveOptions */
/** @typedef {{context: PerceptionContext, description: string | PerceptionDescriptionFunction}} Perception */
/** @typedef {string | 'superficial' | 'direct' | 'inContainer' | 'inRoom' | 'adjacentRoom' | 'onObject'} PerceptionContext */
/** @typedef {(sensor: GameObject, target: GameObject) => string} PerceptionDescriptionFunction */
/** @typedef {{predicate: (agent: GameObject) => boolean, callback: (agent: GameObject) => (void | string)}} Action */
/** @typedef {{predicate: (object: GameObject) => boolean, callback: (object: GameObject) => (void | string)}} Act */

//# Prototype mutations
if (!Set.prototype.find) {
	Set.prototype.find = function (predicate, thisArg) {
		for (const item of this) {
			if (predicate.call(thisArg, item, item, this))
				return item
		}
		return undefined
	}
}
if (!Map.prototype.find) {
	Map.prototype.find = function (predicate, thisArg) {
		for (const [key, value] of this) {
			if (predicate.call(thisArg, value, key, this))
				return value
		}
		return undefined
	}
}

//# Constants
const EXCEPTIONS = {
	notGameObject: () =>
		new TypeError('Expected instance of GameObject or subclass'),
	notComponent: () =>
		new TypeError('Expected instance of Component or subclass, or their prototypes'),
	objectIDConflict: (objectID) =>
		new Error('Conflicting GameObject IDs: ', objectID),
	generalIDConflict: (domain, objectID) =>
		new Error(`Conflicting IDs on ${domain}: `, objectID),
	brokenEnforcedType: (param, type) =>
		new Error(`Enforced parameter/property type broken: ${param} : ${type}`),
}
const LOGS = {
	gameObjectNotFound: (objectID) => {
		console.error(`ID "${objectID}" does not presently correspond to a registered GameObject instance.`)
		return false
	},
	incorrectPrototype: (objectID, className, operation) => {
		console.warn(`Object (ID "${objectID}") must inherit ${className} for use in operation ${operation} `)
		return false
	},
	missingRequiredComponentForOperation: (objectID, componentName, operation) => {
		console.warn(`Object (ID "${objectID}") is missing required component (${componentName}) for operation (${operation})`)
		return false
	},
	elementNotRegisteredInCollection: (element, collection) => {
		console.warn(`Element "${element}" is not registered in collection "${collection}"`)
		return false
	},
}

//# Modules
class EventModule {
	static #listeners = new Map()
	static debug = true
	static _proxyHandler = {
		set(object, property, current) {
			const previous = object[property]
			Reflect.set(...arguments)
			this.emitPropertyEvents({ object, property, previous, current })
		}
	}

	/** Registers a listener for a given event type.
	 * @param {string} event
	 * @param {EventCallback} callback
	 * @param {{owner: GameObject, once: boolean}} options
	 */
	static on(event, callback, options) {
		HookModule.run('before:EventModule.on', arguments, this)

		if (!this.#listeners.has(event))
			this.#listeners.set(event, new Set())
		this.#listeners.get(event).add({ event, callback, owner: options.owner || undefined, once: options.once || false })

		HookModule.run('after:EventModule.on', arguments, this)
	}
	/** Removes a specific listener, optionally from a specific owner. Returns the number of listeners removed.
	 * @param {string} event
	 * @param {EventCallback} callback
	 * @param {{owner: GameObject, once: boolean}} options
	 */
	static off(event, callback, options) {
		HookModule.run('before:EventModule.off', arguments, this)

		if (!this.#listeners.has(event))
			return false

		const listeners = this.#listeners.get(event)
		let found = 0
		for (const listener of listeners)
			if (
				listener.callback === callback
				&& (!options.owner || listener.owner === options.owner)
				&& (!options.once || listener.once === options.once)
				) {
					listeners.delete(listener)
					found++
			}

		HookModule.run('after:EventModule.off', arguments, this)
		return found
	}
	/** Emits an event.
	 * @param {string} event
	 * @param {EventData} data
	 */
	static emit(event, data) {
		HookModule.run('before:EventModule.emit', arguments, this)

		if (this.debug)
			console.log(`[Event - ${event} on `, data.object)
		if (!this.#listeners.has(event)) return
		const listeners = this.#listeners.get(event)
		for (const listener of listeners) {
			listener.callback(listener.owner, data)
			if (listener.once)
				listeners.delete(listener)
		}

		HookModule.run('after:EventModule.emit', arguments, this)
	}
	/** Removes all listeners owned by a specific GameObject.
	 * @param {GameObject} owner
	 */
	static removeAllBy(owner) {
		HookModule.run('before:EventModule.removeAllBy', arguments, this)

		for (const listeners of this.#listeners.values())
			for (const listener of listeners)
				if (listener.owner === owner)
					listeners.delete(listener)

		HookModule.run('after:EventModule.removeAllBy', arguments, this)
	}
	/** Emits a set of property value change events.
	 * @param {EventData} data
	 */
	static emitPropertyEvents(data, prefix) {
		HookModule.run('before:EventModule.emitPropertyEvents', arguments, this)

		//* Property set
		EventModule.emit(`${prefix}${data.property}.set`, {
			object: data.object,
			property: data.property,
			previous: data.previous,
			current: data.current })
		//? Property value not changed
		if (data.previous === data.current)
			EventModule.emit(`${prefix}${data.property}.changed.not`, {
				object: data.object,
				property: data.property,
				previous: data.previous,
				current: data.current })
		//? Property value changed
		else
			EventModule.emit(`${prefix}${data.property}.changed`, {
				object: data.object,
				property: data.property,
				previous: data.previous,
				current: data.current })
		// Numeric values
		if (typeof(data.previous) === 'number' && typeof(data.current) === 'number')
			//? Property value increased
			if (data.current > data.previous)
				EventModule.emit(`${prefix}${data.property}.increased`, {
					object: data.object,
					property: data.property,
					previous: data.previous,
					current: data.current })
			//? Property value decreased
			if (data.current < data.previous)
				EventModule.emit(`${prefix}${data.property}.decreased`, {
					object: data.object,
					property: data.property,
					previous: data.previous,
					current: data.current })
		//? Boolean variable
		else if (typeof(data.previous) === 'boolean' && typeof(data.current) === 'boolean')
			//* Variable value not toggled
			if (data.previous === data.current)
				EventModule.emit(`${prefix}${data.property}.toggled.not`, {
					object: data.object,
					property: data.property,
					previous: data.previous,
					current: data.current })
			//* Variable value toggled
			else
				EventModule.emit(`${prefix}${data.property}.toggled`, {
					object: data.object,
					property: data.property,
					previous: data.previous,
					current: data.current })

		HookModule.run('after:EventModule.emitPropertyEvents', arguments, this)
	}
}
//! !!!WARNING!!! - Hooks that depend on being able to mutate a function's passed `arguments` object will not work under 'use strict', or in functions with rest arguments (`...args`) or default values (`function(param=1)`).
class HookModule {
	static #hooks = new Map()
	static debug = true

	/** Registers a callback to a given hook.
	 * @param {string} hook Convention: no spaces, camelCase.
	 * @param {(args: Array<any>, object: Object) => void} callback
	 */
	static register(hook, callback) {
		if (!this.#hooks.has(hook))
			this.#hooks.set(hook, new Set())
		this.#hooks.get(hook).add(callback)
	}
	/** Runs all registered callbacks on a given hook.
	 * @param {string} hook Convention: no spaces, camelCase.
	 * @param {Array<any>} args
	 */
	static run(hook, args, object) {
		if (this.debug)
			console.log(`[Hook - ${hook} on `, object, ']')
		if (!this.#hooks.has(hook)) return
		for (const callback of this.#hooks.get(hook))
			callback(args, object)
	}
}

//# Classes
class GameObject {
	static #all = new Map()
	#id
	#tags = new Set()
	_components = new Set()

	/**
	 * @param {string} id Convention: all lowercase, no spaces.
	 * @param {GameObjectOptions} options
	 */
	constructor(id, options) {
		HookModule.run('before:GameObject.constructor', arguments, this)

		if (GameObject.#all.has(id))
			throw EXCEPTIONS.objectIDConflict(id)
		if (typeof(id) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('GameObject.id', 'string')

		this.#id = id
		if (options.tags)
			for (const tag of options.tags)
				this.tag(tag)
		if (options.components)
			this.addComponents(options.components)
		if (options.watchProperties) {
			const proxy = new Proxy(this, EventModule._proxyHandler)
			GameObject.#all.set(id, proxy)
			return proxy
		}
		GameObject.#all.set(id, this)

		HookModule.run('after:GameObject.constructor', arguments, this)
		return this
	}

	static get all() {
		return new Map(this.#all)
	}
	get id() {
		return this.#id + ''
	}
	get tags() {
		return new Set(this.#tags)
	}

	/** Returns the object with the given ID, if found, or `null`, if not found.
	 * @param {string} id Convention: all lowercase, no spaces.
	 */
	static find(id) {
		HookModule.run('GameObject.find', arguments, this)
		return this.#all.find(e => e.id === id) || null
	}
	/** Attempts to resolve an object ID to an instance. Optionally checks if it inherits from a given class, and/ir if it contains a given component or set of components.
	 *
	 * Returns a GameObject instance if either the ID is resolved or the first parameter is already an instance, and the requested checks are passed. Returns `null` if the ID does not resolve to an object. Returns `false` if any checks fail.
	 * @param {string | GameObject} id
	 * @param {GameObjectResolveOptions} options If both `components` and `component` are passed in `options`, only the array is checked. `operation` is the name of the method calling this method, and wwill be passed to warning messages for information. If `silent` is set to `true`, no warnings will be issued.
	 */
	static resolve(id, options) {
		HookModule.run('GameObject.resolve', arguments, this)
		let object

		if (typeof(id) === 'object' && !this.isPrototypeOf(id))
			throw EXCEPTIONS.notGameObject
		if (typeof(id) === 'string') {
			object = this.find(id)
			if (!object) {
				if (options.silent !== true)
					LOGS.gameObjectNotFound(id)
				return null
			}
		}

		if (options.proto && typeof(options.proto) === 'function' && options.proto.isPrototypeOf(object))
			if (options.silent !== true)
				return LOGS.incorrectPrototype(id, options.proto.name)
			else return false
		if (options.components)
			for (const component of options.components)
				if (!object.hasComponent(component))
					if (options.silent !== true)
						return LOGS.missingRequiredComponentForOperation(id, component.name, options.operation || 'resolve')
					else return false
		if (options.component &&!object.hasComponent(options.component))
			if (options.silent !== true)
				return LOGS.missingRequiredComponentForOperation(id, options.component.name, options.operation || 'resolve')
			else return false

		return object
	}
	/** Adds the given component to the object. Returns `true`, if successful, `null`, if the component was not found, and `false`, if the component was already present (no-op).
	 * @param {Component | string} component Either the component subclass itself, an instance of the wanted component subclass, or its name.
	 */
	addComponent(component) {
		HookModule.run('before:GameObject.instance.addComponent', arguments, this)

		let instance
		if (typeof component === 'object' && Component.isPrototypeOf(component.constructor))
			instance = component
		else {
			instance = new (Component.resolve(component))()
			if (!instance)
				throw EXCEPTIONS.notComponent
		}

		// if (this.tags.has('PROXIED'))
		// 	instance = new Proxy(instance, EventModule._proxyHandler)

		if (this.hasComponent(instance.constructor))
			return false
		if (instance.constructor.requires.length)
			for (const requirement of instance.constructor.requires)
				this.addComponent(requirement)
		this._components.add(instance)
		instance.parent = this

		if (instance.constructor.reference)
			this[instance.constructor.reference] = instance

		HookModule.run('after:GameObject.instance.addComponent', arguments, this)
	}
	/** Adds the given components to the object. Returns `false` if all components were already present (no-op).
	 * @param {...Component | ...string} args Either the component subclass itself, an instance of the wanted component subclass, or its name.
	 */
	addComponents() {
		HookModule.run('before:GameObject.instance.addComponents', arguments, this)

		let ret = false
		for (const component of arguments)
			if (this.addComponent(component))
				ret = true

		HookModule.run('after:GameObject.instance.addComponents', arguments, this)
		return ret
	}
	/** Returns the component of the given class in the object, if found, or `null`, if not found.
	 * @param {Component | string} component Either the component subclass itself, an instance of the wanted component subclass, or a string to be resolved to the component subclass.
	 */
	component(component) {
		HookModule.run('before:GameObject.instance.component', arguments, this)

		let actualComponent = Component.resolve(component)
		if (!actualComponent)
			throw EXCEPTIONS.notComponent()

		HookModule.run('after:GameObject.instance.component', arguments, this)
		return this._components.find(e => e instanceof actualComponent) || null
	}
	/** Returns whether or not the object has the given component or not.
	 * @param {Class} component Either the component subclass itself, or an instance of the wanted component subclass.
	 */
	hasComponent(component) {
		HookModule.run('GameObject.instance.hasComponent', arguments, this)

		let actualComponent = Component.resolve(component)
		if (!actualComponent)
			throw EXCEPTIONS.notComponent()

		return !!this.component(actualComponent)
	}
	/** Adds a tag to the object. Returns `true`, if the tag wasn't present, or `false`, if it already was (no-op).
	 * @param {string} tag Convention: all caps, past tense.
	 */
	tag(tag) {
		HookModule.run('before:GameObject.instance.tag', arguments, this)

		if (typeof(tag) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('GameObject.instance.tag.tag', 'string')
		if (this.#tags.has(tag))
			return false

		this.#tags.add(tag)

		HookModule.run('after:GameObject.instance.tag', arguments, this)
		return true
	}
	/** Removes a tag from the object. Returns `true`, if the tag was present, or `false`, if it wasn't (no-op).
	 * @param {string} tag Convention: all caps, past tense.
	 */
	untag(tag) {
		HookModule.run('before:GameObject.instance.untag', arguments, this)

		if (typeof(tag) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('GameObject.instance.untag.tag', 'string')
		if (!this.#tags.has(tag))
			return false

		this.#tags.delete(tag)

		HookModule.run('after:GameObject.instance.untag', arguments, this)
		return true
	}
	/** Returns whether the object currently has the given tag.
	 * @param {string} tag Convention: all caps, past tense.
	 */
	isTagged(tag) {
		HookModule.run('GameObject.instance.isTagged', arguments, this)

		if (typeof(tag) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('GameObject.instance.isTagged.tag', 'string')

		return (this.#tags.has(tag))
	}
	/** Serializes the object and all its components in the form of a JSON-compatible object.
	 */
	serialize() {
		const data = {
			id: this.#id,
			tags: Array.from(this.#tags),
			components: Array.from(this._components).map(e => e.serialize())
		}
		return data
	}
}
class Component {
	static reference
	static requires = []
	static #serialization
	parent

	static setSerializationFunction(fn) {
		this.#serialization = fn
	}
	/** Attempts to resolve a string to a Component subclass. Passes it back if first parameter is already one. Returns `null` if not found.
	 * @param {string | typeof Component | Component} component
	 */
	static resolve(component) {
		HookModule.run('Component.resolve', arguments, this)

		if (typeof(component) === 'string' && this.isPrototypeOf(eval(component)))
			return eval(component)
		if (typeof(component) === 'function' && this.isPrototypeOf(component))
			return component
		if (typeof(component) === 'object' && this.isPrototypeOf(component.constructor))
			return component.constructor

		return null
	}
	/** Uses the given `serializeFunction` to compile the component's data in the form of a JSON-compatible object.
	 */
	serialize() {}
}

//# Components
class Stateful extends Component {
	static reference = '_states'
	#data = {}

	get data() {
		new structuredClone(this.#data)
	}

	/** Gets the value correlated with the given variable name.
	 * @param {string} variable Convention: no spaces, camelCase.
	 */
	get(variable) {
		HookModule.run('Stateful.instance.get', arguments, this)

		if (typeof(variable) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Stateful.instance.get.variable', 'string')
		if (!this.#data.hasOwnProperty(variable))
			return LOGS.elementNotRegisteredInCollection(variable, 'Stateful.instance.data')

		return this.#data[variable]
	}
	/** Sets the value correlated with the given variable name. Returns `true`, if successful, and `false`, if the variable does not exist.
	 * @param {string} variable Convention: no spaces, camelCase.
	 * @param {boolean | number} value
	 */
	set(variable, value) {
		HookModule.run('before:Stateful.instance.set', arguments, this)

		if (typeof(variable) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Stateful.instance.set.variable', 'string')
		switch (typeof(value)) {
			case 'number':
			case 'boolean':
			case 'undefined':
				break
			default:
				throw EXCEPTIONS.brokenEnforcedType('Stateful.instance.set.value', 'number | boolean | undefined')
		}
		if (!this.#data.hasOwnProperty(variable))
			return LOGS.elementNotRegisteredInCollection(variable, 'Stateful.instance.data')

		const previous = this.#data[variable]
		this.#data[variable] = value

		EventModule.emitPropertyEvents({
			object: this.parent,
			property: variable,
			previous,
			current: value
		}, 'states.')
		EventModule.emit(`states.set`, {
			object: this.parent,
			variable,
			value
		})
		HookModule.run('after:Stateful.instance.set', arguments, this)
		return true
	}
	/** Creates a variable and a default value. Returns `true`, if successful, and `false`, if the variable already exists, ignoring the operation.
	 * @param {string} variable Convention: no spaces, camelCase.
	 * @param {boolean | number} value
	 */
	create(variable, initialValue) {
		HookModule.run('before:Stateful.instance.create', arguments, this)

		if (typeof(variable) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Stateful.instance.create.variable', 'string')
		switch (typeof(initialValue)) {
			case 'number':
			case 'boolean':
			case 'undefined':
				break
			default:
				throw EXCEPTIONS.brokenEnforcedType('Stateful.instance.set.initialValue', 'number | boolean | undefined')
		}
		if (this.#data[variable] === undefined)
			return false

		this.#data[variable] = initialValue

		EventModule.emit(`states.created`, {
			object: this.parent,
			variable,
			initialValue
		})
		HookModule.run('after:Stateful.instance.create', arguments, this)
		return true
	}
}
class Stringful extends Component {
	static reference = '_strings'
	#strings = new Map()

	get strings() {
		return new Map(this.#strings)
	}

	/** Gets the string correlated with the given key.
	 * @param {string} key Convention: dot-separated domains, no spaces, camelCase ('en.action.jumpOn.successful')
	 */
	get(key) {
		HookModule.run('Stringful.instance.get', arguments, this)

		if (typeof(key) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Stringful.instance.get.key', 'string')

		let string = this.#strings.get(key)
		if (typeof(string) === 'function')
			string = string()

		return string
	}
	/** Sets the string correlated with the given key. Can be a function that returns a string.
	 * @param {string} key Convention: no spaces, camelCase.
	 * @param {string | () => string} string
	 */
	set(key, string) {
		HookModule.run('before:Stringful.instance.set', arguments, this)

		if (typeof(key) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Stringful.instance.set.key', 'string')
		if (typeof(string) !== 'string' && typeof(string) !== 'function')
			throw EXCEPTIONS.brokenEnforcedType('Stringful.instance.set.string', 'string | () => string')

		const previous = this.#strings.get(key)
		this.#strings.set(key, string)

		EventModule.emitPropertyEvents({
			object: this.parent,
			property: key,
			previous,
			current: string
		}, 'strings.')
		EventModule.emit('strings.set', {
			object: this.parent,
			key,
			previous,
			current: string
		})
		HookModule.run('after:Stringful.instance.set', arguments, this)
		return true
	}
}
class Perceptible extends Component {
	static reference = '_perceptions'
	static requires = [Stringful]
	#perceptions = new Map()

	get name() {
		return this.parent._strings.get('sense.name')
	}
	get descriptionShort() {
		return this.parent._strings.get('sense.descriptionShort')
	}
	get descriptionLong() {
		return this.parent._strings.get('sense.descriptionLong')
	}

	/** Sets a name, short description (for, i.e., item lists), and long description (for, i.e., when looking at an item or listing it in an UI). Can be functions that return a string.
	 * @param {string | () => string} name Convention: all lowercase (unless proper name), no article.
	 * @param {string | () => string} short Convention: all lowercase (unless proper name), with article.
	 * @param {string | () => string} long Convention: sentence, first letter uppercase.
	 */
	setDescriptions(name, short, long) {
		HookModule.run('before:Perceptible.instance.setDescriptions', arguments, this)

		if (typeof(name) !== 'string' && typeof(name) !== 'function')
			throw EXCEPTIONS.brokenEnforcedType('Perceptible.instance.setDescriptions.name', 'string | () => string')
		if (typeof(short) !== 'string' && typeof(short) !== 'function')
			throw EXCEPTIONS.brokenEnforcedType('Perceptible.instance.setDescriptions.short', 'string | () => string')
		if (typeof(long) !== 'string' && typeof(long) !== 'function')
			throw EXCEPTIONS.brokenEnforcedType('Perceptible.instance.setDescriptions.long', 'string | () => string')

		this.parent._strings.set('sense.name', name)
		this.parent._strings.set('sense.descriptionShort', short)
		this.parent._strings.set('sense.descriptionLong', long)

		EventModule.emit('perceptions.descriptions.set')
		HookModule.run('after:Perceptible.instance.setDescriptions', arguments, this)
	}
	/** Add a description for a given sense, in a particular context (i.e. sight direct, smell inRoom). Returns `true`, if there was a perception set for the given sense and context and it was overwritten, and `false`, if there wasn't.
	 * @param {string} sense Convention: no spaces, camelCase.
	 * @param {Perception} perception
	 * @param {PerceptionContext} context
	 * @param {string | PerceptionDescriptionFunction} description
	 */
	addPerception(sense, context, description) {
		HookModule.run('before:Perceptible.instance.setPerception', arguments, this)

		if (typeof(sense) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Perceptible.instance.addPerception.sense', 'string')
		if (typeof(context) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Perceptible.instance.addPerception.context', 'string')
		if (typeof(description) !== 'string' && typeof(description) !== 'function')
			throw EXCEPTIONS.brokenEnforcedType('Perceptible.instance.addPerception.description', 'string | () => string')

		if (!this.#perceptions.has(sense))
			this.#perceptions.set(sense, new Map())
		let existed = this.#perceptions.get(sense).has(context)
		this.#perceptions.get(sense).set(context, description)
		this.parent._strings.set(`sense.${sense}.${context}`, description)

		EventModule.emit(`perceptions.added`, { object: this.parent, sense, context })
		HookModule.run('after:Perceptible.instance.setPerception', arguments, this)
		return existed
	}
	/** Removes the perception from a given sense and context. Returns `true`, if successful, and `false`, if either the sense or context didn't exist.
	 * @param {string} sense Convention: no spaces, camelCase.
	 * @param {PerceptionContext} context
	 */
	removePerception(sense, context) {
		HookModule.run('before:Perceptible.instance.removePerception', arguments, this)

		if (typeof(sense) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Perceptible.instance.addPerception.sense', 'string')
		if (typeof(context) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Perceptible.instance.addPerception.context', 'string')
		if (!this.#perceptions.has(sense))
			return false
		if (!this.#perceptions.get(sense).has(context))
			return false

		this.#perceptions.get(sense).delete(context)

		HookModule.run('after:Perceptible.instance.removePerception', arguments, this)
		return true
	}
	/** Returns a particular perception, for a given sense, in a particular context. If `context` is, instead, an array of contexts, it'll look for perceptions in its order, and return the first found. Returns the appropriate string, if found, or 'null', if not found.
	 * @param {string} sense Convention: no spaces, camelCase.
	 * @param {PerceptionContext | Array<PerceptionContext>} context Either a perception context string, or an array of them.
	 * @param {GameObject} sensor The object attempting to perceive. Used if the perception found is a PerceptionDescriptionFunction.
	 */
	perceive(sense, context, sensor) {
		HookModule.run('before:Perceptible.instance.perceive', arguments, this)

		if (typeof(sense) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Perceptible.instance.perceive.sense', 'string')
		if (typeof(context) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Perceptible.instance.perceive.context', 'string')
		if (!this.#perceptions.has(sense))
			return null
		if (!GameObject.isPrototypeOf(sensor))
			throw EXCEPTIONS.notGameObject()

		const perceptions = this.#perceptions.get(sense)
		let found
		let realContext = context
		if (typeof(context) === 'string')
			found = perceptions.get(context)
		else if (context instanceof Array)
			for (const context of context)
				if (perceptions.has(context)) {
					found = perceptions.get(context)
					realContext = context
					break
				}
		if (!found)
			return null
		if (typeof(found) === 'function')
			found = found(sensor, this.parent)

		EventModule.emit(`perceptions.perceived`, {
			sensor,
			target: this.parent,
			sense,
			context: realContext,
		})
		HookModule.run('after:Perceptible.instance.perceive', arguments, this)
		return found
	}
}
class Tangible extends Component {
	static reference = '_location'
	#location

	get location() {
		return GameObject.resolve(this.#location)
	}

	/** Moves the object to a new location. Returns `true`, if successful, `null`, if the location is not found, or `false`, if an error occurred.
	 * @param {Room | GameObject | string} location
	 * @param {boolean} passOn INTERNAL USE: if anything but `false`, will call the current (if existent) container's `remove` method and new container's `add` method.
	 */
	moveTo(location, passOn) {
		HookModule.run('before:Tangible.instance.moveTo', arguments, this)

		location = GameObject.resolve(location, { component: Container, operation: 'Tangible.instance.moveTo' })
		if (!location)
			return location

		const previous = this.#location
		if (passOn !== false)
			this.location?._container.remove(this.parent, false)
		this.#location = location.id
		if (passOn !== false)
			this.location._container.add(this.parent, false)

		EventModule.emitPropertyEvents({
			object: this.parent,
			property: 'location',
			previous,
			current: this.#location
		}, 'tangible.')
		EventModule.emit(`tangible.moved`, {
			object: this.parent,
			previous,
			current: this.#location
		})
		HookModule.run('after:Tangible.instance.moveTo', arguments, this)
		return true
	}
	/** Removes the object from its current location (if any) and clears its lcation to `undefined`.
	 * @param {boolean} passOn INTERNAL USE: if anything but `false`, will call the current (if existent) container's `remove` method.
	 */
	removeFromWorld(passOn) {
		HookModule.run('before:Tangible.instance.clearLocation', arguments, this)

		const previous = this.#location
		if (passOn !== false)
			this.location._container.remove(this.parent, false)
		this.#location = undefined

		EventModule.emitPropertyEvents({
			object: this.parent,
			property: 'location',
			previous,
			current: undefined
		}, 'tangible.')
		EventModule.emit(`tangible.moved`, {
			object: this.parent,
			previous,
			current: this.#location
		})
		EventModule.emit(`tangible.removed`, {
			object: this.parent,
			previous
		})
		HookModule.run('after:Tangible.instance.clearLocation', arguments, this)
	}
	/** Returns whether this and the given object are in the same location. Returns `null` if an error occurs.
	 * @param {GameObject | string} object
	 */
	samePlaceAs(object) {
		HookModule.run('Tangible.instance.samePlaceAs', arguments, this)

		let actualObject = GameObject.resolve(object, { component: Tangible, operation: 'Tangible.instance.samePlaceAs' })
		if (!actualObject)
			return null

		return actualObject._tangible.location === this.location
	}
}
class Countable extends Component {
	static reference = '_count'
	static requires = [Tangible]
	#count = 0

	get count() {}

	/** Adds a given amount to the object's count. Rounds amount to lowest integer.
	 * @param {number} amount
	 */
	add(amount) {}
	/** Subtracts a given amount from the object's count. Rounds amount to lowest integer.
	 * @param {number} amount
	 */
	subtract(amount) {}
}
class Containing extends Component {
	static reference = '_container'
	static requires = [Tangible]
	#contents = new Set()

	get contents() {
		return new Set(
			Array.from(this.#contents)
				.map(e => GameObject.resolve(e, { operation: 'Containing.instance.get.contents' }))
		)
	}

	/** Adds an object to the container. Returns `true`, if successful, `null`, if the object isn't found, and `false`, if the object was already present.
	 * @param {GameObject | string} object
	 * @param {boolean} passOn INTERNAL USE: if anything but `false`, will call the current (if existent) container's `remove` method and new container's `add` method.
	 */
	add(object, passOn) {
		HookModule.run('before:Container.instance.add', arguments, this)

		if (this.has(actualObject))
			return false

		const actualObject = GameObject.resolve(object, { component: Tangible, operation: 'Container.instance.add' })
		if (!actualObject)
			return actualObject
		if (passOn !== false)
			actualObject._tangible.moveTo(this.parent, false)
		this.#contents.add(actualObject.id)

		EventModule.emit('container.addd', {
			object: this.parent,
			item: actualObject
		})
		HookModule.run('after:Container.instance.add', arguments, this)
		return true
	}
	/** Removes an object from the container. Returns `true`, if object was present, `null`, if the object isn't found, and `false`, if the object wasn't present.
	 * @param {GameObject | string} object
	 * @param {boolean} passOn INTERNAL USE: if anything but `false`, will call the current (if existent) container's `remove` method and new container's `add` method.
	 */
	remove(object, passOn) {
		HookModule.run('before:Container.instance.remove', arguments, this)

		if (!this.has(actualObject))
			return false

		const actualObject = GameObject.resolve(object, { component: Tangible, operation: 'Container.instance.remove' })
		if (!actualObject)
			return actualObject
		if (passOn !== false)
			actualObject._tangible.removeFromWorld(false)
		this.#contents.delete(actualObject.id)

		EventModule.emit('container.removed', {
			object: this.parent,
			item: actualObject
		})
		HookModule.run('after:Container.instance.remove', arguments, this)
		return true
	}
	emptyInto(container) {}
	empty() {}
	/** Returns whether the given object is contained within the container.
	 * @param {GameObject | string} object
	 */
	has(object) {
		HookModule.run('Container.instance.has', arguments, this)

		const actualObject = GameObject.resolve(object, { component: Tangible, operation: 'Container.instance.has' })
		if (!actualObject)
			return actualObject

		return this.#contents.has(actualObject.id)
	}
}
class Actionable extends Component {
	static reference = '_actions'
	static requires = [Tangible]
	static #actions = new Map()
	static #disabledActions = new Set()
	#actions = new Set()

	static get actions() {
		return new Map(
			Array.from(this.#actions)
				.filter(([key, _]) => !this.#disabledActions.has(key))
		)
	}
	get actions() {
		return this.#actions.difference(Actionable.#disabledActions)
	}

	/** Registers an Action object into the component's registry.
	 * @param {string} name Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 * @param {Action} actionObject
	 */
	static registerAction(name, actionObject) {
		HookModule.run('before:Actionable.registerAction', arguments, this)

		if (typeof(name) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Actionable.registerAction.name', 'string')
		if (this.isAction(name))
			throw EXCEPTIONS.generalIDConflict('Actionable.#actions', name)

		this.#actions.set(name, {
			predicate: actionObject.predicate || undefined,
			callback: actionObject.callback
		})

		HookModule.run('after:Actionable.registerAction', arguments, this)
	}
	/** Returns whether the given action name is registered as an action in the component's registry, and not currently disabled.
	 * @param {string} action Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 * @param {{enabledOnly: boolean}} options Only `enabledOnly`: `true` by default; if `false`, will check regardless of disabled actions.
	 */
	static isAction(action, options) {
		HookModule.run('Actionable.isAction', arguments, this)
		if (options.enabledOnly === false)
			return this.#actions.has(action)
		return this.actions.has(action)
	}
	/** Completely disables the given action system-wide. Returns `true`, if successful, and `false`, if an error occurred.
	 * @param {string} action
	 */
	static disable(action) {
		HookModule.run('before:Actionable.disable', arguments, this)

		if (typeof(action) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Actionable.disable.action', 'string')
		if (!Actionable.isAction(action))
			return LOGS.elementNotRegisteredInCollection(action, 'Actionable.#actions')

		this.#disabledActions.add(action)

		HookModule.run('after:Actionable.disable', arguments, this)
		return true
	}
	/** Enables the given action system-wide. Returns `true`, if successful, and `false`, if an error occurred.
	 * @param {string} action
	 */
	static enable(action) {
		HookModule.run('before:Actionable.enable', arguments, this)

		if (typeof(action) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Actionable.enable.action', 'string')
		if (!Actionable.isAction(action))
			return LOGS.elementNotRegisteredInCollection(action, 'Actionable.#actions')
		if (!Actionable.#disabledActions.has(action))
			return LOGS.elementNotRegisteredInCollection(action, 'Actionable.#disabledActions')

		this.#disabledActions.delete(action)

		HookModule.run('after:Actionable.enable', arguments, this)
		return true
	}
	/** Adds the action name (or all in the array) to the object's allowed actions. Returns `true`, if successful, or `false`, if (at least one) error occurs.
	 * @param {string | Array<string>} action Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 */
	agentsCan(action) {
		HookModule.run('before:Actionable.instance.agentsCan', arguments, this)

		if (typeof(action) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Actionable.instance.agentsCan.action', 'string')

		if (typeof(action) === 'string') {
			if (!Actionable.isAction(action))
				return LOGS.elementNotRegisteredInCollection(action, 'Actionable.#actions')
			this.#actions.add(action)
			return true
		}
		let ret = true
		if (action instanceof Array)
			for (const name of action) {
				if (!Actionable.isAction(action))
					ret = LOGS.elementNotRegisteredInCollection(name, 'Actionable.#actions')
				else this.#actions.add(name)
			}

		EventModule.emit('actions.added', { object: this.parent, action: name })
		HookModule.run('after:Actionable.instance.agentsCan', arguments, this)
		return ret
	}
	/** Removes the action name (or all in the array) from the object's allowed actions. Returns `true`, if action(s) were present and removed, or `false`, if (at least one) already wasn't.
	 * @param {string | Array<string>} action Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 */
	agentsCannot(action) {
		HookModule.run('before:Actionable.instance.agentsCannot', arguments, this)

		if (typeof(action) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Actionable.instance.agentsCannot.action', 'string')
		if (typeof(action) === 'string') {
			if (!Actionable.isAction(action))
				return LOGS.elementNotRegisteredInCollection(action, 'Actionable.#actions')
			this.#actions.delete(action)
			return true
		}
		let ret = true
		if (action instanceof Array)
			for (const name of action) {
				if (!Actionable.isAction(action))
					ret = LOGS.elementNotRegisteredInCollection(name, 'Agentive.instance.#acts')
				else this.#actions.delete(name)
			}

		EventModule.emit('actions.removed', { object: this.parent, action: name })
		HookModule.run('after:Actionable.instance.agentsCannot', arguments, this)
		return ret
	}
}
class Agentive {
	static reference = '_acts'
	static #acts = new Map()
	static #disabledActs = new Set()
	#acts = new Set()

	static get acts() {
		return new Map(
			Array.from(this.#acts)
				.filter(([key, _]) => !this.#disabledActs.has(key))
		)
	}
	get acts() {
		return this.#acts.difference(Agentive.#disabledActs)
	}

	/** Registers an Act object into the component's registry.
	 * @param {string} name Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 * @param {Act} actObject
	 */
	static registerAct(name, actObject) {
		HookModule.run('before:Agentive.registerAct', arguments, this)

		if (typeof(act) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Agentive.registerAct.act', 'string')
		if (this.isAct(name))
			throw EXCEPTIONS.generalIDConflict('Agentive.#acts', name)

		this.#acts.set(name, {
			predicate: actObject.predicate || undefined,
			callback: actObject.callback
		})

		HookModule.run('after:Agentive.registerAct', arguments, this)
	}
	/** Returns whether the given act name is registered as an act in the component's registry, and not currently disabled.
	 * @param {string} act Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 * @param {{enabledOnly: boolean}} options Only `enabledOnly`: `true` by default; if `false`, will check regardless of disabled actions.
	 */
	static isAct(act, options) {
		HookModule.run('Actionable.isAct', arguments, this)
		if (options.enabledOnly === false)
			return this.#acts.has(act)
		return this.acts.has(act)
	}
	/** Completely disables the given act system-wide. Returns `true`, if successful, and `false`, if an error occurred.
	 * @param {string} act
	 */
	static disable(act) {
		HookModule.run('before:Agentive.disable', arguments, this)

		if (typeof(act) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Agentive.disable.act', 'string')
		if (!Agentive.isAct(act))
			return LOGS.elementNotRegisteredInCollection(act, 'Agentive.#acts')

		this.#disabledActs.add(act)

		HookModule.run('after:Agentive.disable', arguments, this)
		return true
	}
	/** Reenables the given act system-wide. Returns `true`, if successful, and `false`, if an error occurred.
	 * @param {string} act
	 */
	static enable(act) {
		HookModule.run('before:Agentive.enable', arguments, this)

		if (typeof(act) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Agentive.enable.act', 'string')
		if (!Agentive.isAct(act))
			return LOGS.elementNotRegisteredInCollection(act, 'Agentive.#acts')
		if (!Agentive.#disabledActs.has(act))
			return LOGS.elementNotRegisteredInCollection(act, 'Agentive.#disabledActs')

		this.#disabledActs.delete(act)

		HookModule.run('after:Agentive.enable', arguments, this)
		return true
	}
	/** Adds the act name (or all in the array) to the object's allowed acts. Returns `true`, if successful, or `false`, if (at least one) error occurs.
	 * @param {string | Array<string>} act Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 */
	can(act) {
		HookModule.run('before:Agentive.instance.can', arguments, this)

		if (typeof(act) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Agentive.instance.can.act', 'string')
		if (typeof(act) === 'string') {
			if (!Agentive.isAction(act))
				return LOGS.elementNotRegisteredInCollection(act, 'Agentive.instance.#acts')
			this.#acts.add(act)
			return true
		}
		let ret = true
		if (act instanceof Array)
			for (const name of act) {
				if (!Agentive.isAction(act))
					ret = LOGS.elementNotRegisteredInCollection(name, 'Agentive.instance.#acts')
				else this.#acts.add(name)
			}

		EventModule.emit('acts.added', { object: this.parent, act: name })
		HookModule.run('after:Agentive.instance.can', arguments, this)
		return ret
	}
	/** Removes the act name (or all in the array) from the object's allowed acts. Returns `true`, if act(s) were present and removed, or `false`, if (at least one) already wasn't.
	 * @param {string | Array<string>} act Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 */
	cannot(act) {
		HookModule.run('before:Agentive.instance.cannot', arguments, this)

		if (typeof(act) === 'string') {
			if (!Agentive.isAct(act))
				return LOGS.elementNotRegisteredInCollection(act, 'Agentive.instance.#acts')
			this.#acts.delete(act)
			return true
		}

		let ret = true
		if (act instanceof Array)
			for (const name of act) {
				if (!Agentive.isAct(act))
					ret = LOGS.elementNotRegisteredInCollection(name, 'Agentive.instance.#acts')
				else this.#acts.delete(name)
			}

		EventModule.emit('acts.removed', { object: this.parent, act: name })
		HookModule.run('after:Agentive.instance.cannot', arguments, this)
		return ret
	}
}

let test = new GameObject()
test.addComponent(Perceptible)
test._perceptions.setDescriptions('pebble', 'a round pebble', 'A smooth, round pebble, of the sort usually found in a river.')
// console.log(test._components)