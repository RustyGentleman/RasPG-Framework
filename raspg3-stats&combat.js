//# Typedefs

//* Registration
if (!RasPG)
	throw new Error('[RasPG - Stats&Combat] Framework core missing'
		+'\nMaybe incorrect import/load order')


RasPG.dev.exceptions.NotStatType = () => new TypeError(`[RasPG - Stats&Combat][NotStatType] Expected instance or name of StatType`)

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
	 * @param {{calculation?: (stat: Stat) => number, roundToNearest?: number | false }} [options]
	 */
	constructor(name, options) {
		HookModule.run('before:StatType.constructor', arguments, this)

		RasPG.dev.validate.type('StatType.constructor.name', name, 'string')
		RasPG.dev.validate.props('StatType.constructor.options', options, false, {
			calculation: ['function', '(stat: Stat) => number'],
			roundToNearest: 'number'
		})

		this.name = name
		if (options?.calculation)
			this.calculation = options.calculation
		if (options?.roundToNearest)
			this.roundToNearest = options.roundToNearest

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

		RasPG.dev.validate.type('StatType.find', type, 'string')

		return this.#all.get(type) || null
	}
	/** Attempts to resolve a string to a StatType instance. Passes it back if first parameter is already one. Returns `null` if not found.
	 * @param {string | StatType} type Convention: no spaces, camelCase.
	 */
	static resolve(type) {
		HookModule.run('StatType.resolve', arguments, this)

		if (typeof type === 'object' && type instanceof StatType)
			return type
		if (typeof type === 'string') {
			const actualType = this.find(type)
			if (!actualType) {
				RasPG.dev.logs.elementNotRegisteredInCollection(type, 'StatType.#all')
				return null
			}
			return actualType
		}

		throw RasPG.dev.exceptions.NotStatType()
	}

	/** Calculates a given stat's final value. In order: runs the given calculation, applies `toPrecision()`, then rounds to nearest, if set.
	 * @param {Stat} stat
	 */
	calculate(stat) {
		HookModule.run('before:StatType.instance.calculate', arguments, this)

		let netValue = +(this.calculation(stat)).toPrecision(StatType.precision)
		if (this.roundToNearest)
			netValue = +(netValue - (netValue % this.roundToNearest)).toPrecision(StatType.precision)

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
} RasPG.registerClass('StatType', StatType)
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

		RasPG.dev.validate.type('Stat.constructor.initialValue', initialValue, 'number')
		const actualType = StatType.resolve(type)

		this.#type = actualType.name
		this.base = initialValue

		HookModule.run('after:Stat.constructor', arguments, this)
	}

	/** @return {StatType} */
	get type() {
		return StatType.find(this.#type)
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
class Statful extends Component {
	static reference = '_stats'
	#stats = new Map()

	/** Returns the given Stat instance from the object. Returns `null`, if not found
	 * @param {string} stat Convention: no spaces, camelCase.
	 */
	get(stat) {
		HookModule.run('Statful.instance.get', arguments, this)

		RasPG.dev.validate.type('Statful.get.stat', stat, 'string')
		if (!this.#stats.has(stat)) {
			RasPG.dev.RasPG.dev.logs.elementNotRegisteredInCollection(variable, 'Stateful.instance.data')
			return null
		}

		return this.#stats.get(stat)
	}

	/** Sets the stat's base value. Returns `true`, if successful, and `false`, if stat isn't present.
	 * @param {string} stat Convention: no spaces, camelCase.
	 * @param {number} value
	 */
	set(stat, value) {
		HookModule.run('before:Statful.instance.set', arguments, this)

		RasPG.dev.validate.types('Statful.instance.set', {
			stat: [stat, 'string'],
			value: [value, 'number'],
		})
		if (!this.#stats.has(stat))
			return false

		const actualStat = this.#stats.get(stat)
		const previous = actualStat.base
		actualStat.base = value

		EventModule.emitPropertyEvents({
			object: this.parent,
			property: stat,
			previous,
			current: value
		}, 'stats.')

		HookModule.run('after:Statful.instance.set', arguments, this)
		return true
	}
	/** Modifies the stat's base value by the given change. Returns `true`, if successful, and `false`, if stat isn't present.
	 * @param {string} stat Convention: no spaces, camelCase.
	 * @param {number} change
	 */
	modify(stat, change) {
		HookModule.run('before:Statful.instance.modify', arguments, this)

		RasPG.dev.validate.types('Statful.instance.modify', {
			stat: [stat, 'string'],
			change: [change, 'number'],
		})
		if (!this.#stats.has(stat))
			return false

		const actualStat = this.#stats.get(stat)
		const previous = actualStat.base
		actualStat.base += change

		EventModule.emitPropertyEvents({
			object: this.parent,
			property: stat,
			previous,
			current: actualStat.base
		}, 'stats.')
		HookModule.run('after:Statful.instance.modify', arguments, this)
		return true
	}
	/** Gives the object a new stat. Returns `true`, if successful, and `false`, if already present.
	 * @param {string} stat Convention: no spaces, camelCase.
	 * @param {number} initialValue
	 */
	give(stat, initialValue) {
		HookModule.run('before:Statful.instance.give', arguments, this)

		RasPG.dev.validate.types('Statful.instance.give', {
			stat: [stat, 'string'],
			initialValue: [initialValue, 'number'],
		})
		if (this.#stats.has(stat))
			return false

		const actualType = StatType.find(stat)
		if (!actualType)
			return actualType
		this.#stats.set(stat, actualType.create(initialValue))

		EventModule.emit('stats.created', {
			object: this.parent,
			stat,
			initialValue
		})
		HookModule.run('after:Statful.instance.give', arguments, this)
		return true
	}
	/** Gives the object new stats, or sets them, in bulk. Returns the component instance back for further operations.
	 * @param {{[stat: string]: number}} options
	 */
	define(options) {
		HookModule.run('before:Statful.instance.define', arguments, this)

		for (const [stat, initialValue] of Object.entries(options))
			if (!this.set(stat, initialValue))
				this.give(stat, initialValue)

		HookModule.run('after:Statful.instance.define', arguments, this)
		return this
	}
}
class Combatant extends Component {
	static reference = '_combat'
	static requires = [Actionable, Agentive, Statful]
	//? Note: Expected to be bundled with the Combat module.
}

new Extension('Stats&Combat', {
	author: 'Rasutei',
	version: '0.0.0-dev',
	description: 'An extension including resources for combat systems, such as stats and stat modifiers (e.g. HP, attack), and status effects (e.g. buffs/debuffs). Also includes a turn-based combat system module.',
})
	.addClass('StatType', StatType)
	.addComponent('Statful', Statful)
	.addComponent('Combatant', Combatant)