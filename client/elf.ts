import { Buffer } from 'buffer';

// FIXME: migrate to @pretendonetwork/binary-parser
import { Parser } from 'binary-parser';

// These types and enums are all 100% AI generated with no spec or
// anything in the context, they could be wrong.
interface ElfHeader {
	ident: number[];      // 16 bytes of identification info
	type: number;       // Object file type
	machine: number;    // Architecture
	version: number;    // Object file version
	entry: number;      // Entry point virtual address
	phoff: number;      // Program header table file offset
	shoff: number;      // Section header table file offset
	flags: number;      // Processor-specific flags
	ehsize: number;     // ELF header size in bytes
	phentsize: number;  // Program header table entry size
	phnum: number;      // Program header table entry count
	shentsize: number;  // Section header table entry size
	shnum: number;      // Section header table entry count
	shstrndx: number;   // Section header string table index
}

interface SectionHeader {
	name: number;       // Section name (index into string table)
	type: number;       // Section type
	flags: number;      // Section flags
	addr: number;       // Section virtual addr at execution
	offset: number;     // Section file offset
	size: number;       // Section size in bytes
	link: number;       // Link to another section
	info: number;       // Additional section information
	addralign: number;  // Section alignment
	entsize: number;    // Entry size if section holds table
}

interface SymbolEntry {
	name: number;           // Symbol name (index into string table)
	value: number;          // Symbol value
	size: number;           // Symbol size
	type: SymbolType;       // Symbol type
	binding: SymbolBinding; // Symbol binding attributes
	other: number;          // Symbol visibility
	shndx: number;          // Section index
	nameStr?: string;	    // Decoded name
}

const elfHeader = new Parser()
	.endianess('little')
	.array('ident', { type: 'uint8', length: 16 })
	.uint16('type')
	.uint16('machine')
	.uint32('version')
	.uint32('entry')
	.uint32('phoff')
	.uint32('shoff')
	.uint32('flags')
	.uint16('ehsize')
	.uint16('phentsize')
	.uint16('phnum')
	.uint16('shentsize')
	.uint16('shnum')
	.uint16('shstrndx');

const sectionHeader = new Parser()
	.endianess('little')
	.uint32('name')
	.uint32('type')
	.uint32('flags')
	.uint32('addr')
	.uint32('offset')
	.uint32('size')
	.uint32('link')
	.uint32('info')
	.uint32('addralign')
	.uint32('entsize');

const symbolEntry = new Parser()
	.endianess('little')
	.uint32('name')
	.uint32('value')
	.uint32('size')
	.bit4('binding')
	.bit4('type')
	.uint8('other')
	.uint16('shndx');

const relEntry = new Parser()
	.endianess('little')
	.uint32('offset')
	.uint32('info');

const relaEntry = new Parser()
	.endianess('little')
	.uint32('offset')
	.uint32('info')
	.int32('addend');

interface Relocation {
	offset: number;
	symbolIndex: number;
	type: number;
	addend?: number;
}

export enum RelocI386 {
	NONE = 0,         // No relocation
	ADDR32 = 1,       // Direct 32 bit (S + A)
	PC32 = 2,         // PC relative 32 bit (S + A - P)
	GOT32 = 3,        // GOT entry (G + A)
	PLT32 = 4,        // PLT entry (L + A - P)
	COPY = 5,         // Copy symbol at runtime
	GLOB_DAT = 6,     // Create GOT entry
	JMP_SLOT = 7,     // Create PLT entry
	RELATIVE = 8,     // Adjust by program base
	GOTOFF = 9,       // 32 bit offset to GOT
	GOTPC = 10,       // 32 bit PC relative offset to GOT
	IRELATIVE = 42    // Indirect relocation
}

export enum SymbolBinding {
	LOCAL = 0,   // Local symbol (not visible outside the object file)
	GLOBAL = 1,  // Global symbol (visible to all object files)
	WEAK = 2,    // Weak symbol (like global, but lower priority)
	UNIQUE = 10, // GNU extension: Unique symbol
}

export enum SymbolType {
	NOTYPE = 0,  // Symbol type is unspecified
	OBJECT = 1,  // Symbol is a data object (variable, array, etc.)
	FUNC = 2,    // Symbol is a function or executable code
	SECTION = 3, // Symbol is associated with a section
	FILE = 4,    // Symbol gives the name of the source file
	COMMON = 5,  // Symbol labels an uninitialized common block
	TLS = 6,     // Symbol specifies a Thread-Local Storage entity
}

