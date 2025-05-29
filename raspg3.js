//# Typedefs
/** @typedef {{event: string, callback: EventCallback, owner: GameObject, once: boolean}} EventListener */
/** @typedef {(owner: GameObject, data: EventData) => void} EventCallback */
/** @typedef {{object: GameObject, property: string, previous: any, current: any}} EventData */
/** @typedef {{proto: Function, component: Component, components: Iterable<Component>, operation: string, silent: boolean}} GameObjectResolveOptions */
/** @typedef {{context: PerceptionContext, description: string | PerceptionDescriptionFunction}} Perception */
/** @typedef {string | 'superficial' | 'direct' | 'inContainer' | 'inRoom' | 'adjacentRoom' | 'onObject'} PerceptionContext */
/** @typedef {(sensor: GameObject, target: GameObject) => string} PerceptionDescriptionFunction */

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

//# RasPG core
class RasPG {
	static metadata = {
		shortname: "RasPG Framework",
		fullname: "Rasutei's Plaintext Game Framework",
		description: 'A framework for creating interactive fiction and text-based games, focused on being flexible, modular, customizable, and extendable, while attempting to be friendly to writers and developers alike.',
		author: 'Rasutei',
		version: '3.0.0-dev',
		repository: 'https://github.com/RustyGentleman/RasPG-Framework',
	}
	static config = {
		parameterTypeEnforcement: true,
		logWarnings: true,
		logErrors: true,
		serializeFunctions: false,
	}
	static runtime = {
		state: {
			/** @type {'initializing' | 'serializing' | 'running'} */
			inner: 'initializing',
		},
		saveModule: undefined,
		modules: new Map(),
		classes: new Map(),
		components: new Map(),
		extensions: new Map(),
	}
	static utils = {
		lang: {
			en: {
				/** Takes a trimmed string containing a noun and returns it with an/a, depending on first letter.
				 * @param {string} noun
				 */
				withArticle(noun) {
					return 'aeiouAEIOU'.includes(noun[0])? 'an' : 'a'
				},
				/** Takes a trimmed string containing a noun and returns it pluralized following basic rules.
				 * @param {string} noun
				 */
				plural(noun) {
					if (noun.endsWith('y') && !/[aeiou]y$/i.test(noun))
						return noun.slice(0, -1) + 'ies'
					if (noun.endsWith('s') || noun.endsWith('x') || noun.endsWith('z') || noun.endsWith('ch') || noun.endsWith('sh'))
						return noun+'es'
					if (noun.endsWith('f'))
						return noun.slice(0, -1)+'ves'
					if (noun.endsWith('fe'))
						return noun.slice(0, -2)+'ves'
					return noun+'s'
				}
			}
		}
	}
	static debug = {
		exceptions: {
			notGameObject: () => new TypeError('[RasPG][notGameObject] Expected id or instance of GameObject or subclass'
				+'\nMaybe typo or wrong parameter passed'),
			notComponent: () => new TypeError('[RasPG][notComponent] Expected name, instance or prototype of Component or subclass'
				+'\nMaybe typo, wrong parameter passed, or from missing extension'),
			objectIDConflict: (objectID) => new Error(`[RasPG][objectIDConflict] Conflicting GameObject IDs: "${objectID}"`
				+'\nMaybe typo, double declaration, or forgot'),
			generalIDConflict: (domainPath, id) => new Error(`[RasPG][generalIDConflict] Conflicting IDs on "${domainPath}": "${id}"`
				+'\nMaybe typo, double declaration, or forgot'),
			brokenTypeEnforcement: (param, type, expected) => new Error(`[RasPG][brokenTypeEnforcement] Enforced parameter/property type broken: "${param}" is "${type}", expected "${expected}"`
				+'\nMaybe wrong parameter order, typo, or forgot to pass'),
			missingParameter: (param) => new Error(`[RasPG][missingParameter] Missing required parameter: "${param}"`
				+'\nMaybe typo or forgot to pass'),
			deserializerMissingComponent: (component) => new Error(`[RasPG][deserializerMissingComponent] Deserialization error: missing component "${component}"`
				+'\nMaybe got renamed on version change, maybe from framework extension'),
			missingRequiredContext: (label) => new Error(`[RasPG][missingRequiredContext] Missing required context: "${label}"`
				+'\nMaybe wrong label, pushed to wrong label, or forgot to push'),
		},
		logs: {
			gameObjectNotFound: (objectID) => {
				if (RasPG.config.logErrors)
					console.error(`[RasPG][gameObjectNotFound] ID "${objectID}" does not presently correspond to a registered GameObject instance`
						+'\nMaybe typo, or not yet created at this line')
				return false
			},
			incorrectPrototype: (objectID, className, operation) => {
				if (RasPG.config.logWarnings)
					console.warn(`[RasPG][incorrectPrototype] Object (ID "${objectID}") must be sub-class of "${className}" for use in operation "${operation}"`
						+'\nMaybe wrong object reference')
				return false
			},
			missingRequiredComponentForOperation: (objectID, componentName, operation) => {
				if (RasPG.config.logWarnings)
					console.warn(`[RasPG][missingRequiredComponentForOperation] Object (ID "${objectID}") is missing required component "${componentName}" for operation "${operation}"`
						+'\nMaybe wrong object, forgot to add or register component, or added wrong component (Actionable vs Agentive)')
				return false
			},
			elementNotRegisteredInCollection: (element, collection) => {
				if (RasPG.config.logWarnings)
					console.warn(`[RasPG][elementNotRegisteredInCollection] Element "${element}" is not registered in collection "${collection}"`
						+'\nMaybe typo, wrong collection, or not yet added at this line')
				return false
			},
			componentMissingSerialization: (component) => {
				if (RasPG.config.logWarnings)
					console.warn(`[RasPG][componentMissingSerialization] Component "${component}" is missing a serializer and/or a deserializer functions`
						+'\nMaybe forgot to set, may be intentional')
				return false
			},
		},
		validate: {
			type(path, value, typeSpec) {
				if (!RasPG.config.parameterTypeEnforcement)
					return

				const [typeString, label] = Array.isArray(typeSpec) ? typeSpec : [typeSpec, typeSpec]
				const acceptedTypes = splitTopLevelTypes(typeString)
				const isValid = acceptedTypes.some(type => checker(value, type))

				if (!isValid)
					throw RasPG.debug.exceptions.brokenTypeEnforcement(`${path}.${value}`, typeof value, label)
				return true

				function checker(val, typeStr) {
					typeStr = typeStr.trim()
					if (typeStr.endsWith('[]'))
						typeStr = `Array<${typeStr.slice(0, -2)}>`
					const arrayMatch = typeStr.match(/^Array<(.+)>$/)
					if (arrayMatch) {
						if (!Array.isArray(val))
							return false
						const innerTypes = splitTopLevelTypes(arrayMatch[1])
						return val.every(el => innerTypes.some(inner => checker(el, inner)))
					}
					switch(typeStr) {
						case 'RegExp':
							return val instanceof RegExp
						case 'GameObject':
							return val instanceof GameObject
						default:
							return typeof val === typeStr
					}
				}
				function splitTopLevelTypes(typeStr) {
					const types = []
					let depth = 0
					let buffer = ''
					for (let i = 0; i < typeStr.length; i++) {
						const char = typeStr[i]
						if (char === '<') depth++
						else if (char === '>') depth--
						else if (char === '|' && depth === 0) {
							types.push(buffer.trim())
							buffer = ''
							continue
						}
						buffer += char
					}
					if (buffer) types.push(buffer.trim())
					return types
				}
			},
			/**
			 * Throws an exception if required properties are missing or mistyped, or if present optional properties are mistyped.
			 * @param {string} path Domain(.instance).method.param
			 * @param {Object} object Object to be validated
			 * @param {{ [prop: string]: string | [string, string] } | false} required Required properties and their types
			 * @param {{ [prop: string]: string | [string, string] }} optional Optional properties and their types
			 */
			props(path, object, required, optional={}) {
				if (required === false && object === undefined)
					return true
				if (typeof(object) !== 'object')
					if (RasPG.config.parameterTypeEnforcement)
						throw RasPG.debug.exceptions.brokenTypeEnforcement(path.match(/[^\.]+$/), typeof(object), 'object')
					else return false
				for (const [prop, typeSpec] of Object.entries(required)) {
					if (!(prop in object))
						throw RasPG.debug.exceptions.missingParameter(prop)
					else if (RasPG.config.parameterTypeEnforcement && typeSpec !== '')
						this.type(path+'.'+prop, object[prop], typeSpec)
				}
				if (!RasPG.config.parameterTypeEnforcement)
					return
				for (const [prop, typeSpec] of Object.entries(optional))
					if (prop in object)
						this.type(path+'.'+prop, object[prop], typeSpec)
				return true
			},
			/**
			 * Throws an exception if any of the passed variables are mistyped.
			 * @param {string} path Domain(.instance).method
			 * @param {{[param: string]: [any, string | [string, string]]}} checks
			 */
			types(path, checks) {
				if (!RasPG.config.parameterTypeEnforcement)
					return
				for (const [param, [value, typeSpec]] of Object.entries(checks))
					this.type(path+'.'+param, value, typeSpec)
				return true
			}
		}
	}

