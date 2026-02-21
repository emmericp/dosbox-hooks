import { Buffer } from 'buffer';
import { ElfFile, SymbolType } from './elf';
import { DOSBoxApi } from './api';
import { MemoryAllocations } from './main';



export async function load(api: DOSBoxApi, elf: ElfFile, mem: MemoryAllocations) {
	const dataStart = elf.getSection(".data").addr;
	const injStart = elf.getSection(".inject").addr;
	const symbolsToResolve = elf.getSymbolsInSection(".inject");
	
	// FIXME: do we really need the .inject section?
	// its main purpose is to make sure that all values in there are actually injected but, meh, seems a bit unnecessary
	const injectVars = {
		'low_mem_area': null,
		'xms_mem_area': null,
		'mailbox': null,
		'mailbox_size': null,
	};
	for (const sym of symbolsToResolve) {
		if (sym.type == SymbolType.OBJECT) {
			if (!(sym.nameStr in injectVars)) {
				throw Error(`Unknown symbol in .inject section: ${sym.nameStr}`);
			} else {
				injectVars[sym.nameStr] = sym.value - injStart;
			}
		} else if (sym.type != SymbolType.NOTYPE) {
			throw Error(`Unsupported symbol type in .inject section: ${sym.nameStr} ${sym.type}`);
		}
	}

	const codeAddr = mem.xmsCodeAddrPages * 4096;
	const dataAddr = mem.xmsDataAddrPages * 4096;
	const injAddr = mem.xmsDataAddrPages * 4096 + injStart - dataStart;
	const relocatedCode = elf.relocateSection(".text", ".text", codeAddr, ".data", dataAddr, ".inject", injAddr)
	const relocatedData = elf.relocateSection(".data", ".text", codeAddr, ".data", dataAddr, ".inject", injAddr)
	elf.codeRelocatedTo = codeAddr; // FIXME
	elf.dataRelocatedTo = dataAddr; // FIXME
	const injectData = elf.getSectionData(".inject");
	
	if (injectVars.xms_mem_area) {
		injectData.writeUInt32LE(mem.xmsScratchAddrPages * 4096, injectVars.xms_mem_area);
	}
	if (injectVars.low_mem_area) {
		injectData.writeUInt32LE(mem.lowMemScratchAddrBlocks * 16, injectVars.low_mem_area);
	}
	if (injectVars.mailbox) {
		injectData.writeUInt32LE(mem.xmsMailboxAddrPages * 4096, injectVars.mailbox);
	}
	if (injectVars.mailbox_size) {
		injectData.writeUInt32LE(mem.xmsMailboxSizePages * 4096, injectVars.mailbox_size);
	}
	await api.writeMem(codeAddr, relocatedCode);
	await api.writeMem(dataAddr, relocatedData);
	await api.writeMem(injAddr, injectData);
}
