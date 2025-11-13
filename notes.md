# Documentation
## Description patterns
- "if not found"
- "if <> isn't present"
- "if not present"
- "if <> is already present"
- "if already present"
- "if an error occurred"
- "Returns the component instance back for further operations."
- "Can be organized into domains (i.e. 'ex.ample')."
## Return patterns
- `true` means success
- `null` means (object/item) not found
- `false` means no-op or other error
## Convention patterns
- [no ]article, [singular|plural], all [lower|upper]case (unless proper name).
- full sentence(s), first letter uppercase, full stop at the end.


# Thoughts
- function registry for, i.e., dynamic strings? easier (de)serialization
- snippet pack for pseudo-language coding?
## Combat
- levels of aggressiveness towards different types of entities? (careful vs relentless)
- sensory perceptions tied to intent
## Modules
- Events: wildcard listeners (i.e. stats.*.changed)
## Components
- AI -> Willful? Volitional? Deliberate?

# Todo
## Urgent
- figure out string composition and error backpropagation
- turn resolution
## All
- find 'let's that should be 'constant's
- event emits consistency check
- implement Countable
- implement Combatant
- class prop types documentation
- figure out how to implement locale into development
- documentation sanity/consistency check (bracketed optionals(?), option parameters, wording)
- declarative mode for easier GameObject declarations?
- delta serialization on templated objects
- implement context object push/pop on relevant operations
- make output string composable and reorderable
## Core
- persistence/save module
### GameObject
- addComponent -> make?
- hasComponent -> is?
- structured objects as templates (use deserialize to create instances)
### Containing
- implement empty
- make `container.remove` default action account for allowSameBaseID
### Actionable, Agentive
- per-object act(ion) aliases (map name -> alias[])
### Actionable
- agents* -> actors*?
### Agentive
- intent, heuristic
### Stateful
- rename (not state-related)
### Context module
- allow getting global strings
### SubText module
- allow registering property getters for context objects in substitutions


## Stats & Combat
### Statful
- stat param: resolve StatType/Stat instance to name?

# Doing
- Morpher results into final clause
- Action class
- Region class
- Area class