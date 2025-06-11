//# Typedefs
/** @typedef {{event: string, callback: EventCallback, owner: GameObject, once: boolean}} EventListener */
/** @typedef {(owner: GameObject, data: EventData) => void} EventCallback */
/** @typedef {{object: GameObject, property: string, previous: any, current: any}} EventData */
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
		defaultLocale: 'en',
		availableLocales: ['en'],
		locale: 'en',
		parameterTypeEnforcement: true,
		logWarnings: true,
		logErrors: true,
		serializeFunctions: false,
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
		},
		scheduling: {
			/**
			 * @param {function} fn
			 * @param {{inner?: 'initializing'|'running'|'serializing'|'templating'|'instantiating',[state: string]: string}} options
			 */
			stateNot(fn, options) {
				let ready = true
				for (const [state, values] of Object.entries(options))
					for (const value of values.split('|'))
						if (RasPG.runtime.state[state].get() === value.trim()) {
							ready = false
							break
						}
				if (ready)
					fn()
				else
					EventModule.on('state.**.changed', () => this.stateNot(fn, options), {once: true})
			},
			/**
			 * @param {function} fn
			 * @param {{inner?: 'initializing'|'running'|'serializing'|'templating'|'instantiating',[state: string]: string}} options
			 */
			state(fn, options) {
				let ready = false
				for (const [state, values] of Object.entries(options))
					for (const value of values.split('|'))
						if (RasPG.runtime.state[state].get() === value.trim()) {
							ready = true
							break
						}
				if (ready)
					fn()
				else
					EventModule.on('state.**.changed', () => this.state(fn, options), {once: true})
			}
		},
		constructors: {
			/**
			 * @param {any} initialValue
			 * @param {{onPush?: Function, onPop?: Function, onGet?: Function}} callbacks 
			 */
			valueStack(initialValue, callbacks) {
				const stack = [initialValue]

				return {
					push(val) {
						stack.unshift(val)
						if (callbacks.onPush) 
							callbacks.onPush(val, stack)
					},
					pop() {
						const val = stack.shift()
						if (callbacks.onPop) 
							callbacks.onPop(val, stack)
						return val
					},
					get() {
						const val = stack.at(0) || undefined
						if (callbacks.onGet) 
							callbacks.onGet(val, stack)
						return val
					},
					callbacks
				}
			}
		}
	}
	static runtime = {
		state: {
			/** @type {{
			 * push: (val: 'initializing'|'running'|'serializing'|'templating'|'instantiating') => void,
			 * get : () => 'initializing'|'running'|'serializing'|'templating'|'instantiating',
			 * pop : () => 'initializing'|'running'|'serializing'|'templating'|'instantiating'
			 * }} */
			inner: this.utils.constructors.valueStack('initializing', {
					onPush: () => {EventModule.emit('state.inner.changed'); EventModule.emit('state.inner.pushed')},
					onPop: () => {EventModule.emit('state.inner.changed'); EventModule.emit('state.inner.popped')}
				}),
		},
		turn: {
			counter: 0,
			queued: new Map(),
			/** Schedules a function to be called after a number of turns, with many parameters.
			 * @param {Function} callback
			 * @param {{delay: number, on?: 'zero' | 'tick', phase?: string|'preparation'|'before'|'intent'|'after'|'cleanup', predicate?: () => boolean, repeat?: number}} options
			 * @param {number} options.delay Required. Amount of turns to pass before the function is called.
			 * @param {'zero' | 'tick'} [options.on] Defaults to 'zero'. Whether the function should be called at the end of the delay, or at every tick down.
			 * @param {string|'preparation'|'before'|'intent'|'after'|'cleanup'} [options.phase] Defaults to 'before'. During what phase of turn resolution the function should be called. The framework's default turn resolution phases are listed.
			 * @param {() => boolean} [options.predicate] Optional. Function defining necessary conditions for the function to be called. If not met, if on zero, delays call by a turn; if on tick, it simply isn't called that turn.
			 * @param {number} [options.repeat] Defaults to 0. How many times the function should be re-queued after delay. Ignored if `options.on` is 'tick'.
			 */
			schedule(callback, options) {
				HookModule.run('before:Turn.schedule', arguments, this)

				RasPG.dev.validate.type('Turn.schedule.callback', callback, 'function')
				RasPG.dev.validate.props('Turn.schedule.options', options, { delay: 'number' }, {
					on: "'zero' | 'tick'",
					phase: 'string',
					predicate: ['function', '() => boolean'],
					repeat: 'number'
				})

				const scheduleTurn = this.counter + options.delay
				const queueKey = `${(('on' in options) && options.on === 'tick')? 'tick' : scheduleTurn}:${options.phase || 'before'}`
				const queue = this.queued.get(queueKey)?? this.queued.set(queueKey, [])
				if (('on' in options) && options.on === 'tick')
					queue.push({
						callback,
						end: scheduleTurn,
						predicate: options.predicate || undefined
					})
				else {
					queue.push({
						callback,
						delay: options.delay,
						predicate: options.predicate || undefined,
						repeat: options.repeat || 0
					})
				}

				HookModule.run('after:Turn.schedule', arguments, this)
			},
			/** Runs scheduled function calls according to the key and phase, then removes them from the queue. Re-schedules repeat functions, and delays functions with false-returning predicates, if necessary.
			 * @param {number | 'tick'} key Turn or 'tick'.
			 * @param {string|'preparation'|'before'|'intent'|'after'|'cleanup'} phase Turn resolution phase.
			 */
			runScheduled(key, phase) {
				HookModule.run('before:Turn.runScheduled', arguments, this)

				RasPG.dev.validate.types('Turn.runScheduled', {
					key: [key, "number | 'tick'"],
					phase: [phase, 'string']
				})

				const queue = this.queued.get(`${key}:${phase}`)
				if (!queue)
					return
				for (const item of Array.from(queue)) {
					if (predicate === undefined || predicate())
						item.callback()
					else if (key !== 'tick')
						this.queued.get(`${+key + 1}:${phase}`).push(item)
					if (key === 'tick') {
						if (item.end === this.counter)
							queue.splice(queue.indexOf(item), 1)
					} else {
						if (item.repeat > 0) {
							item.repeat -= 1
							this.schedule(item.callback, Object.assign({on: 'zero', phase}, item))
						} else
							queue.splice(queue.indexOf(item), 1)
					}
				}

				HookModule.run('after:Turn.runScheduled', arguments, this)
			},
			pipeline: {
				/** @type {{name: string, run: Function, appended: {callback: Function, once: boolean}[]}[]} */
				phases: [],
				/** Registers a turn phase into the turn resolution pipeline. In `options`, if `before` is passed, `after` will be ignored - they are mutually exclusive.
				 *
				 * 'before:' and 'after:' hooks will be run around each phase during turn resolution.
				 * @param {string} name Convention: no spaces, camelCase.
				 * @param {Function} fn Function that performs the necessary operations.
				 * @param {{before?: string, after?: string}} options
				 * @param {{string}} [options.before] Existing turn phase before which it should be placed.
				 * @param {{string}} [options.after] Existing turn phase after which it should be placed.
				 */
				register(name, fn, options) {
					HookModule.run('before:Turn.pipeline.register', arguments, this)

					RasPG.dev.validate.props('Turn.pipeline.register.options', options, false, {
						before: 'string',
						after: 'string'
					})
					if (this.phases.some(p => p.name === name))
						throw RasPG.dev.exceptions.GeneralIDConflict('Turn.pipeline.phases', name)
					if (options.before && !this.phases.find(e => e.name === options.before))
						throw new Error(`[RasPG - Core] Turn phase "${options.before}" not found`
							+'\nMaybe typo, not registered, or wrong operation order')
					else if (options.after && !this.phases.find(e => e.name === options.after))
						throw new Error(`[RasPG - Core] Turn phase "${options.after}" not found`
							+'\nMaybe typo, not registered, or wrong operation order')

					this.phases.splice(index, 0, { name, run: fn, appended: [] })

					HookModule.run('after:Turn.pipeline.register', arguments, this)
				},
				/** Reorders turn phases in the pipeline to reflect the given array. Must contain all defined turn phases.
				 * @param {string[]} order
				 */
				reorder(order) {
					HookModule.run('before:Turn.pipeline.reorder', arguments, this)

					if (order.length !== this.phases.length || !order.every(name => !!this.phases.find(e => e.name === name)))
						throw new Error('[RasPG - Core] Attempted reordering of turn phase pipeline is incomplete or incorrect'
							+'\nMaybe type, forgot some, or wrong operation order')

					this.phases = order.map(name => this.phases.find(p => p.name === name))

					HookModule.run('after:Turn.pipeline.reorder', arguments, this)
				},
				/** Runs the given turn phase resolution, and any appended callbacks.
				 * @param {string} name
				 */
				run(name) {
					HookModule.run('before:Turn.pipeline.run', arguments, this)

					const phase = this.phases.find(e => e.name === name)
					if (!phase)
						return RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Turn.pipeline.phases')

					HookModule.run('before:Turn.phase:'+ name, arguments, this)
					phase.run()
					for (const appendix of Array.from(phase.appended)) {
						appendix.callback()
						if (appendix.once)
							phase.appended.splice(phase.appended.indexOf(appendix), 1)
					}
					HookModule.run('after:Turn.phase:'+ name, arguments, this)

					HookModule.run('after:Turn.pipeline.run', arguments, this)
				}
			},
			tick() {
				HookModule.run('before:Turn.tick', arguments, this)

				this.runScheduled('tick', 'before')
				this.runScheduled(this.counter, 'before')

				for (const phase of this.pipeline.phases)
					this.pipeline.run(phase.name)
 
				this.runScheduled(this.counter, 'after')
				this.runScheduled('tick', 'after')

				HookModule.run('after:Turn.tick', arguments, this)
			}
		},
		saveModule: undefined,
		modules: new Map(),
		classes: new Map(),
		components: new Map(),
		extensions: new Map(),
	}
	static dev = {
		exceptions: {
			NotGameObject: () => new TypeError('[RasPG][NotGameObject] Expected id or instance of GameObject or subclass'
				+'\nMaybe typo or wrong parameter passed'),
			NotComponent: () => new TypeError('[RasPG][NotComponent] Expected name, instance or prototype of Component or subclass'
				+'\nMaybe typo, wrong parameter passed, or from missing extension'),
			ObjectIDConflict: (objectID) => new Error(`[RasPG][ObjectIDConflict] Conflicting GameObject IDs: "${objectID}"`
				+'\nMaybe typo, double declaration, or forgot'),
			GeneralIDConflict: (domainPath, id) => new Error(`[RasPG][GeneralIDConflict] Conflicting IDs on "${domainPath}": "${id}"`
				+'\nMaybe typo, double declaration, or forgot'),
			BrokenTypeEnforcement: (param, type, expected) => new Error(`[RasPG][BrokenTypeEnforcement] Enforced parameter/property type broken: "${param}" is "${type}", expected "${expected}"`
				+'\nMaybe wrong parameter order, typo, or forgot to pass'),
			MissingParameter: (param) => new Error(`[RasPG][MissingParameter] Missing required parameter: "${param}"`
				+'\nMaybe typo or forgot to pass'),
			DeserializerMissingComponent: (component) => new Error(`[RasPG][DeserializerMissingComponent] Deserialization error: missing component "${component}"`
				+'\nMaybe typo, got renamed, or from missing extension'),
			MissingRequiredContext: (label) => new Error(`[RasPG][MissingRequiredContext] Missing required context: "${label}"`
				+'\nMaybe wrong label, pushed to wrong label, or forgot to push'),
			BrokenStringFormat: (string, format) => new Error(`[RasPG][BrokenStringFormat] String format broken: "${string}" must conform to "${format}"`
				+'\nMaybe typo, maybe forgot; often enforced for good reasons'),
			TemplateReferenceViolation: (domainPath, reference) => new Error(`[RasPG][TemplateReferenceViolation] Attempted operation "${domainPath}" during templating would incur exclusive relationship between static object and template instance`
				+'\nMaybe typo, maybe forgot; often enforced for good reasons'),
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
			componentReferenceCollision: (objectID, reference, componentPresent, componentAdded) => {
				if (RasPG.config.logWarnings)
					console.warn(`[RasPG][componentReferenceCollision] Component "${componentAdded}" attempted to add reference "${reference}"${objectID? ` to object "${objectID}"` : ''}, which component "${componentPresent}" shares${objectID? ', and will be overwritten' : ''}`
						+'\nLikely a conflict between extensions; consider manually changing one of the components\' reference, or using GameObject.instance.component(Component)')
				return false
			},
		},
		validate: {
			type(path, value, typeSpec) {
				if (!RasPG.config.parameterTypeEnforcement)
					return

				const [typeString, label] = Array.isArray(typeSpec) ? typeSpec : [typeSpec, typeSpec]
				const acceptedTypes = splitOrs(typeString)
				const isValid = acceptedTypes.some(type => checker(value, type))

				if (!isValid)
					throw RasPG.dev.exceptions.BrokenTypeEnforcement(`${path}.${value}`, typeof value, label)
				return true

				function checker(val, typeStr) {
					typeStr = typeStr.trim()
					if (typeStr.endsWith('[]'))
						typeStr = `Array<${typeStr.slice(0, -2)}>`
					const arrayMatch = typeStr.match(/^Array<(.+)>$/)
					if (arrayMatch) {
						if (!Array.isArray(val))
							return false
						const innerTypes = splitOrs(arrayMatch[1])
						return val.every(el => innerTypes.some(inner => checker(el, inner)))
					}
					switch(typeStr) {
						case 'RegExp':
							return val instanceof RegExp
						case 'GameObject':
							return val instanceof GameObject
						default:
							if (typeStr.match(/(['"])([^'"\n]+)\1/))
								return (typeof val === 'string' && val === typeStr.match(/(['"])([^'"\n]+)\1/)[2])
							return typeof val === typeStr
					}
				}
				function splitOrs(typeStr) {
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
				if (typeof object !== 'object')
					if (RasPG.config.parameterTypeEnforcement)
						throw RasPG.dev.exceptions.BrokenTypeEnforcement(path.match(/[^\.]+$/), typeof object, 'object')
					else return false
				for (const [prop, typeSpec] of Object.entries(required)) {
					if (!(prop in object))
						throw RasPG.dev.exceptions.MissingParameter(prop)
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
		},
		/** Returns the ID in the collection that matches the query, according to its prefix. `collection` can be Set or Map, if `.find()` mutations are present.
		 *
		 * 'instance:' searches for instance of templated object by ID.
		 *
		 * 'template:' searches for instance of templated object by template name.
		 * @param {string} query
		 * @param {string[]} collection
		 */
		resolveSoftsearch(query, collection) {
			RasPG.dev.validate.types('RasPG.resolveSoftsearch', {
				query: [query, 'string'],
				collection: [collection, 'string[]'],
			})

			const [_, prefix, search] = query.match(/(\w+:)(.*)/)
			switch(prefix) {
				case 'instance:':
					return collection.find(e => e.match(new RegExp(search + '_inst\d+$'))) || query
				case 'template:':
					for (const id of collection)
						if (GameObject.find(id)?.isTagged('TEMPLATE:'+search))
							return id
			}
			return query
		}
	}

	/** Registers a module to the core framework.
	 * @param {string} name
	 * @param {Function} module
	 */
	static registerModule(name, module) {
		if (typeof name !== 'string')
			throw RasPG.dev.exceptions.BrokenTypeEnforcement('RasPG.registerModule.name', 'string')
		if (typeof module !== 'function')
			throw RasPG.dev.exceptions.BrokenTypeEnforcement('RasPG.registerModule.module', 'function')
		if (this.runtime.modules.has(name)) {
			console.warn(`[RasPG - Core] Attempted to register module "${name}" more than once.`
				+'\nNo clue here, honestly; unless also attempting to register an extension more than once')
			return false
		}

		this.runtime.modules.set(name, module)
		return this
	}
	/** Registers a class to the core framework. Usually for helper classes, helpful for safe string-to-class resolution.
	 * @param {string} name
	 * @param {Function} class
	 */
	static registerClass(name, clss) {
		if (typeof name !== 'string')
			throw RasPG.dev.exceptions.BrokenTypeEnforcement('RasPG.registerClass.name', 'string')
		if (typeof clss !== 'function')
			throw RasPG.dev.exceptions.BrokenTypeEnforcement('RasPG.registerClass.clss', 'function')
		if (this.runtime.classes.has(name)) {
			console.warn(`[RasPG - Core] Attempted to register class "${name}" more than once.`
				+'\nNo clue here, honestly; unless also attempting to register an extension more than once')
			return false
		}

		this.runtime.classes.set(name, clss)
		return this
	}
	/** Registers a component to the core framework.
	 * @param {string} name
	 * @param {Function} component
	 */
	static registerComponent(name, component) {
		if (typeof name !== 'string')
			throw RasPG.dev.exceptions.BrokenTypeEnforcement('RasPG.registerComponent.name', 'string')
		if (typeof component !== 'function')
			throw RasPG.dev.exceptions.BrokenTypeEnforcement('RasPG.registerComponent.component', 'function')
		if (this.runtime.components.has(name)) {
			console.warn(`[RasPG - Core] Attempted to register component "${name}" more than once.`
				+'\nMaybe component name conflict between extensions, or attempting to register an extension more than once')
			return false
		}

		this.runtime.components.set(name, component)
		if (component.reference) {
			const existing = Array.from(RasPG.runtime.components.values()).find(e => e.reference === component.reference)
			RasPG.dev.logs.componentReferenceCollision(false, component.reference, existing, component)
		}
		return this
	}
	/** Registers an extension to the core framework. Modules, classes and components must be registered separately.
	 * @param {string} name
	 * @param {{ description?: string, author?: string, version?: string, repository?: string, minimumCoreVersion?: string }} metadata
	 */
	static registerExtension(name, metadata) {
		if (typeof name !== 'string')
			throw RasPG.dev.exceptions.BrokenTypeEnforcement('RasPG.registerExtension.name', 'string')
		if (typeof metadata !== 'object')
			throw RasPG.dev.exceptions.BrokenTypeEnforcement('RasPG.registerExtension.metadata', 'object')
		if (this.runtime.extensions.has(name)) {
			console.warn(`[RasPG - Core] Attempted to register extension "${name}" more than once.`
				+'\nMaybe importing on or from multiple places')
			return false
		}

		this.runtime.extensions.set(name, metadata || {})
		return this
	}
}

//# Modules
class EventModule {
	/** @type {Map<string, Set<{event: string, callback: Function, owner: GameObject | undefined, once: boolean}>>} */
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
	 *
	 * The wildcard '\*' matches any single domain. '\*\*' matches across domains. For example, 'stats.\*.changed' will match 'stats.health.changed', but not 'stats.health.max.changed'. 'stats.\*\*.changed' will match both.
	 * @param {string} event
	 * @param {EventCallback} callback
	 * @param {{owner: GameObject, once: boolean}} options
	 */
	static on(event, callback, options) {
		HookModule.run('before:EventModule.on', arguments, this)

		this.#listeners.get(event)?? this.#listeners.set(event, new Set())
			.add({ event, callback, owner: options.owner || undefined, once: options.once || false })

		HookModule.run('after:EventModule.on', arguments, this)
	}
	/** Removes a specific listener, optionally from a specific owner. Does not parse wildcards. Returns the number of listeners removed.
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

		const listeners = Array.from(this.#listeners.get(event))
		for (const [e, l] of this.#listeners.entries()) {
			if (e.includes('**') && event.match(new RegExp('^'+e.replaceAll('.', '\.').replaceAll('**', '.*?')+'$')))
				listeners.push(...l.values())
			if (e.includes('*') && event.match(new RegExp('^'+e.replaceAll('.', '\.').replaceAll('*', '[^.]*')+'$')))
				listeners.push(...l.values())
		}
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
		if (typeof data.previous === 'number' && typeof data.current === 'number')
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
		else if (typeof data.previous === 'boolean' && typeof data.current === 'boolean')
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

	/** Attaches a callback to a given hook.
	 *
	 * Notes:
	 * - Functions and methods that mutate or alter data run hooks before and after operations, prefixed with `before:` and `after:` respectively.
	 * - `after:` hooks are often not fired if the function returns early, indicating no-op.
	 *
	 * !!!WARNING!!! - Hooks that depend on being able to mutate a function's passed `arguments` object will not work under 'use strict', or in functions with rest arguments (`...args`) or default values (`function(param=1)`).
	 * @param {string} hook Convention: no spaces, camelCase.
	 * @param {(args: Array<any>, object: Object) => void} callback
	 */
	static attach(hook, callback) {
		this.#hooks.get(hook)?? this.#hooks.set(hook, new Set())
			.add(callback)
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

		RasPG.dev.validate.type('ContextModule.push.objects', objects, 'object')

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

		RasPG.dev.validate.type('ContextModule.push.labels', labels, 'Array<string>')

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
	 * @param {boolean} options.required If set strictly to `true`, will throw a MissingRequiredContext exception if the requested context-object stack is empty.
	 */
	static get(label, options) {
		HookModule.run('ContextModule.get', arguments, this)

		RasPG.dev.validate.type('ContextModule.label', label, 'string')
		RasPG.dev.validate.props('ContextModule.options', options, false, {
			required: 'boolean'
		})

		if (label in this.#context)
			return this.#context[label].at(0)
		else if (options?.required === true)
			throw RasPG.dev.exceptions.MissingRequiredContext(label)
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

		RasPG.dev.validate.type('ContextModule.registerGatherer.name', name, 'string')
		RasPG.dev.validate.props('ContextModule.registerGatherer.gatherer', gatherer, {
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

		RasPG.dev.validate.props('ContextModule.gatherFrom.options', options, false, {
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
class SubTextModule {
	static #conditionals = new Map()
	static #substitutions = new Map()

	/** Registers a string-embedded conditional type. Callback function must make use of the ContextModule. Returns `true`, if the identifier wasn't registered, and `false`, if it was and was overwritten.
	 *
	 * Embedded conditionals follow the pattern `{type?text displayed if true|text displayed if false}`. The pipe character is not required.
	 * @param {string | RegExp} identifier Convention: no spaces, camelCase
	 * @param {(condition: () => boolean) => string} callback
	 */
	static registerConditional(identifier, callback) {
		HookModule.run('before:SubTextModule.registerConditional', arguments, this)

		RasPG.dev.validate.types('SubTextModule.registerConditional', {
			identifier: [identifier, 'string | RegExp'],
			callback: [callback, ['function', '() => boolean']],
		})

		let ret = true
		if (this.#conditionals.has(identifier))
			ret = false
		this.#conditionals.set(identifier, callback)

		HookModule.run('after:SubTextModule.registerConditional', arguments, this)
		return ret
	}
	/** Registers a string substitution template. Callback function must make use of the ContextModule. Returns `true`, if the identifier wasn't registered, and `false`, if it was and was overwritten.
	 *
	 * String substitutions follow the pattern `%identifier%`. Strings on context objects can also be substituted in via `%contextLabel.stringKey%`
	 * @param {string} identifier Must have no whitespaces or dots. Convention: camelCase.
	 * @param {() => string} callback
	 */
	static registerSubstitution(identifier, callback) {
		HookModule.run('before:SubTextModule.registerSubstitution', arguments, this)

		RasPG.dev.validate.types('SubTextModule.registerSubstitution', {
			identifier: [identifier, 'string'],
			callback: [callback, ['function', '() => boolean']],
		})
		if (identifier.match(/[\s.]+/))
			throw RasPG.dev.exceptions.BrokenStringFormat(identifier, 'no whitespaces')

		let ret = true
		if (this.#substitutions.has(identifier))
			ret = false
		this.#substitutions.set(identifier, callback)

		HookModule.run('after:SubTextModule.registerSubstitution', arguments, this)
		return ret
	}
	/** Parses any and all embedded conditionals embedded in the given string.
	 *
	 * Embedded conditionals follow the pattern `{type?text displayed if true|text displayed if false}`. The pipe character is not required.
	 * @param {string} string
	 */
	static parseConditionals(string) {
		HookModule.run('before:SubTextModule.parseConditionals', arguments, this)

		RasPG.dev.validate.type('SubTextModule.parseConditionals.string', string, 'string')

		let previous
		while(true) {
			if (!string.match(/{[^?{}]+?\?[^{}]+?}/) || string === previous)
				break
			previous = string
			const matches = Array.from(string.matchAll(/{([^?{}]+?)\?([^{}]+?)}/g))
			for (const [inplace, identifier, substitutes] of matches) {
				const conditional = this.#conditionals.get(identifier)
				if (!conditional) {
					RasPG.dev.logs.elementNotRegisteredInCollection(identifier, 'SubTextModule.#conditionals')
					continue
				}
				const [ifTrue, ifFalse] = substitutes.split('|')
				if (conditional())
					string = string.replace(inplace, ifTrue || '')
				else
					string = string.replace(inplace, ifFalse || '')
			}
		}

		HookModule.run('after:SubTextModule.parseConditionals', arguments, this)
		return string
	}
	/** Parses any and all string substitutions embedded in the given string.
	 *
	 * String substitutions follow the pattern `%identifier%`. Strings on context objects can also be substituted in via `%contextLabel.stringKey%`
	 * @param {string} string
	 */
	static parseSubstitutions(string) {
		HookModule.run('before:SubTextModule.parseSubstitutions', arguments, this)

		RasPG.dev.validate.type('SubTextModule.parseConditionals.string', string, 'string')

		let previous
		while(true) {
			if (!string.match(/%[^%]+?%/) || string == previous)
				break
			previous = string
			const matches = Array.from(string.matchAll(/%([^%]+?)%/g))
			for (const [inplace, identifier] of matches) {
				const substitution = this.#substitutions.get(identifier)
				if (substitution) {
					string = string.replace(inplace, substitution() || '')
					continue
				}
				RasPG.dev.logs.elementNotRegisteredInCollection(identifier, 'SubTextModule.#substitutions')
				const parts = identifier.match(/^([^.]+)\.(.+)$/)
				if (!parts) {
					string = string.replace(inplace, '')
					continue
				}
				const [, contextLabel, stringKey] = parts
				const contextObject = ContextModule.get(contextLabel)
				if (!contextObject || !(contextObject instanceof GameObject) || !contextObject.hasComponent(Stringful)) {
					string = string.replace(inplace, '')
					continue
				}
				const stringValue = contextObject._strings.get(stringKey)
				if (stringValue)
					string = string.replace(inplace, stringValue)
			}
		}

		HookModule.run('after:SubTextModule.parseSubstitutions', arguments, this)
		return string
	}
	static parse(string) {
		HookModule.run('before:SubTextModule.parse', arguments, this)

		RasPG.dev.validate.type('SubTextModule.parseConditionals.string', string, 'string')

		while (true) {
			if (!string.match(/{[^?{}]+?\?[^{}]+?}/) && !string.match(/%[^%]+?%/))
				break
			while (string.match(/{[^?{}]+?\?[^{}]+?}/))
				string = this.parseConditionals(string)
			while (string.match(/%[^%]+?%/))
				string = this.parseSubstitutions(string)
		}

		HookModule.run('after:SubTextModule.parse', arguments, this)
		return string
	}
} RasPG.registerModule('SubTextModule', SubTextModule)
class TemplateModule {
	/** @type {{name: string, serialized: {id: string, tags: string[], components: {}}, constructor: function, instances: number}} */
	static #all = new Map()

	static get all() {
		return new Map(this.#all)
	}

	/** Instantiates an object from a template and returns it. Instance will be tagged with `'TEMPLATE:<name>'`.
	 * @param {string} name
	 */
	static instantiate(name) {
		HookModule.run('before:Template.instantiate', arguments, this)

		RasPG.dev.validate.type('Template.instantiate.name', name, 'string')
		if (!this.#all.has(name))
			return RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Template.#all')

		RasPG.runtime.state.inner.push('instantiating')

		const registered = this.#all.get(name)
		registered.template.id += '_inst' + registered.instances++
		const instance = registered.proto.deserializer(registered.template)
		instance.tag('TEMPLATE:'+name)
		registered.template.id = registered.template.id.replace(/_inst\d+$/, '')

		RasPG.runtime.state.inner.pop()

		EventModule.emit('template.instantiated', {
			object: instance,
			name,
			instance: registered.instances-1
		})
		HookModule.run('after:Template.instantiate', arguments, this)
		return instance
	}
	/** Serializes and registers a GameObject (or subclass) instance as a template under the given name. It is recommended to set `register: false` when creating a GameObject to serve as a template.
	 * @param {string} name
	 * @param {Object} object
	 */
	static register(name, object) {
		HookModule.run('before:Template.register', arguments, this)

		RasPG.dev.validate.type('Template.constructor.id', name, 'string')
		if (TemplateModule.#all.has(name))
			throw RasPG.dev.exceptions.GeneralIDConflict('Template.#all', name)

		RasPG.runtime.state.inner.push('serializing')
		const serialized = GameObject.serializer(object)
		RasPG.runtime.state.inner.pop()

		TemplateModule.#all.set(name, { name, serialized, constructor: object.constructor, instances: 0 })

		HookModule.run('after:Template.register', arguments, this)
	}
} RasPG.registerModule('Template', TemplateModule)

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
		for (const [name, cData] of Object.entries(data.components)) {
			const component = RasPG.runtime.components.get(name)
			if (!component)
				throw RasPG.dev.exceptions.DeserializerMissingComponent()
			const instance = component.deserializer(cData)
			object.addComponent(instance)
		}
	}
	#id
	#tags = new Set()
	_components = new Map()

	/**
	 * @param {string} id Convention: all lowercase, no spaces.
	 * @param {{tags?: string[], components?: Array<typeof Component | Component | string>, register?: boolean}} [options]
	 * @param {string[]} [options.tags] Tags to be added
	 * @param {Array<typeof Component | Component | string>} [options.components] Components to be added
	 * @param {boolean} [options.register] If strictly `false`, instance will not be registered to GameObject.#all.
	 */
	constructor(id, options) {
		HookModule.run('before:GameObject.constructor', arguments, this)

		RasPG.dev.validate.type('GameObject.constructor.id', id, 'string')
		RasPG.dev.validate.props('GameObject.constructor.options', options, false, {
			tags: 'string[]',
			components: ['Array<object | function | string>', 'Array<typeof Component | Component | string>'],
			register: 'boolean'
		})
		if (GameObject.#all.has(id))
			throw RasPG.dev.exceptions.ObjectIDConflict(id)

		this.#id = id
		if (options?.tags)
			for (const tag of options.tags)
				this.tag(tag)
		if (options?.components)
			this.addComponents(...options.components)
		// if (options?.watchProperties) {
		// 	const proxy = new Proxy(this, EventModule._proxyHandler)
		// 	GameObject.#all.set(id, proxy)
		// 	return proxy
		// }
		if (options?.register !== false)
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

	/** Returns the object with the given ID (strict), if found, or `null`, if not found.
	 * @param {string} id Convention: all lowercase, no spaces.
	 */
	static find(id) {
		HookModule.run('GameObject.find', arguments, this)
		return this.#all.find(e => e.id === id) || null
	}
	/** Attempts to resolve an object ID (soft*) to an instance. Optionally checks if it inherits from a given class, and/ir if it contains a given component or set of components.
	 *
	 * \*: If `id` is a string with the 'instantiate:' prefix, will instantiate the given template and return it, if found.
	 *
	 * Returns a GameObject instance if either the ID is resolved or the first parameter is already an instance, and the requested checks are passed. Returns `null` if the ID does not resolve to an object. Returns `false` if any checks fail.
	 * @param {string | GameObject} id
	 * @param {{proto: Function, component: Component, components: Iterable<Component>, operation: string}} options If both `components` and `component` are passed in `options`, only the array is checked. `operation` is the name of the method calling this method, and wwill be passed to warning messages for information.
	 */
	static resolve(id, options) {
		HookModule.run('GameObject.resolve', arguments, this)
		let object

		if (typeof id === 'object' && id instanceof this)
			object = id
		else if (typeof id === 'string') {
			if (id.startsWith('instantiate:'))
				object = TemplateModule.instantiate(id.slice(12))
			else
				object = this.find(id)
			if (!object) {
				RasPG.dev.logs.gameObjectNotFound(id)
				return null
			}
		}

		if (!object)
			throw RasPG.dev.exceptions.NotGameObject()

		if (options?.proto && typeof options.proto === 'function' && options.proto.isPrototypeOf(object))
			return RasPG.dev.logs.incorrectPrototype(id, options.proto.name)
		if (options?.components)
			for (const component of options.components)
				if (!object.hasComponent(component))
					return RasPG.dev.logs.missingRequiredComponentForOperation(object.id, component.name, options.operation || 'resolve')
		if (options?.component &&!object.hasComponent(options.component))
			return RasPG.dev.logs.missingRequiredComponentForOperation(object.id, options.component.name, options.operation || 'resolve')

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
			if (instance.constructor.reference in this)
				RasPG.dev.logs.componentReferenceCollision(this.id, instance.constructor.reference, this[instance.constructor.reference].constructor.name, instance.constructor.name)
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
			throw RasPG.dev.exceptions.NotComponent()

		return this._components.get(actualComponent.constructor.name) || null
	}
	/** Returns whether or not the object has the given component or not.
	 * @param {typeof Component | Component | string} component Either the component subclass itself, or an instance of the wanted component subclass.
	 */
	hasComponent(component) {
		HookModule.run('GameObject.instance.hasComponent', arguments, this)

		let actualComponent = Component.resolve(component)
		if (!actualComponent)
			throw RasPG.dev.exceptions.NotComponent()

		return this._components.has(actualComponent.prototype.constructor.name)
	}
	/** Adds a tag to the object. Returns `true`, if the tag wasn't present, or `false`, if it already was (no-op).
	 * @param {string} tag Convention: all caps, past tense.
	 */
	tag(tag) {
		HookModule.run('before:GameObject.instance.tag', arguments, this)

		RasPG.dev.validate.type('GameObject.instance.tag.tag', tag, 'string')
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

		RasPG.dev.validate.type('GameObject.instance.untag.tag', tag, 'string')
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

		RasPG.dev.validate.type('GameObject.instance.isTagged.tag', tag, 'string')

		return (this.#tags.has(tag))
	}
	/** Uses the GameObject's `serializer` function to compile the object and all its components into the form of a JSON-compatible object, returning it. */
	serialize() {
		return this.constructor.serializer(this)
	}
} RasPG.registerClass('GameObject', GameObject)
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

		if (typeof component === 'function' && this.isPrototypeOf(component))
			return component
		if (typeof component === 'string' && this.isPrototypeOf(RasPG.runtime.components.get(component)))
			return RasPG.runtime.components.get(component)
		if (typeof component === 'object' && (component instanceof this))
			return component.constructor

		throw RasPG.dev.exceptions.NotComponent()
	}
	/** Uses the component subclass' `serializer` function to compile the component instance's data in the form of a JSON-compatible object. */
	serialize() {
		if (!this.constructor.serializer)
			return RasPG.dev.logs.componentMissingSerialization(this.constructor.name)
		return this.constructor.serializer(this)
	}
} RasPG.registerClass('Component', Component)


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
		if (RasPG.runtime.state.inner.get() === 'serializing')
			return this.#data
		return structuredClone(this.#data)
	}

	/** Gets the value correlated with the given variable name.
	 * @param {string} variable Convention: no spaces, camelCase.
	 */
	get(variable) {
		HookModule.run('Stateful.instance.get', arguments, this)

		RasPG.dev.validate.type('Stateful.instance.get.variable', variable, 'string')
		if (!(variable in this.#data))
			return RasPG.dev.logs.elementNotRegisteredInCollection(variable, 'Stateful.instance.data')

		return this.#data[variable]
	}
	/** Sets the value correlated with the given variable name. Returns `true`, if successful, and `false`, if the variable does not exist.
	 * @param {string} variable Convention: no spaces, camelCase.
	 * @param {boolean | number | undefined} value
	 */
	set(variable, value) {
		HookModule.run('before:Stateful.instance.set', arguments, this)

		RasPG.dev.validate.types('Stateful.instance.set', {
			variable: [variable, 'string'],
			value: [value, 'number | boolean | undefined'],
		})
		if (!(variable in this.#data))
			return RasPG.dev.logs.elementNotRegisteredInCollection(variable, 'Stateful.instance.data')

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

		RasPG.dev.validate.types('Stateful.instance.create', {
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
		return Array.from(instance.strings)
			.map(e => {
				if (typeof e === 'function')
					if (RasPG.config.serializeFunctions)
						return 'SERIALIZED_FUNCTION:' + e.toString()
					else
						return 'SKIP'
				else return e
			})
	}
	static deserializer = function(data) {
		const instance = new Stringful()
		for (const [key, string] of data)
			if (typeof string === 'function')
				instance.set(key, string)
			else if (typeof string === 'string')
				if (string.startsWith('SERIALIZED_FUNCTION:'))
					instance.set(key, eval(string.slice(20)))
				else if (string !== 'SKIP')
					instance.set(key, string)
		return instance
	}
	static #global = new Map()
	#strings = new Map()

	get strings() {
		if (RasPG.runtime.state.inner.get() === 'serializing')
			return this.#strings
		return new Map(this.#strings)
	}
	/** Gets the global string correlated with the given key.
	 *
	 * If not prefixed with a locale ID (will check first part of domain and check against identifiers for available locales), will search in current locale first, but fall back on the default locale if not found.
	 */
	static get(key) {
		HookModule.run('Stringful.global.get', arguments, this)

		RasPG.debug.validate.type('Stringful.global.get.key', key, 'string')

		const actualKey = RasPG.config.availableLocales.includes(key.slice(0, key.indexOf('.')))? key : RasPG.config.locale + '.' + key
		let string = this.#global.get(actualKey) || this.#global.get(RasPG.config.defaultLocale + '.' + key)
		if (typeof string === 'function')
			string = string()

		return string
	}
	/** Sets the global string correlated with the given key. Can be a function that returns a string. Will prefix with the current locale ID as a domain, if not already prefixed (will check first part of domain and check against identifiers for available locales).
	 * @param {string} key Convention: no spaces, camelCase.
	 * @param {string | () => string} string
	 */
	static set(key, string) {
		HookModule.run('before:Stringful.global.set', arguments, this)

		RasPG.debug.validate.types('Stringful.global.set', {
			key: [key, 'string'],
			string: [string, ['string | function', 'string | () => string']]
		})

		const actualKey = RasPG.config.availableLocales.includes(key.slice(0, key.indexOf('.'))) ? key : RasPG.config.locale + '.' + key
		const previous = this.#global.get(actualKey)
		this.#global.set(actualKey, string)

		EventModule.emit('strings.global.set', {
			key: actualKey,
			previous,
			current: string
		})
		HookModule.run('after:Stringful.global.set', arguments, this)
		return true
	}
	/** Defines global string in bulk. Returns the component instance back for further operations. Will prefix with the identifier for the current locale, if not already prefixed (will check first part of domain and check against identifiers for available locales).
	 * @param {{[key: string]: string | () => string}} options 
	 */
	static define(options) {
		HookModule.run('before:Stringful.global.define', arguments, this)

		for (const [key, string] of Object.entries(options))
			this.set(key, string)

		HookModule.run('after:Stringful.global.define', arguments, this)
		return this
	}
	/** Gets the string correlated with the given key.
	 *
	 * If not prefixed with a locale ID, will search in current locale first, but fall back on the default locale if not found.
	 *
	 * If not found on the object, will search global string registry for pattern 'locale.objectid.*', following the same logic as above.
	 * @param {string} key Convention: dot-separated domains, no spaces, camelCase ('en.action.jumpOn.successful')
	 */
	get(key) {
		HookModule.run('Stringful.instance.get', arguments, this)

		RasPG.dev.validate.type('Stringful.instance.get.key', key, 'string')

		const parentID = this.parent?.id?.replace?.(/_inst\d+$/, '') || 'unknown'
		const givenLocale = RasPG.config.availableLocales.includes(key.slice(0, key.indexOf('.')))
		const rawKey = givenLocale ? key.slice(key.indexOf('.') + 1) : key
		let string = this.#strings.get(givenLocale? key : RasPG.config.locale + '.' + rawKey)
			|| this.#strings.get(RasPG.config.defaultLocale + '.' + rawKey)
			|| Stringful.get([RasPG.config.locale, parentID, rawKey].join('.'))
			|| Stringful.get([RasPG.config.defaultLocale, parentID, rawKey].join('.'))
		if (typeof string === 'function')
			string = string()

		return string
	}
	/** Sets the string correlated with the given key. Can be a function that returns a string.
	 *
	 * If not already prefixed with a locale ID, will prefix with current locale ID.
	 * @param {string} key Convention: no spaces, camelCase.
	 * @param {string | () => string} string
	 */
	set(key, string) {
		HookModule.run('before:Stringful.instance.set', arguments, this)

		RasPG.dev.validate.types('Stringful.instance.set', {
			key: [key, 'string'],
			string: [string, ['string | function', 'string | () => string']],
		})

		const actualKey = RasPG.config.availableLocales.includes(key.slice(0, key.indexOf('.')))? key : RasPG.config.locale + '.' + key
		const previous = this.#strings.get(actualKey)
		this.#strings.set(actualKey, string)

		EventModule.emitPropertyEvents({
			object: this.parent,
			property: actualKey,
			previous,
			current: string
		}, 'strings.')
		EventModule.emit('strings.set', {
			object: this.parent,
			key: actualKey,
			previous,
			current: string
		})
		HookModule.run('after:Stringful.instance.set', arguments, this)
		return true
	}
	/** Defines strings in bulk. Returns the component instance back for further operations.
	 *
	 * If not already prefixed with a locale ID, will prefix with current locale ID.
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
				if (typeof perception === 'function')
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
				if (typeof data[sense][context] === 'string')
					if (data[sense][context].startsWith('SERIALIZED_FUNCTION:'))
						data[sense][context] = eval(data[sense][context].slice(20))
					else if (data[sense][context] === 'SKIP')
						delete data[sense][context]
		RasPG.utils.scheduling.stateNot(
			() => instance.definePerceptions(data),
			{inner: 'serializing|instantiatingTemplate'}
		)
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

		RasPG.dev.validate.props('Perceptible.instance.describe.options', options, {
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

		RasPG.dev.validate.types('Perceptible.instance.setPerception', {
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
			if (typeof sense !== 'string')
				throw RasPG.dev.exceptions.brokenEnforcedType('Perceptible.instance.definePerceptions.sense', 'string')
			for (const context in options[sense]) {
				if (typeof context !== 'string')
					throw RasPG.dev.exceptions.brokenEnforcedType('Perceptible.instance.definePerceptions.context', 'string')
				if (typeof options[sense][context] !== 'string' && typeof options[sense][context] !== 'function')
					throw RasPG.dev.exceptions.brokenEnforcedType('Perceptible.instance.definePerceptions.sense[context]', 'string | () => string')
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

		RasPG.dev.validate.types('Perceptible.instance.removePerception', {
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

		RasPG.dev.validate.types('Perceptible.instance.perceive', {
			sense: [sense, 'string'],
			context: [context, 'string'],
		})
		if (!this.#perceptions.has(sense))
			return null
		if (!(sensor instanceof GameObject))
			throw RasPG.dev.exceptions.NotGameObject()

		const perceptions = this.#perceptions.get(sense)
		let found
		let realContext = context
		if (typeof context === 'string')
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
		if (typeof found === 'function')
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
		RasPG.utils.scheduling.stateNot(
			() =>instance.moveTo(data.location, false)
			, {inner: 'serializing'}
		)
		return instance
	}
	#location

	get location() {
		if (RasPG.runtime.state.inner.get() === 'serializing')
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

		RasPG.dev.validate.type('Countable.instance.set.count', count, 'number')

		this.#count = count

		HookModule.run('after:Countable.instance.set', arguments, this)
	}
	/** Adds a given amount to the object's count. Rounds to closest integer.
	 * @param {number} amount
	 */
	add(amount) {
		HookModule.run('before:Countable.instance.add', arguments, this)

		RasPG.dev.validate.type('Countable.instance.set.amount', amount, 'number')

		this.#count += amount

		HookModule.run('after:Countable.instance.add', arguments, this)
	}
	/** Subtracts a given amount from the object's count. Rounds to closest integer.
	 * @param {number} amount
	 */
	subtract(amount) {
		HookModule.run('before:Countable.instance.subtract', arguments, this)

		RasPG.dev.validate.type('Countable.instance.set.amount', amount, 'number')

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
			RasPG.utils.scheduling.stateNot(
				() => instance.add(id),
				{inner: 'serializing|instantiatingTemplate'}
			)
		return instance
	}
	#contents = new Set()
	/** @type {(GameObject) => boolean} */
	#filter

	get contents() {
		if (RasPG.runtime.state.inner.get() === 'serializing')
			return this.#contents
		return new Set(
			Array.from(this.#contents)
				.map(e => GameObject.resolve(e, { operation: 'Containing.instance.get.contents' }))
		)
	}
	get filter() {
		return this.#filter
	}

	/** Adds an object to the container. Returns the component instance back for further operations.
	 * @param {GameObject | string} object
	 * @param {{ignoreFilter?: boolean, passOn?: boolean}} options
	 * @param {boolean} options.ignoreFilter If set to `true`, object will be added to container regardless of a present filter.
	 * @param {boolean} options.passOn INTERNAL USE: if anything but `false`, will call the current (if existent) container's `remove` method and new container's `add` method.
	 */
	add(object, options) {
		HookModule.run('before:Container.instance.add', arguments, this)

		if (RasPG.runtime.state.inner.get() == 'templating') {
			RasPG.dev.validate.type('Containing.instance.add.object', object, ['string', 'instantiate:<name>'])
			if (!object.startsWith('instantiate:'))
				throw RasPG.dev.exceptions.TemplateReferenceViolation('Containing.instance.add', object)

			this.#contents.add(object)
		}
		else {
			const actualObject = GameObject.resolve(object, { component: Tangible, operation: 'Container.instance.add' })
			if (!actualObject)
				return actualObject
			if (this.#contents.has(actualObject.id))
				return this
			if (options?.ignoreFilter !== true && this.#filter && !this.#filter(actualObject))
				return this

			if (options?.passOn !== false)
				actualObject._location.moveTo(this.parent, false)
			this.#contents.add(actualObject.id)

			EventModule.emit('container.added', {
				object: this.parent,
				item: actualObject
			})
		}

		HookModule.run('after:Container.instance.add', arguments, this)
		return this
	}
	/** Removes an object from the container. Returns the component instance back for further operations.
	 * @param {GameObject | string} object
	 * @param {boolean} passOn INTERNAL USE: if anything but `false`, will call the current (if existent) container's `remove` method and new container's `add` method.
	 */
	remove(object, passOn) {
		HookModule.run('before:Container.instance.remove', arguments, this)

		let actualID = object
		if (typeof object === 'string')
			actualID = RasPG.dev.resolveSoftsearch(object, Array.from(this.#contents))
		const actualObject = GameObject.resolve(actualID, { component: Tangible, operation: 'Container.instance.remove' })

		if (!actualObject)
			return this
		if (!this.has(actualObject))
			return this

		if (passOn !== false)
			actualObject._location.removeFromWorld(false)
		this.#contents.delete(actualObject.id)

		EventModule.emit('container.removed', {
			object: this.parent,
			item: actualObject
		})
		HookModule.run('after:Container.instance.remove', arguments, this)
		return this
	}
	/** Sets a filter function that dictates what kinds of GameObjects the container allows. Returns the component instance back for further operations.
	 * @param {(GameObject) => boolean} predicate
	 */
	setFilter(predicate) {
		HookModule.run('before:Containing.instance.setFilter', arguments, this)

		RasPG.dev.validate.type('Containing.instance.setFilter.predicate', predicate, ['function', '(GameObject) => boolean'])

		this.#filter = predicate

		HookModule.run('after:Containing.instance.setFilter', arguments, this)
		return this
	}
	emptyInto(container) {}
	empty() {}
	/** Returns whether the given object is contained within the container.
	 * @param {GameObject | string} object
	 */
	has(object) {
		HookModule.run('Container.instance.has', arguments, this)

		let actualID = object
		if (typeof object === 'string')
			actualID = RasPG.dev.resolveSoftsearch(object, Array.from(this.#contents))
		const actualObject = GameObject.resolve(actualID, { component: Tangible, operation: 'Container.instance.has' })
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
		if (RasPG.runtime.state.inner.get() === 'serializing')
			return this.#allActions
		return new Map(
			Array.from(this.#allActions)
				.filter(([key, _]) => !this.#disabledActions.has(key))
		)
	}
	get actions() {
		if (RasPG.runtime.state.inner.get() === 'serializing')
			return this.#actions
		return new Set([...this.#actions].filter(action => !Actionable.#disabledActions.has(action)))
	}

	/** Registers an action object into the component's registry. The object is comprised of a callback (representing the action itself), and, optionally, a predicate (representing requirements for the action to be performed).
	 * @param {string} name Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 * @param {{callback: (agent?: GameObject) => (void | string), predicate?: (agent?: GameObject) => boolean}} actionObject
	 */
	static registerAction(name, actionObject) {
		HookModule.run('before:Actionable.registerAction', arguments, this)

		RasPG.dev.validate.type('Actionable.registerAction.name', name, 'string')
		RasPG.dev.validate.props('Actionable.registerAction.actionObject', actionObject,
			{ callback: ['function', '(agent?: GameObject) => (void | string)'] },
			{ predicate: ['function', '(agent?: GameObject) => boolean'] }
		)
		if (this.isAction(name))
			throw RasPG.dev.exceptions.GeneralIDConflict('Actionable.#actions', name)

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

		RasPG.dev.validate.type('Actionable.isAction.action', action, 'string')
		RasPG.dev.validate.props('Actionable.isAction.options', options, false, { enabledOnly: 'boolean' })

		if (options?.enabledOnly === false)
			return this.#allActions.has(action)
		return this.actions.has(action)
	}
	/** Completely disables (or all in the array) the given action system-wide. Returns `true`, if successful, and `false`, if an error occurred.
	 * @param {string | string[]} action
	 */
	static disable(action) {
		HookModule.run('before:Actionable.disable', arguments, this)

		RasPG.dev.validate.type('Actionable.disable.action', action, 'string | string[]')

		let ret = true
		if (typeof action === 'string')
			if (!Actionable.isAction(action))
				return RasPG.dev.logs.elementNotRegisteredInCollection(action, 'Actionable.#actions')
			else
				this.#disabledActions.add(action)
		else if (action instanceof Array)
			for (const name of action)
				if (!Actionable.isAction(name))
					ret = RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Actionable.#actions')
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

		RasPG.dev.validate.type('Actionable.enable.action', action, 'string | string[]')

		let ret = true
		if (typeof action === 'string')
			if (!Actionable.isAction(action))
				return RasPG.dev.logs.elementNotRegisteredInCollection(action, 'Actionable.#actions')
			else if (!Actionable.#disabledActions.has(action))
				return RasPG.dev.logs.elementNotRegisteredInCollection(action, 'Actionable.#disabledActions')
			else
				this.#disabledActions.delete(action)
		else if (action instanceof Array)
			for (const name of action)
				if (!Actionable.isAction(name))
					ret = RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Actionable.#actions')
				else if (!Actionable.#disabledActions.has(name))
					return RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Actionable.#disabledActions')
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

		RasPG.dev.validate.type('Actionable.instance.agentsCan.action', action, ['string | string[]'])

		let ret = true
		if (typeof action === 'string')
			if (!Actionable.isAction(action))
				return RasPG.dev.logs.elementNotRegisteredInCollection(action, 'Actionable.#actions')
			else {
				this.#actions.add(action)
				EventModule.emit('actions.added', { object: this.parent, action })
			}
		else if (action instanceof Array)
			for (const name of action)
				if (!Actionable.isAction(action))
					ret = RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Actionable.#actions')
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

		RasPG.dev.validate.type('Actionable.instance.agentsCannot.action', action, ['string | string[]'])

		let ret = true
		if (typeof action === 'string')
			if (!Actionable.isAction(action))
				return RasPG.dev.logs.elementNotRegisteredInCollection(action, 'Actionable.#actions')
			else {
				this.#actions.delete(action)
				EventModule.emit('actions.removed', { object: this.parent, action })
			}
		else if (action instanceof Array)
			for (const name of action)
				if (!Actionable.isAction(action))
					ret = RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Actionable.#actions')
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
		if (RasPG.runtime.state.inner.get() === 'serializing')
			return this.#allActs
		return new Map(
			Array.from(this.#allActs)
				.filter(([key, _]) => !this.#disabledActs.has(key))
		)
	}
	get acts() {
		if (RasPG.runtime.state.inner.get() === 'serializing')
			return this.#acts
		return new Set([...this.#acts].filter(act => !Agentive.#disabledActs.has(act)))
	}

	/** Registers an Act object into the component's registry. The object is comprised of a callback (representing the act itself), and, optionally, a predicate (representing requirements for the act to be performed).
	 * @param {string} name Convention: no spaces, camelCase. Can be organized into domains (i.e. 'item.drop').
	 * @param {{callback: (target?: GameObject) => (void | string), predicate?: (target?: GameObject) => boolean}} actObject
	 */
	static registerAct(name, actObject) {
		HookModule.run('before:Agentive.registerAct', arguments, this)

		RasPG.dev.validate.type('Agentive.registerAct.name', name, 'string')
		RasPG.dev.validate.props('Agentive.registerAct.actObject', actObject,
			{ callback: ['function', '(target?: GameObject) => (void | string)'] },
			{ predicate: ['function', '(target?: GameObject) => boolean'] }
		)
		if (this.isAct(name))
			throw RasPG.dev.exceptions.GeneralIDConflict('Agentive.#acts', name)

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

		RasPG.dev.validate.type('Agentive.isAct.act', act, 'string')
		RasPG.dev.validate.props('Agentive.isAct.options', options, false, { enabledOnly: 'boolean' })

		if (options?.enabledOnly === false)
			return this.#allActs.has(act)
		return this.acts.has(act)
	}
	/** Completely disables the given act (or all in the array) system-wide. Returns `true`, if successful, and `false`, if an error occurred.
	 * @param {string | string[]} act
	 */
	static disable(act) {
		HookModule.run('before:Agentive.disable', arguments, this)

		RasPG.dev.validate.type('Agentive.disable.act', act, 'string | string[]')

		let ret = true
		if (typeof act === 'string')
			if (!Agentive.isAct(act))
				return RasPG.dev.logs.elementNotRegisteredInCollection(act, 'Agentive.#acts')
			else
				this.#disabledActs.add(act)
		else if (act instanceof Array)
			for (const name of act)
				if (!Agentive.isAct(name))
					ret = RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Agentive.#acts')
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

		RasPG.dev.validate.type('Agentive.enable.act', act, 'string | string[]')

		let ret = true
		if (typeof act === 'string')
			if (!Agentive.isAct(act))
				return RasPG.dev.logs.elementNotRegisteredInCollection(act, 'Agentive.#acts')
			else if (!Agentive.#disabledActs.has(act))
				return RasPG.dev.logs.elementNotRegisteredInCollection(act, 'Agentive.#disabledActs')
			else
				this.#disabledActs.delete(act)
		else if (act instanceof Array)
			for (const name of act)
				if (!Agentive.isAct(name))
					ret = RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Agentive.#acts')
				else if (!Agentive.#disabledActs.has(name))
					return RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Agentive.#disabledActs')
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

		RasPG.dev.validate.type('Agentive.instance.can.act', act, ['string | string[]'])

		let ret = true
		if (typeof act === 'string')
			if (!Agentive.isAct(act))
				return RasPG.dev.logs.elementNotRegisteredInCollection(act, 'Agentive.#acts')
			else {
				this.#acts.add(act)
				EventModule.emit('acts.added', { object: this.parent, act })
			}
		else if (act instanceof Array)
			for (const name of act)
				if (!Agentive.isAct(act))
					ret = RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Agentive.#acts')
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

		RasPG.dev.validate.type('Agentive.instance.cannot.act', act, ['string | string[]'])

		let ret = true
		if (typeof act === 'string')
			if (!Agentive.isAct(act))
				return RasPG.dev.logs.elementNotRegisteredInCollection(act, 'Agentive.#acts')
			else {
				this.#acts.delete(act)
				EventModule.emit('acts.removed', { object: this.parent, act })
			}
		else if (act instanceof Array)
			for (const name of act)
				if (!Agentive.isAct(act))
					ret = RasPG.dev.logs.elementNotRegisteredInCollection(name, 'Agentive.#acts')
				else {
					this.#acts.delete(name)
					EventModule.emit('acts.removed', { object: this.parent, act: name })
				}

		HookModule.run('after:Agentive.instance.cannot', arguments, this)
		return ret
	}
}  RasPG.registerComponent('Agentive', Agentive)

if (typeof module !== 'undefined')
	module.exports = {
		RasPG,
		GameObject,
		Component,

		EventModule,
		HookModule,
		ContextModule,
		SubTextModule,

		Stateful,
		Stringful,
		Perceptible,
		Tangible,
		Countable,
		Containing,
		Actionable,
		Agentive,
	}