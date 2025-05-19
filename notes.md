# Documentation
## Description patterns
- "if not found"
- "if <> isn't present"
- "if not present"
- "if <> is already present"
- "if already present"
- "if an error occurred"
## Return patterns
- `true` means success
- `null` means (object/item) not found
- `false` means no-op or other error


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
## Core
### GameObject
- addComponent -> make?
- hasComponent -> is?
### Actionable
- agents* -> actors*?

## Stats & Combat
### Statful
- stat param: resolve StatType/Stat instance to name?