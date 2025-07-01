RasPG.registerLocalizationAdapter(
new LocalizationAdapter({
	author: 'Rasutei',
	code: 'en',
	version: '0.0.0-dev',
	tokens: {
		'ART': ['DEF', 'NDEF'],
		'COUNT': ['NMBR', 'WORD'],
		'ADJ': [],
		'NOUN': ['SG', 'PL', 'POSS'],
		'1SG': ['M', 'F', 'N', 'NH', 'POSS', 'R'],
		'2SG': ['M', 'F', 'N', 'NH', 'POSS', 'R'],
		'3SG': ['M', 'F', 'N', 'NH', 'POSS', 'R', 'ACC', 'DAT'],
		'1PL': ['M', 'F', 'N', 'NH', 'POSS', 'R'],
		'2PL': ['M', 'F', 'N', 'NH', 'POSS', 'R'],
		'3PL': ['M', 'F', 'N', 'NH', 'POSS', 'R', 'ACC', 'DAT'],
		'VERB': ['PTCP', 'PRS', 'PST', 'FUT', 'IND', 'PRF', 'CONT']
	},
	metadataRequired: {
		person: {
			gender: ['M', 'F', 'N', 'NH'],
		}
	},
	metadataOptional: {
		person: {
			nameIsProper: [true, false]
		}
	},
	morpher: function(parts, object) {
		/** @type {{objectType: string | string[], overrides?: {[baseToken: string]: [string[], string][]}, [feature: string]: any}} */
		const describable = object.component(Describable)
		const metadata = describable.metadata

		RasPG.dev.validate.linguisticMetadata(metadata, this.metadataRequired, this.metadataOptional)

		const results = {}
		const fallbacks = {}

		for (const token of ['1SG', '2SG', '3SG', '1PL', '2PL', '3PL', 'COUNT', 'NOUN', 'ART', 'ADJ', 'VERB']) {
			const [part, glosses] = Object.entries(parts).find(e => e[0].match(new RegExp('^'+token)))
			switch (part) {
				case '1SG':
				case '2SG':
				case '3SG':
				case '1PL':
				case '2PL':
				case '3PL': {
					let gender = ['M', 'F', 'N', 'NH'].find(e => glosses.includes(e))
					if (!gender)
						glosses.push(gender = metadata.gender?? this.config.defaults.pronounGender)
					fallbacks.person = parseInt(part)
					fallbacks.gender = gender
					const override = this.findOverride(metadata, part, glosses)
					results.PRONOUN = override || resolvePronoun(part, glosses)
					break
				} case 'COUNT': {
					if (glosses.length === 0)
						glosses.push(this.config.defaults.countForm)
					results.COUNT = resolveCount(glosses[0], this.config.count)
					break
				} case 'NOUN': {
					const overrides = this.findOverride(metadata, 'NOUN', glosses)
					results.NOUN = resolveNoun(part, glosses, this.config.noun, overrides)
					break
				} case 'ART': {
					if (!glosses.includes('NDEF') && !glosses.includes('DEF'))
						glosses.push(this.config.defaults.articleForm)
					const override = this.findOverride(metadata, part, glosses)
					results.ART = override || resolveArticle(part, glosses)
					break
				} case 'ADJ': {
					results.ADJ = resolveAdjective(part, this.config.adjective)
					break
				}
			}
		}
		function resolvePronoun(part, glosses) {
			const map = [
				[
					[['I', 'my'], ['myself', 'my own']],
					[['you', 'your'], ['yourself', 'your own']],
					[['he', 'his'], ['himself', 'his own']],
					[['she', 'her'], ['herself', 'her own']],
					[['they', 'their'], ['themselves', 'their own']],
					[['it', 'its'], ['itself', 'its own']]
				],[
					[['we', 'our'], ['ourselves', 'our own']],
					[['you', 'your'], ['yourselves', 'your own']],
					[['they', 'their'], ['themselves', 'their own']],
				]
			]
			let base = map[part.endsWith('SG')? 0 : 1][
				(parseInt(part)-1)
				+ (glosses.includes('NH')? 3 : glosses.includes('N')? 2 : glosses.includes('M')? 0 : glosses.includes('F')? 1 : 3)
				* (part.endsWith('SG')? 1 : 0)
				* (parseInt(part) === 3? 1 : 0)
			][+glosses.includes('R')][+glosses.includes('POSS')]

			if (base !== 'he' && base !== 'they')
				return base

			if (glosses.includes('ACC') || glosses.includes('DAT') || ContextModule.get('patient')?.id === object.id || ContextModule.get('instrument')?.id === object.id)
				if (base === 'he')
					return 'him'
				else
					return 'them'
			else
				return base
		}
		function resolveCount(form, config, count=null) {
			count = count?? object?.component(Countable)?.count?? 1

			fallbacks.number = count === 1? 'SG' : 'PL'

			if (form === 'NMBR')
				return `${count}`

			if (config.toWordOverride)
				return config.toWordOverride(count)

			const units = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
			const teens = ['eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
			const tens = ['ten', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
			const cases = ['thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion', 'undecillion', 'duodecillion', 'tredecillion', 'quattuordecillion', 'quindecillion', 'sexdecillion', 'septendecillion', 'octodecillion', 'novemdecillion']
			if (typeof count === 'bigint') {
				let prefixes = ['', 'un', 'duo', 'tre', 'quattuor', 'quin', 'se', 'septen', 'octo', 'noven']
				let terms = ['vigint', 'trigint', 'quadragint', 'quinquagint', 'sexagint', 'septuagint', 'octogint', 'nonagint', 'cent', 'decicent', 'viginticent', 'trigintacent', 'quadragintacent', 'quinquagintacent', 'sexagintacent', 'septuagintacent', 'octogintacent', 'nonagintacent', 'ducent']
				cases.push(...terms.map(term => prefixes.map(prefix => {
					if (prefix === 'tre' || prefix === 'se')
						if (['vigint', 'trigint', 'quadragint', 'quinquagint'].includes(term))
							return prefix+'s'+term+'illion'
						else if (term === 'octogint')
							return prefix+'x'+term+'illion'
					if (prefix === 'septen' || prefix === 'noven')
						if (term === 'vigint' || term === 'octogint')
							return prefix.slice(0,-1)+'m'+term+'illion'
						else if (term === 'nonagint')
							return prefix.slice(0,-1)+term+'illion'
					return prefix+term+'illion'
				})).flat())
			}

			if (count < 10)
				if (count === 2 && config.twoWordToAPairOf)
					return 'a pair of'
				else
					return units[count] || config.zeroWord
			if (10 < count && count < 20)
				return teens[count-11]

			let skipTens = new Set()
			return `${count}`
				.match(/\d{0,3}(?=(?:\d{3})*$)/g)
				.slice(0, -1)
				.reverse()
				.map((t, ti) => {
					let result = t
						.padStart(3, '0')
						.split('')
						.reverse()
						.map((n, i, a) => {
							switch (i) {
								case 0:
									if (a.length > 1 && a[1] === '1' && n !== '0') {
										skipTens.add(ti)
										return teens[+n-1]
									} else return units[+n]
								case 1:
									return skipTens.has(ti)? '' : tens[+n-1]
								case 2:
									return units[+n] === ''? '' : units[+n] + ' hundred'
							}
						})
						.reverse()
					return [
						result[0],
						result
							.slice(1)
							.filter(e => typeof e === 'string' && e !== '')
							.join(config.hyphenateTensToUnits? '-' : ' ')
						]
							.filter(e => e !== '')
							.join(config.andBeforeTens? ' and ' : ' ')
				})
				.map((t, ti) => t.length === 0? t : (t + (ti > 0? ' '+cases.at(ti-1)?? `${ti}illion` : '')))
				.reverse()
				.filter(e => e !== '')
				.join(config.wordPartsJoiner)
		}
		function resolveNoun(part, glosses, config, overrides) {
			const options = overrides?? Array.from(object.component(Describable).nouns)
			const index = part.match(/\d+/)? +part.match(/\d+/)[0] : false
			let noun
			if (!glosses.includes('SG') && !glosses.includes('PL') && 'number' in fallbacks)
				glosses.push(fallbacks.number)

			if (config.prioritizeCanonical) {
				const canonical = object.component(Describable).canonicalName
				noun = options.find(e => canonical.match(e))?? options.at((index % options.length) + 1)
			}
			else
				noun = index? options.at((index % options.length) + 1) : options.find(e => canonical.match(e))
			if (!noun)
				if (config.pickRandomFallback)
					noun = options[Math.floor(Math.random() * options.length)]
				else
					noun = options[0]

			if (glosses.includes('PL') && !overrides)
				if (noun.endsWith('y') && !noun.match(/[aeiou]y$/i))
					noun = noun.slice(0, -1) + 'ies'
				else if (noun.endsWith('s') || noun.endsWith('x') || noun.endsWith('z') || noun.endsWith('ch') || noun.endsWith('sh'))
					noun = noun+'es'
				else if (noun.endsWith('f'))
					noun = noun.slice(0, -1)+'ves'
				else if (noun.endsWith('fe'))
					noun = noun.slice(0, -2)+'ves'
				else
					noun = noun+'s'

			if (glosses.includes('POSS') && !overrides)
				noun += noun.endsWith('s')? "'" : "'s"

			return noun
		}
		function resolveArticle(glosses) {
			if (glosses.includes('DEF'))
				if (
					('number' in fallbacks && fallbacks.number === 'PL')
					|| (metadata.type === 'person' || metadata.type.includes('person'))
					&& 'nameIsProper' in metadata
					&& metadata.nameIsProper === true
				)
					return '{EMPTY}'
				else
					return 'the'
			else if (results.NOUN)
				return 'aeiouAEIOU'.includes(results.NOUN[0])? 'an' : 'a'
			else return 'a'
		}
		function resolveAdjective(part, config) {
			const options = Array.from(object.component(Describable).adjectives)
			const index = part.match(/\d+/)? +part.match(/\d+/)[0] : false
			let adj

			if (config.prioritizeCanonical) {
				const canonical = object.component(Describable).canonicalName
				adj = options.find(e => canonical.match(e))?? options.at((index % options.length) + 1)
			}
			else
				adj = index? options.at((index % options.length) + 1) : options.find(e => canonical.match(e))
			if (!adj)
				if (config.pickRandomFallback)
					adj = options[Math.floor(Math.random() * options.length)]
				else
					adj = options[0]
			return adj
		}
	},
	config: {
		defaults: {
			pronounGender: 'NH',
			countForm: 'WORD',
			articleForm: 'DEF',
			verbTense: 'PRS',
			verbAspect: undefined,
		},
		count: {
			zeroWord: 'no',
			twoWordToAPairOf: true,
			hyphenateTensToUnits: true,
			wordPartsJoiner: ' ',
			andBeforeTens: true,
			toWordOverride: undefined,
		},
		noun: {
			pickCanonicalMatch: true,
			pickIndexed: true,
			prioritizeCanonical: true,
			pickRandomFallback: false,
		},
		adjective: {
			pickCanonicalMatch: true,
			pickIndexed: true,
			prioritizeCanonical: true,
			pickRandomFallback: false,
		},
		order: {
			object: [['ART', 'COUNT'], ['ADJ'], ['NOUN', '3SG', '3PL']]
		}
	},
	notes: `The first ever written LocalizationAdapter for the RasPG Framework, for the English language. Consult the tokens and accepted glosses for guidance, and look over the exposed configs for preferences.\n\nSome notes on usage:`
		+"\nRegarding NOUN and ADJ overrides:"
		+"\n\t- They are expected to be an array of strings. The index passed in the gloss is not taken into account."
		+"\n\t- They should ideally reflect the noun and adjective arrays in the object's Describable component."
		+"\n\t- NOUN overrides are expected to include their form variations as well (.PL, .POSS and .PL.POSS)."
		+"\nRegarding COUNT:"
		+"\n\t- In general, be mindful of numbers above Number.MAX_SAFE_INTEGER; use bigint if your program requires them."
		+"\n\t- .WORD supports numbers through to the novenducentillion (10e630) range."
		+"\n\t- If a wider range (Lord help you) or different formatting is required, `config.count.toWordOverride` may be set to a different function that takes the count and returns a string."
}))