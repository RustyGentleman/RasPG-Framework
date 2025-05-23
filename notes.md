# Documentation
## Description patterns
- "if not found"
- "if <> isn't present"
- "if not present"
- "if <> is already present"
- "if already present"
- "if an error occurred"
- "Returns the component instance back for further operations."
## Return patterns
- `true` means success
- `null` means (object/item) not found
- `false` means no-op or other error
## Convention patterns
- [no ]article, [singular|plural], all [lower|upper]case (unless proper name).
- full sentence(s), first letter uppercase, full stop at the end.


# Thoughts
- function registry for, i.e., dynamic strings? easier (de)serialization
## Combat
- levels of aggressiveness towards different types of entities? (careful vs relentless)
- sensory perceptions tied to intent
## Modules
- Events: wildcard listeners (i.e. stats.*.changed)
## Components
- AI -> Willful? Volitional? Deliberate?
## Misc
- Simulate learning with tags, actions and a Knowing module?
	- Environment with objects containing facts
		- i.e. is hot, is cold, is food, touch hurt
	- Entity has actions
		- i.e. touch, eat, smell, use
	- Entity learns facts through actions
		- i.e. water is hot, touch hot hurt, eat food good
	- Entity chooses actions every turn based on what's available and what they know

# Todo
## All
- find 'let's that should be 'constant's
- event emits consistency check
- implement Countable
- implement Combatant
- class prop types documentation
## Core
- turn counter and queued events
	- turns, tick down to 0
	- callbacks on tick, on zero
	- repeat boolean or counter
	- phase (before or after turn resolution)
- text template system
	- separate module
	- accrues context (room, items present, actors, targets)
- persistence/save module
### GameObject
- addComponent -> make?
- hasComponent -> is?
- structured objects as templates (use deserialize to create instances)
### Actionable
- agents* -> actors*?
### Containing
- implement empty and emptyInto
- filter, weight/count capacity


## Stats & Combat
### Statful
- stat param: resolve StatType/Stat instance to name?

# Doing
- adding bulk op methods