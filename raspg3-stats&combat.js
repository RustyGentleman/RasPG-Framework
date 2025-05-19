/** @typedef {{calculation: (stat: Stat) => number, roundToNearest: number | false }} StatTypeOptions  */

//# Module

//# Classes
class StatType {
	static #all = new Map()
	static precision = 6
	name
	calculation = (stat) => {
		let net = stat.base
		for (const modifier of stat.modifiers) {
			if ('delta' in modifier)
				net += modifier.delta
			if ('multiplier' in modifier)
				net*= modifier.multiplier
		}
		return net
	}
	roundToNearest = .01
	globalModifiers = []

	/**
	 * @param {String} name Convention: no spaces, camelCase.
	 * @param {StatTypeOptions} options
	 */
	constructor(name, options) {
		HookModule.run('before:StatType.constructor', arguments, this)

		this.name = name
		if (options.calculation)
			this.calculation = options.calculation
		this.roundToNearest = options.roundToNearest || false

		StatType.#all.set(name, this)

		HookModule.run('after:StatType.constructor', arguments, this)
	}

	static get all() {
		return new Map(this.#all)
	}

	/** Returns the stat type with the given name, if found, or `null`, if not found.
	 * @param {string} type Convention: no spaces, camelCase.
	 */
	static find(type) {
		HookModule.run('StatType.find', arguments, this)
		return this.#all.get(type) || null
	}
	/** Attempts to resolve a string to a StatType instance. Passes it back if first parameter is already one. Returns `null` if not found.
	 * @param {string | StatType} type Convention: no spaces, camelCase.
	 */
	static resolve(type) {
		HookModule.run('StatType.resolve', arguments, this)

		if (type instanceof StatType)
			return type
		if (typeof(type) === 'string') {
			const actualType = this.find(type)
			if (!actualType) {
				LOGS.elementNotRegisteredInCollection(type, 'StatType.#all')
				return null
			}
			return actualType
		}

		throw EXCEPTIONS.brokenEnforcedType('StatType.resolve.type', 'string | StatType')
	}

	/** Calculates a given stat's final value. In order: runs the given calculation, applies `toPrecision()`, then rounds to nearest, if set.
	 * @param {Stat} stat
	 */
	calculate(stat) {
		HookModule.run('before:StatType.instance.calculate', arguments, this)

		let netValue = +(this.calculation(stat)).toPrecision(6)
		if (this.roundToNearest)
			netValue -= netValue % this.roundToNearest

		HookModule.run('after:StatType.instance.calculate', arguments, this)
		return netValue
	}
	/** Creates and returns a Stat instance with this StatType, with the given initial value.
	 * @param {number} initialValue
	 */
	create(initialValue) {
		HookModule.run('StatType.instance.create', arguments, this)
		return new Stat(this, initialValue)
	}
}
class Stat {
	#type
	base
	modifiers = []

	/**
	 * @param {StatType | string} type
	 * @param {number} initialValue
	 */
	constructor(type, initialValue) {
		HookModule.run('before:Stat.constructor', arguments, this)

		if (typeof(initialValue) !== 'number')
			throw EXCEPTIONS.brokenEnforcedType('Stat.constructor.initialValue', 'number')
		const actualType = StatType.resolve(type)
		if (!actualType)
			throw EXCEPTIONS.brokenEnforcedType('Stat.constructor.type', 'StatType | string')

		this.#type = actualType.name
		this.base = initialValue

		HookModule.run('after:Stat.constructor', arguments, this)
	}

	/** @return {StatType} */
	get type() {
		return StatType.resolve(this.#type)
	}
	get net() {
		return this.calculate()
	}

	calculate() {
		HookModule.run('Stat.instance.calculate', arguments, this)
		return this.type.calculate(this)
	}
}

//# Components
class Statful {
	static reference = '_stats'
	static #stats = new Map()
	#stats = new Map()
	//? Note: Expected to be bundled with the Combat module.

	static create(stat, options) {}

	/** Gets the value correlated with the given stat name.
	 * @param {string} stat Convention: no spaces, camelCase.
	 */
	get(stat) {
		HookModule.run('Combatable.instance.get', arguments, this)
		return this.#stats[stat]
	}
	/** Sets the value correlated with the given stat name. Returns `true`, if successful, and `false`, if the stat does not exist.
	 * @param {string} stat Convention: no spaces, camelCase.
	 * @param {boolean | number} value
	 */
	set(stat, value) {
		HookModule.run('before:Combatable.instance.set', arguments, this)
		if (typeof(stat) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Combatable.instance.set.stat', 'string')
		switch (typeof(value)) {
			case 'number':
			case 'boolean':
				break
			default:
				throw EXCEPTIONS.brokenEnforcedType('Combatable.instance.set.value', 'number | boolean')
		}
		if (!this.#stats.hasOwnProperty(stat)) {
			LOGS.elementNotRegisteredInCollection(stat, 'Combatable.instance.#stats')
			return false
		}
		const previous = this.#stats[stat]
		this.#stats[stat] = value
		EventModule.emitPropertyEvents({
			object: this.parent,
			property: stat,
			previous,
			current: value
		}, 'stats.')
		HookModule.run('after:Combatable.instance.set', arguments, this)
		return true
	}
	/** Adds a stat and a default value. Returns `true`, if successful, and `false`, if the stat already exists, ignoring the operation.
	 * @param {string} stat Convention: no spaces, camelCase.
	 * @param {boolean | number} value
	 */
	create(stat, initialValue) {
		HookModule.run('before:Combatable.instance.create', arguments, this)
		if (typeof(stat) !== 'string')
			throw EXCEPTIONS.brokenEnforcedType('Combatable.instance.create.stat', 'string')
		switch (typeof(initialValue)) {
			case 'number':
			case 'boolean':
				break
			default:
				throw EXCEPTIONS.brokenEnforcedType('Combatable.instance.set.initialValue', 'number | boolean')
		}
		if (this.#stats[stat] === undefined)
			return false
		this.#stats[stat] = initialValue
		EventModule.emit(`stats.created`, {
			object: this.parent,
			stat,
			initialValue
		})
		HookModule.run('after:Combatable.instance.create', arguments, this)
		return true
	}
	/** Modifies an existing stat by a delta. Returns `true`, if successful, and `false`, if the stat does not exist.
	 * @param {string} name
	 * @param {number} delta
	 */
	modifyStat(name, delta) {}
}
class Combatant {
	static reference = '_combat'
	static requires = [Actionable, Agentive, Statful]
	//? Note: Expected to be bundled with the Combat module.
}