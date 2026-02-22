# DOSBox Hooks

A toolkit for hooking and modding old games running in DOSBox with an unholy mix of modern TypeScript, modern C, and 16-bit x86 assembly.

Currently requires a pre-release version of [DOSBox staging](https://www.dosbox-staging.org/releases/development-builds/).
If you are reading this after a 2026 release of DOSBox staging then the normal release version of it should just work!

**Caution:** This is a very hacky proof of concept.
Some parts of the code, especially on the Javascript side of things, are not cleaned up at all and are full of TODOs and FIXMEs.


## Usage example

An example for hooking the game Realms of Arkania: Blade of Destiny.

You probably want to read [the README on the main branch](https://github.com/emmericp/dosbox-hooks/blob/main/README.md) first.

[hooks.html](./client/hooks.html) is an example that hooks into the random number generator in RoA, it shows you the hidden rolls the game does and allows you to override the RNG values.
The hook itself is implemented in [roa_hooks.c](./server/src/roa1_hooks.c), it hooks into the main RNG function that takes a maximum as parameter and returns a random number in the range between 1 and max (inclusive).

Install it as described in the main readme and then open http://localhost:8080/hooks.html.
Note that you have to open this before starting the game.

The config values (if set to non-zero) override the return value if the RNG is called with a specific maximum.
As a simple demo set the return value of rand(100) to 1 and try walking through a town during the day.
You will trigger a usually rare random event on every move (and actually blocks movement).

**This is just a demo**, it's not meant to be useful (yet).
The idea would be to hook into more complex functions on top of the RNG, e.g., to do thing such as make your or your enemies rolls harder/easier.

## Bonus: hero editor

Open http://localhost:8080/editor.html while the game is running.
It will find your characters in memory and all of the fields are editable.
This might actually be useful, but it has nothing to do with hooks, it's just an example of the DOSBox API in general.
