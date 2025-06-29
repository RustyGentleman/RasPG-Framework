# Extension-level requirements
- All Components must be registered
- All classes that might have to be resolved by name must be registered to the framework, and the registry used for resolution to avoid using eval()

# Component-level requirements
- All Components that must reference GameObjects must do so by ID internally and resolve it before every use
- All Components that contain reference(s) that form exclusive relationship(s) between GameObjects must be mindful of templating.

# Context object label assignments
- At all times, the following labels must correspond to:
	- 'agent': The GameObject actively performing the action.
	- 'patient': The GameObject being targeted by the action.
	- 'instrument': The GameObject being used in the action.

# General requirements
- Must follow the same directives and conventions as the framework core, especially concerning config adherence and use of core modules.