// FIXME: this re-parses symbols too often, it should just parse everything on load once because the files are small anyways
export class ElfFile {
	private header: ElfHeader;
	private sections: (SectionHeader & { nameStr: string })[] = [];
	public codeRelocatedTo: number; // FIXME, loaded/relocated files should probably just go to a different class?
	public dataRelocatedTo: number;

	constructor(private buffer: Buffer) {
		this.header = elfHeader.parse(buffer) as ElfHeader;
		const sectionHeaders: SectionHeader[] = [];
		for (let i = 0; i < this.header.shnum; i++) {
			const offset = this.header.shoff + (i * this.header.shentsize);
			sectionHeaders.push(sectionHeader.parse(buffer.slice(offset)) as SectionHeader);
		}
		const shstrtab = sectionHeaders[this.header.shstrndx];
		const shstrtabBuf = buffer.slice(shstrtab.offset, shstrtab.offset + shstrtab.size);

		this.sections = sectionHeaders.map(sh => ({
			...sh,
			nameStr: this.readString(shstrtabBuf, sh.name)
		}));
	}

	// Returns a simple array of all section names found in the ELF file
	getAllSectionNames(): string[] {
		return this.sections.map(s => s.nameStr);
	}

	getAllSymbols(): SymbolEntry[] {
		const symtabSec = this.sections.find(s => s.type === 2 || s.nameStr === '.symtab');
		if (!symtabSec) return [];
		const strtabSec = this.sections[symtabSec.link];
		if (!strtabSec) return [];

		const strtabBuf = this.buffer.slice(strtabSec.offset, strtabSec.offset + strtabSec.size);

		const numSymbols = symtabSec.size / symtabSec.entsize;
		const symbols = [];

		for (let i = 0; i < numSymbols; i++) {
			const offset = symtabSec.offset + (i * symtabSec.entsize);
			const symBuf = this.buffer.slice(offset, offset + symtabSec.entsize);
			const sym = symbolEntry.parse(symBuf) as SymbolEntry;
			symbols.push({
				...sym,
				nameStr: this.readString(strtabBuf, sym.name)
			});
		}

		return symbols;
	}

	//Returns all symbols that belong to a specific section.
	getSymbolsInSection(sectionName: string): SymbolEntry[] {
		const sectionIndex = this.sections.findIndex(s => s.nameStr === sectionName);
		if (sectionIndex === -1) return [];
		return this.getAllSymbols().filter(sym => sym.shndx === sectionIndex);
	}

	getRelocationsForSection(sectionName: string): Relocation[] {
		const targetSectionIndex = this.sections.findIndex(s => s.nameStr === sectionName);
		if (targetSectionIndex === -1) return [];

		const relSec = this.sections.find(s =>
			(s.type === 9 || s.type === 4) && s.info === targetSectionIndex
		);

		if (!relSec) return [];

		const relocations: Relocation[] = [];
		const isRela = relSec.type === 4;
		const entsize = relSec.entsize || (isRela ? 12 : 8);
		const numRelocs = relSec.size / entsize;
		const parser = isRela ? relaEntry : relEntry;

		for (let i = 0; i < numRelocs; i++) {
			const offset = relSec.offset + (i * entsize);
			const raw = parser.parse(this.buffer.slice(offset, offset + entsize)) as any;

			relocations.push({
				offset: raw.offset,
				// ELF32_R_SYM: top 24 bits
				symbolIndex: raw.info >>> 8,
				// ELF32_R_TYPE: bottom 8 bits
				type: raw.info & 0xFF,
				...(isRela && { addend: raw.addend })
			});
		}

		return relocations;
	}

	// Returns the raw Buffer for a section by its name
	getSectionData(name: string): Buffer | null {
		const section = this.sections.find(s => s.nameStr === name);
		if (!section) return null;
		return this.buffer.slice(section.offset, section.offset + section.size);
	}

	getSection(name: string): SectionHeader {
		return this.sections.find(s => s.nameStr === name);
	}


	private getSymbol(symbolName: string): SymbolEntry | null {
		const symtabSec = this.sections.find(s => s.nameStr === '.symtab');
		const strtabSec = this.sections.find(s => s.nameStr === '.strtab');

		if (!symtabSec || !strtabSec) return null;

		const strtabBuf = this.buffer.slice(strtabSec.offset, strtabSec.offset + strtabSec.size);
		const numSymbols = symtabSec.size / symtabSec.entsize;

		for (let i = 0; i < numSymbols; i++) {
			const offset = symtabSec.offset + (i * symtabSec.entsize);
			const sym = symbolEntry.parse(this.buffer.slice(offset)) as SymbolEntry;

			if (this.readString(strtabBuf, sym.name) === symbolName) {
				return sym;
			}
		}

		return null;
	}

