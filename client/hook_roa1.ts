import { Hook, MetaAddr, Status, api, elf, memoryAllocations } from "./main";
import { CDecl16 } from "./callingconvention";
import { Buffer } from "buffer";
import * as b from '@pretendonetwork/binary-parser';


// Versions from GOG
const offsetsDE = {
	"schick_random": [0xef8, 0x2b],
}

const offsetsEN = {
	"schick_random": [0xe45, 0x2f],
}

const dataOffsetsDE = {
	"ds": 0x14fc,
	"g_heroes": 0xbd34
}

const dataOffsetsEN = {
	"ds": 0x146b,
	"g_heroes": 0xbc28
}

// FIXME: add some reasonably nice wrapper around hooking and loaded binaries
export async function HookRoA1(baseSegment: number, version: string) {
	const offsets = version == "SCHICKM.EXE" ? offsetsDE : offsetsEN;
	await Hook("558bec8b4e06", baseSegment + offsets.schick_random[0], offsets.schick_random[1], elf.getFinalSymbolLocation("hook_random_pre"), elf.getFinalSymbolLocation("hook_random_post"), new CDecl16(2), MetaAddr, 0x40, memoryAllocations);
}

const Attribute = new b.Parser()
	.endianness("little")
	.int8("base")
	.int8("current")
	.int8("unused");
	
const Hero = new b.Parser()
	.endianness("little")
	.string("name_unused", { length: 16 })
	.string("name", { length: 16 })
	// fixme: can't use skip() because we just write back the whole thing
	.array("ignored2", {type: 'uint8', length: 7})
	.uint8("level")
	.int32("exp")
	.int32("money")
	.int8("armor")
	.array("ignored3", {type: 'uint8', length: 3})
	.array("good_attribs", { type: Attribute, length: 7 })
	.array("bad_attribs", { type: Attribute, length: 7 })
	.uint16("hp_max")
	.uint16("hp")
	.uint16("mana_max")
	.uint16("mana")
	.uint8("mr");

export type HeroAttribute = b.infer<typeof Attribute>;
export type Hero = b.infer<typeof Hero>;

const HERO_SIZE = 1754;

async function heroPtr() {
	const status = await Status();
	const offsets = status.process == "SCHICKM.EXE" ? dataOffsetsDE : dataOffsetsEN;
	const heroesPtr = Buffer.from(await api.readMem(status.baseSegment + offsets.ds, offsets.g_heroes, 4));
	const offset = heroesPtr.readUInt16LE(0);
	const segment = heroesPtr.readUInt16LE(2);
	return segment * 16 + offset;
}

export async function GetHeroes() {
	const addr = await heroPtr();
	const heroes = Buffer.from(await api.readMem(addr, HERO_SIZE * 6));
	const parsedHeroes = [];
	for (let i = 0; i < 6; ++i) {
		const parsed = Hero.parse(heroes.slice(HERO_SIZE * i));
		parsed.name = parsed.name.split('\0')[0];
		parsedHeroes.push(parsed);
	}
	return parsedHeroes;
}

export async function WriteHero(heroId: number, hero: Hero) {
	const addr = await heroPtr();
	console.log(`Updating hero ${heroId}, new value:`, hero);
	const buf = Hero.encode(hero);
	await api.writeMem(addr + heroId * HERO_SIZE, buf);
}
