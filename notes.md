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
## Combat
- levels of aggressiveness towards different types of entities? (careful vs relentless)
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
- refactor typechecks into using the validation functions
- find 'let's that should be 'constant's
## Core
### GameObject
- addComponent -> make?
- hasComponent -> is?
### Actionable
- agents* -> actors*?

## Stats & Combat
### Statful
- stat param: resolve StatType/Stat instance to name?

# Doing
- adding bulk op methods
- adding serialization to components
- making the serializer and deserializer functions for GameObjects