	/** Registers a module to the core framework.
	 * @param {string} name
	 * @param {Function} module
	 */
	static registerModule(name, module) {
		if (typeof(name) !== 'string')
			throw RasPG.debug.exceptions.brokenTypeEnforcement('RasPG.registerModule.name', 'string')
		if (typeof(module) !== 'function')
			throw RasPG.debug.exceptions.brokenTypeEnforcement('RasPG.registerModule.module', 'function')
		if (this.runtime.modules.has(name)) {
			console.warn(`[RasPG - Core] Attempted to register module "${name}" more than once.`
				+'\nNo clue here, honestly; unless also attempting to register an extension more than once')
			return false
		}

		this.runtime.modules.set(name, module)
	}
	/** Registers a class to the core framework. Usually for helper classes, helpful for safe string-to-class resolution.
	 * @param {string} name
	 * @param {Function} class
	 */
	static registerClass(name, clss) {
		if (typeof(name) !== 'string')
			throw RasPG.debug.exceptions.brokenTypeEnforcement('RasPG.registerClass.name', 'string')
		if (typeof(clss) !== 'function')
			throw RasPG.debug.exceptions.brokenTypeEnforcement('RasPG.registerClass.clss', 'function')
		if (this.runtime.classes.has(name)) {
			console.warn(`[RasPG - Core] Attempted to register class "${name}" more than once.`
				+'\nNo clue here, honestly; unless also attempting to register an extension more than once')
			return false
		}

		this.runtime.classes.set(name, clss)
	}
	/** Registers a component to the core framework.
	 * @param {string} name
	 * @param {Function} component
	 */
	static registerComponent(name, component) {
		if (typeof(name) !== 'string')
			throw RasPG.debug.exceptions.brokenTypeEnforcement('RasPG.registerComponent.name', 'string')
		if (typeof(component) !== 'function')
			throw RasPG.debug.exceptions.brokenTypeEnforcement('RasPG.registerComponent.component', 'function')
		if (this.runtime.components.has(name)) {
			console.warn(`[RasPG - Core] Attempted to register component "${name}" more than once.`
				+'\nNo clue here, honestly; unless also attempting to register an extension more than once')
			return false
		}

		this.runtime.components.set(name, component)
	}
	/** Registers an extension to the core framework. Modules, classes and components must be registered separately.
	 * @param {string} name
	 * @param {{ description?: string, author?: string, version?: string, repository?: string, minimumCoreVersion?: string }} metadata
	 */
	static registerExtension(name, metadata) {
		if (typeof(name) !== 'string')
			throw RasPG.debug.exceptions.brokenTypeEnforcement('RasPG.registerExtension.name', 'string')
		if (typeof(metadata) !== 'object')
			throw RasPG.debug.exceptions.brokenTypeEnforcement('RasPG.registerExtension.metadata', 'object')
		if (this.runtime.extensions.has(name)) {
			console.warn(`[RasPG - Core] Attempted to register extension "${name}" more than once.`
				+'\nMaybe importing on or from multiple places')
			return false
		}

		this.runtime.extensions.set(name, metadata || {})
	}
}

//# Modules
class EventModule {
	static #listeners = new Map()
	static logInfo = true
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

		if (this.logInfo)
			console.info(`[\x1b[36;1mEvent\x1b[0m - \x1b[33m${event}\x1b[0m on \x1b[93m${data.object? 'ID:'+data.object.id : 'object'}\x1b[0m]`)
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
} RasPG.registerModule('EventModule', EventModule)
class HookModule {
	static #hooks = new Map()
	static logInfo = true