	getFinalSymbolLocation(name: string): number {
		const sym = this.getSymbol(name);
		const section = this.sections[sym.shndx];
		if (!sym || !section) {
			throw Error(`Unknown symbol: ${name}`)
		}
		// FIXME: another thing that distinguishing loaded elfs from unprocessed elfs would fix
		if (!this.codeRelocatedTo) {
			throw Error("Elf file has not yet been relocated")
		}
		if (section.nameStr == ".text") {
			return sym.value - section.addr + this.codeRelocatedTo;
		} else if (section.nameStr == ".data") {
			return sym.value - section.addr + this.dataRelocatedTo;
		} // FIXME: i guess .inject should be handled, too
		throw Error(`symbol ${name} is in unsupported section ${section.nameStr}`)
	}

	// Relocates a section and returns the patched buffer.
	relocateSection(sectionName: string, codeSectionName: string, codeAddr: number, dataSectionName1: string, dataAddr1: number, dataSectionName2: string, dataAddr2: number): Buffer {
		// FIXME: what a mess. it should just take a map of sections that are loaded to their address and just relocate all sections
		const section = this.sections.find(s => s.nameStr === sectionName);
		const codeSection = this.sections.find(s => s.nameStr === codeSectionName);
		const dataSection1 = this.sections.find(s => s.nameStr === dataSectionName1);
		const dataSection2 = this.sections.find(s => s.nameStr === dataSectionName2);
		if (!section || !codeSection || !dataSection1 || !dataSection2) throw new Error("Required sections not found");

		const sectionBuffer = Buffer.from(this.getSectionData(sectionName)!);
		const textDelta = codeAddr - codeSection.addr;
		const dataDelta1 = dataAddr1 - dataSection1.addr;
		const dataDelta2 = dataAddr2 - dataSection2.addr;

		const relocs = this.getRelocationsForSection(sectionName);
		const allSymbols = this.getAllSymbols();

		for (const rel of relocs) {
			const sym = allSymbols[rel.symbolIndex];
			if (!sym) {
				throw Error(`Warning: Relocation points to unknown symbol: ${rel.symbolIndex}`)
			}
			const symSection = this.sections[sym.shndx];
			var activeDelta = 0;
			switch (symSection.nameStr) {
				case dataSectionName1:
					activeDelta = dataDelta1;
					break;
				case dataSectionName2:
					activeDelta = dataDelta2;
					break;
				case codeSectionName:
					activeDelta = textDelta;
					break;
				default:
					if (rel.type != RelocI386.NONE) {
						throw Error(`Relocation references unsupported section: ${symSection.nameStr}`)
					}
			}
			const offset = rel.offset - section.addr;
			const originalVal = sectionBuffer.readInt32LE(offset);
			switch (rel.type) {
				case RelocI386.NONE:
					break;
				case RelocI386.ADDR32: // R_386_32 (Absolute Address)
					sectionBuffer.writeInt32LE(originalVal + activeDelta, offset);
					break;

				case RelocI386.PC32:  // R_386_PC32
				case RelocI386.PLT32: // R_386_PLT32 (Treated as PC-relative in static PIE)
					const pc32Adjustment = activeDelta - textDelta;
					sectionBuffer.writeInt32LE(originalVal + pc32Adjustment, offset);
					break;

				case RelocI386.GOTOFF: // R_386_GOTOFF
					const gotoffAdjustment = activeDelta - dataDelta1;
					sectionBuffer.writeInt32LE(originalVal + gotoffAdjustment, offset);
					break;

				case RelocI386.GOTPC: // R_386_GOTPC
					const gotpcAdjustment = dataDelta1 - textDelta;
					sectionBuffer.writeInt32LE(originalVal + gotpcAdjustment, offset);
					break;

				default:
					console.log("Warning: Unsupported relocation type", rel);
					break;
			}
		}
		return sectionBuffer;
	}

	private readString(buffer: Buffer, offset: number): string {
		let end = offset;
		while (end < buffer.length && buffer[end] !== 0) {
			end++;
		}
		return buffer.toString('utf8', offset, end);
	}
}