	/** Registers a callback to a given hook.
	 *
	 * !!!WARNING!!! - Hooks that depend on being able to mutate a function's passed `arguments` object will not work under 'use strict', or in functions with rest arguments (`...args`) or default values (`function(param=1)`).
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
		if (this.logInfo)
			console.info(`[\x1b[34;1mHook\x1b[0m - \x1b[33m${hook}\x1b[0m]`)
		if (!this.#hooks.has(hook)) return
		for (const callback of this.#hooks.get(hook))
			callback(args, object)
	}
} RasPG.registerModule('HookModule', HookModule)
class ContextModule {
	static #context = {}
	static #gatherers = new Map()

	static get context() {
		const ret = {}
		for (const label in this.#context)
			ret[label] = Array.from(this.#context[label])
		return ret
	}
	static get gatherers() {
		return new Map(this.#gatherers)
	}

	/** Pushes the given objects to the context under their given labels.
	 * @example
	 * ContextModule.push({
	 * 	agent: currentAgent,
	 * 	action: currentAction,
	 * 	target: actionTarget
	 * })
	 * // Code where pushed context-objects are relevant
	 * ContextModule.pop(['agent', 'action', 'target'])
	 * @param {{[label: string]: object}} objects
	 */
	static push(objects) {
		HookModule.run('before:ContextModule.push', arguments, this)

		RasPG.debug.validate.type('ContextModule.push.objects', objects, 'object')

		for (const label in objects) {
			if (!(label in this.#context))
				this.#context[label] = []
			this.#context[label].unshift(objects[label])
		}

		HookModule.run('after:ContextModule.push', arguments, this)
	}
	/** Pops objects under the given labels from the context. Returns the number of failures (trying to pop empty context stack).
	 * @example
	 * ContextModule.push({
	 * 	agent: currentAgent,
	 * 	action: currentAction,
	 * 	target: actionTarget
	 * })
	 * // Code where pushed context-objects are relevant
	 * ContextModule.pop(['agent', 'action', 'target'])
	 * @param {string[]} labels
	 */
	static pop(labels) {
		HookModule.run('before:ContextModule.pop', arguments, this)

		RasPG.debug.validate.type('ContextModule.push.labels', labels, 'Array<string>')

		let ret = 0
		for (const label of labels) {
			if (label in this.#context)
				this.#context[label].shift()
			else
				ret++
			if (this.#context[label].length === 0)
				delete this.#context[label]
		}

		HookModule.run('after:ContextModule.pop', arguments, this)
		return ret
	}
	/** Returns the object under the given label from the context.
	 * @param {string} label
	 * @param {{required: boolean}} options
	 * @param {boolean} options.required If set strictly to `true`, will throw a missingRequiredContext exception if the requested context-object stack is empty.
	 */
	static get(label, options) {
		HookModule.run('ContextModule.get', arguments, this)

		RasPG.debug.validate.type('ContextModule.label', label, 'string')
		RasPG.debug.validate.props('ContextModule.options', options, false, {
			required: 'boolean'
		})

		if (label in this.#context)
			return this.#context[label].at(0)
		else if (options?.required === true)
			throw RasPG.debug.exceptions.missingRequiredContext(label)
		else
			return undefined
	}
	/** Registers a gatherer. Gatherers attempt to automatically gather context from objects passed to the `gatherFrom()` method.
	 * @param {string} name Convention: should reflect the label returned by the gatherer, for ease of skipping.
	 * @param {{appliesTo: (any) => boolean, callback: (any) => {[label: string]: object}}} gatherer
	 * @param {(any) => boolean} gatherer.appliesTo A filter that dictates what objects the gatherer should apply to.
	 * @param {(any) => {[label: string]: object}} gatherer.callback Actual gatherer function. Must return a pushable object.
	 */
	static registerGatherer(name, gatherer) {
		HookModule.run('before:ContextModule.registerGatherer', arguments, this)

		RasPG.debug.validate.type('ContextModule.registerGatherer.name', name, 'string')
		RasPG.debug.validate.props('ContextModule.registerGatherer.gatherer', gatherer, {
			appliesTo: ['function', '(any) => boolean'],
			callback: ['function', '(any) => {[label: string]: object}']
		})

		this.#gatherers.set(name, gatherer)

		HookModule.run('after:ContextModule.registerGatherer', arguments, this)
	}
	/** Gathers context from the object using applicable gatherers (skipping gatherers with name contained in `options.skip`, if passed), and pushes to the context stack. Returns an array containing the labels of context objects found and pushed, for popping afterwards.
	 * @param {any} object
	 * @param {{skip: string[]}} options
	 */
	static gatherFrom(object, options) {
		HookModule.run('before:ContextModule.gatherFrom', arguments, this)

		RasPG.debug.validate.props('ContextModule.gatherFrom.options', options, false, {
			skip: 'string[]'
		})

		const gatheredContext = {}
		for (const [name, gatherer] of this.#gatherers.entries())
			if (options?.skip && options.skip.includes(name))
				continue
			else if (gatherer.appliesTo(object))
				Object.assign(gatheredContext, gatherer.callback(object))
		this.push(gatheredContext)

		HookModule.run('after:ContextModule.gatherFrom', arguments, this)
		return Array.from(Object.keys(gatheredContext))
	}
} RasPG.registerModule('ContextModule', ContextModule)

//# Classes
/**
 * @class GameObject
 * @classdesc Game object.
 *
 * @prop {Stateful} _states
 * @prop {Stringful} _strings
 * @prop {Perceptible} _perceptions
 * @prop {Tangible} _location
 * @prop {Countable} _count
 * @prop {Containing} _container
 * @prop {Actionable} _actions
 * @prop {Agentive} _acts
 */
class GameObject {
	static #all = new Map()
	static serializer = function(object) {
		const data = {
			id: object.id,
			tags: Array.from(object.tags),
			components: {}
		}
		for (const [name, instance] of object._components.entries())
			data.components[name] = instance.serialize()
		return data
	}
	static deserializer = function(data) {
		const object = new GameObject(data.id, { tags: data.tags })
		for (const [name, data] of Object.entries(data.components)) {
			const component = RasPG.runtime.components.get(name)
			if (!component)
				throw RasPG.debug.exceptions.deserializerMissingComponent()
			const instance = component.deserializer(data)
			object.addComponent(instance)
		}
	}
	#id
	#tags = new Set()
	_components = new Map()

	/**
	 * @param {string} id Convention: all lowercase, no spaces.
	 * @param {{tags?: string[], components?: Array<typeof Component | Component | string>, watchProperties?: boolean}} [options]
	 */
	constructor(id, options) {
		HookModule.run('before:GameObject.constructor', arguments, this)

		RasPG.debug.validate.type('GameObject.constructor.id', id, 'string')
		RasPG.debug.validate.props('GameObject.constructor.options', options, false, {
			tags: 'string[]',
			components: ['Array<object | function | string>', 'Array<typeof Component | Component | string>'],
			watchProperties: 'boolean'
		})
		if (GameObject.#all.has(id))
			throw RasPG.debug.exceptions.objectIDConflict(id)

		this.#id = id
		if (options?.tags)
			for (const tag of options.tags)
				this.tag(tag)
		if (options?.components)
			this.addComponents(...options.components)
		if (options?.watchProperties) {
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
		return this.#id
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

		if (typeof(id) === 'object' && id instanceof this)
			object = id
		else if (typeof(id) === 'string') {
			object = this.find(id)
			if (!object) {
				if (options?.silent !== true)
					RasPG.debug.logs.gameObjectNotFound(id)
				return null
			}
		}

		if (!object)
			throw RasPG.debug.exceptions.notGameObject()

		if (options?.proto && typeof(options.proto) === 'function' && options.proto.isPrototypeOf(object))
			if (options?.silent !== true)
				return RasPG.debug.logs.incorrectPrototype(id, options.proto.name)
			else return false
		if (options?.components)
			for (const component of options.components)
				if (!object.hasComponent(component))
					if (options.silent !== true)
						return RasPG.debug.logs.missingRequiredComponentForOperation(object.id, component.name, options.operation || 'resolve')
					else return false
		if (options?.component &&!object.hasComponent(options.component))
			if (options?.silent !== true)
				return RasPG.debug.logs.missingRequiredComponentForOperation(object.id, options.component.name, options.operation || 'resolve')
			else return false

		return object
	}
	/** Adds the given component to the object. Returns `true`, if successful, `null`, if the component was not found, and `false`, if the component was already present (no-op).
	 * @param {typeof Component | Component | string} component Either the component subclass itself, an instance of the wanted component subclass, or its name.
	 */
	addComponent(component) {
		HookModule.run('before:GameObject.instance.addComponent', arguments, this)

		let instance
		if (typeof component === 'object' && Component.isPrototypeOf(component.constructor))
			instance = component
		else {
			const actualComponent = Component.resolve(component)
			if (!actualComponent)
				return actualComponent
			else
				instance = new actualComponent()
		}
		if (this.hasComponent(instance.constructor))
			return false

		if (instance.constructor.requires.length)
			for (const requirement of instance.constructor.requires)
				this.addComponent(requirement)
		this._components.set(instance.constructor.name, instance)
		instance.parent = this

		if (instance.constructor.reference)
			this[instance.constructor.reference] = instance

		HookModule.run('after:GameObject.instance.addComponent', arguments, this)
	}
	/** Adds the given components to the object. Returns `false`, if all components were already present (no-op), and `true`, otherwise.
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
	 * @param {typeof Component | Component | string} component Either the component subclass itself, an instance of the wanted component subclass, or a string to be resolved to the component subclass.
	 */
	component(component) {
		HookModule.run('GameObject.instance.component', arguments, this)

		let actualComponent = Component.resolve(component)
		if (!actualComponent)
			throw RasPG.debug.exceptions.notComponent()

		return this._components.get(actualComponent.constructor.name) || null
	}
	/** Returns whether or not the object has the given component or not.
	 * @param {typeof Component | Component | string} component Either the component subclass itself, or an instance of the wanted component subclass.
	 */
	hasComponent(component) {
		HookModule.run('GameObject.instance.hasComponent', arguments, this)

		let actualComponent = Component.resolve(component)
		if (!actualComponent)
			throw RasPG.debug.exceptions.notComponent()

		return this._components.has(actualComponent.prototype.constructor.name)
	}
	/** Adds a tag to the object. Returns `true`, if the tag wasn't present, or `false`, if it already was (no-op).
	 * @param {string} tag Convention: all caps, past tense.
	 */
	tag(tag) {
		HookModule.run('before:GameObject.instance.tag', arguments, this)

		RasPG.debug.validate.type('GameObject.instance.tag.tag', tag, 'string')
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

		RasPG.debug.validate.type('GameObject.instance.untag.tag', tag, 'string')
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

		RasPG.debug.validate.type('GameObject.instance.isTagged.tag', tag, 'string')

		return (this.#tags.has(tag))
	}
	/** Uses the GameObject's `serializer` function to compile the object and all its components into the form of a JSON-compatible object, returning it. */
	serialize() {
		return this.constructor.serializer(this)
	}
}
class Component {
	static reference
	static requires = []
	static serializer
	static deserializer
	parent

	/** Attempts to resolve a string to a Component subclass. Passes it back if first parameter is already one.
	 * @param {string | typeof Component | Component} component
	 */
	static resolve(component) {
		HookModule.run('Component.resolve', arguments, this)

		if (typeof(component) === 'function' && this.isPrototypeOf(component))
			return component
		if (typeof(component) === 'string' && this.isPrototypeOf(RasPG.runtime.components.get(component)))
			return RasPG.runtime.components.get(component)
		if (typeof(component) === 'object' && (component instanceof this))
			return component.constructor

		throw RasPG.debug.exceptions.notComponent()
	}
	/** Uses the component subclass' `serializer` function to compile the component instance's data in the form of a JSON-compatible object. */
	serialize() {
		if (!this.constructor.serializer)
			return RasPG.debug.logs.componentMissingSerialization(this.constructor.name)
		return this.constructor.serializer(this)
	}
}

//# Components
class Stateful extends Component {
	static reference = '_states'
	static serializer = function(instance) {
		return instance.data
	}
	static deserializer = function(data) {
		const instance = new Stateful()
		instance.define(data)
		return instance
	}
	#data = {}

	get data() {
		if (RasPG.runtime.state.inner == 'serializing')
			return this.#data
		new structuredClone(this.#data)
	}

	/** Gets the value correlated with the given variable name.
	 * @param {string} variable Convention: no spaces, camelCase.
	 */
	get(variable) {
		HookModule.run('Stateful.instance.get', arguments, this)

		RasPG.debug.validate.type('Stateful.instance.get.variable', variable, 'string')
		if (!(variable in this.#data))
			return RasPG.debug.logs.elementNotRegisteredInCollection(variable, 'Stateful.instance.data')

		return this.#data[variable]
	}
	/** Sets the value correlated with the given variable name. Returns `true`, if successful, and `false`, if the variable does not exist.
	 * @param {string} variable Convention: no spaces, camelCase.
	 * @param {boolean | number | undefined} value
	 */
	set(variable, value) {
		HookModule.run('before:Stateful.instance.set', arguments, this)

		RasPG.debug.validate.types('Stateful.instance.set', {
			variable: [variable, 'string'],
			value: [value, 'number | boolean | undefined'],
		})
		if (!(variable in this.#data))
			return RasPG.debug.logs.elementNotRegisteredInCollection(variable, 'Stateful.instance.data')

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
	 * @param {boolean | number | undefined} value
	 */
	create(variable, initialValue) {
		HookModule.run('before:Stateful.instance.create', arguments, this)

		RasPG.debug.validate.types('Stateful.instance.create', {
			variable: [variable, 'string'],
			initialValue: [initialValue, 'number | boolean | undefined'],
		})
		if (variable in this.#data)
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
	/** Defines (creates/sets) variables in bulk. Returns the component instance back for further operations.
	 * @param {{overwrite?: boolean, [variable: string]: boolean | number | undefined}} options 
	 */
	define(options) {
		HookModule.run('before:Stateful.instance.define', arguments, this)

		for (const [variable, initialValue] of Object.entries(options))
			if (!this.create(variable, initialValue) && options.overwrite === true)
				this.set(variable, initialValue)

		HookModule.run('after:Stateful.instance.define', arguments, this)
		return this
	}
}  RasPG.registerComponent('Stateful', Stateful)
class Stringful extends Component {
	static reference = '_strings'
	static serializer = function(instance) {
		return {
			strings: Array.from(instance.strings)
				.map(e => {
					if (typeof(e) === 'function')
						if (RasPG.config.serializeFunctions)
							return 'SERIALIZED_FUNCTION:' + e.toString()
						else
							return 'SKIP'
					else return e
				})
		}
	}
	static deserializer = function(data) {
		const instance = new Stringful()
		for (const [key, string] of data)
			if (string.startsWith('SERIALIZED_FUNCTION:'))
				instance.set(key, eval(string.slice(20)))
			else if (string !== 'SKIP')
				instance.set(key, string)
		return instance
	}
	#strings = new Map()

	get strings() {
		if (RasPG.runtime.state.inner == 'serializing')
			return this.#strings
		return new Map(this.#strings)
	}

	static nounToList
	/** Gets the string correlated with the given key.
	 * @param {string} key Convention: dot-separated domains, no spaces, camelCase ('en.action.jumpOn.successful')
	 */
	get(key) {
		HookModule.run('Stringful.instance.get', arguments, this)

		RasPG.debug.validate.type('Stringful.instance.get.key', key, 'string')

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

		RasPG.debug.validate.types('Stringful.instance.set', {
			key: [key, 'string'],
			string: [string, ['string | function', 'string | () => string']],
		})

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
	/** Defines variables in bulk. Returns the component instance back for further operations.
	 * @param {{[key: string]: string | () => string}} options 
	 */
	define(options) {
		HookModule.run('before:Stringful.instance.define', arguments, this)

		for (const [key, string] of Object.entries(options))
			this.set(key, string)

		HookModule.run('after:Stringful.instance.define', arguments, this)
		return this
	}
}  RasPG.registerComponent('Stringful', Stringful)
class Perceptible extends Component {
	static reference = '_perceptions'
	static requires = [Stringful]
	static serializer = function(instance) {
		const data = {}
		for (const [sense, map] of instance.perceptions.entries()) {
			data[sense] = {}
			for (const [context, perception] of map.entries())
				if (typeof(perception) === 'function')
					if (RasPG.config.serializeFunctions)
						data[sense][context] = 'SERIALIZED_FUNCTION:' + perception.toString()
					else
						data[sense][context] = 'SKIP'
				else
					data[sense][context] = perception
		}
		return data
	}
	static deserializer = function(data) {
		const instance = new Perceptible()
		for (const sense in data)
			for (const context in data[sense])
				if (data[sense][context].startsWith('SERIALIZED_FUNCTION:'))
					data[sense][context] = eval(data[sense][context].slice(20))
				else if (data[sense][context] === 'SKIP')
					delete data[sense][context]
		instance.definePerceptions(data)
		return instance
	}
	#perceptions = new Map()

	get perceptions() {
		return new Map(this.#perceptions)
	}
	get name() {
		return this.parent._strings.get('sense.name')
	}
	get description() {
		return this.parent._strings.get('sense.description')
	}
	get withArticle() {
		return this.parent._strings.get('sense.withArticle')
			|| RasPG.utils.lang.en.withArticle(this.parent._strings.get('sense.name'))
	}
	get plural() {
		return this.parent._strings.get('sense.plural')
			|| RasPG.utils.lang.en.plural(this.parent._strings.get('sense.name'))
	}

	/** Sets the name and description for an object. Both can be string or string-returning functions. Returns the component instance back for further operations.
	 * @param {{ name: string | () => string, description: string | () => string, withArticle?: string | () => string, plural?: string | () => string}} options
	 * @param options.name Convention: no article, singular, all lowercase (unless proper name).
	 * @param options.description Convention: full sentence(s), first letter uppercase, full stop at the end.
	 * @param options.withArticle Optional. Convention: article, singular, all lowercase (unless proper name)
	 * @param options.plural Optional. Convention: no article, plural, all lowercase (unless proper name).
	 */
	describe(options) {
		HookModule.run('before:Perceptible.instance.describe', arguments, this)

		RasPG.debug.validate.props('Perceptible.instance.describe.options', options, {
			name: ['string | function', 'string | () => string'],
			description: ['string | function', 'string | () => string']
		}, {
			withArticle: ['string | function', 'string | () => string'],
			plural: ['string | function', 'string | () => string'],
		})

		this.parent._strings.set('sense.name', options.name)
		this.parent._strings.set('sense.description', options.description)
		if ('withArticle' in options)
			this.parent._strings.set('sense.withArticle', options.withArticle)
		if ('plural' in options)
			this.parent._strings.set('sense.plural', options.plural)

		EventModule.emit('perceptions.descriptions.set', {
			object: this.parent,
			name: options.name,
			description: options.description,
			withArticle: options.withArticle || undefined,
			plural: options.plural || undefined,
		})
		HookModule.run('after:Perceptible.instance.describe', arguments, this)
		return this
	}
	/** Add a description for a given sense, in a particular context (i.e. sight direct, smell inRoom). Returns `true`, if there was a perception set for the given sense and context and it was overwritten, and `false`, if there wasn't.
	 * @param {string} sense Convention: no spaces, camelCase.
	 * @param {PerceptionContext} context
	 * @param {string | PerceptionDescriptionFunction} description
	 */
	setPerception(sense, context, description) {
		HookModule.run('before:Perceptible.instance.setPerception', arguments, this)

		RasPG.debug.validate.types('Perceptible.instance.setPerception', {
			sense: [sense, 'string'],
			context: [context, 'string'],
			description: [description, ['string | function', 'string | (sensor, target) => string']]
		})

		if (!this.#perceptions.has(sense))
			this.#perceptions.set(sense, new Map())
		let existed = this.#perceptions.get(sense).has(context)
		this.#perceptions.get(sense).set(context, description)
		this.parent._strings.set(`sense.${sense}.${context}`, description)

		EventModule.emit(`perceptions.added`, { object: this.parent, sense, context })
		HookModule.run('after:Perceptible.instance.setPerception', arguments, this)
		return existed
	}
	/** Defines perceptions to senses and contexts in bulk. Returns the component instance back for further operations.
	 * @param {{ [sense: string]: { [context: string]: string | PerceptionDescriptionFunction } }} options `sense` and `context` convention: no spaces, camelCase.
	 * @example
	 * gameObject._perceptions.definePerceptions({
	 *		sight: {
	 *			inContainer: 'a round pebble',
	 *			direct: "It is rounded and smooth, like it's been rolled along a riverbed for a long time."
	 *		},
	 *	})
	 */
	definePerceptions(options) {
		HookModule.run('before:Perceptible.instance.definePerceptions', arguments, this)

		for (const sense in options) {
			if (typeof(sense) !== 'string')
				throw RasPG.debug.exceptions.brokenEnforcedType('Perceptible.instance.definePerceptions.sense', 'string')
			for (const context in options[sense]) {
				if (typeof(context) !== 'string')
					throw RasPG.debug.exceptions.brokenEnforcedType('Perceptible.instance.definePerceptions.context', 'string')
				if (typeof(options[sense][context]) !== 'string' && typeof(options[sense][context]) !== 'function')
					throw RasPG.debug.exceptions.brokenEnforcedType('Perceptible.instance.definePerceptions.sense[context]', 'string | () => string')
				this.setPerception(sense, context, options[sense][context])
			}
		}

		HookModule.run('after:Perceptible.instance.definePerceptions', arguments, this)
		return this
	}
	/** Removes the perception from a given sense and context. Returns `true`, if successful, and `false`, if either the sense or context didn't exist.
	 * @param {string} sense Convention: no spaces, camelCase.
	 * @param {PerceptionContext} context
	 */
	removePerception(sense, context) {
		HookModule.run('before:Perceptible.instance.removePerception', arguments, this)

		RasPG.debug.validate.types('Perceptible.instance.removePerception', {
			sense: [sense, 'string'],
			context: [context, 'string'],
		})
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

		RasPG.debug.validate.types('Perceptible.instance.perceive', {
			sense: [sense, 'string'],
			context: [context, 'string'],
		})
		if (!this.#perceptions.has(sense))
			return null
		if (!(sensor instanceof GameObject))
			throw RasPG.debug.exceptions.notGameObject()

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
}  RasPG.registerComponent('Perceptible', Perceptible)
class Tangible extends Component {
	static reference = '_location'
	static serializer = function(instance) {
		return {location: instance.location}
	}
	static deserializer = function(data) {
		const instance = new Tangible()
		instance.moveTo(data.location, false)
		return instance
	}
	#location

	get location() {
		if (RasPG.runtime.state.inner === 'serializing')
			return this.#location
		if (this.#location === undefined)
			return undefined
		return GameObject.resolve(this.#location)
	}

	/** Moves the object to a new location. Returns `true`, if successful, `null`, if the location is not found, or `false`, if an error occurred.
	 * @param {Room | GameObject | string} location
	 * @param {boolean} passOn INTERNAL USE: if anything but `false`, will call the current (if existent) container's `remove` method and new container's `add` method.
	 */
	moveTo(location, passOn) {
		HookModule.run('before:Tangible.instance.moveTo', arguments, this)

		location = GameObject.resolve(location, { component: Containing, operation: 'Tangible.instance.moveTo' })
		if (!location)
			return location

		const previous = this.#location
		if (passOn !== false)
			if (this.#location !== undefined)
				this.location?._container.remove(this.parent, false)
		this.#location = location.id
		if (passOn !== false)
			if (this.#location !== undefined)
				this.location?._container.add(this.parent, {passOn: false})

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

		return actualObject._location.location === this.location
	}
}  RasPG.registerComponent('Tangible', Tangible)
class Countable extends Component {
	static reference = '_count'
	static requires = [Tangible]
	static serializer = function(instance) {
		return {count: instance.count}
	}
	static deserializer = function(data) {
		const instance = new Countable()
		instance.add(data.count)
		return instance
	}
	#count = 0

	get count() {
		return this.#count
	}

	/** Sets the object's count. Rounds to closest integer
	 * @param {number} count
	 */
	set(count) {
		HookModule.run('before:Countable.instance.set', arguments, this)

		RasPG.debug.validate.type('Countable.instance.set.count', count, 'number')

		this.#count = count

		HookModule.run('after:Countable.instance.set', arguments, this)
	}
	/** Adds a given amount to the object's count. Rounds to closest integer.
	 * @param {number} amount
	 */
	add(amount) {
		HookModule.run('before:Countable.instance.add', arguments, this)

		RasPG.debug.validate.type('Countable.instance.set.amount', amount, 'number')

		this.#count += amount

		HookModule.run('after:Countable.instance.add', arguments, this)
	}
	/** Subtracts a given amount from the object's count. Rounds to closest integer.
	 * @param {number} amount
	 */
	subtract(amount) {
		HookModule.run('before:Countable.instance.subtract', arguments, this)

		RasPG.debug.validate.type('Countable.instance.set.amount', amount, 'number')

		this.#count -= amount

		HookModule.run('after:Countable.instance.subtract', arguments, this)
	}
}  RasPG.registerComponent('Countable', Countable)
class Containing extends Component {
	static reference = '_container'
	static requires = [Tangible]
	static serializer = function(instance) {
		const data = {contents: Array.from(instance.contents)}
		if (RasPG.config.serializeFunctions)
			data.filter = instance.filter.toString()
		return data
	}
	static deserializer = function(data) {
		const instance = new Containing()
		if (data.filter)
			instance.setFilter(eval(data.filter))
		for (const id of data.contents)
			instance.add(id)
		return instance
	}
	#contents = new Set()
	/** @type {(GameObject) => boolean} */
	#filter

	get contents() {
		if (RasPG.runtime.state.inner == 'serializing')
			return this.#contents
		return new Set(
			Array.from(this.#contents)
				.map(e => GameObject.resolve(e, { operation: 'Containing.instance.get.contents' }))
		)
	}
	get filter() {
		return this.#filter
	}

	/** Adds an object to the container. Returns `true`, if successful, `null`, if the object isn't found, and `false`, if the object was already present or is not allowed into the container.
	 * @param {GameObject | string} object
	 * @param {{ignoreFilter?: boolean, passOn?: boolean}} options
	 * @param {boolean} options.ignoreFilter If set to `true`, object will be added to container regardless of a present filter.
	 * @param {boolean} options.passOn INTERNAL USE: if anything but `false`, will call the current (if existent) container's `remove` method and new container's `add` method.
	 */
	add(object, options) {
		HookModule.run('before:Container.instance.add', arguments, this)

		const actualObject = GameObject.resolve(object, { component: Tangible, operation: 'Container.instance.add' })
		if (!actualObject)
			return actualObject
		if (this.has(actualObject))
			return false
		if (options?.ignoreFilter !== true && this.#filter && !this.#filter(actualObject))
			return false

		if (options?.passOn !== false)
			actualObject._location.moveTo(this.parent, false)
		this.#contents.add(actualObject.id)

		EventModule.emit('container.added', {
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

		const actualObject = GameObject.resolve(object, { component: Tangible, operation: 'Container.instance.remove' })

		if (!actualObject)
			return actualObject
		if (!this.has(actualObject))
			return false

		if (passOn !== false)
			actualObject._location.removeFromWorld(false)
		this.#contents.delete(actualObject.id)

		EventModule.emit('container.removed', {
			object: this.parent,
			item: actualObject
		})
		HookModule.run('after:Container.instance.remove', arguments, this)
		return true
	}
	/** Sets a filter function that dictates what kinds of GameObjects the container allows.
	 * @param {(GameObject) => boolean} predicate
	 */
	setFilter(predicate) {
		HookModule.run('before:Containing.instance.setFilter', arguments, this)

		RasPG.debug.validate.type('Containing.instance.setFilter.predicate', predicate, ['function', '(GameObject) => boolean'])

		this.#filter = predicate

		HookModule.run('after:Containing.instance.setFilter', arguments, this)
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
}  RasPG.registerComponent('Containing', Containing)
class Actionable extends Component {
	static reference = '_actions'
	static requires = [Tangible]
	static serializer = function(instance) {
		return {actions: Array.from(instance.actions)}
	}
	static deserializer = function(data) {
		const instance = new Actionable()
		instance.agentsCan(data.actions)
		return instance
	}
	static #allActions = new Map()
	static #disabledActions = new Set()
	#actions = new Set()

	static get actions() {
		if (RasPG.runtime.state.inner == 'serializing')
			return this.#allActions
		return new Map(
			Array.from(this.#allActions)
				.filter(([key, _]) => !this.#disabledActions.has(key))
		)
	}
	get actions() {
		if (RasPG.runtime.state.inner == 'serializing')
			return this.#actions
		return new Set([...this.#actions].filter(action => !Actionable.#disabledActions.has(action)))
	}

	/** Registers an action object into the component's registry. The object is comprised of a callback (representing the action itself), and, optionally, a predicate (representing requirements for the action to be performed).
	 * @param {string} name Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 * @param {{callback: (agent?: GameObject) => (void | string), predicate?: (agent?: GameObject) => boolean}} actionObject
	 */
	static registerAction(name, actionObject) {
		HookModule.run('before:Actionable.registerAction', arguments, this)

		RasPG.debug.validate.type('Actionable.registerAction.name', name, 'string')
		RasPG.debug.validate.props('Actionable.registerAction.actionObject', actionObject,
			{ callback: ['function', '(agent?: GameObject) => (void | string)'] },
			{ predicate: ['function', '(agent?: GameObject) => boolean'] }
		)
		if (this.isAction(name))
			throw RasPG.debug.exceptions.generalIDConflict('Actionable.#actions', name)

		this.#allActions.set(name, {
			predicate: actionObject.predicate || undefined,
			callback: actionObject.callback
		})

		HookModule.run('after:Actionable.registerAction', arguments, this)
	}
	/** Registers action objects in to the component's registry in bulk. Each object is comprised of a callback (representing the action itself), and, optionally, a predicate (representing requirements for the action to be performed). Returns the component instance back for further operations.
	 * @param {{[name: string]: {callback: (agent: GameObject) => (void | string), predicate?: (agent: GameObject) => boolean}}} options 
	 */
	static defineActions(options) {
		HookModule.run('before:Actionable.defineActions', arguments, this)

		for (const [name, actionObject] in Object.entries(options))
			this.registerAction(name, actionObject)

		HookModule.run('after:Actionable.defineActions', arguments, this)
		return this
	}
	/** Returns whether the given action name is registered as an action in the component's registry, and not currently disabled.
	 * @param {string} action Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 * @param {{enabledOnly?: boolean}} options Only `enabledOnly`: `true` by default; if `false`, will check regardless of disabled actions.
	 */
	static isAction(action, options) {
		HookModule.run('Actionable.isAction', arguments, this)

		RasPG.debug.validate.type('Actionable.isAction.action', action, 'string')
		RasPG.debug.validate.props('Actionable.isAction.options', options, false, { enabledOnly: 'boolean' })

		if (options?.enabledOnly === false)
			return this.#allActions.has(action)
		return this.actions.has(action)
	}
	/** Completely disables (or all in the array) the given action system-wide. Returns `true`, if successful, and `false`, if an error occurred.
	 * @param {string | string[]} action
	 */
	static disable(action) {
		HookModule.run('before:Actionable.disable', arguments, this)

		RasPG.debug.validate.type('Actionable.disable.action', action, 'string | string[]')

		let ret = true
		if (typeof(action) === 'string')
			if (!Actionable.isAction(action))
				return RasPG.debug.logs.elementNotRegisteredInCollection(action, 'Actionable.#actions')
			else
				this.#disabledActions.add(action)
		else if (action instanceof Array)
			for (const name of action)
				if (!Actionable.isAction(name))
					ret = RasPG.debug.logs.elementNotRegisteredInCollection(name, 'Actionable.#actions')
				else
					this.#disabledActions.add(name)

		HookModule.run('after:Actionable.disable', arguments, this)
		return ret
	}
	/** Enables the given action (or all in the array) system-wide. Returns `true`, if successful, and `false`, if an error occurred.
	 * @param {string | string[]} action
	 */
	static enable(action) {
		HookModule.run('before:Actionable.enable', arguments, this)

		RasPG.debug.validate.type('Actionable.enable.action', action, 'string | string[]')

		let ret = true
		if (typeof(action) === 'string')
			if (!Actionable.isAction(action))
				return RasPG.debug.logs.elementNotRegisteredInCollection(action, 'Actionable.#actions')
			else if (!Actionable.#disabledActions.has(action))
				return RasPG.debug.logs.elementNotRegisteredInCollection(action, 'Actionable.#disabledActions')
			else
				this.#disabledActions.delete(action)
		else if (action instanceof Array)
			for (const name of action)
				if (!Actionable.isAction(name))
					ret = RasPG.debug.logs.elementNotRegisteredInCollection(name, 'Actionable.#actions')
				else if (!Actionable.#disabledActions.has(name))
					return RasPG.debug.logs.elementNotRegisteredInCollection(name, 'Actionable.#disabledActions')
				else
					this.#disabledActions.delete(name)

		HookModule.run('after:Actionable.enable', arguments, this)
		return ret
	}
	/** Adds the action name (or all in the array) to the object's allowed actions. Returns `true`, if successful, or `false`, if (at least one) error occurs.
	 * @param {string | string[]} action Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 */
	agentsCan(action) {
		HookModule.run('before:Actionable.instance.agentsCan', arguments, this)

		RasPG.debug.validate.type('Actionable.instance.agentsCan.action', action, ['string | string[]'])

		let ret = true
		if (typeof(action) === 'string')
			if (!Actionable.isAction(action))
				return RasPG.debug.logs.elementNotRegisteredInCollection(action, 'Actionable.#actions')
			else {
				this.#actions.add(action)
				EventModule.emit('actions.added', { object: this.parent, action })
			}
		else if (action instanceof Array)
			for (const name of action)
				if (!Actionable.isAction(action))
					ret = RasPG.debug.logs.elementNotRegisteredInCollection(name, 'Actionable.#actions')
				else {
					this.#actions.add(name)
					EventModule.emit('actions.added', { object: this.parent, action: name })
				}

		HookModule.run('after:Actionable.instance.agentsCan', arguments, this)
		return ret
	}
	/** Removes the action name (or all in the array) from the object's allowed actions. Returns `true`, if action(s) were present and removed, or `false`, if (at least one) already wasn't.
	 * @param {string | string[]} action Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 */
	agentsCannot(action) {
		HookModule.run('before:Actionable.instance.agentsCannot', arguments, this)

		RasPG.debug.validate.type('Actionable.instance.agentsCannot.action', action, ['string | string[]'])

		let ret = true
		if (typeof(action) === 'string')
			if (!Actionable.isAction(action))
				return RasPG.debug.logs.elementNotRegisteredInCollection(action, 'Actionable.#actions')
			else {
				this.#actions.delete(action)
				EventModule.emit('actions.removed', { object: this.parent, action })
			}
		else if (action instanceof Array)
			for (const name of action)
				if (!Actionable.isAction(action))
					ret = RasPG.debug.logs.elementNotRegisteredInCollection(name, 'Actionable.#actions')
				else {
					this.#actions.delete(name)
					EventModule.emit('actions.removed', { object: this.parent, action: name })
				}

		HookModule.run('after:Actionable.instance.agentsCannot', arguments, this)
		return ret
	}
}  RasPG.registerComponent('Actionable', Actionable)
class Agentive extends Component {
	static reference = '_acts'
	static serializer = function(instance) {
		return {acts: Array.from(instance.acts)}
	}
	static deserializer = function(data) {
		const instance = new Agentive()
		instance.can(data.acts)
		return instance
	}
	static #allActs = new Map()
	static #disabledActs = new Set()
	#acts = new Set()

	static get acts() {
		if (RasPG.runtime.state.inner == 'serializing')
			return this.#allActs
		return new Map(
			Array.from(this.#allActs)
				.filter(([key, _]) => !this.#disabledActs.has(key))
		)
	}
	get acts() {
		if (RasPG.runtime.state.inner == 'serializing')
			return this.#acts
		return new Set([...this.#acts].filter(act => !Agentive.#disabledActs.has(act)))
	}

	/** Registers an Act object into the component's registry. The object is comprised of a callback (representing the act itself), and, optionally, a predicate (representing requirements for the act to be performed).
	 * @param {string} name Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 * @param {{callback: (target?: GameObject) => (void | string), predicate?: (target?: GameObject) => boolean}} actObject
	 */
	static registerAct(name, actObject) {
		HookModule.run('before:Agentive.registerAct', arguments, this)

		RasPG.debug.validate.type('Agentive.registerAct.name', name, 'string')
		RasPG.debug.validate.props('Agentive.registerAct.actObject', actObject,
			{ callback: ['function', '(target?: GameObject) => (void | string)'] },
			{ predicate: ['function', '(target?: GameObject) => boolean'] }
		)
		if (this.isAct(name))
			throw RasPG.debug.exceptions.generalIDConflict('Agentive.#acts', name)

		this.#allActs.set(name, {
			predicate: actObject.predicate || undefined,
			callback: actObject.callback
		})

		HookModule.run('after:Agentive.registerAct', arguments, this)
	}
	/** Registers act objects in to the component's registry in bulk. Each object is comprised of a callback (representing the act itself), and, optionally, a predicate (representing requirements for the act to be performed). Returns the component instance back for further operations.
	 * @param {{[name: string]: {callback: (agent: GameObject) => (void | string), predicate?: (agent: GameObject) => boolean}}} options 
	 */
	static defineActs(options) {
		HookModule.run('before:Agentive.defineActs', arguments, this)

		for (const [name, actObject] in Object.entries(options))
			this.registerAct(name, actObject)

		HookModule.run('after:Agentive.defineActs', arguments, this)
		return this
	}
	/** Returns whether the given act name is registered as an act in the component's registry, and not currently disabled.
	 * @param {string} act Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 * @param {{enabledOnly: boolean}} options Only `enabledOnly`: `true` by default; if `false`, will check regardless of disabled actions.
	 */
	static isAct(act, options) {
		HookModule.run('Agentive.isAct', arguments, this)

		RasPG.debug.validate.type('Agentive.isAct.act', act, 'string')
		RasPG.debug.validate.props('Agentive.isAct.options', options, false, { enabledOnly: 'boolean' })

		if (options?.enabledOnly === false)
			return this.#allActs.has(act)
		return this.acts.has(act)
	}
	/** Completely disables the given act (or all in the array) system-wide. Returns `true`, if successful, and `false`, if an error occurred.
	 * @param {string | string[]} act
	 */
	static disable(act) {
		HookModule.run('before:Agentive.disable', arguments, this)

		RasPG.debug.validate.type('Agentive.disable.act', act, 'string | string[]')

		let ret = true
		if (typeof(act) === 'string')
			if (!Agentive.isAct(act))
				return RasPG.debug.logs.elementNotRegisteredInCollection(act, 'Agentive.#acts')
			else
				this.#disabledActs.add(act)
		else if (act instanceof Array)
			for (const name of act)
				if (!Agentive.isAct(name))
					ret = RasPG.debug.logs.elementNotRegisteredInCollection(name, 'Agentive.#acts')
				else
					this.#disabledActs.add(name)

		HookModule.run('after:Agentive.disable', arguments, this)
		return ret
	}
	/** Reenables the given act (or all in the array) system-wide. Returns `true`, if successful, and `false`, if an error occurred.
	 * @param {string | string[]} act
	 */
	static enable(act) {
		HookModule.run('before:Agentive.enable', arguments, this)

		RasPG.debug.validate.type('Agentive.enable.act', act, 'string | string[]')

		let ret = true
		if (typeof(act) === 'string')
			if (!Agentive.isAct(act))
				return RasPG.debug.logs.elementNotRegisteredInCollection(act, 'Agentive.#acts')
			else if (!Agentive.#disabledActs.has(act))
				return RasPG.debug.logs.elementNotRegisteredInCollection(act, 'Agentive.#disabledActs')
			else
				this.#disabledActs.delete(act)
		else if (act instanceof Array)
			for (const name of act)
				if (!Agentive.isAct(name))
					ret = RasPG.debug.logs.elementNotRegisteredInCollection(name, 'Agentive.#acts')
				else if (!Agentive.#disabledActs.has(name))
					return RasPG.debug.logs.elementNotRegisteredInCollection(name, 'Agentive.#disabledActs')
				else
					this.#disabledActs.delete(name)

		HookModule.run('after:Agentive.enable', arguments, this)
		return ret
	}
	/** Adds the act name (or all in the array) to the object's allowed acts. Returns `true`, if successful, or `false`, if (at least one) error occurs.
	 * @param {string | Array<string>} act Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 */
	can(act) {
		HookModule.run('before:Agentive.instance.can', arguments, this)

		RasPG.debug.validate.type('Agentive.instance.can.act', act, ['string | string[]'])

		let ret = true
		if (typeof(act) === 'string')
			if (!Agentive.isAct(act))
				return RasPG.debug.logs.elementNotRegisteredInCollection(act, 'Agentive.#acts')
			else {
				this.#acts.add(act)
				EventModule.emit('acts.added', { object: this.parent, act })
			}
		else if (act instanceof Array)
			for (const name of act)
				if (!Agentive.isAct(act))
					ret = RasPG.debug.logs.elementNotRegisteredInCollection(name, 'Agentive.#acts')
				else {
					this.#acts.add(name)
					EventModule.emit('acts.added', { object: this.parent, act: name })
				}

		HookModule.run('after:Agentive.instance.can', arguments, this)
		return ret
	}
	/** Removes the act name (or all in the array) from the object's allowed acts. Returns `true`, if act(s) were present and removed, or `false`, if (at least one) already wasn't.
	 * @param {string | Array<string>} act Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 */
	cannot(act) {
		HookModule.run('before:Agentive.instance.cannot', arguments, this)

		RasPG.debug.validate.type('Agentive.instance.cannot.act', act, ['string | string[]'])

		let ret = true
		if (typeof(act) === 'string')
			if (!Agentive.isAct(act))
				return RasPG.debug.logs.elementNotRegisteredInCollection(act, 'Agentive.#acts')
			else {
				this.#acts.delete(act)
				EventModule.emit('acts.removed', { object: this.parent, act })
			}
		else if (act instanceof Array)
			for (const name of act)
				if (!Agentive.isAct(act))
					ret = RasPG.debug.logs.elementNotRegisteredInCollection(name, 'Agentive.#acts')
				else {
					this.#acts.delete(name)
					EventModule.emit('acts.removed', { object: this.parent, act: name })
				}

		HookModule.run('after:Agentive.instance.cannot', arguments, this)
		return ret
	}
}  RasPG.registerComponent('Agentive', Agentive)

const gameObject = new GameObject('pebble', {
	components: [Perceptible]
})
gameObject._perceptions.definePerceptions({
	sight: {
		inContainer: 'a round pebble',
		direct: "It is rounded and smooth, like it's been rolled along a riverbed for a long time."
	},
})

if (typeof module !== 'undefined')
	module.exports = {
		RasPG,
		GameObject,
		Component,

		EventModule,
		HookModule,

		Stateful,
		Stringful,
		Perceptible,
		Tangible,
		Countable,
		Containing,
		Actionable,
		Agentive,
	}